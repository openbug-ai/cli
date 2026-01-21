# OpenBug CLI

**OpenBug - Your AI-powered CLI Debugger**

OpenBug CLI is an intelligent command-line tool that helps you debug your applications in real-time using AI assistance. Run your commands, view logs, and get AI-powered insights all in one interactive terminal interface.

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

## Quick Start

### 1. Initialize OpenBug

```bash
debug init -m "Your project description"
```

This will:
- Create a configuration directory at `~/.openbug/`
- Generate an `openbug.yaml` file in your project directory
- Set up your project for OpenBug

### 2. Start Debugging

Run any command with OpenBug:

```bash
debug npm run dev
debug python app.py
debug node server.js
```

OpenBug will launch an interactive terminal interface where you can:
- View command logs in real-time
- Chat with AI about debugging issues
- Search your codebase
- Get intelligent suggestions

## Commands

### `debug`

Start the OpenBug interface for AI chat and service management.

**Example:**
```bash
debug
```

### `debug init [-id <project-id>] -m <description>`

Initialize OpenBug configuration and register your project directory.

**Options:**
- `-id <project-id>`: Specify a project ID (optional)
- `-m <description>`: Project description (required)

**Example:**
```bash
debug init -id my-project -m "Node.js API backend"
```

### `debug cluster`

Start the lightweight local WebSocket server for cluster functionality.

**Example:**
```bash
debug cluster
```

### `debug config [-id <project-id>] -m <description>`

Update project configuration for the current directory.

**Example:**
```bash
debug config -id my-project -m "Updated description"
```

### `debug <command>...`

Run any command with OpenBug's interactive debugging interface.

**Examples:**
```bash
debug npm run dev
debug python manage.py runserver
debug docker-compose up
```

## Configuration

OpenBug stores its configuration in `~/.openbug/config`. You can manually edit this file if needed.


Environment variables:
- `API_BASE_URL`: Backend API URL (example: `http://localhost:3000/v2/api`)
- `WEB_SOCKET_URL`: WebSocket URL (example: `ws://localhost:3000/v2/ws`)

## Project Metadata

OpenBug creates an `openbug.yaml` file in your project directory with metadata:

```yaml
id: "openbug-service"
description: "Your project description"
name: "Project Name"
window_id: 1234567890
logs_available: true
code_available: true
```

## Environment Variables


- `WEB_SOCKET_URL`: WebSocket URL (default: `wss://api.oncall.build/v2/ws`)
- `OPENBUG_CLUSTER_URL`: WebSocket URL for the cluster server (default: `ws://127.0.0.1:4466`)
- `OPENBUG_WS_PORT`: Port for the WebSocket server (default: `6111`)
- `OPENBUG_WS_HOST`: Host for the WebSocket server (default: `127.0.0.1`)
- `API_BASE_URL`: Base URL for the OpenBug API (default: `https://api.oncall.build/v2/api`)

## Keyboard Shortcuts

When using the interactive interface:

- `Tab`: Switch focus between panes
- `↑/↓`: Scroll (Keyboard Only)
- `Enter`: Send message
- `Ctrl+D`: Toggle chat/logs view
- `Ctrl+C`: Exit
- `Ctrl+R`: Reload AI chat

## Requirements

- Node.js 18+ 
- npm or yarn

## Support

For issues, questions, or contributions, please visit the project repository.

## License

MIT

