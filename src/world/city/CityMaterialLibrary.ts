import * as THREE from 'three';

const TEXTURE_BASE = './assets/city/textures';

export type MaterialDebugMode = 'final' | 'albedo' | 'normal' | 'roughness' | 'no_ao' | 'no_post';

const DEBUG_MODE_INT: Record<MaterialDebugMode, number> = {
  final: 0,
  albedo: 1,
  normal: 2,
  roughness: 3,
  no_ao: 4,
  no_post: 0,
};

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
export const AO_DIRECT_MIX = 0.26;

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
 * V3 World-Space Gothic Weathering + Indirect-Only AO + Diagnostic Mode Shader Injection.
 * Inspired by multi-scale PBR weathering principles (100% original medieval stone shader):
 *  - Dual-octave 3D world-space value noise breaks up repeating masonry across walls & towers.
 *  - Anisotropic vertical rain streaks subtly stain exposed vertical stone faces.
 *  - Upward-facing horizontal ledges collect weathered lichen/moss dust.
 *  - Basal dampness & crevice wetness enrich saturation and lower roughness for grazing daylight sheen.
 *  - Close-range (<10m) micro-grit modulation keeps 1-meter stone closeups tactile and crisp.
 *  - Supports live diagnostic visualization: final | albedo | normal | roughness | no_ao.
 */
interface WeatheringParams {
  macroAmp: number;
  macroFreq: number;
  mossStrength: number;
  streakStrength: number;
  wetStrength: number;
  microGrit: number;
  useOrm: boolean;
  directAoMix: number;
}

const WORLD_NOISE_GLSL = `
float amHash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float amNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(amHash3(i), amHash3(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(amHash3(i + vec3(0.0, 1.0, 0.0)), amHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(amHash3(i + vec3(0.0, 0.0, 1.0)), amHash3(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(amHash3(i + vec3(0.0, 1.0, 1.0)), amHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}
// Smooth world-space sky-occlusion inside roofed interiors (Tavern, Guardhouse, Apothecary) & -4m Undercroft
float amComputeSkyOcclusion(vec3 wp) {
  // 1. Tavern 1F/2F interior [x: 5.35..13.1, y: 1.4..8.2, z: -8.3..+1.9] (West street facade at x=5.35)
  float tavInX = smoothstep(5.30, 6.85, wp.x) * (1.0 - smoothstep(12.6, 13.3, wp.x));
  float tavInY = smoothstep(1.30, 1.85, wp.y) * (1.0 - smoothstep(7.8, 8.5, wp.y));
  float tavInZ = smoothstep(-8.45, -7.75, wp.z) * (1.0 - smoothstep(1.35, 2.05, wp.z));
  float occTav = tavInX * tavInY * tavInZ * 0.78;

  // 2. Gate Guardhouse interior [x: -12.4..-5.6, y: 0.0..4.2, z: 3.8..10.6]
  float gdX = smoothstep(-12.4, -11.5, wp.x) * (1.0 - smoothstep(-6.3, -5.4, wp.x));
  float gdY = (1.0 - smoothstep(3.8, 4.4, wp.y));
  float gdZ = smoothstep(3.8, 4.6, wp.z) * (1.0 - smoothstep(9.8, 10.6, wp.z));
  float occGuard = gdX * gdY * gdZ * 0.72;

  // 3. Market Apothecary interior [x: -19.2..-12.6, y: 3.3..7.5, z: -34.6..-26.6]
  float apX = smoothstep(-19.2, -18.2, wp.x) * (1.0 - smoothstep(-13.4, -12.4, wp.x));
  float apY = smoothstep(3.2, 3.7, wp.y) * (1.0 - smoothstep(7.1, 7.8, wp.y));
  float apZ = smoothstep(-34.6, -33.6, wp.z) * (1.0 - smoothstep(-27.6, -26.6, wp.z));
  float occApoth = apX * apY * apZ * 0.72;

  // 4. Vaulted -4m Subterranean Undercroft
  float occUnder = smoothstep(0.45, -1.65, wp.y) * 0.82;

  return 1.0 - max(max(occTav, occGuard), max(occApoth, occUnder));
}
`;

