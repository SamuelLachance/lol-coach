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
| **Champions** | Pool patché, tiers, rôles, sorts, matchups heuristiques |
| **Objets** | Légendaires ranked SR uniquement (≥3000 or, Faille de l'invocateur) |
| **Draft** | Simulation ban/pick, recommandations, fearless |
| **Macro** | Plan de match : prio lanes, jungle, objectifs, TF |
| **Patch** | Pool, tiers et rôles par champion (localStorage) |
| **Guide** | Fondamentaux macro SoloQ |

## Données

- Source : [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) (FR)
- Matchups / pairings : analyse **exclusive** de `lol-champions-gameplay.md` (rôles, profil, sorts, conseils de jeu / jouer contre) — aucune liste meta externe
- Scripts :
  - `scripts/fetch_ddragon.py` — relancer après chaque patch LoL
  - `scripts/apply_matchups_from_gameplay.py` — recalcule `worstMatchups` et `bestPairings` (172 champs)
- Tiers meta : configurables manuellement dans l’onglet Patch

## Projet TFM2

Version Teamfight Manager 2 : `C:\Users\Admin\Projects\tfm2-coach`
