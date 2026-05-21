# ADB GUI

A lightweight Electron desktop app for running ADB and Fastboot commands with a clean GUI.

![ADB GUI Screenshot](assets/screenshot.png)

## Features

- **Device auto-detection** — polls connected devices every 3 seconds
- **Quick actions** — one-click buttons for common queries (model, Android version, battery, screen size, etc.)
- **Command terminal** — run any ADB or Fastboot command with real-time output streaming
- **Process management** — kill running commands, auto-cleanup on disconnect
- **Configurable paths** — set custom ADB/Fastboot executable paths with auto-detection
- **WebSocket-based** — renderer communicates with main process over local WebSocket
- **Tokyo Night theme** — easy on the eyes

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- [ADB](https://developer.android.com/tools/releases/platform-tools) (Android Debug Bridge)
- An Android device with USB debugging enabled (optional, for actual device interaction)

## Getting Started

`ash
# Install dependencies
npm install

# Run the app
npm start

# Run in dev mode
npm run dev
`

## Project Structure

`
adb-gui/
├── src/
│   ├── main/
│   │   ├── index.js      # Electron main process, WebSocket server, ADB process management
│   │   └── preload.js    # Context bridge (minimal)
│   └── renderer/
│       ├── index.html    # UI layout
│       ├── renderer.js   # WebSocket client, command execution, device polling
│       └── styles.css    # Tokyo Night theme
├── assets/               # Screenshots and icons
├── package.json
└── .gitignore
`

## How It Works

1. The main process starts an HTTP server on a random port and a WebSocket server alongside it
2. The renderer (browser window) connects to the WebSocket
3. Commands are sent from the renderer → main process → spawned as child processes
4. stdout/stderr are streamed back in real-time over WebSocket
5. Device list is polled every 3 seconds and broadcast to all connected clients

## Configuration

On first launch, ADB GUI will prompt you to configure paths to db.exe and astboot.exe. You can also:

- Click **Scan common locations** to auto-detect installed ADB/Fastboot
- Browse manually for executables
- Skip and use system db/astboot from PATH

Settings are saved to your user data directory and can be changed later via the ⚙ button.

## Tech Stack

- [Electron](https://www.electronjs.org/) v42
- [ws](https://github.com/websockets/ws) (WebSocket library)
- Vanilla JS — no frontend frameworks

## License

MIT
