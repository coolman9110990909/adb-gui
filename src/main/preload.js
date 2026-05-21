const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("platform", {
  isElectron: true,
});
