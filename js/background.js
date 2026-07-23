function cssColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function hexToRgb(color) {
  const value = color.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 45, g: 246, b: 255 };
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

class CyberBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.nodes = [];
    this.pointer = { x: -1000, y: -1000, active: false };
    this.running = false;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.animationFrame = null;
    this.resizeTimer = null;
    this.colors = {};

    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.bindEvents();
    this.resize();
    this.refreshColors();
    this.animate();
  }

  bindEvents() {
    window.addEventListener("resize", () => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(this.resize, 100);
    });

    window.addEventListener("pointermove", (event) => {
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.active = true;
    }, { passive: true });

    document.documentElement.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(this.animationFrame);
      else this.animate();
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const targetCount = this.reducedMotion
      ? 22
      : Math.min(74, Math.max(34, Math.floor((this.width * this.height) / 23000)));
    this.nodes = Array.from({ length: targetCount }, (_, index) => this.nodes[index] || this.makeNode());
  }

  makeNode() {
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      radius: 0.55 + Math.random() * 1.15,
      phase: Math.random() * Math.PI * 2,
    };
  }

  refreshColors() {
    this.colors.accent = hexToRgb(cssColor("--accent", "#2df6ff"));
    this.colors.secondary = hexToRgb(cssColor("--accent-2", "#ff3bd4"));
  }

  setRunning(isRunning) {
    this.running = Boolean(isRunning);
  }

  animate(time = 0) {
    cancelAnimationFrame(this.animationFrame);
    this.draw(time);
    if (!this.reducedMotion || this.running) {
      this.animationFrame = requestAnimationFrame(this.animate);
    }
  }

  draw(time) {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.drawGrid(context, time);
    this.drawNodes(context, time);
  }

  drawGrid(context, time) {
    const { r, g, b } = this.colors.accent;
    const horizon = this.height * 0.57;
    const center = this.width * 0.5 + (this.pointer.active ? (this.pointer.x - this.width / 2) * 0.018 : 0);
    const breathing = this.running ? 0.6 + Math.sin(time * 0.0016) * 0.22 : 0.45;
    const alpha = 0.03 * breathing;

    context.save();
    context.lineWidth = 0.65;
    context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    context.beginPath();

    const columns = Math.max(10, Math.ceil(this.width / 110));
    for (let index = -2; index <= columns + 2; index += 1) {
      const bottomX = (index / columns) * this.width;
      const horizonX = center + (bottomX - center) * 0.08;
      context.moveTo(horizonX, horizon);
      context.lineTo(bottomX, this.height + 1);
    }

    for (let index = 0; index < 12; index += 1) {
      const normalized = index / 11;
      const y = horizon + Math.pow(normalized, 2.05) * (this.height - horizon);
      context.moveTo(0, y);
      context.lineTo(this.width, y);
    }
    context.stroke();

    const glow = context.createLinearGradient(0, horizon - 20, 0, this.height);
    glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.018 * breathing})`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(0, horizon - 20, this.width, this.height - horizon + 20);
    context.restore();
  }

  drawNodes(context, time) {
    const accent = this.colors.accent;
    const secondary = this.colors.secondary;
    const interactionRadius = 145;

    this.nodes.forEach((node) => {
      if (!this.reducedMotion) {
        node.x += node.vx * (this.running ? 1.45 : 1);
        node.y += node.vy * (this.running ? 1.45 : 1);
      }

      if (node.x < -5) node.x = this.width + 5;
      if (node.x > this.width + 5) node.x = -5;
      if (node.y < -5) node.y = this.height + 5;
      if (node.y > this.height + 5) node.y = -5;

      if (this.pointer.active && !this.reducedMotion) {
        const dx = node.x - this.pointer.x;
        const dy = node.y - this.pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < interactionRadius) {
          const force = (1 - distance / interactionRadius) * 0.32;
          node.x += (dx / distance) * force;
          node.y += (dy / distance) * force;
        }
      }
    });

    context.save();
    context.lineWidth = 0.55;
    for (let first = 0; first < this.nodes.length; first += 1) {
      const node = this.nodes[first];
      for (let second = first + 1; second < this.nodes.length; second += 1) {
        const other = this.nodes[second];
        const distance = Math.hypot(node.x - other.x, node.y - other.y);
        if (distance > 108) continue;
        const alpha = (1 - distance / 108) * 0.095;
        context.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${alpha})`;
        context.beginPath();
        context.moveTo(node.x, node.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    }

    this.nodes.forEach((node, index) => {
      const color = index % 7 === 0 ? secondary : accent;
      const pulse = 0.68 + Math.sin(time * 0.0018 + node.phase) * 0.32;
      context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.2 + pulse * 0.38})`;
      context.beginPath();
      context.arc(node.x, node.y, node.radius * pulse, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }
}

class CompletionBurst {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.particles = [];
    this.animationFrame = null;
    this.lastTime = 0;
    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  burst(x = this.width / 2, y = this.height / 2) {
    const colors = [
      cssColor("--accent", "#2df6ff"),
      cssColor("--accent-2", "#ff3bd4"),
      cssColor("--accent-3", "#a6ff4d"),
      "#ffffff",
    ];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const amount = reducedMotion ? 18 : 56;

    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 6.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.6,
        life: 1,
        decay: 0.012 + Math.random() * 0.018,
        size: 1.2 + Math.random() * 3.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.2,
      });
    }

    if (!this.animationFrame) {
      this.lastTime = performance.now();
      this.animationFrame = requestAnimationFrame(this.animate);
    }
  }

  animate(time) {
    const delta = Math.min(2.2, (time - this.lastTime) / 16.67);
    this.lastTime = time;
    this.context.clearRect(0, 0, this.width, this.height);

    this.particles = this.particles.filter((particle) => {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 0.08 * delta;
      particle.vx *= 0.992;
      particle.life -= particle.decay * delta;
      particle.rotation += particle.spin * delta;
      if (particle.life <= 0) return false;

      this.context.save();
      this.context.globalAlpha = particle.life;
      this.context.translate(particle.x, particle.y);
      this.context.rotate(particle.rotation);
      this.context.fillStyle = particle.color;
      this.context.shadowColor = particle.color;
      this.context.shadowBlur = 8;
      this.context.fillRect(-particle.size / 2, -particle.size / 2, particle.size * 1.8, particle.size * 0.65);
      this.context.restore();
      return true;
    });

    if (this.particles.length) {
      this.animationFrame = requestAnimationFrame(this.animate);
    } else {
      this.context.clearRect(0, 0, this.width, this.height);
      this.animationFrame = null;
    }
  }
}

const IMMERSIVE_SCENES = {
  rain: { image: "assets/backgrounds/rain-cafe.png", name: "雨夜咖啡" },
  spring: { image: "assets/backgrounds/spring-kite.png", name: "春野纸鸢" },
  mechanical: { image: "assets/backgrounds/rustline-core.png", name: "锈线核心" },
  montage: { image: "assets/backgrounds/glass-montage.png", name: "玻璃漫游" },
};

class ImmersiveSceneAnimator {
  constructor(container, image, canvas) {
    this.container = container;
    this.image = image;
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.scene = "rain";
    this.active = false;
    this.particles = [];
    this.frame = null;
    this.lastTime = 0;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.setScene("rain");
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seedParticles();
  }

  setScene(scene) {
    if (!IMMERSIVE_SCENES[scene]) scene = "rain";
    this.scene = scene;
    this.container.dataset.scene = scene;
    const nextSrc = new URL(IMMERSIVE_SCENES[scene].image, document.baseURI).href;
    if (this.image.src !== nextSrc) {
      this.image.classList.remove("is-ready");
      this.image.src = nextSrc;
    }
    if (this.image.complete) this.image.classList.add("is-ready");
    else this.image.addEventListener("load", () => this.image.classList.add("is-ready"), { once: true });
    this.seedParticles();
    return IMMERSIVE_SCENES[scene];
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.animate);
  }

  stop() {
    this.active = false;
    cancelAnimationFrame(this.frame);
    this.context.clearRect(0, 0, this.width, this.height);
  }

  seedParticles() {
    const counts = this.reducedMotion
      ? { rain: 42, spring: 18, mechanical: 18, montage: 12 }
      : { rain: 120, spring: 42, mechanical: 38, montage: 22 };
    const count = counts[this.scene] || 40;
    this.particles = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: 0.15 + Math.random() * 0.65,
      size: 0.7 + Math.random() * 2.4,
      life: Math.random(),
      phase: Math.random() * Math.PI * 2,
      index,
    }));
  }

  animate(time) {
    if (!this.active) return;
    const delta = Math.min(2.2, (time - this.lastTime) / 16.67);
    this.lastTime = time;
    this.context.clearRect(0, 0, this.width, this.height);

    if (this.scene === "rain") this.drawRain(delta);
    if (this.scene === "spring") this.drawSpring(time, delta);
    if (this.scene === "mechanical") this.drawMechanical(time, delta);
    if (this.scene === "montage") this.drawMontage(time, delta);
    this.frame = requestAnimationFrame(this.animate);
  }

  drawRain(delta) {
    const context = this.context;
    context.save();
    context.lineCap = "round";
    this.particles.forEach((drop) => {
      drop.y += (8 + drop.vy * 10) * delta;
      drop.x -= (1.2 + drop.vy) * delta;
      if (drop.y > this.height + 30) {
        drop.y = -30;
        drop.x = Math.random() * this.width;
      }
      if (drop.x < -20) drop.x = this.width + 20;
      const length = 9 + drop.size * 7;
      const gradient = context.createLinearGradient(drop.x, drop.y, drop.x - 2, drop.y + length);
      gradient.addColorStop(0, "rgba(160,210,255,0)");
      gradient.addColorStop(1, `rgba(176,218,255,${0.1 + drop.size * 0.045})`);
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(0.5, drop.size * 0.48);
      context.beginPath();
      context.moveTo(drop.x, drop.y);
      context.lineTo(drop.x - 2.5, drop.y + length);
      context.stroke();
    });
    context.restore();
  }

  drawSpring(time, delta) {
    const context = this.context;
    const shadowX = ((time * 0.012) % (this.width * 1.8)) - this.width * 0.4;
    const shadow = context.createRadialGradient(shadowX, this.height * 0.42, 0, shadowX, this.height * 0.42, this.width * 0.38);
    shadow.addColorStop(0, "rgba(37,82,58,0.13)");
    shadow.addColorStop(1, "rgba(37,82,58,0)");
    context.fillStyle = shadow;
    context.fillRect(0, 0, this.width, this.height);

    context.save();
    this.particles.forEach((seed) => {
      seed.x += (0.22 + seed.vy * 0.55) * delta;
      seed.y += Math.sin(time * 0.0014 + seed.phase) * 0.18 * delta;
      if (seed.x > this.width + 16) {
        seed.x = -16;
        seed.y = Math.random() * this.height;
      }
      const alpha = 0.18 + (Math.sin(time * 0.001 + seed.phase) + 1) * 0.12;
      context.strokeStyle = `rgba(255,255,223,${alpha})`;
      context.fillStyle = `rgba(255,255,230,${alpha * 0.8})`;
      context.lineWidth = 0.6;
      context.beginPath();
      context.arc(seed.x, seed.y, seed.size * 0.75, 0, Math.PI * 2);
      context.fill();
      for (let spoke = 0; spoke < 4; spoke += 1) {
        const angle = spoke * Math.PI / 2 + seed.phase;
        context.moveTo(seed.x, seed.y);
        context.lineTo(seed.x + Math.cos(angle) * seed.size * 2.3, seed.y + Math.sin(angle) * seed.size * 2.3);
      }
      context.stroke();
    });
    context.restore();
  }

  drawMechanical(time, delta) {
    const context = this.context;
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;
    const radius = Math.min(this.width, this.height) * 0.33;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(time * 0.000035);
    context.strokeStyle = "rgba(246,166,86,0.14)";
    context.lineWidth = 1;
    context.setLineDash([2, 17]);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    this.particles.forEach((spark) => {
      spark.life -= 0.008 * delta;
      if (spark.life <= 0) {
        spark.x = this.width * (0.15 + Math.random() * 0.7);
        spark.y = this.height * (0.18 + Math.random() * 0.65);
        spark.vx = (Math.random() - 0.5) * 2.8;
        spark.vy = -0.8 - Math.random() * 2.6;
        spark.life = 0.45 + Math.random() * 0.55;
      }
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      spark.vy += 0.025 * delta;
      context.fillStyle = `rgba(255,166,71,${spark.life * 0.7})`;
      context.shadowColor = "#ff8d38";
      context.shadowBlur = 7;
      context.fillRect(spark.x, spark.y, spark.size * 1.5, spark.size * 0.55);
      context.shadowBlur = 0;
    });
  }

  drawMontage(time, delta) {
    const context = this.context;
    context.save();
    this.particles.forEach((pane) => {
      const x = pane.x + Math.sin(time * 0.00018 + pane.phase) * 17;
      const y = pane.y + Math.cos(time * 0.00014 + pane.phase) * 12;
      const width = 48 + pane.size * 34;
      const height = 28 + pane.size * 22;
      context.fillStyle = `rgba(224,241,242,${0.018 + (pane.index % 4) * 0.007})`;
      context.strokeStyle = `rgba(235,247,244,${0.08 + (pane.index % 3) * 0.025})`;
      context.lineWidth = 0.7;
      context.fillRect(x, y, width, height);
      context.strokeRect(x, y, width, height);
      if (pane.index % 5 === 0) {
        context.strokeStyle = "rgba(153,86,75,0.13)";
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(x + width * 0.5, y + height * 0.5, Math.min(width, height) * 0.28, 0, Math.PI * 1.72);
        context.stroke();
      }
      pane.life += 0.001 * delta;
    });
    context.restore();
  }
}
