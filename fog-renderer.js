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
      density: 0.75,
      scale: 1.55,
      speed: 0.02,
      brownianScale: 2.0,
      tintHex: '#A8C6FE',
      saturation: 2.0,
      minBrightness: 0.11,
      maxBrightness: 1.34,
      contrast: 0.9,
      scope: 0,
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

    // Optimized vertex shader
    const VS = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Optimized fragment shader with descriptive variable names
    const FS = `
      precision mediump float;
      uniform vec2 resolution;
      uniform float time;
      uniform float scale;
      uniform float speed;
      uniform float density;
      uniform float saturation;
      uniform float minBrightness;
      uniform float maxBrightness;
      uniform float contrast;
      uniform float scope;
      uniform float brownianScale;
      uniform vec3 tintColor;
      
      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5);
      }
      
      // Optimized to 5 iterations for balance between quality and performance
      float noise(vec2 point) {
        vec2 integerPart = floor(point);
        vec2 fractionalPart = fract(point);
        fractionalPart = fractionalPart * fractionalPart * (3.0 - 2.0 * fractionalPart);
        
        float bottomLeft = hash(integerPart);
        float bottomRight = hash(integerPart + vec2(1.0, 0.0));
        float topLeft = hash(integerPart + vec2(0.0, 1.0));
        float topRight = hash(integerPart + vec2(1.0, 1.0));
        
        return mix(
          mix(bottomLeft, bottomRight, fractionalPart.x),
          mix(topLeft, topRight, fractionalPart.x),
          fractionalPart.y
        );
      }
      
      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.5;
        for(int i = 0; i < 5; i++) {
          value += amplitude * noise(point);
          point = point * 2.0 + vec2(7.1, 3.3);
          amplitude *= 0.5;
        }
        return value;
      }
      
      float fogField(vec2 position, vec2 drift, float scale) {
        float baseLayer = fbm(position * scale + drift);
        float detailLayer = fbm((position * (scale * 1.9) - drift * 0.35) + vec2(11.2, -4.7));
        float combined = mix(baseLayer, detailLayer, 0.5);
        return smoothstep(0.25, 0.85, combined);
      }
      
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        vec2 position = (uv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
        
        // Brownian motion with multiple frequencies
        float animatedTime = time * speed;
        vec2 drift = vec2(
          sin(animatedTime * 1.3) + sin(animatedTime * 2.1) * 0.5 + sin(animatedTime * 0.7) * 0.3,
          cos(animatedTime * 1.1) + cos(animatedTime * 1.9) * 0.5 + cos(animatedTime * 0.6) * 0.3
        ) * brownianScale;
        
        // Two-layer fog with base and detail
        float fogNoise = fogField(position, drift, scale);
        float fogAmount = clamp(fogNoise * (0.35 + 0.9 * density), 0.0, 1.0);
        
        // Background color
        vec3 backgroundColor = vec3(0.07, 0.085, 0.11);
        
        // Fog color with tint
        vec3 fogColor = tintColor * (0.6 + 0.4 * fogNoise);
        
        // Apply saturation
        float grayscale = dot(fogColor, vec3(0.3, 0.6, 0.1));
        fogColor = mix(vec3(grayscale), fogColor, saturation);
        
        // Mix background and fog
        vec3 finalColor = mix(backgroundColor, fogColor, fogAmount);
        
        // Apply contrast and brightness
        finalColor = mix(vec3(0.5), finalColor, contrast);
        finalColor = mix(vec3(minBrightness), vec3(maxBrightness), finalColor);
        
        gl_FragColor = vec4(finalColor, 1.0);
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
    const aPos = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    this.uniforms = {
      resolution: gl.getUniformLocation(this.program, 'resolution'),
      time: gl.getUniformLocation(this.program, 'time'),
      scale: gl.getUniformLocation(this.program, 'scale'),
      speed: gl.getUniformLocation(this.program, 'speed'),
      density: gl.getUniformLocation(this.program, 'density'),
      saturation: gl.getUniformLocation(this.program, 'saturation'),
      minBrightness: gl.getUniformLocation(this.program, 'minBrightness'),
      maxBrightness: gl.getUniformLocation(this.program, 'maxBrightness'),
      contrast: gl.getUniformLocation(this.program, 'contrast'),
      scope: gl.getUniformLocation(this.program, 'scope'),
      brownianScale: gl.getUniformLocation(this.program, 'brownianScale'),
      tintColor: gl.getUniformLocation(this.program, 'tintColor'),
    };

    // Set initial size
    this.resize();

    // Debounced resize handler
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this.resize(), 150);
    }, { passive: true });

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

    // Pause when window loses focus (optional, more aggressive)
    window.addEventListener('blur', () => {
      this.stopRenderLoop();
    });

    window.addEventListener('focus', () => {
      if (!this.params.paused && this.isVisible) {
        this.baseTime = performance.now() - this.elapsed * 1000;
        this.startRenderLoop();
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
      this.gl.uniform2f(this.uniforms.resolution, w, h);
    }
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
    const uniforms = this.uniforms;
    const params = this.params;

    // Only update tint if it changed
    if (params.tintHex !== this.lastTintHex) {
      this.tintRgb = this.hexToRgb(params.tintHex);
      this.lastTintHex = params.tintHex;
    }

    gl.uniform1f(uniforms.time, this.elapsed);
    gl.uniform1f(uniforms.scale, params.scale);
    gl.uniform1f(uniforms.speed, params.speed);
    gl.uniform1f(uniforms.density, params.density);
    gl.uniform1f(uniforms.saturation, params.saturation);
    gl.uniform1f(uniforms.minBrightness, params.minBrightness);
    gl.uniform1f(uniforms.maxBrightness, params.maxBrightness);
    gl.uniform1f(uniforms.contrast, params.contrast);
    gl.uniform1f(uniforms.scope, params.scope);
    gl.uniform1f(uniforms.brownianScale, params.brownianScale);
    gl.uniform3f(uniforms.tintColor, this.tintRgb[0], this.tintRgb[1], this.tintRgb[2]);
  }

  render(now) {
    if (this.params.paused || !this.isVisible) return;

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
