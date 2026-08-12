// ─── Element refs ────────────────────────────────────────────────────────────

const form             = document.getElementById("scheduler-form");
const formError        = document.getElementById("form-error");
const sectionSettings  = document.getElementById("section-settings");
const sectionNames     = document.getElementById("section-names");
const namesDescription = document.getElementById("names-description");
const teamNameGrid     = document.getElementById("team-name-grid");
const backBtn          = document.getElementById("back-to-settings");
const addTeamBtn       = document.getElementById("add-team-btn");
const generateDrawBtn  = document.getElementById("generate-draw-btn");
const splitDecision    = document.getElementById("split-decision");
const splitDecisionText= document.getElementById("split-decision-text");
const drawFullBtn      = document.getElementById("draw-full-btn");
const drawSplitBtn     = document.getElementById("draw-split-btn");
const drawPlateBtn     = document.getElementById("draw-plate-btn");
const drawModeFullBtn  = document.getElementById("draw-mode-full-btn");
const drawModeSplitBtn = document.getElementById("draw-mode-split-btn");
const drawModePlateBtn = document.getElementById("draw-mode-plate-btn");
const drawModeRandomBtn = document.getElementById("draw-mode-random-btn");
const drawModeManualBtn = document.getElementById("draw-mode-manual-btn");
const drawModeSubActions = document.getElementById("drawModeSubActions");
const platePairingSection = document.getElementById("plate-pairing-section");
const platePairingRandomBtn = document.getElementById("plate-pairing-random-btn");
const platePairingManualBtn = document.getElementById("plate-pairing-manual-btn");
const platePairingFinishedBtn = document.getElementById("plate-pairing-finished-btn");
const platePairingHelp = document.getElementById("plate-pairing-help");
const platePairingStep = document.getElementById("plate-pairing-step");
const platePairingSelected = document.getElementById("plate-pairing-selected");
const platePairingBye = document.getElementById("plate-pairing-bye");
const platePairingPairs = document.getElementById("plate-pairing-pairs");
const platePairingAvailable = document.getElementById("plate-pairing-available");

const results              = document.getElementById("results");
const totalMatchesEl       = document.getElementById("totalMatches");
const totalRoundsEl        = document.getElementById("totalRounds");
const totalSlotsEl         = document.getElementById("totalSlots");
const estimatedTimeEl      = document.getElementById("estimatedTime");
const scheduleDescriptionEl= document.getElementById("scheduleDescription");
const scheduleTeamOrderEl  = document.getElementById("scheduleTeamOrder");
const scheduleBody         = document.getElementById("scheduleBody");
const firstRoundRefSection = document.getElementById("first-round-ref-section");
const firstRoundRefHint = document.getElementById("first-round-ref-hint");
const firstRoundRefList = document.getElementById("first-round-ref-list");
const drawSeedLabel        = document.getElementById("drawSeedLabel");
const drawActions          = document.getElementById("drawActions");
const redrawBtn            = document.getElementById("redrawBtn");
const initialSortBtn       = document.getElementById("initialSortBtn");
const saveDrawBtn          = document.getElementById("saveDrawBtn");
const acceptBtn            = document.getElementById("acceptBtn");
const lockedBadge          = document.getElementById("lockedBadge");
const tableCardsSection    = document.getElementById("tableCardsSection");
const tableCards           = document.getElementById("tableCards");
const poolSummarySection   = document.getElementById("poolSummarySection");
const poolSummaryHint      = document.getElementById("poolSummaryHint");
const poolSummaryGrid      = document.getElementById("poolSummaryGrid");
const finalsSummarySection = document.getElementById("finals-summary-section");
const finalsSummaryHint    = document.getElementById("finals-summary-hint");
const finalsSummaryGrid    = document.getElementById("finals-summary-grid");
const sectionLive          = document.getElementById("section-live");
const livePoolSummarySection = document.getElementById("livePoolSummarySection");
const livePoolSummaryHint    = document.getElementById("livePoolSummaryHint");
const livePoolSummaryGrid    = document.getElementById("livePoolSummaryGrid");
const modeWaitingBtn        = document.getElementById("mode-waiting-btn");
const modeGamesBtn          = document.getElementById("mode-games-btn");
const dispatchModeHelp      = document.getElementById("dispatch-mode-help");

