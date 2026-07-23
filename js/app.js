const PREFERENCES_KEY = "chronospace.preferences.v1";
const STATS_KEY = "chronospace.stats.v1";

const DEFAULT_PREFERENCES = {
  theme: "neon-cyber",
  durations: { focus: 25, short: 5, long: 15 },
  dailyGoal: 120,
  notificationSound: true,
  scene: "rain",
};

const MODE_COPY = {
  focus: { kicker: "DEEP WORK", label: "深度专注", action: "开始专注" },
  short: { kicker: "QUICK RESET", label: "短休憩", action: "开始休憩" },
  long: { kicker: "FULL RECOVERY", label: "长休憩", action: "开始休憩" },
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function loadPreferences() {
  const stored = readJson(PREFERENCES_KEY, {});
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    durations: { ...DEFAULT_PREFERENCES.durations, ...(stored.durations || {}) },
  };
}

class FocusStats {
  constructor() {
    const stored = readJson(STATS_KEY, {});
    this.history = stored && typeof stored === "object" ? stored : {};
    this.ensureToday();
  }

  ensureToday() {
    const key = localDateKey();
    if (!this.history[key]) this.history[key] = { focusSeconds: 0, pomodoros: 0 };
    return this.history[key];
  }

  addFocusSeconds(seconds) {
    const today = this.ensureToday();
    today.focusSeconds = Math.max(0, Math.round((today.focusSeconds || 0) + seconds));
    this.persist();
  }

  completePomodoro() {
    const today = this.ensureToday();
    today.pomodoros = Math.max(0, Number(today.pomodoros) || 0) + 1;
    this.persist();
  }

  getToday() {
    return this.ensureToday();
  }

