# MLB Realtime Second-Screen Dashboard

An MLB "realtime" game tracker built as a second-screen experience for following your favorite team during live games.

The goal is to feel closer to the jumbotron-style displays you see in ballparks than to a traditional stats page: big state changes, strong visual hierarchy, live inning context, player cards, out-of-town scores, and celebration overlays that react to important moments.

Live demo: https://mlb.lar.systems/

## What It Does

- Tracks one selected MLB team at a time.
- Switches between `pregame`, `live`, and `final` layouts.
- Polls MLB data in a Web Worker and normalizes it before the UI renders anything.
- Shows probable starters, live batter/pitcher cards, inning state, bases, linescore, recent play text, and a league scoreboard strip.
- Falls back to recent league final scores when there are no other live games elsewhere.
- Includes mock modes and debug controls so you can work on the interface without waiting for a real game state.

## Why The Architecture Looks This Way

This project stays intentionally simple:

- `index.html` provides the static shell.
- `styles.css` owns the visual system.
- `app.js` owns rendering, timers, persistence, and UI-only behavior.
- `mlb-worker.js` owns MLB polling, fallback logic, and normalization.

The important design rule is that the UI only reads normalized state. Raw MLB payload interpretation stays in the worker so the presentation layer is easier to tweak.

## Core Modes

### Pregame

- Shows the next scheduled matchup.
- Uses team records in the hero score slots.
- Highlights probable starters.
- Surfaces the previous completed game and the next few scheduled games.

### Live

- Shows the current score, inning, balls, strikes, outs, and basepaths.
- Highlights the active batter and pitcher.
- Includes a live linescore and recent play text.
- Surfaces out-of-town active games in a full-width scoreboard row.

### Final

- Shows the completed result and pivots toward the next scheduled game.
- Triggers a selected-team `WIN THE GAME` celebration when your team closes it out.

## Local Setup

### Requirements

- A modern desktop browser
- A local static server
- Node.js only if you want to run the optional smoke scripts

### Run The Dashboard

Serve the project from a local web server. Example:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Do not run the app from `file:///`. Web Workers and some browser features will not behave reliably there.

## Controls In The UI

- Team dropdown: switches the tracked club.
- `Cycle Test States`: rotates through mock `pregame`, `live`, and `final` states.
- `Cycle Action Events`: previews overlay moments without waiting for a live feed event.
- `Show Debug` / `Hide Debug`: reveals the normalized state and worker status panel.

## Smoke Checks

These scripts are optional, but they are useful when you are changing layout or data flow.

```powershell
npm --prefix tools install
npm --prefix tools run check
npm --prefix tools run smoke:pregame
npm --prefix tools run smoke:live
npm --prefix tools run smoke:final
```

Notes:

- `tools/smoke-live.cjs` expects a local browser install and a running local site.
- `tools/smoke-test.ps1` is a lighter DOM-based sanity check for `http://localhost/`.

## Cloudflare Pages

The repo root is intentionally kept as a static site so Cloudflare Pages can publish it directly from GitHub without a build step.

Recommended Pages settings:

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`

The dev-only smoke tooling lives under `tools/`, and `.assetsignore` keeps that folder out of the published asset bundle.

If you want Cloudflare Pages to ignore tooling-only commits, use Build watch paths like this:

- Include paths: `*`
- Exclude paths: `tools/*`
- Exclude paths: `README.md`
- Exclude paths: `.gitignore`
- Exclude paths: `.assetsignore`

That setup keeps normal app changes deploying, while README or local-tooling updates do not trigger a new Pages build.

## Project Structure

- `index.html`
  Static DOM shell and overlay markup.

- `styles.css`
  Dashboard layout, theme variables, celebration styling, cards, and responsive behavior.

- `app.js`
  Main-thread controller for rendering, timers, image handling, and local storage.

- `mlb-worker.js`
  Worker-side MLB polling, fallbacks, event classification, and normalized-state generation.

- `tools/`
  Local-only smoke tests and helper scripts. These are not needed for the live site.

## Tinkering Guide

If you want to change:

- Data sourcing, mode selection, play parsing, or fallback rules:
  edit `mlb-worker.js`

- Layout, text presentation, timing, celebration display, or theming:
  edit `app.js` and `styles.css`

- DOM structure or element IDs:
  edit `index.html` and keep `app.js` selectors in sync

The codebase already carries comments around the areas that are easiest to break while experimenting, especially the worker normalization path, portrait handling, linescore rendering, and celebration system.

## Limitations

- This is a browser-first project, so it depends on MLB endpoints remaining accessible from the client.
- Some MLB feeds are inconsistent or temporarily incomplete, which is why the worker has layered live-data fallbacks.
- Player portraits and some live stat fields are not guaranteed for every game state.

## Disclaimer

This project is an independent fan-made tracker and is not affiliated with or endorsed by Major League Baseball. MLB team names, marks, and data belong to their respective owners.
