/* =========================================================
   赛博霓虹 · 个人履历作品集  —  app.js
   数据来源：./api/profile.json（由 GitHub Actions 每 12h 从飞书同步）
   ========================================================= */

/* ↓↓↓ 你只需要改这一块 ↓↓↓ */
const CONFIG = {
  name: "庞洁",                       // 首屏名字（同时更新 <title>）
  roles: [                            // 打字机循环展示的身份
    "全栈开发工程师",
    "前端开发者",
    "项目操盘手",
    "终身学习者",
  ],
  bio: "这里写你的个人简介。在飞书多维表格里维护履历数据，网站会自动同步更新；这一段的文字你直接在 app.js 顶部的 CONFIG.bio 里改成自己的故事。",
  contact: {
    email: "",                        // 例如 "you@example.com"
    wechat: "",                       // 例如 "your_wechat_id"
    site: "https://github.com/user1789634523/portfolio",
  },
};
/* ↑↑↑ 你只需要改这一块 ↑↑↑ */

const TYPE_COLORS = {
  "获奖证书": "var(--gold)",
  "项目经历": "var(--magenta)",
  "工作经历": "var(--purple)",
  "技能特长": "var(--lime)",
  "自我评价": "var(--cyan)",
};
const TYPE_INITIAL = {
  "获奖证书": "AWARD", "项目经历": "PROJ", "工作经历": "WORK",
  "技能特长": "SKILL", "自我评价": "ME",
};

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;

let DATA = null;
let activeType = "全部";
let activeDir = "全部";

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  applyConfig();
  setupCursorGlow();
  setupMagnetic();
  if (!prefersReduced) startParticles();
  startTyped();
  setupReveal();
  setupFiltersUI();
  setupModal();
  setupContact();
  document.getElementById("year").textContent = new Date().getFullYear();

  try {
    const res = await fetch("./api/profile.json", { cache: "no-cache" });
    DATA = await res.json();
    renderAll();
  } catch (e) {
    console.error("数据加载失败：", e);
    document.getElementById("card-grid").innerHTML =
      '<p class="empty-hint">数据加载失败，请稍后刷新或检查 api/profile.json。</p>';
  }
}

function applyConfig() {
  document.title = `${CONFIG.name} · 个人作品集`;
  const h1 = document.querySelector(".hero-name");
  if (h1) { h1.textContent = CONFIG.name; h1.setAttribute("data-text", CONFIG.name); }
  const tag = document.getElementById("hero-tagline");
  if (tag && CONFIG.roles[0]) tag.textContent = CONFIG.roles[0] + " · 用代码与设计构建体验";
  const bio = document.getElementById("about-bio");
  if (bio) bio.innerHTML = CONFIG.bio;
}

/* ---------- 渲染主流程 ---------- */
function renderAll() {
  renderStats();
  renderSkills();
  renderFilters();
  renderCards();
  renderTimeline();
}

/* ---------- 统计数字 ---------- */
function renderStats() {
  const items = DATA.items;
  const starts = items.map(i => i.start_ts).filter(t => t > 0);
  const ends = items.map(i => i.end_ts).filter(t => t > 0);
  const spanYears = starts.length && ends.length
    ? Math.max(1, Math.round((Math.max(...ends) - Math.min(...starts)) / (365 * 24 * 3600 * 1000)))
    : 0;
  const projects = items.filter(i => i.type === "项目经历").length;
  const certs = items.filter(i => i.type === "获奖证书").length;

  const map = [
    { el: document.querySelectorAll(".stat-num")[0], val: items.length, suffix: "" },
    { el: document.querySelectorAll(".stat-num")[1], val: spanYears, suffix: "年" },
    { el: document.querySelectorAll(".stat-num")[2], val: projects, suffix: "+" },
    { el: document.querySelectorAll(".stat-num")[3], val: certs, suffix: "" },
  ];
  map.forEach((m, idx) => { if (m.el) { m.el.dataset.target = m.val; m.el.dataset.suffix = m.suffix; } });
  observeStats();
}

function observeStats() {
  const nums = document.querySelectorAll(".stat-num");
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { countUp(en.target); io.unobserve(en.target); }
    });
  }, { threshold: 0.5 });
  nums.forEach(n => io.observe(n));
}

