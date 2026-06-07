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
      sessions: coach.state.draftSessions,
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
    el.querySelectorAll(".draft-cell-swap-target").forEach((c) => c.classList.remove("draft-cell-swap-target"));

    el.querySelectorAll(".draft-cell[data-focus-type]").forEach((cell) => {
      const type = cell.dataset.focusType;
      const side = cell.dataset.side;
      const banIndex = type === "ban" ? parseInt(cell.dataset.banIndex, 10) : null;
      const slot = cell.dataset.slot || null;
      if (isCellFocused(session, type, side, banIndex, slot)) {
        cell.classList.add("draft-cell-focused");
      }
      if (type === "pick" && isSwapTarget(session, side, slot)) {
        cell.classList.add("draft-cell-swap-target");
      }
    });

    const turnBox = el.querySelector(".draft-turn-box");
    if (turnBox) {
      const spans = turnBox.querySelectorAll("span");
      const focusHint = window.LoLDraft.actionLabel(session);
      const hintSpan = spans[spans.length - 1];
      if (hintSpan && focusHint) hintSpan.textContent = focusHint;
    }
  }

  function syncPoolFocus(session) {
    const el = coach.els.draftPool;
    if (!el) return;
    const actionText = window.LoLDraft.actionLabel(session);
    const actionEl = el.querySelector(".draft-pool-action");
    if (actionEl) {
      actionEl.textContent = actionText || "";
      actionEl.classList.toggle("focus-ready", Boolean(session.focus));
    }
  }

  function afterFocusChange(session) {
    syncBoardFocus(session);
    syncPoolFocus(session);
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
    el.classList.remove("error", "success");
    el.classList.add("visible", kind);
    el.textContent = msg;
    setTimeout(() => el.classList.remove("visible", "error", "success"), kind === "error" ? 2800 : 1800);
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
      session.focus = { type: "swap", side, slot };
      saveSessionsDebounced();
      afterFocusChange(session);
      return;
    }

    session.focus = { type: "pick", side };
    saveSessionsDebounced();
    afterFocusChange(session);
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
      showDraftFlash(`${payload.name} → ${result.slot}`, "success");
    }
    window.LoLDraft.suggestNextFocus(session);
    flushSaveSessions();
    renderAll();
    return true;
  }

  function pickChampion(name) {
    const session = getActiveSession();
    if (!session || window.LoLDraft.isComplete(session)) return;

    const step = window.LoLDraft.getStep(session);
    if (step?.type === "pick") {
      const side = session.focus?.type === "pick" ? session.focus.side : step.side;
      session.focus = { type: "pick", side };
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
      </div>
      <div class="draft-side-toggle">
        <span class="draft-side-label">Nous sommes</span>
        <button type="button" class="side-chip${session?.ourSide === "blue" ? " active" : ""}" data-side="blue"${canEdit ? "" : " disabled"}>Bleu</button>
        <button type="button" class="side-chip side-red${session?.ourSide === "red" ? " active" : ""}" data-side="red"${canEdit ? "" : " disabled"}>Rouge</button>
      </div>
      <div class="draft-format-options">
        <label class="draft-option-check" title="Picks des games précédentes indisponibles">
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
      const s = window.LoLDraft.createSession(`Game ${n}`, prev?.ourSide || "blue", {
        fearless: prev?.fearless ?? false,
      });
      coach.state.draftSessions.push(s);
      coach.state.activeDraftId = s.id;
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
    const conflict = summary.conflicts?.length
      ? `<span class="draft-color-conflict" title="${coach.escapeHtml(summary.conflicts.join(" · "))}">⚠</span>`
      : "";
    return `
      <div class="draft-color-bar" aria-label="Identité couleur ${summary.identity}">
        <div class="draft-color-track">${bars}</div>
        <span class="draft-color-id">${summary.identity}${conflict}</span>
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
      const focused = isCellFocused(session, "pick", side, null, slot);
      const swapTarget = isSwapTarget(session, side, slot);

      return `
        <button type="button"
          class="draft-cell draft-pick-cell${name ? " filled" : " empty"}${focused ? " draft-cell-focused" : ""}${swapTarget ? " draft-cell-swap-target" : ""}"
          data-focus-type="pick" data-side="${side}" data-slot="${slot}"
          aria-label="Pick ${slot}${name ? ` : ${name}` : ""}">
          <span class="draft-cell-tag">${SLOT_ICONS[slot]} ${slot}</span>
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
        <div class="draft-bans-row">${renderBanRow(side, session)}</div>
        ${renderTeamColorBar(side, session)}
        <div class="draft-slots-grid">${slots}</div>
      </div>`;
  }

  function bindBoardEvents(container) {
    if (container.dataset.bound === "1") return;
    container.dataset.bound = "1";
    container.addEventListener("click", (e) => {
      const cell = e.target.closest(".draft-cell[data-focus-type]");
      if (!cell || !container.contains(cell)) return;
      const session = getActiveSession();
      if (!session) return;
      const type = cell.dataset.focusType;
      const side = cell.dataset.side;
      if (type === "ban") {
        setFocus(session, { type: "ban", side, banIndex: parseInt(cell.dataset.banIndex, 10) });
        afterFocusChange(session);
      } else {
        handlePickCellClick(session, side, cell.dataset.slot);
      }
    });
  }

  function bindPoolEvents(container) {
    if (container.dataset.poolBound === "1") return;
    container.dataset.poolBound = "1";
    container.addEventListener("click", (e) => {
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
      renderPool({ gridOnly: true });
    });
  }

  function renderBoard() {
    const el = coach.els.draftBoard || document.getElementById("draft-board");
    const session = getActiveSession();
    if (!el || !session) return;
    coach.els.draftBoard = el;

    const ourSideId = window.LoLDraft.ourSide(session);
    const enemySideId = window.LoLDraft.enemySide(session);
    const focusHint = window.LoLDraft.actionLabel(session);

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
          <span>${focusHint ? coach.escapeHtml(focusHint) : "1. Case · 2. Champion"}</span>
        </div>
      </div>
      ${renderTeamColumn(enemySideId, session, "Adversaire")}
    `;

    bindBoardEvents(el);
  }

  function renderPoolAlphabetical(champions) {
    const sorted = [...champions].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    let lastLetter = "";
    let html = "";

    for (const c of sorted) {
      const letter = c.name.charAt(0).toUpperCase();
      if (letter !== lastLetter) {
        lastLetter = letter;
        html += `<div class="draft-alpha-letter" id="draft-letter-${letter}">${letter}</div>`;
      }
      html += `
        <button type="button" class="draft-pool-card" data-champ="${coach.escapeHtml(c.name)}" title="${coach.escapeHtml(c.name)}">
          ${coach.championIconHtml(c, { size: "pool" })}
          <span class="draft-pool-name">${coach.escapeHtml(c.name)}</span>
          ${c.tierMeta ? `<span class="draft-pool-tier tier-${c.tierMeta.toLowerCase()}">${c.tierMeta}</span>` : ""}
          ${coach.mtgPastillesHtml ? coach.mtgPastillesHtml(c, { variant: "compact" }) : ""}
        </button>`;
    }
    return html;
  }

  function buildSuggestChipsHtml(session) {
    if (window.LoLDraft.isComplete(session)) return "";
    const metaMap = coach.state.tacticsMeta?.champions || {};
    const rec = window.LoLDraft.getRecommendations(
      session,
      coach.state.champions,
      metaMap,
      coach.state.byName,
      allSessions(),
      6
    );
    if (!rec.items?.length) return "";
    return `
      <div class="draft-suggest-row" aria-label="Suggestions coach">
        ${rec.items
          .map(
            (item, i) => `
          <button type="button" class="draft-suggest-chip" data-champ="${coach.escapeHtml(item.champion.name)}" title="${coach.escapeHtml(item.reasons.slice(0, 2).join(" · "))}">
            <span class="draft-suggest-rank">#${i + 1}</span>
            ${coach.championIconHtml(item.champion, { size: "coach" })}
            <span class="draft-suggest-name">${coach.escapeHtml(item.champion.name)}</span>
          </button>`
          )
          .join("")}
      </div>`;
  }

  function renderSuggestChips(session) {
    return `<div id="draft-suggest-host"></div>`;
  }

  function fillSuggestChips(session) {
    const host = document.getElementById("draft-suggest-host");
    if (!host) return;
    const run = () => {
      if (getActiveSession()?.id !== session.id) return;
      host.outerHTML = buildSuggestChipsHtml(session) || "";
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 200 });
    } else {
      requestAnimationFrame(run);
    }
  }

  function getPoolFiltered(session) {
    const searchQuery = coach.state.draftPoolSearch || "";
    const q = searchQuery.toLowerCase();
    const avail = window.LoLDraft.availableChampions(coach.state.champions, session, allSessions());
    const filtered = avail.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.nameEn || "").toLowerCase().includes(q)
      );
    });
    const letters = [...new Set(filtered.map((c) => c.name.charAt(0).toUpperCase()))].sort();
    return { searchQuery, filtered, letters };
  }

  function renderAlphaJump(letters) {
    if (letters.length <= 1) return "";
    return `<div class="draft-alpha-jump">${letters
      .map((l) => `<a href="#draft-letter-${l}" class="alpha-jump-link">${l}</a>`)
      .join("")}</div>`;
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

  function updatePoolGrid(el, filtered, letters) {
    const countEl = el.querySelector(".draft-pool-count");
    if (countEl) countEl.textContent = `${filtered.length} disponibles · A → Z`;

    const toolbar = el.querySelector(".draft-pool-toolbar");
    const jump = toolbar?.querySelector(".draft-alpha-jump");
    const jumpHtml = renderAlphaJump(letters);
    if (jumpHtml) {
      if (jump) jump.outerHTML = jumpHtml;
      else toolbar?.insertAdjacentHTML("beforeend", jumpHtml);
    } else if (jump) {
      jump.remove();
    }

    const gridEl = el.querySelector(".draft-pool-grid");
    if (gridEl) {
      gridEl.innerHTML = filtered.length
        ? renderPoolAlphabetical(filtered)
        : `<p class="muted draft-pool-empty">Aucun champion disponible.</p>`;
      bindPoolCards(gridEl);
    }
    bindPoolAlphaJump(el);
  }

  function renderPool({ gridOnly = false } = {}) {
    const el = coach.els.draftPool || document.getElementById("draft-pool");
    const session = getActiveSession();
    if (!el || !session) return;
    coach.els.draftPool = el;

    const { searchQuery, filtered, letters } = getPoolFiltered(session);

    if (gridOnly && el.querySelector("#draft-pool-search")) {
      updatePoolGrid(el, filtered, letters);
      return;
    }

    const actionText = window.LoLDraft.actionLabel(session);
    const hasFocus = Boolean(session.focus);

    el.innerHTML = `
      <div class="draft-pool-header">
        <h2 class="draft-pool-title">Champions</h2>
        <span class="draft-pool-count">${filtered.length} dispo · ${coach.state.champions.length} rotation patch</span>
      </div>
      ${
        actionText
          ? `<div class="draft-pool-action${hasFocus ? " focus-ready" : ""}">${coach.escapeHtml(actionText)}</div>`
          : ""
      }
      ${renderSuggestChips(session)}
      <div class="draft-pool-toolbar">
        <input type="search" class="draft-pool-search" placeholder="Rechercher…" value="${coach.escapeHtml(searchQuery)}" id="draft-pool-search" />
        ${renderAlphaJump(letters)}
      </div>
      <div class="draft-pool-grid draft-pool-grid-alpha">
        ${filtered.length ? renderPoolAlphabetical(filtered) : `<p class="muted draft-pool-empty">Aucun champion disponible.</p>`}
      </div>
    `;

    bindPoolEvents(el);
    fillSuggestChips(session);
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
