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

**Server (`server.js`):** Custom HTTP server that handles Next.js requests and upgrades `/ws` connections to WebSocket. Manages channels (Map of password, users, message history), broadcasts messages/user lists, and persists encrypted messages to SQLite. WebSocket message types: `join`, `message`, `leave`. Keepalive via 30s ping/pong.

**Database (`db.js`):** SQLite via better-sqlite3. Single `messages` table indexed on `channel`. Auto-cleans to 200 messages per channel.

**Frontend (`src/app/page.tsx`):** Single-page client component. Handles login, session recovery (encrypted localStorage), WebSocket auto-reconnect (5s interval), message encryption/decryption, and rendering with code block detection + copy buttons.

**Crypto (`src/utils/crypto.js`):** Web Crypto API wrapper — PBKDF2 key derivation (100k iterations, SHA-256) → AES-256-GCM. Also provides localStorage encryption helpers for session persistence.

**Styling (`src/app/globals.css`, `page.module.css`):** Dark terminal/CRT aesthetic with CSS variables. Responsive with 768px mobile breakpoint. CSS Modules for component scoping.

## Key Conventions

- Language: UI text is in Chinese (zh-CN)
- Path alias: `@/*` maps to `./src/*`
- TypeScript strict mode is disabled
- `crypto.js` is plain JS (not TypeScript)
- Server-side code (`server.js`, `db.js`) uses CommonJS (`require`)
- No Tailwind — custom CSS with CSS Modules
