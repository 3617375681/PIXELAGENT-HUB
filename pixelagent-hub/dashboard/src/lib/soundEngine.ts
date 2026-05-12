// 8-bit sound effects using Web Audio API
class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  constructor() {
    this.enabled = true;
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
  }

  isEnabled() {
    return this.enabled;
  }

  // Classic 8-bit square wave
  playTone(frequency: number, duration: number, type: OscillatorType = 'square', volume = 0.1) {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = volume;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not available
    }
  }

  // Sound presets
  click() {
    this.playTone(880, 0.05, 'square', 0.05);
  }

  hover() {
    this.playTone(440, 0.03, 'sine', 0.03);
  }

  success() {
    this.playTone(523, 0.1, 'square', 0.08);
    setTimeout(() => this.playTone(659, 0.1, 'square', 0.08), 100);
    setTimeout(() => this.playTone(784, 0.2, 'square', 0.08), 200);
  }

  error() {
    this.playTone(200, 0.15, 'sawtooth', 0.1);
    setTimeout(() => this.playTone(150, 0.2, 'sawtooth', 0.1), 150);
  }

  typing() {
    this.playTone(1200 + Math.random() * 400, 0.02, 'square', 0.02);
  }

  message() {
    this.playTone(600, 0.08, 'square', 0.05);
    setTimeout(() => this.playTone(800, 0.12, 'square', 0.05), 80);
  }

  packetSend() {
    this.playTone(1000, 0.06, 'square', 0.04);
    setTimeout(() => this.playTone(1400, 0.06, 'square', 0.04), 60);
  }

  openPanel() {
    this.playTone(300, 0.08, 'square', 0.06);
    setTimeout(() => this.playTone(400, 0.1, 'square', 0.06), 100);
    setTimeout(() => this.playTone(500, 0.12, 'square', 0.06), 200);
  }

  closePanel() {
    this.playTone(500, 0.08, 'square', 0.06);
    setTimeout(() => this.playTone(400, 0.1, 'square', 0.06), 100);
    setTimeout(() => this.playTone(300, 0.12, 'square', 0.06), 200);
  }

  statusChange(status: string) {
    switch (status) {
      case 'thinking':
        this.playTone(440, 0.1, 'square', 0.05);
        setTimeout(() => this.playTone(554, 0.1, 'square', 0.05), 100);
        break;
      case 'done':
        this.success();
        break;
      case 'error':
        this.error();
        break;
      default:
        this.click();
    }
  }
}

export const soundEngine = new SoundEngine();