  getStreak() {
    let cursor = new Date();
    const todayEntry = this.history[localDateKey(cursor)];
    if (!todayEntry || (!todayEntry.focusSeconds && !todayEntry.pomodoros)) {
      cursor.setDate(cursor.getDate() - 1);
    }

    let streak = 0;
    while (streak < 3650) {
      const entry = this.history[localDateKey(cursor)];
      if (!entry || (!entry.focusSeconds && !entry.pomodoros)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  persist() {
    const keys = Object.keys(this.history).sort().slice(-120);
    this.history = Object.fromEntries(keys.map((key) => [key, this.history[key]]));
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(this.history));
    } catch {
      // Stats stay available in memory when private mode blocks storage.
    }
  }
}

const preferences = loadPreferences();
const stats = new FocusStats();
document.documentElement.dataset.theme = preferences.theme;

const elements = {
  timerPanel: document.querySelector(".timer-panel"),
  timerDisplay: document.querySelector("#timer-display"),
  timerProgress: document.querySelector("#timer-progress"),
  timerKicker: document.querySelector("#timer-kicker"),
  timerState: document.querySelector("#timer-state"),
  toggleTimer: document.querySelector("#toggle-timer"),
  toggleLabel: document.querySelector("#toggle-label"),
  moduleStatus: document.querySelector(".module-status"),
  cycleLabel: document.querySelector("#cycle-label"),
  cyclePips: [...document.querySelectorAll("#cycle-pips i")],
  orbitDuration: document.querySelector(".orbit-label-bottom"),
  activeMission: document.querySelector("#active-mission"),
  activeTaskTitle: document.querySelector("#active-task-title"),
  clearActiveTask: document.querySelector("#clear-active-task"),
  themeSelect: document.querySelector("#theme-select"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  selectedSceneName: document.querySelector("#selected-scene-name"),
  sceneVolume: document.querySelector("#scene-volume"),
  sceneVolumeOutput: document.querySelector("#scene-volume-output"),
  immersiveVolume: document.querySelector("#immersive-volume"),
  immersiveMute: document.querySelector("#immersive-mute"),
  immersiveSceneLabel: document.querySelector("#immersive-scene-label"),
};

const background = new CyberBackground(document.querySelector("#cyber-background"));
const completionBurst = new CompletionBurst(document.querySelector("#completion-canvas"));
const audio = new AmbientAudioEngine();
const sceneAnimator = new ImmersiveSceneAnimator(
  document.querySelector("#immersive-backdrop"),
  document.querySelector("#immersive-scene-image"),
  document.querySelector("#immersive-effects"),
);
let kanban;
let immersiveMode = false;
let selectedScene = IMMERSIVE_SCENES[preferences.scene] ? preferences.scene : "rain";

const timer = new PomodoroTimer({
  durations: preferences.durations,
  onTick: renderTimer,
  onFocusElapsed: (seconds) => {
    stats.addFocusSeconds(seconds);
    renderStats();
  },
  onComplete: handleTimerComplete,
});

kanban = new KanbanBoard({
  onComplete: ({ point }) => completionBurst.burst(point?.x, point?.y),
  onActiveTaskChange: renderActiveTask,
  onToast: showToast,
});

initialize();

function initialize() {
  elements.themeSelect.value = preferences.theme;
  renderStats();
  initializeClock();
  initializeTimerControls();
  initializeSceneControls();
  initializeSettings();
  initializeTheme();
  initializeImmersiveMode();
  initializeKeyboardShortcuts();
  renderTimer(timer.getSnapshot());

  elements.clearActiveTask.addEventListener("click", () => kanban.setActiveTask(null));
}

function initializeTimerControls() {
  elements.toggleTimer.addEventListener("click", toggleFocusSession);

  document.querySelector("#reset-timer").addEventListener("click", () => {
    timer.reset();
    audio.stop();
    showToast("计时核心已重置");
  });

  document.querySelector("#skip-timer").addEventListener("click", () => {
    const nextMode = timer.skip();
    audio.stop();
    showToast(`已切换至${MODE_COPY[nextMode].label}`);
  });

  document.querySelectorAll(".mode-button").forEach((button) => {
    button.addEventListener("click", () => timer.setMode(button.dataset.mode));
  });
}

function renderTimer(snapshot) {
  const secondsLeft = Math.max(0, Math.ceil(snapshot.remaining));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const copy = MODE_COPY[snapshot.mode];
  const modeDuration = snapshot.durations[snapshot.mode];

  elements.timerDisplay.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  elements.timerProgress.style.strokeDashoffset = String(100 - snapshot.progress * 100);
  elements.timerKicker.textContent = copy.kicker;
  elements.orbitDuration.textContent = `${modeDuration.toFixed(2)} MIN CYCLE`;
  elements.timerPanel.classList.toggle("is-running", snapshot.isRunning);
  elements.toggleLabel.textContent = snapshot.isRunning
    ? "暂停计时"
    : snapshot.remaining < snapshot.totalSeconds
      ? "继续沉浸"
      : "开始沉浸";
  elements.timerState.textContent = snapshot.isRunning
    ? "信号同步中"
    : snapshot.remaining < snapshot.totalSeconds
      ? "计时已暂停"
      : "等待启动";
  elements.moduleStatus.lastChild.textContent = snapshot.isRunning ? " ACTIVE" : " READY";
  elements.cycleLabel.textContent = `${snapshot.focusCycle} / 4`;
  elements.cyclePips.forEach((pip, index) => pip.classList.toggle("is-filled", index < snapshot.focusCycle));
  background.setRunning(snapshot.isRunning);

  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.mode === snapshot.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.title = snapshot.isRunning
    ? `${elements.timerDisplay.textContent} · ${copy.label} | ChronoSpace`
    : "ChronoSpace · Cyber Focus Station";
}

function handleTimerComplete({ mode, nextMode }) {
  audio.pause();
  if (mode === "focus") {
    stats.completePomodoro();
    renderStats();
  }

  completionBurst.burst(window.innerWidth / 2, window.innerHeight * 0.44);
  showToast(mode === "focus" ? "专注周期完成 · 做得漂亮" : "休憩完成 · 重新接入任务轨道");
  if (preferences.notificationSound) audio.playCompletionChime().catch(() => {});

  window.setTimeout(() => timer.setMode(nextMode), 850);
}

function renderActiveTask(task) {
  elements.activeTaskTitle.textContent = task?.title || "尚未选择任务";
  elements.activeMission.classList.toggle("has-task", Boolean(task));
  elements.clearActiveTask.hidden = !task;
}

function renderStats() {
  const today = stats.getToday();
  const minutes = Math.floor((today.focusSeconds || 0) / 60);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const focusStat = document.querySelector("#focus-time-stat");
  focusStat.innerHTML = hours
    ? `${hours}<span>h</span>${remainder ? ` ${remainder}<span>m</span>` : ""}`
    : `${minutes}<span>m</span>`;

  document.querySelector("#pomodoro-stat").textContent = today.pomodoros || 0;
  document.querySelector("#streak-stat").innerHTML = `${stats.getStreak()}<span>d</span>`;
  document.querySelector("#focus-goal").textContent = `目标 ${preferences.dailyGoal}m`;

  const progress = Math.min(100, Math.round((minutes / preferences.dailyGoal) * 100));
  document.querySelector("#daily-progress-label").textContent = `${progress}%`;
  document.querySelector("#daily-progress-bar").style.width = `${progress}%`;
  document.querySelectorAll("#pomodoro-bars i").forEach((bar, index) => {
    bar.classList.toggle("is-filled", index < Math.min(4, today.pomodoros || 0));
  });

  const now = new Date();
  document.querySelector("#today-date").textContent = `${String(now.getMonth() + 1).padStart(2, "0")} / ${String(now.getDate()).padStart(2, "0")}`;
}

function initializeClock() {
  const timeElement = document.querySelector("#system-time");
  const update = () => {
    const now = new Date();
    timeElement.textContent = now.toLocaleTimeString("zh-CN", { hour12: false });
  };
  update();
  window.setInterval(update, 1000);
}

function initializeSceneControls() {
  const state = audio.getState();
  selectScene(selectedScene);
  syncVolumeControls(state.volume);
  updateMuteControl(state.muted);

  document.querySelectorAll(".scene-card").forEach((card) => {
    card.addEventListener("click", () => selectScene(card.dataset.scene));
  });

  [elements.sceneVolume, elements.immersiveVolume].forEach((control) => {
    control.addEventListener("input", () => {
      const volume = audio.setVolume(control.value);
      syncVolumeControls(volume);
    });
  });

  elements.immersiveMute.addEventListener("click", () => {
    updateMuteControl(audio.toggleMute());
  });
}

function selectScene(scene) {
  selectedScene = IMMERSIVE_SCENES[scene] ? scene : "rain";
  preferences.scene = selectedScene;
  const meta = audio.select(selectedScene);
  const visual = sceneAnimator.setScene(selectedScene);
  elements.selectedSceneName.textContent = visual.name;
  elements.immersiveSceneLabel.textContent = visual.name;
  document.querySelectorAll(".scene-card").forEach((card) => {
    const active = card.dataset.scene === selectedScene;
    card.classList.toggle("is-selected", active);
    card.setAttribute("aria-checked", String(active));
  });
  persistPreferences();
  return meta;
}

function syncVolumeControls(value) {
  [elements.sceneVolume, elements.immersiveVolume].forEach((control) => {
    control.value = value;
    control.style.setProperty("--range-fill", `${value}%`);
  });
  elements.sceneVolumeOutput.textContent = value;
}

function updateMuteControl(muted) {
  elements.immersiveMute.setAttribute("aria-pressed", String(muted));
  elements.immersiveMute.textContent = muted ? "声音 OFF" : "声音 ON";
}

async function toggleFocusSession() {
  if (timer.getSnapshot().isRunning) {
    timer.pause();
    audio.pause();
    return;
  }

  try {
    await audio.play(selectedScene);
  } catch (error) {
    showToast(`${error.message}；计时仍会继续`);
  }
  timer.start();
  enterImmersiveMode();
}

function initializeSettings() {
  document.querySelector("#settings-button").addEventListener("click", openSettings);
  elements.settingsDialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => elements.settingsDialog.close());
  });
  elements.settingsDialog.addEventListener("click", (event) => {
    if (event.target === elements.settingsDialog) elements.settingsDialog.close();
  });

  elements.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    preferences.durations = {
      focus: Number(document.querySelector("#focus-duration").value),
      short: Number(document.querySelector("#short-duration").value),
      long: Number(document.querySelector("#long-duration").value),
    };
    preferences.dailyGoal = Math.min(720, Math.max(10, Number(document.querySelector("#daily-goal").value) || 120));
    preferences.notificationSound = document.querySelector("#notification-sound").checked;
    persistPreferences();
    timer.updateDurations(preferences.durations);
    renderStats();
    elements.settingsDialog.close();
    showToast("系统配置已保存");
  });
}

