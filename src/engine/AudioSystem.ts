/**
 * Procedural WebAudio synthesizer for zero-dependency game sound effects.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq: number, endFreq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.12): void {
    const ctx = this.ensureContext();
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
    gain.connect(ctx.destination);
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
