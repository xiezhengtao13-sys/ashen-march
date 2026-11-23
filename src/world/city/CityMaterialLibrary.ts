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
    this.registerBase('timber_oak', loadPBR('timber_oak', { roughness: 0.84, metalness: 0.02, normalScale: 1.1 }));
    this.registerBase('planks_oak', loadPBR('planks_oak', { roughness: 0.82, metalness: 0.02, normalScale: 1.0 }));
    this.registerBase('plaster_cream', loadPBR('plaster_cream', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 }));
    this.registerBase('plaster_ochre', loadPBR('plaster_ochre', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 }));
    this.registerBase('plaster_sage', loadPBR('plaster_sage', { roughness: 0.94, metalness: 0.0, normalScale: 0.75 }));
    this.registerBase('roof_slate', loadPBR('roof_slate', { roughness: 0.78, metalness: 0.06, normalScale: 1.25 }));
    this.registerBase('roof_clay', loadPBR('roof_clay', { roughness: 0.82, metalness: 0.04, normalScale: 1.25 }));
    this.registerBase('iron_forged', loadPBR('iron_forged', { roughness: 0.56, metalness: 0.88, normalScale: 1.0 }));
    this.registerBase('brass_aged', loadPBR('brass_aged', { roughness: 0.42, metalness: 0.88, normalScale: 0.9 }));

    this.registerBase(
      'window_leaded',
      new THREE.MeshStandardMaterial({
        map: loadTex('window_leaded.png', true),
        roughness: 0.22,
        metalness: 0.15,
        emissive: new THREE.Color(0xd9923b),
        emissiveIntensity: 0.25,
      }),
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
      'banner_ashenhold',
      new THREE.MeshStandardMaterial({
        map: loadTex('banner_ashenhold.png', true),
        roughness: 0.88,
        metalness: 0.02,
      }),
    );
    this.registerBase(
      'awning_striped',
      new THREE.MeshStandardMaterial({
        map: loadTex('awning_striped.png', true),
        roughness: 0.9,
        metalness: 0.0,
      }),
    );
    this.registerBase(
      'sign_tavern',
      new THREE.MeshStandardMaterial({
        map: loadTex('sign_tavern.png', true),
        roughness: 0.76,
        metalness: 0.04,
      }),
    );
    this.registerBase(
      'sign_apothecary',
      new THREE.MeshStandardMaterial({
        map: loadTex('sign_apothecary.png', true),
        roughness: 0.76,
        metalness: 0.04,
      }),
    );
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

    this.streetMaterial.onBeforeCompile = (shader) => {
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
             blendedGround = mix(blendedGround, blendedGround * 0.42 + vec3(0.20, 0.26, 0.34), puddle * 0.78);
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
    this.streetMaterial.customProgramCacheKey = () => 'ashenhold-street-triblend-v1';

    this.waterTroughMaterial = new THREE.MeshStandardMaterial({
      color: 0x224652,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.88,
    });
  }

  private registerBase(name: string, mat: THREE.MeshStandardMaterial): void {
    mat.name = name;
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
    this.cache.set(key, vcMat);
    return vcMat;
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
