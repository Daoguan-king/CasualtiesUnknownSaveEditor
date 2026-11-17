#!/usr/bin/env python3
"""生成 data/recipes.json —— 数据源 decompile/Recipes.cs 的 Recipes.SetUpRecipes()。

index 语义（存档安全的关键）：
  Recipes.cs:4645-4647  for (int i = 0; i < recipes.Count; i++) { recipes[i].index = i; ... }
  即 index == recipes.Add 的调用顺序 == List 下标。
  存档 RecipeBoxScript / SavedRecipeData.saved 按数组下标读写，index 错位会写坏存档。

解析方式：手写大括号/圆括号配平扫描，不用正则硬切嵌套对象。
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]          # work/
DECOMPILE = ROOT / "decompile"
SRC = DECOMPILE / "Recipes.cs"
OUT = ROOT / "data" / "recipes.json"
SAVE = ROOT / "save.json"
ITEMS_JSON = ROOT / "data" / "items.json"
LANG_DIR = Path(r"D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data\Lang")
LANG_ZH = LANG_DIR / "zh-CN.json"

# ---------------------------------------------------------------- 扫描工具


def brace_block(s, start):
    """s[start] == '{' -> (内部文本, 匹配的 '}' 下标)"""
    assert s[start] == "{", s[start : start + 20]
    depth = 0
    for j in range(start, len(s)):
        c = s[j]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return s[start + 1 : j], j
    raise ValueError("unbalanced braces")


def paren_block(s, start):
    """s[start] == '(' -> (内部文本, 匹配的 ')' 下标)"""
    assert s[start] == "(", s[start : start + 20]
    depth = 0
    for j in range(start, len(s)):
        c = s[j]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return s[start + 1 : j], j
    raise ValueError("unbalanced parens")


def split_top(s):
    """按深度 0 的逗号切分（忽略 {} () [] 内的逗号）。"""
    parts, depth, last = [], 0, 0
    for j, c in enumerate(s):
        if c in "{([":
            depth += 1
        elif c in "})]":
            depth -= 1
        elif c == "," and depth == 0:
            parts.append(s[last:j])
            last = j + 1
    parts.append(s[last:])
    return [p.strip() for p in parts if p.strip()]


def assignments(body):
    """初始化列表 -> [(名字, 值文本)]"""
    out = []
    for part in split_top(body):
        name, sep, val = part.partition("=")
        if not sep:
            raise ValueError("not an assignment: " + part[:60])
        out.append((name.strip(), val.strip()))
    return out


def fnum(tok):
    """C# float 字面量 -> python float ('0.1f' / '-80f' / '5' -> float)"""
    tok = tok.strip().rstrip("fF")
    return float(tok)


def csharp_str(tok):
    m = re.search(r'"([^"]*)"', tok)
    return m.group(1) if m else None


# ---------------------------------------------------------------- 本地化


class Locale:
    """Locale.GetItem -> main 表；Locale.GetOther -> other 表（Locale.cs:14-32, 76-112）。
    两张表都查不到时游戏直接回显原键，这里按契约写 null，绝不编造中文。"""

    def __init__(self, path):
        self.main, self.other, self.source = {}, {}, None
        if path and path.is_file():
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            self.main = data.get("main") or {}
            self.other = data.get("other") or {}
            self.source = str(path)
            return
        # 退路：复用 items 组产出的 data/items.json（若已生成）
        if ITEMS_JSON.is_file():
            data = json.loads(ITEMS_JSON.read_text(encoding="utf-8-sig"))
            for it in data.get("items", []):
                if it.get("name") is not None:
                    self.main[it["id"]] = it["name"]
            self.source = str(ITEMS_JSON)

    def ok(self):
        return bool(self.main or self.other)

    def get_item(self, key):
        return self.main.get(key)

    def get_other(self, key):
        return self.other.get(key)


# ---------------------------------------------------------------- 解析 Recipes.cs


def setup_recipes_body(src):
    m = re.search(r"public static void SetUpRecipes\(\)\s*\{", src)
    if not m:
        raise SystemExit("找不到 Recipes.SetUpRecipes()")
    body, _ = brace_block(src, src.index("{", m.start()))
    return body


