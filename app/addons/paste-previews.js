(() => {
  const open = new Map();
  const timers = new WeakMap();
  const gap = 6, padding = 8;
  function bounds(anchor) {
    const pane = anchor.closest('.battle-log, .chat-log, .pm-log');
    const rect = pane?.getBoundingClientRect();
    return {
      left: Math.max(padding, (rect?.left ?? 0) + padding),
      right: Math.min(innerWidth - padding, (rect?.right ?? innerWidth) - padding),
      top: padding, bottom: innerHeight - padding,
    };
  }
  function hide(anchor, popup) {
    for (const [child, details] of [...open]) {
      if (child !== anchor && popup.contains(child)) hide(child, details);
    }
    if (popup.matches(':popover-open')) popup.hidePopover();
    anchor.setAttribute('aria-expanded', 'false');
    open.delete(anchor);
  }
  function position(anchor, popup) {
    if (!anchor.isConnected) { hide(anchor, popup); return; }
    const area = bounds(anchor), rect = anchor.getBoundingClientRect();
    if (rect.bottom < area.top || rect.top > area.bottom || rect.right < area.left || rect.left > area.right) {
      hide(anchor, popup); return;
    }
    popup.style.width = Math.max(1, Math.min(280, area.right - area.left)) + 'px';
    popup.style.maxHeight = Math.max(1, area.bottom - area.top) + 'px';
    const above = Math.max(0, rect.top - gap - area.top);
    const below = Math.max(0, area.bottom - rect.bottom - gap);
    const naturalHeight = popup.getBoundingClientRect().height;
    const useAbove = above >= naturalHeight || above >= below;
    popup.style.maxHeight = Math.max(1, useAbove ? above : below) + 'px';
    const size = popup.getBoundingClientRect();
    popup.style.left = Math.max(area.left, Math.min(rect.left + rect.width / 2 - size.width / 2, area.right - size.width)) + 'px';
    popup.style.top = Math.max(area.top, Math.min(useAbove ? rect.top - gap - size.height : rect.bottom + gap, area.bottom - size.height)) + 'px';
  }
  let frame = null;
  const reposition = () => {
    if (!open.size || frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      for (const [anchor, popup] of open) position(anchor, popup);
    });
  };
  addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, {capture: true, passive: true});
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open.size) return;
    for (const [anchor, popup] of [...open]) hide(anchor, popup);
    event.preventDefault();
    event.stopPropagation();
  }, true);
  function previewFor(target) {
    const anchor = target instanceof Element && target.closest('.threeisland-set, .threeisland-link');
    const popup = anchor?.querySelector(':scope > .threeisland-tooltip[data-pro-preview]');
    return popup ? {anchor, popup} : null;
  }
  const show = ({anchor, popup}) => {
    clearTimeout(timers.get(anchor));
    if (!popup.matches(':popover-open')) popup.showPopover();
    open.set(anchor, popup);
    anchor.setAttribute('aria-expanded', 'true');
    position(anchor, popup);
  };
  const leave = ({anchor, popup}) => {
    clearTimeout(timers.get(anchor));
    timers.set(anchor, setTimeout(() => {
      if (!anchor.matches(':hover') && !popup.matches(':hover') && !anchor.contains(document.activeElement)) hide(anchor, popup);
    }, 150));
  };
  // Native room rerenders can clone the preview markup. Delegation keeps the
  // controls working on those copies without rescanning the document.
  document.addEventListener('pointerover', event => {
    const preview = previewFor(event.target);
    if (preview) show(preview);
  }, true);
  document.addEventListener('pointerout', event => {
    const preview = previewFor(event.target);
    if (preview && !preview.anchor.contains(event.relatedTarget)) leave(preview);
  }, true);
  document.addEventListener('focusin', event => {
    const preview = previewFor(event.target);
    if (preview) show(preview);
  }, true);
  document.addEventListener('focusout', event => {
    const preview = previewFor(event.target);
    if (preview && !preview.anchor.contains(event.relatedTarget)) leave(preview);
  }, true);
  window.__showdownProPastePreview = (anchor, popup, isSet = false) => {
    popup.setAttribute('popover', 'manual');
    popup.dataset.proPreview = isSet ? 'set' : 'team';
    popup.setAttribute('role', 'group');
    popup.setAttribute('aria-label', isSet ? 'Pokémon set' : 'Team preview');
    anchor.setAttribute('aria-expanded', 'false');
    if (isSet) { anchor.tabIndex = 0; anchor.setAttribute('aria-label', 'View Pokémon set'); }
  };
})();
