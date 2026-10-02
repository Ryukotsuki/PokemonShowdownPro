// Extend the official client's theme picker without changing its built-in themes.
(() => {
  if (window.__showdownProTheme) return true;
  function installRoomControls() {
    if (typeof Element !== 'function') return;
    const seen = new WeakSet();
    function inspect(root) {
      if (!(root instanceof Element)) return;
      const controls = [...root.querySelectorAll('.infobox-roomintro button, .infobox-roomintro input[type="button"], .infobox-roomintro input[type="submit"], .infobox-roomintro a, .infobox-roomintro summary')];
      if (root.matches('.infobox-roomintro button, .infobox-roomintro a, .infobox-roomintro summary')) controls.unshift(root);
      // Added descendants can arrive inside an already-mounted introduction.
      if (root.closest('.infobox-roomintro')) controls.push(...root.querySelectorAll('button, input[type="button"], input[type="submit"], a, summary'));
      for (const control of controls) {
        if (seen.has(control)) continue;
        seen.add(control);
        const intro = control.closest('.infobox-roomintro');
        const text = control.textContent.trim() || control.getAttribute('value') || '';
        const link = control.closest('a[href]');
        const art = control.style.backgroundImage.includes('url(');
        const background = control.style.backgroundColor;
        const transparentBackground = ['', 'none', 'initial'].includes(control.style.backgroundImage) &&
          (['transparent', 'initial'].includes(background) || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(background));
        let positioned = false;
        let banner = false;
        for (let element = control; element && element !== intro; element = element.parentElement) {
          if (['absolute', 'fixed'].includes(element.style.position)) positioned = true;
          if (element !== control && ([...element.children].some(child => child.tagName === 'IMG') || element.style.backgroundImage.includes('url('))) banner = true;
        }
        // Image-map targets may contain labels or be summaries inside positioned
        // book disclosures. Preserve their authored transparent layer.
        if ((positioned || (banner && (!control.textContent.trim() || transparentBackground))) && !art &&
            (banner || transparentBackground || (!control.textContent.trim() && !control.querySelector('img, svg, canvas'))) &&
            (!background || transparentBackground)) {
          control.dataset.showdownProRoomControl = 'hotspot';
          for (const label of [control, ...control.querySelectorAll('*')]) {
            const ink = label.style.color || (label.tagName === 'FONT' ? label.getAttribute('color') : '');
            if (ink) label.style.setProperty('--showdown-pro-room-ink', ink);
            if (label.style.textShadow) label.style.setProperty('--showdown-pro-room-text-shadow', label.style.textShadow);
          }
          if (control.tagName === 'SUMMARY' && control.parentElement.style.height) {
            control.parentElement.style.setProperty('--showdown-pro-room-height', control.parentElement.style.height);
          }
          continue;
        }
        if (banner && !positioned && !art && control.matches('button, input, a.button')) {
          control.dataset.showdownProRoomControl = 'banner-action';
          if (control.style.borderRadius) control.style.setProperty('--showdown-pro-room-action-radius', control.style.borderRadius);
          continue;
        }
        if (art && !control.textContent.trim()) {
          let label = control.getAttribute('aria-label') || control.title;
          if (!label && control.value) {
            if (/^\/(?:rules|roomrules)\b/i.test(control.value)) label = 'Room Rules';
            else if (/^\/(?:roomfaq|rfaq)\s+/i.test(control.value)) label = control.value.replace(/^\/(?:roomfaq|rfaq)\s+/i, '').trim();
          }
          if (!label && link) {
            if (/discord\.(?:gg|com)/i.test(link.href)) label = 'Discord';
            else if (/board-game-based-meta-games/i.test(link.href)) label = 'Board Game Metagames';
            else label = link.getAttribute('title') || 'Open link';
          }
          const caption = document.createElement('span');
          caption.className = 'showdown-pro-room-art-label';
          caption.style.display = 'none';
          caption.textContent = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Open menu';
          control.dataset.showdownProRoomArt = 'true';
          control.appendChild(caption);
          continue;
        }
        if (!text && !art && !link && !control.name && !control.hasAttribute('data-cmd') && control.style.cursor === 'default') {
          control.dataset.showdownProRoomControl = 'decorative';
          continue;
        }
        if (control.matches('button, input, a.button') && text && !art && !transparentBackground && !positioned) {
          control.dataset.showdownProRoomControl = 'flow';
          if (control.style.cssFloat) {
            control.style.setProperty('--showdown-pro-room-margin-left', control.style.marginLeft || '0px');
            control.style.setProperty('--showdown-pro-room-margin-right', control.style.marginRight || '0px');
          }
        }
      }
    }
    inspect(document.body);
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) inspect(node);
    }).observe(document.body, { childList: true, subtree: true });
  }
  function installTCGPages() {
    // Bot HTML pages have no shared client stylesheet. Identify the simulator
    // by its own command targets, leaving other bots and room artwork alone.
    function inspect(root) {
      if (!(root instanceof Element)) return;
      const rooms = new Set(root.querySelectorAll('.ps-room'));
      const parentRoom = root.closest('.ps-room');
      if (parentRoom) rooms.add(parentRoom);
      for (const room of rooms) {
        if (room.querySelector('.chat-log, .battle')) continue;
        const page = room.querySelector('.page-html-container') || room;
        const simulator = [...page.querySelectorAll('[value], [data-cmd], form[data-command]')].some(control =>
          /(?:^|[\s,])\.ptcg(?:\s|$)/i.test(control.getAttribute('value') || control.getAttribute('data-cmd') || control.getAttribute('data-command') || ''));
        if (!simulator) continue;
        page.dataset.showdownProTcg = 'true';
        for (const element of page.querySelectorAll('div, section, fieldset')) {
          const style = element.style;
          // Retain card artwork and game-specific colors; skin neutral panels.
          const color = style.backgroundColor;
          const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          const blue = rgb && +rgb[3] > +rgb[1] && +rgb[3] >= +rgb[2] && +rgb[2] >= +rgb[1];
          if (style.borderRadius && !style.backgroundImage.includes('url(') && (!color || blue)) {
            element.dataset.showdownProTcgPanel = 'true';
          }
        }
        for (const table of page.querySelectorAll('table')) {
          if (/Deck builder/.test(table.textContent) && /Live battles/.test(table.textContent) &&
              /Sample decks/.test(table.textContent)) table.dataset.showdownProTcgLayout = 'lobby';
          else if (table.querySelector('thead')) table.parentElement.dataset.showdownProTcgTable = 'true';
        }
        for (const button of page.querySelectorAll('button')) {
          if (button.style.fontWeight === 'bold' && /^rgba?\(/.test(button.style.backgroundColor) && /\.ptcg (?:fmt|rankings)(?:\s|$)/.test(button.value)) {
            button.dataset.showdownProTcgSelected = 'true';
          }
          if (/^Battle!$/.test(button.textContent.trim()) && button.type === 'submit') button.dataset.showdownProTcgAction = 'battle';
        }
        for (const row of page.querySelectorAll('div, p')) {
          if (row.children.length > 1 && [...row.children].every(element => element.matches('button, a.button') &&
              !element.querySelector('img') && !element.style.backgroundImage.includes('url('))) row.dataset.showdownProTcgControls = 'true';
        }
        for (const footer of page.querySelectorAll('div, p, nav')) {
          const buttons = [...footer.children].filter(element => element.matches('button, a'));
          if (buttons.length >= 3 && buttons.every(button => /^(What's New|About|Faq|Credits|Rankings)$/i.test(button.textContent.trim()))) {
            footer.dataset.showdownProTcgFooter = 'true';
            for (const separator of footer.children) if (separator.textContent.trim() === '|') separator.dataset.showdownProTcgSeparator = 'true';
          }
        }
      }
    }
    inspect(document.body);
    new MutationObserver(records => {
      const roots = new Set(records.map(record => record.target.closest?.('.ps-room') || record.target));
      for (const root of roots) inspect(root);
    }).observe(document.body, { childList: true, subtree: true });
  }
  function installHelpTips() {
    // Native title bubbles are drawn by Chromium rather than the page. Handle
    // them only while Pro is selected, preserving the original title elsewhere.
    let active = null;
    let savedTitle = '';
    let describedBy = null;
    let timer;
    let origin;
    let point = { x: 0, y: 0 };
    const tip = document.createElement('div');
    tip.id = 'showdown-pro-help-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    const isPro = () => document.documentElement.classList.contains('showdown-pro');
    const titleObserver = new MutationObserver(() => {
      if (!active) return;
      const title = active.getAttribute('title');
      if (title === null) return;
      savedTitle = title;
      active.removeAttribute('title');
      if (!title) { hide(); return; }
      tip.textContent = title;
      if (!tip.hidden) position();
    });
    function hide() {
      clearTimeout(timer);
      titleObserver.disconnect();
      tip.hidden = true;
      if (active) {
        if (!active.hasAttribute('title')) active.setAttribute('title', savedTitle);
        // Remove just our description token; preserve descriptions added by
        // the client while the help tip was showing.
        const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
        if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
        else if (describedBy !== null) active.setAttribute('aria-describedby', describedBy);
        else active.removeAttribute('aria-describedby');
      }
      active = null;
    }
    function position() {
      const gap = 8;
      const bounds = active.getBoundingClientRect();
      const rect = tip.getBoundingClientRect();
      let x = origin === 'focus' ? bounds.left : point.x + 12;
      let y = origin === 'focus' ? bounds.bottom + gap : point.y + 18;
      if (y + rect.height > innerHeight - gap) y = (origin === 'focus' ? bounds.top - gap : point.y - 12) - rect.height;
      tip.style.left = Math.max(gap, Math.min(x, innerWidth - rect.width - gap)) + 'px';
      tip.style.top = Math.max(gap, Math.min(y, innerHeight - rect.height - gap)) + 'px';
    }
    function start(target, event, source) {
      if (!isPro() || !(target instanceof Element)) { hide(); return; }
      const element = target.closest('[title]') || (active?.contains(target) ? active : null);
      if (element === active && active) {
        if (source === 'focus') {
          origin = source;
          if (!tip.hidden) position();
        }
        return;
      }
      hide();
      if (!element || element.closest('[data-showdex-module], [data-tippy-root]')) return;
      const title = element.getAttribute('title');
      if (!title?.trim()) return;
      active = element;
      savedTitle = title;
      describedBy = element.getAttribute('aria-describedby');
      origin = source;
      point = { x: event.clientX || 0, y: event.clientY || 0 };
      active.removeAttribute('title');
      titleObserver.observe(active, { attributes: true, attributeFilter: ['title'] });
      timer = setTimeout(() => {
        if (!active?.isConnected || !isPro()) { hide(); return; }
        tip.textContent = savedTitle;
        if (!tip.isConnected) document.body.appendChild(tip);
        tip.hidden = false;
        const ids = new Set((active.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
        ids.add(tip.id);
        active.setAttribute('aria-describedby', [...ids].join(' '));
        position();
      }, source === 'focus' ? 100 : 350);
    }
    document.addEventListener('mouseover', event => start(event.target, event, 'pointer'), true);
    document.addEventListener('mouseout', event => {
      if (origin === 'pointer' && active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))) hide();
    }, true);
    document.addEventListener('mousemove', event => {
      if (!active || origin !== 'pointer') return;
      point = { x: event.clientX, y: event.clientY };
      if (!tip.hidden) position();
    }, true);
    document.addEventListener('focusin', event => start(event.target, event, 'focus'), true);
    document.addEventListener('focusout', () => { if (origin === 'focus') hide(); }, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    const observer = new MutationObserver(() => {
      if (active && (!active.isConnected || !isPro())) hide();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (window.PS?.prefs?.set) {
    const ps = window.PS;
    const panel = ps.roomTypes?.options?.prototype;
    const preact = window.preact;
    if (!panel?.render || !preact?.h) return false;
    // Let Preact own number steppers so changes reconcile with the native
    // form state without external DOM wrapping.
    const nativeVNode = preact.options.vnode;
    preact.options.vnode = node => {
      nativeVNode?.call(preact.options, node);
      if (node.type !== 'input' || node.props.type !== 'number' || node.props['data-showdown-pro-stepper']) return;
      const level = node.props.name === 'level' && node.props.class?.includes('numform');
      const bestOf = node.props.name === 'bestofvalue';
      if (!level && !bestOf) return;
      const inputProps = { ...node.props, 'data-showdown-pro-stepper': 'true' };
      const step = direction => event => {
        event.preventDefault();
        event.stopPropagation();
        const input = event.currentTarget.closest('.showdown-pro-number-control')?.querySelector('input');
        if (!input || input.disabled) return;
        // An unset level displays the format default as its placeholder.
        if (!input.value) input.value = input.placeholder || (bestOf ? '3' : '100');
        const previous = input.value;
        direction === 'up' ? input.stepUp() : input.stepDown();
        if (input.value !== previous) {
          input.dispatchEvent(new Event(bestOf ? 'input' : 'change', { bubbles: true }));
        }
      };
      node.type = 'span';
      node.props = {
        class: 'showdown-pro-number-control', style: { display: 'contents' },
        children: [preact.h('input', inputProps), preact.h('span', {
          class: 'showdown-pro-number-stepper', style: { display: 'none' },
        }, ['up', 'down'].map(direction => preact.h('button', {
          type: 'button', class: 'showdown-pro-step-button', 'data-step': direction, disabled: inputProps.disabled,
          'aria-label': `${direction === 'up' ? 'Increase' : 'Decrease'} ${bestOf ? 'best-of series length' : 'Pokémon level'}`,
          onClick: step(direction),
        })))],
      };
    };
    const nativeRender = panel.render;
    // Extend the rendered options so Preact owns the new entry and preserves
    // the selected value when the settings panel updates or opens again.
    panel.render = function (...args) {
      const tree = nativeRender.apply(this, args);
      const visit = node => {
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (!node?.props) return;
        if (node.type === 'select' && node.props.name === 'theme') {
          const children = Array.isArray(node.props.children) ? [...node.props.children] : [node.props.children];
          if (!children.some(child => child?.props?.value === 'pro')) {
            const systemIndex = children.findIndex(child => child?.props?.value === 'system');
            children.splice(systemIndex < 0 ? children.length : systemIndex, 0, preact.h('option', { value: 'pro' }, 'Pro'));
          }
          node.props.children = children;
        } else visit(node.props.children);
      };
      visit(tree);
      return tree;
    };
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const pro = ps.prefs.theme === 'pro';
      const dark = pro || ps.prefs.theme === 'dark' || (ps.prefs.theme === 'system' && system.matches);
      document.documentElement.classList.toggle('showdown-pro', pro);
      document.documentElement.classList.toggle('dark', dark);
      document.body.classList.toggle('dark', dark);
    };
    document.documentElement.classList.add('showdown-new-client');
    ps.prefs.subscribe(key => { if (!key || key === 'theme') sync(); });
    system.addEventListener('change', sync);
    // The native view can replace body.className during mount or preference
    // reloads; Pro must retain the dark base without changing its saved name.
    new MutationObserver(() => {
      if (ps.prefs.theme === 'pro' && !document.body.classList.contains('dark')) sync();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
    installHelpTips();
    installRoomControls();
    installTCGPages();
    ps.update();
    window.__showdownProTheme = true;
    return true;
  }
  if (!window.OptionsPopup || !window.Storage?.prefs) return false;
  const popup = window.OptionsPopup.prototype;
  const nativeUpdate = popup.update;
  const nativeSetTheme = popup.setTheme;
  const prefs = window.Storage.prefs.bind(window.Storage);

  function apply(context, event) {
    const choice = event.currentTarget.value;
    const pro = choice === 'pro';
    document.documentElement.classList.toggle('showdown-pro', pro);
    // Pro builds on native dark mode, including Showdex's automatic scheme.
    nativeSetTheme.call(context, { ...event, currentTarget: { value: pro ? 'dark' : choice } });
    if (pro) prefs('theme', 'pro');
  }
  popup.setTheme = function (event) { apply(this, event); };
  popup.update = function (...args) {
    const result = nativeUpdate.apply(this, args);
    const select = this.el.querySelector('select[name="theme"]');
    if (select) {
      if (!select.querySelector('option[value="pro"]')) {
        const option = document.createElement('option');
        option.value = 'pro';
        option.textContent = 'Pro';
        select.insertBefore(option, select.querySelector('option[value="system"]'));
      }
      select.value = prefs('theme') || 'light';
    }
    return result;
  };
  // Older versions forced Dark on every load. Keep that appearance as Pro once,
  // then preserve all subsequent selections, including native Dark, on reload.
  if (!prefs('showdownProThemeVersion')) {
    if (!prefs('theme') || prefs('theme') === 'dark') prefs('theme', 'pro');
    prefs('showdownProThemeVersion', 1);
  }
  apply(popup, { currentTarget: { value: prefs('theme') || 'light' } });
  installHelpTips();
  installRoomControls();
  installTCGPages();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (prefs('theme') === 'system') apply(popup, { currentTarget: { value: 'system' } });
  });
  window.__showdownProTheme = true;
  return true;
})();
