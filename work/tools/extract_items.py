#!/usr/bin/env python3
"""Extract item definitions from the decompiled Item.SetupItems() into data/items.json.

Run:  python tools/extract_items.py
Re-runnable: regenerates work/data/items.json from the decompiled source + Lang files.

Parsing strategy: no regex-based brace cutting. A character scanner tracks C# string/char
literals and comments, then balances {} () [] to slice each GlobalItems.Add(id, new Type
{ ... }) initializer and its depth-0 members.
"""

import json
import os
import sys

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # .../work
SRC = os.path.join(WORK, "decompile", "Item.cs")
DECOMPILE = os.path.join(WORK, "decompile")
SAVE = os.path.join(WORK, "save.json")
OUT = os.path.join(WORK, "data", "items.json")
LANG_DIR = r"D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data\Lang"
ZH = os.path.join(LANG_DIR, "zh-CN.json")
EN = os.path.join(LANG_DIR, "EN.json")

# ItemInfo field declarations default to false / 0 / "" in C#; a bool absent from a
# registration block therefore reads as false at runtime.
BOOL_FIELDS = ["wearable", "usable", "usableOnLimb", "combineable", "secret"]


# ---------------------------------------------------------------- lexer helpers
def read_string(s, i):
    """s[i] starts a C# string literal. Returns (value, next_i)."""
    n = len(s)
    verbatim = False
    while i < n and s[i] in "@$":
        if s[i] == "@":
            verbatim = True
        i += 1
    if i >= n or s[i] != '"':
        raise ValueError("expected string literal at %d" % i)
    i += 1
    out = []
    if verbatim:
        while i < n:
            c = s[i]
            if c == '"':
                if i + 1 < n and s[i + 1] == '"':
                    out.append('"')
                    i += 2
                    continue
                return "".join(out), i + 1
            out.append(c)
            i += 1
        return "".join(out), i
    esc = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "'": "'",
           "0": "\0", "a": "\a", "b": "\b", "f": "\f", "v": "\v"}
    while i < n:
        c = s[i]
        if c == "\\":
            e = s[i + 1] if i + 1 < n else ""
            if e == "u":
                out.append(chr(int(s[i + 2:i + 6], 16)))
                i += 6
                continue
            out.append(esc.get(e, e))
            i += 2
            continue
        if c == '"':
            return "".join(out), i + 1
        out.append(c)
        i += 1
    return "".join(out), i


def _skip_char_literal(s, i):
    n = len(s)
    i += 1
    if i < n and s[i] == "\\":
        i += 2
    else:
        i += 1
    while i < n and s[i] != "'":
        i += 1
    return i + 1


def _advance(s, i):
    """If s[i] begins a non-code region (string / char / comment), return the index just
    past it; otherwise return None."""
    n = len(s)
    c = s[i]
    if c == '"':
        return read_string(s, i)[1]
    if c in "@$":
        j = i
        while j < n and s[j] in "@$":
            j += 1
        if j < n and s[j] == '"':
            return read_string(s, i)[1]
        return None
    if c == "'":
        return _skip_char_literal(s, i)
    if c == "/" and i + 1 < n and s[i + 1] == "/":
        while i < n and s[i] != "\n":
            i += 1
        return i
    if c == "/" and i + 1 < n and s[i + 1] == "*":
        j = s.find("*/", i + 2)
        return n if j < 0 else j + 2
    return None


def find_matching(s, open_idx, open_c, close_c):
    depth = 0
    i = open_idx
    n = len(s)
    while i < n:
        nxt = _advance(s, i)
        if nxt is not None:
            i = nxt
            continue
        c = s[i]
        if c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def split_top_level(body):
    """Split an initializer body on depth-0 commas; returns list of substrings."""
    parts = []
    start = 0
    depth = 0
    i = 0
    n = len(body)
    while i < n:
        nxt = _advance(body, i)
        if nxt is not None:
            i = nxt
            continue
        c = body[i]
        if c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
        elif c == "," and depth == 0:
            parts.append(body[start:i])
            start = i + 1
        i += 1
    parts.append(body[start:n])
    return parts


