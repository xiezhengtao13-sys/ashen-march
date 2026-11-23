import * as THREE from 'three';
import type { GameState } from '../core/GameState';
import type { Vec3 } from '../core/types';
import type { PhysicsWorld } from '../engine/PhysicsWorld';

export interface PlayerInputCallbacks {
  onInteract: () => void;
  onMeleeAttack: () => void;
  onCastSpell: () => void;
  onQuickPotion?: (kind: 'health' | 'mana') => void;
  onToggleUI: (panel: 'inventory' | 'quests' | 'map' | 'menu') => void;
  isModalOpen: () => boolean;
}

export class PlayerController {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly physics: PhysicsWorld;
  private readonly state: GameState;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: PlayerInputCallbacks;

  private keys = new Set<string>();
  private jumpQueued = false;
  private isDraggingLook = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private pointerLocked = false;
  private walkBobTimer = 0;

  // First-person ViewModel + AnimationMixer
  private readonly viewModelRoot = new THREE.Group();
  private readonly swordPivot = new THREE.Group();
  private readonly bladeMat: THREE.MeshStandardMaterial;
  private readonly guardMat: THREE.MeshStandardMaterial;
  private readonly bladeMesh: THREE.Mesh;
  private readonly spellOrb: THREE.Mesh;
  private readonly mixer: THREE.AnimationMixer;
  private readonly swingAction: THREE.AnimationAction;
  private readonly castAction: THREE.AnimationAction;
  private readonly idleAction: THREE.AnimationAction;

