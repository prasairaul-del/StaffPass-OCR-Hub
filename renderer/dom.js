export let previouslyFocusedElement = null;

export function setPreviouslyFocusedElement(el) {
  previouslyFocusedElement = el;
}

export function query(id) {
  return document.getElementById(id);
}

export function text(id, value) {
  const element = query(id);
  if (element) element.textContent = value;
}

export function setStatus(message, tone = 'neutral') {
  const status = query('app-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

export function getOverlayFocusableElements(overlay) {
  if (!overlay || !overlay.querySelectorAll) return [];
  return Array.from(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.disabled && element.offsetParent !== null);
}

export function restorePreviouslyFocusedElement() {
  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    previouslyFocusedElement.focus();
  }
  previouslyFocusedElement = null;
}

export function focusOverlayTarget(overlay, preferredSelector = null) {
  if (!overlay) return;
  const preferred = preferredSelector ? overlay.querySelector(preferredSelector) : null;
  if (preferred && typeof preferred.focus === 'function') {
    preferred.focus();
    return;
  }
  const focusable = getOverlayFocusableElements(overlay);
  if (focusable.length > 0 && typeof focusable[0].focus === 'function') {
    focusable[0].focus();
  }
}

export function keepFocusInsideOverlay(event, overlayId) {
  if (event.key !== 'Tab') return false;
  const overlay = query(overlayId);
  if (!overlay || overlay.getAttribute('aria-hidden') !== 'false') return false;

  const focusable = getOverlayFocusableElements(overlay);
  if (focusable.length === 0) return false;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement;
  const focusIsInsideOverlay = typeof overlay.contains === 'function'
    ? overlay.contains(activeElement)
    : activeElement === first || activeElement === last;

  if (!focusIsInsideOverlay) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export function enforceOverlayFocus(event) {
  const overlayIds = ['whats-new-overlay', 'shortcuts-overlay'];
  const activeOverlay = overlayIds.map(query).find((overlay) => overlay && overlay.getAttribute('aria-hidden') === 'false');
  if (!activeOverlay) return;
  if (typeof activeOverlay.contains === 'function' && activeOverlay.contains(event.target)) return;
  focusOverlayTarget(activeOverlay);
}

export function focusNextField(currentField) {
  const fields = [
    'field-first-name',
    'field-last-name',
    'field-doc-type',
    'field-id-number',
    'field-expiry-date',
    'field-phone-number',
    'correction-notes'
  ];
  const index = fields.indexOf(currentField.id);
  if (index !== -1 && index + 1 < fields.length) {
    const nextFieldId = fields[index + 1];
    const nextField = query(nextFieldId);
    if (nextField && typeof nextField.focus === 'function') {
      nextField.focus();
    }
  }
}

export function createConfidenceBadge(score) {
  const badge = document.createElement('span');
  badge.classList.add('confidence-badge');
  const value = Number(score) || 0;
  if (value >= 95) {
    badge.classList.add('confidence-high');
    badge.innerHTML = `<span class="badge-icon">✅</span> ${value}%`;
  } else if (value >= 80) {
    badge.classList.add('confidence-medium');
    badge.innerHTML = `<span class="badge-icon">⚠️</span> ${value}%`;
  } else {
    badge.classList.add('confidence-low');
    badge.innerHTML = `<span class="badge-icon">❌</span> ${value}%`;
  }
  return badge;
}

