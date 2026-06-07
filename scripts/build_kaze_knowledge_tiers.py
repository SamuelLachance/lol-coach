#!/usr/bin/env python3
"""Tier list Kazewa/Kaze — analyse individuelle depuis docs/*.md uniquement."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHAMPIONS_JSON = ROOT / "public" / "data" / "champions.json"
OUT = Path(__file__).resolve().parent / "kaze_knowledge_tiers.json"

TIER_NOTES = {
    "S": "Pilier draft/climb — central ou très cité positivement (synthèses Kazewa/Kaze).",
    "A": "Solide — bon outil macro, flex draft ou climb récurrent dans les MD.",
    "B": "Situationnel — viable mais matchup/draft dépendant ou signal mixte.",
    "C": "Neutre — absent des synthèses ; pas d'avis individuel explicite.",
    "D": "Déconseillé — critique explicite ou profil TF/draft incompatible.",
}

# (tier, raison) — une entrée par champion, basée sur docs/kazewa-lol-knowledge.md + kaze-database-knowledge.md
ANALYSIS: dict[str, tuple[str, str]] = {
    "Aatrox": ("B", "Bruiser TF · histoire Aatrox asiatique > EU (transcript)."),
    "Ahri": ("A", "Pick mid · mobility · famille pick/global."),
    "Akali": ("A", "Assassin AP pick · sidelane."),
    "Akshan": ("B", "Roam reset · mention climb Saka (transcript alias)."),
    "Alistar": ("A", "Engage frontline · synergy Poppy (transcript)."),
    "Ambessa": ("B", "Bruiser TF · synergies family, peu cité dans MD."),
    "Amumu": ("B", "Tank engage jgl · TF AoE classique."),
    "Anivia": ("B", "Mage zone · control (absent MD, profil poke TF)."),
    "Annie": ("B", "Mage burst · flash engage (absent MD)."),
    "Aphelios": ("B", "Hypercarry · scale (absent MD)."),
    "Ashe": ("A", "Poke/siege · vision · back lane pro cité."),
    "Aurelion Sol": ("B", "Hypercarry mid · scale (absent MD)."),
    "Aurora": ("S", "KR/CN : jamais vu faire de mauvaises games (transcript)."),
    "Azir": ("S", "Pilier Faker · hypercarry · combo Renekton blind (despite 1 erreur draft citée)."),
    "Bard": ("B", "Global roam · pick (absent MD)."),
    "Bel'Veth": ("B", "Jungle carry invade (absent MD)."),
    "Blitzcrank": ("B", "Hook pick · lane (absent MD)."),
    "Brand": ("B", "Poke sup · burn (absent MD)."),
    "Braum": ("A", "Disengage · protect carry (Brom transcripts)."),
    "Briar": ("C", "Non cité · jgl all-in neutre."),
    "Caitlyn": ("B", "Poke siege ADC (absent MD)."),
    "Camille": ("A", "Unranked→Challenger série Kazewa."),
    "Cassiopeia": ("B", "Hypercarry DPS (absent MD)."),
    "Cho'Gath": ("C", "Tank silence · niche (absent MD)."),
    "Corki": ("A", "Mage DPS poke · draft flex cité."),
    "Darius": ("B", "Lane bully · TF front (absent MD)."),
    "Diana": ("B", "Assassin AP all-in (absent MD)."),
    "Dr. Mundo": ("B", "Hypercarry tank draft mentionné · faible vs Corki starter."),
    "Draven": ("B", "ADC all-in lane (absent MD)."),
    "Ekko": ("B", "Pick AP · tempo (absent MD)."),
    "Elise": ("B", "Jungle invade pick (absent MD)."),
    "Evelynn": ("B", "Pick fear (absent MD)."),
    "Ezreal": ("B", "Poke safe ADC · siege (absent MD)."),
    "Fiddlesticks": ("B", "Global TF fear (absent MD)."),
    "Fiora": ("S", "Fiora Method · carry 0-4 · Unranked→Challenger."),
    "Fizz": ("A", "Wave/micro cité (meilleur joueur KR Fizz transcript)."),
    "Galio": ("A", "Draft Pig Galio · global · R counter context."),
    "Gangplank": ("B", "Split GP · ovni (absent MD)."),
    "Garen": ("B", "« Beat him useless » Kazewa · simple beatable."),
    "Gnar": ("A", "G2 macro swap · TF engage cité."),
    "Gragas": ("B", "Disengage flex · body block (absent MD)."),
    "Graves": ("B", "Jungle invade (absent MD)."),
    "Gwen": ("C", "Non cité · bruiser neutre."),
    "Hecarim": ("C", "Non cité · jgl flank neutre."),
    "Heimerdinger": ("C", "Non cité · poke push neutre."),
    "Hwei": ("C", "Non cité · artillery neutre."),
    "Illaoi": ("C", "Non cité · split neutre."),
    "Irelia": ("A", "« Pas broken si punis windows » · duelist Kazewa."),
    "Ivern": ("B", "Jungle hypercarry enable (transcript)."),
    "Janna": ("A", "Meilleure réponse disengage (transcript)."),
    "Jarvan IV": ("B", "Tempo cage (absent MD)."),
    "Jax": ("A", "Unranked→Master VOD cité Kazewa."),
    "Jayce": ("A", "Pression bot · Jace transcript."),
    "Jhin": ("D", "« Chié / merde » — Jein (transcript Database10)."),
    "Jinx": ("A", "Jinx+Blitz climb low elo cité (Database10)."),
    "K'Santé": ("B", "Tank disengage (absent MD)."),
    "Kai'Sa": ("B", "ADC tempo (absent MD)."),
    "Kalista": ("A", "ADC flex blind · comp Renata critiquée pas le champ."),
    "Karma": ("B", "Enchanter poke (absent MD)."),
    "Karthus": ("B", "Global pick (absent MD)."),
    "Kassadin": ("B", "Scale AP (absent MD)."),
    "Katarina": ("B", "AP pick reset (absent MD)."),
    "Kayle": ("B", "Scale hypercarry (absent MD)."),
    "Kayn": ("B", "Jungle pick forms (absent MD)."),
    "Kennen": ("A", "Guide 1v9 low elo Kazewa."),
    "Kha'Zix": ("B", "Isolation pick (absent MD)."),
    "Kindred": ("C", "Non cité · scale jgl neutre."),
    "Kled": ("B", "Tempo bruiser (absent MD)."),
    "Kog'Maw": ("B", "Hypercarry peel (absent MD)."),
    "LeBlanc": ("B", "Pick burst (absent MD)."),
    "Lee Sin": ("B", "Tempo jgl offensif (absent MD)."),
    "Leona": ("S", "First pick engage · strat ban disengage pro."),
    "Lillia": ("C", "Non cité · mage jgl neutre."),
    "Lissandra": ("B", "TF engage mid (absent MD)."),
    "Lucian": ("A", "Lucian punish transcript · ADC tempo."),
    "Lulu": ("A", "Disengage peel · teamfight (transcripts)."),
    "Lux": ("B", "Burst pick (absent MD)."),
    "Malphite": ("B", "Simple TF engage (absent MD)."),
    "Malzahar": ("B", "Suppress scale (absent MD)."),
    "Maokai": ("S", "Draft : folie de laisser open · flex jgl."),
    "Maître Yi": ("B", "Hypercarry jgl · invade (guide jungle Kazewa)."),
    "Mel": ("C", "Non cité · burst neutre."),
    "Milio": ("C", "Non cité · enchanter neutre."),
    "Miss Fortune": ("B", "Poke TF R (absent MD)."),
    "Mordekaiser": ("C", "Non cité · bruiser neutre."),
    "Morgana": ("B", "Disengage shield (absent MD)."),
    "Naafiri": ("C", "Non cité · pack neutre."),
    "Nami": ("B", "Enchanter bubble (absent MD)."),
    "Nasus": ("B", "« Useless in 10 minutes » si deny stacks Kazewa."),
    "Nautilus": ("B", "Engage sup TF (absent MD, archetype valorisé)."),
    "Neeko": ("A", "Catch/disengage intelligent vs Poppy (transcript)."),
    "Nidalee": ("B", "Invade poke (absent MD)."),
    "Nilah": ("C", "Non cité · all-in ADC neutre."),
    "Nocturne": ("D", "« Merde en teamfight » (transcript) · pick isolé OK."),
    "Nunu et Willump": ("C", "Non cité · objective jgl neutre."),
    "Olaf": ("B", "Run down tempo (transcript léger)."),
    "Orianna": ("A", "Draft flex · résiste ganks · Oriana transcript."),
    "Ornn": ("B", "Tank · cible Fiora Method · spacing le bat."),
    "Pantheon": ("S", "Jungle open first pick (transcript)."),
    "Poppy": ("A", "Unranked→Challenger · disengage · Alistar synergy."),
    "Pyke": ("B", "Roam pick (absent MD)."),
    "Qiyana": ("B", "AD pick roam (absent MD)."),
    "Quinn": ("C", "Ovni split · specialist (absent MD)."),
    "Rakan": ("B", "Engage sup (absent MD)."),
    "Rammus": ("C", "Non cité · tank jgl neutre."),
    "Rek'Sai": ("C", "Non cité · invade neutre."),
    "Rell": ("B", "Engage · context bans mêlée (transcript)."),
    "Renata Glasc": ("A", "Disengage scale · setup dive draft."),
    "Renekton": ("S", "Blind top avec Azir « très très bien »."),
    "Rengar": ("C", "Non cité · pick jgl neutre."),
    "Riven": ("A", "Unranked→Challenger série Kazewa."),
    "Rumble": ("S", "Macro G2 · horn · Azir wave · TF cité."),
    "Ryze": ("B", "Hypercarry sidelane (absent MD)."),
    "Samira": ("C", "Non cité · all-in ADC neutre."),
    "Sejuani": ("B", "Jungle défensif TF (absent MD)."),
    "Senna": ("B", "Poke scale (absent MD)."),
    "Sett": ("C", "Non cité · bruiser neutre."),
    "Shaco": ("C", "Non cité · invade neutre."),
    "Shen": ("B", "Global TP protect (absent MD)."),
    "Shyvana": ("C", "Non cité · dragon jgl neutre."),
    "Singed": ("C", "Ovni split · niche (absent MD)."),
    "Sion": ("A", "TP draft plays · tank (transcripts)."),
    "Sivir": ("C", "Non cité · tempo ADC neutre."),
    "Skarner": ("C", "Non cité · objective jgl neutre."),
    "Smolder": ("C", "Non cité · hypercarry neutre."),
    "Sona": ("B", "Enchanter scale (absent MD)."),
    "Soraka": ("B", "Enchanter sustain (absent MD)."),
    "Swain": ("C", "Non cité · battle mage neutre."),
    "Sylas": ("B", "Burst steal ult (absent MD)."),
    "Syndra": ("B", "Lane burst (absent MD)."),
    "Séraphine": ("C", "Non cité · enchanter neutre."),
    "Tahm Kench": ("B", "Save ADC · Tom Kench transcript."),
    "Taliyah": ("A", "Global/pick · setup CC (family data + draft)."),
    "Talon": ("B", "AD roam pick (absent MD)."),
    "Taric": ("B", "Disengage invuln (absent MD)."),
    "Teemo": ("D", "Ovni · « ne fait pas l'objectif » (transcript)."),
    "Thresh": ("B", "Pick hook disengage (absent MD)."),
    "Tristana": ("C", "Non cité · tempo ADC neutre."),
    "Trundle": ("A", "Maokai vs Trundle · pillar split cité."),
    "Tryndamere": ("C", "Non cité · split neutre."),
    "Twisted Fate": ("B", "Global pick (absent MD)."),
    "Twitch": ("B", "Hypercarry TF (absent MD)."),
    "Udyr": ("C", "Non cité · flex jgl neutre."),
    "Urgot": ("A", "« Cancel ton kit » méthode Kazewa."),
    "Varus": ("S", "Back lane pro · catch E-Flash transcript."),
    "Vayne": ("A", "Guide 1v9 low elo Kazewa."),
    "Veigar": ("D", "« Vegar rule » low elo gimmick · quit lane MD."),
    "Vel'Koz": ("B", "Artillery true dmg (transcript mention)."),
    "Vex": ("C", "Non cité · anti-dash neutre."),
    "Vi": ("A", "Lockdown · jungle cité drafts."),
    "Viego": ("C", "Non cité · reset jgl neutre."),
    "Viktor": ("B", "Hypercarry (absent MD)."),
    "Vladimir": ("A", "Guide 1v9 low elo Kazewa."),
    "Volibear": ("C", "Non cité · dive jgl neutre."),
    "Warwick": ("C", "Non cité · duel jgl neutre."),
    "Wukong": ("C", "Non cité · tempo jgl neutre."),
    "Xayah": ("C", "Non cité · tempo ADC neutre."),
    "Xerath": ("C", "Non cité · poke sup neutre."),
    "Xin Zhao": ("C", "Non cité · tempo jgl neutre."),
    "Yasuo": ("B", "Bruiser windwall · Fizz/Yasuo wave transcript."),
    "Yone": ("C", "Non cité · skirmish neutre."),
    "Yorick": ("D", "« Jamais vu arriver au teamfight » (transcript)."),
    "Yunara": ("C", "Non cité · ADC neutre."),
    "Yuumi": ("C", "Non cité · attach sup neutre."),
    "Zaahen": ("C", "Non cité · assassin neutre."),
    "Zac": ("C", "Non cité · engage jgl neutre."),
    "Zed": ("B", "AD pick sidelane (absent MD)."),
    "Zeri": ("C", "Non cité · mobile ADC neutre."),
    "Ziggs": ("C", "Non cité · siege neutre."),
    "Zilean": ("C", "Non cité · tempo sup neutre."),
    "Zoé": ("C", "Non cité · poke neutre."),
    "Zyra": ("C", "Non cité · zone sup neutre."),
}


def load_names() -> list[str]:
    data = json.loads(CHAMPIONS_JSON.read_text(encoding="utf-8"))
    return sorted(c["name"] for c in data["champions"])


def build() -> dict:
    names = load_names()
    missing = [n for n in names if n not in ANALYSIS]
    if missing:
        raise SystemExit(f"Missing analysis for {len(missing)} champions: {missing[:5]}…")

    assignments = {n: ANALYSIS[n][0] for n in names}
    reasons = {n: ANALYSIS[n][1] for n in names}

    return {
        "version": "kaze-md-v2",
        "scope": "Tier list issue uniquement des synthèses docs/kazewa-lol-knowledge.md et docs/kaze-database-knowledge.md.",
        "source": ["docs/kazewa-lol-knowledge.md", "docs/kaze-database-knowledge.md"],
        "tierNotes": TIER_NOTES,
        "assignments": assignments,
        "championReasons": reasons,
    }


def main() -> None:
    payload = build()
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    counts: dict[str, int] = {}
    for t in payload["assignments"].values():
        counts[t] = counts.get(t, 0) + 1
    print(f"Wrote {OUT.name} — {len(payload['assignments'])} champions")
    for tier in "SABCD":
        print(f"  {tier}: {counts.get(tier, 0)}")


if __name__ == "__main__":
    main()
