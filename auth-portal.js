(() => {
  const loginCardEl = document.getElementById("login-card");
  const authCardTitleEl = document.getElementById("auth-card-title");
  const authCardDescriptionEl = document.getElementById("auth-card-description");
  const authSubmitBtnEl = document.getElementById("auth-submit-btn");
  const authToggleBtnEl = document.getElementById("auth-toggle-btn");
  const adminDashboardEl = document.getElementById("admin-dashboard");
  const dashboardTitleEl = document.getElementById("dashboard-title");
  const dashboardDescriptionEl = document.getElementById("dashboard-description");
  const adminRouteHintEl = document.getElementById("admin-route-hint");
  const accountBarEl = document.getElementById("account-bar");
  const accountEmailEl = document.getElementById("account-email");
  const accountPanelEl = document.getElementById("account-panel");
  const accountProfileFormEl = document.getElementById("account-profile-form");
  const accountDisplayNameInputEl = document.getElementById("account-display-name");
  const accountEmailReadOnlyEl = document.getElementById("account-email-readonly");
  const accountCurrentPasswordInputEl = document.getElementById("account-current-password");
  const accountNewPasswordInputEl = document.getElementById("account-new-password");
  const accountConfirmPasswordInputEl = document.getElementById("account-confirm-password");
  const accountProfileMessageEl = document.getElementById("account-profile-message");
  const accountTournamentsListEl = document.getElementById("account-tournaments-list");
  const adminPageLinkEl = document.getElementById("admin-page-link");
  const topLogoutBtnEl = document.getElementById("top-logout-btn");
  const adminSettingsPanelEl = document.getElementById("admin-settings-panel");
  const adminSettingsFormEl = document.getElementById("admin-settings-form");
  const allowInvitesToggleEl = document.getElementById("allow-invites-toggle");
  const adminSettingsMessageEl = document.getElementById("admin-settings-message");
  const createTournamentFormEl = document.getElementById("create-tournament-form");
  const openByCodeFormEl = document.getElementById("open-by-code-form");
  const openByCodeInputEl = document.getElementById("open-by-code-input");
  const openByCodeMessageEl = document.getElementById("open-by-code-message");
  const tournamentNameInputEl = document.getElementById("tournament-name");
  const adminMessageEl = document.getElementById("admin-message");
  const dashboardTabsEl = document.getElementById("admin-dashboard-tabs");
  const toggleTournamentsBtnEl = document.getElementById("toggle-tournaments-btn");
  const tournamentsPanelEl = document.getElementById("tournaments-panel");
  const tournamentListEl = document.getElementById("tournament-list");
  const portalQuickActionsEl = document.getElementById("portal-quick-actions");
  const portalActionMyAccountBtnEl = document.getElementById("portal-action-my-account");
  const portalActionMyTournamentsBtnEl = document.getElementById("portal-action-my-tournaments");
  const portalActionFindTournamentBtnEl = document.getElementById("portal-action-find-tournament");
  const portalActionCreateTournamentBtnEl = document.getElementById("portal-action-create-tournament");
  const portalActionHelpBtnEl = document.getElementById("portal-action-help");
  const portalLogoutBtnEl = document.getElementById("portal-logout-btn");
  const portalPanelMyAccountEl = document.getElementById("portal-panel-my-account");
  const portalPanelMyTournamentsEl = document.getElementById("portal-panel-my-tournaments");
  const portalPanelFindTournamentEl = document.getElementById("portal-panel-find-tournament");
  const portalPanelCreateTournamentEl = document.getElementById("portal-panel-create-tournament");
  const tournamentSearchInputEl = document.getElementById("tournament-search-input");
  const tournamentSearchEmptyEl = document.getElementById("tournament-search-empty");
  const logoutBtnEl = document.getElementById("logout-btn");
  const authShell = document.getElementById("auth-shell");
  const appShell = document.getElementById("app-shell");
  const forgotPasswordCardEl = document.getElementById("forgot-password-card");
  const forgotPasswordFormEl = document.getElementById("forgot-password-form");
  const forgotPasswordEmailInputEl = document.getElementById("forgot-password-email");
  const forgotPasswordCodeInputEl = document.getElementById("forgot-password-code");
  const forgotPasswordNewPasswordInputEl = document.getElementById("forgot-password-new-password");
  const forgotPasswordConfirmPasswordInputEl = document.getElementById("forgot-password-confirm-password");
  const forgotPasswordMessageEl = document.getElementById("forgot-password-message");
  const forgotPasswordStepEmailEl = document.getElementById("forgot-password-step-email");
  const forgotPasswordStepCodeEl = document.getElementById("forgot-password-step-code");
  const forgotPasswordStepResetEl = document.getElementById("forgot-password-step-reset");
  const forgotPasswordEmailDisplayEl = document.getElementById("forgot-password-email-display");
  const forgotPasswordLinkEl = document.getElementById("forgot-password-link");

  // Proxies to access module-scoped variables from script.js
  let tournamentContext = null;
  let sessionId = null;
   
  function getTournamentContext() {
    return window.getTournamentContext ? window.getTournamentContext() : null;
  }
   
  function getSessionIdValue() {
    return window.getSessionId ? window.getSessionId() : null;
  }
   
  function setTournamentContextValue(value) {
    tournamentContext = value;
    if (window.setTournamentContext) window.setTournamentContext(value);
  }
   
  function setSessionIdValue(value) {
    sessionId = value;
    if (window.setSessionId) window.setSessionId(value);
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

  function apiUrl(action) {
    const base = typeof apiBase === "string" && apiBase ? apiBase : (document.body?.dataset?.apiBase || "api.php");
    return `${base}?action=${encodeURIComponent(action)}`;
  }

  function buildTournamentUrl(tournamentId) {
    const baseHome = typeof publicHome === "string" && publicHome ? publicHome : (document.body?.dataset?.publicHome || "./");
    const url = new URL(baseHome, location.href);
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
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
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
    
    // Hide tournament account bar
    const tournamentAccountBar = document.getElementById("tournament-account-bar");
    if (tournamentAccountBar) {
      tournamentAccountBar.classList.add("hidden");
    }
    
    // Hide back button in hero section
    const heroBackBtn = document.getElementById("hero-back-btn");
    if (heroBackBtn) {
      heroBackBtn.classList.add("hidden");
    }
  }

  function showTournamentShell() {
    if (authShell) authShell.classList.add("hidden");
    if (appShell) appShell.classList.remove("hidden");
    
    // Show tournament account bar
    const tournamentAccountBar = document.getElementById("tournament-account-bar");
    const tournamentAccountEmail = document.getElementById("tournament-account-email");
    const tournamentAdminPageLink = document.getElementById("tournament-admin-page-link");
    const tournamentLogoutBtn = document.getElementById("tournament-logout-btn");
    
    const authState = getAuthState();
    if (tournamentAccountBar) {
      tournamentAccountBar.classList.toggle("hidden", !authState.isLoggedIn);
    }
    if (tournamentAccountEmail) {
      tournamentAccountEmail.textContent = authState.currentUserEmail || "";
    }
    if (tournamentAdminPageLink) {
      tournamentAdminPageLink.classList.toggle("hidden", !authState.isSuperuser);
    }
    if (tournamentLogoutBtn) {
      tournamentLogoutBtn.addEventListener("click", logoutAdmin);
    }
    
    // Show back button in hero section
    const heroBackBtn = document.getElementById("hero-back-btn");
    if (heroBackBtn) {
      heroBackBtn.classList.remove("hidden");
      if (!heroBackBtn.hasListener) {
        heroBackBtn.addEventListener("click", () => {
          window.location.href = "./";
        });
        heroBackBtn.hasListener = true;
      }
    }
  }

  function activateLiveTab(tabName) {
    document.querySelectorAll(".live-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    document.querySelectorAll(".live-tab-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.id !== `tab-${tabName}`);
    });
  }

  function initLiveTabs() {
    document.querySelectorAll(".live-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activateLiveTab(btn.dataset.tab);
      });
    });

    const modeBtn2W = document.getElementById("mode-waiting-btn2");
    const modeBtn2G = document.getElementById("mode-games-btn2");
    if (modeBtn2W && typeof window.setDispatchMode === "function") {
      modeBtn2W.addEventListener("click", () => window.setDispatchMode("waiting"));
    }
    if (modeBtn2G && typeof window.setDispatchMode === "function") {
      modeBtn2G.addEventListener("click", () => window.setDispatchMode("games"));
    }

    const copySessionBtn = document.getElementById("copy-session-btn");
    if (copySessionBtn && typeof getShareUrl === "function") {
      copySessionBtn.addEventListener("click", () => {
        const url = getShareUrl();
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          copySessionBtn.textContent = "✓ Copied!";
          setTimeout(() => { copySessionBtn.textContent = "📋 Copy link"; }, 2000);
        });
      });
    }

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

    const shareButtons = {
      native: document.getElementById("share-native-btn"),
      email: document.getElementById("share-email-btn"),
      whatsapp: document.getElementById("share-whatsapp-btn"),
      facebook: document.getElementById("share-facebook-btn"),
    };
    if (shareButtons.native && typeof getShareUrl === "function") {
      shareButtons.native.addEventListener("click", async () => {
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
    }
    if (shareButtons.email && typeof getShareUrl === "function") {
      shareButtons.email.addEventListener("click", () => {
        const shareUrl = getShareUrl();
        if (!shareUrl) return;
        const title = document.getElementById("active-tournament-name")?.textContent || "Pool tournament";
        const subject = encodeURIComponent(`Pool tournament link: ${title}`);
        const body = encodeURIComponent(`Open this pool tournament:\n\n${shareUrl}`);
        location.href = `mailto:?subject=${subject}&body=${body}`;
      });
    }
    if (shareButtons.whatsapp && typeof getShareUrl === "function") {
      shareButtons.whatsapp.addEventListener("click", () => {
        const shareUrl = getShareUrl();
        if (!shareUrl) return;
        const text = encodeURIComponent(`Open this pool tournament: ${shareUrl}`);
        window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
      });
    }
    if (shareButtons.facebook && typeof getShareUrl === "function") {
      shareButtons.facebook.addEventListener("click", () => {
        const shareUrl = getShareUrl();
        if (!shareUrl) return;
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank", "noopener");
      });
    }

    const shareForm = document.getElementById("share-tournament-form");
    if (shareForm) {
      shareForm.addEventListener("submit", (event) => {
        void sendTournamentInvites(event);
      });
    }

    const joinBtn = document.getElementById("join-tournament-btn");
    if (joinBtn) {
      joinBtn.addEventListener("click", () => {
        void joinCurrentTournament(false);
      });
    }

    const shareJoinLinkBtn = document.getElementById("share-join-link-btn");
    if (shareJoinLinkBtn) {
      shareJoinLinkBtn.addEventListener("click", () => {
        const joinUrl = tournamentContext?.joinUrl || (typeof getJoinShareUrl === "function" ? getJoinShareUrl() : "");
        const messageEl = document.getElementById("share-tournament-message");
        if (!joinUrl) return;
        navigator.clipboard.writeText(joinUrl).then(() => {
          setStatusMessage(messageEl, "Join link copied.", "success");
        });
      });
    }

    const newTournBtn = document.getElementById("new-tournament-btn");
    if (newTournBtn) {
      newTournBtn.addEventListener("click", () => {
        if (!confirm("Start a new tournament? This will clear all current data.")) return;
        location.href = location.pathname;
      });
    }
  }

  async function maybeAutoJoinTournament() {
    if (typeof hasJoinIntent !== "function" || !hasJoinIntent() || joinIntentHandled || !tournamentContext || !getAuthState().isLoggedIn) return;
    joinIntentHandled = true;
    if (!tournamentContext.canJoin || tournamentContext.hasJoined) {
      if (typeof clearJoinIntent === "function") {
        clearJoinIntent();
      }
      renderTournamentContext();
      return;
    }
    await joinCurrentTournament(true);
  }

  async function joinCurrentTournament(isAutomatic = false) {
    const joinMessage = document.getElementById("join-tournament-message");
    if (!sessionId) return;

    if (!getAuthState().isLoggedIn) {
      location.href = (typeof getJoinShareUrl === "function" ? getJoinShareUrl() : "") || buildTournamentJoinUrl(sessionId);
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
      if (typeof clearJoinIntent === "function") {
        clearJoinIntent();
      }
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

    // Gate admin workflow sections for non-owners
    // Only hide for non-owners; don't affect visibility for owners (other code manages that)
    if (!isOwner) {
      if (typeof sectionSettings !== 'undefined' && sectionSettings) {
        sectionSettings.classList.add("hidden");
      }
      if (typeof sectionNames !== 'undefined' && sectionNames) {
        sectionNames.classList.add("hidden");
      }
      if (typeof generateDrawBtn !== 'undefined' && generateDrawBtn) {
        generateDrawBtn.classList.add("hidden");
      }
    } else {
      // Owner: make sure admin sections are visible
      if (typeof sectionSettings !== 'undefined' && sectionSettings) {
        sectionSettings.classList.remove("hidden");
      }
      if (typeof sectionNames !== 'undefined' && sectionNames) {
        sectionNames.classList.remove("hidden");
      }
      if (typeof generateDrawBtn !== 'undefined' && generateDrawBtn) {
        generateDrawBtn.classList.remove("hidden");
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
    if (getAuthState().isLoggedIn) {
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

  async function refreshTournamentContext() {
    const currentSessionId = getSessionIdValue();
    if (!currentSessionId || location.protocol === "file:") return;
    try {
      const response = await fetch(syncApiUrl("tournament-context"), { cache: "no-store" });
      const payload = await response.json();
      if (!payload || !payload.ok || !payload.tournament) {
        return;
      }
      setTournamentContextValue(payload.tournament);
      renderTournamentContext();
      await maybeAutoJoinTournament();
    } catch (_) {
    }
  }
 
  window.poolPortalAuthState = window.poolPortalAuthState || {
    isLoggedIn: false,
    currentUserEmail: "",
    displayName: "",
    isSuperuser: false,
    siteSettings: { allowInvites: true },
  };

  if (typeof window.undoLastResult !== "function" && typeof undoLastResult !== "function") {
    window.undoLastResult = function () {};
  }

  if (typeof window.initLiveTabs !== "function" && typeof initLiveTabs !== "function") {
    window.initLiveTabs = function () {};
  }

  let authMode = "signup";
  let activeDashboardView = "my-tournaments";
  let forgotPasswordStep = "email";
  let storedForgotPasswordEmail = "";
  let storedForgotPasswordToken = "";

  function setAuthState(isLoggedIn, currentUserEmail = "", isSuperuser = false, displayName = "") {
    window.poolPortalAuthState.isLoggedIn = Boolean(isLoggedIn);
    window.poolPortalAuthState.currentUserEmail = currentUserEmail || "";
    window.poolPortalAuthState.isSuperuser = Boolean(isSuperuser);
    window.poolPortalAuthState.displayName = displayName || "";
  }

  function getAuthState() {
    return window.poolPortalAuthState || { isLoggedIn: false, currentUserEmail: "" };
  }

  function setPortalDashboardView(view) {
    const validViews = new Set(["my-account", "my-tournaments", "find-tournament", "create-tournament"]);
    const requestedView = validViews.has(view) ? view : "my-tournaments";
    const authState = getAuthState();

    const panels = {
      "my-account": portalPanelMyAccountEl,
      "my-tournaments": portalPanelMyTournamentsEl,
      "find-tournament": portalPanelFindTournamentEl,
      "create-tournament": portalPanelCreateTournamentEl,
    };
    const buttons = {
      "my-account": portalActionMyAccountBtnEl,
      "my-tournaments": portalActionMyTournamentsBtnEl,
      "find-tournament": portalActionFindTournamentBtnEl,
      "create-tournament": portalActionCreateTournamentBtnEl,
    };

    if (!authState.isLoggedIn) {
      if (portalQuickActionsEl) portalQuickActionsEl.classList.add("hidden");
      Object.entries(panels).forEach(([key, panel]) => {
        if (!panel) return;
        panel.classList.toggle("hidden", key !== "find-tournament");
      });
      Object.values(buttons).forEach((button) => button?.classList.remove("portal-action-btn-active"));
      return;
    }

    activeDashboardView = requestedView;
    if (portalQuickActionsEl) portalQuickActionsEl.classList.remove("hidden");
    Object.entries(panels).forEach(([key, panel]) => {
      if (!panel) return;
      panel.classList.toggle("hidden", key !== activeDashboardView);
    });
    Object.entries(buttons).forEach(([key, button]) => {
      if (!button) return;
      button.classList.toggle("portal-action-btn-active", key === activeDashboardView);
    });

    if (activeDashboardView === "create-tournament" && tournamentNameInputEl) {
      tournamentNameInputEl.focus();
    }
    if (activeDashboardView === "find-tournament") {
      applyTournamentSearchFilter();
    }
  }

  function getInviteRecipientEmail() {
    const params = new URLSearchParams(window.location.search);
    const candidates = [
      params.get("email"),
      params.get("recipientEmail"),
      params.get("recipient"),
      params.get("to"),
      params.get("inviteEmail"),
    ];

    for (const candidate of candidates) {
      const normalized = (candidate || "").trim().toLowerCase();
      if (normalized && /\S+@\S+\.\S+/.test(normalized)) {
        return normalized;
      }
    }
    return "";
  }

  async function resolveInviteEmailFromToken() {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = (params.get("invite") || params.get("token") || "").trim();
    if (!inviteToken) {
      return "";
    }

    try {
      const response = await fetch(`${apiUrl("resolve-invite")}&invite=${encodeURIComponent(inviteToken)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!payload || !payload.ok) {
        return "";
      }
      const resolvedEmail = (payload.email || "").trim().toLowerCase();
      return resolvedEmail && /\S+@\S+\.\S+/.test(resolvedEmail) ? resolvedEmail : "";
    } catch (_) {
      return "";
    }
  }

  async function applyInviteEmailPrefill() {
    const emailInput = document.getElementById("admin-email");
    if (!emailInput || emailInput.value) {
      return;
    }

    const inviteEmail = getInviteRecipientEmail() || await resolveInviteEmailFromToken();
    if (!inviteEmail) {
      return;
    }
    emailInput.value = inviteEmail;
  }

  function syncAuthModeUi() {
    const inviteEmail = getInviteRecipientEmail() || document.getElementById("admin-email")?.value || "";
    if (authCardTitleEl) {
      authCardTitleEl.textContent = authMode === "signup" ? "Create your free account" : "Log in to your account";
    }
    if (authCardDescriptionEl) {
      authCardDescriptionEl.textContent = inviteEmail
        ? (authMode === "signup"
          ? `We filled your invite email below. Create an account or log in to continue.`
          : `We filled your invite email below. Log in to continue.`)
        : (authMode === "signup"
          ? "Register with your email address and password to create and manage your own tournaments."
          : "Log in with your email address and password to open and manage your tournaments.");
    }
    if (authSubmitBtnEl) {
      authSubmitBtnEl.textContent = authMode === "signup" ? "Sign up" : "Log in";
    }
    if (authToggleBtnEl) {
      authToggleBtnEl.textContent = authMode === "signup"
        ? "Already have an account? Log in"
        : "Need an account? Sign up";
    }
  }

  function checkAuthState() {
    const authState = getAuthState();
    if (!adminDashboardEl) return authState.isLoggedIn;
  
    if (loginCardEl) loginCardEl.classList.toggle("hidden", authState.isLoggedIn);
    adminDashboardEl.classList.remove("hidden");
    if (accountPanelEl) {
      accountPanelEl.classList.toggle("hidden", !authState.isLoggedIn);
    }
    if (accountDisplayNameInputEl) {
      accountDisplayNameInputEl.value = authState.displayName || "";
    }
    if (accountEmailReadOnlyEl) {
      accountEmailReadOnlyEl.value = authState.currentUserEmail || "";
    }
    if (dashboardTitleEl) {
      dashboardTitleEl.textContent = authState.isLoggedIn ? "Tournament Home" : "Open or create a tournament";
    }
    if (dashboardDescriptionEl) {
      dashboardDescriptionEl.textContent = authState.isLoggedIn
        ? `Choose an action below.${authState.currentUserEmail ? ` Signed in as ${authState.currentUserEmail}.` : ""}`
        : "Sign up free to create tournaments, or open a shared tournament with its 5-character code.";
    }
    if (adminRouteHintEl) adminRouteHintEl.classList.add("hidden");
    if (createTournamentFormEl) createTournamentFormEl.classList.toggle("hidden", !authState.isLoggedIn);
    if (dashboardTabsEl) dashboardTabsEl.classList.toggle("hidden", !(portalMode === "admin" && authState.isLoggedIn));
    if (toggleTournamentsBtnEl) toggleTournamentsBtnEl.classList.toggle("admin-dashboard-tab-active", portalMode === "admin" && authState.isLoggedIn);
    if (tournamentsPanelEl) tournamentsPanelEl.classList.remove("hidden");
    if (logoutBtnEl) logoutBtnEl.classList.toggle("hidden", !authState.isLoggedIn);
    if (accountBarEl) accountBarEl.classList.toggle("hidden", !authState.isLoggedIn);
    if (accountEmailEl) accountEmailEl.textContent = authState.currentUserEmail || "";
    if (adminPageLinkEl) {
      adminPageLinkEl.classList.toggle("hidden", !authState.isSuperuser || portalMode === "admin");
    }
    if (adminSettingsPanelEl) {
      adminSettingsPanelEl.classList.toggle("hidden", !(portalMode === "admin" && authState.isSuperuser));
    }
    if (allowInvitesToggleEl) {
      allowInvitesToggleEl.checked = getSiteSettings().allowInvites !== false;
    }
    setPortalDashboardView(activeDashboardView);
    return authState.isLoggedIn;
  }
 
  function getSiteSettings() {
    return window.poolPortalAuthState?.siteSettings || { allowInvites: true };
  }
 
  function setSiteSettings(settings = {}) {
    window.poolPortalAuthState.siteSettings = {
      allowInvites: true,
      ...settings,
    };
  }
 
  function syncAdminSettingsUi() {
    if (allowInvitesToggleEl) {
      allowInvitesToggleEl.checked = getSiteSettings().allowInvites !== false;
    }
    if (adminSettingsPanelEl) {
      adminSettingsPanelEl.classList.toggle("hidden", !(portalMode === "admin" && getAuthState().isSuperuser));
    }
    if (adminPageLinkEl) {
      adminPageLinkEl.classList.toggle("hidden", !getAuthState().isSuperuser || portalMode === "admin");
    }
  }
 
  async function refreshSiteSettings() {
    try {
      const response = await fetch(apiUrl("site-settings"), { cache: "no-store" });
      const payload = await response.json();
      if (payload && payload.ok && payload.settings) {
        setSiteSettings(payload.settings);
      } else {
        setSiteSettings({ allowInvites: true });
      }
    } catch (_) {
      setSiteSettings({ allowInvites: true });
    }
    syncAdminSettingsUi();
    if (typeof renderTournamentContext === "function") {
      renderTournamentContext();
    }
    return getSiteSettings();
  }
 
  async function refreshAuthState() {
    try {
      const response = await fetch(apiUrl("auth-status"), { cache: "no-store" });
      const payload = await response.json();
      setAuthState(
        Boolean(payload && payload.ok && payload.isLoggedIn),
        payload && payload.ok ? String(payload.userEmail || "") : "",
        payload && payload.ok ? Boolean(payload.isSuperuser) : false,
        payload && payload.ok ? String(payload.displayName || "") : ""
      );
    } catch (_) {
      setAuthState(localStorage.getItem("adminAuth") === "1", "", false, "");
    }

    if (getAuthState().isLoggedIn) {
      localStorage.setItem("adminAuth", "1");
    } else {
      localStorage.removeItem("adminAuth");
    }
    return getAuthState().isLoggedIn;
  }

  function tournamentVisibilityText(tournament) {
    if (!Object.prototype.hasOwnProperty.call(tournament, "isPublic")) {
      return "";
    }
    if (!tournament.isPublic) {
      return " · Private";
    }
    if (tournament.publicExpiresAt) {
      return ` · Public until ${escapeHtml(formatDateTime(tournament.publicExpiresAt))}`;
    }
    return " · Public";
  }

  function tournamentCountdownMarkup(tournament) {
    if (!tournament.musterAt) {
      return "";
    }

    const targetTime = Date.parse(tournament.musterAt);
    if (Number.isNaN(targetTime)) {
      return "";
    }

    const diffMs = targetTime - Date.now();
    if (diffMs <= 0) {
      return "";
    }

    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const parts = [];

    if (days > 0) {
      parts.push(`${days}d`);
    }
    if (hours > 0 || parts.length > 0) {
      parts.push(`${hours}h`);
    }
    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes}m`);
    }

    return `<div class="tournament-meta tournament-countdown">Starts in ${escapeHtml(parts.join(" "))}</div>`;
  }

  function renderTournamentSection(title, tournaments, type) {
    const authState = getAuthState();
    if (!Array.isArray(tournaments) || tournaments.length === 0) {
      const emptyTitle = type === "mine"
        ? "No tournaments yet"
        : type === "invited"
          ? "No invited tournaments yet"
          : "No public tournaments yet";
      const emptyText = type === "mine"
        ? "Create your first tournament to get started."
        : type === "invited"
          ? "Invitations will appear here once an owner shares a tournament with you."
          : "Sign up to create a tournament, or open one with its 5-character code.";
      return `
        <section class="tournament-section">
          <h4 class="tournament-section-title">${escapeHtml(title)}</h4>
          <article class="tournament-item">
            <h4>${emptyTitle}</h4>
            <div class="tournament-meta">${emptyText}</div>
          </article>
        </section>
      `;
    }

    return `
      <section class="tournament-section">
        <h4 class="tournament-section-title">${escapeHtml(title)}</h4>
        ${tournaments.map((tournament) => {
          const accessCode = tournament.accessCode
            ? `<div class="tournament-meta">Code: <strong>${escapeHtml(tournament.accessCode)}</strong>${tournament.hidden ? " · Hidden" : ""}${tournamentVisibilityText(tournament)}</div>`
            : "";
          const location = tournament.location ? `<div class="tournament-meta">Club: ${escapeHtml(tournament.location)}</div>` : "";
          const muster = tournament.musterAt ? `<div class="tournament-meta">Muster: ${escapeHtml(formatDateTime(tournament.musterAt))}</div>` : "";
          const countdown = tournamentCountdownMarkup(tournament);
          const joined = tournament.joinCount ? `<div class="tournament-meta small">${tournament.joinCount} joined</div>` : "";
          const updatedAt = tournament.updatedAt
            ? `<div class="tournament-meta small">Updated ${escapeHtml(formatDateTime(tournament.updatedAt))}</div>`
            : "";
          
          let statusBadge = "";
          if (type === "mine") {
            statusBadge = `<div class="tournament-status-badge created">Created by you</div>`;
          } else if (type === "invited") {
            statusBadge = `<div class="tournament-status-badge invited">Invited</div>`;
          } else if (type === "public") {
            statusBadge = `<div class="tournament-status-badge joined">Joined</div>`;
          }
          
          const visibilityAction = type === "mine"
            ? `<button type="button" class="btn-ghost tournament-action-btn" data-action="toggle-hidden" data-id="${escapeHtml(tournament.id)}" data-hidden="${tournament.hidden ? "1" : "0"}">${tournament.hidden ? "Show" : "Hide"}</button>`
            : "";
          const deleteAction = type === "mine"
            ? `<button type="button" class="btn-ghost tournament-action-btn tournament-delete-list-btn" data-action="delete" data-id="${escapeHtml(tournament.id)}" data-hidden="${tournament.hidden ? "1" : "0"}">Delete</button>`
            : "";
          const joinAction = type === "public" || type === "invited"
            ? (
                tournament.isOwner
                  ? ""
                  : tournament.joined
                  ? `<button type="button" class="btn-secondary tournament-action-btn" data-action="remove" data-id="${escapeHtml(tournament.id)}">Remove me</button>`
                  : tournament.canJoin
                    ? authState.isLoggedIn
                      ? `<button type="button" class="btn-secondary tournament-action-btn" data-action="join" data-id="${escapeHtml(tournament.id)}">Add me</button>`
                      : `<button type="button" class="btn-secondary tournament-action-btn" data-action="open-join" data-id="${escapeHtml(tournament.id)}">Log in to join</button>`
                    : `<button type="button" class="btn-secondary tournament-action-btn" disabled>Joining closed</button>`
              )
            : "";

          return `
            <article class="tournament-item">
              <h4>${escapeHtml(tournament.name)}</h4>
              ${statusBadge}
              ${accessCode}
              ${location}
              ${muster}
              ${countdown}
              ${joined}
              ${updatedAt}
              <div class="admin-actions" style="margin-top:0.75rem;">
                <button type="button" class="btn-secondary tournament-action-btn" data-action="open" data-id="${escapeHtml(tournament.id)}">Open</button>
                ${joinAction}
                ${visibilityAction}
                ${deleteAction}
              </div>
            </article>
          `;
        }).join("")}
      </section>
    `;
  }

  function renderTournamentList(sections) {
    if (!tournamentListEl) return;
    tournamentListEl.innerHTML = sections.map((section) => renderTournamentSection(section.title, section.tournaments, section.type)).join("");
    applyTournamentSearchFilter();
  }

  function applyTournamentSearchFilter() {
    if (!tournamentListEl) return;
    const query = (tournamentSearchInputEl?.value || "").trim().toLowerCase();
    const items = Array.from(tournamentListEl.querySelectorAll(".tournament-item"));
    let visibleCount = 0;

    items.forEach((item) => {
      const text = (item.textContent || "").toLowerCase();
      const shouldShow = query === "" || text.includes(query);
      item.classList.toggle("hidden", !shouldShow);
      if (shouldShow) visibleCount += 1;
    });

    tournamentListEl.querySelectorAll(".tournament-section").forEach((section) => {
      const hasVisibleItems = Array.from(section.querySelectorAll(".tournament-item")).some((item) => !item.classList.contains("hidden"));
      section.classList.toggle("hidden", !hasVisibleItems);
    });

    if (tournamentSearchEmptyEl) {
      tournamentSearchEmptyEl.classList.toggle("hidden", query === "" || visibleCount > 0);
    }
  }

  function getRequestedTournamentId() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("id") || params.get("tournamentId") || "").trim();
  }

  async function fetchTournamentScope(scope) {
    const requestedTournamentId = getRequestedTournamentId();
    const query = new URLSearchParams({ scope });
    if (requestedTournamentId) {
      query.set("id", requestedTournamentId);
    }
    const response = await fetch(`${apiUrl("list-tournaments")}&${query.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload || !payload.ok) {
      throw new Error(payload && payload.error ? payload.error : "Could not load tournaments.");
    }
    return payload.tournaments || [];
  }

  async function loadAccountTournaments() {
    if (!accountTournamentsListEl) return;
    if (!getAuthState().isLoggedIn) {
      accountTournamentsListEl.innerHTML = "";
      return;
    }

    accountTournamentsListEl.innerHTML = `
      <article class="tournament-item">
        <div class="tournament-meta">Loading your tournaments...</div>
      </article>
    `;

    try {
      const [mine, invited] = await Promise.all([
        fetchTournamentScope("mine"),
        fetchTournamentScope("invited"),
      ]);
      let publicTournaments = [];
      try {
        publicTournaments = await fetchTournamentScope("public");
      } catch (_) {
        publicTournaments = [];
      }

      const invitedIds = new Set(invited.map((item) => item.id));
      const joinedPublic = publicTournaments.filter((item) => item.joined && !item.isOwner && !invitedIds.has(item.id));
      accountTournamentsListEl.innerHTML = [
        renderTournamentSection("My tournaments", mine, "mine"),
        renderTournamentSection("Invited tournaments", invited, "invited"),
        renderTournamentSection("Joined tournaments", joinedPublic, "public"),
      ].join("");
    } catch (error) {
      accountTournamentsListEl.innerHTML = `
        <article class="tournament-item">
          <h4>Could not load your tournaments</h4>
          <div class="tournament-meta">${escapeHtml(error.message || "Unknown error.")}</div>
        </article>
      `;
    }
  }

  async function loadTournamentList() {
    if (!tournamentListEl) return;
    
    tournamentListEl.innerHTML = `
      <article class="tournament-item">
        <div class="tournament-meta">Loading tournaments...</div>
      </article>
    `;

    try {
      const authState = getAuthState();
      const sections = [];
      if (authState.isLoggedIn) {
        sections.push({
          title: "My Tournament",
          tournaments: await fetchTournamentScope("mine"),
          type: "mine",
        });
        sections.push({
          title: "Invited tournaments",
          tournaments: await fetchTournamentScope("invited"),
          type: "invited",
        });
      }
      renderTournamentList(sections);
    } catch (error) {
      tournamentListEl.innerHTML = `
        <article class="tournament-item">
          <h4>Could not load tournaments</h4>
          <div class="tournament-meta">${escapeHtml(error.message || "Unknown error.")}</div>
        </article>
      `;
    }
  }

  async function submitAccountProfile(event) {
    event.preventDefault();
    if (!getAuthState().isLoggedIn) {
      setStatusMessage(accountProfileMessageEl, "Log in to update your account.", "error");
      return;
    }

    const payload = {};
    const currentDisplayName = accountDisplayNameInputEl?.value?.trim() ?? "";
    if (currentDisplayName || getAuthState().displayName) {
      payload.displayName = currentDisplayName;
    }
    const currentPassword = accountCurrentPasswordInputEl?.value ?? "";
    const newPassword = accountNewPasswordInputEl?.value ?? "";
    const confirmPassword = accountConfirmPasswordInputEl?.value ?? "";

    if (currentPassword || newPassword || confirmPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
      payload.confirmPassword = confirmPassword;
    }

    try {
      const response = await apiPost(apiUrl("account-profile"), payload);
      const result = await response.json();
      if (!result || !result.ok) {
        throw new Error(result && result.error ? result.error : "Could not update your account.");
      }

      const profile = result.profile || {};
      setAuthState(true, String(getAuthState().currentUserEmail || profile.email || ""), getAuthState().isSuperuser, String(profile.displayName || ""));
      checkAuthState();
      if (accountCurrentPasswordInputEl) accountCurrentPasswordInputEl.value = "";
      if (accountNewPasswordInputEl) accountNewPasswordInputEl.value = "";
      if (accountConfirmPasswordInputEl) accountConfirmPasswordInputEl.value = "";
      await loadAccountTournaments();
      setStatusMessage(accountProfileMessageEl, result.message || "Account updated.", "success");
    } catch (error) {
      setStatusMessage(accountProfileMessageEl, error.message || "Could not update your account.", "error");
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    const email = document.getElementById("admin-email")?.value || "";
    const password = document.getElementById("admin-password")?.value || "";
    const messageEl = document.getElementById("auth-message");

    if (!email || !password) {
      setStatusMessage(messageEl, "Please enter your email address and password.", "error");
      return;
    }

    try {
      const response = await apiPost(apiUrl(authMode === "signup" ? "signup" : "login"), { email, password });
      const result = await response.json();

      if (!result || !result.ok) {
        setStatusMessage(messageEl, (result && result.error) || "Could not sign you in.", "error");
        return;
      }

      setAuthState(true, String(result.userEmail || email), Boolean(result.isSuperuser), String(result.displayName || ""));
      localStorage.setItem("adminAuth", "1");
      setStatusMessage(messageEl, authMode === "signup" ? "Account created." : "Logged in.", "success");

      if (getOrCreateSessionId()) {
        location.reload();
        return;
      }

      checkAuthState();
      await loadTournamentList();
      await loadAccountTournaments();
    } catch (err) {
      setStatusMessage(messageEl, `${authMode === "signup" ? "Sign-up" : "Login"} error: ${err.message}`, "error");
    }
  }

  async function logoutAdmin() {
    try {
      await fetch(apiUrl("logout"), { cache: "no-store" });
    } catch (_) {
    }
    setAuthState(false, "", false, "");
    localStorage.removeItem("adminAuth");
    checkAuthState();
    await loadTournamentList();
    await loadAccountTournaments();
  }
 
  async function saveAllowInvitesSetting(event) {
    event.preventDefault();
    if (!getAuthState().isSuperuser) {
      setStatusMessage(adminSettingsMessageEl, "Only the superuser can change this setting.", "error");
      return;
    }
 
    try {
      const response = await apiPost(apiUrl("update-site-setting"), { settingKey: "allow_invites", value: Boolean(allowInvitesToggleEl?.checked) });
      const payload = await response.json();
      if (!payload || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Could not update the invite setting.");
      }
      await refreshSiteSettings();
      setStatusMessage(adminSettingsMessageEl, "Invite sharing is now " + (getSiteSettings().allowInvites !== false ? "enabled" : "disabled") + ".", "success");
    } catch (error) {
      setStatusMessage(adminSettingsMessageEl, error.message || "Could not update the invite setting.", "error");
    }
  }
 
  async function createTournament(event) {
    event.preventDefault();
    const name = tournamentNameInputEl ? tournamentNameInputEl.value.trim() : "";

    setStatusMessage(adminMessageEl, "Creating tournament...");
    try {
      const response = await apiPost(apiUrl("create-tournament"), { name });
      const payload = await response.json();
      if (!payload || !payload.ok || !payload.tournament || !payload.tournament.id) {
        throw new Error(payload && payload.error ? payload.error : "Could not create tournament.");
      }
      location.href = buildTournamentUrl(payload.tournament.id);
    } catch (error) {
      setStatusMessage(adminMessageEl, error.message || "Could not create tournament.", "error");
    }
  }

  async function openTournamentByCode(event) {
    event.preventDefault();
    if (!openByCodeInputEl) return;

    const accessCode = openByCodeInputEl.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(accessCode)) {
      setStatusMessage(openByCodeMessageEl, "Enter a 5-character tournament code.", "error");
      return;
    }

    setStatusMessage(openByCodeMessageEl, "Opening tournament...");
    try {
      const response = await apiPost(apiUrl("resolve-tournament-code"), { accessCode });
      const payload = await response.json();
      if (!payload || !payload.ok || !payload.tournament || !payload.tournament.id) {
        throw new Error(payload && payload.error ? payload.error : "Could not open tournament.");
      }
      location.href = buildTournamentUrl(payload.tournament.id);
    } catch (error) {
      setStatusMessage(openByCodeMessageEl, error.message || "Could not open tournament.", "error");
    }
  }

  async function handleTournamentListClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const tournamentId = button.dataset.id || "";
    if (!tournamentId) return;

    if (button.dataset.action === "open") {
      location.href = buildTournamentUrl(tournamentId);
      return;
    }

    if (button.dataset.action === "open-join") {
      location.href = buildTournamentJoinUrl(tournamentId);
      return;
    }

    if (button.dataset.action === "join") {
      try {
        const response = await apiPost(`${apiUrl("join-tournament")}&id=${encodeURIComponent(tournamentId)}`, {});
        const payload = await response.json();
        if (!payload || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Could not add you to this tournament.");
        }
        setStatusMessage(adminMessageEl, payload.message || "You have been added to this tournament.", "success");
        await loadTournamentList();
      } catch (error) {
        setStatusMessage(adminMessageEl, error.message || "Could not add you to this tournament.", "error");
      }
      return;
    }

    if (button.dataset.action === "remove") {
      try {
        const response = await apiPost(`${apiUrl("remove-tournament-member")}&id=${encodeURIComponent(tournamentId)}`, {});
        const payload = await response.json();
        if (!payload || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Could not remove you from this tournament.");
        }
        setStatusMessage(adminMessageEl, payload.message || "You have been removed from this tournament.", "success");
        await loadTournamentList();
      } catch (error) {
        setStatusMessage(adminMessageEl, error.message || "Could not remove you from this tournament.", "error");
      }
      return;
    }

    if (button.dataset.action === "toggle-hidden") {
      const shouldHide = button.dataset.hidden !== "1";
      try {
        const response = await apiPost(apiUrl("set-tournament-hidden"), { tournamentId, hidden: shouldHide });
        const payload = await response.json();
        if (!payload || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Could not update tournament visibility.");
        }
        await loadTournamentList();
      } catch (error) {
        setStatusMessage(adminMessageEl, error.message || "Could not update tournament visibility.", "error");
      }
      return;
    }

    if (button.dataset.action === "delete") {
      if (!confirm("Delete this tournament? This cannot be undone.")) return;
      try {
        if (button.dataset.hidden !== "1") {
          const hideResponse = await apiPost(apiUrl("set-tournament-hidden"), { tournamentId, hidden: true });
          const hidePayload = await hideResponse.json();
          if (!hidePayload || !hidePayload.ok) {
            throw new Error(hidePayload && hidePayload.error ? hidePayload.error : "Could not hide tournament before delete.");
          }
        }

        const response = await apiPost(apiUrl("set-tournament-deleted"), { tournamentId });
        const payload = await response.json();
        if (!payload || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Could not delete tournament.");
        }
        setStatusMessage(adminMessageEl, "Tournament deleted.", "success");
        await loadTournamentList();
      } catch (error) {
        setStatusMessage(adminMessageEl, error.message || "Could not delete tournament.", "error");
      }
    }
  }

  function toggleAuthMode() {
    authMode = authMode === "signup" ? "login" : "signup";
    syncAuthModeUi();
    setStatusMessage(document.getElementById("auth-message"), "");
  }

  function showForgotPasswordCard() {
    if (loginCardEl) loginCardEl.classList.add("hidden");
    if (forgotPasswordCardEl) forgotPasswordCardEl.classList.remove("hidden");
    setStatusMessage(forgotPasswordMessageEl, "");
    if (forgotPasswordEmailInputEl) forgotPasswordEmailInputEl.focus();
  }

  function hideForgotPasswordCard() {
    if (loginCardEl) loginCardEl.classList.remove("hidden");
    if (forgotPasswordCardEl) forgotPasswordCardEl.classList.add("hidden");
    setStatusMessage(forgotPasswordMessageEl, "");
    if (forgotPasswordFormEl) forgotPasswordFormEl.reset();
    forgotPasswordStep = "email";
    showForgotPasswordStep("email");
  }

  function showForgotPasswordStep(step) {
    forgotPasswordStep = step;
    if (forgotPasswordStepEmailEl) {
      forgotPasswordStepEmailEl.classList.toggle("hidden", step !== "email");
    }
    if (forgotPasswordStepCodeEl) {
      forgotPasswordStepCodeEl.classList.toggle("hidden", step !== "code");
    }
    if (forgotPasswordStepResetEl) {
      forgotPasswordStepResetEl.classList.toggle("hidden", step !== "reset");
    }
    if (step === "code" && forgotPasswordCodeInputEl) {
      forgotPasswordCodeInputEl.focus();
    }
    if (step === "reset" && forgotPasswordNewPasswordInputEl) {
      forgotPasswordNewPasswordInputEl.focus();
    }
  }

  async function handleForgotPasswordSubmit(event) {
    event.preventDefault();

    if (forgotPasswordStep === "email") {
      await submitForgotPasswordEmail();
    } else if (forgotPasswordStep === "code") {
      await submitForgotPasswordCode();
    } else if (forgotPasswordStep === "reset") {
      await submitForgotPasswordReset();
    }
  }

  async function submitForgotPasswordEmail() {
    const email = forgotPasswordEmailInputEl?.value || "";
    
    if (!email) {
      setStatusMessage(forgotPasswordMessageEl, "Please enter your email address.", "error");
      return;
    }

    setStatusMessage(forgotPasswordMessageEl, "Sending reset code...");
    try {
      const response = await apiPost(apiUrl("forgot-password-send-code"), { email });
      const payload = await response.json();

      if (!payload || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Could not send reset code.");
      }

      if (forgotPasswordEmailDisplayEl) {
        forgotPasswordEmailDisplayEl.textContent = escapeHtml(email);
      }
      storedForgotPasswordEmail = email;
      setStatusMessage(forgotPasswordMessageEl, payload.message || "We have sent an email with a 6-digit code to your email address.", "success");
      setTimeout(() => {
        showForgotPasswordStep("code");
        setStatusMessage(forgotPasswordMessageEl, "");
      }, 1500);
    } catch (error) {
      setStatusMessage(forgotPasswordMessageEl, error.message || "Could not send reset code.", "error");
    }
  }

  async function submitForgotPasswordCode() {
    const code = forgotPasswordCodeInputEl?.value || "";

    if (!code || !/^\d{6}$/.test(code)) {
      setStatusMessage(forgotPasswordMessageEl, "Please enter a valid 6-digit code.", "error");
      return;
    }

    setStatusMessage(forgotPasswordMessageEl, "Verifying code...");
    try {
      const response = await apiPost(apiUrl("forgot-password-verify-code"), { email: storedForgotPasswordEmail, code });
      const payload = await response.json();

      if (!payload || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Invalid or expired code.");
      }

      storedForgotPasswordToken = payload.token || "";
      setStatusMessage(forgotPasswordMessageEl, "Code verified successfully.", "success");
      setTimeout(() => {
        showForgotPasswordStep("reset");
        setStatusMessage(forgotPasswordMessageEl, "");
      }, 1000);
    } catch (error) {
      setStatusMessage(forgotPasswordMessageEl, error.message || "Invalid or expired code.", "error");
    }
  }

  async function submitForgotPasswordReset() {
    const newPassword = forgotPasswordNewPasswordInputEl?.value || "";
    const confirmPassword = forgotPasswordConfirmPasswordInputEl?.value || "";

    if (!newPassword || newPassword.length < 6) {
      setStatusMessage(forgotPasswordMessageEl, "Password must be at least 6 characters long.", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusMessage(forgotPasswordMessageEl, "Passwords do not match.", "error");
      return;
    }

    setStatusMessage(forgotPasswordMessageEl, "Resetting password...");
    try {
      const response = await apiPost(apiUrl("forgot-password-reset"), {
        email: storedForgotPasswordEmail,
        token: storedForgotPasswordToken,
        newPassword,
      });
      const payload = await response.json();

      if (!payload || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Could not reset password.");
      }

      setStatusMessage(forgotPasswordMessageEl, "Password reset successfully. Logging you in...", "success");
      setTimeout(() => {
        hideForgotPasswordCard();
        if (document.getElementById("admin-email")) {
          document.getElementById("admin-email").value = storedForgotPasswordEmail;
        }
        if (document.getElementById("admin-password")) {
          document.getElementById("admin-password").value = newPassword;
        }
        authMode = "login";
        syncAuthModeUi();
        setStatusMessage(document.getElementById("auth-message"), "");
      }, 2000);
    } catch (error) {
      setStatusMessage(forgotPasswordMessageEl, error.message || "Could not reset password.", "error");
    }
  }

  async function initPortal() {
    document.getElementById("admin-login-form")?.addEventListener("submit", submitAuth);
    authToggleBtnEl?.addEventListener("click", toggleAuthMode);
    logoutBtnEl?.addEventListener("click", logoutAdmin);
    topLogoutBtnEl?.addEventListener("click", logoutAdmin);
    portalLogoutBtnEl?.addEventListener("click", logoutAdmin);
    createTournamentFormEl?.addEventListener("submit", createTournament);
    openByCodeFormEl?.addEventListener("submit", openTournamentByCode);
    tournamentSearchInputEl?.addEventListener("input", applyTournamentSearchFilter);
    tournamentListEl?.addEventListener("click", handleTournamentListClick);
    accountTournamentsListEl?.addEventListener("click", handleTournamentListClick);
    accountProfileFormEl?.addEventListener("submit", submitAccountProfile);
    adminSettingsFormEl?.addEventListener("submit", saveAllowInvitesSetting);
    portalActionMyAccountBtnEl?.addEventListener("click", () => setPortalDashboardView("my-account"));
    portalActionMyTournamentsBtnEl?.addEventListener("click", () => setPortalDashboardView("my-tournaments"));
    portalActionFindTournamentBtnEl?.addEventListener("click", () => setPortalDashboardView("find-tournament"));
    portalActionCreateTournamentBtnEl?.addEventListener("click", () => setPortalDashboardView("create-tournament"));
    portalActionHelpBtnEl?.addEventListener("click", () => {
      location.href = "./help/";
    });
    
    forgotPasswordLinkEl?.addEventListener("click", (e) => {
      e.preventDefault();
      showForgotPasswordCard();
    });
    document.getElementById("forgot-password-back-to-login")?.addEventListener("click", (e) => {
      e.preventDefault();
      hideForgotPasswordCard();
    });
    document.getElementById("forgot-password-back-to-email")?.addEventListener("click", (e) => {
      e.preventDefault();
      showForgotPasswordStep("email");
      if (forgotPasswordCodeInputEl) forgotPasswordCodeInputEl.value = "";
      setStatusMessage(forgotPasswordMessageEl, "");
    });
    forgotPasswordFormEl?.addEventListener("submit", handleForgotPasswordSubmit);

    if (typeof undoLastResult === "function") {
      document.getElementById("undo-last-result-btn")?.addEventListener("click", undoLastResult);
    }

    initLiveTabs();
    await applyInviteEmailPrefill();
    syncAuthModeUi();

    document.getElementById("teams-position-sort-toggle")?.addEventListener("click", () => {
      teamsSortMode = "position";
      if (live) renderTeamTimeStats();
    });
    document.getElementById("teams-sort-toggle")?.addEventListener("click", () => {
      teamsSortMode = "number";
      if (live) renderTeamTimeStats();
    });

    await refreshAuthState();
    await refreshSiteSettings();
    checkAuthState();

    if (getOrCreateSessionId()) {
      if (hasJoinIntent() && !getAuthState().isLoggedIn) {
        showLandingShell();
        checkAuthState();
        await loadTournamentList();
        await loadAccountTournaments();
        return;
      }
      showTournamentShell();
      setSessionIdValue(getOrCreateSessionId());
      await refreshTournamentContext();
      initRemoteSync();
      // Initialize to step 1 if no state is loaded (will be overridden by applySerializedState if state does load)
      setTimeout(() => {
        if (typeof window.PoolSchedulerDrawInit === 'function') {
          window.PoolSchedulerDrawInit();
        }
      }, 500);
      return;
    }

    showLandingShell();
    checkAuthState();
    await loadTournamentList();
    await loadAccountTournaments();
    initRemoteSync();
  }

  void initPortal();
})();
