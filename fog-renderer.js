class FogRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });

    if (!this.gl) {
      throw new Error('WebGL not supported');
    }

    // Default parameters
    this.params = {
      density: 0.75,
      scale: 1.55,
      speed: 0.01,
      brownianScale: 2.0,
      tintHex: '#A8C6FE',
      hueDeg: 0,
      saturation: 2.0,
      minBrightness: 0.11,
      maxBrightness: 1.34,
      contrast: 0.9,
      scope: 0,
      paused: false,
      ...options
    };

    this.dpr = 1;
    this.baseTime = performance.now();
    this.elapsed = 0;

    this.init();
  }

  init() {
    const gl = this.gl;

    // Vertex shader
    const VS = `
      attribute vec2 a_position;
      void main(){ gl_Position = vec4(a_position, 0.0, 1.0); }
    `;

    // Fragment shader
    const FS = `
      precision highp float;
      uniform vec2  u_resolution;
      uniform float u_time, u_scale, u_speed, u_density;
      uniform float u_hue, u_sat, u_minBright, u_maxBright, u_contrast, u_scope;
      uniform float u_brownian;
      uniform vec3  u_tint;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.)); vec2 u=f*f*(3.-2.*f); return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y; }
      float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.+vec2(7.1,3.3); a*=.5; } return v; }
      float fogField(vec2 p, vec2 drift, float sc){
        float base = fbm(p * sc + drift);
        float det  = fbm((p * (sc * 1.9) - drift * .35) + vec2(11.2,-4.7));
        float n = mix(base, det, .5);
        return smoothstep(.25,.85,n);
      }
      vec3 hueRotate(vec3 c, float a){
        float U = cos(a), W = sin(a);
        mat3 m = mat3(
          0.299+0.701*U+0.168*W, 0.587-0.587*U+0.330*W, 0.114-0.114*U-0.497*W,
          0.299-0.299*U-0.328*W, 0.587+0.413*U+0.035*W, 0.114-0.114*U+0.292*W,
          0.299-0.300*U+1.250*W, 0.587-0.588*U-1.050*W, 0.114+0.886*U-0.203*W
        );
        return clamp(m * c, 0.0, 1.0);
      }
      vec3 applySaturation(vec3 c, float s){
        float gray = dot(c, vec3(0.213, 0.715, 0.072));
        return clamp(mix(vec3(gray), c, s), 0.0, 1.0);
      }
      void main(){
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 p = uv - .5; p.x *= aspect;

        float t = u_time * u_speed;
        // True Brownian motion - independent x and y movement with multiple frequencies
        vec2 drift = vec2(
          sin(t * 1.3) + sin(t * 2.1) * 0.5 + sin(t * 0.7) * 0.3,
          cos(t * 1.1) + cos(t * 1.9) * 0.5 + cos(t * 0.6) * 0.3
        ) * u_brownian;
        float n = fogField(p, drift, u_scale);
        float fogAmt = clamp(n * (0.35 + 0.9 * u_density), 0., 1.);

        vec3 bg = vec3(.07,.085,.11);
        // Apply hue rotation only to the background to shift from gray to blue
        vec3 bgColored = hueRotate(bg, u_hue);
        vec3 rawFogC = u_tint * (0.6 + 0.4 * n);

        vec3 fogOnlyCol = mix(bgColored, applySaturation(rawFogC, u_sat), fogAmt);
        vec3 mixedCol   = mix(bgColored, rawFogC, fogAmt);
        vec3 allSceneCol= applySaturation(mixedCol, u_sat);
        vec3 col = mix(fogOnlyCol, allSceneCol, clamp(u_scope, 0.0, 1.0));
        
        // Apply contrast (reduces difference between light and dark)
        vec3 mid = vec3(0.5);
        col = mix(mid, col, u_contrast);
        
        // Remap brightness to stay within min/max bounds
        col = mix(vec3(u_minBright), vec3(u_maxBright), col);

        gl_FragColor = vec4(col, 1.);
      }
    `;

    // Compile shaders
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(sh) || 'shader compilation failed');
      }
      return sh;
    };

    // Create program
    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program) || 'program link failed');
    }
    gl.useProgram(this.program);

    // Setup geometry (fullscreen triangle)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    this.uniforms = {
      res: gl.getUniformLocation(this.program, 'u_resolution'),
      time: gl.getUniformLocation(this.program, 'u_time'),
      scale: gl.getUniformLocation(this.program, 'u_scale'),
      speed: gl.getUniformLocation(this.program, 'u_speed'),
      density: gl.getUniformLocation(this.program, 'u_density'),
      hue: gl.getUniformLocation(this.program, 'u_hue'),
      sat: gl.getUniformLocation(this.program, 'u_sat'),
      minBright: gl.getUniformLocation(this.program, 'u_minBright'),
      maxBright: gl.getUniformLocation(this.program, 'u_maxBright'),
      contrast: gl.getUniformLocation(this.program, 'u_contrast'),
      scope: gl.getUniformLocation(this.program, 'u_scope'),
      brownian: gl.getUniformLocation(this.program, 'u_brownian'),
      tint: gl.getUniformLocation(this.program, 'u_tint'),
    };

    // Setup resize handler
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });

    // Start render loop
    this.render();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth * this.dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * this.dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.uniforms.res, w, h);
  }

  hexToRgb(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    return m ? [
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255
    ] : [0.86, 0.91, 1.0];
  }

  updateUniforms() {
    const gl = this.gl;
    const U = this.uniforms;
    const p = this.params;

    const tint = this.hexToRgb(p.tintHex);
    const hueRad = p.hueDeg * Math.PI / 180;

    gl.uniform1f(U.time, this.elapsed);
    gl.uniform1f(U.scale, p.scale);
    gl.uniform1f(U.speed, p.speed);
    gl.uniform1f(U.density, p.density);
    gl.uniform1f(U.hue, hueRad);
    gl.uniform1f(U.sat, p.saturation);
    gl.uniform1f(U.minBright, p.minBrightness);
    gl.uniform1f(U.maxBright, p.maxBrightness);
    gl.uniform1f(U.contrast, p.contrast);
    gl.uniform1f(U.scope, p.scope);
    gl.uniform1f(U.brownian, p.brownianScale);
    gl.uniform3f(U.tint, tint[0], tint[1], tint[2]);
  }

  render(now) {
    if (!this.params.paused) {
      this.elapsed = (now - this.baseTime) / 1000;
      this.updateUniforms();
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame((t) => this.render(t));
  }

  // Public methods for controlling the renderer
  setParam(key, value) {
    this.params[key] = value;
  }

  setParams(params) {
    Object.assign(this.params, params);
  }

  pause() {
    this.params.paused = true;
  }

  resume() {
    this.params.paused = false;
    this.baseTime = performance.now() - this.elapsed * 1000;
  }

  reset() {
    this.baseTime = performance.now();
    this.elapsed = 0;
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FogRenderer;
}
