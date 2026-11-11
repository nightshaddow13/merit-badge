# Merit Badge Field Kit

Static site (plain HTML, CSS, JS; no build step) with resources for the Cybersecurity and Artificial Intelligence merit badges.

## Deploy to Azure Static Web Apps

1. Push this folder's contents to the root of your GitHub repo (`main` branch).
2. In the Azure portal: **Create a resource > Static Web App**.
   - Plan: **Free**
   - Deployment source: **GitHub**, then pick the repo and branch
   - Build preset: **Custom**
   - App location: `/`
   - Api location: *(leave blank)*
   - Output location: *(leave blank)*
3. Azure commits its own GitHub Actions workflow to the repo. Every push to `main` redeploys.

Total size is about 15 MB, well under the Free plan's 250 MB limit.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `cybersecurity/`, `ai/` | Scout-facing pages |
| `counselor/` | **Locked** to the `counselor` role: print packs, answer keys, trackers, class audio, class tools |
| `tools/` | Interactive tools: A.I.R.A. Field Log, Two-Key Rite display |
| `files/` | Public downloads only (career worksheet, permission slip, Scout Passport) |
| `staticwebapp.config.json` | Azure routing and headers |
| `access-denied.html` | Shown to signed-in users who lack the needed role |

## Counselor lock-down

Everything under `counselor/` (the page, answer keys, print packs, trackers, class audio and the Two-Key Rite code display) requires the `counselor` role. Put any new adults-only file under `counselor/` and it is protected automatically. Files anywhere else are public.

Roles (Static Web App > Settings > Role management > Invite; several roles can be entered separated by commas):

| Role | Can do |
| --- | --- |
| `counselor` | Open `/counselor/` and everything in it |
| `scorekeeper` | See the Edit scores button, open the scorekeeper pages, save scores, and run the Passphrase Forge controls (reset, round type, award points) |

To sign in, open `/counselor/`; you are sent to GitHub and back. A signed-in user without the role sees the "No access" page.

**Keep the GitHub repo private.** The site lock does not hide files in a public repo: anyone can read the answer keys on GitHub. Repo > Settings > General > Danger Zone > Change visibility > Private. Static Web Apps deploys private repos normally.

The A.I.R.A. Field Log loads jsPDF from cdnjs and the Google Fonts stylesheet loads from Google, so Scouts need internet access to use them fully.

## Live scoreboards

Two separate boards, one per badge:

| Board | Public page | Scorekeeper page (sign-in) |
| --- | --- | --- |
| Cybersecurity: Cup of the Silver Padlock (6 lodges) | `/cybersecurity/scoreboard/` | `/cybersecurity/scoreboard/edit.html` |
| Artificial Intelligence: A.I.R.A. (4 squads) | `/ai/scoreboard/` | `/ai/scoreboard/edit.html` |

- Anyone can view a scoreboard. The **Edit scores** button appears only for signed-in users with the `scorekeeper` role.
- `api/` is an Azure Functions API (managed by Static Web Apps) that stores scores in Azure Table Storage: `GET /api/scores/{board}` for anyone, `POST` for scorekeepers only.
- Until storage is connected, each public page shows the snapshot in `data/scoreboard-<board>.json`.
- The rows on each board come from `<badge>/scoreboard/rows.json`. If you change a row id or its limits, change `api/src/lib/boards.js` too; `cd api && node test.js` checks that they match.

One-time setup:

1. **Storage account.** Azure portal > Create a resource > Storage account (primary service: Other (tables and queues); Standard, LRS). Open it > Security + networking > Access keys > copy a **Connection string**.
2. **App setting.** Static Web App > Settings > Environment variables > add `STORAGE_CONNECTION_STRING` with that value. Save.
3. **Scorekeeper role.** Static Web App > Settings > Role management > Invite. Provider GitHub, the person's GitHub username, role `scorekeeper`. They open the link once to accept.
4. **Sign in** on each device by opening `/counselor/` once. The Edit scores button then shows on both scoreboards for users with the `scorekeeper` role.

## Passphrase Forge (`/cybersecurity/passphrase-forge/`)

Each device scores a practice passphrase locally with zxcvbn (bundled into the page, no CDN). Submitting sends only the lodge, `guesses_log10`, length, pattern count and a masked preview (first character plus asterisks). The passphrase never leaves the device. The page's Content-Security-Policy only allows requests to this site.

