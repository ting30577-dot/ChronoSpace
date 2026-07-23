const SCENE_AUDIO_KEY = "chronospace.sceneAudio.v1";

const SCENE_AUDIO = {
  rain: {
    name: "雨夜咖啡",
    subtitle: "RAIN CAFE",
    src: "assets/audio/rain-window.wav",
    track: "Rain on Window Loop",
    author: "alxl",
    license: "CC0",
  },
  spring: {
    name: "春野纸鸢",
    subtitle: "WATERCOLOR FIELD",
    src: "assets/audio/childhood.mp3",
    track: "Childhood",
    author: "Scott Buckley",
    license: "CC BY 4.0",
  },
  mechanical: {
    name: "锈线核心",
    subtitle: "RUSTLINE CORE",
    src: "assets/audio/machina.mp3",
    track: "Machina",
    author: "Scott Buckley",
    license: "CC BY 4.0",
  },
  montage: {
    name: "玻璃漫游",
    subtitle: "GLASS REVERIE",
    src: "assets/audio/sleep.mp3",
    track: "Sleep",
    author: "Scott Buckley",
    license: "CC BY 4.0",
  },
};

function readSceneAudioSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SCENE_AUDIO_KEY) || "{}");
    return {
      volume: Math.min(100, Math.max(0, Number(stored.volume) || 42)),
      muted: Boolean(stored.muted),
    };
  } catch {
    return { volume: 42, muted: false };
  }
}

class AmbientAudioEngine {
  constructor() {
    const settings = readSceneAudioSettings();
    this.volume = settings.volume;
    this.muted = settings.muted;
    this.scene = "rain";
    this.audio = null;
    this.audioScene = null;
    this.isPlaying = false;
    this.fadeFrame = null;
    this.context = null;
  }

  getMeta(scene = this.scene) {
    return SCENE_AUDIO[scene] || SCENE_AUDIO.rain;
  }

  select(scene) {
    if (!SCENE_AUDIO[scene]) return this.getMeta();
    this.scene = scene;
    return this.getMeta(scene);
  }

  async unlock() {
    // Playback is intentionally started from the user's launch click.
    return true;
  }

  async play(scene = this.scene) {
    this.select(scene);
    const meta = this.getMeta();

    if (!this.audio || this.audioScene !== this.scene) {
      if (this.audio) {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
      }

      this.audio = new Audio(new URL(meta.src, document.baseURI).href);
      this.audio.preload = "auto";
      this.audio.loop = true;
      this.audio.playsInline = true;
      this.audioScene = this.scene;
    }

    cancelAnimationFrame(this.fadeFrame);
    this.audio.volume = 0;
    this.audio.muted = this.muted;

    try {
      await this.audio.play();
      this.isPlaying = true;
      this.fadeTo(this.targetVolume(), 650);
      return meta;
    } catch (error) {
      this.isPlaying = false;
      throw new Error(`无法播放“${meta.track}”：${error.message}`);
    }
  }

  pause() {
    if (!this.audio) return;
    cancelAnimationFrame(this.fadeFrame);
    this.audio.pause();
    this.isPlaying = false;
  }

  stop() {
    if (!this.audio) return;
    this.pause();
    try { this.audio.currentTime = 0; } catch { /* Metadata may not be loaded yet. */ }
  }

  setVolume(value) {
    this.volume = Math.min(100, Math.max(0, Number(value) || 0));
    if (this.audio) this.audio.volume = this.targetVolume();
    this.persist();
    return this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.audio) this.audio.muted = this.muted;
    this.persist();
    return this.muted;
  }

  targetVolume() {
    const normalized = this.volume / 100;
    return Math.min(1, normalized * normalized * 1.35);
  }

  fadeTo(target, duration) {
    if (!this.audio) return;
    const startedAt = performance.now();
    const initial = this.audio.volume;
    const step = (time) => {
      if (!this.audio) return;
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.audio.volume = initial + (target - initial) * eased;
      if (progress < 1) this.fadeFrame = requestAnimationFrame(step);
    };
    this.fadeFrame = requestAnimationFrame(step);
  }

  getState() {
    return {
      scene: this.scene,
      volume: this.volume,
      muted: this.muted,
      isPlaying: this.isPlaying,
      meta: this.getMeta(),
    };
  }

  persist() {
    try {
      localStorage.setItem(SCENE_AUDIO_KEY, JSON.stringify({
        volume: this.volume,
        muted: this.muted,
      }));
    } catch {
      // Audio remains available for the current session without persistence.
    }
  }

  async playCompletionChime() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();

    const now = this.context.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.07, now + index * 0.08 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42 + index * 0.08);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + 0.55 + index * 0.08);
    });
  }
}

