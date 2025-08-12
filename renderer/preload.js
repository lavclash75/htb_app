const { contextBridge, ipcRenderer } = require('electron');
const {
  ensurePrimaryStyle,
  setNavBgColor,
  PRIMARY_BLUE_CLS,
  PRIMARY_RED_CLS
} = require('./themes');

contextBridge.exposeInMainWorld('desktop', {
  openSettings: () => ipcRenderer.invoke('app:open-settings')
});

(() => {
  const ITEM_ID = 'htb-desktop-injected-settings';
  const TEXT = 'Configure App';
  const ICON_CLASS = 'v-icon notranslate icon icon-settings icon-sm theme--dark';
  const HIDDEN_CLS = 'htb-desktop-hidden';
  const ROUTE_PARAM = 'htb-desktop';
  const ROUTE_VAL = 'settings';

  function applyAccent(accent) {
    ensurePrimaryStyle();
    const root = document.documentElement;

    root.classList.toggle(PRIMARY_BLUE_CLS, accent === 'blue');
    root.classList.toggle(PRIMARY_RED_CLS,  accent === 'red');

    const isCustom = accent === 'blue' || accent === 'red';
    const navBg = isCustom
      ? getComputedStyle(root).getPropertyValue('--htb-nav-bg').trim()
      : null;
    setNavBgColor(navBg || null);
  }

  const BLOOD_PREF_DEFAULT = { enabled: false, sound: 'ding' };
  let bloodTimer = null;
  let hasBaseline = false;
  let baseline = { machine: { id: null, userCount: 0, rootCount: 0 }, challenge: { id: null, count: 0 } };

  function playSound(id = 'ding') {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime;

      if (id === 'ding') {
        o.type = 'sine';
        o.frequency.setValueAtTime(880, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
        o.start(t); o.stop(t + 0.22);
      } else if (id === 'bell') {
        o.type = 'sine'; o.start(t);
        [0, 0.14, 0.28].forEach((ofs) => {
          const tt = t + ofs;
          g.gain.setValueAtTime(0.001, tt);
          g.gain.exponentialRampToValueAtTime(0.25, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, tt + 0.12);
        });
        o.stop(t + 0.45);
      } else {
        o.type = 'triangle';
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(220, t + 0.35);
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.start(t); o.stop(t + 0.37);
      }
    } catch {}
  }

  function notifyWithSound(title, body, soundId) {
    try {
      if (window.Notification && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      new Notification(title, { body });
    } catch {}
    playSound(soundId);
  }

  async function getPrefs() {
    try { return await ipcRenderer.invoke('prefs:get'); }
    catch { return {}; }
  }
  async function setPrefs(patch) {
    try { await ipcRenderer.invoke('prefs:set', patch); }
    catch {}
  }

  async function primeBaseline() {
    const prefs = await getPrefs();
    const nb = prefs?.notifyBlood ?? BLOOD_PREF_DEFAULT;
    const token = (prefs?.htbToken || '').trim();
    if (!nb.enabled || !token) return false;

    const res = await ipcRenderer.invoke('blood:check', { token });
    if (!res || res.error) return false;

    baseline = {
      machine: {
        id: res.latestMachine?.id || null,
        userCount: (res.machineBloods?.user_blood?.length) || 0,
        rootCount: (res.machineBloods?.root_blood?.length) || 0
      },
      challenge: {
        id: res.latestChallenge?.id || null,
        count: res.challengeBlood ? 1 : 0
      }
    };
    hasBaseline = true;
    await setPrefs({ bloodSeen: baseline });
    return true;
  }

  async function loadBaselineFromPrefs() {
    const prefs = await getPrefs();
    const s = prefs?.bloodSeen;
    if (s && s.machine && s.challenge) {
      baseline = {
        machine: { id: s.machine.id ?? null, userCount: s.machine.userCount ?? 0, rootCount: s.machine.rootCount ?? 0 },
        challenge: { id: s.challenge.id ?? null, count: s.challenge.count ?? 0 }
      };
      hasBaseline = true;
      return true;
    }
    return false;
  }

  async function checkBloodOnce() {
    const prefs = await getPrefs();
    const nb = prefs?.notifyBlood ?? BLOOD_PREF_DEFAULT;
    const token = (prefs?.htbToken || '').trim();
    if (!nb.enabled || !token) return;

    if (!hasBaseline) {
      if (!(await loadBaselineFromPrefs())) await primeBaseline();
      return;
    }

    const res = await ipcRenderer.invoke('blood:check', { token });
    if (!res || res.error) return;

    const curMachineId = res.latestMachine?.id || null;
    const curUser = (res.machineBloods?.user_blood?.length) || 0;
    const curRoot = (res.machineBloods?.root_blood?.length) || 0;

    if (curMachineId !== baseline.machine.id) {
      baseline.machine = { id: curMachineId, userCount: curUser, rootCount: curRoot };
      await setPrefs({ bloodSeen: baseline });
    } else {
      if (curUser > baseline.machine.userCount) {
        const first = res.machineBloods.user_blood[0];
        notifyWithSound(
          `HTB: User blood · ${res.latestMachine?.name || 'Machine'}`,
          `${first?.name || 'Unknown'} (${first?.date_diff || ''})`,
          nb.sound
        );
        baseline.machine.userCount = curUser;
        await setPrefs({ bloodSeen: baseline });
      }
      if (curRoot > baseline.machine.rootCount) {
        const first = res.machineBloods.root_blood[0];
        notifyWithSound(
          `HTB: Root blood · ${res.latestMachine?.name || 'Machine'}`,
          `${first?.name || 'Unknown'} (${first?.date_diff || ''})`,
          nb.sound
        );
        baseline.machine.rootCount = curRoot;
        await setPrefs({ bloodSeen: baseline });
      }
    }

    const curChId = res.latestChallenge?.id || null;
    const curChCount = res.challengeBlood ? 1 : 0;

    if (curChId !== baseline.challenge.id) {
      baseline.challenge = { id: curChId, count: curChCount };
      await setPrefs({ bloodSeen: baseline });
    } else if (curChCount > baseline.challenge.count) {
      const cb = res.challengeBlood;
      notifyWithSound(
        `HTB: Challenge blood · ${res.latestChallenge?.name || 'Challenge'}`,
        `${cb?.user_name || 'Unknown'} (${cb?.date_diff || ''})`,
        nb.sound
      );
      baseline.challenge.count = curChCount;
      await setPrefs({ bloodSeen: baseline });
    }
  }

  async function startBloodWatcher() {
    if (bloodTimer) return;
    if (!(await loadBaselineFromPrefs())) await primeBaseline();
    bloodTimer = setInterval(checkBloodOnce, 60 * 1000);
  }
  function stopBloodWatcher() {
    if (bloodTimer) { clearInterval(bloodTimer); bloodTimer = null; }
  }

  function findUserMenu() {
    const logoutItem = document.querySelector('div.logout .logoutItem');
    if (logoutItem) return logoutItem.closest('.v-list');
    for (const list of document.querySelectorAll('.v-list')) {
      const ok = [...list.querySelectorAll('span,div')]
        .some(n => (n.textContent || '').trim().toLowerCase() === 'logout');
      if (ok) return list;
    }
    return null;
  }

  function injectMenuItem() {
    if (!location.hostname.includes('hackthebox.com')) return;
    const menu = findUserMenu(); if (!menu) return;
    if (menu.querySelector('#' + ITEM_ID)) return;

    const tpl = menu.querySelector('a.v-list-item, a.menu-dropdown-item-unlink, a');
    if (!tpl) return;

    const a = tpl.cloneNode(true);
    a.id = ITEM_ID;
    a.removeAttribute('href');
    a.setAttribute('role', 'button');
    a.style.cursor = 'pointer';
    a.classList.remove('bg-color-blue-nav');

    (a.querySelector('span.font-size14')
      || a.querySelector('.v-list-item__title span')
      || a.querySelector('span')).textContent = TEXT;

    const icon = a.querySelector('i.v-icon');
    if (icon) icon.className = ICON_CLASS;

    a.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      openSettingsView(); return false;
    }, { capture: true });

    const logoutBlock = menu.querySelector('div.logout');
    logoutBlock ? menu.insertBefore(a, logoutBlock) : menu.appendChild(a);
  }

  function startMenuObserver() {
    try {
      const mo = new MutationObserver(() => injectMenuItem());
      mo.observe(document, { childList: true, subtree: true });
      return mo;
    } catch { return null; }
  }

  let settingsNode = null;
  let mainHost = null;
  let settingsActive = false;

  function findMainHost() {
    const sels = [
      '.v-main .v-main__wrap', '.v-main', 'main .v-main__wrap',
      '.application--wrap', '.v-application .v-application--wrap', '#app'
    ];
    for (const s of sels) { const el = document.querySelector(s); if (el) return el; }
    return document.body;
  }
  function ensureMainHost() {
    if (mainHost && document.contains(mainHost)) return mainHost;
    mainHost = findMainHost(); return mainHost;
  }

  function mountSettings(host) {
    if (settingsNode && host.contains(settingsNode)) return settingsNode;

    if (!document.getElementById('htb-desktop-hide-style')) {
      const sty = document.createElement('style');
      sty.id = 'htb-desktop-hide-style';
      sty.textContent = `.${HIDDEN_CLS}{display:none!important}`;
      document.head.appendChild(sty);
    }

    const wrap = document.createElement('div');
    wrap.id = 'htb-desktop-settings-view';
    wrap.style.minHeight = '60vh';
    wrap.style.padding = '16px';
    wrap.style.boxSizing = 'border-box';
    wrap.innerHTML = `
      <div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <h2 style="margin:0;font-size:20px;">Configure App</h2>
          <button id="htb-settings-close" style="padding:6px 10px;border-radius:8px;border:1px solid #2c3440;background:#1e242d;color:#e6e6e6;cursor:pointer;">Close</button>
        </div>

        <div style="background:#141922;border:1px solid #242a33;border-radius:12px;padding:12px;">
          <label style="display:flex;flex-direction:column;gap:8px;">
            Theme
            <select id="htb-primary-sel" style="background:#0f1217;color:#e6e6e6;border:1px solid #2c3440;border-radius:8px;padding:8px;max-width:240px;">
              <option value="default">HTB (default)</option>
              <option value="blue">Blue</option>
              <option value="red">Red</option>
            </select>
            <span style="color:#9aa4b2;font-size:12px;">Els temes personalitzats també canvien el fons “nav”.</span>
          </label>
        </div>

        <div style="background:#141922;border:1px solid #242a33;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="htb-blood-enable" />
              <span>Notify blood (machine/challenge)</span>
            </label>

            <label style="display:flex;flex-direction:column;gap:6px;">
              HTB Token
              <input id="htb-blood-token" type="password" placeholder="Paste your HTB token"
                     style="background:#0f1217;color:#e6e6e6;border:1px solid #2c3440;border-radius:8px;padding:8px;max-width:420px;">
            </label>

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <label for="htb-blood-sound">Sound:</label>
              <select id="htb-blood-sound" style="background:#0f1217;color:#e6e6e6;border:1px solid #2c3440;border-radius:8px;padding:8px;max-width:240px;">
                <option value="ding">Ding</option>
                <option value="bell">Bell</option>
                <option value="laser">Laser</option>
              </select>
              <button id="htb-blood-test" style="padding:6px 10px;border-radius:8px;border:1px solid #2c3440;background:#1e242d;color:#e6e6e6;cursor:pointer;">Test</button>
              <span id="htb-blood-warn" style="margin-left:auto;color:#ff6b6b;display:none;">Token required</span>
            </div>
          </div>
        </div>
      </div>
    `;
    host.appendChild(wrap);

    wrap.querySelector('#htb-settings-close')?.addEventListener('click', closeSettingsView);

    const sel = wrap.querySelector('#htb-primary-sel');
    (async () => {
      try {
        const prefs = await getPrefs();
        const prefAccent = (prefs?.accent === 'blue' || prefs?.accent === 'red') ? prefs.accent : 'default';
        sel.value = prefAccent;
        applyAccent(prefAccent);
      } catch {}
    })();
    sel.addEventListener('change', async () => {
      const val = (sel.value === 'blue' || sel.value === 'red') ? sel.value : 'default';
      applyAccent(val);
      await setPrefs({ accent: val });
    });

    const bEnable = wrap.querySelector('#htb-blood-enable');
    const bSound  = wrap.querySelector('#htb-blood-sound');
    const bTest   = wrap.querySelector('#htb-blood-test');
    const warn    = wrap.querySelector('#htb-blood-warn');
    const tokenEl = wrap.querySelector('#htb-blood-token');

    function updateWarn(){ warn.style.display = tokenEl.value.trim() ? 'none' : 'inline'; }

    (async () => {
      try {
        const prefs = await getPrefs();
        const nb = prefs?.notifyBlood ?? BLOOD_PREF_DEFAULT;
        bEnable.checked = !!nb.enabled;
        bSound.value = nb.sound || 'ding';
        tokenEl.value = prefs?.htbToken || '';
        updateWarn();
        if (nb.enabled && tokenEl.value.trim()) startBloodWatcher(); else stopBloodWatcher();
      } catch {}
    })();

    tokenEl.addEventListener('change', async () => {
      const v = tokenEl.value.trim();
      await setPrefs({ htbToken: v });
      updateWarn();
      const prefs = await getPrefs();
      const nb = prefs?.notifyBlood ?? BLOOD_PREF_DEFAULT;
      if (nb.enabled && v) startBloodWatcher(); else stopBloodWatcher();
    });

    bEnable.addEventListener('change', async () => {
      await setPrefs({ notifyBlood: { enabled: bEnable.checked, sound: bSound.value } });
      const token = (tokenEl.value || '').trim();
      if (bEnable.checked && token) startBloodWatcher(); else stopBloodWatcher();
    });

    bSound.addEventListener('change', async () => {
      await setPrefs({ notifyBlood: { enabled: bEnable.checked, sound: bSound.value } });
    });

    bTest.addEventListener('click', () => playSound(bSound.value));

    settingsNode = wrap;
    return wrap;
  }

  function hideSiblingsExcept(host, except) {
    for (const ch of Array.from(host.children)) {
      if (ch !== except) ch.classList.add(HIDDEN_CLS);
    }
  }
  function showAll(host) {
    for (const ch of Array.from(host.children)) ch.classList.remove(HIDDEN_CLS);
  }
  function pushSettingsRoute() {
    const u = new URL(location.href);
    if (u.searchParams.get(ROUTE_PARAM) === ROUTE_VAL) return;
    u.searchParams.set(ROUTE_PARAM, ROUTE_VAL);
    history.pushState({ htbDesktop: ROUTE_VAL }, '', u.toString());
  }
  function removeSettingsRoute() {
    const u = new URL(location.href);
    if (u.searchParams.get(ROUTE_PARAM) !== ROUTE_VAL) return;
    u.searchParams.delete(ROUTE_PARAM);
    history.pushState({}, '', u.toString());
  }

  function openSettingsView() {
    const host = ensureMainHost();
    if (!host) return;
    ensurePrimaryStyle();
    const view = mountSettings(host);
    hideSiblingsExcept(host, view);
    pushSettingsRoute();
    settingsActive = true;
  }
  function closeSettingsView() {
    const host = ensureMainHost();
    if (!host) return;
    showAll(host);
    if (settingsNode && host.contains(settingsNode)) {
      settingsNode.remove();
      settingsNode = null;
    }
    removeSettingsRoute();
    settingsActive = false;
  }

  ipcRenderer.on('settings:open', () => openSettingsView());
  window.addEventListener('popstate', () => {
    const u = new URL(location.href);
    if (u.searchParams.get(ROUTE_PARAM) === ROUTE_VAL) {
      if (!settingsActive) openSettingsView();
    } else if (settingsActive) {
      closeSettingsView();
    }
  });

  const hostObserver = new MutationObserver(() => {
    if (settingsActive) {
      const host = ensureMainHost();
      if (host && (!settingsNode || !host.contains(settingsNode))) {
        const view = mountSettings(host);
        hideSiblingsExcept(host, view);
      }
    }
  });
  hostObserver.observe(document, { childList: true, subtree: true });

  function boot() {
    injectMenuItem();
    startMenuObserver();
    ensurePrimaryStyle();

    getPrefs()
      .then(p => applyAccent((p?.accent === 'blue' || p?.accent === 'red') ? p.accent : 'default'))
      .catch(() => applyAccent('default'));

    (async () => {
      const prefs = await getPrefs();
      const nb = prefs?.notifyBlood ?? BLOOD_PREF_DEFAULT;
      const token = (prefs?.htbToken || '').trim();
      if (nb.enabled && token) startBloodWatcher();
    })();

    const u = new URL(location.href);
    if (u.searchParams.get(ROUTE_PARAM) === ROUTE_VAL) openSettingsView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

