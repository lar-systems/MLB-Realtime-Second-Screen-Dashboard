# AGENTS.md

## Project
MLB Second-Screen Dashboard

## Goal
Build a static browser-first MLB dashboard for a single selected team using:
- plain HTML
- plain CSS
- plain JavaScript
- one Web Worker for polling and normalization
- browser storage for persistence

The dashboard must support three runtime modes:
- `pregame`
- `live`
- `final`

## Source of Truth
- Primary product spec: `mlb_second_screen_dashboard_spec.md`
- Execution tracker: `PROJECT.md`

## Working Rules
- Keep the MVP simple and browser-first.
- Avoid frameworks unless direct browser access to MLB data proves unworkable.
- Keep all MLB polling and raw response parsing inside `mlb-worker.js`.
- Keep all UI rendering in `app.js`.
- The UI must only consume normalized state objects.
- Prefer readable code over clever abstractions.
- Build for one selected team first.
- Persist only lightweight normalized state in `localStorage`.

## Expected Deliverables
1. `index.html`
2. `styles.css`
3. `app.js`
4. `mlb-worker.js`
5. `README.md`
6. fallback/mock data support for local testing

## Normalized State Contract
The app should center around one stable state object with these top-level keys:
- `mode`
- `team`
- `nextGame`
- `live`
- `final`
- `meta`

No rendering code should depend on raw MLB API payload shapes.

## Build Priorities
1. Static shell and mock rendering
2. Main-thread controller and worker contract
3. Pregame schedule integration
4. Live game integration
5. Matchup cards and photos
6. Final mode
7. Persistence and resilience
8. QA and polish

## Non-Goals for MVP
- No framework-heavy architecture
- No backend unless required by CORS or API restrictions
- No league-wide navigation
- No user accounts
- No betting/fantasy/social features
- No video or animation engine

## Risks to Watch
- MLB endpoint browser access may be blocked or unstable.
- Live feed fields may be missing or inconsistent.
- Doubleheaders, delayed games, and extra innings need graceful handling.
- Player photos and stat lines may be unavailable.

## Collaboration Notes
- Update `PROJECT.md` as phases begin and complete.
- Record major assumptions in `PROJECT.md`.
- If browser-only MLB access fails, preserve the frontend architecture and note the need for a tiny proxy layer rather than rewriting the UI.
