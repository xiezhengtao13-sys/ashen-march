import type { Vec3, ZoneId } from '../core/types';
import audioZonesRaw from '../data/cityAudioZones.json';

export interface AudioVolumeSettings {
  master: number;
  ambient: number;
  sfx: number;
  music: number;
  muted: boolean;
}

export type ReverbPresetId =
  | 'outdoor_courtyard'
  | 'outdoor_alley'
  | 'semi_open_yard'
  | 'timber_tavern'
  | 'cathedral_stone'
  | 'great_hall_stone'
  | 'damp_undercroft_tunnel';

interface AmbientZoneConfig {
  id: string;
  label: string;
  baseProfile: string;
  windGain?: number;
  crowdGain?: number;
  hearthGain?: number;
  waterGain?: number;
  birdRate?: number;
  creakRate?: number;
  clinkRate?: number;
  chimeRate?: number;
  dripRate?: number;
  reverb: ReverbPresetId;
}

interface InteriorAcousticOverride {
  id: string;
  ambientZoneId: string;
  reverb: ReverbPresetId;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

const STORAGE_KEY = 'ashen_march_audio_v5';

export class AmbientAudioManager {
  private ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  ambientBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;
  reverbSendBus: GainNode | null = null;
  private convolver: ConvolverNode | null = null;

  private windStemGain: GainNode | null = null;
  private crowdStemGain: GainNode | null = null;
  private hearthStemGain: GainNode | null = null;
  private waterStemGain: GainNode | null = null;
  private stemsStarted = false;

  private readonly impulseCache = new Map<ReverbPresetId, AudioBuffer>();
  private readonly zones = new Map<string, AmbientZoneConfig>();
  private readonly overrides: InteriorAcousticOverride[];

  private volumes: AudioVolumeSettings = {
    master: 0.82,
    ambient: 0.78,
    sfx: 0.85,
    music: 0.45,
    muted: false,
  };

  private currentZoneId = 'amb_gate_barbican';
  private currentReverb: ReverbPresetId = 'outdoor_courtyard';
  private oneShotTimer = 0;
  private musicChordTimer = 0;
  private musicStep = 0;
  private transientNodes = 0;
  private windowListenersBound = false;

  constructor() {
    for (const z of audioZonesRaw.ambientZones as AmbientZoneConfig[]) {
      this.zones.set(z.id, z);
    }
    this.overrides = audioZonesRaw.interiorAcousticOverrides as InteriorAcousticOverride[];
    this.loadSavedVolumes();
    this.bindLifecycleListeners();
  }

  private loadSavedVolumes(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AudioVolumeSettings>;
      if (typeof parsed.master === 'number') this.volumes.master = Math.max(0, Math.min(1, parsed.master));
      if (typeof parsed.ambient === 'number') this.volumes.ambient = Math.max(0, Math.min(1, parsed.ambient));
      if (typeof parsed.sfx === 'number') this.volumes.sfx = Math.max(0, Math.min(1, parsed.sfx));
      if (typeof parsed.music === 'number') this.volumes.music = Math.max(0, Math.min(1, parsed.music));
      if (typeof parsed.muted === 'boolean') this.volumes.muted = parsed.muted;
    } catch {
      // Ignore storage parse failures
    }
  }