function countUp(el) {
  const target = parseInt(el.dataset.target || "0", 10);
  const suffix = el.dataset.suffix || "";
  if (prefersReduced) { el.textContent = target + suffix; return; }
  const dur = 1200; const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------- 技能芯片 ---------- */
function renderSkills() {
  const wrap = document.getElementById("skill-chips");
  const skills = DATA.items.filter(i => i.type === "技能特长");
  wrap.innerHTML = skills.map(s =>
    `<div class="chip">${escapeHtml(s.name)}</div>`).join("");
}

/* ---------- 筛选器 UI ---------- */
function setupFiltersUI() {
  // 容器已存在，渲染时填充按钮
}

function renderFilters() {
  const typeBox = document.getElementById("type-filters");
  const dirBox = document.getElementById("dir-filters");
  const types = ["全部", ...DATA.types];
  const dirs = ["全部", ...DATA.directions];
  typeBox.innerHTML = '<span class="filter-label">类型</span>' +
    types.map(t => `<button class="filter-btn ${t === activeType ? "active" : ""}" data-kind="type" data-val="${t}">${t}</button>`).join("");
  dirBox.innerHTML = '<span class="filter-label">方向</span>' +
    dirs.map(d => `<button class="filter-btn ${d === activeDir ? "active" : ""}" data-kind="dir" data-val="${d}">${d}</button>`).join("");

  typeBox.querySelectorAll(".filter-btn").forEach(b => b.addEventListener("click", () => {
    activeType = b.dataset.val; renderFilters(); renderCards();
  }));
  dirBox.querySelectorAll(".filter-btn").forEach(b => b.addEventListener("click", () => {
    activeDir = b.dataset.val; renderFilters(); renderCards();
  }));
}

/* ---------- 卡片网格 ---------- */
function renderCards() {
  const grid = document.getElementById("card-grid");
  const hint = document.getElementById("empty-hint");
  const list = DATA.items.filter(i =>
    (activeType === "全部" || i.type === activeType) &&
    (activeDir === "全部" || (i.directions || []).includes(activeDir))
  );
  hint.hidden = list.length > 0;

  grid.innerHTML = list.map((item, i) => {
    const color = TYPE_COLORS[item.type] || "var(--cyan)";
    const init = TYPE_INITIAL[item.type] || "•";
    const period = (item.start && item.end) ? `${item.start} — ${item.end}` : (item.start || "");
    return `
    <article class="work-card reveal in" data-id="${item.id}" style="--accent:${color}; transition-delay:${i * 40}ms">
      <div class="card-glow"></div>
      <div class="card-media">${init}</div>
      <span class="card-tag">${escapeHtml(item.type)}</span>
      <h3 class="card-name">${escapeHtml(item.name)}</h3>
      <p class="card-meta">${escapeHtml(item.institution || "")} · <span class="role">${escapeHtml(item.role || "")}</span></p>
      ${period ? `<p class="card-period">${escapeHtml(period)}</p>` : ""}
      ${item.highlights ? `<p class="card-hl">${escapeHtml(item.highlights)}</p>` : ""}
    </article>`;
  }).join("");

  grid.querySelectorAll(".work-card").forEach(card => {
    card.addEventListener("click", () => openModal(card.dataset.id));
    if (!isTouch && !prefersReduced) attachTilt(card);
  });
}

function attachTilt(card) {
  card.addEventListener("mousemove", (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const rotY = (px - 0.5) * 12;
    const rotX = (0.5 - py) * 12;
    card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px)`;
    card.style.setProperty("--mx", `${px * 100}%`);
    card.style.setProperty("--my", `${py * 100}%`);
  });
  card.addEventListener("mouseleave", () => { card.style.transform = ""; });
}

/* ---------- 时间轴 ---------- */
function renderTimeline() {
  const track = document.getElementById("timeline-track");
  const allowed = ["工作经历", "项目经历", "获奖证书"];
  const list = DATA.items
    .filter(i => allowed.includes(i.type) && i.start_ts > 0)
    .sort((a, b) => b.start_ts - a.start_ts);
  track.innerHTML = list.map(i => {
    const period = (i.start && i.end) ? `${i.start} — ${i.end}` : (i.start || "");
    return `
    <div class="tl-item reveal">
      <div class="tl-year">${escapeHtml(period)}</div>
      <div class="tl-title">${escapeHtml(i.name)}</div>
      <div class="tl-org">${escapeHtml(i.institution || "")} · ${escapeHtml(i.role || "")}</div>
      ${i.description ? `<div class="tl-desc">${escapeHtml(i.description)}</div>` : ""}
    </div>`;
  }).join("");
  observeRevealOn(track);
}

/* ---------- 弹窗 ---------- */
function setupModal() {
  const modal = document.getElementById("modal");
  modal.querySelectorAll("[data-close]").forEach(el =>
    el.addEventListener("click", closeModal));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function openModal(id) {
  const item = DATA.items.find(i => i.id === id);
  if (!item) return;
  const modal = document.getElementById("modal");
  document.getElementById("m-tag").textContent = item.type;
  document.getElementById("m-title").textContent = item.name;
  const period = (item.start && item.end) ? `${item.start} — ${item.end}` : (item.start || "—");
  document.getElementById("m-meta").innerHTML =
    `<b>${escapeHtml(item.institution || "—")}</b> · ${escapeHtml(item.role || "—")} · ${escapeHtml(period)} · 状态：${escapeHtml(item.status || "—")}`;
  document.getElementById("m-desc").textContent = item.description || "（暂无描述）";
  document.getElementById("m-highlight").textContent = item.highlights ? "✨ " + item.highlights : "";
  document.getElementById("m-dirs").innerHTML =
    (item.directions || []).map(d => `<span class="dir">${escapeHtml(d)}</span>`).join("");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

/* ---------- 联系 ---------- */
function setupContact() {
  const mail = document.getElementById("mail-link");
  const wx = document.getElementById("wechat-link");
  const site = document.getElementById("site-link");
  if (CONFIG.contact.email) {
    mail.href = "mailto:" + CONFIG.contact.email;
    mail.querySelector("span").textContent = CONFIG.contact.email;
  }
  if (CONFIG.contact.wechat) {
    wx.href = "#";
    wx.querySelector("span").textContent = CONFIG.contact.wechat;
  }
  if (CONFIG.contact.site) {
    site.href = CONFIG.contact.site;
  }
}

/* ---------- 滚动渐显 ---------- */
function setupReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
}
function observeRevealOn(scope) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.15 });
  scope.querySelectorAll(".reveal").forEach(el => io.observe(el));
}

/* ---------- 打字机 ---------- */
function startTyped() {
  const el = document.getElementById("typed");
  if (!el) return;
  const words = CONFIG.roles;
  if (prefersReduced) { el.textContent = words[0] || ""; return; }
  let wi = 0, ci = 0, deleting = false;
  function tick() {
    const word = words[wi];
    if (!deleting) {
      el.textContent = word.slice(0, ci++);
      if (ci > word.length) { deleting = true; setTimeout(tick, 1400); return; }
    } else {
      el.textContent = word.slice(0, ci--);
      if (ci < 0) { deleting = false; wi = (wi + 1) % words.length; ci = 0; }
    }
    setTimeout(tick, deleting ? 45 : 90);
  }
  tick();
}

/* ---------- 霓虹光标 ---------- */
function setupCursorGlow() {
  if (isTouch) return;
  const glow = document.getElementById("cursor-glow");
  window.addEventListener("mousemove", (e) => {
    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";
    glow.style.opacity = "1";
  });
  document.addEventListener("mouseleave", () => { glow.style.opacity = "0"; });
}

/* ---------- 磁吸按钮 ---------- */
function setupMagnetic() {
  if (isTouch || prefersReduced) return;
  document.querySelectorAll(".magnetic").forEach(btn => {
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
    });
    btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
  });
}

/* ---------- 粒子网络背景 ---------- */
function startParticles() {
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let w, h, nodes = [], raf;
  const COUNT = 64, MAXD = 130;
  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  function seed() {
    nodes = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
    }));
  }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > w) n.vx *= -1;
      if (n.y < 0 || n.y > h) n.vy *= -1;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < MAXD) {
          ctx.strokeStyle = `rgba(0,240,255,${0.16 * (1 - d / MAXD)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const n of nodes) {
      ctx.fillStyle = "rgba(0,240,255,0.55)";
      ctx.beginPath(); ctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  resize(); seed(); frame();
  window.addEventListener("resize", () => { resize(); seed(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else frame();
  });
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
