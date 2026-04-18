/*
 * Main-thread dashboard controller.
 *
 * The worker owns baseball data and normalization.
 * This file owns DOM updates, display timers, persistence, and the final
 * mapping from normalized state into the shared pregame/live/final layouts.
 */

const STORAGE_KEYS = {
  teamId: "mlb.teamId",
  lastState: "mlb.lastState",
  debugVisible: "mlb.debugVisible",
};

const TEAM_OPTIONS = [
  { id: 108, name: "Los Angeles Angels", abbr: "LAA" },
  { id: 109, name: "Arizona Diamondbacks", abbr: "AZ" },
  { id: 110, name: "Baltimore Orioles", abbr: "BAL" },
  { id: 111, name: "Boston Red Sox", abbr: "BOS" },
  { id: 112, name: "Chicago Cubs", abbr: "CHC" },
  { id: 113, name: "Cincinnati Reds", abbr: "CIN" },
  { id: 114, name: "Cleveland Guardians", abbr: "CLE" },
  { id: 115, name: "Colorado Rockies", abbr: "COL" },
  { id: 116, name: "Detroit Tigers", abbr: "DET" },
  { id: 117, name: "Houston Astros", abbr: "HOU" },
  { id: 118, name: "Kansas City Royals", abbr: "KC" },
  { id: 119, name: "Los Angeles Dodgers", abbr: "LAD" },
  { id: 120, name: "Washington Nationals", abbr: "WSH" },
  { id: 121, name: "New York Mets", abbr: "NYM" },
  { id: 133, name: "Oakland Athletics", abbr: "ATH" },
  { id: 134, name: "Pittsburgh Pirates", abbr: "PIT" },
  { id: 135, name: "San Diego Padres", abbr: "SD" },
  { id: 136, name: "Seattle Mariners", abbr: "SEA" },
  { id: 137, name: "San Francisco Giants", abbr: "SF" },
  { id: 138, name: "St. Louis Cardinals", abbr: "STL" },
  { id: 139, name: "Tampa Bay Rays", abbr: "TB" },
  { id: 140, name: "Texas Rangers", abbr: "TEX" },
  { id: 141, name: "Toronto Blue Jays", abbr: "TOR" },
  { id: 142, name: "Minnesota Twins", abbr: "MIN" },
  { id: 143, name: "Philadelphia Phillies", abbr: "PHI" },
  { id: 144, name: "Atlanta Braves", abbr: "ATL" },
  { id: 145, name: "Chicago White Sox", abbr: "CWS" },
  { id: 146, name: "Miami Marlins", abbr: "MIA" },
  { id: 147, name: "New York Yankees", abbr: "NYY" },
  { id: 158, name: "Milwaukee Brewers", abbr: "MIL" },
];

// MLB Stats API team payloads do not include brand colors, so keep a local,
// reviewable palette keyed by team ID and derive accessible UI tokens from it.
const DEFAULT_TEAM_THEME = {
  primary: "#134A8E",
  secondary: "#1D2D5C",
  accent: "#FFB703",
};

const TEAM_THEMES = new Map([
  [108, { primary: "#BA0021", secondary: "#003263", accent: "#C4CED4" }], // Angels
  [109, { primary: "#A71930", secondary: "#1D1D1D", accent: "#E3D4AD" }], // Diamondbacks
  [110, { primary: "#DF4601", secondary: "#000000", accent: "#FC4C02" }], // Orioles
  [111, { primary: "#BD3039", secondary: "#0C2340", accent: "#C7D1D9" }], // Red Sox
  [112, { primary: "#0E3386", secondary: "#CC3433", accent: "#A4D4FF" }], // Cubs
  [113, { primary: "#C6011F", secondary: "#111111", accent: "#E5E8EB" }], // Reds
  [114, { primary: "#E31937", secondary: "#0C2340", accent: "#9EA3A8" }], // Guardians
  [115, { primary: "#33006F", secondary: "#111111", accent: "#C4CED4" }], // Rockies
  [116, { primary: "#0C2340", secondary: "#FA4616", accent: "#FA4616" }], // Tigers
  [117, { primary: "#002D62", secondary: "#EB6E1F", accent: "#EB6E1F" }], // Astros
  [118, { primary: "#004687", secondary: "#BD9B60", accent: "#D9BD7A" }], // Royals
  [119, { primary: "#005A9C", secondary: "#EF3E42", accent: "#93C5FD" }], // Dodgers
  [120, { primary: "#AB0003", secondary: "#14225A", accent: "#E6E8EB" }], // Nationals
  [121, { primary: "#002D72", secondary: "#FF5910", accent: "#FF8A50" }], // Mets
  [133, { primary: "#003831", secondary: "#EFB21E", accent: "#F4C95D" }], // Athletics
  [134, { primary: "#111111", secondary: "#FDB827", accent: "#FDB827" }], // Pirates
  [135, { primary: "#2F241D", secondary: "#FFC425", accent: "#FFC425" }], // Padres
  [136, { primary: "#0C2C56", secondary: "#005C5C", accent: "#9EA3A8" }], // Mariners
  [137, { primary: "#FD5A1E", secondary: "#27251F", accent: "#FD5A1E" }], // Giants
  [138, { primary: "#C41E3A", secondary: "#0C2340", accent: "#FEDB00" }], // Cardinals
  [139, { primary: "#092C5C", secondary: "#8FBCE6", accent: "#F5D130" }], // Rays
  [140, { primary: "#003278", secondary: "#C0111F", accent: "#93C5FD" }], // Rangers
  [141, { primary: "#134A8E", secondary: "#1D2D5C", accent: "#E8291C" }], // Blue Jays
  [142, { primary: "#002B5C", secondary: "#D31145", accent: "#8FBCE6" }], // Twins
  [143, { primary: "#E81828", secondary: "#002D72", accent: "#6F9DD9" }], // Phillies
  [144, { primary: "#CE1141", secondary: "#13274F", accent: "#D0D6DF" }], // Braves
  [145, { primary: "#111111", secondary: "#C4CED4", accent: "#C4CED4" }], // White Sox
  [146, { primary: "#00A3E0", secondary: "#EF3340", accent: "#00D4FF" }], // Marlins
  [147, { primary: "#0C2340", secondary: "#C4CED4", accent: "#D9E1EA" }], // Yankees
  [158, { primary: "#12284B", secondary: "#FFC52F", accent: "#FFC52F" }], // Brewers
]);

const DEBUG_ACTION_EVENTS = [
  { key: "ball", label: "BALL", detail: "takes the pitch low", tone: "batter", actorRole: "batter" },
  { key: "strike", label: "STRIKE", detail: "steals a strike on the edge", tone: "pitcher", actorRole: "pitcher" },
  { key: "out", label: "OUT", detail: "records the out", tone: "pitcher", actorRole: "pitcher" },
  { key: "walk", label: "WALK", detail: "works the walk", tone: "batter", actorRole: "batter" },
  { key: "hit_by_pitch", label: "HIT BY PITCH", detail: "wears one to reach", tone: "batter", actorRole: "batter" },
  { key: "hit", label: "HIT", detail: "delivers a base hit", tone: "batter", actorRole: "batter" },
  { key: "single", label: "SINGLE", detail: "slashes a single", tone: "batter", actorRole: "batter" },
  { key: "sac_fly", label: "SAC FLY", detail: "lifts a sac fly", tone: "batter", actorRole: "batter" },
  { key: "field_error", label: "ERROR", detail: "reaches on the error", tone: "batter", actorRole: "batter" },
  { key: "double", label: "DOUBLE", detail: "ropes a double", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true },
  { key: "triple", label: "TRIPLE", detail: "legs out a triple", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true },
  { key: "home_run", label: "HOME RUN", detail: "launches a solo shot", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true },
  { key: "grand_slam", label: "GRAND SLAM", detail: "crushes a grand slam", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true },
  { key: "rbi", label: "RBI", detail: "drives in the run", tone: "batter", actorRole: "batter" },
  { key: "rbi", label: "GAME TYING RBI", detail: "ties the game", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true, impactContext: "game_tying" },
  { key: "rbi", label: "GO AHEAD RBI", detail: "puts them in front", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true, impactContext: "go_ahead" },
  { key: "run", label: "INSURANCE RUNS", detail: "adds to the cushion", tone: "batter", actorRole: "batter", forceSelectedTeamBenefit: true, impactContext: "insurance" },
  { key: "run", label: "RUN", detail: "comes home to score", tone: "batter", actorRole: "batter" },
  { key: "strikeout", label: "STRIKEOUT", detail: "strikes out the batter", tone: "pitcher", actorRole: "pitcher", forceSelectedTeamBenefit: true },
  { key: "caught_stealing", label: "CAUGHT STEALING", detail: "cuts down the runner", tone: "pitcher", actorRole: "pitcher", forceSelectedTeamBenefit: true },
  { key: "pickoff", label: "PICKOFF", detail: "catches the runner leaning", tone: "pitcher", actorRole: "pitcher", forceSelectedTeamBenefit: true },
  { key: "double_play", label: "DOUBLE PLAY", detail: "turns two", tone: "pitcher", actorRole: "pitcher", forceSelectedTeamBenefit: true },
];

const CELEBRATION_HYPE_TIERS = new Map([
  ["ball", 1],
  ["strike", 1],
  ["out", 1],
  ["walk", 1],
  ["hit_by_pitch", 1],
  ["hit", 1],
  ["single", 1],
  ["sac_fly", 1],
  ["field_error", 1],
  ["run", 1],
  ["rbi", 1],
  ["double", 2],
  ["strikeout", 2],
  ["caught_stealing", 2],
  ["pickoff", 2],
  ["triple", 3],
  ["double_play", 3],
  ["home_run", 4],
  ["grand_slam", 5],
  ["win_the_game", 5],
]);

const CELEBRATION_CONTEXT_TIERS = new Map([
  ["game_tying", 3],
  ["go_ahead", 4],
  ["insurance", 3],
]);

const state = {
  worker: null,
  countdownTimer: null,
  current: null,
  celebration: {
    lastSeenId: null,
    fadeTimer: null,
    hideTimer: null,
    debugOverrideUntil: 0,
  },
  debug: {
    workerStatus: "not started",
    lastWorkerError: null,
    isVisible: false,
    actionEventIndex: -1,
    actionEventCounter: 0,
    appVersion: "debug-2026-04-18-0003",
  },
};

// Cache the resolved MLB headshot choice per source URL so we do not re-test
// the CDN's silo/cutout variant or re-sample matte background colors on every
// rerender.
const portraitImageCache = new Map();

