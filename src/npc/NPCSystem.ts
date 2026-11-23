import * as THREE from 'three';
import type { Vec3, ZoneId } from '../core/types';
import npcsData from '../data/npcs.json';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { InteractableRegistry } from '../world/InteractableRegistry';
import { getTerrainHeight } from '../world/TerrainGenerator';

export interface NPCDefinition {
  id: string;
  name: string;
  title: string;
  zone: ZoneId;
  position: Vec3;
  yaw: number;
  robeColor: string;
  accentColor: string;
  hasStaff: boolean;
  shopInventory?: string[];
  dialogueId: string;
}

export interface NPCInstance {
  def: NPCDefinition;
  group: THREE.Group;
  phase: number;
}

export class NPCSystem {
  private readonly npcMap = new Map<string, NPCDefinition>();
  readonly instances: NPCInstance[] = [];

  constructor() {
    for (const raw of npcsData.npcs) {
      this.npcMap.set(raw.id, raw as NPCDefinition);
    }
  }

  getDefinition(npcId: string): NPCDefinition | undefined {
    return this.npcMap.get(npcId);
  }

  getAllDefinitions(): NPCDefinition[] {
    return [...this.npcMap.values()];
  }

  spawnAll(
    overworldParent: THREE.Group,
    physics: PhysicsWorld | null,
    registry: InteractableRegistry,
    onTalk: (npcId: string) => void,
  ): void {
    let idx = 0;
    for (const def of this.npcMap.values()) {
      const groundY =
        def.zone === 'overworld' && def.position.y === 0
          ? getTerrainHeight(def.position.x, def.position.z)
          : def.position.y;
      const pos: Vec3 = { x: def.position.x, y: groundY, z: def.position.z };

      const group = this.buildNPCMesh(def, pos);
      overworldParent.add(group);
      physics?.addStaticCylinder(0.9, 0.42, { x: pos.x, y: pos.y + 0.9, z: pos.z });

      registry.register({
        id: `npc:${def.id}`,
        kind: 'npc',
        label: `与 ${def.name} (${def.title}) 对话`,
        zone: def.zone,
        position: pos,
        radius: 3.6,
        enabled: true,
        mesh: group,
        onInteract: () => onTalk(def.id),
      });

      this.instances.push({ def, group, phase: idx * 1.4 });
      idx++;
    }
  }

