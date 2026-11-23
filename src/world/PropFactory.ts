import * as THREE from 'three';
import type { GameState } from '../core/GameState';
import type { Vec3, ZoneId } from '../core/types';
import type { InteractableRegistry } from './InteractableRegistry';

export interface FlameRef {
  light: THREE.PointLight;
  mesh: THREE.Mesh;
  baseIntensity: number;
  phase: number;
}

export interface ChestCallbacks {
  onOpenChest: (chestId: string) => void;
}

export interface PickupCallbacks {
  onCollectPickup: (pickupId: string) => void;
}

export function createTorchBrazier(
  parent: THREE.Group,
  pos: Vec3,
  flames: FlameRef[],
  options: { color?: number; intensity?: number; distance?: number; scale?: number; phase?: number } = {},
): THREE.Group {
  const {
    color = 0xff8c38,
    intensity = 2.4,
    distance = 18,
    scale = 1,
    phase = pos.x * 0.7 + pos.z * 1.3,
  } = options;

  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  group.scale.setScalar(scale);

  const standMat = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.7, metalness: 0.55 });
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x26282e, roughness: 0.6, metalness: 0.7 });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffa640,
    emissive: new THREE.Color(color),
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.35, 8), standMat);
  post.position.y = 0.675;
  post.castShadow = true;
  group.add(post);

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 8), bowlMat);
  bowl.position.y = 1.42;
  bowl.castShadow = true;
  group.add(bowl);

  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.58, 7), flameMat);
  flame.position.y = 1.78;
  group.add(flame);

  const light = new THREE.PointLight(color, intensity, distance, 1.6);
  light.position.y = 2.05;
  group.add(light);

  flames.push({ light, mesh: flame, baseIntensity: intensity, phase });
  parent.add(group);
  return group;
}

export function createChestMesh(
  parent: THREE.Group,
  id: string,
  name: string,
  zone: ZoneId,
  pos: Vec3,
  state: GameState,
  registry: InteractableRegistry,
  onOpen: () => void,
  isRare = false,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  group.name = `Chest_${id}`;

  const woodMat = new THREE.MeshStandardMaterial({
    color: isRare ? 0x3f2e4f : 0x5c3c24,
    roughness: 0.85,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: isRare ? 0xd9b166 : 0x7b828c,
    roughness: 0.45,
    metalness: 0.75,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.72), woodMat);
  base.position.y = 0.275;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.24, 0.76), woodMat);
  lid.position.set(0, 0.65, 0);
  lid.castShadow = true;
  lid.name = 'ChestLid';
  group.add(lid);

  const bandLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.78), trimMat);
  bandLeft.position.set(-0.36, 0.4, 0);
  group.add(bandLeft);

  const bandRight = bandLeft.clone();
  bandRight.position.x = 0.36;
  group.add(bandRight);

  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.08), trimMat);
  lock.position.set(0, 0.54, 0.38);
  group.add(lock);

  const alreadyOpened = state.isChestOpened(id);
  if (alreadyOpened) {
    lid.rotation.x = -0.75;
    lid.position.set(0, 0.78, -0.22);
  }

  parent.add(group);

  registry.register({
    id: `chest:${id}`,
    kind: 'chest',
    label: alreadyOpened ? `${name} (已开启)` : `开启 ${name}`,
    zone,
    position: { ...pos },
    radius: 3.4,
    enabled: !alreadyOpened,
    mesh: group,
    onInteract: onOpen,
  });

  return group;
}

export function createPickupMesh(
  parent: THREE.Group,
  id: string,
  label: string,
  zone: ZoneId,
  pos: Vec3,
  colorHex: string,
  isCollected: boolean,
  registry: InteractableRegistry,
  onCollect: () => void,
  kind: 'herb' | 'journal' | 'pouch' = 'pouch',
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  group.visible = !isCollected;
  group.name = `Pickup_${id}`;

  const color = new THREE.Color(colorHex);

  if (kind === 'herb') {
    const stemMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      roughness: 0.7,
    });
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.52, 5), stemMat);
      const angle = (i / 4) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.14, 0.25, Math.sin(angle) * 0.14);
      leaf.rotation.z = Math.cos(angle) * 0.35;
      leaf.rotation.x = Math.sin(angle) * 0.35;
      group.add(leaf);
    }
  } else if (kind === 'journal') {
    const bookMat = new THREE.MeshStandardMaterial({
      color: 0x8f5b34,
      emissive: new THREE.Color(0x6e4718),
      emissiveIntensity: 0.35,
      roughness: 0.65,
    });
    const pageMat = new THREE.MeshStandardMaterial({ color: 0xead8b5, roughness: 0.85 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.36), bookMat);
    cover.position.y = 0.06;
    group.add(cover);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.32), pageMat);
    pages.position.y = 0.09;
    group.add(pages);
  } else {
    const pouchMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.55,
    });
    const bag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), pouchMat);
    bag.position.y = 0.26;
    group.add(bag);
  }

  // Subtle beacon ring so pickups are clearly discoverable in grass
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.36, 16),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  parent.add(group);

  registry.register({
    id: `pickup:${id}`,
    kind: 'pickup',
    label: `拾取 ${label}`,
    zone,
    position: { ...pos },
    radius: 3.4,
    enabled: !isCollected,
    mesh: group,
    onInteract: onCollect,
  });

  return group;
}