function injectGothicWeathering(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, { value: unknown }> },
  sharedDebugUniform: { value: number },
  params: WeatheringParams,
): void {
  shader.uniforms.uDebugMode = sharedDebugUniform;
  shader.uniforms.uWeatherA = {
    value: new THREE.Vector4(params.macroAmp, params.macroFreq, params.mossStrength, params.streakStrength),
  };
  shader.uniforms.uWeatherB = {
    value: new THREE.Vector4(params.wetStrength, params.microGrit, params.useOrm ? 1.0 : 0.0, params.directAoMix),
  };

  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
       varying vec3 vAmWorldPos;
       varying vec3 vAmWorldNrm;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 amWp = vec4(transformed, 1.0);
       vec3 amWn = objectNormal;
       #ifdef USE_INSTANCING
         amWp = instanceMatrix * amWp;
         amWn = mat3(instanceMatrix) * amWn;
       #endif
       vAmWorldPos = (modelMatrix * amWp).xyz;
       vAmWorldNrm = normalize(mat3(modelMatrix) * amWn);`,
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
       uniform float uDebugMode;
       uniform vec4 uWeatherA;
       uniform vec4 uWeatherB;
       varying vec3 vAmWorldPos;
       varying vec3 vAmWorldNrm;
       ${WORLD_NOISE_GLSL}`,
    )
    .replace(
      '#include <color_fragment>',
      `float amWetMask = 0.0;
       vec3 aoTint = vec3(1.0);
       #if defined( USE_COLOR_ALPHA )
         diffuseColor.a *= vColor.a;
         aoTint = vColor.rgb;
       #elif defined( USE_COLOR )
         aoTint = vColor;
       #endif
       if (uDebugMode > 3.5 && uDebugMode < 4.5) {
         aoTint = vec3(1.0);
       }
       // World-space multi-scale Gothic weathering (zero pattern cloning across identical walls!)
       vec3 amNrmW = normalize(vAmWorldNrm);
       float amCamDist = length(cameraPosition - vAmWorldPos);
       float amMac1 = amNoise3(vAmWorldPos * uWeatherA.y);
       float amMac2 = amNoise3(vAmWorldPos * (uWeatherA.y * 3.1) + vec3(11.3, 5.7, 2.9));
       float amMac = amMac1 * 0.65 + amMac2 * 0.35;
       // Macro mineral brightness & warm/cool subtle geological drift
       diffuseColor.rgb *= 1.0 + (amMac - 0.5) * uWeatherA.x * 1.85;
       diffuseColor.rgb *= mix(vec3(0.97, 0.99, 1.02), vec3(1.02, 1.00, 0.97), amMac1);

       // Close-range (<9m) micro-stone mineral grain
       float amClose = 1.0 - smoothstep(2.0, 9.0, amCamDist);
       if (uWeatherB.y > 0.001 && amClose > 0.01) {
         float amGrit = amNoise3(vAmWorldPos * 16.0) * 0.6 + amNoise3(vAmWorldPos * 38.0 + 4.1) * 0.4;
         diffuseColor.rgb *= 1.0 + (amGrit - 0.5) * (uWeatherB.y * 0.65) * amClose;
       }

       // Vertical anisotropic rain streaks on exposed outdoor walls (attenuated indoors)
       float amSkyOcc = amComputeSkyOcclusion(vAmWorldPos);
       float amUp = smoothstep(0.54, 0.88, amNrmW.y);
       float amVert = 1.0 - abs(amNrmW.y);
       if (uWeatherA.w > 0.001 && amSkyOcc > 0.45) {
         float sCoord = vAmWorldPos.x + vAmWorldPos.z;
         float st1 = amNoise3(vec3(sCoord * 1.45, vAmWorldPos.y * 0.24, (vAmWorldPos.x - vAmWorldPos.z) * 1.45));
         float st2 = amNoise3(vec3(sCoord * 4.2, vAmWorldPos.y * 0.45, 3.7));
         float streak = smoothstep(0.48, 0.84, st1 * 0.6 + st2 * 0.4) * amVert * uWeatherA.w * amSkyOcc;
         diffuseColor.rgb *= 1.0 - streak * 0.20;
         amWetMask = max(amWetMask, streak * 0.42);
       }

       // Upward-facing horizontal outdoor ledge moss / lichen weathering
       if (uWeatherA.z > 0.001 && amUp > 0.01 && amSkyOcc > 0.5) {
         float mossN = smoothstep(0.48, 0.80, amMac * 0.75 + amMac2 * 0.25);
         float mossW = amUp * mossN * uWeatherA.z * amSkyOcc;
         vec3 lichenCol = vec3(0.19, 0.24, 0.14);
         diffuseColor.rgb = mix(diffuseColor.rgb, lichenCol, mossW * 0.62);
       }

       // Basal dampness near ground/terrace bases & full dampness in the -4m Undercroft
       float localY = vAmWorldPos.y;
       float undercroftWet = smoothstep(0.2, -1.5, localY);
       float basal0 = smoothstep(0.85, 0.0, abs(localY - 0.15));
       float basal3 = smoothstep(0.75, 0.0, abs(localY - 3.65));
       float basalDamp = max(basal0, basal3) * amVert * 0.32 * amSkyOcc;
       amWetMask = clamp(max(amWetMask, max(undercroftWet * 0.86, basalDamp)), 0.0, 1.0) * uWeatherB.x;
       if (amWetMask > 0.01) {
         float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
         diffuseColor.rgb = mix(vec3(lum), diffuseColor.rgb, 1.0 + 0.18 * amWetMask);
         diffuseColor.rgb *= 1.0 - 0.20 * amWetMask;
       }`,
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
       // True close-range (<8m) world-space micro-normal crystal/pore relief (NOT just albedo noise!)
       if (uWeatherB.y > 0.02 && amClose > 0.02) {
         vec3 mp = vAmWorldPos * 26.0;
         float mn0 = amNoise3(mp);
         vec3 mGrad = vec3(
           amNoise3(mp + vec3(0.18, 0.0, 0.0)) - mn0,
           amNoise3(mp + vec3(0.0, 0.18, 0.0)) - mn0,
           amNoise3(mp + vec3(0.0, 0.0, 0.18)) - mn0
         );
         vec3 viewGrad = (viewMatrix * vec4(mGrad, 0.0)).xyz;
         normal = normalize(normal - viewGrad * (uWeatherB.y * 0.55 * amClose));
       }`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
       #ifdef USE_ROUGHNESSMAP
         vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
         roughnessFactor *= texelRoughness.g;
       #endif
       // Wet stone & rain streaks smoothly drop roughness for crisp grazing highlights
       roughnessFactor = mix(roughnessFactor, max(0.18, roughnessFactor * 0.44), amWetMask);
       roughnessFactor = clamp(roughnessFactor + (amMac2 - 0.5) * 0.08, 0.14, 0.98);`,
    )
    .replace(
      '#include <aomap_fragment>',
      `#ifdef USE_AOMAP
         float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
         if (uDebugMode > 3.5 && uDebugMode < 4.5) {
           ambientOcclusion = 1.0;
         }
         reflectedLight.indirectDiffuse *= ambientOcclusion;
         #if defined( USE_ENVMAP ) && defined( STANDARD )
           float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
           reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
         #endif
       #endif
       // Apply vertex AO + indoor/undercroft sky-occlusion (creates genuine interior vs sunlit-exterior contrast!)
       reflectedLight.indirectDiffuse *= aoTint * amSkyOcc;
       reflectedLight.indirectSpecular *= aoTint * amSkyOcc;
       // Warm ambient hearth bounce inside enclosed Tavern/Guardhouse rooms so shadows stay rich & readable
       reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.065, 0.038, 0.018) * (1.0 - amSkyOcc);
       reflectedLight.directDiffuse *= mix(vec3(1.0), aoTint, uWeatherB.w);`,
    )
    .replace(
      '#include <dithering_fragment>',
      `if (uDebugMode > 0.5 && uDebugMode < 1.5) {
         gl_FragColor = vec4(pow(clamp(diffuseColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
       } else if (uDebugMode > 1.5 && uDebugMode < 2.5) {
         gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);
       } else if (uDebugMode > 2.5 && uDebugMode < 3.5) {
         gl_FragColor = vec4(vec3(roughnessFactor), 1.0);
       }
       #include <dithering_fragment>`,
    );
}

