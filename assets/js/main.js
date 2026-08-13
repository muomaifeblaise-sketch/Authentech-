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

  // Renders the public "Our work" card grid from live project data.
  // `projects` = array from fetchProjects(); `limit` optionally caps how
  // many show (used by index.html's compact preview).
  renderWorkGrid(containerEl, projects, limit) {
    if (!containerEl) return;
    this._lastProjects = projects; // used by openProjectDetails
    const list = limit ? projects.slice(0, limit) : projects;
    if (!list.length) {
      containerEl.innerHTML = `<div class="col-12"><div class="empty-state">No projects published yet.</div></div>`;
      return;
    }
    containerEl.innerHTML = list.map(p => {
      const mediaHtml = p.video
        ? `<video class="video-embed lg" src="${p.video}" controls preload="metadata"></video>`
        : `<div class="video-placeholder lg"><div class="vp-play"><i class="bi bi-play-fill"></i></div><span class="vp-label"><i class="bi bi-record-circle"></i> Screen recording coming soon</span></div>`;
      const desc = p.tagline || (p.description ? p.description.slice(0, 100) : "");
      const tagsHtml = (p.tags || []).map(t => `<span class="badge-stack">${AT.escapeHtml(t)}</span>`).join("");
      return `
      <div class="col-md-6 col-lg-4">
        <div class="work-card">
          ${mediaHtml}
          <h6>${AT.escapeHtml(p.name)}</h6>
          <p>${AT.escapeHtml(desc)}</p>
          <div class="d-flex gap-1 flex-wrap mb-2">${tagsHtml}</div>
          <div class="d-flex gap-2 flex-wrap">
            ${p.live ? `<a class="btn-ghost" style="padding:5px 12px; font-size:11.5px;" href="${AT.escapeAttr(p.live)}" target="_blank" rel="noopener">Visit site</a>` : ""}
            ${p.repo ? `<a class="btn-ghost" style="padding:5px 12px; font-size:11.5px;" href="${AT.escapeAttr(p.repo)}" target="_blank" rel="noopener">Repo</a>` : ""}
            <button class="btn-ghost" style="padding:5px 12px; font-size:11.5px;" onclick="AT.openProjectDetails('${p.id}')">Details</button>
          </div>
        </div>
      </div>`;
    }).join("");
  },

  // Compact 3-up "Our work" preview used on the homepage (.proj-card layout).
  renderWorkPreview(containerEl, projects, limit) {
    if (!containerEl) return;
    this._lastProjects = projects;
    const list = limit ? projects.slice(0, limit) : projects;
    if (!list.length) return;
    containerEl.innerHTML = list.map(p => {
      const mediaHtml = p.video
        ? `<video class="video-embed" src="${p.video}" preload="metadata" muted onmouseover="this.play()" onmouseout="this.pause()"></video>`
        : `<div class="video-placeholder"><div class="vp-play"><i class="bi bi-play-fill"></i></div><span class="vp-label"><i class="bi bi-record-circle"></i> Screen recording</span></div>`;
      return `
      <div class="col-md-4">
        <div class="proj-card" style="cursor:pointer;" onclick="AT.openProjectDetails('${p.id}')">
          ${mediaHtml}
          <div style="font-size:12.5px; font-weight:600;">${AT.escapeHtml(p.name)}</div>
          <div style="font-size:11px; color:var(--text-mute);">${AT.escapeHtml(p.tagline || (p.tags||[]).join(" · "))}</div>
        </div>
      </div>`;
    }).join("");
  },

  openProjectDetails(id) {
    const p = (this._lastProjects || []).find(x => x.id === id);
    if (!p) return;
    let modalEl = document.getElementById("atProjectModal");
    if (!modalEl) {
      modalEl = document.createElement("div");
      modalEl.id = "atProjectModal";
      modalEl.className = "modal fade";
      modalEl.tabIndex = -1;
      document.body.appendChild(modalEl);
    }
    const tagsHtml = (p.tags || []).map(t => `<span class="badge-stack">${AT.escapeHtml(t)}</span>`).join("");
    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="background:var(--surface); border:1px solid var(--border); color:var(--text);">
          <div class="modal-header" style="border-color:var(--border);">
            <h5 class="modal-title">${AT.escapeHtml(p.name)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${p.video ? `<video class="video-embed lg mb-3" src="${p.video}" controls preload="metadata"></video>` : ""}
            <p style="font-size:13.5px; color:var(--text-dim); line-height:1.6;">${AT.escapeHtml(p.description || p.tagline || "No description yet.")}</p>
            <div class="d-flex gap-1 flex-wrap mb-3">${tagsHtml}</div>
            <div class="d-flex gap-2 flex-wrap">
              ${p.live ? `<a class="btn-grad" href="${AT.escapeAttr(p.live)}" target="_blank" rel="noopener">Visit live site</a>` : ""}
              ${p.repo ? `<a class="btn-ghost" href="${AT.escapeAttr(p.repo)}" target="_blank" rel="noopener">View repo</a>` : ""}
            </div>
          </div>
        </div>
      </div>`;
    const modal = (typeof bootstrap !== "undefined")
      ? bootstrap.Modal.getOrCreateInstance(modalEl)
      : null;
    if (modal) {
      modal.show();
    } else {
      modalEl.classList.add("show");
      modalEl.style.display = "block";
      modalEl.style.background = "rgba(0,0,0,.6)";
      const closeBtn = modalEl.querySelector(".btn-close");
      if (closeBtn) closeBtn.addEventListener("click", () => {
        modalEl.classList.remove("show");
        modalEl.style.display = "none";
      });
      modalEl.addEventListener("click", (e) => {
        if (e.target === modalEl) { modalEl.classList.remove("show"); modalEl.style.display = "none"; }
      });
    }
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