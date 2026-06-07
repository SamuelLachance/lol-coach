#!/usr/bin/env python3
import json
from pathlib import Path

data = json.loads((Path(__file__).parent.parent / "data" / "champions.json").read_text(encoding="utf-8"))
checks = ["Xerath", "Braum", "Vi", "Lee Sin", "Kindred", "Azir", "Jarvan IV", "Taric", "Miss Fortune", "Jinx"]
for n in checks:
    c = next(x for x in data["champions"] if x["name"] == n)
    fam = c["championFamily"]
    print(f"{n}: family={fam['key']} compTypes={fam['compTypes']}")

mx = max(len(x.get("championFamily", {}).get("compTypes", [])) for x in data["champions"])
dual = [x["name"] for x in data["champions"] if len(x.get("championFamily", {}).get("compTypes", [])) == 2]
print("max comp types:", mx)
print("dual comp:", dual)
off = sorted(x["name"] for x in data["champions"] if x.get("championFamily", {}).get("key") == "jungle_offensive")
print("jungle offensive:", off)
