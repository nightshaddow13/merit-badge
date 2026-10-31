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
| `tools/` | Interactive tools: A.I.R.A. Field Log, Hash Lab, Two-Key Rite display |
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

**Setup, one time:** in Azure, open the Static Web App, then Environment variables, and add `TWOKEY_SECRETS` = the seven practice secrets from `counselor/tools/two-key-rite-display.html`, comma separated, in lodge order (Lodge 1 first; the spare is the 7th). Until it is set the page says the check is not set up.

The code display (`/counselor/tools/two-key-rite-display.html`) opens for either the `counselor` or the `scorekeeper` role. The secrets are practice-only but sit in that file, so keep the repo private (the kids could otherwise read them on GitHub and generate codes). Tests: `node api/test-twokey.js`.
