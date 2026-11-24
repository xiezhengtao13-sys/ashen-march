import { AmbientAudioManager, type AudioVolumeSettings } from '../audio/AmbientAudioManager';

/**
 * Procedural WebAudio synthesizer for zero-dependency game sound effects,
 * sharing the unified Master/Ambient/SFX/Music bus graph with AmbientAudioManager.
 */
export class AudioSystem {
  readonly ambient = new AmbientAudioManager();

  get muted(): boolean {
    return this.ambient.isMuted();
  }

  set muted(val: boolean) {
    if (val !== this.ambient.isMuted()) {
      this.ambient.toggleMute();
    }
  }

  toggleMute(): boolean {
    return this.ambient.toggleMute();
  }

  getVolumes(): AudioVolumeSettings {
    return this.ambient.getVolumes();
  }

  setVolume(channel: 'master' | 'ambient' | 'sfx' | 'music', value: number): void {
    this.ambient.setVolume(channel, value);
  }

  playTone(freq: number, endFreq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.12): void {
    if (this.ambient.isMuted()) return;
    const ctx = this.ambient.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ambient.sfxBus ?? ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playSwordSwing(): void {
    this.playTone(340, 120, 0.14, 'triangle', 0.11);
  }

  playHit(isMagic: boolean): void {
    if (isMagic) {
      this.playTone(180, 55, 0.25, 'sawtooth', 0.15);
    } else {
      this.playTone(160, 65, 0.12, 'square', 0.1);
    }
  }

  playFireballCast(): void {
    this.playTone(520, 210, 0.22, 'sawtooth', 0.11);
  }

  playExplosion(): void {
    this.playTone(140, 38, 0.32, 'sawtooth', 0.18);
  }

  playLoot(): void {
    this.playTone(620, 920, 0.12, 'sine', 0.1);
  }

  playQuestComplete(): void {
    this.playTone(440, 660, 0.22, 'triangle', 0.12);
    setTimeout(() => this.playTone(660, 880, 0.28, 'triangle', 0.12), 110);
  }

  playLevelUp(): void {
    this.playTone(392, 523, 0.2, 'triangle', 0.13);
    setTimeout(() => this.playTone(523, 784, 0.35, 'triangle', 0.14), 140);
  }

  playPlayerHurt(): void {
    this.playTone(130, 70, 0.16, 'sawtooth', 0.14);
  }
}
