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
| `counselor/` | **Locked** to the `counselor` role: print packs, answer keys, trackers, class tools |
| `tools/` | Interactive tools: A.I.R.A. Field Log, Warden Log, Two-Key Rite display |
| `files/` | Public downloads only (career worksheet, Scout Passport) |
| `staticwebapp.config.json` | Azure routing and headers |
| `access-denied.html` | Shown to signed-in users who lack the needed role |

## Counselor lock-down

Everything under `counselor/` (the page, answer keys, print packs, trackers and the Two-Key Rite code display) requires the `counselor` role. Put any new adults-only file under `counselor/` and it is protected automatically. Files anywhere else are public.

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
| Artificial Intelligence: A.I.R.A. (6 squads) | `/ai/scoreboard/` | `/ai/scoreboard/edit.html` |

- Anyone can view a scoreboard. The **Edit scores** button appears only for signed-in users with the `scorekeeper` role.
- `api/` is an Azure Functions API (managed by Static Web Apps) that stores scores in Azure Table Storage: `GET /api/scores/{board}` for anyone, `POST` for scorekeepers only.
- **Full screen** (both boards): the button on the scoreboard page shows only the top 3 lodges or squads, big, starting at the top of the screen, with the page in browser full screen (Esc or the faint corner button exits). Add `?top=5` to show more, or `?tv=1` to open straight into the big view. On the A.I.R.A. board the access code line is hidden in this view. Built from shared pieces: `assets/scoreboard/tv.js`, `alerts.js` and `scoreboard.css`.
- **Score pop-ups**: whenever a live refresh (every 5 seconds) shows a team's points changed, a pop-up says who, how many points and which activity (negative changes show in red). Opening the page never pops, a saved snapshot never pops, and a bulk change (more than 8 at once, like a reset) shows one "Scores updated" note instead.
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

`/cybersecurity/two-key-rite/` is open to everyone: each lodge picks itself and types the 6 digits from its authenticator. Codes are verified **on the server** (`POST /api/twokey/check`), so the secrets are not in the page. A lodge finishes after 2 valid codes from 2 different 30-second windows. Points by order of finishing: 1st = 3, 2nd = 2, every later lodge = 1, written automatically to the "Two-Key Rite (MFA)" row of the Cybersecurity scoreboard. Wrong guesses are limited to 10 per lodge per minute. Scorekeepers also get an **Award points to the Cup scoreboard** button to re-write the standings on demand. **Reset scorecard** (scorekeepers only) clears the codes and removes those points.

**Setup, one time (either way works):** a scorekeeper can paste the secrets into the **Set up codes** box on the check page (stored on the server in the same table, never shown again), or set the app setting below.

**App setting option:** in Azure, open the Static Web App, then Environment variables, and add `TWOKEY_SECRETS` = the seven practice secrets from `counselor/tools/two-key-rite-display.html`, comma separated, in lodge order (Lodge 1 first; the spare is the 7th). Until it is set the page says the check is not set up.

The code display (`/counselor/tools/two-key-rite-display.html`) opens for either the `counselor` or the `scorekeeper` role. The secrets are practice-only but sit in that file, so keep the repo private (the kids could otherwise read them on GitHub and generate codes). Tests: `node api/test-twokey.js`.

## Secret hunts

- **The Silver Vault** (`/cybersecurity/silver-vault/`, Cybersecurity): hidden, not in the nav, noindex. Trail: a source comment on the Cybersecurity page, then `robots.txt` (Caesar cipher), the Hash Lab (fingerprint match), then text hidden in the page color. Answers are salted SHA-256 hashes in the page and the reward phrase is encrypted, so the page source does not hold them.
- **Operation Echo** (`/ai/echo/`, AI): kicked off by `/llms.txt`, a briefing written for AI assistants that tells them to start the game with a Scout. The AI page links to it for AI helpers.
- `assets/hunt.js` is the shared engine. Answers and hints for both are on the counselor-only page `/counselor/files/hunts-key.html`.

## Field Log squad points (A.I.R.A.)

The Field Log (`/tools/aira-field-log.html`) reads squad names from `GET /api/scores/ai` and lets each Scout pick a squad. The slot number (1 to 6) is saved with the name, so renaming a squad on the scoreboard does not break progress.

