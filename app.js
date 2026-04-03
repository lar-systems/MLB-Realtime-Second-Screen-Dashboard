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
  debug: {
    workerStatus: "not started",
    lastWorkerError: null,
    appVersion: "debug-2026-04-02-2247",
  },
};

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
  linescore: document.querySelector("#linescore"),
  recentPlay: document.querySelector("#recent-play"),
  teamProbable: document.querySelector("#team-probable"),
  opponentProbable: document.querySelector("#opponent-probable"),
  debugOutput: document.querySelector("#debug-output"),
};

init();

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

  restartCountdown(nextState);
}

function renderPregame(nextState) {
  setLiveLayout(false);
  setSideWatermark(elements.awaySide, "");
  setSideWatermark(elements.homeSide, "");
  const selectedTeam = nextState.team?.name || "Selected Team";
  const game = nextState.nextGame;
  const homeName = game?.isHome ? selectedTeam : game?.opponent || "Opponent";
  const awayName = game?.isHome ? game?.opponent || "Opponent" : selectedTeam;
  const teamPitcher = game?.probablePitchers?.team || null;
  const opponentPitcher = game?.probablePitchers?.opponent || null;
  const gameStatus = game?.statusText || "Awaiting first pitch";
  const specialStatus = isSpecialPregameStatus(gameStatus);

  elements.statusLabel.textContent = gameStatus;
  setImage(elements.awayLogo, game?.isHome ? game?.opponentLogoUrl || "" : nextState.team?.logoUrl || "", `${awayName} logo`);
  setImage(elements.homeLogo, game?.isHome ? nextState.team?.logoUrl || "" : game?.opponentLogoUrl || "", `${homeName} logo`);
  elements.awayLogo.classList.remove("logo-edge-left", "logo-edge-right");
  elements.homeLogo.classList.remove("logo-edge-left", "logo-edge-right");
  setRecord(elements.awayRecord, game?.isHome ? game?.opponentRecord : game?.teamRecord);
  setRecord(elements.homeRecord, game?.isHome ? game?.teamRecord : game?.opponentRecord);
  setStanding(elements.awayStanding, game?.isHome ? game?.opponentStanding : game?.teamStanding);
  setStanding(elements.homeStanding, game?.isHome ? game?.teamStanding : game?.opponentStanding);
  setLiveRoleCard("away", null);
  setLiveRoleCard("home", null);
  elements.leftCardLabel.textContent = game?.isHome ? "Away Probable" : "Team Probable";
  elements.rightCardLabel.textContent = game?.isHome ? "Home Probable" : "Opponent Probable";
  elements.awayName.textContent = awayName;
  elements.homeName.textContent = homeName;
  elements.awayScore.textContent = "";
  elements.homeScore.textContent = "";
  elements.centerState.textContent = specialStatus ? "Game Status" : "Next Game";
  elements.countState.innerHTML = specialStatus
    ? `<span class="count-status-text">${formatPregameStatusDetail(game)}</span>`
    : `<span class="count-status-text">${game?.isHome ? "Home Game" : "Road Game"}</span>`;
  setMiniBases(null);
  setFooterSlots(
    ["Venue", game?.venue || "Venue TBD"],
    ["First Pitch", formatDateTime(game?.startTime)],
    ["Matchup", `${awayName} at ${homeName}`]
  );
  elements.recentPlay.textContent = specialStatus
    ? `${gameStatus}. ${formatPregameStatusDetail(game)}`
    : "Pregame mode. Countdown is running locally until first pitch.";
  elements.teamProbable.textContent = teamPitcher?.name || "TBD";
  elements.opponentProbable.textContent = opponentPitcher?.name || "TBD";

  setPlayerCard(elements.batterPhoto, elements.batterName, elements.batterMeta, elements.batterLine, {
    name: resolveProbablePitcherName(game?.isHome ? opponentPitcher : teamPitcher, game?.isHome ? game?.opponent : selectedTeam),
    meta: game?.isHome
      ? `${game?.opponent || "Opponent"} probable starter${pitchHandSuffix(opponentPitcher?.throws)}`
      : `${selectedTeam} probable starter${pitchHandSuffix(teamPitcher?.throws)}`,
    stats: buildPitcherStatsConfig(game?.isHome ? opponentPitcher : teamPitcher),
    line: game?.isHome
      ? opponentPitcher?.seasonLine || `Projected to start for ${game?.opponent || "the opponent"}.`
      : teamPitcher?.seasonLine || `Projected to start for ${selectedTeam}.`,
    photo: game?.isHome ? opponentPitcher?.photo || "" : teamPitcher?.photo || "",
  });

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: resolveProbablePitcherName(game?.isHome ? teamPitcher : opponentPitcher, game?.isHome ? selectedTeam : game?.opponent),
    meta: game?.isHome
      ? `${selectedTeam} probable starter${pitchHandSuffix(teamPitcher?.throws)}`
      : `${game?.opponent || "Opponent"} probable starter${pitchHandSuffix(opponentPitcher?.throws)}`,
    stats: buildPitcherStatsConfig(game?.isHome ? teamPitcher : opponentPitcher),
    line: game?.isHome
      ? teamPitcher?.seasonLine || `Projected to start for ${selectedTeam}.`
      : opponentPitcher?.seasonLine || `Projected to start for ${game?.opponent || "the opponent"}.`,
    photo: game?.isHome ? teamPitcher?.photo || "" : opponentPitcher?.photo || "",
  });

  renderLinescore([]);
}