function openSettings() {
  const durations = timer.getSnapshot().durations;
  document.querySelector("#focus-duration").value = durations.focus;
  document.querySelector("#short-duration").value = durations.short;
  document.querySelector("#long-duration").value = durations.long;
  document.querySelector("#daily-goal").value = preferences.dailyGoal;
  document.querySelector("#notification-sound").checked = preferences.notificationSound;
  elements.settingsDialog.showModal();
}

function initializeTheme() {
  elements.themeSelect.addEventListener("change", () => {
    applyTheme(elements.themeSelect.value);
    showToast(`主题协议已切换：${elements.themeSelect.selectedOptions[0].text}`);
  });
}

function applyTheme(theme) {
  const supported = ["neon-cyber", "tokyo-night", "matrix-green", "synthwave-sunset"];
  preferences.theme = supported.includes(theme) ? theme : "neon-cyber";
  document.documentElement.dataset.theme = preferences.theme;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  background.refreshColors();
  persistPreferences();
}

function initializeImmersiveMode() {
  document.querySelector("#zen-button").addEventListener("click", async () => {
    if (immersiveMode) {
      exitImmersiveMode();
      return;
    }
    try {
      await audio.play(selectedScene);
    } catch (error) {
      showToast(error.message);
    }
    enterImmersiveMode();
  });
  document.querySelector("#immersive-exit").addEventListener("click", exitImmersiveMode);
}

