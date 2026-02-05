# OpenBug CLI (`@openbug/cli`)

**OpenBug – AI debugging copilot for running applications**

This CLI wraps your existing dev commands (like `npm run dev`) with:

## Features

- 🤖 **AI-Powered Debugging**: Get intelligent assistance while debugging your applications
- 📊 **Real-time Log Analysis**: View and analyze command output logs in real-time
- 🔍 **Code Search**: Search through your codebase with AI assistance
- 💬 **Interactive Chat**: Chat with AI about your debugging issues
- 🚀 **Easy Setup**: Get started in minutes with simple initialization

## Installation

```bash
npm install -g @openbug/cli
```

Requirements:

- Node.js **20+**
- npm or yarn

---

## Quick Start

1. Start OpenBug without running a command yet:

   ```bash
   debug
   ```

   On first run, you’ll be prompted for an **API key**.  
   Get one from the OpenBug dashboard: [`https://app.oncall.build/`](https://app.oncall.build/).

2. After the key is saved, run your dev command under OpenBug:

   ```bash
   debug npm run dev
   debug python app.py
   debug node server.js
   ```

3. OpenBug will:
   - Create/update `~/.openbug/config` with your `API_KEY`
   - Create `openbug.yaml` in the current directory if it doesn’t exist
   - Start your command and open the AI debugging TUI

4. (Optional) If you prefer a browser UI, start the Studio web app:

   ```bash
   debug studio
   ```

   This opens the local Studio UI, which connects to the same project and services.

---

## Core Concepts

- **API key**: Stored in `~/.openbug/config` as `API_KEY=…`. Required before any AI calls.
- **Project metadata (`openbug.yaml`)**: Lives in each service’s directory, identifies the service to OpenBug.
- **Cluster server**: A small local WebSocket server that aggregates logs and connections from all `debug <command>` processes.

The CLI tries to make all of this **automatic**:

- If you don’t have an API key, the first run will prompt you to log in / enter one.
- If there is no `openbug.yaml` in the current directory, `debug <command>` will walk you through creating it.
- When you start debugging, the cluster server and AI service are started for you if they are not already running.

---

## First‑time Setup

### 1. Authenticate (API key)

The recommended flow is **interactive**:

- Run `debug` (or `debug <command>`) and follow the on‑screen prompt.
- Paste an API key from the OpenBug dashboard: [`https://app.oncall.build/`](https://app.oncall.build/).
- The CLI will create `~/.openbug/config` if needed and persist:

  ```ini
  API_KEY=<YOUR_OPENBUG_API_KEY>
  ```

All subsequent `debug` commands will reuse this key automatically.

### 2. Register a project (`openbug.yaml`)

You can create metadata explicitly by simply run your dev command:

```bash
debug npm run dev
debug python app.py
debug node server.js
```

If **no `openbug.yaml`** exists in the current directory, OpenBug will:

- Prompt you for a short description
- Generate an `openbug.yaml`
- Register the service with the local cluster so it shows up in the UI

If `openbug.yaml` **already exists**, `debug <command>` will:

- Use the existing metadata
- Stream logs from the new process into the same project context
- Immediately show you the logs/AI chat without prompting again

Example `openbug.yaml`:

```yaml
id: "openbug-service"
description: "Test service (local dev)"
name: "openbug-test-service"
window_id: 1738579212345
logs_available: true
code_available: true
```

---

## Everyday Usage

### Start debugging a service

From your service directory:

```bash
debug npm run dev
debug python app.py
debug node server.js
```

What happens:

- Ensures `~/.openbug/config` exists and contains an `API_KEY`
  - If missing, you’ll be prompted to log in / paste an auth key
- Ensures a local cluster server is running
- Ensures `openbug.yaml` exists (creating it on first run)
- Starts your command
- Opens the TUI where you can:
  - See live logs from the process
  - Chat with the AI about errors, behavior, etc.
  - Let the AI call tools (`grep`, `read_file`, `read_logs`, etc.) against your project

You can repeat this in multiple terminals for multiple services; they will all register under the same project id and appear in the AI context.

### Attach UI only

```bash
debug
```

This:

- Starts the cluster server and AI service (if not already running)
- Connects to any `debug <command>` processes already running for the active project
- Opens the TUI so you can switch between connected services and chat about them

Use this when your services are already running and you just want the OpenBug UI.

---

## CLI Commands

All commands are invoked via the `debug` binary:


### `debug <command>...`

Run any command under the OpenBug debugger:

```bash
debug npm run dev
debug python manage.py runserver
debug node server.js
```

This is the main entry point you’ll use day‑to‑day.

OpenBug stores its configuration in `~/.openbug/config`. You can manually edit this file if needed.

Manually start the local cluster server.  
Normally you don’t need this—`debug`/`debug <command>` will start it for you—but it’s available if you prefer to manage it in a dedicated terminal.

### `debug studio`

Open the local Studio web UI when available.

---

## Keyboard Shortcuts (TUI)

Exact shortcuts may evolve, but in the current TUI:

- **Ctrl+C** – Exit
- **Ctrl+D** – Toggle between main views (chat/logs) depending on context
- **Ctrl+R** – Reconnect / reset chat in some views (see bottom status line)
- **Ctrl+O** – Toggle full vs trimmed chat history in the studio UI

The bottom status line of the TUI always reflects the currently‑supported shortcuts for that build.

---

## Configuration & Environment

```yaml
id: "openbug-service"
description: "Your project description"
name: "Project Name"
window_id: 1234567890
logs_available: true
code_available: true
```

## Environment Variables


- `API_BASE_URL`: Base URL for the OpenBug API (default: `https://api.oncall.build/v2/api`)
- `WEB_SOCKET_URL`: WebSocket URL (default: `wss://api.oncall.build/v2/ws`)
- `OPENBUG_CLUSTER_URL`: WebSocket URL for the cluster server (default: `ws://127.0.0.1:4466`)
- `OPENBUG_WS_PORT`: Port for the WebSocket server (default: `6111`)
- `OPENBUG_WS_HOST`: Host for the WebSocket server (default: `127.0.0.1`)

## Keyboard Shortcuts

---

## Contributing / Support

This `opensource/cli` package is designed to be readable and hackable by experienced engineers:

- The main entry point is `bin/openbug.js`
- The Ink TUI lives in `index.tsx` and `src/components/*`
- Helper utilities live in `helpers/*` and `src/utils/*`

If you’d like to contribute improvements, bug fixes, or new tools, please open issues and pull requests in the repository that hosts this package.

---

## License

MIT