Each Scout's device sends `POST /api/airalog` (public, no sign-in) with a random device id, first name + last initial, squad slot, and three numbers: Vocab Vault best (0-10), Level 1 terms done (0-16), levels cleared (0-8). The server validates and clamps everything and stores one record per Scout in the `airalog` partition of the `cup` table. Points only go up. Levels cleared are capped by the "Levels completed" number the counselor sets on the scorekeeper page.

Squad XP is the **average of every joined Scout (zeros included)**, rounded to whole XP, written into three read-only rows: `vocab-vault-avg` (1 XP per correct answer), `terms-avg` (1 XP per term), `levels-avg` (5 XP per level). Tune the XP in `PER` in `api/src/lib/airalog.js` and keep the row maxima in `ai/scoreboard/rows.json` and `api/src/lib/boards.js` equal to cap x PER (`node api/test.js` checks). Boss, style and bonus rows stay counselor-entered, and saving the scoreboard never overwrites the automatic rows.

Abuse limits: 12 Scouts per squad, 40 total. Scorekeepers can see the roster, remove a Scout, or clear everyone at `/ai/scoreboard/roster.html`. Only first name + last initial is stored. Because the endpoint is public, a determined person could still send fake Scouts up to those caps; remove them on the roster page.

Every removal or clear on the roster page asks "are you sure?" first. **Reset everything** (scorekeepers only, type RESET to confirm) calls `POST /api/resetall` and clears every Scout, Class Race score, What Would You Do answer, Prompt Duel entry and vote, Human Neural Network card assignment, and every manual score and the Levels completed number on the AI scoreboard. Squad names stay and the Cybersecurity scoreboard is untouched. A checkbox (on by default) also deletes every backed-up Field Log and waiver.

The red countdown appears only on the two badge doors on the home page (there is no top-of-page bar). Its times come from the class schedule (next section).

## Class schedule (`/counselor/schedule.html`)

Counselors choose, per badge: **Active** on/off, the **class date, start time and length** (Eastern; drives the home-page countdown, "In session now" and "See you next time!"), and an optional **open from / close after** window. It is saved with `POST /api/schedule` (counselor or scorekeeper) and read by everyone with `GET /api/schedule` (which also returns the server clock, so a wrong device clock cannot open a closed badge). Storage is the `cup` table, partition `schedule`, row `config`; no new Azure setup. `POST /api/schedule/reset` returns to the built-in defaults (both badges active, the Nov 14 2026 class times, no window), which are also what the site uses if the schedule cannot be loaded, so a storage problem never locks Scouts out. Keep `DEFAULTS` in `assets/schedule.js` and `api/src/lib/schedule.js` equal (`api/test-schedule-client.js` checks).

A badge that is not open (off, before its window, or after it) has its door hidden on the home page, and its Scout pages (intro, badge home, tools, games, Field Log / Warden Log, public scoreboard) load `assets/gate.js`, which sends Scouts to `/closed.html`. Staff always get in and see a yellow note. This is a front-door lock, not a security wall: the pages are static files, and the counselor-only files are still protected by sign-in on the server. Scouts' saved Field Logs are untouched. To close a new Scout page, add `<script src="/assets/schedule.js"></script><script src="/assets/gate.js" data-badge="cy"></script>` to its `<head>` (`ai` for the AI badge). The generated Passphrase Forge page needs the same lines in `build/template.html` (its checked-in `index.html` is newer than the template, so patch both rather than rebuilding).

## Field Log backup, dashboard and overrides

Only what the official requirements ask a Scout to write is required in the Field Log: the AI timeline (2e), the automation timeline (3e), the Scout Law guidelines (4c), the three school prompts (6d) and the project plan (7a). Everything that is only identify, explain, describe or discuss (the example lists in 2a to 2c and 3a to 3c, the Boss Challenge sheet, ethical concerns, the Turing test, deepfakes, the five methods, why prompts matter, the project share-out, the Level 8 interview) has **no tab** in the Field Log: the requirement stays on the "My requirements" list and the counselor signs it off in class. A section keeps its tab only if a Scout writes in it or uses a tool or game there. The tabs are: Level 2 (AI or Not?, AI timeline, Unlock), Level 3 (Class Race, 3e Timeline, Unlock), Level 4 (What Would You Do?, Scout Law meets AI, Unlock), Level 5 (Spot the Fake, Unlock), Level 6 (Hallucination Hunt, Human Neural Network, Prompt Duel, 6d Your prompts, Unlock), Level 7 (7a Plan it, Build it, Unlock) and Level 8 (Shut it down). Answers saved earlier stay in the Scout's data and backup (no keys were removed), they just are not shown or counted. Game inputs (What Would You Do reasons, Prompt Duel, Class Race) are unchanged.

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