function enterImmersiveMode() {
  immersiveMode = true;
  document.body.classList.add("immersive-mode");
  document.body.dataset.immersiveScene = selectedScene;
  document.querySelector("#zen-button").setAttribute("aria-pressed", "true");
  sceneAnimator.start();
}

function exitImmersiveMode() {
  immersiveMode = false;
  document.body.classList.remove("immersive-mode");
  delete document.body.dataset.immersiveScene;
  document.querySelector("#zen-button").setAttribute("aria-pressed", "false");
  sceneAnimator.stop();
  audio.pause();
  if (timer.getSnapshot().isRunning) timer.pause();
  showToast("已暂停并返回任务控制台");
}

function toggleImmersiveMode() {
  immersiveMode ? exitImmersiveMode() : enterImmersiveMode();
}

function initializeKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping = target.matches("input, select, textarea") || target.isContentEditable;
    const dialogOpen = document.querySelector("dialog[open]");
    if (isTyping || dialogOpen) return;

    if (event.code === "Space") {
      event.preventDefault();
      toggleFocusSession();
    }
    if (event.key.toLowerCase() === "r") {
      timer.reset();
      audio.stop();
    }
    if (event.key.toLowerCase() === "z") toggleImmersiveMode();
    if (event.key.toLowerCase() === "n" && !immersiveMode) kanban.openCreate();
  });
}

function persistPreferences() {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // The app remains fully usable for the current session without persistence.
  }
}

function showToast(message) {
  const region = document.querySelector("#toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 260);
  }, 2800);
}
