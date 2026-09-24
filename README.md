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

Each email can play once per day. **Leaderboard** (link in the header, and the points pill next to the player's name)
ranks everyone by total points for the week, Monday to Sunday, with last week one tap away.
Totals are recalculated from each day's latest board, so the same answers always earn the
same points whether someone played early or late. Names show as first name + last initial.
**Past boards** (link in the header) shows the
final board for every finished day, plus the player's own answers and score if they
played. Today's board never appears there, so nobody can peek before playing. Every play is logged to a Google Sheet (see below). A new question rotates in at midnight (`GAME_TIMEZONE`).

## How answers get grouped

Free-form answers go through this pipeline, in order:

1. **Cache**: the same answer (ignoring case, plurals, "my/the") was already grouped today.
2. **Keywords** in `lib/questions.ts`: e.g. `pants`, `shirt`, `underwear` → `Clothes`.
3. **Claude** (if `ANTHROPIC_API_KEY` is set): puts the answer in an existing group
   or creates a broad new one. Typos and near-synonyms are handled here.
4. **Fallback**: the answer becomes its own group.

5. **Board cleanup**: whenever a play creates a new group, Claude looks at the whole
   board and merges groups that mean the same thing ("Advil" into "Medication",
   "Magazine" + "Readers digest" into "Reading material"). This runs after the player
   sees their results, so nobody waits on it.

To tidy a board yourself (for example, answers from before the Claude key was added),
open `/api/admin/regroup?key=YOUR_ADMIN_KEY` in a browser. It shows what it merged and
every group with the answers in it.

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

### Troubleshooting the sheet

Open `https://your-app.vercel.app/api/admin/sheet-test?key=YOUR_ADMIN_KEY` in a browser.
It sends a test row and tells you exactly what went wrong if it fails (missing
variable, wrong secret, Google sign-in wall, script error).

Also note: each email can only play once per day, and repeat attempts aren't logged.
If you played before the sheet was connected, your own row won't appear until tomorrow.

Without Redis the app falls back to in-memory storage, which is fine locally but
**won't share answers between players on Vercel**.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev
```

## One-week event

Set `GAME_START` in Vercel to the Monday the event begins (e.g. `2026-09-28`), then redeploy.

- **Monday–Sunday:** one question per day, using the first 7 questions in
  `lib/questions.ts` in order (first question = Monday).
- **The following Monday (catch-up day):** no new question. Players can answer the Saturday
  and Sunday questions they missed; their points count toward the week.
- **After that:** the game shows "That's a wrap!" with the final standings and Past boards.
- Before `GAME_START`, players see when the game starts.

The leaderboard covers exactly the event week, and Past boards only shows event days, so
anything from testing beforehand stays out of the results. Leave `GAME_START` unset to keep
running a new question every day.

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