// Keep all DOM lookups in one place so markup changes are easy to review.
const elements = {
  awaySide: document.querySelector(".score-side.away"),
  homeSide: document.querySelector(".score-side.home"),
  headerTeamLogo: document.querySelector("#header-team-logo"),
  teamTitle: document.querySelector("#team-title"),
  teamSelect: document.querySelector("#team-select"),
  cycleModeButton: document.querySelector("#cycle-mode-button"),
  cycleActionButton: document.querySelector("#cycle-action-button"),
  debugToggleButton: document.querySelector("#debug-toggle-button"),
  debugPanel: document.querySelector("#debug-panel"),
  statusBanner: document.querySelector("#status-banner"),
  modeLabel: document.querySelector("#mode-label"),
  updatedClock: document.querySelector("#updated-clock"),
  statusLabel: document.querySelector("#status-label"),
  celebrationModal: document.querySelector("#celebration-modal"),
  celebrationCard: document.querySelector("#celebration-card"),
  celebrationMedia: document.querySelector("#celebration-media"),
  celebrationTeamLogo: document.querySelector("#celebration-team-logo"),
  celebrationPlayerPhoto: document.querySelector("#celebration-player-photo"),
  celebrationLabel: document.querySelector("#celebration-label"),
  celebrationDetail: document.querySelector("#celebration-detail"),
  celebrationActor: document.querySelector("#celebration-actor"),
  awayLogo: document.querySelector("#away-logo"),
  awayRecord: document.querySelector("#away-record"),
  awayStanding: document.querySelector("#away-standing"),
  awayLiveRole: document.querySelector("#away-live-role"),
  awayLiveRoleLabel: document.querySelector("#away-live-role-label"),
  awayLiveRolePhoto: document.querySelector("#away-live-role-photo"),
  awayLiveRoleName: document.querySelector("#away-live-role-name"),
  awayLiveRoleMeta: document.querySelector("#away-live-role-meta"),
  awayLiveRoleStats: document.querySelector("#away-live-role-stats"),
  awayName: document.querySelector("#away-name"),
  awayScore: document.querySelector("#away-score"),
  homeLogo: document.querySelector("#home-logo"),
  homeRecord: document.querySelector("#home-record"),
  homeStanding: document.querySelector("#home-standing"),
  homeLiveRole: document.querySelector("#home-live-role"),
  homeLiveRoleLabel: document.querySelector("#home-live-role-label"),
  homeLiveRolePhoto: document.querySelector("#home-live-role-photo"),
  homeLiveRoleName: document.querySelector("#home-live-role-name"),
  homeLiveRoleMeta: document.querySelector("#home-live-role-meta"),
  homeLiveRoleStats: document.querySelector("#home-live-role-stats"),
  homeName: document.querySelector("#home-name"),
  homeScore: document.querySelector("#home-score"),
    centerState: document.querySelector("#center-state"),
    countdown: document.querySelector("#countdown"),
    countState: document.querySelector("#count-state"),
    elapsedTime: document.querySelector("#elapsed-time"),
    basesMini: document.querySelector("#bases-mini"),
  footerSlot1Label: document.querySelector("#footer-slot-1-label"),
  footerSlot1Value: document.querySelector("#footer-slot-1-value"),
  footerSlot2Label: document.querySelector("#footer-slot-2-label"),
  footerSlot2Value: document.querySelector("#footer-slot-2-value"),
  footerSlot3Label: document.querySelector("#footer-slot-3-label"),
  footerSlot3Value: document.querySelector("#footer-slot-3-value"),
  heroFooter: document.querySelector("#hero-footer"),
  matchupGrid: document.querySelector("#matchup-grid"),
  detailsGrid: document.querySelector("#details-grid"),
  activeGamesPanel: document.querySelector("#active-games-panel"),
  activeGamesTitle: document.querySelector("#active-games-title"),
  activeGamesMeta: document.querySelector("#active-games-meta"),
  activeGamesStrip: document.querySelector("#active-games-strip"),
  batterCard: document.querySelector("#matchup-grid .player-card:first-child"),
  batterPhoto: document.querySelector("#batter-photo"),
  leftCardLabel: document.querySelector("#left-card-label"),
  batterName: document.querySelector("#batter-name"),
  batterMeta: document.querySelector("#batter-meta"),
  batterLine: document.querySelector("#batter-line"),
  pitcherCard: document.querySelector("#matchup-grid .player-card:last-child"),
  pitcherPhoto: document.querySelector("#pitcher-photo"),
  rightCardLabel: document.querySelector("#right-card-label"),
  pitcherName: document.querySelector("#pitcher-name"),
  pitcherMeta: document.querySelector("#pitcher-meta"),
    pitcherLine: document.querySelector("#pitcher-line"),
    linescoreLabel: document.querySelector("#linescore-label"),
    linescore: document.querySelector("#linescore"),
    notesLabel: document.querySelector("#notes-label"),
    recentPlay: document.querySelector("#recent-play"),
    upcomingSchedule: document.querySelector("#upcoming-schedule"),
    notesMetaRow: document.querySelector("#notes-meta-row"),
    notesMeta1: document.querySelector("#notes-meta-1"),
    notesMeta1Label: document.querySelector("#notes-meta-1-label"),
    teamProbable: document.querySelector("#team-probable"),
  notesMeta2: document.querySelector("#notes-meta-2"),
  notesMeta2Label: document.querySelector("#notes-meta-2-label"),
  opponentProbable: document.querySelector("#opponent-probable"),
  debugOutput: document.querySelector("#debug-output"),
};

// ----- Startup and worker wiring -----

function init() {
  populateTeamSelect();
  applyTeamTheme(Number(elements.teamSelect.value));
  bindEvents();
  restoreDebugVisibility();
  renderStartupState();
  startWorker();
}

function populateTeamSelect() {
  elements.teamSelect.innerHTML = TEAM_OPTIONS.map((team) => (
    `<option value="${team.id}">${team.name}</option>`
  )).join("");

  const savedTeamId = Number(localStorage.getItem(STORAGE_KEYS.teamId) || TEAM_OPTIONS[0].id);
  elements.teamSelect.value = String(savedTeamId);
}

function handleTeamSelection(teamId) {
  const resolvedTeamId = Number(teamId);
  if (!Number.isFinite(resolvedTeamId)) {
    return;
  }

  elements.teamSelect.value = String(resolvedTeamId);
  localStorage.setItem(STORAGE_KEYS.teamId, String(resolvedTeamId));
  applyTeamTheme(resolvedTeamId);

  if (state.worker) {
    state.worker.postMessage({ type: "SET_TEAM", teamId: resolvedTeamId });
  }
}

function bindEvents() {
  elements.teamSelect.addEventListener("change", () => {
    handleTeamSelection(Number(elements.teamSelect.value));
  });

  elements.cycleModeButton.addEventListener("click", () => {
    if (state.worker) {
      state.worker.postMessage({ type: "CYCLE_MOCK_MODE" });
    }
  });

  elements.cycleActionButton?.addEventListener("click", () => {
    cycleDebugActionEvent();
  });

  elements.debugToggleButton.addEventListener("click", () => {
    setDebugVisibility(!state.debug.isVisible);
  });

  elements.activeGamesStrip?.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("[data-home-team-id]")
      : null;

    if (!button) {
      return;
    }

    const teamId = Number(button.getAttribute("data-home-team-id"));
    if (!Number.isFinite(teamId)) {
      return;
    }

    handleTeamSelection(teamId);
  });
}

function renderStartupState() {
  const cached = loadCachedState();
  if (cached) {
    state.celebration.lastSeenId = extractStateCelebration(cached)?.id || null;
    renderState(cached);
    return;
  }
  setBanner("Loading dashboard data...", false);
}

function restoreDebugVisibility() {
  const raw = localStorage.getItem(STORAGE_KEYS.debugVisible);
  const isVisible = raw === null ? false : raw === "true";
  setDebugVisibility(isVisible, { persist: false });
}

function setDebugVisibility(isVisible, options = {}) {
  const { persist = true } = options;
  state.debug.isVisible = Boolean(isVisible);

  if (elements.debugPanel) {
    elements.debugPanel.hidden = !state.debug.isVisible;
  }

  if (elements.debugToggleButton) {
    elements.debugToggleButton.textContent = state.debug.isVisible ? "Hide Debug" : "Show Debug";
    elements.debugToggleButton.setAttribute("aria-expanded", String(state.debug.isVisible));
  }

  if (persist) {
    localStorage.setItem(STORAGE_KEYS.debugVisible, String(state.debug.isVisible));
  }
}

function startWorker() {
  const workerUrl = `mlb-worker.js?v=${encodeURIComponent(state.debug.appVersion)}`;
  state.debug.workerStatus = `starting (${workerUrl})`;
  state.worker = new Worker(workerUrl, { type: "module" });
  state.worker.addEventListener("message", handleWorkerMessage);
  state.worker.addEventListener("error", handleWorkerError);
  state.worker.addEventListener("messageerror", handleWorkerMessageError);
  state.worker.postMessage({
    type: "INIT",
    teamId: Number(elements.teamSelect.value),
    useMockData: false,
  });
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (!message?.type) {
    return;
  }

  if (message.type === "STATE" && message.payload) {
    state.debug.workerStatus = "received STATE";
    renderState(message.payload);
    saveState(message.payload);
  }

  if (message.type === "STATUS") {
    state.debug.workerStatus = `STATUS: ${message.message}`;
    setBanner(message.message, false);
    if (state.current) {
      renderDebugState(state.current);
    }
  }

  if (message.type === "ERROR") {
    state.debug.workerStatus = `ERROR: ${message.message}`;
    state.debug.lastWorkerError = message.message;
    setBanner(message.message, true);
    if (state.current) {
      renderDebugState(state.current);
    }
  }
}

function handleWorkerError(event) {
  const message = event?.message || "Unknown worker error";
  state.debug.workerStatus = "worker crashed";
  state.debug.lastWorkerError = message;
  setBanner(`Worker error: ${message}`, true);
  if (state.current) {
    renderDebugState(state.current);
  }
}

function handleWorkerMessageError() {
  state.debug.workerStatus = "worker messageerror";
  state.debug.lastWorkerError = "Failed to deserialize worker message.";
  setBanner("Worker message deserialization failed.", true);
  if (state.current) {
    renderDebugState(state.current);
  }
}

// Apply the shared shell first, then hand off to the mode-specific renderer.
function renderState(nextState) {
  state.current = nextState;
  applyTeamTheme(nextState.team?.id || Number(elements.teamSelect.value));
  elements.teamTitle.textContent = `${nextState.team?.name || "MLB"} Dashboard`;
  elements.modeLabel.textContent = capitalize(nextState.mode || "pregame");
  setImage(elements.headerTeamLogo, nextState.team?.logoUrl, `${nextState.team?.name || "Team"} logo`);
  elements.updatedClock.textContent = `Local ${formatTimestampForClock(nextState.live?.updatedAt || nextState.meta?.lastSuccessfulUpdate)}`;
  renderDebugState(nextState);
  renderBannerFromState(nextState);

  if (nextState.mode === "pregame") {
    renderPregame(nextState);
  } else if (nextState.mode === "live") {
    renderLive(nextState);
  } else {
    renderFinal(nextState);
  }

  renderActiveGames(nextState);
  syncCelebration(nextState);
  restartCountdown(nextState);
}

function applyTeamTheme(teamId) {
  const theme = resolveTeamTheme(teamId);
  const root = document.documentElement;

  root.style.setProperty("--bg-start", theme.bgStart);
  root.style.setProperty("--bg", theme.bgMid);
  root.style.setProperty("--bg-end", theme.bgEnd);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--panel-strong", theme.panelStrong);
  root.style.setProperty("--line", theme.line);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--theme-primary-rgb", theme.primaryRgb);
  root.style.setProperty("--theme-secondary-rgb", theme.secondaryRgb);
  root.style.setProperty("--accent-rgb", theme.accentRgb);
  root.style.setProperty("--accent-contrast-rgb", theme.accentContrastRgb);
}

function resolveTeamTheme(teamId) {
  const source = TEAM_THEMES.get(Number(teamId)) || DEFAULT_TEAM_THEME;
  const primary = normalizeHexColor(source.primary);
  const secondary = normalizeHexColor(source.secondary);
  const shellBase = "#07111F";
  const darkAnchor = pickDarkerColor(primary, secondary);
  const brightAnchor = pickLighterColor(normalizeHexColor(source.accent), pickLighterColor(primary, secondary));
  const accent = ensureContrastColor(normalizeHexColor(source.accent), mixHexColors(shellBase, darkAnchor, 0.12), 4.5);
  const accentContrast = mixHexColors(accent, "#FFFFFF", 0.58);
  const panelBase = mixHexColors("#0A172A", darkAnchor, 0.08);
  const panelStrongBase = mixHexColors("#07111F", darkAnchor, 0.04);
  const lineBase = mixHexColors(brightAnchor, "#D9E6F3", 0.18);

  return {
    bgStart: mixHexColors("#02060B", darkAnchor, 0.12),
    bgMid: mixHexColors("#07111F", primary, 0.08),
    bgEnd: mixHexColors("#0B1B31", darkAnchor, 0.16),
    panel: `rgba(${rgbStringFromHex(panelBase)}, 0.86)`,
    panelStrong: `rgba(${rgbStringFromHex(panelStrongBase)}, 0.96)`,
    line: `rgba(${rgbStringFromHex(lineBase)}, 0.28)`,
    accent,
    primaryRgb: rgbStringFromHex(primary),
    secondaryRgb: rgbStringFromHex(secondary),
    accentRgb: rgbStringFromHex(accent),
    accentContrastRgb: rgbStringFromHex(accentContrast),
  };
}

function ensureContrastColor(foregroundHex, backgroundHex, minimumContrast = 4.5) {
  const foreground = normalizeHexColor(foregroundHex);
  const background = normalizeHexColor(backgroundHex);

  if (contrastRatio(foreground, background) >= minimumContrast) {
    return foreground;
  }

  for (let step = 1; step <= 12; step += 1) {
    const candidate = mixHexColors(foreground, "#F3F7FB", step / 12);
    if (contrastRatio(candidate, background) >= minimumContrast) {
      return candidate;
    }
  }

  return "#F3F7FB";
}