/**
 * Linear albedo gains calibrated for realistic sunlit Gothic limestone, slate, and ancient oak.
 */
export const ALBEDO_GAIN: Record<string, number> = {
  stone_ashlar: 1.12,
  stone_trim: 1.06,
  limestone_weathered: 1.06,
  citadel_masonry: 1.12,
  damp_slate_stone: 1.12,
  mountain_crag_rock: 1.12,
  aged_oak_timber: 1.16,
  brick_medieval: 1.08,
  timber_oak: 1.16,
  planks_oak: 1.14,
  roof_slate: 1.55,
  roof_clay: 1.12,
  iron_forged: 1.18,
  brass_aged: 1.08,
  plaster_cream: 0.92,
  plaster_ochre: 0.94,
  plaster_sage: 0.92,
  plaster_terracotta: 0.92,
};

const METAL_ENV_MATERIALS = new Set(['iron_forged', 'brass_aged', 'window_leaded']);

export class CityMaterialLibrary {
  private readonly loader: THREE.TextureLoader | null;
  private readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  private readonly texturesToDispose: THREE.Texture[] = [];
  private readonly debugUniform = { value: 0 };
  readonly streetMaterial: THREE.MeshStandardMaterial;
  readonly waterTroughMaterial: THREE.MeshStandardMaterial;

