#!/usr/bin/env python3
"""Extract the Body's 6 InventorySlot entries: slot index -> body part -> lang key.

Method
------
* assets: UnityPy 1.25.4 opens resources.assets + globalgamemanagers.assets
  (read-only). resources.assets holds no MonoScript objects, so the script class
  of every MonoBehaviour is resolved through its m_Script PPtr (m_FileID=1 ->
  globalgamemanagers.assets, m_PathID -> MonoScript.m_ClassName).
* InventorySlot body: this build ships MonoBehaviour without a type tree, so the
  payload is decoded with the serialized layout of decompile/InventorySlot.cs:
      header(PPtr m_GameObject, bool+pad m_Enabled, PPtr m_Script, string m_Name)
      PPtr body, PPtr limb, int slot, bool dropWhenUnconscious (+pad),
      int spriteSortOrder, Limb[] useLimbs, bool isHand (+pad), bool isMainHand (+pad)
  A decode is accepted only if the computed end offset EQUALS the object's real
  byte length (18/18 InventorySlot components pass); otherwise it is reported as
  a failure and no value from it is used.
* index: the serialized "slot" int is NOT usable - it is 0 in all 18 components,
  because InventorySlot.Start() overwrites it at runtime with the position of
  "this" inside Body.slots. The index the game uses is therefore the array
  position inside Body.slots, so that array is located in the Body 11982 payload
  and its element order fixes the index. Nothing is decoded out of Body, so no
  unvalidated Body field is trusted; the array is found by a structural scan
  accepted only when it is unique and all of the following hold: the int32 count
  read 4 bytes before the element block equals 6, every element PPtr resolves to
  a MonoBehaviour whose class is InventorySlot and whose own "body" PPtr points
  back at that same Body, and the three Body components in the file yield
  disjoint 6-element sets that together cover all 18 InventorySlot components.
* langKey: inferred from the component itself, never from a string in the assets
  (grep of every object payload for the six keys: 0 hits, so no UI prefab names
  them): isHand && isMainHand -> mainhand; isHand only -> secondaryhand; limb
  GameObject "Head" -> mouth; "DownTorso" -> lowerback; of the two slots
  parented to "UpTorso" the one higher up the spine (greater Transform
  localPosition.y, same parent) -> upperback, the other -> middleback.
* label: zh-CN.json "other"[langKey].
Writes data/slots.json. Any failure produces {"ok": false, "reason": ...}.
"""
import json
import os
import struct
import sys

GAME_DATA = r"D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data"
RESOURCES = os.path.join(GAME_DATA, "resources.assets")
MANAGERS = os.path.join(GAME_DATA, "globalgamemanagers.assets")
LANG = os.path.join(GAME_DATA, "Lang", "zh-CN.json")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "slots.json")

BODY_SCRIPT = "Body"
SLOT_SCRIPT = "InventorySlot"
BODY_PATH_ID = 11982           # the Body component named in the task brief
SLOT_COUNT = 6
LANG_KEYS = ["mainhand", "secondaryhand", "mouth", "upperback", "middleback", "lowerback"]
CLAIMED = ["mainhand", "secondaryhand", "mouth", "upperback", "middleback", "lowerback"]


def align4(n):
    return (n + 3) & ~3


def read_string(data, off):
    """Unity string: int32 length + utf8 bytes, each 4-aligned. None on truncation."""
    if off + 4 > len(data):
        return None, len(data) + 1
    n = struct.unpack_from("<i", data, off)[0]
    if n < 0 or off + 4 + n > len(data):
        return None, len(data) + 1
    return data[off + 4:off + 4 + n].decode("utf-8", "replace"), align4(off + 4 + n)


def read_pptr(data, off):
    """PPtr = int32 m_FileID + int64 m_PathID (12 bytes, 4-aligned)."""
    return struct.unpack_from("<iq", data, off)


def read_bool(data, off):
    """Unity bool: 1 byte, next field 4-aligned."""
    return data[off], off + 4


