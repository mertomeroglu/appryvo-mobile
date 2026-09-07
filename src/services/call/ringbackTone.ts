/** Neutral call tones loaded from the app bundle; no remote or copyrighted audio. */
class CallTone {
  private audio: HTMLAudioElement | null = null;
  private running = false;

  /**
   * `volume` differs by role: the caller's ringback is a background confirmation that the other
   * side is being rung, while the callee's ring has to actually be noticed, so it plays loud.
   */
  async start(volume: number) {
    if (this.running || typeof Audio === 'undefined') return;
    this.running = true;
    const audio = new Audio('/audio/ringback.wav');
    audio.loop = true;
    audio.volume = volume;
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

export const ringbackTone = new CallTone();
