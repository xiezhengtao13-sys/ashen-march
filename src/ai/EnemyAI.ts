import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import type { GameState } from '../core/GameState';
import type { Vec3, ZoneId } from '../core/types';
import enemiesData from '../data/enemies.json';
import type { InventorySystem } from '../inventory/InventorySystem';
import { getTerrainHeight } from '../world/TerrainGenerator';

export type EnemyAIState = 'IDLE' | 'PATROL' | 'DETECT' | 'CHASE' | 'ATTACK' | 'HURT' | 'DEAD';

export interface EnemyArchetype {
  id: string;
  name: string;
  nameEn: string;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  goldMin: number;
  goldMax: number;
  moveSpeed: number;
  detectRange: number;
  attackRange: number;
  attackCooldown: number;
  scale: number;
  bodyColor: string;
  accentColor: string;
  isBoss: boolean;
  drops: Array<{ itemId: string; chance: number; quantity: number }>;
}

export interface EnemyInstance {
  id: string;
  archetype: EnemyArchetype;
  zone: ZoneId;
  unique: boolean;
  homePos: Vec3;
  patrolPos: Vec3;
  position: Vec3;
  yaw: number;
  hp: number;
  maxHp: number;
  aiState: EnemyAIState;
  stateTimer: number;
  attackCooldownTimer: number;
  hurtFlashTimer: number;
  patrolForward: boolean;
  rootGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  alertIndicator: THREE.Mesh;
  mixer: THREE.AnimationMixer;
  actions: Record<'idle' | 'walk' | 'attack' | 'hurt' | 'death', THREE.AnimationAction>;
  activeAction: 'idle' | 'walk' | 'attack' | 'hurt' | 'death';
  bodyMaterials: THREE.MeshStandardMaterial[];
}

export interface EnemyHitPlayerEvent {
  enemyName: string;
  damage: number;
}

export class EnemySystem {
  private readonly archetypes = new Map<string, EnemyArchetype>();
  readonly enemies: EnemyInstance[] = [];
  private readonly state: GameState;
  private readonly inventory: InventorySystem;
  private readonly rng = new SeededRandom(994411);

  constructor(state: GameState, inventory: InventorySystem) {
    this.state = state;
    this.inventory = inventory;
    for (const raw of enemiesData.archetypes) {
      this.archetypes.set(raw.id, raw as EnemyArchetype);
    }
  }

  spawnAll(overworldParent: THREE.Group, cryptParent: THREE.Group): void {
    for (const spawn of enemiesData.spawns) {
      const archetype = this.archetypes.get(spawn.archetypeId);
      if (!archetype) continue;

      const zone = spawn.zone as ZoneId;
      const y =
        zone === 'overworld' && spawn.position.y === 0
          ? getTerrainHeight(spawn.position.x, spawn.position.z)
          : spawn.position.y;
      const py =
        zone === 'overworld'
          ? getTerrainHeight(spawn.patrolOffset.x, spawn.patrolOffset.z)
          : spawn.position.y;

      const homePos: Vec3 = { x: spawn.position.x, y, z: spawn.position.z };
      const patrolPos: Vec3 = { x: spawn.patrolOffset.x, y: py, z: spawn.patrolOffset.z };
      const parent = zone === 'ancient_crypt' ? cryptParent : overworldParent;

      const instance = this.createEnemyInstance(spawn.id, archetype, zone, spawn.unique, homePos, patrolPos, parent);

      if (this.state.isEnemyDefeated(spawn.id)) {
        this.setInstantDead(instance);
      }

      this.enemies.push(instance);
    }
  }

