const drawFinalsControls = document.getElementById("draw-finals-controls");
const drawFinalsTeamCountSelect = document.getElementById("draw-finals-team-count");
const drawFinalsRounds = document.getElementById("draw-finals-rounds");

// ─── Step indicator ───────────────────────────────────────────────────────────

function setStep(n) {
  [step1Pill, step2Pill, step3Pill, step4Pill].forEach((pill, i) => {
    pill.classList.remove("active", "done");
    if (i + 1 === n) pill.classList.add("active");
    else if (i + 1 < n) pill.classList.add("done");
  });

  // Hide hero, step nav and session bar when on live board (step 4) to maximise screen space
  const onLive = n === 4;
  document.querySelector(".hero")?.classList.toggle("hidden", onLive);
  document.querySelector(".steps")?.classList.toggle("hidden", onLive);
  document.getElementById("session-bar")?.classList.toggle("hidden", onLive);
}

function updateDrawControlVisibility() {
  if (!drawActions || !drawModeSubActions || !platePairingSection) return;
  drawActions.classList.toggle("hidden", !lastParams || !lastParams.drawMode || editingFrozen);
  const isPlateDraw = lastParams?.drawMode === "plate";
  drawModeSubActions.classList.toggle("hidden", !isPlateDraw || editingFrozen);
  platePairingSection.classList.toggle("hidden", !isPlateDraw || editingFrozen);
  if (!lastParams || editingFrozen) return;
  redrawBtn?.classList.remove("hidden");
  acceptBtn?.classList.remove("hidden");
}

function syncEditingControls() {
  const frozen = editingFrozen;
  form.querySelectorAll("input, button, select").forEach((el) => { el.disabled = frozen; });
  [
    backBtn,
    drawFullBtn,
    drawSplitBtn,
    drawPlateBtn,
    drawModeFullBtn,
    drawModeSplitBtn,
    drawModePlateBtn,
    drawModeRandomBtn,
    drawModeManualBtn,
    platePairingRandomBtn,
    platePairingManualBtn,
    platePairingFinishedBtn,
    redrawBtn,
    initialSortBtn,
    acceptBtn,
  ].forEach((btn) => {
    if (btn) btn.disabled = frozen;
  });
  if (drawFinalsTeamCountSelect) {
    drawFinalsTeamCountSelect.disabled = frozen;
  }
  if (drawFinalsRounds) {
    drawFinalsRounds.querySelectorAll("button, select, input").forEach((inputEl) => { inputEl.disabled = frozen; });
  }
  if (platePairingAvailable) {
    platePairingAvailable.querySelectorAll("button, select, input").forEach((el) => { el.disabled = frozen; });
  }
  if (firstRoundRefList) {
    firstRoundRefList.querySelectorAll("button, select, input").forEach((el) => { el.disabled = frozen; });
  }

  // When frozen, team name inputs and the Save Names button must stay enabled
  // so the admin can still rename teams after games have started.
  if (frozen) {
    document.querySelectorAll(".team-name-input").forEach((el) => { el.disabled = false; });
    if (generateDrawBtn) generateDrawBtn.disabled = false;
  }
}

function setDrawModeButtons(mode) {
  const btns = [drawModeFullBtn, drawModeSplitBtn, drawModePlateBtn];
  btns.forEach((btn) => btn?.classList.remove("dispatch-mode-btn-active"));
  const activeBtn = mode === "split"
    ? drawModeSplitBtn
    : mode === "plate"
      ? drawModePlateBtn
      : drawModeFullBtn;
  activeBtn?.classList.add("dispatch-mode-btn-active");
  const activeTeamCount = lastParams?.teamCount || Number.parseInt(teamCountInput?.value || "0", 10) || 0;
  syncFinalsControlVisibility(mode, activeTeamCount, lastParams?.finalsTeamCount ?? null, lastParams?.finalsBestOfByRound ?? null);
  updateDrawControlVisibility();
  if (lastParams?.teams?.length) {
    renderPlatePairing();
  }
}

function nextPowerOfTwo(value) {
  let size = 2;
  while (size < value) {
    size *= 2;
  }
  return size;
}

function sameMatchPair(match, teamA, teamB) {
  return (match.teamA === teamA && match.teamB === teamB)
    || (match.teamA === teamB && match.teamB === teamA);
}

function buildInitialTableAssignments(teams, tableCount) {
  const assignments = [];
  for (let table = 1; table <= tableCount; table++) {
    const aIndex = (table - 1) * 2;
    const bIndex = aIndex + 1;
    if (!teams[aIndex] || !teams[bIndex]) break;
    assignments.push({
      table,
      teamA: teams[aIndex],
      teamB: teams[bIndex],
    });
  }
  return assignments;
}

function orderMatchesWithInitialPairs(matches, teams, tableCount) {
  if (!Array.isArray(matches) || matches.length === 0) return matches;
  const desiredPairs = buildInitialTableAssignments(teams, tableCount);
  if (desiredPairs.length === 0) return matches;

  const remaining = [...matches];
  const orderedFront = [];
  desiredPairs.forEach((pair) => {
    const idx = remaining.findIndex((m) => sameMatchPair(m, pair.teamA, pair.teamB));
    if (idx >= 0) {
      orderedFront.push(remaining[idx]);
      remaining.splice(idx, 1);
    }
  });

  return [...orderedFront, ...remaining];
}

function buildPlatePairings(teams) {
  const orderedTeams = [...teams];
  const bracketSize = nextPowerOfTwo(Math.max(2, orderedTeams.length));
  const paddedTeams = orderedTeams.map((team, index) => ({
    name: team,
    seed: index + 1,
  }));
  while (paddedTeams.length < bracketSize) {
    paddedTeams.push({
      name: "BYE",
      seed: null,
    });
  }

  const matches = [];
  for (let i = 0; i < paddedTeams.length; i += 2) {
    const a = paddedTeams[i];
    const b = paddedTeams[i + 1];
    matches.push({
      id: (i / 2) + 1,
      label: `Q${(i / 2) + 1}`,
      teamA: a.name,
      teamB: b.name,
      seedA: a.seed,
      seedB: b.seed,
    });
  }

  return {
    matches,
    bracketSize,
    byeCount: bracketSize - orderedTeams.length,
  };
}

function formatSeededTeam(team, seed) {
  if (team === "BYE") return "BYE";
  if (!seed) return team;
  return `#${seed} ${team}`;
}

function knockoutRoundLabel(teamCount) {
  if (teamCount === 2) {
    return {
      title: "2 teams",
      subtitle: "Final",
    };
  }

  return {
    title: `${teamCount} teams`,
    subtitle: `${Math.max(1, Math.floor(teamCount / 2))} matches`,
  };
}

function knockoutAdvanceLabel(teamA, teamB, label, outcome, seedA = null, seedB = null) {
  if (teamA === "BYE" && teamB === "BYE") return "BYE";
  if (outcome === "winner") {
    if (teamA === "BYE") return formatSeededTeam(teamB, seedB);
    if (teamB === "BYE") return formatSeededTeam(teamA, seedA);
    return `Winner ${label}`;
  }

  if (teamA === "BYE" || teamB === "BYE") {
    return "BYE";
  }
  return `Loser ${label}`;
}

function buildKnockoutBracket(entries, prefix) {
  const rounds = [];
  let currentEntries = [...entries];
  let roundNumber = 1;

  while (currentEntries.length >= 2) {
    const matches = [];
    const nextEntries = [];

    for (let i = 0; i < currentEntries.length; i += 2) {
      const teamA = currentEntries[i] || "BYE";
      const teamB = currentEntries[i + 1] || "BYE";
      const matchLabel = `${prefix}${roundNumber}.${(i / 2) + 1}`;
      matches.push({ label: matchLabel, teamA, teamB });
      nextEntries.push(knockoutAdvanceLabel(teamA, teamB, matchLabel, "winner"));
    }

    rounds.push({
      roundLabel: knockoutRoundLabel(currentEntries.length),
      matches,
    });
    currentEntries = nextEntries;
    roundNumber += 1;
  }

  return rounds;
}