function contrastRatio(leftHex, rightHex) {
  const left = relativeLuminance(hexToRgb(leftHex));
  const right = relativeLuminance(hexToRgb(rightHex));
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ red, green, blue }) {
  const normalize = (value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  };

  const r = normalize(red);
  const g = normalize(green);
  const b = normalize(blue);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function pickDarkerColor(leftHex, rightHex) {
  return relativeLuminance(hexToRgb(leftHex)) <= relativeLuminance(hexToRgb(rightHex))
    ? leftHex
    : rightHex;
}

function pickLighterColor(leftHex, rightHex) {
  return relativeLuminance(hexToRgb(leftHex)) >= relativeLuminance(hexToRgb(rightHex))
    ? leftHex
    : rightHex;
}

function mixHexColors(leftHex, rightHex, amount = 0.5) {
  const left = hexToRgb(leftHex);
  const right = hexToRgb(rightHex);
  const ratio = Math.max(0, Math.min(1, amount));

  return rgbToHex({
    red: Math.round(left.red + (right.red - left.red) * ratio),
    green: Math.round(left.green + (right.green - left.green) * ratio),
    blue: Math.round(left.blue + (right.blue - left.blue) * ratio),
  });
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim().replace(/^#/, "");
  if (raw.length === 3) {
    return `#${raw.split("").map((channel) => channel + channel).join("").toUpperCase()}`;
  }

  if (raw.length !== 6) {
    return DEFAULT_TEAM_THEME.primary;
  }

  return `#${raw.toUpperCase()}`;
}

function hexToRgb(value) {
  const hex = normalizeHexColor(value).slice(1);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({ red, green, blue }) {
  const encode = (channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0");
  return `#${encode(red)}${encode(green)}${encode(blue)}`.toUpperCase();
}

function rgbStringFromHex(value) {
  const { red, green, blue } = hexToRgb(value);
  return `${red}, ${green}, ${blue}`;
}

function syncCelebration(nextState) {
  // Pregame should always clear the overlay. Live and final are both allowed
  // to surface celebrations so big final moments like "WIN THE GAME" can play
  // once when the state flips over.
  if (nextState?.mode === "pregame") {
    hideCelebration(true);
    return;
  }

  if (Date.now() < state.celebration.debugOverrideUntil) {
    return;
  }

  const celebration = extractStateCelebration(nextState);
  if (!celebration?.id) {
    hideCelebration(true);
    return;
  }

  if (celebration.id === state.celebration.lastSeenId) {
    return;
  }

  state.celebration.lastSeenId = celebration.id;
  showCelebration(celebration);
}

function extractStateCelebration(nextState) {
  // The UI consumes celebrations from one shared accessor so the renderer does
  // not have to care whether the moment came from a live play or a final-state
  // payoff when the selected team wins.
  return nextState?.live?.celebration || nextState?.final?.celebration || null;
}

function cycleDebugActionEvent() {
  state.debug.actionEventIndex = (state.debug.actionEventIndex + 1) % DEBUG_ACTION_EVENTS.length;
  const eventConfig = DEBUG_ACTION_EVENTS[state.debug.actionEventIndex];
  if (!eventConfig) {
    return;
  }

  const celebration = buildDebugActionCelebration(eventConfig);
  state.celebration.lastSeenId = celebration.id;
  showCelebration(celebration);
}

function buildDebugActionCelebration(eventConfig) {
  state.debug.actionEventCounter += 1;

  return {
    id: `debug-action:${eventConfig.key}:${state.debug.actionEventCounter}`,
    isDebug: true,
    eventKey: eventConfig.key,
    impactContext: eventConfig.impactContext || null,
    label: eventConfig.label,
    actor: resolveDebugActionActor(eventConfig.actorRole),
    detail: resolveDebugActionDetail(eventConfig),
    beneficiaryRole: eventConfig.actorRole,
    forceSelectedTeamBenefit: Boolean(eventConfig.forceSelectedTeamBenefit),
    tone: eventConfig.tone,
  };
}

function resolveDebugActionActor(actorRole) {
  if (actorRole === "pitcher") {
    return state.current?.live?.pitcher?.name || "Current Pitcher";
  }

  return state.current?.live?.batter?.name || "Current Batter";
}

function resolveDebugActionDetail(eventConfig) {
  if (eventConfig.key === "strikeout") {
    const batterName = state.current?.live?.batter?.name || "the batter";
    return `strikes out ${batterName}`;
  }

  return eventConfig.detail;
}

function showCelebration(celebration) {
  if (!elements.celebrationModal || !elements.celebrationCard) {
    return;
  }

  window.clearTimeout(state.celebration.fadeTimer);
  window.clearTimeout(state.celebration.hideTimer);

  const media = resolveCelebrationMedia(celebration, state.current);
  const presentation = resolveCelebrationPresentation(celebration, state.current);

  setImage(
    elements.celebrationTeamLogo,
    media.teamLogoUrl,
    media.teamLogoAlt
  );
  setImage(
    elements.celebrationPlayerPhoto,
    media.playerPhoto,
    media.playerPhotoAlt,
    { usePlayerFallback: true }
  );
  if (elements.celebrationMedia) {
    elements.celebrationMedia.hidden = !media.hasMedia;
  }

  elements.celebrationLabel.textContent = celebration.label || "";
  elements.celebrationDetail.textContent = celebration.detail || "";
  elements.celebrationActor.textContent = celebration.actor || "";
  applyCelebrationPresentation(elements.celebrationCard, presentation);
  elements.celebrationCard.classList.toggle("is-pitcher", celebration.tone === "pitcher");
  elements.celebrationCard.classList.toggle("is-batter", celebration.tone !== "pitcher");
  elements.celebrationModal.hidden = false;
  elements.celebrationModal.classList.remove("is-visible", "is-exiting");

  if (celebration?.isDebug) {
    state.celebration.debugOverrideUntil = Date.now() + 5200;
  }

  window.requestAnimationFrame(() => {
    elements.celebrationModal.classList.add("is-visible");
  });

  state.celebration.fadeTimer = window.setTimeout(() => {
    elements.celebrationModal.classList.remove("is-visible");
    elements.celebrationModal.classList.add("is-exiting");
  }, 4500);

  state.celebration.hideTimer = window.setTimeout(() => {
    hideCelebration(true);
  }, 5000);
}

function hideCelebration(immediate = false) {
  if (!elements.celebrationModal) {
    return;
  }

  window.clearTimeout(state.celebration.fadeTimer);
  window.clearTimeout(state.celebration.hideTimer);

  if (immediate) {
    elements.celebrationModal.hidden = true;
    elements.celebrationModal.classList.remove("is-visible", "is-exiting");
    elements.celebrationMedia && (elements.celebrationMedia.hidden = false);
    clearCelebrationPresentation(elements.celebrationCard);
    elements.celebrationCard?.classList.remove("is-pitcher", "is-batter");
  }
}

function resolveCelebrationMedia(celebration, currentState) {
  const liveState = currentState?.live || null;
  const beneficiary = resolveCelebrationBeneficiary(celebration, liveState, currentState?.team || null);
  const forcedTeam = celebration?.forceSelectedTeamBenefit ? currentState?.team || null : null;
  const resolvedTeam = forcedTeam || beneficiary.team || currentState?.team || null;
  const teamName = resolvedTeam?.name || currentState?.team?.name || "Team";
  const actorName = celebration?.actor || beneficiary.player?.name || "Player";
  const teamLogoUrl = celebration?.teamLogoUrl || liveLogoUrl(resolvedTeam) || "";
  const playerPhoto = celebration?.playerPhoto || beneficiary.player?.photo || "";

  return {
    hasMedia: Boolean(teamLogoUrl || playerPhoto),
    teamLogoUrl,
    teamLogoAlt: `${teamName} logo`,
    playerPhoto,
    playerPhotoAlt: actorName,
  };
}

function resolveCelebrationBeneficiary(celebration, liveState, selectedTeam = null) {
  const role = celebration?.beneficiaryRole || (celebration?.tone === "pitcher" ? "pitcher" : "batter");

  if (role === "pitcher") {
    return {
      player: liveState?.pitcher || null,
      team: resolvePitchingTeam(liveState, selectedTeam),
    };
  }

  return {
    player: liveState?.batter || null,
    team: resolveBattingTeam(liveState, selectedTeam),
  };
}

function resolveCelebrationPresentation(celebration, currentState) {
  const eventKey = normalizeCelebrationEventType(celebration?.eventKey || celebration?.label || "");
  const impactContext = normalizeCelebrationEventType(celebration?.impactContext || "");
  const baseTier = CELEBRATION_HYPE_TIERS.get(eventKey) || 1;
  const contextTier = CELEBRATION_CONTEXT_TIERS.get(impactContext) || 1;
  const isSelectedTeamBenefit = resolveSelectedTeamCelebrationBenefit(celebration, currentState);

  return {
    eventKey,
    impactContext,
    hypeTier: isSelectedTeamBenefit ? Math.max(baseTier, contextTier) : 1,
    isFanMoment: isSelectedTeamBenefit && Math.max(baseTier, contextTier) > 1,
  };
}

function resolveSelectedTeamCelebrationBenefit(celebration, currentState) {
  if (celebration?.forceSelectedTeamBenefit) {
    return true;
  }

  const selectedTeamId = Number(currentState?.team?.id);
  if (!Number.isFinite(selectedTeamId)) {
    return false;
  }

  const beneficiary = resolveCelebrationBeneficiary(celebration, currentState?.live || null, currentState?.team || null);
  return Number(beneficiary.team?.id) === selectedTeamId;
}

function applyCelebrationPresentation(card, presentation) {
  if (!card) {
    return;
  }

  clearCelebrationPresentation(card);
  card.dataset.eventKey = presentation?.eventKey || "";
  card.dataset.impactContext = presentation?.impactContext || "";
  card.dataset.hypeTier = String(presentation?.hypeTier || 1);
  card.classList.toggle("is-fan-moment", Boolean(presentation?.isFanMoment));
}

function clearCelebrationPresentation(card) {
  if (!card) {
    return;
  }

  delete card.dataset.eventKey;
  delete card.dataset.impactContext;
  delete card.dataset.hypeTier;
  card.classList.remove("is-fan-moment");
}

function normalizeCelebrationEventType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function resolveBattingTeam(liveState, fallbackTeam = null) {
  const inningHalf = normalizeInningHalf(liveState?.inningHalf);

  if (inningHalf.startsWith("top")) {
    return liveState?.away || fallbackTeam || null;
  }
  if (inningHalf.startsWith("bottom")) {
    return liveState?.home || fallbackTeam || null;
  }

  return fallbackTeam || liveState?.home || liveState?.away || null;
}

function resolvePitchingTeam(liveState, fallbackTeam = null) {
  const inningHalf = normalizeInningHalf(liveState?.inningHalf);

  if (inningHalf.startsWith("top")) {
    return liveState?.home || fallbackTeam || null;
  }
  if (inningHalf.startsWith("bottom")) {
    return liveState?.away || fallbackTeam || null;
  }

  return fallbackTeam || liveState?.away || liveState?.home || null;
}

// Pregame reuses the live shell, but swaps scores for records and uses
// probable starters instead of the active batter / pitcher.
function renderPregame(nextState) {
  setStateLayout("pregame");
  const selectedTeam = nextState.team?.name || "Selected Team";
  const game = nextState.nextGame;
  const previousGame = nextState.previousGame;
  const upcomingSchedule = Array.isArray(nextState.upcomingSchedule) ? nextState.upcomingSchedule : [];
  const homeName = game?.isHome ? selectedTeam : game?.opponent || "Opponent";
  const awayName = game?.isHome ? game?.opponent || "Opponent" : selectedTeam;
  const teamPitcher = game?.probablePitchers?.team || null;
  const opponentPitcher = game?.probablePitchers?.opponent || null;
  const gameStatus = game?.statusText || "Awaiting first pitch";
  const specialStatus = isSpecialPregameStatus(gameStatus);
  const awayLogo = game?.isHome ? game?.opponentLogoUrl || "" : nextState.team?.logoUrl || "";
  const homeLogo = game?.isHome ? nextState.team?.logoUrl || "" : game?.opponentLogoUrl || "";
  const awayRecord = game?.isHome ? game?.opponentRecord : game?.teamRecord;
  const homeRecord = game?.isHome ? game?.teamRecord : game?.opponentRecord;
  const awayStanding = game?.isHome ? game?.opponentStanding : game?.teamStanding;
  const homeStanding = game?.isHome ? game?.teamStanding : game?.opponentStanding;
  const awayPitcher = game?.isHome ? opponentPitcher : teamPitcher;
  const homePitcher = game?.isHome ? teamPitcher : opponentPitcher;

  elements.statusLabel.textContent = gameStatus;
  setSideWatermark(elements.awaySide, awayLogo, "left");
  setSideWatermark(elements.homeSide, homeLogo, "right");
  setImage(elements.awayLogo, "", `${awayName} logo`);
  setImage(elements.homeLogo, "", `${homeName} logo`);
  elements.awayLogo.classList.remove("logo-edge-left", "logo-edge-right");
  elements.homeLogo.classList.remove("logo-edge-left", "logo-edge-right");
  setRecord(elements.awayRecord, null);
  setRecord(elements.homeRecord, null);
  setStanding(elements.awayStanding, awayStanding);
  setStanding(elements.homeStanding, homeStanding);
  setLiveRoleCard("away", buildProbablePitcherCardConfig(awayPitcher, awayName));
  setLiveRoleCard("home", buildProbablePitcherCardConfig(homePitcher, homeName));
  elements.leftCardLabel.textContent = game?.isHome ? "Away Probable" : "Team Probable";
  elements.rightCardLabel.textContent = game?.isHome ? "Home Probable" : "Opponent Probable";
  elements.awayName.textContent = awayName;
  elements.homeName.textContent = homeName;
  setScoreValue(elements.awayScore, awayRecord || "--", "record");
  setScoreValue(elements.homeScore, homeRecord || "--", "record");
  setCenterStateText(specialStatus ? "Game Status" : "Next Game");
  elements.countState.innerHTML = specialStatus
    ? `<span class="count-status-text">${formatPregameStatusDetail(game)}</span>`
    : `<span class="count-status-text">${formatPregameCountdownDetail(game)}</span>`;
  setElapsedTime(null);
  setMiniBases(null);
  setFooterSlots(["", ""], ["", ""], ["", ""]);
  renderUpcomingSchedule(upcomingSchedule);

  setPlayerCard(elements.batterPhoto, elements.batterName, elements.batterMeta, elements.batterLine, {
    name: resolveProbablePitcherName(awayPitcher, awayName),
    meta: buildProbablePitcherMeta(awayName, "probable starter", awayPitcher?.throws),
    stats: buildPitcherStatsConfig(awayPitcher),
    line: awayPitcher?.seasonLine || `Projected to start for ${awayName}.`,
    photo: awayPitcher?.photo || "",
  });
  setBattingOrderBadge(elements.batterCard, null);

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: resolveProbablePitcherName(homePitcher, homeName),
    meta: buildProbablePitcherMeta(homeName, "probable starter", homePitcher?.throws),
    stats: buildPitcherStatsConfig(homePitcher),
    line: homePitcher?.seasonLine || `Projected to start for ${homeName}.`,
    photo: homePitcher?.photo || "",
  });
  setBattingOrderBadge(elements.pitcherCard, null);

  setLinescoreLabel(buildPreviousGameLabel(previousGame));
  renderLinescore(previousGame?.linescore || [], {
    awayLabel: previousGame?.away?.abbr || previousGame?.away?.name || "AWY",
    awayLogo: previousGame?.away?.logoUrl || "",
    homeLabel: previousGame?.home?.abbr || previousGame?.home?.name || "HME",
    homeLogo: previousGame?.home?.logoUrl || "",
    awayTotals: buildFixedLinescoreTotals(previousGame?.awayScore, previousGame?.awayHits, previousGame?.awayErrors),
    homeTotals: buildFixedLinescoreTotals(previousGame?.homeScore, previousGame?.homeHits, previousGame?.homeErrors),
    awayLabelClass: buildPreviousGameWinnerLabelClass(previousGame, "away"),
    homeLabelClass: buildPreviousGameWinnerLabelClass(previousGame, "home"),
    emptyMessage: "Waiting for previous game linescore.",
  });
}

// Live mode is the most compact view and prioritizes current game state.
function renderLive(nextState) {
  setStateLayout("live");
  const live = nextState.live;
  elements.leftCardLabel.textContent = "Current Batter";
  elements.rightCardLabel.textContent = "Current Pitcher";
  elements.statusLabel.textContent = live?.status || "In Progress";
  setSideWatermark(elements.awaySide, liveLogoUrl(live?.away), "left");
  setSideWatermark(elements.homeSide, liveLogoUrl(live?.home), "right");
  setImage(elements.awayLogo, "", `${live?.away?.name || "Away"} logo`);
  setImage(elements.homeLogo, "", `${live?.home?.name || "Home"} logo`);
  elements.awayLogo.classList.remove("logo-edge-left", "logo-edge-right");
  elements.homeLogo.classList.remove("logo-edge-left", "logo-edge-right");
  setRecord(elements.awayRecord, null);
  setRecord(elements.homeRecord, null);
  setStanding(elements.awayStanding, null);
  setStanding(elements.homeStanding, null);
  assignLiveRoleCards(live);
  elements.awayName.textContent = live?.away?.name || "Away";
  elements.homeName.textContent = live?.home?.name || "Home";
  setScoreValue(elements.awayScore, String(live?.away?.score ?? 0), "score");
  setScoreValue(elements.homeScore, String(live?.home?.score ?? 0), "score");
  const displayInningHalf = resolveDisplayedInningHalf(live?.inningHalf, live?.outs);
  setCenterStateInning(displayInningHalf, live?.inning);
  elements.countState.innerHTML = renderCountSummary(live);
  setElapsedTime(live?.startTime || null);
  setMiniBases(live?.bases || null, live?.outs ?? 0);
  setFooterSlots(
    ["", ""],
    ["", ""],
    ["", ""]
  );
  setNotesTitle("Game Notes");
  hideUpcomingSchedule();
  elements.recentPlay.textContent = live?.recentPlay || "Latest play text unavailable.";
  elements.recentPlay.hidden = false;
  setNotesMeta(
    "Play State",
    formatInningState(displayInningHalf, live?.inning) || "Live",
    "Basepaths",
    basesText(live?.bases)
  );

  setPlayerCard(elements.batterPhoto, elements.batterName, elements.batterMeta, elements.batterLine, {
    name: live?.batter?.name || "Batter unavailable",
    meta: [live?.batter?.position, handednessLabel("Bats", live?.batter?.bats)].filter(Boolean).join(" | "),
    stats: buildBatterStatsConfig(live?.batter),
    line: [live?.batter?.todayLine, live?.batter?.seasonLine].filter(Boolean).join(" | ") || "No batting line available.",
    photo: live?.batter?.photo || "",
  });
  setBattingOrderBadge(elements.batterCard, live?.batter?.battingOrder);

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: live?.pitcher?.name || "Pitcher unavailable",
    meta: [handednessLabel("Throws", live?.pitcher?.throws)].filter(Boolean).join(" | "),
    stats: buildPitcherStatsConfig(live?.pitcher, { includeToday: true }),
    line: [live?.pitcher?.todayLine, live?.pitcher?.seasonLine].filter(Boolean).join(" | ") || "No pitching line available.",
    photo: live?.pitcher?.photo || "",
  });
  setPitchCountBadge(elements.pitcherCard, live?.pitcher?.pitchCount);

  setLinescoreLabel("Linescore");
  renderLinescore(live?.linescore || []);
}