const step1Pill = document.getElementById("step1-pill");
const step2Pill = document.getElementById("step2-pill");
const step3Pill = document.getElementById("step3-pill");
const step4Pill = document.getElementById("step4-pill");
const step5Pill = document.getElementById("step5-pill");
const step6Pill = document.getElementById("step6-pill");
const portalMode = document.body?.dataset?.portalMode || "public";
const apiBase = document.body?.dataset?.apiBase || "api.php";
const publicHome = document.body?.dataset?.publicHome || "./";
const authShell = document.getElementById("auth-shell");
const appShell = document.getElementById("app-shell");
const loginCard = document.getElementById("login-card");
const authCardTitle = document.getElementById("auth-card-title");
const authCardDescription = document.getElementById("auth-card-description");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authToggleBtn = document.getElementById("auth-toggle-btn");
const adminDashboard = document.getElementById("admin-dashboard");
const dashboardTitle = document.getElementById("dashboard-title");
const dashboardDescription = document.getElementById("dashboard-description");
const adminRouteHint = document.getElementById("admin-route-hint");
const createTournamentForm = document.getElementById("create-tournament-form");
const openByCodeForm = document.getElementById("open-by-code-form");
const openByCodeInput = document.getElementById("open-by-code-input");
const openByCodeMessage = document.getElementById("open-by-code-message");
const tournamentNameInput = document.getElementById("tournament-name");
const adminMessage = document.getElementById("admin-message");
const dashboardTabs = document.getElementById("admin-dashboard-tabs");
const toggleTournamentsBtn = document.getElementById("toggle-tournaments-btn");
const tournamentsPanel = document.getElementById("tournaments-panel");
const tournamentList = document.getElementById("tournament-list");
const teamCountInput = document.getElementById("teamCount");
const tableCountInput = document.getElementById("tableCount");
const refSettingToggleLabel = document.querySelector(".ref-setting-toggle");
const refEnabledInput = document.getElementById("refEnabled");
const refModeWrap = document.getElementById("refModeWrap");
const refModeSelect = document.getElementById("refMode");

function buildFormBody(payload = {}) {
  const params = new URLSearchParams();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return params.toString();
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item === undefined || item === null ? "" : String(item)));
      return;
    }
    if (typeof value === "boolean") {
      params.append(key, value ? "1" : "0");
      return;
    }
    if (typeof value === "object") {
      params.append(key, JSON.stringify(value));
      return;
    }
    params.append(key, String(value));
  });

  return params.toString();
}

function buildApiPostOptions(payload = {}, extraOptions = {}) {
  const headers = { ...(extraOptions.headers || {}) };
  if (!Object.prototype.hasOwnProperty.call(headers, "Content-Type")) {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
  }

  return {
    ...extraOptions,
    method: "POST",
    headers,
    cache: "no-store",
    body: extraOptions.body !== undefined ? extraOptions.body : buildFormBody(payload),
  };
}

// ─── Session & remote sync ────────────────────────────────────────────────────

let sessionId = null;
let pollTimer = null;
let lastRemoteUpdatedAt = "";
let tournamentContext = null;
let joinIntentHandled = false;

// Expose getters for auth-portal.js to access module-scoped variables
window.getSessionId = () => sessionId;
window.getTournamentContext = () => tournamentContext;
window.setSessionId = (value) => { sessionId = value; };
window.setTournamentContext = (value) => { tournamentContext = value; };

function generateSessionId() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getOrCreateSessionId() {
  const p = new URLSearchParams(location.search);
  const existing = p.get("id");
  if (existing && existing.length > 0) return existing;
  return "";
}

function showSyncHint(message) {
  const hint = document.getElementById("session-offline-hint");
  if (!hint) return;
  hint.textContent = message;
  hint.classList.remove("hidden");
}

function hideSyncHint() {
  const hint = document.getElementById("session-offline-hint");
  if (!hint) return;
  hint.classList.add("hidden");
}

function syncApiUrl(action) {
  return `${apiUrl(action)}&id=${encodeURIComponent(sessionId)}`;
}

