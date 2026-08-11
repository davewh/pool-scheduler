// ─── Element refs ────────────────────────────────────────────────────────────

const form             = document.getElementById("scheduler-form");
const formError        = document.getElementById("form-error");
const sectionSettings  = document.getElementById("section-settings");
const sectionNames     = document.getElementById("section-names");
const namesDescription = document.getElementById("names-description");
const teamNameGrid     = document.getElementById("team-name-grid");
const backBtn          = document.getElementById("back-to-settings");
const generateDrawBtn  = document.getElementById("generate-draw-btn");
const splitDecision    = document.getElementById("split-decision");
const splitDecisionText= document.getElementById("split-decision-text");
const drawFullBtn      = document.getElementById("draw-full-btn");
const drawSplitBtn     = document.getElementById("draw-split-btn");

const results              = document.getElementById("results");
const totalMatchesEl       = document.getElementById("totalMatches");
const totalRoundsEl        = document.getElementById("totalRounds");
const totalSlotsEl         = document.getElementById("totalSlots");
const estimatedTimeEl      = document.getElementById("estimatedTime");
const scheduleDescriptionEl= document.getElementById("scheduleDescription");
const scheduleBody         = document.getElementById("scheduleBody");
const drawSeedLabel        = document.getElementById("drawSeedLabel");
const drawActions          = document.getElementById("drawActions");
const redrawBtn            = document.getElementById("redrawBtn");
const acceptBtn            = document.getElementById("acceptBtn");
const lockedBadge          = document.getElementById("lockedBadge");
const tableCardsSection    = document.getElementById("tableCardsSection");
const tableCards           = document.getElementById("tableCards");
const poolSummarySection   = document.getElementById("poolSummarySection");
const poolSummaryHint      = document.getElementById("poolSummaryHint");
const poolSummaryGrid      = document.getElementById("poolSummaryGrid");
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

function generateSessionId() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getOrCreateSessionId() {
  const p = new URLSearchParams(location.search);
  const existing = p.get("id");
  if (existing && existing.length > 0) return existing;
  return generateSessionId();
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
  return `api.php?action=${encodeURIComponent(action)}&id=${encodeURIComponent(sessionId)}`;
}

function initRemoteSync() {
  sessionId = getOrCreateSessionId();
  const url = new URL(location.href);
  url.searchParams.set("id", sessionId);
  history.replaceState(null, "", url.toString());
  updateSessionDisplay();

  if (location.protocol === "file:") {
    showSyncHint("Running as a local file — upload to your PHP hosting to enable multi-computer sync.");
    return;
  }

  hideSyncHint();
  fetchRemoteState();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(fetchRemoteState, 3000);
}

async function sendState() {
  if (location.protocol === "file:" || !sessionId) return;
  const state = serializeState();
  if (!state) return;

  try {
    const response = await fetch(syncApiUrl("save"), buildApiPostOptions({ state }));
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
  if (!isLocked || !live) return null;
  return {
    version: 1,
    isLocked: true,
    lastParams: lastParams ? {
      teamCount:  lastParams.teamCount,
      tableCount: lastParams.tableCount,
      minMinutes: lastParams.minMinutes,
      maxMinutes: lastParams.maxMinutes,
      teams:    lastParams.teams,
      drawMode: lastParams.drawMode,
      drawData: lastParams.drawData,
    } : null,
    live: {
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
      dispatchMode:      live.dispatchMode,
    },
  };
}

function applySerializedState(state) {
  if (!state || !state.isLocked || !state.live || !state.lastParams) return;
  const sl = state.live;
  isLocked = true;
  lastParams = state.lastParams;
  lastSlots = state.lastParams.drawData ? state.lastParams.drawData.slots : [];

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
    dispatchMode:      sl.dispatchMode,
  };

  sectionSettings.classList.add("hidden");
  sectionNames.classList.add("hidden");
  results.classList.add("hidden");
  sectionLive.classList.remove("hidden");
  setStep(4);

  if (liveTimerInterval) { clearInterval(liveTimerInterval); liveTimerInterval = null; }
  ensureLiveTicker();
  renderLiveBoard();
  renderSettingsTab();
  updateSessionDisplay();
}

