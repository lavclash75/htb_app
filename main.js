const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const PREFS_PATH = path.join(app.getPath('userData'), 'prefs.json');
const DEFAULT_PREFS = { theme: 'system' };
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) }; }
  catch { return { ...DEFAULT_PREFS }; }
}
function savePrefs(p) {
  try { fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true }); fs.writeFileSync(PREFS_PATH, JSON.stringify(p, null, 2)); } catch {}
}
let prefs = loadPrefs();

let mainWindow;
let currentCssKey = null;

const DARK_CSS = `
:root { color-scheme: dark; }
*::-webkit-scrollbar { width: 8px; height:8px; }
*::-webkit-scrollbar-track { background: #121418; }
*::-webkit-scrollbar-thumb { background: #9fef00; border-radius: 4px; }
`;
const LIGHT_CSS = `:root { color-scheme: light; }`;

async function applyTheme(themeSource) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  nativeTheme.themeSource = themeSource;
  const effective = themeSource === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : themeSource;
  try { if (currentCssKey) { await mainWindow.webContents.removeInsertedCSS(currentCssKey); currentCssKey = null; } } catch {}
  currentCssKey = await mainWindow.webContents.insertCSS(effective === 'dark' ? DARK_CSS : LIGHT_CSS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, 'assets', 'logo.png'),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: !process.argv.includes('--dev'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.resolve(__dirname, 'renderer', 'preload.js'),
      sandbox:false,
      partition: 'persist:htb-session'
    }
  });

  mainWindow.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 HTBDesktop/1.0.0');
  mainWindow.loadURL('https://account.hackthebox.com/dashboard');
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    await applyTheme(prefs.theme);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const host = new URL(url).hostname;
    if (host.includes('hackthebox.com')) { mainWindow.loadURL(url); return { action: 'deny' }; }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const host = new URL(navigationUrl).hostname;
    if (host.includes('hackthebox.com')) return;
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function openSettingsInPlace() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:open');
}

function createMenu() {
  const isDev = process.argv.includes('--dev');
  const template = [
    {
      label: 'Aplicació',
      submenu: [
        { label: 'Buscar actualitzacions', click: () => autoUpdater.checkForUpdates().catch(() => {}) },
        { type: 'separator' },
        { label: 'Anar al Dashboard', click: () => mainWindow?.loadURL('https://account.hackthebox.com/dashboard') },
        { label: 'Anar a l\'App HTB', click: () => mainWindow?.loadURL('https://app.hackthebox.com') },
        { type: 'separator' },
        { label: 'Configuració…', accelerator: 'CmdOrCtrl+,', click: () => openSettingsInPlace() },
        { type: 'separator' },
        { label: 'Sortir', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Navegació',
      submenu: [
        { label: 'Tornar', accelerator: 'Alt+Left', click: () => mainWindow?.webContents.canGoBack() && mainWindow.webContents.goBack() },
        { label: 'Endavant', accelerator: 'Alt+Right', click: () => mainWindow?.webContents.canGoForward() && mainWindow.webContents.goForward() },
        { label: 'Recarregar', accelerator: 'F5', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => mainWindow && mainWindow.webContents.setZoomFactor(mainWindow.webContents.getZoomFactor() + 0.1) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => mainWindow && mainWindow.webContents.setZoomFactor(Math.max(0.5, mainWindow.webContents.getZoomFactor() - 0.1)) },
        { label: 'Zoom Reset', accelerator: 'CmdOrCtrl+0', click: () => mainWindow && mainWindow.webContents.setZoomFactor(1.0) }
      ]
    }
  ];
  if (isDev) template.push({ label: 'Desenvolupador', submenu: [{ label: 'DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() }] });
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle('app:open-settings', () => { openSettingsInPlace(); });
ipcMain.handle('prefs:get', () => prefs);
ipcMain.handle('prefs:set', async (_evt, patch) => {
  prefs = { ...prefs, ...patch };
  savePrefs(prefs);
  if (patch.theme) await applyTheme(prefs.theme);
  return prefs;
});
nativeTheme.on('updated', () => { if (prefs.theme === 'system') applyTheme('system'); });

function htbGet(pathname, token) {
  return new Promise((resolve) => {
    const bearer = (token || '').trim();
    if (!bearer) return resolve({ error: 'NO_TOKEN' });
    const options = {
      method: 'GET',
      hostname: 'labs.hackthebox.com',
      path: `/${String(pathname).replace(/^\/+/, '')}`,
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://app.hackthebox.com',
        'Referer': 'https://app.hackthebox.com/'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function getLatestMachine(token) {
  const data = await htbGet('api/v4/machine/paginated', token);
  if (!data || !data.data || !Array.isArray(data.data)) return null;
  let latest = null, latestTs = -Infinity;
  for (const m of data.data) {
    const ts = Date.parse(m.release || 0);
    if (!Number.isNaN(ts) && ts > latestTs) { latestTs = ts; latest = m; }
  }
  return latest ? { id: latest.id, name: latest.name } : null;
}

async function getMachineBloods(machineId, token) {
  const data = await htbGet(`api/v4/machine/activity/${machineId}`, token);
  if (!data || !data.info) return null;
  const activity = (data.info.activity || []).filter(e => e.type === 'blood');
  const user_blood = [];
  const root_blood = [];
  for (const e of activity) {
    const b = { name: e.user_name, date_diff: e.date_diff, avatar_url: e.user_avatar };
    if (e.blood_type === 'user') user_blood.push(b);
    else if (e.blood_type === 'root') root_blood.push(b);
  }
  if (!user_blood.length && !root_blood.length) return null;
  return { user_blood: user_blood.length ? user_blood : null, root_blood: root_blood.length ? root_blood : null };
}

async function getLatestChallenge(token) {
  const data = await htbGet('api/v4/challenges?state=active&sort_by=release_date', token);
  if (!data || !data.data || !data.data.length) return null;
  const latest = data.data[0];
  return { id: latest.id, name: latest.name };
}

async function getChallengeBlood(chId, token) {
  const data = await htbGet(`api/v4/challenge/activity/${chId}`, token);
  if (!data || !data.info) return null;
  const act = (data.info.activity || []).find(e => e.type === 'blood');
  return act ? { user_name: act.user_name, date_diff: act.date_diff, user_avatar: act.user_avatar } : null;
}

ipcMain.handle('blood:check', async (_evt, { token } = {}) => {
  const tk = (token || '').trim();
  if (!tk) return { error: 'NO_TOKEN' };
  const latestMachine = await getLatestMachine(tk);
  let machineBloods = null;
  if (latestMachine?.id) machineBloods = await getMachineBloods(latestMachine.id, tk);
  const latestChallenge = await getLatestChallenge(tk);
  let challengeBlood = null;
  if (latestChallenge?.id) challengeBlood = await getChallengeBlood(latestChallenge.id, tk);
  return { latestMachine, machineBloods, latestChallenge, challengeBlood };
});

function initAutoUpdate() {
  if (process.argv.includes('--dev')) return;
  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('update-available', (info) => { mainWindow?.webContents.send('update:available', info); });
  autoUpdater.on('download-progress', (p) => { mainWindow?.webContents.send('update:progress', { pct: Math.floor(p.percent) }); });
  autoUpdater.on('update-downloaded', (info) => { mainWindow?.webContents.send('update:ready', info); });
  autoUpdater.on('error', (err) => { log.error('autoUpdater', err); });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
  initAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.setAsDefaultProtocolClient('htb');
