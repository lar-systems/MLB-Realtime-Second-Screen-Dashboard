# MLB Second-Screen Dashboard

Static browser-first MLB dashboard for a single selected MLB team.

This project is intentionally split into two clear halves:

- `mlb-worker.js` decides what the baseball state means.
- `app.js` decides how that state should look on screen.

That separation is the most important idea in this repo. If a future edit needs
raw MLB payload changes, it should usually happen in the worker. If it needs a
layout, wording, or visual treatment change, it should usually happen in the
main-thread app.

## What The App Does

The dashboard always renders one normalized state object in one of three modes:

- `pregame`
- `live`
- `final`

Those modes intentionally share the same broad shell:

- left team area
- center game-state area
- right team area
- lower details row

That lets the screen feel stable while the content changes.

## File Guide

- `index.html`
  Static shell and DOM targets. Most IDs are stable on purpose because
  `app.js` renders directly into them.

- `styles.css`
  Visual system, spacing, card treatments, watermark handling, and responsive
  behavior.

- `app.js`
  Main-thread controller. It owns:
  - startup
  - worker wiring
  - rendering
  - countdown / elapsed timers
  - local storage
  - player image presentation
  - debug output

- `mlb-worker.js`
  Worker-side data controller. It owns:
  - MLB polling
  - game selection
  - mode classification
  - normalization
  - fallback logic
  - mock mode

- `smoke-live.cjs`
  Localhost smoke test that opens the dashboard in headless Chrome, selects a
  team, cycles to a target mode, prints a small JSON summary, and saves a
  screenshot.

- `AGENTS.md`
  Project guardrails and implementation notes for the coding agent.

- `PROJECT.md`
  Ongoing project tracker and memory file.

## Run Locally

Use any static server. Example:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Do not run this app from `file:///`. Web Workers and some browser features are
not reliable there.

## Runtime Architecture

The app follows this flow:

1. `app.js` restores the selected team and the last rendered state.
2. `app.js` starts `mlb-worker.js`.
3. The worker polls MLB endpoints.
4. The worker returns one normalized state object.
5. `app.js` renders that state into the shared layout.
6. The main thread keeps lightweight display timers ticking between worker
   updates.

The worker should be the only place that interprets raw MLB payloads. That
keeps the presentation layer easier to edit and review.

## Normalized State Contract

The state shape evolves, but the high-level contract looks like this:

```js
{
  mode: "pregame" | "live" | "final",
  team: { id, name, abbr, logoUrl },
  nextGame: { ... } | null,
  activeGames: [ ... ],
  upcomingSchedule: [ ... ],
  previousGame: { ... } | null,
  live: { ... } | null,
  final: { ... } | null,
  meta: {
    sourceStatus,
    lastSuccessfulUpdate,
    lastError
  }
}
```

### Pregame

Pregame uses the shared shell but changes the meaning of a few regions:

- big numbers become team records, not scores
- side cards become probable starters
- center area becomes countdown or status messaging
- linescore panel shows the previous completed game
- notes panel becomes the upcoming schedule strip

### Live

Live focuses on immediate state:

- current scores
- inning / balls / strikes / outs
- bases indicator
- current batter and pitcher
- inning-by-inning linescore
- latest play text
- full-width out-of-town active-games strip with click-to-switch home-team dashboards

### Final

Final is a transition state:

- if the next game is known, it leans back toward pregame
- if not, it remains a simpler completed-game view

## MLB API Strategy

The worker uses layered fallbacks because MLB data is not perfectly consistent
for every `gamePk`.

Preferred path:

- `schedule` for discovery
- `feed/live` for full game state

Fallback path when `feed/live` is missing:

- `boxscore`
- `linescore`
- `playByPlay`

Last resort:

- schedule-only fallback

That is why `mlb-worker.js` includes both full-live and partial-live
normalization paths.

## Mock Mode

Mock mode exists so layout work is not blocked by MLB endpoint behavior.

