# -*- coding: utf-8 -*-
"""Extract every Texture2D of Casualties Unknown to PNG, plus an index,
a name list and per-category contact sheets.

Re-runnable:  python work/art/extract_textures.py [--limit N] [--skip-contact] [--outdir DIR]

Game directory is opened read-only; every write lands under work/art/.
"""
import argparse
import json
import math
import os
import re
import time
from collections import Counter, defaultdict

import UnityPy
from PIL import Image, ImageDraw, ImageFont

BASE = r"D:/SteamLibrary/steamapps/common/Casualties Unknown/CasualtiesUnknown_Data"
SOURCES = [
    ("resources.assets", "res"),
    ("sharedassets1.assets", "sh1"),
    ("sharedassets0.assets", "sh0"),
    ("globalgamemanagers.assets", "ggm"),
]
ART_DIR = os.path.dirname(os.path.abspath(__file__))
GEN_BY = "work/art/extract_textures.py"

MAX_PAGE_PX = 4000
MAX_PAGE_CELLS = 200
CELL_W, CELL_H, BOX = 112, 130, 96
THUMB_PX = 64

# ---------------------------------------------------------------- naming ----
_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED = ({"CON", "PRN", "AUX", "NUL"}
             | {"COM%d" % i for i in range(1, 10)}
             | {"LPT%d" % i for i in range(1, 10)})


def safe_name(name):
    s = (name or "").strip()
    s = _BAD.sub("_", s)
    s = s.strip(" .")
    if not s:
        return None
    if s.split(".")[0].upper() in _RESERVED:
        s = "_" + s
    if len(s) > 120:
        s = s[:120]
    return s


# ------------------------------------------------------------ categorise ----
ANIM_KEYS = ("frame_", "_frame", "delay", "anim")
FONT_KEYS = ("atlas", "sdf", "font", "noto", "retro", "consolas", "unifont",
             "tahoma", "arial", "typeface")
UI_KEYS = ("ui", "panel", "frame", "button", "bar", "slot", "window", "cursor",
           "icon", "sprite", "mask", "menu", "tab", "toggle", "slider",
           "scroll", "tooltip", "checkbox", "radial", "hover", "border",
           "background", "hud", "meter", "progress", "prompt",
           "favourite", "favorite", "overlay", "logo", "screen", "grid",
           "pixel", "shade", "darkened", "highlight", "marker")
# short/ambiguous keys: require a real word or camelCase boundary, otherwise
# "bar" hits barbed-wire and "tab" hits sidestabber.
_AMBIG = {"ui", "bar", "tab"}
CHAR_KEYS = ("head", "body", "limb", "hand", "arm", "leg", "foot", "torso",
             "eye", "mouth", "face", "dune", "creature", "monster", "npc",
             "player", "char", "survivor", "skin", "hair", "blood", "wound",
             "injur", "pain", "bone", "organ")
ITEM_KEYS = ("item", "inventory", "loot", "resource", "rock", "ore", "wood",
             "stone", "metal", "food", "water", "medicine", "pill", "bandage",
             "tool", "weapon", "gun", "ammo", "clip", "crate", "box", "pickup",
             "chip", "cartridge", "battery", "scrap", "craft")


def _hit(name, keys):
    low = name.lower()
    for k in keys:
        if k not in low:
            continue
        if k not in _AMBIG:
            return True
        for m in re.finditer(re.escape(k), low):
            before = low[m.start() - 1] if m.start() else ""
            if before and before.isalnum():
                continue
            after = name[m.end()] if m.end() < len(name) else ""
            if after and after.isalnum() and not after.isupper():
                continue
            return True
    return False


def categorize(name):
    """Crude name heuristic; order matters (anim/font win over ui)."""
    n = (name or "").lower()
    if _hit(n, ANIM_KEYS):
        return "anim"
    if _hit(n, FONT_KEYS):
        return "font"
    if _hit(n, UI_KEYS):
        return "ui"
    if _hit(n, CHAR_KEYS):
        return "char"
    if _hit(n, ITEM_KEYS):
        return "item"
    return "other"


