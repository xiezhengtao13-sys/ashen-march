import type { Vec3 } from '../core/types';
import audioZonesRaw from '../data/cityAudioZones.json';
import type { CityPortalVisibility } from '../world/city/CityPortalVisibility';
import type { AmbientAudioManager } from './AmbientAudioManager';

export interface SpatialEmitterConfig {
  id: string;
  kind:
    | 'torch_fire'
    | 'hearth_fire'
    | 'tavern_murmur'
    | 'fountain_water'
    | 'anvil_hammer'
    | 'wood_saw'
    | 'well_water'
    | 'cathedral_bell'
    | 'cistern_stream'
    | 'cave_drips';
  cellId: string;
  position: Vec3;
  refDistance: number;
  maxDistance: number;
  gain: number;
}

interface ActiveContinuousEmitter {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  gain: GainNode;
}

interface EmitterRuntimeState {
  cfg: SpatialEmitterConfig;
  inRange: boolean;
  distance: number;
  occlusion: number;
  cutoffHz: number;
  pulseTimer: number;
  continuous: ActiveContinuousEmitter | null;
}

export class SpatialAudioSystem {
  private readonly ambient: AmbientAudioManager;
  private readonly portalVis: CityPortalVisibility;
  private readonly emitters: EmitterRuntimeState[] = [];
  private sharedLoopBuf: AudioBuffer | null = null;

  constructor(ambient: AmbientAudioManager, portalVis: CityPortalVisibility) {
    this.ambient = ambient;
    this.portalVis = portalVis;

    for (const raw of audioZonesRaw.spatialEmitters as SpatialEmitterConfig[]) {
      this.emitters.push({
        cfg: raw,
        inRange: false,
        distance: 999,
        occlusion: 0,
        cutoffHz: 16000,
        pulseTimer: (raw.id.length * 0.37) % 1.8,
        continuous: null,
      });
    }
  }

  private getLoopBuffer(ctx: AudioContext): AudioBuffer {
    if (this.sharedLoopBuf) return this.sharedLoopBuf;
    const len = Math.floor(ctx.sampleRate * 2.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let lp = 0;
    let seed = 24681357;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const w = (seed / 4294967296) * 2 - 1;
      lp = lp * 0.82 + w * 0.18;
      // Gentle crackle/ripple modulation
      const ripple = 0.75 + 0.25 * Math.sin((i / ctx.sampleRate) * Math.PI * 6.4);
      ch[i] = lp * ripple * 0.26;
    }
    this.sharedLoopBuf = buf;
    return buf;
  }

  private isContinuousKind(kind: SpatialEmitterConfig['kind']): boolean {
    return (
      kind === 'torch_fire' ||
      kind === 'hearth_fire' ||
      kind === 'tavern_murmur' ||
      kind === 'fountain_water' ||
      kind === 'well_water' ||
      kind === 'cistern_stream'
    );
  }

