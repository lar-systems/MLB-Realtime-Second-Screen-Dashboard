/*
 * Worker-side MLB data controller.
 *
 * This file is responsible for everything that requires interpretation of MLB
 * data:
 * - polling cadence
 * - choosing the relevant game
 * - classifying that game as pregame / live / final
 * - normalizing MLB payloads into one UI-friendly state contract
 * - falling back when `feed/live` is missing or incomplete
 */

const API_BASE = "https://statsapi.mlb.com/api/v1";
const API_BASE_LIVE = "https://statsapi.mlb.com/api/v1.1";
const SPORT_ID = 1;
const FINAL_MODE_HOLD_MS = 3 * 60 * 60 * 1000;
const SCHEDULE_LOOKBACK_DAYS = 7;
const SCHEDULE_LOOKAHEAD_DAYS = 7;

const POLL_INTERVALS = {
  pregame: 300000,
  nearFirstPitch: 60000,
  live: 3000,
  final: 60000,
  error: 30000,
};

const workerState = {
  teamId: null,
  timerId: null,
  useMockData: false,
  mockModeForced: false,
  lastKnownState: null,
  mockModeIndex: 0,
};

// The main thread only sends user intent. The worker owns polling and state.

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message?.type) {
    return;
  }

  if (message.type === "INIT") {
    workerState.teamId = message.teamId ?? workerState.teamId;
    workerState.useMockData = Boolean(message.useMockData);
    workerState.mockModeForced = Boolean(message.useMockData);
    postStatus(`Worker initialized for team ${workerState.teamId}.`);
    pollNow();
    return;
  }

  if (message.type === "SET_TEAM") {
    workerState.teamId = message.teamId;
    postStatus(`Loading team ${workerState.teamId}...`);
    pollNow();
    return;
  }

  if (message.type === "REFRESH_NOW") {
    postStatus("Manual refresh requested.");
    pollNow();
    return;
  }

  if (message.type === "CYCLE_MOCK_MODE") {
    workerState.useMockData = true;
    workerState.mockModeForced = true;
    workerState.mockModeIndex = (workerState.mockModeIndex + 1) % 3;
    postStatus("Mock mode cycled.");
    pollNow();
  }
});

// One polling loop controls fetch, fallback handling, stale-state recovery,
// and scheduling the next poll.
async function pollNow() {
  clearScheduledPoll();

  try {
    const nextState = await fetchDashboardState();
    workerState.lastKnownState = nextState;
    self.postMessage({ type: "STATE", payload: nextState });
    scheduleNextPoll(resolvePollDelay(nextState));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown polling error";
    self.postMessage({ type: "ERROR", message });

    if (!workerState.mockModeForced) {
      try {
        const fallbackState = buildWorkerMockState(workerState.teamId, message);
        workerState.lastKnownState = fallbackState;
        self.postMessage({ type: "STATE", payload: fallbackState });
        scheduleNextPoll(resolvePollDelay(fallbackState));
        return;
      } catch {
        workerState.useMockData = false;
      }
    }

    if (workerState.lastKnownState) {
      const staleState = {
        ...workerState.lastKnownState,
        meta: {
          ...workerState.lastKnownState.meta,
          lastError: message,
          sourceStatus: "Showing last known state while the worker retries.",
        },
      };
      self.postMessage({ type: "STATE", payload: staleState });
    }

    scheduleNextPoll(POLL_INTERVALS.error);
  }
}

// Selection order matters. Prefer:
// 1. active live game
// 2. pregame-like game, including delayed/postponed states
// 3. next upcoming game
// 4. recent final
async function fetchDashboardState() {
  if (workerState.useMockData || workerState.mockModeForced) {
    return withScoreboardGames(
      buildWorkerMockState(workerState.teamId, "Mock mode active."),
      buildMockActiveGames(workerState.teamId),
      []
    );
  }

  if (!workerState.teamId) {
    throw new Error("No team selected.");
  }

  const [relevantGames, leagueGames] = await Promise.all([
    fetchRelevantSchedule(workerState.teamId),
    fetchLeagueScoreboardGames(),
  ]);
  const activeGames = buildActiveGames(leagueGames);
  const recentGames = buildRecentGames(leagueGames);
  const liveGame = relevantGames.find(isLiveGame);
  const pregameLikeGame = relevantGames.find(isPregameCandidate);
  const upcomingGame = relevantGames.find(isUpcomingGame);
  const recentFinal = findRecentFinalGame(relevantGames);
  const scheduleAnchorGame = pregameLikeGame || upcomingGame;
  const previousCompletedGame = findPreviousCompletedGame(relevantGames, scheduleAnchorGame);
  const upcomingSchedule = buildUpcomingSchedule(relevantGames, scheduleAnchorGame);

  if (liveGame) {
    const liveFeed = await fetchLiveFeed(liveGame.gamePk, { allowNotFound: true });
    if (liveFeed) {
      return withScoreboardGames(normalizeLiveState(liveFeed), activeGames, recentGames);
    }
    const partialLive = await fetchPartialLiveResources(liveGame.gamePk);
    if (hasPartialLiveResources(partialLive)) {
      return withScoreboardGames(normalizePartialLiveState(liveGame, partialLive), activeGames, recentGames);
    }
    return withScoreboardGames(normalizeScheduleLiveFallback(liveGame), activeGames, recentGames);
  }

  if (pregameLikeGame) {
    return withScoreboardGames(await normalizePregameState(pregameLikeGame, previousCompletedGame, upcomingSchedule), activeGames, recentGames);
  }

  if (upcomingGame) {
    return withScoreboardGames(await normalizePregameState(upcomingGame, previousCompletedGame, upcomingSchedule), activeGames, recentGames);
  }

  if (recentFinal) {
    const liveFeed = await fetchLiveFeed(recentFinal.gamePk, { allowNotFound: true });
    if (liveFeed) {
      return withScoreboardGames(normalizeFinalState(liveFeed, upcomingGame), activeGames, recentGames);
    }
    return withScoreboardGames(normalizeScheduleFinalFallback(recentFinal, upcomingGame), activeGames, recentGames);
  }

  return withScoreboardGames(buildNoGameState(workerState.teamId), activeGames, recentGames);
}

// The schedule window is wider than "today" so the dashboard can still show a
// useful previous final and upcoming context around off days.
async function fetchRelevantSchedule(teamId) {
  const today = new Date();
  const startDate = addDays(today, -SCHEDULE_LOOKBACK_DAYS);
  const endDate = addDays(today, SCHEDULE_LOOKAHEAD_DAYS);
  const params = new URLSearchParams({
    sportId: String(SPORT_ID),
    teamId: String(teamId),
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    hydrate: "team,linescore,venue,probablePitcher",
  });

  const payload = await fetchJson(`${API_BASE}/schedule?${params.toString()}`);
  const dates = Array.isArray(payload?.dates) ? payload.dates : [];

  return dates
    .flatMap((entry) => entry.games || [])
    .sort((left, right) => new Date(left.gameDate).getTime() - new Date(right.gameDate).getTime());
}

async function fetchLeagueScoreboardGames() {
  const today = new Date();
  const startDate = addDays(today, -1);
  const endDate = addDays(today, 1);
  const params = new URLSearchParams({
    sportId: String(SPORT_ID),
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    hydrate: "team,linescore",
  });

  const payload = await fetchJson(`${API_BASE}/schedule?${params.toString()}`);
  const dates = Array.isArray(payload?.dates) ? payload.dates : [];

  return dates
    .flatMap((entry) => entry.games || [])
    .sort((left, right) => new Date(left.gameDate).getTime() - new Date(right.gameDate).getTime());
}

// `feed/live` is the preferred path, but MLB does not expose it reliably for
// every gamePk. The partial-resource fallbacks below exist for that reason.
async function fetchLiveFeed(gamePk, options = {}) {
  return fetchJson(`${API_BASE_LIVE}/game/${gamePk}/feed/live`, options);
}

async function fetchGameBoxscore(gamePk, options = {}) {
  return fetchJson(`${API_BASE}/game/${gamePk}/boxscore`, options);
}

async function fetchGameLinescore(gamePk, options = {}) {
  return fetchJson(`${API_BASE}/game/${gamePk}/linescore`, options);
}

async function fetchGamePlayByPlay(gamePk, options = {}) {
  return fetchJson(`${API_BASE}/game/${gamePk}/playByPlay`, options);
}

async function fetchPartialLiveResources(gamePk) {
  const [boxscore, linescore, playByPlay] = await Promise.all([
    fetchGameBoxscore(gamePk, { allowNotFound: true }).catch(() => null),
    fetchGameLinescore(gamePk, { allowNotFound: true }).catch(() => null),
    fetchGamePlayByPlay(gamePk, { allowNotFound: true }).catch(() => null),
  ]);

  return { boxscore, linescore, playByPlay };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404 && options.allowNotFound) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`MLB request failed with status ${response.status}.`);
  }

  return response.json();
}

