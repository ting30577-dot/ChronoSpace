const TASKS_KEY = "chronospace.tasks.v1";
const ACTIVE_TASK_KEY = "chronospace.activeTask.v1";
const COLUMNS = ["todo", "progress", "done"];

const STARTER_TASKS = [
  {
    id: "signal-launch",
    title: "完成 ChronoSpace 的第一次深度专注",
    priority: "high",
    pomodoros: 1,
    column: "todo",
    createdAt: Date.now() - 120000,
  },
  {
    id: "weekly-vector",
    title: "定义本周唯一核心交付目标",
    priority: "medium",
    pomodoros: 2,
    column: "progress",
    createdAt: Date.now() - 240000,
  },
  {
    id: "local-protocol",
    title: "启用本地隐私工作流",
    priority: "low",
    pomodoros: 1,
    column: "done",
    createdAt: Date.now() - 360000,
    completedAt: Date.now() - 300000,
  },
];

function uid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `mission-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASKS_KEY) || "null");
    return Array.isArray(parsed) ? parsed.filter(isValidTask) : [...STARTER_TASKS];
  } catch {
    return [...STARTER_TASKS];
  }
}

function isValidTask(task) {
  return task
    && typeof task.id === "string"
    && typeof task.title === "string"
    && COLUMNS.includes(task.column)
    && ["high", "medium", "low"].includes(task.priority);
}

class KanbanBoard {
  constructor(options = {}) {
    this.board = document.querySelector("#kanban-board");
    this.template = document.querySelector("#task-card-template");
    this.dialog = document.querySelector("#task-dialog");
    this.form = document.querySelector("#task-form");
    this.deleteButton = document.querySelector("#delete-task");
    this.tasks = readTasks();
    this.activeTaskId = localStorage.getItem(ACTIVE_TASK_KEY) || null;
    this.draggedTaskId = null;
    this.onComplete = options.onComplete || (() => {});
    this.onActiveTaskChange = options.onActiveTaskChange || (() => {});
    this.onToast = options.onToast || (() => {});

    if (!this.tasks.some((task) => task.id === this.activeTaskId)) this.activeTaskId = null;
    this.bindEvents();
    this.render();
    this.emitActiveTask();
  }

  bindEvents() {
    document.querySelector("#add-task-button").addEventListener("click", () => this.openCreate());

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.form.reportValidity()) return;
      this.saveFromForm();
    });

    this.deleteButton.addEventListener("click", () => {
      const id = document.querySelector("#task-id").value;
      if (id) this.remove(id);
    });

    this.dialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => this.dialog.close());
    });

    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) this.dialog.close();
    });

    this.board.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      const card = event.target.closest(".task-card");
      if (!actionButton || !card) return;

      const { taskId } = card.dataset;
      const action = actionButton.dataset.action;
      if (action === "edit") this.openEdit(taskId);
      if (action === "focus") this.setActiveTask(taskId);
      if (action === "complete") {
        const rect = card.getBoundingClientRect();
        this.moveTask(taskId, "done", { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    });

    this.board.addEventListener("dragstart", (event) => {
      const card = event.target.closest(".task-card");
      if (!card) return;
      this.draggedTaskId = card.dataset.taskId;
      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", this.draggedTaskId);
    });

    this.board.addEventListener("dragend", (event) => {
      event.target.closest(".task-card")?.classList.remove("is-dragging");
      this.draggedTaskId = null;
      this.board.querySelectorAll(".kanban-column").forEach((column) => column.classList.remove("is-drag-over"));
    });

    this.board.querySelectorAll(".kanban-column").forEach((column) => {
      column.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        column.classList.add("is-drag-over");
      });

      column.addEventListener("dragleave", (event) => {
        if (!column.contains(event.relatedTarget)) column.classList.remove("is-drag-over");
      });

      column.addEventListener("drop", (event) => {
        event.preventDefault();
        column.classList.remove("is-drag-over");
        const taskId = event.dataTransfer.getData("text/plain") || this.draggedTaskId;
        this.moveTask(taskId, column.dataset.column, { x: event.clientX, y: event.clientY });
      });
    });
  }

  render() {
    COLUMNS.forEach((columnName) => {
      const list = this.board.querySelector(`[data-task-list="${columnName}"]`);
      const tasks = this.tasks
        .filter((task) => task.column === columnName)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      list.replaceChildren();

      tasks.forEach((task) => list.append(this.createCard(task)));
      if (!tasks.length) {
        const empty = document.createElement("div");
        empty.className = "task-list-empty";
        empty.innerHTML = `<span>NO SIGNAL<br />拖入任务到此轨道</span>`;
        list.append(empty);
      }

      const counter = this.board.querySelector(`[data-count="${columnName}"]`);
      counter.textContent = String(tasks.length).padStart(2, "0");
    });
  }

  createCard(task) {
    const fragment = this.template.content.cloneNode(true);
    const card = fragment.querySelector(".task-card");
    const priorityNames = { high: "HIGH", medium: "MEDIUM", low: "LOW" };
    const priorityColors = { high: "var(--danger)", medium: "var(--warning)", low: "var(--accent-3)" };

    card.dataset.taskId = task.id;
    card.dataset.column = task.column;
    card.style.setProperty("--priority-color", priorityColors[task.priority]);
    card.querySelector(".priority-badge").textContent = priorityNames[task.priority];
    card.querySelector("h4").textContent = task.title;
    card.querySelector(".pomodoro-estimate b").textContent = task.pomodoros;
    card.querySelector(".task-code").textContent = `MSN-${task.id.slice(-4).toUpperCase()}`;
    card.classList.toggle("is-active-task", task.id === this.activeTaskId);

    const completeButton = card.querySelector('[data-action="complete"]');
    if (task.column === "done") {
      completeButton.disabled = true;
      completeButton.innerHTML = `<span aria-hidden="true">✓</span> 已完成`;
    }

    return fragment;
  }

  openCreate() {
    this.form.reset();
    document.querySelector("#task-id").value = "";
    document.querySelector("#task-pomodoros").value = "1";
    document.querySelector("#task-priority").value = "medium";
    document.querySelector("#task-column").value = "todo";
    document.querySelector("#task-dialog-title").textContent = "新建任务";
    this.deleteButton.hidden = true;
    this.dialog.showModal();
    window.setTimeout(() => document.querySelector("#task-title").focus(), 80);
  }

  openEdit(id) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return;
    document.querySelector("#task-id").value = task.id;
    document.querySelector("#task-title").value = task.title;
    document.querySelector("#task-priority").value = task.priority;
    document.querySelector("#task-pomodoros").value = task.pomodoros;
    document.querySelector("#task-column").value = task.column;
    document.querySelector("#task-dialog-title").textContent = "编辑任务";
    this.deleteButton.hidden = false;
    this.dialog.showModal();
    window.setTimeout(() => document.querySelector("#task-title").focus(), 80);
  }

  saveFromForm() {
    const id = document.querySelector("#task-id").value;
    const previousTask = this.tasks.find((task) => task.id === id);
    const nextTask = {
      id: id || uid(),
      title: document.querySelector("#task-title").value.trim(),
      priority: document.querySelector("#task-priority").value,
      pomodoros: Math.min(12, Math.max(1, Number(document.querySelector("#task-pomodoros").value) || 1)),
      column: document.querySelector("#task-column").value,
      createdAt: previousTask?.createdAt || Date.now(),
      completedAt: document.querySelector("#task-column").value === "done"
        ? (previousTask?.completedAt || Date.now())
        : null,
    };

    if (!nextTask.title) return;
    if (previousTask) {
      this.tasks = this.tasks.map((task) => task.id === id ? nextTask : task);
    } else {
      this.tasks.push(nextTask);
    }

    this.persist();
    this.render();
    this.dialog.close();
    this.onToast(previousTask ? "任务协议已更新" : "新任务已写入待办轨道");
  }

  moveTask(id, column, burstPoint = null) {
    if (!id || !COLUMNS.includes(column)) return;
    const task = this.tasks.find((item) => item.id === id);
    if (!task || task.column === column) return;
    const wasDone = task.column === "done";
    task.column = column;
    task.completedAt = column === "done" ? Date.now() : null;
    this.persist();
    this.render();

    if (column === "done" && !wasDone) {
      this.onComplete({ task: { ...task }, point: burstPoint });
      this.onToast("任务完成 · 信号已归档");
    }
  }

  remove(id) {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) return;
    this.tasks = this.tasks.filter((item) => item.id !== id);
    if (this.activeTaskId === id) this.setActiveTask(null, false);
    this.persist();
    this.render();
    this.dialog.close();
    this.onToast("任务已从轨道移除");
  }

  setActiveTask(id, shouldToast = true) {
    this.activeTaskId = this.tasks.some((task) => task.id === id) ? id : null;
    try {
      if (this.activeTaskId) localStorage.setItem(ACTIVE_TASK_KEY, this.activeTaskId);
      else localStorage.removeItem(ACTIVE_TASK_KEY);
    } catch {
      // The visible active state remains available for this session.
    }
    this.render();
    this.emitActiveTask();
    if (shouldToast) this.onToast(this.activeTaskId ? "任务已接入专注核心" : "当前任务已解除");
  }

  getActiveTask() {
    return this.tasks.find((task) => task.id === this.activeTaskId) || null;
  }

  emitActiveTask() {
    this.onActiveTaskChange(this.getActiveTask());
  }

  persist() {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(this.tasks));
    } catch {
      // Keep the current board functional even if persistence is blocked.
    }
  }
}