function initRemoteSync() {
  sessionId = getOrCreateSessionId();
  if (!sessionId) {
    updateSessionDisplay();
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set("id", sessionId);
  history.replaceState(null, "", url.toString());
  updateSessionDisplay();
  void refreshTournamentContext();

  if (location.protocol === "file:") {
    showSyncHint("Running as a local file — upload to your PHP hosting to enable multi-computer sync.");
    return;
  }

  hideSyncHint();
  fetchRemoteState();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(fetchRemoteState, 5000);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushStateForUnload();
  }
});
window.addEventListener("pagehide", () => {
  flushStateForUnload();
});

async function sendState(options = {}) {
  if (location.protocol === "file:" || !sessionId) return;
  const state = serializeState();
  if (!state) return;

  try {
    const response = await fetch(syncApiUrl("save"), buildApiPostOptions({ state }, {
      keepalive: Boolean(options.keepalive),
    }));
    const payload = await response.json();
    if (payload && payload.ok && payload.updatedAt) {
      lastRemoteUpdatedAt = payload.updatedAt;
      hideSyncHint();
    } else if (payload && payload.error) {
      showSyncHint(payload.error);
    }
  } catch (_) {
    showSyncHint("Could not save live state. Check api.php and config.php on your hosting.");
  }
}

function flushStateForUnload() {
  if (location.protocol === "file:" || !sessionId) return;
  const state = serializeState();
  if (!state) return;
  const endpoint = syncApiUrl("save");
  const payloadText = JSON.stringify({ state });

  let sent = false;
  if (typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([payloadText], { type: "application/json" });
      sent = navigator.sendBeacon(endpoint, blob);
    } catch (_) {
      sent = false;
    }
  }
  if (sent) return;

  try {
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      keepalive: true,
      body: payloadText,
    }).catch(() => {});
  } catch (_) {
  }
}

