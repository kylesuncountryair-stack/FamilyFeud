# Survey Says!

A daily Family Feud style game. Agents enter their name, give three answers to
the day's survey question, lock them in, and see the team's top answers on the board.

## How it works

1. **Sign in**: the agent enters their @suncountry.com email (remembered on their
   device). The game calls them by first name, taken from `Firstname.Lastname@suncountry.com`.
2. **Board**: today's question with three answer tiles. "Lock in answers" is final.
3. **Results**: the top 8 answer groups with how many players said each. The agent's
   matches are outlined in gold, and they score the player count for each of their
   answers that made the board. The board refreshes every 15 seconds.

Each email can play once per day. Every play is logged to a Google Sheet (see below). A new question rotates in at midnight (`GAME_TIMEZONE`).

## How answers get grouped

Free-form answers go through this pipeline, in order:

1. **Cache**: the same answer (ignoring case, plurals, "my/the") was already grouped today.
2. **Keywords** in `lib/questions.ts`: e.g. `pants`, `shirt`, `underwear` → `Clothes`.
3. **Claude** (if `ANTHROPIC_API_KEY` is set): puts the answer in an existing group
   or creates a broad new one. Typos and near-synonyms are handled here.
4. **Fallback**: the answer becomes its own group.

A player counts once per group, so "socks" + "shirts" from one person = 1 vote for Clothes.

## Deploy (GitHub → Vercel)

1. Push this folder to a new GitHub repo.
2. In Vercel: **Add New → Project**, import the repo. Framework is detected as Next.js.
3. In the project, open **Storage → Marketplace → Upstash for Redis** and connect a
   database. This adds the `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars for you.
4. In **Settings → Environment Variables** add:
   - `ANTHROPIC_API_KEY`: from console.anthropic.com (recommended for grouping)
   - `ADMIN_KEY`: any secret string
   - `GAME_TIMEZONE`: e.g. `America/New_York`
   - `SHEETS_WEBHOOK_URL` and `SHEETS_WEBHOOK_SECRET`: see the next section
5. Redeploy so the new variables take effect.

## Google Sheet play log

Every locked-in play adds a row to a **Plays** tab: timestamp, game day, email,
first name, question, and each answer with the group it was counted in.

1. Create (or open) the Google Sheet you want to use.
2. **Extensions → Apps Script**, delete the sample code, and paste in
   `google-apps-script/Code.gs`.
3. Change `SECRET` at the top to a long random string.
4. **Deploy → New deployment → Web app**. Set *Execute as: Me* and
   *Who has access: Anyone*, then deploy and approve the permissions.
5. Copy the Web app URL (ends in `/exec`) into Vercel as `SHEETS_WEBHOOK_URL`, and the
   secret as `SHEETS_WEBHOOK_SECRET`. Redeploy.

"Anyone" only means the URL doesn't need a Google login; requests without the secret
are rejected. The sheet itself stays private to you. Logging happens after the player
sees their results, so a slow or broken sheet never holds up the game. If you change
the script later, use **Manage deployments → Edit → New version** to keep the same URL.

Without Redis the app falls back to in-memory storage, which is fine locally but
**won't share answers between players on Vercel**.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev
```

## Editing questions

Edit `lib/questions.ts`. Give each question a stable `id`, and add `groups` keywords
for the obvious buckets. To force a specific question (testing, special days), set
`QUESTION_ID=forget-to-pack`.

## Fixing groups by hand (admin)

See every group and the raw answers in it:

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" https://your-app.vercel.app/api/admin
```

Merge one group into another (counts are recalculated, and future identical answers follow):

```bash
curl -X POST https://your-app.vercel.app/api/admin \
  -H "x-admin-key: YOUR_ADMIN_KEY" -H "content-type: application/json" \
  -d '{"from":"Undies","to":"Clothes"}'
```

Add `?day=2026-09-22&questionId=forget-to-pack` to either call to target a past day.

## Project layout

```
app/page.tsx              game UI (name → board → results)
app/api/question          today's question
app/api/submit            lock in answers (groups + counts them)
app/api/results           top answers + the player's own results
app/api/admin             view raw answers / merge groups
lib/questions.ts          question list and keyword groups
lib/categorize.ts         answer grouping pipeline
lib/game.ts               day rollover, keys, scoring
lib/store.ts              Upstash Redis (or in-memory fallback)
lib/identity.ts           email validation and first-name parsing
lib/sheets.ts             Google Sheets logger
google-apps-script/       script to paste into your Google Sheet
```
