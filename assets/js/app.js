(function () {
  "use strict";

  var state = { data: null, types: [], dirs: [], activeTypes: new Set(), activeDirs: new Set() };

  function el(id) { return document.getElementById(id); }

  function dateRange(item) {
    var s = item.start || "";
    var e = item.end || "";
    if (s && e && s !== e) return s + " – " + e;
    if (s && !e) return s + " 起";
    return s || e || "";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fetchProfile() {
    return fetch("api/profile.json?t=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        state.data = d;
        state.types = d.types || [];
        state.dirs = d.directions || [];
      });
  }

  function renderStats(d) {
    animateCount(el("stat-total"), d._count || 0);
    animateCount(el("stat-types"), (d.types || []).length);
    animateCount(el("stat-dirs"), (d.directions || []).length);
  }

  function animateCount(node, target) {
    if (!node) return;
    var start = 0, dur = 900, t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var val = Math.floor(start + (target - start) * (1 - Math.pow(1 - p, 3)));
      node.textContent = val;
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function renderChips() {
    var tc = el("type-chips"), dc = el("dir-chips");
    tc.innerHTML = ""; dc.innerHTML = "";
    state.types.forEach(function (t) { tc.appendChild(makeChip(t, state.activeTypes, "type")); });
    state.dirs.forEach(function (d) { dc.appendChild(makeChip(d, state.activeDirs, "dir")); });
  }

  function makeChip(label, set, kind) {
    var b = document.createElement("button");
    b.className = "chip" + (set.has(label) ? " is-active" : "");
    b.textContent = label;
    b.addEventListener("click", function () {
      if (set.has(label)) set.delete(label); else set.add(label);
      b.classList.toggle("is-active");
      renderCards();
    });
    return b;
  }

  function matches(item) {
    var okType = state.activeTypes.size === 0 || state.activeTypes.has(item.type);
    var okDir = state.activeDirs.size === 0 ||
      (item.directions || []).some(function (d) { return state.activeDirs.has(d); });
    return okType && okDir;
  }

  function renderCards() {
    var grid = el("grid");
    var items = (state.data ? state.data.items : []).filter(matches);
    grid.innerHTML = "";
    el("empty").hidden = items.length !== 0;
    items.forEach(function (it) {
      var card = document.createElement("article");
      card.className = "card";
      var tags = (it.directions || []).map(function (d) {
        return '<span class="tag">' + escapeHtml(d) + "</span>";
      }).join("");
      card.innerHTML =
        '<span class="card__badge">' + escapeHtml(it.type || "其他") + "</span>" +
        '<h3 class="card__title">' + escapeHtml(it.name || "未命名") + "</h3>" +
        '<p class="card__meta">' + escapeHtml([it.institution, it.role].filter(Boolean).join(" · ")) + "</p>" +
        '<p class="card__date">' + escapeHtml(dateRange(it)) + "</p>" +
        (it.description ? '<p class="card__desc">' + escapeHtml(it.description) + "</p>" : "") +
        (tags ? '<div class="card__tags">' + tags + "</div>" : "");
      card.addEventListener("click", function () { openModal(it); });
      grid.appendChild(card);
    });
    observeReveals();
  }

  function openModal(it) {
    el("m-badge").textContent = it.type || "其他";
    el("m-title").textContent = it.name || "未命名";
    el("m-meta").textContent = [it.institution, it.role].filter(Boolean).join(" · ");
    el("m-date").textContent = dateRange(it);
    el("m-desc").textContent = it.description || "";
    el("m-hl").style.display = it.highlights ? "" : "none";
    el("m-hl").textContent = it.highlights ? "成果与亮点：" + it.highlights : "";
    el("m-tags").innerHTML = (it.directions || []).map(function (d) {
      return '<span class="tag">' + escapeHtml(d) + "</span>";
    }).join("");
    el("m-status").textContent = it.status ? "状态：" + it.status : "";
    el("modal").hidden = false;
  }

  function closeModal() { el("modal").hidden = true; }

  function renderAbout(d) {
    var items = d.items || [];
    var evalItems = items.filter(function (i) { return i.type === "自我评价"; });
    var skillItems = items.filter(function (i) { return i.type === "技能特长"; });
    var evalBox = el("about-eval");
    if (evalItems.length) {
      evalBox.innerHTML = "<h3>自我评价</h3>" + evalItems.map(function (i) {
        return "<p>" + escapeHtml(i.description || i.name || "") + "</p>";
      }).join("");
    }
    var st = el("skills-tags");
    if (skillItems.length) {
      st.innerHTML = skillItems.map(function (i) {
        return '<span class="tag">' + escapeHtml(i.name || "") + "</span>";
      }).join("");
    }
  }

  // ---------- 滚动渐显 ----------
  var observer = null;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("in"); });
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("in"); observer.unobserve(e.target); }
        });
      }, { threshold: 0.12 });
    }
    document.querySelectorAll(".reveal:not(.in)").forEach(function (n) { observer.observe(n); });
  }

  function init() {
    // 导航滚动态
    var nav = el("nav");
    window.addEventListener("scroll", function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 30);
    });

    // 弹窗关闭
    el("modal").addEventListener("click", function (e) {
      if (e.target.hasAttribute("data-close")) closeModal();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

    observeReveals();

    fetchProfile()
      .then(function () {
        renderStats(state.data);
        renderChips();
        renderCards();
        renderAbout(state.data);
      })
      .catch(function (err) {
        var grid = el("grid");
        if (grid) grid.innerHTML = '<p class="empty">数据加载失败：' + escapeHtml(err.message) +
          "。请确认 api/profile.json 已随站点一同部署。</p>";
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