  /**
   * Updates 3D listener pose, evaluates acoustic portal/wall occlusion independently of
   * visual cell culling, and manages active 3D PannerNode + BiquadFilterNode chains.
   */
  update(dt: number, activeCellId: string, feetPos: Vec3, lookDir: Vec3, inCity: boolean): void {
    const eyePos: Vec3 = { x: feetPos.x, y: feetPos.y + 1.65, z: feetPos.z };
    const ctx = this.ambient.getContext();

    if (ctx && ctx.state === 'running') {
      const listener = ctx.listener;
      if (listener.positionX) {
        const now = ctx.currentTime;
        listener.positionX.setTargetAtTime(eyePos.x, now, 0.02);
        listener.positionY.setTargetAtTime(eyePos.y, now, 0.02);
        listener.positionZ.setTargetAtTime(eyePos.z, now, 0.02);
        listener.forwardX.setTargetAtTime(lookDir.x, now, 0.02);
        listener.forwardY.setTargetAtTime(lookDir.y, now, 0.02);
        listener.forwardZ.setTargetAtTime(lookDir.z, now, 0.02);
        listener.upX.setValueAtTime(0, now);
        listener.upY.setValueAtTime(1, now);
        listener.upZ.setValueAtTime(0, now);
      } else {
        listener.setPosition(eyePos.x, eyePos.y, eyePos.z);
        listener.setOrientation(lookDir.x, lookDir.y, lookDir.z, 0, 1, 0);
      }
    }

    for (const em of this.emitters) {
      if (!inCity) {
        em.inRange = false;
        this.teardownContinuous(em);
        continue;
      }

      const dx = em.cfg.position.x - eyePos.x;
      const dy = em.cfg.position.y - eyePos.y;
      const dz = em.cfg.position.z - eyePos.z;
      const dist = Math.hypot(dx, dy, dz);
      em.distance = dist;
      em.inRange = dist <= em.cfg.maxDistance;

      if (!em.inRange) {
        this.teardownContinuous(em);
        continue;
      }

      // Compute acoustic wall/portal occlusion (0 = open sightline, ~0.85 = muffled behind stone wall)
      em.occlusion = this.portalVis.computeAcousticOcclusion(
        activeCellId,
        eyePos,
        em.cfg.cellId,
        em.cfg.position,
      );
      em.cutoffHz = Math.round(16000 * Math.pow(0.042, em.occlusion)); // 16kHz clear -> ~670Hz behind thick wall

      if (!ctx || ctx.state !== 'running' || this.ambient.isMuted() || !this.ambient.sfxBus) {
        continue;
      }

      if (this.isContinuousKind(em.cfg.kind)) {
        this.ensureContinuous(ctx, em);
        if (em.continuous) {
          const now = ctx.currentTime;
          const occGain = em.cfg.gain * (1 - em.occlusion * 0.52);
          em.continuous.filter.frequency.setTargetAtTime(em.cutoffHz, now, 0.08);
          em.continuous.gain.gain.setTargetAtTime(occGain, now, 0.08);
        }
      } else {
        // Rhythmic / stochastic 3D world events (Smithy anvil strikes, carpenter saw, cathedral bell, cave drips)
        em.pulseTimer -= dt;
        if (em.pulseTimer <= 0) {
          if (em.cfg.kind === 'anvil_hammer') {
            this.trigger3DAnvilStrike(ctx, em);
            em.pulseTimer = Math.random() < 0.25 ? 2.1 : 0.78 + Math.random() * 0.24;
          } else if (em.cfg.kind === 'wood_saw') {
            this.trigger3DWoodSaw(ctx, em);
            em.pulseTimer = 1.35 + Math.random() * 0.45;
          } else if (em.cfg.kind === 'cathedral_bell') {
            this.trigger3DBellToll(ctx, em, 0.45);
            em.pulseTimer = 14.0 + Math.random() * 4.0;
          } else if (em.cfg.kind === 'cave_drips') {
            this.trigger3DCaveDrip(ctx, em);
            em.pulseTimer = 1.1 + Math.random() * 1.4;
          }
        }
      }
    }
  }

  private createPanner(ctx: AudioContext, cfg: SpatialEmitterConfig): PannerNode {
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = cfg.refDistance;
    panner.maxDistance = cfg.maxDistance;
    panner.rolloffFactor = 1.35;
    panner.positionX.value = cfg.position.x;
    panner.positionY.value = cfg.position.y;
    panner.positionZ.value = cfg.position.z;
    return panner;
  }

  private ensureContinuous(ctx: AudioContext, em: EmitterRuntimeState): void {
    if (em.continuous || !this.ambient.ambientBus) return;
    const source = ctx.createBufferSource();
    source.buffer = this.getLoopBuffer(ctx);
    source.loop = true;
    source.playbackRate.value =
      em.cfg.kind === 'fountain_water' || em.cfg.kind === 'cistern_stream'
        ? 1.35
        : em.cfg.kind === 'tavern_murmur'
          ? 0.88
          : 0.68;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = em.cutoffHz;

    const panner = this.createPanner(ctx, em.cfg);
    const gain = ctx.createGain();
    gain.gain.value = 0.001;

    source.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(this.ambient.ambientBus);
    source.start();

    em.continuous = { source, filter, panner, gain };
  }

  private teardownContinuous(em: EmitterRuntimeState): void {
    if (!em.continuous) return;
    try {
      em.continuous.source.stop();
      em.continuous.source.disconnect();
      em.continuous.filter.disconnect();
      em.continuous.panner.disconnect();
      em.continuous.gain.disconnect();
    } catch {
      // Ignore already-stopped nodes
    }
    em.continuous = null;
  }

