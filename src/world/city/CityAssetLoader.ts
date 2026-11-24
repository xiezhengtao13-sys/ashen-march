import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityMaterialLibrary } from './CityMaterialLibrary';

const MODEL_BASE = './assets/city/models';

export interface PropInstanceTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export interface StaticBatchEntry {
  filename: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface ExtractedPrimitive {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  castShadow: boolean;
}

export class CityAssetLoader {
  private readonly gltfLoader = new GLTFLoader();
  private readonly materials: CityMaterialLibrary;
  private readonly modelCache = new Map<string, Promise<THREE.Group>>();

  constructor(materials: CityMaterialLibrary) {
    this.materials = materials;
  }

  private loadGLB(filename: string): Promise<THREE.Group> {
    let cached = this.modelCache.get(filename);
    if (!cached) {
      cached = new Promise<THREE.Group>((resolve, reject) => {
        this.gltfLoader.load(
          `${MODEL_BASE}/${filename}`,
          (gltf) => {
            resolve(gltf.scene);
          },
          undefined,
          (err) => {
            reject(err);
          },
        );
      });
      this.modelCache.set(filename, cached);
    }
    return cached;
  }

  private ensureGeometryTangents(geom: THREE.BufferGeometry): void {
    if (
      !geom.attributes.tangent &&
      geom.index &&
      geom.attributes.position &&
      geom.attributes.normal &&
      geom.attributes.uv
    ) {
      geom.computeTangents();
    }
  }

  async instantiateModel(
    filename: string,
    options: { castShadow?: boolean; receiveShadow?: boolean } = {},
  ): Promise<THREE.Group> {
    const { castShadow = true, receiveShadow = true } = options;
    const template = await this.loadGLB(filename);
    const clone = template.clone(true);

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      this.ensureGeometryTangents(child.geometry);
      const origMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName = origMat?.name ?? 'stone_ashlar';
      const hasVC = Boolean(child.geometry.attributes.color);
      child.material = this.materials.getMaterial(matName, hasVC);
      const isGlowOrGlass = matName.startsWith('glow_warm') || matName.startsWith('window_leaded');
      child.castShadow = castShadow && !isGlowOrGlass;
      child.receiveShadow = receiveShadow;
      child.frustumCulled = true;
    });