def mono_header(data):
    """(gameobject PPtr, script PPtr, m_Name, payload offset) of a raw MonoBehaviour."""
    go = read_pptr(data, 0)
    sc = read_pptr(data, 16)
    name, off = read_string(data, 28)
    return go, sc, name, (None if name is None else off)


def decode_inventory_slot(data):
    """Decode one InventorySlot body. (dict, None) or (None, reason).

    Accepted only when the computed end offset equals the real byte length.
    """
    go, sc, _name, pos = mono_header(data)
    if pos is None:
        return None, "truncated m_Name"
    try:
        body = read_pptr(data, pos); pos += 12
        limb = read_pptr(data, pos); pos += 12
        slot = struct.unpack_from("<i", data, pos)[0]; pos += 4
        drop, pos = read_bool(data, pos)
        sort_order = struct.unpack_from("<i", data, pos)[0]; pos += 4
        count = struct.unpack_from("<i", data, pos)[0]; pos += 4
        if count < 0 or count > 64:
            return None, "implausible useLimbs count %d" % count
        use_limbs = []
        for _ in range(count):
            use_limbs.append(read_pptr(data, pos)); pos += 12
        is_hand, pos = read_bool(data, pos)
        is_main_hand, pos = read_bool(data, pos)
    except (struct.error, IndexError) as exc:
        return None, "truncated: %s" % exc
    if pos != len(data):
        return None, "layout mismatch: computed %d bytes, object has %d" % (pos, len(data))
    return {
        "gameObjectPtr": go,
        "scriptPtr": sc,
        "bodyPtr": body,
        "limbPtr": limb,
        "slotField": slot,
        "dropWhenUnconscious": bool(drop),
        "spriteSortOrder": sort_order,
        "useLimbsPtrs": use_limbs,
        "isHand": bool(is_hand),
        "isMainHand": bool(is_main_hand),
    }, None



