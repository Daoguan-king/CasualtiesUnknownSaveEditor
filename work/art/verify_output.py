# -*- coding: utf-8 -*-
import json, os, collections, random
from PIL import Image
import UnityPy

ART = r"C:/Users/Administrator/Documents/DSH/Casualties_Unknown/work/art"
OUT = os.path.join(ART, "out")
SRC = {"res": "resources.assets", "sh1": "sharedassets1.assets",
       "sh0": "sharedassets0.assets", "ggm": "globalgamemanagers.assets"}
GAME = r"D:/SteamLibrary/steamapps/common/Casualties Unknown/CasualtiesUnknown_Data"

idx = json.load(open(os.path.join(OUT, "index.json"), encoding="utf-8"))
tex = idx["textures"]
ok = [e for e in tex if e["ok"]]
fail = [e for e in tex if not e["ok"]]

print("count %d | ok %d | fail %d" % (len(tex), len(ok), len(fail)))
print("FAILURES:")
for e in fail:
    print("   %s pid=%-6d %-28r %s" % (e["file"], e["pathId"], e["name"], e["error"]))

def disk_path(e):
    rel = e["path"]
    assert rel.startswith("out/"), rel
    return os.path.join(OUT, rel[4:].replace("/", os.sep))

png = []
for root, dirs, files in os.walk(os.path.join(OUT, "textures")):
    for f in files:
        if f.lower().endswith(".png"):
            png.append(os.path.abspath(os.path.join(root, f)))
print("PNG on disk: %d | ok entries: %d | EQUAL=%s" % (len(png), len(ok), len(png) == len(ok)))
listed = set(os.path.abspath(disk_path(e)) for e in ok)
print("disk-not-indexed: %d | indexed-missing: %d" % (len(set(png) - listed), len(listed - set(png))))
print("categories:", dict(collections.Counter(e["category"] for e in tex)))
print("ok by file:", dict(collections.Counter(e["file"] for e in ok)))
print("bytes sum in index: %d | on-disk PNG bytes: %d" % (
    sum(e["bytes"] for e in ok), sum(os.path.getsize(p) for p in png)))

# --- independent spot check: UISprite + biggest + a random ui + a random anim
picks = []
uisprite = [e for e in ok if e["name"] == "UISprite"]
picks += uisprite[:1]
big = sorted(ok, key=lambda e: -(e["w"] * e["h"]))[0]
picks.append(big)
rnd = random.Random(11)
picks.append(rnd.choice([e for e in ok if e["category"] == "ui" and e not in picks]))
picks.append(rnd.choice([e for e in ok if e["category"] == "anim"]))
seen, cache = set(), {}
print("\nSPOT CHECK  unitypy re-read | index | disk")
for e in picks:
    k = (e["file"], e["pathId"])
    if k in seen:
        continue
    seen.add(k)
    if e["file"] not in cache:
        cache[e["file"]] = UnityPy.load(os.path.join(GAME, SRC[e["file"]]))
    env = cache[e["file"]]
    o = [x for x in env.objects if x.type.name == "Texture2D" and x.path_id == e["pathId"]][0]
    d = o.read()
    disk = Image.open(disk_path(e))
    united = (d.m_Width, d.m_Height)
    match = united == (e["w"], e["h"]) == disk.size
    print("   %-26s %s pid=%-6d unity=%s index=(%d, %d) disk=%s bytes=%d MATCH=%s" % (
        e["name"][:26], e["file"], e["pathId"], united, e["w"], e["h"], disk.size, e["bytes"], match))

tot = n = 0
for root, dirs, files in os.walk(OUT):
    for f in files:
        n += 1
        tot += os.path.getsize(os.path.join(root, f))
print("\nout/ files: %d bytes: %d (%.1f MB)" % (n, tot, tot / 1048576.0))
per = collections.Counter()
for root, dirs, files in os.walk(os.path.join(OUT, "textures")):
    for f in files:
        per[os.path.basename(root)] += 1
print("per source dir:", dict(per))
print("sheets:", [(s["file"], "%dx%d" % (s["w"], s["h"]), s["cells"]) for s in idx["contactSheets"]])
print("\nUI FIRST 40:", [e["name"] for e in tex if e["category"] == "ui"][:40])
print("\nnames.txt lines:", sum(1 for _ in open(os.path.join(OUT, "names.txt"), encoding="utf-8")))
