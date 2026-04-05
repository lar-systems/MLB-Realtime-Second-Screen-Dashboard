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

const state = {
  worker: null,
  countdownTimer: null,
  current: null,
  celebration: {
    lastSeenId: null,
    fadeTimer: null,
    hideTimer: null,
  },
    debug: {
      workerStatus: "not started",
      lastWorkerError: null,
      appVersion: "debug-2026-04-05-2145",
    },
  };

// Portrait cleanup uses canvas work, so cache processed headshots instead of
// recalculating transparency on every rerender.
const portraitImageCache = new Map();

// Keep all DOM lookups in one place so markup changes are easy to review.
const elements = {
  awaySide: document.querySelector(".score-side.away"),
  homeSide: document.querySelector(".score-side.home"),
  headerTeamLogo: document.querySelector("#header-team-logo"),
  teamTitle: document.querySelector("#team-title"),
  teamSelect: document.querySelector("#team-select"),
  cycleModeButton: document.querySelector("#cycle-mode-button"),
  statusBanner: document.querySelector("#status-banner"),
  modeLabel: document.querySelector("#mode-label"),
  updatedClock: document.querySelector("#updated-clock"),
  statusLabel: document.querySelector("#status-label"),
  celebrationModal: document.querySelector("#celebration-modal"),
  celebrationCard: document.querySelector("#celebration-card"),
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
  batterPhoto: document.querySelector("#batter-photo"),
  leftCardLabel: document.querySelector("#left-card-label"),
  batterName: document.querySelector("#batter-name"),
  batterMeta: document.querySelector("#batter-meta"),
  batterLine: document.querySelector("#batter-line"),
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
  bindEvents();
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

function bindEvents() {
  elements.teamSelect.addEventListener("change", () => {
    const teamId = Number(elements.teamSelect.value);
    localStorage.setItem(STORAGE_KEYS.teamId, String(teamId));
    if (state.worker) {
      state.worker.postMessage({ type: "SET_TEAM", teamId });
    }
  });

  elements.cycleModeButton.addEventListener("click", () => {
    if (state.worker) {
      state.worker.postMessage({ type: "CYCLE_MOCK_MODE" });
    }
  });
}

function renderStartupState() {
  const cached = loadCachedState();
  if (cached) {
    state.celebration.lastSeenId = cached?.live?.celebration?.id || null;
    renderState(cached);
    return;
  }
  setBanner("Loading dashboard data...", false);
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

  syncCelebration(nextState);
  restartCountdown(nextState);
}

function syncCelebration(nextState) {
  if (nextState?.mode !== "live") {
    hideCelebration(true);
    return;
  }

  const celebration = nextState?.live?.celebration;
  if (!celebration?.id) {
    return;
  }

  if (celebration.id === state.celebration.lastSeenId) {
    return;
  }

  state.celebration.lastSeenId = celebration.id;
  showCelebration(celebration);
}

function showCelebration(celebration) {
  if (!elements.celebrationModal || !elements.celebrationCard) {
    return;
  }

  window.clearTimeout(state.celebration.fadeTimer);
  window.clearTimeout(state.celebration.hideTimer);

  elements.celebrationLabel.textContent = celebration.label || "";
  elements.celebrationDetail.textContent = celebration.detail || "";
  elements.celebrationActor.textContent = celebration.actor || "";
  elements.celebrationCard.classList.toggle("is-pitcher", celebration.tone === "pitcher");
  elements.celebrationCard.classList.toggle("is-batter", celebration.tone !== "pitcher");
  elements.celebrationModal.hidden = false;
  elements.celebrationModal.classList.remove("is-visible", "is-exiting");

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
    elements.celebrationCard?.classList.remove("is-pitcher", "is-batter");
  }
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
  elements.centerState.textContent = specialStatus ? "Game Status" : "Next Game";
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

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: resolveProbablePitcherName(homePitcher, homeName),
    meta: buildProbablePitcherMeta(homeName, "probable starter", homePitcher?.throws),
    stats: buildPitcherStatsConfig(homePitcher),
    line: homePitcher?.seasonLine || `Projected to start for ${homeName}.`,
    photo: homePitcher?.photo || "",
  });

  setLinescoreLabel(buildPreviousGameLabel(previousGame));
  renderLinescore(previousGame?.linescore || [], {
    awayLabel: previousGame?.away?.abbr || previousGame?.away?.name || "AWY",
    homeLabel: previousGame?.home?.abbr || previousGame?.home?.name || "HME",
    awayTotals: buildFixedLinescoreTotals(previousGame?.awayScore, previousGame?.awayHits, previousGame?.awayErrors),
    homeTotals: buildFixedLinescoreTotals(previousGame?.homeScore, previousGame?.homeHits, previousGame?.homeErrors),
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
  elements.centerState.textContent = formatInningState(live?.inningHalf, live?.inning) || "In Progress";
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
    formatInningState(live?.inningHalf, live?.inning) || "Live",
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

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: live?.pitcher?.name || "Pitcher unavailable",
    meta: [handednessLabel("Throws", live?.pitcher?.throws), pitchCountText(live?.pitcher?.pitchCount)].filter(Boolean).join(" | "),
    stats: buildPitcherStatsConfig(live?.pitcher, { includeToday: true }),
    line: [live?.pitcher?.todayLine, live?.pitcher?.seasonLine].filter(Boolean).join(" | ") || "No pitching line available.",
    photo: live?.pitcher?.photo || "",
  });

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
  elements.centerState.textContent = nextGame
    ? (specialStatus ? "Game Status" : "Next Game")
    : "Final";
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

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: resolveProbablePitcherName(homePitcher, homeName),
    meta: buildProbablePitcherMeta(homeName, "projected starter", homePitcher?.throws),
    stats: buildPitcherStatsConfig(homePitcher),
    line: nextGame
      ? homePitcher?.seasonLine || `Countdown target: ${formatDateTime(nextGame.startTime)}`
      : "No upcoming game found yet.",
    photo: homePitcher?.photo || "",
  });

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

