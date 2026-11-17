#!/usr/bin/env python3
"""Extract item id -> icon Texture2D name from the game's item prefabs.

Method
------
* assets: UnityPy opens resources.assets + globalgamemanagers.assets (read-only).
  resources.assets holds no MonoScript objects, so a MonoBehaviour's class is
  resolved through its m_Script PPtr (m_FileID=1 -> globalgamemanagers.assets,
  m_PathID -> MonoScript.m_ClassName).
* item prefab: a GameObject with a component whose class is "Item"; the item id
  is the first serialized field of the Item body. This build ships MonoBehaviour
  without a type tree, so the body is decoded from raw bytes with the field
  order of decompile/Item.cs:
      header(PPtr m_GameObject, bool m_Enabled + pad, PPtr m_Script, string m_Name)
      string id, float condition, bool favourited (+pad), string label,
      int colorSwatch, PPtr rb, PPtr affect, float wetTime, PPtr battery,
      float decayMultiplier, PPtr currentChunk
  (private Container cont has no [SerializeField] and Item.cs contains no
  SerializeField attribute at all, so cont is not serialized.) A decode is
  accepted only if its computed end offset EQUALS the object's real byte
  length; a failing decode is counted and skipped, never guessed.
* icon: the prefab's SpriteRenderer (own components first, else one level down
  through Transform.m_Children) -> m_Sprite PPtr -> Sprite ->
  m_RD.texture PPtr -> Texture2D.m_Name.
* the value written for an id must be a Texture2D name that really exists in
  art/out/index.json; a value outside that set goes to "missing" with the
  reason instead of being written to "icons". Nothing is invented: an item
  whose chain does not resolve stays in "missing".
Writes data/itemicons.json. Output contains no timestamp, so two runs are
byte-identical.
"""
import json
import os
import re
import struct
import sys

GAME_DATA = r"D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data"
RESOURCES = os.path.join(GAME_DATA, "resources.assets")
MANAGERS = os.path.join(GAME_DATA, "globalgamemanagers.assets")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "art", "out", "index.json")
ITEM_CS = os.path.join(ROOT, "decompile", "Item.cs")
OUT = os.path.join(ROOT, "data", "itemicons.json")

ITEM_SCRIPT = "Item"
MAX_CHILD_DEPTH = 1          # prefab itself, then one level of children
ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


def align4(n):
    return (n + 3) & ~3


def read_string(data, off):
    """Unity string: int32 length + utf8 bytes, each 4-aligned. (None, end) on truncation."""
    if off + 4 > len(data):
        return None, len(data) + 1
    n = struct.unpack_from("<i", data, off)[0]
    if n < 0 or off + 4 + n > len(data):
        return None, len(data) + 1
    return data[off + 4:off + 4 + n].decode("utf-8", "replace"), align4(off + 4 + n)


def read_pptr(data, off):
    """PPtr = int32 m_FileID + int64 m_PathID (12 bytes, 4-aligned)."""
    return struct.unpack_from("<iq", data, off)


def mono_header(data):
    """(gameobject PPtr, script PPtr, m_Name, payload offset) of a raw MonoBehaviour."""
    go = read_pptr(data, 0)
    sc = read_pptr(data, 16)
    name, off = read_string(data, 28)
    return go, sc, name, (None if name is None else off)


def decode_item(data):
    """Decode one Item body. (dict, None) or (None, reason).

    Accepted only when the computed end offset equals the real byte length.
    """
    _go, _sc, _name, pos = mono_header(data)
    if pos is None:
        return None, "truncated m_Name"
    try:
        item_id, pos = read_string(data, pos)
        if item_id is None:
            return None, "truncated id"
        condition = struct.unpack_from("<f", data, pos)[0]; pos += 4
        favourited = data[pos]; pos += 4                       # bool + 3 pad
        label, pos = read_string(data, pos)
        if label is None:
            return None, "truncated label"
        color_swatch = struct.unpack_from("<i", data, pos)[0]; pos += 4
        rb = read_pptr(data, pos); pos += 12
        affect = read_pptr(data, pos); pos += 12
        wet_time = struct.unpack_from("<f", data, pos)[0]; pos += 4
        battery = read_pptr(data, pos); pos += 12
        decay_multiplier = struct.unpack_from("<f", data, pos)[0]; pos += 4
        current_chunk = read_pptr(data, pos); pos += 12
    except (struct.error, IndexError) as exc:
        return None, "truncated: %s" % exc
    if pos != len(data):
        return None, "layout mismatch: computed %d bytes, object has %d" % (pos, len(data))
    return {
        "id": item_id,
        "condition": condition,
        "favourited": bool(favourited),
        "label": label,
        "colorSwatch": color_swatch,
        "rb": rb,
        "affect": affect,
        "wetTime": wet_time,
        "battery": battery,
        "decayMultiplier": decay_multiplier,
        "currentChunk": current_chunk,
        "size": len(data),
    }, None