def members(body):
    """Map depth-0 name = value members to their raw value text (first wins)."""
    found = {}
    dupes = []
    for part in split_top_level(body):
        depth = 0
        i = 0
        n = len(part)
        eq = -1
        while i < n:
            nxt = _advance(part, i)
            if nxt is not None:
                i = nxt
                continue
            c = part[i]
            if c in "{[(":
                depth += 1
            elif c in "}])":
                depth -= 1
            elif c == "=" and depth == 0 and (i + 1 >= n or part[i + 1] != "=") \
                    and (i == 0 or part[i - 1] not in "=!<>"):
                eq = i
                break
            i += 1
        if eq < 0:
            continue
        name = part[:eq].strip()
        if not name or not all(ch.isalnum() or ch == "_" for ch in name):
            continue
        value = part[eq + 1:].strip()
        if name in found:
            dupes.append(name)
        else:
            found[name] = value
    return found, dupes


# ------------------------------------------------------------- value converters
def as_string(raw):
    """Concatenation-aware string literal reader; returns None when not a string expr."""
    if raw is None:
        return None
    s = raw.strip()
    if s == "null":
        return None
    if s in ("string.Empty", "String.Empty"):
        return ""
    pieces = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        if ch in " \t\r\n+":
            i += 1
            continue
        if ch == '"' or (ch in "@$" and any(c == '"' for c in s[i:i + 2])):
            val, i = read_string(s, i)
            pieces.append(val)
            continue
        return None
    return "".join(pieces) if pieces else None


def as_number(raw):
    if raw is None:
        return None
    s = raw.strip()
    for suffix in ("f", "F", "d", "D", "m", "M"):
        if s.endswith(suffix):
            s = s[:-1]
    try:
        if "." in s or "e" in s or "E" in s:
            return float(s)
        return int(s)
    except ValueError:
        return None


def as_bool(raw, default=False):
    if raw is None:
        return default
    s = raw.strip()
    if s == "true":
        return True
    if s == "false":
        return False
    return default


def as_quality_ids(raw):
    """CraftingQuality ids from a List<CraftingQuality> initializer.

    Two source forms exist: new CraftingQuality("dressing") / ("cutting", 100f), and the
    bare string form { "flour" } that relies on CraftingQuality's implicit operator from
    string (CraftingQuality.cs:21). Returns (ids, unresolved_element_texts).
    """
    if not raw:
        return [], []
    brace = raw.find("{")
    elements = []
    if brace >= 0:
        close = find_matching(raw, brace, "{", "}")
        if close < 0:
            return [], [raw.strip()]
        elements = split_top_level(raw[brace + 1:close])
    ids = []
    bad = []
    for el in elements:
        s = el.strip()
        if not s:
            continue
        if s.startswith("new") or s.startswith("CraftingQuality"):
            j = s.find("(")
            k = j + 1 if j >= 0 else 0
            n = len(s)
            while k < n and s[k] in " \t\r\n":
                k += 1
            if j >= 0 and k < n and (s[k] == '"' or s[k] in "@$"):
                try:
                    val, _ = read_string(s, k)
                    ids.append(val)
                    continue
                except ValueError:
                    pass
            bad.append(s)
            continue
        if s[0] == '"' or (s[0] in "@$" and '"' in s[:3]):
            try:
                val, _ = read_string(s, 0)
                ids.append(val)
                continue
            except ValueError:
                pass
        bad.append(s)
    out = []
    for q in ids:
        if q not in out:
            out.append(q)
    return out, bad


# ---------------------------------------------------------------- registration scan
def find_registrations(text):
    """Return [(id, type_name, body_text, line_no)] for every GlobalItems.Add(...)."""
    regs = []
    i = 0
    n = len(text)
    token = "GlobalItems"
    while True:
        i = text.find(token, i)
        if i < 0:
            break
        nxt = _advance(text, i)
        if nxt is not None:
            i = nxt
            continue
        if i > 0 and (text[i - 1].isalnum() or text[i - 1] == "_"):
            i += len(token)
            continue
        j = i + len(token)
        while j < n and text[j] in " \t\r\n":
            j += 1
        if not text.startswith(".Add", j):
            i += len(token)
            continue
        k = j + len(".Add")
        while k < n and text[k] in " \t\r\n":
            k += 1
        if k >= n or text[k] != "(":
            i += len(token)
            continue
        close = find_matching(text, k, "(", ")")
        if close < 0:
            break
        args = text[k + 1:close]
        a = 0
        while a < len(args) and args[a] in " \t\r\n":
            a += 1
        if a >= len(args) or args[a] != '"':
            i = close
            continue
        item_id, after = read_string(args, a)
        rest = args[after:]
        m = rest.find("new")
        if m < 0:
            i = close
            continue
        tidx = m + 3
        while tidx < len(rest) and rest[tidx] in " \t\r\n":
            tidx += 1
        tend = tidx
        while tend < len(rest) and (rest[tend].isalnum() or rest[tend] in "_."):
            tend += 1
        type_name = rest[tidx:tend].split(".")[-1]
        brace = rest.find("{", tend)
        if brace < 0:
            i = close
            continue
        brace_close = find_matching(rest, brace, "{", "}")
        if brace_close < 0:
            i = close
            continue
        body = rest[brace + 1:brace_close]
        line_no = text.count("\n", 0, k) + 1
        regs.append((item_id, type_name, body, line_no))
        i = close
    return regs


