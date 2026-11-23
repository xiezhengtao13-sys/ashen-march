import * as THREE from 'three';
import type { Vec3 } from '../core/types';

interface Particle {
  mesh: THREE.Mesh;
  vel: Vec3;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private readonly scene: THREE.Scene;
  private readonly particles: Particle[] = [];
  private readonly sharedGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnBurst(pos: Vec3, colorHex: number, count = 14, speed = 4.5, life = 0.65): void {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
    });

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sharedGeo, mat.clone());
      mesh.position.set(pos.x, pos.y, pos.z);
      this.scene.add(mesh);

      const theta = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.25;
      const spd = speed * (0.4 + Math.random() * 0.8);

      this.particles.push({
        mesh,
        vel: {
          x: Math.cos(theta) * spd,
          y: up * spd,
          z: Math.sin(theta) * spd,
        },
        life,
        maxLife: life,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.vel.y -= 9.8 * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;
      const ratio = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.1, ratio));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio;
    }
  }
}