## Run the class (Cybersecurity, instructor-led)

`/cybersecurity/scoreboard/run.html` (counselor or scorekeeper role, linked from the Cybersecurity instructor tools) lets the instructor lead every Scout's Warden Log from one screen. It writes one small record (`cyberflow` partition in the `cup` table, no new Azure setup) through `POST /api/cyberflow/control`; Warden Logs poll `GET /api/cyberflow` every 3 seconds.

- **Move to a page**: pick any Warden Log page (or Previous / Next, or the arrow keys). Every Scout's screen goes to it, the tabs and Next buttons are locked, and a "Your instructor is leading the class" bar shows. Locks from unfinished worksheets are ignored while the instructor leads.
- **Hold screens**: a themed "Eyes up front" holding page covers the whole Warden Log, with an optional custom message (up to 200 characters, shown as plain text; quick-message buttons included). Typed work is never touched.
- **Show the scoreboard**: the live scoreboard covers every Warden Log.
- **Let Scouts roam freely**: back to the normal behaviour; each Scout returns to the tab they were on.

Holding keeps the page the instructor was on, so choosing it again resumes. Run `node api/test-cyberflow.js` for the library tests. Only the Warden Log follows the instructor; the A.I.R.A. Field Log does not yet.

## Warden Log (Cybersecurity worksheets)

`/tools/warden-log.html` is the online version of the 6-page per-Warden print pack (the PDF stays as the paper backup). A Warden enters a name and picks a lodge (names come from `GET /api/scores/cybersecurity`), then works through five sections. Only two ask for writing, because the official requirements only ask for that: the career worksheet (req 9a, can be started at home) and My Attack Surface (4f, a list). Breach News Report (4e), Press the Seal (6c, with the Hash Lab) and Enchanted Objects (7) are discuss-or-demonstrate requirements, so those tabs have instructions and no text boxes; the counselor signs them off in class from the dashboard, and they never lock the next tab. The old Spot the Forgery and Class reflection sections were removed. Answers saved by earlier versions are kept (the API and counselor dashboard still read them). It autosaves to `localStorage` (`warden_log_v1`), backs up to the API keyed by a random private device id (the recovery code), can export/import `.json`, and has a print view. Text that looks like an email, phone number or password triggers a warning (never a block).

Counselor initials are never typed by the Warden. Staff sign each requirement off from the dashboard (`/cybersecurity/scoreboard/logs.html`, counselor/scorekeeper roles); the Warden sees "Waiting for counselor" until then. A blocked Warden can tap "Ask counselor to waive"; staff approve it from the dashboard.

API (`api/src/functions/wardenlog.js`, `api/src/lib/wardenlog.js`, tables `wardenlog` and `wardenlog-ovr`, separate from the Field Log):

| Route | Who | Purpose |
| --- | --- | --- |
| `POST /api/wardenlog` | anyone with the id | back up a log (150,000 character cap, strings clamped to 1,000, 80 logs per class) |
| `GET /api/wardenlog/restore?id=` | recovery code | get your own backup |
| `GET /api/wardenlog/status?id=` | recovery code | sign-offs and waivers |
| `POST /api/wardenlog/waive` | recovery code | ask staff to waive a requirement |
| `GET /api/wardenlog/logs`, `GET /api/wardenlog/log?id=` | staff | list and read logs |
| `POST /api/wardenlog/signoff`, `/grant`, `/delete`, `/reset` | staff | sign off or undo (`{id, req, signed}`), approve or revoke a waiver, delete one log, remove everything (`{confirm:"RESET"}`) |

The dashboard has a class grid (Wardens down, requirements across), a lodge filter, one-click and "sign every finished requirement" sign-off, a printable view and `.json` per Warden, a CSV of all sign-offs, and Reset all Warden Logs (two confirmations). Run `node api/test-wardenlog.js` for the library tests. Sign-offs and waivers live in their own rows, so a Warden's autosave can never create or erase one.

## Requirement tracking (both badges)