def alternative_writes(text, path):
    """Detect registration syntaxes other than GlobalItems.Add(id, new ...), e.g.
    GlobalItems["id"] = ... or GlobalItems.TryAdd(...)."""
    hits = []
    i = 0
    n = len(text)
    while True:
        i = text.find("GlobalItems", i)
        if i < 0:
            break
        nxt = _advance(text, i)
        if nxt is not None:
            i = nxt
            continue
        if i > 0 and (text[i - 1].isalnum() or text[i - 1] == "_"):
            i += len("GlobalItems")
            continue
        j = i + len("GlobalItems")
        while j < n and text[j] in " \t\r\n":
            j += 1
        kind = None
        if j < n and text[j] == "[":
            k = text.find("]", j)
            if k > 0:
                tail = text[k + 1:k + 4].strip()
                if tail.startswith("=") and not tail.startswith("=="):
                    kind = "indexer-assignment"
        elif text.startswith(".TryAdd", j):
            kind = "TryAdd"
        elif text.startswith(".AddRange", j):
            kind = "AddRange"
        if kind:
            hits.append((os.path.basename(path), text.count("\n", 0, i) + 1, kind))
        i = j if j > i else i + len("GlobalItems")
    return hits


# ------------------------------------------------------------------------ main
def main():
    with open(SRC, encoding="utf-8-sig") as fh:
        text = fh.read()

    regs = find_registrations(text)
    alt = []
    for name in sorted(os.listdir(DECOMPILE)):
        if name.endswith(".cs"):
            p = os.path.join(DECOMPILE, name)
            with open(p, encoding="utf-8-sig") as fh:
                alt.extend(alternative_writes(fh.read(), p))

    grep_count = text.count('GlobalItems.Add("')

    zh = json.load(open(ZH, encoding="utf-8-sig"))["main"]
    en = json.load(open(EN, encoding="utf-8-sig"))["main"]

    items = []
    missing = []
    problems = []
    seen = {}
    for item_id, type_name, body, line_no in regs:
        if item_id in seen:
            problems.append("duplicate id %r (lines %d and %d)" % (item_id, seen[item_id], line_no))
        seen[item_id] = line_no
        f, dupes = members(body)
        if dupes:
            problems.append("%r: duplicate member(s) %s" % (item_id, sorted(set(dupes))))
        name = zh.get(item_id)
        if name is None:
            missing.append(item_id)
        tags = as_string(f.get("tags"))
        tags_list = [t.strip() for t in tags.split(",")] if tags else []
        tags_list = [t for t in tags_list if t]
        rec = {
            "id": item_id,
            "name": name,
            "nameEn": en.get(item_id),
            "desc": zh.get(item_id + "dsc", ""),
            "descEn": en.get(item_id + "dsc", ""),
            "category": as_string(f.get("category")),
            "weight": as_number(f.get("weight")),
            "value": as_number(f.get("value")),
            "wearable": as_bool(f.get("wearable")),
            "wearSlotId": as_string(f.get("wearSlotId")),
            "usable": as_bool(f.get("usable")),
            "usableOnLimb": as_bool(f.get("usableOnLimb")),
            "combineable": as_bool(f.get("combineable")),
            "secret": as_bool(f.get("secret")),
            "tags": tags_list,
            "qualities": as_quality_ids(f.get("qualities"))[0],
            "class": type_name,
        }
        unresolved = as_quality_ids(f.get("qualities"))[1]
        if unresolved:
            problems.append("%r: unresolved quality element(s) %s" % (item_id, unresolved))
        for key in ("category", "weight", "value", "wearSlotId"):
            if rec[key] is None and key in f:
                problems.append("%r: unparsed %s = %r" % (item_id, key, f[key][:60]))
        items.append(rec)

    items.sort(key=lambda r: r["id"])
    missing.sort()
    out = {
        "generatedBy": "tools/extract_items.py",
        "count": len(items),
        "missingNames": missing,
        "items": items,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    # ------------------------------------------------------------- self-checks
    parsed = json.load(open(OUT, encoding="utf-8"))
    ids = [r["id"] for r in parsed["items"]]
    ok = True
    print("source                : %s" % SRC)
    print("registrations scanned : %d  (grep GlobalItems.Add( = %d)" % (len(regs), grep_count))
    if len(regs) != grep_count:
        ok = False
        print("FAIL: scanned count != grep count")
    print("items written         : %d" % parsed["count"])
    print("unique ids            : %d" % len(set(ids)))
    if len(set(ids)) != len(ids):
        ok = False
        print("FAIL: duplicate ids present")
    if len(parsed["items"]) != grep_count:
        ok = False
        print("FAIL: items array length != grep count")
    keys_expected = ["id", "name", "nameEn", "desc", "descEn", "category", "weight", "value",
                     "wearable", "wearSlotId", "usable", "usableOnLimb", "combineable",
                     "secret", "tags", "qualities", "class"]
    bad = [r["id"] for r in parsed["items"] if list(r.keys()) != keys_expected]
    if bad:
        ok = False
        print("FAIL: schema field mismatch in %s" % bad[:5])
    print("schema fields         : %d keys per item, all present" % len(keys_expected))
    print("items with zh name    : %d / %d" % (len(ids) - len(missing), len(ids)))
    print("items with EN name    : %d / %d" % (sum(1 for r in parsed["items"] if r["nameEn"]), len(ids)))
    print("items with zh desc    : %d / %d" % (sum(1 for r in parsed["items"] if r["desc"]), len(ids)))
    print("missingNames          : %d %s" % (len(missing), missing[:20]))
    classes = {}
    for r in parsed["items"]:
        classes[r["class"]] = classes.get(r["class"], 0) + 1
    print("class distribution    : %s" % dict(sorted(classes.items())))
    cats = {}
    for r in parsed["items"]:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    print("category distribution : %s" % dict(sorted(cats.items(), key=lambda kv: (kv[0] is None, str(kv[0])))))
    print("items w/o weight      : %d" % sum(1 for r in parsed["items"] if r["weight"] is None))
    print("items w/o value       : %d" % sum(1 for r in parsed["items"] if r["value"] is None))
    print("items w/o category    : %d" % sum(1 for r in parsed["items"] if r["category"] is None))
    print("items w/ qualities    : %d" % sum(1 for r in parsed["items"] if r["qualities"]))
    print("items w/ tags         : %d" % sum(1 for r in parsed["items"] if r["tags"]))
    if alt:
        print("ALTERNATIVE WRITE FORMS FOUND: %s" % alt)
    else:
        print("alternative registration forms (indexer/TryAdd/AddRange): none")

    # -------------------------------------------------- save.json cross-check
    if os.path.exists(SAVE):
        save = json.load(open(SAVE, encoding="utf-8"))
        idset = set(ids)
        save_ids = [it.get("id") for it in save.get("items", [])]
        missing_in_out = sorted({i for i in save_ids if i not in idset})
        print("save.json items       : %d entries, %d distinct ids" % (len(save_ids), len(set(save_ids))))
        print("save ids missing from items.json: %d %s" % (len(missing_in_out), missing_in_out))
        if missing_in_out:
            ok = False
            print("FAIL: save.json ids not covered")
        else:
            print("save.json coverage    : OK (0 missing)")

    # ------------------------------------------------------- spot-check trio
    for target in ("bandage", "gravbag", "bigpack"):
        row = next((r for r in parsed["items"] if r["id"] == target), None)
        print("[spot] %s -> %s" % (target, json.dumps(row, ensure_ascii=False)))

    if problems:
        print("PARSE WARNINGS (%d):" % len(problems))
        for p in problems[:40]:
            print("  " + p)
    print("self-check: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
