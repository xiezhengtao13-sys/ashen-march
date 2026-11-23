import * as THREE from 'three';

const TEXTURE_BASE = './assets/city/textures';

function createFallbackTexture(rgba: [number, number, number, number], isColor = false): THREE.DataTexture {
  const data = new Uint8Array(rgba);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}


/**
 * Vertex colours on city GLBs / ground carry baked ambient occlusion. Multiplying them straight
 * into albedo (three.js default) also darkens *direct* sunlight, which stacked with real-time
 * shadows made everything murky. Here AO only occludes indirect light (sky probe / bounce /
 * specular) and has a mild effect on direct light (contact-shadow feel).
 */
export const AO_DIRECT_MIX = 0.3;

export function injectIndirectAO(shader: { fragmentShader: string }, directMix = AO_DIRECT_MIX): void {
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <color_fragment>',
      `vec3 aoTint = vec3(1.0);
       #if defined( USE_COLOR_ALPHA )
         diffuseColor.a *= vColor.a;
         aoTint = vColor.rgb;
       #elif defined( USE_COLOR )
         aoTint = vColor;
       #endif`,
    )
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
       reflectedLight.indirectDiffuse *= aoTint;
       reflectedLight.indirectSpecular *= aoTint;
       reflectedLight.directDiffuse *= mix(vec3(1.0), aoTint, ${directMix.toFixed(2)});`,
    );
}

/**
 * Linear albedo gains. Several generated textures were physically too dark for sunlit
 * building materials (e.g. weathered oak 0.046, slate 0.07, cobble 0.116 linear). The gains are
 * applied through `material.color` (linear multiplier), tunable without regenerating textures.
 */
export const ALBEDO_GAIN: Record<string, number> = {
  stone_ashlar: 1.5,
  stone_trim: 1.4,
  brick_medieval: 1.35,
  timber_oak: 2.1,
  planks_oak: 1.65,
  roof_slate: 1.9,
  roof_clay: 1.55,
  iron_forged: 1.35,
  brass_aged: 1.1,
  plaster_cream: 1.0,
  plaster_ochre: 1.05,
  plaster_sage: 1.1,
  plaster_terracotta: 1.05,
};

const METAL_ENV_MATERIALS = new Set(['iron_forged', 'brass_aged', 'window_leaded']);

export class CityMaterialLibrary {
  private readonly loader: THREE.TextureLoader | null;
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly texturesToDispose: THREE.Texture[] = [];
  readonly streetMaterial: THREE.MeshStandardMaterial;
  readonly waterTroughMaterial: THREE.MeshStandardMaterial;

  constructor(maxAnisotropy = 4) {
    this.loader = typeof Image !== 'undefined' ? new THREE.TextureLoader() : null;

    const loadTex = (file: string, isColor: boolean, repeat = 1): THREE.Texture => {
      if (!this.loader) {
        return createFallbackTexture(isColor ? [140, 134, 124, 255] : [128, 128, 255, 255], isColor);
      }
      const tex = this.loader.load(`${TEXTURE_BASE}/${file}`);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = maxAnisotropy;
      if (isColor) {
        tex.colorSpace = THREE.SRGBColorSpace;
      }
      this.texturesToDispose.push(tex);
      return tex;
    };

    const loadPBR = (
      name: string,
      opts: {
        roughness?: number;
        metalness?: number;
        normalScale?: number;
        repeat?: number;
        emissive?: number;
        emissiveIntensity?: number;
      } = {},
    ): THREE.MeshStandardMaterial => {
      const { roughness = 0.86, metalness = 0.04, normalScale = 1.0, repeat = 1 } = opts;
      const mat = new THREE.MeshStandardMaterial({
        map: loadTex(`${name}_albedo.png`, true, repeat),
        normalMap: loadTex(`${name}_normal.png`, false, repeat),
        normalScale: new THREE.Vector2(normalScale, normalScale),
        roughnessMap: loadTex(`${name}_roughness.png`, false, repeat),
        roughness,
        metalness,
      });
      return mat;
    };

    // Architectural & Prop PBR Materials (shared across all GLB buildings & instanced props)
    this.registerBase('stone_ashlar', loadPBR('stone_ashlar', { roughness: 0.92, metalness: 0.03, normalScale: 1.15 }));
    this.registerBase('stone_trim', loadPBR('stone_trim', { roughness: 0.86, metalness: 0.05, normalScale: 1.1 }));
    this.registerBase('brick_medieval', loadPBR('brick_medieval', { roughness: 0.9, metalness: 0.02, normalScale: 1.15 }));
    this.registerBase('timber_oak', loadPBR('timber_oak', { roughness: 0.84, metalness: 0.02, normalScale: 1.1 }));
    this.registerBase('planks_oak', loadPBR('planks_oak', { roughness: 0.82, metalness: 0.02, normalScale: 1.0 }));
    this.registerBase('plaster_cream', loadPBR('plaster_cream', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 }));
    this.registerBase('plaster_ochre', loadPBR('plaster_ochre', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 }));
    this.registerBase('plaster_sage', loadPBR('plaster_sage', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 }));
    this.registerBase(
      'plaster_terracotta',
      (() => {
        const mat = loadPBR('plaster_cream', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 });
        mat.color.setHex(0xc9896b);
        return mat;
      })(),
    );
    this.registerBase('roof_slate', loadPBR('roof_slate', { roughness: 0.78, metalness: 0.06, normalScale: 1.25 }));
    this.registerBase('roof_clay', loadPBR('roof_clay', { roughness: 0.82, metalness: 0.04, normalScale: 1.25 }));
    this.registerBase('iron_forged', loadPBR('iron_forged', { roughness: 0.56, metalness: 0.88, normalScale: 1.0 }));
    this.registerBase('brass_aged', loadPBR('brass_aged', { roughness: 0.42, metalness: 0.88, normalScale: 0.9 }));

    this.registerBase(
      'window_leaded',
      (() => {
        const wTex = loadTex('window_leaded.png', true);
        return new THREE.MeshStandardMaterial({
          map: wTex,
          emissiveMap: wTex,
          roughness: 0.22,
          metalness: 0.18,
          emissive: new THREE.Color(0xf0a64b),
          emissiveIntensity: 0.06,
        });
      })(),
    );
    this.registerBase(
      'glow_warm',
      new THREE.MeshStandardMaterial({
        color: 0xffd28a,
        emissive: new THREE.Color(0xff9f38),
        emissiveIntensity: 1.35,
        roughness: 0.35,
      }),
    );
    this.registerBase(
      'ember_forge',
      new THREE.MeshStandardMaterial({
        color: 0xff5a18,
        emissive: new THREE.Color(0xff4208),
        emissiveIntensity: 2.1,
        roughness: 0.5,
      }),
    );
    this.registerBase(
      'banner_ashenhold',
      new THREE.MeshStandardMaterial({
        map: loadTex('banner_ashenhold.png', true),
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    for (const [matKey, fileName] of [
      ['awning_striped', 'awning_striped.png'],
      ['awning_navy', 'awning_navy.png'],
      ['awning_emerald', 'awning_emerald.png'],
      ['awning_ochre', 'awning_ochre.png'],
      ['awning_plum', 'awning_plum.png'],
    ] as const) {
      this.registerBase(
        matKey,
        new THREE.MeshStandardMaterial({
          map: loadTex(fileName, true),
          roughness: 0.9,
          metalness: 0.0,
        }),
      );
    }
    for (const [matKey, hex] of [
      ['cloth_crimson', 0x8a3228],
      ['cloth_navy', 0x2d4a74],
      ['cloth_emerald', 0x3b6944],
      ['cloth_ochre', 0xb38436],
      ['cloth_linen', 0xd6cab2],
    ] as const) {
      this.registerBase(
        matKey,
        new THREE.MeshStandardMaterial({
          map: loadTex('plaster_cream_albedo.png', true, 2),
          color: hex,
          roughness: 0.92,
          metalness: 0.0,
        }),
      );
    }
    for (const [matKey, fileName] of [
      ['sign_tavern', 'sign_tavern.png'],
      ['sign_apothecary', 'sign_apothecary.png'],
      ['sign_bakery', 'sign_bakery.png'],
      ['sign_smithy', 'sign_smithy.png'],
      ['sign_market', 'sign_market.png'],
    ] as const) {
      this.registerBase(
        matKey,
        new THREE.MeshStandardMaterial({
          map: loadTex(fileName, true),
          roughness: 0.76,
          metalness: 0.04,
        }),
      );
    }
    this.registerBase(
      'fabric_sack',
      new THREE.MeshStandardMaterial({
        map: loadTex('plaster_ochre_albedo.png', true, 2),
        normalMap: loadTex('plaster_ochre_normal.png', false, 2),
        color: 0xb59b76,
        roughness: 0.94,
      }),
    );
    this.registerBase(
      'ceramic_clay',
      new THREE.MeshStandardMaterial({
        map: loadTex('plaster_ochre_albedo.png', true),
        color: 0xa65f42,
        roughness: 0.56,
        metalness: 0.04,
      }),
    );
    this.registerBase(
      'foliage_leaf',
      new THREE.MeshStandardMaterial({
        map: loadTex('dirt_gravel_albedo.png', true, 2),
        color: 0x4b723b,
        roughness: 0.82,
      }),
    );

    // Custom Multi-Layer Street Ground Shader: Cobblestones + Dirt/Gravel + Moss + Reflective Wet Puddles
    const cobbleAlbedo = loadTex('cobble_street_albedo.png', true);
    const cobbleNormal = loadTex('cobble_street_normal.png', false);
    const cobbleRough = loadTex('cobble_street_roughness.png', false);
    const dirtAlbedo = loadTex('dirt_gravel_albedo.png', true);
    const dirtNormal = loadTex('dirt_gravel_normal.png', false);
    const dirtRough = loadTex('dirt_gravel_roughness.png', false);

    this.streetMaterial = new THREE.MeshStandardMaterial({
      map: cobbleAlbedo,
      normalMap: cobbleNormal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughnessMap: cobbleRough,
      roughness: 0.9,
      metalness: 0.04,
      vertexColors: true,
    });

    this.streetMaterial.color.setScalar(1.42);
    this.streetMaterial.onBeforeCompile = (shader) => {
      injectIndirectAO(shader, 0.2);
      shader.uniforms.uDirtMap = { value: dirtAlbedo };
      shader.uniforms.uDirtNormal = { value: dirtNormal };
      shader.uniforms.uDirtRough = { value: dirtRough };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute vec4 aSplat;
           varying vec4 vSplat;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSplat = aSplat;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uDirtMap;
           uniform sampler2D uDirtNormal;
           uniform sampler2D uDirtRough;
           varying vec4 vSplat;`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
             vec4 cobCol = texture2D( map, vMapUv );
             vec4 dirtCol = texture2D( uDirtMap, vMapUv * 1.4 );
             vec3 mossCol = vec3(0.14, 0.21, 0.09);
             vec3 blendedGround = cobCol.rgb * vSplat.x + dirtCol.rgb * vSplat.y + mossCol * vSplat.z;
             // Wet puddle darkening + analytical sky mirror sheen
             float puddle = clamp(vSplat.w, 0.0, 1.0);
             blendedGround = mix(blendedGround, blendedGround * 0.64 + vec3(0.08, 0.11, 0.15), puddle * 0.7);
             diffuseColor *= vec4(blendedGround, cobCol.a);
           #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
           #ifdef USE_ROUGHNESSMAP
             vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
             float dirtRough = texture2D( uDirtRough, vRoughnessMapUv * 1.4 ).g;
             float mixRough = mix(texelRoughness.g, dirtRough, clamp(vSplat.y + vSplat.z * 0.6, 0.0, 1.0));
             roughnessFactor *= mix(mixRough, 0.06, clamp(vSplat.w, 0.0, 1.0));
           #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#ifdef USE_NORMALMAP_TANGENTSPACE
             vec3 mapN1 = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
             vec3 mapN2 = texture2D( uDirtNormal, vNormalMapUv * 1.4 ).xyz * 2.0 - 1.0;
             vec3 mapN = mix(mapN1, mapN2, clamp(vSplat.y, 0.0, 1.0));
             // Water puddles flatten surface normal into crisp mirror reflection
             mapN = mix(mapN, vec3(0.0, 0.0, 1.0), clamp(vSplat.w * 0.92, 0.0, 0.92));
             mapN.xy *= normalScale;
             normal = normalize( tbn * mapN );
           #endif`,
        );
    };
    this.streetMaterial.customProgramCacheKey = () => 'ashenhold-street-triblend-v2';

    this.waterTroughMaterial = new THREE.MeshStandardMaterial({
      color: 0x224652,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.88,
    });
  }

  /**
   * Prefiltered sky environment is applied ONLY to metal / glass materials (iron, brass, leaded
   * windows, water). A global `scene.environment` made every fragment sample the PMREM cube and
   * cost ~7 s/frame under software rendering; ambient light for everything else comes from the
   * analytic SH sky probe (see CityLighting).
   */
  setMetalEnvironment(envMap: THREE.Texture | null): void {
    this.metalEnv = envMap;
    for (const [key, mat] of this.cache) {
      const base = key.replace(/__vc\d$/, '');
      if (METAL_ENV_MATERIALS.has(base)) this.applyEnv(mat, base);
    }
    this.waterTroughMaterial.envMap = envMap;
    this.waterTroughMaterial.envMapIntensity = 1.0;
    this.waterTroughMaterial.needsUpdate = true;
  }

  private applyEnv(mat: THREE.MeshStandardMaterial, base: string): void {
    mat.envMap = this.metalEnv;
    mat.envMapIntensity = base === 'window_leaded' ? 0.8 : 1.15;
    mat.needsUpdate = true;
  }

  private metalEnv: THREE.Texture | null = null;

  private registerBase(name: string, mat: THREE.MeshStandardMaterial): void {
    mat.name = name;
    const gain = ALBEDO_GAIN[name];
    if (gain) mat.color.multiplyScalar(gain);
    mat.onBeforeCompile = (shader) => injectIndirectAO(shader);
    mat.customProgramCacheKey = () => `ashenhold-ao-${name}`;
    this.cache.set(`${name}__vc0`, mat);
  }

  getMaterial(name: string, useVertexColors = false): THREE.MeshStandardMaterial {
    const cleanName = name.replace(/\.\d+$/, '');
    const key = `${cleanName}__vc${useVertexColors ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const base = this.cache.get(`${cleanName}__vc0`) ?? this.cache.get('stone_ashlar__vc0')!;
    if (!useVertexColors) return base;

    const vcMat = base.clone();
    vcMat.vertexColors = true;
    vcMat.name = `${cleanName}_vc`;
    vcMat.onBeforeCompile = (shader) => injectIndirectAO(shader);
    vcMat.customProgramCacheKey = () => `ashenhold-ao-vc-${cleanName}`;
    if (METAL_ENV_MATERIALS.has(cleanName)) this.applyEnv(vcMat, cleanName);
    this.cache.set(key, vcMat);
    return vcMat;
  }

  /** Adjust window glass glow & lantern bulbs so noon looks glassy and dusk/night feel warm. */
  setDayNightGlow(nightBlend: number): void {
    const winEm = THREE.MathUtils.lerp(0.05, 0.92, nightBlend);
    const bulbEm = THREE.MathUtils.lerp(0.35, 1.55, nightBlend);
    for (const [key, mat] of this.cache) {
      if (key.startsWith('window_leaded__')) {
        mat.emissiveIntensity = winEm;
      } else if (key.startsWith('glow_warm__')) {
        mat.emissiveIntensity = bulbEm;
      }
    }
  }

  dispose(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    for (const tex of this.texturesToDispose) {
      tex.dispose();
    }
    this.streetMaterial.dispose();
    this.waterTroughMaterial.dispose();
  }
}