  private buildNPCMesh(def: NPCDefinition, pos: Vec3): THREE.Group {
    const group = new THREE.Group();
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = def.yaw;
    group.name = `NPC_${def.id}`;

    const body = new THREE.Group();
    body.name = 'NPCBody';
    group.add(body);

    const robeMat = new THREE.MeshStandardMaterial({ color: def.robeColor, roughness: 0.85 });
    const accentMat = new THREE.MeshStandardMaterial({ color: def.accentColor, roughness: 0.58 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x452d1b, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9af8a, roughness: 0.72 });
    const hairMat = new THREE.MeshStandardMaterial({
      color: def.id === 'elder_aldrin' ? 0xd8d8d6 : def.id === 'hunter_lyra' ? 0x4a2c18 : 0x352e2a,
      roughness: 0.88,
    });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x8d96a1, metalness: 0.8, roughness: 0.35 });

    // Boots & Legs
    for (const sx of [-0.13, 0.13]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.24), leatherMat);
      boot.position.set(sx, 0.12, 0.03);
      boot.castShadow = true;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.56, 8), leatherMat);
      leg.position.set(sx, 0.5, 0);
      body.add(boot, leg);
    }

    // Tunic / Lower Coat
    if (def.id === 'elder_aldrin') {
      const robeSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, 0.78, 10), robeMat);
      robeSkirt.position.y = 0.48;
      robeSkirt.castShadow = true;
      body.add(robeSkirt);
    } else {
      const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.42, 10), robeMat);
      coat.position.y = 0.74;
      coat.castShadow = true;
      body.add(coat);
    }

    // Layered Torso, Leather Belt & Shoulder Mantle
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), robeMat);
    torso.position.y = 1.18;
    torso.castShadow = true;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.1, 0.31), leatherMat);
    belt.position.y = 0.92;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.04), accentMat);
    buckle.position.set(0, 0.92, 0.16);
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.37, 0.22, 10), accentMat);
    mantle.position.y = 1.44;
    body.add(torso, belt, buckle, mantle);

    // Flowing Back Cloak
    const cloak = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.95, 0.06),
      def.id === 'hunter_lyra' ? robeMat : accentMat,
    );
    cloak.position.set(0, 1.0, -0.17);
    cloak.rotation.x = 0.08;
    cloak.castShadow = true;
    body.add(cloak);

    // Neck, Head, Nose, Eyes & Hair
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 8), skinMat);
    neck.position.y = 1.54;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skinMat);
    head.scale.set(0.92, 1.05, 0.98);
    head.position.y = 1.72;
    head.castShadow = true;
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hairMat,
    );
    hair.position.y = 1.75;
    hair.rotation.x = -0.12;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x26211c });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.03), eyeMat);
    eyeL.position.set(-0.065, 1.74, 0.185);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.065;
    body.add(neck, head, hair, eyeL, eyeR);

    // Arms & Hands
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), accentMat);
      shoulder.position.set(side * 0.31, 1.44, 0);
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.44, 8), robeMat);
      upperArm.position.set(side * 0.34, 1.2, 0);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
      hand.position.set(side * 0.34, 0.94, 0.03);
      body.add(shoulder, upperArm, hand);
    }

    // Distinct Role Features
    if (def.id === 'elder_aldrin') {
      const beard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.12), hairMat);
      beard.position.set(0, 1.48, 0.12);
      beard.rotation.x = -0.1;
      const beardTip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.1), hairMat);
      beardTip.position.set(0, 1.32, 0.13);
      const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.06), hairMat);
      mustache.position.set(0, 1.63, 0.175);

      // Ornate Lantern Staff
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.98, 8), leatherMat);
      staff.position.set(0.42, 0.99, 0.14);
      const crook = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12, Math.PI * 1.4), accentMat);
      crook.position.set(0.42, 2.04, 0.14);
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08, 0),
        new THREE.MeshStandardMaterial({ color: 0xffe4a0, emissive: 0xd99b26, emissiveIntensity: 1.4 }),
      );
      gem.position.set(0.42, 2.02, 0.14);
      body.add(beard, beardTip, mustache, staff, crook, gem);
    } else if (def.id === 'merchant_garrick') {
      // Leather blacksmith apron + forged hammer
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.06), leatherMat);
      apron.position.set(0, 0.88, 0.17);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.56, 6), leatherMat);
      handle.position.set(0.36, 0.96, 0.24);
      handle.rotation.x = Math.PI / 3;
      const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.26), steelMat);
      hammerHead.position.set(0.36, 1.12, 0.44);
      body.add(apron, handle, hammerHead);
    } else if (def.id === 'hunter_lyra') {
      // Ranger Hood, Quiver & Longbow slung on back
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, 8), robeMat);
      hood.position.set(0, 1.88, -0.04);
      hood.rotation.x = -0.35;
      const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8), leatherMat);
      quiver.position.set(-0.15, 1.24, -0.22);
      quiver.rotation.z = -0.3;
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.026, 6, 14, Math.PI * 1.15), leatherMat);
      bow.position.set(0.05, 1.22, -0.24);
      bow.rotation.z = -Math.PI / 3;
      body.add(hood, quiver, bow);
    }

    parentRef(group);
    return group;
  }

  update(elapsed: number): void {
    for (const npc of this.instances) {
      const body = npc.group.getObjectByName('NPCBody');
      if (body) {
        body.position.y = Math.sin(elapsed * 1.9 + npc.phase) * 0.015;
        body.rotation.y = Math.sin(elapsed * 0.7 + npc.phase) * 0.04;
      }
    }
  }
}

function parentRef(_group: THREE.Group): void {
  // Placeholder hook kept minimal; NPC prompt shows cleanly when approached
}
