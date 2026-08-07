import json
from pathlib import Path

data = json.loads(Path(__file__).resolve().parent.parent.joinpath("public/data/champions.json").read_text(encoding="utf-8"))
by = {c["name"]: c for c in data["champions"]}
for n in ["Yasuo", "Malphite", "Jarvan IV", "Kog'Maw", "Syndra", "Thresh", "Aatrox", "Ornn"]:
    c = by[n]
    print(n)
    print("  worst:", c["bestCounters"])
    print("  best:", c["bestPairings"])
empty_w = sum(1 for c in data["champions"] if len(c["bestCounters"]) < 5)
empty_b = sum(1 for c in data["champions"] if len(c["bestPairings"]) < 5)
print("short lists worst/best:", empty_w, empty_b)
