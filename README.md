# Live 3-Team Quiz Minigame

A real-time, deployable Next.js + Supabase quiz application for live events with 3 teams (**Team Red `#EF4444`**, **Team Green `#16A34A`**, **Team Blue `#2563EB`**), 45 oral questions (15 per team), a 25-second server-synchronized countdown timer, an MC control panel, a 16:9 projector display, and an authenticated admin dashboard.

---

## Routes

- `/` — Landing page
- `/game` — Public 16:9 live projector display (Realtime synchronized, fullscreen toggle, no admin controls or answer spoilers)
- `/control` — Protected MC control panel (start/pause/resume/reset timer, mark Correct / Incorrect / Timeout, live answer reference)
- `/admin/login` — Supabase Auth sign-in page
- `/admin` — Protected Admin overview (question counts, readiness alerts, recent sessions)
- `/admin/questions` — Protected Question bank CRUD, search, team/status filters, pagination, and CSV bulk import (`team,question_text,answer_text,notes,is_active`)
- `/admin/sessions` — Protected Game session setup (Standard 45-question or Test 15-question mode)

---

## 1. Prerequisites

- Node.js 20+ and npm
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (for deployment)

---

## 2. Supabase Setup

### A. Run the Database Schema
1. Open your Supabase project → **SQL Editor**.
2. Copy the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and run it.
   This creates:
   - Tables: `admin_profiles`, `questions`, `game_sessions`, `session_questions`, `team_progress`
   - Indexes, foreign keys, and unique constraints (preventing duplicate questions per session)
   - Row Level Security (RLS) policies
   - Atomic RPCs (`create_game_session`, `start_game_session`, `control_timer`, `submit_question_result`, `restart_game_session`, `end_game_session`, `get_public_game_state`, `get_server_time`)
   - Realtime publication for `game_sessions`, `team_progress`, and `session_questions`

### B. Configure Supabase Auth & Admin User
1. In Supabase Dashboard → **Authentication → Providers**, ensure **Email** is enabled.
2. Go to **Authentication → Users → Add user** and create your admin user (email + password).
3. Copy the newly created user's UUID and run in **SQL Editor**:
   ```sql
   insert into public.admin_profiles (id, email, role)
   values ('<USER_UUID>', '<USER_EMAIL>', 'admin')
   on conflict (id) do update set role = 'admin';
   ```
   *(You can also create an MC-only account with `role = 'mc'` — they can access `/control` but not `/admin`.)*

### C. Verify Realtime
`supabase/schema.sql` automatically adds `game_sessions`, `team_progress`, and `session_questions` to `supabase_realtime`. You can verify under **Database → Publications → `supabase_realtime`**.

---

## 3. Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env.local` from `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
   Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` *(optional, only needed if you run the seed script; never expose to the browser)*
3. *(Optional)* Seed 15 sample questions per team (45 total):
   ```bash
   node --env-file=.env.local ./node_modules/.bin/tsx scripts/seed.ts --enable
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`.

---

## 4. Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel, click **Add New → Project** and import the repository.
3. Add Environment Variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` *(optional, server-only)*
4. Click **Deploy**.
5. After deployment, test `/admin/login`, `/admin/questions`, `/admin/sessions`, `/control`, and `/game` in two browser windows side by side.

---

## 5. Troubleshooting

- **"Authorization Required" after signing in**: Ensure the user's UUID is inserted into `public.admin_profiles` with `role = 'admin'` or `'mc'`.
- **Projector `/game` does not update live**: Verify `game_sessions` and `team_progress` are enabled in **Database → Publications → `supabase_realtime`** and that `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` match your project.
- **"Insufficient active questions for team ..."**: Each team needs at least 15 active questions for Standard mode (or 5 per team for Test Mode).
