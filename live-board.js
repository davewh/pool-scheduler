// ─── Live board ───────────────────────────────────────────────────────────────

let live = null;
let liveTimerInterval = null;

function initLiveBoard(slots, tableCount, teams, drawData) {
  const allMatches = drawData.matches.map((match, index) => ({
    ...match,
    num: index + 1,
  }));
  const firstRoundRefs = lastParams?.firstRoundRefAssignments || {};

  live = {
    allMatches,
    queue: [...allMatches],
    tables: Array.from({ length: tableCount }, (_, i) => ({
      num: i + 1,
      state: "free",   // "playing" | "free" | "waiting" | "done"
      currentMatch: null,
      matchesPlayed: 0,
      pendingRefTeam: null,
      firstRoundRefTeam: firstRoundRefs[i + 1] || null,
    })),
    activePairs: new Set(),
    playCount: Object.fromEntries(teams.map((t) => [t, 0])),
    points: Object.fromEntries(teams.map((t) => [t, 0])),
    teamTotalSeconds: Object.fromEntries(teams.map((t) => [t, 0])),
    teamLoggedMatches: Object.fromEntries(teams.map((t) => [t, 0])),
    lastFinishedAtMs: Object.fromEntries(teams.map((t) => [t, Date.now()])),
    loggedGameCount: 0,
    loggedGameSeconds: 0,
    completed: [],
    total: allMatches.length,
    teamNumbers: Object.fromEntries(teams.map((team, index) => [team, index + 1])),
    initialTableOrder: Array.from({ length: tableCount }, (_, i) => i + 1),
    groups: drawData.groups,
    refSettings: normalizeRefSettings({
      enabled: Boolean(lastParams?.refsEnabled),
      loserMode: lastParams?.refsEnabled ? (lastParams?.loserRefMode || "loser-next-game") : "none",
      firstRoundMode: lastParams?.refsEnabled ? (lastParams?.refMode || "random") : "none",
    }),
    dispatchMode: "waiting",
    lastUndoResult: null,
  };

  results.classList.add("hidden");
  sectionLive.classList.remove("hidden");
  setStep(6);
  sectionLive.scrollIntoView({ behavior: "smooth", block: "start" });
  renderSettingsTab();
  updateSessionDisplay();
  ensureLiveTicker();
  autoDispatchAndRender();
  sendState();
}

function compareEligibleMatches(a, b) {
  const openingRoundActive = !hasEveryTeamPlayedOnce();
  if (openingRoundActive) {
    const aLow = Math.min(live.teamNumbers[a.teamA] || 0, live.teamNumbers[a.teamB] || 0);
    const bLow = Math.min(live.teamNumbers[b.teamA] || 0, live.teamNumbers[b.teamB] || 0);
    if (aLow !== bLow) return aLow - bLow;

    const aHigh = Math.max(live.teamNumbers[a.teamA] || 0, live.teamNumbers[a.teamB] || 0);
    const bHigh = Math.max(live.teamNumbers[b.teamA] || 0, live.teamNumbers[b.teamB] || 0);
    if (aHigh !== bHigh) return aHigh - bHigh;

    return a.num - b.num;
  }

  const aWaitA = waitingScore(a.teamA);
  const aWaitB = waitingScore(a.teamB);
  const bWaitA = waitingScore(b.teamA);
  const bWaitB = waitingScore(b.teamB);
  const aGamesA = live.playCount[a.teamA] || 0;
  const aGamesB = live.playCount[a.teamB] || 0;
  const bGamesA = live.playCount[b.teamA] || 0;
  const bGamesB = live.playCount[b.teamB] || 0;

  const aMinGames = Math.min(aGamesA, aGamesB);
  const bMinGames = Math.min(bGamesA, bGamesB);
  const aTotalGames = aGamesA + aGamesB;
  const bTotalGames = bGamesA + bGamesB;

  const aMinWait = Math.min(aWaitA, aWaitB);
  const bMinWait = Math.min(bWaitA, bWaitB);
  const aTotalWait = aWaitA + aWaitB;
  const bTotalWait = bWaitA + bWaitB;

  if (live.dispatchMode === "games") {
    if (aMinGames !== bMinGames) return aMinGames - bMinGames;
    if (aTotalGames !== bTotalGames) return aTotalGames - bTotalGames;
    if (aMinWait !== bMinWait) return bMinWait - aMinWait;
    if (aTotalWait !== bTotalWait) return bTotalWait - aTotalWait;
    return a.num - b.num;
  }

  function hasEveryTeamPlayedOnce() {
    if (!live || !live.playCount) return true;
    return Object.values(live.playCount).every((count) => count > 0);
  }

  if (aMinWait !== bMinWait) return bMinWait - aMinWait;
  if (aTotalWait !== bTotalWait) return bTotalWait - aTotalWait;
  if (aMinGames !== bMinGames) return aMinGames - bMinGames;
  if (aTotalGames !== bTotalGames) return aTotalGames - bTotalGames;

  return a.num - b.num;
}

function waitingScore(team) {
  const now = Date.now();
  const last = live.lastFinishedAtMs[team] || now;
  return Math.max(0, Math.floor((now - last) / 1000));
}

// Returns queue matches where neither team is currently on a table,
// sorted by longest waiting teams first.
function eligibleMatches(table = null) {
  return live.queue
    .filter((m) => {
      if (live.activePairs.has(m.teamA) || live.activePairs.has(m.teamB)) {
        return false;
      }

      if (!table) return true;
      return !m.allowedTables || m.allowedTables.includes(table.num);
    })
    .sort(compareEligibleMatches);
}

function assignLoserRefForTable(table, match) {
  if (!live?.refSettings?.enabled || live.refSettings.loserMode !== "loser-next-game") return null;
  const pendingRef = table.pendingRefTeam || null;
  if (!pendingRef) return null;
  if (pendingRef === match.teamA || pendingRef === match.teamB) return null;
  table.pendingRefTeam = null;
  return pendingRef;
}

function assignFirstRoundRefForTable(table, match) {
  if (!live?.refSettings?.enabled) return null;
  if (table.matchesPlayed !== 0 || table.pendingRefTeam) return null;
  const firstRoundRefTeam = table.firstRoundRefTeam || null;
  if (!firstRoundRefTeam) return null;
  if (firstRoundRefTeam === match.teamA || firstRoundRefTeam === match.teamB) return null;
  table.firstRoundRefTeam = null;
  return firstRoundRefTeam;
}

