const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const backdrop = document.getElementById("spaceBackdrop");
const previewCanvases = Array.from(document.querySelectorAll("[data-preview]"));
const canvases = [backdrop, ...previewCanvases].filter(Boolean);

const quality = {
  dpr: Math.min(window.devicePixelRatio || 1, 1.7),
};

const state = {
  stars: [],
  raf: 0,
};

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * quality.dpr));
  const height = Math.max(1, Math.round(rect.height * quality.dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function seedBackdropStars() {
  if (!backdrop) return;

  const random = mulberry32(92731);
  const count = Math.min(360, Math.floor((backdrop.width * backdrop.height) / 15000));
  state.stars = Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    r: 0.45 + random() * 1.7,
    a: 0.18 + random() * 0.72,
    drift: 0.2 + random() * 0.8,
  }));
}

function resizeAll() {
  quality.dpr = Math.min(window.devicePixelRatio || 1, 1.7);
  canvases.forEach(resizeCanvas);
  seedBackdropStars();
  drawFrame(performance.now(), false);
}

function clear(ctx, width, height, fill = "#050505") {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
}

function drawBackdrop(time) {
  if (!backdrop) return;

  const ctx = backdrop.getContext("2d");
  const width = backdrop.width;
  const height = backdrop.height;
  clear(ctx, width, height, "#050505");

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  state.stars.forEach((star) => {
    const x = star.x * width;
    const y = (star.y * height + time * 0.002 * star.drift) % height;
    const pulse = 0.72 + Math.sin(time * 0.0014 * star.drift + x * 0.01) * 0.28;
    ctx.globalAlpha = star.a * pulse;
    ctx.fillStyle = "#f6ead1";
    ctx.beginPath();
    ctx.arc(x, y, star.r * quality.dpr, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 0.11;
  ctx.strokeStyle = "#f4b04d";
  ctx.lineWidth = quality.dpr;
  const gridGap = 96 * quality.dpr;
  for (let x = ((time * 0.004) % gridGap) - gridGap; x < width + gridGap; x += gridGap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + width * 0.14, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSolar(canvas, time) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width * 0.48;
  const cy = height * 0.52;
  const scale = Math.min(width, height);

  clear(ctx, width, height, "#070806");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = Math.max(1, quality.dpr);

  for (let i = 0; i < 5; i += 1) {
    const radius = scale * (0.15 + i * 0.095);
    ctx.strokeStyle = `rgba(238, 225, 199, ${0.11 + i * 0.015})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.42, radius * 0.52, -0.22, 0, Math.PI * 2);
    ctx.stroke();
  }

  const sunGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 0.21);
  sunGlow.addColorStop(0, "rgba(255, 226, 132, 0.94)");
  sunGlow.addColorStop(0.32, "rgba(244, 176, 77, 0.52)");
  sunGlow.addColorStop(1, "rgba(244, 176, 77, 0)");
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(0, 0, scale * 0.21, 0, Math.PI * 2);
  ctx.fill();

  const planets = [
    ["#cfc5ae", 0.15, 0.012, 1.6],
    ["#cd6d43", 0.245, 0.017, 1.1],
    ["#69d6db", 0.34, 0.022, 0.68],
    ["#8fd39b", 0.435, 0.016, 0.48],
    ["#f4b04d", 0.53, 0.034, 0.32],
  ];

  planets.forEach(([color, orbit, size, speed], index) => {
    const angle = time * 0.00038 * speed + index * 1.35;
    const x = Math.cos(angle) * scale * orbit * 1.42;
    const y = Math.sin(angle) * scale * orbit * 0.52;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2.5 * quality.dpr, scale * size), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawRelativity(canvas, time) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width * 0.5;
  const cy = height * 0.58;
  const scale = Math.min(width, height);
  const rows = 13;
  const cols = 15;
  const gap = scale * 0.055;
  const timeWave = Math.sin(time * 0.0012) * 0.12;

  clear(ctx, width, height, "#05070a");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(105, 214, 219, 0.36)";
  ctx.lineWidth = quality.dpr;

  for (let row = -rows; row <= rows; row += 1) {
    ctx.beginPath();
    for (let col = -cols; col <= cols; col += 1) {
      const x = col * gap;
      const z = row * gap;
      const dist = Math.hypot(x, z);
      const well = -scale * 0.19 * Math.exp(-(dist * dist) / (scale * scale * 0.08));
      const orbitX = Math.cos(time * 0.00065) * scale * 0.28;
      const orbitZ = Math.sin(time * 0.00065) * scale * 0.16;
      const orbitDist = Math.hypot(x - orbitX, z - orbitZ);
      const orbitWell = -scale * 0.05 * Math.exp(-(orbitDist * orbitDist) / (scale * scale * 0.012));
      const y = (well + orbitWell) * (1 + timeWave);
      const px = x + z * 0.72;
      const py = z * 0.34 + y;
      if (col === -cols) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  for (let col = -cols; col <= cols; col += 1) {
    ctx.beginPath();
    for (let row = -rows; row <= rows; row += 1) {
      const x = col * gap;
      const z = row * gap;
      const dist = Math.hypot(x, z);
      const well = -scale * 0.19 * Math.exp(-(dist * dist) / (scale * scale * 0.08));
      const px = x + z * 0.72;
      const py = z * 0.34 + well;
      if (row === -rows) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "rgba(244, 176, 77, 0.82)";
  ctx.beginPath();
  ctx.arc(0, -scale * 0.19, scale * 0.044, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(105, 214, 219, 0.88)";
  const satelliteAngle = time * 0.00065;
  ctx.beginPath();
  ctx.arc(
    Math.cos(satelliteAngle) * scale * 0.4,
    Math.sin(satelliteAngle) * scale * 0.14 - scale * 0.04,
    scale * 0.018,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

function drawGargantua(canvas, time) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width * 0.5;
  const cy = height * 0.52;
  const scale = Math.min(width, height);

  clear(ctx, width, height, "#020202");
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.08 + Math.sin(time * 0.00045) * 0.025);
  ctx.globalCompositeOperation = "lighter";

  const halo = ctx.createRadialGradient(0, 0, scale * 0.06, 0, 0, scale * 0.46);
  halo.addColorStop(0, "rgba(255, 245, 224, 0.28)");
  halo.addColorStop(0.26, "rgba(244, 176, 77, 0.24)");
  halo.addColorStop(1, "rgba(244, 176, 77, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, scale * 0.47, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 46; i += 1) {
    const t = i / 45;
    const x = (t - 0.5) * width * 0.9;
    const wobble = Math.sin(t * 16 + time * 0.0015) * scale * 0.01;
    const thickness = scale * (0.025 + Math.sin(t * Math.PI) * 0.035);
    ctx.strokeStyle = `rgba(244, ${130 + i}, 77, ${0.08 + Math.sin(t * Math.PI) * 0.22})`;
    ctx.lineWidth = Math.max(1, thickness);
    ctx.beginPath();
    ctx.moveTo(x - scale * 0.06, wobble);
    ctx.bezierCurveTo(
      x - scale * 0.02,
      -scale * 0.08,
      x + scale * 0.06,
      scale * 0.08,
      x + scale * 0.12,
      wobble,
    );
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 0.17);
  core.addColorStop(0, "#000000");
  core.addColorStop(0.68, "#000000");
  core.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, scale * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 247, 228, 0.38)";
  ctx.lineWidth = Math.max(1, quality.dpr);
  ctx.beginPath();
  ctx.ellipse(0, -scale * 0.02, scale * 0.19, scale * 0.125, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFrame(time, scheduleNext = true) {
  state.raf = 0;
  const animate = !reducedMotion.matches && !document.hidden;
  drawBackdrop(time);

  previewCanvases.forEach((canvas) => {
    const type = canvas.dataset.preview;
    if (type === "solar") drawSolar(canvas, time);
    if (type === "relativity") drawRelativity(canvas, time);
    if (type === "gargantua") drawGargantua(canvas, time);
  });

  if (scheduleNext && animate) {
    start();
  }
}

function start() {
  if (state.raf) return;
  state.raf = window.requestAnimationFrame(drawFrame);
}

function stop() {
  if (!state.raf) return;
  window.cancelAnimationFrame(state.raf);
  state.raf = 0;
}

window.addEventListener("resize", resizeAll);
document.addEventListener("visibilitychange", () => {
  if (document.hidden || reducedMotion.matches) {
    stop();
    return;
  }
  start();
});

if (typeof reducedMotion.addEventListener === "function") {
  reducedMotion.addEventListener("change", () => {
    stop();
    drawFrame(performance.now(), false);
    if (!reducedMotion.matches && !document.hidden) start();
  });
}

resizeAll();
if (!reducedMotion.matches) {
  start();
}
