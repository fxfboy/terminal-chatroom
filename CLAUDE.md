# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Encrypted real-time terminal chatroom. Custom Node.js server runs both Next.js 14 (App Router) and a WebSocket server in a single process on port 3000. All messages are end-to-end encrypted (AES-256-GCM) — the server only stores ciphertext. Channels are password-protected; the password doubles as the encryption key.

## Commands

- `npm run dev` — Start dev server (WebSocket + Next.js) on localhost:3000
- `npm run build` — Production build
- `npm start` — Start production server
- `npm run lint` — ESLint (Next.js core web vitals + TypeScript)

## Architecture

### Server (`server.js`)

Custom HTTP server that handles Next.js requests and upgrades `/ws` connections to WebSocket. Manages channels (`Map<channel, {password, users, messageHistory}>`), tracks users (`Map<ws, {channel, username, ip}>`), broadcasts messages/user lists, and persists encrypted messages to SQLite. Keepalive via 30s ping/pong.

**WebSocket message types:** `join`, `message`, `leave`, `kick`, `ban` (last two are test-only).

**Security & rate limiting:**
- Input validation: max username 50 chars, channel 50 chars, password 100 chars, message 100KB
- Character validation via regex (`[\w\u4e00-\u9fa5\-_.\s]+` for usernames, `[\w\u4e00-\u9fa5\-_]+` for channels)
- Per-IP rate limits: 30 messages/min, 10 connections/min, 5 join attempts/min
- IP banning: 30-minute ban duration, tracked in memory
- Cleanup intervals: ban + rate limit cleanup every 60s

**Channel behavior:** Auto-created on first join, deleted when last user leaves. Loads last 50 messages from DB on join. In-memory history capped at 200 messages per channel.

### Database (`db.js`)

SQLite via better-sqlite3. Single `messages` table (`id`, `channel`, `username`, `text`, `time`, `created_at`) indexed on `channel`. Exports `saveMessage()`, `getHistory(channel, limit=100)`, `cleanupOldMessages(channel, keepCount=200)`.

### Frontend (`src/app/page.tsx`)

Single-page client component (~664 lines). Key features:

- **Login** — username/channel/password form
- **Session recovery** — modal on return visit, decrypts saved session from localStorage
- **Auto-lock** — locks screen after 5 minutes of inactivity (mousedown, mousemove, keypress, scroll, touchstart detection), requires password to unlock
- **WebSocket** — auto-reconnect at 5s interval, connection state tracking (`connecting`/`connected`/`disconnected`/`error`), duplicate connection prevention, no reconnect after logout
- **Messages** — client-side AES-256-GCM encryption/decryption, code block detection (``` fenced blocks) with copy buttons, HTML escaping for XSS prevention, 12-hour time format
- **Input** — Enter to send, Shift+Enter for newline, code block insertion button
- **Online users** — sidebar panel (hidden on mobile <768px)

### Crypto (`src/utils/crypto.js`)

Web Crypto API wrapper — PBKDF2 key derivation (100k iterations, SHA-256) → AES-256-GCM with random 16-byte salt + 12-byte IV per encryption. Exports `encrypt`, `decrypt`, `encryptToStorage`, `decryptFromStorage`.

### Styling (`src/app/globals.css`, `page.module.css`)

Dark terminal/CRT aesthetic with CSS variables. Background `#0f0f12`, accent colors purple (`#8b5cf6`) / indigo (`#6366f1`). Responsive with 768px mobile breakpoint. CSS Modules for component scoping.

## Deployment

Docker support via multi-stage `Dockerfile` (node:20-alpine) and `docker-compose.yml`. Exposes port 3000. SQLite data persisted via Docker volume (`chat-data:/app/data`). Health check on localhost:3000 every 30s. Configurable via env vars: `DB_PATH`, `NODE_ENV`, `PORT`.

## Key Conventions

- Language: UI text is in Chinese (zh-CN)
- Path alias: `@/*` maps to `./src/*`
- TypeScript strict mode is disabled
- `crypto.js` is plain JS (not TypeScript)
- Server-side code (`server.js`, `db.js`) uses CommonJS (`require`)
- No Tailwind — custom CSS with CSS Modules
- Message IDs use `Date.now().toString()`
