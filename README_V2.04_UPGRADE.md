# GNOMEKEEP v2.04 — Distinct Team Spawns + Secret Portal Test

Another Chatty Resource · Copyright 2026 D Burrin

## New behaviour

1. **2–4 players start at different reachable maze locations.** The host begins at the maze entrance and each teammate is placed at a different, well-separated, walkable tile. The team is respaced whenever the next wave generates a new maze. The enemy placement process uses the separated positions to avoid spawning enemies immediately beside teammates.
2. **Hidden portal test shortcut:** During a multiplayer match, the **room host** presses **Alt + Shift + P**. If the Render environment variable `ENABLE_PORTAL_TEST=true` is set, the current level's enemies disappear and a Golden Portal appears within a short walking distance of the host. Walk **onto** the portal to test the shared victory screen, then select Claim Victory or Endless Mode.
3. **Test games are unranked.** Once the shortcut is used, a TEST RUN banner appears beneath the map and the match is **never submitted to PHP/MySQL**, including if the host chooses Claim Victory or continues Endless Mode. Players' existing leaderboard records are unaffected.
4. The shortcut is undocumented in the in-game Help and inactive by default.

## Step 1 — Update GitHub / Render

Extract `GNOMEKEEP_v2.04_SERVER_GITHUB.zip` and upload its files and folders to the **root** of `https://github.com/damianburrin/gnomekeep` on branch `main` (not a `multiplayer-server` subfolder). Commit the changed `engine.js`, `server.js`, `package.json` and tests. Your current Render service `srv-dbf2amjrjlhs739ahvq0` continues to use:

| Setting | Value |
|---|---|
| Repository | `damianburrin/gnomekeep` |
| Branch | `main` |
| Root Directory | *(empty)* |
| Build command | `npm install` |
| Start command | `node server.js` |
| Health check path | `/health` |

Keep `NODE_ENV`, `ALLOWED_ORIGINS`, `LEADERBOARD_ENDPOINT`, and `SCORE_API_SECRET` unchanged. Do **not** upload any real secrets to GitHub.

Go to Render → service → **Environment** and temporarily set `ENABLE_PORTAL_TEST` to `true` when testing. Deploy the latest commit (or deploy the new environment configuration). After testing **delete `ENABLE_PORTAL_TEST` or set it to `false`**, then redeploy the environment change. The public WebSocket server rejects portal test requests by default.

Verify the server at `https://gnomekeep.onrender.com/health`: it should return JSON with `"ok": true` and `"version": "2.04"`.

## Step 2 — Update your PHP-hosted website

Extract `GNOMEKEEP_v2.04_WEBSITE_UPDATE.zip` and upload its website files to your document root for `https://gnomekeepmp.gohomework.uk/` (the folder currently containing `index.html` and `online.html`). This also includes `online-v2.04.html` as a cache-busting test URL.

Preserve existing `api/config.php`, `.htaccess`, PHP files, MySQL credentials, signing secrets and the database. **No SQL migration or PHP API changes are required** for v2.04.

Your online client is configured to connect to `wss://gnomekeep.onrender.com/ws` within the HTML itself; no extra graphics library is required.

## Step 3 — Test the feature

1. Open `https://gnomekeepmp.gohomework.uk/online-v2.04.html` in two separate browser windows or devices. Make a room and start a 2-player match.
2. Check that the players start at **different positions**. Their 3D camera views should be different and they can locate each other by exploring.
3. As the **host**, press **Alt + Shift + P** during active gameplay, with no quiz, menu, or text field in focus. The server must have `ENABLE_PORTAL_TEST=true`.
4. Look for **TEST RUN — SCORES DISABLED** under the map and a **Golden Portal** marked on the map. Walk into it.
5. The team should see the VICTORY screen. Test one run with **Claim Victory** and another with **Continue Endless Mode**. Neither test match should appear in MySQL leaderboards.
6. Change `ENABLE_PORTAL_TEST` back to `false` in Render and verify the normal Wave 10 King battle and Golden Portal still work.

### Troubleshooting

- *Portal testing disabled on server*: check the Render environment variable and redeploy.
- *Only the room host can test the portal*: use the browser that created the room (or the current host after host migration).
- *Nothing happens with the key combination*: game must be actively playing, with no modal open; press Alt + Shift + P together.
- *Test matches missing from leaderboard*: **expected**; this prevents artificially inflated scores.
- *Browser still shows 2.03*: upload `online-v2.04.html` and use the version-specific URL, or hard-refresh.
- *Online client says version 2.04 but the test is disabled*: Render may still be using the old Node.js code or its flag is off. Verify `/health` and deployment logs.

## Validation

- 15 Node.js tests pass, including 2-, 3- and 4-player spawn distribution across 30 new maps per team size; test portal activation, shared victory, host-only permissions and unranked result handling.
- Browser startup checked in Chromium; the release page has no uncaught JavaScript errors in the smoke test.
- Live GitHub / Render / PHP production deployment has **not** been modified or tested.
