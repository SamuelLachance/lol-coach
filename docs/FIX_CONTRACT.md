# Contrat de correction — refonte profonde lol-coach (août 2026)

Ce document est le contrat partagé entre les agents d'implémentation. Toute modification doit le respecter.
Repo : `C:/Users/Admin/Documents/lol-coach`. Site 100 % statique dans `public/`, vanilla JS, globals `window.*`, UI en **français**.

## 1. Sémantique des counters (convention unique, NON NÉGOCIABLE)

Dans les données (`champions.json`, `champions-index.json`, `tactics-meta.json`) :
- `bestCounters`, `allCounters`, `worstMatchups` = **« champions qui battent CE champion »** (ses menaces). C'est vérifié : générés depuis la variable `beaten_by` de `apply_matchups_from_gameplay.py`; `bestCounters === worstMatchups` pour 172/172 dans tactics-meta.
- `bestPairings`, `allPairings` = **alliés / synergies** (jamais des counters).

Dans le code (draft-scoring.js, profils) :
- Champ de profil renommé : `threats` = liste « qui me bat » (sourcé depuis `bestCounters`/`allCounters`/`worstMatchups`, en ce sens uniquement).
- `victims` = index inverse « qui je bats », construit UNE FOIS au chargement des données (pour chaque champion C, pour chaque T dans threats(C) : victims[T] += C, avec le score/raison associés).
- `namesFrom(list)` ne doit JAMAIS avoir de fallback vers une autre liste sémantiquement différente : liste absente ⇒ `[]`.
- Règle de test : si A figure dans threats(B) (A bat B), alors tout axe pairwise doit créditer A et débiter B.

## 2. Antisymétrie (propriété de tout le pipeline)

- Toute fonction d'edge pairwise doit satisfaire `edge(A,B) = -edge(B,A)` : on calcule l'avantage NET une fois et on l'attribue signé. Interdits : rabais unilatéraux (×0.52, ×0.45, ×0.38, ×0.55, ×0.65 actuels).
- `evaluateDraftDuel(our, enemy)` swap ⇒ marge opposée (à ±1 près d'arrondi). Même compo des deux côtés ⇒ win% = 50 %.
- `lane-matchups.json` sera régénéré (vague data) avec `margin(A,B) = edge(A,B) − edge(B,A)`. Les règles de `laneKitModifiers` doivent être écrites pour donner un résultat sensé dans CETTE formule (pas besoin de miroir manuel si le build symétrise, mais éviter les +40 binaires).

## 3. Verdicts de lane

- Nouveau verdict `'even'` quand `|margin| < 5` (fini le tie-break par ordre alphabétique). `scoreLaneMatchup` le produit ; tactics-engine et l'UI le consomment (badge neutre « Égal »).
- Fallback moteur indisponible ⇒ `{ verdict:'unknown', margin:0 }`, jamais « lose ».

## 4. Piliers de scoring à poids réellement égal

- `normalizePillar(raw, typicalAbs)` : clamp final à **±100** (clamp de raw à ±1.0×typicalAbs, pas 2.5×). Un pilier saturé ne peut pas peser plus qu'un autre.
- Chaque signal source n'alimente **UN SEUL** pilier (fin des doubles comptages : archetypeHits dans winCondition ET coaching ET family ; combos dans synergy ET wombo ; crossNet/planNet comptés 2-3× dans la marge du duel ; beatdown compté 2×).
- `scorePick` : supprimer la redondance teamDelta vs piliers séparés — modèle retenu : **piliers séparés** (teamDelta retiré ou réduit à un pilier « équilibre d'équipe » qui ne recouvre pas synergy/counter/coaching/mtg).
- Pilier MTG : **poids réduit de moitié** vs les autres piliers (typicalAbs doublé après re-centrage), score zéro-centré, AUCUN plancher positif ([85,560] et [0,580] supprimés). Une équipe aléatoire doit scorer ≈ 0.
- win% affiché : logistique douce sur la marge normalisée, borné [15 %, 85 %], 50 % si marge nulle. Pas de ratio linéaire ourTotal/(sum).

## 5. Théorie Shanei (source de vérité coaching : `C:/Users/Admin/Documents/lolcoach/knowledge/draft.md` et `compos-familles.md`)

- UNE identité de compo (all-in/engage [catch, wombo, full early], poke/disengage, hypercarry) ; mélanger poke↔engage = pénalité réelle.
- Un tank dans le « bloc de 4 » (hors top) ; jamais full AD / full AP ; max 2 losing lanes.
- Ordre de counterpick : top en last pick, support blind R4, ADC/jungle tôt. La pénalité « Top/Support early = risqué » doit être ACTIVE (bug inBlind actuel).
- Bans = protéger SA win condition.
- Le système de couleurs MTG est une **projection UX** de ces familles : il ne doit jamais contredire la théorie (une paire ennemie MTG portée par une identité cohérente — ex. poke U+R « Izzet » — est une identité VALIDE et nommée, pas un conflit ; un mix 3+ couleurs sans structure ne doit PAS être récompensé par une exemption « wedge »).

## 6. Normalisation des noms

- Une seule fonction de normalisation, partagée : NFD + strip accents + lowercase + strip non-alphanum (comme lane-matchup-logic). Les données sont en FRANÇAIS (« Maître Yi », « Zoé », « Séraphine », « K'Santé », « Nunu et Willump »).
- Tout nom cité dans une table curée (MECH, CURATED_COUNTERS, COMBO_GRAPH, familles coaching…) doit exister dans les données — test automatique obligatoire.

## 7. Compatibilité API

- Ne PAS renommer les namespaces publics `window.*` (LoLDraftScoring, LoLDraft, LoLTactics, CoachingDraftKnowledge, LoLMtgColors, etc.) ni les fonctions qu'un AUTRE fichier consomme. Renommages internes libres.
- Les formes de retour consommées par l'UI (reasons, breakdown, verdicts, hits) restent des champs existants ; on peut en AJOUTER.

## 8. Tests (obligatoire pour chaque agent)

- Répertoire `scripts/tests/`, Node pur (aucune dépendance), chargé via les mêmes shims que `scripts/test_draft_scoring.mjs` (lecture des fichiers public/*.js en global).
- Runner commun : `scripts/tests/run_all.mjs` exécute tous les `test_*.mjs` du dossier et sort code ≠ 0 en cas d'échec.
- Chaque agent écrit des tests qui auraient attrapé les bugs de son périmètre (direction des counters, symétrie, validation des noms, clés de guildes, bornes des piliers, absence de NaN sur 172 champions × 5 slots…) et les fait passer.
- Le smoke test existant `scripts/test_draft_scoring.mjs` doit continuer à passer (adapter ses assertions si un correctif change un résultat attendu — ex. « Ashe vs Ashe doit rendre 0 »).

## 9. Style

- UI et raisons affichées en français correct (corriger le franglais rencontré : « DMS »→« DPS », « Ne die pas »→« Ne meurs pas », etc.).
- Pas de commentaire expliquant le correctif ; le code se suffit. Conserver l'idiome du fichier (IIFE, template strings, etc.).