function updateSessionDisplay() {
  const id = sessionId || "---";
  const isFile = location.protocol === "file:";
  const fullUrl = (!isFile && sessionId)
    ? `${location.origin}${location.pathname}?id=${sessionId}`
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
}

// ─── Live tabs ────────────────────────────────────────────────────────────────

function initLiveTabs() {
  document.querySelectorAll(".live-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".live-tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".live-tab-panel").forEach((p) => p.classList.add("hidden"));
      btn.classList.add("active");
      const panel = document.getElementById("tab-" + btn.dataset.tab);
      if (panel) panel.classList.remove("hidden");
    });
  });

  // Settings tab: duplicate dispatch mode buttons
  const modeBtn2W = document.getElementById("mode-waiting-btn2");
  const modeBtn2G = document.getElementById("mode-games-btn2");
  if (modeBtn2W) modeBtn2W.addEventListener("click", () => setDispatchMode("waiting"));
  if (modeBtn2G) modeBtn2G.addEventListener("click", () => setDispatchMode("games"));

  // Copy session link
  const copySessionBtn = document.getElementById("copy-session-btn");
  if (copySessionBtn) {
    copySessionBtn.addEventListener("click", () => {
      const url = location.protocol !== "file:"
        ? `${location.protocol}//${location.host}/?id=${sessionId}`
        : null;
      if (!url) return;
      navigator.clipboard.writeText(url).then(() => {
        copySessionBtn.textContent = "✓ Copied!";
        setTimeout(() => { copySessionBtn.textContent = "📋 Copy link"; }, 2000);
      });
    });
  }

  // Copy URL button in Settings tab
  const copyUrlBtn = document.getElementById("copy-url-btn");
  if (copyUrlBtn) {
    copyUrlBtn.addEventListener("click", () => {
      const code = document.getElementById("session-url-full");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(() => {
        copyUrlBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyUrlBtn.textContent = "Copy"; }, 2000);
      });
    });
  }

  // New Tournament button
  const newTournBtn = document.getElementById("new-tournament-btn");
  if (newTournBtn) {
    newTournBtn.addEventListener("click", () => {
      if (!confirm("Start a new tournament? This will clear all current data.")) return;
      location.href = location.pathname;
    });
  }
}

function renderSettingsTab() {
  const infoEl = document.getElementById("settings-info-display");
  if (!infoEl || !lastParams) return;
  const p = lastParams;
  const dd = p.drawData;
  infoEl.innerHTML = [
    ["Teams",      p.teamCount || "—"],
    ["Tables",     p.tableCount || "—"],
    ["Match time", `${p.minMinutes}–${p.maxMinutes} min`],
    ["Format",     dd && dd.splitMode ? "Split pools" : "Full round robin"],
    ["Matches",    dd ? dd.totalMatches : "—"],
  ].map(([label, val]) => `
    <div>
      <span class="muted">${label}</span>
      <strong>${val}</strong>
    </div>
  `).join("");

  // Sync settings tab dispatch buttons
  const modeBtn2W = document.getElementById("mode-waiting-btn2");
  const modeBtn2G = document.getElementById("mode-games-btn2");
  const help2     = document.getElementById("dispatch-mode-help2");
  if (live && modeBtn2W && modeBtn2G) {
    modeBtn2W.classList.toggle("dispatch-mode-btn-active", live.dispatchMode === "waiting");
    modeBtn2G.classList.toggle("dispatch-mode-btn-active", live.dispatchMode === "games");
    if (help2) help2.textContent = dispatchModeHelpText(live.dispatchMode);
  }
}