function renderKnockoutBracket(title, entrants, prefix) {
  const rounds = buildKnockoutBracket(entrants, prefix);
  return `
    <section class="plate-bracket">
      <div class="plate-bracket-header">
        <h4>${title}</h4>
        <span class="muted small">${entrants.filter((entry) => entry !== "BYE").length} teams</span>
      </div>
      <div class="plate-bracket-rounds">
        ${rounds.map((round) => `
          <div class="plate-bracket-round">
            <div class="plate-bracket-round-title">${round.roundLabel.title}</div>
            <div class="plate-bracket-round-subtitle">${round.roundLabel.subtitle}</div>
            <div class="plate-bracket-match-list">
              ${round.matches.map((match) => `
                <div class="plate-bracket-match">
                  <span>${match.teamA}</span>
                  <span>${match.teamB}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPlateKnockoutPreview(pairing) {
  const mainEntrants = pairing.matches.map((match) => knockoutAdvanceLabel(
    match.teamA,
    match.teamB,
    match.label,
    "winner",
    match.seedA,
    match.seedB
  ));
  const plateEntrants = pairing.matches.map((match) => knockoutAdvanceLabel(
    match.teamA,
    match.teamB,
    match.label,
    "loser",
    match.seedA,
    match.seedB
  ));

  return `
    <div class="plate-knockout-layout">
      <section class="plate-bracket plate-qualifier-bracket">
        <div class="plate-bracket-header">
          <h4>Qualifier round</h4>
          <span class="muted small">${pairing.matches.length} matches${pairing.byeCount > 0 ? ` · ${pairing.byeCount} BYE${pairing.byeCount === 1 ? "" : "s"}` : ""}</span>
        </div>
        <div class="plate-bracket-rounds">
          <div class="plate-bracket-round">
            <div class="plate-bracket-round-title">${knockoutRoundLabel(pairing.bracketSize).title}</div>
            <div class="plate-bracket-round-subtitle">${knockoutRoundLabel(pairing.bracketSize).subtitle}</div>
            <div class="plate-bracket-match-list">
              ${pairing.matches.map((match) => `
                <div class="plate-bracket-match">
                  <span>${formatSeededTeam(match.teamA, match.seedA)}</span>
                  <span>${formatSeededTeam(match.teamB, match.seedB)}</span>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </section>
      <div class="plate-bracket-grid">
        ${renderKnockoutBracket("Main ladder (slot order locked)", mainEntrants, "M")}
        ${renderKnockoutBracket("Plate ladder (slot order locked)", plateEntrants, "P")}
      </div>
    </div>
  `;
}

function resetPlatePairingState() {
  platePairingMode = "random";
  platePairingSelection = null;
  platePairingPairsData = null;
  platePairingAvailableTeams = [];
}

function renderPlatePairing() {
  if (!platePairingSection || !lastParams?.teams?.length) {
    platePairingSection?.classList.add("hidden");
    return;
  }

  if (lastParams.drawMode !== "plate") {
    platePairingSection.classList.add("hidden");
    updateDrawControlVisibility();
    return;
  }

  platePairingSection.classList.remove("hidden");
  [drawModeRandomBtn, drawModeManualBtn].forEach((btn) => btn?.classList.remove("dispatch-mode-btn-active"));
  if (platePairingMode === "manual") {
    drawModeManualBtn?.classList.add("dispatch-mode-btn-active");
  } else {
    drawModeRandomBtn?.classList.add("dispatch-mode-btn-active");
  }
  drawModeRandomBtn?.setAttribute("aria-pressed", String(platePairingMode === "random"));
  drawModeManualBtn?.setAttribute("aria-pressed", String(platePairingMode === "manual"));

  platePairingHelp.textContent = "Random is selected for this draw mode. Use Re-draw to shuffle the draw.";
  platePairingStep.classList.add("hidden");
  platePairingSelected.classList.add("hidden");
  platePairingFinishedBtn?.classList.add("hidden");
  const pairing = platePairingPairsData || buildPlatePairings(lastParams.teams);
  platePairingPairsData = pairing;
  platePairingAvailableTeams = [];
  platePairingSelection = null;
  platePairingHelp.textContent = platePairingMode === "manual"
    ? "Manual is selected. Teams keep their current order for the qualifier round. Winners move into Main and losers move into Plate."
    : "Random is selected for this draw mode. Use Re-draw to reshuffle the qualifier round. Winners move into Main and losers move into Plate.";
  platePairingBye.classList.toggle("hidden", pairing.byeCount === 0);
  platePairingBye.textContent = pairing.byeCount > 0
    ? `${pairing.byeCount} BYE${pairing.byeCount === 1 ? "" : "s"} added so the knockout draw reaches ${pairing.bracketSize} teams.`
    : "";
  platePairingPairs.classList.toggle("hidden", pairing.matches.length === 0);
  platePairingPairs.classList.add("plate-pairing-pairs-bracket");
  platePairingPairs.innerHTML = pairing.matches.length > 0
    ? renderPlateKnockoutPreview(pairing)
    : "";
  platePairingAvailable.innerHTML = "";
  if (editingFrozen) {
    drawActions.classList.add("hidden");
  } else {
    drawActions.classList.remove("hidden");
    redrawBtn?.classList.remove("hidden");
    acceptBtn.classList.remove("hidden");
  }
  updateDrawControlVisibility();
}

function setPlatePairingMode(mode) {
  platePairingMode = mode;
  if (mode === "manual") {
    platePairingAvailableTeams = [...lastParams.teams];
    platePairingSelection = null;
    platePairingPairsData = null;
    platePairingPairs.classList.add("hidden");
    platePairingPairs.innerHTML = "";
  } else {
    platePairingSelection = null;
    platePairingPairsData = null;
  }
  renderPlatePairing();
}

function goToStep(step) {
  if (step === 1) {
    sectionSettings.classList.remove("hidden");
    sectionNames.classList.add("hidden");
    results.classList.add("hidden");
    sectionLive.classList.add("hidden");
    hideSplitDecision();
    setStep(1);
    return;
  }

  if (step === 2) {
    const fallbackTeamCount = Number.parseInt(document.getElementById("teamCount")?.value || "0", 10) || lastParams?.teamCount || 2;
    const fallbackTableCount = Number.parseInt(document.getElementById("tableCount")?.value || "0", 10) || lastParams?.tableCount || 1;
    const existingTeams = teamNameGrid?.querySelectorAll(".team-name-input").length
      ? readTeamNames()
      : (lastParams?.teams || []);
    showTeamNamesStep(fallbackTeamCount, fallbackTableCount, existingTeams);
    return;
  }

  if (step === 3) {
    if (lastParams && lastSlots.length > 0) {
      sectionSettings.classList.add("hidden");
      sectionNames.classList.add("hidden");
      results.classList.remove("hidden");
      sectionLive.classList.add("hidden");
      setStep(3);
      setDrawModeButtons(lastParams.drawMode || "full");
      return;
    }
    return;
  }

  if (step === 4) {
    if (isLocked || live) {
      sectionSettings.classList.add("hidden");
      sectionNames.classList.add("hidden");
      results.classList.add("hidden");
      sectionLive.classList.remove("hidden");
      setStep(4);
    }
  }
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

function ordinalSeedLabel(seed) {
  const mod100 = seed % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${seed}th`;
  const mod10 = seed % 10;
  if (mod10 === 1) return `${seed}st`;
  if (mod10 === 2) return `${seed}nd`;
  if (mod10 === 3) return `${seed}rd`;
  return `${seed}th`;
}

function buildFinalsBracketRounds(finalistsCount, finalsBestOfByRound = {}) {
  const roundDefs = getFinalsRoundDefinitions(finalistsCount);
  const bestOfMap = normalizeFinalsBestOfMap(roundDefs, finalsBestOfByRound);
  let currentEntries = Array.from({ length: finalistsCount }, (_, index) => `${ordinalSeedLabel(index + 1)} place`);
  const rounds = [];

  roundDefs.forEach((roundDef) => {
    const pairs = [];
    for (let left = 0, right = currentEntries.length - 1; left < right; left += 1, right -= 1) {
      pairs.push([currentEntries[left], currentEntries[right]]);
    }

    const matches = pairs.map(([teamA, teamB], matchIndex) => ({
      label: `${roundDef.label} ${matchIndex + 1}`,
      teamA,
      teamB,
      bestOfGames: bestOfMap[roundDef.key],
      roundKey: roundDef.key,
      roundLabel: roundDef.label,
      roundSize: roundDef.teamsRemaining,
      matchIndex: matchIndex + 1,
    }));

    rounds.push({
      ...roundDef,
      bestOfGames: bestOfMap[roundDef.key],
      matches,
    });

    currentEntries = matches.map((match) => `Winner ${match.label}`);
  });

  return rounds;
}

function buildBracketMatchesFromEntries(entries, roundLabel, roundKey, bestOfGames) {
  const matches = [];
  for (let left = 0, right = entries.length - 1; left < right; left += 1, right -= 1) {
    matches.push({
      label: `${roundLabel} ${matches.length + 1}`,
      teamA: entries[left],
      teamB: entries[right],
      bestOfGames,
      roundKey,
      roundLabel,
      roundSize: entries.length,
      matchIndex: matches.length + 1,
    });
  }
  return matches;
}

function buildSplitFinalsBracketRounds(finalistsPerPool, finalsBestOfByRound = {}) {
  const totalFinalists = finalistsPerPool * 2;
  const roundDefs = getFinalsRoundDefinitions(totalFinalists);
  const bestOfMap = normalizeFinalsBestOfMap(roundDefs, finalsBestOfByRound);
  const rounds = [];
  const firstRound = roundDefs[0];

  const crossoverMatches = Array.from({ length: finalistsPerPool }, (_, index) => {
    const pool1Seed = index + 1;
    const pool2Seed = finalistsPerPool - index;
    return {
      label: `${firstRound.label} ${index + 1}`,
      teamA: `Pool 1 ${ordinalSeedLabel(pool1Seed)} place`,
      teamB: `Pool 2 ${ordinalSeedLabel(pool2Seed)} place`,
      bestOfGames: bestOfMap[firstRound.key],
      roundKey: firstRound.key,
      roundLabel: firstRound.label,
      roundSize: totalFinalists,
      matchIndex: index + 1,
    };
  });

  rounds.push({
    ...firstRound,
    bestOfGames: bestOfMap[firstRound.key],
    matches: crossoverMatches,
  });

  let currentEntries = crossoverMatches.map((match) => `Winner ${match.label}`);
  for (let index = 1; index < roundDefs.length; index += 1) {
    const roundDef = roundDefs[index];
    const roundMatches = buildBracketMatchesFromEntries(
      currentEntries,
      roundDef.label,
      roundDef.key,
      bestOfMap[roundDef.key]
    );
    rounds.push({
      ...roundDef,
      bestOfGames: bestOfMap[roundDef.key],
      matches: roundMatches,
    });
    currentEntries = roundMatches.map((match) => `Winner ${match.label}`);
  }

  return rounds;
}

function buildFinalsSlotsAndMatches(params, finalsRounds) {
  if (!finalsRounds.length) {
    return {
      slots: [],
      matches: [],
      totalMatches: 0,
      summaryText: "",
    };
  }

  const tableNumbers = Array.from({ length: params.tableCount }, (_, i) => i + 1);
  const slots = [];
  const matches = [];

  finalsRounds.forEach((round) => {
    const roundMatchMinutes = getMatchMinutes(params.gameMinutes, round.bestOfGames);
    const roundMatches = round.matches.map((match) => ({
      ...match,
      groupId: "finals",
      groupLabel: "Finals",
      allowedTables: [...tableNumbers],
      isFinals: true,
      isKnockout: true,
    }));

    for (let i = 0; i < roundMatches.length; i += tableNumbers.length) {
      const slice = roundMatches.slice(i, i + tableNumbers.length).map((match, idx) => ({
        ...match,
        table: tableNumbers[idx],
      }));
      slots.push({
        label: round.label,
        assignments: slice,
        estimatedMinutes: roundMatchMinutes,
      });
      matches.push(...slice);
    }
  });

  const summaryText = finalsRounds
    .map((round) => `${round.label} BO${round.bestOfGames}`)
    .join(", ");

  return {
    slots,
    matches,
    totalMatches: matches.length,
    summaryText,
  };
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

function formatDateTimeForDisplay(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function parseMusterDateValue(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const [, year, month, day, hours, minutes, seconds] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds || "00"));
}

function formatMusterDateValue(value) {
  const parsed = parseMusterDateValue(value);
  if (!parsed) {
    return String(value || "").trim();
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatMusterDateTimeLocalValue(value) {
  const parsed = parseMusterDateValue(value);
  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getExpectedGamesPerMatch(bestOfGames) {
  if (bestOfGames <= 1) return 1;
  if (bestOfGames === 3) return 2.5;
  if (bestOfGames === 5) return 3.5;
  return Math.max(1, bestOfGames);
}

function getMatchMinutes(gameMinutes, bestOfGames) {
  const expectedGames = getExpectedGamesPerMatch(bestOfGames);
  return Math.max(1, Math.round((gameMinutes * expectedGames) / 5) * 5);
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSettings({ teamCount, tableCount, gameMinutes, bestOfGames, finalsTeamCount, drawMode = "full" }) {
  if (!Number.isInteger(teamCount) || teamCount < 2)       return "Enter at least 2 teams.";
  if (!Number.isInteger(tableCount) || tableCount < 1)     return "Enter at least 1 table.";
  if (!Number.isInteger(gameMinutes) || gameMinutes < 1)   return "Enter a valid approximate time per game.";
  const normalizedBestOfGames = Number.isInteger(bestOfGames) ? bestOfGames : 3;
  if (![1, 3, 5].includes(normalizedBestOfGames)) {
    return "Choose a match format of Best of 1, 3, or 5.";
  }
  const visibilityDays = Number.parseInt(document.getElementById("tournament-public-days")?.value || "7", 10);
  const isPublic = Boolean(document.getElementById("tournament-public")?.checked);
  if (isPublic && (!Number.isInteger(visibilityDays) || visibilityDays < 1 || visibilityDays > 365)) {
    return "Days to stay public must be between 1 and 365.";
  }
  const finalistOptions = getFinalsTeamCountOptions(teamCount, drawMode === "split" ? "split" : "full");
  if (finalistOptions.length > 0 && !finalistOptions.includes(Number(finalsTeamCount))) {
    return `Choose finalists as ${finalistOptions.join(", ")}.`;
  }
  return "";
}

function getRefModeLabel(mode) {
  if (mode === "manual") return "Loser refs next game · First round manual";
  if (mode === "random") return "Loser refs next game · First round random";
  return "Off";
}

function canUseRefSettings(teamCount, tableCount) {
  if (!Number.isInteger(teamCount) || !Number.isInteger(tableCount)) return false;
  if (teamCount < 2 || tableCount < 1) return false;
  return teamCount >= tableCount * 3;
}

function updateRefSettingVisibility() {
  const teamCount = Number.parseInt(teamCountInput?.value || "0", 10);
  const tableCount = Number.parseInt(tableCountInput?.value || "0", 10);
  const refsEligible = canUseRefSettings(teamCount, tableCount);
  refSettingToggleLabel?.classList.toggle("hidden", !refsEligible);
  if (!refsEligible) {
    if (refEnabledInput) {
      refEnabledInput.checked = false;
      refEnabledInput.disabled = true;
    }
    if (refModeWrap) refModeWrap.classList.add("hidden");
    if (refModeSelect) refModeSelect.disabled = true;
    return;
  }

  if (refEnabledInput) {
    refEnabledInput.disabled = false;
  }
  const enabled = Boolean(refEnabledInput?.checked);
  if (refModeWrap) {
    refModeWrap.classList.toggle("hidden", !enabled);
  }
  if (refModeSelect) {
    refModeSelect.disabled = !enabled;
  }
}

function sanitizeBestOfGamesValue(value, fallback = 3) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return [1, 3, 5].includes(parsed) ? parsed : fallback;
}

function getFinalsTeamCountOptions(teamCount, drawMode = "full") {
  if (!Number.isInteger(teamCount) || teamCount < 2) return [];
  if (drawMode === "split") {
    const minPoolSize = Math.floor(teamCount / 2);
    return [2, 4].filter((count) => count <= minPoolSize);
  }
  return [2, 4, 8, 16].filter((count) => count <= teamCount);
}

function getFinalsRoundDefinitions(finalistsCount) {
  if (!Number.isInteger(finalistsCount) || finalistsCount < 2) return [];
  const rounds = [];
  let teamsRemaining = finalistsCount;
  while (teamsRemaining >= 2) {
    let key = "final";
    let label = "Final";
    if (teamsRemaining === 16) {
      key = "round16";
      label = "Round of 16";
    } else if (teamsRemaining === 8) {
      key = "quarterfinals";
      label = "Quarter-finals";
    } else if (teamsRemaining === 4) {
      key = "semifinals";
      label = "Semi-finals";
    }
    rounds.push({
      key,
      label,
      teamsRemaining,
      matches: Math.max(1, Math.floor(teamsRemaining / 2)),
    });
    teamsRemaining = Math.floor(teamsRemaining / 2);
  }
  return rounds;
}

function buildDefaultFinalsBestOfMap(roundDefs) {
  const result = {};
  roundDefs.forEach((round) => {
    result[round.key] = round.key === "final" ? 5 : 3;
  });
  return result;
}

function normalizeFinalsBestOfMap(roundDefs, sourceMap = {}) {
  const defaults = buildDefaultFinalsBestOfMap(roundDefs);
  const normalized = {};
  roundDefs.forEach((round) => {
    normalized[round.key] = sanitizeBestOfGamesValue(sourceMap[round.key], defaults[round.key]);
  });
  return normalized;
}

function ensureFinalsControlState(teamCount, selectedFinalists = null, preferredBestOfMap = null, drawMode = "full") {
  const options = getFinalsTeamCountOptions(teamCount, drawMode);
  if (!drawFinalsControls || !drawFinalsTeamCountSelect || !drawFinalsRounds) {
    return { finalists: options[0] || 0, bestOfByRound: {} };
  }
  if (options.length === 0) {
    drawFinalsControls.classList.add("hidden");
    drawFinalsRounds.innerHTML = "";
    drawFinalsTeamCountSelect.innerHTML = "";
    return { finalists: 0, bestOfByRound: {} };
  }

  const safeSelected = Number.parseInt(String(selectedFinalists ?? drawFinalsTeamCountSelect.value ?? ""), 10);
  const finalists = options.includes(safeSelected) ? safeSelected : options[0];
  drawFinalsTeamCountSelect.innerHTML = options.map((optionValue) => `
    <option value="${optionValue}" ${optionValue === finalists ? "selected" : ""}>${optionValue}</option>
  `).join("");
  const finalsLabel = drawMode === "split" ? "Finalists per pool" : "Finalists";
  drawFinalsTeamCountSelect.closest("label")?.querySelector("span")?.replaceChildren(finalsLabel);

  const roundDefs = getFinalsRoundDefinitions(drawMode === "split" ? finalists * 2 : finalists);
  const currentSelections = normalizeFinalsBestOfMap(roundDefs, preferredBestOfMap || {});
  drawFinalsRounds.innerHTML = roundDefs.map((round) => {
    const checkedValue = currentSelections[round.key];
    return `
      <label class="draw-finals-round-control">
        <span>${round.label} (${round.matches} match${round.matches === 1 ? "" : "es"})</span>
        <div class="draw-format-options" role="radiogroup" aria-label="${round.label} best of">
          ${[1, 3, 5].map((value) => `
            <label class="draw-format-option">
              <input type="radio" name="draw-finals-best-of-${round.key}" value="${value}" ${value === checkedValue ? "checked" : ""}>
              <span>${value}</span>
            </label>
          `).join("")}
        </div>
      </label>
    `;
  }).join("");

  drawFinalsControls.classList.remove("hidden");
  return {
    finalists,
    bestOfByRound: currentSelections,
  };
}

function readFinalsBestOfFromControls(finalistsCount) {
  const drawMode = lastParams?.drawMode || "full";
  const roundDefs = getFinalsRoundDefinitions(drawMode === "split" ? finalistsCount * 2 : finalistsCount);
  const defaults = buildDefaultFinalsBestOfMap(roundDefs);
  const result = {};
  roundDefs.forEach((round) => {
    const selected = drawFinalsRounds?.querySelector(`input[name="draw-finals-best-of-${round.key}"]:checked`);
    result[round.key] = sanitizeBestOfGamesValue(selected?.value, defaults[round.key]);
  });
  return result;
}

function syncFinalsControlVisibility(drawMode, teamCount, selectedFinalists = null, preferredBestOfMap = null) {
  if (!drawFinalsControls) return { finalists: 0, bestOfByRound: {} };
  if (drawMode === "plate") {
    drawFinalsControls.classList.add("hidden");
    return { finalists: 0, bestOfByRound: {} };
  }
  return ensureFinalsControlState(teamCount, selectedFinalists, preferredBestOfMap, drawMode);
}

function getSelectedBestOfGames() {
  const select = document.getElementById("draw-best-of-games");
  const fromSelect = Number.parseInt(select?.value || "", 10);
  if ([1, 3, 5].includes(fromSelect)) return fromSelect;
  return lastParams?.bestOfGames || 3;
}

function getSettingsParams() {
  const teamCount = Number.parseInt(document.getElementById("teamCount").value, 10);
  const tableCount = Number.parseInt(document.getElementById("tableCount").value, 10);
  const gameMinutes = Number.parseInt(document.getElementById("gameMinutes").value, 10);
  const bestOfGames = getSelectedBestOfGames();
  const controlMode = (lastParams?.drawMode === "split" || pendingDrawRequest?.params?.drawMode === "split") ? "split" : "full";
  const finalsControlState = ensureFinalsControlState(
    teamCount,
    lastParams?.finalsTeamCount ?? null,
    lastParams?.finalsBestOfByRound ?? null,
    controlMode
  );
  const matchMinutes = getMatchMinutes(gameMinutes, bestOfGames);
  const location = (document.getElementById("tournamentLocation")?.value || "").trim();
  const musterDate = document.getElementById("musterDate")?.value || "";
  const isPublic = Boolean(document.getElementById("tournament-public")?.checked);
  const visibilityDays = Number.parseInt(document.getElementById("tournament-public-days")?.value || "7", 10);
  const refsEligible = canUseRefSettings(teamCount, tableCount);
  const refsEnabled = refsEligible && Boolean(refEnabledInput?.checked);
  return {
    teamCount,
    tableCount,
    gameMinutes,
    bestOfGames,
    minMinutes: matchMinutes,
    maxMinutes: matchMinutes,
    location,
    musterDate,
    isPublic,
    visibilityDays,
    refsEnabled,
    refMode: refsEnabled ? (refModeSelect?.value || "random") : "none",
    loserRefMode: refsEnabled ? "loser-next-game" : "none",
    finalsTeamCount: finalsControlState.finalists,
    finalsBestOfByRound: finalsControlState.bestOfByRound,
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
  pendingDrawRequest = { params, teams, initialTeams: [...teams] };
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

function renderFinalsSummary(section, hintEl, gridEl, finals) {
  if (!section || !hintEl || !gridEl) return;
  if (!finals?.enabled || !Array.isArray(finals.rounds) || finals.rounds.length === 0) {
    section.classList.add("hidden");
    hintEl.textContent = "";
    gridEl.innerHTML = "";
    return;
  }

  hintEl.textContent = finals.mode === "split"
    ? `Each pool contributes top ${finals.finalistsPerPool} from standings. Cross-over: Pool 1 vs Pool 2 opposite seed.`
    : "Final seeds come from round-robin standings (1st, 2nd, 3rd...).";
  gridEl.innerHTML = finals.rounds.map((round) => `
    <article class="finals-round-card">
      <h4>${round.label}</h4>
      <p class="muted small">Best of ${round.bestOfGames}</p>
      <div class="finals-round-matches">
        ${round.matches.map((match) => `
          <div class="finals-round-match">${match.teamA} vs ${match.teamB}</div>
        `).join("")}
      </div>
    </article>
  `).join("");
  section.classList.remove("hidden");
}

function syncBestOfGamesControl() {
  const control = document.getElementById("draw-best-of-games");
  if (!control) return;
  const value = String(lastParams?.bestOfGames || 3);
  control.value = value;
  document.querySelectorAll('input[name="drawBestOfGames"]').forEach((radio) => {
    radio.checked = radio.value === value;
  });
}

function buildScheduleDescription(params, drawData, slotCount) {
  if (drawData?.finals?.enabled) {
    const finalsSummary = drawData.finals.summaryText ? ` · Finals ${drawData.finals.summaryText}` : "";
    return `${params.teams.length} teams · ${drawData.totalMatches} matches · ${params.tableCount} tables · ${slotCount} scheduling windows · ${drawData.groupSummary} · Round robin best of ${params.bestOfGames}${finalsSummary}`;
  }
  return `${params.teams.length} teams · ${drawData.totalMatches} matches · ${params.tableCount} tables · ${slotCount} scheduling windows · ${drawData.groupSummary} · Best of ${params.bestOfGames}`;
}

function getTotalEstimatedMinutes(defaultMatchMinutes) {
  if (!Array.isArray(lastSlots) || lastSlots.length === 0) return 0;
  return lastSlots.reduce((sum, slot) => {
    const slotMinutes = Number.isFinite(slot?.estimatedMinutes) ? slot.estimatedMinutes : defaultMatchMinutes;
    return sum + Math.max(1, Number(slotMinutes) || defaultMatchMinutes || 1);
  }, 0);
}

function updateEstimatedTimeSummary(matchMinutes) {
  if (!lastSlots?.length) return;
  const durationMinutes = getTotalEstimatedMinutes(matchMinutes);
  const estimatedLabel = `Approx ${fmt(durationMinutes)}`;
  const musterValue = document.getElementById("musterDate")?.value || lastParams?.musterDate || "";
  if (!musterValue) {
    estimatedTimeEl.textContent = estimatedLabel;
    return;
  }

  const start = parseMusterDateValue(musterValue);
  if (!start) {
    estimatedTimeEl.textContent = estimatedLabel;
    return;
  }

  const finish = new Date(start.getTime() + durationMinutes * 60 * 1000);
  estimatedTimeEl.textContent = `${estimatedLabel} · Approx finish ${formatDateTimeForDisplay(finish)}`;
}

function applyBestOfGamesToCurrentDraw() {
  if (!lastParams || !lastSlots) return;
  const bestOfGames = getSelectedBestOfGames();
  const finalsTeamCount = Number.parseInt(drawFinalsTeamCountSelect?.value || String(lastParams.finalsTeamCount || "0"), 10) || 0;
  const finalsBestOfByRound = readFinalsBestOfFromControls(finalsTeamCount);
  const rerunParams = {
    ...lastParams,
    bestOfGames,
    finalsTeamCount,
    finalsBestOfByRound,
  };
  runDraw(rerunParams, lastParams.initialTeams || lastParams.teams, lastParams.drawMode || "full", {
    teamOrder: lastParams.teams,
  });
}

// ─── Step 1 → Step 2: build team name inputs ──────────────────────────────────

function showTeamNamesStep(teamCount, tableCount, existingTeams = []) {
  teamNameGrid.innerHTML = "";
  ensureFinalsControlState(teamCount, null, null, "full");

  for (let i = 1; i <= teamCount; i++) {
   const existingName = existingTeams[i - 1] || `Team ${i}`;
   const label = document.createElement("label");
   label.innerHTML = `
     <span>Team ${i}</span>
     <input type="text" class="team-name-input" maxlength="40"
            placeholder="Team ${i}" value="${existingName}" data-index="${i - 1}">
   `;
   teamNameGrid.appendChild(label);
  }

  hideSplitDecision();

  sectionSettings.classList.add("hidden");
  sectionNames.classList.remove("hidden");
  results.classList.add("hidden");
  setStep(2);
  updateTeamNamesStepMode();
  syncEditingControls();
}

// ─── Step 2 → Step 3: generate the draw ──────────────────────────────────────

function readTeamNames() {
  return Array.from(document.querySelectorAll(".team-name-input")).map((input, i) => {
    const v = input.value.trim();
    return v.length > 0 ? v : `Team ${i + 1}`;
  });
}

function updateTeamNamesStepMode() {
  const teamCount = teamNameGrid?.querySelectorAll(".team-name-input").length || lastParams?.teamCount || 0;
  if (editingFrozen) {
    if (generateDrawBtn) generateDrawBtn.textContent = "Save Names";
    if (namesDescription) {
      namesDescription.textContent = `${teamCount} teams · edit the names below, then save the updated names.`;
    }
    if (backBtn) backBtn.classList.add("hidden");
    return;
  }

  if (backBtn) backBtn.classList.remove("hidden");

  if (generateDrawBtn) generateDrawBtn.textContent = "Generate draw →";
  if (namesDescription) {
    namesDescription.textContent = `${teamCount} teams · edit the names below, then generate the draw.`;
  }
}

function renameTeamValue(value, renameMap) {
  if (!value || !renameMap.has(value)) return value;
  return renameMap.get(value);
}

function renameMatchTeams(match, renameMap) {
  if (!match) return match;
  if (match.teamA) match.teamA = renameTeamValue(match.teamA, renameMap);
  if (match.teamB) match.teamB = renameTeamValue(match.teamB, renameMap);
  if (match.winner) match.winner = renameTeamValue(match.winner, renameMap);
  if (match.winnerTeam) match.winnerTeam = renameTeamValue(match.winnerTeam, renameMap);
  if (match.loser) match.loser = renameTeamValue(match.loser, renameMap);
  if (match.loserTeam) match.loserTeam = renameTeamValue(match.loserTeam, renameMap);
  if (match.refTeam) match.refTeam = renameTeamValue(match.refTeam, renameMap);
  return match;
}

function renameObjectKeys(source, renameMap) {
  return Object.fromEntries(Object.entries(source || {}).map(([key, value]) => [renameTeamValue(key, renameMap), value]));
}

function renameLiveTeams(oldTeams, newTeams) {
  if (!lastParams || oldTeams.length !== newTeams.length) return false;

  const renameMap = new Map(oldTeams.map((oldTeam, index) => [oldTeam, newTeams[index]]));

  lastParams.teams = [...newTeams];
  lastParams.initialTeams = [...newTeams];
  if (lastParams.drawData) {
    lastParams.drawData.matches.forEach((match) => renameMatchTeams(match, renameMap));
    if (Array.isArray(lastParams.drawData.slots)) {
      lastParams.drawData.slots.forEach((slot) => {
        (slot.assignments || []).forEach((match) => renameMatchTeams(match, renameMap));
      });
    }
    if (Array.isArray(lastParams.drawData.groups)) {
      lastParams.drawData.groups.forEach((group) => {
        group.teams = group.teams.map((team) => renameTeamValue(team, renameMap));
      });
    }
  }

  if (Array.isArray(lastSlots)) {
    lastSlots.forEach((slot) => {
      (slot.assignments || []).forEach((match) => renameMatchTeams(match, renameMap));
    });
  }

  lastParams.firstRoundRefAssignments = Object.fromEntries(
    Object.entries(lastParams.firstRoundRefAssignments || {}).map(([tableNum, team]) => [tableNum, renameTeamValue(team, renameMap)])
  );

  if (live) {
    live.allMatches.forEach((match) => renameMatchTeams(match, renameMap));
    live.queue.forEach((match) => renameMatchTeams(match, renameMap));
    live.completed.forEach((match) => renameMatchTeams(match, renameMap));
    live.tables.forEach((table) => {
      if (table.currentMatch) renameMatchTeams(table.currentMatch, renameMap);
      if (table.pendingRefTeam) table.pendingRefTeam = renameTeamValue(table.pendingRefTeam, renameMap);
      if (table.firstRoundRefTeam) table.firstRoundRefTeam = renameTeamValue(table.firstRoundRefTeam, renameMap);
    });
    live.activePairs = new Set(Array.from(live.activePairs).map((team) => renameTeamValue(team, renameMap)));
    live.playCount = renameObjectKeys(live.playCount, renameMap);
    live.points = renameObjectKeys(live.points, renameMap);
    live.teamTotalSeconds = renameObjectKeys(live.teamTotalSeconds, renameMap);
    live.teamLoggedMatches = renameObjectKeys(live.teamLoggedMatches, renameMap);
    live.lastFinishedAtMs = renameObjectKeys(live.lastFinishedAtMs, renameMap);
    live.teamNumbers = Object.fromEntries(
      Object.entries(live.teamNumbers).map(([team, number]) => [renameTeamValue(team, renameMap), number])
    );
    if (Array.isArray(live.groups)) {
      live.groups.forEach((group) => {
        group.teams = group.teams.map((team) => renameTeamValue(team, renameMap));
      });
    }
    if (live.lastUndoResult) {
      renameMatchTeams(live.lastUndoResult.match, renameMap);
      live.lastUndoResult.winnerTeam = renameTeamValue(live.lastUndoResult.winnerTeam, renameMap);
      live.lastUndoResult.loserTeam = renameTeamValue(live.lastUndoResult.loserTeam, renameMap);
      live.lastUndoResult.previousLastFinishedAtMs = renameObjectKeys(live.lastUndoResult.previousLastFinishedAtMs, renameMap);
    }
  }

  if (pendingWinnerConfirm) {
    pendingWinnerConfirm.winnerTeam = renameTeamValue(pendingWinnerConfirm.winnerTeam, renameMap);
  }

  return true;
}

function saveTeamNames() {
  if (!lastParams) return;
  const newTeams = readTeamNames();
  const oldTeams = [...(lastParams.teams || [])];
  if (oldTeams.length !== newTeams.length) return;

  if (editingFrozen && live) {
    renameLiveTeams(oldTeams, newTeams);
    renderLiveBoard();
    sendState();
    goToStep(4);
    activateLiveTab("board");
    return;
  }

  runDraw(lastParams, newTeams, lastParams.drawMode || "full", { orderMode: lastParams.drawOrderMode || "initial" });
}

function buildDrawData(params, teams, drawMode) {
  const { tableCount, minMinutes } = params;
  const arrangedTeams = [...teams];
  const shouldSplit = drawMode === "split" && tableCount >= 2 && teams.length >= 4;
  const allTableNumbers = Array.from({ length: tableCount }, (_, i) => i + 1);
  const isPlate = drawMode === "plate";

  if (!shouldSplit) {
    const rounds = buildRounds(arrangedTeams);
    const baseSlots = combineSlots([buildSlots(rounds, allTableNumbers, "all", "Round")]).map((slot) => ({
      ...slot,
      estimatedMinutes: minMinutes,
    }));
    const matches = baseSlots.flatMap((slot) => slot.assignments);
    const orderedMatches = orderMatchesWithInitialPairs(matches, arrangedTeams, tableCount);
    const shouldAddFinals = drawMode === "full" && Number.isInteger(params.finalsTeamCount) && params.finalsTeamCount >= 2;
    const finalsRounds = shouldAddFinals
      ? buildFinalsBracketRounds(params.finalsTeamCount, params.finalsBestOfByRound || {})
      : [];
    const finalsData = shouldAddFinals
      ? buildFinalsSlotsAndMatches(params, finalsRounds)
      : { slots: [], matches: [], totalMatches: 0, summaryText: "" };
    const slots = [...baseSlots, ...finalsData.slots];
    const groupSummary = shouldAddFinals
      ? `Single full round robin + top ${params.finalsTeamCount} finals knockout`
      : (isPlate ? "Plate knockout draw" : "Single full round robin");
    return {
      splitMode: false,
      drawMode,
      slots,
      roundsCount: rounds.length + finalsRounds.length,
      matches: orderedMatches,
      groupSummary,
      groups: [
        {
          id: "all",
          label: "All teams",
          teams: arrangedTeams,
          tables: allTableNumbers,
        },
      ],
      totalMatches: orderedMatches.length + finalsData.totalMatches,
      minMinutes,
      maxMinutes: minMinutes,
      finals: {
        enabled: shouldAddFinals,
        teamCount: shouldAddFinals ? params.finalsTeamCount : 0,
        finalistsPerPool: 0,
        rounds: finalsRounds,
        summaryText: finalsData.summaryText,
        mode: "full",
      },
    };
  }

  const half = Math.ceil(arrangedTeams.length / 2);
  const poolATeams = arrangedTeams.slice(0, half);
  const poolBTeams = arrangedTeams.slice(half);
  const poolATables = allTableNumbers.slice(0, Math.ceil(tableCount / 2));
  const poolBTables = allTableNumbers.slice(Math.ceil(tableCount / 2));

  const poolARounds = buildRounds(poolATeams);
  const poolBRounds = buildRounds(poolBTeams);
  const poolASlots = buildSlots(poolARounds, poolATables, "pool-a", "Pool 1");
  const poolBSlots = buildSlots(poolBRounds, poolBTables, "pool-b", "Pool 2");
  const slots = combineSlots([poolASlots, poolBSlots]).map((slot) => ({
    ...slot,
    estimatedMinutes: minMinutes,
    assignments: shuffle(slot.assignments).map((match, index) => ({
      ...match,
      allowedTables: [...allTableNumbers],
      table: allTableNumbers[index],
    })),
  }));
  const matches = slots.flatMap((slot) => slot.assignments);
  const orderedMatches = orderMatchesWithInitialPairs(matches, arrangedTeams, tableCount);
  const shouldAddSplitFinals = drawMode === "split" && Number.isInteger(params.finalsTeamCount) && params.finalsTeamCount >= 2;
  const splitFinalsRounds = shouldAddSplitFinals
    ? buildSplitFinalsBracketRounds(params.finalsTeamCount, params.finalsBestOfByRound || {})
    : [];
  const splitFinalsData = shouldAddSplitFinals
    ? buildFinalsSlotsAndMatches(params, splitFinalsRounds)
    : { slots: [], matches: [], totalMatches: 0, summaryText: "" };
  const allSlots = [...slots, ...splitFinalsData.slots];

  return {
    splitMode: true,
    drawMode,
    slots: allSlots,
    roundsCount: Math.max(poolARounds.length, poolBRounds.length) + splitFinalsRounds.length,
    matches: orderedMatches,
    groupSummary: shouldAddSplitFinals
      ? `Split mode: Pool 1 (${poolATeams.length} teams) and Pool 2 (${poolBTeams.length} teams) plus top ${params.finalsTeamCount} per pool crossover finals`
      : `Split mode: Pool 1 (${poolATeams.length} teams) and Pool 2 (${poolBTeams.length} teams) share all ${tableCount} tables`,
    groups: [
      { id: "pool-a", label: "Pool 1", teams: poolATeams, tables: allTableNumbers, sharedTables: true },
      { id: "pool-b", label: "Pool 2", teams: poolBTeams, tables: allTableNumbers, sharedTables: true },
    ],
    totalMatches: orderedMatches.length + splitFinalsData.totalMatches,
    minMinutes,
    maxMinutes: minMinutes,
    finals: {
      enabled: shouldAddSplitFinals,
      teamCount: shouldAddSplitFinals ? params.finalsTeamCount * 2 : 0,
      finalistsPerPool: shouldAddSplitFinals ? params.finalsTeamCount : 0,
      rounds: splitFinalsRounds,
      summaryText: shouldAddSplitFinals
        ? `Cross-over ${params.finalsTeamCount} per pool · ${splitFinalsData.summaryText}`
        : "",
      mode: "split",
    },
  };
}

function buildFirstRoundRefContext(teams, firstWindowAssignments) {
  const playingTeams = new Set(firstWindowAssignments.flatMap((match) => [match.teamA, match.teamB]));
  const eligibleTeams = teams.filter((team) => !playingTeams.has(team));
  return { eligibleTeams, playingTeams };
}

function buildRandomFirstRoundRefs(firstWindowAssignments, eligibleTeams) {
  if (!firstWindowAssignments.length || !eligibleTeams.length) return {};
  const pool = shuffle(eligibleTeams);
  const map = {};
  firstWindowAssignments.forEach((match, index) => {
    const pick = pool[index % pool.length];
    map[match.table] = pick;
  });
  return map;
}

function renderFirstRoundRefPanel(params, firstWindowAssignments, teams) {
  if (!firstRoundRefSection || !firstRoundRefHint || !firstRoundRefList) return {};
  if (!params.refsEnabled || firstWindowAssignments.length === 0) {
    firstRoundRefSection.classList.add("hidden");
    firstRoundRefHint.textContent = "";
    firstRoundRefList.innerHTML = "";
    return {};
  }

  const { eligibleTeams } = buildFirstRoundRefContext(teams, firstWindowAssignments);
  firstRoundRefSection.classList.remove("hidden");
  if (eligibleTeams.length === 0) {
    firstRoundRefHint.textContent = "No teams are idle in round one, so no first-round refs can be assigned.";
    firstRoundRefList.innerHTML = "";
    return {};
  }

  if (params.refMode === "manual") {
    firstRoundRefHint.textContent = "Select one ref team for each first-round table.";
    firstRoundRefList.innerHTML = firstWindowAssignments.map((match) => `
      <label class="first-round-ref-item">
        <span>Table ${match.table}: ${match.teamA} vs ${match.teamB}</span>
        <select class="first-round-ref-select" data-table="${match.table}">
          <option value="">Select ref team</option>
          ${eligibleTeams.map((team) => `<option value="${team}">${team}</option>`).join("")}
        </select>
      </label>
    `).join("");

    const manualSelections = {};
    firstRoundRefList.querySelectorAll(".first-round-ref-select").forEach((select) => {
      select.addEventListener("change", () => {
        const tableNum = Number.parseInt(select.dataset.table || "0", 10);
        if (!tableNum) return;
        manualSelections[tableNum] = select.value || "";
        if (lastParams) {
          lastParams.firstRoundRefAssignments = { ...manualSelections };
        }
        const assignmentEl = scheduleBody?.querySelector(`.assignment[data-table="${tableNum}"]`);
        if (assignmentEl) {
          const baseText = assignmentEl.dataset.baseText || assignmentEl.textContent || "";
          assignmentEl.textContent = `${baseText} · Ref: ${select.value || "TBD"}`;
        }
      });
    });
    return manualSelections;
  }

  const randomAssignments = buildRandomFirstRoundRefs(firstWindowAssignments, eligibleTeams);
  firstRoundRefHint.textContent = "Random refs assigned from teams not playing in round one. Re-draw to reshuffle.";
  firstRoundRefList.innerHTML = firstWindowAssignments.map((match) => `
    <div class="first-round-ref-item">
      <span>Table ${match.table}: ${match.teamA} vs ${match.teamB}</span>
      <strong>${randomAssignments[match.table] || "—"}</strong>
    </div>
  `).join("");
  return randomAssignments;
}

function renderScheduleTeamOrder(teams) {
  if (!scheduleTeamOrderEl) return;
  scheduleTeamOrderEl.innerHTML = teams.map((team, index) => `
    <div class="schedule-team-chip">#${index + 1} ${team}</div>
  `).join("");
}

function runDraw(params, teams, drawMode, options = {}) {
  const teamCount = Number.parseInt(String(params.teamCount || teams.length), 10) || teams.length;
  const finalsControlState = syncFinalsControlVisibility(
    drawMode,
    teamCount,
    params.finalsTeamCount ?? null,
    params.finalsBestOfByRound ?? null
  );
  const normalizedParams = {
    ...params,
    teamCount,
    finalsTeamCount: (drawMode === "full" || drawMode === "split") ? finalsControlState.finalists : 0,
    finalsBestOfByRound: (drawMode === "full" || drawMode === "split") ? finalsControlState.bestOfByRound : {},
  };
  const { tableCount, minMinutes } = normalizedParams;
  const initialTeams = Array.isArray(params.initialTeams) && params.initialTeams.length
    ? [...params.initialTeams]
    : [...teams];
  const baseTeams = Array.isArray(options.teamOrder) && options.teamOrder.length
    ? [...options.teamOrder]
    : [...teams];
  const drawTeams = options.orderMode === "random"
    ? shuffle(baseTeams)
    : [...baseTeams];

  const drawData = buildDrawData(normalizedParams, drawTeams, drawMode);
  if (drawMode === "plate" && !platePairingPairsData) {
    platePairingPairsData = buildPlatePairings(drawTeams);
  }
  const { slots } = drawData;
  const teamNumbers = Object.fromEntries(drawTeams.map((team, index) => [team, index + 1]));
  const previewSlots = slots.slice(0, 1);
  const firstWindowAssignments = drawMode === "plate" && platePairingPairsData?.matches
    ? platePairingPairsData.matches.slice(0, tableCount).map((match, index) => ({
        table: index + 1,
        teamA: match.teamA,
        teamB: match.teamB,
      }))
    : buildInitialTableAssignments(drawTeams, tableCount);

  lastSlots = slots;
  lastParams = {
    ...normalizedParams,
    teams: drawTeams,
    initialTeams,
    drawMode,
    drawData,
    drawOrderMode: options.orderMode === "random" ? "random" : "initial",
    firstRoundRefAssignments: {},
  };
  hideSplitDecision();
  setDrawModeButtons(drawMode);

  // Seed label
  drawSeedLabel.textContent = `#${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  // Summary stats
  const totalMatches = drawData.totalMatches;
  totalMatchesEl.textContent  = String(totalMatches);
  totalRoundsEl.textContent   = String(drawData.roundsCount);
  totalSlotsEl.textContent    = String(slots.length);
  updateEstimatedTimeSummary(minMinutes);
  scheduleDescriptionEl.textContent = buildScheduleDescription(
    { ...normalizedParams, teams: drawTeams },
    drawData,
    slots.length
  );
  renderScheduleTeamOrder(drawTeams);
  redrawBtn.textContent = "↺ Re-draw";
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
  renderFinalsSummary(
    finalsSummarySection,
    finalsSummaryHint,
    finalsSummaryGrid,
    drawData.finals
  );

  // Schedule table
  scheduleBody.innerHTML = "";
  const { eligibleTeams: firstRoundRefEligibleTeams } = buildFirstRoundRefContext(drawTeams, firstWindowAssignments);
  const firstRoundRefAssignments = renderFirstRoundRefPanel(normalizedParams, firstWindowAssignments, drawTeams);
  lastParams.firstRoundRefAssignments = { ...firstRoundRefAssignments };
  lastParams.firstRoundRefRequiredTables = normalizedParams.refsEnabled && normalizedParams.refMode === "manual" && firstRoundRefEligibleTeams.length > 0
    ? firstWindowAssignments.map((match) => match.table)
    : [];
  previewSlots.forEach((slot, index) => {
    const row = document.createElement("tr");
    let assignDiv = null;
    if (index === 0) {
      assignDiv = document.createElement("div");
      assignDiv.className = "assignments";
      firstWindowAssignments.forEach((match, matchIndex) => {
        const tableNumber = matchIndex + 1;
        const cell = document.createElement("div");
        cell.className = "assignment";
        cell.dataset.table = String(match.table);
        cell.dataset.baseText = `Table ${tableNumber}: ${match.teamA} vs ${match.teamB}`;
        const refText = lastParams.refsEnabled
          ? ` · Ref: ${firstRoundRefAssignments[match.table] || "TBD"}`
          : "";
        cell.textContent = `${cell.dataset.baseText}${refText}`;
        assignDiv.appendChild(cell);
      });
    }
    row.innerHTML = "<td></td>";
    if (assignDiv) row.children[0].appendChild(assignDiv);
    scheduleBody.appendChild(row);
  });

  // Reset lock state
  tableCardsSection.classList.add("hidden");
  drawActions.classList.remove("hidden");
  lockedBadge.classList.add("hidden");

  sectionNames.classList.add("hidden");
  results.classList.remove("hidden");
  setStep(3);
  setDrawModeButtons(drawMode);
  syncBestOfGamesControl();
  syncEditingControls();
}

// ─── Lock / Accept ────────────────────────────────────────────────────────────

function acceptDraw() {
  // Don't lock immediately - allow re-editing until tournament starts (muster time)
  // isLocked will be set to true only when:
  // 1. The first match starts, OR
  // 2. Muster time is reached
  initLiveBoard(lastSlots, lastParams.tableCount, lastParams.teams, lastParams.drawData);
}

function freezeEditing() {
  if (editingFrozen) return;
  editingFrozen = true;
  lockedBadge.classList.remove("hidden");
  drawActions.classList.add("hidden");
  updateTeamNamesStepMode();
  syncEditingControls();
}

// ─── Event wiring ─────────────────────────────────────────────────────────────

refEnabledInput?.addEventListener("change", () => {
  updateRefSettingVisibility();
});
teamCountInput?.addEventListener("input", () => {
  updateRefSettingVisibility();
  const teamCount = Number.parseInt(teamCountInput?.value || "0", 10);
  const activeMode = lastParams?.drawMode === "split" ? "split" : "full";
  ensureFinalsControlState(
    teamCount,
    drawFinalsTeamCountSelect?.value || null,
    readFinalsBestOfFromControls(Number.parseInt(drawFinalsTeamCountSelect?.value || "0", 10)),
    activeMode
  );
});
tableCountInput?.addEventListener("input", updateRefSettingVisibility);
updateRefSettingVisibility();
ensureFinalsControlState(Number.parseInt(teamCountInput?.value || "0", 10), null, null, "full");

const advancedSettingsToggle = document.getElementById("advanced-settings-toggle");
const advancedSettingsPanel = document.getElementById("advanced-settings-panel");
const advancedSettingsBlock = advancedSettingsToggle?.closest(".advanced-settings-block");
function setAdvancedSettingsOpen(isOpen) {
  if (!advancedSettingsToggle || !advancedSettingsPanel || !advancedSettingsBlock) return;
  advancedSettingsPanel.classList.toggle("hidden", !isOpen);
  advancedSettingsToggle.setAttribute("aria-expanded", String(isOpen));
  advancedSettingsBlock.setAttribute("aria-expanded", String(isOpen));
}

advancedSettingsToggle?.addEventListener("click", () => {
  const isOpen = advancedSettingsToggle.getAttribute("aria-expanded") !== "true";
  setAdvancedSettingsOpen(isOpen);
});
setAdvancedSettingsOpen(false);

document.getElementById("tournament-public")?.addEventListener("change", syncTournamentVisibilityInputs);
syncTournamentVisibilityInputs();

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const params = getSettingsParams();
  const err = validateSettings(params);
  if (formError) formError.textContent = err;
  if (err) return;
  await syncTournamentMeta(params);
  showTeamNamesStep(params.teamCount, params.tableCount);
});

backBtn?.addEventListener("click", () => {
  goToStep(1);
});

generateDrawBtn?.addEventListener("click", () => {
  if (editingFrozen) {
    saveTeamNames();
    return;
  }
  const params = getSettingsParams();
  const err = validateSettings(params);
  if (formError) formError.textContent = err;
  if (err) return;
  const teams = readTeamNames();
  if (shouldOfferSplitDecision(params)) {
    showSplitDecision(params, teams);
    return;
  }

  runDraw(params, teams, "full", { orderMode: "initial" });
});

drawFullBtn?.addEventListener("click", () => {
  if (!pendingDrawRequest || editingFrozen) return;
  runDraw(pendingDrawRequest.params, pendingDrawRequest.initialTeams || pendingDrawRequest.teams, "full", { orderMode: "initial" });
});

drawSplitBtn?.addEventListener("click", () => {
  if (!pendingDrawRequest || editingFrozen) return;
  runDraw(pendingDrawRequest.params, pendingDrawRequest.initialTeams || pendingDrawRequest.teams, "split", { orderMode: "initial" });
});

drawPlateBtn?.addEventListener("click", () => {
  if (!pendingDrawRequest || editingFrozen) return;
  runDraw(pendingDrawRequest.params, pendingDrawRequest.initialTeams || pendingDrawRequest.teams, "plate", { orderMode: "initial" });
});

drawModeFullBtn?.addEventListener("click", () => {
  if (!lastParams || editingFrozen) return;
  runDraw(lastParams, lastParams.initialTeams || lastParams.teams, "full", { teamOrder: lastParams.teams });
});

drawModeSplitBtn?.addEventListener("click", () => {
  if (!lastParams || editingFrozen) return;
  runDraw(lastParams, lastParams.initialTeams || lastParams.teams, "split", { teamOrder: lastParams.teams });
});

drawModePlateBtn?.addEventListener("click", () => {
  if (!lastParams || editingFrozen) return;
  runDraw(lastParams, lastParams.initialTeams || lastParams.teams, "plate", { teamOrder: lastParams.teams });
});

const drawBestOfGamesSelect = document.getElementById("draw-best-of-games");
drawBestOfGamesSelect?.addEventListener("change", () => {
  if (!lastParams || editingFrozen) return;
  applyBestOfGamesToCurrentDraw();
});

document.querySelectorAll('input[name="drawBestOfGames"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    const hiddenInput = document.getElementById("draw-best-of-games");
    if (hiddenInput) hiddenInput.value = radio.value;
    if (!lastParams || editingFrozen) return;
    applyBestOfGamesToCurrentDraw();
  });
});

