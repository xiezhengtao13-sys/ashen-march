import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3, ZoneId } from '../core/types';

export interface CharacterMoveResult {
  position: Vec3;
  grounded: boolean;
}

export interface RaycastResult {
  hit: boolean;
  distance: number;
  point: Vec3;
}

type PhysicsZoneKey = 'overworld' | 'ashenhold_city';

interface ZonePhysicsContext {
  world: RAPIER.World;
  controller: RAPIER.KinematicCharacterController;
  playerBody: RAPIER.RigidBody;
  playerCollider: RAPIER.Collider;
  verticalVelocity: number;
  grounded: boolean;
}

function resolveZoneKey(zone: ZoneId = 'overworld'): PhysicsZoneKey {
  return zone === 'ashenhold_city' ? 'ashenhold_city' : 'overworld';
}

export class PhysicsWorld {
  private contexts = new Map<PhysicsZoneKey, ZonePhysicsContext>();
  private activeKey: PhysicsZoneKey = 'overworld';
  private world!: RAPIER.World;
  private controller!: RAPIER.KinematicCharacterController;
  private playerBody!: RAPIER.RigidBody;
  private playerCollider!: RAPIER.Collider;
  private verticalVelocity = 0;
  private grounded = false;
  private initialized = false;

  readonly playerRadius = 0.38;
  readonly playerHalfHeight = 0.55;
  readonly playerEyeOffset = 0.72; // relative to rigidbody center (total eye height ~ 1.65m above feet)

  async init(initialPlayerPos: Vec3): Promise<void> {
    if (!this.initialized) {
      await RAPIER.init();
      this.initialized = true;
    }

    this.dispose();
    const ctx = this.createZoneContext(initialPlayerPos);
    this.contexts.set('overworld', ctx);
    this.bindContext('overworld', ctx);
  }

  private createZoneContext(initialPlayerPos: Vec3): ZonePhysicsContext {
    const world = new RAPIER.World({ x: 0.0, y: -22.0, z: 0.0 });
    const controller = world.createCharacterController(0.05);
    controller.enableAutostep(0.55, 0.25, true);
    controller.enableSnapToGround(0.45);
    controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      initialPlayerPos.x,
      initialPlayerPos.y + this.playerRadius + this.playerHalfHeight,
      initialPlayerPos.z,
    );
    const playerBody = world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(this.playerHalfHeight, this.playerRadius);
    const playerCollider = world.createCollider(colliderDesc, playerBody);