def parse_recipe_items(val):
    """'new List<RecipeItem> { ... }' -> [RecipeItem dict]"""
    lo = val.index("{")
    body, _ = brace_block(val, lo)
    items = []
    for el in split_top(body):
        item = {
            "minimumCondition": 0.9,  # RecipeItem(float minimumCondition = 0.9f)  RecipeItem.cs:22
            "specificId": None,
            "quality": None,
            "isLiquid": False,
            "destroyItem": True,
            "noMaxCondition": False,
        }
        ctor = re.match(r"new\s+RecipeItem\s*(\(([^)]*)\))?", el)
        if not ctor:
            raise ValueError("unexpected RecipeItem form: " + el[:80])
        arg = ctor.group(2)
        if arg is not None and arg.strip():
            item["minimumCondition"] = fnum(arg)
        brace = ctor.end()
        if el[brace:].strip().startswith("{"):
            inner, _ = brace_block(el, el.index("{", brace))
            for name, v in assignments(inner):
                if name == "specificId":
                    item["specificId"] = csharp_str(v)
                elif name == "quality":
                    # 两种写法等价：new CraftingQuality(id[, amount])，或裸字符串
                    # （CraftingQuality.cs:21-24 有 implicit operator string -> CraftingQuality，amount = 1f）
                    qm = re.search(r"CraftingQuality\s*\(([^)]*)\)", v)
                    if qm:
                        qargs = split_top(qm.group(1))
                        qamount = 1.0
                        if len(qargs) > 1:
                            qamount = fnum(qargs[1])
                        item["quality"] = {"id": csharp_str(qargs[0]), "amount": qamount}
                    elif v.startswith('"'):
                        item["quality"] = {"id": csharp_str(v), "amount": 1.0}
                    else:
                        raise ValueError("unexpected quality value: " + v)
                elif name == "isLiquid":
                    item["isLiquid"] = v == "true"
                elif name == "destroyItem":
                    item["destroyItem"] = v == "true"
                elif name == "noMaxCondition":
                    item["noMaxCondition"] = v == "true"
                elif name == "minimumCondition":  # 属性赋值优先于构造参数
                    item["minimumCondition"] = fnum(v)
                else:
                    raise ValueError("unknown RecipeItem field: " + name)
        # Recipes.cs:4650-4652  有 specificId 的 item 在收尾循环里被置 specific = true
        item["specific"] = bool(item["specificId"])
        items.append(item)
    return items


def parse_result(val):
    inner, _ = brace_block(val, val.index("{"))
    res = {"id": None, "isLiquid": False, "amount": 1, "resultCondition": 1.0}
    for name, v in assignments(inner):
        if name == "id":
            res["id"] = csharp_str(v)
        elif name == "isLiquid":
            res["isLiquid"] = v == "true"
        elif name == "amount":
            res["amount"] = int(v)
        elif name == "resultCondition":
            res["resultCondition"] = fnum(v)
        elif name in ("dontDrainResultLiquid",):
            res["dontDrainResultLiquid"] = v == "true"
        else:
            raise ValueError("unknown RecipeResult field: " + name)
    res.setdefault("dontDrainResultLiquid", False)
    return res


def parse_recipes(src):
    body = setup_recipes_body(src)
    starts, k = [], 0
    while True:  # 只在方法体顶层找 recipes.Add（next 之后紧跟 new Recipe 对象初始化器）
        k = body.find("recipes.Add", k)
        if k < 0:
            break
        starts.append(k)
        k += 1
    recipes = []
    for k in starts:
        ob = body.index("{", k)
        inner, _ = brace_block(body, ob)
        rec = {
            "INT": None,
            "category": None,          # C# 缺省 = (RecipeCategory)0 = Materials
            "isRepair": False,
            "result": None,
            "items": [],
        }
        for name, v in assignments(inner):
            if name == "INT":
                rec["INT"] = int(v)
            elif name == "category":
                rec["category"] = v.split(".")[-1].strip()
            elif name == "isRepair":
                rec["isRepair"] = v == "true"
            elif name == "result":
                rec["result"] = parse_result(v)
            elif name == "items":
                rec["items"] = parse_recipe_items(v)
            else:
                raise ValueError("unknown Recipe field: " + name)
        recipes.append(rec)
    return recipes


# ---------------------------------------------------------------- 组装输出

INGREDIENT_KEY = ("specificId", "quality", "isLiquid", "destroyItem", "minimumCondition", "noMaxCondition")


def ingredient_key(item):
    q = item["quality"]
    return (
        item["specificId"],
        None if q is None else (q["id"], q["amount"]),
        item["isLiquid"],
        item["destroyItem"],
        item["minimumCondition"],
        item["noMaxCondition"],
    )


