import RAPIER from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../core/types';

export interface CharacterMoveResult {
  position: Vec3;
  grounded: boolean;
}

export interface RaycastResult {
  hit: boolean;
  distance: number;
  point: Vec3;
}

export class PhysicsWorld {
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

    this.world = new RAPIER.World({ x: 0.0, y: -22.0, z: 0.0 });
    this.controller = this.world.createCharacterController(0.05);
    this.controller.enableAutostep(0.55, 0.25, true);
    this.controller.enableSnapToGround(0.45);
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      initialPlayerPos.x,
      initialPlayerPos.y + this.playerRadius + this.playerHalfHeight,
      initialPlayerPos.z,
    );
    this.playerBody = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.capsule(this.playerHalfHeight, this.playerRadius);
    this.playerCollider = this.world.createCollider(colliderDesc, this.playerBody);
    this.verticalVelocity = 0;
    this.grounded = false;
  }

  addTerrainTrimesh(vertices: Float32Array, indices: Uint32Array): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed();
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
    return this.world.createCollider(colDesc, body);
  }

  addStaticBox(halfExtents: Vec3, center: Vec3, yaw = 0): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
    if (yaw !== 0) {
      const half = yaw * 0.5;
      bodyDesc.setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
    }
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z);
    return this.world.createCollider(colDesc, body);
  }

  addStaticCylinder(halfHeight: number, radius: number, center: Vec3): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z);
    const body = this.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cylinder(halfHeight, radius);
    return this.world.createCollider(colDesc, body);
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

    // Keep inside 512x512 world bounds when in overworld (y > -100)
    if (nextPos.y > -100) {
      nextPos.x = Math.max(-248, Math.min(248, nextPos.x));
      nextPos.z = Math.max(-248, Math.min(248, nextPos.z));
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
    if (this.world) {
      this.world.free();
    }
  }
}
