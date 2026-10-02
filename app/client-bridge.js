(() => {
  if (window.__showdownPro) return true;
  const host = typeof window.PS?.receive === 'function' ? window.PS : window.app;
  if (!host?.receive || !host?.send) return false;
  const battleState = new Map();
  let pendingReplay = null, recentAutoReplay = null;
  const connected = () => {
    // The new client may keep its socket inside a worker. Its connection flag
    // covers both transports and becomes false while reconnecting.
    if (host === window.PS && typeof host.connection?.connected === 'boolean') return host.connection.connected;
    return (host.socket || host.connection?.socket)?.readyState === 1;
  };
  const replayId = roomId => roomId.slice('battle-'.length);
  const finishedRoom = roomId => {
    const room = host.rooms?.[roomId];
    return !!room && (battleState.get(roomId)?.finished || room.battleEnded || room.battle?.ended);
  };
  const replayUrlFromMessage = message => {
    if (typeof message !== 'string' || !message.includes('Your replay has been uploaded')) return null;
    const match = /https:\/\/replay\.pokemonshowdown\.com\/([a-z0-9-]+)/i.exec(message);
    return match ? `https://replay.pokemonshowdown.com/${match[1].toLowerCase()}` : null;
  };
  const isAutoReplay = id => {
    const expected = pendingReplay?.id || (recentAutoReplay?.expiresAt > Date.now() ? recentAutoReplay.id : null);
    const serverid = String(host.server?.id || window.Config?.server?.id || 'showdown').split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const bases = expected ? [expected, ...(serverid && serverid !== 'showdown' ? [`${serverid}-${expected}`] : [])] : [];
    return bases.some(base => id === base || id.startsWith(base + '-'));
  };
  const finishReplay = result => {
    if (!pendingReplay) return;
    clearTimeout(pendingReplay.timer);
    if (result.url) recentAutoReplay = { id: pendingReplay.id, expiresAt: Date.now() + 30000 };
    const { resolve } = pendingReplay;
    pendingReplay = null;
    resolve(result);
  };
  const uploadError = response => ({
    'hash mismatch': 'Someone else is already uploading a replay of this battle. Try again in five seconds.',
    'not found': "This server isn't registered, and doesn't support uploading replays.",
    'invalid id': "This server is using invalid battle IDs, so this replay can't be uploaded.",
  })[response] || `Error while uploading replay: ${response || 'No confirmation from the replay server'}`;
  const acceptReplayMessage = message => {
    const url = replayUrlFromMessage(message);
    if (!url || !isAutoReplay(url.split('/').pop())) return false;
    finishReplay({url});
    return true;
  };
  if (typeof host.alert === 'function') {
    const alert = host.alert;
    host.alert = function (message, ...args) {
      if (acceptReplayMessage(message)) return;
      return alert.call(this, message, ...args);
    };
  }
  const queryResponse = host === window.PS && host.mainmenu?.handleQueryResponse;
  const newReplayAvailable = typeof queryResponse === 'function' && typeof window.fetch === 'function';
  if (newReplayAvailable) {
    host.mainmenu.handleQueryResponse = function (id, response, ...args) {
      if (id !== 'savereplay' || !pendingReplay || response?.id !== pendingReplay.id) return queryResponse.call(this, id, response, ...args);
      const upload = pendingReplay;
      if (upload.started) return;
      if (typeof response.log !== 'string' || typeof response.password !== 'undefined' && typeof response.password !== 'string') {
        finishReplay({ error: 'Replay server returned invalid upload data.' });
        return;
      }
      upload.started = true;
      const serverid = String(host.server?.id || 'showdown').split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const replay = serverid === 'showdown' ? response.id : `${serverid}-${response.id}`;
      // Use the same authenticated, same-origin action route as the native
      // login client. Only a confirmed upload creates a saved replay link.
      const body = new URLSearchParams({ act: 'uploadreplay', log: response.log, serverid, password: response.password || '', id: replay });
      void window.fetch(`/~~${serverid}/action.php`, { method: 'POST', credentials: 'same-origin', body }).then(async result => {
        if (!result.ok) throw new Error(`Replay upload failed (HTTP ${result.status}).`);
        const text = await result.text();
        if (pendingReplay !== upload) return;
        const success = /^success(?::([a-z0-9-]*))?$/.exec(text.trim());
        finishReplay(success ? { url: `https://replay.pokemonshowdown.com/${success[1] || replay}` } : { error: uploadError(text) });
      }).catch(error => { if (pendingReplay === upload) finishReplay({ error: error.message }); });
    };
  }
  if (typeof host.addPopup === 'function') {
    const addPopup = host.addPopup;
    host.addPopup = function (type, data, ...args) {
      const nativeId = type === window.ReplayUploadedPopup && typeof data?.id === 'string' ? data.id : null;
      const messageUrl = replayUrlFromMessage(data?.message) || replayUrlFromMessage(data?.htmlMessage);
      const url = nativeId && /^[a-z0-9-]+$/.test(nativeId) ? `https://replay.pokemonshowdown.com/${nativeId}` : messageUrl;
      const id = url?.split('/').pop();
      if (id && isAutoReplay(id)) {
        finishReplay({ url });
        return null; // Auto-saved replays remain in the sidebar without an OK popup.
      }
      return addPopup.call(this, type, data, ...args);
    };
  }
  if (typeof host.addPopupMessage === 'function') {
    const addPopupMessage = host.addPopupMessage;
    host.addPopupMessage = function (message, ...args) {
      const url = replayUrlFromMessage(message);
      if (url && isAutoReplay(url.split('/').pop())) { finishReplay({ url }); return null; }
      if (pendingReplay && /^(?:Error while uploading replay:|Someone else is already uploading|This server isn't registered|This server is using invalid battle IDs)/.test(message)) {
        finishReplay({ error: message });
        return null;
      }
      return addPopupMessage.call(this, message, ...args);
    };
  }
  const receive = host.receive;
  function reportBattle(data) {
    const lifecycle = data.split('\n').filter(line => line.startsWith('>') || /^\|(init|title|player|start|turn|request|sentchoice|win|tie|deinit)(\||$)/.test(line)).map(line => {
      if (!line.startsWith('|request|')) return line;
      try {
        const request = JSON.parse(line.slice(9));
        return '|request|' + JSON.stringify({ wait: request?.wait === true, side: request?.side ? { id: request.side.id, name: request.side.name } : undefined });
      } catch { return '|request|'; }
    });
    window.showdownProEvents.receive(lifecycle.join('\n'));
  }
  function captureBattle(data) {
    if (typeof data === 'string' && data.startsWith('>battle-')) {
      let roomId;
      for (const line of data.split('\n')) {
        if (line.startsWith('>')) roomId = line.slice(1).trim();
        if (!/^battle-[a-z0-9-]+$/.test(roomId || '')) continue;
        if (line === '|init|battle') battleState.set(roomId, { finished: false, playerSide: null });
        if (line.startsWith('|request|')) {
          try {
            const request = line.slice(9).trim() ? JSON.parse(line.slice(9)) : null;
            if (request?.side?.id) {
              const state = battleState.get(roomId) || { finished: false };
              state.playerSide = request.side.id;
              battleState.set(roomId, state);
            }
          } catch { /* Invalid request carries no player identity. */ }
        }
        if (/^\|(win|tie)(?:\||$)/.test(line)) {
          const state = battleState.get(roomId) || {};
          state.finished = true; battleState.set(roomId, state);
        }
        if (line === '|deinit' || line.startsWith('|deinit|')) battleState.delete(roomId);
      }
    }
  }
  host.receive = function (data, ...args) {
    // Server-side replay uploads confirm through |popup|, which the new
    // client renders with PS.alert rather than the classic popup APIs.
    if (typeof data === 'string' && data.includes('|popup|')) {
      const lines = data.split('\n');
      let roomId = '';
      const remaining = lines.filter(line => {
        if (line.startsWith('>')) roomId = line.slice(1).trim();
        return !!roomId || !line.startsWith('|popup|') || !acceptReplayMessage(line.slice(7));
      });
      if (remaining.length !== lines.length) {
        if (!remaining.some(line => line && !line.startsWith('>'))) return;
        data = remaining.join('\n');
      }
    }
    // Observe player identity and completion before native request processing.
    if (typeof data === 'string' && data.startsWith('>battle-')) {
      captureBattle(data);
      const result = receive.call(this, data, ...args);
      reportBattle(data);
      return result;
    }
    return receive.call(this, data, ...args);
  };
  const send = host.send;
  host.send = function (data, room, ...args) {
    let roomId = room, command = data;
    if (typeof data === 'string' && (!room || room === true) && data.startsWith('battle-')) {
      const delimiter = data.indexOf('|');
      roomId = data.slice(0, delimiter); command = data.slice(delimiter + 1);
    }
    if (typeof roomId === 'string' && roomId.startsWith('battle-') && typeof command === 'string') {
      if(/^\/leavebattle(?:\||$)/.test(command) && battleState.has(roomId)) battleState.get(roomId).playerSide=null;
      window.showdownProEvents.sent(roomId, command);
    }
    return send.call(this, data, room, ...args);
  };
  const enhanceLevelInputs = () => {
    for (const input of document.querySelectorAll('.detailsform input[name="level"]:not([data-showdown-pro-stepper])')) {
      input.dataset.showdownProStepper = 'true';
      const control = document.createElement('span');
      control.className = 'showdown-pro-number-control';
      const stepper = document.createElement('span');
      stepper.className = 'showdown-pro-number-stepper';
      for (const direction of ['up', 'down']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.step = direction;
        button.disabled = input.disabled;
        button.setAttribute('aria-label', `${direction === 'up' ? 'Increase' : 'Decrease'} Pokémon level`);
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          if (input.disabled) return;
          const previous = input.value;
          if (direction === 'up') input.stepUp();
          else input.stepDown();
          if (input.value !== previous) input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        stepper.appendChild(button);
      }
      input.parentNode.insertBefore(control, input);
      control.append(input, stepper);
    }
  };
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (
      node.matches?.('.detailsform, .detailsform input[name="level"]') ||
      node.querySelector?.('.detailsform input[name="level"]')
    )))) enhanceLevelInputs();
  }).observe(document.documentElement, { childList: true, subtree: true });
  enhanceLevelInputs();
  Object.defineProperty(window, '__showdownPro', { value: {
    setAutoTimer(enabled) {
      if (typeof enabled !== 'boolean' || typeof window.Storage?.prefs !== 'function') return false;
      window.Storage.prefs('autotimer', enabled);
      if (enabled && connected()) {
        for (const [roomId, room] of Object.entries(host.rooms || {})) {
          if (!/^battle-[a-z0-9-]+$/.test(roomId) || !room?.request?.side?.id || room.battleEnded || room.battle?.ended || room.autoTimerActivated) continue;
          if (room.battle?.kickingInactive) room.autoTimerActivated = true;
          else if (typeof room.setTimer === 'function') {
            room.setTimer('on');
            room.autoTimerActivated = true;
          }
        }
      }
      return true;
    },
    saveReplay(roomId) {
      const room = host.rooms?.[roomId];
      if (!/^battle-[a-z0-9-]+$/.test(roomId) || !finishedRoom(roomId) || !(room.side || battleState.get(roomId)?.playerSide)) return Promise.resolve({ error: 'Finished player battle is unavailable for replay upload.' });
      if (!connected() || !(newReplayAvailable || host === window.app && window.ReplayUploadedPopup)) return Promise.resolve({ error: 'Replay upload is unavailable in this client or while disconnected.' });
      if (pendingReplay) return Promise.resolve({ error: 'Another replay upload is still in progress.' });
      return new Promise(resolve => {
        pendingReplay = { id: replayId(roomId), resolve, timer: setTimeout(() => finishReplay({ error: 'Replay upload timed out.' }), 25000) };
        try { host.send('/savereplay', roomId); } catch (error) { finishReplay({ error: error.message }); }
      });
    },
    playerId() {
      const user=host.user;
      const named=host===window.PS?user?.named:user?.get?.('named');
      const name=host===window.PS?(user?.userid || user?.name):(user?.get?.('userid') || user?.get?.('name'));
      return named ? String(name || '').toLowerCase().replace(/[^a-z0-9]/g,'') : null;
    },
    sendBattleMessage({roomId,phase,text}) {
      if (!['start','end'].includes(phase) || typeof text!=='string' || !text.trim() || text.length>280 || /[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(text) || text.trimStart().startsWith('/')) return {sent:false,error:'Use plain chat text, up to 280 characters.'};
      const room=host.rooms?.[roomId];
      if(!/^battle-[a-z0-9-]+$/.test(roomId) || !room || !battleState.get(roomId)?.playerSide) return {sent:false,error:'Player battle is no longer open.'};
      if(!connected()) return {sent:false,error:'Disconnected from Showdown.'};
      if((phase==='end')!==!!finishedRoom(roomId)) return {sent:false,error:'Battle phase changed.'};
      host.send(text.trim(),roomId);
      return {sent:true};
    },
    focusBattle(roomId) {
      if(!/^battle-[a-z0-9-]+$/.test(roomId) || !host.rooms?.[roomId] || typeof host.focusRoom!=='function') return false;
      host.focusRoom(roomId);return true;
    },
  }, configurable: false });
  // The socket can rejoin rooms before this bridge is installed. Seed the
  // tracker from their existing log/current request without replaying into the UI.
  for (const [id, room] of Object.entries(host.rooms || {})) {
    if (!/^battle-[a-z0-9-]+$/.test(id) || !room.request?.side?.id || !Array.isArray(room.battle?.stepQueue) || room.battleEnded || room.battle.ended) continue;
    const lines=['|init|battle','|title|'+(room.title || id),...room.battle.stepQueue.filter(line=>typeof line==='string' && !line.startsWith('|request|')),'|request|'+JSON.stringify(room.request)];
    const packet='>'+id+'\n'+lines.join('\n');
    captureBattle(packet);reportBattle(packet);
  }
  return true;
})();