async function fetchRemoteState() {
  if (location.protocol === "file:" || !sessionId) return;

  try {
    const response = await fetch(syncApiUrl("get"), {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!payload || !payload.ok) {
      if (payload && payload.error) {
        showSyncHint(payload.error);
      }
      return;
    }

    hideSyncHint();
    if (!payload.updatedAt || payload.updatedAt === lastRemoteUpdatedAt || !payload.state) {
      return;
    }

    lastRemoteUpdatedAt = payload.updatedAt;
    applySerializedState(payload.state);
  } catch (_) {
    showSyncHint("Could not load shared state. Check api.php and config.php on your hosting.");
  }
}

function serializeState() {
  if (!lastParams) return null;
  return {
    version: 1,
    isLocked: Boolean(isLocked),
    editingFrozen,
    lastParams: lastParams ? {
      teamCount:  lastParams.teamCount,
      tableCount: lastParams.tableCount,
      gameMinutes: lastParams.gameMinutes,
      bestOfGames: lastParams.bestOfGames || 3,
      finalsTeamCount: lastParams.finalsTeamCount || 2,
      finalsBestOfByRound: lastParams.finalsBestOfByRound || {},
      minMinutes: lastParams.minMinutes,
      maxMinutes: lastParams.maxMinutes,
      location: lastParams.location || "",
      musterDate: lastParams.musterDate || "",
      autoLockMinutes: Number.isFinite(Number(lastParams.autoLockMinutes)) ? Number(lastParams.autoLockMinutes) : 15,
      autoStartEnabled: Boolean(lastParams.autoStartEnabled),
      isPublic: Boolean(lastParams.isPublic),
      visibilityDays: lastParams.visibilityDays || 7,
      teams:    lastParams.teams,
      initialTeams: lastParams.initialTeams || lastParams.teams,
      drawMode: lastParams.drawMode,
      drawData: lastParams.drawData,
      drawOrderMode: lastParams.drawOrderMode || "initial",
      refsEnabled: Boolean(lastParams.refsEnabled),
      refMode: lastParams.refMode || "none",
      loserRefMode: lastParams.loserRefMode || "none",
      firstRoundRefAssignments: lastParams.firstRoundRefAssignments || {},
      firstRoundRefRequiredTables: lastParams.firstRoundRefRequiredTables || [],
    } : null,
    live: live ? {
      allMatches:        live.allMatches,
      tables:            live.tables,
      completed:         live.completed,
      queueNums:         live.queue.map((m) => m.num),
      activePairsArr:    [...live.activePairs],
      playCount:         live.playCount,
      points:            live.points,
      teamTotalSeconds:  live.teamTotalSeconds,
      teamLoggedMatches: live.teamLoggedMatches,
      lastFinishedAtMs:  live.lastFinishedAtMs,
      loggedGameCount:   live.loggedGameCount,
      loggedGameSeconds: live.loggedGameSeconds,
      total:             live.total,
      teamNumbers:       live.teamNumbers,
      groups:            live.groups,
      refSettings:       live.refSettings || { enabled: false, mode: "none" },
      dispatchMode:      live.dispatchMode,
      lastUndoResult:    live.lastUndoResult || null,
    } : null,
  };
}

function applySerializedState(state) {
  if (!state || !state.lastParams) return;
  const sl = state.live;
  isLocked = Boolean(state.isLocked);
  editingFrozen = Boolean(state.editingFrozen || state.isLocked);
  const fallbackBestOfGames = state.lastParams.bestOfGames || 3;
  const fallbackExpectedGames = getExpectedGamesPerMatch(fallbackBestOfGames);
  lastParams = {
    ...state.lastParams,
    gameMinutes: state.lastParams.gameMinutes || Math.max(1, Math.round((((state.lastParams.minMinutes || state.lastParams.maxMinutes || 50) / fallbackExpectedGames)) / 5) * 5),
    bestOfGames: fallbackBestOfGames,
    finalsTeamCount: state.lastParams.finalsTeamCount || 2,
    finalsBestOfByRound: state.lastParams.finalsBestOfByRound || {},
    initialTeams: state.lastParams.initialTeams || state.lastParams.teams || [],
    drawOrderMode: state.lastParams.drawOrderMode || "initial",
    autoLockMinutes: Number.isFinite(Number(state.lastParams.autoLockMinutes)) ? Number(state.lastParams.autoLockMinutes) : 15,
    autoStartEnabled: Boolean(state.lastParams.autoStartEnabled),
    refsEnabled: Boolean(state.lastParams.refsEnabled),
    refMode: state.lastParams.refMode || "none",
    loserRefMode: state.lastParams.loserRefMode || "none",
    firstRoundRefAssignments: state.lastParams.firstRoundRefAssignments || {},
    firstRoundRefRequiredTables: state.lastParams.firstRoundRefRequiredTables || [],
  };
  lastSlots = state.lastParams.drawData ? state.lastParams.drawData.slots : [];

  if (sl) {
    const allMatchesByNum = new Map(sl.allMatches.map((m) => [m.num, m]));
    live = {
      allMatches:        sl.allMatches,
      queue:             (sl.queueNums || []).map((n) => allMatchesByNum.get(n)).filter(Boolean),
      tables:            sl.tables,
      activePairs:       new Set(sl.activePairsArr || []),
      playCount:         sl.playCount,
      points:            sl.points,
      teamTotalSeconds:  sl.teamTotalSeconds,
      teamLoggedMatches: sl.teamLoggedMatches,
      lastFinishedAtMs:  sl.lastFinishedAtMs,
      loggedGameCount:   sl.loggedGameCount,
      loggedGameSeconds: sl.loggedGameSeconds,
      completed:         sl.completed,
      total:             sl.total,
      teamNumbers:       sl.teamNumbers,
      initialTableOrder: [],
      groups:            sl.groups,
      refSettings:       normalizeRefSettings(sl.refSettings),
      dispatchMode:      sl.dispatchMode,
      lastUndoResult:    sl.lastUndoResult || null,
    };
    normalizeLiveTimerState();

    sectionSettings.classList.add("hidden");
    sectionNames.classList.add("hidden");
    results.classList.add("hidden");
    sectionLive.classList.remove("hidden");
    setStep(6);

    if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }
    ensureLiveTicker();
    renderLiveBoard();
    renderSettingsTab();
    updateSessionDisplay();
    syncEditingControls();
    return;
  }

  live = null;
  const restoredTeams = state.lastParams.initialTeams || state.lastParams.teams || [];
  const restoredMode = state.lastParams.drawMode || "full";
  runDraw(lastParams, restoredTeams, restoredMode, { teamOrder: state.lastParams.teams || restoredTeams });
  if (state.isLocked || state.editingFrozen) {
    isLocked = true;
    editingFrozen = true;
    drawActions?.classList.add("hidden");
    showStartStep();
    syncEditingControls();
  }
  updateSessionDisplay();
}

