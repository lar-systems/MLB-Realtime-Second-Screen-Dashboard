# MLB Second-Screen Dashboard

Static browser-first MLB dashboard MVP for a single selected team.

## Current State
This repo currently includes:
- a second-screen UI shell
- live worker fetches for MLB schedule and game feed endpoints
- normalized rendering for `pregame`, `live`, and `final`
- automatic mock fallback when live browser fetches fail
- local persistence for team selection and last rendered state

## Files
- `index.html` - app shell
- `styles.css` - dashboard styling
- `app.js` - rendering, countdown, storage, worker wiring
- `mlb-worker.js` - polling contract and mock worker state
- `AGENTS.md` - implementation guardrails
- `PROJECT.md` - project tracker

## Run Locally
Use any static server. Example:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

Using a local server is recommended because Web Workers generally do not run reliably from a plain `file:///` URL.

## Mock Mode
- The app starts by attempting live MLB data.
- If live browser fetches fail, the worker falls back to mock data automatically.
- Use the team picker to swap the selected team.
- Use `Cycle Mock Mode` to switch between pregame, live, and final manually.

## Next Steps
1. Verify live endpoint behavior in-browser and tighten normalization against real payloads.
2. Expand team selection beyond the current starter list.
3. Add resilient photo fallback assets.
4. Harden delayed/postponed/doubleheader handling.
5. Refine venue and status details in live mode.