function assignMatch(tableNum, match) {
  const idx = live.queue.indexOf(match);
  if (idx === -1) return;
  live.queue.splice(idx, 1);

  const table = live.tables.find((t) => t.num === tableNum);
  const assignedRefTeam = assignFirstRoundRefForTable(table, match) || assignLoserRefForTable(table, match);
  table.currentMatch = {
    ...match,
    startedAtMs: Date.now(),
    runningStartedAtMs: null,
    elapsedBeforePauseSeconds: 0,
    timerState: "ready",
    refTeam: assignedRefTeam,
  };
  table.state = "playing";
  live.activePairs.add(match.teamA);
  live.activePairs.add(match.teamB);
}

function normalizeCurrentMatchTimer(match) {
  if (!match) return;
  if (!Number.isFinite(match.elapsedBeforePauseSeconds) || match.elapsedBeforePauseSeconds < 0) {
    match.elapsedBeforePauseSeconds = 0;
  }

  if (match.timerState !== "ready" && match.timerState !== "running" && match.timerState !== "paused") {
    if (Number.isFinite(match.runningStartedAtMs)) {
      match.timerState = "running";
    } else if (Number.isFinite(match.startedAtMs)) {
      match.timerState = "running";
      match.runningStartedAtMs = match.startedAtMs;
    } else {
      match.timerState = "ready";
    }
  }

  if (match.timerState === "running") {
    if (!Number.isFinite(match.runningStartedAtMs)) {
      match.runningStartedAtMs = Number.isFinite(match.startedAtMs) ? match.startedAtMs : Date.now();
    }
    if (!Number.isFinite(match.startedAtMs)) {
      match.startedAtMs = match.runningStartedAtMs;
    }
    return;
  }

  match.runningStartedAtMs = null;
  if (!Number.isFinite(match.startedAtMs)) {
    match.startedAtMs = Date.now();
  }
}

function getCurrentMatchElapsedSeconds(match) {
  if (!match) return 0;
  normalizeCurrentMatchTimer(match);
  const baseElapsed = Math.max(0, Math.floor(match.elapsedBeforePauseSeconds || 0));
  if (match.timerState !== "running" || !Number.isFinite(match.runningStartedAtMs)) {
    return baseElapsed;
  }
  const runningElapsed = Math.max(0, Math.floor((Date.now() - match.runningStartedAtMs) / 1000));
  return baseElapsed + runningElapsed;
}

function normalizeLiveTimerState() {
  if (!live || !Array.isArray(live.tables)) return;
  live.tables.forEach((table) => {
    if (table && table.currentMatch) {
      normalizeCurrentMatchTimer(table.currentMatch);
    }
  });
}

function clearMatchOutcome(match) {
  const restored = { ...match };
  delete restored.winner;
  delete restored.loser;
  delete restored.durationSeconds;
  delete restored.tableNum;
  return restored;
}

function clearWinnerConfirmation() {
  pendingWinnerConfirm = null;
}

function renderLiveAdminActions() {
  const wrap = document.getElementById("live-admin-actions");
  if (!wrap) return;
  wrap.classList.add("hidden");
}

function handleWinnerButtonClick(btn) {
  const tableNum = Number(btn.dataset.table);
  const winnerTeam = btn.dataset.winner;
  if (!tableNum || !winnerTeam) return;

  const table = live.tables.find((t) => t.num === tableNum);
  if (!table || table.state !== "playing" || !table.currentMatch) return;
  normalizeCurrentMatchTimer(table.currentMatch);
  if (table.currentMatch.timerState === "ready") return;

  const confirming = pendingWinnerConfirm
    && pendingWinnerConfirm.tableNum === tableNum
    && pendingWinnerConfirm.winnerTeam === winnerTeam;

  if (!confirming) {
    pendingWinnerConfirm = { tableNum, winnerTeam };
    renderLiveBoard();
    return;
  }

  finishMatch(tableNum, winnerTeam);
}

function handleTimerActionClick(btn) {
  const tableNum = Number(btn.dataset.table);
  const action = btn.dataset.timerAction;
  if (!tableNum || !action) return;
  const table = live.tables.find((t) => t.num === tableNum);
  if (!table || table.state !== "playing" || !table.currentMatch) return;

  const match = table.currentMatch;
  normalizeCurrentMatchTimer(match);

  if (action === "start" && match.timerState === "ready") {
    freezeEditing();
    const now = Date.now();
    match.timerState = "running";
    match.runningStartedAtMs = now;
    match.startedAtMs = now;
    renderLiveBoard();
    sendState();
    return;
  }

  if (action === "pause" && match.timerState === "running") {
    match.elapsedBeforePauseSeconds = getCurrentMatchElapsedSeconds(match);
    match.runningStartedAtMs = null;
    match.timerState = "paused";
    renderLiveBoard();
    sendState();
    return;
  }

  if (action === "resume" && match.timerState === "paused") {
    match.timerState = "running";
    match.runningStartedAtMs = Date.now();
    renderLiveBoard();
    sendState();
  }
}

function finishMatch(tableNum, winnerTeam) {
  const table = live.tables.find((t) => t.num === tableNum);
  if (table.state !== "playing") return;

  const m = table.currentMatch;
  normalizeCurrentMatchTimer(m);
  if (winnerTeam !== m.teamA && winnerTeam !== m.teamB) return;
  clearWinnerConfirmation();
  const loserTeam = winnerTeam === m.teamA ? m.teamB : m.teamA;
  const elapsedSeconds = Math.max(1, getCurrentMatchElapsedSeconds(m));
  const matchStartedAtMs = Number.isFinite(m.startedAtMs) ? m.startedAtMs : Date.now();
  const finishedAt = Date.now();

  live.lastUndoResult = {
    tableNum: table.num,
    match: {
      ...clearMatchOutcome(m),
      startedAtMs: finishedAt - (elapsedSeconds * 1000),
    },
    elapsedSeconds,
    winnerTeam,
    loserTeam,
    previousMatchesPlayed: table.matchesPlayed,
    previousPendingRefTeam: table.pendingRefTeam || null,
    previousLastFinishedAtMs: {
      [m.teamA]: live.lastFinishedAtMs[m.teamA] || matchStartedAtMs,
      [m.teamB]: live.lastFinishedAtMs[m.teamB] || matchStartedAtMs,
    },
    undoExpiresAtMs: finishedAt + 60000,
  };

  m.winner = winnerTeam;
  m.loser = loserTeam;
  m.durationSeconds = elapsedSeconds;
  m.tableNum = table.num;
  live.completed.push(m);
  live.activePairs.delete(m.teamA);
  live.activePairs.delete(m.teamB);
  live.lastFinishedAtMs[m.teamA] = finishedAt;
  live.lastFinishedAtMs[m.teamB] = finishedAt;
  live.playCount[m.teamA] = (live.playCount[m.teamA] || 0) + 1;
  live.playCount[m.teamB] = (live.playCount[m.teamB] || 0) + 1;
  live.points[winnerTeam] = (live.points[winnerTeam] || 0) + 1;
  live.points[loserTeam] = live.points[loserTeam] || 0;
  live.teamTotalSeconds[m.teamA] = (live.teamTotalSeconds[m.teamA] || 0) + elapsedSeconds;
  live.teamTotalSeconds[m.teamB] = (live.teamTotalSeconds[m.teamB] || 0) + elapsedSeconds;
  live.teamLoggedMatches[m.teamA] = (live.teamLoggedMatches[m.teamA] || 0) + 1;
  live.teamLoggedMatches[m.teamB] = (live.teamLoggedMatches[m.teamB] || 0) + 1;
  live.loggedGameCount += 1;
  live.loggedGameSeconds += elapsedSeconds;
  table.currentMatch = null;
  table.matchesPlayed++;
  if (live.refSettings?.enabled && live.refSettings.loserMode === "loser-next-game") {
    table.pendingRefTeam = loserTeam;
  }
  table.state = "free";
  autoDispatchAndRender(table.num);
  sendState();
}

