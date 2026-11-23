import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CityMaterialLibrary } from './CityMaterialLibrary';

const MODEL_BASE = './assets/city/models';

export interface PropInstanceTransform {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
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

  async instantiateModel(
    filename: string,
    options: { castShadow?: boolean; receiveShadow?: boolean } = {},
  ): Promise<THREE.Group> {
    const { castShadow = true, receiveShadow = true } = options;
    const template = await this.loadGLB(filename);
    const clone = template.clone(true);

    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
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
      const origMat = Array.isArray(child.material) ? child.material[0] : child.material;
      const matName = origMat?.name ?? 'stone_ashlar';
      const hasVC = Boolean(child.geometry.attributes.color);
      const geom = child.geometry.clone();
      geom.applyMatrix4(child.matrixWorld);
      const isGlow = matName.startsWith('glow_warm') || matName.startsWith('window_leaded');
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