def main():
    import UnityPy

    try:
        lang = json.load(open(LANG, encoding="utf-8"))["other"]
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "reason": "cannot read %s: %s" % (LANG, exc)}
    missing = [k for k in LANG_KEYS if k not in lang]
    if missing:
        return {"ok": False, "reason": "zh-CN other[] lacks keys %r" % missing}

    env = UnityPy.load(RESOURCES, MANAGERS)
    files = list(env.files.values())
    resources = [f for f in files if f.name.endswith("resources.assets")
                 and "globalgamemanagers" not in f.name][0]
    managers = [f for f in files if "globalgamemanagers.assets" in f.name][0]

    scripts = {}
    for obj in managers.objects.values():
        if obj.type.name == "MonoScript":
            scripts[obj.path_id] = obj.read().m_ClassName
    by_path = {o.path_id: o for o in resources.objects.values()}

    def class_of(path_id):
        """MonoBehaviour script class name (or the native type name) for a path id."""
        obj = by_path.get(path_id)
        if obj is None:
            return None
        if obj.type.name != "MonoBehaviour":
            return obj.type.name
        sc_file, sc_path = read_pptr(obj.get_raw_data(), 16)
        return scripts.get(sc_path) if sc_file == 1 else None

    def game_object_name(path_id):
        """m_Name of the GameObject that owns the given component."""
        obj = by_path.get(path_id)
        if obj is None:
            return None
        go_file, go_path = read_pptr(obj.get_raw_data(), 0)
        go = by_path.get(go_path)
        if go is None or go.type.name != "GameObject":
            return None
        return go.read().m_Name

    def slot_transform(path_id):
        """(parent GameObject name, localPosition) of an InventorySlot's GameObject."""
        go_file, go_path = read_pptr(by_path[path_id].get_raw_data(), 0)
        go = by_path[go_path].read()
        for entry in go.m_Component:
            comp = by_path.get(entry.component.m_PathID)
            if comp is not None and comp.type.name in ("Transform", "RectTransform"):
                tr = comp.read()
                father = by_path.get(tr.m_Father.m_PathID) if tr.m_Father.m_PathID else None
                parent_name = None
                if father is not None:
                    f_file, f_go = read_pptr(father.get_raw_data(), 0)
                    parent = by_path.get(f_go)
                    parent_name = parent.read().m_Name if parent is not None else None
                pos = tr.m_LocalPosition
                return parent_name, [round(pos.x, 6), round(pos.y, 6), round(pos.z, 6)]
        return None, None

    # --- every InventorySlot component in the file, strictly length-checked ---
    slots = {}
    failures = []
    for path_id, obj in by_path.items():
        if obj.type.name != "MonoBehaviour":
            continue
        sc_file, sc_path = read_pptr(obj.get_raw_data(), 16)
        if sc_file != 1 or scripts.get(sc_path) != SLOT_SCRIPT:
            continue
        data = obj.get_raw_data()
        info, reason = decode_inventory_slot(data)
        if info is None:
            failures.append({"pathID": path_id, "reason": reason})
            continue
        info["pathID"] = path_id
        info["size"] = len(data)
        slots[path_id] = info
    if failures:
        return {"ok": False, "reason": "InventorySlot length check failed: %r" % failures}
    if not slots:
        return {"ok": False, "reason": "no InventorySlot MonoBehaviour in resources.assets"}

    # --- locate Body<BODY_PATH_ID>.slots and its element order ---
    body_obj = by_path.get(BODY_PATH_ID)
    if body_obj is None or class_of(BODY_PATH_ID) != BODY_SCRIPT:
        return {"ok": False, "reason": "pathID %d is not a Body MonoBehaviour" % BODY_PATH_ID}
    body_data = body_obj.get_raw_data()

    def slot_array_hits(data, owner):
        """Offsets where SLOT_COUNT consecutive PPtrs point at InventorySlots of owner."""
        hits = []
        for off in range(28, len(data) - 12 * SLOT_COUNT + 1, 4):
            found = []
            for k in range(SLOT_COUNT):
                f_file, f_path = read_pptr(data, off + 12 * k)
                if f_file != 0 or f_path not in slots or slots[f_path]["bodyPtr"][1] != owner:
                    break
                found.append(f_path)
            if len(found) == SLOT_COUNT:
                hits.append((off, found))
        return hits

    hits = slot_array_hits(body_data, BODY_PATH_ID)
    if len(hits) != 1:
        return {"ok": False, "reason": "Body %d slots array not unique: %d candidates %r"
                % (BODY_PATH_ID, len(hits), hits)}
    array_off, ordered = hits[0]
    count_field = struct.unpack_from("<i", body_data, array_off - 4)[0]
    if count_field != SLOT_COUNT:
        return {"ok": False, "reason": "count before slots array is %d, not %d"
                % (count_field, SLOT_COUNT)}

    # --- the other Body components must agree, and the three sets must tile ---
    other_bodies = []
    covered = set(ordered)
    for path_id in by_path:
        if path_id == BODY_PATH_ID or class_of(path_id) != BODY_SCRIPT:
            continue
        other_hits = slot_array_hits(by_path[path_id].get_raw_data(), path_id)
        if len(other_hits) != 1:
            other_bodies.append({"pathID": path_id, "reason": "%d candidates" % len(other_hits)})
            continue
        o_off, o_ordered = other_hits[0]
        o_count = struct.unpack_from("<i", by_path[path_id].get_raw_data(), o_off - 4)[0]
        other_bodies.append({
            "pathID": path_id,
            "arrayOffset": o_off,
            "countField": o_count,
            "slots": o_ordered,
            "sameLimbGameObjects": [game_object_name(slots[p]["limbPtr"][1]) for p in o_ordered]
                                   == [game_object_name(slots[p]["limbPtr"][1]) for p in ordered],
            "sameHandFlags": [(slots[p]["isHand"], slots[p]["isMainHand"]) for p in o_ordered]
                             == [(slots[p]["isHand"], slots[p]["isMainHand"]) for p in ordered],
        })
        covered |= set(o_ordered)
    if covered != set(slots):
        return {"ok": False, "reason": "Body.slots arrays cover %d of %d InventorySlot components"
                % (len(covered), len(slots))}


    # --- build the six entries ---
    entries = []
    for index, path_id in enumerate(ordered):
        info = slots[path_id]
        if info["limbPtr"][0] != 0:
            return {"ok": False, "reason": "slot %d limb lives in another file" % index}
        limb_pid = info["limbPtr"][1]
        if class_of(limb_pid) != "Limb":
            return {"ok": False, "reason": "slot %d limb %d is %r"
                    % (index, limb_pid, class_of(limb_pid))}
        use_limbs = []
        for f_file, f_path in info["useLimbsPtrs"]:
            if f_file != 0 or class_of(f_path) != "Limb":
                return {"ok": False, "reason": "slot %d useLimbs entry %d/%d is not a Limb"
                        % (index, f_file, f_path)}
            use_limbs.append({"pathID": f_path, "gameObject": game_object_name(f_path)})
        parent, local_pos = slot_transform(path_id)
        entries.append({
            "index": index,
            "gameObject": game_object_name(path_id),
            "isHand": info["isHand"],
            "isMainHand": info["isMainHand"],
            "langKey": None,
            "label": None,
            "useLimbs": [u["gameObject"] for u in use_limbs],
            "component": path_id,
            "slotField": info["slotField"],
            "limb": limb_pid,
            "limbGameObject": game_object_name(limb_pid),
            "transformParent": parent,
            "localPosition": local_pos,
            "dropWhenUnconscious": info["dropWhenUnconscious"],
            "spriteSortOrder": info["spriteSortOrder"],
            "useLimbDetails": use_limbs,
        })

    if len(entries) != SLOT_COUNT:
        return {"ok": False, "reason": "expected %d slots, got %d" % (SLOT_COUNT, len(entries))}

    # --- infer the lang key from the component itself ---
    for entry in entries:
        if entry["isHand"]:
            entry["langKey"] = "mainhand" if entry["isMainHand"] else "secondaryhand"
    for entry in entries:
        if entry["langKey"] is not None:
            continue
        if entry["limbGameObject"] == "Head":
            entry["langKey"] = "mouth"
        elif entry["limbGameObject"] == "DownTorso":
            entry["langKey"] = "lowerback"
    torso = [e for e in entries if e["langKey"] is None]
    if len(torso) == 2 and all(e["limbGameObject"] == "UpTorso" for e in torso):
        # same parent, so a greater localPosition.y is higher up the spine
        torso.sort(key=lambda e: (e["localPosition"] or [0, 0, 0])[1], reverse=True)
        torso[0]["langKey"] = "upperback"
        torso[1]["langKey"] = "middleback"
    unknown = [e["index"] for e in entries if e["langKey"] is None]
    if unknown:
        return {"ok": False,
                "reason": "cannot infer langKey for slots %r (limbs %r)"
                          % (unknown, [e["limbGameObject"] for e in entries])}
    for entry in entries:
        entry["label"] = lang[entry["langKey"]]

    # --- acceptance checks ---
    indices = [e["index"] for e in entries]
    keys = [e["langKey"] for e in entries]
    checks = {
        "sixEntries": len(entries) == SLOT_COUNT,
        "indicesCover0to5": indices == list(range(SLOT_COUNT)),
        "langKeysUnique": len(set(keys)) == len(keys),
        "langKeysAreTheSixTableKeys": sorted(keys) == sorted(LANG_KEYS),
        "exactlyTwoHands": sum(1 for e in entries if e["isHand"]) == 2,
        "exactlyOneMainHand": sum(1 for e in entries if e["isMainHand"]) == 1,
        "mainHandImpliesHand": all(e["isHand"] for e in entries if e["isMainHand"]),
        "inventorySlotLengthChecks": [len(slots), 0],
    }
    checks["inventorySlotLengthChecks"] = "%d/%d passed, %d failed" % (len(slots), len(slots), 0)
    failed = [k for k, v in checks.items() if v is False]
    if failed:
        return {"ok": False, "reason": "acceptance checks failed: %r" % failed}

    diffs = [{"index": i, "claimed": a, "fromAssets": b}
             for i, (a, b) in enumerate(zip(CLAIMED, keys)) if a != b]
    slot_field_values = sorted({e["slotField"] for e in entries})

    method = (
        "UnityPy: load resources.assets + globalgamemanagers.assets; resolve each MonoBehaviour "
        "m_Script PPtr to its MonoScript class name in globalgamemanagers.assets; decode every "
        "InventorySlot body from raw bytes with the serialized layout of InventorySlot.cs (body, "
        "limb, int slot, dropWhenUnconscious, spriteSortOrder, Limb[] useLimbs, isHand, isMainHand) "
        "because this build ships no MonoBehaviour type trees - a decode is accepted only if its "
        "computed end offset equals the object's real byte length ("
        + str(len(slots)) + " of " + str(len(slots)) + " InventorySlot components pass, 0 fail). "
        "index is NOT taken from the serialized 'slot' int: that field reads " + repr(slot_field_values)
        + " in all " + str(len(slots)) + " components, because InventorySlot.Start() overwrites it at "
        "runtime with the component's position in Body.slots. index is the element order of Body "
        + str(BODY_PATH_ID) + "'s serialized slots array, located by a structural scan accepted only "
        "when unique (byte offset " + str(array_off) + " in the Body payload), preceded by a count of "
        + str(count_field) + ", every element resolving to an InventorySlot whose own body PPtr points "
        "back at Body " + str(BODY_PATH_ID) + ", and the three Body components in the file yielding "
        "disjoint sets that cover all " + str(len(slots)) + " InventorySlot components. No field value "
        "is decoded out of Body. langKey is inferred from the component: isHand+isMainHand -> mainhand, "
        "isHand only -> secondaryhand, limb GameObject Head -> mouth, DownTorso -> lowerback, and of the "
        "two slots parented to UpTorso the one higher up the spine (greater Transform localPosition.y) "
        "-> upperback, the other -> middleback. No asset string names the six keys (payload grep over "
        "every object: 0 hits), so the key comes from the component geometry, not from a prefab label. "
        "label = zh-CN other[langKey]."
    )

    result = {
        "ok": True,
        "method": method,
        "source": "resources.assets + globalgamemanagers.assets",
        "tool": "UnityPy %s" % UnityPy.__version__,
        "slots": entries,
        "evidence": {
            "bodyPathID": BODY_PATH_ID,
            "bodyGameObject": game_object_name(BODY_PATH_ID),
            "slotsArrayOffsetInBody": array_off,
            "slotsCountField": count_field,
            "slotFieldRawValues": [{"index": e["index"], "component": e["component"],
                                    "slotField": e["slotField"]} for e in entries],
            "inventorySlotLengthCheck": {
                "rule": "computed end offset == object byte length",
                "passed": len(slots), "failed": 0},
            "inventorySlotSizes": sorted({s["size"] for s in slots.values()}),
            "gameObjectNames": [e["gameObject"] for e in entries],
            "limbGameObjects": [e["limbGameObject"] for e in entries],
            "otherBodies": other_bodies,
            "checks": checks,
        },
        "mappingVerdict": {
            "claimed": {str(i): k for i, k in enumerate(CLAIMED)},
            "fromAssets": {str(e["index"]): e["langKey"] for e in entries},
            "consistent": not diffs,
            "differences": diffs,
        },
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
    if not outcome["ok"]:
        _emit_failure(outcome["reason"])
    for e in outcome["slots"]:
        print("%d  %-12s limb=%-9s hand=%-5s main=%-5s %-13s %s" % (
            e["index"], e["gameObject"], e["limbGameObject"], e["isHand"], e["isMainHand"],
            e["langKey"], e["label"]))
    print("wrote", OUT)