// Final mode bridges the completed game and the next scheduled matchup.
function renderFinal(nextState) {
  setStateLayout("final");
  const final = nextState.final;
  const nextGame = nextState.nextGame;
  const selectedTeam = nextState.team?.name || "Selected Team";
  const teamPitcher = nextGame?.probablePitchers?.team || null;
  const opponentPitcher = nextGame?.probablePitchers?.opponent || null;
  const nextGameStatus = nextGame?.statusText || "Next Up";
  const specialStatus = isSpecialPregameStatus(nextGameStatus);
  const homeName = nextGame
    ? (nextGame.isHome ? selectedTeam : nextGame.opponent || "Next Opponent")
    : "Home";
  const awayName = nextGame
    ? (nextGame.isHome ? nextGame.opponent || "Next Opponent" : selectedTeam)
    : selectedTeam;
  const awayLogo = nextGame?.isHome ? nextGame?.opponentLogoUrl || "" : nextState.team?.logoUrl || "";
  const homeLogo = nextGame?.isHome ? nextState.team?.logoUrl || "" : nextGame?.opponentLogoUrl || "";
  const awayRecord = nextGame?.isHome ? nextGame?.opponentRecord : nextGame?.teamRecord;
  const homeRecord = nextGame?.isHome ? nextGame?.teamRecord : nextGame?.opponentRecord;
  const awayStanding = nextGame?.isHome ? nextGame?.opponentStanding : nextGame?.teamStanding;
  const homeStanding = nextGame?.isHome ? nextGame?.teamStanding : nextGame?.opponentStanding;
  const awayPitcher = nextGame?.isHome ? opponentPitcher : teamPitcher;
  const homePitcher = nextGame?.isHome ? teamPitcher : opponentPitcher;

  elements.statusLabel.textContent = nextGame ? nextGameStatus : "Game Complete";
  setSideWatermark(elements.awaySide, awayLogo, "left");
  setSideWatermark(elements.homeSide, homeLogo, "right");
  setImage(elements.awayLogo, "", `${awayName} logo`);
  setImage(elements.homeLogo, "", `${homeName} logo`);
  elements.awayLogo.classList.remove("logo-edge-left", "logo-edge-right");
  elements.homeLogo.classList.remove("logo-edge-left", "logo-edge-right");
  setRecord(elements.awayRecord, null);
  setRecord(elements.homeRecord, null);
  setStanding(elements.awayStanding, awayStanding || null);
  setStanding(elements.homeStanding, homeStanding || null);
  setLiveRoleCard("away", nextGame ? buildProbablePitcherCardConfig(awayPitcher, awayName) : null);
  setLiveRoleCard("home", nextGame ? buildProbablePitcherCardConfig(homePitcher, homeName) : null);
  elements.leftCardLabel.textContent = "Team Probable";
  elements.rightCardLabel.textContent = "Opponent Probable";
  elements.awayName.textContent = awayName;
  elements.homeName.textContent = homeName;
  if (nextGame) {
    setScoreValue(elements.awayScore, awayRecord || "--", "record");
    setScoreValue(elements.homeScore, homeRecord || "--", "record");
  } else {
    setScoreValue(elements.awayScore, String(final?.awayScore ?? "-"), "score");
    setScoreValue(elements.homeScore, String(final?.homeScore ?? "-"), "score");
  }
  setCenterStateText(
    nextGame
      ? (specialStatus ? "Game Status" : "Next Game")
      : "Final"
  );
  elements.countState.innerHTML = nextGame
    ? `<span class="count-status-text">${specialStatus ? formatPregameStatusDetail(nextGame) : formatPregameCountdownDetail(nextGame)}</span>`
    : `<span class="count-status-text">Awaiting schedule</span>`;
  setElapsedTime(null);
  setMiniBases(null);
  setFooterSlots(["", ""], ["", ""], ["", ""]);
  setNotesTitle("Game Notes");
  hideUpcomingSchedule();
  elements.recentPlay.textContent = final?.summary || "Final game summary unavailable.";
  elements.recentPlay.hidden = false;
  setNotesMeta(
    "Last Final",
    final ? `${final.awayScore ?? "-"} - ${final.homeScore ?? "-"}` : "Final complete",
    nextGame ? "Next Pitch" : "Next Game",
    nextGame ? formatDateTime(nextGame.startTime) : "Schedule pending"
  );

  setPlayerCard(elements.batterPhoto, elements.batterName, elements.batterMeta, elements.batterLine, {
    name: resolveProbablePitcherName(awayPitcher, awayName),
    meta: buildProbablePitcherMeta(awayName, "projected starter", awayPitcher?.throws),
    stats: buildPitcherStatsConfig(awayPitcher),
    line: nextGame
      ? awayPitcher?.seasonLine || `Expected pitching matchup for ${formatDateTime(nextGame.startTime)}.`
      : final?.summary || "The dashboard will pivot back to the next scheduled game after final.",
    photo: awayPitcher?.photo || "",
  });
  setBattingOrderBadge(elements.batterCard, null);

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: resolveProbablePitcherName(homePitcher, homeName),
    meta: buildProbablePitcherMeta(homeName, "projected starter", homePitcher?.throws),
    stats: buildPitcherStatsConfig(homePitcher),
    line: nextGame
      ? homePitcher?.seasonLine || `Countdown target: ${formatDateTime(nextGame.startTime)}`
      : "No upcoming game found yet.",
    photo: homePitcher?.photo || "",
  });
  setBattingOrderBadge(elements.pitcherCard, null);

  setLinescoreLabel("Linescore");
  renderLinescore([]);
}

// ----- Player cards and stat blocks -----

function setPlayerCard(photoElement, nameElement, metaElement, lineElement, data) {
  nameElement.textContent = data.name || "Unavailable";
  metaElement.textContent = data.meta || "No additional player context";
  renderStatBlock(lineElement, data.stats, data.line, "card");
  setImage(photoElement, data.photo || "", data.name || "Player", { usePlayerFallback: true });
}

function setBattingOrderBadge(cardElement, battingOrder) {
  setPlayerBadgeText(cardElement, formatBattingOrderDisplay(battingOrder));
}

function setPitchCountBadge(cardElement, pitchCount) {
  setPlayerBadgeText(cardElement, formatPitchCountDisplay(pitchCount));
}

function setPlayerBadgeText(cardElement, displayValue) {
  if (!cardElement) {
    return;
  }

  cardElement.classList.toggle("has-batting-order", Boolean(displayValue));

  if (!displayValue) {
    delete cardElement.dataset.battingOrder;
    return;
  }

  cardElement.dataset.battingOrder = displayValue;
}

function formatBattingOrderDisplay(battingOrder) {
  const numericValue = Number.parseInt(battingOrder, 10);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }
  return `${numericValue}.`;
}

function formatPitchCountDisplay(pitchCount) {
  const numericValue = Number.parseInt(pitchCount, 10);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return "";
  }
  return `P${numericValue}`;
}

function renderStatBlock(element, statsConfig, fallbackText, variant = "card") {
  if (!element) {
    return;
  }

  const markup = buildStatBlockMarkup(statsConfig, variant);
  if (markup) {
    element.innerHTML = markup;
    element.hidden = false;
    return;
  }

  const fallback = escapeHtml(fallbackText || "No stat line available.");
  element.innerHTML = `<p class="player-line">${fallback}</p>`;
  element.hidden = false;
}