// ─── State ───────────────────────────────────────────────────────────────────

let isLocked  = false;
let lastSlots = [];
let lastParams = null;
let pendingDrawRequest = null;

// ─── Step indicator ───────────────────────────────────────────────────────────

function setStep(n) {
  [step1Pill, step2Pill, step3Pill, step4Pill].forEach((pill, i) => {
    pill.classList.remove("active", "done");
    if (i + 1 === n) pill.classList.add("active");
    else if (i + 1 < n) pill.classList.add("done");
  });
}

// ─── Shuffle ─────────────────────────────────────────────────────────────────

function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Round-robin schedule ─────────────────────────────────────────────────────

function buildRounds(teams) {
  const entries = [...teams];
  if (entries.length % 2 !== 0) entries.push("BYE");

  const rounds = [];
  const half = entries.length / 2;
  const rotation = [...entries];

  for (let r = 0; r < entries.length - 1; r++) {
    const matches = [];
    for (let p = 0; p < half; p++) {
      const home = rotation[p];
      const away = rotation[rotation.length - 1 - p];
      if (home !== "BYE" && away !== "BYE") {
        matches.push({ round: r + 1, teamA: home, teamB: away });
      }
    }
    rounds.push(shuffle(matches));

    const fixed = rotation[0];
    const moving = rotation.slice(1);
    moving.unshift(moving.pop());
    rotation.splice(0, rotation.length, fixed, ...moving);
  }
  return rounds;
}

function buildSlots(rounds, tableNumbers, groupId, groupLabel) {
  const slots = [];
  rounds.forEach((matches, ri) => {
    for (let i = 0; i < matches.length; i += tableNumbers.length) {
      slots.push({
        label: groupLabel === "Round" ? `Round ${ri + 1}` : `${groupLabel} R${ri + 1}`,
        assignments: matches.slice(i, i + tableNumbers.length).map((m, idx) => ({
          ...m,
          groupId,
          groupLabel,
          allowedTables: [...tableNumbers],
          table: tableNumbers[idx],
        })),
      });
    }
  });
  return slots;
}

function combineSlots(slotGroups) {
  const maxLength = Math.max(...slotGroups.map((group) => group.length));
  return Array.from({ length: maxLength }, (_, index) => {
    const present = slotGroups
      .map((group) => group[index])
      .filter(Boolean);

    return {
      slotNumber: index + 1,
      label: present.map((slot) => slot.label).join(" | "),
      assignments: present.flatMap((slot) => slot.assignments),
    };
  });
}

function queueSort(matches = live.queue) {
  const eligible = matches.filter(matchIsReady).sort(compareEligibleMatches);
  const eligibleNums = new Set(eligible.map((m) => m.num));
  const busy = matches
    .filter((m) => !eligibleNums.has(m.num))
    .sort((a, b) => a.num - b.num);

  return [...eligible, ...busy];
}

// ─── Format ───────────────────────────────────────────────────────────────────