  constructor(maxAnisotropy = 8) {
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

    /**
     * Load V4 Packed-ORM PBR Material (1024/512 Albedo + Dual-Scale Normal + HBAO Packed ORM):
     *   - R = Horizon-Based Heightfield AO (`aoMap`, `aoMapIntensity`)
     *   - G = Roughness (`roughnessMap`)
     *   - B = Metalness (`metalnessMap`; 0.0 for dielectric stone/wood, 1.0 * B for wrought iron!)
     */
    const loadOrmPBR = (
      texBase: string,
      opts: { roughness?: number; metalness?: number; aoIntensity?: number; normalScale?: number; repeat?: number } = {},
    ): THREE.MeshStandardMaterial => {
      const { roughness = 1.0, metalness = 0.0, aoIntensity = 0.65, normalScale = 1.32, repeat = 1 } = opts;
      const ormTex = loadTex(`${texBase}_orm.png`, false, repeat);
      return new THREE.MeshStandardMaterial({
        map: loadTex(`${texBase}_albedo.png`, true, repeat),
        normalMap: loadTex(`${texBase}_normal.png`, false, repeat),
        normalScale: new THREE.Vector2(normalScale, normalScale),
        aoMap: ormTex,
        aoMapIntensity: aoIntensity,
        roughnessMap: ormTex,
        metalnessMap: ormTex,
        roughness,
        metalness,
      });
    };

    const loadPBR = (
      name: string,
      opts: { roughness?: number; metalness?: number; normalScale?: number; repeat?: number } = {},
    ): THREE.MeshStandardMaterial => {
      const { roughness = 0.88, metalness = 0.0, normalScale = 1.0, repeat = 1 } = opts;
      return new THREE.MeshStandardMaterial({
        map: loadTex(`${name}_albedo.png`, true, repeat),
        normalMap: loadTex(`${name}_normal.png`, false, repeat),
        normalScale: new THREE.Vector2(normalScale, normalScale),
        roughnessMap: loadTex(`${name}_roughness.png`, false, repeat),
        roughness,
        metalness,
      });
    };

    const STONE_WEATHER: WeatheringParams = {
      macroAmp: 0.15,
      macroFreq: 0.14,
      mossStrength: 0.48,
      streakStrength: 0.56,
      wetStrength: 0.62,
      microGrit: 0.16,
      useOrm: true,
      directAoMix: AO_DIRECT_MIX,
    };
    const DAMP_WEATHER: WeatheringParams = {
      macroAmp: 0.17,
      macroFreq: 0.18,
      mossStrength: 0.62,
      streakStrength: 0.70,
      wetStrength: 0.90,
      microGrit: 0.16,
      useOrm: true,
      directAoMix: 0.22,
    };
    const OAK_WEATHER: WeatheringParams = {
      macroAmp: 0.12,
      macroFreq: 0.22,
      mossStrength: 0.16,
      streakStrength: 0.22,
      wetStrength: 0.34,
      microGrit: 0.10,
      useOrm: true,
      directAoMix: 0.24,
    };
    const SUBTLE_WEATHER: WeatheringParams = {
      macroAmp: 0.1,
      macroFreq: 0.16,
      mossStrength: 0.15,
      streakStrength: 0.28,
      wetStrength: 0.24,
      microGrit: 0.08,
      useOrm: false,
      directAoMix: 0.24,
    };

    // === V4 Primary Grounded Gothic Mountain Citadel Materials (1024/512 Packed ORM + Multi-Scale Weathering) ===
    this.registerBase('citadel_masonry', loadOrmPBR('citadel_masonry', { normalScale: 1.42, aoIntensity: 0.68 }), STONE_WEATHER);
    this.registerBase('limestone_weathered', loadOrmPBR('limestone_weathered', { normalScale: 1.28, aoIntensity: 0.62 }), STONE_WEATHER);
    this.registerBase(
      'damp_slate_stone',
      (() => {
        const mat = loadOrmPBR('damp_slate_stone', { normalScale: 1.32, aoIntensity: 0.66 });
        mat.color.setHex(0xd8cfc2);
        return mat;
      })(),
      DAMP_WEATHER,
    );
    this.registerBase('broken_flagstone', loadOrmPBR('broken_flagstone', { normalScale: 1.35, aoIntensity: 0.66 }), STONE_WEATHER);
    this.registerBase('mountain_crag_rock', loadOrmPBR('mountain_crag_rock', { normalScale: 1.55, aoIntensity: 0.72 }), {
      ...STONE_WEATHER,
      mossStrength: 0.62,
      macroAmp: 0.20,
      microGrit: 0.20,
    });
    this.registerBase('aged_oak_timber', loadOrmPBR('aged_oak_timber', { normalScale: 1.25, aoIntensity: 0.62 }), OAK_WEATHER);

    // Harmonize ALL legacy stone/brick/wood keys onto V4 1024/512 Packed-ORM maps (eliminates cartoon pillow bricks!)
    this.registerBase('stone_ashlar', loadOrmPBR('citadel_masonry', { normalScale: 1.40, aoIntensity: 0.68 }), STONE_WEATHER);
    this.registerBase('stone_trim', loadOrmPBR('limestone_weathered', { normalScale: 1.28, aoIntensity: 0.62 }), STONE_WEATHER);
    this.registerBase(
      'brick_medieval',
      (() => {
        const mat = loadOrmPBR('citadel_masonry', { normalScale: 1.36, aoIntensity: 0.66 });
        mat.color.setHex(0xd2c4b4);
        return mat;
      })(),
      STONE_WEATHER,
    );
    this.registerBase('timber_oak', loadOrmPBR('aged_oak_timber', { normalScale: 1.25 }), OAK_WEATHER);
    this.registerBase('planks_oak', loadOrmPBR('aged_oak_timber', { normalScale: 1.15 }), OAK_WEATHER);

    // Unified Weathered Limewash Roughcast, Highland Slate Roofs & Hand-Forged Iron (100% cohesive Stormveil palette!)
    this.registerBase(
      'plaster_cream',
      (() => {
        const mat = loadOrmPBR('limestone_weathered', { normalScale: 0.95, aoIntensity: 0.55 });
        mat.color.setHex(0xd4cbbd);
        return mat;
      })(),
      STONE_WEATHER,
    );
    this.registerBase(
      'plaster_ochre',
      (() => {
        const mat = loadOrmPBR('limestone_weathered', { normalScale: 0.95, aoIntensity: 0.55 });
        mat.color.setHex(0xc9bba3);
        return mat;
      })(),
      STONE_WEATHER,
    );
    this.registerBase(
      'plaster_sage',
      (() => {
        const mat = loadOrmPBR('limestone_weathered', { normalScale: 0.95, aoIntensity: 0.55 });
        mat.color.setHex(0xbfbfb4);
        return mat;
      })(),
      STONE_WEATHER,
    );
    this.registerBase(
      'plaster_terracotta',
      (() => {
        const mat = loadOrmPBR('limestone_weathered', { normalScale: 0.95, aoIntensity: 0.55 });
        mat.color.setHex(0xc2afa0);
        return mat;
      })(),
      STONE_WEATHER,
    );
    this.registerBase('roof_slate', loadPBR('roof_slate', { roughness: 0.78, metalness: 0.0, normalScale: 1.35 }), {
      ...SUBTLE_WEATHER,
      mossStrength: 0.42,
    });
    this.registerBase(
      'roof_clay',
      (() => {
        const mat = loadPBR('roof_slate', { roughness: 0.82, metalness: 0.0, normalScale: 1.35 });
        mat.color.setHex(0xb89a8c);
        return mat;
      })(),
      {
        ...SUBTLE_WEATHER,
        mossStrength: 0.40,
      },
    );
    // V4 Hand-Hammered Wrought Iron with spatially varying metalness (0.15..0.95) & roughness (0.26..0.94) in Packed ORM!
    this.registerBase(
      'iron_forged',
      loadOrmPBR('iron_forged_v4', { roughness: 1.0, metalness: 1.0, aoIntensity: 0.72, normalScale: 1.35 }),
      {
        ...SUBTLE_WEATHER,
        useOrm: true,
        macroAmp: 0.08,
        mossStrength: 0,
        streakStrength: 0.18,
        microGrit: 0.08,
      },
    );
    this.registerBase('brass_aged', loadPBR('brass_aged', { roughness: 0.52, metalness: 0.80, normalScale: 0.9 }), {
      ...SUBTLE_WEATHER,
      macroAmp: 0.06,
      mossStrength: 0,
      streakStrength: 0.1,
    });

    // Leaded medieval windows (subtle daytime sky specular, warm hearth glow at dusk/night)
    const windowTex = loadTex('window_leaded_albedo.png', true);
    const windowMat = new THREE.MeshStandardMaterial({
      map: windowTex,
      emissive: new THREE.Color('#ffaa4c'),
      emissiveMap: windowTex,
      emissiveIntensity: 0.04,
      roughness: 0.24,
      metalness: 0.12,
    });
    this.registerBase('window_leaded', windowMat, { ...SUBTLE_WEATHER, macroAmp: 0, mossStrength: 0, streakStrength: 0, wetStrength: 0 });

    // Weathered Heraldic Banners, Muted Coarse-Woven Linen Awnings (ZERO circus stripes!) & Painted Shop Signs
    const coarseCanvasTex = loadTex('dirt_gravel_albedo.png', true, 3);
    this.registerBase('banner_ashenhold', new THREE.MeshStandardMaterial({ map: loadTex('banner_ashenhold.png', true), color: 0xcab8a8, roughness: 0.92, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('awning_striped', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x8e6b58, roughness: 0.95, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('awning_navy', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x5c6976, roughness: 0.95, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('awning_emerald', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x64705a, roughness: 0.95, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('awning_ochre', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x9c8564, roughness: 0.95, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('awning_plum', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x7a5c5e, roughness: 0.95, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('cloth_crimson', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x6e312a, roughness: 0.94, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('cloth_navy', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x3b4958, roughness: 0.94, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('cloth_emerald', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x3d523c, roughness: 0.94, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('cloth_ochre', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0x8a6d40, roughness: 0.94, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('cloth_linen', new THREE.MeshStandardMaterial({ map: coarseCanvasTex, color: 0xbab09c, roughness: 0.95, side: THREE.DoubleSide }), SUBTLE_WEATHER);
    this.registerBase('sign_tavern', new THREE.MeshStandardMaterial({ map: loadTex('sign_tavern.png', true), roughness: 0.78 }), SUBTLE_WEATHER);
    this.registerBase('sign_apothecary', new THREE.MeshStandardMaterial({ map: loadTex('sign_apothecary.png', true), roughness: 0.78 }), SUBTLE_WEATHER);
    this.registerBase('sign_bakery', new THREE.MeshStandardMaterial({ map: loadTex('sign_bakery.png', true), roughness: 0.78 }), SUBTLE_WEATHER);
    this.registerBase('sign_smithy', new THREE.MeshStandardMaterial({ map: loadTex('sign_smithy.png', true), roughness: 0.78 }), SUBTLE_WEATHER);
    this.registerBase('sign_market', new THREE.MeshStandardMaterial({ map: loadTex('sign_market.png', true), roughness: 0.78 }), SUBTLE_WEATHER);

    this.registerBase(
      'fabric_sack',
      new THREE.MeshStandardMaterial({ map: loadTex('dirt_gravel_albedo.png', true, 2), color: 0xa08b6a, roughness: 0.95 }),
      SUBTLE_WEATHER,
    );
    this.registerBase('ceramic_clay', new THREE.MeshStandardMaterial({ color: 0x7d4930, roughness: 0.74, metalness: 0.0 }), SUBTLE_WEATHER);
    this.registerBase(
      'glow_warm',
      new THREE.MeshStandardMaterial({ color: 0xffc670, emissive: new THREE.Color('#ff8c2a'), emissiveIntensity: 1.9, roughness: 0.45 }),
      { ...SUBTLE_WEATHER, macroAmp: 0, mossStrength: 0, streakStrength: 0, wetStrength: 0 },
    );
    this.registerBase(
      'ember_forge',
      new THREE.MeshStandardMaterial({ color: 0x2a120c, emissive: new THREE.Color('#ff4d12'), emissiveIntensity: 2.6, roughness: 0.75 }),
      { ...SUBTLE_WEATHER, macroAmp: 0, mossStrength: 0, streakStrength: 0, wetStrength: 0 },
    );
    this.registerBase(
      'foliage_leaf',
      new THREE.MeshStandardMaterial({ map: loadTex('dirt_gravel_albedo.png', true, 2), color: 0x3b582e, roughness: 0.86 }),
      { ...SUBTLE_WEATHER, macroAmp: 0.14, mossStrength: 0, streakStrength: 0, wetStrength: 0.2 },
    );

    // === V4 Multi-Scale Ground Shader: 1024px Fractured Flagstones + Triplanar Cliff Bedrock + Gutters & Puddles ===
    const flagAlbedo = loadTex('broken_flagstone_albedo.png', true);
    const flagNormal = loadTex('broken_flagstone_normal.png', false);
    const flagOrm = loadTex('broken_flagstone_orm.png', false);
    const cragAlbedo = loadTex('mountain_crag_rock_albedo.png', true);
    const cragNormal = loadTex('mountain_crag_rock_normal.png', false);
    const cragOrm = loadTex('mountain_crag_rock_orm.png', false);

    this.streetMaterial = new THREE.MeshStandardMaterial({
      map: flagAlbedo,
      normalMap: flagNormal,
      normalScale: new THREE.Vector2(1.42, 1.42),
      roughnessMap: flagOrm,
      roughness: 1.0,
      metalness: 0.0,
      vertexColors: true,
    });
    this.streetMaterial.color.setScalar(1.12);
    this.streetMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uCragMap = { value: cragAlbedo };
      shader.uniforms.uCragNormal = { value: cragNormal };
      shader.uniforms.uCragOrm = { value: cragOrm };
      shader.uniforms.uDebugMode = this.debugUniform;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute vec4 aSplat;
           varying vec4 vSplat;
           varying vec3 vAmWorldPos;
           varying vec3 vAmWorldNrm;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vSplat = aSplat;
           vAmWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
           vAmWorldNrm = normalize(mat3(modelMatrix) * objectNormal);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uCragMap;
           uniform sampler2D uCragNormal;
           uniform sampler2D uCragOrm;
           uniform float uDebugMode;
           varying vec4 vSplat;
           varying vec3 vAmWorldPos;
           varying vec3 vAmWorldNrm;
           ${WORLD_NOISE_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `vec3 aoTint = vec3(1.0);
           #if defined( USE_COLOR )
             aoTint = vColor;
           #endif
           if (uDebugMode > 3.5 && uDebugMode < 4.5) {
             aoTint = vec3(1.0);
           }`,
        )
        .replace(
          '#include <map_fragment>',
          `float gPuddleW = 0.0;
           float gSoakW = 0.0;
           float gOrmAo = 1.0;
           float gCliffSlope = smoothstep(0.14, 0.38, 1.0 - clamp(vAmWorldNrm.y, 0.0, 1.0));
           // World-space triplanar UV on steep retaining walls eliminates vertical UV smearing!
           vec2 gCliffUv = mix(
             vMapUv * 0.68,
             vec2((vAmWorldPos.x * 0.78 + vAmWorldPos.z * 0.62) * 0.34, vAmWorldPos.y * 0.42),
             smoothstep(0.08, 0.32, 1.0 - clamp(vAmWorldNrm.y, 0.0, 1.0))
           );
           #ifdef USE_MAP
             vec4 flagCol = texture2D( map, vMapUv );
             vec4 cragCol = texture2D( uCragMap, gCliffUv );
             float gMac = amNoise3(vAmWorldPos * 0.16) * 0.65 + amNoise3(vAmWorldPos * 0.55 + 7.2) * 0.35;
             float gFine = amNoise3(vAmWorldPos * 5.2);
             vec3 mossCol = vec3(0.17, 0.22, 0.12) * (0.85 + 0.3 * gFine);
             vec3 blendedGround = flagCol.rgb * vSplat.x + cragCol.rgb * vSplat.y + mossCol * vSplat.z;
             blendedGround = mix(blendedGround, cragCol.rgb * 0.96, gCliffSlope);
             blendedGround *= 0.87 + 0.26 * gMac;

             // Continuous organic wetness gradient: standing puddle -> soaked rim -> damp -> dry
             float edgeNoise = amNoise3(vAmWorldPos * 1.9) * 0.6 + amNoise3(vAmWorldPos * 6.5) * 0.4;
             float depth = vSplat.w + (edgeNoise - 0.5) * 0.28;
             gPuddleW = smoothstep(0.46, 0.64, depth) * (1.0 - gCliffSlope);
             gSoakW = smoothstep(0.24, 0.52, depth) * (1.0 - gCliffSlope * 0.7);
             blendedGround *= 1.0 - 0.22 * gSoakW;
             blendedGround = mix(blendedGround, blendedGround * 0.72 + vec3(0.09, 0.12, 0.16), gPuddleW * 0.72);
             diffuseColor *= vec4(blendedGround, flagCol.a);
           #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
           #ifdef USE_ROUGHNESSMAP
             vec4 flagOrmS = texture2D( roughnessMap, vRoughnessMapUv );
             vec4 cragOrmS = texture2D( uCragOrm, gCliffUv );
             float rockBlend = clamp(max(vSplat.y + vSplat.z * 0.4, gCliffSlope), 0.0, 1.0);
             float mixRough = mix(flagOrmS.g, cragOrmS.g, rockBlend);
             gOrmAo = mix(flagOrmS.r, cragOrmS.r, rockBlend);
             float wetRough = mix(mixRough, mixRough * 0.48, gSoakW);
             roughnessFactor *= mix(wetRough, 0.07, gPuddleW);
           #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#ifdef USE_NORMALMAP_TANGENTSPACE
             vec3 mapN1 = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
             vec3 mapN2 = texture2D( uCragNormal, gCliffUv ).xyz * 2.0 - 1.0;
             vec3 mapN = mix(mapN1, mapN2, clamp(max(vSplat.y, gCliffSlope), 0.0, 1.0));
             mapN = mix(mapN, vec3(0.0, 0.0, 1.0), clamp(gPuddleW * 0.94, 0.0, 0.94));
             mapN.xy *= normalScale;
             normal = normalize( tbn * mapN );
           #endif`,
        )
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
           float gAo = (uDebugMode > 3.5 && uDebugMode < 4.5) ? 1.0 : mix(1.0, gOrmAo, 0.68);
           float gSkyOcc = amComputeSkyOcclusion(vAmWorldPos);
           vec3 cAo = aoTint * gAo * gSkyOcc;
           reflectedLight.indirectDiffuse *= cAo;
           reflectedLight.indirectSpecular *= cAo;
           reflectedLight.directDiffuse *= mix(vec3(1.0), aoTint * gAo, 0.22);`,
        )
        .replace(
          '#include <dithering_fragment>',
          `if (uDebugMode > 0.5 && uDebugMode < 1.5) {
             gl_FragColor = vec4(pow(clamp(diffuseColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
           } else if (uDebugMode > 1.5 && uDebugMode < 2.5) {
             gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);
           } else if (uDebugMode > 2.5 && uDebugMode < 3.5) {
             gl_FragColor = vec4(vec3(roughnessFactor), 1.0);
           }
           #include <dithering_fragment>`,
        );
    };
    this.streetMaterial.customProgramCacheKey = () => 'ashenhold-street-v4-flagstone';

    this.waterTroughMaterial = new THREE.MeshStandardMaterial({
      color: 0x224652,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.88,
    });
  }

  /** Switch live diagnostic rendering mode across all city architecture, props & ground. */
  setDebugMode(mode: MaterialDebugMode): void {
    this.debugUniform.value = DEBUG_MODE_INT[mode] ?? 0;
  }

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
    mat.envMapIntensity = base === 'iron_forged' ? 0.72 : base === 'window_leaded' ? 0.78 : 0.95;
    mat.needsUpdate = true;
  }

  private metalEnv: THREE.Texture | null = null;
  private readonly weatheringMap = new Map<string, WeatheringParams>();

  private registerBase(name: string, mat: THREE.MeshStandardMaterial, weather: WeatheringParams): void {
    mat.name = name;
    const gain = ALBEDO_GAIN[name];
    if (gain) mat.color.multiplyScalar(gain);
    this.weatheringMap.set(name, weather);
    mat.onBeforeCompile = (shader) => injectGothicWeathering(shader, this.debugUniform, weather);
    mat.customProgramCacheKey = () => `ashenhold-v3-${name}`;
    this.cache.set(`${name}__vc0`, mat);
  }

  getMaterial(name: string, useVertexColors = false): THREE.MeshStandardMaterial {
    const cleanName = name.replace(/\.\d+$/, '');
    const key = `${cleanName}__vc${useVertexColors ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const base = this.cache.get(`${cleanName}__vc0`) ?? this.cache.get('citadel_masonry__vc0')!;
    if (!useVertexColors) {
      return base;
    }

    const cloned = base.clone();
    cloned.vertexColors = true;
    const weather = this.weatheringMap.get(cleanName) ?? this.weatheringMap.get('citadel_masonry')!;
    cloned.onBeforeCompile = (shader) => injectGothicWeathering(shader, this.debugUniform, weather);
    cloned.customProgramCacheKey = () => `ashenhold-v3-${cleanName}-vc1`;
    if (METAL_ENV_MATERIALS.has(cleanName) && this.metalEnv) {
      this.applyEnv(cloned, cleanName);
    }
    this.cache.set(key, cloned);
    return cloned;
  }

  setDayNightGlow(nightBlend: number): void {
    const k = THREE.MathUtils.clamp(nightBlend, 0, 1);
    const windowIntensity = THREE.MathUtils.lerp(0.04, 0.85, k);
    for (const [key, mat] of this.cache) {
      if (key.startsWith('window_leaded__')) {
        mat.emissiveIntensity = windowIntensity;
      }
    }
  }

  dispose(): void {
    for (const mat of this.cache.values()) {
      mat.dispose();
    }
    this.streetMaterial.dispose();
    this.waterTroughMaterial.dispose();
    for (const tex of this.texturesToDispose) {
      tex.dispose();
    }
    this.cache.clear();
  }
}