- `GET /api/forge` shows the round and entries; `POST /api/forge` submits (anyone, validated server-side).
- Scorekeeper only: `POST /api/forge/round` (open/close, round type, starter), `/api/forge/reset` (new round) and `/api/forge/award` (1st = 2 points, 2nd = 1 point, written to the "Passphrase Forge: placing" row of the Cybersecurity scoreboard; pressing it again replaces the row).
- The lodge dropdown uses the lodge names saved on the scoreboard. Data lives in the same `cup` table (partition `forge`), so no new Azure setup is needed.
- Anonymous submissions can be faked by a determined student; the server checks every value, but this is a classroom game, not a secure vote.
- Updating zxcvbn: `npm i zxcvbn@<version>` somewhere, copy `node_modules/zxcvbn/dist/zxcvbn.js` over `cybersecurity/passphrase-forge/build/zxcvbn.js`, then run `node cybersecurity/passphrase-forge/build/build.js` and commit the regenerated `index.html`. Edit the page in `build/template.html`, not `index.html`.
- Tests: `node api/test-forge.js`.

## Two-Key Rite code check (public)

`/cybersecurity/two-key-rite/` is open to everyone: each lodge picks itself and types the 6 digits from its authenticator. Codes are verified **on the server** (`POST /api/twokey/check`), so the secrets are not in the page. A lodge finishes after 2 valid codes from 2 different 30-second windows. Points by order of finishing: 1st = 3, 2nd = 2, every later lodge = 1, written automatically to the "Two-Key Rite (MFA)" row of the Cybersecurity scoreboard. Wrong guesses are limited to 10 per lodge per minute. Scorekeepers also get an **Apply points to scoreboard** button to re-write the standings on demand. **Reset scorecard** (scorekeepers only) clears the codes and removes those points.

**Setup, one time (either way works):** a scorekeeper can paste the secrets into the **Set up codes** box on the check page (stored on the server in the same table, never shown again), or set the app setting below.

**App setting option:** in Azure, open the Static Web App, then Environment variables, and add `TWOKEY_SECRETS` = the seven practice secrets from `counselor/tools/two-key-rite-display.html`, comma separated, in lodge order (Lodge 1 first; the spare is the 7th). Until it is set the page says the check is not set up.

The code display (`/counselor/tools/two-key-rite-display.html`) opens for either the `counselor` or the `scorekeeper` role. The secrets are practice-only but sit in that file, so keep the repo private (the kids could otherwise read them on GitHub and generate codes). Tests: `node api/test-twokey.js`.

## Secret hunts

- **The Silver Vault** (`/cybersecurity/silver-vault/`, Cybersecurity): hidden, not in the nav, noindex. Trail: a source comment on the Cybersecurity page, then `robots.txt` (Caesar cipher), the Hash Lab (fingerprint match), then text hidden in the page color. Answers are salted SHA-256 hashes in the page and the reward phrase is encrypted, so the page source does not hold them.
- **Operation Echo** (`/ai/echo/`, AI): kicked off by `/llms.txt`, a briefing written for AI assistants that tells them to start the game with a Scout. The AI page links to it for AI helpers.
- `assets/hunt.js` is the shared engine. Answers and hints for both are on the counselor-only page `/counselor/files/hunts-key.html`.

## Field Log squad points (A.I.R.A.)

The Field Log (`/tools/aira-field-log.html`) reads squad names from `GET /api/scores/ai` and lets each Scout pick a squad. The slot number (1 to 4) is saved with the name, so renaming a squad on the scoreboard does not break progress.

Each Scout's device sends `POST /api/airalog` (public, no sign-in) with a random device id, first name + last initial, squad slot, and three numbers: Vocab Vault best (0-10), Level 1 terms done (0-16), levels cleared (0-8). The server validates and clamps everything and stores one record per Scout in the `airalog` partition of the `cup` table. Points only go up. Levels cleared are capped by the "Levels completed" number the counselor sets on the scorekeeper page.

Squad XP is the **average of every joined Scout (zeros included)**, rounded to whole XP, written into three read-only rows: `vocab-vault-avg` (1 XP per correct answer), `terms-avg` (1 XP per term), `levels-avg` (5 XP per level). Tune the XP in `PER` in `api/src/lib/airalog.js` and keep the row maxima in `ai/scoreboard/rows.json` and `api/src/lib/boards.js` equal to cap x PER (`node api/test.js` checks). Boss, style and bonus rows stay counselor-entered, and saving the scoreboard never overwrites the automatic rows.

Abuse limits: 12 Scouts per squad, 40 total. Scorekeepers can see the roster, remove a Scout, or clear everyone at `/ai/scoreboard/roster.html`. Only first name + last initial is stored. Because the endpoint is public, a determined person could still send fake Scouts up to those caps; remove them on the roster page.

## Field Log backup, dashboard and overrides