function undoLastResult() {
  const snapshot = getActiveUndoResult();
  if (!live || !snapshot) return;
  clearWinnerConfirmation();
  const table = live.tables.find((t) => t.num === snapshot.tableNum);
  if (!table) return;

  if (table.currentMatch) {
    live.activePairs.delete(table.currentMatch.teamA);
    live.activePairs.delete(table.currentMatch.teamB);
    live.queue.unshift(clearMatchOutcome(table.currentMatch));
  }

  const completedIndex = live.completed.findIndex((match) => match.num === snapshot.match.num);
  if (completedIndex !== -1) {
    live.completed.splice(completedIndex, 1);
  }

  live.playCount[snapshot.match.teamA] = Math.max(0, (live.playCount[snapshot.match.teamA] || 0) - 1);
  live.playCount[snapshot.match.teamB] = Math.max(0, (live.playCount[snapshot.match.teamB] || 0) - 1);
  live.points[snapshot.winnerTeam] = Math.max(0, (live.points[snapshot.winnerTeam] || 0) - 1);
  live.teamTotalSeconds[snapshot.match.teamA] = Math.max(0, (live.teamTotalSeconds[snapshot.match.teamA] || 0) - snapshot.elapsedSeconds);
  live.teamTotalSeconds[snapshot.match.teamB] = Math.max(0, (live.teamTotalSeconds[snapshot.match.teamB] || 0) - snapshot.elapsedSeconds);
  live.teamLoggedMatches[snapshot.match.teamA] = Math.max(0, (live.teamLoggedMatches[snapshot.match.teamA] || 0) - 1);
  live.teamLoggedMatches[snapshot.match.teamB] = Math.max(0, (live.teamLoggedMatches[snapshot.match.teamB] || 0) - 1);
  live.loggedGameCount = Math.max(0, live.loggedGameCount - 1);
  live.loggedGameSeconds = Math.max(0, live.loggedGameSeconds - snapshot.elapsedSeconds);
  live.lastFinishedAtMs[snapshot.match.teamA] = snapshot.previousLastFinishedAtMs[snapshot.match.teamA];
  live.lastFinishedAtMs[snapshot.match.teamB] = snapshot.previousLastFinishedAtMs[snapshot.match.teamB];

  table.currentMatch = {
    ...snapshot.match,
    startedAtMs: Date.now() - (snapshot.elapsedSeconds * 1000),
    runningStartedAtMs: Date.now(),
    elapsedBeforePauseSeconds: snapshot.elapsedSeconds,
    timerState: "running",
  };
  table.pendingRefTeam = snapshot.previousPendingRefTeam || null;
  table.matchesPlayed = snapshot.previousMatchesPlayed;
  table.state = "playing";
  live.activePairs.add(snapshot.match.teamA);
  live.activePairs.add(snapshot.match.teamB);
  live.lastUndoResult = null;

  renderLiveBoard();
  sendState();
}

function dispatchTable(table) {
  if (!table || table.state !== "free") return false;
  const nextMatch = eligibleMatches(table)[0];
  if (!nextMatch) return false;
  assignMatch(table.num, nextMatch);
  return true;
}

function orderedFreeTables() {
  const freeTables = live.tables.filter((t) => t.state === "free");
  if (live.initialTableOrder.length === 0) {
    return freeTables;
  }

  const ordered = live.initialTableOrder
    .map((tableNum) => freeTables.find((table) => table.num === tableNum))
    .filter(Boolean);

  const remaining = freeTables.filter((table) => !live.initialTableOrder.includes(table.num));
  return [...ordered, ...remaining];
}

function matchIsReady(match) {
  if (live.activePairs.has(match.teamA) || live.activePairs.has(match.teamB)) {
    return false;
  }

  return live.tables.some((table) => table.state === "free" && (!match.allowedTables || match.allowedTables.includes(table.num)));
}

function queueForGroup(groupId) {
  return live.queue.filter((match) => match.groupId === groupId);
}

function completedForGroup(groupId) {
  return live.completed.filter((match) => match.groupId === groupId);
}

function autoDispatchAndRender(prioritizedTableNum = null) {
  if (prioritizedTableNum !== null) {
    const prioritizedTable = live.tables.find((t) => t.num === prioritizedTableNum);
    dispatchTable(prioritizedTable);
  }

  let dispatched;
  do {
    dispatched = false;
    orderedFreeTables().forEach((table) => {
      if (dispatchTable(table)) {
        dispatched = true;
      }
    });
    live.initialTableOrder = [];
  } while (dispatched);

  live.tables.forEach((t) => {
    if (t.state === "playing") return;

    if (live.queue.length === 0) {
      t.state = "done";
    } else if (eligibleMatches(t).length === 0) {
      t.state = "waiting";
    } else {
      t.state = "free";
    }
  });

  renderLiveBoard();
}

function busyReason(match) {
  const busy = [];
  if (live.activePairs.has(match.teamA)) busy.push(match.teamA);
  if (live.activePairs.has(match.teamB)) busy.push(match.teamB);
  return busy;
}

function playCountText(teamA, teamB) {
  const aCount = live.playCount[teamA] || 0;
  const bCount = live.playCount[teamB] || 0;
  const aPoints = live.points[teamA] || 0;
  const bPoints = live.points[teamB] || 0;
  return `${aCount}/${bCount} played · ${aPoints}/${bPoints} pts`;
}

function waitScoreText(teamA, teamB) {
  const aWait = waitingScore(teamA);
  const bWait = waitingScore(teamB);
  return `${fmtClock(aWait)}/${fmtClock(bWait)} waited`;
}