function fmt(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem} min`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSettings({ teamCount, tableCount, minMinutes, maxMinutes }) {
  if (!Number.isInteger(teamCount) || teamCount < 2)       return "Enter at least 2 teams.";
  if (!Number.isInteger(tableCount) || tableCount < 1)     return "Enter at least 1 table.";
  if (!Number.isInteger(minMinutes) || minMinutes < 1)     return "Enter a valid minimum match time.";
  if (!Number.isInteger(maxMinutes) || maxMinutes < minMinutes) return "Maximum must be ≥ minimum.";
  return "";
}

function getSettingsParams() {
  return {
    teamCount:  Number.parseInt(document.getElementById("teamCount").value, 10),
    tableCount: Number.parseInt(document.getElementById("tableCount").value, 10),
    minMinutes: Number.parseInt(document.getElementById("minMinutes").value, 10),
    maxMinutes: Number.parseInt(document.getElementById("maxMinutes").value, 10),
  };
}

function hideSplitDecision() {
  splitDecision.classList.add("hidden");
  splitDecisionText.textContent = "";
  pendingDrawRequest = null;
}

function shouldOfferSplitDecision(params) {
  return params.tableCount >= 2 && params.teamCount > params.tableCount * 3;
}

function showSplitDecision(params, teams) {
  pendingDrawRequest = { params, teams };
  splitDecisionText.textContent = `${params.teamCount} teams on ${params.tableCount} tables is a large draw. Do you want a full round robin, or split into 2 random pools for a faster event?`;
  splitDecision.classList.remove("hidden");
}

function formatTablesText(tableNumbers) {
  if (!tableNumbers || tableNumbers.length === 0) return "No tables assigned";
  return `${tableNumbers.length === 1 ? "Table" : "Tables"} ${tableNumbers.join(", ")}`;
}

function formatGroupTableText(group) {
  if (!group) return "No tables assigned";
  if (group.sharedTables) {
    return `Shared ${formatTablesText(group.tables).toLowerCase()}`;
  }
  return formatTablesText(group.tables);
}

function dispatchModeLabel(mode) {
  return mode === "games" ? "least games played" : "longest team waiting";
}

function dispatchModeHelpText(mode) {
  if (mode === "games") {
    return "New table assignments now prefer the teams with the fewest matches played. If tied, waiting time breaks the tie.";
  }
  return "New table assignments now prefer the teams that have been waiting the longest. If tied, teams with fewer matches played are chosen first.";
}

function renderPoolSummary(section, hintEl, gridEl, groups, teamNumbers, options = {}) {
  if (!section || !hintEl || !gridEl) return;

  if (!options.splitMode || !groups || groups.length < 2) {
    section.classList.add("hidden");
    hintEl.textContent = "";
    gridEl.innerHTML = "";
    return;
  }

  hintEl.textContent = options.hintText || "";
  gridEl.innerHTML = groups.map((group) => `
    <article class="pool-card">
      <div class="pool-card-header">
        <div>
          <h4>${group.label}</h4>
          <p class="muted small">${formatGroupTableText(group)}</p>
        </div>
        <span class="pool-card-count">${group.teams.length} teams</span>
      </div>
      <div class="pool-team-list">
        ${group.teams.map((team) => `
          <span class="pool-team-chip">${teamNumbers[team] || "?"}. ${team}</span>
        `).join("")}
      </div>
    </article>
  `).join("");
  section.classList.remove("hidden");
}

// ─── Step 1 → Step 2: build team name inputs ──────────────────────────────────

function showTeamNamesStep(teamCount, tableCount) {
  teamNameGrid.innerHTML = "";

  for (let i = 1; i <= teamCount; i++) {
    const label = document.createElement("label");
    label.innerHTML = `
      <span>Team ${i}</span>
      <input type="text" class="team-name-input" maxlength="40"
             placeholder="Team ${i}" value="Team ${i}" data-index="${i - 1}">
    `;
    teamNameGrid.appendChild(label);
  }

  namesDescription.textContent =
    `${teamCount} teams · edit the names below, then generate the draw.`;
  hideSplitDecision();

  sectionSettings.classList.add("hidden");
  sectionNames.classList.remove("hidden");
  results.classList.add("hidden");
  setStep(2);
}

// ─── Step 2 → Step 3: generate the draw ──────────────────────────────────────

function readTeamNames() {
  return Array.from(document.querySelectorAll(".team-name-input")).map((input, i) => {
    const v = input.value.trim();
    return v.length > 0 ? v : `Team ${i + 1}`;
  });
}

function buildDrawData(params, teams, drawMode) {
  const { tableCount, minMinutes, maxMinutes } = params;
  const shuffledTeams = shuffle(teams);
  const shouldSplit = drawMode === "split" && tableCount >= 2 && teams.length >= 4;
  const allTableNumbers = Array.from({ length: tableCount }, (_, i) => i + 1);

  if (!shouldSplit) {
    const rounds = buildRounds(shuffledTeams);
    const slots = combineSlots([buildSlots(rounds, allTableNumbers, "all", "Round")]);
    const matches = slots.flatMap((slot) => slot.assignments);
    return {
      splitMode: false,
      drawMode,
      slots,
      roundsCount: rounds.length,
      matches,
      groupSummary: "Single full round robin",
      groups: [
        {
          id: "all",
          label: "All teams",
          teams: shuffledTeams,
          tables: allTableNumbers,
        },
      ],
      totalMatches: matches.length,
      minMinutes,
      maxMinutes,
    };
  }

  const half = Math.ceil(shuffledTeams.length / 2);
  const poolATeams = shuffledTeams.slice(0, half);
  const poolBTeams = shuffledTeams.slice(half);
  const poolATables = allTableNumbers.slice(0, Math.ceil(tableCount / 2));
  const poolBTables = allTableNumbers.slice(Math.ceil(tableCount / 2));

  const poolARounds = buildRounds(poolATeams);
  const poolBRounds = buildRounds(poolBTeams);
  const poolASlots = buildSlots(poolARounds, poolATables, "pool-a", "Pool 1");
  const poolBSlots = buildSlots(poolBRounds, poolBTables, "pool-b", "Pool 2");
  const slots = combineSlots([poolASlots, poolBSlots]).map((slot) => ({
    ...slot,
    assignments: shuffle(slot.assignments).map((match, index) => ({
      ...match,
      allowedTables: [...allTableNumbers],
      table: allTableNumbers[index],
    })),
  }));
  const matches = slots.flatMap((slot) => slot.assignments);

  return {
    splitMode: true,
    drawMode,
    slots,
    roundsCount: Math.max(poolARounds.length, poolBRounds.length),
    matches,
    groupSummary: `Split mode: Pool 1 (${poolATeams.length} teams) and Pool 2 (${poolBTeams.length} teams) share all ${tableCount} tables`,
    groups: [
      { id: "pool-a", label: "Pool 1", teams: poolATeams, tables: allTableNumbers, sharedTables: true },
      { id: "pool-b", label: "Pool 2", teams: poolBTeams, tables: allTableNumbers, sharedTables: true },
    ],
    totalMatches: matches.length,
    minMinutes,
    maxMinutes,
  };
}

function runDraw(params, teams, drawMode) {
  const { tableCount, minMinutes, maxMinutes } = params;
  const drawData = buildDrawData(params, teams, drawMode);
  const { slots } = drawData;
  const teamNumbers = Object.fromEntries(teams.map((team, index) => [team, index + 1]));

  lastSlots = slots;
  lastParams = { ...params, teams, drawMode, drawData };
  hideSplitDecision();

  // Seed label
  drawSeedLabel.textContent = `#${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  // Summary stats
  const totalMatches = drawData.totalMatches;
  const avg = (minMinutes + maxMinutes) / 2;
  totalMatchesEl.textContent  = String(totalMatches);
  totalRoundsEl.textContent   = String(drawData.roundsCount);
  totalSlotsEl.textContent    = String(slots.length);
  estimatedTimeEl.textContent =
    `${fmt(slots.length * minMinutes)} – ${fmt(slots.length * maxMinutes)} (avg ${fmt(slots.length * avg)})`;
  scheduleDescriptionEl.textContent =
    `${teams.length} teams · ${totalMatches} matches · ${tableCount} tables · ${slots.length} scheduling windows · ${drawData.groupSummary}`;
  redrawBtn.textContent = drawData.splitMode ? "↺ Re-draw pools" : "↺ Re-draw";
  renderPoolSummary(
    poolSummarySection,
    poolSummaryHint,
    poolSummaryGrid,
    drawData.groups,
    teamNumbers,
    {
      splitMode: drawData.splitMode,
      hintText: drawData.splitMode
        ? "Re-draw to reshuffle the random pools until the operator is happy, then accept the draw. During live play, both pools can use any free table."
        : "Re-draw until the operator is happy, then accept the draw.",
    }
  );

  // Schedule table
  scheduleBody.innerHTML = "";
  slots.forEach((slot, index) => {
    const row = document.createElement("tr");
    const assignDiv = document.createElement("div");
    assignDiv.className = "assignments";

    for (let t = 1; t <= tableCount; t++) {
      const match = slot.assignments.find((a) => a.table === t);
      const cell = document.createElement("div");
      cell.className = `assignment${match ? "" : " idle"}`;
      cell.textContent = match
        ? `Table ${t}: ${match.teamA} vs ${match.teamB}`
        : `Table ${t}: idle`;
      assignDiv.appendChild(cell);
    }

    const fS = fmt(index * minMinutes),       fE = fmt((index + 1) * minMinutes);
    const sS = fmt(index * maxMinutes),       sE = fmt((index + 1) * maxMinutes);
    const aS = fmt(index * avg),              aE = fmt((index + 1) * avg);

    row.innerHTML = `
      <td>Window ${slot.slotNumber}<br><span class="muted">${slot.label}</span></td>
      <td>${fS}–${fE} (fastest)<br>${sS}–${sE} (slowest)<br><span class="muted">Avg ${aS}–${aE}</span></td>
      <td></td>
    `;
    row.children[2].appendChild(assignDiv);
    scheduleBody.appendChild(row);
  });

  // Reset lock state
  tableCardsSection.classList.add("hidden");
  drawActions.classList.remove("hidden");
  lockedBadge.classList.add("hidden");

  sectionNames.classList.add("hidden");
  results.classList.remove("hidden");
  setStep(3);
}

