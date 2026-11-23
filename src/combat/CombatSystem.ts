import * as THREE from 'three';
import type { GameState } from '../core/GameState';
import type { Vec3 } from '../core/types';
import type { EnemyInstance, EnemySystem } from '../ai/EnemyAI';
import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { InventorySystem } from '../inventory/InventorySystem';
import { getCityGroundHeight } from '../world/city/CityGroundBuilder';
import { getTerrainHeight } from '../world/TerrainGenerator';

export interface FireballProjectile {
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  position: Vec3;
  velocity: Vec3;
  life: number;
  damage: number;
}

export interface CombatCallbacks {
  onSwingVisual?: () => void;
  onCastVisual?: () => void;
  onHitEffect?: (pos: Vec3, damage: number, isMagic: boolean) => void;
  onExplosionEffect?: (pos: Vec3) => void;
  onPlayerDamaged?: (damage: number) => void;
  onPlayerRespawn?: () => void;
}

export class CombatSystem {
  private readonly state: GameState;
  private readonly inventory: InventorySystem;
  private readonly enemies: EnemySystem;
  private readonly scene: THREE.Scene;
  private readonly physics: PhysicsWorld | null;
  private readonly callbacks: CombatCallbacks;

  private meleeCooldown = 0;
  private spellCooldown = 0;
  readonly projectiles: FireballProjectile[] = [];

  static readonly FIREBALL_COST = 15;
  static readonly MELEE_RANGE = 3.4;
  static readonly MELEE_COOLDOWN = 0.55;
  static readonly SPELL_COOLDOWN = 0.9;

  constructor(
    state: GameState,
    inventory: InventorySystem,
    enemies: EnemySystem,
    scene: THREE.Scene,
    physics: PhysicsWorld | null,
    callbacks: CombatCallbacks = {},
  ) {
    this.state = state;
    this.inventory = inventory;
    this.enemies = enemies;
    this.scene = scene;
    this.physics = physics;
    this.callbacks = callbacks;
  }

  performMeleeAttack(eyePos: Vec3, lookDir: Vec3): EnemyInstance[] {
    if (this.meleeCooldown > 0 || this.state.isDead) return [];
    this.meleeCooldown = CombatSystem.MELEE_COOLDOWN;
    this.callbacks.onSwingVisual?.();

    const dir = new THREE.Vector3(lookDir.x, lookDir.y, lookDir.z).normalize();
    const computed = this.inventory.getComputedStats();
    const hitList: EnemyInstance[] = [];

    for (const enemy of this.enemies.enemies) {
      if (enemy.aiState === 'DEAD' || enemy.zone !== this.state.player.currentZone) continue;

      const targetCenter = new THREE.Vector3(
        enemy.position.x,
        enemy.position.y + 1.1 * enemy.archetype.scale,
        enemy.position.z,
      );
      const toEnemy = targetCenter.sub(new THREE.Vector3(eyePos.x, eyePos.y, eyePos.z));
      const dist = toEnemy.length();
      if (dist > CombatSystem.MELEE_RANGE) continue;

      const norm = toEnemy.clone().normalize();
      const dot = dir.dot(norm);
      if (dot < 0.3 && dist > 1.4) continue;

      const dmg = Math.max(1, Math.round(computed.attack - enemy.archetype.defense * 0.4));
      const dealt = this.enemies.damageEnemy(enemy, dmg, { x: norm.x, y: 0, z: norm.z });
      if (dealt > 0) {
        hitList.push(enemy);
        this.callbacks.onHitEffect?.(
          { x: enemy.position.x, y: enemy.position.y + 1.4, z: enemy.position.z },
          dealt,
          false,
        );
      }
    }

    return hitList;
  }