function teamStatusText(match) {
  const busyTeams = busyReason(match);
  if (busyTeams.length === 0) {
    if (live.dispatchMode === "games") {
      return `<span class="q-busy-reason muted">${gamePriorityText(match.teamA, match.teamB)}</span>`;
    }
    return `<span class="q-busy-reason muted">${waitScoreText(match.teamA, match.teamB)}</span>`;
  }

  return `<span class="q-busy-reason muted">${busyTeams.join(", ")} playing</span>`;
}

function gamePriorityText(teamA, teamB) {
  const aCount = live.playCount[teamA] || 0;
  const bCount = live.playCount[teamB] || 0;
  return `${aCount}/${bCount} games played`;
}

function standingsSummary() {
  const sorted = Object.entries(live.points)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3);

  if (sorted.length === 0) return "";
  return sorted.map(([team, pts]) => `${team} ${pts}pt${pts === 1 ? "" : "s"}`).join(" · ");
}

function averageTeamSeconds(team) {
  const matches = live.teamLoggedMatches[team] || 0;
  if (matches === 0) return null;
  return (live.teamTotalSeconds[team] || 0) / matches;
}

function fmtClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function nextUpText() {
  if (!live || live.queue.length === 0) {
    return "Next up: all matches complete.";
  }

  const next = queueSort()[0];
  if (next) {
    if (matchIsReady(next)) {
      return `Next up: ${next.teamA} vs ${next.teamB}`;
    }
  }

  const queued = queueSort()[0];
  if (!queued) {
    return "Next up: waiting for teams to finish.";
  }

  const busyTeams = busyReason(queued);
  if (busyTeams.length === 0) {
    return `Next up: ${queued.teamA} vs ${queued.teamB}`;
  }

  return `Next up: ${queued.teamA} vs ${queued.teamB} (waiting on ${busyTeams.join(" and ")})`;
}

function nextUpTextForMatches(matches, labelPrefix = "Next up") {
  if (!matches || matches.length === 0) {
    return `${labelPrefix}: all matches complete.`;
  }

  const next = queueSort(matches)[0];
  if (next && matchIsReady(next)) {
    return `${labelPrefix}: ${next.teamA} vs ${next.teamB}`;
  }

  const queued = queueSort(matches)[0];
  if (!queued) {
    return `${labelPrefix}: waiting for teams to finish.`;
  }

  const busyTeams = busyReason(queued);
  if (busyTeams.length === 0) {
    return `${labelPrefix}: ${queued.teamA} vs ${queued.teamB}`;
  }

  return `${labelPrefix}: ${queued.teamA} vs ${queued.teamB} (waiting on ${busyTeams.join(" and ")})`;
}

function ensureLiveTicker() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
  }

  liveTimerInterval = setInterval(() => {
    if (!live || sectionLive.classList.contains("hidden")) return;
    const hadUndoBefore = Boolean(live.lastUndoResult);
    const activeUndo = getActiveUndoResult();
    if (hadUndoBefore && !activeUndo) {
      renderLiveBoard();
      return;
    }

    live.tables.forEach((table) => {
      if (table.state !== "playing" || !table.currentMatch) return;
      const timerEl = document.getElementById(`timer-table-${table.num}`);
      if (!timerEl) return;
      const elapsed = getCurrentMatchElapsedSeconds(table.currentMatch);
      timerEl.textContent = fmtClock(elapsed);
    });

    renderLiveQueue();
    renderGamesStatusTable();
    renderTeamTimeStats();
    renderDashboard();
  }, 1000);
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderLiveBoard() {
  const done = live.completed.length;
  const total = live.total;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const activeTables = live.tables.filter((t) => t.state === "playing").length;
  const allDone = done === total && activeTables === 0;
  const splitMode = live.groups.length > 1;
  const strategyLabel = dispatchModeLabel(live.dispatchMode);

  document.getElementById("progress-fill").style.width = `${pct}%`;
  document.getElementById("progress-label").textContent = `${done} / ${total} matches complete`;
  document.getElementById("live-desc").textContent = allDone
    ? "🏆 All matches complete! Tournament done."
    : `${total - done} remaining · ${activeTables} table${activeTables !== 1 ? "s" : ""} active · Auto-dispatch: ${strategyLabel}${splitMode ? " across shared tables" : ""} · Leader: ${standingsSummary()}`;
  document.getElementById("live-nextup").textContent = nextUpText();
  dispatchModeHelp.textContent = dispatchModeHelpText(live.dispatchMode);
  modeWaitingBtn.classList.toggle("dispatch-mode-btn-active", live.dispatchMode === "waiting");
  modeGamesBtn.classList.toggle("dispatch-mode-btn-active", live.dispatchMode === "games");
  modeWaitingBtn.setAttribute("aria-pressed", String(live.dispatchMode === "waiting"));
  modeGamesBtn.setAttribute("aria-pressed", String(live.dispatchMode === "games"));
  renderPoolSummary(
    livePoolSummarySection,
    livePoolSummaryHint,
    livePoolSummaryGrid,
    live.groups,
    live.teamNumbers,
    {
      splitMode: live.groups.length > 1,
      hintText: "Pools are locked now, but any free table can be used by either pool to help both pools finish closer together.",
    }
  );

  renderLiveTables();
  renderLiveQueue();
  renderGamesStatusTable();
  renderTeamTimeStats();
  renderDashboard();
  renderLiveAdminActions();
}

// ─── Shared standings helpers ─────────────────────────────────────────────────

function getTeamStatusMeta(team) {
  const scheduledGames = live.allMatches.filter((match) => match.teamA === team || match.teamB === team).length;
  const playedGames = live.playCount[team] || 0;

  if (live.activePairs.has(team)) {
    const activeTable = live.tables.find((table) => table.state === "playing" && table.currentMatch && (table.currentMatch.teamA === team || table.currentMatch.teamB === team));
    const playingSeconds = activeTable?.currentMatch ? getCurrentMatchElapsedSeconds(activeTable.currentMatch) : 0;
    return { kind: "playing", label: `Playing ${fmtClock(playingSeconds)}` };
  }

  if (scheduledGames > 0 && playedGames >= scheduledGames) {
    return { kind: "finished", label: "Finished" };
  }

  return { kind: "waiting", label: `Waiting ${fmtClock(waitingScore(team))}` };
}

