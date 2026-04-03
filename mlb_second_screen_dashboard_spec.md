# MLB Second-Screen Dashboard — Agent Implementation Spec

## 1. Purpose

Build a lightweight web application for a single selected MLB team that:

1. Shows the next upcoming game with a live countdown before first pitch.
2. Automatically switches into live game mode once the game starts.
3. Continuously updates live game state during the game.
4. Displays a scoreboard-style second-screen dashboard suitable for a monitor, tablet, or TV.
5. Shows jumbotron-style matchup context including current batter, current pitcher, score by inning, and recent game situation.

Primary design goal: **keep the stack simple**.

Preferred implementation approach:
- Plain HTML/CSS/JavaScript
- One Web Worker for polling and data shaping
- Browser storage for lightweight persistence
- No framework required for MVP
- No backend required unless MLB browser access is blocked by CORS or endpoint limitations

---

## 2. Scope

### In scope
- Single-team dashboard
- Pregame state
- Live game state
- Final/postgame state
- Countdown to next game
- Score by inning
- Current batter and pitcher cards
- Player photos when available
- Recent play text
- Auto refresh / polling
- Full-screen / second-screen friendly layout
- Local persistence of team selection and last known state

### Out of scope for MVP
- User accounts
- Multi-user sync
- Betting data
- Fantasy data
- Chat/social features
- Video streaming
- Play-by-play animation engine
- Historical analytics beyond current game context
- Push notifications
- Full league navigation

---

## 3. Product Summary

The app has three major runtime modes:

### A. Pregame mode
Shown when the selected team’s next game has not started.

Display:
- Team name/logo
- Opponent
- Home/away
- Venue
- Start time
- Countdown to first pitch
- Optional probable pitchers if available

### B. Live mode
Shown when the selected team has a game in progress.

Display:
- Away/home score
- Inning and top/bottom state
- Balls / strikes / outs
- Bases occupied indicator
- Inning-by-inning line score
- Current batter card
- Current pitcher card
- Recent play text / latest event summary
- Last updated timestamp

### C. Final mode
Shown after the game reaches final status.

Display:
- Final score
- Final inning status
- Simple summary state
- Transition back to next upcoming game after a configurable period or on next polling cycle

---

## 4. Technical Constraints

### Required constraints
- Must be able to run as a static browser app.
- Must avoid frameworks for MVP unless necessary.
- Must separate UI rendering from data polling logic.
- Must be resilient to partial/missing data.
- Must degrade gracefully when player photos or stats are unavailable.
- Must tolerate unofficial/unstable API structures by using a normalization layer.

### Important risk
Browser-only integration depends on whether MLB endpoints are accessible from the client environment. If CORS or request restrictions block direct browser access, add a very small proxy layer later without changing the frontend architecture.

---

## 5. Recommended File Structure

```txt
/mlb-dashboard
  index.html
  styles.css
  app.js
  mlb-worker.js
  /assets
    fallback-player.png
    team-logos/
```

Optional later:

```txt
  /lib
    storage.js
    renderers.js
    formatters.js
```

---

## 6. Architecture

### 6.1 High-level flow

```txt
Main UI thread
  -> initializes app
  -> reads saved config
  -> starts Web Worker
  -> receives normalized state objects
  -> renders UI

Web Worker
  -> polls MLB endpoints
  -> decides mode (pregame/live/final)
  -> normalizes raw payloads
  -> caches last known state
  -> sends compact state to UI
```

### 6.2 Why use a Web Worker
Use one worker to:
- keep polling logic off the main thread
- centralize refresh cadence decisions
- isolate raw API parsing from DOM code
- make future migration to a proxy/backend easier

### 6.3 Storage strategy
#### localStorage
Use for:
- selected team ID
- UI preferences
- last mode
- last rendered normalized state if small enough

#### IndexedDB
Optional for:
- larger cached payloads
- team metadata
- player metadata
- schedule cache
- headshot cache map

MVP can start with localStorage only.

---

## 7. Runtime Modes and Switching Rules

### Pregame mode rules
Enter pregame mode when:
- no in-progress game exists for the selected team
- next scheduled game exists in future

Refresh cadence:
- every 5 to 15 minutes normally
- every 60 seconds when within 60 minutes of first pitch

### Live mode rules
Enter live mode when game status is in-progress.

Refresh cadence:
- every 5 to 10 seconds

### Final mode rules
Enter final mode when game status is final/completed.

Refresh cadence:
- every 60 seconds for a short period
- then shift focus to next scheduled game

### Error mode
Do not create a separate visual mode unless needed.
Show a non-blocking status banner:
- “Live data temporarily unavailable”
- continue retrying with backoff

---

## 8. Data Requirements

The worker must convert external API responses into a single stable, frontend-friendly state object.

## 8.1 Normalized application state

