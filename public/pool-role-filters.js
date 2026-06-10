/**
 * Filtres par poste — pools Draft & Macro (≥10% lane rate via LoLLaneViability).
 */
(function (global) {
  const SLOTS = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const SLOT_LABELS = { Top: "Top", Jungle: "Jgl", Mid: "Mid", Bot: "ADC", Support: "Sup" };
  const SLOT_ICONS = { Top: "▣", Jungle: "🔥", Mid: "⚡", Bot: "◎", Support: "✚" };

  const LV = () => global.LoLLaneViability;

  function champPlaysRole(champ, role, metaMap = {}) {
    if (!role || role === "all") return true;
    const lane = LV();
    if (lane) return lane.playsSlot(champ, metaMap, role);
    return false;
  }

  function laneScore(champ, slot, metaMap = {}) {
    if (!slot) return 0;
    const lane = LV();
    if (lane) return lane.laneScore(champ, metaMap, slot);
    return 0;
  }

  function filterByRole(champs, role, metaMap) {
    if (!role || role === "all") return champs;
    return champs.filter((c) => champPlaysRole(c, role, metaMap));
  }

  function sortPool(champs, { sortSlot, tierRank, metaMap = {} } = {}) {
    return [...champs].sort((a, b) => {
      if (sortSlot && sortSlot !== "all") {
        const ld = laneScore(b, sortSlot, metaMap) - laneScore(a, sortSlot, metaMap);
        if (ld !== 0) return ld;
      }
      if (tierRank) {
        const tr = tierRank(a.tierMeta) - tierRank(b.tierMeta);
        if (tr !== 0) return tr;
      }
      return a.name.localeCompare(b.name, "fr");
    });
  }

  function roleFilterLabel(role) {
    if (!role || role === "all") return "Tous postes";
    return SLOT_LABELS[role] || role;
  }

  function renderRoleFilterChips(activeRole) {
    const roles = [{ id: "all", label: "Tous" }, ...SLOTS.map((s) => ({ id: s, label: SLOT_LABELS[s], icon: SLOT_ICONS[s] }))];
    return `<div class="pool-role-filters" role="group" aria-label="Filtrer par poste">
      ${roles
        .map((r) => {
          const active = activeRole === r.id;
          return `<button type="button" class="pool-role-chip pool-role-chip--${r.id.toLowerCase()}${active ? " is-active" : ""}" data-pool-role="${r.id}" aria-pressed="${active ? "true" : "false"}">
            ${r.icon ? `<span class="pool-role-chip-icon" aria-hidden="true">${r.icon}</span>` : ""}<span>${r.label}</span>
          </button>`;
        })
        .join("")}
    </div>`;
  }

  function syncRoleFilterChips(root, activeRole) {
    if (!root) return;
    root.querySelectorAll(".pool-role-chip").forEach((chip) => {
      const on = chip.dataset.poolRole === activeRole;
      chip.classList.toggle("is-active", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  global.LoLPoolRoles = {
    SLOTS,
    SLOT_LABELS,
    SLOT_ICONS,
    MIN_LANE_RATE: () => LV()?.MIN_LANE_RATE ?? 10,
    champPlaysRole,
    laneScore,
    filterByRole,
    sortPool,
    roleFilterLabel,
    renderRoleFilterChips,
    syncRoleFilterChips,
  };
})(typeof window !== "undefined" ? window : globalThis);