  private persistVolumes(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volumes));
    } catch {
      // Ignore quota errors
    }
  }

  private bindLifecycleListeners(): void {
    if (typeof window === 'undefined' || this.windowListenersBound) return;
    this.windowListenersBound = true;

    const unlock = () => {
      this.ensureContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend().catch(() => {});
      } else if (!this.volumes.muted) {
        void this.ctx.resume().catch(() => {});
      }
    });
  }

  ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.setupBusGraph(this.ctx);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended' && !this.volumes.muted && (typeof document === 'undefined' || !document.hidden)) {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  getContext(): AudioContext | null {
    return this.ctx;
  }

  private setupBusGraph(ctx: AudioContext): void {
    this.masterGain = ctx.createGain();
    this.ambientBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.reverbSendBus = ctx.createGain();
    this.convolver = ctx.createConvolver();

    this.reverbSendBus.gain.value = 0.28;
    this.convolver.buffer = this.getOrCreateImpulse(ctx, this.currentReverb);

    this.ambientBus.connect(this.masterGain);
    this.sfxBus.connect(this.masterGain);
    this.musicBus.connect(this.masterGain);

    this.reverbSendBus.connect(this.convolver);
    this.convolver.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.applyVolumeGains();
    this.startContinuousAmbientStems(ctx);
  }

  private getOrCreateImpulse(ctx: AudioContext, preset: ReverbPresetId): AudioBuffer {
    const cached = this.impulseCache.get(preset);
    if (cached) return cached;

    const specs: Record<ReverbPresetId, { duration: number; decay: number; damp: number }> = {
      outdoor_courtyard: { duration: 0.65, decay: 3.4, damp: 0.45 },
      outdoor_alley: { duration: 0.88, decay: 2.9, damp: 0.40 },
      semi_open_yard: { duration: 0.76, decay: 3.1, damp: 0.48 },
      timber_tavern: { duration: 0.52, decay: 4.2, damp: 0.68 },
      cathedral_stone: { duration: 2.15, decay: 2.1, damp: 0.32 },
      great_hall_stone: { duration: 1.75, decay: 2.3, damp: 0.36 },
      damp_undercroft_tunnel: { duration: 1.90, decay: 2.0, damp: 0.58 },
    };
    const { duration, decay, damp } = specs[preset] ?? specs.outdoor_courtyard;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);

    let seed = 1337 + preset.length * 97;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296 * 2 - 1;
    };

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const env = Math.pow(1 - t, decay);
        const white = rand();
        lp = lp * damp + white * (1 - damp);
        // Subtle early reflection tap for stone corridors/halls
        const early = i === Math.floor(ctx.sampleRate * 0.024) || i === Math.floor(ctx.sampleRate * 0.049) ? 0.38 : 0;
        data[i] = (lp * env * 0.5 + early * white) * 0.65;
      }
    }
    this.impulseCache.set(preset, buf);
    return buf;
  }

  private createSeamlessPinkNoiseBuffer(ctx: AudioContext, seconds = 4.0): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let seed = 987654321;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const white = (seed / 4294967296) * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.042;
      b6 = white * 0.115926;
    }
    // Crossfade tail into head for zero-click looping
    const fade = Math.min(2048, Math.floor(len * 0.05));
    for (let i = 0; i < fade; i++) {
      const a = i / fade;
      out[i] = out[i] * a + out[len - fade + i] * (1 - a);
    }
    return buf;
  }

  private startContinuousAmbientStems(ctx: AudioContext): void {
    if (this.stemsStarted || !this.ambientBus || !this.reverbSendBus) return;
    this.stemsStarted = true;
    const noiseBuf = this.createSeamlessPinkNoiseBuffer(ctx, 4.0);

    const makeStem = (type: BiquadFilterType, freq: number, q: number, toReverb = 0.18): GainNode => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambientBus!);
      if (toReverb > 0 && this.reverbSendBus) {
        const send = ctx.createGain();
        send.gain.value = toReverb;
        gain.connect(send);
        send.connect(this.reverbSendBus);
      }
      src.start();
      return gain;
    };

    // 4 continuous procedural environmental beds crossfaded cleanly per Cell
    this.windStemGain = makeStem('bandpass', 390, 0.85, 0.15);
    this.crowdStemGain = makeStem('bandpass', 640, 1.45, 0.22);
    this.hearthStemGain = makeStem('lowpass', 280, 0.70, 0.12);
    this.waterStemGain = makeStem('bandpass', 1150, 1.15, 0.42);
  }

  getVolumes(): AudioVolumeSettings {
    return { ...this.volumes };
  }

  setVolume(channel: 'master' | 'ambient' | 'sfx' | 'music', value: number): void {
    this.volumes[channel] = Math.max(0, Math.min(1, value));
    this.persistVolumes();
    this.ensureContext();
    this.applyVolumeGains();
  }

  toggleMute(): boolean {
    this.volumes.muted = !this.volumes.muted;
    this.persistVolumes();
    this.applyVolumeGains();
    return this.volumes.muted;
  }

  isMuted(): boolean {
    return this.volumes.muted;
  }

  private applyVolumeGains(): void {
    if (!this.ctx || !this.masterGain || !this.ambientBus || !this.sfxBus || !this.musicBus) return;
    const now = this.ctx.currentTime;
    const m = this.volumes.muted ? 0 : this.volumes.master;
    this.masterGain.gain.setTargetAtTime(m, now, 0.04);
    this.ambientBus.gain.setTargetAtTime(this.volumes.ambient, now, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, now, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, now, 0.08);
  }

  /**
   * Resolves the current ambient zone & convolution reverb (including enclosed interior overrides)
   * and smoothly crossfades continuous beds + triggers subtle stochastic atmospheric details.
   */
  update(
    dt: number,
    worldZone: ZoneId,
    cellAmbientZoneId: string,
    cellReverb: ReverbPresetId,
    playerPos: Vec3,
    timeOfDay = 13.0,
  ): void {
    let targetZoneId = cellAmbientZoneId;
    let targetReverb: ReverbPresetId = cellReverb;

    if (worldZone === 'ancient_crypt') {
      targetZoneId = 'amb_undercroft';
      targetReverb = 'damp_undercroft_tunnel';
    } else if (worldZone === 'overworld') {
      targetZoneId = 'amb_residential';
      targetReverb = 'outdoor_courtyard';
    } else {
      for (const ov of this.overrides) {
        const b = ov.bounds;
        if (
          playerPos.x >= b.minX &&
          playerPos.x <= b.maxX &&
          playerPos.y >= b.minY &&
          playerPos.y <= b.maxY &&
          playerPos.z >= b.minZ &&
          playerPos.z <= b.maxZ
        ) {
          targetZoneId = ov.ambientZoneId;
          targetReverb = ov.reverb;
          break;
        }
      }
    }

    const zoneChanged = targetZoneId !== this.currentZoneId;
    const reverbChanged = targetReverb !== this.currentReverb;
    this.currentZoneId = targetZoneId;
    this.currentReverb = targetReverb;

    if (!this.ctx || this.volumes.muted || this.ctx.state !== 'running') return;

    const cfg = this.zones.get(targetZoneId);
    const now = this.ctx.currentTime;
    const isDay = timeOfDay >= 6.0 && timeOfDay <= 19.5;
    const dayCrowdScale = isDay ? 1.0 : 0.25;

    if (cfg && this.windStemGain && this.crowdStemGain && this.hearthStemGain && this.waterStemGain) {
      this.windStemGain.gain.setTargetAtTime((cfg.windGain ?? 0.15) * 0.55, now, 0.55);
      this.crowdStemGain.gain.setTargetAtTime((cfg.crowdGain ?? 0.05) * dayCrowdScale * 0.36, now, 0.65);
      this.hearthStemGain.gain.setTargetAtTime((cfg.hearthGain ?? 0.02) * 0.48, now, 0.55);
      this.waterStemGain.gain.setTargetAtTime((cfg.waterGain ?? 0.01) * 0.42, now, 0.55);
    }

    if (reverbChanged && this.convolver) {
      this.convolver.buffer = this.getOrCreateImpulse(this.ctx, targetReverb);
      if (this.reverbSendBus) {
        const wet =
          targetReverb === 'cathedral_stone' || targetReverb === 'damp_undercroft_tunnel'
            ? 0.46
            : targetReverb === 'great_hall_stone'
              ? 0.38
              : 0.22;
        this.reverbSendBus.gain.setTargetAtTime(wet, now, 0.35);
      }
    }

    // Stochastic micro-details (birds, cave drips, sign creaks, tavern clinks, distant chimes)
    this.oneShotTimer += dt;
    if (this.oneShotTimer >= 1.35 && cfg) {
      this.oneShotTimer = 0;
      const r = Math.random();
      if (cfg.dripRate && r < cfg.dripRate) {
        this.playCaveDroplet();
      } else if (isDay && cfg.birdRate && r < cfg.birdRate) {
        this.playHighlandBird();
      } else if (cfg.clinkRate && r < cfg.clinkRate) {
        this.playTavernClink();
      } else if (cfg.creakRate && r < cfg.creakRate * 0.6) {
        this.playTimberCreak();
      } else if (cfg.chimeRate && r < cfg.chimeRate * 0.5) {
        this.playDistantBellHarmonic();
      }
    }

    // Subtle modal lute/harp ambient motif every ~7.5s when music volume > 0
    this.musicChordTimer += dt;
    if ((this.musicChordTimer >= 7.5 || zoneChanged) && this.volumes.music > 0.02) {
      this.musicChordTimer = 0;
      this.playSubtleModalNote(targetZoneId);
    }
  }

  private trackTransient(durationSec: number): void {
    this.transientNodes += 2;
    setTimeout(() => {
      this.transientNodes = Math.max(0, this.transientNodes - 2);
    }, Math.ceil(durationSec * 1000) + 60);
  }

  private playCaveDroplet(): void {
    if (!this.ctx || !this.ambientBus || !this.reverbSendBus) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const base = 920 + Math.random() * 680;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.48, now + 0.065);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ambientBus);
    gain.connect(this.reverbSendBus);
    osc.start(now);
    osc.stop(now + 0.095);
    this.trackTransient(0.1);
  }

  private playHighlandBird(): void {
    if (!this.ctx || !this.ambientBus) return;
    const now = this.ctx.currentTime;
    for (let k = 0; k < 2; k++) {
      const t = now + k * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const f0 = 2450 + Math.random() * 650;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * (k === 0 ? 1.18 : 0.88), t + 0.07);
      gain.gain.setValueAtTime(0.026, t);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.075);
      osc.connect(gain);
      gain.connect(this.ambientBus);
      osc.start(t);
      osc.stop(t + 0.08);
      this.trackTransient(0.18);
    }
  }

  private playTavernClink(): void {
    if (!this.ctx || !this.ambientBus) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1760 + Math.random() * 420, now);
    gain.gain.setValueAtTime(0.032, now);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ambientBus);
    osc.start(now);
    osc.stop(now + 0.13);
    this.trackTransient(0.13);
  }

  private playTimberCreak(): void {
    if (!this.ctx || !this.ambientBus) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115 + Math.random() * 35, now);
    osc.frequency.linearRampToValueAtTime(88, now + 0.28);
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 3.2;
    gain.gain.setValueAtTime(0.025, now);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.30);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientBus);
    osc.start(now);
    osc.stop(now + 0.31);
    this.trackTransient(0.31);
  }

  private playDistantBellHarmonic(): void {
    if (!this.ctx || !this.ambientBus || !this.reverbSendBus) return;
    const now = this.ctx.currentTime;
    for (const [mult, amp] of [
      [1.0, 0.04],
      [2.0, 0.02],
      [2.42, 0.014],
    ] as const) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 293.66 * mult; // D4 bronze bell
      gain.gain.setValueAtTime(amp, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 2.1);
      osc.connect(gain);
      gain.connect(this.reverbSendBus);
      osc.start(now);
      osc.stop(now + 2.15);
      this.trackTransient(2.15);
    }
  }

  private playSubtleModalNote(zoneId: string): void {
    if (!this.ctx || !this.musicBus || !this.reverbSendBus) return;
    // D-Dorian medieval lute/harp intervals: D3, F3, G3, A3, C4, D4, E4, F4
    const scale =
      zoneId === 'amb_undercroft'
        ? [146.83, 174.61, 220.0, 164.81]
        : [220.0, 261.63, 293.66, 329.63, 392.0, 440.0];
    const freq = scale[this.musicStep % scale.length];
    this.musicStep++;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.048, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 2.4);
    osc.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverbSendBus);
    osc.start(now);
    osc.stop(now + 2.45);
    this.trackTransient(2.45);
  }

  getActiveZoneId(): string {
    return this.currentZoneId;
  }

  getActiveReverb(): ReverbPresetId {
    return this.currentReverb;
  }

  getActiveNodeCount(): number {
    // 6 persistent bus/convolver nodes + 8 continuous stem nodes when initialized + transient nodes
    const base = this.stemsStarted ? 14 : 0;
    return base + this.transientNodes;
  }
}