function buildStatBlockMarkup(statsConfig, variant = "card") {
  const metrics = Array.isArray(statsConfig?.metrics)
    ? statsConfig.metrics.filter((metric) => hasDisplayValue(metric?.value))
    : [];
  const summaryValue = statsConfig?.summaryValue;
  const showSummaryLabel = Boolean(statsConfig?.summaryLabel) && statsConfig?.hideSummaryLabel !== true;

  if (!hasDisplayValue(summaryValue) && !metrics.length) {
    return "";
  }

  const tableClass = variant === "compact"
    ? "player-stat-table player-stat-table-compact"
    : "player-stat-table";
  const summaryClass = variant === "compact"
    ? "player-stat-summary player-stat-summary-compact"
    : "player-stat-summary";

  let markup = '<div class="player-stat-block">';

  if (hasDisplayValue(summaryValue)) {
    markup += `
      <div class="${summaryClass}">
        ${showSummaryLabel ? `<span class="player-stat-summary-label">${escapeHtml(statsConfig?.summaryLabel || "Today")}</span>` : ""}
        <span class="player-stat-summary-value">${escapeHtml(String(summaryValue))}</span>
      </div>
    `;
  }

  if (metrics.length) {
    markup += `
      <table class="${tableClass}">
        <thead>
          <tr>${metrics.map((metric) => `<th scope="col">${escapeHtml(metric.label)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          <tr>${metrics.map((metric) => `<td>${escapeHtml(String(metric.value))}</td>`).join("")}</tr>
        </tbody>
      </table>
    `;
  }

  markup += "</div>";
  return markup;
}

// Batter cards intentionally separate immediate game context from season stats.
function buildBatterStatsConfig(player, options = {}) {
  const compact = Boolean(options.compact);
  return {
    summaryLabel: "Today",
    summaryValue: player?.todayLine || null,
    hideSummaryLabel: Boolean(options.hideSummaryLabel),
    metrics: compact
      ? [
          statMetric("AVG", player?.seasonStats?.average),
          statMetric("H", player?.seasonStats?.hits),
          statMetric("R", player?.seasonStats?.runs),
          statMetric("HR", player?.seasonStats?.homeRuns),
        ]
      : [
          statMetric("AVG", player?.seasonStats?.average),
          statMetric("OBP", player?.seasonStats?.onBase),
          statMetric("H", player?.seasonStats?.hits),
          statMetric("R", player?.seasonStats?.runs),
          statMetric("HR", player?.seasonStats?.homeRuns),
        ],
  };
}

// Pitcher tables stay opinionated so the small cards remain readable at a glance.
function buildPitcherStatsConfig(player, options = {}) {
  const includeToday = options.includeToday !== false;
  return {
    summaryLabel: "Today",
    summaryValue: includeToday ? player?.todayLine || null : null,
    hideSummaryLabel: Boolean(options.hideSummaryLabel),
    metrics: [
      statMetric("ERA", player?.seasonStats?.era),
      statMetric("WHIP", player?.seasonStats?.whip),
      statMetric("K", player?.seasonStats?.strikeouts),
    ],
  };
}

function statMetric(label, value) {
  return { label, value };
}

function hasDisplayValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// `setImage` does more than assign `src`:
// - preserves already-good team logos during transient rerenders
// - routes player photos through the portrait cleanup pipeline
// - prevents stale async portrait work from winning a later race
function setImage(element, src, alt, options = {}) {
  if (!element) {
    return;
  }

  if (
    !src &&
    !options.usePlayerFallback &&
    element.dataset.sourceSrc &&
    element.classList.contains("has-image") &&
    !element.hidden
  ) {
    element.alt = alt || "";
    return;
  }

  if (
    src &&
    !options.usePlayerFallback &&
    element.dataset.sourceSrc === src &&
    element.classList.contains("has-image") &&
    !element.hidden
  ) {
    element.alt = alt || "";
    return;
  }

  element.alt = alt || "";
  element.hidden = true;
  element.removeAttribute("src");
  element.classList.remove("has-image", "is-fallback");
  clearPortraitMatte(element);
  element.onerror = null;
  element.onload = null;
  element.dataset.sourceSrc = src || "";

  const requestKey = `${src}|${Date.now()}|${Math.random()}`;
  element.dataset.requestKey = requestKey;

  if (!src) {
    if (options.usePlayerFallback) {
      applyPlayerFallback(element, alt);
    }
    return;
  }

  if (options.usePlayerFallback && !src.startsWith("data:")) {
    loadProcessedPortrait(element, src, alt, options, requestKey);
    return;
  }

  element.onerror = () => {
    if (options.usePlayerFallback) {
      applyPlayerFallback(element, alt);
      return;
    }
    element.hidden = true;
    element.removeAttribute("src");
  };

  element.src = src;
  element.hidden = false;
  element.classList.add("has-image");
}

// Player headshots now use a safer runtime strategy:
// try MLB's transparency-oriented silo URL, verify that the asset really has
// alpha, then fall back to the standard headshot if anything is unclear.
async function loadProcessedPortrait(element, src, alt, options, requestKey) {
  const cached = portraitImageCache.get(src);
  if (cached) {
    applyResolvedImage(element, cached, alt, options, requestKey);
    return;
  }

  let resolved = { url: src, mode: "opaque", matteColor: null };

  try {
    resolved = await resolveBestHeadshot(src);
  } catch {
    resolved = { url: src, mode: "opaque", matteColor: null };
  }

  portraitImageCache.set(src, resolved);
  applyResolvedImage(element, resolved, alt, options, requestKey);
}

function applyResolvedImage(element, resolvedImage, alt, options, requestKey) {
  if (element.dataset.requestKey !== requestKey) {
    return;
  }

  const resolvedSrc = resolvedImage?.url || "";
  element.alt = alt || "";
  applyPortraitMatte(element, resolvedImage?.matteColor || null);
  if (resolvedImage?.mode) {
    element.dataset.headshotMode = resolvedImage.mode;
  } else {
    delete element.dataset.headshotMode;
  }
  element.onerror = () => {
    if (element.dataset.requestKey !== requestKey) {
      return;
    }
    if (options.usePlayerFallback) {
      applyPlayerFallback(element, alt);
      return;
    }
    element.hidden = true;
    element.removeAttribute("src");
  };
  element.src = resolvedSrc;
  element.hidden = false;
  element.classList.add("has-image");
}

function getMlbHeadshotUrls(playerId, width = 180) {
  const standard = `https://img.mlbstatic.com/mlb-photos/image/upload/w_${width},q_auto:best/v1/people/${playerId}/headshot/67/current`;
  const siloPng = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_${width},q_auto:best,f_png/v1/people/${playerId}/headshot/67/current`;
  const siloAuto = `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_${width},q_auto:best,f_auto/v1/people/${playerId}/headshot/67/current`;
  return { siloPng, siloAuto, standard };
}

function extractPlayerIdFromHeadshotUrl(src) {
  const match = String(src || "").match(/people\/(\d+)\/headshot\/67\/current/i);
  return match ? Number(match[1]) : null;
}

async function resolveBestHeadshot(src, width = 180) {
  const playerId = extractPlayerIdFromHeadshotUrl(src);
  if (!playerId) {
    return { url: src, mode: "opaque", matteColor: null };
  }

  const { siloPng, siloAuto, standard } = getMlbHeadshotUrls(playerId, width);
  const candidates = [siloPng, siloAuto];

  for (const candidate of candidates) {
    const candidateResult = await inspectHeadshotAsset(candidate);
    if (candidateResult.ok && candidateResult.hasAlpha) {
      return { url: candidate, mode: "transparent", matteColor: null };
    }
  }

  const standardResult = await inspectHeadshotAsset(standard);
  if (standardResult.ok) {
    return {
      url: standard,
      mode: "opaque",
      matteColor: standardResult.matteColor || null,
    };
  }

  return { url: standard, mode: "opaque", matteColor: null };
}

async function inspectHeadshotAsset(url) {
  try {
    const response = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!response.ok) {
      return { ok: false, hasAlpha: false, matteColor: null, reason: `http_${response.status}` };
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      const blob = await response.blob();
      const matteColor = await extractPortraitMatteColor(blob);
      return { ok: true, hasAlpha: false, matteColor, reason: "jpeg", contentType };
    }

    const blob = await response.blob();
    const hasAlpha = await verifyTransparentEdges(blob);
    const matteColor = hasAlpha ? null : await extractPortraitMatteColor(blob);

    return {
      ok: true,
      hasAlpha,
      matteColor,
      reason: hasAlpha ? "alpha_detected" : "no_alpha_detected",
      contentType,
    };
  } catch {
    return { ok: false, hasAlpha: false, matteColor: null, reason: "exception" };
  }
}

async function verifyTransparentEdges(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return false;
    }

    context.drawImage(bitmap, 0, 0);
    return hasTransparentEdgeBand(context, canvas.width, canvas.height);
  } catch {
    return false;
  }
}

function hasTransparentEdgeBand(context, width, height) {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 30));
  const samples = [];

  for (let x = 0; x < width; x += step) {
    samples.push(context.getImageData(x, 0, 1, 1).data[3]);
    samples.push(context.getImageData(x, height - 1, 1, 1).data[3]);
  }

  for (let y = 0; y < height; y += step) {
    samples.push(context.getImageData(0, y, 1, 1).data[3]);
    samples.push(context.getImageData(width - 1, y, 1, 1).data[3]);
  }

  return samples.some((alpha) => alpha < 250);
}

async function extractPortraitMatteColor(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      return null;
    }

    context.drawImage(bitmap, 0, 0);
    const sampleSize = Math.max(3, Math.floor(Math.min(canvas.width, canvas.height) * 0.03));
    const anchors = [
      0,
      Math.floor(canvas.height * 0.25),
      Math.floor(canvas.height * 0.5),
    ];
    const samples = [];

    for (const y of anchors) {
      samples.push(...sampleMatteWindow(context, canvas.width, canvas.height, 0, y, sampleSize));
      samples.push(...sampleMatteWindow(context, canvas.width, canvas.height, canvas.width - sampleSize, y, sampleSize));
    }

    const validSamples = samples.filter((sample) => sample.alpha > 0);
    if (!validSamples.length) {
      return null;
    }

    const median = {
      red: medianSampleChannel(validSamples.map((sample) => sample.red)),
      green: medianSampleChannel(validSamples.map((sample) => sample.green)),
      blue: medianSampleChannel(validSamples.map((sample) => sample.blue)),
    };

    const ranked = validSamples
      .map((sample) => ({ sample, distance: sampleDistance(sample, median) }))
      .sort((left, right) => left.distance - right.distance);

    const inliers = ranked
      .filter(({ distance }) => distance <= 32)
      .map(({ sample }) => sample);

    const resolvedSamples = inliers.length >= 6
      ? inliers
      : ranked.slice(0, Math.min(12, ranked.length)).map(({ sample }) => sample);

    const average = averageSampleColor(resolvedSamples);
    return `rgb(${Math.round(average.red)} ${Math.round(average.green)} ${Math.round(average.blue)})`;
  } catch {
    return null;
  }
}

function sampleMatteWindow(context, width, height, startX, startY, sampleSize) {
  const samples = [];
  const clampedStartX = Math.max(0, Math.min(width - 1, startX));
  const clampedStartY = Math.max(0, Math.min(height - 1, startY));
  const endX = Math.min(width, clampedStartX + sampleSize);
  const endY = Math.min(height, clampedStartY + sampleSize);

  for (let y = clampedStartY; y < endY; y += 1) {
    for (let x = clampedStartX; x < endX; x += 1) {
      const data = context.getImageData(x, y, 1, 1).data;
      samples.push({
        red: data[0],
        green: data[1],
        blue: data[2],
        alpha: data[3],
      });
    }
  }

  return samples;
}

function medianSampleChannel(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) {
    return 0;
  }

  return sorted[Math.floor(sorted.length / 2)];
}

function sampleDistance(sample, reference) {
  const redDelta = sample.red - reference.red;
  const greenDelta = sample.green - reference.green;
  const blueDelta = sample.blue - reference.blue;
  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function averageSampleColor(samples) {
  if (!samples.length) {
    return { red: 0, green: 0, blue: 0 };
  }

  const total = samples.reduce((accumulator, sample) => {
    accumulator.red += sample.red;
    accumulator.green += sample.green;
    accumulator.blue += sample.blue;
    return accumulator;
  }, { red: 0, green: 0, blue: 0 });

  return {
    red: total.red / samples.length,
    green: total.green / samples.length,
    blue: total.blue / samples.length,
  };
}

function applyPortraitMatte(element, matteColor) {
  if (!element) {
    return;
  }

  if (!matteColor) {
    clearPortraitMatte(element);
    return;
  }

  element.style.setProperty("--portrait-matte", matteColor);
}

function clearPortraitMatte(element) {
  if (!element) {
    return;
  }

  element.style.removeProperty("--portrait-matte");
  delete element.dataset.headshotMode;
}

function applyPlayerFallback(element, alt) {
  element.onerror = null;
  element.src = inlineFallbackSilhouette();
  element.alt = alt ? `${alt} fallback silhouette` : "Player fallback silhouette";
  element.hidden = false;
  clearPortraitMatte(element);
  element.classList.add("has-image", "is-fallback");
}

function inlineFallbackSilhouette() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <rect width="120" height="120" rx="24" fill="#11233a"/>
      <circle cx="60" cy="42" r="20" fill="#8faac4"/>
      <path d="M28 98c4-20 20-31 32-31s28 11 32 31" fill="#8faac4"/>
    </svg>
  `);
}


// ----- Linescore rendering -----

// The linescore is table-based so it can always show innings 1-9 while still
// expanding naturally for extra innings.
function renderLinescore(linescore, options = {}) {
  if (!linescore.length) {
    elements.linescore.innerHTML = `<div class="linescore-empty">${escapeHtml(options.emptyMessage || "Waiting for inning-by-inning data.")}</div>`;
    return;
  }

  const awayLabel = options.awayLabel || state.current?.live?.away?.abbr || state.current?.live?.away?.name || "AWY";
  const homeLabel = options.homeLabel || state.current?.live?.home?.abbr || state.current?.live?.home?.name || "HME";
  const awayLogo = options.awayLogo || state.current?.live?.away?.logoUrl || "";
  const homeLogo = options.homeLogo || state.current?.live?.home?.logoUrl || "";
  const displayedInnings = buildDisplayedInnings(linescore);
  const awayTotals = options.awayTotals || calculateLinescoreTotals(displayedInnings, "away");
  const homeTotals = options.homeTotals || calculateLinescoreTotals(displayedInnings, "home");
  const awayLabelClass = options.awayLabelClass ? ` ${options.awayLabelClass}` : "";
  const homeLabelClass = options.homeLabelClass ? ` ${options.homeLabelClass}` : "";
  const activeInning = Number(state.current?.live?.inning) || null;
  const inningHalf = resolveDisplayedInningHalf(
    state.current?.live?.inningHalf,
    state.current?.live?.outs
  );

  const inningHeaderCells = displayedInnings.map((entry) => (
    `<th scope="col" class="linescore-inning-header-cell${entry.inning === activeInning ? " is-current-inning" : ""}">${entry.inning}</th>`
  )).join("");

  const awayCells = displayedInnings.map((entry) => (
    `<td class="${buildLinescoreCellClass(entry.inning, "away", activeInning, inningHalf)}">${formatLinescoreCell(entry.away)}</td>`
  )).join("");

  const homeCells = displayedInnings.map((entry) => (
    `<td class="${buildLinescoreCellClass(entry.inning, "home", activeInning, inningHalf)}">${formatLinescoreCell(entry.home)}</td>`
  )).join("");

  elements.linescore.innerHTML = `
    <div class="linescore-table-wrap">
      <table class="linescore-table">
        <thead>
          <tr>
            <th scope="col" class="linescore-team-spacer"></th>
            ${inningHeaderCells}
            <th scope="col" class="linescore-total-header">R</th>
            <th scope="col" class="linescore-total-header">H</th>
            <th scope="col" class="linescore-total-header">E</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" class="linescore-team-label${awayLabelClass}">${buildLinescoreTeamLabelMarkup(awayLabel, awayLogo)}</th>
            ${awayCells}
            <td class="linescore-total-cell">${awayTotals.runs}</td>
            <td class="linescore-total-cell">${awayTotals.hits}</td>
            <td class="linescore-total-cell">${awayTotals.errors}</td>
          </tr>
          <tr>
            <th scope="row" class="linescore-team-label${homeLabelClass}">${buildLinescoreTeamLabelMarkup(homeLabel, homeLogo)}</th>
            ${homeCells}
            <td class="linescore-total-cell">${homeTotals.runs}</td>
            <td class="linescore-total-cell">${homeTotals.hits}</td>
            <td class="linescore-total-cell">${homeTotals.errors}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

// Keep the card visually stable by padding to at least 9 innings.
function buildDisplayedInnings(linescore) {
  const inningCount = Math.max(9, linescore.length);
  return Array.from({ length: inningCount }, (_, index) => {
    const inningNumber = index + 1;
    const existing = linescore[index];

    if (existing) {
      return {
        inning: existing.inning ?? inningNumber,
        away: existing.away ?? null,
        home: existing.home ?? null,
      };
    }

    return {
      inning: inningNumber,
      away: null,
      home: null,
    };
  });
}

// Highlight the active half-inning and dim future half-innings.
function buildLinescoreCellClass(inningNumber, side, activeInning, inningHalf) {
  const classes = ["linescore-cell"];

  if (isActiveLinescoreCell(inningNumber, side, activeInning, inningHalf)) {
    classes.push("is-active");
  } else if (isUnplayedLinescoreCell(inningNumber, side, activeInning, inningHalf)) {
    classes.push("is-unplayed");
  }

  return classes.join(" ");
}

function normalizeInningHalf(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveDisplayedInningHalf(value, outs = 0) {
  const normalized = normalizeInningHalf(value);
  const numericOuts = Number(outs || 0);

  if (normalized.startsWith("mid") || normalized.startsWith("middle") || normalized.startsWith("end")) {
    return normalized;
  }

  if (numericOuts >= 3) {
    if (normalized.startsWith("top")) {
      return "mid";
    }
    if (normalized.startsWith("bottom")) {
      return "end";
    }
  }

  return normalized;
}

function isActiveLinescoreCell(inningNumber, side, activeInning, inningHalf) {
  if (!activeInning || inningNumber !== activeInning) {
    return false;
  }

  return (
    (inningHalf.startsWith("top") && side === "away") ||
    (inningHalf.startsWith("bottom") && side === "home")
  );
}

function isUnplayedLinescoreCell(inningNumber, side, activeInning, inningHalf) {
  if (!activeInning) {
    return false;
  }

  if (inningNumber > activeInning) {
    return true;
  }

  if (inningNumber < activeInning) {
    return false;
  }

  return (
    (inningHalf.startsWith("top") || inningHalf.startsWith("mid")) &&
    side === "home"
  );
}

// ----- UI-only timers -----

// Countdown and elapsed-time updates are display concerns, so they live on the
// main thread and tick once per second without involving the worker.
function restartCountdown(nextState) {
  window.clearInterval(state.countdownTimer);
  updateCountdown(nextState);

  const shouldRunCountdown = Boolean(
    (nextState?.nextGame?.countdownTargetMs &&
      (nextState.mode === "pregame" || nextState.mode === "final")) ||
    (nextState?.mode === "live" && nextState?.live?.startTime)
  );

  if (!shouldRunCountdown) {
    return;
  }

  state.countdownTimer = window.setInterval(() => {
    updateCountdown(state.current);
  }, 1000);
}

function updateCountdown(nextState) {
  if (nextState?.mode === "live") {
    elements.countdown.textContent = "";
    setElapsedTime(nextState?.live?.startTime || null);
    return;
  }

  setElapsedTime(null);

  const countdownTargetMs = nextState?.nextGame?.countdownTargetMs || null;
  const statusText = nextState?.nextGame?.statusText || "";
  const suppressCountdown = nextState?.mode === "pregame" && isSpecialPregameStatus(statusText);
  const canShowCountdown = Boolean(
    countdownTargetMs &&
    (nextState?.mode === "pregame" || nextState?.mode === "final") &&
    !suppressCountdown
  );

  if (!canShowCountdown) {
    if (suppressCountdown) {
      elements.countdown.textContent = statusCountdownLabel(statusText);
      return;
    }
    elements.countdown.textContent = "FINAL";
    return;
  }

  const delta = Math.max(0, countdownTargetMs - Date.now());
  const totalSeconds = Math.floor(delta / 1000);
  elements.countdown.innerHTML = renderLaunchCountdownMarkup(totalSeconds);
}

function setElapsedTime(startTime) {
  if (!elements.elapsedTime) {
    return;
  }

  const formatted = formatElapsedGameTime(startTime);
  if (!formatted) {
    elements.elapsedTime.hidden = true;
    elements.elapsedTime.innerHTML = "";
    return;
  }

  elements.elapsedTime.hidden = false;
  elements.elapsedTime.innerHTML = `
    <span class="elapsed-label">Elapsed</span>
    <span class="elapsed-value">${escapeHtml(formatted)}</span>
  `;
}

function formatElapsedGameTime(startTime) {
  if (!startTime) {
    return "";
  }

  const startMs = new Date(startTime).getTime();
  if (!Number.isFinite(startMs)) {
    return "";
  }

  const deltaMs = Math.max(0, Date.now() - startMs);
  const totalMinutes = Math.floor(deltaMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}H ${String(minutes).padStart(2, "0")}M`;
  }

  return `${Math.max(0, minutes)}M`;
}