function renderLive(nextState) {
  setLiveLayout(true);
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
  elements.awayScore.textContent = String(live?.away?.score ?? 0);
  elements.homeScore.textContent = String(live?.home?.score ?? 0);
  elements.centerState.textContent = `${live?.inningHalf || ""} ${live?.inning || ""}`.trim() || "In Progress";
  elements.countState.innerHTML = renderCountSummary(live);
  setMiniBases(live?.bases || null);
  setFooterSlots(
    ["", ""],
    ["", ""],
    ["", ""]
  );
  elements.recentPlay.textContent = live?.recentPlay || "Latest play text unavailable.";
  elements.teamProbable.textContent = "Live mode";
  elements.opponentProbable.textContent = basesText(live?.bases);

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

  renderLinescore(live?.linescore || []);
}

function renderFinal(nextState) {
  setLiveLayout(false);
  setSideWatermark(elements.awaySide, "");
  setSideWatermark(elements.homeSide, "");
  const final = nextState.final;
  const nextGame = nextState.nextGame;
  const selectedTeam = nextState.team?.name || "Selected Team";
  const teamPitcher = nextGame?.probablePitchers?.team || null;
  const opponentPitcher = nextGame?.probablePitchers?.opponent || null;

  elements.statusLabel.textContent = "Game complete";
  setImage(elements.awayLogo, nextState.team?.logoUrl, `${nextState.team?.name || "Team"} logo`);
  setImage(elements.homeLogo, nextGame?.opponentLogoUrl || "", `${nextGame?.opponent || "Opponent"} logo`);
  elements.awayLogo.classList.remove("logo-edge-left", "logo-edge-right");
  elements.homeLogo.classList.remove("logo-edge-left", "logo-edge-right");
  setRecord(elements.awayRecord, nextGame?.teamRecord || null);
  setRecord(elements.homeRecord, nextGame?.opponentRecord || null);
  setStanding(elements.awayStanding, nextGame?.teamStanding || null);
  setStanding(elements.homeStanding, nextGame?.opponentStanding || null);
  setLiveRoleCard("away", null);
  setLiveRoleCard("home", null);
  elements.leftCardLabel.textContent = "Team Probable";
  elements.rightCardLabel.textContent = "Opponent Probable";
  elements.awayName.textContent = nextState.team?.name || "Selected Team";
  elements.homeName.textContent = nextGame?.opponent || "Next Opponent";
  elements.awayScore.textContent = String(final?.awayScore ?? "-");
  elements.homeScore.textContent = String(final?.homeScore ?? "-");
  elements.centerState.textContent = nextGame ? "Next Game" : "Final";
  elements.countState.innerHTML = nextGame
    ? `<span class="count-status-text">${nextGame.isHome ? "Home" : "Road"} vs ${nextGame.opponent || "Opponent"}</span>`
    : `<span class="count-status-text">Awaiting schedule</span>`;
  setMiniBases(null);
  setFooterSlots(
    ["Final", final ? `${final.awayScore ?? "-"} - ${final.homeScore ?? "-"}` : "Final"],
    ["Next Game", nextGame ? formatDateTime(nextGame.startTime) : "TBD"],
    ["Venue", nextGame?.venue || "Next venue TBD"]
  );
  elements.recentPlay.textContent = final?.summary || "Final game summary unavailable.";
  elements.teamProbable.textContent = teamPitcher?.name || "TBD";
  elements.opponentProbable.textContent = opponentPitcher?.name || "TBD";

  setPlayerCard(elements.batterPhoto, elements.batterName, elements.batterMeta, elements.batterLine, {
    name: resolveProbablePitcherName(teamPitcher, selectedTeam),
    meta: `${selectedTeam} projected starter${pitchHandSuffix(teamPitcher?.throws)}`,
    stats: buildPitcherStatsConfig(teamPitcher),
    line: nextGame
      ? teamPitcher?.seasonLine || `Expected pitching matchup for ${formatDateTime(nextGame.startTime)}.`
      : final?.summary || "The dashboard will pivot back to the next scheduled game after final.",
    photo: teamPitcher?.photo || "",
  });

  setPlayerCard(elements.pitcherPhoto, elements.pitcherName, elements.pitcherMeta, elements.pitcherLine, {
    name: resolveProbablePitcherName(opponentPitcher, nextGame?.opponent),
    meta: `${nextGame?.opponent || "Opponent"} projected starter${pitchHandSuffix(opponentPitcher?.throws)}`,
    stats: buildPitcherStatsConfig(opponentPitcher),
    line: nextGame
      ? opponentPitcher?.seasonLine || `Countdown target: ${formatDateTime(nextGame.startTime)}`
      : "No upcoming game found yet.",
    photo: opponentPitcher?.photo || "",
  });

  renderLinescore([]);
}

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
        <span class="player-stat-summary-label">${escapeHtml(statsConfig?.summaryLabel || "Today")}</span>
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

