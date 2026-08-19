# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cheese Wheel (Сырное Колесо) is a collaborative movie selection web app for a group of 4 friends. Users spin a fortune wheel to pick movies and track watched movies with per-user ratings. The UI and documentation are in Russian.

## Commands

```bash
npm install        # Install dependencies
npm run build      # Build React frontend (outputs to dist/)
npm start          # Run server on port 3000 (serves dist/)
npm run dev        # Run Vite dev server (proxies API to :3000)
PORT=8080 npm start  # Run on custom port
```

## Architecture

**Backend** (`server.js`): Express server + SQLite (better-sqlite3) + Socket.io for real-time sync. Serves `dist/` (React build) or falls back to `public/` (legacy).

**Frontend** — React + Vite (`src/`):
- `index.html` — Vite entry point (root level)
- `src/main.jsx` — React entry, CSS imports
- `src/App.jsx` — root component, state management (Context API), socket.io, routing, theme
- `src/api.js` — all fetch() calls to the backend
- `src/audio.js` — Web Audio API (click, win sound)
- `src/css/` — styles split by component (same CSS from original):
  - `base.css`, `theme-newyear.css`, `theme-spring.css`, `toast.css`, `nav.css`, `auth.css`, `wheel.css`, `movies.css`, `modal.css`, `watched.css`, `stats.css`, `connection.css`, `responsive.css`
- `src/components/`:
  - `AuthPage.jsx` — login page with user selection + password
  - `Nav.jsx` — navigation bar
  - `WheelPage.jsx` — wheel page (movie list, add/remove, spin controls)
  - `CheeseWheel.jsx` — canvas wheel rendering + spin animation (forwardRef with imperative spin method)
  - `WatchedPage.jsx` — watched movies table with ratings, sorting, search
  - `StatsPanel.jsx` — statistics panel
  - `ResultModal.jsx` — spin result modal
  - `AdminModal.jsx` — theme selection (admin only)
  - `Toast.jsx` — toast notifications
  - `ConnectionStatus.jsx` — online/offline indicator
  - `ThemeDecorations.jsx` — snowflakes, garland, petals

**Legacy frontend** (`public/`) — original vanilla JS, kept for reference.

**Database** (`cheese_wheel.db`): Auto-created SQLite file with 4 tables:
- `users` — existing and invited users with unique normalized login names
- `movies` — movie titles with `is_watched` flag
- `ratings` — per-user ratings (1-10) per movie, unique constraint on (movie_id, user_id)
- `settings` — key-value store (spin duration, theme)

## Key Patterns

- **State management**: React Context API (`AppContext`) in `App.jsx` provides global state to all components.
- **Real-time sync**: Socket.io-client events trigger React state updates so multiple browser tabs stay in sync.
- **Wheel rendering**: Canvas 2D API in `CheeseWheel.jsx` — cheese colors, green rind, cheese holes, pointer, center hub. Spin animation via `requestAnimationFrame` with canvas redraw.
- **Theme system**: Three themes ("cheese", "newyear", "spring") controlled via CSS classes on `<body>` and a server-persisted setting.
- **Admin access**: User ID 2 (Сергей) has access to the admin settings panel. Client-side only check.
- **Auth**: Login name + scrypt-hashed password, optional 2FA, one-time admin invitations, and HTTP-only cookie sessions. Guest mode provides read-only access.
- **Navigation**: Client-side page switching via React state + `history.pushState`.

## API Routes (all in server.js)

- `POST /api/auth` — password verification
- `POST /api/users/:id/password` — change password
- `GET /api/users` — list users
- `GET/POST /api/wheel` — unwatched movies; `DELETE /api/wheel/:id`
- `POST /api/wheel/:id/watched` — mark as watched
- `GET/POST /api/watched` — watched movies; `DELETE /api/watched/:id`
- `POST /api/ratings` — set/update rating
- `GET /api/stats` — watched movies statistics (top/worst rated, per-user averages)
- `GET /api/settings` — all settings
- `POST /api/settings/spin-duration` — update wheel spin duration
- `GET/POST /api/theme` — theme preference
