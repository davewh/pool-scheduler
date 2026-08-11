// ─── Portal auth helpers ──────────────────────────────────────────────────────

window.poolPortalAuthState = window.poolPortalAuthState || {
  isLoggedIn: false,
  currentUserEmail: "",
};

function isPortalUserLoggedIn() {
  return Boolean(window.poolPortalAuthState && window.poolPortalAuthState.isLoggedIn);
}

function apiUrl(action) {
  return `${apiBase}?action=${encodeURIComponent(action)}`;
}

function buildTournamentUrl(tournamentId) {
  const url = new URL(publicHome, location.href);
  url.search = "";
  url.searchParams.set("id", tournamentId);
  return url.toString();
}

function buildTournamentJoinUrl(tournamentId) {
  const url = new URL(buildTournamentUrl(tournamentId));
  url.searchParams.set("join", "1");
  return url.toString();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

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

function apiPost(url, payload = {}, extraOptions = {}) {
  return fetch(url, buildApiPostOptions(payload, extraOptions));
}

function setStatusMessage(el, message, tone = "muted") {
  if (!el) return;
  el.textContent = message;
  if (tone === "error") {
    el.style.color = "#b91c1c";
  } else if (tone === "success") {
    el.style.color = "#15803d";
  } else {
    el.style.color = "";
  }
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function showLandingShell() {
  if (authShell) authShell.classList.remove("hidden");
  if (appShell) appShell.classList.add("hidden");
}

function showTournamentShell() {
  if (authShell) authShell.classList.add("hidden");
  if (appShell) appShell.classList.remove("hidden");
}

window.PoolSchedulerPortalInit = function () {};

async function refreshTournamentContext() {
  if (!sessionId || location.protocol === "file:") return;
  try {
    const response = await fetch(syncApiUrl("tournament-context"), { cache: "no-store" });
    const payload = await response.json();
    if (!payload || !payload.ok || !payload.tournament) {
      return;
    }
    tournamentContext = payload.tournament;
    renderTournamentContext();
    await maybeAutoJoinTournament();
  } catch (_) {
  }
}

function renderTournamentContext() {
  const summaryPanel = document.getElementById("tournament-active-summary");
  const nameEl = document.getElementById("active-tournament-name");
  const codeEl = document.getElementById("active-tournament-code");
  const shareTabBtn = document.getElementById("share-live-tab");
  const sharePanel = document.getElementById("tab-share");
  const shareSummary = document.getElementById("share-tournament-summary");
  const membersList = document.getElementById("tournament-members-list");
  const membersWrap = document.getElementById("tournament-members-wrap");
  const joinPanel = document.getElementById("tournament-join-panel");
  const joinTitle = document.getElementById("join-tournament-title");
  const joinMeta = document.getElementById("join-tournament-meta");
  const joinBtn = document.getElementById("join-tournament-btn");
  const joinMessage = document.getElementById("join-tournament-message");

  if (nameEl) nameEl.textContent = tournamentContext?.name || "—";
  if (codeEl) codeEl.textContent = tournamentContext?.accessCode || "—";
  if (summaryPanel) {
    summaryPanel.classList.toggle("hidden", !tournamentContext);
  }

  const isOwner = Boolean(tournamentContext && tournamentContext.isOwner);
  const invitesEnabled = window.poolPortalAuthState?.siteSettings?.allowInvites !== false;
  if (shareTabBtn) shareTabBtn.classList.toggle("hidden", !isOwner || !invitesEnabled);
  if (sharePanel) sharePanel.classList.toggle("hidden", !isOwner || !invitesEnabled);
 
  if ((!isOwner || !invitesEnabled) && document.querySelector(".live-tab.active")?.dataset?.tab === "share") {
    activateLiveTab("board");
  }

  if (shareSummary) {
    if (!tournamentContext) {
      shareSummary.innerHTML = "";
    } else {
      shareSummary.innerHTML = [
        ["Tournament", escapeHtml(tournamentContext.name || "—")],
        ["Muster", escapeHtml(tournamentContext.musterAt ? formatDateTime(tournamentContext.musterAt) : "To be confirmed")],
        ["Club", escapeHtml(tournamentContext.location || "To be confirmed")],
        ["Code", escapeHtml(tournamentContext.accessCode || "—")],
        ["Join link", tournamentContext.joinUrl ? `<a href="${escapeHtml(tournamentContext.joinUrl)}" target="_blank" rel="noopener">${escapeHtml(tournamentContext.joinUrl)}</a>` : "—"],
      ].map(([label, value]) => `
        <div>
          <span class="muted">${label}</span>
          <strong>${value}</strong>
        </div>
      `).join("");
    }
  }

  if (membersWrap) {
    membersWrap.classList.toggle("hidden", !isOwner);
  }
  if (membersList) {
    const members = Array.isArray(tournamentContext?.members) ? tournamentContext.members : [];
    if (!members.length) {
      membersList.innerHTML = `<p class="muted small">Nobody has added themselves yet.</p>`;
    } else {
      membersList.innerHTML = members.map((member) => `
        <div class="tournament-member-chip">
          <strong>${escapeHtml(member.email)}</strong>
          <span class="muted small">${member.joinedAt ? formatDateTime(member.joinedAt) : ""}</span>
        </div>
      `).join("");
    }
  }

  if (!joinPanel || !joinBtn || !joinTitle || !joinMeta || !joinMessage) return;
  if (!tournamentContext || isOwner) {
    joinPanel.classList.add("hidden");
    return;
  }

  joinTitle.textContent = tournamentContext.hasJoined ? "You are on this tournament list" : "Want to play in this tournament?";
  joinMeta.textContent = [
    tournamentContext.name || "Tournament",
    tournamentContext.location || "Club to be confirmed",
    tournamentContext.musterAt ? formatDateTime(tournamentContext.musterAt) : "Muster time to be confirmed",
  ].join(" · ");
  joinPanel.classList.remove("hidden");

  if (!tournamentContext.joinWindowOpen) {
    joinBtn.disabled = true;
    joinBtn.textContent = "Joining has closed";
    if (joinMessage && !joinMessage.textContent) {
      setStatusMessage(joinMessage, "This tournament is past muster time, so self-joining is closed.");
    }
    return;
  }

  if (tournamentContext.hasJoined) {
    joinBtn.disabled = false;
    joinBtn.textContent = "Remove me";
    setStatusMessage(joinMessage, `You are on the list as ${window.poolPortalAuthState?.currentUserEmail || "your account"}.`, "success");
    return;
  }

  joinBtn.disabled = false;
  if (isPortalUserLoggedIn()) {
    joinBtn.textContent = "Add me to tournament";
    if (!joinMessage.textContent) {
      setStatusMessage(joinMessage, `${tournamentContext.joinCount || 0} player${(tournamentContext.joinCount || 0) === 1 ? "" : "s"} already added.`);
    }
  } else {
    joinBtn.textContent = "Log in to add me";
    if (!joinMessage.textContent) {
      setStatusMessage(joinMessage, "Log in or sign up, then this link can add you automatically.");
    }
  }
}

async function maybeAutoJoinTournament() {
  if (!hasJoinIntent() || joinIntentHandled || !tournamentContext || !isPortalUserLoggedIn()) return;
  joinIntentHandled = true;
  if (!tournamentContext.canJoin || tournamentContext.hasJoined) {
    clearJoinIntent();
    renderTournamentContext();
    return;
  }
  await joinCurrentTournament(true);
}

async function joinCurrentTournament(isAutomatic = false) {
  const joinMessage = document.getElementById("join-tournament-message");
  if (!sessionId) return;

  if (!isPortalUserLoggedIn()) {
    location.href = getJoinShareUrl() || buildTournamentJoinUrl(sessionId);
    return;
  }

  const action = tournamentContext?.hasJoined ? "remove-tournament-member" : "join-tournament";
  const pendingLabel = action === "remove-tournament-member" ? "Removing you from this tournament..." : "Adding you to this tournament...";
  setStatusMessage(joinMessage, pendingLabel);
  try {
  const response = await apiPost(syncApiUrl(action), {});
    const payload = await response.json();
    if (!payload || !payload.ok) {
      throw new Error(payload && payload.error ? payload.error : action === "remove-tournament-member"
        ? "Could not remove you from this tournament."
        : "Could not add you to this tournament.");
    }
    setStatusMessage(joinMessage, payload.message || (action === "remove-tournament-member"
      ? "You have been removed from this tournament."
      : "You have been added to this tournament."), "success");
    clearJoinIntent();
    await refreshTournamentContext();
  } catch (error) {
    setStatusMessage(joinMessage, error.message || (action === "remove-tournament-member"
      ? "Could not remove you from this tournament."
      : "Could not add you to this tournament."), "error");
  }
}

async function sendTournamentInvites(event) {
  event.preventDefault();
  const textarea = document.getElementById("share-tournament-emails");
  const messageEl = document.getElementById("share-tournament-message");
  if (!textarea) return;

  if (window.poolPortalAuthState?.siteSettings?.allowInvites === false) {
    setStatusMessage(messageEl, "Invites are currently disabled by the administrator.", "error");
    return;
  }

  const recipients = textarea.value.trim();
  if (!recipients) {
    setStatusMessage(messageEl, "Enter at least one email address.", "error");
    return;
  }

  setStatusMessage(messageEl, "Sending invitations...");
  try {
  const response = await apiPost(syncApiUrl("send-tournament-invites"), { recipients });
    const payload = await response.json();
    if (!payload || !payload.ok) {
      throw new Error(payload && payload.error ? payload.error : "Could not send tournament invitations.");
    }
    const failedList = Array.isArray(payload.failedRecipients) && payload.failedRecipients.length
      ? ` Failed: ${payload.failedRecipients.join(", ")}.`
      : "";
    setStatusMessage(messageEl, `Sent ${payload.sentCount || 0} invitation${(payload.sentCount || 0) === 1 ? "" : "s"}.${failedList}`, payload.failedCount ? "error" : "success");
    if (!payload.failedCount) {
      textarea.value = "";
    }
  } catch (error) {
    setStatusMessage(messageEl, error.message || "Could not send tournament invitations.", "error");
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
    copySessionBtn?.addEventListener("click", () => {
      const url = getShareUrl();
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
    copyUrlBtn?.addEventListener("click", () => {
      const code = document.getElementById("session-url-full");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(() => {
        copyUrlBtn.textContent = "✓ Copied!";
        setTimeout(() => { copyUrlBtn.textContent = "Copy"; }, 2000);
      });
    });
  }

  const shareButtons = {
    native: document.getElementById("share-native-btn"),
    email: document.getElementById("share-email-btn"),
    whatsapp: document.getElementById("share-whatsapp-btn"),
    facebook: document.getElementById("share-facebook-btn"),
  };
  shareButtons.native?.addEventListener("click", async () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) return;
    const title = document.getElementById("active-tournament-name")?.textContent || "Pool tournament";
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Open this pool tournament: ${title}`, url: shareUrl });
      } catch (_) {
      }
      return;
    }
    navigator.clipboard.writeText(shareUrl).then(() => {
      shareButtons.native.textContent = "✓ Copied!";
      setTimeout(() => { shareButtons.native.textContent = "Share"; }, 2000);
    });
  });
  shareButtons.email?.addEventListener("click", () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) return;
    const title = document.getElementById("active-tournament-name")?.textContent || "Pool tournament";
    const subject = encodeURIComponent(`Pool tournament link: ${title}`);
    const body = encodeURIComponent(`Open this pool tournament:\n\n${shareUrl}`);
    location.href = `mailto:?subject=${subject}&body=${body}`;
  });
  shareButtons.whatsapp?.addEventListener("click", () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) return;
    const text = encodeURIComponent(`Open this pool tournament: ${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
  });
  shareButtons.facebook?.addEventListener("click", () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "noopener");
  });

  document.getElementById("share-tournament-form")?.addEventListener("submit", sendTournamentInvites);
  document.getElementById("join-tournament-btn")?.addEventListener("click", () => {
    void joinCurrentTournament(false);
  });
  document.getElementById("share-join-link-btn")?.addEventListener("click", () => {
    const joinUrl = tournamentContext?.joinUrl || getJoinShareUrl();
    const messageEl = document.getElementById("share-tournament-message");
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setStatusMessage(messageEl, "Join link copied.", "success");
    });
  });

  // New Tournament button
  const newTournBtn = document.getElementById("new-tournament-btn");
  if (newTournBtn) {
    newTournBtn?.addEventListener("click", () => {
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
    ["Location",   p.location || "—"],
    ["Muster",     p.musterDate ? formatDateTime(p.musterDate) : "—"],
    ["Public",     p.isPublic ? `${p.visibilityDays || 7} day${(p.visibilityDays || 7) === 1 ? "" : "s"}` : "Private"],
    ["Approx game time", p.gameMinutes ? `${p.gameMinutes} min` : "—"],
    ["Estimated match", p.minMinutes ? `${p.minMinutes} min` : "—"],
    ["Format",     dd && dd.splitMode ? "Split pools" : "Full round robin"],
    ["Referees",   p.refsEnabled ? getRefModeLabel(p.refMode) : "Off"],
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
