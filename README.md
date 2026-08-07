# LoL Coach Dashboard

Dashboard coach **League of Legends** : référence champions (Data Dragon), draft live, analyse macro, configuration patch.

## Hébergement gratuit sur Internet

Le site est **100 % statique** (`public/`). Deux options sans port forwarding ni No-IP :

### Option A — GitHub Pages (recommandé, permanent, HTTPS)

Gratuit, URL du type `https://VOTRE-USER.github.io/lol-coach/`

```powershell
winget install GitHub.cli   # une fois
.\deploy.bat                # gh auth login au premier lancement, puis push auto
```

Dans GitHub : **Settings → Pages → Build and deployment → Source = GitHub Actions**.

### Option B — Tunnel Cloudflare (immédiat, temporaire)

URL publique en ~30 s (ex. `https://xxx.trycloudflare.com`), sans compte. S’arrête quand vous fermez la fenêtre.

```powershell
.\start-tunnel.bat
```

---

## Démarrage local

```powershell
cd C:\Users\Admin\Projects\lol-coach
python scripts/fetch_ddragon.py   # télécharge champions + objets (Riot CDN)
python scripts/apply_matchups_from_gameplay.py   # matchups/pairings depuis le guide gameplay
python -m http.server 8081 --directory public
```

**Accès local box (optionnel, port 80)** — domaine dans `config/server.json` :

```json
{ "publicHost": "lolcoach.gotdns.ch", "publicUrl": "http://lolcoach.gotdns.ch", "listenPort": 80 }
```

```powershell
pip install -r requirements.txt   # une fois
# PowerShell administrateur :
.\setup.bat    # pare-feu
.\start.bat    # serveur aiohttp sur :80
```

- Local : [http://localhost:8081](http://localhost:8081)
- Santé (serveur aiohttp) : [http://localhost/health](http://localhost/health)

## Onglets

| Onglet | Description |
|--------|-------------|
| **Champions** | Pool patché, tiers, rôles, familles, couleurs MTG, matchups par lane |
| **Draft** | Draft tournoi (5 bans, 2 phases), timeline de séquence, recommandations expliquées, fearless |
| **Macro** | Plan de match complet : prio lanes, pathing jungle, objectifs, vagues, teamfight, vision, win condition |
| **Patch** | Pool, tiers et rôles par champion (localStorage, export/import JSON) |
| **Guide** | Fondamentaux macro et méthode Kazewa (`public/data/guide-fr.json`) |

## Données

- Source : [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) (FR)
- Matchups / pairings : analyse **exclusive** de `lol-champions-gameplay.md` (rôles, profil, sorts, conseils de jeu / jouer contre) — aucune liste meta externe
- Scripts :
  - `scripts/fetch_ddragon.py` — relancer après chaque patch LoL
  - `scripts/apply_matchups_from_gameplay.py` — recalcule `bestCounters` et `bestPairings` (172 champs)
  - `node scripts/build_lane_matchups.mjs` — matrice de marges de lane 172×172×5 (antisymétrique par construction)
  - `python scripts/verify_data.py` — contrôle de cohérence inter-fichiers (exécuté en CI)
- **Tiers pro (draft + onglet Patch)** : mis à jour automatiquement depuis [gol.gg](https://gol.gg/champion/list/) (stats pick/ban compétitif). ProComps.gg n’expose pas d’API publique ; gol.gg est le proxy programmatique (ProComps indique des tiers basés sur le pro play).
  - Fetch manuel : `python scripts/fetch_golgg_pro_tiers.py && python scripts/apply_competitive_tiers.py`
  - **Windows** (quotidien 07:00) : `powershell -File scripts/register_daily_task.ps1` puis la tâche `LoLCoach-DailyMetaRefresh` exécute `scripts/run_daily_meta_refresh.ps1` (lane rates, builds, tiers pro).
  - **GitHub Actions** : workflow `daily-meta-refresh.yml` (06:00 UTC) — fetch gol.gg + apply + rebuild matrice de lane + `verify_data.py` + commit sur `main`.
  - Logs : `data/pro_tier_refresh.log`, stats brutes : `data/golgg_pro.json`, tiers : `scripts/competitive_tiers.json`.
  - Override saison : `$env:GOLGG_SEASON='S16'` avant le fetch.
- Tiers meta : surcharge manuelle possible dans l’onglet Patch (localStorage)

## Conventions et tests

- `docs/FIX_CONTRACT.md` — contrat de la refonte : sémantique des counters (`bestCounters` = « champions qui battent CE champion »), antisymétrie des marges, verdict de lane `even`, piliers de scoring bornés à ±100, poids du système de couleurs MTG, normalisation des noms français.
- `node scripts/tests/run_all.mjs` — suite complète (scoring, règles, moteur/UI, macro/MTG, CSS/HTML, données). À exécuter avant tout push.

## Projet TFM2

Version Teamfight Manager 2 : `C:\Users\Admin\Projects\tfm2-coach`