  castFireball(eyePos: Vec3, lookDir: Vec3): boolean {
    if (this.spellCooldown > 0 || this.state.isDead) return false;
    if (this.state.player.stats.mp < CombatSystem.FIREBALL_COST) {
      this.state.events.emit('hud:notify', { text: '法力不足，无法施放火球术！', kind: 'warning' });
      return false;
    }

    this.state.player.stats.mp -= CombatSystem.FIREBALL_COST;
    this.spellCooldown = CombatSystem.SPELL_COOLDOWN;
    this.callbacks.onCastVisual?.();

    const dir = new THREE.Vector3(lookDir.x, lookDir.y, lookDir.z).normalize();
    const computed = this.inventory.getComputedStats();
    const magicDamage = Math.round(18 + computed.magic * 1.25);

    const startPos: Vec3 = {
      x: eyePos.x + dir.x * 0.85,
      y: eyePos.y + dir.y * 0.85 - 0.1,
      z: eyePos.z + dir.z * 0.85,
    };

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xff8c24,
        emissive: 0xff3b00,
        emissiveIntensity: 2.4,
        roughness: 0.2,
      }),
    );
    mesh.position.set(startPos.x, startPos.y, startPos.z);

    const light = new THREE.PointLight(0xff6b1a, 2.6, 12);
    mesh.add(light);
    this.scene.add(mesh);

    const speed = 24;
    this.projectiles.push({
      mesh,
      light,
      position: startPos,
      velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
      life: 2.6,
      damage: magicDamage,
    });

    return true;
  }

  applyDamageToPlayer(rawDamage: number, attackerName: string): number {
    if (this.state.isDead) return 0;

    const computed = this.inventory.getComputedStats();
    const reduced = Math.max(1, Math.round(rawDamage - computed.defense * 0.45));
    this.state.player.stats.hp = Math.max(0, this.state.player.stats.hp - reduced);
    this.callbacks.onPlayerDamaged?.(reduced);

    if (this.state.player.stats.hp <= 0) {
      this.state.isDead = true;
      this.state.events.emit('player:died', { zone: this.state.player.currentZone });
      this.state.events.emit('hud:notify', {
        text: `你被 ${attackerName} 击败了！`,
        kind: 'warning',
      });
    }

    return reduced;
  }

  respawnPlayer(): void {
    const computed = this.inventory.getComputedStats();
    this.state.isDead = false;
    this.state.player.currentZone = 'overworld';
    this.state.player.currentRegion = 'ravendale_village';
    this.state.player.position = { x: 0, y: 4.3, z: 58 };
    this.state.player.yaw = 0;
    this.state.player.pitch = 0;
    this.state.player.stats.hp = Math.round(computed.maxHp * 0.65);
    this.state.player.stats.mp = Math.round(computed.maxMp * 0.65);
    this.state.player.stats.stamina = this.state.player.stats.maxStamina;

    this.enemies.resetAggro();
    this.physics?.teleportPlayer(this.state.player.position);
    this.state.events.emit('player:respawned', { position: { ...this.state.player.position } });
    this.callbacks.onPlayerRespawn?.();
  }

  update(dt: number): void {
    if (this.meleeCooldown > 0) this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    if (this.spellCooldown > 0) this.spellCooldown = Math.max(0, this.spellCooldown - dt);

    // Passive MP regeneration when alive
    if (!this.state.isDead && !this.state.isPaused) {
      const computed = this.inventory.getComputedStats();
      this.state.player.stats.mp = Math.min(
        computed.maxMp,
        this.state.player.stats.mp + 3.5 * dt,
      );
    }

    // Update active Fireball projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.removeProjectileAt(i);
        continue;
      }

      const nextPos: Vec3 = {
        x: p.position.x + p.velocity.x * dt,
        y: p.position.y + p.velocity.y * dt,
        z: p.position.z + p.velocity.z * dt,
      };

      // Check collision with any alive enemy in current zone
      let hitEnemy: EnemyInstance | null = null;
      for (const enemy of this.enemies.enemies) {
        if (enemy.aiState === 'DEAD' || enemy.zone !== this.state.player.currentZone) continue;
        const centerY = enemy.position.y + 1.0 * enemy.archetype.scale;
        const dist = Math.hypot(
          nextPos.x - enemy.position.x,
          nextPos.y - centerY,
          nextPos.z - enemy.position.z,
        );
        if (dist <= 1.25 * enemy.archetype.scale) {
          hitEnemy = enemy;
          break;
        }
      }

      if (hitEnemy) {
        const dirLen = Math.hypot(p.velocity.x, p.velocity.z) || 1;
        const dealt = this.enemies.damageEnemy(hitEnemy, p.damage, {
          x: p.velocity.x / dirLen,
          y: 0,
          z: p.velocity.z / dirLen,
        });
        this.callbacks.onHitEffect?.(nextPos, dealt, true);
        this.callbacks.onExplosionEffect?.(nextPos);
        this.removeProjectileAt(i);
        continue;
      }

      // Check terrain / city ground / dungeon floor impact
      let hitEnvironment = false;
      if (this.state.player.currentZone === 'overworld') {
        if (nextPos.y <= getTerrainHeight(nextPos.x, nextPos.z) + 0.1) {
          hitEnvironment = true;
        }
      } else if (this.state.player.currentZone === 'ashenhold_city') {
        if (nextPos.y <= getCityGroundHeight(nextPos.x, nextPos.z) + 0.1) {
          hitEnvironment = true;
        }
      } else if (nextPos.y <= -499.8 || nextPos.y >= -492.0) {
        hitEnvironment = true;
      }

      if (!hitEnvironment && this.physics) {
        const speed = Math.hypot(p.velocity.x, p.velocity.y, p.velocity.z) || 1;
        const stepDist = speed * dt;
        const rayHit = this.physics.castRay(
          p.position,
          { x: p.velocity.x / speed, y: p.velocity.y / speed, z: p.velocity.z / speed },
          stepDist + 0.25,
        );
        if (rayHit && rayHit.hit) {
          hitEnvironment = true;
        }
      }

      if (hitEnvironment) {
        this.callbacks.onExplosionEffect?.(nextPos);
        this.removeProjectileAt(i);
        continue;
      }

      p.position = nextPos;
      p.mesh.position.set(nextPos.x, nextPos.y, nextPos.z);
    }
  }

  private removeProjectileAt(index: number): void {
    const p = this.projectiles[index];
    this.scene.remove(p.mesh);
    this.projectiles.splice(index, 1);
  }
}