// ─── Lock / Accept ────────────────────────────────────────────────────────────

function lockDraw() {
  isLocked = true;
  drawActions.classList.add("hidden");
  lockedBadge.classList.remove("hidden");

  form.querySelectorAll("input, button").forEach((el) => { el.disabled = true; });
  document.querySelectorAll(".team-name-input").forEach((el) => { el.disabled = true; });
  generateDrawBtn.disabled = true;
  backBtn.disabled = true;
  drawFullBtn.disabled = true;
  drawSplitBtn.disabled = true;

  // Transition to live board
  initLiveBoard(lastSlots, lastParams.tableCount, lastParams.teams, lastParams.drawData);
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const params = getSettingsParams();
  const err = validateSettings(params);
  formError.textContent = err;
  if (err) return;
  showTeamNamesStep(params.teamCount, params.tableCount);
});

backBtn.addEventListener("click", () => {
  sectionNames.classList.add("hidden");
  sectionSettings.classList.remove("hidden");
  results.classList.add("hidden");
  hideSplitDecision();
  setStep(1);
});

generateDrawBtn.addEventListener("click", () => {
  if (isLocked) return;
  const params = getSettingsParams();
  const err = validateSettings(params);
  formError.textContent = err;
  if (err) return;
  const teams = readTeamNames();
  if (shouldOfferSplitDecision(params)) {
    showSplitDecision(params, teams);
    return;
  }

  runDraw(params, teams, "full");
});

