import * as THREE from 'three';

export interface CityPostFXOptions {
  enabled: boolean;
  fxaa: boolean;
  sharpen: number;
  grain: number;
}

/**
 * Lightweight single-pass WebGL2 post-processing compositor for Ashenhold V3.
 * Renders the scene into a linear HalfFloat HDR target, applies Three.js's exact
 * Khronos PBR Neutral tone-mapping + Linear-to-sRGB encoding per sample so `final`
 * and `no_post` match in exposure and color identically, then runs edge-aware FXAA,
 * contrast-adaptive micro-sharpening (backed off on FXAA edges), and subtle dither/grain.
 */
export class CityPostFX {
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;

  readonly options: CityPostFXOptions = {
    enabled: true,
    fxaa: true,
    sharpen: 0.22,
    grain: 0.008,
  };

  constructor() {
    this.material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
        uTime: { value: 0 },
        uExposure: { value: 1.0 },
        uFxaa: { value: 1 },
        uSharpen: { value: 0.22 },
        uGrain: { value: 0.008 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uTime;
        uniform float uExposure;
        uniform float uFxaa;
        uniform float uSharpen;
        uniform float uGrain;
        varying vec2 vUv;

        vec3 neutralToneMapping(vec3 color) {
          const float StartCompression = 0.8 - 0.04;
          const float Desaturation = 0.15;
          color *= uExposure;
          float x = min(color.r, min(color.g, color.b));
          float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
          color -= offset;
          float peak = max(color.r, max(color.g, color.b));
          if (peak < StartCompression) return max(color, vec3(0.0));
          float d = 1.0 - StartCompression;
          float newPeak = 1.0 - d * d / (peak + d - StartCompression);
          color *= newPeak / peak;
          float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
          return max(mix(color, vec3(newPeak), g), vec3(0.0));
        }

        vec3 linearToSrgb(vec3 c) {
          vec3 lo = c * 12.92;
          vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
          return mix(lo, hi, step(vec3(0.0031308), c));
        }

        vec3 sampleSrgb(vec2 uv) {
          return linearToSrgb(neutralToneMapping(texture2D(tDiffuse, uv).rgb));
        }

        float luma(vec3 c) {
          return dot(c, vec3(0.299, 0.587, 0.114));
        }

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        void main() {
          vec3 rgbM = sampleSrgb(vUv);
          vec3 rgbNW = sampleSrgb(vUv + vec2(-1.0, -1.0) * uTexel);
          vec3 rgbNE = sampleSrgb(vUv + vec2( 1.0, -1.0) * uTexel);
          vec3 rgbSW = sampleSrgb(vUv + vec2(-1.0,  1.0) * uTexel);
          vec3 rgbSE = sampleSrgb(vUv + vec2( 1.0,  1.0) * uTexel);

          float lM = luma(rgbM);
          float lNW = luma(rgbNW);
          float lNE = luma(rgbNE);
          float lSW = luma(rgbSW);
          float lSE = luma(rgbSE);
          float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
          float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
          float contrast = lMax - lMin;

          vec3 col = rgbM;
          if (uFxaa > 0.5 && contrast > max(0.0312, lMax * 0.10)) {
            vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
            float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
            float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
            dir = clamp(dir * rcpDir, vec2(-6.0), vec2(6.0)) * uTexel;
            vec3 rgbA = 0.5 * (
              sampleSrgb(vUv + dir * (1.0 / 3.0 - 0.5)) +
              sampleSrgb(vUv + dir * (2.0 / 3.0 - 0.5))
            );
            vec3 rgbB = rgbA * 0.5 + 0.25 * (
              sampleSrgb(vUv + dir * -0.5) +
              sampleSrgb(vUv + dir *  0.5)
            );
            float lB = luma(rgbB);
            col = (lB < lMin || lB > lMax) ? rgbA : rgbB;
          }

          // Contrast-adaptive micro-sharpening, smoothly backed off on sharp silhouette edges
          if (uSharpen > 0.001) {
            vec3 blur = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25;
            float edgeBackoff = 1.0 - smoothstep(0.05, 0.24, contrast);
            col += (rgbM - blur) * uSharpen * edgeBackoff;
          }

          // Subtle tonal dither + micro film grain (prevents 8-bit sky/shadow banding)
          if (uGrain > 0.0005) {
            float n = hash12(gl_FragCoord.xy + fract(uTime) * 37.0) - 0.5;
            col += vec3(n * uGrain);
          }

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private ensureTarget(width: number, height: number): THREE.WebGLRenderTarget {
    if (this.rt && this.rt.width === width && this.rt.height === height) {
      return this.rt;
    }
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      stencilBuffer: false,
    });
    return this.rt;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, elapsed: number): void {
    if (!this.options.enabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const w = Math.max(2, Math.floor(size.x));
    const h = Math.max(2, Math.floor(size.y));
    const rt = this.ensureTarget(w, h);

    const prevAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);

    this.material.uniforms.tDiffuse.value = rt.texture;
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uExposure.value = renderer.toneMappingExposure;
    this.material.uniforms.uFxaa.value = this.options.fxaa ? 1 : 0;
    this.material.uniforms.uSharpen.value = this.options.sharpen;
    this.material.uniforms.uGrain.value = this.options.grain;

    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
    renderer.info.autoReset = prevAutoReset;
  }

  dispose(): void {
    this.rt?.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