function buildBatterStatsConfig(player, options = {}) {
  const compact = Boolean(options.compact);
  return {
    summaryLabel: "Today",
    summaryValue: player?.todayLine || null,
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

function buildPitcherStatsConfig(player, options = {}) {
  const includeToday = options.includeToday !== false;
  return {
    summaryLabel: "Today",
    summaryValue: includeToday ? player?.todayLine || null : null,
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

function setImage(element, src, alt, options = {}) {
  if (!element) {
    return;
  }

  element.alt = alt || "";
  element.hidden = true;
  element.removeAttribute("src");
  element.classList.remove("has-image", "is-fallback");
  element.onerror = null;

  if (!src) {
    if (options.usePlayerFallback) {
      applyPlayerFallback(element, alt);
    }
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


function renderLinescore(linescore) {
  if (!linescore.length) {
    elements.linescore.innerHTML = '<div class="linescore-empty">Waiting for inning-by-inning data.</div>';
    return;
  }

  const awayLabel = state.current?.live?.away?.abbr || state.current?.live?.away?.name || "AWY";
  const homeLabel = state.current?.live?.home?.abbr || state.current?.live?.home?.name || "HME";
  const displayedInnings = buildDisplayedInnings(linescore);
  const awayTotals = calculateLinescoreTotals(displayedInnings, "away");
  const homeTotals = calculateLinescoreTotals(displayedInnings, "home");
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

function restartCountdown(nextState) {
  window.clearInterval(state.countdownTimer);
  updateCountdown(nextState);

  const shouldRunCountdown = Boolean(
    nextState?.nextGame?.countdownTargetMs &&
    (nextState.mode === "pregame" || nextState.mode === "final")
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
    return;
  }

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
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  elements.countdown.textContent = `${hours}:${minutes}:${seconds}`;
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

function pitchHandSuffix(value) {
  return value ? ` | Throws: ${value}` : "";
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
    probablePitchers: nextState?.nextGame?.probablePitchers || null,
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

function setLiveLayout(isLive) {
  if (elements.heroFooter) {
    elements.heroFooter.hidden = isLive;
    elements.heroFooter.classList.toggle("is-hidden", isLive);
  }
  if (elements.matchupGrid) {
    elements.matchupGrid.hidden = isLive;
    elements.matchupGrid.classList.toggle("is-hidden", isLive);
  }
  if (elements.detailsGrid) {
    elements.detailsGrid.classList.toggle("details-grid-live", isLive);
  }
  if (elements.awaySide) {
    elements.awaySide.classList.toggle("score-side-live", isLive);
  }
  if (elements.homeSide) {
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
  const location = game?.isHome ? "Home Game" : "Road Game";
  const startTime = game?.startTime ? formatDateTime(game.startTime) : "Time TBD";
  return `${location} | ${startTime}`;
}

function setMiniBases(bases) {
  if (!elements.basesMini) {
    return;
  }

  elements.basesMini.classList.toggle("is-visible", Boolean(bases));

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
      ? buildBatterStatsConfig(player, { compact: true })
      : buildPitcherStatsConfig(player, { compact: true, includeToday: true }),
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

function setSideWatermark(element, src, side = "") {
  if (!element) {
    return;
  }

  element.classList.remove("has-watermark", "watermark-left", "watermark-right");
  element.style.removeProperty("--side-logo");

  if (!src) {
    return;
  }

  element.style.setProperty("--side-logo", `url("${src}")`);
  element.classList.add("has-watermark");

  if (side === "left" || side === "right") {
    element.classList.add(`watermark-${side}`);
  }
}
