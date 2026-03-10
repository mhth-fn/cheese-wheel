# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cheese Wheel (Сырное Колесо) is a collaborative movie selection web app for a group of 4 friends. Users spin a fortune wheel to pick movies and track watched movies with per-user ratings. The UI and documentation are in Russian.

## Commands

```bash
npm install        # Install dependencies
npm start          # Run server on port 3000
PORT=8080 npm start  # Run on custom port
```

No build step, test suite, or linter is configured.

## Architecture

**Backend** (`server.js`): Express server + SQLite (better-sqlite3) + Socket.io for real-time sync.

**Frontend** — vanilla JS with ES modules (`type="module"`), no framework or bundler:
- `public/index.html` — HTML structure only
- `public/css/` — styles split by component:
  - `base.css` — CSS variables, reset, body, page containers
  - `theme-newyear.css` — New Year theme + snowflakes + garland
  - `theme-spring.css` — Spring theme + petals
  - `toast.css`, `nav.css`, `auth.css`, `wheel.css`, `movies.css`, `modal.css`, `watched.css`, `stats.css`, `connection.css`, `responsive.css`
- `public/js/` — ES modules:
  - `app.js` — entry point (imports + init)
  - `state.js` — shared mutable state object
  - `api.js` — all fetch() calls to the backend
  - `utils.js` — showToast, escapeHtml, formatDate
  - `audio.js` — Web Audio API (click, win sound)
  - `socket.js` — Socket.IO instance + event listeners
  - `theme.js` — theme loading/applying, decorations (snowflakes, garland, petals)
  - `nav.js` — navigation bar rendering
  - `auth.js` — auth page, login/logout flow
  - `router.js` — client-side routing (showPage, popstate)
  - `wheel.js` — canvas wheel rendering, movie list, add/remove
  - `spin.js` — wheel spin animation, result modal, easing
  - `watched.js` — watched movies table
  - `ratings.js` — rating cells, average rating, sorting
  - `stats.js` — statistics panel
  - `events.js` — all DOM event listeners

**Database** (`cheese_wheel.db`): Auto-created SQLite file with 4 tables:
- `users` — 4 hardcoded users (Антон, Сергей, Пётр, Митя)
- `movies` — movie titles with `is_watched` flag
- `ratings` — per-user ratings (1-10) per movie, unique constraint on (movie_id, user_id)
- `settings` — key-value store (spin duration, theme)

## Key Patterns

- **Real-time sync**: All state changes broadcast via Socket.io events so multiple browser tabs stay in sync.
- **Theme system**: Three themes ("cheese", "newyear", "spring") controlled via CSS classes and a server-persisted setting.
- **Admin access**: User ID 2 (Сергей) has access to the admin settings panel. This check is client-side only.
- **Auth**: Single shared password hardcoded in `server.js` (`USER_PASSWORD`). Guest mode provides read-only access.
- **Navigation**: Client-side tab switching via `showPage()` using `data-page` attributes (wheel, watched).

## API Routes (all in server.js)

- `POST /api/auth` — password verification
- `GET /api/users` — list users
- `GET/POST /api/wheel` — unwatched movies; `DELETE /api/wheel/:id`
- `POST /api/wheel/:id/watched` — mark as watched
- `GET/POST /api/watched` — watched movies; `DELETE /api/watched/:id`
- `POST /api/ratings` — set/update rating
- `GET /api/stats` — watched movies statistics (top/worst rated, per-user averages)
- `GET /api/settings` — all settings
- `POST /api/settings/spin-duration` — update wheel spin duration
- `GET/POST /api/theme` — theme preference