// MLB headshots often ship with a flat gray backdrop. We remove that backdrop
// once, cache the transparent result, and then reuse the cached image.
function loadProcessedPortrait(element, src, alt, options, requestKey) {
  const cached = portraitImageCache.get(src);
  if (cached) {
    applyResolvedImage(element, cached, alt, options, requestKey);
    return;
  }

  const loader = new Image();
  loader.crossOrigin = "anonymous";
  loader.decoding = "async";

  loader.onerror = () => {
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

  loader.onload = () => {
    let resolvedSrc = src;

    try {
      const processedSrc = createTransparentPortraitDataUrl(loader);
      if (processedSrc) {
        resolvedSrc = processedSrc;
      }
    } catch {
      resolvedSrc = src;
    }

    portraitImageCache.set(src, resolvedSrc);
    applyResolvedImage(element, resolvedSrc, alt, options, requestKey);
  };

  loader.src = src;
}

function applyResolvedImage(element, resolvedSrc, alt, options, requestKey) {
  if (element.dataset.requestKey !== requestKey) {
    return;
  }

  element.alt = alt || "";
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

// Background removal is intentionally conservative:
// sample the edge color, flood-fill only border-connected backdrop pixels,
// then soften edges so hats, hair, and shoulders survive intact.
function createTransparentPortraitDataUrl(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return "";
  }

  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const backgroundProfile = samplePortraitBackdropColor(data, width, height);

  if (!backgroundProfile) {
    return "";
  }

  const visited = floodFillPortraitBackdrop(data, width, height, backgroundProfile);
  const clearedPixels = applyPortraitTransparency(data, width, height, backgroundProfile, visited);

  if (clearedPixels < width * height * 0.02) {
    return "";
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function samplePortraitBackdropColor(data, width, height) {
  const sampleSize = Math.max(4, Math.floor(Math.min(width, height) * 0.03));
  const yAnchors = [
    0,
    Math.floor(height * 0.25),
    Math.floor(height * 0.5),
  ];
  const windows = [];

  for (const y of yAnchors) {
    windows.push(...sampleBackdropWindow(data, width, height, 0, y, sampleSize));
    windows.push(...sampleBackdropWindow(data, width, height, width - sampleSize, y, sampleSize));
  }

  const validSamples = windows.filter((sample) => sample && sample.alpha > 0);
  if (!validSamples.length) {
    return null;
  }

  const median = {
    red: medianChannel(validSamples.map((sample) => sample.red)),
    green: medianChannel(validSamples.map((sample) => sample.green)),
    blue: medianChannel(validSamples.map((sample) => sample.blue)),
  };

  const ranked = validSamples
    .map((sample) => ({ sample, distance: colorDistanceFromSample(sample, median) }))
    .sort((left, right) => left.distance - right.distance);

  const inliers = ranked
    .filter(({ distance }) => distance <= 34)
    .map(({ sample }) => sample);

  const resolvedSamples = inliers.length >= 6
    ? inliers
    : ranked.slice(0, Math.min(12, ranked.length)).map(({ sample }) => sample);

  const average = averageBackdropSample(resolvedSamples);
  const spread = resolvedSamples.length
    ? Math.max(...resolvedSamples.map((sample) => colorDistanceFromSample(sample, average)))
    : 0;

  return {
    red: average.red,
    green: average.green,
    blue: average.blue,
    hardThreshold: Math.max(26, Math.min(42, spread + 10)),
    softThreshold: Math.max(48, Math.min(68, spread + 28)),
  };
}

function sampleBackdropWindow(data, width, height, startX, startY, sampleSize) {
  const samples = [];
  const clampedStartX = Math.max(0, Math.min(width - 1, startX));
  const clampedStartY = Math.max(0, Math.min(height - 1, startY));
  const endX = Math.min(width, clampedStartX + sampleSize);
  const endY = Math.min(height, clampedStartY + sampleSize);

  for (let y = clampedStartY; y < endY; y += 1) {
    for (let x = clampedStartX; x < endX; x += 1) {
      samples.push(readPixel(data, width, x, y));
    }
  }

  return samples;
}

function medianChannel(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sorted.length) {
    return 0;
  }

  return sorted[Math.floor(sorted.length / 2)];
}

function averageBackdropSample(samples) {
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

function colorDistanceFromSample(sample, reference) {
  const redDelta = sample.red - reference.red;
  const greenDelta = sample.green - reference.green;
  const blueDelta = sample.blue - reference.blue;
  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function floodFillPortraitBackdrop(data, width, height, backgroundProfile) {
  const hardThreshold = backgroundProfile.hardThreshold;
  const visited = new Uint8Array(width * height);
  const queue = [];
  const seedMaxY = Math.max(8, Math.floor(height * 0.82));

  const tryVisit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const index = y * width + x;
    if (visited[index]) {
      return;
    }

    if (!matchesBackdropColor(data, index, backgroundProfile, hardThreshold)) {
      return;
    }

    visited[index] = 1;
    queue.push(index);
  };

  // Do not seed from the bottom edge. MLB headshots often have neck/jersey
  // pixels touching the lower border, and starting there can eat into faces.
  for (let x = 0; x < width; x += 1) {
    tryVisit(x, 0);
  }

  for (let y = 0; y < seedMaxY; y += 1) {
    tryVisit(0, y);
    tryVisit(width - 1, y);
  }

  for (let pointer = 0; pointer < queue.length; pointer += 1) {
    const index = queue[pointer];
    const x = index % width;
    const y = Math.floor(index / width);

    tryVisit(x + 1, y);
    tryVisit(x - 1, y);
    tryVisit(x, y + 1);
    tryVisit(x, y - 1);
  }

  return visited;
}

function applyPortraitTransparency(data, width, height, backgroundProfile, visited) {
  const hardThreshold = backgroundProfile.hardThreshold;
  const softThreshold = backgroundProfile.softThreshold;
  let clearedPixels = 0;

  for (let index = 0; index < visited.length; index += 1) {
    if (!visited[index]) {
      continue;
    }

    data[index * 4 + 3] = 0;
    clearedPixels += 1;
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (visited[index]) {
        continue;
      }

      const offset = index * 4;
      if (data[offset + 3] === 0 || !hasTransparentBackdropNeighbor(visited, width, height, x, y)) {
        continue;
      }

      const distance = colorDistance(data, index, backgroundProfile);
      if (distance > softThreshold) {
        continue;
      }

      const normalized = Math.max(0, Math.min(1, (distance - hardThreshold) / (softThreshold - hardThreshold)));
      data[offset + 3] = Math.min(data[offset + 3], Math.round(normalized * 255));
    }
  }

  return clearedPixels;
}

function hasTransparentBackdropNeighbor(visited, width, height, x, y) {
  const index = y * width + x;
  return (
    visited[index - 1] ||
    visited[index + 1] ||
    visited[index - width] ||
    visited[index + width]
  );
}

function matchesBackdropColor(data, index, backgroundColor, threshold) {
  return colorDistance(data, index, backgroundColor) <= threshold;
}

function colorDistance(data, index, backgroundColor) {
  const offset = index * 4;
  const redDelta = data[offset] - backgroundColor.red;
  const greenDelta = data[offset + 1] - backgroundColor.green;
  const blueDelta = data[offset + 2] - backgroundColor.blue;
  return Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta);
}

function readPixel(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return {
    red: data[offset],
    green: data[offset + 1],
    blue: data[offset + 2],
    alpha: data[offset + 3],
  };
}

function dominantBackdropSample(samples) {
  const validSamples = samples.filter((sample) => sample && sample.alpha > 0);
  if (!validSamples.length) {
    return null;
  }

  const buckets = new Map();
  for (const sample of validSamples) {
    const key = [
      Math.round(sample.red / 8),
      Math.round(sample.green / 8),
      Math.round(sample.blue / 8),
    ].join(":");

    const existing = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    existing.count += 1;
    existing.red += sample.red;
    existing.green += sample.green;
    existing.blue += sample.blue;
    buckets.set(key, existing);
  }

  let dominant = null;
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) {
      dominant = bucket;
    }
  }

  if (!dominant || !dominant.count) {
    return null;
  }

  return {
    red: dominant.red / dominant.count,
    green: dominant.green / dominant.count,
    blue: dominant.blue / dominant.count,
  };
}