The Field Log backs itself up to `POST /api/fieldlog` (public, keyed by the Scout's private device id) a few seconds after changes, once the Scout has typed a name. Storage is the same `cup` table and `STORAGE_CONNECTION_STRING` as the scoreboards (partitions `fieldlog` and `fieldlog-ovr`); no new Azure setup. Each log is split across entity properties (30K characters each), capped at 150K characters and 80 logs.

Only users with the `counselor` or `scorekeeper` role can list or open logs, via `/ai/scoreboard/logs.html` (routes are locked in `staticwebapp.config.json`, and the API checks the role too). The dashboard shows a summary per level, lets staff waive or restore a level page's requirements, download a log as a `.json` that the Field Log's Load button accepts, or delete it.

When Unlock is blocked by unfinished items, the Scout can press "Ask my counselor to waive this page". That marks a pending override (shown on the dashboard). Once granted, the Scout's page checks every 15 seconds, and Unlock skips the missing-items check; the code letter is still required. Overrides live in their own rows, so a Scout's autosave never undoes one. Staff can also waive a page with no request.

Recovery: each Field Log shows a recovery code (the device id in groups of four). Typing it under "Lost your progress? Recover it" calls `GET /api/fieldlog/restore?id=` and loads that Scout's backup on any device. The dashboard shows the same code for each Scout so staff can give it back. The dashboard's "View highlights" button on each level shows that level's scores and answers.

## Class Race (Level 3 game)

Everyone plays against everyone. Each Scout sorts the same shuffled 24-card deck by the three rules (Trigger, Task, Variable) on their own device, and the finished run is posted to `POST /api/hvboard` (needs a squad and a first name + last initial). The server keeps each Scout's best run (fewest wrong bins, then faster time), turns it into points (4 for finishing + up to 6 for accuracy, 10 max), shows the class leaderboard and squad standings to anyone who has played (`GET /api/hvboard?id=`), and writes each squad's AVERAGE into the automatic `hvm-avg` row of the AI scoreboard. Scorekeepers can clear it with `POST /api/hvboard/reset`. The old two-device match endpoints (`/api/hvmatch`) were removed.

## What Would You Do? live class game

Run from `/ai/scoreboard/wwyd.html` (counselor or scorekeeper). **Start game** picks five random scenarios (`POST /api/wwyd/control {action:"start"}`, clears old answers). Scouts' Field Logs poll `GET /api/wwyd?id=` and lock in a stance and reason for the current scenario (`POST /api/wwyd`, only the current scenario and only before the reveal). **Reveal** shows everyone's answers (with names, to Scouts who answered; without names on the public scoreboard page), and **Next scenario** is only allowed after a reveal; Scouts then move on with their own Next button. **End game** returns the normal scoreboard. While a game is active the public scoreboard page (`/ai/scoreboard/`) shows the current scenario over the board, with the revealed answers underneath, polling every 4 seconds. With no game running, the Field Log falls back to solo practice. Table `cup`, partition `wwyd`; no new Azure setup.

## Human Neural Network mystery cards

The Level 6 "Human Neural Network" tab deals mystery cards from `POST /api/hnn/reveal` (Apple/Tomato, Cat/Dog or Soccer ball/Basketball, or a misleading card). A card is assigned the first time a Scout presses Reveal and is never dealt again to anyone until staff reset (`POST /api/hnn/reset`, button on the Field Log dashboard `/ai/scoreboard/logs.html`, which also shows the answer key and what is left). The images are opaque-named SVGs in `ai/hnn/` (168 cards); the answer key (`api/src/lib/hnncards.json`) stays on the server, and `POST /api/hnn/answer` only answers for a card dealt to that Scout. Rebuild or extend the deck with `node tools/gen-hnn-cards.js` (writes the SVGs and the key). Table `cup`, partition `hnn`; no new Azure setup.

## Prompt Duel

Run from `/ai/scoreboard/duel.html`. Squads send one prompt + output each (`POST /api/duel/submit`); **Reveal & open voting** shows them as numbered anonymous cards on the public scoreboard page (which takes over the board) and in each Scout's Field Log, where every Scout gets one vote and cannot vote for their own squad (`POST /api/duel/vote`); **Show results** reveals squads and votes; **End duel** returns the scoreboard. Partition `duel`.

## Using one Field Log on two devices

Enter the same recovery code on the second device (Agent file > "Lost your progress? Recover it"). Each device checks the saved copy every 20 seconds (and when the tab becomes visible again) and quietly pulls it in when it is newer, never while the Scout is typing or has unsent edits. Newer is decided by `rev`, a timestamp bumped only when the content changes; the Scouting America member ID (optional, digits only) is part of the backup so it follows the Scout across devices, and staff can see it on the Field Log dashboard.

## Access code gate and certificate

A Scout can only enter the access code for Level N once the scoreboard's "Levels completed" (set on `/ai/scoreboard/edit.html`) is at least N; until then the code box is disabled with a "locked" note, and pressing Unlock re-checks `GET /api/scores/ai`. If the scoreboard can't be reached the code is not accepted. This is a classroom gate: the code check itself still runs in the browser, so a determined Scout can bypass it with developer tools. After the final code (`won`), the Send & save page (and the "MIRAGE SHUT DOWN" card) offers a landscape PDF Certificate of Completion with the Scout's name, squad, date and optional member ID: print it, download it, or email it to themselves. It states that it is not an official Scouting America award.
