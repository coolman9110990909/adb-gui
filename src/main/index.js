const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");
const { WebSocketServer } = require("ws");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (_) {}
  return {};
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch (_) {}
}

function findAdb() {
  var cfg = loadConfig();
  if (cfg.adbPath && fs.existsSync(cfg.adbPath)) return cfg.adbPath;
  var candidates = [
    "C:\\Users\\coolm\\Downloads\\scrcpy-win64-v4.0\\scrcpy-win64-v4.0\\adb.exe",
    "C:\\Users\\coolm\\Downloads\\ADB-and-Fastboot++_v1.1.1-Portable\\ADB and Fastboot++ v1.1.1 Portable\\adb.exe",
    "adb",
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] === "adb") return candidates[i];
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return "adb";
}

function findFastboot() {
  var cfg = loadConfig();
  if (cfg.fastbootPath && fs.existsSync(cfg.fastbootPath)) return cfg.fastbootPath;
  var adbDir = path.dirname(findAdb());
  var candidate = path.join(adbDir, "fastboot.exe");
  if (fs.existsSync(candidate)) return candidate;
  return "fastboot";
}

var ADB = findAdb();
var FASTBOOT = findFastboot();
var mainWindow = null;
var wss = null;
var activeProcesses = new Map();

function safeSend(ws, data) {
  try { if (ws.readyState === 1) ws.send(data); } catch (_) {}
}

function broadcast(data) {
  try { for (var i = 0; i < wss.clients.length; i++) safeSend(wss.clients[i], data); } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 700, minWidth: 640, minHeight: 480,
    title: "ADB GUI",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWindow.on("closed", function () {
    mainWindow = null;
    activeProcesses.forEach(function (e) { try { e.proc.kill(); } catch (_) {} });
    activeProcesses.clear();
  });
}

function autoDetectPaths() {
  var adbCandidates = [
    "C:\\Users\\coolm\\Downloads\\scrcpy-win64-v4.0\\scrcpy-win64-v4.0\\adb.exe",
    "C:\\Users\\coolm\\Downloads\\ADB-and-Fastboot++_v1.1.1-Portable\\ADB and Fastboot++ v1.1.1 Portable\\adb.exe",
    "C:\\Program Files\\Android\\Android Studio\\sdk\\platform-tools\\adb.exe",
    "C:\\Users\\coolm\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
  ];
  var fbCandidates = [
    "C:\\Users\\coolm\\Downloads\\ADB-and-Fastboot++_v1.1.1-Portable\\ADB and Fastboot++ v1.1.1 Portable\\fastboot.exe",
    "C:\\Program Files\\Android\\Android Studio\\sdk\\platform-tools\\fastboot.exe",
    "C:\\Users\\coolm\\AppData\\Local\\Android\\Sdk\\platform-tools\\fastboot.exe",
  ];
  var html = "";
  var foundAdb = null, foundFastboot = null;
  for (var i = 0; i < adbCandidates.length; i++) {
    var ok = fs.existsSync(adbCandidates[i]);
    html += "<div class=\"" + (ok ? "found" : "not-found") + "\">" + (ok ? "OK " : "NO ") + adbCandidates[i] + "</div>";
    if (ok && !foundAdb) foundAdb = adbCandidates[i];
  }
  html += "<br>";
  for (var j = 0; j < fbCandidates.length; j++) {
    var ok2 = fs.existsSync(fbCandidates[j]);
    html += "<div class=\"" + (ok2 ? "found" : "not-found") + "\">" + (ok2 ? "OK " : "NO ") + fbCandidates[j] + "</div>";
    if (ok2 && !foundFastboot) foundFastboot = fbCandidates[j];
  }
  return { html: html, adbPath: foundAdb, fastbootPath: foundFastboot };
}

