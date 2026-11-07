class FogRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      // Transparent, not opaque: a frame the compositor drops (the Android emulator, say)
      // then shows the sky colour behind the canvas rather than solid black
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'  // Prefer integrated GPU for lower power
    });

    if (!this.gl) throw new Error('WebGL not supported');

    // Default parameters with performance in mind
    this.params = {
      density: 0.6,
      scale: 1.3,
      speed: 0.02,
      brownianScale: 2.0,
      tintHex: '#A8C6FE',  // shadow side of the cloud
      contrast: 1.0,
      paused: false,
      quality: 1.0,  // Quality multiplier for adaptive performance
      targetFPS: 30,  // Target frame rate for adaptive quality
      ...options
    };

    this.dpr = 1;
    this.baseTime = performance.now();
    this.elapsed = 0;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    this.lastDrawTime = 0;
    this.fps = 60;
    this.isVisible = true;
    this.rafId = null;
    this.slowSeconds = 0;
    this.tooSlow = false;

    // Pre-calculate values that don't change often
    this.tintRgb = this.hexToRgb(this.params.tintHex);

    this.init();
    this.setupVisibilityHandling();
  }

  init() {
    this.setupGL();

    // Debounced resize handler
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this.resize(), 150);
    }, { passive: true });

    // Honour prefers-reduced-motion: draw one static frame instead of animating
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion.addEventListener('change', () => this.restart());

    // Software-rendered WebGL (no GPU) would burn the CPU on every frame: stay still instead.
    // The Android emulator's GL translator never shows an animating canvas at all, so it
    // gets the same one still frame.
    const gl = this.gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.softwareGL = /swiftshader|llvmpipe|software|android emulator/i.test(renderer);

    // Mobile browsers drop the WebGL context when another app (Mail, say) takes the
    // foreground; rebuild it and carry on rather than freezing on the last frame
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stopRenderLoop();
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.setupGL();
      this.restart();
    });

    // Start render loop
    this.startRenderLoop();
  }

  setupGL() {
    const gl = this.gl;

    // Vertex shader
    const VS = `
      attribute vec2 a;
      void main(){gl_Position=vec4(a,0.,1.);}
    `;

    // Fragment shader
    const FS = `
      precision mediump float;
      uniform vec2 r;
      uniform float t,sc,sp,d,c,b;
      uniform vec3 ti;
      
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
      
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
                   mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      
      float fbm(vec2 p){
        float v=0.,a=.5;
        for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.+vec2(7.1,3.3);a*=.5;}
        return v;
      }
      
      float fogField(vec2 p,vec2 drift,float sc){
        float base=fbm(p*sc+drift);
        float det=fbm((p*(sc*1.9)-drift*.35)+vec2(11.2,-4.7));
        float n=mix(base,det,.5);
        return smoothstep(.25,.85,n);
      }
      
      void main(){
        vec2 uv=gl_FragCoord.xy/r;
        vec2 p=(uv-.5)*vec2(r.x/r.y,1.);

        // Slow drift to the right with a little wander, rather than curling in place
        float tm=t*sp;
        vec2 wander=vec2(sin(tm*1.3)+sin(tm*2.1)*.5,cos(tm*1.1)+cos(tm*1.9)*.5);
        vec2 drift=(vec2(tm*.8,tm*.12)+wander*.3)*b;

        float n=fogField(p,drift,sc);
        float cover=clamp(n*(.35+.9*d),0.,1.);

        // Light from the top-left: compare density with a sample toward the light
        float nl=fogField(p+vec2(-.05,.05),drift,sc);
        float lit=clamp((n-nl)*5.,-1.,1.);

        // Sky behind the cloud: deeper blue at the top, paler toward the horizon
        vec3 sky=mix(vec3(.58,.68,.84),vec3(.30,.43,.68),uv.y);

        // Cloud: white on the lit side, tinted blue-grey in shadow
        vec3 cloud=vec3(.78+.22*n);
        cloud*=1.+lit*.35;
        cloud=mix(cloud,cloud*ti,clamp(-lit,0.,1.));

        vec3 col=mix(sky,cloud,cover);
        col=mix(vec3(.5),col,c);
        gl_FragColor=vec4(col,1.);
      }
    `;

    // Compile shaders with error checking
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh));
      }
      return sh;
    };

    // Create and link program
    this.program = gl.createProgram();
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program));
    }
    gl.useProgram(this.program);

    // Simplified geometry
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'a');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    this.u = {
      r: gl.getUniformLocation(this.program, 'r'),
      t: gl.getUniformLocation(this.program, 't'),
      sc: gl.getUniformLocation(this.program, 'sc'),
      sp: gl.getUniformLocation(this.program, 'sp'),
      d: gl.getUniformLocation(this.program, 'd'),
      c: gl.getUniformLocation(this.program, 'c'),
      b: gl.getUniformLocation(this.program, 'b'),
      ti: gl.getUniformLocation(this.program, 'ti'),
    };

    // Set initial size
    this.resize();
  }

  setupVisibilityHandling() {
    // Pause when the page is hidden, restart when it is shown again
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible) this.restart(); else this.stopRenderLoop();
    });
    // Coming back from a mailto: or the back button can restore the page without a
    // visibility change; treat it the same way
    window.addEventListener('pageshow', () => {
      this.isVisible = !document.hidden;
      this.restart();
    });
    // Window managers can hide and reshow the window without a clean visibility change;
    // a focus is one more chance to make sure the loop is running
    window.addEventListener('focus', () => {
      this.isVisible = !document.hidden;
      this.restart();
    });
  }

  // Stop whatever loop is running and start again from the current elapsed time
  restart() {
    this.stopRenderLoop();
    if (this.params.paused) return;
    // Give a slow renderer another chance whenever the page comes back
    this.tooSlow = false;
    this.slowSeconds = 0;
    this.baseTime = performance.now() - this.elapsed * 1000;
    this.startRenderLoop();
  }

  resize() {
    // Use lower resolution for better performance
    const quality = this.params.quality || 1.0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    // Publish the real screen height for the stylesheet (see #fog on phones)
    document.documentElement.style.setProperty('--screen-height', screen.height + 'px');
    // Size the buffer from the canvas's own box, which may be taller than the window
    const hidden = this.canvas.hidden;
    if (hidden) this.canvas.hidden = false;
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    if (hidden) this.canvas.hidden = true;
    const w = Math.max(1, Math.floor(cw * this.dpr));
    const h = Math.max(1, Math.floor(ch * this.dpr));

    // Only resize if dimensions actually changed
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
      this.gl.uniform2f(this.u.r, w, h);
      if (this.isStill()) this.renderStill();
    }
  }

  renderStill() {
    this.updateUniforms();
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    this.presentStill();
  }

  // Show the one still frame as a page background rather than leaving it on the canvas.
  // Reading the pixels back works wherever WebGL draws at all, while a canvas that is
  // never animated can stay black on GPUs that fail to hand its texture to the compositor.
  // If even the read-back fails, hide the canvas and let the sky colour show.
  presentStill() {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const body = document.body.style;
    try {
      const px = new Uint8ClampedArray(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // GL rows run bottom-up; flip into image order
      const row = w * 4;
      const flipped = new Uint8ClampedArray(px.length);
      for (let y = 0; y < h; y++) flipped.set(px.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
      // A frame with no colour in it is a failed draw
      let lit = 0;
      for (let i = 0; i < flipped.length; i += 4 * 97) lit |= flipped[i] | flipped[i + 1] | flipped[i + 2];
      if (!lit) throw new Error('blank frame');
      const c2 = this.still2d || (this.still2d = document.createElement('canvas'));
      c2.width = w; c2.height = h;
      c2.getContext('2d').putImageData(new ImageData(flipped, w, h), 0, 0);
      body.backgroundImage = 'url(' + c2.toDataURL('image/jpeg', 0.85) + ')';
      body.backgroundSize = '100% ' + (h / this.dpr) + 'px';  // the canvas's CSS height, even while hidden
      body.backgroundRepeat = 'no-repeat';
    } catch (e) {
      body.backgroundImage = '';
    }
    this.canvas.hidden = true;
  }

  // Back to drawing on the canvas itself
  showCanvas() {
    this.canvas.hidden = false;
    document.body.style.backgroundImage = '';
  }

  isStill() {
    return this.softwareGL || this.tooSlow || (this.reduceMotion && this.reduceMotion.matches);
  }

  hexToRgb(hex) {
    // Cache the result
    if (this.lastHex === hex && this.lastRgb) return this.lastRgb;
    this.lastHex = hex;

    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    this.lastRgb = m ? [
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255
    ] : [0.86, 0.91, 1.0];
    return this.lastRgb;
  }

  updateUniforms() {
    const gl = this.gl;
    const u = this.u;
    const p = this.params;

    // Only update tint if it changed
    if (p.tintHex !== this.lastTintHex) {
      this.tintRgb = this.hexToRgb(p.tintHex);
      this.lastTintHex = p.tintHex;
    }

    gl.uniform1f(u.t, this.elapsed);
    gl.uniform1f(u.sc, p.scale);
    gl.uniform1f(u.sp, p.speed);
    gl.uniform1f(u.d, p.density);
    gl.uniform1f(u.c, p.contrast);
    gl.uniform1f(u.b, p.brownianScale);
    gl.uniform3f(u.ti, this.tintRgb[0], this.tintRgb[1], this.tintRgb[2]);
  }

  render(now) {
    if (this.params.paused || !this.isVisible) { this.rafId = null; return; }

    // Skip frames beyond targetFPS (saves GPU time and battery on high-refresh screens)
    if (now - this.lastDrawTime < 1000 / this.params.targetFPS - 4) {
      this.rafId = requestAnimationFrame((t) => this.render(t));
      return;
    }
    this.lastDrawTime = now;

    // Calculate FPS
    this.frameCount++;
    const deltaTime = now - this.lastFrameTime;
    if (deltaTime > 1000) {
      this.fps = (this.frameCount * 1000) / deltaTime;
      this.frameCount = 0;
      this.lastFrameTime = now;

      // A renderer that cannot manage even a slow animation (the Android emulator, say)
      // gets one still frame instead of a stutter and a hot CPU
      if (this.fps < this.params.targetFPS * 0.4) {
        if (++this.slowSeconds >= 2) {
          this.tooSlow = true;
          this.rafId = null;
          this.renderStill();
          return;
        }
      } else {
        this.slowSeconds = 0;
      }

      // Adaptive quality based on FPS
      if (this.params.targetFPS && this.fps < this.params.targetFPS * 0.9) {
        this.params.quality = Math.max(0.5, this.params.quality - 0.1);
        this.resize();
      } else if (this.fps > this.params.targetFPS * 1.1) {
        this.params.quality = Math.min(1.0, this.params.quality + 0.05);
        this.resize();
      }
    }

    this.elapsed = (now - this.baseTime) / 1000;
    this.updateUniforms();
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

    this.rafId = requestAnimationFrame((t) => this.render(t));
  }

  startRenderLoop() {
    if (this.isStill()) {
      this.renderStill();
      return;
    }
    if (this.canvas.hidden) this.showCanvas();
    if (!this.rafId) {
      this.rafId = requestAnimationFrame((t) => this.render(t));
    }
  }

  stopRenderLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  // Public methods
  setParam(key, value) {
    this.params[key] = value;
  }

  setParams(params) {
    Object.assign(this.params, params);
  }

  pause() {
    this.params.paused = true;
    this.stopRenderLoop();
  }

  resume() {
    this.params.paused = false;
    this.restart();
  }

  reset() {
    this.baseTime = performance.now();
    this.elapsed = 0;
  }

  destroy() {
    this.stopRenderLoop();
    const gl = this.gl;
    if (this.program) gl.deleteProgram(this.program);
    // Remove event listeners
    document.removeEventListener('visibilitychange', this.setupVisibilityHandling);
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FogRenderer;
}
// Also expose as global for browser use
if (typeof window !== 'undefined') {
  window.FogRenderer = FogRenderer;
}