function buildStandingsRows(teams) {
  return teams.map((team) => {
    const isPlaying = live.activePairs.has(team);
    const activeTable = isPlaying
      ? live.tables.find((t) => t.state === "playing" && t.currentMatch && (t.currentMatch.teamA === team || t.currentMatch.teamB === team))
      : null;
    const playingSeconds = activeTable?.currentMatch ? getCurrentMatchElapsedSeconds(activeTable.currentMatch) : 0;
    const logged = live.teamLoggedMatches[team] || 0;
    const totalSeconds = live.teamTotalSeconds[team] || 0;
    const avg = averageTeamSeconds(team);
    const points = live.points[team] || 0;
    const waitingSeconds = waitingScore(team);
    const status = getTeamStatusMeta(team);
    return { team, isPlaying, playingSeconds, waitingSeconds, logged, totalSeconds, avg, points, status };
  }).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const h2hKey = [a.team, b.team].sort().join("|");
    const h2hWinner = live.completed.find((m) => {
      const key = [m.teamA, m.teamB].sort().join("|");
      return key === h2hKey && m.winner;
    })?.winner;
    if (h2hWinner === a.team) return -1;
    if (h2hWinner === b.team) return 1;
    return (live.teamNumbers[a.team] ?? 999) - (live.teamNumbers[b.team] ?? 999);
  });
}

function computePositions(sortedRows) {
  const h2h = new Map();
  live.completed.forEach((m) => {
    if (!m.winner) return;
    const key = [m.teamA, m.teamB].sort().join("|");
    h2h.set(key, m.winner);
  });

  const isTiedWith = (a, b) => {
    if (a.points !== b.points) return false;
    return !h2h.has([a.team, b.team].sort().join("|"));
  };

  const posMap = new Map();
  let groupStartPos = 1;
  for (let i = 0; i < sortedRows.length; i++) {
    let assignedPos;
    if (i === 0) {
      assignedPos = 1;
      groupStartPos = 1;
    } else if (isTiedWith(sortedRows[i], sortedRows[i - 1])) {
      assignedPos = groupStartPos;
    } else {
      groupStartPos = i + 1;
      assignedPos = groupStartPos;
    }
    posMap.set(sortedRows[i].team, { pos: assignedPos, tied: false });
  }
  posMap.forEach((val) => {
    val.tied = [...posMap.values()].some((v) => v !== val && v.pos === val.pos);
  });

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  return { posMap, ordinal };
}

function renderDashboard() {
  const summaryEl = document.getElementById("dashboard-summary");
  const tablesEl = document.getElementById("dashboard-tables");
  const teamsEl = document.getElementById("dashboard-teams");
  const gamesSummaryEl = document.getElementById("dashboard-games-summary");
  const gamesGridEl = document.getElementById("dashboard-games-grid");
  if (!live || !summaryEl || !tablesEl || !teamsEl || !gamesSummaryEl || !gamesGridEl) return;

  const activeTables = live.tables.filter((table) => table.state === "playing").length;
  const remaining = live.total - live.completed.length;
  summaryEl.textContent = `${remaining} remaining · ${activeTables} active · Leader: ${standingsSummary()}`;

  tablesEl.innerHTML = live.tables.map((table) => {
    if (table.state === "playing" && table.currentMatch) {
      const elapsed = getCurrentMatchElapsedSeconds(table.currentMatch);
      const timerState = table.currentMatch.timerState === "paused"
        ? "paused"
        : table.currentMatch.timerState === "ready"
          ? "not started"
          : "running";
      return `
        <article class="dashboard-table-item">
          <div class="dashboard-table-main">Table ${table.num}: ${table.currentMatch.teamA} vs ${table.currentMatch.teamB}</div>
          <div class="dashboard-table-meta">${table.matchesPlayed} played · ${fmtClock(elapsed)} ${timerState}</div>
        </article>
      `;
    }

    if (table.state === "waiting") {
      return `
        <article class="dashboard-table-item">
          <div class="dashboard-table-main">Table ${table.num}: waiting</div>
          <div class="dashboard-table-meta">${table.matchesPlayed} played · no eligible match right now</div>
        </article>
      `;
    }

    if (table.state === "done") {
      return `
        <article class="dashboard-table-item">
          <div class="dashboard-table-main">Table ${table.num}: complete</div>
          <div class="dashboard-table-meta">${table.matchesPlayed} played · no more matches</div>
        </article>
      `;
    }

    const nextReady = eligibleMatches(table)[0];
    return `
      <article class="dashboard-table-item">
        <div class="dashboard-table-main">Table ${table.num}: ready</div>
        <div class="dashboard-table-meta">${table.matchesPlayed} played${nextReady ? ` · next ${nextReady.teamA} vs ${nextReady.teamB}` : ""}</div>
      </article>
    `;
  }).join("");

  const groupEntries = live.groups && live.groups.length > 1
    ? live.groups.map((group) => ({
        label: group.label,
        teams: Array.from(new Set(
          live.allMatches
            .filter((match) => match.groupId === group.id)
            .flatMap((match) => [match.teamA, match.teamB])
        )),
      }))
    : [{ label: "Teams", teams: Object.keys(live.points) }];

  teamsEl.className = `dashboard-teams${groupEntries.length > 1 ? " dashboard-teams-split" : ""}`;
  teamsEl.innerHTML = groupEntries.map((group) => {
    const rows = buildStandingsRows(group.teams);
    const { posMap, ordinal } = computePositions(rows);

    return `
      <article class="dashboard-team-group">
        <h4>${group.label}</h4>
        <table class="dashboard-team-table">
          <thead>
            <tr>
              <th>Position</th>
              <th>Team Name</th>
              <th>Status</th>
              <th>Matches</th>
              <th>Total</th>
              <th>Average</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const { pos, tied } = posMap.get(row.team) || { pos: "-", tied: false };
              const posLabel = pos === "-" ? "-" : `${ordinal(pos)}${tied ? "=" : ""}`;
              return `
              <tr>
                <td>${posLabel}</td>
                <td>${row.team}</td>
                <td><span class="${row.status.kind === "playing" ? "team-status-playing" : row.status.kind === "finished" ? "team-status-finished" : "team-status-waiting"}">${row.status.label}</span></td>
                <td>${row.logged}</td>
                <td>${row.logged === 0 ? "-" : fmtClock(row.totalSeconds)}</td>
                <td>${row.avg === null ? "-" : fmtClock(row.avg)}</td>
                <td>${row.points}</td>
              </tr>
            `}).join("")}
          </tbody>
        </table>
      </article>
    `;
  }).join("");

  const completedByNum = new Map(live.completed.map((m) => [m.num, m]));
  const playingByNum = new Map(
    live.tables
      .filter((table) => table.state === "playing" && table.currentMatch)
      .map((table) => [table.currentMatch.num, {
        tableNum: table.num,
        elapsedSeconds: getCurrentMatchElapsedSeconds(table.currentMatch),
        timerState: table.currentMatch.timerState || "running",
      }])
  );
  gamesSummaryEl.textContent = `${live.completed.length} played · ${activeTables} playing · ${remaining} pending`;
  gamesGridEl.className = "games-status-grid";
  gamesGridEl.innerHTML = live.groups.length > 1
    ? live.groups.map((group) => renderGamesStatusGroup(group, completedByNum, playingByNum)).join("")
    : buildGamesStatusRows(live.allMatches, completedByNum, playingByNum);
}

