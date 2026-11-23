import * as THREE from 'three';

/**
 * Generates a prefiltered procedural sky + warm sunlit masonry bounce environment cubemap
 * via PMREMGenerator so forged iron, aged brass, leaded windows, and wet cobblestone
 * puddles reflect realistic sky and warm street highlights.
 */
export function buildCityEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture | null {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 skyZenith = vec3(0.28, 0.48, 0.74);
          vec3 skyHorizon = vec3(0.84, 0.78, 0.68);
          vec3 groundCol = vec3(0.24, 0.20, 0.16);
          vec3 col;
          if (y >= 0.0) {
            col = mix(skyHorizon, skyZenith, pow(y, 0.55));
          } else {
            col = mix(skyHorizon * 0.65, groundCol, clamp(-y * 2.2, 0.0, 1.0));
          }
          // Warm morning sun lobe + crisp specular hotspot for puddle & metal glints
          vec3 sunDir = normalize(vec3(0.42, 0.62, 0.55));
          float sunDot = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.88, 0.68) * pow(sunDot, 16.0) * 0.9;
          col += vec3(1.0, 0.94, 0.82) * smoothstep(0.992, 0.999, sunDot) * 4.5;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), skyMat);
    envScene.add(dome);

    const rt = pmrem.fromScene(envScene, 0.035);
    dome.geometry.dispose();
    skyMat.dispose();
    pmrem.dispose();
    return rt.texture;
  } catch {
    return null;
  }
}
