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

    const robeMat = new THREE.MeshStandardMaterial({ color: def.robeColor, roughness: 0.85 });
    const accentMat = new THREE.MeshStandardMaterial({ color: def.accentColor, roughness: 0.55 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xdfb995, roughness: 0.75 });
    const hairMat = new THREE.MeshStandardMaterial({
      color: def.id === 'elder_aldrin' ? 0xdcdcdc : def.id === 'hunter_lyra' ? 0x4b2f1c : 0x3b3532,
      roughness: 0.9,
    });

    // Lower robe / legs
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.85, 8), robeMat);
    skirt.position.y = 0.425;
    skirt.castShadow = true;
    group.add(skirt);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), robeMat);
    torso.position.y = 1.18;
    torso.castShadow = true;
    group.add(torso);

    // Sash / Mantle
    const mantle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.38), accentMat);
    mantle.position.y = 1.44;
    group.add(mantle);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), skinMat);
    head.position.y = 1.78;
    head.castShadow = true;
    group.add(head);

    // Hair / Hood
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.235, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
    crown.position.y = 1.81;
    group.add(crown);

    if (def.id === 'elder_aldrin') {
      // Elder white beard
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 6), hairMat);
      beard.position.set(0, 1.56, 0.14);
      beard.rotation.x = Math.PI;
      group.add(beard);
    }

    // Arms
    const armGeo = new THREE.BoxGeometry(0.16, 0.56, 0.16);
    const armL = new THREE.Mesh(armGeo, robeMat);
    armL.position.set(-0.37, 1.18, 0);
    const armR = new THREE.Mesh(armGeo, robeMat);
    armR.position.set(0.37, 1.18, 0);
    group.add(armL, armR);

    if (def.hasStaff) {
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 1.95, 6),
        new THREE.MeshStandardMaterial({ color: 0x5c3c24, roughness: 0.8 }),
      );
      staff.position.set(0.45, 0.98, 0.15);
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.1, 0),
        new THREE.MeshStandardMaterial({ color: 0xf2cf88, emissive: 0xd99b26, emissiveIntensity: 1.2 }),
      );
      gem.position.set(0.45, 2.0, 0.15);
      group.add(staff, gem);
    } else if (def.id === 'merchant_garrick') {
      // Blacksmith hammer in hand
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6),
        new THREE.MeshStandardMaterial({ color: 0x4e321e }),
      );
      handle.position.set(0.39, 1.0, 0.25);
      handle.rotation.x = Math.PI / 3;
      const hammerHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.16, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x7c858f, metalness: 0.8 }),
      );
      hammerHead.position.set(0.39, 1.14, 0.45);
      group.add(handle, hammerHead);
    }

    // Subtle golden floating marker above NPC
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: 0xf2cf88 }),
    );
    marker.position.y = 2.38;
    marker.name = 'NPCMarker';
    group.add(marker);

    return group;
  }

  update(elapsed: number): void {
    for (const npc of this.instances) {
      const marker = npc.group.getObjectByName('NPCMarker');
      if (marker) {
        marker.rotation.y = elapsed * 1.4 + npc.phase;
        marker.position.y = 2.38 + Math.sin(elapsed * 2.2 + npc.phase) * 0.06;
      }
    }
  }
}