- The worker can emit mock `pregame`, `live`, and `final` states.
- `Cycle Test States` rotates through those states.
- `Cycle Action Events` steps through the in-game overlay treatments without waiting for a live feed event.
- The mock states intentionally mirror the real normalized contract.
- Mock live state also carries sample active-game scoreboard cards for layout testing.

If you change the normalized shape, update both:

- the real normalization path
- the mock state builder

## Smoke Testing

The main smoke test script is:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\smoke-live.cjs live .smoke\live-state.png 141
```

Arguments:

1. target mode: `pregame`, `live`, or `final`
2. screenshot output path
3. team id

Examples:

```powershell
& 'C:\Program Files\nodejs\node.exe' .\smoke-live.cjs pregame .smoke\pregame-state.png 141
& 'C:\Program Files\nodejs\node.exe' .\smoke-live.cjs live .smoke\live-state.png 141
& 'C:\Program Files\nodejs\node.exe' .\smoke-live.cjs final .smoke\final-state.png 141
```

The smoke script is meant to catch:

- app not booting
- wrong mode on screen
- hidden/visible section regressions
- obvious image or layout regressions

It is intentionally small, fast, and easy to tweak.

## Editing Guide

### If you want to change data sourcing or game logic

Edit:

- `mlb-worker.js`

Examples:

- different delayed/postponed behavior
- alternate schedule selection rules
- richer player normalization
- different fallback priorities

### If you want to change layout or wording

Edit:

- `app.js`
- `styles.css`
- sometimes `index.html`

Examples:

- move scores, records, or logos
- change countdown wording
- change player card composition
- restyle the lower row

### If you want to change markup targets

Edit:

- `index.html`
- `app.js`

Keep the element IDs in sync. `app.js` does most of its DOM lookups once at
startup, so markup drift is one of the easiest ways to break the UI.

## Important Implementation Notes

### `init()` stays at the end of `app.js`

This is important. The file now has enough top-level helpers and constants that
startup rendering can hit a helper before later `const` declarations exist.
Calling `init()` at the bottom avoids temporal-dead-zone bugs during boot.

### Watermark logos are CSS-driven

The background team logos are not separate DOM images. `app.js` passes:

- logo URL
- watermark position
- watermark opacity

through CSS custom properties on each team side.

If a logo needs tuning, check:

- `setSideWatermark()`
- `WATERMARK_PROFILES`
- the watermark rules in `styles.css`

### Team themes are local and contrast-checked

The MLB Stats API does not expose team color palettes, so `app.js` keeps a
local `TEAM_THEMES` map keyed by team ID and derives the runtime CSS variables
from that source.

The theme system intentionally keeps body text on a stable light-on-dark shell
and only applies team colors to accents, borders, panel tinting, and background
glows. Accent colors are lightened when needed to keep contrast readable
against the dashboard surface.

### Player portraits use `silo -> verify -> standard fallback`

MLB exposes a public headshot CDN pattern, but transparent/cutout delivery is
not formally documented. The safe production behavior in `app.js` is:

1. build the standard headshot URL and the transparency-oriented `silo` URL
2. try `silo` first
3. verify actual alpha on the returned image edge pixels
4. if alpha is not clearly present, fall back to the standard headshot
5. for opaque portraits, sample the portrait matte and use that color as the
   portrait-column background so taller cards do not reveal the dark shell

That means the UI never assumes transparency exists. Portrait cards must still
look correct with an opaque MLB headshot.

If portrait rendering breaks, inspect:

- `setImage()`
- `loadProcessedPortrait()`
- `resolveBestHeadshot()`
- `testTransparentCandidate()`

### Linescore is table-based on purpose

The linescore always pads to innings `1-9`, then expands for extra innings.
That keeps the lower layout stable while still supporting longer games.

## Recommended Review Workflow

When reviewing or extending the app:

1. Read this README.
2. Check `index.html` for the shell and element IDs.
3. Check `mlb-worker.js` for how the state is produced.
4. Check `app.js` for how that state is rendered.
5. Run a smoke screenshot for the state you changed.

That path is much faster than reverse-engineering behavior from CSS alone.