    return clone;
  }

  /**
   * Static scene batching by material within a district block: merges sub-meshes sharing the
   * same PBR material & shadow flags so an entire city block draws in ~12-18 draw calls instead
   * of 120-200 individual mesh nodes.
   */
  async createDistrictStaticBatch(
    batchName: string,
    entries: StaticBatchEntry[],
    parent: THREE.Group,
  ): Promise<THREE.Group> {
    const group = new THREE.Group();
    group.name = batchName;
    if (entries.length === 0) {
      parent.add(group);
      return group;
    }

    const uniqueFiles = [...new Set(entries.map((e) => e.filename))];
    await Promise.all(uniqueFiles.map((f) => this.loadGLB(f)));

    interface MergeBucket {
      material: THREE.MeshStandardMaterial;
      castShadow: boolean;
      receiveShadow: boolean;
      geoms: THREE.BufferGeometry[];
    }
    const buckets = new Map<string, MergeBucket>();
    const instMat = new THREE.Matrix4();
    const rotMat = new THREE.Matrix4();
    const worldMat = new THREE.Matrix4();

    for (const entry of entries) {
      const template = await this.loadGLB(entry.filename);
      template.updateMatrixWorld(true);
      instMat.makeTranslation(entry.x, entry.y, entry.z);
      rotMat.makeRotationY(entry.yaw);
      instMat.multiply(rotMat);

      template.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        this.ensureGeometryTangents(child.geometry);
        const origMat = Array.isArray(child.material) ? child.material[0] : child.material;
        const matName = origMat?.name ?? 'stone_ashlar';
        const hasVC = Boolean(child.geometry.attributes.color);
        const mat = this.materials.getMaterial(matName, hasVC);
        const isGlowOrGlass =
          matName.startsWith('glow_warm') ||
          matName.startsWith('window_leaded') ||
          matName.startsWith('foliage_leaf');
        const castShadow = entry.castShadow && !isGlowOrGlass;

        // Normalize geometry to non-indexed with uniform attributes so mergeGeometries never fails
        const raw = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        const hasTan = Boolean(raw.attributes.tangent);
        const allowed = new Set([
          'position',
          'normal',
          'uv',
          ...(hasTan ? ['tangent'] : []),
          ...(hasVC ? ['color'] : []),
        ]);
        for (const attrName of Object.keys(raw.attributes)) {
          if (!allowed.has(attrName)) {
            raw.deleteAttribute(attrName);
          }
        }
        // Ensure vertex color component count is consistent (always vec4 float or vec3 float -> normalize to vec3 float)
        if (hasVC && raw.attributes.color && raw.attributes.color.itemSize !== 3) {
          const src = raw.attributes.color;
          const v3 = new Float32Array(src.count * 3);
          for (let i = 0; i < src.count; i++) {
            v3[i * 3] = src.getX(i);
            v3[i * 3 + 1] = src.getY(i);
            v3[i * 3 + 2] = src.getZ(i);
          }
          raw.setAttribute('color', new THREE.BufferAttribute(v3, 3));
        }

        worldMat.copy(instMat).multiply(child.matrixWorld);
        raw.applyMatrix4(worldMat);

        const bucketKey = `${mat.name}__vc${hasVC ? 1 : 0}__tan${hasTan ? 1 : 0}__cs${castShadow ? 1 : 0}__rs${entry.receiveShadow ? 1 : 0}`;
        let b = buckets.get(bucketKey);
        if (!b) {
          b = { material: mat, castShadow, receiveShadow: entry.receiveShadow, geoms: [] };
          buckets.set(bucketKey, b);
        }
        b.geoms.push(raw);
      });
    }

    for (const [key, b] of buckets) {
      if (b.geoms.length === 0) continue;
      const merged = b.geoms.length === 1 ? b.geoms[0] : mergeGeometries(b.geoms, false);
      if (b.geoms.length > 1) {
        for (const g of b.geoms) g.dispose();
      }
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.name = `${batchName}_${key}`;
      mesh.castShadow = b.castShadow;
      mesh.receiveShadow = b.receiveShadow;
      mesh.frustumCulled = true;
      group.add(mesh);
    }

    parent.add(group);
    return group;
  }

  async createInstancedPropBatch(
    filename: string,
    transforms: PropInstanceTransform[],
    parent: THREE.Group,
    castShadow = true,
  ): Promise<THREE.InstancedMesh[]> {
    if (transforms.length === 0) return [];
    const template = await this.loadGLB(filename);
    const primitives: ExtractedPrimitive[] = [];

    template.updateMatrixWorld(true);
    template.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      this.ensureGeometryTangents(child.geometry);
      const origMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName = origMat?.name ?? 'stone_ashlar';
      const hasVC = Boolean(child.geometry.attributes.color);
      const geom = child.geometry.clone();
      geom.applyMatrix4(child.matrixWorld);
      const isGlow =
        matName.startsWith('glow_warm') ||
        matName.startsWith('window_leaded') ||
        matName.startsWith('foliage_leaf');
      primitives.push({
        geometry: geom,
        material: this.materials.getMaterial(matName, hasVC),
        castShadow: castShadow && !isGlow,
      });
    });

    const dummy = new THREE.Object3D();
    const created: THREE.InstancedMesh[] = [];
    for (const prim of primitives) {
      const im = new THREE.InstancedMesh(prim.geometry, prim.material, transforms.length);
      im.castShadow = prim.castShadow;
      im.receiveShadow = true;
      im.frustumCulled = true;
      im.name = `Instanced_${filename}_${prim.material.name}`;

      transforms.forEach((t, idx) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.yaw, 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        im.setMatrixAt(idx, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      parent.add(im);
      created.push(im);
    }

    return created;
  }
}