  private createEnemyInstance(
    id: string,
    archetype: EnemyArchetype,
    zone: ZoneId,
    unique: boolean,
    homePos: Vec3,
    patrolPos: Vec3,
    parent: THREE.Group,
  ): EnemyInstance {
    const rootGroup = new THREE.Group();
    rootGroup.position.set(homePos.x, homePos.y, homePos.z);
    rootGroup.name = `Enemy_${id}`;

    const bodyMaterials: THREE.MeshStandardMaterial[] = [];
    const mainMat = new THREE.MeshStandardMaterial({ color: archetype.bodyColor, roughness: 0.72 });
    const accentMat = new THREE.MeshStandardMaterial({ color: archetype.accentColor, roughness: 0.62 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x452f1e, roughness: 0.85 });
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x8f99a6, metalness: 0.82, roughness: 0.32 });
    bodyMaterials.push(mainMat, accentMat);

    const rig = new THREE.Group();
    rig.name = 'Rig';
    rig.scale.setScalar(archetype.scale);
    rootGroup.add(rig);

    const eyeColor = archetype.isBoss ? 0x53e3ff : archetype.id === 'skeleton_warrior' ? 0xff453a : 0xffd60a;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });

    const leftLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.09, 0.68, 8),
      archetype.id === 'skeleton_warrior' ? mainMat : leatherMat,
    );
    leftLeg.name = 'LeftLeg';
    leftLeg.position.set(-0.17, 0.34, 0);
    leftLeg.castShadow = true;

    const rightLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.09, 0.68, 8),
      archetype.id === 'skeleton_warrior' ? mainMat : leatherMat,
    );
    rightLeg.name = 'RightLeg';
    rightLeg.position.set(0.17, 0.34, 0);
    rightLeg.castShadow = true;
    rig.add(leftLeg, rightLeg);

    const rightArm = new THREE.Group();
    rightArm.name = 'RightArm';
    rightArm.position.set(0.42, 1.38, 0);

    const leftArm = new THREE.Group();
    leftArm.name = 'LeftArm';
    leftArm.position.set(-0.42, 1.38, 0);

    if (archetype.id === 'goblin_raider') {
      // Hunched muscular torso + strapped leather armor
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), accentMat);
      torso.position.y = 1.04;
      torso.rotation.x = 0.15;
      torso.castShadow = true;
      const harness = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.36), leatherMat);
      harness.position.y = 0.85;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mainMat);
      head.scale.set(1.05, 0.95, 1.1);
      head.position.set(0, 1.62, 0.08);
      head.castShadow = true;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), mainMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 1.6, 0.28);
      const earGeo = new THREE.ConeGeometry(0.08, 0.34, 5);
      const earL = new THREE.Mesh(earGeo, mainMat);
      earL.position.set(-0.28, 1.68, 0.04);
      earL.rotation.z = 1.15;
      const earR = new THREE.Mesh(earGeo, mainMat);
      earR.position.set(0.28, 1.68, 0.04);
      earR.rotation.z = -1.15;
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.04), eyeMat);
      eyeL.position.set(-0.09, 1.66, 0.27);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.09;
      rig.add(torso, harness, head, nose, earL, earR, eyeL, eyeR);

      // Cleaver & wooden buckler
      const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.56, 7), mainMat);
      rArmMesh.position.y = -0.24;
      const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.03), weaponMat);
      cleaver.position.set(0, -0.45, 0.28);
      cleaver.rotation.x = Math.PI / 2.2;
      rightArm.add(rArmMesh, cleaver);

      const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.56, 7), mainMat);
      lArmMesh.position.y = -0.24;
      const buckler = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10), leatherMat);
      buckler.rotation.z = Math.PI / 2;
      buckler.position.set(-0.12, -0.32, 0.14);
      leftArm.add(lArmMesh, buckler);
    } else if (archetype.id === 'skeleton_warrior') {
      // Anatomical spine, ribcage, pelvis & skull
      const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.24), mainMat);
      pelvis.position.y = 0.72;
      const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.72, 6), mainMat);
      spine.position.y = 1.1;
      rig.add(pelvis, spine);

      for (const ry of [1.0, 1.14, 1.28, 1.4]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.032, 5, 10), mainMat);
        rib.rotation.x = Math.PI / 2;
        rib.scale.set(1.2, 0.72, 1);
        rib.position.y = ry;
        rig.add(rib);
      }

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), mainMat);
      skull.position.y = 1.72;
      skull.castShadow = true;
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.2), mainMat);
      jaw.position.set(0, 1.56, 0.06);
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), eyeMat);
      eyeL.position.set(-0.07, 1.74, 0.17);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.07;
      rig.add(skull, jaw, eyeL, eyeR);

      const rBone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.58, 6), mainMat);
      rBone.position.y = -0.24;
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.84, 0.03), weaponMat);
      sword.position.set(0, -0.5, 0.36);
      sword.rotation.x = Math.PI / 2.2;
      rightArm.add(rBone, sword);

      const lBone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.58, 6), mainMat);
      lBone.position.y = -0.24;
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 12), accentMat);
      shield.rotation.z = Math.PI / 2;
      shield.position.set(-0.14, -0.32, 0.12);
      leftArm.add(lBone, shield);
    } else {
      // Crypt Guardian Boss: Heavy Plate Armor, Shoulder Pauldrons, Cape, Horned Helm & Runic Greatsword
      const cuirass = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.88, 0.42), mainMat);
      cuirass.position.y = 1.14;
      cuirass.castShadow = true;
      const runeCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.13, 0),
        new THREE.MeshStandardMaterial({ color: 0x6ce5ff, emissive: 0x2ca8e0, emissiveIntensity: 1.6 }),
      );
      runeCore.position.set(0, 1.24, 0.22);
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.25, 0.06), new THREE.MeshStandardMaterial({ color: 0x1e2430 }));
      cape.position.set(0, 0.96, -0.24);
      cape.rotation.x = 0.1;
      const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.44, 10), mainMat);
      helm.position.y = 1.82;
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.38), accentMat);
      crest.position.y = 2.08;
      const hornGeo = new THREE.ConeGeometry(0.07, 0.44, 6);
      const hornL = new THREE.Mesh(hornGeo, accentMat);
      hornL.position.set(-0.22, 2.06, 0);
      hornL.rotation.z = 0.4;
      const hornR = new THREE.Mesh(hornGeo, accentMat);
      hornR.position.set(0.22, 2.06, 0);
      hornR.rotation.z = -0.4;
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.05), eyeMat);
      eyeL.position.set(-0.09, 1.84, 0.22);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.09;
      rig.add(cuirass, runeCore, cape, helm, crest, hornL, hornR, eyeL, eyeR);

      const pauldronR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mainMat);
      const rPlateArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.64, 0.22), mainMat);
      rPlateArm.position.y = -0.26;
      const runeblade = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.28, 0.04),
        new THREE.MeshStandardMaterial({
          color: 0xb0d8f0,
          emissive: 0x2c8bb8,
          emissiveIntensity: 0.65,
          metalness: 0.85,
          roughness: 0.25,
        }),
      );
      runeblade.position.set(0, -0.54, 0.48);
      runeblade.rotation.x = Math.PI / 2.2;
      rightArm.add(pauldronR, rPlateArm, runeblade);

      const pauldronL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mainMat);
      const lPlateArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.64, 0.22), mainMat);
      lPlateArm.position.y = -0.26;
      const towerShield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.92, 0.52), mainMat);
      towerShield.position.set(-0.14, -0.32, 0.14);
      leftArm.add(pauldronL, lPlateArm, towerShield);
    }

    rig.add(rightArm, leftArm);

    // Floating HP bar above head
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.11),
      new THREE.MeshBasicMaterial({ color: 0x121318, side: THREE.DoubleSide }),
    );
    hpBg.position.set(0, 2.38 * archetype.scale, 0);
    rootGroup.add(hpBg);

    const hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.07),
      new THREE.MeshBasicMaterial({ color: archetype.isBoss ? 0xb55ce6 : 0xb83535, side: THREE.DoubleSide }),
    );
    hpBarFill.position.set(0, 2.38 * archetype.scale, 0.01);
    rootGroup.add(hpBarFill);

    const alertIndicator = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: 0xebc254 }),
    );
    alertIndicator.position.set(0, 2.75 * archetype.scale, 0);
    alertIndicator.visible = false;
    rootGroup.add(alertIndicator);

    parent.add(rootGroup);

    // AnimationMixer clips
    const mixer = new THREE.AnimationMixer(rig);
    const idleAction = mixer.clipAction(
      new THREE.AnimationClip('idle', 1.6, [
        new THREE.VectorKeyframeTrack('Rig.position', [0, 0.8, 1.6], [0, 0, 0, 0, 0.035, 0, 0, 0, 0]),
      ]),
    );
    const walkAction = mixer.clipAction(
      new THREE.AnimationClip('walk', 0.6, [
        new THREE.VectorKeyframeTrack(
          'LeftLeg.position',
          [0, 0.15, 0.3, 0.45, 0.6],
          [-0.17, 0.34, 0, -0.17, 0.42, 0.16, -0.17, 0.34, 0, -0.17, 0.34, -0.14, -0.17, 0.34, 0],
        ),
        new THREE.VectorKeyframeTrack(
          'RightLeg.position',
          [0, 0.15, 0.3, 0.45, 0.6],
          [0.17, 0.34, 0, 0.17, 0.34, -0.14, 0.17, 0.34, 0, 0.17, 0.42, 0.16, 0.17, 0.34, 0],
        ),
      ]),
    );

    const qRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0));
    const qWind = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.1, 0, 0));
    const qStrike = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.85, 0, 0));
    const attackAction = mixer.clipAction(
      new THREE.AnimationClip('attack', 0.55, [
        new THREE.QuaternionKeyframeTrack(
          'RightArm.quaternion',
          [0, 0.2, 0.38, 0.55],
          [
            qRest.x, qRest.y, qRest.z, qRest.w,
            qWind.x, qWind.y, qWind.z, qWind.w,
            qStrike.x, qStrike.y, qStrike.z, qStrike.w,
            qRest.x, qRest.y, qRest.z, qRest.w,
          ],
        ),
      ]),
    );
    attackAction.setLoop(THREE.LoopOnce, 1);

    const hurtAction = mixer.clipAction(
      new THREE.AnimationClip('hurt', 0.28, [
        new THREE.VectorKeyframeTrack('Rig.position', [0, 0.1, 0.28], [0, 0, 0, 0, 0.08, -0.18, 0, 0, 0]),
      ]),
    );
    hurtAction.setLoop(THREE.LoopOnce, 1);

    const qFall = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const deathAction = mixer.clipAction(
      new THREE.AnimationClip('death', 0.5, [
        new THREE.QuaternionKeyframeTrack(
          'Rig.quaternion',
          [0, 0.5],
          [qRest.x, qRest.y, qRest.z, qRest.w, qFall.x, qFall.y, qFall.z, qFall.w],
        ),
      ]),
    );
    deathAction.setLoop(THREE.LoopOnce, 1);
    deathAction.clampWhenFinished = true;

    idleAction.play();

    return {
      id,
      archetype,
      zone,
      unique,
      homePos,
      patrolPos,
      position: { ...homePos },
      yaw: 0,
      hp: archetype.maxHp,
      maxHp: archetype.maxHp,
      aiState: 'IDLE',
      stateTimer: 1.0,
      attackCooldownTimer: 0,
      hurtFlashTimer: 0,
      patrolForward: true,
      rootGroup,
      hpBarFill,
      alertIndicator,
      mixer,
      actions: {
        idle: idleAction,
        walk: walkAction,
        attack: attackAction,
        hurt: hurtAction,
        death: deathAction,
      },
      activeAction: 'idle',
      bodyMaterials,
    };
  }

  private playClip(enemy: EnemyInstance, name: 'idle' | 'walk' | 'attack' | 'hurt' | 'death'): void {
    if (enemy.activeAction === name && (name === 'idle' || name === 'walk')) return;
    enemy.actions[enemy.activeAction].fadeOut(0.12);
    const next = enemy.actions[name];
    next.reset().fadeIn(0.1).play();
    enemy.activeAction = name;
  }

  private setInstantDead(enemy: EnemyInstance): void {
    enemy.hp = 0;
    enemy.aiState = 'DEAD';
    enemy.rootGroup.visible = false;
    enemy.alertIndicator.visible = false;
  }

  applySavedDefeatedIds(): void {
    for (const enemy of this.enemies) {
      if (this.state.isEnemyDefeated(enemy.id)) {
        this.setInstantDead(enemy);
      } else if (enemy.aiState === 'DEAD') {
        enemy.hp = enemy.maxHp;
        enemy.aiState = 'IDLE';
        enemy.position = { ...enemy.homePos };
        enemy.rootGroup.position.set(enemy.homePos.x, enemy.homePos.y, enemy.homePos.z);
        enemy.rootGroup.visible = true;
        this.updateHpBar(enemy);
      }
    }
  }

  resetAggro(): void {
    for (const enemy of this.enemies) {
      if (enemy.aiState === 'DEAD') continue;
      enemy.aiState = 'IDLE';
      enemy.stateTimer = 1.2;
      enemy.alertIndicator.visible = false;
      enemy.position = { ...enemy.homePos };
      enemy.rootGroup.position.set(enemy.homePos.x, enemy.homePos.y, enemy.homePos.z);
      enemy.hp = enemy.maxHp;
      this.updateHpBar(enemy);
    }
  }

  damageEnemy(enemy: EnemyInstance, rawDamage: number, knockbackDir?: Vec3): number {
    if (enemy.aiState === 'DEAD') return 0;

    const damage = Math.max(1, Math.round(rawDamage));
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hurtFlashTimer = 0.18;
    for (const mat of enemy.bodyMaterials) {
      mat.emissive.setHex(0x8a1c1c);
    }

    if (knockbackDir && enemy.hp > 0) {
      const kScale = enemy.archetype.isBoss ? 0.35 : 0.75;
      enemy.position.x += knockbackDir.x * kScale;
      enemy.position.z += knockbackDir.z * kScale;
      if (enemy.zone === 'overworld') {
        enemy.position.y = getTerrainHeight(enemy.position.x, enemy.position.z);
      }
    }

    this.updateHpBar(enemy);

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    } else {
      enemy.aiState = 'HURT';
      enemy.stateTimer = 0.25;
      enemy.alertIndicator.visible = false;
      this.playClip(enemy, 'hurt');
    }

    return damage;
  }

  private killEnemy(enemy: EnemyInstance): void {
    enemy.aiState = 'DEAD';
    enemy.stateTimer = 2.0;
    enemy.alertIndicator.visible = false;
    this.playClip(enemy, 'death');

    const gold = this.rng.int(enemy.archetype.goldMin, enemy.archetype.goldMax);
    this.state.player.stats.gold += gold;
    this.inventory.addXp(enemy.archetype.xpReward);

    for (const drop of enemy.archetype.drops) {
      if (this.rng.next() <= drop.chance) {
        this.inventory.addItem(drop.itemId, drop.quantity, enemy.id);
      }
    }

    if (enemy.unique) {
      this.state.markEnemyDefeated(enemy.id);
    }

    this.state.events.emit('enemy:killed', {
      enemyId: enemy.id,
      archetypeId: enemy.archetype.id,
      xp: enemy.archetype.xpReward,
      gold,
    });
    this.state.events.emit('hud:notify', {
      text: `击败 ${enemy.archetype.name}！+${enemy.archetype.xpReward} XP, +${gold} 金币`,
      kind: 'combat',
    });
  }

  private updateHpBar(enemy: EnemyInstance): void {
    const ratio = Math.max(0.001, enemy.hp / enemy.maxHp);
    enemy.hpBarFill.scale.x = ratio;
    enemy.hpBarFill.position.x = -(1 - ratio) * 0.47;
  }

  update(
    dt: number,
    playerPos: Vec3,
    activeZone: ZoneId,
    isPausedOrDead: boolean,
    onEnemyAttackPlayer: (event: EnemyHitPlayerEvent) => void,
  ): void {
    for (const enemy of this.enemies) {
      if (enemy.zone !== activeZone) continue;

      enemy.mixer.update(dt);

      if (enemy.hurtFlashTimer > 0) {
        enemy.hurtFlashTimer -= dt;
        if (enemy.hurtFlashTimer <= 0) {
          for (const mat of enemy.bodyMaterials) {
            mat.emissive.setHex(0x000000);
          }
        }
      }

      if (enemy.aiState === 'DEAD') {
        if (enemy.rootGroup.visible) {
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.rootGroup.visible = false;
          }
        }
        continue;
      }

      enemy.hpBarFill.parent?.children.forEach((child) => {
        if (child === enemy.hpBarFill || (child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry)) {
          child.lookAt(playerPos.x, playerPos.y + 1.65, playerPos.z);
        }
      });

      if (isPausedOrDead) continue;

      if (enemy.attackCooldownTimer > 0) {
        enemy.attackCooldownTimer -= dt;
      }

      const dx = playerPos.x - enemy.position.x;
      const dz = playerPos.z - enemy.position.z;
      const distToPlayer = Math.hypot(dx, dz);
      const distFromHome = Math.hypot(enemy.position.x - enemy.homePos.x, enemy.position.z - enemy.homePos.z);

      switch (enemy.aiState) {
        case 'IDLE': {
          this.playClip(enemy, 'idle');
          enemy.stateTimer -= dt;
          if (distToPlayer <= enemy.archetype.detectRange) {
            enemy.aiState = 'DETECT';
            enemy.stateTimer = 0.35;
            enemy.alertIndicator.visible = true;
          } else if (enemy.stateTimer <= 0) {
            enemy.aiState = 'PATROL';
            enemy.stateTimer = 3.5;
          }
          break;
        }
        case 'PATROL': {
          this.playClip(enemy, 'walk');
          if (distToPlayer <= enemy.archetype.detectRange) {
            enemy.aiState = 'DETECT';
            enemy.stateTimer = 0.35;
            enemy.alertIndicator.visible = true;
            break;
          }
          const target = enemy.patrolForward ? enemy.patrolPos : enemy.homePos;
          const arrived = this.moveToward(enemy, target, enemy.archetype.moveSpeed * 0.55, dt);
          enemy.stateTimer -= dt;
          if (arrived || enemy.stateTimer <= 0) {
            enemy.patrolForward = !enemy.patrolForward;
            enemy.aiState = 'IDLE';
            enemy.stateTimer = 1.5;
          }
          break;
        }
        case 'DETECT': {
          enemy.yaw = Math.atan2(dx, dz);
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.alertIndicator.visible = false;
            enemy.aiState = 'CHASE';
          }
          break;
        }
        case 'CHASE': {
          this.playClip(enemy, 'walk');
          if (distFromHome > 42 || distToPlayer > enemy.archetype.detectRange * 1.8) {
            enemy.aiState = 'PATROL';
            enemy.patrolForward = false;
            enemy.stateTimer = 3.0;
            break;
          }
          if (distToPlayer <= enemy.archetype.attackRange) {
            enemy.aiState = 'ATTACK';
            enemy.stateTimer = 0.25;
            break;
          }
          this.moveToward(enemy, playerPos, enemy.archetype.moveSpeed, dt);
          break;
        }
        case 'ATTACK': {
          enemy.yaw = Math.atan2(dx, dz);
          if (distToPlayer > enemy.archetype.attackRange + 0.8) {
            enemy.aiState = 'CHASE';
            break;
          }
          if (enemy.attackCooldownTimer <= 0) {
            this.playClip(enemy, 'attack');
            enemy.attackCooldownTimer = enemy.archetype.attackCooldown;
            onEnemyAttackPlayer({
              enemyName: enemy.archetype.name,
              damage: enemy.archetype.attack,
            });
          } else {
            this.playClip(enemy, 'idle');
          }
          break;
        }
        case 'HURT': {
          enemy.stateTimer -= dt;
          if (enemy.stateTimer <= 0) {
            enemy.aiState = distToPlayer <= enemy.archetype.attackRange ? 'ATTACK' : 'CHASE';
          }
          break;
        }
      }

      enemy.rootGroup.position.set(enemy.position.x, enemy.position.y, enemy.position.z);
      enemy.rootGroup.rotation.y = enemy.yaw;
    }
  }

  private moveToward(enemy: EnemyInstance, target: Vec3, speed: number, dt: number): boolean {
    const dx = target.x - enemy.position.x;
    const dz = target.z - enemy.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.45) return true;

    const step = Math.min(dist, speed * dt);
    const nx = dx / dist;
    const nz = dz / dist;

    let nextX = enemy.position.x + nx * step;
    let nextZ = enemy.position.z + nz * step;

    if (enemy.zone === 'ancient_crypt') {
      nextX = Math.max(-16.5, Math.min(16.5, nextX));
      nextZ = Math.max(-76, Math.min(-4, nextZ));
    }

    enemy.position.x = nextX;
    enemy.position.z = nextZ;
    if (enemy.zone === 'overworld') {
      enemy.position.y = getTerrainHeight(nextX, nextZ);
    }
    enemy.yaw = Math.atan2(nx, nz);
    return false;
  }
}