drawFullBtn.addEventListener("click", () => {
  if (!pendingDrawRequest) return;
  runDraw(pendingDrawRequest.params, pendingDrawRequest.teams, "full");
});

drawSplitBtn.addEventListener("click", () => {
  if (!pendingDrawRequest) return;
  runDraw(pendingDrawRequest.params, pendingDrawRequest.teams, "split");
});

redrawBtn.addEventListener("click", () => {
  if (isLocked) return;
  runDraw(lastParams, lastParams.teams, lastParams.drawMode);
});

acceptBtn.addEventListener("click", () => {
  if (isLocked) return;
  lockDraw();
});

// ─── Live board ───────────────────────────────────────────────────────────────

let live = null;
let liveTimerInterval = null;

function initLiveBoard(slots, tableCount, teams, drawData) {
  const allMatches = drawData.matches.map((match, index) => ({
    ...match,
    num: index + 1,
  }));

  live = {
    allMatches,
    queue: [...allMatches],
    tables: Array.from({ length: tableCount }, (_, i) => ({
      num: i + 1,
      state: "free",   // "playing" | "free" | "waiting" | "done"
      currentMatch: null,
      matchesPlayed: 0,
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
    initialTableOrder: shuffle(Array.from({ length: tableCount }, (_, i) => i + 1)),
    groups: drawData.groups,
    dispatchMode: "waiting",
  };

  results.classList.add("hidden");
  sectionLive.classList.remove("hidden");
  setStep(4);
  sectionLive.scrollIntoView({ behavior: "smooth", block: "start" });
  renderSettingsTab();
  updateSessionDisplay();
  ensureLiveTicker();
  autoDispatchAndRender();
  sendState();
}

function compareEligibleMatches(a, b) {
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

function assignMatch(tableNum, match) {
  const idx = live.queue.indexOf(match);
  if (idx === -1) return;
  live.queue.splice(idx, 1);

  const table = live.tables.find((t) => t.num === tableNum);
  table.currentMatch = {
    ...match,
    startedAtMs: Date.now(),
  };
  table.state = "playing";
  live.activePairs.add(match.teamA);
  live.activePairs.add(match.teamB);
}

function finishMatch(tableNum, winnerTeam) {
  const table = live.tables.find((t) => t.num === tableNum);
  if (table.state !== "playing") return;

  const m = table.currentMatch;
  if (winnerTeam !== m.teamA && winnerTeam !== m.teamB) return;
  const loserTeam = winnerTeam === m.teamA ? m.teamB : m.teamA;
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - m.startedAtMs) / 1000));

  m.winner = winnerTeam;
  m.loser = loserTeam;
  m.durationSeconds = elapsedSeconds;
  m.tableNum = table.num;
  live.completed.push(m);
  live.activePairs.delete(m.teamA);
  live.activePairs.delete(m.teamB);
  const finishedAt = Date.now();
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
  table.state = "free";
  autoDispatchAndRender(table.num);
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

    live.tables.forEach((table) => {
      if (table.state !== "playing" || !table.currentMatch) return;
      const timerEl = document.getElementById(`timer-table-${table.num}`);
      if (!timerEl) return;
      const elapsed = Math.max(1, Math.floor((Date.now() - table.currentMatch.startedAtMs) / 1000));
      timerEl.textContent = fmtClock(elapsed);
    });

    renderLiveQueue();
    renderGamesStatusTable();
    renderTeamTimeStats();
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
      finishMatch(Number(btn.dataset.table), btn.dataset.winner);
    });
  });
}