```js
{
  mode: "pregame" | "live" | "final",
  team: {
    id: number,
    name: string,
    abbr: string,
    logoUrl?: string
  },
  nextGame: {
    gamePk?: number,
    opponent: string,
    opponentAbbr?: string,
    isHome: boolean,
    venue?: string,
    startTime: string,
    countdownTargetMs?: number,
    probablePitchers?: {
      team?: string,
      opponent?: string
    }
  } | null,
  live: {
    gamePk: number,
    status: string,
    away: {
      id?: number,
      name: string,
      abbr?: string,
      score: number
    },
    home: {
      id?: number,
      name: string,
      abbr?: string,
      score: number
    },
    inning: number,
    inningHalf: "Top" | "Bottom" | "Middle" | "End" | null,
    outs: number,
    balls: number,
    strikes: number,
    bases: {
      first: boolean,
      second: boolean,
      third: boolean
    },
    batter: {
      id?: number,
      name?: string,
      photo?: string,
      bats?: string,
      position?: string,
      todayLine?: string,
      seasonLine?: string
    } | null,
    pitcher: {
      id?: number,
      name?: string,
      photo?: string,
      throws?: string,
      pitchCount?: number,
      todayLine?: string,
      seasonLine?: string
    } | null,
    linescore: Array<{
      inning: number,
      away?: number,
      home?: number
    }>,
    recentPlay?: string,
    updatedAt: number
  } | null,
  final: {
    gamePk?: number,
    awayScore?: number,
    homeScore?: number,
    summary?: string
  } | null,
  meta: {
    sourceStatus?: string,
    lastSuccessfulUpdate?: number,
    lastError?: string | null
  }
}
```

### Normalization rule
The UI must never read raw MLB API response shapes directly. Only consume normalized state from the worker.

---

## 9. UI Requirements

## 9.1 General layout requirements
- Must work at desktop and large-tablet sizes first.
- Must look good on a landscape monitor/TV.
- Must prioritize readability at distance.
- Use dark theme by default.
- Use large typography for score, inning, countdown, and player names.

## 9.2 Pregame screen required sections
- Selected team header
- Next game card
- Opponent
- Start date/time
- Venue
- Countdown timer
- Optional probable pitchers row

## 9.3 Live screen required sections
### Top strip
- Away team / score
- Home team / score
- Inning state
- Balls / strikes / outs

### Mid section
- Current batter card
- Current pitcher card
- Player photos
- Key stat lines

### Bottom section
- Inning-by-inning scoreboard
- Recent play text
- Last updated timestamp

### Optional live enhancements
- Base occupancy diamond
- Team logos
- Win/loss records
- Handedness labels

## 9.4 Final screen required sections
- Final score
- Final status
- Next game teaser if available

---

## 10. Polling Rules

## 10.1 Polling ownership
All polling logic belongs in `mlb-worker.js`.

The main UI thread must not call MLB APIs directly except in debugging/development mode.

## 10.2 Polling intervals
Suggested defaults:
- Pregame: 300000 ms
- Near first pitch: 60000 ms
- Live: 5000 ms
- Final: 60000 ms
- Error retry: 30000 ms with simple retry logic

## 10.3 Countdown behavior
Countdown is computed locally in the UI once the target start timestamp is known.
Do not refetch every second.

Use `setInterval` in main thread for visible countdown updates.

---

## 11. Worker Responsibilities

`mlb-worker.js` must:

1. Receive initialization message with team ID.
2. Start polling loop.
3. Determine whether team is pregame/live/final.
4. Fetch the minimal endpoint set needed.
5. Normalize all data.
6. Cache last known good state.
7. Post state updates to UI.
8. Handle transient failures without crashing.

### Worker message contract
#### Main -> Worker
```js
{ type: "INIT", teamId: 141 }
{ type: "SET_TEAM", teamId: 147 }
{ type: "REFRESH_NOW" }
```

#### Worker -> Main
```js
{ type: "STATE", payload: normalizedState }
{ type: "ERROR", message: "..." }
{ type: "STATUS", message: "Polling live game" }
```

---

## 12. Main Thread Responsibilities

`app.js` must:

1. Load saved team selection from storage.
2. Start the worker.
3. Send initialization config.
4. Render screen based on normalized state.
5. Run local countdown timer.
6. Save last state if desired.
7. Offer a simple team picker control.

The main thread must not contain raw MLB parsing logic.

---

## 13. Storage Requirements

## 13.1 Required keys
Suggested localStorage keys:
- `mlb.teamId`
- `mlb.lastState`
- `mlb.theme`

## 13.2 Rules
- Only store normalized state, not full raw API responses, unless debugging.
- On app load, render last known state immediately if available.
- Replace stale live state once fresh data arrives.

## 13.3 Offline behavior
If network fails:
- continue showing last known state
- indicate stale status visually
- keep retrying in worker

---

## 14. Player Photos

