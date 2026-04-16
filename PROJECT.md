# PROJECT.md

## Project
MLB Second-Screen Dashboard

## Current Status
Phase 0 and Phase 1 are complete. Phase 2 is mostly in place, Phase 3/4 have begun with a real MLB worker fetch path, and Phase 9 polish now includes bottom-screen utility controls plus accessible local team theming.

## Objective
Build a lightweight second-screen MLB dashboard for a single selected team as a static web app with three modes:
- `pregame`
- `live`
- `final`

## MVP Architecture
- `index.html`: app shell and semantic layout
- `styles.css`: second-screen presentation and responsive styling
- `app.js`: UI controller, rendering, countdown, storage, worker wiring
- `mlb-worker.js`: polling loop, mode detection, fetch helpers, normalization
- `README.md`: setup and run instructions

## Phase Plan

### Phase 0 - Project Setup
Status: completed

Subtasks:
- create base project files
- create `assets/` structure
- define shared constants and storage keys
- document local run approach

Progress:
- created `index.html`
- created `styles.css`
- created `app.js`
- created `mlb-worker.js`
- created `README.md`
- created `assets/`
- created `assets/team-logos/`
- added storage keys and mock-mode assumptions
- documented local run instructions

### Phase 1 - UI Shell and Mock Rendering
Status: completed

Subtasks:
- create main HTML layout
- build dark second-screen CSS shell
- add sample normalized states
- render pregame, live, and final from mock data
- add visible status banner and countdown area

Progress:
- built the main dashboard shell
- added mock normalized states for all three modes
- added mode-based rendering in `app.js`
- added pregame countdown rendering
- added a visible status/error banner
- added team selection UI and mock mode cycling

### Phase 2 - App Controller and State Contract
Status: in progress

Subtasks:
- implement normalized state helpers
- load saved team and last state
- render cached state on startup
- start worker and wire message handlers
- add local countdown interval
- add team picker UI

Progress:
- app loads cached state on startup when available
- app starts the worker and handles `STATE`, `STATUS`, and `ERROR`
- selected team persists in `localStorage`
- last rendered state persists in `localStorage`
- countdown updates locally instead of refetching every second
- team changes now route through the worker instead of local mock rendering

### Phase 3 - Worker Foundation
Status: in progress

Subtasks:
- implement worker message contract
- add polling scheduler
- support refresh cadence by mode
- add retry/backoff handling
- cache last known good state in worker memory

Progress:
- implemented `INIT`, `SET_TEAM`, `REFRESH_NOW`, and `CYCLE_MOCK_MODE`
- added poll scheduling by mode
- added retry handling and stale-state fallback
- worker caches last known good state in memory

### Phase 4 - Pregame Data Integration
Status: in progress

Subtasks:
- identify usable MLB schedule endpoint(s)
- add fetch wrapper and error handling
- select the most relevant game for the chosen team
- normalize pregame data
- support no-game and doubleheader cases

Progress:
- wired the worker to `https://statsapi.mlb.com/api/v1/schedule`
- wired live/final fetches to `https://statsapi.mlb.com/api/v1/game/{gamePk}/feed/live`
- added schedule selection for live, upcoming, and recent final relevance
- added first-pass pregame, live, and final normalization helpers
- added no-game fallback state

### Phase 5 - Live Game Integration
Status: pending

Subtasks:
- identify live game feed endpoint(s)
- normalize score, inning, count, outs, and bases
- normalize inning-by-inning linescore
- normalize latest play text
- render live scoreboard from normalized state

### Phase 6 - Matchup Cards
Status: pending

Subtasks:
- normalize current batter data
- normalize current pitcher data
- add photo URL and fallback handling
- render player cards and key stat lines

### Phase 7 - Final Mode
Status: pending

Subtasks:
- normalize final game state
- render final score and status
- shift back to next upcoming game on later polling cycles

### Phase 8 - Persistence and Resilience
Status: pending

Subtasks:
- persist `mlb.teamId`
- persist `mlb.lastState`
- keep stale state visible during failures
- show non-blocking error/status messaging
- harden rendering against partial data

### Phase 9 - QA and Polish
Status: in progress

Subtasks:
- verify monitor/tablet readability
- test team switching
- test refresh persistence
- test countdown behavior
- test partial/missing data paths
- verify no duplicate polling sources

Progress:
- moved debug visibility and test-state controls into a bottom utility row
- added a persisted debug show/hide toggle
- added local MLB team theme palettes with contrast-safe accent derivation
- verified theme switching and debug toggle behavior in browser automation

### Phase 10 - Documentation
Status: pending

Subtasks:
- write README usage instructions
- document mock mode
- document architecture and future proxy option

## Immediate Next Step
Move deeper into Phase 2 and start Phase 3:
- verify the live endpoint shapes in-browser
- refine normalization for player stats, venue context, and edge-case statuses
- expand team selection beyond the current starter list

## Key Constraints
- No framework for MVP
- No backend unless browser access is blocked
- Worker owns polling and raw parsing
- Main thread owns rendering and countdown
- UI only reads normalized state

## Edge Cases To Preserve
- no game today
- delayed or postponed game
- doubleheaders
- extra innings
- game just ended
- missing player photo
- missing batter or pitcher data
- missing linescore entries
- temporary network failure

## Assumptions
- We are starting from an empty repo plus the product spec.
- We will optimize for a local static-browser MVP first.
- If MLB data access from the browser fails, we will note it and keep the frontend architecture intact for a later tiny proxy.

## Change Log

### 2026-04-15
- moved debug utilities below the dashboard and added a persisted debug toggle
- added local team-based theming because MLB Stats API does not expose team colors
- added contrast checks so accent colors stay readable on the dark shell

### 2026-04-01
- read and summarized the root product spec
- converted the spec into a milestone-based build plan
- created `AGENTS.md` and `PROJECT.md` to persist project intent and execution tracking
- scaffolded the static app files and README
- built the first mock-rendered dashboard shell
- added a worker stub with `INIT`, `SET_TEAM`, and `REFRESH_NOW` handling
- replaced the worker stub with a real MLB schedule/feed fetch path plus normalization helpers
- added automatic mock fallback when live MLB fetches fail
