class FogRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: false,
      premultipliedAlpha: false,
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

    // Pre-calculate values that don't change often
    this.tintRgb = this.hexToRgb(this.params.tintHex);

    this.init();
    this.setupVisibilityHandling();
  }

  init() {
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

    // Debounced resize handler
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this.resize(), 150);
    }, { passive: true });

    // Honour prefers-reduced-motion: draw one static frame instead of animating
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduceMotion.addEventListener('change', () => {
      this.stopRenderLoop();
      this.startRenderLoop();
    });

    // Software-rendered WebGL (no GPU) would burn the CPU on every frame: stay still instead
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.softwareGL = /swiftshader|llvmpipe|software/i.test(renderer);

    // Start render loop
    this.startRenderLoop();
  }

  setupVisibilityHandling() {
    // Pause when tab is not visible
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (this.isVisible && !this.params.paused) {
        this.baseTime = performance.now() - this.elapsed * 1000;
        this.startRenderLoop();
      } else {
        this.stopRenderLoop();
      }
    });
  }

  resize() {
    // Use lower resolution for better performance
    const quality = this.params.quality || 1.0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5) * quality;
    const w = Math.max(1, Math.floor(window.innerWidth * this.dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * this.dpr));

    // Only resize if dimensions actually changed
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = '100vw';
      this.canvas.style.height = '100vh';
      this.gl.viewport(0, 0, w, h);
      this.gl.uniform2f(this.u.r, w, h);
      if (this.isStill()) this.renderStill();
    }
  }

  renderStill() {
    this.updateUniforms();
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  isStill() {
    return this.softwareGL || (this.reduceMotion && this.reduceMotion.matches);
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
    if (this.params.paused || !this.isVisible) return;

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
    this.baseTime = performance.now() - this.elapsed * 1000;
    this.startRenderLoop();
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
