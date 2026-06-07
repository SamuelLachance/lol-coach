#!/usr/bin/env python3
import json
import re
import urllib.request
from lxml import html

url = "https://lolalytics.com/lol/aatrox/build/?tier=emerald"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=20) as r:
    content = r.read()

tree = html.fromstring(content)

# All text nodes containing %
texts = tree.xpath("//text()")
lane_hits = []
for t in texts:
    s = (t or "").strip()
    if not s or "%" not in s:
        continue
    low = s.lower()
    if any(x in low for x in ("top", "jungle", "mid", "bot", "support", "adc", "middle", "bottom")):
        lane_hits.append(s)

print("lane_hits sample:", lane_hits[:30])

# Links with lane in href
for a in tree.xpath("//a[contains(@href,'lane=')]/@href")[:15]:
    print("link", a)

# Search raw html for lane rate pattern
raw = content.decode("utf-8", "replace")
for m in re.finditer(r"(top|jungle|middle|bottom|support)[^%]{0,30}(\d+\.?\d*)%", raw, re.I):
    if len(list(re.finditer(r"(top|jungle|middle|bottom|support)[^%]{0,30}(\d+\.?\d*)%", raw, re.I))) > 50:
        break
    print(m.group(0)[:80])
