import UnityPy, os, json, collections

base = r"D:/SteamLibrary/steamapps/common/Casualties Unknown/CasualtiesUnknown_Data"
files = [("res","resources.assets"),("sh1","sharedassets1.assets"),("sh0","sharedassets0.assets"),("ggm","globalgamemanagers.assets")]
out, errs = [], collections.Counter()

def num(v):
    try:
        return float(v)
    except Exception:
        return None

for tag, f in files:
    env = UnityPy.load(os.path.join(base, f))
    for obj in env.objects:
        if obj.type.type_name if hasattr(obj.type, "type_name") else True:
            pass
        if obj.type.name != "Sprite":
            continue
        try:
            s = obj.read()
            rect = s.m_Rect
            b = s.m_Border
            bl = [num(b.x), num(b.y), num(b.z), num(b.w)]
            if any(x is None for x in bl):
                bl = None
            piv = s.m_Pivot
            tex = None
            try:
                tex = s.m_RD.texture.path_id if s.m_RD and s.m_RD.texture else None
            except Exception:
                tex = None
            out.append({
                "name": s.m_Name, "file": tag, "pathId": obj.path_id,
                "texturePathId": tex,
                "w": int(rect.width), "h": int(rect.height),
                "offsetX": num(rect.x), "offsetY": num(rect.y),
                "border": bl,
                "nineSlice": bool(bl and any(x > 0 for x in bl)),
                "pivotX": num(piv.x), "pivotY": num(piv.y),
                "pixelsToUnits": num(s.m_PixelsToUnits),
            })
        except Exception as e:
            errs[type(e).__name__ + ": " + str(e)[:60]] += 1

out.sort(key=lambda x: (x["file"], x["name"]))
d = r"C:/Users/Administrator/Documents/DSH/Casualties_Unknown/work/art/out"
os.makedirs(d, exist_ok=True)
with open(os.path.join(d, "sprites.json"), "w", encoding="utf-8") as fh:
    json.dump({"generatedBy": "work/art/extract_sprites.py", "count": len(out), "sprites": out}, fh, ensure_ascii=False, indent=1)

nine = [s for s in out if s["nineSlice"]]
print("sprites:", len(out), "| errors:", dict(list(errs.items())[:3]))
print("九宫格:", len(nine))
for s in nine[:20]:
    print("  ", s["name"], s["w"], "x", s["h"], "border", s["border"], s["file"])
