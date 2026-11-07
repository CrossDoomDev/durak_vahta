(function (root) {
  class VahtaAudio {
    constructor(settings) {
      this.settings = settings;
      this.unlocked = false;
      this.paused = false;
      this.pool = new Set();
      this.music = null;
      this.wind = null;
    }
    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      this.update(this.settings);
      this.kettleTimer = setInterval(() => this.play("kettle"), 45000);
    }
    update(settings) {
      this.settings = settings;
      if (!this.unlocked) return;
      if (!this.music) {
        this.music = new Audio("public/assets/audio/music.wav");
        this.music.loop = true;
      }
      if (!this.wind) {
        this.wind = new Audio("public/assets/audio/wind.wav");
        this.wind.loop = true;
      }
      this.wind.volume = settings.sfx * 0.05;
      if (this.paused || !settings.sfx) this.wind.pause();
      else if (this.wind.paused) this.wind.play().catch(() => {});
      this.music.volume = settings.music * 0.45;
      if (this.paused || !settings.music) this.music.pause();
      else if (this.music.paused) this.music.play().catch(() => {});
      for (const a of this.pool) a.volume = settings.sfx * 0.55;
      if (!settings.sfx) for (const a of this.pool) a.pause();
    }
    play(name) {
      if (!this.unlocked || this.paused || !this.settings.sfx) return;
      const a = new Audio("public/assets/audio/" + name + ".wav");
      a.volume = this.settings.sfx * 0.55;
      this.pool.add(a);
      a.onended = a.onerror = () => this.pool.delete(a);
      a.play().catch(() => this.pool.delete(a));
    }
    pause(value) {
      this.paused = value;
      if (value) for (const a of this.pool) a.pause();
      this.update(this.settings);
    }
  }
  root.VahtaAudio = VahtaAudio;
})(globalThis);
