const TIMER_KEY = "chronospace.timer.v1";

const DEFAULT_DURATIONS = {
  focus: 25,
  short: 5,
  long: 15,
};

function readStoredTimer() {
  try {
    return JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

class PomodoroTimer {
  constructor(options = {}) {
    this.onTick = options.onTick || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onFocusElapsed = options.onFocusElapsed || (() => {});
    this.durations = this.sanitizeDurations(options.durations || DEFAULT_DURATIONS);
    this.mode = "focus";
    this.isRunning = false;
    this.endAt = null;
    this.focusCycle = 0;
    this.totalSeconds = this.durations.focus * 60;
    this.remaining = this.totalSeconds;
    this.lastWholeSecond = Math.ceil(this.remaining);
    this.interval = null;

    this.restore();
    this.emit();

    if (this.isRunning) {
      this.startInterval();
      queueMicrotask(() => this.tick());
    }
  }

  sanitizeDurations(durations) {
    return {
      focus: clamp(durations.focus, 1, 180),
      short: clamp(durations.short, 1, 60),
      long: clamp(durations.long, 1, 90),
    };
  }

  restore() {
    const stored = readStoredTimer();
    if (!stored || !["focus", "short", "long"].includes(stored.mode)) return;

    this.mode = stored.mode;
    this.focusCycle = clamp(stored.focusCycle ?? 0, 0, 3);
    this.totalSeconds = this.durations[this.mode] * 60;

    if (stored.isRunning && Number.isFinite(stored.endAt)) {
      this.endAt = stored.endAt;
      this.remaining = Math.max(0, (stored.endAt - Date.now()) / 1000);
      this.isRunning = this.remaining > 0;
    } else if (Number.isFinite(stored.remaining)) {
      this.remaining = clamp(stored.remaining, 0, this.totalSeconds);
    }

    this.lastWholeSecond = Number.isFinite(stored.lastWholeSecond)
      ? stored.lastWholeSecond
      : Math.ceil(this.remaining);

    if (this.remaining <= 0) {
      this.remaining = this.totalSeconds;
      this.lastWholeSecond = Math.ceil(this.remaining);
    }
  }

  startInterval() {
    window.clearInterval(this.interval);
    this.interval = window.setInterval(() => this.tick(), 250);
  }

  tick() {
    if (!this.isRunning) return;

    const nextRemaining = Math.max(0, (this.endAt - Date.now()) / 1000);
    const wholeSecond = Math.ceil(nextRemaining);

    if (wholeSecond < this.lastWholeSecond) {
      const elapsed = this.lastWholeSecond - wholeSecond;
      if (this.mode === "focus") this.onFocusElapsed(elapsed);
      this.lastWholeSecond = wholeSecond;
      this.persist();
    }

    this.remaining = nextRemaining;
    this.emit();

    if (nextRemaining <= 0) this.finish();
  }

  toggle() {
    this.isRunning ? this.pause() : this.start();
  }

  start() {
    if (this.isRunning) return;
    if (this.remaining <= 0) this.remaining = this.totalSeconds;
    this.endAt = Date.now() + this.remaining * 1000;
    this.lastWholeSecond = Math.ceil(this.remaining);
    this.isRunning = true;
    this.startInterval();
    this.persist();
    this.emit();
  }

  pause() {
    if (!this.isRunning) return;
    this.remaining = Math.max(0, (this.endAt - Date.now()) / 1000);
    this.lastWholeSecond = Math.ceil(this.remaining);
    this.isRunning = false;
    this.endAt = null;
    window.clearInterval(this.interval);
    this.persist();
    this.emit();
  }

  reset() {
    this.isRunning = false;
    this.endAt = null;
    window.clearInterval(this.interval);
    this.totalSeconds = this.durations[this.mode] * 60;
    this.remaining = this.totalSeconds;
    this.lastWholeSecond = Math.ceil(this.remaining);
    this.persist();
    this.emit();
  }

  setMode(mode) {
    if (!["focus", "short", "long"].includes(mode)) return;
    this.mode = mode;
    this.reset();
  }

  skip() {
    const nextMode = this.mode === "focus" ? "short" : "focus";
    this.setMode(nextMode);
    return nextMode;
  }

  finish() {
    const completedMode = this.mode;
    this.isRunning = false;
    this.endAt = null;
    this.remaining = 0;
    window.clearInterval(this.interval);

    if (completedMode === "focus") {
      this.focusCycle = (this.focusCycle + 1) % 4;
    }

    const nextMode = completedMode === "focus"
      ? (this.focusCycle === 0 ? "long" : "short")
      : "focus";

    this.persist();
    this.emit();
    this.onComplete({ mode: completedMode, nextMode, focusCycle: this.focusCycle });
  }

  updateDurations(durations) {
    this.durations = this.sanitizeDurations(durations);
    this.reset();
  }

  getSnapshot() {
    return {
      mode: this.mode,
      isRunning: this.isRunning,
      remaining: this.remaining,
      totalSeconds: this.totalSeconds,
      progress: this.totalSeconds ? this.remaining / this.totalSeconds : 0,
      focusCycle: this.focusCycle,
      durations: { ...this.durations },
    };
  }

  emit() {
    this.onTick(this.getSnapshot());
  }

  persist() {
    const state = {
      mode: this.mode,
      isRunning: this.isRunning,
      endAt: this.endAt,
      remaining: this.remaining,
      lastWholeSecond: this.lastWholeSecond,
      focusCycle: this.focusCycle,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify(state));
    } catch {
      // A blocked storage API should never break the timer itself.
    }
  }
}
