# Midnight Drive-In

A local-only desktop media organizer for classic drive-in style viewing. Point it at your movie and commentary folders, let it scan and match your files, then sit back and enjoy the show.

---

## How It Works

Midnight Drive-In is a [Tauri v2](https://v2.tauri.app/) desktop application with a React + TypeScript frontend and a Rust backend.

### Architecture

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| UI | React 19, TypeScript, Tailwind CSS v4, Vite |
| Local database | SQLite via SQLx |
| Routing | React Router v7 |

### Core workflow

1. **Settings** – Open the Settings page and choose two folders:
   - **Movies Folder** – the directory that contains your video files.
   - **Commentary Folder** – the directory that contains your commentary audio tracks.
2. **Scan** – Click **Rescan Library**. The Rust backend walks both directories, fuzzy-matches movie files to their commentary tracks, and writes the results to a local SQLite database. Each episode ends up with one of four statuses: `Ready`, `Partial Match`, `Missing Files`, or `Needs Timing Fix`.
3. **Library** – Browse your episodes on the Library page. Filter by status or type (Episodes / Specials) and search by title.
4. **Episode detail** – Select an episode to review its matched files, adjust playback offsets, or remap files if the automatic match was wrong.
5. **Data stays local** – All metadata lives in a SQLite database on your machine and is never uploaded anywhere.

---

## Local Development

### Prerequisites

- **Node.js** 18 or later and **Yarn** (classic or modern)
- **Rust** (stable toolchain) – install via [rustup](https://rustup.rs/)
- **Tauri v2 system dependencies** for your platform – follow the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

### Install dependencies

```bash
yarn install
```

### Start the app

Run the full Tauri desktop app (starts the Vite dev server and the native window together):

```bash
yarn tauri dev
```

Run only the Vite frontend in a browser (no Tauri/Rust backend):

```bash
yarn dev
```

### Run tests

```bash
yarn test
```

Watch mode:

```bash
yarn test:watch
```

### Lint

```bash
yarn lint
```