def ingredient_name(item, loc):
    """显示名严格照抄游戏的取词规则（PlayerCamera.cs:755-759 / CraftingQuality.cs:7）：
    指定物品 -> Locale.GetItem(specificId)；指定液体 -> Locale.GetOther(specificId)；
    品质要求 -> CraftingQuality.LocaleName = Locale.GetOther('cq' + quality.id)。
    缺失返回 None 并登记，不编造。"""
    if item["specific"]:
        key = item["specificId"]
        name = loc.get_other(key) if item["isLiquid"] else loc.get_item(key)
        return name, ("other" if item["isLiquid"] else "main"), key
    qid = item["quality"]["id"]
    return loc.get_other("cq" + qid), "other", "cq" + qid


def main():
    src = SRC.read_text(encoding="utf-8-sig")
    recipes_ast = parse_recipes(src)
    loc = Locale(LANG_ZH)

    missing = []
    out_recipes = []
    slots = 0
    for index, rec in enumerate(recipes_ast):
        res = rec["result"]
        if res["isLiquid"]:
            result_name, table, key = loc.get_other(res["id"]), "other", res["id"]
        else:
            result_name, table, key = loc.get_item(res["id"]), "main", res["id"]
        if result_name is None:
            missing.append({"at": f"recipe[{index}].result", "table": table, "key": key})

        merged, order = {}, []
        for item in rec["items"]:
            slots += 1
            k = ingredient_key(item)
            if k not in merged:
                name, table, key = ingredient_name(item, loc)
                if name is None:
                    missing.append({"at": f"recipe[{index}].ingredient", "table": table, "key": key})
                merged[k] = {
                    "id": item["specificId"],
                    "amount": 0,
                    "name": name,
                    "quality": None if item["quality"] is None else item["quality"]["id"],
                    "qualityAmount": None if item["quality"] is None else item["quality"]["amount"],
                    "isLiquid": item["isLiquid"],
                    "destroyItem": item["destroyItem"],
                    "minimumCondition": item["minimumCondition"],
                }
                order.append(k)
            merged[k]["amount"] += 1

        out_recipes.append(
            {
                "index": index,
                "int": rec["INT"],
                "resultId": res["id"],
                "resultName": result_name,
                "resultAmount": res["amount"],
                "category": rec["category"] if rec["category"] else "Materials",
                "ingredients": [merged[k] for k in order],
                "resultCondition": res["resultCondition"],
                "resultIsLiquid": res["isLiquid"],
                "isRepair": rec["isRepair"],
                "dontDrainResultLiquid": res["dontDrainResultLiquid"],
            }
        )

    doc = {
        "generatedBy": "tools/extract_recipes.py",
        "count": len(out_recipes),
        "missingNames": missing,
        "recipes": out_recipes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ------------------------------------------------------------ 自检
    print(f"source           : {SRC}")
    print(f"locale           : {loc.source or '(不可用 -> name 全为 null)'}")
    print(f"recipes.count    : {doc['count']}")
    print(f"recipes.Add 计数 : {src.count('recipes.Add')} (全文) / 137 期望")
    idx = [r["index"] for r in out_recipes]
    contiguous = idx == list(range(len(idx)))
    print(f"index 连续校验   : {contiguous}  first={idx[0]} last={idx[-1]} holes={sorted(set(range(len(idx))) - set(idx))}")
    total_amount = sum(i["amount"] for r in out_recipes for i in r["ingredients"])
    print(f"ingredient 槽位  : 原始 {slots} -> 聚合 {sum(len(r['ingredients']) for r in out_recipes)} 条, amount 合计 {total_amount} (应等于 {slots})")
    print(f"slot 守恒        : {total_amount == slots}")
    if SAVE.is_file():
        saved = json.loads(SAVE.read_text(encoding="utf-8-sig"))["savedRecipeData"]["saved"]
        print(f"save.saved 长度  : {len(saved)} -> 与 count 一致: {len(saved) == doc['count']}")
    cats = {}
    for r in out_recipes:
        cats[r["category"]] = cats.get(r["category"], 0) + 1
    print(f"category 分布    : {cats}")
    print(f"isRepair=true    : {[r['index'] for r in out_recipes if r['isRepair']]}")
    print(f"missingNames     : {len(missing)} 条" + ("" if not missing else " -> " + json.dumps(missing[:12], ensure_ascii=False)))
    json.loads(OUT.read_text(encoding="utf-8"))  # 可解析自检
    print(f"written          : {OUT}  (JSON 可解析)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