function formatLaunchCountdown(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = String(safeSeconds % 60).padStart(2, "0");

  if (hours > 0) {
    return `-${hours}H ${minutes}M ${seconds}S`;
  }

  if (minutes > 0) {
    return `-${minutes}M ${seconds}S`;
  }

  return `-${seconds}S`;
}

function renderLaunchCountdownMarkup(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  const segments = [];

  if (hours > 0) {
    segments.push({ value: String(hours), unit: "H" });
  }

  if (hours > 0 || minutes > 0) {
    segments.push({ value: String(minutes), unit: "M" });
  }

  segments.push({ value: seconds, unit: "S" });

  const segmentMarkup = segments
    .map((segment) => `<span class="countdown-segment"><span class="countdown-value">${escapeHtml(segment.value)}</span><span class="countdown-unit">${segment.unit}</span></span>`)
    .join("");

  return `<span class="countdown-launch" aria-label="${escapeHtml(formatLaunchCountdown(safeSeconds))}"><span class="countdown-sign">-</span>${segmentMarkup}</span>`;
}

function renderBannerFromState(nextState) {
  const hasError = Boolean(nextState.meta?.lastError);
  const message = hasError
    ? nextState.meta.lastError
    : nextState.meta?.sourceStatus || "Mock shell loaded. Worker and real data wiring come next.";
  setBanner(message, hasError);
}

function setBanner(message, isError) {
  elements.statusBanner.textContent = message;
  elements.statusBanner.classList.toggle("is-error", Boolean(isError));
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEYS.lastState, JSON.stringify(nextState));
}

function loadCachedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.lastState);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatDateTime(value) {
  if (!value) {
    return "TBD";
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatScheduleWeekday(value) {
  if (!value) {
    return "---";
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(new Date(value)).toUpperCase();
}

function formatScheduleDayNumber(value) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
  }).format(new Date(value));
}