`assets/requirements.js` is the single list of requirements: the 24 Cybersecurity requirement codes (1a to 9, paraphrased from `counselor/files/cybersecurity/warden-sign-off-tracker.xlsx`; confirm official wording in Scoutbook) and the 8 A.I.R.A. level requirements. `api/test-wardenlog.js` checks the API's code list matches it.

- **Cybersecurity.** The Warden Log has a "My requirements" checklist. Requirements with a worksheet check themselves as **Ready for counselor** when the Warden finishes it (4e breach report, 4f attack surface, 6c Press the Seal, 7 Enchanted Objects, 9 career worksheet). The rest are class activities and are signed by the counselor. The dashboard grid has a column per requirement: a finished worksheet shows a dot, a class activity shows an open circle you can tap to sign, and a tick means signed (tap to undo). "Sign every finished requirement" only signs the auto-detected ones.
- **A.I.R.A.** A level requirement (1 to 8) is **Ready** when every required item on that level page is done, or the Scout has unlocked past it (including a waiver). The Field Log's Send & save page shows the checklist; `ai/scoreboard/logs.html` has Req 1 to 8 columns (tap to sign or undo) and a sign-off list on each Scout's detail. Sign-offs use `POST /api/fieldlog/signoff` (`{id, req: 1-8, signed}`, staff only) and are returned by `GET /api/fieldlog/override?id=` as `signed`.
- Sign-offs are stored in the staff-written override rows, so a Scout's autosave can never create or erase one. Auto-checking never marks anything signed: only a counselor's tap does.

### Warden Log: tabs, member ID and counselor editing

- The Warden Log shows one worksheet per tab (My requirements, then sections 1 to 7) with Back/Next buttons; the last tab is remembered and `#s-career` style links open the right tab. The header also has an optional Scouting America member ID (digits only, synced to the backup, shown on the dashboard and in the CSV) and a visible recovery code with a "Lost your progress? Recover it" box.
- **Counselor editing.** On the Warden dashboard, open a Warden and press **Edit this log** to fix the name, lodge, member ID and any written answer, then Save (`POST /api/wardenlog/edit`, staff only). The server recomputes the section summary with the same rules the Scout page uses (`assets/warden-rules.js`; the API keeps a copy in `api/src/lib/wardenrules.js` and `test-wardenlog.js` checks the two are identical). A Warden's device cannot overwrite an edit: saves that have not seen it get a 409, and the device pulls the counselor's version (it wins over anything typed in the last few seconds). Approving requirements is unchanged: the sign-off buttons in the same screen and the class grid.

## Live Cybersecurity games and the Warden Log tools

- **Tools on the worksheets they belong to.** In the Warden Log, tabs follow class order: *1. Paths of the Order*, *2. Attack Surface*, *3. Passphrase Forge*, *4. Two-Key Rite*, *5. Press the Seal* (Hash Lab); Breach News and Enchanted Objects have no tab. Forge and Rite are tool-only tabs (nothing to write or sign off). "Run the class" has a button for every tab, and `PAGES` in `api/src/lib/cyberflow.js`, the Warden Log `SPEC` and `run.html` must stay in the same order (a test checks it). Each opens inside the page (lazy loaded, with an "Open in a new tab" link). The last tab, *Scoreboard*, shows the standings.
- **Teams select themselves.** The Warden Log passes the Scout's lodge to the tools as `?lodge=N` (the slot on the Cybersecurity scoreboard), and `assets/embed.js` selects and locks the lodge picker in the Forge and Two-Key pages. Scouts who have not picked a lodge yet still choose in the tool.
- **Live games** (`/cybersecurity/scoreboard/games.html`, counselor or scorekeeper): start Passphrase Forge or Two-Key Rite and the public Cybersecurity scoreboard shows the game instead of the standings until you end it (like the A.I.R.A. What Would You Do? and Prompt Duel games). Every Warden Log shows a "Join the game" banner that opens the game full screen with the lodge already chosen.
  - Starting Forge opens a fresh round (the same as "Reset round": it clears only the Forge submissions). Ending it closes submissions, and "End game and award points" puts 1st +2 / 2nd +1 on the scoreboard (the existing `passphrase-forge-placing` row).
  - Starting Two-Key Rite clears nothing. Points still land on the scoreboard as each lodge finishes, and ending only closes the takeover.
  - Nothing that is already on the scoreboard (names, scores) is changed by starting a game.
  - API: `GET /api/cybergame` (public) and `POST /api/cybergame/control` (staff), state in table partition `cybergame`. Logic and tests: `api/src/lib/cybergame.js`, `api/test-cybergame.js`.
