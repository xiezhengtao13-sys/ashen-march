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

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x32353b, roughness: 0.55, metalness: 0.75 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x522112,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.85,
    roughness: 0.9,
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: new THREE.Color(color),
    emissiveIntensity: 2.3,
    roughness: 0.25,
    transparent: true,
    opacity: 0.92,
  });

  // Plinth & fluted iron pedestal
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.2, 8), ironMat);
  foot.position.y = 0.1;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 1.15, 8), ironMat);
  post.position.y = 0.75;
  post.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 12), ironMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.48;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.18, 0.32, 8), ironMat);
  bowl.position.y = 1.36;
  bowl.castShadow = true;
  const coals = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), emberMat);
  coals.position.y = 1.44;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.56, 7), flameMat);
  flame.position.y = 1.76;

  const light = new THREE.PointLight(color, intensity, distance, 1.6);
  light.position.y = 2.05;

  group.add(foot, post, bowl, ring, coals, flame, light);
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
    color: isRare ? 0x3b2a47 : 0x5c3c24,
    roughness: 0.82,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: isRare ? 0xc79e4f : 0x6f7680,
    roughness: 0.38,
    metalness: 0.82,
  });

  // Main chest body
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.52, 0.72), woodMat);
  base.position.y = 0.26;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Domed barrel-vaulted lid pivot
  const lidGroup = new THREE.Group();
  lidGroup.position.set(0, 0.52, -0.34);
  lidGroup.name = 'ChestLid';

  const lidBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.37, 0.37, 1.14, 12, 1, false, 0, Math.PI),
    woodMat,
  );
  lidBody.rotation.z = Math.PI / 2;
  lidBody.rotation.y = Math.PI / 2;
  lidBody.position.set(0, 0, 0.34);
  lidBody.castShadow = true;
  lidGroup.add(lidBody);

  for (const bx of [-0.42, 0, 0.42]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.54, 0.76), trimMat);
    strap.position.set(bx, 0.27, 0);
    group.add(strap);

    const lidStrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.385, 0.385, 0.08, 12, 1, false, 0, Math.PI),
      trimMat,
    );
    lidStrap.rotation.z = Math.PI / 2;
    lidStrap.rotation.y = Math.PI / 2;
    lidStrap.position.set(bx, 0, 0.34);
    lidGroup.add(lidStrap);
  }

  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.08), trimMat);
  clasp.position.set(0, 0.46, 0.38);
  group.add(clasp, lidGroup);

  const alreadyOpened = state.isChestOpened(id);
  if (alreadyOpened) {
    lidGroup.rotation.x = -0.88;
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
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x4f945a,
      emissive: 0x204d28,
      emissiveIntensity: 0.22,
      roughness: 0.65,
    });
    const budMat = new THREE.MeshStandardMaterial({
      color: 0xe69f4c,
      emissive: 0xb85a1c,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.48, 5), leafMat);
      const angle = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 0.14, 0.24, Math.sin(angle) * 0.14);
      leaf.rotation.z = Math.cos(angle) * 0.45;
      leaf.rotation.x = Math.sin(angle) * 0.45;
      group.add(leaf);
    }
    const bud = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), budMat);
    bud.position.y = 0.48;
    group.add(bud);
  } else if (kind === 'journal') {
    const bookMat = new THREE.MeshStandardMaterial({
      color: 0x6b3a24,
      emissive: 0x3b1f0d,
      emissiveIntensity: 0.25,
      roughness: 0.6,
    });
    const pageMat = new THREE.MeshStandardMaterial({ color: 0xe8d8b5, roughness: 0.85 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a359, metalness: 0.8, roughness: 0.35 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.38), bookMat);
    cover.position.y = 0.06;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.34), pageMat);
    pages.position.y = 0.07;
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.05), brassMat);
    clasp.position.set(0, 0.07, 0.19);
    group.add(cover, pages, clasp);
  } else {
    const leatherMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.16,
      roughness: 0.72,
    });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xc9a359, metalness: 0.7, roughness: 0.4 });
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), leatherMat);
    bag.scale.set(1, 0.88, 1);
    bag.position.y = 0.2;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.14, 8), leatherMat);
    neck.position.y = 0.38;
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 10), tieMat);
    cord.rotation.x = Math.PI / 2;
    cord.position.y = 0.34;
    group.add(bag, neck, cord);
  }

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