  private trigger3DAnvilStrike(ctx: AudioContext, em: EmitterRuntimeState): void {
    if (!this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const panner = this.createPanner(ctx, em.cfg);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = em.cutoffHz;
    filter.connect(panner);
    panner.connect(this.ambient.sfxBus);
    if (this.ambient.reverbSendBus) {
      panner.connect(this.ambient.reverbSendBus);
    }

    const pitchVar = 0.96 + Math.random() * 0.09;
    const atten = em.cfg.gain * (1 - em.occlusion * 0.45);
    // Inharmonic forged steel anvil partials
    for (const [freq, dur, amp] of [
      [1180 * pitchVar, 0.34, 0.22],
      [2510 * pitchVar, 0.22, 0.14],
      [3840 * pitchVar, 0.14, 0.08],
      [240 * pitchVar, 0.09, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = freq < 400 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(amp * atten, now);
      g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
      osc.connect(filter);
      osc.disconnect();
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }
    setTimeout(() => {
      filter.disconnect();
      panner.disconnect();
    }, 450);
  }

  private trigger3DWoodSaw(ctx: AudioContext, em: EmitterRuntimeState): void {
    if (!this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const panner = this.createPanner(ctx, em.cfg);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.min(em.cutoffHz, 820);
    filter.Q.value = 1.8;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.linearRampToValueAtTime(168, now + 0.28);
    const amp = em.cfg.gain * 0.16 * (1 - em.occlusion * 0.5);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.34);

    osc.connect(filter);
    filter.connect(g);
    g.connect(panner);
    panner.connect(this.ambient.sfxBus);
    osc.start(now);
    osc.stop(now + 0.36);
    setTimeout(() => panner.disconnect(), 420);
  }

  private trigger3DBellToll(ctx: AudioContext, em: EmitterRuntimeState, scale = 1.0): void {
    if (!this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const panner = this.createPanner(ctx, em.cfg);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = em.cutoffHz;
    filter.connect(panner);
    panner.connect(this.ambient.sfxBus);
    if (this.ambient.reverbSendBus) {
      panner.connect(this.ambient.reverbSendBus);
    }

    const atten = em.cfg.gain * scale * (1 - em.occlusion * 0.38);
    for (const [f, dur, amp] of [
      [220.0, 3.2, 0.24],
      [440.0, 2.4, 0.14],
      [523.25, 1.9, 0.10],
      [659.25, 1.4, 0.07],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(amp * atten, now);
      g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }
    setTimeout(() => {
      filter.disconnect();
      panner.disconnect();
    }, 3400);
  }

  private trigger3DCaveDrip(ctx: AudioContext, em: EmitterRuntimeState): void {
    if (!this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const panner = this.createPanner(ctx, em.cfg);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = 1050 + Math.random() * 520;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * 1.45, now + 0.06);
    g.gain.setValueAtTime(0.12 * (1 - em.occlusion * 0.5), now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.08);
    osc.connect(g);
    g.connect(panner);
    panner.connect(this.ambient.sfxBus);
    if (this.ambient.reverbSendBus) panner.connect(this.ambient.reverbSendBus);
    osc.start(now);
    osc.stop(now + 0.09);
    setTimeout(() => panner.disconnect(), 160);
  }

  /**
   * Manually tolls the Great Bronze Bell atop Cell 06 Cathedral Bell Tower (+24.2m).
   */
  ringCathedralBell(): void {
    const ctx = this.ambient.ensureContext();
    const bellEmitter = this.emitters.find((e) => e.cfg.id === 'emit_cathedral_bell');
    if (ctx && bellEmitter) {
      bellEmitter.occlusion = 0;
      bellEmitter.cutoffHz = 16000;
      this.trigger3DBellToll(ctx, bellEmitter, 1.35);
    }
  }

  getEmitterDiagnostics(): Array<{ id: string; cellId: string; inRange: boolean; distance: number; occlusion: number; cutoffHz: number }> {
    return this.emitters.map((e) => ({
      id: e.cfg.id,
      cellId: e.cfg.cellId,
      inRange: e.inRange,
      distance: Number(e.distance.toFixed(1)),
      occlusion: Number(e.occlusion.toFixed(2)),
      cutoffHz: e.cutoffHz,
    }));
  }

  getActiveNodeCount(): number {
    let nodes = 0;
    for (const e of this.emitters) {
      if (e.continuous) nodes += 4;
    }
    return nodes;
  }

  dispose(): void {
    for (const e of this.emitters) {
      this.teardownContinuous(e);
    }
  }
}