function buildLiveTableCard(table) {
    const card = document.createElement("div");
    let stateClass = `live-table--${table.state}`;
    let bodyHtml = "";
    let poolBadge = "";

    if (table.state === "playing") {
      const m = table.currentMatch;
      const aPts = live.points[m.teamA] || 0;
      const bPts = live.points[m.teamB] || 0;
      const elapsed = Math.max(1, Math.floor((Date.now() - m.startedAtMs) / 1000));
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
        <div class="result-prompt">Select winner:</div>
        <div class="result-actions">
          <button class="btn-win" data-table="${table.num}" data-winner="${m.teamA}">${m.teamA} won</button>
          <button class="btn-win" data-table="${table.num}" data-winner="${m.teamB}">${m.teamB} won</button>
        </div>
      `;
    } else if (table.state === "done") {
      bodyHtml = `
        <div class="live-waiting">
          <div class="live-waiting-icon">✅</div>
          <p>No more matches</p>
        </div>
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
        </div>
      `;
    } else {
      const nextReady = eligibleMatches(table)[0];
      bodyHtml = `
        <div class="live-waiting">
          <div class="live-waiting-icon">✅</div>
          <p>Table ready</p>
          ${nextReady ? `<p class="muted small">Next: ${nextReady.groupLabel ? `${nextReady.groupLabel}: ` : ""}${nextReady.teamA} vs ${nextReady.teamB}</p>` : ""}
        </div>
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

modeWaitingBtn.addEventListener("click", () => {
  setDispatchMode("waiting");
});

modeGamesBtn.addEventListener("click", () => {
  setDispatchMode("games");
});

function renderTeamTimeStats() {
  const body = document.getElementById("team-time-stats-body");
  const summary = document.getElementById("time-stats-summary");
  if (!body || !summary) return;

  const rows = Object.keys(live.points).map((team) => {
    const isPlaying = live.activePairs.has(team);
    const waitingSeconds = waitingScore(team);
    const logged = live.teamLoggedMatches[team] || 0;
    const totalSeconds = live.teamTotalSeconds[team] || 0;
    const avg = averageTeamSeconds(team);
    const points = live.points[team] || 0;
    return { team, isPlaying, waitingSeconds, logged, totalSeconds, avg, points };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if ((b.avg || 0) !== (a.avg || 0)) return (b.avg || 0) - (a.avg || 0);
    return a.team.localeCompare(b.team);
  });

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.team}</td>
      <td>${row.isPlaying ? '<span class="team-status-playing">Playing</span>' : `<span class="team-status-waiting">Waiting ${fmtClock(row.waitingSeconds)}</span>`}</td>
      <td>${row.logged}</td>
      <td>${row.logged === 0 ? "-" : fmtClock(row.totalSeconds)}</td>
      <td>${row.avg === null ? "-" : fmtClock(row.avg)}</td>
      <td>${row.points}</td>
    </tr>
  `).join("");

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
      .map((table) => [table.currentMatch.num, { tableNum: table.num, startedAtMs: table.currentMatch.startedAtMs }])
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
}

function buildGamesStatusRows(matches, completedByNum, playingByNum) {
const chunkSize = 10;
const rows = [];

for (let start = 0; start < matches.length; start += chunkSize) {
  const chunk = matches.slice(start, start + chunkSize);
  const from = start + 1;
  const to = start + chunk.length;

  const cells = chunk.map((match) => {
    const completed = completedByNum.get(match.num);
    const playingMeta = playingByNum.get(match.num);
    const isPlayed = Boolean(completed);
    const isPlaying = !isPlayed && Boolean(playingMeta);
    const statusClass = isPlayed ? "game-chip-played" : isPlaying ? "game-chip-playing" : "game-chip-pending";
    const teamA = live.teamNumbers[match.teamA] || "?";
    const teamB = live.teamNumbers[match.teamB] || "?";
    const playingElapsed = isPlaying
      ? Math.max(1, Math.floor((Date.now() - playingMeta.startedAtMs) / 1000))
      : 0;
    const duration = isPlayed
      ? `<span class="game-chip-time">T${completed.tableNum || "-"} (${fmtClock(completed.durationSeconds || 0)})</span>`
      : isPlaying
        ? `<span class="game-chip-time">* T${playingMeta.tableNum} (${fmtClock(playingElapsed)})</span>`
        : "";

    return `
      <div class="game-chip ${statusClass}">
        <span class="game-chip-main">${teamA}v${teamB}</span>
        ${duration}
      </div>
    `;
  }).join("");

  rows.push(`
    <div class="games-status-row">
      <div class="games-status-row-title">Matches ${from}-${to}</div>
      <div class="games-status-row-grid">${cells}</div>
    </div>
  `);
}

return rows.join("");
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

// ─── Boot ─────────────────────────────────────────────────────────────────────

initLiveTabs();
initRemoteSync();