// Pregame packages together the next game, the previous completed game, and a
// compact forward schedule so the lower row can stay useful before first pitch.
async function normalizePregameState(game, previousGame = null, upcomingSchedule = []) {
  const teamEntry = getSelectedTeamEntry(game);
  const opponentEntry = getOpponentTeamEntry(game);
  const startTime = game?.gameDate || null;
  const probablePitchers = await enrichProbablePitchers(game);
  const standings = await enrichStandings(game);

  return {
    mode: "pregame",
    team: normalizeTeamIdentity(teamEntry?.team),
    nextGame: {
      gamePk: game?.gamePk,
      opponent: opponentEntry?.team?.name || "TBD",
      opponentAbbr: opponentEntry?.team?.abbreviation || opponentEntry?.team?.abbrev || "",
      opponentLogoUrl: teamLogoUrl(opponentEntry?.team?.id),
      statusText: game?.status?.detailedState || game?.status?.abstractGameState || null,
      teamRecord: buildTeamRecord(teamEntry?.leagueRecord),
      opponentRecord: buildTeamRecord(opponentEntry?.leagueRecord),
      teamStanding: standings.teamStanding,
      opponentStanding: standings.opponentStanding,
      isHome: teamEntry?.isHome ?? false,
      venue: game?.venue?.name || "Venue TBD",
      startTime,
      countdownTargetMs: startTime ? new Date(startTime).getTime() : null,
      probablePitchers,
    },
    upcomingSchedule: upcomingSchedule.map(normalizeUpcomingScheduleItem),
    previousGame: normalizePreviousGame(previousGame),
    live: null,
    final: null,
    meta: {
      sourceStatus: "Loaded upcoming game from MLB schedule.",
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

// Full live normalization is the richest path and should be the first place to
// check when a displayed baseball value looks wrong.
function normalizeLiveState(feed) {
  const gameData = feed?.gameData || {};
  const liveData = feed?.liveData || {};
  const linescore = liveData?.linescore || {};
  const currentPlay = liveData?.plays?.currentPlay || getLastPlay(liveData?.plays?.allPlays);
  const team = normalizeTeamIdentity(getSelectedFeedTeam(gameData));
  const awayTeam = normalizeTeamIdentity(gameData?.teams?.away);
  const homeTeam = normalizeTeamIdentity(gameData?.teams?.home);
  const boxscorePlayers = buildPlayerLookup(liveData?.boxscore);
  const batter = normalizeBatter(currentPlay, boxscorePlayers);
  const pitcher = normalizePitcher(currentPlay, boxscorePlayers);

  return {
    mode: "live",
    team,
    nextGame: null,
    upcomingSchedule: [],
    previousGame: null,
      live: {
        gamePk: gameData?.game?.pk || gameData?.gamePk,
        status: gameData?.status?.detailedState || "In Progress",
        startTime: gameData?.datetime?.dateTime || gameData?.gameDate || null,
        away: {
          ...awayTeam,
          score: linescore?.teams?.away?.runs ?? 0,
        hits: linescore?.teams?.away?.hits ?? null,
        errors: linescore?.teams?.away?.errors ?? null,
      },
      home: {
        ...homeTeam,
        score: linescore?.teams?.home?.runs ?? 0,
        hits: linescore?.teams?.home?.hits ?? null,
        errors: linescore?.teams?.home?.errors ?? null,
      },
      inning: linescore?.currentInning ?? linescore?.scheduledInnings ?? 0,
      inningHalf: linescore?.inningHalf || null,
      outs: currentPlay?.count?.outs ?? linescore?.outs ?? 0,
      balls: currentPlay?.count?.balls ?? 0,
      strikes: currentPlay?.count?.strikes ?? 0,
      bases: {
        first: Boolean(linescore?.offense?.first),
        second: Boolean(linescore?.offense?.second),
        third: Boolean(linescore?.offense?.third),
      },
      batter,
      pitcher,
      celebration: buildLiveCelebration(currentPlay, batter, pitcher, {
        inning: linescore?.currentInning ?? linescore?.scheduledInnings ?? 0,
        inningHalf: linescore?.inningHalf || null,
        awayScore: linescore?.teams?.away?.runs ?? 0,
        homeScore: linescore?.teams?.home?.runs ?? 0,
        awayTeamId: awayTeam?.id ?? gameData?.teams?.away?.id ?? null,
        homeTeamId: homeTeam?.id ?? gameData?.teams?.home?.id ?? null,
      }),
      linescore: normalizeLinescore(linescore?.innings),
      recentPlay: currentPlay?.result?.description || getLastPlayDescription(liveData?.plays?.allPlays),
      updatedAt: Date.now(),
    },
    final: null,
    meta: {
      sourceStatus: `Live data from MLB feed. ${gameData?.status?.detailedState || ""}`.trim(),
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

async function normalizeFinalState(feed, upcomingGame) {
  const gameData = feed?.gameData || {};
  const liveData = feed?.liveData || {};
  const linescore = liveData?.linescore || {};
  const team = normalizeTeamIdentity(getSelectedFeedTeam(gameData));
  const nextGame = upcomingGame ? await normalizePregameState(upcomingGame) : null;
  const awayScore = linescore?.teams?.away?.runs ?? liveData?.boxscore?.teams?.away?.teamStats?.batting?.runs ?? null;
  const homeScore = linescore?.teams?.home?.runs ?? liveData?.boxscore?.teams?.home?.teamStats?.batting?.runs ?? null;

  return {
    mode: "final",
    team,
    nextGame: nextGame?.nextGame || null,
    upcomingSchedule: [],
    previousGame: null,
    live: null,
    final: {
      gamePk: gameData?.game?.pk || gameData?.gamePk,
      awayScore,
      homeScore,
      summary: buildFinalSummary(gameData, liveData),
      celebration: buildFinalWinCelebration(gameData, team, awayScore, homeScore),
    },
    meta: {
      sourceStatus: `Final game state from MLB feed. ${gameData?.status?.detailedState || "Final"}`,
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

// Partial live normalization accepts an incomplete picture when MLB exposes
// some game resources but not the full live feed.
function normalizePartialLiveState(game, resources) {
  const teamEntry = getSelectedTeamEntry(game);
  const linescore = resources?.linescore || game?.linescore || {};
  const currentPlay = resources?.playByPlay?.currentPlay || getLastPlay(resources?.playByPlay?.allPlays);
  const boxscorePlayers = buildPlayerLookup(resources?.boxscore);
  const batter = normalizeBatter(currentPlay, boxscorePlayers);
  const pitcher = normalizePitcher(currentPlay, boxscorePlayers);
  const availableResources = describePartialLiveResources(resources);

  return {
    mode: "live",
    team: normalizeTeamIdentity(teamEntry?.team),
    nextGame: null,
    upcomingSchedule: [],
    previousGame: null,
    live: {
      gamePk: game?.gamePk,
      status: game?.status?.detailedState || "In Progress",
      startTime: game?.gameDate || null,
      away: {
        ...normalizeTeamIdentity(game?.teams?.away?.team),
        score: game?.teams?.away?.score ?? linescore?.teams?.away?.runs ?? 0,
        hits: linescore?.teams?.away?.hits ?? null,
        errors: linescore?.teams?.away?.errors ?? null,
      },
      home: {
        ...normalizeTeamIdentity(game?.teams?.home?.team),
        score: game?.teams?.home?.score ?? linescore?.teams?.home?.runs ?? 0,
        hits: linescore?.teams?.home?.hits ?? null,
        errors: linescore?.teams?.home?.errors ?? null,
      },
      inning: linescore?.currentInning ?? 0,
      inningHalf: linescore?.inningHalf || null,
      outs: currentPlay?.count?.outs ?? linescore?.outs ?? 0,
      balls: currentPlay?.count?.balls ?? linescore?.balls ?? 0,
      strikes: currentPlay?.count?.strikes ?? linescore?.strikes ?? 0,
      bases: normalizeBases(linescore, currentPlay),
      batter,
      pitcher,
      celebration: buildLiveCelebration(currentPlay, batter, pitcher, {
        inning: linescore?.currentInning ?? 0,
        inningHalf: linescore?.inningHalf || null,
        awayScore: game?.teams?.away?.score ?? linescore?.teams?.away?.runs ?? 0,
        homeScore: game?.teams?.home?.score ?? linescore?.teams?.home?.runs ?? 0,
        awayTeamId: game?.teams?.away?.team?.id ?? null,
        homeTeamId: game?.teams?.home?.team?.id ?? null,
      }),
      linescore: normalizeLinescore(linescore?.innings),
      recentPlay: currentPlay?.result?.description || getLastPlayDescription(resources?.playByPlay?.allPlays) || "Showing partial live game data.",
      updatedAt: Date.now(),
    },
    final: null,
    meta: {
      sourceStatus: `Live fallback using MLB ${availableResources} because feed/live was unavailable.`,
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

// Schedule-level live fallback is the final safety net when richer resources
// are missing for a game that is clearly in progress.
function normalizeScheduleLiveFallback(game) {
  const teamEntry = getSelectedTeamEntry(game);
  const opponentEntry = getOpponentTeamEntry(game);
  const linescore = game?.linescore || {};

  return {
    mode: "live",
    team: normalizeTeamIdentity(teamEntry?.team),
    nextGame: null,
    upcomingSchedule: [],
    previousGame: null,
      live: {
        gamePk: game?.gamePk,
        status: game?.status?.detailedState || "In Progress",
        startTime: game?.gameDate || null,
        away: {
          ...normalizeTeamIdentity(game?.teams?.away?.team),
          score: game?.teams?.away?.score ?? linescore?.teams?.away?.runs ?? 0,
        hits: linescore?.teams?.away?.hits ?? null,
        errors: linescore?.teams?.away?.errors ?? null,
      },
      home: {
        ...normalizeTeamIdentity(game?.teams?.home?.team),
        score: game?.teams?.home?.score ?? linescore?.teams?.home?.runs ?? 0,
        hits: linescore?.teams?.home?.hits ?? null,
        errors: linescore?.teams?.home?.errors ?? null,
      },
      inning: linescore?.currentInning ?? 0,
      inningHalf: linescore?.inningHalf || null,
      outs: linescore?.outs ?? 0,
      balls: 0,
      strikes: 0,
      bases: normalizeBases(linescore, null),
      batter: null,
      pitcher: null,
      celebration: null,
      linescore: normalizeLinescore(linescore?.innings),
      recentPlay: "Live feed and partial game endpoints were unavailable. Showing schedule-level linescore only.",
      updatedAt: Date.now(),
    },
    final: null,
    meta: {
      sourceStatus: "Schedule fallback active because feed/live and partial live endpoints were unavailable.",
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

async function normalizeScheduleFinalFallback(game, upcomingGame) {
  const teamEntry = getSelectedTeamEntry(game);
  const linescore = game?.linescore || {};
  const nextGame = upcomingGame ? await normalizePregameState(upcomingGame) : null;
  const team = normalizeTeamIdentity(teamEntry?.team);
  const awayScore = game?.teams?.away?.score ?? linescore?.teams?.away?.runs ?? null;
  const homeScore = game?.teams?.home?.score ?? linescore?.teams?.home?.runs ?? null;

  return {
    mode: "final",
    team,
    nextGame: nextGame?.nextGame || null,
    upcomingSchedule: [],
    previousGame: null,
    live: null,
    final: {
      gamePk: game?.gamePk,
      awayScore,
      homeScore,
      summary: `${game?.status?.detailedState || "Final"}. Feed unavailable, showing schedule-level summary.`,
      celebration: buildFinalWinCelebration(game, team, awayScore, homeScore),
    },
    meta: {
      sourceStatus: "Final schedule fallback active because MLB feed/live returned 404.",
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

async function enrichProbablePitchers(game) {
  const teamEntry = getSelectedTeamEntry(game);
  const opponentEntry = getOpponentTeamEntry(game);
  const teamPitcherId = teamEntry?.probablePitcher?.id || null;
  const opponentPitcherId = opponentEntry?.probablePitcher?.id || null;
  const teamFallbackName = probablePitcherName(teamEntry?.probablePitcher);
  const opponentFallbackName = probablePitcherName(opponentEntry?.probablePitcher);
  const season = String(new Date().getFullYear());

  const [teamPitcher, opponentPitcher] = await Promise.all([
    fetchPitcherProfile(teamPitcherId, season, teamFallbackName),
    fetchPitcherProfile(opponentPitcherId, season, opponentFallbackName),
  ]);

  return {
    team: teamPitcher,
    opponent: opponentPitcher,
  };
}

async function enrichStandings(game) {
  const teamEntry = getSelectedTeamEntry(game);
  const opponentEntry = getOpponentTeamEntry(game);
  const season = String(new Date(game?.gameDate || Date.now()).getFullYear());

  try {
    const params = new URLSearchParams({
      leagueId: "103,104",
      season,
      standingsTypes: "regularSeason",
    });
    const payload = await fetchJson(`${API_BASE}/standings?${params.toString()}`, {
      allowNotFound: true,
    });
    const records = Array.isArray(payload?.records) ? payload.records : [];
    const standingMap = new Map();

    for (const record of records) {
      const divisionName =
        record?.division?.nameShort ||
        record?.division?.abbreviation ||
        record?.division?.name ||
        "";
      for (const teamRecord of record?.teamRecords || []) {
        const teamId = teamRecord?.team?.id;
        if (!teamId) {
          continue;
        }
        const rank = teamRecord?.divisionRank || teamRecord?.sportRank || null;
        standingMap.set(teamId, formatStandingLine(teamId, divisionName, rank));
      }
    }

    return {
      teamStanding: standingMap.get(teamEntry?.team?.id) || null,
      opponentStanding: standingMap.get(opponentEntry?.team?.id) || null,
    };
  } catch {
    return {
      teamStanding: null,
      opponentStanding: null,
    };
  }
}

async function fetchPitcherProfile(playerId, season, fallbackName) {
  if (!playerId) {
    return fallbackName
      ? {
          id: null,
          name: fallbackName,
          photo: "",
          throws: null,
          seasonLine: null,
        }
      : null;
  }

  try {
    const params = new URLSearchParams({
      hydrate: `stats(group=[pitching],type=[season],season=${season})`,
    });
    const payload = await fetchJson(`${API_BASE}/people/${playerId}?${params.toString()}`, {
      allowNotFound: true,
    });
    const person = payload?.people?.[0];
    const seasonStats = person?.stats?.[0]?.splits?.[0]?.stat || null;

    return {
      id: playerId,
      name: person?.fullName || fallbackName || "Probable Pitcher",
      photo: headshotUrl(playerId),
      throws: person?.pitchHand?.code || null,
      seasonStats: extractSeasonPitchingStats(seasonStats),
      seasonLine: buildSeasonPitchingLine(seasonStats),
    };
  } catch {
    return {
      id: playerId,
      name: fallbackName || "Probable Pitcher",
      photo: headshotUrl(playerId),
      throws: null,
      seasonStats: null,
      seasonLine: null,
    };
  }
}

function buildNoGameState(teamId) {
  const team = teamIdentityFromId(teamId);
  return {
    mode: "pregame",
    team,
    nextGame: {
      gamePk: null,
      opponent: "No scheduled opponent found",
      opponentAbbr: "",
      opponentLogoUrl: "",
      statusText: "Schedule unavailable",
      teamRecord: null,
      opponentRecord: null,
      isHome: true,
      venue: "Schedule unavailable",
      startTime: null,
      countdownTargetMs: null,
      probablePitchers: {
        team: null,
        opponent: null,
      },
    },
    upcomingSchedule: [],
    previousGame: null,
    live: null,
    final: null,
    meta: {
      sourceStatus: "No relevant game found in the current schedule window.",
      lastSuccessfulUpdate: Date.now(),
      lastError: null,
    },
  };
}

function normalizeTeamIdentity(team) {
  return {
    id: team?.id ?? null,
    name: team?.name || "Unknown Team",
    abbr: team?.abbreviation || team?.abbrev || "",
    logoUrl: teamLogoUrl(team?.id),
  };
}

function normalizeUpcomingScheduleItem(game) {
  const teamEntry = getSelectedTeamEntry(game);
  const opponentEntry = getOpponentTeamEntry(game);

  return {
    gamePk: game?.gamePk ?? null,
    startTime: game?.gameDate || null,
    statusText: game?.status?.detailedState || game?.status?.abstractGameState || null,
    isHome: Boolean(teamEntry?.isHome),
    opponentName: opponentEntry?.team?.name || "Opponent",
    opponentAbbr: opponentEntry?.team?.abbreviation || opponentEntry?.team?.abbrev || "",
    opponentLogoUrl: teamLogoUrl(opponentEntry?.team?.id),
  };
}

function normalizeLinescore(innings) {
  if (!Array.isArray(innings)) {
    return [];
  }

  return innings.map((inning) => ({
    inning: inning?.num ?? inning?.ordinalNum ?? 0,
    away: inning?.away?.runs ?? null,
    home: inning?.home?.runs ?? null,
  }));
}

// Runner occupancy can come from different payload shapes depending on whether
// we are in the full-feed path or a partial-live fallback path.
function normalizeBases(linescore, currentPlay) {
  return {
    first: Boolean(linescore?.offense?.first || currentPlay?.matchup?.postOnFirst),
    second: Boolean(linescore?.offense?.second || currentPlay?.matchup?.postOnSecond),
    third: Boolean(linescore?.offense?.third || currentPlay?.matchup?.postOnThird),
  };
}

function hasPartialLiveResources(resources) {
  return Boolean(resources?.boxscore || resources?.linescore || resources?.playByPlay);
}

function describePartialLiveResources(resources) {
  const labels = [];

  if (resources?.boxscore) {
    labels.push("boxscore");
  }
  if (resources?.linescore) {
    labels.push("linescore");
  }
  if (resources?.playByPlay) {
    labels.push("playByPlay");
  }

  return labels.length ? labels.join(", ") : "schedule";
}

function normalizePreviousGame(game) {
  if (!game) {
    return null;
  }

  return {
    gamePk: game?.gamePk,
    startTime: game?.gameDate || null,
    status: game?.status?.detailedState || game?.status?.abstractGameState || "Final",
    away: normalizeTeamIdentity(game?.teams?.away?.team),
    home: normalizeTeamIdentity(game?.teams?.home?.team),
    awayScore: game?.teams?.away?.score ?? game?.linescore?.teams?.away?.runs ?? null,
    awayHits: game?.linescore?.teams?.away?.hits ?? null,
    awayErrors: game?.linescore?.teams?.away?.errors ?? null,
    homeScore: game?.teams?.home?.score ?? game?.linescore?.teams?.home?.runs ?? null,
    homeHits: game?.linescore?.teams?.home?.hits ?? null,
    homeErrors: game?.linescore?.teams?.home?.errors ?? null,
    linescore: normalizeLinescore(game?.linescore?.innings),
  };
}

function normalizeBatter(currentPlay, playerLookup) {
  const batter = currentPlay?.matchup?.batter;
  if (!batter?.id) {
    return null;
  }

  const player = playerLookup.get(batter.id) || null;
  return {
    id: batter.id,
    name: batter.fullName || batter.lastInitName || "Unknown Batter",
    photo: headshotUrl(batter.id),
    bats: currentPlay?.matchup?.batSide?.code || null,
    battingOrder: normalizeBattingOrder(player?.battingOrder),
    position: player?.position?.abbreviation || null,
    todayLine: player?.stats?.batting?.summary || null,
    gameStats: extractGameBattingStats(player?.stats?.batting),
    seasonStats: extractSeasonBattingStats(player?.seasonStats?.batting),
    seasonLine: buildSeasonBattingLine(player?.seasonStats?.batting),
  };
}

function normalizeBattingOrder(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return null;
  }

  const numericValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue >= 100 ? Math.floor(numericValue / 100) : numericValue;
}

function normalizePitcher(currentPlay, playerLookup) {
  const pitcher = currentPlay?.matchup?.pitcher;
  if (!pitcher?.id) {
    return null;
  }

  const player = playerLookup.get(pitcher.id) || null;
  return {
    id: pitcher.id,
    name: pitcher.fullName || pitcher.lastInitName || "Unknown Pitcher",
    photo: headshotUrl(pitcher.id),
    throws: currentPlay?.matchup?.pitchHand?.code || null,
    pitchCount: player?.stats?.pitching?.numberOfPitches ?? null,
    todayLine: player?.stats?.pitching?.summary || null,
    gameStats: extractGamePitchingStats(player?.stats?.pitching),
    seasonStats: extractSeasonPitchingStats(player?.seasonStats?.pitching),
    seasonLine: buildSeasonPitchingLine(player?.seasonStats?.pitching),
  };
}

function buildPlayerLookup(boxscore) {
  const lookup = new Map();
  const teams = [boxscore?.teams?.away?.players, boxscore?.teams?.home?.players];

  for (const teamPlayers of teams) {
    if (!teamPlayers) {
      continue;
    }

    for (const key of Object.keys(teamPlayers)) {
      const player = teamPlayers[key];
      if (player?.person?.id) {
        lookup.set(player.person.id, player);
      }
    }
  }

  return lookup;
}

function buildSeasonBattingLine(stats) {
  if (!stats) {
    return null;
  }

  const average = stats.avg || stats.average;
  const onBase = stats.obp;
  const ops = stats.ops;
  const parts = [];

  if (average) {
    parts.push(`${average} AVG`);
  }
  if (onBase) {
    parts.push(`${onBase} OBP`);
  }
  if (ops) {
    parts.push(`${ops} OPS`);
  }

  return parts.join(" / ") || null;
}

function extractSeasonBattingStats(stats) {
  if (!stats) {
    return null;
  }

  return {
    average: stats.avg || stats.average || null,
    onBase: stats.obp || null,
    ops: stats.ops || null,
    hits: stats.hits ?? null,
    runs: stats.runs ?? null,
    homeRuns: stats.homeRuns ?? null,
  };
}

function extractGameBattingStats(stats) {
  if (!stats) {
    return null;
  }

  return {
    hits: stats.hits ?? null,
    runs: stats.runs ?? null,
    rbi: stats.rbi ?? null,
    walks: stats.baseOnBalls ?? null,
    hitByPitch: stats.hitByPitch ?? null,
    sacFlies: stats.sacFlies ?? null,
  };
}

function buildSeasonPitchingLine(stats) {
  if (!stats) {
    return null;
  }

  const era = stats.era;
  const whip = stats.whip;
  const strikeouts = stats.strikeOuts;
  const parts = [];

  if (era) {
    parts.push(`${era} ERA`);
  }
  if (whip) {
    parts.push(`${whip} WHIP`);
  }
  if (strikeouts) {
    parts.push(`${strikeouts} K`);
  }

  return parts.join(" / ") || null;
}

function extractSeasonPitchingStats(stats) {
  if (!stats) {
    return null;
  }

  return {
    era: stats.era ?? null,
    whip: stats.whip ?? null,
    strikeouts: stats.strikeOuts ?? null,
  };
}

function extractGamePitchingStats(stats) {
  if (!stats) {
    return null;
  }

  return {
    strikeouts: stats.strikeOuts ?? null,
    pickoffs: stats.pickoffs ?? null,
  };
}

function buildLiveCelebration(currentPlay, batter, pitcher, liveContext = null) {
  if (!currentPlay?.result) {
    return null;
  }

  // Order matters here. Signature "marquee" events such as home runs and
  // doubles should win first, then generic scoring calls like RBI / RUN, and
  // only after that should plain events like SINGLE or WALK claim the overlay.
  const eventType = normalizeCelebrationEventType(
    currentPlay?.result?.eventType ||
    currentPlay?.result?.event ||
    currentPlay?.result?.type
  );
  const celebrationId = String(
    currentPlay?.playId ||
    currentPlay?.atBatIndex ||
    currentPlay?.about?.atBatIndex ||
    `${eventType}-${currentPlay?.result?.description || "play"}`
  );
  const rbi = Number(currentPlay?.result?.rbi || 0);
  const runsScored = countRunsScored(currentPlay);
  const impactContext = buildScoringImpactContext(liveContext, runsScored);

  if (eventType === "home_run" && batter?.name) {
    const isGrandSlam = rbi >= 4;
    return buildCelebrationPayload({
      id: `${celebrationId}:${isGrandSlam ? "grand_slam" : "home_run"}`,
      eventKey: isGrandSlam ? "grand_slam" : "home_run",
      label: isGrandSlam ? "GRAND SLAM" : "HOME RUN",
      detail: buildHitCelebrationDetail(isGrandSlam ? "grand_slam" : "home_run", impactContext, runsScored, rbi),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (eventType === "triple" && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:triple`,
      eventKey: "triple",
      label: "TRIPLE",
      detail: buildHitCelebrationDetail("triple", impactContext, runsScored, rbi),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (eventType === "double" && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:double`,
      eventKey: "double",
      label: "DOUBLE",
      detail: buildHitCelebrationDetail("double", impactContext, runsScored, rbi),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (isDoublePlayCelebration(eventType) && pitcher?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:double_play`,
      eventKey: "double_play",
      label: "DOUBLE PLAY",
      detail: buildDoublePlayCelebrationDetail(eventType),
      actor: pitcher.name,
      tone: "pitcher",
      beneficiaryRole: "pitcher",
      impactContext: null,
    });
  }

  if (isPickoffCelebration(eventType) && pitcher?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:pickoff`,
      eventKey: "pickoff",
      label: "PICKOFF",
      detail: buildPickoffCelebrationDetail(eventType),
      actor: pitcher.name,
      tone: "pitcher",
      beneficiaryRole: "pitcher",
      impactContext: null,
    });
  }

  if (isCaughtStealingCelebration(eventType) && pitcher?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:caught_stealing`,
      eventKey: "caught_stealing",
      label: "CAUGHT STEALING",
      detail: buildCaughtStealingCelebrationDetail(eventType),
      actor: pitcher.name,
      tone: "pitcher",
      beneficiaryRole: "pitcher",
      impactContext: null,
    });
  }

  if (isStrikeoutCelebration(eventType) && pitcher?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:strikeout`,
      eventKey: "strikeout",
      label: "STRIKEOUT",
      detail: buildStrikeoutCelebrationDetail(batter?.name, pitcher?.gameStats?.strikeouts),
      actor: pitcher.name,
      tone: "pitcher",
      beneficiaryRole: "pitcher",
      impactContext: null,
    });
  }

  if (isSacFlyCelebration(eventType) && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:sac_fly`,
      eventKey: "sac_fly",
      label: "SAC FLY",
      detail: buildSacFlyCelebrationDetail(impactContext, runsScored),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (isHitByPitchCelebration(eventType) && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:hit_by_pitch`,
      eventKey: "hit_by_pitch",
      label: "HIT BY PITCH",
      detail: buildHitByPitchCelebrationDetail(impactContext, runsScored, batter?.gameStats?.hitByPitch),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (isFieldErrorCelebration(eventType) && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:field_error`,
      eventKey: "field_error",
      label: "ERROR",
      detail: buildFieldErrorCelebrationDetail(impactContext, runsScored),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (rbi > 0 && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:rbi`,
      eventKey: "rbi",
      label: buildScoringCelebrationLabel("rbi", impactContext, runsScored),
      detail: impactContext
        ? buildScoringCelebrationDetail("rbi", impactContext, runsScored)
        : "drives in the run",
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (runsScored > 0 && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:run`,
      eventKey: "run",
      label: buildScoringCelebrationLabel("run", impactContext, runsScored),
      detail: impactContext
        ? buildScoringCelebrationDetail("run", impactContext, runsScored)
        : "comes home to score",
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (eventType === "single" && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:single`,
      eventKey: "single",
      label: "SINGLE",
      detail: buildHitCelebrationDetail("single", impactContext, runsScored, rbi),
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: impactContext?.key || null,
    });
  }

  if (isWalkCelebration(eventType) && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:walk`,
      eventKey: "walk",
      label: "WALK",
      detail: "works the walk",
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: null,
    });
  }

  if (isHitCelebration(eventType) && batter?.name) {
    return buildCelebrationPayload({
      id: `${celebrationId}:hit`,
      eventKey: "hit",
      label: "HIT",
      detail: "delivers a base hit",
      actor: batter.name,
      tone: "batter",
      beneficiaryRole: "batter",
      impactContext: null,
    });
  }

  return null;
}

function buildCelebrationPayload(config) {
  return {
    id: config.id,
    eventKey: config.eventKey,
    impactContext: config.impactContext || null,
    label: config.label,
    detail: config.detail,
    actor: config.actor,
    tone: config.tone,
    beneficiaryRole: config.beneficiaryRole,
    forceSelectedTeamBenefit: Boolean(config.forceSelectedTeamBenefit),
    teamLogoUrl: config.teamLogoUrl || "",
    playerPhoto: config.playerPhoto || "",
  };
}

function normalizeCelebrationEventType(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

function isHitCelebration(eventType) {
  return ["single", "double", "triple", "home_run"].includes(eventType);
}

function isHitByPitchCelebration(eventType) {
  return eventType === "hit_by_pitch";
}

function isWalkCelebration(eventType) {
  return ["walk", "intent_walk"].includes(eventType);
}

function isSacFlyCelebration(eventType) {
  return eventType === "sac_fly";
}

function isFieldErrorCelebration(eventType) {
  return eventType === "field_error";
}

function isDoublePlayCelebration(eventType) {
  return [
    "double_play",
    "grounded_into_double_play",
    "strikeout_double_play",
  ].includes(eventType);
}

function isCaughtStealingCelebration(eventType) {
  return eventType.startsWith("caught_stealing");
}

function isPickoffCelebration(eventType) {
  return eventType.startsWith("pickoff");
}

function isStrikeoutCelebration(eventType) {
  return eventType.includes("strikeout") || eventType.includes("strike_out");
}

function countRunsScored(currentPlay) {
  const runners = Array.isArray(currentPlay?.runners) ? currentPlay.runners : [];
  return runners.filter((runner) => {
    const end = String(runner?.movement?.end || "").toLowerCase();
    return end === "score";
  }).length;
}

function buildScoringImpactContext(liveContext, runsScored) {
  const scoringRuns = Number(runsScored);
  if (!Number.isFinite(scoringRuns) || scoringRuns <= 0) {
    return null;
  }

  const battingSide = resolveBattingSide(liveContext?.inningHalf);
  if (!battingSide) {
    return null;
  }

  const battingTeamId = battingSide === "away" ? liveContext?.awayTeamId : liveContext?.homeTeamId;
  if (Number(battingTeamId) !== Number(workerState.teamId)) {
    return null;
  }

  const battingAfter = Number(battingSide === "away" ? liveContext?.awayScore : liveContext?.homeScore);
  const fieldingAfter = Number(battingSide === "away" ? liveContext?.homeScore : liveContext?.awayScore);
  if (!Number.isFinite(battingAfter) || !Number.isFinite(fieldingAfter)) {
    return null;
  }

  const battingBefore = battingAfter - scoringRuns;
  const inning = Number(liveContext?.inning || 0);
  const leadBefore = battingBefore - fieldingAfter;

  if (battingBefore < fieldingAfter && battingAfter === fieldingAfter) {
    return { key: "game_tying", runsScored: scoringRuns };
  }

  if (battingBefore <= fieldingAfter && battingAfter > fieldingAfter) {
    return { key: "go_ahead", runsScored: scoringRuns };
  }

  if (battingBefore > fieldingAfter && (leadBefore <= 2 || inning >= 7)) {
    return { key: "insurance", runsScored: scoringRuns };
  }

  return null;
}

function resolveBattingSide(inningHalf) {
  const normalized = String(inningHalf || "").trim().toLowerCase();
  if (normalized.startsWith("top")) {
    return "away";
  }
  if (normalized.startsWith("bottom")) {
    return "home";
  }
  return null;
}

function buildHitCelebrationDetail(eventType, impactContext, runsScored, rbi = 0) {
  if (!impactContext?.key) {
    return defaultHitCelebrationDetail(eventType, rbi);
  }

  if (impactContext.key === "game_tying") {
    if (eventType === "home_run" || eventType === "grand_slam") {
      return `ties it with ${homeRunCallPhrase(eventType, rbi)}`;
    }
    return `delivers the game tying ${formatCelebrationEventLabel(eventType)}`;
  }

  if (impactContext.key === "go_ahead") {
    if (eventType === "home_run") {
      return `puts them ahead with ${homeRunCallPhrase("home_run", rbi)}`;
    }
    if (eventType === "grand_slam") {
      return "blows it open with a grand slam";
    }
    return `delivers the go ahead ${formatCelebrationEventLabel(eventType)}`;
  }

  if (eventType === "home_run") {
    return `adds on with ${homeRunCallPhrase("home_run", rbi)}`;
  }
  if (eventType === "grand_slam") {
    return "breaks it open with a grand slam";
  }

  return `adds insurance with ${articleForEvent(eventType)} ${formatCelebrationEventLabel(eventType)}`;
}

function buildHitByPitchCelebrationDetail(impactContext, runsScored, hitByPitchCount) {
  if (impactContext?.key) {
    if (impactContext.key === "game_tying") {
      return "forces in the tying run";
    }
    if (impactContext.key === "go_ahead") {
      return "forces in the lead run";
    }
    return Number(runsScored) > 1 ? "forces in more insurance" : "forces in a cushion run";
  }

  return "wears one to reach";
}

function buildSacFlyCelebrationDetail(impactContext, runsScored) {
  if (impactContext?.key) {
    if (impactContext.key === "game_tying") {
      return "lifts the sac fly that ties it";
    }
    if (impactContext.key === "go_ahead") {
      return "lifts the sac fly that puts them ahead";
    }
    return Number(runsScored) > 1 ? "lifts a sac fly to add more insurance" : "lifts a sac fly to add cushion";
  }

  return runsScored > 1 ? "lifts a sac fly and plates runs" : "lifts a sac fly to plate the run";
}

function buildFieldErrorCelebrationDetail(impactContext, runsScored) {
  if (impactContext?.key) {
    if (impactContext.key === "game_tying") {
      return "reaches as the error ties it";
    }
    if (impactContext.key === "go_ahead") {
      return "reaches as the error puts them ahead";
    }
    return Number(runsScored) > 1 ? "reaches as the error adds more insurance" : "reaches as the error adds cushion";
  }

  if (runsScored > 1) {
    return "reaches as runs score on the error";
  }

  if (runsScored === 1) {
    return "reaches as the run scores on the error";
  }

  return "reaches on the error";
}

function defaultHitCelebrationDetail(eventType, rbi = 0) {
  if (eventType === "grand_slam") {
    return "crushes a grand slam";
  }
  if (eventType === "home_run") {
    return `launches ${articleForPhrase(homeRunCallPhrase("home_run", rbi))} ${homeRunCallPhrase("home_run", rbi)}`;
  }

  if (eventType === "single") {
    return "slashes a single";
  }
  if (eventType === "double") {
    return "ropes a double";
  }
  if (eventType === "triple") {
    return "legs out a triple";
  }

  return `delivers ${articleForEvent(eventType)} ${formatCelebrationEventLabel(eventType)}`;
}

function buildHomeRunDetail(rbi) {
  if (rbi >= 4) {
    return "grand slam";
  }
  if (rbi >= 3) {
    return "three run blast";
  }
  if (rbi === 2) {
    return "two run shot";
  }
  return "solo shot";
}

function buildScoringCelebrationLabel(baseType, impactContext, runsScored) {
  if (!impactContext?.key) {
    return baseType === "run" ? "RUN" : "RBI";
  }

  if (impactContext.key === "game_tying") {
    return baseType === "run" ? "GAME TYING RUN" : "GAME TYING RBI";
  }

  if (impactContext.key === "go_ahead") {
    return baseType === "run" ? "GO AHEAD RUN" : "GO AHEAD RBI";
  }

  if (Number(runsScored) > 1) {
    return "INSURANCE RUNS";
  }
  return "INSURANCE RUN";
}

function buildScoringCelebrationDetail(baseType, impactContext, runsScored) {
  if (!impactContext?.key) {
    return baseType === "run" ? "comes home to score" : "drives in the run";
  }

  if (impactContext.key === "game_tying") {
    return baseType === "run" ? "comes home to tie it" : "ties the game";
  }

  if (impactContext.key === "go_ahead") {
    if (baseType === "run") {
      return Number(runsScored) > 1 ? "comes home to swing the lead" : "comes home to put them in front";
    }
    return Number(runsScored) > 1 ? "swings the lead" : "puts them in front";
  }

  if (baseType === "run") {
    return Number(runsScored) > 1 ? "crosses with more insurance" : "comes home to add cushion";
  }

  return Number(runsScored) > 1 ? "adds to the cushion" : "adds cushion";
}

function buildDoublePlayCelebrationDetail(eventType) {
  if (eventType === "strikeout_double_play") {
    return "strikes out the batter and doubles off the runner";
  }

  if (eventType === "grounded_into_double_play") {
    return "gets the grounder and turns two";
  }

  return "turns two";
}

function buildCaughtStealingCelebrationDetail(eventType) {
  const baseLabel = baseLabelFromEventType(eventType);
  return baseLabel ? `cuts down the runner at ${baseLabel}` : "cuts down the runner";
}

function buildPickoffCelebrationDetail(eventType) {
  const baseLabel = baseLabelFromEventType(eventType);

  if (eventType.includes("caught_stealing")) {
    return baseLabel ? `nabs the runner at ${baseLabel}` : "erases the runner";
  }

  return baseLabel ? `catches the runner at ${baseLabel}` : "catches the runner leaning";
}

function buildStrikeoutCelebrationDetail(batterName, strikeoutCount) {
  if (batterName) {
    return `strikes out ${batterName}`;
  }

  if (strikeoutCount && Number.isFinite(Number(strikeoutCount))) {
    return `picks up strikeout number ${Number(strikeoutCount)}`;
  }

  return "blows it by the batter";
}

function formatCelebrationEventLabel(eventType) {
  return String(eventType || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ");
}

function baseLabelFromEventType(eventType) {
  const normalized = String(eventType || "").toLowerCase();
  if (normalized.endsWith("_1b")) {
    return "first";
  }
  if (normalized.endsWith("_2b")) {
    return "second";
  }
  if (normalized.endsWith("_3b")) {
    return "third";
  }
  if (normalized.endsWith("_home")) {
    return "home";
  }
  return "";
}

function describeRunCount(runsScored) {
  const runs = Number(runsScored);
  if (runs === 2) {
    return "two run";
  }
  if (runs === 3) {
    return "three run";
  }
  if (runs >= 4) {
    return "four run";
  }
  return "one run";
}

function articleForEvent(eventType) {
  const value = String(eventType || "").toLowerCase();
  return value === "error" ? "an" : "a";
}

function articleForPhrase(value) {
  return /^[aeiou]/i.test(String(value || "").trim()) ? "an" : "a";
}

function homeRunCallPhrase(eventType, rbi = 0) {
  if (eventType === "grand_slam" || rbi >= 4) {
    return "grand slam";
  }
  if (rbi >= 3) {
    return "three run blast";
  }
  if (rbi === 2) {
    return "two run shot";
  }
  return "solo shot";
}

function buildFinalSummary(gameData, liveData) {
  const away = gameData?.teams?.away?.name || "Away";
  const home = gameData?.teams?.home?.name || "Home";
  const awayRuns = liveData?.linescore?.teams?.away?.runs ?? 0;
  const homeRuns = liveData?.linescore?.teams?.home?.runs ?? 0;
  const status = gameData?.status?.detailedState || "Final";
  return `${status}. ${away} ${awayRuns}, ${home} ${homeRuns}.`;
}

function buildFinalWinCelebration(gameData, selectedTeam, awayScore, homeScore) {
  // Final-mode celebrations are intentionally winner-only and selected-team
  // only. That lets the app celebrate a win once on the transition to `final`
  // without replaying for losses or neutral results.
  const winnerSide = resolveWinningSide(awayScore, homeScore);
  if (!winnerSide) {
    return null;
  }

  const awayEntry = gameData?.teams?.away || null;
  const homeEntry = gameData?.teams?.home || null;
  const awayTeam = awayEntry?.team || awayEntry;
  const homeTeam = homeEntry?.team || homeEntry;
  const winnerTeam = normalizeTeamIdentity(winnerSide === "away" ? awayTeam : homeTeam);

  if (Number(winnerTeam?.id) !== Number(selectedTeam?.id)) {
    return null;
  }

  const winnerScore = winnerSide === "away" ? awayScore : homeScore;
  const loserScore = winnerSide === "away" ? homeScore : awayScore;
  const gamePk = gameData?.game?.pk || gameData?.gamePk || "final";
  const scoreLine = Number.isFinite(Number(winnerScore)) && Number.isFinite(Number(loserScore))
    ? `${winnerScore}-${loserScore}`
    : "the win";

  return buildCelebrationPayload({
    id: `final-win:${gamePk}:${scoreLine}`,
    eventKey: "win_the_game",
    label: "WIN THE GAME",
    detail: `closes it out ${scoreLine}`,
    actor: selectedTeam?.name || winnerTeam?.name || "Selected Team",
    tone: "batter",
    beneficiaryRole: "batter",
    forceSelectedTeamBenefit: true,
    teamLogoUrl: selectedTeam?.logoUrl || winnerTeam?.logoUrl || "",
  });
}

function resolveWinningSide(awayScore, homeScore) {
  const awayRuns = Number(awayScore);
  const homeRuns = Number(homeScore);

  if (!Number.isFinite(awayRuns) || !Number.isFinite(homeRuns) || awayRuns === homeRuns) {
    return null;
  }

  return awayRuns > homeRuns ? "away" : "home";
}

function getSelectedTeamEntry(game) {
  const awayId = game?.teams?.away?.team?.id;
  if (awayId === workerState.teamId) {
    return { ...game.teams.away, isHome: false };
  }
  return { ...game?.teams?.home, isHome: true };
}

function getOpponentTeamEntry(game) {
  const awayId = game?.teams?.away?.team?.id;
  return awayId === workerState.teamId ? game?.teams?.home : game?.teams?.away;
}

function getSelectedFeedTeam(gameData) {
  const away = gameData?.teams?.away;
  if (away?.id === workerState.teamId) {
    return away;
  }
  return gameData?.teams?.home;
}

// These classifiers intentionally keep postponed / delayed / suspended games in
// the pregame lane instead of letting them slip into a misleading "final".
function isLiveGame(game) {
  const abstractState = game?.status?.abstractGameState;
  const codedState = game?.status?.codedGameState;
  return abstractState === "Live" || codedState === "I";
}

function isScoreboardActiveGame(game) {
  const detailedState = String(game?.status?.detailedState || "").toLowerCase();
  return (
    isLiveGame(game) ||
    detailedState.includes("delay") ||
    detailedState.includes("suspend")
  );
}

function isUpcomingGame(game) {
  const abstractState = game?.status?.abstractGameState;
  const gameTime = new Date(game?.gameDate || 0).getTime();
  return abstractState === "Preview" || (abstractState === "Pre-Game" && gameTime >= Date.now());
}

function isPregameCandidate(game) {
  const detailedState = String(game?.status?.detailedState || "").toLowerCase();
  const abstractState = String(game?.status?.abstractGameState || "").toLowerCase();
  const gameTime = new Date(game?.gameDate || 0).getTime();

  if (abstractState === "preview" || abstractState === "pre-game") {
    return true;
  }

  if (
    detailedState.includes("postpon") ||
    detailedState.includes("delay") ||
    detailedState.includes("suspend")
  ) {
    return gameTime >= Date.now() - (24 * 60 * 60 * 1000);
  }

  return false;
}

function isFinalGame(game) {
  const abstractState = game?.status?.abstractGameState;
  const detailedState = String(game?.status?.detailedState || "").toLowerCase();

  if (
    detailedState.includes("postpon") ||
    detailedState.includes("delay") ||
    detailedState.includes("suspend") ||
    detailedState.includes("cancel")
  ) {
    return false;
  }

  return abstractState === "Final" || abstractState === "Completed Early";
}


function findRecentFinalGame(games) {
  const finals = games.filter(isFinalGame).sort((left, right) => new Date(right.gameDate).getTime() - new Date(left.gameDate).getTime());
  const recent = finals[0];

  if (!recent) {
    return null;
  }

  const endedAt = new Date(recent.gameDate).getTime();
  return Date.now() - endedAt <= FINAL_MODE_HOLD_MS ? recent : null;
}

function findPreviousCompletedGame(games, referenceGame = null) {
  const referenceTime = referenceGame?.gameDate
    ? new Date(referenceGame.gameDate).getTime()
    : Number.POSITIVE_INFINITY;

  return games
    .filter((game) => {
      if (!isFinalGame(game)) {
        return false;
      }

      const gameTime = new Date(game?.gameDate || 0).getTime();
      return Number.isFinite(gameTime) && gameTime < referenceTime;
    })
    .sort((left, right) => new Date(right.gameDate).getTime() - new Date(left.gameDate).getTime())[0] || null;
}

function buildUpcomingSchedule(games, referenceGame = null) {
  const referenceGamePk = referenceGame?.gamePk ?? null;
  const referenceTime = referenceGame?.gameDate
    ? new Date(referenceGame.gameDate).getTime()
    : Date.now();

  return games
    .filter((game) => {
      if (isLiveGame(game) || isFinalGame(game)) {
        return false;
      }

      const gameTime = new Date(game?.gameDate || 0).getTime();
      if (!Number.isFinite(gameTime)) {
        return false;
      }

      return game?.gamePk === referenceGamePk || gameTime >= referenceTime;
    })
    .sort((left, right) => new Date(left.gameDate).getTime() - new Date(right.gameDate).getTime())
    .slice(0, 6);
}

function withScoreboardGames(nextState, activeGames, recentGames) {
  return {
    ...nextState,
    activeGames: Array.isArray(activeGames) ? activeGames : [],
    recentGames: Array.isArray(recentGames) ? recentGames : [],
  };
}

function buildActiveGames(games) {
  return games
    .filter(isScoreboardActiveGame)
    .sort((left, right) => activeGameSortValue(left) - activeGameSortValue(right))
    .map(normalizeActiveGameSummary);
}

function buildRecentGames(games) {
  return games
    .filter(isFinalGame)
    .sort((left, right) => recentGameSortValue(left) - recentGameSortValue(right))
    .map((game) => normalizeScoreboardGameSummary(game, "final"));
}

function activeGameSortValue(game) {
  const liveWeight = isLiveGame(game) ? 0 : 1;
  const gameTime = new Date(game?.gameDate || 0).getTime();
  return liveWeight * 1_000_000_000_000 + (Number.isFinite(gameTime) ? gameTime : 0);
}

function recentGameSortValue(game) {
  const gameTime = new Date(game?.gameDate || 0).getTime();
  return Number.isFinite(gameTime) ? -gameTime : Number.POSITIVE_INFINITY;
}

function normalizeActiveGameSummary(game) {
  return normalizeScoreboardGameSummary(game, "active");
}

function normalizeScoreboardGameSummary(game, kind) {
  const away = normalizeTeamIdentity(game?.teams?.away?.team);
  const home = normalizeTeamIdentity(game?.teams?.home?.team);
  const linescore = game?.linescore || {};
  const awayScore = game?.teams?.away?.score ?? linescore?.teams?.away?.runs ?? null;
  const homeScore = game?.teams?.home?.score ?? linescore?.teams?.home?.runs ?? null;

  return {
    kind,
    gamePk: game?.gamePk ?? null,
    startTime: game?.gameDate || null,
    homeTeamId: home.id,
    away: {
      ...away,
      score: awayScore,
    },
    home: {
      ...home,
      score: homeScore,
    },
    status: kind === "final" ? buildRecentGameStatus(game) : buildActiveGameStatus(game),
    actionLabel: kind === "final" ? formatScoreboardCardDateLabel(game?.gameDate) : buildActiveGameElapsedLabel(game),
    winnerSide: kind === "final" ? resolveWinningSide(awayScore, homeScore) : null,
  };
}

function buildActiveGameStatus(game) {
  if (!isLiveGame(game)) {
    return game?.status?.detailedState || game?.status?.abstractGameState || "Live";
  }

  const inning = game?.linescore?.currentInning ?? game?.linescore?.scheduledInnings ?? null;
  const inningHalf = String(game?.linescore?.inningHalf || "").toLowerCase();

  if (!inning) {
    return "Live";
  }

  if (inningHalf.includes("top")) {
    return `Top ${inning}`;
  }
  if (inningHalf.includes("bottom")) {
    return `Bot ${inning}`;
  }
  if (inningHalf.includes("middle")) {
    return `Mid ${inning}`;
  }
  if (inningHalf.includes("end")) {
    return `End ${inning}`;
  }

  return `In ${inning}`;
}

function buildRecentGameStatus(game) {
  return game?.status?.detailedState || game?.status?.abstractGameState || "Final";
}

function buildActiveGameElapsedLabel(game) {
  const startMs = new Date(game?.gameDate || 0).getTime();
  if (!Number.isFinite(startMs)) {
    return "LIVE";
  }

  const elapsedMs = Math.max(0, Date.now() - startMs);
  const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;

  if (hours <= 0) {
    return `${Math.max(1, minutes)}M`;
  }

  return minutes > 0 ? `${hours}H ${minutes}M` : `${hours}H`;
}

function formatScoreboardCardDateLabel(value) {
  if (!value) {
    return "FINAL";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value)).toUpperCase();
}

function getLastPlay(allPlays) {
  return Array.isArray(allPlays) && allPlays.length ? allPlays[allPlays.length - 1] : null;
}

function getLastPlayDescription(allPlays) {
  return getLastPlay(allPlays)?.result?.description || null;
}

function headshotUrl(playerId) {
  return playerId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : "";
}

function teamLogoUrl(teamId) {
  return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : "";
}

function probablePitcherName(probablePitcher) {
  return probablePitcher?.fullName || probablePitcher?.name || probablePitcher?.lastInitName || null;
}

function buildTeamRecord(leagueRecord) {
  const wins = leagueRecord?.wins;
  const losses = leagueRecord?.losses;
  if (typeof wins !== "number" || typeof losses !== "number") {
    return null;
  }
  return `${wins}-${losses}`;
}

function formatStandingLine(teamId, divisionName, rank) {
  const resolvedDivision = divisionName || divisionNameFromTeamId(teamId) || null;

  if (!divisionName && !rank) {
    return null;
  }
  if (resolvedDivision && rank) {
    return `${ordinal(rank)} in ${resolvedDivision}`;
  }
  return resolvedDivision || (rank ? `${ordinal(rank)}` : null);
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
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

function divisionNameFromTeamId(teamId) {
  const divisions = {
    110: "AL East",
    111: "AL East",
    139: "AL East",
    141: "AL East",
    147: "AL East",
    114: "AL Central",
    116: "AL Central",
    118: "AL Central",
    142: "AL Central",
    145: "AL Central",
    108: "AL West",
    117: "AL West",
    133: "AL West",
    136: "AL West",
    140: "AL West",
    144: "NL East",
    120: "NL East",
    121: "NL East",
    143: "NL East",
    146: "NL East",
    112: "NL Central",
    113: "NL Central",
    134: "NL Central",
    138: "NL Central",
    158: "NL Central",
    109: "NL West",
    115: "NL West",
    119: "NL West",
    135: "NL West",
    137: "NL West",
  };

  return divisions[teamId] || null;
}

function teamIdentityFromId(teamId) {
  const teams = {
    108: { id: 108, name: "Los Angeles Angels", abbr: "LAA" },
    109: { id: 109, name: "Arizona Diamondbacks", abbr: "AZ" },
    110: { id: 110, name: "Baltimore Orioles", abbr: "BAL" },
    111: { id: 111, name: "Boston Red Sox", abbr: "BOS" },
    112: { id: 112, name: "Chicago Cubs", abbr: "CHC" },
    113: { id: 113, name: "Cincinnati Reds", abbr: "CIN" },
    114: { id: 114, name: "Cleveland Guardians", abbr: "CLE" },
    115: { id: 115, name: "Colorado Rockies", abbr: "COL" },
    116: { id: 116, name: "Detroit Tigers", abbr: "DET" },
    117: { id: 117, name: "Houston Astros", abbr: "HOU" },
    118: { id: 118, name: "Kansas City Royals", abbr: "KC" },
    119: { id: 119, name: "Los Angeles Dodgers", abbr: "LAD" },
    120: { id: 120, name: "Washington Nationals", abbr: "WSH" },
    121: { id: 121, name: "New York Mets", abbr: "NYM" },
    133: { id: 133, name: "Oakland Athletics", abbr: "ATH" },
    134: { id: 134, name: "Pittsburgh Pirates", abbr: "PIT" },
    135: { id: 135, name: "San Diego Padres", abbr: "SD" },
    136: { id: 136, name: "Seattle Mariners", abbr: "SEA" },
    137: { id: 137, name: "San Francisco Giants", abbr: "SF" },
    138: { id: 138, name: "St. Louis Cardinals", abbr: "STL" },
    139: { id: 139, name: "Tampa Bay Rays", abbr: "TB" },
    140: { id: 140, name: "Texas Rangers", abbr: "TEX" },
    141: { id: 141, name: "Toronto Blue Jays", abbr: "TOR" },
    142: { id: 142, name: "Minnesota Twins", abbr: "MIN" },
    143: { id: 143, name: "Philadelphia Phillies", abbr: "PHI" },
    144: { id: 144, name: "Atlanta Braves", abbr: "ATL" },
    145: { id: 145, name: "Chicago White Sox", abbr: "CWS" },
    146: { id: 146, name: "Miami Marlins", abbr: "MIA" },
    147: { id: 147, name: "New York Yankees", abbr: "NYY" },
    158: { id: 158, name: "Milwaukee Brewers", abbr: "MIL" },
  };

  return teams[teamId] || { id: teamId, name: "Selected Team", abbr: "" };
}

// Mock states mirror the real normalized contract on purpose. UI work should
// not need a separate render path just because the data is mocked.
function buildWorkerMockState(teamId, errorMessage) {
  const team = teamIdentityFromId(teamId);
  const phase = workerState.mockModeIndex;

  if (phase === 0) {
    return {
      mode: "pregame",
      team,
      nextGame: {
        gamePk: 2001,
        opponent: "Seattle Mariners",
        opponentAbbr: "SEA",
        opponentLogoUrl: teamLogoUrl(136),
        statusText: "Scheduled",
        teamRecord: "4-2",
        opponentRecord: "3-3",
        teamStanding: "2nd in AL East",
        opponentStanding: "3rd in AL West",
        isHome: true,
        venue: `${team.name} Home Park`,
        startTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
        countdownTargetMs: Date.now() + 90 * 60 * 1000,
        probablePitchers: {
          team: {
            id: 10,
            name: "Projected Starter",
            photo: headshotUrl(10),
            throws: "R",
            seasonStats: {
              era: "3.48",
              whip: "1.16",
              strikeouts: 41,
            },
            seasonLine: "3.48 ERA / 1.16 WHIP / 41 K",
          },
          opponent: {
            id: 11,
            name: "Opposing Starter",
            photo: headshotUrl(11),
            throws: "L",
            seasonStats: {
              era: "3.92",
              whip: "1.24",
              strikeouts: 36,
            },
            seasonLine: "3.92 ERA / 1.24 WHIP / 36 K",
          },
        },
      },
      upcomingSchedule: [
        {
          gamePk: 2001,
          startTime: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
          statusText: "Scheduled",
          isHome: true,
          opponentName: "Seattle Mariners",
          opponentAbbr: "SEA",
          opponentLogoUrl: teamLogoUrl(136),
        },
        {
          gamePk: 2004,
          startTime: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
          statusText: "Scheduled",
          isHome: true,
          opponentName: "Seattle Mariners",
          opponentAbbr: "SEA",
          opponentLogoUrl: teamLogoUrl(136),
        },
        {
          gamePk: 2005,
          startTime: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString(),
          statusText: "Scheduled",
          isHome: false,
          opponentName: "Boston Red Sox",
          opponentAbbr: "BOS",
          opponentLogoUrl: teamLogoUrl(111),
        },
        {
          gamePk: 2006,
          startTime: new Date(Date.now() + 74 * 60 * 60 * 1000).toISOString(),
          statusText: "Scheduled",
          isHome: false,
          opponentName: "Boston Red Sox",
          opponentAbbr: "BOS",
          opponentLogoUrl: teamLogoUrl(111),
        },
      ],
      previousGame: {
        gamePk: 1999,
        status: "Final",
        away: { id: 136, name: "Seattle Mariners", abbr: "SEA", logoUrl: teamLogoUrl(136) },
        home: { id: team.id, name: team.name, abbr: team.abbr, logoUrl: teamLogoUrl(team.id) },
        awayScore: 2,
        awayHits: 8,
        awayErrors: 0,
        homeScore: 4,
        homeHits: 9,
        homeErrors: 0,
        linescore: [
          { inning: 1, away: 0, home: 1 },
          { inning: 2, away: 1, home: 0 },
          { inning: 3, away: 0, home: 1 },
          { inning: 4, away: 0, home: 1 },
          { inning: 5, away: 1, home: 0 },
          { inning: 6, away: 0, home: 1 },
        ],
      },
      live: null,
      final: null,
      meta: {
        sourceStatus: errorMessage ? `Live MLB fetch failed. ${errorMessage}` : "Worker mock pregame state",
        lastSuccessfulUpdate: Date.now(),
        lastError: errorMessage || null,
      },
    };
  }

  if (phase === 1) {
    return {
      mode: "live",
      team,
      nextGame: null,
      upcomingSchedule: [],
      previousGame: null,
        live: {
          gamePk: 2002,
          status: "In Progress",
          startTime: new Date(Date.now() - ((2 * 60 + 14) * 60 * 1000)).toISOString(),
          away: { id: 136, name: "Seattle Mariners", abbr: "SEA", score: 2, logoUrl: teamLogoUrl(136) },
          home: { id: team.id, name: team.name, abbr: team.abbr, score: 4, logoUrl: teamLogoUrl(team.id) },
        inning: 6,
        inningHalf: "Bottom",
        outs: 2,
        balls: 1,
        strikes: 2,
        bases: { first: true, second: true, third: false },
        batter: {
          id: 1,
          name: "Current Batter",
          photo: "",
          bats: "R",
          battingOrder: 4,
          position: "CF",
          todayLine: "1-2, BB",
          gameStats: {
            hits: 2,
            runs: 1,
            rbi: 2,
            walks: 1,
          },
          seasonStats: {
            average: ".281",
            onBase: ".353",
            ops: ".812",
            hits: 18,
            runs: 12,
            homeRuns: 4,
          },
          seasonLine: ".281 AVG / .353 OBP",
        },
        pitcher: {
          id: 2,
          name: "Current Pitcher",
          photo: "",
          throws: "L",
          pitchCount: 71,
          todayLine: "5.2 IP, 2 ER",
          gameStats: {
            strikeouts: 7,
          },
          seasonStats: {
            era: "3.40",
            whip: "1.20",
            strikeouts: 44,
          },
          seasonLine: "3.40 ERA / 1.20 WHIP",
        },
        celebration: null,
        linescore: [
          { inning: 1, away: 0, home: 1 },
          { inning: 2, away: 1, home: 0 },
          { inning: 3, away: 0, home: 1 },
          { inning: 4, away: 0, home: 1 },
          { inning: 5, away: 1, home: 0 },
          { inning: 6, away: 0, home: 1 },
        ],
        recentPlay: "A sharp single through the right side plates the runner from second.",
        updatedAt: Date.now(),
      },
      final: null,
      meta: {
        sourceStatus: errorMessage ? `Live MLB fetch failed. ${errorMessage}` : "Worker mock live state",
        lastSuccessfulUpdate: Date.now(),
        lastError: errorMessage || null,
      },
    };
  }

  return {
    mode: "final",
    team,
    nextGame: {
      gamePk: 2003,
      opponent: "Boston Red Sox",
      opponentAbbr: "BOS",
      opponentLogoUrl: teamLogoUrl(111),
      statusText: "Final",
      teamRecord: "4-2",
      opponentRecord: "2-4",
      teamStanding: "2nd in AL East",
      opponentStanding: "4th in AL East",
      isHome: false,
      venue: "Fenway Park",
      startTime: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
      countdownTargetMs: Date.now() + 18 * 60 * 60 * 1000,
      probablePitchers: {
        team: {
          id: 12,
          name: "Next Starter",
          photo: headshotUrl(12),
          throws: "R",
          seasonStats: {
            era: "2.98",
            whip: "1.09",
            strikeouts: 52,
          },
          seasonLine: "2.98 ERA / 1.09 WHIP / 52 K",
        },
        opponent: {
          id: 13,
          name: "Next Opposing Starter",
          photo: headshotUrl(13),
          throws: "R",
          seasonStats: {
            era: "4.11",
            whip: "1.31",
            strikeouts: 33,
          },
          seasonLine: "4.11 ERA / 1.31 WHIP / 33 K",
        },
      },
    },
    upcomingSchedule: [],
    previousGame: null,
    live: null,
    final: {
      gamePk: 2002,
      awayScore: 2,
      homeScore: 4,
      summary: `${team.name} closes it out and moves on to the next series matchup.`,
      celebration: null,
    },
    meta: {
      sourceStatus: errorMessage ? `Live MLB fetch failed. ${errorMessage}` : "Worker mock final state",
      lastSuccessfulUpdate: Date.now(),
      lastError: errorMessage || null,
    },
  };
}

function buildMockActiveGames(teamId) {
  const selectedTeam = teamIdentityFromId(teamId);

  return [
    {
      gamePk: 3101,
      homeTeamId: 112,
      away: { ...teamIdentityFromId(138), logoUrl: teamLogoUrl(138), score: 2 },
      home: { ...teamIdentityFromId(112), logoUrl: teamLogoUrl(112), score: 5 },
      status: "Bot 6",
    },
    {
      gamePk: 3102,
      homeTeamId: 118,
      away: { ...teamIdentityFromId(116), logoUrl: teamLogoUrl(116), score: 1 },
      home: { ...teamIdentityFromId(118), logoUrl: teamLogoUrl(118), score: 1 },
      status: "Top 8",
    },
    {
      gamePk: 3103,
      homeTeamId: 147,
      away: { ...selectedTeam, logoUrl: teamLogoUrl(selectedTeam.id), score: 3 },
      home: { ...teamIdentityFromId(147), logoUrl: teamLogoUrl(147), score: 4 },
      status: "Delayed",
    },
  ];
}

function scheduleNextPoll(delay) {
  workerState.timerId = self.setTimeout(() => {
    pollNow();
  }, delay);
}

function clearScheduledPoll() {
  if (workerState.timerId) {
    self.clearTimeout(workerState.timerId);
    workerState.timerId = null;
  }
}

function resolvePollDelay(nextState) {
  if (nextState.mode === "live") {
    return POLL_INTERVALS.live;
  }

  if (nextState.mode === "final") {
    return POLL_INTERVALS.final;
  }

  const countdownTarget = nextState.nextGame?.countdownTargetMs;
  if (countdownTarget && countdownTarget - Date.now() <= 60 * 60 * 1000) {
    return POLL_INTERVALS.nearFirstPitch;
  }

  return POLL_INTERVALS.pregame;
}

function postStatus(message) {
  self.postMessage({ type: "STATUS", message });
}

function addDays(value, days) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}