    return {
      world,
      controller,
      playerBody,
      playerCollider,
      verticalVelocity: 0,
      grounded: false,
    };
  }

  private getOrCreateContext(zone: ZoneId = 'overworld'): ZonePhysicsContext {
    const key = resolveZoneKey(zone);
    let ctx = this.contexts.get(key);
    if (!ctx) {
      ctx = this.createZoneContext({ x: 0, y: 1.5, z: 25.5 });
      this.contexts.set(key, ctx);
    }
    return ctx;
  }

  private bindContext(key: PhysicsZoneKey, ctx: ZonePhysicsContext): void {
    this.activeKey = key;
    this.world = ctx.world;
    this.controller = ctx.controller;
    this.playerBody = ctx.playerBody;
    this.playerCollider = ctx.playerCollider;
    this.verticalVelocity = ctx.verticalVelocity;
    this.grounded = ctx.grounded;
  }

  setActiveZone(zone: ZoneId): void {
    const key = resolveZoneKey(zone);
    if (key === this.activeKey) return;
    const prev = this.contexts.get(this.activeKey);
    if (prev) {
      prev.verticalVelocity = this.verticalVelocity;
      prev.grounded = this.grounded;
    }
    const next = this.getOrCreateContext(zone);
    this.bindContext(key, next);
  }

  addTerrainTrimesh(vertices: Float32Array, indices: Uint32Array, zone: ZoneId = 'overworld'): RAPIER.Collider {
    const ctx = this.getOrCreateContext(zone);
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = ctx.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    return ctx.world.createCollider(colDesc, body);
  }

  addStaticBox(halfExtents: Vec3, center: Vec3, yaw = 0, zone: ZoneId = 'overworld'): RAPIER.Collider {
    const ctx = this.getOrCreateContext(zone);
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
    if (yaw !== 0) {
      const half = yaw * 0.5;
      bodyDesc.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
    }
    const body = ctx.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    return ctx.world.createCollider(colDesc, body);
  }

  addStaticCylinder(halfHeight: number, radius: number, center: Vec3, zone: ZoneId = 'overworld'): RAPIER.Collider {
    const ctx = this.getOrCreateContext(zone);
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
    const body = ctx.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius);
    return ctx.world.createCollider(colDesc, body);
  }

  teleportPlayer(feetPos: Vec3): void {
    const centerY = feetPos.y + this.playerRadius + this.playerHalfHeight + 0.08;
    this.playerBody.setTranslation({ x: feetPos.x, y: centerY, z: feetPos.z }, true);
    this.playerBody.setNextKinematicTranslation({ x: feetPos.x, y: centerY, z: feetPos.z });
    this.verticalVelocity = 0;
    this.grounded = false;
    this.world.step();
  }

  movePlayer(horizDelta: Vec3, jumpRequested: boolean, dt: number): CharacterMoveResult {
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);

    if (jumpRequested && this.grounded) {
      this.verticalVelocity = 8.4;
      this.grounded = false;
    }

    if (!this.grounded) {
      this.verticalVelocity -= 22.0 * clampedDt;
      if (this.verticalVelocity < -32) {
        this.verticalVelocity = -32;
      }
    } else if (this.verticalVelocity < 0) {
      this.verticalVelocity = -0.8;
    }

    const desiredMovement = {
      x: horizDelta.x,
      y: this.verticalVelocity * clampedDt,
      z: horizDelta.z,
    };

    this.controller.computeColliderMovement(this.playerCollider, desiredMovement);
    const corrected = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();

    if (this.grounded && this.verticalVelocity < 0) {
      this.verticalVelocity = -0.5;
    }

    const cur = this.playerBody.translation();
    const nextPos = {
      x: cur.x + corrected.x,
      y: cur.y + corrected.y,
      z: cur.z + corrected.z,
    };

    if (this.activeKey === 'overworld' && nextPos.y > -100) {
      nextPos.x = Math.max(-248, Math.min(248, nextPos.x));
      nextPos.z = Math.max(-248, Math.min(248, nextPos.z));
    } else if (this.activeKey === 'ashenhold_city') {
      const southOutsideLimitX = nextPos.z > 15.5 ? 16 : 69;
      nextPos.x = Math.max(-southOutsideLimitX, Math.min(southOutsideLimitX, nextPos.x));
      nextPos.z = Math.max(-171, Math.min(31, nextPos.z));
    }

    this.playerBody.setNextKinematicTranslation(nextPos);
    this.world.step();

    const finalPos = this.playerBody.translation();
    const feetY = finalPos.y - (this.playerRadius + this.playerHalfHeight);
    return {
      position: { x: finalPos.x, y: feetY, z: finalPos.z },
      grounded: this.grounded,
    };
  }

  getPlayerFeetPosition(): Vec3 {
    const pos = this.playerBody.translation();
    return {
      x: pos.x,
      y: pos.y - (this.playerRadius + this.playerHalfHeight),
      z: pos.z,
    };
  }

  getPlayerEyePosition(): Vec3 {
    const pos = this.playerBody.translation();
    return {
      x: pos.x,
      y: pos.y + this.playerEyeOffset,
      z: pos.z,
    };
  }

  castRay(origin: Vec3, direction: Vec3, maxDist: number): RaycastResult | null {
    const ray = new RAPIER.Ray(origin, direction);
    const hit = this.world.castRay(ray, maxDist, true, undefined, undefined, this.playerCollider);
    if (!hit) return null;
    const point = ray.pointAt(hit.timeOfImpact);
    return {
      hit: true,
      distance: hit.timeOfImpact,
      point: { x: point.x, y: point.y, z: point.z },
    };
  }

  dispose(): void {
    for (const ctx of this.contexts.values()) {
      ctx.world.free();
    }
    this.contexts.clear();
  }
}
