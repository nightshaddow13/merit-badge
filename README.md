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
| `counselor/` | Print packs, answer keys, trackers, class audio (`noindex`) |
| `tools/` | Interactive tools: A.I.R.A. Field Log, Hash Lab, Two-Key Rite display |
| `files/`, `audio/` | PDFs, spreadsheets and class audio |
| `staticwebapp.config.json` | Azure routing and headers |
| `staticwebapp.config.protected.json` | Optional: sign-in required for counselor content (see the file's `_comment`) |

## Heads-up

The counselor page and its files include answer keys. They are hidden from search engines but are **not secret**; anyone with the link can open them. To require sign-in, use the protected config.

The A.I.R.A. Field Log loads jsPDF from cdnjs and the Google Fonts stylesheet loads from Google, so Scouts need internet access to use them fully.

## Live scoreboard (Cup of the Silver Padlock)

- `/scoreboard/` is the public leaderboard. It refreshes every 10 seconds.
- `/scoreboard/edit.html` is the scorekeeper page. It requires sign-in and the `scorekeeper` role.
- `api/` is an Azure Functions API (managed by Static Web Apps) that stores scores in Azure Table Storage.
- Until storage is connected, the public page shows the snapshot in `data/scoreboard.json`.

One-time setup:

1. **Storage account.** Azure portal > Create a resource > Storage account (Standard, locally redundant is fine). Open it > Security + networking > Access keys > copy a **Connection string**.
2. **App setting.** Open the Static Web App > Settings > Environment variables > add `STORAGE_CONNECTION_STRING` with that value (Production). Save.
3. **Scorekeeper role.** Static Web App > Settings > Role management > Invite. Pick GitHub, enter the person's GitHub username, set the role to `scorekeeper`, and send the link. They open the link once to accept.
4. Open `/scoreboard/edit.html`, name the lodges, enter points and press **Save scores**.

Test the API logic locally with `cd api && node test.js`.
