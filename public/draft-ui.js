/**
 * LoL Draft UI — case + pool (style drafting.gg).
 */
(function (global) {
  const win = global;
  const STORAGE_KEY = "lol-draft-sessions-v1";
  const SLOT_ICONS = { Top: "▣", Jungle: "🔥", Mid: "⚡", Bot: "◎", Support: "✚" };

  let coach = null;
  let saveTimer = null;

  function saveSessionsDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSessions, 120);
  }

  function flushSaveSessions() {
    clearTimeout(saveTimer);
    saveSessions();
  }

  function loadSessions() {
    try {
      if (global.LoLUserSession) {
        const draft = global.LoLUserSession.getDraft();
        return {
          sessions: Array.isArray(draft.sessions) ? draft.sessions : [],
          activeId: draft.activeId || null,
        };
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { sessions: [], activeId: null };
      const parsed = JSON.parse(raw);
      return {
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        activeId: parsed.activeId || null,
      };
    } catch {
      return { sessions: [], activeId: null };
    }
  }

  function saveSessions() {
    if (!coach?.state) return;
    coach.state.draftSessions.forEach((s) => window.LoLDraft.normalizeSession(s));
    const payload = {
      sessions: coach.state.draftSessions.map((s) => {
        const { hoverPick: _hover, ...rest } = s;
        return rest;
      }),
      activeId: coach.state.activeDraftId,
    };
    if (global.LoLUserSession) {
      global.LoLUserSession.setDraft(payload);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function getActiveSession() {
    return coach.state.draftSessions.find((s) => s.id === coach.state.activeDraftId) || null;
  }

  function draftMetaMap() {
    return coach.state.tacticsMeta?.champions || {};
  }

  function ensureDraftElements() {
    if (!coach?.els) return false;
    coach.els.draftSessionBar = coach.els.draftSessionBar || document.getElementById("draft-session-bar");
    coach.els.draftBoard = coach.els.draftBoard || document.getElementById("draft-board");
    coach.els.draftPool = coach.els.draftPool || document.getElementById("draft-pool");
    coach.els.draftFlash = coach.els.draftFlash || document.getElementById("draft-flash");
    return Boolean(coach.els.draftSessionBar && coach.els.draftBoard && coach.els.draftPool);
  }

  function ensureSessions() {
    if (!coach?.state) return;
    if (!coach.state.draftSessions.length) {
      const s = window.LoLDraft.createSession("Game 1");
      coach.state.draftSessions = [s];
      coach.state.activeDraftId = s.id;
    } else if (!getActiveSession()) {
      coach.state.activeDraftId = coach.state.draftSessions[0].id;
    }
    try {
      saveSessions();
    } catch (err) {
      console.warn("Draft session save failed", err);
    }
  }

  function allSessions() {
    return coach.state.draftSessions;
  }

  function oppositeSide(side) {
    return side === "blue" ? "red" : "blue";
  }

  /** Fearless series: alternate blue/red each new game. */
  function ourSideForNextGame(prev) {
    if (!prev) return "blue";
    if (prev.fearless) return oppositeSide(prev.ourSide);
    return prev.ourSide;
  }

  function deleteActiveSession() {
    const sessions = coach.state.draftSessions;
    if (sessions.length <= 1) return false;
    const activeId = coach.state.activeDraftId;
    const idx = sessions.findIndex((s) => s.id === activeId);
    if (idx < 0) return false;
    const removed = sessions[idx];
    if (!confirm(`Supprimer ${removed.name} ? Cette action est irréversible.`)) return false;
    sessions.splice(idx, 1);
    const next = sessions[Math.min(idx, sessions.length - 1)];
    coach.state.activeDraftId = next.id;
    return true;
  }

  function renderAll() {
    if (!ensureDraftElements()) return;
    const session = getActiveSession();
    if (session && !session.focus && !window.LoLDraft.isComplete(session)) {
      window.LoLDraft.suggestNextFocus(session);
    }
    try {
      renderSessionBar();
    } catch (err) {
      console.error("Draft session bar render failed", err);
    }
    try {
      renderBoard();
    } catch (err) {
      console.error("Draft board render failed", err);
    }
    try {
      renderPool();
    } catch (err) {
      console.error("Draft pool render failed", err);
    }
  }

  function showDraftError(msg) {
    showDraftFlash(msg, "error");
  }

  function setFocus(session, focus) {
    session.focus = focus;
    window.LoLDraft.syncLegacySlots(session);
    saveSessionsDebounced();
  }

  function syncBoardFocus(session) {
    const el = coach.els.draftBoard;
    if (!el?.querySelector(".draft-cell")) {
      renderBoard();
      return;
    }

    el.querySelectorAll(".draft-cell-focused").forEach((c) => c.classList.remove("draft-cell-focused"));
    el.querySelectorAll(".draft-cell-hover").forEach((c) => c.classList.remove("draft-cell-hover"));
    el.querySelectorAll(".draft-cell-swap-target").forEach((c) => c.classList.remove("draft-cell-swap-target"));

    el.querySelectorAll(".draft-cell[data-focus-type]").forEach((cell) => {
      const type = cell.dataset.focusType;
      const side = cell.dataset.side;
      const banIndex = type === "ban" ? parseInt(cell.dataset.banIndex, 10) : null;
      const slot = cell.dataset.slot || null;
      if (isCellFocused(session, type, side, banIndex, slot)) {
        cell.classList.add("draft-cell-focused");
      } else if (isCellHovered(session, type, side, slot)) {
        cell.classList.add("draft-cell-hover");
      }
      if (type === "pick" && isSwapTarget(session, side, slot)) {
        cell.classList.add("draft-cell-swap-target");
      }
    });

    const turnBox = el.querySelector(".draft-turn-box");
    if (turnBox) {
      const spans = turnBox.querySelectorAll("span");
      const focusHint = window.LoLDraft.actionLabel(session, coach.state.byName, draftMetaMap());
      const hintSpan = spans[spans.length - 1];
      if (hintSpan && focusHint) hintSpan.textContent = focusHint;
    }
  }

  function syncPoolFocus(session) {
    const el = coach.els.draftPool;
    if (!el) return;
    const actionText = window.LoLDraft.actionLabel(session, coach.state.byName, draftMetaMap());
    const actionEl = el.querySelector(".draft-pool-action");
    if (actionEl) {
      actionEl.textContent = actionText || "";
      actionEl.classList.toggle("focus-ready", Boolean(session.focus));
    }
  }

  function afterFocusChange(session) {
    window.LoLDraft.invalidateRecommendationCache();
    syncBoardFocus(session);
    syncDraftCoachUI(session);
  }

  /** Pool sort + coach chips — always synchronous (no idle callback). */
  function syncDraftCoachUI(session) {
    const el = coach.els.draftPool || document.getElementById("draft-pool");
    if (!el || !session) return;
    coach.els.draftPool = el;
    syncPoolFocus(session);
    refreshSuggestChips(session);
    if (el.querySelector(".draft-pool-grid")) {
      const { filtered, role, sortSlot } = getPoolFiltered(session);
      updatePoolGrid(el, filtered, role, sortSlot, { preserveScroll: true });
    }
  }

  /** Active lane for suggestions / pool sort (pick, swap, or hover). */
  function draftRecommendTarget(session) {
    const f = session.focus;
    if ((f?.type === "pick" || f?.type === "swap") && f.slot) {
      return { type: "pick", side: f.side, slot: f.slot };
    }
    if (session.hoverPick?.slot) {
      return { type: "pick", side: session.hoverPick.side, slot: session.hoverPick.slot, hover: true };
    }
    return null;
  }

  /** Sort/highlight slot: focused lane, then hover, else role chip. */
  function poolSortSlot(session) {
    const target = draftRecommendTarget(session);
    const chipRole = coach.state.draftPoolRole || "all";
    return target?.slot || (chipRole !== "all" ? chipRole : null);
  }

  function isCellHovered(session, type, side, slot) {
    if (session.focus?.type === "pick" && session.focus.slot) return false;
    const h = session.hoverPick;
    if (!h || type !== "pick" || !slot) return false;
    return h.side === side && h.slot === slot;
  }

  function setHoverPick(session, side, slot) {
    const prev = session.hoverPick;
    if (prev?.side === side && prev?.slot === slot) return;
    session.hoverPick = slot ? { side, slot } : null;
    afterFocusChange(session);
  }

  function isCellFocused(session, type, side, banIndex, slot) {
    const f = session.focus;
    if (!f || f.side !== side) return false;
    if (f.type === "swap" && type === "pick") return f.slot === slot;
    if (f.type !== type) return false;
    if (type === "ban") return f.banIndex === banIndex;
    if (f.slot) return f.slot === slot;
    const comp = window.LoLDraft.pickBySlot(session, side);
    return !comp[slot];
  }

  function isSwapTarget(session, side, slot) {
    const f = session.focus;
    if (f?.type !== "swap" || f.side !== side || f.slot === slot) return false;
    const comp = window.LoLDraft.pickBySlot(session, side);
    return Boolean(comp[f.slot] || comp[slot]);
  }

  function showDraftFlash(msg, kind = "success") {
    const el = coach.els.draftFlash;
    if (!el) return;
    el.classList.remove("error", "success", "warn");
    el.classList.add("visible", kind);
    el.textContent = msg;
    const delay = kind === "error" ? 2800 : kind === "warn" ? 2400 : 1800;
    setTimeout(() => el.classList.remove("visible", "error", "success", "warn"), delay);
  }

  function handlePickCellClick(session, side, slot) {
    const comp = window.LoLDraft.pickBySlot(session, side);
    const focus = session.focus;

    if (focus?.type === "swap" && focus.side === side) {
      if (focus.slot === slot) {
        session.focus = null;
      } else {
        const result = window.LoLDraft.swapPickSlots(session, side, focus.slot, slot);
        if (!result.ok) showDraftFlash(result.error, "error");
        else showDraftFlash(result.message, "success");
        session.focus = null;
      }
      saveSessionsDebounced();
      afterFocusChange(session);
      return;
    }

    if (comp[slot]) {
      session.hoverPick = null;
      session.focus = { type: "swap", side, slot };
      saveSessionsDebounced();
      afterFocusChange(session);
      return;
    }

    session.hoverPick = null;
    session.focus = { type: "pick", side, slot };
    window.LoLDraft.syncLegacySlots(session);
    saveSessionsDebounced();
    afterFocusChange(session);
  }

  function setFocusFromCell(session, cell) {
    const type = cell.dataset.focusType;
    const side = cell.dataset.side;
    if (type === "ban") {
      setFocus(session, { type: "ban", side, banIndex: parseInt(cell.dataset.banIndex, 10) });
      afterFocusChange(session);
      return;
    }
    handlePickCellClick(session, side, cell.dataset.slot);
  }

  function restoreFocusAfterAction(session, payload, result) {
    if (result.inOrder) {
      window.LoLDraft.suggestNextFocus(session);
      return;
    }
    if (payload.type === "ban" && payload.banIndex != null) {
      session.focus = { type: "ban", side: payload.side, banIndex: payload.banIndex };
      return;
    }
    if (payload.type === "pick" && payload.slot) {
      session.focus = { type: "pick", side: payload.side, slot: payload.slot };
      return;
    }
    window.LoLDraft.suggestNextFocus(session);
  }

  function draftCtx() {
    return {
      byName: coach.state.byName,
      metaMap: coach.state.tacticsMeta?.champions || {},
    };
  }

  function recordChampionAction(payload) {
    const session = getActiveSession();
    if (!session || window.LoLDraft.isComplete(session)) return false;
    const result = window.LoLDraft.recordAction(session, payload, allSessions(), draftCtx());
    if (!result.ok) {
      showDraftError(result.error);
      return false;
    }
    if (payload.type === "pick" && result.slot) {
      const note = result.inOrder ? "" : " (hors séquence)";
      const champ = coach.state.byName.get(payload.name);
      const metaMap = draftMetaMap();
      const offMeta =
        payload.slot &&
        result.slot === payload.slot &&
        window.LoLDraft.playsSlotFor &&
        champ &&
        !window.LoLDraft.playsSlotFor(champ, metaMap, payload.slot);
      const flexNote = offMeta ? " · flex hors meta" : "";
      showDraftFlash(
        `${payload.name} → ${result.slot}${note}${flexNote}`,
        offMeta ? "warn" : result.inOrder ? "success" : "warn"
      );
    }
    restoreFocusAfterAction(session, payload, result);
    flushSaveSessions();
    window.LoLDraft.invalidateRecommendationCache();
    renderSessionBar();
    renderBoard();
    syncDraftCoachUI(session);
    return true;
  }

  function pickChampion(name) {
    const session = getActiveSession();
    if (!session || window.LoLDraft.isComplete(session)) return;

    const step = window.LoLDraft.getStep(session);
    if (step?.type === "pick") {
      const side = session.focus?.type === "pick" ? session.focus.side : step.side;
      const slot = session.focus?.type === "pick" ? session.focus.slot : null;
      session.focus = slot ? { type: "pick", side, slot } : { type: "pick", side };
    } else if (!session.focus) {
      window.LoLDraft.suggestNextFocus(session);
    }

    const focus = session.focus;
    if (!focus) {
      showDraftError("Sélectionne une case ban ou une lane, puis le champion.");
      return;
    }
    if (focus.type === "swap") {
      showDraftError("Mode swap actif — clique un autre poste pour échanger.");
      return;
    }

    recordChampionAction({
      type: focus.type,
      side: focus.side,
      name,
      slot: focus.type === "pick" ? focus.slot || null : null,
      banIndex: focus.type === "ban" ? focus.banIndex : null,
    });
  }

  function renderSessionBar() {
    const el = coach.els.draftSessionBar || document.getElementById("draft-session-bar");
    if (!el) return;
    coach.els.draftSessionBar = el;
    const session = getActiveSession();
    if (session) window.LoLDraft.normalizeSession(session);
    const canEdit = session && window.LoLDraft.canEditFormat(session);
    const total = session ? window.LoLDraft.totalSteps(session) : 16;
    const sessionCount = coach.state.draftSessions.length;
    const canDelete = sessionCount > 1;
    const options = coach.state.draftSessions
      .map(
        (s) =>
          `<option value="${coach.escapeHtml(s.id)}"${s.id === coach.state.activeDraftId ? " selected" : ""}>${coach.escapeHtml(s.name)}</option>`
      )
      .join("");

    el.innerHTML = `
      <div class="draft-session-controls">
        <select id="draft-session-select" class="draft-select-compact" aria-label="Choisir la partie">${options}</select>
        <button type="button" class="btn-secondary btn-sm" id="draft-new-game">+ Nouvelle</button>
        <button type="button" class="btn-secondary btn-sm" id="draft-rename-game" title="Renommer">✎</button>
        <button type="button" class="btn-secondary btn-sm draft-delete-game${canDelete ? "" : " is-disabled"}" id="draft-delete-game" title="${canDelete ? "Supprimer cette partie" : "Au moins une partie doit rester"}"${canDelete ? "" : " disabled"}>🗑</button>
      </div>
      <div class="draft-side-toggle">
        <span class="draft-side-label">Nous sommes</span>
        <button type="button" class="side-chip${session?.ourSide === "blue" ? " active" : ""}" data-side="blue"${canEdit ? "" : " disabled"}>Bleu</button>
        <button type="button" class="side-chip side-red${session?.ourSide === "red" ? " active" : ""}" data-side="red"${canEdit ? "" : " disabled"}>Rouge</button>
      </div>
      <div class="draft-format-options">
        <label class="draft-option-check" title="Picks des games précédentes indisponibles · nouvelle partie = côté adverse">
          <input type="checkbox" id="draft-fearless"${session?.fearless ? " checked" : ""}${canEdit ? "" : " disabled"} />
          <span>Fearless</span>
        </label>
        <span class="draft-format-hint">Ranked SR · 5 bans · 2 phases</span>
      </div>
      <div class="draft-progress-wrap">
        <div class="draft-step-label">${coach.escapeHtml(window.LoLDraft.stepLabel(session || { stepIndex: total, bansPerTeam: 5 }))}</div>
        <div class="draft-progress"><div class="draft-progress-fill" style="width:${Math.round(((session?.stepIndex || 0) / total) * 100)}%"></div></div>
        ${session ? `<div class="draft-format-badge">${coach.escapeHtml(window.LoLDraft.formatSummary(session))}</div>` : ""}
      </div>
      <div class="draft-bar-actions">
        <button type="button" class="btn-secondary btn-sm" id="draft-undo" title="Annuler">↩ Annuler</button>
        <button type="button" class="btn-secondary btn-sm" id="draft-reset">Réinitialiser</button>
        ${
          window.LoLDraft.isComplete(session)
            ? `<button type="button" class="btn-primary btn-sm" id="draft-to-tactics">→ Tactiques</button>`
            : ""
        }
      </div>
    `;

    el.querySelector("#draft-session-select")?.addEventListener("change", (e) => {
      coach.state.activeDraftId = e.target.value;
      saveSessions();
      renderAll();
    });
    el.querySelector("#draft-new-game")?.addEventListener("click", () => {
      const n = coach.state.draftSessions.length + 1;
      const prev = coach.state.draftSessions[coach.state.draftSessions.length - 1];
      const nextSide = ourSideForNextGame(prev);
      const s = window.LoLDraft.createSession(`Game ${n}`, nextSide, {
        fearless: prev?.fearless ?? false,
      });
      coach.state.draftSessions.push(s);
      coach.state.activeDraftId = s.id;
      saveSessions();
      renderAll();
    });
    el.querySelector("#draft-delete-game")?.addEventListener("click", () => {
      if (!deleteActiveSession()) return;
      ensureSessions();
      saveSessions();
      renderAll();
    });
    el.querySelector("#draft-rename-game")?.addEventListener("click", () => {
      const s = getActiveSession();
      if (!s) return;
      const name = prompt("Nom de la partie :", s.name);
      if (name?.trim()) {
        s.name = name.trim();
        saveSessions();
        renderSessionBar();
      }
    });
    el.querySelector("#draft-undo")?.addEventListener("click", () => {
      const s = getActiveSession();
      if (s && window.LoLDraft.undo(s)) {
        window.LoLDraft.suggestNextFocus(s);
        saveSessions();
        renderAll();
      }
    });
    el.querySelector("#draft-reset")?.addEventListener("click", () => {
      const s = getActiveSession();
      if (s && confirm(`Réinitialiser ${s.name} ?`)) {
        window.LoLDraft.resetSession(s);
        s.focus = null;
        window.LoLDraft.suggestNextFocus(s);
        saveSessions();
        renderAll();
      }
    });
    el.querySelector("#draft-to-tactics")?.addEventListener("click", exportToTactics);
    el.querySelectorAll(".side-chip:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = getActiveSession();
        if (!s || !window.LoLDraft.canEditFormat(s)) return;
        s.ourSide = btn.dataset.side;
        saveSessions();
        renderAll();
      });
    });
    el.querySelector("#draft-fearless")?.addEventListener("change", (e) => {
      const s = getActiveSession();
      if (!s || !window.LoLDraft.canEditFormat(s)) return;
      s.fearless = e.target.checked;
      saveSessions();
      renderAll();
    });
  }

  function renderBanCell(side, session, banIndex, phaseLabel) {
    const bans = session.bans[side];
    const name = bans[banIndex] || null;
    const champ = name ? coach.state.byName.get(name) : null;
    const focused = isCellFocused(session, "ban", side, banIndex, null);
    return `
      <button type="button"
        class="draft-cell draft-ban-cell${name ? " filled" : " empty"}${focused ? " draft-cell-focused" : ""}"
        data-focus-type="ban" data-side="${side}" data-ban-index="${banIndex}"
        aria-label="Ban ${phaseLabel} ${banIndex + 1}${name ? ` : ${name}` : ""}">
        <span class="draft-cell-tag">B${banIndex + 1}</span>
        ${
          champ
            ? coach.championIconHtml(champ, { size: "ban" })
            : `<span class="draft-cell-plus">+</span>`
        }
        <span class="draft-cell-name">${name ? coach.escapeHtml(champ?.name || name) : ""}</span>
      </button>`;
  }

  function renderBanRow(side, session) {
    const p1 = window.LoLDraft.BAN_PHASE1_COUNT;
    const phase1 = Array.from({ length: p1 }, (_, i) => renderBanCell(side, session, i, "phase 1")).join("");
    const phase2 = Array.from({ length: window.LoLDraft.BAN_PHASE2_COUNT }, (_, i) =>
      renderBanCell(side, session, p1 + i, "phase 2")
    ).join("");
    return `
      <div class="draft-ban-phases">
        <div class="draft-ban-phase">
          <span class="draft-ban-phase-label">Phase 1</span>
          <div class="draft-ban-phase-cells">${phase1}</div>
        </div>
        <div class="draft-ban-phase">
          <span class="draft-ban-phase-label">Phase 2</span>
          <div class="draft-ban-phase-cells">${phase2}</div>
        </div>
      </div>`;
  }

  function renderTeamColorBar(side, session) {
    const names = window.LoLDraft.sidePicks(session, side).map((p) => p.name);
    if (!names.length) return "";
    if (coach.mtgTeamPanelHtml) {
      return coach.mtgTeamPanelHtml(names, `Couleur MTG · ${side === "blue" ? "Bleu" : "Rouge"}`);
    }
    const summary = window.LoLDraft.teamColorSummary(names, coach.state.byName, coach.state.tacticsMeta?.champions || {});
    const bars = summary.bars
      .map(
        (b) =>
          `<span class="draft-color-seg draft-color-seg--${b.code.toLowerCase()}" style="flex:${Math.max(0.08, b.value)}" title="${b.label}"></span>`
      )
      .join("");
    return `
      <div class="draft-color-bar" aria-label="Identité couleur ${summary.identity}">
        <div class="draft-color-track">${bars}</div>
        <span class="draft-color-id">${summary.identity}</span>
      </div>`;
  }

  function renderTeamColumn(side, session, label) {
    const isOurs = side === window.LoLDraft.ourSide(session);
    const comp = window.LoLDraft.pickBySlot(session, side);
    const step = window.LoLDraft.getStep(session);
    const sideActive = step?.side === side;

    const slots = window.LoLDraft.SLOTS.map((slot) => {
      const name = comp[slot];
      const champ = name ? coach.state.byName.get(name) : null;
      const pickMeta = name ? window.LoLDraft.pickAtSlot(session, side, slot) : null;
      const focused = isCellFocused(session, "pick", side, null, slot);
      const swapTarget = isSwapTarget(session, side, slot);

      return `
        <button type="button"
          class="draft-cell draft-pick-cell${name ? " filled" : " empty"}${focused ? " draft-cell-focused" : ""}${swapTarget ? " draft-cell-swap-target" : ""}"
          data-focus-type="pick" data-side="${side}" data-slot="${slot}"
          aria-label="Pick ${slot}${name ? ` : ${name}` : ""}">
          <span class="draft-cell-tag">${SLOT_ICONS[slot]} ${slot}${pickMeta?.order ? ` · P${pickMeta.order}` : ""}</span>
          ${
            champ
              ? coach.championIconHtml(champ, { size: "draft" })
              : `<span class="draft-cell-plus">+</span>`
          }
          <span class="draft-cell-name">${name ? coach.escapeHtml(champ?.name || name) : ""}</span>
        </button>`;
    }).join("");

    return `
      <div class="draft-team ${side}${isOurs ? " our-team" : " enemy-team"}${sideActive ? " side-active" : ""}">
        <div class="draft-team-header">
          <span class="draft-team-badge draft-badge-${side}">${side === "blue" ? "Bleu" : "Rouge"}</span>
          <h3>${coach.escapeHtml(label)}</h3>
          ${sideActive ? '<span class="draft-turn-pulse">Au tour</span>' : ""}
        </div>
        <div class="draft-section-label">Bans · 2 phases</div>
        <div class="draft-bans-row">${renderBanRow(side, session)}</div>
        ${renderTeamColorBar(side, session)}
        <div class="draft-section-label">Picks · ordre d'équipe (P1→P5) · glisser-déposer OK</div>
        <div class="draft-slots-grid">${slots}</div>
      </div>`;
  }

  function clearCellAction(cell) {
    const session = getActiveSession();
    if (!session) return;
    const type = cell.dataset.focusType;
    const side = cell.dataset.side;
    const payload = {
      type,
      side,
      slot: type === "pick" ? cell.dataset.slot : null,
      banIndex: type === "ban" ? parseInt(cell.dataset.banIndex, 10) : null,
    };
    const result = window.LoLDraft.clearSlot(session, payload, allSessions(), draftCtx());
    if (!result.ok) {
      showDraftFlash(result.error, "error");
      return;
    }
    session.focus =
      type === "ban"
        ? { type: "ban", side, banIndex: payload.banIndex }
        : { type: "pick", side, slot: payload.slot };
    showDraftFlash(`${result.cleared} retiré`, "success");
    flushSaveSessions();
    renderAll();
  }

  function bindBoardEvents(container) {
    if (container.dataset.bound === "1") return;
    container.dataset.bound = "1";
    container.addEventListener("click", (e) => {
      const cell = e.target.closest(".draft-cell[data-focus-type]");
      if (!cell || !container.contains(cell)) return;
      const session = getActiveSession();
      if (!session) return;
      setFocusFromCell(session, cell);
    });
    container.addEventListener("contextmenu", (e) => {
      const cell = e.target.closest(".draft-cell.filled[data-focus-type]");
      if (!cell || !container.contains(cell)) return;
      e.preventDefault();
      clearCellAction(cell);
    });
    container.addEventListener("mouseenter", (e) => {
      const cell = e.target.closest(".draft-cell[data-focus-type='pick']");
      if (!cell || !container.contains(cell)) return;
      const session = getActiveSession();
      if (!session) return;
      setHoverPick(session, cell.dataset.side, cell.dataset.slot);
    }, true);
    container.addEventListener("mouseleave", (e) => {
      if (!container.contains(e.relatedTarget)) {
        const session = getActiveSession();
        if (session?.hoverPick) setHoverPick(session, null, null);
      }
    });
    bindBoardDragDrop(container);
  }

  function bindBoardDragDrop(container) {
    let dragChamp = null;

    container.addEventListener("dragover", (e) => {
      const cell = e.target.closest(".draft-cell[data-focus-type]");
      if (!cell || !container.contains(cell) || !dragChamp) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      container.querySelectorAll(".draft-cell-drop-target").forEach((el) => el.classList.remove("draft-cell-drop-target"));
      cell.classList.add("draft-cell-drop-target");
    });

    container.addEventListener("dragleave", (e) => {
      const cell = e.target.closest(".draft-cell[data-focus-type]");
      if (cell) cell.classList.remove("draft-cell-drop-target");
    });

    container.addEventListener("drop", (e) => {
      const cell = e.target.closest(".draft-cell[data-focus-type]");
      container.querySelectorAll(".draft-cell-drop-target").forEach((el) => el.classList.remove("draft-cell-drop-target"));
      const name = e.dataTransfer.getData("text/champion") || dragChamp;
      if (!cell || !name) return;
      e.preventDefault();
      const session = getActiveSession();
      if (!session) return;
      setFocusFromCell(session, cell);
      recordChampionAction({
        type: cell.dataset.focusType,
        side: cell.dataset.side,
        name,
        slot: cell.dataset.focusType === "pick" ? cell.dataset.slot : null,
        banIndex: cell.dataset.focusType === "ban" ? parseInt(cell.dataset.banIndex, 10) : null,
      });
      dragChamp = null;
    });

    document.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".draft-pool-card, .draft-suggest-chip");
      if (!card) return;
      dragChamp = card.dataset.champ;
      e.dataTransfer.setData("text/champion", dragChamp);
      e.dataTransfer.effectAllowed = "copy";
    });
  }

  function bindPoolEvents(container) {
    if (container.dataset.poolBound === "1") return;
    container.dataset.poolBound = "1";
    container.addEventListener("click", (e) => {
      const roleChip = e.target.closest(".pool-role-chip");
      if (roleChip && container.contains(roleChip)) {
        coach.state.draftPoolRole = roleChip.dataset.poolRole || "all";
        coach.persistUserSession?.();
        syncDraftCoachUI(getActiveSession());
        return;
      }
      const link = e.target.closest(".alpha-jump-link");
      if (link && container.contains(link)) {
        e.preventDefault();
        const id = link.getAttribute("href")?.slice(1);
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const btn = e.target.closest(".draft-pool-card, .draft-suggest-chip");
      if (btn && container.contains(btn)) pickChampion(btn.dataset.champ);
    });
    container.addEventListener("input", (e) => {
      if (e.target.id !== "draft-pool-search") return;
      coach.state.draftPoolSearch = e.target.value;
      const session = getActiveSession();
      if (session) syncDraftCoachUI(session);
    });
  }

  function renderBoard() {
    const el = coach.els.draftBoard || document.getElementById("draft-board");
    const session = getActiveSession();
    if (!el || !session) return;
    coach.els.draftBoard = el;

    const ourSideId = window.LoLDraft.ourSide(session);
    const enemySideId = window.LoLDraft.enemySide(session);
    const focusHint = window.LoLDraft.actionLabel(session, coach.state.byName, draftMetaMap());

    el.innerHTML = `
      ${renderTeamColumn(ourSideId, session, "Notre équipe")}
      <div class="draft-center-vs">
        <div class="draft-vs-badge">VS</div>
        <div class="draft-turn-box ${window.LoLDraft.isOurTurn(session) ? "our-turn" : "enemy-turn"}">
          ${
            window.LoLDraft.isComplete(session)
              ? "<strong>Terminé</strong><span>Export → Tactiques</span>"
              : `<strong>${window.LoLDraft.isOurTurn(session) ? "Notre tour" : "Tour adversaire"}</strong>`
          }
          <span>${focusHint ? coach.escapeHtml(focusHint) : "1. Case · 2. Champion · clic droit = retirer"}</span>
        </div>
      </div>
      ${renderTeamColumn(enemySideId, session, "Adversaire")}
    `;

    bindBoardEvents(el);
  }

  function renderPoolAlphabetical(champions) {
    const session = getActiveSession();
    return renderPoolGrid(champions, session ? poolSortSlot(session) : coach.state.draftPoolRole || "all");
  }

  function buildSuggestChipsHtml(session) {
    if (window.LoLDraft.isComplete(session)) return "";
    const metaMap = coach.state.tacticsMeta?.champions || {};
    const focusTarget = draftRecommendTarget(session);
    const rec = window.LoLDraft.getRecommendations(
      session,
      coach.state.champions,
      metaMap,
      coach.state.byName,
      allSessions(),
      6,
      null,
      { focusTarget, skipCache: true }
    );
    if (!rec.items?.length) return "";
    const hintText = rec.coachHint || "Top picks calculés · glisser-déposer sur une case";
    const slotKey = focusTarget ? `${focusTarget.side}-${focusTarget.slot}` : "auto";
    return `
      <div class="draft-suggest-wrap" data-suggest-slot="${coach.escapeHtml(slotKey)}">
        <div class="draft-suggest-head">
          <span class="draft-suggest-title">Suggestions coach</span>
          <span class="draft-suggest-hint muted">${coach.escapeHtml(hintText)}</span>
        </div>
        <div class="draft-suggest-row" aria-label="Suggestions coach">
          ${rec.items
            .map(
              (item, i) => `
          <button type="button" class="draft-suggest-chip" draggable="true" data-champ="${coach.escapeHtml(item.champion.name)}" title="${coach.escapeHtml(item.reasons.slice(0, 2).join(" · "))}">
            <span class="draft-suggest-rank">#${i + 1}</span>
            ${coach.championIconHtml(item.champion, { size: "coach" })}
            <span class="draft-suggest-name">${coach.escapeHtml(item.champion.name)}</span>
          </button>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function renderSuggestChips(session) {
    return `<div id="draft-suggest-host" class="draft-suggest-host"></div>`;
  }

  function ensureSuggestHost() {
    const pool = coach.els.draftPool || document.getElementById("draft-pool");
    if (!pool) return null;
    coach.els.draftPool = pool;
    let host = pool.querySelector("#draft-suggest-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "draft-suggest-host";
      host.className = "draft-suggest-host";
      const toolbar = pool.querySelector(".draft-pool-toolbar");
      if (toolbar) pool.insertBefore(host, toolbar);
      else pool.appendChild(host);
    }
    return host;
  }

  function refreshSuggestChips(session) {
    const active = getActiveSession();
    if (!active || active.id !== session.id) return;
    const host = ensureSuggestHost();
    if (!host) return;
    host.innerHTML = buildSuggestChipsHtml(session) || "";
  }

  function getPoolFiltered(session) {
    const PR = window.LoLPoolRoles;
    const searchQuery = coach.state.draftPoolSearch || "";
    const chipRole = coach.state.draftPoolRole || "all";
    const sortSlot = poolSortSlot(session);
    const metaMap = coach.state.tacticsMeta?.champions || draftMetaMap();
    const q = searchQuery.toLowerCase();
    let avail = window.LoLDraft.availableChampions(coach.state.champions, session, allSessions());
    if (PR && chipRole !== "all") {
      avail = PR.filterByRole(avail, chipRole, metaMap);
    }
    if (PR) {
      avail = PR.sortPool(avail, { sortSlot, tierRank: coach.tierRank, metaMap });
    } else {
      avail = [...avail].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }
    let filtered = avail.filter((c) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.nameEn || "").toLowerCase().includes(q);
    });

    const recTarget = draftRecommendTarget(session);
    if (recTarget?.slot && window.LoLDraft?.scorePickForSlot) {
      const laneViable = window.LoLDraft.laneViableForSlot
        ? new Set(window.LoLDraft.laneViableForSlot(filtered, metaMap, recTarget.slot).map((c) => c.name))
        : null;
      const scores = new Map();
      for (const c of filtered) {
        const r = window.LoLDraft.scorePickForSlot(
          c,
          session,
          recTarget.side,
          recTarget.slot,
          coach.state.byName,
          metaMap
        );
        scores.set(c.name, r.score);
      }
      filtered = [...filtered].sort((a, b) => {
        const aV = laneViable ? laneViable.has(a.name) : true;
        const bV = laneViable ? laneViable.has(b.name) : true;
        if (aV !== bV) return aV ? -1 : 1;
        const diff = (scores.get(b.name) || 0) - (scores.get(a.name) || 0);
        if (diff !== 0) return diff;
        return (coach.tierRank(b) - coach.tierRank(a)) || a.name.localeCompare(b.name, "fr");
      });
    }

    return { searchQuery, filtered, role: chipRole, sortSlot };
  }

  function renderPoolGrid(champions, sortSlot) {
    const PR = window.LoLPoolRoles;
    const metaMap = coach.state.tacticsMeta?.champions || draftMetaMap();
    const slot = sortSlot && sortSlot !== "all" ? sortSlot : null;
    return champions
      .map((c) => {
        const laneScore = slot && PR ? PR.laneScore(c, slot, metaMap) : 0;
        const lanePick = slot && laneScore >= 10;
        const flexPick = slot && !lanePick;
        const cardClass = lanePick
          ? " draft-pool-card--lane"
          : flexPick
            ? " draft-pool-card--offlane"
            : "";
        const titleExtra = slot
          ? lanePick
            ? ` · viable ${slot}`
            : ` · flex ${slot} (<10%)`
          : "";
        return `
        <button type="button" class="draft-pool-card${cardClass}" draggable="true" data-champ="${coach.escapeHtml(c.name)}" title="${coach.escapeHtml(c.name)}${titleExtra}">
          ${coach.championIconHtml(c, { size: "pool" })}
          <span class="draft-pool-name">${coach.escapeHtml(c.name)}</span>
          ${c.tierMeta ? `<span class="draft-pool-tier tier-${c.tierMeta.toLowerCase()}">${c.tierMeta}</span>` : ""}
          ${coach.mtgPastillesHtml ? coach.mtgPastillesHtml(c, { variant: "compact" }) : ""}
        </button>`;
      })
      .join("");
  }

  function poolCountLabel(count, role, sortSlot) {
    const PR = window.LoLPoolRoles;
    const filterLabel = PR ? PR.roleFilterLabel(role) : role;
    const sortLabel =
      sortSlot && sortSlot !== role && sortSlot !== "all"
        ? ` · tri ${PR?.SLOT_LABELS?.[sortSlot] || sortSlot}`
        : "";
    return `${count} dispo · ${filterLabel}${sortLabel} · tier`;
  }

  function bindPoolCards(root) {
    bindPoolEvents(root.closest("#draft-pool") || coach.els.draftPool || root);
  }

  function bindPoolAlphaJump(root) {
    /* délégué dans bindPoolEvents */
  }

  function bindPoolSearch(el) {
    /* délégué dans bindPoolEvents */
  }

  function updatePoolGrid(el, filtered, role, sortSlot, { preserveScroll = false } = {}) {
    const countEl = el.querySelector(".draft-pool-count");
    if (countEl) countEl.textContent = poolCountLabel(filtered.length, role, sortSlot);
    window.LoLPoolRoles?.syncRoleFilterChips(el, role);

    const gridEl = el.querySelector(".draft-pool-grid");
    if (gridEl) {
      const scrollTop = preserveScroll ? gridEl.scrollTop : 0;
      gridEl.innerHTML = filtered.length
        ? renderPoolGrid(filtered, sortSlot)
        : `<p class="muted draft-pool-empty">Aucun champion disponible${role && role !== "all" ? " pour ce poste" : ""}.</p>`;
      if (preserveScroll) gridEl.scrollTop = scrollTop;
      bindPoolCards(gridEl);
    }
  }

  function renderPool({ gridOnly = false, preserveScroll = false } = {}) {
    const el = coach.els.draftPool || document.getElementById("draft-pool");
    const session = getActiveSession();
    if (!el || !session) return;
    coach.els.draftPool = el;

    const { searchQuery, filtered, role, sortSlot } = getPoolFiltered(session);

    if (gridOnly && el.querySelector(".draft-pool-grid")) {
      syncDraftCoachUI(session);
      return;
    }

    const actionText = window.LoLDraft.actionLabel(session, coach.state.byName, draftMetaMap());
    const hasFocus = Boolean(session.focus);
    const roleFilters = window.LoLPoolRoles?.renderRoleFilterChips(role) || "";

    el.innerHTML = `
      <div class="draft-pool-header">
        <h2 class="draft-pool-title">Champions</h2>
        <span class="draft-pool-count">${poolCountLabel(filtered.length, role, sortSlot)}</span>
      </div>
      <p class="draft-pool-lead muted">Tous les champions restent visibles · case focusée = tri + pick sur ce poste (flex OK) · filtre optionnel · <strong>clic droit</strong> = retirer.</p>
      ${
        actionText
          ? `<div class="draft-pool-action${hasFocus ? " focus-ready" : ""}">${coach.escapeHtml(actionText)}</div>`
          : ""
      }
      ${roleFilters}
      ${renderSuggestChips(session)}
      <div class="draft-pool-toolbar">
        <input type="search" class="draft-pool-search" placeholder="Rechercher…" value="${coach.escapeHtml(searchQuery)}" id="draft-pool-search" />
      </div>
      <div class="draft-pool-grid draft-pool-grid-alpha">
        ${filtered.length ? renderPoolGrid(filtered, sortSlot) : `<p class="muted draft-pool-empty">Aucun champion disponible${role && role !== "all" ? " pour ce poste" : ""}.</p>`}
      </div>
    `;

    bindPoolEvents(el);
    refreshSuggestChips(session);
  }

  function init(LoLCoach) {
    coach = LoLCoach;
    const loaded = loadSessions();
    coach.state.draftSessions = loaded.sessions.map((s) => window.LoLDraft.normalizeSession(s));
    coach.state.activeDraftId = loaded.activeId;
    ensureSessions();
    ensureDraftElements();
    renderAll();
  }

  function exportToTactics() {
    const session = getActiveSession();
    if (!session) return;
    const { ourComp, enemyComp } = window.LoLDraft.toComps(session);
    Object.assign(coach.state.ourComp, ourComp);
    Object.assign(coach.state.enemyComp, enemyComp);
    coach.setView("tactics");
    if (typeof coach.runTacticsAnalysis === "function") coach.runTacticsAnalysis();
  }

  function onViewShow() {
    if (!coach && window.LoLCoach) init(window.LoLCoach);
    ensureDraftElements();
    ensureSessions();
    renderAll();
  }

  win.LoLDraftUI = { init, onViewShow, renderAll };
})(typeof window !== "undefined" ? window : globalThis);