function startServer() {
  var rendererDir = path.join(__dirname, "..", "renderer");
  var server = http.createServer(function (req, res) {
    var filePath = path.join(rendererDir, req.url === "/" ? "index.html" : req.url);
    fs.readFile(filePath, function (err, data) {
      if (err) { res.writeHead(404); res.end(); return; }
      var ext = path.extname(filePath);
      var types = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css" };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      res.end(data);
    });
  });

  wss = new WebSocketServer({ server: server });

  wss.on("connection", function (ws) {
    ws.on("message", function (raw) {
      var msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

      if (msg.type === "run") {
        runCommand(ws, msg.command, msg.deviceId, msg.id);
      } else if (msg.type === "kill") {
        killCmd(msg.id);
      } else if (msg.type === "devices") {
        getDevices().then(function (d) { safeSend(ws, JSON.stringify({ type: "devices", devices: d })); });
      } else if (msg.type === "config-get") {
        var cfg = loadConfig();
        safeSend(ws, JSON.stringify({ type: "config", adbPath: ADB, fastbootPath: FASTBOOT, configured: !!(cfg.adbPath && cfg.fastbootPath) }));
      } else if (msg.type === "config-set") {
        var newCfg = loadConfig();
        if (msg.adbPath) { newCfg.adbPath = msg.adbPath; ADB = msg.adbPath; }
        if (msg.fastbootPath) { newCfg.fastbootPath = msg.fastbootPath; FASTBOOT = msg.fastbootPath; }
        saveConfig(newCfg);
        safeSend(ws, JSON.stringify({ type: "config-saved", adbPath: ADB, fastbootPath: FASTBOOT }));
      } else if (msg.type === "browse-adb") {
        var r = dialog.showOpenDialogSync(mainWindow, { title: "Select ADB executable", filters: [{ name: "Executable", extensions: ["exe"] }], properties: ["openFile"] });
        if (r && r[0]) safeSend(ws, JSON.stringify({ type: "browse-result", field: "adb", path: r[0] }));
      } else if (msg.type === "browse-fastboot") {
        var r2 = dialog.showOpenDialogSync(mainWindow, { title: "Select Fastboot executable", filters: [{ name: "Executable", extensions: ["exe"] }], properties: ["openFile"] });
        if (r2 && r2[0]) safeSend(ws, JSON.stringify({ type: "browse-result", field: "fastboot", path: r2[0] }));
      } else if (msg.type === "auto-detect") {
        var results = autoDetectPaths();
        safeSend(ws, JSON.stringify({ type: "auto-detect-result", html: results.html, adbPath: results.adbPath, fastbootPath: results.fastbootPath }));
      }
    });

    ws.on("close", function () {
      activeProcesses.forEach(function (e, id) {
        if (e.client === ws) { try { e.proc.kill(); } catch (_) {} activeProcesses.delete(id); }
      });
    });

    getDevices().then(function (d) { safeSend(ws, JSON.stringify({ type: "devices", devices: d })); });
  });

  server.listen(0, "127.0.0.1", function () {
    var port = server.address().port;
    mainWindow.loadURL("http://127.0.0.1:" + port);
  });
}

function getDevices() {
  return new Promise(function (resolve) {
    var cp = require("child_process");
    cp.exec('"' + ADB + '" devices', { timeout: 5000 }, function (err, stdout) {
      if (err) { resolve([]); return; }
      var devices = [];
      var lines = (stdout || "").split(os.EOL);
      for (var i = 1; i < lines.length; i++) {
        var t = lines[i].trim();
        if (!t) continue;
        var parts = t.split("\t");
        if (parts.length >= 2) devices.push({ id: parts[0], status: parts[1] });
      }
      resolve(devices);
    });
  });
}

function runCommand(ws, command, deviceId, cmdId) {
  var isFastboot = command.trim().startsWith("fastboot ");
  var bin = isFastboot ? FASTBOOT : ADB;
  var args = command.replace(/^fastboot\s+/, "");
  var finalArgs = deviceId && !isFastboot ? ["-s", deviceId].concat(args.split(/\s+/)) : args.split(/\s+/);

  var proc;
  try {
    proc = spawn(bin, finalArgs, { cwd: path.dirname(bin) });
  } catch (err) {
    safeSend(ws, JSON.stringify({ type: "stderr", id: cmdId, data: "Spawn error: " + err.message }));
    safeSend(ws, JSON.stringify({ type: "done", id: cmdId, code: 1 }));
    return;
  }

  activeProcesses.set(cmdId, { proc: proc, client: ws });
  safeSend(ws, JSON.stringify({ type: "started", id: cmdId }));

  proc.stdout.on("data", function (data) {
    safeSend(ws, JSON.stringify({ type: "stdout", id: cmdId, data: data.toString() }));
  });
  proc.stderr.on("data", function (data) {
    safeSend(ws, JSON.stringify({ type: "stderr", id: cmdId, data: data.toString() }));
  });
  proc.on("close", function (code) {
    safeSend(ws, JSON.stringify({ type: "done", id: cmdId, code: code }));
    activeProcesses.delete(cmdId);
  });
  proc.on("error", function (err) {
    safeSend(ws, JSON.stringify({ type: "stderr", id: cmdId, data: "Error: " + err.message }));
    safeSend(ws, JSON.stringify({ type: "done", id: cmdId, code: 1 }));
    activeProcesses.delete(cmdId);
  });
}

function killCmd(cmdId) {
  var entry = activeProcesses.get(cmdId);
  if (entry) { try { entry.proc.kill("SIGTERM"); } catch (_) {} activeProcesses.delete(cmdId); }
}

function startDevicePolling() {
  setInterval(function () {
    if (!wss) return;
    getDevices().then(function (d) { broadcast(JSON.stringify({ type: "devices", devices: d })); });
  }, 3000);
}

app.whenReady().then(function () {
  createWindow();
  startServer();
  startDevicePolling();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
