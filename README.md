# mmd-viewer

AI-assisted MMD motion generation with a React viewer and a Fastify API. Accounts can save, load, update, and delete private motion plans.

## Requirements

- Node.js 22 or newer (the server uses the built-in SQLite module)
- npm
- A Gemini API key for AI generation

## Setup

```bash
npm install
```

Create a `.env` file in the project root based on `.env.example`:

```text
PORT=3001
DATABASE_FILE=./data/mmd-viewer.sqlite
GEMINI_API_KEY=your_key_here
```

The database file and tables are created automatically on the first server start. SQLite files and `.env` are ignored by Git. Existing `VITE_GEMINI_API_KEY` and `VITE_OPENAI_API_KEY` variables should be removed; browser code no longer uses them.

Start the API and frontend in separate terminals:

```bash
npm run dev:server
npm run dev
```

Open `http://localhost:5173/MMD`. Vite forwards `/api` requests to Fastify on port 3001. Use the **Sign in** or **Create account** links in **My plans** to open the separate account pages, then return to the viewer to generate or paste and save a motion plan. Saved plans belong to that account. AI generation requires sign-in. Direct keyframe motions and raw VMD JSON can be played but are not stored in the plan library.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/plans`, `GET /api/plans/:id`, `POST /api/plans`, `PUT /api/plans/:id`, `DELETE /api/plans/:id`
- `POST /api/generate/motion`, `POST /api/generate/plan`

Authentication uses an HTTP-only session cookie. Passwords are salted and hashed with scrypt. Plan writes are validated, and every plan query is scoped to its owner. The `Store` interface in `server/src/types.ts` is the boundary for adding a PostgreSQL implementation later; the HTTP API need not change.

## Checks

```bash
npm run check:server
npm run test:server
npm run build
```
