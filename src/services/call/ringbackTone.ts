/** Neutral ringback loaded from the app bundle; no remote or copyrighted audio. */
class RingbackTone {
  private audio: HTMLAudioElement | null = null;
  private running = false;

  async start() {
    if (this.running || typeof Audio === 'undefined') return;
    this.running = true;
    const audio = new Audio('/audio/ringback.wav');
    audio.loop = true;
    audio.volume = 0.22;
    audio.preload = 'auto';
    this.audio = audio;
    await audio.play().catch(() => { this.running = false; });
  }

  stop() {
    this.running = false;
    this.audio?.pause();
    if (this.audio) this.audio.currentTime = 0;
    this.audio = null;
  }
}

export const ringbackTone = new RingbackTone();
