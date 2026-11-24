import type { Vec3, ZoneId } from '../core/types';
import { getCitySurfaceMaterial, type CitySurfaceMaterial } from '../world/city/CityRoadNetwork';
import type { AmbientAudioManager } from './AmbientAudioManager';

export class FootstepAudioSystem {
  private readonly ambient: AmbientAudioManager;
  private stepAccum = 0;
  private wasGrounded = true;
  private prevY = 0;
  private lastSurface: CitySurfaceMaterial = 'stone_flagstone';
  private stepCount = 0;

  constructor(ambient: AmbientAudioManager) {
    this.ambient = ambient;
  }

  classifySurface(zone: ZoneId, pos: Vec3): CitySurfaceMaterial {
    if (zone === 'ancient_crypt') return 'stone_flagstone';
    if (zone === 'overworld') {
      return Math.abs(pos.x) < 4.5 ? 'dirt' : 'grass';
    }
    return getCitySurfaceMaterial(pos.x, pos.y, pos.z);
  }

  /**
   * Updates cadence-driven footsteps, jump launch, and surface-aware landing impacts.
   */
  update(
    dt: number,
    zone: ZoneId,
    feetPos: Vec3,
    horizontalSpeed: number,
    grounded: boolean,
    jumped: boolean,
  ): void {
    const surface = this.classifySurface(zone, feetPos);
    this.lastSurface = surface;

    if (jumped) {
      this.playJump(surface);
    }

    if (!this.wasGrounded && grounded) {
      const fallDelta = Math.max(0, this.prevY - feetPos.y);
      this.playLand(surface, fallDelta);
      this.stepAccum = 0.05;
    }
    this.wasGrounded = grounded;
    this.prevY = feetPos.y;

    if (!grounded || horizontalSpeed < 0.45) {
      this.stepAccum = Math.min(this.stepAccum, 0.18);
      return;
    }

    const strideMeters = horizontalSpeed > 7.2 ? 2.55 : 2.15;
    this.stepAccum += (horizontalSpeed * dt) / strideMeters;
    if (this.stepAccum >= 1.0) {
      this.stepAccum -= 1.0;
      this.stepCount++;
      this.playFootstep(surface, horizontalSpeed > 7.2 ? 1.22 : 1.0);
    }
  }

  playFootstep(surface: CitySurfaceMaterial, intensity = 1.0): void {
    const ctx = this.ambient.getContext();
    if (!ctx || ctx.state !== 'running' || this.ambient.isMuted() || !this.ambient.sfxBus) return;

    const now = ctx.currentTime;
    const pitchJitter = 0.92 + Math.random() * 0.16;
    const gainJitter = (0.88 + Math.random() * 0.24) * intensity;

    // 1. Low-end boot heel weight
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    const baseFreq =
      surface === 'wood_plank'
        ? 148
        : surface === 'stone_stair'
          ? 168
          : surface === 'stone_flagstone'
            ? 192
            : surface === 'shallow_water'
              ? 240
              : 128;
    thudOsc.type = surface === 'wood_plank' ? 'triangle' : 'sine';
    thudOsc.frequency.setValueAtTime(baseFreq * pitchJitter, now);
    thudOsc.frequency.exponentialRampToValueAtTime(48, now + 0.065);
    thudGain.gain.setValueAtTime(0.085 * gainJitter, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0006, now + 0.072);
    thudOsc.connect(thudGain);
    thudGain.connect(this.ambient.sfxBus);
    if (this.ambient.reverbSendBus && (surface === 'stone_flagstone' || surface === 'stone_stair' || surface === 'shallow_water')) {
      thudGain.connect(this.ambient.reverbSendBus);
    }
    thudOsc.start(now);
    thudOsc.stop(now + 0.08);

    // 2. High-frequency surface texture burst (stone tap / gravel crunch / grass brush / water splash)
    const burstDur = surface === 'shallow_water' ? 0.13 : surface === 'grass' ? 0.095 : 0.055;
    const bufLen = Math.max(64, Math.floor(ctx.sampleRate * burstDur));
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.6);
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    if (surface === 'stone_flagstone' || surface === 'stone_stair') {
      filter.frequency.value = 1850 * pitchJitter;
      filter.Q.value = 2.4;
    } else if (surface === 'wood_plank') {
      filter.frequency.value = 880 * pitchJitter;
      filter.Q.value = 3.1;
    } else if (surface === 'dirt') {
      filter.frequency.value = 2350 * pitchJitter;
      filter.Q.value = 1.3;
    } else if (surface === 'shallow_water') {
      filter.frequency.value = 3100 * pitchJitter;
      filter.Q.value = 1.6;
    } else {
      filter.frequency.value = 3400 * pitchJitter;
      filter.Q.value = 0.9;
    }

    const texGain = ctx.createGain();
    const texAmp = surface === 'shallow_water' ? 0.14 : surface === 'grass' ? 0.055 : 0.095;
    texGain.gain.setValueAtTime(texAmp * gainJitter, now);
    texGain.gain.exponentialRampToValueAtTime(0.0005, now + burstDur);

    noiseSrc.connect(filter);
    filter.connect(texGain);
    texGain.connect(this.ambient.sfxBus);
    if (this.ambient.reverbSendBus && surface !== 'grass') {
      texGain.connect(this.ambient.reverbSendBus);
    }
    noiseSrc.start(now);
  }

  playJump(surface: CitySurfaceMaterial): void {
    this.playFootstep(surface, 1.15);
    const ctx = this.ambient.getContext();
    if (!ctx || ctx.state !== 'running' || this.ambient.isMuted() || !this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(245, now + 0.09);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.1);
    osc.connect(g);
    g.connect(this.ambient.sfxBus);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playLand(surface: CitySurfaceMaterial, fallMeters = 0.5): void {
    const weight = Math.min(1.8, 1.1 + fallMeters * 0.25);
    this.playFootstep(surface, weight);
  }

  playBookPage(): void {
    const ctx = this.ambient.ensureContext();
    if (!ctx || this.ambient.isMuted() || !this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.14);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.sin((i / len) * Math.PI);
      d[i] = (Math.random() * 2 - 1) * env * 0.35;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, now);
    f.frequency.linearRampToValueAtTime(4200, now + 0.14);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0.14;
    src.connect(f);
    f.connect(g);
    g.connect(this.ambient.sfxBus);
    src.start(now);
  }

  playCoinTrade(): void {
    const ctx = this.ambient.ensureContext();
    if (!ctx || this.ambient.isMuted() || !this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    for (const [delay, freq] of [
      [0.0, 2349.3],
      [0.055, 3135.9],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      g.gain.setValueAtTime(0.085, now + delay);
      g.gain.exponentialRampToValueAtTime(0.0005, now + delay + 0.18);
      osc.connect(g);
      g.connect(this.ambient.sfxBus);
      osc.start(now + delay);
      osc.stop(now + delay + 0.19);
    }
  }

  playEquipItem(): void {
    const ctx = this.ambient.ensureContext();
    if (!ctx || this.ambient.isMuted() || !this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.11);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0006, now + 0.13);
    osc.connect(g);
    g.connect(this.ambient.sfxBus);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playChestOpen(): void {
    const ctx = this.ambient.ensureContext();
    if (!ctx || this.ambient.isMuted() || !this.ambient.sfxBus) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(95, now + 0.22);
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);
    osc.connect(g);
    g.connect(this.ambient.sfxBus);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  getLastSurface(): CitySurfaceMaterial {
    return this.lastSurface;
  }

  getStepCount(): number {
    return this.stepCount;
  }
}
