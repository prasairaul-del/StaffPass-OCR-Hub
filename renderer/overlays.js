import { 
  query, 
  text, 
  restorePreviouslyFocusedElement, 
  focusOverlayTarget, 
  setPreviouslyFocusedElement, 
  getOverlayFocusableElements 
} from './dom.js';
import { compareVersions } from './utils.js';

let toastTimer = null;

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = query('theme-toggle');
  if (toggle) {
    const isDark = theme === 'dark';
    toggle.setAttribute('aria-checked', String(isDark));
  }
}

export function showToast(message) {
  const toast = query('toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2200);
}

export function toggleShortcutsOverlay() {
  const overlay = query('shortcuts-overlay');
  if (!overlay) return;
  const isHidden = overlay.getAttribute('aria-hidden') === 'true';
  if (isHidden) {
    setPreviouslyFocusedElement(document.activeElement);
    overlay.setAttribute('aria-hidden', 'false');
    focusOverlayTarget(overlay, '#shortcuts-close');
  } else {
    overlay.setAttribute('aria-hidden', 'true');
    restorePreviouslyFocusedElement();
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('staffpass-theme', next); } catch (_err) { /* ignore */ }
  showToast(next === 'dark' ? 'Dark mode enabled' : 'Light mode enabled');
}

export function loadSavedTheme() {
  try {
    const saved = localStorage.getItem('staffpass-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (_err) { /* ignore */ }
  return 'light';
}

export function parseReleaseNotes(markdown) {
  if (!markdown) return null;
  const sections = [];
  let currentSection = null;

  markdown.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      currentSection = { heading: trimmed.slice(4).trim(), items: [] };
      sections.push(currentSection);
    } else if (trimmed.startsWith('- ') && currentSection) {
      currentSection.items.push(trimmed.slice(2).trim());
    } else if (trimmed.startsWith('* ') && currentSection) {
      currentSection.items.push(trimmed.slice(2).trim());
    }
  });

  if (sections.length === 0 && markdown.trim()) {
    sections.push({ heading: 'Changes', items: markdown.trim().split('\n').filter(Boolean) });
  }

  return sections.length > 0 ? sections : null;
}

export async function fetchReleaseNotes(version) {
  // Check cache first to avoid GitHub API rate limits
  try {
    const cached = localStorage.getItem(`staffpass-release-notes-${version}`);
    if (cached) return JSON.parse(cached);
  } catch (_err) { /* ignore */ }

  if (!window.api || !window.api.fetchReleaseNotes) return null;
  try {
    const result = await window.api.fetchReleaseNotes(version);
    const sections = parseReleaseNotes(result.body);
    if (sections) {
      try { localStorage.setItem(`staffpass-release-notes-${version}`, JSON.stringify(sections)); } catch (_err) { /* ignore */ }
    }
    return sections;
  } catch (_err) {
    return null;
  }
}

export function showWhatsNewDialog(version, sections) {
  const overlay = query('whats-new-overlay');
  if (!overlay) return;

  text('whats-new-version', `v${version}`);

  const body = query('whats-new-body');
  if (body) {
    body.innerHTML = '';
    if (sections && sections.length > 0) {
      sections.forEach((section) => {
        const heading = document.createElement('h3');
        heading.textContent = section.heading;
        body.appendChild(heading);
        const list = document.createElement('ul');
        section.items.forEach((item) => {
          const li = document.createElement('li');
          li.textContent = item;
          list.appendChild(li);
        });
        body.appendChild(list);
      });
    } else {
      const p = document.createElement('p');
      p.textContent = 'Bug fixes and improvements.';
      body.appendChild(p);
    }
  }

  overlay.setAttribute('aria-hidden', 'false');
  setPreviouslyFocusedElement(document.activeElement);
  focusOverlayTarget(overlay, '#whats-new-close');
}

export function dismissWhatsNew() {
  const overlay = query('whats-new-overlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  restorePreviouslyFocusedElement();
}

export function saveSeenVersion(version) {
  try { localStorage.setItem('staffpass-last-seen-version', version); } catch (_err) { /* ignore */ }
}

export function getSeenVersion() {
  try { return localStorage.getItem('staffpass-last-seen-version'); } catch (_err) { return null; }
}

export async function checkAndShowWhatsNew() {
  if (!window.api || !window.api.getVersion) return;
  try {
    const version = await window.api.getVersion();
    const seen = getSeenVersion();
    if (!seen || compareVersions(version, seen) > 0) {
      const sections = await fetchReleaseNotes(version);
      showWhatsNewDialog(version, sections);
    }
    saveSeenVersion(version);
  } catch (_err) { /* ignore */ }
}

export function checkForUpdates() {
  if (!window.api || !window.api.checkForUpdates) return;
  window.api.checkForUpdates();
}

export function setupAutoUpdateUI() {
  if (!window.api || !window.api.onUpdateStatus) return;

  window.api.onUpdateStatus((status) => {
    switch (status.state) {
      case 'checking':
        showToast('Checking for updates...');
        break;
      case 'available':
        showToast(`Update v${status.version} available - downloading...`);
        break;
      case 'downloading':
        showToast(`Downloading update... ${status.percent}%`);
        break;
      case 'downloaded':
        showUpdateReadyBanner(status.version);
        break;
      case 'not-available':
        // Silently ignore
        break;
      case 'error':
        // Silently ignore
        break;
    }
  });
}

export function showUpdateReadyBanner(version) {
  let banner = query('update-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'update-banner';
    banner.setAttribute('role', 'alert');
    document.body.appendChild(banner);
  }

  banner.innerHTML = '';

  const span = document.createElement('span');
  span.textContent = `Update v${version} is ready to install. `;
  banner.appendChild(span);

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className = 'update-banner-btn';
  installBtn.textContent = 'Restart & Install';
  installBtn.addEventListener('click', () => {
    if (window.api && window.api.installUpdate) {
      window.api.installUpdate();
    }
  });
  banner.appendChild(installBtn);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'update-banner-dismiss';
  dismissBtn.textContent = 'x';
  dismissBtn.setAttribute('aria-label', 'Dismiss update notification');
  dismissBtn.addEventListener('click', () => {
    banner.remove();
  });
  banner.appendChild(dismissBtn);
}

export async function loadVersion() {
  if (!window.api || !window.api.getVersion) return;
  try {
    const version = await window.api.getVersion();
    text('app-version', `v${version}`);
  } catch (_err) { /* ignore */ }
}
