import * as THREE from 'three';
import type { Vec3, ZoneId } from '../core/types';

export type InteractableKind = 'npc' | 'chest' | 'pickup' | 'portal' | 'lore';

export interface InteractableEntry {
  id: string;
  kind: InteractableKind;
  label: string;
  zone: ZoneId;
  position: Vec3;
  radius: number;
  enabled: boolean;
  mesh?: THREE.Object3D;
  onInteract: () => void;
}

export class InteractableRegistry {
  private entries = new Map<string, InteractableEntry>();

  register(entry: InteractableEntry): void {
    this.entries.set(entry.id, entry);
  }

  get(id: string): InteractableEntry | undefined {
    return this.entries.get(id);
  }

  setEnabled(id: string, enabled: boolean): void {
    const entry = this.entries.get(id);
    if (entry) entry.enabled = enabled;
  }

  setLabel(id: string, label: string): void {
    const entry = this.entries.get(id);
    if (entry) entry.label = label;
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  getAll(): InteractableEntry[] {
    return [...this.entries.values()];
  }

  findBestInteractable(
    eyePos: Vec3,
    lookDir: Vec3,
    currentZone: ZoneId,
    maxDistance = 4.2,
  ): InteractableEntry | null {
    const dirVec = new THREE.Vector3(lookDir.x, lookDir.y, lookDir.z).normalize();
    const toTarget = new THREE.Vector3();

    let best: InteractableEntry | null = null;
    let bestScore = Infinity;

    for (const entry of this.entries.values()) {
      if (!entry.enabled || entry.zone !== currentZone) continue;

      const targetY = entry.position.y + 1.0;
      toTarget.set(entry.position.x - eyePos.x, targetY - eyePos.y, entry.position.z - eyePos.z);
      const dist = toTarget.length();
      const limit = Math.max(maxDistance, entry.radius);
      if (dist > limit) continue;

      const horizDist = Math.hypot(entry.position.x - eyePos.x, entry.position.z - eyePos.z);
      toTarget.normalize();
      const dot = dirVec.dot(toTarget);

      // Prefer targets near reticle, but allow close proximity (< 2.1m) even if looking slightly off-center
      if (dot < 0.25 && horizDist > 2.1) continue;

      const score = dist - Math.max(0, dot) * 1.4;
      if (score < bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    return best;
  }
}