drawFinalsTeamCountSelect?.addEventListener("change", () => {
  const activeDrawMode = lastParams?.drawMode === "split" ? "split" : "full";
  const teamCount = Number.parseInt(teamCountInput?.value || String(lastParams?.teamCount || "0"), 10);
  const finalsState = ensureFinalsControlState(
    teamCount,
    drawFinalsTeamCountSelect.value,
    readFinalsBestOfFromControls(Number.parseInt(drawFinalsTeamCountSelect.value || "0", 10)),
    activeDrawMode
  );
  if (!lastParams || editingFrozen || (lastParams.drawMode !== "full" && lastParams.drawMode !== "split")) return;
  runDraw(
    {
      ...lastParams,
      finalsTeamCount: finalsState.finalists,
      finalsBestOfByRound: finalsState.bestOfByRound,
    },
    lastParams.initialTeams || lastParams.teams,
    lastParams.drawMode,
    { teamOrder: lastParams.teams }
  );
});

drawFinalsRounds?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.name.startsWith("draw-finals-best-of-")) return;
  if (!lastParams || editingFrozen || (lastParams.drawMode !== "full" && lastParams.drawMode !== "split")) return;
  applyBestOfGamesToCurrentDraw();
});

const musterDateInput = document.getElementById("musterDate");
const musterDatePickerInput = document.getElementById("musterDatePicker");
const musterDatePickerButton = document.getElementById("musterDatePickerBtn");
const refreshEstimatedTimeSummary = () => {
  if (!lastParams || editingFrozen || !lastSlots?.length) return;
  const bestOfGames = getSelectedBestOfGames();
  const matchMinutes = getMatchMinutes(lastParams.gameMinutes || 18, bestOfGames);
  updateEstimatedTimeSummary(matchMinutes);
};