  constructor(
    camera: THREE.PerspectiveCamera,
    physics: PhysicsWorld,
    state: GameState,
    canvas: HTMLCanvasElement,
    callbacks: PlayerInputCallbacks,
  ) {
    this.camera = camera;
    this.physics = physics;
    this.state = state;
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.camera.rotation.order = 'YXZ';

    // Sculpted First-Person Held Sword + Magic Focus ViewModel
    this.viewModelRoot.position.set(0.36, -0.32, -0.55);
    this.swordPivot.name = 'SwordPivot';

    const hilt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0x452b18, roughness: 0.85 }),
    );
    this.guardMat = new THREE.MeshStandardMaterial({ color: 0xb8944f, metalness: 0.85, roughness: 0.32 });
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), this.guardMat);
    pommel.position.y = -0.1;

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.028, 0.042), this.guardMat);
    guard.position.y = 0.1;

    this.bladeMat = new THREE.MeshStandardMaterial({
      color: 0xc2ccd6,
      metalness: 0.88,
      roughness: 0.24,
    });
    this.bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.57, 0.014), this.bladeMat);
    this.bladeMesh.position.y = 0.385;

    const fuller = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.44, 0.017),
      new THREE.MeshStandardMaterial({ color: 0x67707a, metalness: 0.8, roughness: 0.4 }),
    );
    fuller.position.y = 0.35;

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0297, 0.11, 4), this.bladeMat);
    tip.rotation.y = Math.PI / 4;
    tip.scale.set(1.0, 1.0, 0.33);
    tip.position.y = 0.725;

    this.swordPivot.add(pommel, hilt, guard, this.bladeMesh, fuller, tip);
    this.swordPivot.rotation.set(-0.35, -0.25, 0.18);
    this.viewModelRoot.add(this.swordPivot);

    // Left-hand glowing Fireball focus sigil
    this.spellOrb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.055, 1),
      new THREE.MeshStandardMaterial({
        color: 0xff8c38,
        emissive: 0xff4500,
        emissiveIntensity: 1.7,
        roughness: 0.2,
      }),
    );
    this.spellOrb.name = 'SpellOrb';
    this.spellOrb.position.set(-0.68, -0.06, -0.02);
    this.viewModelRoot.add(this.spellOrb);

    this.camera.add(this.viewModelRoot);

    this.mixer = new THREE.AnimationMixer(this.viewModelRoot);

    const idleClip = new THREE.AnimationClip('viewmodel_idle', 2.0, [
      new THREE.VectorKeyframeTrack(
        'SwordPivot.position',
        [0, 1.0, 2.0],
        [0, 0, 0, 0, 0.015, 0, 0, 0, 0],
      ),
    ]);
    this.idleAction = this.mixer.clipAction(idleClip);
    this.idleAction.play();

    const swingClip = new THREE.AnimationClip('sword_swing', 0.38, [
      new THREE.QuaternionKeyframeTrack(
        'SwordPivot.quaternion',
        [0, 0.12, 0.26, 0.38],
        this.buildSwingQuaternions(),
      ),
    ]);
    this.swingAction = this.mixer.clipAction(swingClip);
    this.swingAction.setLoop(THREE.LoopOnce, 1);

    const castClip = new THREE.AnimationClip('spell_cast', 0.35, [
      new THREE.VectorKeyframeTrack(
        'SpellOrb.position',
        [0, 0.14, 0.35],
        [-0.68, -0.06, -0.02, -0.45, 0.05, -0.28, -0.68, -0.06, -0.02],
      ),
    ]);
    this.castAction = this.mixer.clipAction(castClip);
    this.castAction.setLoop(THREE.LoopOnce, 1);

    this.bindEvents();
    this.syncCameraFromState();
    this.setEquippedWeapon(this.state.equipped.weapon);
  }

  setEquippedWeapon(weaponId: string | null): void {
    this.swordPivot.visible = weaponId !== null;
    if (weaponId === 'watchers_runeblade') {
      this.bladeMat.color.setHex(0xa8e0f5);
      this.bladeMat.emissive.setHex(0x286f8f);
      this.bladeMat.emissiveIntensity = 0.55;
      this.guardMat.color.setHex(0x7ec8e3);
    } else if (weaponId === 'hunters_saber') {
      this.bladeMat.color.setHex(0xd4dce3);
      this.bladeMat.emissive.setHex(0x000000);
      this.bladeMat.emissiveIntensity = 0;
      this.guardMat.color.setHex(0x8e959e);
    } else {
      this.bladeMat.color.setHex(0xb8c2cc);
      this.bladeMat.emissive.setHex(0x000000);
      this.bladeMat.emissiveIntensity = 0;
      this.guardMat.color.setHex(0xb8944f);
    }
  }

  private buildSwingQuaternions(): number[] {
    const e0 = new THREE.Euler(-0.35, -0.25, 0.18);
    const e1 = new THREE.Euler(-0.15, -0.65, -0.35);
    const e2 = new THREE.Euler(-1.15, 0.55, 0.72);
    const q0 = new THREE.Quaternion().setFromEuler(e0);
    const q1 = new THREE.Quaternion().setFromEuler(e1);
    const q2 = new THREE.Quaternion().setFromEuler(e2);
    return [
      q0.x, q0.y, q0.z, q0.w,
      q1.x, q1.y, q1.z, q1.w,
      q2.x, q2.y, q2.z, q2.w,
      q0.x, q0.y, q0.z, q0.w,
    ];
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);

    if (e.code === 'Escape') {
      this.callbacks.onToggleUI('menu');
      return;
    }
    if (e.code === 'KeyI') {
      this.callbacks.onToggleUI('inventory');
      return;
    }
    if (e.code === 'KeyJ') {
      this.callbacks.onToggleUI('quests');
      return;
    }
    if (e.code === 'KeyM') {
      this.callbacks.onToggleUI('map');
      return;
    }

    if (this.callbacks.isModalOpen() || this.state.isDead) return;

    if (e.code === 'Space') {
      this.jumpQueued = true;
    } else if (e.code === 'KeyE') {
      this.callbacks.onInteract();
    } else if (e.code === 'Digit3') {
      this.callbacks.onQuickPotion?.('health');
    } else if (e.code === 'Digit4') {
      this.callbacks.onQuickPotion?.('mana');
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.callbacks.isModalOpen() || this.state.isDead) return;

    if (!this.pointerLocked && e.button === 0 && typeof this.canvas.requestPointerLock === 'function') {
      try {
        const res = this.canvas.requestPointerLock() as unknown;
        if (res && typeof (res as Promise<void>).catch === 'function') {
          (res as Promise<void>).catch(() => {});
        }
      } catch {
        // Ignore in headless/sandbox environments
      }
    }

    if (e.button === 0) {
      this.isDraggingLook = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.callbacks.onMeleeAttack();
    } else if (e.button === 2) {
      this.callbacks.onCastSpell();
    }
  };

  private onMouseUp = (): void => {
    this.isDraggingLook = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.callbacks.isModalOpen() || this.state.isDead) return;

    let dx = 0;
    let dy = 0;

    if (this.pointerLocked) {
      dx = e.movementX;
      dy = e.movementY;
    } else if (this.isDraggingLook) {
      dx = e.clientX - this.lastDragX;
      dy = e.clientY - this.lastDragY;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    } else {
      return;
    }

    const sensitivity = 0.0022;
    this.state.player.yaw -= dx * sensitivity;
    this.state.player.pitch = Math.max(
      -1.42,
      Math.min(1.42, this.state.player.pitch - dy * sensitivity),
    );
  };

  playSwingAnimation(): void {
    this.swingAction.reset();
    this.swingAction.play();
  }

  playCastAnimation(): void {
    this.castAction.reset();
    this.castAction.play();
  }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.canvas && typeof document.exitPointerLock === 'function') {
      document.exitPointerLock();
    }
  }

  clearInputs(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.isDraggingLook = false;
  }

  setLook(yaw: number, pitch: number): void {
    this.state.player.yaw = yaw;
    this.state.player.pitch = Math.max(-1.42, Math.min(1.42, pitch));
    this.syncCameraFromState();
  }

  getLookDirection(): Vec3 {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.state.player.pitch, this.state.player.yaw, 0, 'YXZ'));
    return { x: dir.x, y: dir.y, z: dir.z };
  }

  syncCameraFromState(): void {
    const p = this.state.player.position;
    this.camera.position.set(p.x, p.y + 1.65, p.z);
    this.camera.rotation.set(this.state.player.pitch, this.state.player.yaw, 0, 'YXZ');
  }

  update(dt: number): void {
    this.mixer.update(dt);
    this.spellOrb.rotation.y += dt * 2.2;

    if (this.callbacks.isModalOpen() || this.state.isDead) {
      this.jumpQueued = false;
      return;
    }

    const forwardInput = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafeInput = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);

    const wantsSprint =
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) &&
      (forwardInput !== 0 || strafeInput !== 0);

    const stats = this.state.player.stats;
    let isSprinting = false;
    if (wantsSprint && stats.stamina > 2) {
      isSprinting = true;
      stats.stamina = Math.max(0, stats.stamina - 22 * dt);
    } else {
      stats.stamina = Math.min(stats.maxStamina, stats.stamina + 16 * dt);
    }

    const baseSpeed = isSprinting ? 9.2 : 5.6;
    const yaw = this.state.player.yaw;

    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let moveX = fwdX * forwardInput + rightX * strafeInput;
    let moveZ = fwdZ * forwardInput + rightZ * strafeInput;
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.001) {
      moveX = (moveX / len) * baseSpeed * dt;
      moveZ = (moveZ / len) * baseSpeed * dt;
    }

    const jumpNow = this.jumpQueued;
    this.jumpQueued = false;

    const result = this.physics.movePlayer({ x: moveX, y: 0, z: moveZ }, jumpNow, dt);
    this.state.player.position = result.position;

    let bobOffset = 0;
    if (len > 0.001 && result.grounded) {
      this.walkBobTimer += dt * (isSprinting ? 13 : 9);
      bobOffset = Math.sin(this.walkBobTimer) * (isSprinting ? 0.065 : 0.04);
    }

    this.camera.position.set(
      result.position.x,
      result.position.y + 1.65 + bobOffset,
      result.position.z,
    );
    this.camera.rotation.set(this.state.player.pitch, this.state.player.yaw, 0, 'YXZ');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }
}
