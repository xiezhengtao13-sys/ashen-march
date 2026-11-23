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
    const mainMat = new THREE.MeshStandardMaterial({ color: archetype.bodyColor, roughness: 0.78 });
    const accentMat = new THREE.MeshStandardMaterial({ color: archetype.accentColor, roughness: 0.65 });
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.75, roughness: 0.35 });
    bodyMaterials.push(mainMat, accentMat);

    const rig = new THREE.Group();
    rig.name = 'Rig';
    rig.scale.setScalar(archetype.scale);
    rootGroup.add(rig);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.85, 0.38), accentMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    rig.add(torso);

    const head = new THREE.Mesh(
      archetype.id === 'skeleton_warrior'
        ? new THREE.DodecahedronGeometry(0.24, 0)
        : new THREE.BoxGeometry(0.42, 0.42, 0.42),
      mainMat,
    );
    head.position.y = 1.78;
    head.castShadow = true;
    rig.add(head);

    // Eyes glow
    const eyeColor = archetype.isBoss ? 0x53e3ff : archetype.id === 'skeleton_warrior' ? 0xff453a : 0xffd60a;
    const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), eyeMat);
    leftEye.position.set(-0.09, 1.81, 0.21);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.09;
    rig.add(leftEye, rightEye);

    if (archetype.id === 'goblin_raider') {
      // Pointed Goblin ears
      const earGeo = new THREE.ConeGeometry(0.08, 0.28, 4);
      const earL = new THREE.Mesh(earGeo, mainMat);
      earL.position.set(-0.28, 1.82, 0);
      earL.rotation.z = 1.1;
      const earR = new THREE.Mesh(earGeo, mainMat);
      earR.position.set(0.28, 1.82, 0);
      earR.rotation.z = -1.1;
      rig.add(earL, earR);
    } else if (archetype.isBoss) {
      // Boss horned crown
      const hornGeo = new THREE.ConeGeometry(0.08, 0.42, 5);
      const hornL = new THREE.Mesh(hornGeo, accentMat);
      hornL.position.set(-0.2, 2.1, 0);
      hornL.rotation.z = 0.35;
      const hornR = new THREE.Mesh(hornGeo, accentMat);
      hornR.position.set(0.2, 2.1, 0);
      hornR.rotation.z = -0.35;
      rig.add(hornL, hornR);
    }

    const legGeo = new THREE.BoxGeometry(0.22, 0.68, 0.24);
    const leftLeg = new THREE.Mesh(legGeo, mainMat);
    leftLeg.name = 'LeftLeg';
    leftLeg.position.set(-0.18, 0.34, 0);
    leftLeg.castShadow = true;
    const rightLeg = new THREE.Mesh(legGeo, mainMat);
    rightLeg.name = 'RightLeg';
    rightLeg.position.set(0.18, 0.34, 0);
    rightLeg.castShadow = true;
    rig.add(leftLeg, rightLeg);

    const rightArm = new THREE.Group();
    rightArm.name = 'RightArm';
    rightArm.position.set(0.45, 1.42, 0);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), mainMat);
    armMesh.position.y = -0.24;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, archetype.isBoss ? 1.15 : 0.72, 0.04),
      weaponMat,
    );
    blade.position.set(0, -0.5, 0.35);
    blade.rotation.x = Math.PI / 2.2;
    rightArm.add(armMesh, blade);
    rig.add(rightArm);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.2), mainMat);
    leftArm.name = 'LeftArm';
    leftArm.position.set(-0.45, 1.18, 0);
    rig.add(leftArm);

    // Floating HP bar above head
    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x16161a, side: THREE.DoubleSide }),
    );
    hpBg.position.set(0, 2.35 * archetype.scale, 0);
    rootGroup.add(hpBg);

    const hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.08),
      new THREE.MeshBasicMaterial({ color: archetype.isBoss ? 0xd964ff : 0xd63b3b, side: THREE.DoubleSide }),
    );
    hpBarFill.position.set(0, 2.35 * archetype.scale, 0.01);
    rootGroup.add(hpBarFill);

    // Alert "!" diamond shown briefly in DETECT state
    const alertIndicator = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({ color: 0xffcc00 }),
    );
    alertIndicator.position.set(0, 2.75 * archetype.scale, 0);
    alertIndicator.visible = false;
    rootGroup.add(alertIndicator);

    parent.add(rootGroup);

    // AnimationMixer clips
    const mixer = new THREE.AnimationMixer(rig);
    const idleAction = mixer.clipAction(
      new THREE.AnimationClip('idle', 1.6, [
        new THREE.VectorKeyframeTrack('Rig.position', [0, 0.8, 1.6], [0, 0, 0, 0, 0.04, 0, 0, 0, 0]),
      ]),
    );
    const walkAction = mixer.clipAction(
      new THREE.AnimationClip('walk', 0.6, [
        new THREE.VectorKeyframeTrack('LeftLeg.position', [0, 0.15, 0.3, 0.45, 0.6], [-0.18, 0.34, 0, -0.18, 0.42, 0.16, -0.18, 0.34, 0, -0.18, 0.34, -0.14, -0.18, 0.34, 0]),
        new THREE.VectorKeyframeTrack('RightLeg.position', [0, 0.15, 0.3, 0.45, 0.6], [0.18, 0.34, 0, 0.18, 0.34, -0.14, 0.18, 0.34, 0, 0.18, 0.42, 0.16, 0.18, 0.34, 0]),
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

      // Hurt emissive flash decay
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

      // Billboard HP bar toward player
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

    // Keep dungeon enemies inside stone corridor/sanctum bounds
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
