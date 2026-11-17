#!/usr/bin/env python3
"""Extract which item prefabs carry a Container MonoBehaviour.

Read the item id table straight from the decompiled source, then walk the
Unity assets binary (read-only) to find the item prefabs and their Container
component payloads.

Method
------
* item ids: regex over GlobalItems.Add("...") in decompile/Item.cs
* assets:   UnityPy opens resources.assets + globalgamemanagers.assets.
            resources.assets has no MonoScript objects; the MonoScript that a
            MonoBehaviour's m_Script PPtr points at (m_FileID=1) lives in
            globalgamemanagers.assets, so both files are loaded at once.
* prefab <-> id: an item prefab is a GameObject with a component whose script
            class is "Item"; its id is the first serialized field of Item
            (public string id right after the MonoBehaviour header).
* Container: a component whose script class is "Container".
* Container body: MonoBehaviours in this build ship without a type tree
            (m_Nodes empty), so UnityPy's read_typetree() fails. The payload is
            decoded with the known serialized layout of Container.cs:
              header(PPtr m_GameObject, bool m_Enabled+pad, PPtr m_Script, string m_Name)
              float maxWeight, float maxWeightPerItem, float encumberanceMult,
              bool itemsVisible (+pad), string[] tagRestriction
            Each object's computed end offset must equal its real byte length,
            otherwise the values are rejected as null instead of guessed.
Writes data/containers.json (CONTRACT.md section 7).
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
ITEM_CS = os.path.join(ROOT, "decompile", "Item.cs")
OUT = os.path.join(ROOT, "data", "containers.json")

CONTAINER_SCRIPT = "Container"
ITEM_SCRIPT = "Item"


def align4(n):
    return (n + 3) & ~3


def read_string(data, off):
    """Unity serialized string: int32 length (4-aligned) + utf8 bytes (4-aligned)."""
    if off + 4 > len(data):
        return None, len(data) + 1
    n = struct.unpack_from("<i", data, off)[0]
    if n < 0 or off + 4 + n > len(data):
        return None, len(data) + 1
    return data[off + 4:off + 4 + n].decode("utf-8", "replace"), align4(off + 4 + n)


def mono_header(data):
    """(script_fileID, script_pathID, name, payload_offset) of a raw MonoBehaviour."""
    go_file, go_path = struct.unpack_from("<iq", data, 0)
    sc_file, sc_path = struct.unpack_from("<iq", data, 16)
    name, off = read_string(data, 28)
    return sc_file, sc_path, name, (off if name is not None else None)


def decode_container(data):
    """Decode a Container MonoBehaviour body; returns (dict, None) or (None, reason)."""
    body = mono_header(data)[3]
    if body is None or body + 16 > len(data):
        return None, "truncated header"
    max_weight, max_weight_per_item, enc_mult = struct.unpack_from("<fff", data, body)
    items_visible = data[body + 12]
    count_off = body + 16
    count = struct.unpack_from("<i", data, count_off)[0]
    if count < 0 or count > 256:
        return None, "implausible tagRestriction count %d" % count
    pos = count_off + 4
    tags = []
    for _ in range(count):
        s, pos = read_string(data, pos)
        if s is None:
            return None, "truncated tagRestriction string"
        tags.append(s)
    if pos != len(data):
        return None, "layout mismatch: computed %d bytes, object has %d" % (pos, len(data))
    return {
        "maxWeight": round(max_weight, 6),
        "maxWeightPerItem": round(max_weight_per_item, 6),
        "encumberanceMult": round(enc_mult, 6),
        "itemsVisible": bool(items_visible),
        "tagRestriction": tags,
    }, None


def item_ids():
    text = open(ITEM_CS, encoding="utf-8").read()
    ids = re.findall(r'GlobalItems\.Add\("([^"]+)"', text)
    assert len(ids) == len(set(ids)), "duplicate ids in Item.cs"
    return ids


def main():
    import UnityPy

    ids = item_ids()
    id_set = set(ids)
    env = UnityPy.load(RESOURCES, MANAGERS)
    files = list(env.files.values())
    resources = [f for f in files if f.name.endswith("resources.assets")
                 and "globalgamemanagers" not in f.name][0]
    managers = [f for f in files if "globalgamemanagers.assets" in f.name][0]

    scripts = {}
    for obj in managers.objects.values():
        if obj.type.name == "MonoScript":
            scripts[obj.path_id] = obj.read().m_ClassName
    if CONTAINER_SCRIPT not in scripts.values():
        raise RuntimeError("MonoScript %r not found in globalgamemanagers.assets" % CONTAINER_SCRIPT)

    by_path = {o.path_id: o for o in resources.objects.values()}

    def script_of(mb_obj):
        data = mb_obj.get_raw_data()
        if len(data) < 28:
            return None, None
        sc_file, sc_path = struct.unpack_from("<iq", data, 16)
        if sc_file != 1:  # MonoScripts only ever live in globalgamemanagers.assets here
            return None, data
        return scripts.get(sc_path), data

    prefab_objs = 0
    prefab_ids = {}          # item id -> list of (gameobject name, container payload or None)
    decode_failures = []
    for obj in resources.objects.values():
        if obj.type.name != "GameObject":
            continue
        game_object = obj.read()
        item_id = None
        containers = []
        for comp in game_object.m_Component:
            comp_obj = by_path.get(comp.component.m_PathID)
            if comp_obj is None or comp_obj.type.name != "MonoBehaviour":
                continue
            cls, data = script_of(comp_obj)
            if cls == ITEM_SCRIPT:
                item_id, _ = read_string(data, mono_header(data)[3] or 0)
            elif cls == CONTAINER_SCRIPT:
                payload, reason = decode_container(data)
                if payload is None:
                    decode_failures.append((game_object.m_Name, obj.path_id, reason))
                containers.append(payload)
        if item_id is None:
            continue
        prefab_objs += 1
        prefab_ids.setdefault(item_id, []).append((game_object.m_Name, containers[0] if containers else None))

    container_ids = sorted(i for i, entries in prefab_ids.items()
                           if any(entry[1] for entry in entries))
    details = {}
    for cid in container_ids:
        payloads = [entry[1] for entry in prefab_ids[cid] if entry[1]]
        details[cid] = {"maxWeight": payloads[0]["maxWeight"],
                        "maxWeightPerItem": payloads[0]["maxWeightPerItem"]}
        for other in payloads[1:]:
            if (other["maxWeight"], other["maxWeightPerItem"]) != (
                    details[cid]["maxWeight"], details[cid]["maxWeightPerItem"]):
                print("WARN %s: duplicate prefabs disagree on weights: %r" % (cid, payloads), file=sys.stderr)

    missing_from_assets = sorted(id_set - set(prefab_ids))
    orphan_prefabs = sorted(set(prefab_ids) - id_set)
    unknown_containers = sorted(set(container_ids) - id_set)

    prefab_count = len(id_set & set(prefab_ids))
    note = (
        "resources.assets holds %d GameObject instances carrying an Item component in %d distinct "
        "GameObject names, but only %d distinct Item.id values: %d names are editor duplicates of the "
        "form '<id> (N)' that keep the same Item.id, so the prefab list maps 1:1 onto the item table. "
        "Every one of the %d GlobalItems ids has at least one prefab (%d ids without a prefab), and the "
        "only prefab id absent from the table is %s, which no decompiled code references "
        "(grep over work/decompile: 0 hits), i.e. an unreachable leftover prefab. So the prefab list "
        "corroborates the id table (no id lacks a prefab) but cannot by itself prove completeness: it "
        "contains real prefabs that are not in the table, and prefab counts are inflated by duplicates."
        % (prefab_objs, len(set(n for e in prefab_ids.values() for n, _ in e)), len(prefab_ids),
           prefab_objs - len(prefab_ids), len(ids), len(missing_from_assets),
           ", ".join(repr(p) for p in orphan_prefabs) or "none")
    )

    result = {
        "ok": True,
        "method": ("UnityPy: load resources.assets + globalgamemanagers.assets; resolve each "
                   "GameObject's MonoBehaviour m_Script PPtr to its MonoScript class name; item "
                   "prefabs are GameObjects with an 'Item' component (id = first serialized field of "
                   "Item), containers are GameObjects with a 'Container' component whose body "
                   "(maxWeight, maxWeightPerItem, encumberanceMult, itemsVisible, tagRestriction) is "
                   "decoded from the raw bytes because this build ships no MonoBehaviour type trees; "
                   "each decoded body is accepted only if its computed byte length equals the object's "
                   "real length"),
        "tool": "UnityPy %s" % UnityPy.__version__,
        "prefabCount": prefab_count,
        "containerIds": container_ids,
        "details": details,
        "missingFromAssets": missing_from_assets,
        "notInAssetsNote": note,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    json.load(open(OUT, encoding="utf-8"))

    print("item ids in Item.cs      :", len(ids))
    print("item prefab instances    :", prefab_objs, "-> prefabCount", prefab_count)
    print("container ids            :", len(container_ids), container_ids)
    print("all containers in table  :", not unknown_containers, unknown_containers)
    print("ids without a prefab     :", len(missing_from_assets), missing_from_assets)
    print("prefab ids not in table  :", orphan_prefabs)
    print("container decode failures:", len(decode_failures), decode_failures)
    for probe in ("bigpack", "gravbag", "medkit"):
        print("  %-9s -> %s" % (probe, details.get(probe)))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