function renderLiveTables() {
  const grid = document.getElementById("live-tables-grid");
  grid.innerHTML = "";
  const splitMode = live.groups.length > 1;

  if (splitMode) {
    grid.className = "shared-split-board";
    grid.innerHTML = `
      <div class="pool-overview-grid"></div>
      <div class="shared-tables-note muted">All tables are shared across both pools. The next free table takes the best eligible match using the current live mode.</div>
      <div class="live-tables-grid shared-live-tables-grid"></div>
    `;

    const overviewGrid = grid.querySelector(".pool-overview-grid");
    live.groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "pool-board-section";
      const activeCount = live.tables.filter((table) => (
        table.state === "playing"
        && table.currentMatch
        && table.currentMatch.groupId === group.id
      )).length;
      const groupQueue = queueForGroup(group.id);
      const groupDone = completedForGroup(group.id).length;
      const groupTotal = groupQueue.length + groupDone + activeCount;

      section.innerHTML = `
        <div class="pool-board-header">
          <div>
            <h3>${group.label}</h3>
            <p class="muted small">${formatGroupTableText(group)}</p>
          </div>
          <div class="pool-board-meta">
            <span>${groupDone}/${groupTotal} complete</span>
            <span>${activeCount} active</span>
            <span>${groupQueue.length} waiting</span>
          </div>
        </div>
        <div class="pool-board-nextup muted">${nextUpTextForMatches(groupQueue, `${group.label} next`)}</div>
      `;
      overviewGrid.appendChild(section);
    });

    const tableGrid = grid.querySelector(".shared-live-tables-grid");
    live.tables.forEach((table) => {
      tableGrid.appendChild(buildLiveTableCard(table));
    });
  } else {
    grid.className = "live-tables-grid";
    live.tables.forEach((table) => {
      grid.appendChild(buildLiveTableCard(table));
    });
  }

  grid.querySelectorAll(".btn-win").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleWinnerButtonClick(btn);
    });
  });
  grid.querySelectorAll("[data-timer-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleTimerActionClick(btn);
    });
  });
  grid.querySelectorAll("[data-undo-result='1']").forEach((btn) => {
    btn.addEventListener("click", () => {
      undoLastResult();
    });
  });
}

function winnerConfirmState(tableNum) {
  if (!pendingWinnerConfirm || pendingWinnerConfirm.tableNum !== tableNum) {
    return null;
  }
  return pendingWinnerConfirm;
}

function undoButtonMarkup(tableNum) {
  const undoResult = getActiveUndoResult();
  if (!undoResult || undoResult.tableNum !== tableNum || !isPortalUserLoggedIn()) {
    return "";
  }
  return `
    <button class="btn-secondary" data-undo-result="1" data-table="${tableNum}">
      Undo ${undoResult.winnerTeam} won
    </button>
  `;
}

function buildLiveTableCard(table) {
    const card = document.createElement("div");
    let stateClass = `live-table--${table.state}`;
    let bodyHtml = "";
    let poolBadge = "";

    if (table.state === "playing") {
      const m = table.currentMatch;
      normalizeCurrentMatchTimer(m);
      const aPts = live.points[m.teamA] || 0;
      const bPts = live.points[m.teamB] || 0;
      const elapsed = getCurrentMatchElapsedSeconds(m);
      const isReady = m.timerState === "ready";
      const isPaused = m.timerState === "paused";
      const timerAction = isReady ? "start" : isPaused ? "resume" : "pause";
      const timerActionLabel = isReady ? "Start game" : isPaused ? "Resume game" : "Pause game";
      const refereeLabel = m.refTeam
        ? `Referee: ${m.refTeam}`
        : live.refSettings?.enabled
          ? "Referee: not assigned yet"
          : "";
      const confirmState = winnerConfirmState(table.num);
      const teamAConfirming = Boolean(confirmState && confirmState.winnerTeam === m.teamA);
      const teamBConfirming = Boolean(confirmState && confirmState.winnerTeam === m.teamB);
      poolBadge = m.groupLabel ? `<span class="live-pool-badge">${m.groupLabel}</span>` : "";
      bodyHtml = `
        <div class="live-match-display">
          <div class="live-team">${m.teamA} <span class="live-team-points">${aPts} pt${aPts === 1 ? "" : "s"}</span></div>
          <div class="live-vs">VS</div>
          <div class="live-team">${m.teamB} <span class="live-team-points">${bPts} pt${bPts === 1 ? "" : "s"}</span></div>
        </div>
        <div class="live-timer-wrap">
          <span class="live-timer-label">Match timer</span>
          <strong id="timer-table-${table.num}" class="live-timer">${fmtClock(elapsed)}</strong>
        </div>
        ${refereeLabel ? `<div class="live-referee">${refereeLabel}</div>` : ""}
        <div class="result-prompt">${isReady ? "Start game before selecting winner:" : "Select winner:"}</div>
        <div class="result-actions">
          <button class="btn-win ${teamAConfirming ? "btn-win-confirming" : ""}" data-table="${table.num}" data-winner="${m.teamA}" ${teamAConfirming ? 'data-confirming="1"' : ""} ${isReady ? "disabled" : ""}>${teamAConfirming ? `Are you sure ${m.teamA} won?` : `${m.teamA} won`}</button>
          <button class="btn-secondary btn-game-control" data-table="${table.num}" data-timer-action="${timerAction}">${timerActionLabel}</button>
          <button class="btn-win ${teamBConfirming ? "btn-win-confirming" : ""}" data-table="${table.num}" data-winner="${m.teamB}" ${teamBConfirming ? 'data-confirming="1"' : ""} ${isReady ? "disabled" : ""}>${teamBConfirming ? `Are you sure ${m.teamB} won?` : `${m.teamB} won`}</button>
          ${undoButtonMarkup(table.num)}
        </div>
      `;
    } else if (table.state === "done") {
      bodyHtml = `
        <div class="live-waiting">
          <div class="live-waiting-icon">✅</div>
          <p>No more matches</p>
          ${table.pendingRefTeam ? `<p class="muted small">Pending ref: ${table.pendingRefTeam}</p>` : ""}
        </div>
        ${undoButtonMarkup(table.num)}
      `;
    } else if (table.state === "waiting") {
      // Free but no eligible matches (all teams currently playing) — show waiting
      stateClass = "live-table--waiting";
      const nextUp = live.queue.slice(0, 2).map((m) => `${m.groupLabel ? `${m.groupLabel}: ` : ""}${m.teamA} vs ${m.teamB}`).join(" · ");
      bodyHtml = `
        <div class="live-waiting">
          <div class="live-waiting-icon">⏳</div>
          <p>No eligible match right now</p>
          ${nextUp ? `<p class="muted small">Next: ${nextUp}</p>` : ""}
          ${table.pendingRefTeam ? `<p class="muted small">Pending ref: ${table.pendingRefTeam}</p>` : ""}
        </div>
        ${undoButtonMarkup(table.num)}
      `;
    } else {
      const nextReady = eligibleMatches(table)[0];
      bodyHtml = `
        <div class="live-waiting">
          <div class="live-waiting-icon">✅</div>
          <p>Table ready</p>
          ${nextReady ? `<p class="muted small">Next: ${nextReady.groupLabel ? `${nextReady.groupLabel}: ` : ""}${nextReady.teamA} vs ${nextReady.teamB}</p>` : ""}
          ${table.pendingRefTeam ? `<p class="muted small">Pending ref: ${table.pendingRefTeam}</p>` : ""}
        </div>
        ${undoButtonMarkup(table.num)}
      `;
    }

    card.className = `live-table-card ${stateClass}`;
    card.innerHTML = `
      <div class="live-table-header">
        <span>TABLE ${table.num}</span>
        ${poolBadge}
        <span class="table-played-count">${table.matchesPlayed} played</span>
      </div>
      <div class="live-table-body">${bodyHtml}      </div>
    `;
    return card;
}