function updateSessionDisplay() {
  const id = sessionId || "---";
  const isFile = location.protocol === "file:";
  const fullUrl = (!isFile && sessionId)
    ? buildTournamentUrl(sessionId)
    : "(open the hosted PHP site to enable sharing)";

  const els = {
    "session-id-display":  id,
    "session-id-settings": id,
    "session-url-full":    fullUrl,
  };
  for (const [elId, text] of Object.entries(els)) {
    const el = document.getElementById(elId);
    if (el) el.textContent = text;
  }

  const activeSessionEl = document.getElementById("active-tournament-session");
  if (activeSessionEl) activeSessionEl.textContent = id;
}

function getShareUrl() {
  if (location.protocol === "file:" || !sessionId) {
    return "";
  }
  return buildTournamentUrl(sessionId);
}

function getJoinShareUrl() {
  if (location.protocol === "file:" || !sessionId) {
    return "";
  }
  return buildTournamentJoinUrl(sessionId);
}

function hasJoinIntent() {
  return new URLSearchParams(location.search).get("join") === "1";
}

function clearJoinIntent() {
  const url = new URL(location.href);
  if (!url.searchParams.has("join")) return;
  url.searchParams.delete("join");
  history.replaceState(null, "", url.toString());
}

function syncTournamentVisibilityInputs() {
  const isPublicInput = document.getElementById("tournament-public");
  const visibilityDaysInput = document.getElementById("tournament-public-days");
  if (!isPublicInput || !visibilityDaysInput) return;
  visibilityDaysInput.disabled = !isPublicInput.checked;
}

async function syncTournamentMeta(params) {
  if (!sessionId || !isPortalUserLoggedIn()) return;
  try {
    const response = await fetch(apiUrl("update-tournament-meta"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: sessionId,
        location: params.location || "",
        isPublic: Boolean(params.isPublic),
        visibilityDays: params.visibilityDays,
        musterDate: params.musterDate || "",
      }),
    });
    const payload = await response.json();
    if (payload && payload.ok) {
      void refreshTournamentContext();
    }
  } catch (_) {
  }
}

// Portal auth and tab logic moved to portal-helpers.js.

// ─── State ───────────────────────────────────────────────────────────────────

let isLocked  = false;
let editingFrozen = false;
let lastSlots = [];
let lastParams = null;
let pendingDrawRequest = null;
let pendingWinnerConfirm = null;
let platePairingMode = "random";
let platePairingSelection = null;
let platePairingPairsData = null;
let teamsSortMode = "position"; // "position" | "number"
let platePairingAvailableTeams = [];

function getActiveUndoResult() {
  if (!live || !live.lastUndoResult) return null;
  const expiresAt = live.lastUndoResult.undoExpiresAtMs || 0;
  if (expiresAt > Date.now()) {
    return live.lastUndoResult;
  }
  live.lastUndoResult = null;
  return null;
}

function normalizeRefSettings(refSettings) {
  if (!refSettings || !refSettings.enabled) {
    return { enabled: false, loserMode: "none", firstRoundMode: "none" };
  }
  return {
    enabled: true,
    loserMode: refSettings.loserMode || refSettings.mode || "loser-next-game",
    firstRoundMode: refSettings.firstRoundMode || "random",
  };
}

// ─── Step indicator ───────────────────────────────────────────────────────────

// Draw setup logic moved to draw-setup.js.
// ─── Live board ───────────────────────────────────────────────────────────────

// Live board logic moved to live-board.js.
// ─── Portal auth helpers ──────────────────────────────────────────────────────

// Portal helpers moved to portal-helpers.js.