function applyPlayerFallback(element, alt) {
  element.onerror = null;
  element.src = inlineFallbackSilhouette();
  element.alt = alt ? `${alt} fallback silhouette` : "Player fallback silhouette";
  element.hidden = false;
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
  const displayedInnings = buildDisplayedInnings(linescore);
  const awayTotals = options.awayTotals || calculateLinescoreTotals(displayedInnings, "away");
  const homeTotals = options.homeTotals || calculateLinescoreTotals(displayedInnings, "home");
  const activeInning = Number(state.current?.live?.inning) || null;
  const inningHalf = normalizeInningHalf(state.current?.live?.inningHalf);

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
            <th scope="row" class="linescore-team-label">${awayLabel}</th>
            ${awayCells}
            <td class="linescore-total-cell">${awayTotals.runs}</td>
            <td class="linescore-total-cell">${awayTotals.hits}</td>
            <td class="linescore-total-cell">${awayTotals.errors}</td>
          </tr>
          <tr>
            <th scope="row" class="linescore-team-label">${homeLabel}</th>
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

  return `${half} ${formatOrdinal(numericInning)}`.trim();
}

function formatOrdinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value || "");
  }

  const mod100 = number % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${number}th`;
  }

  const mod10 = number % 10;
  if (mod10 === 1) {
    return `${number}st`;
  }
  if (mod10 === 2) {
    return `${number}nd`;
  }
  if (mod10 === 3) {
    return `${number}rd`;
  }
  return `${number}th`;
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

function pitchCountText(value) {
  return typeof value === "number" ? `Pitches: ${value}` : "";
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
      upcomingSchedule: nextState?.upcomingSchedule || null,
      previousGame: nextState?.previousGame || null,
      probablePitchers: nextState?.nextGame?.probablePitchers || null,
      celebration: nextState?.live?.celebration || null,
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
    };
  }

    return {
      label,
      photo: player.photo || "",
      name: player.name || (kind === "batter" ? "Batter unavailable" : "Pitcher unavailable"),
      meta: kind === "batter"
        ? [player.position, handednessLabel("Bats", player.bats)].filter(Boolean).join(" | ")
        : [handednessLabel("Throws", player.throws), pitchCountText(player.pitchCount)].filter(Boolean).join(" | "),
      stats: kind === "batter"
        ? buildBatterStatsConfig(player, { compact: true, hideSummaryLabel: true })
        : buildPitcherStatsConfig(player, { compact: true, includeToday: true, hideSummaryLabel: true }),
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
    return;
  }

  card.hidden = false;
  label.textContent = config.label;
  label.hidden = true;
  name.textContent = config.name || "";
  meta.textContent = config.meta || "";
  setImage(photo, config.photo || "", config.name || config.label, { usePlayerFallback: true });
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

function renderScheduleItem(item) {
  const weekday = formatScheduleWeekday(item?.startTime);
  const day = formatScheduleDayNumber(item?.startTime);
  const time = formatScheduleTime(item?.startTime, item?.statusText);
  const opponentName = item?.opponentName || "Opponent";
  const siteLabel = item?.isHome ? "vs" : "@";
  const logo = escapeHtml(item?.opponentLogoUrl || "");
  const alt = escapeHtml(`${opponentName} logo`);

  return `
    <article class="schedule-item">
      <p class="schedule-item-date">
        <span class="schedule-item-weekday">${weekday}</span>
        <span class="schedule-item-day">${day}</span>
      </p>
      <p class="schedule-item-site">${siteLabel}</p>
      <div class="schedule-item-logo-wrap">
        ${logo ? `<img class="schedule-item-logo" src="${logo}" alt="${alt}">` : `<div class="schedule-item-logo schedule-item-logo-placeholder" aria-hidden="true"></div>`}
      </div>
      <p class="schedule-item-time">${time}</p>
    </article>
  `;
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