def item_ids():
    """The authoritative 300-id table, as extract_containers.py reads it."""
    text = open(ITEM_CS, encoding="utf-8").read()
    ids = re.findall(r'GlobalItems\.Add\("([^"]+)"', text)
    assert len(ids) == len(set(ids)), "duplicate ids in Item.cs"
    return ids


def main():
    import UnityPy

    table = item_ids()
    index = json.load(open(INDEX, encoding="utf-8"))
    tex_names = set(t["name"] for t in index["textures"] if t.get("name"))

    env = UnityPy.load(RESOURCES, MANAGERS)
    files = list(env.files.values())
    resources = [f for f in files if f.name.endswith("resources.assets")
                 and "globalgamemanagers" not in f.name][0]
    managers = [f for f in files if "globalgamemanagers.assets" in f.name][0]

    scripts = {}
    for obj in managers.objects.values():
        if obj.type.name == "MonoScript":
            scripts[obj.path_id] = obj.read().m_ClassName
    if ITEM_SCRIPT not in scripts.values():
        return {"ok": False, "reason": "MonoScript %r not found in globalgamemanagers.assets"
                % ITEM_SCRIPT}

    by_path = {o.path_id: o for o in resources.objects.values()}

    def class_of(path_id):
        obj = by_path.get(path_id)
        if obj is None:
            return None
        if obj.type.name != "MonoBehaviour":
            return obj.type.name
        sc_file, sc_path = read_pptr(obj.get_raw_data(), 16)
        return scripts.get(sc_path) if sc_file == 1 else None

    # --- every Item component, strictly length-checked ---
    item_failures = []
    prefabs = {}                 # item id -> [ {goPathID, goName, componentPathID, size} ]
    for path_id, obj in sorted(by_path.items()):
        if obj.type.name != "MonoBehaviour":
            continue
        data = obj.get_raw_data()
        sc_file, sc_path = read_pptr(data, 16)
        if sc_file != 1 or scripts.get(sc_path) != ITEM_SCRIPT:
            continue
        info, reason = decode_item(data)
        if info is None:
            item_failures.append({"pathID": path_id, "reason": reason})
            continue
        if not info["id"] or not ID_RE.match(info["id"]):
            item_failures.append({"pathID": path_id, "reason": "implausible id %r" % info["id"]})
            continue
        go_file, go_path = read_pptr(data, 0)
        go = by_path.get(go_path)
        go_name = go.read().m_Name if go is not None and go.type.name == "GameObject" else None
        prefabs.setdefault(info["id"], []).append({
            "goPathID": go_path,
            "goName": go_name,
            "componentPathID": path_id,
            "size": info["size"],
        })
    if not prefabs:
        return {"ok": False, "reason": "no Item component in resources.assets"}

    def child_gameobjects(go_path_id):
        """GameObjects of the Transform children of a GameObject (one level)."""
        go = by_path.get(go_path_id)
        if go is None or go.type.name != "GameObject":
            return []
        out = []
        for entry in go.read().m_Component:
            comp = by_path.get(entry.component.m_PathID)
            if comp is None or comp.type.name not in ("Transform", "RectTransform"):
                continue
            tr = comp.read()
            for child in tr.m_Children or []:
                c_obj = by_path.get(child.m_PathID)
                if c_obj is None:
                    continue
                c_file, c_go = read_pptr(c_obj.get_raw_data(), 0)
                if c_file == 0 and c_go:
                    out.append(c_go)
        return out

    def sprite_renderers(go_path_id):
        go = by_path.get(go_path_id)
        if go is None or go.type.name != "GameObject":
            return []
        return [e.component.m_PathID for e in go.read().m_Component
                if class_of(e.component.m_PathID) == "SpriteRenderer"]

    def resolve_icon(go_path_id):
        """(record, None) or (None, reason) for one prefab GameObject."""
        for depth in range(0, MAX_CHILD_DEPTH + 1):
            owners = [go_path_id] if depth == 0 else child_gameobjects(go_path_id)
            for owner in owners:
                srs = sprite_renderers(owner)
                if not srs:
                    continue
                sr_path = srs[0]
                sr = by_path[sr_path].read()
                sprite_ptr = (int(sr.m_Sprite.m_FileID), int(sr.m_Sprite.m_PathID))
                if sprite_ptr[1] == 0:
                    return None, "SpriteRenderer %d has a null m_Sprite" % sr_path
                if sprite_ptr[0] != 0:
                    return None, ("SpriteRenderer %d m_Sprite lives in another file (m_FileID=%d)"
                                  % (sr_path, sprite_ptr[0]))
                s_obj = by_path.get(sprite_ptr[1])
                if s_obj is None or s_obj.type.name != "Sprite":
                    return None, ("SpriteRenderer %d m_Sprite %d is %r"
                                  % (sr_path, sprite_ptr[1], None if s_obj is None
                                     else s_obj.type.name))
                sprite = s_obj.read()
                tex_ptr = (int(sprite.m_RD.texture.m_FileID), int(sprite.m_RD.texture.m_PathID))
                if tex_ptr[1] == 0:
                    return None, "Sprite %d has a null m_RD.texture" % sprite_ptr[1]
                if tex_ptr[0] != 0:
                    return None, ("Sprite %d m_RD.texture lives in another file (m_FileID=%d)"
                                  % (sprite_ptr[1], tex_ptr[0]))
                t_obj = by_path.get(tex_ptr[1])
                if t_obj is None or t_obj.type.name != "Texture2D":
                    return None, ("Sprite %d m_RD.texture %d is %r"
                                  % (sprite_ptr[1], tex_ptr[1], None if t_obj is None
                                     else t_obj.type.name))
                texture = t_obj.read()
                return {
                    "texture": texture.m_Name,
                    "width": int(texture.m_Width),
                    "height": int(texture.m_Height),
                    "spriteRenderer": sr_path,
                    "sprite": sprite_ptr[1],
                    "spriteName": sprite.m_Name,
                    "texturePathID": tex_ptr[1],
                    "ownerGameObject": owner,
                    "childDepth": depth,
                }, None
        return None, "no SpriteRenderer on the prefab or one level of children"

    icons = {}
    evidence = {}
    missing = []
    missing_reasons = {}
    conflicts = []
    anomalies = []
    depth_counts = {}
    prefab_only = []

    for item_id in sorted(table):
        entries = sorted(prefabs.get(item_id, []), key=lambda e: (e["goName"] or "", e["goPathID"]))
        if not entries:
            missing.append(item_id)
            missing_reasons[item_id] = "no GameObject in resources.assets carries an Item component with this id"
            continue
        found = []
        reasons = []
        for entry in entries:
            rec, reason = resolve_icon(entry["goPathID"])
            if rec is None:
                reasons.append("%s(%d): %s" % (entry["goName"], entry["goPathID"], reason))
                continue
            rec = dict(rec)
            rec["goName"] = entry["goName"]
            rec["goPathID"] = entry["goPathID"]
            rec["componentPathID"] = entry["componentPathID"]
            found.append(rec)
        if not found:
            missing.append(item_id)
            missing_reasons[item_id] = "; ".join(sorted(set(reasons)))
            continue
        distinct = sorted(set(r["texture"] for r in found))
        if len(distinct) > 1:
            conflicts.append({"id": item_id, "textures": distinct,
                              "picked": found[0]["texture"]})
        rec = found[0]
        if rec["texture"] not in tex_names:
            missing.append(item_id)
            missing_reasons[item_id] = ("Texture2D %r (pathID %d) resolved from the prefab is not a "
                                        "name in %s" % (rec["texture"], rec["texturePathID"],
                                                        os.path.relpath(INDEX, ROOT).replace(os.sep, "/")))
            continue
        icons[item_id] = rec["texture"]
        evidence[item_id] = ("Item(%d) @ GameObject '%s'(%d) -> SpriteRenderer(%d) -> "
                             "Sprite('%s' %d)%s -> Texture2D('%s' %d) %dx%d"
                             % (rec["componentPathID"], rec["goName"], rec["goPathID"],
                                rec["spriteRenderer"], rec["spriteName"], rec["sprite"],
                                "" if rec["childDepth"] == 0 else " [child depth %d]" % rec["childDepth"],
                                rec["texture"], rec["texturePathID"], rec["width"], rec["height"]))
        depth_counts[rec["childDepth"]] = depth_counts.get(rec["childDepth"], 0) + 1
        if item_id not in tex_names:
            prefab_only.append(item_id)
        elif rec["texture"] != item_id:
            anomalies.append({"id": item_id, "idNameTexture": item_id, "prefabTexture": rec["texture"],
                              "note": "the id already names a Texture2D, but the item prefab references a different one"})

    item_components = sum(len(v) for v in prefabs.values())
    orphan_ids = sorted(set(prefabs) - set(table))

    # --- acceptance checks ---
    bad = [k for k, v in icons.items() if v not in tex_names]
    checks = {
        "everyIconIsARealTexture2DName": not bad,
        "coverageAtLeast290": len(icons) >= 290,
        "lengthCheckHadNoFailures": not item_failures,
        "idsCovered": len(icons),
        "idsMissing": len(missing),
        "prefabOnlyResolved": len(prefab_only),
    }
    if bad or item_failures:
        return {"ok": False, "reason": "checks failed: %r / %r" % (bad, item_failures)}

    result = {
        "generatedBy": "work/tools/extract_itemicons.py",
        "count": len(table),
        "icons": icons,
        "missing": missing,
        "evidence": evidence,
        "missingReasons": missing_reasons,
        "stats": {
            "itemTableIds": len(table),
            "iconsResolved": len(icons),
            "stillMissing": len(missing),
            "resolvedOnlyViaPrefab": len(prefab_only),
            "resolvedOnlyViaPrefabIds": prefab_only,
            "sameNameIdsOverriddenByPrefab": anomalies,
            "duplicatePrefabConflicts": conflicts,
            "spriteRendererDepth": {str(k): v for k, v in sorted(depth_counts.items())},
            "itemComponentsLengthChecked": item_components,
            "itemLengthCheck": {"rule": "computed end offset == object byte length",
                                "passed": sum(len(v) for v in prefabs.values()), "failed": 0},
            "orphanPrefabIds": orphan_ids,
        },
        "checks": checks,
        "method": (
            "UnityPy %s: load resources.assets + globalgamemanagers.assets; resolve each MonoBehaviour "
            "m_Script PPtr to its MonoScript class in globalgamemanagers.assets; item prefabs are "
            "GameObjects carrying an 'Item' component, whose id is decoded from the Item body using the "
            "serialized layout of decompile/Item.cs (string id, float condition, bool favourited, "
            "string label, int colorSwatch, PPtr rb, PPtr affect, float wetTime, PPtr battery, float "
            "decayMultiplier, PPtr currentChunk) because this build ships no MonoBehaviour type trees - "
            "a decode is accepted only if its computed end offset equals the object's real byte length. "
            "The icon is the prefab SpriteRenderer's m_Sprite PPtr -> Sprite.m_RD.texture PPtr -> "
            "Texture2D.m_Name, taken from the prefab itself or one level of Transform children; every "
            "value is required to exist as a Texture2D name in art/out/index.json." % UnityPy.__version__),
        "ok": True,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return result


def _emit_failure(reason):
    outcome = {"ok": False, "reason": reason}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(outcome, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("FAILED:", reason, file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    outcome = main()
    if not outcome.get("ok"):
        _emit_failure(outcome["reason"])
    st = outcome["stats"]
    print("item ids in table       :", st["itemTableIds"])
    print("icons resolved          :", st["iconsResolved"])
    print("still missing           :", st["stillMissing"], outcome["missing"])
    print("Item length check       : %d/%d passed, %d failed"
          % (st["itemLengthCheck"]["passed"], st["itemComponentsLengthChecked"], 0))
    print("SpriteRenderer depth    :", st["spriteRendererDepth"])
    print("resolved only via prefab:", st["resolvedOnlyViaPrefab"])
    print("  ", st["resolvedOnlyViaPrefabIds"])
    print("id-name ids whose prefab points elsewhere:", st["sameNameIdsOverriddenByPrefab"])
    print("duplicate prefab conflicts:", st["duplicatePrefabConflicts"])
    print("orphan prefab ids       :", st["orphanPrefabIds"])
    for probe in ("bigpack", "hoodie", "aichip", "foliage"):
        print("  %-8s -> %r  %s" % (probe, outcome["icons"].get(probe), outcome["evidence"].get(probe)))
    print("checks                  :", outcome["checks"])
    print("wrote", OUT)
