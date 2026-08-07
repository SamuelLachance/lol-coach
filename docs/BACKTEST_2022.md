# Accuracy historique du moteur de draft — backtest Oracle's Elixir 2022

Mesuré le 2026-08-07 sur **12 549 parties pro complètes** (Oracle's Elixir 2022, 23 patchs, 55 ligues,
655 équipes). Reproductible : `node scripts/backtest_draft.mjs`, `node scripts/backtest_components.mjs`.

## Résultat principal

| | Version actuelle | Avant la refonte | Références |
|---|---|---|---|
| Accuracy | **49,19 %** | 51,97 % | bleu toujours : 52,47 % |
| Brier | 0,264 | 0,272 | pile ou face : 0,25 |
| Log loss | 0,724 | 0,749 | pile ou face : 0,693 |
| Symétrie des côtés | 0 violation / 300 | **299 / 300** | — |

Le 51,97 % d'avant n'était pas de la prédiction : le moteur violait la symétrie (299/300), prédisait
« bleu » dans 92 % des cas et récoltait mécaniquement le taux de victoire du côté bleu — en restant
sous la baseline. La refonte a supprimé ce biais, ce qui a révélé l'absence de signal.

## Calibration inversée

| Prédit | 27,9 % | 35,6 % | 45,9 % | 53,9 % | 64,5 % | 72,2 % |
|---|---|---|---|---|---|---|
| Observé | 59,0 % | 55,2 % | 51,9 % | 52,1 % | 51,3 % | 48,7 % |

Relation monotone décroissante : plus le moteur est confiant, plus il se trompe.
Top 5 % des drafts jugées les plus tranchées : 45,3 % (n = 627).

## Causes écartées

**Force d'équipe — écartée.** Un Elo séquentiel sans fuite atteint 63,88 % (n = 9 200), c'est la vraie
baseline. Mais force et marge de draft sont orthogonales (r = +0,015), et après contrôle sur l'Elo le
coefficient de la marge reste négatif : β = −0,061 ± 0,022 (p = 0,006). L'anti-corrélation est la plus
forte là où les équipes sont de force comparable (47,84 %), l'inverse de ce que prédirait un confondant.

**Décalage de méta — écartée.** Les tiers pro, laneRates et tables de matchups sont quasi inertes dans
`evaluateDraftDuel` : influence sur la marge de 0,6 %, 0 % et 0 %. Injecter les vrais tiers et laneRates
2022 fait passer l'accuracy de 49,63 % à 49,55 %. Le décalage existe (r(tier 2026, winrate 2022) ≈ 0 ;
les tier S 2026 ont le pire winrate 2022 à 48,57 %) mais ne peut pas être la cause : le moteur ne lit
presque pas ces champs. Sa marge vient à 80 % de `championFamily`/`compTypes` + tags tactiques.

## Cause identifiée : les règles elles-mêmes

- **26 règles inversées sur 39 testables** ; 65 % des déclenchements viennent de règles à edge négatif.
- **Corrélation poids ↔ edge empirique : −0,339.** Plus une règle pèse lourd, plus elle est fausse.
- Bloc « protection / peel / disengage / poke » : le camp favorisé gagne **46,85 %** (n = 6 662, z = −5,05).
- La règle la plus lourde du moteur (195 pts), « hypercarry protégé > engage/dive frontal », est inversée :
  le camp hypercarry gagne **44,26 %** face à un plan engage (n = 488, vérifié indépendamment).
- Plus généralement, **les compos hypercarry gagnent 44,58 %** de leurs parties (n = 1 678), toutes
  situations confondues.
- Contradiction interne : `COMP_TYPE_COUNTERS` encode à la fois « teamfight_engage bat split_push »
  et « split_push bat teamfight_engage ». Les données tranchent : split_push gagne (67,92 %, n = 53).
- Code mort : 13 règles ne se déclenchent jamais en 12 549 parties ; 5 plans ne sont jamais détectés
  (`poke_siege`, `front_to_back`, `scaling_late`, `lane_tempo`, `all_in` quasi absent).
- Confirmées : « pick_global bat hypercarry » (57,43 %, n = 498) et « split_push bat teamfight_engage »
  (67,92 %, n = 53).

Winrate observé par plan détecté (le moteur suppose 50 % de base) :
`pick_global` 50,61 % · `beatdown` 50,02 % · `split_push` 52,05 % · `poke_disengage` 48,75 % ·
`hypercarry` 44,58 % · `teamfight_engage` 44,66 %.

## Plafond atteignable

Modèle appris honnêtement (logistique symétrique sur indicatrices de champions + paires, CV 5 plis
imbriquée) : **55,85 %** [54,98–56,72]. Modèle le plus bête possible (somme des winrates individuels
hors-pli) : **54,73 %**. Désatténuation à données infinies : ~56,2 %.

Donc « bon » veut dire **55–56 %**, soit +3 à +4 points sur la baseline de côté. Le moteur à 49,19 % est
5,5 points sous le modèle le plus bête.

Nuance importante : la draft n'explique que 1,8–2,1 % de la variance du résultat, contre 12,9 % pour la
seule identité des équipes. Conditionnellement aux équipes, la draft n'apporte plus rien de significatif
(McNemar p = 0,98). Une bonne partie du signal « draft » est un proxy de la force d'équipe.

## Lecture

Le backtest mesure « quelle compo bat quelle compo en pro », pas « la méthode aide-t-elle à coacher ».
Le résultat le plus net — hypercarry et teamfight_engage sous 45 % — est cohérent avec Shanei lui-même :
l'hypercarry est « la plus complexe et la moins jouée », l'all-in « scale mal ». Le moteur encode
l'avantage théorique d'une compo mais ignore le second objectif de la méthode, **la facilité
d'exécution** (« plus la compo est compliquée, plus vos joueurs vont se rater »). En pro 2022, la
difficulté d'exécution domine l'avantage théorique.

## Limites

- Une seule saison (2022), une seule source, drafts pro uniquement — rien sur la SoloQ ni sur 2023-2026.
- Le moteur n'a pas été ajusté sur ces données : c'est un test hors échantillon, ce qui est correct,
  mais le plafond de 56 % est lui estimé sur ces mêmes données.
- Le côté « our » du moteur est toujours le bleu dans ce backtest ; la symétrie a été contrôlée
  séparément (0 violation / 300).