function renderLiveQueue() {
  const el = document.getElementById("live-queue");
  const countEl = document.getElementById("queue-count-label");
  const splitMode = live.groups.length > 1;

  countEl.textContent = `${live.queue.length} remaining`;

  if (live.queue.length === 0) {
    el.innerHTML = `<p class="muted">${live.completed.length === live.total ? "All matches have been played!" : "No matches waiting."}</p>`;
    return;
  }

  if (splitMode) {
    el.className = "live-queue split-queue-grid";
    el.innerHTML = live.groups.map((group) => renderQueueGroup(group)).join("");
    return;
  }

  el.className = "live-queue";
  const readyNums = new Set(queueSort().filter(matchIsReady).map((m) => m.num));
  const shown = queueSort().slice(0, 12);
  el.innerHTML = shown.map((m) => {
    const ready = readyNums.has(m.num);
    return `
      <div class="queue-item ${ready ? "q-ready" : "q-busy"}">
        <span class="q-badge">${ready ? "Ready" : "Busy"}</span>
        <span class="q-teams">${m.teamA} vs ${m.teamB}</span>
        ${teamStatusText(m)}
        <span class="q-counts muted">${playCountText(m.teamA, m.teamB)}</span>
      </div>
    `;
  }).join("") + (live.queue.length > 12 ? `<p class="muted small" style="padding:0.5rem 0">+${live.queue.length - 12} more matches</p>` : "");
}

function renderQueueGroup(group) {
  const groupMatches = queueForGroup(group.id);
  const shown = queueSort(groupMatches).slice(0, 8);

  if (groupMatches.length === 0) {
    return `
      <section class="queue-group">
        <div class="queue-group-header">
          <h4>${group.label}</h4>
          <span class="muted">${formatGroupTableText(group)}</span>
        </div>
        <p class="muted small">No matches waiting in ${group.label.toLowerCase()}.</p>
      </section>
    `;
  }

  return `
    <section class="queue-group">
      <div class="queue-group-header">
        <h4>${group.label}</h4>
        <span class="muted">${groupMatches.length} remaining · ${formatGroupTableText(group)}</span>
      </div>
      <div class="queue-group-list">
        ${shown.map((m) => {
          const ready = matchIsReady(m);
          return `
            <div class="queue-item ${ready ? "q-ready" : "q-busy"}">
              <span class="q-badge">${ready ? "Ready" : "Busy"}</span>
              <span class="q-teams">${m.teamA} vs ${m.teamB}</span>
              ${teamStatusText(m)}
              <span class="q-counts muted">${playCountText(m.teamA, m.teamB)}</span>
            </div>
          `;
        }).join("")}
        ${groupMatches.length > 8 ? `<p class="muted small">+${groupMatches.length - 8} more matches</p>` : ""}
      </div>
    </section>
  `;
}

function setDispatchMode(mode) {
  if (!live || (mode !== "waiting" && mode !== "games")) return;
  if (live.dispatchMode === mode) {
    renderLiveBoard();
    renderSettingsTab();
    return;
  }

  live.dispatchMode = mode;
  autoDispatchAndRender();
  renderSettingsTab();
  sendState();
}

modeWaitingBtn?.addEventListener("click", () => {
  setDispatchMode("waiting");
});

modeGamesBtn?.addEventListener("click", () => {
  setDispatchMode("games");
});

