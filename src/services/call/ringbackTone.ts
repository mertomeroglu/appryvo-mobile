/** Neutral, synthesized ringback. The oscillator data ships in-app; no remote/copyrighted audio. */
class RingbackTone {
  private context: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private running = false;

  async start() {
    if (this.running || typeof AudioContext === 'undefined') return;
    this.running = true;
    this.context = new AudioContext();
    await this.context.resume().catch(() => {});
    this.schedulePulse();
  }

  private schedulePulse = () => {
    if (!this.running || !this.context) return;
    this.stopOscillators();
    const gain = this.context.createGain();
    gain.gain.value = 0.045;
    gain.connect(this.context.destination);
    this.gain = gain;
    this.oscillators = [440, 480].map((frequency) => {
      const oscillator = this.context!.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start();
      return oscillator;
    });
    window.setTimeout(() => this.stopOscillators(), 900);
    this.timer = window.setTimeout(this.schedulePulse, 3000);
  };

  private stopOscillators() {
    this.oscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* stopped */ } });
    this.oscillators = [];
    this.gain?.disconnect();
    this.gain = null;
  }

  stop() {
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.stopOscillators();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}

export const ringbackTone = new RingbackTone();
