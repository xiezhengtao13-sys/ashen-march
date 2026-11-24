import * as THREE from 'three';
import type { Vec3, ZoneId } from '../core/types';
import npcsData from '../data/npcs.json';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { InteractableRegistry } from '../world/InteractableRegistry';
import { getCityGroundHeight } from '../world/city/CityGroundBuilder';
import { getTerrainHeight } from '../world/TerrainGenerator';

export type NPCBehaviorKind =
  | 'idle'
  | 'guard_stand'
  | 'patrol'
  | 'stroll'
  | 'smith_hammer'
  | 'carpenter_work'
  | 'merchant_tend'
  | 'tavern_tend'
  | 'scholar_read'
  | 'noble_stand';

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
  behavior?: NPCBehaviorKind;
  waypoints?: Vec3[];
  dialogueId: string;
}

export interface NPCInstance {
  def: NPCDefinition;
  group: THREE.Group;
  rightArmPivot: THREE.Group;
  phase: number;
  waypointIndex: number;
  waypointDir: 1 | -1;
  pauseTimer: number;
  interactableId: string;
}

export class NPCSystem {
  private readonly npcMap = new Map<string, NPCDefinition>();
  readonly instances: NPCInstance[] = [];
  private registryRef: InteractableRegistry | null = null;
  private lastElapsed = 0;

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
    cityParent?: THREE.Group,
  ): void {
    this.registryRef = registry;
    let idx = 0;
    for (const def of this.npcMap.values()) {
      if (def.zone === 'ashenhold_city' && !cityParent) {
        continue;
      }

      const targetParent = def.zone === 'ashenhold_city' && cityParent ? cityParent : overworldParent;
      const groundY =
        def.zone === 'ashenhold_city' && def.position.y === 0
          ? getCityGroundHeight(def.position.x, def.position.z)
          : def.zone === 'overworld' && def.position.y === 0
            ? getTerrainHeight(def.position.x, def.position.z)
            : def.position.y;
      const pos: Vec3 = { x: def.position.x, y: groundY, z: def.position.z };

      const { group, rightArmPivot } = this.buildNPCMesh(def, pos);
      targetParent.add(group);

      // Moving patrol/stroll NPCs omit static physics cylinders so they never block narrow city alleys!
      const isMobile = Boolean(def.waypoints && def.waypoints.length >= 2);
      if (!isMobile) {
        physics?.addStaticCylinder(0.9, 0.42, { x: pos.x, y: pos.y + 0.9, z: pos.z }, def.zone);
      }

      const interactableId = `npc:${def.id}`;
      registry.register({
        id: interactableId,
        kind: 'npc',
        label: `与 ${def.name} (${def.title}) 对话`,
        zone: def.zone,
        position: { ...pos },
        radius: 3.6,
        enabled: true,
        mesh: group,
        onInteract: () => onTalk(def.id),
      });

      this.instances.push({
        def,
        group,
        rightArmPivot,
        phase: idx * 1.4,
        waypointIndex: 0,
        waypointDir: 1,
        pauseTimer: 0,
        interactableId,
      });
      idx++;
    }
  }

  private buildNPCMesh(def: NPCDefinition, pos: Vec3): { group: THREE.Group; rightArmPivot: THREE.Group } {
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
      color:
        def.id === 'elder_aldrin' || def.id === 'city_archivist_theron'
          ? 0xd8d8d6
          : def.id === 'hunter_lyra'
            ? 0x4a2c18
            : 0x352e2a,
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
    if (def.id === 'elder_aldrin' || def.id === 'city_archivist_theron' || def.id === 'city_lord_steward') {
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

    // Neck, Head, Eyes & Hair
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

    // Left Arm + Articulated Right Arm Pivot (for blacksmith hammering, sawing & merchant gestures!)
    const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), accentMat);
    leftShoulder.position.set(-0.31, 1.44, 0);
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.44, 8), robeMat);
    leftArm.position.set(-0.34, 1.2, 0);
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
    leftHand.position.set(-0.34, 0.94, 0.03);
    body.add(leftShoulder, leftArm, leftHand);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.32, 1.44, 0);
    const rightShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), accentMat);
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.075, 0.44, 8), robeMat);
    rightArm.position.set(0.02, -0.24, 0);
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
    rightHand.position.set(0.02, -0.50, 0.03);
    rightArmPivot.add(rightShoulder, rightArm, rightHand);
    body.add(rightArmPivot);

    // Distinct Role Features
    if (def.id === 'elder_aldrin' || def.id === 'city_archivist_theron') {
      const beard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.30, 0.12), hairMat);
      beard.position.set(0, 1.48, 0.12);
      beard.rotation.x = -0.1;
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.98, 8), leatherMat);
      staff.position.set(0.42, 0.99, 0.14);
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08, 0),
        new THREE.MeshStandardMaterial({ color: 0xffe4a0, emissive: 0xd99b26, emissiveIntensity: 1.4 }),
      );
      gem.position.set(0.42, 2.02, 0.14);
      body.add(beard, staff, gem);
    } else if (def.id === 'merchant_garrick' || def.behavior === 'smith_hammer' || def.behavior === 'carpenter_work') {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.06), leatherMat);
      apron.position.set(0, 0.88, 0.17);
      body.add(apron);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.52, 6), leatherMat);
      handle.position.set(0.02, -0.46, 0.22);
      handle.rotation.x = Math.PI / 2.6;
      const hammerHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.25),
        def.behavior === 'carpenter_work' ? leatherMat : steelMat,
      );
      hammerHead.position.set(0.02, -0.34, 0.42);
      rightArmPivot.add(handle, hammerHead);
    } else if (def.id === 'hunter_lyra') {
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
    } else if (def.behavior === 'guard_stand' || def.behavior === 'patrol') {
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), steelMat);
      helm.position.set(0, 1.78, 0);
      const helmBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.04, 12), steelMat);
      helmBrim.position.set(0, 1.78, 0);
      const cuirass = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.58, 0.32), steelMat);
      cuirass.position.set(0, 1.20, 0);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 2.35, 8), leatherMat);
      pole.position.set(0.42, 1.18, 0.14);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.18), steelMat);
      blade.position.set(0.42, 2.24, 0.20);
      const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.24, 4), steelMat);
      spearTip.position.set(0.42, 2.46, 0.14);
      body.add(helm, helmBrim, cuirass, pole, blade, spearTip);
    } else if (def.id === 'city_merchant_elena' || def.id === 'city_apothecary_lian') {
      const shawl = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.38, 0.26, 10), accentMat);
      shawl.position.y = 1.42;
      const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.22), leatherMat);
      satchel.position.set(-0.26, 0.92, 0.12);
      body.add(shawl, satchel);
    }

    return { group, rightArmPivot };
  }

  update(elapsed: number, playerPos?: Vec3, timeOfDay = 13.0): void {
    const dt = Math.min(0.05, Math.max(0, elapsed - this.lastElapsed));
    this.lastElapsed = elapsed;
    const isDay = timeOfDay >= 6.0 && timeOfDay <= 20.5;

    for (const npc of this.instances) {
      if (!npc.group.visible) continue;

      const body = npc.group.getObjectByName('NPCBody');
      const beh = npc.def.behavior ?? 'idle';

      // 1. Waypoint Patrol / Stroll with automatic alley yield near player
      if (npc.def.waypoints && npc.def.waypoints.length >= 2 && dt > 0) {
        const curPos = npc.group.position;
        const nearPlayer =
          playerPos &&
          npc.def.zone === 'ashenhold_city' &&
          Math.hypot(playerPos.x - curPos.x, playerPos.z - curPos.z) < 2.5 &&
          Math.abs(playerPos.y - curPos.y) < 2.4;

        if (nearPlayer && playerPos) {
          // Yield smoothly & face toward approaching player without blocking alley
          const targetYaw = Math.atan2(playerPos.x - curPos.x, playerPos.z - curPos.z);
          npc.group.rotation.y = targetYaw;
          if (body) body.position.y = Math.sin(elapsed * 2.0 + npc.phase) * 0.015;
        } else if (npc.pauseTimer > 0) {
          npc.pauseTimer -= dt;
          if (body) body.position.y = Math.sin(elapsed * 2.0 + npc.phase) * 0.015;
        } else {
          const wp = npc.def.waypoints[npc.waypointIndex];
          const dx = wp.x - curPos.x;
          const dz = wp.z - curPos.z;
          const dist = Math.hypot(dx, dz);
          const speed = beh === 'patrol' ? 1.35 : 1.05;
          if (dist < 0.18) {
            npc.pauseTimer = 1.4;
            const next = npc.waypointIndex + npc.waypointDir;
            if (next >= npc.def.waypoints.length || next < 0) {
              npc.waypointDir = (npc.waypointDir * -1) as 1 | -1;
            }
            npc.waypointIndex = Math.max(0, Math.min(npc.def.waypoints.length - 1, npc.waypointIndex + npc.waypointDir));
          } else {
            const step = Math.min(dist, speed * dt);
            curPos.x += (dx / dist) * step;
            curPos.z += (dz / dist) * step;
            curPos.y = wp.y > 0.05 ? wp.y : getCityGroundHeight(curPos.x, curPos.z);
            npc.group.rotation.y = Math.atan2(dx, dz);
            if (body) {
              body.position.y = Math.abs(Math.sin(elapsed * 7.2 + npc.phase)) * 0.045;
              body.rotation.z = Math.sin(elapsed * 7.2 + npc.phase) * 0.03;
            }
            const inter = this.registryRef?.get(npc.interactableId);
            if (inter) {
              inter.position.x = curPos.x;
              inter.position.y = curPos.y;
              inter.position.z = curPos.z;
            }
          }
        }
        continue;
      }

      // 2. Stationary Working / Tending Animations
      if (body) {
        body.position.y = Math.sin(elapsed * 1.9 + npc.phase) * 0.015;
        body.rotation.y = Math.sin(elapsed * 0.7 + npc.phase) * 0.04;
      }
      if (beh === 'smith_hammer' && isDay) {
        const swing = Math.sin(elapsed * 4.2 + npc.phase);
        npc.rightArmPivot.rotation.x = -0.65 + Math.pow(Math.max(0, swing), 2) * 1.05;
      } else if (beh === 'carpenter_work' && isDay) {
        npc.rightArmPivot.rotation.x = -0.55 + Math.sin(elapsed * 5.0 + npc.phase) * 0.38;
      } else if (beh === 'merchant_tend' || beh === 'tavern_tend') {
        npc.rightArmPivot.rotation.x = -0.18 + Math.sin(elapsed * 1.6 + npc.phase) * 0.14;
      } else {
        npc.rightArmPivot.rotation.x = 0;
      }
    }
  }
}
