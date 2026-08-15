// Authentech — backend API helpers (dev auth + project storage)
//
// If the frontend and backend are on the SAME domain (e.g. everything on
// InfinityFree), leave API_BASE as "" — all calls stay relative, exactly
// like before.
//
// If you're hosting the frontend on Vercel and the PHP backend somewhere
// else (a separate free PHP host), set API_BASE to that backend's full
// URL, no trailing slash, e.g.:
//   const API_BASE = "https://your-backend-host.example.com";
// The matching change also has to happen in api/config.php — see the
// comments at the top of that file (BACKEND_URL + CORS_ALLOWED_ORIGINS).
const API_BASE = "https://theauthentech.duckdns.org";

// Dev-mode login no longer uses cookies — cross-site cookies between two
// different domains (Vercel + this backend) turned out to be unreliable
// across browsers. Instead, login returns a token that's stored here in
// localStorage (first-party, no cross-site restrictions) and sent back
// as a custom header on every authenticated request.
const AT_TOKEN_KEY = "at_dev_token";

const AT = {
  async checkDevAuth() {
    const token = localStorage.getItem(AT_TOKEN_KEY);
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/api/auth.php?action=check`, {
        headers: { "X-Dev-Token": token },
      });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.authed;
    } catch (e) { return false; }
  },
  async devLogin(password) {
    try {
      const res = await fetch(`${API_BASE}/api/auth.php?action=login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.authed && data.token) {
        localStorage.setItem(AT_TOKEN_KEY, data.token);
      }
      return { ok: res.ok, ...data };
    } catch (e) { return { ok: false, error: "Couldn't reach the server." }; }
  },
  async devLogout() {
    const token = localStorage.getItem(AT_TOKEN_KEY);
    localStorage.removeItem(AT_TOKEN_KEY);
    try {
      await fetch(`${API_BASE}/api/auth.php?action=logout`, {
        method: "POST",
        headers: token ? { "X-Dev-Token": token } : {},
      });
    } catch (e) {}
  },
  async fetchProjects() {
    try {
      const res = await fetch(`${API_BASE}/api/projects.php?action=list`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.projects || [];
    } catch (e) { return null; } // null = backend unreachable (e.g. static hosting)
  },
  async fetchStorage() {
    try {
      const res = await fetch(`${API_BASE}/api/projects.php?action=storage`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  },
  // Uses XHR (not fetch) so we get real upload progress events.
  submitProject(action, formData, onProgress) {
    return new Promise((resolve) => {
      const token = localStorage.getItem(AT_TOKEN_KEY);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/projects.php?action=${action}`);
      if (token) xhr.setRequestHeader("X-Dev-Token", token);
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, ...data });
      };
      xhr.onerror = () => resolve({ ok: false, error: "Network error — couldn't reach the server." });
      xhr.send(formData);
    });
  },
  async deleteProject(id) {
    try {
      const token = localStorage.getItem(AT_TOKEN_KEY);
      const fd = new FormData();
      fd.append("id", id);
      const res = await fetch(`${API_BASE}/api/projects.php?action=delete`, {
        method: "POST",
        headers: token ? { "X-Dev-Token": token } : {},
        body: fd,
      });
      return res.ok;
    } catch (e) { return false; }
  },
  async deleteVideo(id) {
    try {
      const token = localStorage.getItem(AT_TOKEN_KEY);
      const fd = new FormData();
      fd.append("id", id);
      const res = await fetch(`${API_BASE}/api/projects.php?action=delete_video`, {
        method: "POST",
        headers: token ? { "X-Dev-Token": token } : {},
        body: fd,
      });
      return res.ok;
    } catch (e) { return false; }
  },
  formatBytes(bytes) {
    if (!bytes) return "0MB";
    const mb = bytes / 1024 / 1024;
    return mb >= 1000 ? (mb / 1024).toFixed(2) + "GB" : mb.toFixed(1) + "MB";
  },

  // ---- Team members (photos uploaded through dev mode, not files) ----
  async fetchTeam() {
    try {
      const res = await fetch(`${API_BASE}/api/team.php?action=list`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.members || [];
    } catch (e) { return null; } // null = backend unreachable
  },
  // Uses XHR so photo uploads get progress events, same as project videos.
  submitTeamMember(formData, onProgress) {
    return new Promise((resolve) => {
      const token = localStorage.getItem(AT_TOKEN_KEY);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/team.php?action=upsert`);
      if (token) xhr.setRequestHeader("X-Dev-Token", token);
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, ...data });
      };
      xhr.onerror = () => resolve({ ok: false, error: "Network error — couldn't reach the server." });
      xhr.send(formData);
    });
  },
  async deleteTeamMember(id) {
    try {
      const token = localStorage.getItem(AT_TOKEN_KEY);
      const fd = new FormData();
      fd.append("id", id);
      const res = await fetch(`${API_BASE}/api/team.php?action=delete`, {
        method: "POST",
        headers: token ? { "X-Dev-Token": token } : {},
        body: fd,
      });
      return res.ok;
    } catch (e) { return false; }
  },

  // Renders team-card grid (team.html) from live member data, with a
  // real uploaded photo when present, falling back to the icon otherwise.
  renderTeamGrid(containerEl, members) {
    if (!containerEl || !members || !members.length) return;
    containerEl.innerHTML = members.map(m => {
      const photoHtml = m.photo
        ? `<img src="${AT.escapeAttr(m.photo)}" alt="${AT.escapeAttr(m.name)}">`
        : "";
      const skillsHtml = (m.skills || []).map(s => `<span class="badge-stack">${AT.escapeHtml(s)}</span>`).join("");
      const statusLabel = m.status === "busy" ? "In progress" : "Available";
      const statusClass = m.status === "busy" ? "busy" : "avail";
      return `
      <div class="col-md-6 col-lg-4">
        <div class="team-card">
          <div class="team-photo"><i class="bi bi-person-fill"></i>${photoHtml}</div>
          <h6>${AT.escapeHtml(m.name)}</h6>
          <div class="role">${AT.escapeHtml(m.role)}</div>
          <div class="d-flex gap-1 justify-content-center flex-wrap mb-2">${skillsHtml}</div>
          <div style="font-size:11.5px; color:var(--text-mute);"><span class="status-dot ${statusClass}"></span> ${statusLabel}</div>
        </div>
      </div>`;
    }).join("");
  },

  // Compact avatar-only version used in the homepage "Meet the team" preview.
  renderTeamPreview(containerEl, members, limit) {
    if (!containerEl || !members || !members.length) return;
    const list = limit ? members.slice(0, limit) : members;
    containerEl.innerHTML = list.map(m => {
      const photoHtml = m.photo
        ? `<img src="${AT.escapeAttr(m.photo)}" alt="${AT.escapeAttr(m.name)}">`
        : "";
      const skillsHtml = (m.skills || []).slice(0, 3).map(s => `<span class="badge-stack">${AT.escapeHtml(s)}</span>`).join("");
      const statusClass = m.status === "busy" ? "busy" : "avail";
      return `
      <div class="dev-row">
        <div class="avatar"><i class="bi bi-person-fill"></i>${photoHtml}</div>
        <div class="flex-grow-1">
          <div style="font-size:13.5px; font-weight:600;">${AT.escapeHtml(m.name)}</div>
          <div class="d-flex gap-1 mt-1">${skillsHtml}</div>
        </div>
        <span class="status-dot ${statusClass}"></span>
      </div>`;
    }).join("");
  },

  // ---- Thumbnail color variety (no real poster images exist, so each
  // project gets a distinct, consistent gradient derived from its name) ----
  wcHueFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
  },
  wcGradient(name) {
    const h = AT.wcHueFromString(name || "project");
    return `linear-gradient(135deg, hsl(${h},60%,22%) 0%, hsl(${(h + 50) % 360},55%,14%) 100%)`;
  },
  wcCard(p, compact) {
    const hasVideo = !!p.video;
    const badgeHtml = hasVideo
      ? `<span class="wc-thumb-badge has-video"><i class="bi bi-record-circle-fill"></i> Screen recording</span>`
      : `<span class="wc-thumb-badge"><i class="bi bi-record-circle"></i> Coming soon</span>`;
    const desc = p.tagline || (p.description ? p.description.slice(0, 100) : "");
    const tagsHtml = (p.tags || []).map(t => `<span class="badge-stack">${AT.escapeHtml(t)}</span>`).join("");
    const actionsHtml = `
      ${p.live ? `<a class="btn-ghost" style="padding:5px 12px; font-size:11.5px;" href="${AT.escapeAttr(p.live)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Visit site</a>` : ""}
      ${p.repo ? `<a class="btn-ghost" style="padding:5px 12px; font-size:11.5px;" href="${AT.escapeAttr(p.repo)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Repo</a>` : ""}
    `;
    return `
      <div class="work-card-v2${compact ? " compact" : ""}">
        <div class="wc-thumb" style="background:${AT.wcGradient(p.name)}" onclick="AT.openLightbox('${p.id}')">
          <div class="wc-play"><i class="bi bi-play-fill"></i></div>
          ${badgeHtml}
        </div>
        <div class="wc-body">
          <h6>${AT.escapeHtml(p.name)}</h6>
          ${compact ? "" : `<p>${AT.escapeHtml(desc)}</p>`}
          <div class="wc-tags">${tagsHtml}</div>
          <div class="wc-actions">${actionsHtml}</div>
        </div>
      </div>`;
  },

  // Renders the public "Our work" card grid from live project data.
  // `projects` = array from fetchProjects(); `limit` optionally caps how
  // many show (used by index.html's compact preview).
  renderWorkGrid(containerEl, projects, limit) {
    if (!containerEl) return;
    this._lastProjects = projects; // used by openLightbox
    const list = limit ? projects.slice(0, limit) : projects;
    if (!list.length) {
      containerEl.innerHTML = `<div class="col-12"><div class="empty-state">No projects published yet.</div></div>`;
      return;
    }
    containerEl.className = (containerEl.className || "") + " wc-grid";
    containerEl.innerHTML = list.map(p => `<div class="col-md-6">${AT.wcCard(p, false)}</div>`).join("");
  },

  // Compact 3-up "Our work" preview used on the homepage.
  renderWorkPreview(containerEl, projects, limit) {
    if (!containerEl) return;
    this._lastProjects = projects;
    const list = limit ? projects.slice(0, limit) : projects;
    if (!list.length) return;
    containerEl.className = (containerEl.className || "") + " wc-grid";
    containerEl.innerHTML = list.map(p => `<div class="col-md-4">${AT.wcCard(p, true)}</div>`).join("");
  },

  // Theater lightbox: click a thumbnail -> big video + all project info,
  // shown below the player.
  openLightbox(id) {
    const p = (this._lastProjects || []).find(x => x.id === id);
    if (!p) return;

    let backdrop = document.getElementById("atLightbox");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "atLightbox";
      backdrop.className = "at-lightbox-backdrop";
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) AT.closeLightbox(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") AT.closeLightbox(); });
      document.body.appendChild(backdrop);
    }

    const tagsHtml = (p.tags || []).map(t => `<span class="badge-stack">${AT.escapeHtml(t)}</span>`).join("");
    const videoHtml = p.video
      ? `<video src="${p.video}" controls autoplay preload="metadata"></video>`
      : `<div class="at-lightbox-empty"><i class="bi bi-camera-reels"></i><span>No screen recording uploaded yet</span></div>`;
    const actionsHtml = `
      ${p.live ? `<a class="btn-grad" href="${AT.escapeAttr(p.live)}" target="_blank" rel="noopener">Visit live site</a>` : ""}
      ${p.repo ? `<a class="btn-ghost" href="${AT.escapeAttr(p.repo)}" target="_blank" rel="noopener">View repo</a>` : ""}
    `;

    backdrop.innerHTML = `
      <div class="at-lightbox-panel" onclick="event.stopPropagation()">
        <div class="at-lightbox-close" onclick="AT.closeLightbox()"><i class="bi bi-x"></i></div>
        <div class="at-lightbox-video-wrap">${videoHtml}</div>
        <div class="at-lightbox-info">
          <h3>${AT.escapeHtml(p.name)}</h3>
          <p>${AT.escapeHtml(p.description || p.tagline || "No description yet.")}</p>
          <div class="at-lightbox-tags">${tagsHtml}</div>
          <div class="at-lightbox-actions">${actionsHtml}</div>
        </div>
      </div>`;

    requestAnimationFrame(() => backdrop.classList.add("open"));
    document.body.style.overflow = "hidden";
  },

  closeLightbox() {
    const backdrop = document.getElementById("atLightbox");
    if (!backdrop) return;
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => {
      const video = backdrop.querySelector("video");
      if (video) video.pause();
      backdrop.innerHTML = "";
    }, 200);
  },

  // Kept as an alias so any old onclick="AT.openProjectDetails(...)" still works.
  openProjectDetails(id) {
    AT.openLightbox(id);
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  escapeAttr(str) {
    return AT.escapeHtml(str);
  },
};

// Authentech — shared site chrome (sidebar, topbar, theme)
const AT_NAV_ITEMS = [
  { key: "home", label: "Home", icon: "bi-house", href: "index.html" },
  { key: "about", label: "About", icon: "bi-info-circle", href: "about.html" },
  { key: "work", label: "Work", icon: "bi-grid", href: "work.html" },
  { key: "team", label: "Team", icon: "bi-people", href: "team.html" },
  { key: "quote", label: "Get a quote", icon: "bi-calculator", href: "quote.html" },
  { key: "testimonials", label: "Testimonials", icon: "bi-chat-quote", href: "testimonials.html" },
  { key: "faq", label: "FAQ + blog", icon: "bi-question-circle", href: "faq.html" },
];

function renderSidebar(activeKey) {
  const navHtml = AT_NAV_ITEMS.map(item => `
    <a class="nav-item${item.key === activeKey ? " active" : ""}" title="${item.label}" href="${item.href}">
      <i class="bi ${item.icon}"></i> <span class="label">${item.label}</span>
    </a>`).join("");

  const html = `
    <div class="sidebar-head">
      <div class="brand">
        <img src="assets/img/logo.png" alt="Authentech logo">
        <div class="brand-text">
          <span><span class="grad-text">Authentech</span></span>
          <small>5 DEVS · 1 VISION</small>
        </div>
      </div>
      <div class="toggle-btn" onclick="document.body.classList.toggle('collapsed')" title="Toggle sidebar">
        <i class="bi bi-layout-sidebar-inset"></i>
      </div>
    </div>

    <div class="nav-section-label">Explore</div>
    ${navHtml}

    <div class="nav-section-label">Connect</div>
    <a class="nav-item${activeKey === "contact" ? " active" : ""}" title="Contact" href="contact.html">
      <i class="bi bi-envelope"></i> <span class="label">Contact</span>
    </a>

    <div class="mode-toggle" id="mode-toggle-root" style="display:none;">
      <button id="mode-simple" onclick="navTo('index.html')">Simple view</button>
      <button id="mode-dev" onclick="navTo('dashboard.html')" title="Team-only project & upload workspace">Dev mode</button>
    </div>
  `;
  const el = document.getElementById("sidebar-root");
  if (el) el.innerHTML = html;

  const isDashboard = window.location.pathname.endsWith("dashboard.html");
  if (isDashboard) {
    AT.checkDevAuth().then(authed => {
      if (authed) {
        const toggle = document.getElementById("mode-toggle-root");
        if (toggle) toggle.style.display = "";
        const simpleBtn = document.getElementById("mode-simple");
        const devBtn = document.getElementById("mode-dev");
        devBtn.classList.add("active"); simpleBtn.classList.remove("active");
      }
    });
  } else {
    AT.checkDevAuth().then(authed => {
      if (authed) {
        const toggle = document.getElementById("mode-toggle-root");
        if (toggle) toggle.style.display = "";
        const simpleBtn = document.getElementById("mode-simple");
        if (simpleBtn) simpleBtn.classList.add("active");
      }
    });
  }
}

function renderTopline(statusText, primaryLabel, primaryHref) {
  const html = `
    <div class="status-pill"><span class="dot"></span> ${statusText}</div>
    <div class="d-flex gap-2 align-items-center">
      <div class="theme-toggle" onclick="toggleTheme()" title="Toggle light / dark mode">
        <i class="bi bi-moon-stars-fill" id="theme-icon"></i>
      </div>
      <a class="btn-ghost" href="work.html">View projects</a>
      <a class="btn-grad" href="${primaryHref || 'quote.html'}">${primaryLabel || 'Start a proposal'}</a>
    </div>
  `;
  const el = document.getElementById("topline-root");
  if (el) el.innerHTML = html;
  syncThemeIcon();
}

function toggleTheme() {
  const html = document.documentElement;
  const isLight = html.getAttribute("data-theme") === "light";
  const next = isLight ? "dark" : "light";
  html.setAttribute("data-theme", next);
  html.setAttribute("data-bs-theme", next);
  syncThemeIcon();
}

function syncThemeIcon() {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  ["theme-icon", "theme-icon-m"].forEach(id => {
    const icon = document.getElementById(id);
    if (icon) icon.className = isLight ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
  });
}

function renderMobileBottomBar(activeKey){
  const el = document.getElementById("mobile-bottombar-root");
  if (!el) return;
  const items = [
    {key:"home", href:"index.html", icon:"bi-house", label:"Home"},
    {key:"about", href:"about.html", icon:"bi-info-circle", label:"About"},
    {key:"work", href:"work.html", icon:"bi-grid", label:"Work"},
    {key:"team", href:"team.html", icon:"bi-people", label:"Team"},
    {key:"quote", href:"quote.html", icon:"bi-calculator", label:"Get a quote"},
    {key:"testimonials", href:"testimonials.html", icon:"bi-chat-quote", label:"Testimonials"},
    {key:"faq", href:"faq.html", icon:"bi-question-circle", label:"FAQ + blog"},
    {key:"contact", href:"contact.html", icon:"bi-envelope", label:"Contact"},
  ];
  el.innerHTML = items.map(it => `
    <a class="mb-item${it.key === activeKey ? " active" : ""}" href="${it.href}" title="${it.label}">
      <i class="bi ${it.icon}"></i><span class="mb-label">${it.label}</span>
    </a>`).join("");

  let pressTimer = null;
  el.querySelectorAll(".mb-item").forEach(item => {
    item.addEventListener("touchstart", () => morphPeek(item), {passive:true});
    item.addEventListener("mousedown", () => morphPeek(item));
  });
  function morphPeek(item){
    el.querySelectorAll(".mb-item.morph").forEach(o => { if (o !== item) o.classList.remove("morph"); });
    item.classList.add("morph");
  }
}

function renderMobileTopbar(){
  const el = document.getElementById("mobile-topbar-root");
  if (!el) return;
  el.innerHTML = `
    <div class="brand">
      <img src="assets/img/logo.png" alt="Authentech logo">
      <span class="grad-text">Authentech</span>
    </div>
    <div class="theme-toggle" onclick="toggleTheme()" title="Toggle light / dark mode">
      <i class="bi bi-moon-stars-fill" id="theme-icon-m"></i>
    </div>
  `;
  syncThemeIcon();
}

function closeSidebarDrawer(){
  document.body.classList.remove("sidebar-open");
}

function themeParam(){
  const t = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return "?nav=1&theme=" + t;
}

function navTo(href){
  document.body.classList.add("page-leaving");
  setTimeout(() => { window.location.href = href + themeParam(); }, 190);
}

function initPageTransitions(){
  document.addEventListener("click", function(e){
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || a.target === "_blank" || a.hasAttribute("data-no-transition")) return;
    if (!href.endsWith(".html")) return;
    e.preventDefault();
    closeSidebarDrawer();
    const isMbItem = a.classList.contains("mb-item");
    if (isMbItem) a.classList.add("morph");
    const delay = isMbItem ? 380 : 190;
    setTimeout(() => { document.body.classList.add("page-leaving"); }, isMbItem ? 130 : 0);
    setTimeout(() => { window.location.href = href + themeParam(); }, delay);
  });
}
initPageTransitions();

function initSplash(){
  if (document.body.classList.contains("splash-done")) return;
  setTimeout(() => { document.body.classList.add("splash-done"); }, 5000);
}
initSplash();