### Requirements
- Show current batter and pitcher photos when available.
- Fallback to default silhouette image if photo URL fails.
- Do not repeatedly rebuild photo URLs every refresh if IDs have not changed.

### Rules
- Headshot rendering must not block the rest of the update.
- Missing photo must not break layout.

---

## 15. Error Handling

The app must gracefully handle:
- no scheduled game found
- postponed game
- doubleheader edge cases
- extra innings
- missing batter/pitcher details
- missing linescore entries
- API timeout
- partial response data

### Minimum behavior
- Keep the UI alive
- Show stale-but-usable data if available
- Retry automatically
- Avoid blank screen whenever possible

---

## 16. Edge Cases

Agent must account for:

1. **No game today**
   - show next scheduled game

2. **Game delayed / postponed**
   - display status text if available

3. **Doubleheader**
   - pick the correct upcoming or live game
   - if one is final and another upcoming, prefer current live/upcoming relevance

4. **Game just ended**
   - stay in final mode briefly, then move to next scheduled game

5. **Pitching or batting change mid-inning**
   - live state must update without full page reload

6. **Missing player photo/stat**
   - show fallback visuals/text

7. **Extra innings**
   - linescore UI must allow more than 9 innings

---

## 17. CSS / Presentation Guidance

### Design goals
- readable from distance
- high contrast
- low clutter
- jumbotron-inspired but not visually noisy

### Typography priorities
Largest text:
- score
- countdown
- player names
- inning state

Secondary text:
- stat lines
- recent play
- venue
- timestamps

### Layout priorities
- score always visible
- inning/outs/count always visible
- current matchup always visible in live mode
- responsive without requiring framework

---

## 18. Suggested Implementation Order

## Phase 1 — static shell
- create `index.html`
- create high-level sections for pregame/live/final
- basic styling
- fake sample state rendering

## Phase 2 — worker and state loop
- add `mlb-worker.js`
- message contract
- polling loop
- mode switching

## Phase 3 — schedule / next game
- fetch next game
- countdown target
- pregame render

## Phase 4 — live state
- fetch live game data
- render score, inning, outs, count
- render linescore

## Phase 5 — matchup cards
- render batter/pitcher cards
- add photos
- add stat fields

## Phase 6 — resilience and polish
- storage cache
- stale-state handling
- fallback images
- final mode
- full-screen refinements

---

## 19. Acceptance Criteria

### Functional acceptance
- User can select a favorite MLB team.
- App persists selected team across refreshes.
- App shows next game and countdown when no live game exists.
- App automatically switches to live mode when game starts.
- App updates live game data without page reload.
- App shows inning-by-inning score.
- App shows current batter and pitcher when available.
- App displays player photos when available, otherwise fallback image.
- App handles final state and returns to next game flow.
- App remains usable during temporary network/API failure.

### Technical acceptance
- Polling runs in Web Worker.
- UI renders from normalized state only.
- Main thread does not contain raw API parsing.
- Local persistence works.
- No framework is required for MVP.

### UX acceptance
- Layout is readable from several feet away.
- Score/inning/count are immediately understandable.
- Countdown updates every second locally.
- Live updates do not visibly freeze the UI.

---

## 20. Non-Goals / Avoid These Mistakes

Do not:
- tightly couple UI to raw external API response structure
- poll from multiple places
- re-fetch on every visible countdown tick
- depend on player photo presence
- build framework-heavy architecture for MVP
- overcomplicate storage early
- mix rendering and polling logic in one file

---

## 21. Optional Future Extensions

After MVP, possible enhancements:
- multiple team presets
- standings panel
- probable pitchers panel
- weather panel
- team roster sidebar
- recent plays list
- pitch-by-pitch panel
- audio cues
- TV/kiosk auto-fullscreen mode
- tiny proxy layer for stability/CORS
- PWA installability

---

## 22. Agent Deliverables

The coding agent should produce:

1. `index.html`
2. `styles.css`
3. `app.js`
4. `mlb-worker.js`
5. brief README with run instructions
6. mock/fallback data support for local UI testing

### Deliverable quality bar
- code should be simple and readable
- functions should be small and named clearly
- normalization logic should be isolated
- DOM updates should be efficient
- error states should be visible but non-destructive

---

## 23. Preferred Engineering Principles

- Keep the MVP browser-first.
- Keep implementation modular without overengineering.
- Optimize for reliability and readability over cleverness.
- Build for a single-team dashboard first.
- Use a normalization layer as the core abstraction.
- Be ready to add a tiny proxy later without rewriting the UI.

---

## 24. Final Instruction to Agent

Build the MVP as a static browser application using plain JavaScript plus one Web Worker. Keep the UX focused on a single selected MLB team and support three runtime states: pregame, live, and final. Use browser storage for persistence, normalize all remote data into one stable state object, and optimize the layout for a second-screen sports dashboard experience.

