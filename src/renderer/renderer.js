(function () {
  "use strict";

  var $deviceSelect = document.getElementById("device-select");
  var $refreshBtn = document.getElementById("refresh-devices");
  var $deviceCount = document.getElementById("device-count");
  var $terminal = document.getElementById("terminal");
  var $clearBtn = document.getElementById("clear-output");
  var $killBtn = document.getElementById("kill-btn");
  var $runningIndicator = document.getElementById("running-indicator");
  var $commandInput = document.getElementById("command-input");
  var $runBtn = document.getElementById("run-btn");
  var $statusBar = document.getElementById("status-bar");
  var $connStatus = document.getElementById("connection-status");
  var $quickBtns = document.querySelectorAll(".quick-actions button");
  var $lineCount = document.getElementById("line-count");
  var $copyBtn = document.getElementById("copy-output");

  var $setupModal = document.getElementById("setup-modal");
  var $setupAdbPath = document.getElementById("setup-adb-path");
  var $setupFastbootPath = document.getElementById("setup-fastboot-path");
  var $browseAdb = document.getElementById("browse-adb");
  var $browseFastboot = document.getElementById("browse-fastboot");
  var $autoDetect = document.getElementById("auto-detect");
  var $detectResults = document.getElementById("detect-results");
  var $setupSave = document.getElementById("setup-save");
  var $setupSkip = document.getElementById("setup-skip");

  var $settingsBtn = document.getElementById("settings-btn");
  var $settingsModal = document.getElementById("settings-modal");
  var $settingsAdbPath = document.getElementById("settings-adb-path");
  var $settingsFastbootPath = document.getElementById("settings-fastboot-path");
  var $settingsBrowseAdb = document.getElementById("settings-browse-adb");
  var $settingsBrowseFastboot = document.getElementById("settings-browse-fastboot");
  var $settingsSave = document.getElementById("settings-save");
  var $settingsClose = document.getElementById("settings-close");

  var ws = null;
  var currentCmdId = null;
  var cmdCounter = 0;
  var MAX_LINES = 500;

  function connectWS() {
    var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(protocol + "//" + window.location.host);

    ws.onopen = function () {
      $connStatus.textContent = "Connected";
      $connStatus.classList.add("connected");
      $statusBar.textContent = "Connected";
      ws.send(JSON.stringify({ type: "devices" }));
      ws.send(JSON.stringify({ type: "config-get" }));
    };

    ws.onclose = function () {
      $connStatus.textContent = "Disconnected";
      $connStatus.classList.remove("connected");
      $statusBar.textContent = "Disconnected - reconnecting...";
      setTimeout(connectWS, 2000);
    };

    ws.onerror = function () { $statusBar.textContent = "Connection error"; };

    ws.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      switch (msg.type) {
        case "devices":
          updateDeviceSelect(msg.devices);
          break;
        case "started":
          setRunning(true);
          appendSeparator();
          appendLine("> " + (msg.command || "command"), "cmd");
          break;
        case "stdout":
          appendLine(msg.data, "stdout", true);
          break;
        case "stderr":
          appendLine(msg.data, "stderr", true);
          break;
        case "done":
          setRunning(false);
          appendLine(msg.code === 0 ? "Done" : "Exit code: " + msg.code, msg.code === 0 ? "info" : "stderr");
          currentCmdId = null;
          break;
        case "config":
          handleConfig(msg);
          break;
        case "config-saved":
          $statusBar.textContent = "Settings saved";
          break;
        case "browse-result":
          if (msg.field === "adb") {
            $setupAdbPath.value = msg.path;
            $settingsAdbPath.value = msg.path;
          } else {
            $setupFastbootPath.value = msg.path;
            $settingsFastbootPath.value = msg.path;
          }
          break;
        case "auto-detect-result":
          $detectResults.innerHTML = msg.html;
          $detectResults.classList.remove("hidden");
          if (msg.adbPath) {
            $setupAdbPath.value = msg.adbPath;
            $settingsAdbPath.value = msg.adbPath;
          }
          if (msg.fastbootPath) {
            $setupFastbootPath.value = msg.fastbootPath;
            $settingsFastbootPath.value = msg.fastbootPath;
          }
          break;
      }
    };
  }

  function handleConfig(cfg) {
    $setupAdbPath.value = cfg.adbPath || "";
    $setupFastbootPath.value = cfg.fastbootPath || "";
    $settingsAdbPath.value = cfg.adbPath || "";
    $settingsFastbootPath.value = cfg.fastbootPath || "";
    if (!cfg.configured) $setupModal.classList.remove("hidden");
  }

  function updateDeviceSelect(devices) {
    var currentVal = $deviceSelect.value;
    $deviceSelect.innerHTML = "";
    var def = document.createElement("option");
    def.value = "";
    def.textContent = "No device selected";
    $deviceSelect.appendChild(def);
    for (var i = 0; i < devices.length; i++) {
      var opt = document.createElement("option");
      opt.value = devices[i].id;
      opt.textContent = devices[i].id + "  [" + devices[i].status + "]";
      $deviceSelect.appendChild(opt);
    }
    if (currentVal) {
      for (var j = 0; j < devices.length; j++) {
        if (devices[j].id === currentVal) { $deviceSelect.value = currentVal; break; }
      }
    }
    $deviceCount.textContent = devices.length + " found";
  }

  function appendLine(text, type, raw) {
    type = type || "stdout";
    var div = document.createElement("div");
    div.className = "line " + type;
    div.textContent = raw ? text : text;
    $terminal.appendChild(div);
    $terminal.scrollTop = $terminal.scrollHeight;
    if ($lineCount) $lineCount.textContent = $terminal.children.length + " lines";
    while ($terminal.children.length > MAX_LINES) {
      $terminal.removeChild($terminal.firstChild);
    }
  }

  function appendSeparator() {
    var div = document.createElement("div");
    div.className = "line sep";
    div.textContent = "------------------------------------------------------------";
    $terminal.appendChild(div);
  }

  function clearTerminal() {
    $terminal.innerHTML = "";
    if ($lineCount) $lineCount.textContent = "0 lines";
  }

  function setRunning(running) {
    $runningIndicator.classList.toggle("hidden", !running);
    $killBtn.classList.toggle("hidden", !running);
    $runBtn.disabled = running;
    $commandInput.disabled = running;
  }

  function runCommand(command) {
    if (!command.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;
    var cmdId = "cmd-" + (++cmdCounter);
    currentCmdId = cmdId;
    ws.send(JSON.stringify({ type: "run", command: command, deviceId: $deviceSelect.value, id: cmdId }));
    $commandInput.value = "";
  }

  function killCurrentCommand() {
    if (!currentCmdId || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "kill", id: currentCmdId }));
    appendLine("Killed by user", "stderr");
    setRunning(false);
    currentCmdId = null;
  }

  // Setup modal
  $browseAdb.addEventListener("click", function () { ws.send(JSON.stringify({ type: "browse-adb" })); });
  $browseFastboot.addEventListener("click", function () { ws.send(JSON.stringify({ type: "browse-fastboot" })); });
  $autoDetect.addEventListener("click", function () { ws.send(JSON.stringify({ type: "auto-detect" })); });
  $setupSave.addEventListener("click", function () {
    ws.send(JSON.stringify({ type: "config-set", adbPath: $setupAdbPath.value, fastbootPath: $setupFastbootPath.value }));
    $setupModal.classList.add("hidden");
  });
  $setupSkip.addEventListener("click", function () { $setupModal.classList.add("hidden"); });

  // Settings modal
  $settingsBtn.addEventListener("click", function () {
    ws.send(JSON.stringify({ type: "config-get" }));
    $settingsModal.classList.remove("hidden");
  });
  $settingsBrowseAdb.addEventListener("click", function () { ws.send(JSON.stringify({ type: "browse-adb" })); });
  $settingsBrowseFastboot.addEventListener("click", function () { ws.send(JSON.stringify({ type: "browse-fastboot" })); });
  $settingsSave.addEventListener("click", function () {
    ws.send(JSON.stringify({ type: "config-set", adbPath: $settingsAdbPath.value, fastbootPath: $settingsFastbootPath.value }));
    $settingsModal.classList.add("hidden");
  });
  $settingsClose.addEventListener("click", function () { $settingsModal.classList.add("hidden"); });

  // Main
  $runBtn.addEventListener("click", function () { runCommand($commandInput.value); });
  $commandInput.addEventListener("keydown", function (e) { if (e.key === "Enter") runCommand($commandInput.value); });
  $refreshBtn.addEventListener("click", function () { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "devices" })); });
  $clearBtn.addEventListener("click", clearTerminal);
  $killBtn.addEventListener("click", killCurrentCommand);
  $copyBtn.addEventListener("click", function () { if (navigator.clipboard) navigator.clipboard.writeText($terminal.textContent); });

  $quickBtns.forEach(function (btn) {
    btn.addEventListener("click", function () { var cmd = btn.getAttribute("data-cmd"); if (cmd) runCommand(cmd); });
  });

  connectWS();
})();