# ----------------------------------------------------------------- sheet ----
def load_font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def make_thumb(img):
    t = img.convert("RGBA")
    t.thumbnail((THUMB_PX, THUMB_PX), Image.LANCZOS)
    return t


def checker(draw, x, y, w, h, step=8):
    for yy in range(0, h, step):
        for xx in range(0, w, step):
            c = (204, 204, 204, 255) if ((xx // step + yy // step) % 2 == 0) else (245, 245, 245, 255)
            draw.rectangle([x + xx, y + yy, x + min(xx + step, w) - 1, y + min(yy + step, h) - 1], fill=c)


def build_sheets(thumbs, outdir, font):
    made = []
    for cat in sorted(thumbs):
        items = sorted(thumbs[cat], key=lambda t: (t[0].lower(), t[0]))
        n = len(items)
        if not n:
            continue
        pages = int(math.ceil(n / float(MAX_PAGE_CELLS)))
        for p in range(pages):
            chunk = items[p * MAX_PAGE_CELLS:(p + 1) * MAX_PAGE_CELLS]
            cols = max(1, min(MAX_PAGE_PX // CELL_W,
                               int(math.ceil(math.sqrt(len(chunk) * CELL_H / float(CELL_W))))))
            rows = int(math.ceil(len(chunk) / float(cols)))
            while rows * CELL_H > MAX_PAGE_PX:
                cols += 1
                rows = int(math.ceil(len(chunk) / float(cols)))
            sheet = Image.new("RGBA", (cols * CELL_W, rows * CELL_H), (255, 255, 255, 255))
            d = ImageDraw.Draw(sheet)
            for i, (nm, th) in enumerate(chunk):
                cx = (i % cols) * CELL_W
                cy = (i // cols) * CELL_H
                checker(d, cx + 4, cy + 4, BOX, BOX)
                ox = cx + 4 + (BOX - th.width) // 2
                oy = cy + 4 + (BOX - th.height) // 2
                sheet.alpha_composite(th, (ox, oy))
                d.rectangle([cx + 4, cy + 4, cx + 4 + BOX - 1, cy + 4 + BOX - 1], outline=(120, 120, 120, 255))
                label = nm
                while label and d.textlength(label, font=font) > CELL_W - 8:
                    label = label[:-1]
                if label != nm:
                    label = (label[:-1] + "~") if len(label) > 1 else label
                d.text((cx + 4, cy + 4 + BOX + 3), label, fill=(0, 0, 0, 255), font=font)
            if pages > 1:
                fn = "contact_%s_%d.png" % (cat, p + 1)
            else:
                fn = "contact_%s.png" % cat
            sheet.convert("RGB").save(os.path.join(outdir, fn), "PNG")
            made.append((fn, sheet.width, sheet.height, len(chunk)))
    return made


# ------------------------------------------------------------------ main ----
def run(outdir, limit=0, skip_contact=False):
    texdir = os.path.join(outdir, "textures")
    os.makedirs(texdir, exist_ok=True)
    entries = []
    thumbs = defaultdict(list)
    dropped = Counter()
    t0 = time.time()
    done = 0

    for fname, short in SOURCES:
        env = UnityPy.load(os.path.join(BASE, fname))
        objs = [o for o in env.objects if o.type.name == "Texture2D"]
        objs.sort(key=lambda o: o.path_id)
        src_dir = os.path.join(texdir, short)
        os.makedirs(src_dir, exist_ok=True)
        used = set()
        for o in objs:
            if limit and done >= limit:
                break
            pid = o.path_id
            rec = {"name": None, "file": short, "pathId": pid, "w": 0, "h": 0,
                   "path": None, "bytes": 0, "category": "other", "ok": False,
                   "error": None}
            done += 1
            try:
                data = o.read()
            except Exception as e:
                rec["error"] = "read: " + repr(e)[:200]
                entries.append(rec)
                dropped["read"] += 1
                continue
            name = getattr(data, "m_Name", None) or ("unnamed_%d" % pid)
            rec["name"] = name
            rec["category"] = categorize(name)
            rec["w"] = int(getattr(data, "m_Width", 0) or 0)
            rec["h"] = int(getattr(data, "m_Height", 0) or 0)
            if rec["w"] == 0 or rec["h"] == 0:
                rec["error"] = "empty %dx%d" % (rec["w"], rec["h"])
                entries.append(rec)
                dropped["zero"] += 1
                continue
            try:
                img = data.image
                if img is None:
                    raise ValueError("image is None")
                img.load()
            except Exception as e:
                rec["error"] = "decode: " + repr(e)[:200]
                entries.append(rec)
                dropped["decode"] += 1
                continue
            rec["w"], rec["h"] = img.size
            base = safe_name(name) or ("unnamed_%d" % pid)
            fn = base + ".png"
            if fn.lower() in used:
                fn = "%s__%d.png" % (base, pid)
                k = 2
                while fn.lower() in used:
                    fn = "%s__%d_%d.png" % (base, pid, k)
                    k += 1
            used.add(fn.lower())
            fpath = os.path.join(src_dir, fn)
            try:
                img.save(fpath, "PNG")
            except Exception as e:
                rec["error"] = "save: " + repr(e)[:200]
                entries.append(rec)
                dropped["save"] += 1
                continue
            rec["ok"] = True
            rec["bytes"] = os.path.getsize(fpath)
            rec["path"] = "out/textures/%s/%s" % (short, fn)
            try:
                thumbs[rec["category"]].append((fn[:-4], make_thumb(img)))
            except Exception:
                pass
            del img, data
            entries.append(rec)
        print("[%s] %s: %d Texture2D  (%.1fs)" % (short, fname, len(objs), time.time() - t0), flush=True)

    font = load_font(10)
    sheets = [] if skip_contact else build_sheets(thumbs, outdir, font)

    ok = [e for e in entries if e["ok"]]
    failed = [e for e in entries if not e["ok"]]
    cats = Counter(e["category"] for e in entries)
    per_file = Counter(e["file"] for e in entries)
    per_file_ok = Counter(e["file"] for e in ok)

    index = {
        "generatedBy": GEN_BY,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": BASE,
        "count": len(entries),
        "okCount": len(ok),
        "failCount": len(failed),
        "countByFile": dict(per_file),
        "okByFile": dict(per_file_ok),
        "categoryCounts": dict(cats),
        "failures": [{"name": e["name"], "file": e["file"], "pathId": e["pathId"],
                      "error": e["error"]} for e in failed],
        "contactSheets": [{"file": s[0], "w": s[1], "h": s[2], "cells": s[3]} for s in sheets],
        "textures": entries,
    }
    with open(os.path.join(outdir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    rows = sorted(entries, key=lambda e: ((e["name"] or "").lower(), e["name"] or "", e["file"]))
    with open(os.path.join(outdir, "names.txt"), "w", encoding="utf-8") as f:
        for e in rows:
            f.write("%s\t%dx%d\t%s\n" % (e["name"], e["w"], e["h"], e["file"]))

    print("\n== done in %.1fs" % (time.time() - t0))
    print("   entries %d | ok %d | fail %d | dropped %s" % (len(entries), len(ok), len(failed), dict(dropped)))
    print("   by file: %s" % dict(per_file))
    print("   categories: %s" % dict(cats))
    print("   sheets: %s" % [(s[0], s[3]) for s in sheets])
    return index


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--outdir", default=os.path.join(ART_DIR, "out"))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--skip-contact", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.outdir, exist_ok=True)
    run(a.outdir, a.limit, a.skip_contact)
