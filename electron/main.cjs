const { app, BrowserWindow } = require("electron");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const GAME_PORT = 3210;
let gameServer;
let mainWindow;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.loadURL(`http://localhost:${GAME_PORT}/`);
    mainWindow.focus();
  }
});

function waitForGame(tries = 80) {
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(`http://localhost:${GAME_PORT}/`, response => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) resolve();
        else retry();
      });
      request.on("error", retry);
      request.setTimeout(600, () => { request.destroy(); retry(); });
    };
    const retry = () => tries-- > 0 ? setTimeout(check, 250) : reject(new Error("The FRONTLINE game server did not start."));
    check();
  });
}

function startGameServer() {
  const projectRoot = path.join(__dirname, "..");
  const candidates = [process.env.npm_node_execpath];
  try { candidates.push(execFileSync("where.exe", ["node.exe"], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/)[0]); } catch {}
  if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"));
  const nodeBinary = candidates.find(candidate => candidate && fs.existsSync(candidate)) || process.execPath;
  const viteCli = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
  const environment = { ...process.env };
  if (nodeBinary === process.execPath) environment.ELECTRON_RUN_AS_NODE = "1";
  else delete environment.ELECTRON_RUN_AS_NODE;
  const serverLog = fs.openSync(path.join(projectRoot, "electron-server.log"), "a");
  gameServer = spawn(nodeBinary, [viteCli, "--host", "localhost", "--port", String(GAME_PORT), "--strictPort"], {
    cwd: projectRoot,
    env: environment,
    windowsHide: true,
    stdio: ["ignore", serverLog, serverLog]
  });
  fs.writeFileSync(path.join(projectRoot, "electron-server.pid"), String(gameServer.pid));
}

async function createWindow() {
  startGameServer();
  await waitForGame();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: "#080b0a",
    autoHideMenuBar: true,
    title: "FRONTLINE // Conquest",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    fs.writeFileSync(path.join(__dirname, "..", "electron-window-url.log"), mainWindow.webContents.getURL());
  });
  await mainWindow.loadURL(`http://localhost:${GAME_PORT}/`);
}

if (hasSingleInstanceLock) {
  app.whenReady().then(createWindow).catch(error => {
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (gameServer && !gameServer.killed) gameServer.kill();
  try { fs.unlinkSync(path.join(__dirname, "..", "electron-server.pid")); } catch {}
});
