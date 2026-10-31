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
| `scorekeeper` | See the Edit scores button, open the scorekeeper pages and save scores |

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