- The Forge and Two-Key pages now allow scripts from the same site (`script-src 'self'`) so they can load `embed.js`; they still cannot contact any other host.

## Instructor tools (one page per badge)

Each merit badge has its own instructor page, reached from that badge's page (`/cybersecurity/` or `/ai/`): `/cybersecurity/instructor.html` and `/ai/instructor.html`. A staff-only **Instructor tools** entry (`data-roles="counselor scorekeeper"`, revealed by `assets/app.js`) appears in the badge page's link list for signed-in counselors and scorekeepers; Scouts never see it. The pages are locked to those two roles in `staticwebapp.config.json` and are separate: Cybersecurity has Warden Logs, the live games (Passphrase Forge, Two-Key Rite and the projector display), the scorecard, the scoreboard and the class schedule; AI has Field Logs and the roster, What Would You Do?, Prompt Duel, the scorecard, the scoreboard and the class schedule. Each linked tool keeps its own role lock (scorekeeper pages need `scorekeeper`; the schedule and counselor files need `counselor`). The staff-only "Instructor tools" link on each public scoreboard and the Counselor page's links go to the matching badge page.

## Students, teams and password sign-in

Each badge has its own roster, managed at `/cybersecurity/scoreboard/students.html` and `/ai/scoreboard/students.html` (counselor or scorekeeper; linked from each badge's instructor page). **Teams** are the named slots on that badge's scoreboard (`lodges[i]`, up to 6, the number the games and scoreboards already support): creating, renaming or removing a team edits the scoreboard names, so the public scoreboard updates on its next poll, and removing a team (only when it has no students) clears that slot's points so a later team does not inherit them. **Students** are added many at a time (one name per line) to a team and each gets a 6-character password from an easy-to-read alphabet (no 0/o/1/l/i), unique within the badge. The page can print the passwords and download them as a CSV, move a student to another team, issue a new password, or remove a student.

API (`api/src/lib/roster.js`, `api/src/functions/roster.js`): staff `GET /api/roster/{cy|ai}` and `POST /api/roster/{cy|ai}/{team-add|team-rename|team-remove|add|update|remove}` (`/api/roster/*` is locked to counselor and scorekeeper); public `POST /api/login/{cy|ai}` with `{password}` returns `{id, name, slot, team}` (the id is the student's private log key, in the same format the Field Log and Warden Log already use). Wrong passwords are counted per minute for the badge and logins pause after 40, so the short password cannot be guessed by a script. Storage: `cup` table, partitions `students-cy|ai` and `logintries-cy|ai`; no new Azure setup.

Students can be added with no team and assigned from the dropdown in the students table (unassigned students are listed first and highlighted). Each student can also have an optional Scouting ID: type `Sam K, 1234567` when adding, or edit the Scout ID column.

**Sign-in.** `assets/studentlogin.js` shows a password prompt on `tools/aira-field-log.html` (AI) and `tools/warden-log.html` (Cybersecurity). `POST /api/login/{cy|ai}` takes `{password}` (or `{id}` to refresh a signed-in device) and returns `{id, name, slot, team, scoutId}`. The student's `id` is the key of their log, so the existing log, override, sign-off and game APIs keep working. The page fills name, team and Scouting ID from the roster (read-only) and the recovery-code UI is hidden; signing in on another device brings the saved log back.

**Server rules** (`api/src/lib/rosterfor.js` builds the roster for the log APIs): `fieldlog`/`wardenlog` save, restore and override/waiver requests and `airalog` submit only accept a student on the roster (403 otherwise) and take name and team from it. Instructor dashboards show the student's current name and team, and mark logs saved before the roster as **old log, read-only** (they can still be read, exported and signed off, but cannot be saved to). The A.I.R.A. team averages cover every student on the team with zeros included, and are recomputed whenever the roster changes. Tests: `api/test-roster.js`, `api/test-roster-logs.js`.

Not covered: the live-game APIs (hvboard, duel, etc.) still trust the id, name and team the page sends, as before. A scorekeeper can still rename a team on the scoreboard; students follow the new name.
