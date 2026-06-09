/**
 * Page guide — système de couleurs MTG appliqué à LoL.
 */
(function (global) {
  const WHEEL = ["W", "U", "B", "R", "G"];

  const COLOR_LOL_EXAMPLES = {
    W: "Lulu, Braum, Sejuani, Taric — peel, frontline, protect the carry",
    U: "Orianna, Azir, TF, Xerath — contrôle, setup, zone, tempo lent",
    B: "Pyke, Evelynn, Kassadin — picks, snowball, fin de partie",
    R: "Draven, Renekton, Lee Sin — aggro, tempo, fight early",
    G: "Kog'Maw, Kayle, Nasus — scaling, durée, win condition late",
  };

  const FAMILY_SAMPLES = [
    ["support_enchanter", "W élevé — peel & buffs"],
    ["mage_control", "U élevé — zone & contrôle"],
    ["assassin_ap_pick", "B + R — pick & burst"],
    ["adc_hypercarry", "G élevé — scale late"],
    ["bruiser_teamfight", "R + G — front & dégâts"],
  ];

  function esc(text = "") {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function meta(code) {
    return global.LoLCoach?.MTG_COLOR_META?.[code] || { label: code, philosophy: "", hex: "#888" };
  }

  function renderColorCards() {
    return WHEEL.map((code) => {
      const m = meta(code);
      return `<article class="mtg-guide-color-card mtg-guide-color-card--${code.toLowerCase()}">
        <div class="mtg-guide-color-card-head">
          <span class="mtg-pastille mtg-pastille--${code.toLowerCase()} mtg-pastille--primary" style="--pastille-weight:14"></span>
          <div>
            <h3>${esc(m.label)} <span class="mtg-guide-code">${code}</span></h3>
            <p class="mtg-guide-philo">${esc(m.philosophy)}</p>
          </div>
        </div>
        <p class="mtg-guide-examples">${esc(COLOR_LOL_EXAMPLES[code] || "")}</p>
      </article>`;
    }).join("");
  }

  function renderWheelSection() {
    const pie = global.MTGColorPie;
    if (!pie) return "";
    const allied = (pie.ALLIED_PAIRS || [])
      .map(([a, b]) => {
        const g = pie.GUILDS?.[pie.pairKey(a, b)];
        return `<li class="mtg-guide-pair mtg-guide-pair--ally">
          <span class="mtg-guide-pair-dots">${dot(a)}${dot(b)}</span>
          <span><strong>${esc(g?.name || `${a}+${b}`)}</strong> — paire alliée (adjacentes sur la roue)</span>
        </li>`;
      })
      .join("");
    const enemy = (pie.ENEMY_PAIRS || [])
      .map(([a, b]) => {
        const e = pie.ENEMY_DUAL?.[pie.pairKey(a, b)];
        return `<li class="mtg-guide-pair mtg-guide-pair--enemy">
          <span class="mtg-guide-pair-dots">${dot(a)}${dot(b)}</span>
          <span><strong>${esc(e?.name || `${a}+${b}`)}</strong> — tension / conflit d'identité</span>
        </li>`;
      })
      .join("");
    return `
      <div class="mtg-guide-wheel-visual" aria-hidden="true">
        ${WHEEL.map((c) => `<span class="mtg-guide-wheel-node mtg-guide-wheel-node--${c.toLowerCase()}">${c}</span>`).join("")}
      </div>
      <div class="mtg-guide-pairs-grid">
        <div>
          <h4 class="mtg-guide-subtitle mtg-guide-subtitle--ally">Paires alliées</h4>
          <ul class="mtg-guide-pair-list">${allied}</ul>
        </div>
        <div>
          <h4 class="mtg-guide-subtitle mtg-guide-subtitle--enemy">Paires ennemies</h4>
          <ul class="mtg-guide-pair-list">${enemy}</ul>
        </div>
      </div>`;
  }

  function dot(code) {
    return `<span class="mtg-pastille mtg-pastille--${code.toLowerCase()} mtg-pastille--primary" style="--pastille-weight:10"></span>`;
  }

  function renderCombosSection() {
    const pie = global.MTGColorPie;
    if (!pie) return "";
    const guilds = Object.entries(pie.GUILDS || {})
      .map(([, g]) => `<span class="mtg-harmony-tag mtg-harmony-tag--ally">${esc(g.name)} (${g.colors.join("")})</span>`)
      .join("");
    const shards = Object.entries(pie.SHARDS || {})
      .map(([name, s]) => `<span class="mtg-harmony-tag mtg-harmony-tag--shard">Shard ${esc(name)} (${s.colors.join("")})</span>`)
      .join("");
    const wedges = Object.entries(pie.WEDGES || {})
      .map(([name, s]) => `<span class="mtg-harmony-tag mtg-harmony-tag--wedge">Wedge ${esc(name)} (${s.colors.join("")})</span>`)
      .join("");
    return `
      <p>Une comp d'équipe avec 2–3 couleurs dominantes peut tomber dans une <strong>guilde</strong> (2 couleurs alliées), un <strong>shard</strong> (3 couleurs consécutives) ou un <strong>wedge</strong> (3 couleurs dont une paire ennemie). Le score draft en tient compte.</p>
      <div class="mtg-guide-tag-groups">
        <div><h4 class="mtg-guide-subtitle">Guildes (2C alliées)</h4><div class="mtg-guide-tags">${guilds}</div></div>
        <div><h4 class="mtg-guide-subtitle">Shards (3C consécutives)</h4><div class="mtg-guide-tags">${shards}</div></div>
        <div><h4 class="mtg-guide-subtitle">Wedges (3C)</h4><div class="mtg-guide-tags">${wedges}</div></div>
      </div>`;
  }

  function renderFamilyTable() {
    return `<ul class="mtg-guide-family-list">${FAMILY_SAMPLES.map(
      ([fam, note]) => `<li><code>${esc(fam)}</code> → ${esc(note)}</li>`
    ).join("")}</ul>
    <p class="mtg-guide-muted">+ ajustements manuels sur ~40 champions atypiques (ex. TF tank W/U, Fiora B, Draven R…). Script : <code>scripts/build_mtg_colors.py</code>.</p>`;
  }

  function renderPage(container) {
    if (!container) return;
    container.innerHTML = `
      <article class="mtg-guide-page">
        <header class="mtg-guide-hero">
          <button type="button" class="btn-secondary mtg-guide-back" id="mtg-guide-back">← Retour</button>
          <p class="mtg-guide-kicker">Guide · Draft &amp; macro</p>
          <h1>Système de couleurs MTG</h1>
          <p class="mtg-guide-lead">Analogie <strong>Magic: The Gathering (WUBRG)</strong> appliquée à League of Legends. Ce n'est <em>pas</em> une taxonomie Riot — c'est un raccourci heuristique pour parler d'<strong>identité de comp</strong> en draft, inspiré de frameworks analystes (LS, Kaze…).</p>
          <div class="mtg-guide-disclaimer">
            <strong>À prendre avec recul.</strong> Le mapping LoL → MTG reste subjectif. Utilise-le comme repère de cohérence, pas comme vérité meta.
          </div>
        </header>

        <section class="mtg-guide-section">
          <h2>Les 5 couleurs</h2>
          <p>Chaque champion reçoit cinq scores qui totalisent <strong>24 points</strong>. Les pastilles sur les cartes = couleurs dominantes (les plus hauts scores).</p>
          <div class="mtg-guide-color-grid">${renderColorCards()}</div>
        </section>

        <section class="mtg-guide-section">
          <h2>Comment c'est calculé</h2>
          <ol class="mtg-guide-steps">
            <li><strong>Base famille</strong> — chaque archétype macro (engage, poke, hypercarry, contrôle…) part d'un vecteur W/U/B/R/G fixe.</li>
            <li><strong>Overrides</strong> — certains champions sont recalibrés à la main quand le kit ou le playstyle ne colle pas à la famille.</li>
            <li><strong>Identité affichée</strong> — code dominant (ex. <code>WU</code>, <code>BR</code>) + barres / pastilles sur la fiche champion.</li>
          </ol>
          ${renderFamilyTable()}
        </section>

        <section class="mtg-guide-section">
          <h2>La roue WUBRG</h2>
          <p>Ordre : <strong>W → U → B → R → G → W</strong>. Couleurs <em>adjacentes</em> = alliées ; couleurs à 2 crans = ennemies. C'est la logique utilisée pour scorer la cohérence d'équipe en draft.</p>
          ${renderWheelSection()}
        </section>

        <section class="mtg-guide-section">
          <h2>Combinaisons d'équipe</h2>
          ${renderCombosSection()}
        </section>

        <section class="mtg-guide-section">
          <h2>Dans l'app</h2>
          <div class="mtg-guide-usage-grid">
            <div class="mtg-guide-usage-card">
              <h3>Filtre Champions</h3>
              <p>Les pastilles sous « Couleurs » filtrent les champions où la couleur est <strong>dominante</strong> ou ≥ <strong>6/24</strong>.</p>
            </div>
            <div class="mtg-guide-usage-card">
              <h3>Draft &amp; macro</h3>
              <p>Le panneau « Identité couleur » compare les deux comps. Bonus si guildes/shards cohérents ; alertes si couleurs ennemies ou 5 couleurs dispersées.</p>
            </div>
            <div class="mtg-guide-usage-card">
              <h3>Tags d'harmonie</h3>
              <p>Rakdos, Selesnya, Shard Bant… = labels MTG quand la comp tombe dans une combinaison reconnue.</p>
            </div>
          </div>
        </section>

        <section class="mtg-guide-section mtg-guide-section--limits">
          <h2>Limites connues</h2>
          <ul class="mtg-guide-limits">
            <li>Un champion LoL mélange souvent plusieurs fantasies — une seule étiquette MTG ne suffit pas.</li>
            <li>Le meta patch change ; les couleurs décrivent une <em>identité de kit</em>, pas la force du moment.</li>
            <li>Ne remplace pas l'analyse lane, synergie sorts ou win condition — complète le draft, ne le remplace pas.</li>
          </ul>
        </section>
      </article>`;

    container.querySelector("#mtg-guide-back")?.addEventListener("click", () => {
      global.LoLCoach?.closeMtgColorsGuide?.();
    });
  }

  global.MtgColorsGuide = { renderPage };
})(typeof window !== "undefined" ? window : globalThis);