function renderTeamTimeStats() {
  const body = document.getElementById("team-time-stats-body");
  const summary = document.getElementById("time-stats-summary");
  if (!body || !summary) return;

  // Don't wipe the table while an inline rename input is open
  if (body.querySelector(".team-name-input-inline")) return;

  const allTeams = Object.keys(live.points);
  const standingsRows = buildStandingsRows(allTeams);
  const { posMap, ordinal } = computePositions(standingsRows);

  // Display sort: standings order or by team number
  const rows = teamsSortMode === "number"
    ? [...standingsRows].sort((a, b) => (live.teamNumbers[a.team] ?? 999) - (live.teamNumbers[b.team] ?? 999))
    : standingsRows;

  // Update header active states
  const posToggle = document.getElementById("teams-position-sort-toggle");
  const numToggle = document.getElementById("teams-sort-toggle");
  if (posToggle) posToggle.classList.toggle("teams-sort-active", teamsSortMode === "position");
  if (numToggle) numToggle.classList.toggle("teams-sort-active", teamsSortMode === "number");

  body.innerHTML = rows.map((row) => {
    const { pos, tied } = posMap.get(row.team) || { pos: "-", tied: false };
    const posLabel = pos === "-" ? "-" : `${ordinal(pos)}${tied ? "=" : ""}`;
    return `
    <tr>
      <td>${posLabel}</td>
      <td class="team-name-cell" data-team="${row.team}">
        <span class="team-name-text">${row.team}</span>
        <button class="team-name-edit-btn" title="Rename team" aria-label="Rename ${row.team}">✏️</button>
      </td>
      <td><span class="${row.status.kind === "playing" ? "team-status-playing" : row.status.kind === "finished" ? "team-status-finished" : "team-status-waiting"}">${row.status.label}</span></td>
      <td>${row.logged}</td>
      <td>${row.logged === 0 ? "-" : fmtClock(row.totalSeconds)}</td>
      <td>${row.avg === null ? "-" : fmtClock(row.avg)}</td>
      <td>${row.points}</td>
    </tr>
  `}).join("");

  // Wire pencil-icon inline rename UX
  body.querySelectorAll(".team-name-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cell = btn.closest(".team-name-cell");
      const oldName = cell.dataset.team;
      const nameSpan = cell.querySelector(".team-name-text");
      if (cell.querySelector(".team-name-input-inline")) return; // already editing

      nameSpan.classList.add("hidden");
      btn.classList.add("hidden");

      const input = document.createElement("input");
      input.type = "text";
      input.className = "team-name-input-inline";
      input.value = oldName;
      input.maxLength = 40;

      const saveBtn = document.createElement("button");
      saveBtn.className = "team-name-save-btn";
      saveBtn.title = "Save name";
      saveBtn.textContent = "✔";

      const commit = () => {
        const newName = input.value.trim() || oldName;
        const oldTeams = [...(lastParams?.teams || [])];
        const newTeams = oldTeams.map((t) => (t === oldName ? newName : t));
        if (newName !== oldName) {
          renameLiveTeams(oldTeams, newTeams);
          sendState();
        }
        // Remove inline edit elements before re-rendering so the guard doesn't block
        input.remove();
        saveBtn.remove();
        nameSpan.classList.remove("hidden");
        btn.classList.remove("hidden");
        renderLiveBoard();
      };

      saveBtn.addEventListener("click", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          input.remove();
          saveBtn.remove();
          nameSpan.classList.remove("hidden");
          btn.classList.remove("hidden");
        }
      });

      cell.appendChild(input);
      cell.appendChild(saveBtn);
      input.focus();
      input.select();
    });
  });

  if (live.loggedGameCount === 0) {
    summary.textContent = "No game times logged yet";
    return;
  }

  const dayAvg = live.loggedGameSeconds / live.loggedGameCount;
  summary.textContent = `Logged games: ${live.loggedGameCount} · Day average: ${fmtClock(dayAvg)}`;
}

function renderGamesStatusTable() {
  const grid = document.getElementById("games-status-grid");
  const summary = document.getElementById("games-status-summary");
  if (!grid || !summary) return;

  const completedByNum = new Map(live.completed.map((m) => [m.num, m]));
  const playingByNum = new Map(
    live.tables
      .filter((table) => table.state === "playing" && table.currentMatch)
      .map((table) => [table.currentMatch.num, {
        tableNum: table.num,
        elapsedSeconds: getCurrentMatchElapsedSeconds(table.currentMatch),
        timerState: table.currentMatch.timerState || "running",
      }])
  );
const playedCount = live.completed.length;
const totalCount = live.total;
const playingCount = playingByNum.size;
const splitMode = live.groups.length > 1;

summary.textContent = `${playedCount} played · ${playingCount} playing · ${totalCount - playedCount - playingCount} not yet played`;
if (splitMode) {
  grid.className = "games-status-grid games-status-grid-split";
  grid.innerHTML = live.groups.map((group) => renderGamesStatusGroup(group, completedByNum, playingByNum)).join("");
  return;
}

grid.className = "games-status-grid";
grid.innerHTML = buildGamesStatusRows(live.allMatches, completedByNum, playingByNum);
grid.querySelectorAll("[data-open-live-board='1']").forEach((chip) => {
  chip.addEventListener("click", () => {
    activateLiveTab("board");
  });
});
}

function buildGamesStatusRows(matches, completedByNum, playingByNum) {
  const cells = matches.map((match) => {
    const completed = completedByNum.get(match.num);
    const playingMeta = playingByNum.get(match.num);
    const isPlayed = Boolean(completed);
    const isPlaying = !isPlayed && Boolean(playingMeta);
    const statusClass = isPlayed ? "game-chip-played" : isPlaying ? "game-chip-playing" : "game-chip-pending";
    const teamA = live.teamNumbers[match.teamA] || "?";
    const teamB = live.teamNumbers[match.teamB] || "?";
    const winnerTeam = completed?.winnerTeam || completed?.winner || null;
    const playingElapsed = isPlaying ? Math.max(0, Math.floor(playingMeta.elapsedSeconds || 0)) : 0;
    const teamAMarkup = isPlayed
      ? `<span class="game-chip-team ${winnerTeam === match.teamA ? "game-chip-winner" : "game-chip-loser"}">${teamA}(${winnerTeam === match.teamA ? "W" : "L"})</span>`
      : `<span class="game-chip-team">${teamA}</span>`;
    const teamBMarkup = isPlayed
      ? `<span class="game-chip-team ${winnerTeam === match.teamB ? "game-chip-winner" : "game-chip-loser"}">${teamB}(${winnerTeam === match.teamB ? "W" : "L"})</span>`
      : `<span class="game-chip-team">${teamB}</span>`;
    const duration = isPlayed
      ? `<span class="game-chip-time">T${completed.tableNum || "-"} (${fmtClock(completed.durationSeconds || 0)})</span>`
      : isPlaying
        ? `<span class="game-chip-time">* T${playingMeta.tableNum} (${playingMeta.timerState === "ready" ? "not started" : playingMeta.timerState === "paused" ? `paused ${fmtClock(playingElapsed)}` : fmtClock(playingElapsed)})</span>`
        : "";

    return `
      <div class="game-chip ${statusClass}"${isPlaying ? ' data-open-live-board="1" role="button" tabindex="0"' : ""}>
        <span class="game-chip-main">${teamAMarkup}<span class="game-chip-vs">v</span>${teamBMarkup}</span>
        ${duration}
      </div>
    `;
  }).join("");

  return `<div class="games-status-row-grid">${cells}</div>`;
}

function activateLiveTab(tabName) {
  const tabButton = document.querySelector(`.live-tab[data-tab="${tabName}"]`);
  if (tabButton) tabButton.click();
}

function renderGamesStatusGroup(group, completedByNum, playingByNum) {
const groupMatches = live.allMatches.filter((match) => match.groupId === group.id);
const groupPlayed = groupMatches.filter((match) => completedByNum.has(match.num)).length;
const groupPlaying = groupMatches.filter((match) => playingByNum.has(match.num)).length;
const groupPending = groupMatches.length - groupPlayed - groupPlaying;

return `
  <section class="games-group">
    <div class="games-group-header">
      <h4>${group.label}</h4>
      <span class="muted">${groupPlayed} played · ${groupPlaying} playing · ${groupPending} not yet played</span>
    </div>
    <div class="games-group-subtitle muted small">${formatGroupTableText(group)}</div>
    ${buildGamesStatusRows(groupMatches, completedByNum, playingByNum)}
  </section>
`;
}

window.PoolSchedulerLiveBoardInit = function () {};