function formatScheduleTime(value, statusText = "") {
  if (isSpecialPregameStatus(statusText)) {
    return statusCountdownLabel(statusText);
  }

  if (!value) {
    return "TBD";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimestamp(value) {
  if (!value) {
    return "Waiting for update";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatTimestampForClock(value) {
  if (!value) {
    return "--:--:--";
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatInningState(inningHalf, inning) {
  const half = String(inningHalf || "").trim();
  const numericInning = Number(inning);

  if (!half && !numericInning) {
    return "";
  }

  if (!numericInning) {
    return half;
  }

  return `${formatInningHalfText(half)} ${formatOrdinal(numericInning)}`.trim();
}

function setCenterStateInning(inningHalf, inning) {
  if (!elements.centerState) {
    return;
  }

  const markup = formatInningStateMarkup(inningHalf, inning);
  const label = formatInningState(inningHalf, inning) || "In Progress";

  if (!markup) {
    elements.centerState.textContent = "In Progress";
    elements.centerState.removeAttribute("aria-label");
    return;
  }

  elements.centerState.innerHTML = markup;
  elements.centerState.setAttribute("aria-label", label);
}

function setCenterStateText(value) {
  if (!elements.centerState) {
    return;
  }

  elements.centerState.textContent = value || "";
  elements.centerState.removeAttribute("aria-label");
}

function formatInningStateMarkup(inningHalf, inning) {
  const numericInning = Number(inning);
  const normalizedHalf = normalizeInningHalf(inningHalf);

  if (!normalizedHalf && !numericInning) {
    return "";
  }

  if (!numericInning) {
    return escapeHtml(formatInningHalfText(inningHalf));
  }

  const indicator = inningHalfIndicatorMarkup(normalizedHalf);
  const ordinal = formatOrdinalParts(numericInning);

  return `
    <span class="inning-state-markup">
      <span class="inning-state-indicator" aria-hidden="true">${indicator}</span>
      <span class="inning-state-value">
        <span class="inning-state-number">${escapeHtml(String(ordinal.number))}</span>
        <span class="inning-state-suffix">${escapeHtml(ordinal.suffix)}</span>
      </span>
    </span>
  `.trim();
}

function inningHalfIndicatorMarkup(inningHalf) {
  if (inningHalf.startsWith("top")) {
    return '<span class="inning-state-indicator-icon is-top"></span>';
  }
  if (inningHalf.startsWith("bottom")) {
    return '<span class="inning-state-indicator-icon is-bottom"></span>';
  }
  if (inningHalf.startsWith("end")) {
    return '<span class="inning-state-indicator-icon is-end">END</span>';
  }
  if (inningHalf.startsWith("mid") || inningHalf.startsWith("middle")) {
    return '<span class="inning-state-indicator-icon is-mid">MID</span>';
  }
  return '<span class="inning-state-indicator-icon is-mid">MID</span>';
}

function formatInningHalfText(value) {
  const normalized = normalizeInningHalf(value);
  if (normalized.startsWith("top")) {
    return "Top";
  }
  if (normalized.startsWith("bottom")) {
    return "Bottom";
  }
  if (normalized.startsWith("mid") || normalized.startsWith("middle")) {
    return "Mid";
  }
  if (normalized.startsWith("end")) {
    return "End";
  }
  return String(value || "").trim();
}

function formatOrdinal(value) {
  const parts = formatOrdinalParts(value);
  return `${parts.number}${parts.suffix}`;
}

function formatOrdinalParts(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return {
      number: String(value || ""),
      suffix: "",
    };
  }

  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return { number, suffix: "th" };
  }

  const mod10 = number % 10;
  if (mod10 === 1) {
    return { number, suffix: "st" };
  }
  if (mod10 === 2) {
    return { number, suffix: "nd" };
  }
  if (mod10 === 3) {
    return { number, suffix: "rd" };
  }
  return { number, suffix: "th" };
}

function basesText(bases) {
  if (!bases) {
    return "Bases unknown";
  }
  const occupied = [
    bases.first ? "1B" : null,
    bases.second ? "2B" : null,
    bases.third ? "3B" : null,
  ].filter(Boolean);
  return occupied.length ? `Runners on ${occupied.join(", ")}` : "Bases empty";
}

function handednessLabel(label, value) {
  return value ? `${label}: ${value}` : "";
}

function formatPitchHandLong(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "R") {
    return "Right";
  }
  if (normalized === "L") {
    return "Left";
  }
  if (normalized === "S") {
    return "Switch";
  }
  return value || "";
}

function buildProbablePitcherMeta(teamName, roleLabel, throwsValue) {
  const lines = [`${teamName || "Team"} ${roleLabel}`];
  const fullHand = formatPitchHandLong(throwsValue);
  if (fullHand) {
    lines.push(`Throws: ${fullHand}`);
  }
  return lines.join("\n");
}

function resolveProbablePitcherName(pitcher, teamName) {
  if (pitcher?.name) {
    return pitcher.name;
  }
  return teamName ? `${teamName} starter TBD` : "Probable pitcher TBD";
}

function renderCountSummary(live) {
  return `
    <span class="count-layout">
      <span class="count-chip">
        <span class="count-chip-label">BALLS</span>
        <span class="count-chip-value">${live?.balls ?? 0}</span>
      </span>
      <span class="count-chip">
        <span class="count-chip-label">STRIKES</span>
        <span class="count-chip-value">${live?.strikes ?? 0}</span>
      </span>
      <span class="count-chip">
        <span class="count-chip-label">OUTS</span>
        <span class="count-chip-value">${live?.outs ?? 0}</span>
      </span>
    </span>
  `;
}

function formatLinescoreCell(value) {
  return value == null ? "" : String(value);
}

function calculateLinescoreTotals(linescore, side) {
  const fallbackRuns = linescore.reduce((sum, inning) => sum + (inning?.[side] ?? 0), 0);
  const liveTotals = state.current?.live?.[side];

  return {
    runs: liveTotals?.score ?? fallbackRuns,
    hits: liveTotals?.hits ?? "-",
    errors: liveTotals?.errors ?? "-",
  };
}

function buildFixedLinescoreTotals(score, hits = null, errors = null) {
  return {
    runs: score ?? "-",
    hits: hits ?? "-",
    errors: errors ?? "-",
  };
}

function buildPreviousGameWinnerLabelClass(previousGame, side) {
  const winnerSide = resolveWinningLinescoreSide(previousGame?.awayScore, previousGame?.homeScore);
  return winnerSide === side ? "is-winner" : "";
}

function resolveWinningLinescoreSide(awayScore, homeScore) {
  const awayRuns = Number(awayScore);
  const homeRuns = Number(homeScore);

  if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns) || awayRuns === homeRuns) {
    return null;
  }

  return awayRuns > homeRuns ? "away" : "home";
}

function renderDebugState(nextState) {
  if (!elements.debugOutput) {
    return;
  }

  const debugState = {
    appVersion: state.debug.appVersion,
    workerStatus: state.debug.workerStatus,
    lastWorkerError: state.debug.lastWorkerError,
    mode: nextState?.mode || null,
      status: nextState?.live?.status || nextState?.final?.summary || null,
      team: nextState?.team || null,
      nextGame: nextState?.nextGame || null,
      activeGames: nextState?.activeGames || null,
      upcomingSchedule: nextState?.upcomingSchedule || null,
      previousGame: nextState?.previousGame || null,
      probablePitchers: nextState?.nextGame?.probablePitchers || null,
      celebration: extractStateCelebration(nextState),
      meta: nextState?.meta || null,
  };

  elements.debugOutput.textContent = JSON.stringify(debugState, null, 2);
}

function setFooterSlots(slot1, slot2, slot3) {
  const slots = [
    [elements.footerSlot1Label, elements.footerSlot1Value, slot1],
    [elements.footerSlot2Label, elements.footerSlot2Value, slot2],
    [elements.footerSlot3Label, elements.footerSlot3Value, slot3],
  ];

  for (const [labelEl, valueEl, slot] of slots) {
    if (!labelEl || !valueEl) {
      continue;
    }
    labelEl.textContent = slot?.[0] || "";
    valueEl.textContent = slot?.[1] || "";
    const wrapper = labelEl.parentElement;
    if (wrapper) {
      wrapper.hidden = !(slot?.[0] || slot?.[1]);
    }
  }
}

// ----- Shared UI helpers -----

function setStateLayout(mode) {
  const isLive = mode === "live";
  if (elements.heroFooter) {
    elements.heroFooter.hidden = true;
    elements.heroFooter.classList.add("is-hidden");
  }
  if (elements.matchupGrid) {
    elements.matchupGrid.hidden = true;
    elements.matchupGrid.classList.add("is-hidden");
  }
  if (elements.detailsGrid) {
    elements.detailsGrid.classList.add("details-grid-live");
  }
  if (elements.awaySide) {
    elements.awaySide.classList.add("score-side-compact");
    elements.awaySide.classList.toggle("score-side-live", isLive);
  }
  if (elements.homeSide) {
    elements.homeSide.classList.add("score-side-compact");
    elements.homeSide.classList.toggle("score-side-live", isLive);
  }
}

function formatBoxSummary(team) {
  const runs = team?.score ?? "-";
  const hits = team?.hits ?? "-";
  const errors = team?.errors ?? "-";
  return `R ${runs} | H ${hits} | E ${errors}`;
}

function isSpecialPregameStatus(value) {
  const text = String(value || "").toLowerCase();
  return (
    text.includes("postpon") ||
    text.includes("delay") ||
    text.includes("suspend") ||
    text.includes("cancel")
  );
}

function statusCountdownLabel(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("postpon")) {
    return "POSTPONED";
  }
  if (text.includes("delay")) {
    return "DELAYED";
  }
  if (text.includes("suspend")) {
    return "SUSPENDED";
  }
  if (text.includes("cancel")) {
    return "CANCELLED";
  }
  return "STATUS";
}

function formatPregameStatusDetail(game) {
  return buildPregameDetailMarkup(game);
}

// The mini-diamond shows both runner occupancy and the three outs dots.
function setMiniBases(bases, outs = 0) {
  if (!elements.basesMini) {
    return;
  }

  elements.basesMini.classList.toggle("is-visible", Boolean(bases));

  const dots = elements.basesMini.querySelectorAll(".base-dot");
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index < Number(outs || 0));
  });

  const diamond = elements.basesMini.querySelector(".base-diamond");
  if (!diamond) {
    return;
  }

  diamond.querySelector(".base.first")?.classList.toggle("is-active", Boolean(bases?.first));
  diamond.querySelector(".base.second")?.classList.toggle("is-active", Boolean(bases?.second));
  diamond.querySelector(".base.third")?.classList.toggle("is-active", Boolean(bases?.third));
}

function setRecord(element, record) {
  if (!element) {
    return;
  }

  element.textContent = record || "";
  element.hidden = !record;
  element.style.display = record ? "block" : "none";
}

function assignLiveRoleCards(live) {
  const inningHalf = String(live?.inningHalf || "").toLowerCase();
  const awayBatting = inningHalf === "top";
  const homeBatting = inningHalf === "bottom";

  setLiveRoleCard("away", awayBatting ? buildLiveRoleConfig("At Bat", live?.batter, "batter") : buildLiveRoleConfig("Pitching", live?.pitcher, "pitcher"));
  setLiveRoleCard("home", homeBatting ? buildLiveRoleConfig("At Bat", live?.batter, "batter") : buildLiveRoleConfig("Pitching", live?.pitcher, "pitcher"));
}

// These hero-side cards are compact versions of the larger player cards.
function buildLiveRoleConfig(label, player, kind) {
  if (!player) {
    return {
      label,
      photo: "",
      name: kind === "batter" ? "Batter unavailable" : "Pitcher unavailable",
      meta: "",
      stats: null,
      badgeText: "",
    };
  }

    return {
      label,
      photo: player.photo || "",
      name: player.name || (kind === "batter" ? "Batter unavailable" : "Pitcher unavailable"),
      meta: kind === "batter"
        ? [player.position, handednessLabel("Bats", player.bats)].filter(Boolean).join(" | ")
        : [handednessLabel("Throws", player.throws)].filter(Boolean).join(" | "),
      stats: kind === "batter"
        ? buildBatterStatsConfig(player, { compact: true, hideSummaryLabel: true })
        : buildPitcherStatsConfig(player, { compact: true, includeToday: true, hideSummaryLabel: true }),
      badgeText: kind === "batter"
        ? formatBattingOrderDisplay(player.battingOrder)
        : formatPitchCountDisplay(player.pitchCount),
    };
  }

function setLiveRoleCard(side, config) {
  const isAway = side === "away";
  const card = isAway ? elements.awayLiveRole : elements.homeLiveRole;
  const label = isAway ? elements.awayLiveRoleLabel : elements.homeLiveRoleLabel;
  const photo = isAway ? elements.awayLiveRolePhoto : elements.homeLiveRolePhoto;
  const name = isAway ? elements.awayLiveRoleName : elements.homeLiveRoleName;
  const meta = isAway ? elements.awayLiveRoleMeta : elements.homeLiveRoleMeta;
  const stats = isAway ? elements.awayLiveRoleStats : elements.homeLiveRoleStats;

  if (!card || !label || !photo || !name || !meta || !stats) {
    return;
  }

  if (!config) {
    card.hidden = true;
    label.hidden = true;
    stats.innerHTML = "";
    stats.hidden = true;
    setPlayerBadgeText(card, "");
    return;
  }

  card.hidden = false;
  label.textContent = config.label;
  label.hidden = true;
  name.textContent = config.name || "";
  meta.textContent = config.meta || "";
  setImage(photo, config.photo || "", config.name || config.label, { usePlayerFallback: true });
  setPlayerBadgeText(card, config.badgeText || "");
  const statsMarkup = buildStatBlockMarkup(config.stats, "compact");
  stats.innerHTML = statsMarkup;
  stats.hidden = !statsMarkup;
}

function liveLogoUrl(team) {
  if (!team) {
    return "";
  }
  if (team.logoUrl) {
    return team.logoUrl;
  }
  return team.id ? `https://www.mlbstatic.com/team-logos/${team.id}.svg` : "";
}