const normalizeMusterDateInput = () => {
  if (!musterDateInput) return;
  const normalized = formatMusterDateValue(musterDateInput.value);
  if (normalized !== musterDateInput.value) {
    musterDateInput.value = normalized;
  }
};

musterDateInput?.addEventListener("input", () => {
  if (!lastParams || editingFrozen || !lastSlots?.length) return;
  refreshEstimatedTimeSummary();
});
musterDateInput?.addEventListener("change", () => {
  normalizeMusterDateInput();
  if (!lastParams || editingFrozen || !lastSlots?.length) return;
  refreshEstimatedTimeSummary();
});

musterDatePickerInput?.addEventListener("change", () => {
  if (musterDateInput && musterDatePickerInput.value) {
    musterDateInput.value = formatMusterDateValue(musterDatePickerInput.value);
  }
  if (!lastParams || editingFrozen || !lastSlots?.length) return;
  refreshEstimatedTimeSummary();
});

musterDatePickerButton?.addEventListener("click", () => {
  if (!musterDatePickerInput) return;
  if (musterDateInput && musterDateInput.value) {
    const pickerValue = formatMusterDateTimeLocalValue(musterDateInput.value);
    if (pickerValue) {
      musterDatePickerInput.value = pickerValue;
    }
  }
  if (typeof musterDatePickerInput.showPicker === "function") {
    musterDatePickerInput.showPicker();
  }
});