function setStanding(element, standing) {
  if (!element) {
    return;
  }

  element.textContent = standing || "";
  element.hidden = !standing;
  element.style.display = standing ? "block" : "none";
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

// ----- Watermark logo system -----

// Team watermarks are CSS-driven. This helper passes the logo URL plus a small
// amount of per-team tuning through CSS custom properties.
function setSideWatermark(element, src, side = "") {
  if (!element) {
    return;
  }

  element.classList.remove("has-watermark", "watermark-left", "watermark-right");
  element.style.removeProperty("--side-logo");
  element.style.removeProperty("--side-watermark-position");
  element.style.removeProperty("--side-watermark-opacity");

  if (!src) {
    return;
  }

  element.style.setProperty("--side-logo", `url("${src}")`);
  const teamId = extractTeamIdFromLogoUrl(src);
  element.style.setProperty("--side-watermark-position", buildWatermarkPosition(teamId, side));
  element.style.setProperty("--side-watermark-opacity", String(buildWatermarkOpacity(teamId)));
  element.classList.add("has-watermark");

  if (side === "left" || side === "right") {
    element.classList.add(`watermark-${side}`);
  }
}

function extractTeamIdFromLogoUrl(src) {
  const match = String(src || "").match(/team-logos\/(\d+)\.svg/i);
  return match ? Number(match[1]) : null;
}

// Some logos are dense and round; others are thin outline marks. Keep team-
// specific watermark tuning in one place so visual tweaks stay reviewable.
const WATERMARK_PROFILES = new Map([
  [108, { opacity: 0.088, inset: 54 }], // Angels
  [109, { opacity: 0.058 }], // Diamondbacks
  [110, { opacity: 0.058 }], // Orioles
  [111, { opacity: 0.09, inset: 48 }], // Red Sox
  [112, { opacity: 0.05 }], // Cubs
  [113, { opacity: 0.092 }], // Reds
  [114, { opacity: 0.115, inset: 56 }], // Guardians
  [115, { opacity: 0.068 }], // Rockies
  [116, { opacity: 0.1, inset: 48 }], // Tigers
  [117, { opacity: 0.055 }], // Astros
  [118, { opacity: 0.065 }], // Royals
  [119, { opacity: 0.09 }], // Dodgers
  [120, { opacity: 0.08 }], // Nationals
  [121, { opacity: 0.085 }], // Mets
  [133, { opacity: 0.056 }], // Athletics
  [134, { opacity: 0.1 }], // Pirates
  [135, { opacity: 0.09 }], // Padres
  [136, { opacity: 0.115, inset: 58 }], // Mariners
  [137, { opacity: 0.095 }], // Giants
  [138, { opacity: 0.092, inset: 44 }], // Cardinals
  [139, { opacity: 0.055 }], // Rays
  [140, { opacity: 0.088 }], // Rangers
  [141, { opacity: 0.05 }], // Blue Jays
  [142, { opacity: 0.072 }], // Twins
  [143, { opacity: 0.086, inset: 50 }], // Phillies
  [144, { opacity: 0.105, inset: 64 }], // Braves
  [145, { opacity: 0.105 }], // White Sox
  [146, { opacity: 0.062 }], // Marlins
  [147, { opacity: 0.08 }], // Yankees
]);

function buildWatermarkPosition(teamId, side) {
  const defaultPosition = side === "left" ? "left center" : side === "right" ? "right center" : "center center";
  const profile = WATERMARK_PROFILES.get(teamId);

  if (profile?.inset) {
    const inset = profile.inset;
    return side === "left" ? `${inset}px center` : side === "right" ? `calc(100% - ${inset}px) center` : defaultPosition;
  }

  return defaultPosition;
}

function buildWatermarkOpacity(teamId) {
  return WATERMARK_PROFILES.get(teamId)?.opacity || 0.05;
}

function setNotesMeta(leftLabel, leftValue, rightLabel, rightValue) {
  if (elements.notesMetaRow) {
    elements.notesMetaRow.hidden = false;
  }
  setNotesMetaSlot(elements.notesMeta1, elements.notesMeta1Label, elements.teamProbable, leftLabel, leftValue);
  setNotesMetaSlot(elements.notesMeta2, elements.notesMeta2Label, elements.opponentProbable, rightLabel, rightValue);
}

function setNotesTitle(value) {
  if (!elements.notesLabel) {
    return;
  }
  elements.notesLabel.textContent = value || "Game Notes";
}

function hideUpcomingSchedule() {
  if (!elements.upcomingSchedule) {
    return;
  }
  elements.upcomingSchedule.hidden = true;
  elements.upcomingSchedule.innerHTML = "";
}

// Pregame schedule items stay intentionally compact so the user can see the
// next few dates without introducing horizontal scroll.
function renderUpcomingSchedule(scheduleItems) {
  setNotesTitle("Upcoming Schedule");
  hideUpcomingSchedule();

  if (elements.notesMetaRow) {
    elements.notesMetaRow.hidden = true;
  }

  if (elements.recentPlay) {
    elements.recentPlay.textContent = "";
    elements.recentPlay.hidden = true;
  }

  if (!elements.upcomingSchedule) {
    return;
  }

  const items = Array.isArray(scheduleItems) ? scheduleItems.slice(0, 5) : [];

  if (!items.length) {
    elements.upcomingSchedule.hidden = false;
    elements.upcomingSchedule.innerHTML = '<div class="schedule-empty">No additional games scheduled in this window.</div>';
    return;
  }

  elements.upcomingSchedule.hidden = false;
  elements.upcomingSchedule.innerHTML = `
    <div class="schedule-strip" style="--schedule-columns: ${Math.max(items.length, 1)};">
      ${items.map((item) => renderScheduleItem(item)).join("")}
    </div>
  `;
}

function renderActiveGames(nextState) {
  if (!elements.activeGamesPanel || !elements.activeGamesStrip || !elements.activeGamesTitle) {
    return;
  }

  const currentGamePk = nextState?.live?.gamePk || nextState?.nextGame?.gamePk || nextState?.final?.gamePk || null;
  const activeItems = (Array.isArray(nextState?.activeGames) ? nextState.activeGames : [])
    .filter((game) => game?.gamePk && game.gamePk !== currentGamePk);
  const recentItems = (Array.isArray(nextState?.recentGames) ? nextState.recentGames : [])
    .filter((game) => game?.gamePk && game.gamePk !== currentGamePk);

  if (!activeItems.length && !recentItems.length) {
    elements.activeGamesPanel.hidden = true;
    elements.activeGamesStrip.innerHTML = "";
    elements.activeGamesTitle.textContent = "Other Active Games";
    if (elements.activeGamesMeta) {
      elements.activeGamesMeta.textContent = "";
    }
    return;
  }

  const isFallbackFinalBoard = !activeItems.length;
  const items = isFallbackFinalBoard ? recentItems : activeItems;

  elements.activeGamesPanel.hidden = false;
  elements.activeGamesTitle.textContent = isFallbackFinalBoard ? "Recent Final Scores" : "Other Active Games";
  if (elements.activeGamesMeta) {
    elements.activeGamesMeta.textContent = isFallbackFinalBoard
      ? `${items.length} recent final${items.length === 1 ? "" : "s"} elsewhere`
      : `${items.length} game${items.length === 1 ? "" : "s"} live elsewhere`;
  }

  elements.activeGamesStrip.innerHTML = items.map((item) => renderActiveGameCard(item)).join("");
}

function buildLinescoreTeamLabelMarkup(label, logoUrl) {
  const safeLabel = escapeHtml(label || "");
  const logoSrc = String(logoUrl || "").trim();

  if (!logoSrc) {
    return `<span class="linescore-team-identity"><span class="linescore-team-text">${safeLabel}</span></span>`;
  }

  return `
    <span class="linescore-team-identity">
      ${buildLogoBadgeMarkup(logoSrc, "", {
        variant: "inline",
        imageClass: "linescore-team-logo",
        badgeClassName: "linescore-logo-badge",
      })}
      <span class="linescore-team-text">${safeLabel}</span>
    </span>
  `;
}

function renderActiveGameCard(item) {
  const homeTeamId = Number(item?.homeTeamId);
  const awayName = item?.away?.name || "Away";
  const homeName = item?.home?.name || "Home";
  const awayAbbr = escapeHtml(item?.away?.abbr || awayName);
  const homeAbbr = escapeHtml(item?.home?.abbr || homeName);
  const awayLogo = item?.away?.logoUrl || "";
  const homeLogo = item?.home?.logoUrl || "";
  const awayScore = escapeHtml(String(item?.away?.score ?? "-"));
  const homeScore = escapeHtml(String(item?.home?.score ?? "-"));
  const status = escapeHtml(item?.status || "Live");
  const actionLabel = escapeHtml(item?.actionLabel || "Home Team");
  const label = escapeHtml(`Open ${homeName} dashboard`);
  const winnerSide = item?.winnerSide === "away" || item?.winnerSide === "home" ? item.winnerSide : "";
  const cardClassName = item?.kind === "final"
    ? "active-game-card active-game-card-final"
    : "active-game-card";
  const awayWinnerClass = winnerSide === "away" ? " is-winner" : "";
  const homeWinnerClass = winnerSide === "home" ? " is-winner" : "";

  return `
    <button
      class="${cardClassName}"
      type="button"
      data-home-team-id="${Number.isFinite(homeTeamId) ? homeTeamId : ""}"
      aria-label="${label}"
    >
      <div class="active-game-card-header">
        <span class="active-game-card-status">${status}</span>
        <span class="active-game-card-action">${actionLabel}</span>
      </div>
      <div class="active-game-card-body">
        <div class="active-game-team-row">
          <div class="active-game-team-label${awayWinnerClass}">
            ${buildLogoBadgeMarkup(awayLogo, `${awayName} logo`, { variant: "inline", imageClass: "active-game-team-logo" })}
            <span>${awayAbbr}</span>
          </div>
          <span class="active-game-team-score">${awayScore}</span>
        </div>
        <div class="active-game-team-row">
          <div class="active-game-team-label${homeWinnerClass}">
            ${buildLogoBadgeMarkup(homeLogo, `${homeName} logo`, { variant: "inline", imageClass: "active-game-team-logo" })}
            <span>${homeAbbr}</span>
          </div>
          <span class="active-game-team-score">${homeScore}</span>
        </div>
      </div>
    </button>
  `;
}

function renderScheduleItem(item) {
  const weekday = formatScheduleWeekday(item?.startTime);
  const day = formatScheduleDayNumber(item?.startTime);
  const time = formatScheduleTime(item?.startTime, item?.statusText);
  const opponentName = item?.opponentName || "Opponent";
  const siteLabel = item?.isHome ? "vs" : "@";
  const logo = item?.opponentLogoUrl || "";
  const alt = `${opponentName} logo`;

  return `
    <article class="schedule-item">
      <p class="schedule-item-date">
        <span class="schedule-item-weekday">${weekday}</span>
        <span class="schedule-item-day">${day}</span>
      </p>
      <p class="schedule-item-site">${siteLabel}</p>
      <div class="schedule-item-logo-wrap">
        ${buildLogoBadgeMarkup(logo, alt, { imageClass: "schedule-item-logo", placeholderClass: "schedule-item-logo-placeholder" })}
      </div>
      <p class="schedule-item-time">${time}</p>
    </article>
  `;
}

function buildLogoBadgeMarkup(logoUrl, alt, options = {}) {
  const {
    variant = "default",
    imageClass = "",
    placeholderClass = "",
    badgeClassName = "",
  } = options;
  const logoSrc = String(logoUrl || "").trim();
  const badgeClass = variant === "inline"
    ? "logo-badge logo-badge-inline"
    : "logo-badge";
  const finalBadgeClass = `${badgeClass} ${badgeClassName}`.trim();
  const badgeStyle = escapeHtml(buildLogoBadgeStyle(extractTeamIdFromLogoUrl(logoSrc)));
  const imageClassName = escapeHtml(imageClass);
  const placeholderClassName = escapeHtml(placeholderClass);
  const safeAlt = alt ? escapeHtml(alt) : "";

  if (!logoSrc) {
    return `
      <span class="${finalBadgeClass}" style="${badgeStyle}" aria-hidden="true">
        <span class="logo-badge-placeholder ${placeholderClassName}"></span>
      </span>
    `;
  }

  return `
    <span class="${finalBadgeClass}" style="${badgeStyle}">
      <img class="${imageClassName}" src="${escapeHtml(logoSrc)}" alt="${safeAlt}">
    </span>
  `;
}

function buildLogoBadgeStyle(teamId) {
  const theme = resolveTeamTheme(teamId);
  return [
    `--logo-badge-border: rgba(${theme.accentRgb}, 0.36)`,
    `--logo-badge-glow: rgba(${theme.accentRgb}, 0.16)`,
  ].join("; ");
}

function setLinescoreLabel(value) {
  if (!elements.linescoreLabel) {
    return;
  }
  elements.linescoreLabel.textContent = value || "Linescore";
}

function setNotesMetaSlot(wrapper, labelElement, valueElement, label, value) {
  if (!wrapper || !labelElement || !valueElement) {
    return;
  }

  labelElement.textContent = label || "";
  valueElement.textContent = value || "";
  wrapper.hidden = !(label || value);
}

function setScoreValue(element, value, mode = "score") {
  if (!element) {
    return;
  }

  element.textContent = value || "";
  element.classList.toggle("score-value-record", mode === "record");
}

function buildProbablePitcherCardConfig(pitcher, teamName) {
  if (!pitcher && !teamName) {
    return null;
  }

  return {
    label: "Probable",
    photo: pitcher?.photo || "",
    name: resolveProbablePitcherName(pitcher, teamName),
    meta: buildProbablePitcherMeta(teamName, "probable starter", pitcher?.throws),
    stats: buildPitcherStatsConfig(pitcher),
  };
}

function formatPregameCountdownDetail(game) {
  return buildPregameDetailMarkup(game);
}

function buildPregameDetailMarkup(game) {
  const location = escapeHtml(game?.isHome ? "Home Game" : "Road Game");
  const startTime = escapeHtml(game?.startTime ? formatDateTime(game.startTime) : "Time TBD");
  return `
    <span class="pregame-detail-line pregame-detail-location">${location}</span>
    <span class="pregame-detail-line pregame-detail-time">${startTime}</span>
  `;
}

function buildPreviousGameLabel(previousGame) {
  if (!previousGame) {
    return "Previous Game Final";
  }

  const away = previousGame.away?.abbr || previousGame.away?.name || "Away";
  const home = previousGame.home?.abbr || previousGame.home?.name || "Home";
  return `Previous Game Final | ${away} at ${home}`;
}

// Keep startup at the end of the module so every helper and constant above is
// initialized before the first render can call into them.
init();