drawModeRandomBtn?.addEventListener("click", () => {
  if (!lastParams || editingFrozen) return;
  setPlatePairingMode("random");
});

drawModeManualBtn?.addEventListener("click", () => {
  if (!lastParams || editingFrozen) return;
  setPlatePairingMode("manual");
});

platePairingFinishedBtn?.addEventListener("click", () => {
  if (!lastParams || lastParams.drawMode !== "plate" || editingFrozen) return;
  setPlatePairingMode("random");
});

redrawBtn?.addEventListener("click", () => {
  if (editingFrozen) return;
  if (lastParams?.drawMode === "plate") {
    if (platePairingMode === "manual") {
      setPlatePairingMode("random");
    }
    platePairingPairsData = null;
    runDraw(lastParams, lastParams.initialTeams || lastParams.teams, lastParams.drawMode, { orderMode: "random" });
    return;
  }
  runDraw(lastParams, lastParams.initialTeams || lastParams.teams, lastParams.drawMode, { orderMode: "random" });
});

initialSortBtn?.addEventListener("click", () => {
  if (editingFrozen || !lastParams) return;
  if (lastParams.drawMode === "plate") {
    platePairingPairsData = null;
  }
  runDraw(lastParams, lastParams.initialTeams || lastParams.teams, lastParams.drawMode, { orderMode: "initial" });
});

acceptBtn?.addEventListener("click", () => {
  if (editingFrozen) return;
  if (lastParams?.refsEnabled && lastParams?.refMode === "manual") {
    const requiredTables = lastParams.firstRoundRefRequiredTables || [];
    const selectedRefs = lastParams.firstRoundRefAssignments || {};
    const allSelected = requiredTables.every((tableNum) => {
      const refTeam = selectedRefs[tableNum];
      return typeof refTeam === "string" && refTeam.length > 0;
    });
    if (!allSelected) {
      alert("Please select a first-round referee team for every table before accepting the draw.");
      return;
    }
  }
  acceptDraw();
});

[step1Pill, step2Pill, step3Pill, step4Pill].forEach((pill) => {
  pill?.addEventListener("click", () => {
    const step = Number.parseInt(pill.dataset.step || "0", 10);
    if (!step) return;
    goToStep(step);
  });
});

window.PoolSchedulerDrawInit = function () {
  // Initialize to step 1 if no state is loaded
  if (!lastParams) {
    goToStep(1);
  }
};
