#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 data/bodyfields.json、data/limbs.json、data/meta.json（语义标注层）。

只读输入
  CONTRACT.md                    数据契约（v1, frozen）
  save.json                      save.sv 解压后的样本（body / limbs 键的顺序基准）
  decompile/*.cs                 ilspycmd 反编译的 Assembly-CSharp
  <game>/CasualtiesUnknown_Data/Lang/zh-CN.json, EN.json
  <game>/CasualtiesUnknown_Data/resources.assets   （可选，仅用于复核肢体顺序）

证据纪律
  * csharpType 一律由源码声明解析得出，不手写；解析不到即报错退出。
  * min/max 只记录有代码证据的钳制/阈值；无证据写 null，并在 evidence 注明“无钳制证据”。
  * 每条 evidence 引用的 file:line 都会被逐条核对（行必须存在且包含所引片段），
    任何一条不符 => 退出码 1，绝不带病产出。

用法
  python tools/extract_bodyfields.py            # 生成三个 JSON 并打印校验报告
  python tools/extract_bodyfields.py --prefab    # 额外用 UnityPy 复核肢体顺序（默认跳过）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # work/
DECOMP = ROOT / "decompile"
SAVE = ROOT / "save.json"
DATA = ROOT / "data"

GAME = Path(r"D:\SteamLibrary\steamapps\common\Casualties Unknown")
LANG_DIR = GAME / "CasualtiesUnknown_Data" / "Lang"
ASSETS = GAME / "CasualtiesUnknown_Data" / "resources.assets"

GEN_BY = "tools/extract_bodyfields.py"

# --------------------------------------------------------------------------- #
# 源码/本地化读取
# --------------------------------------------------------------------------- #

_src_cache: dict[str, list[str]] = {}


def src(name: str) -> list[str]:
    """读取 decompile/<name> 并按行返回；行号 = 索引 + 1。"""
    if name not in _src_cache:
        path = DECOMP / name
        if not path.is_file():
            raise SystemExit(f"缺少反编译源文件: {path}")
        _src_cache[name] = path.read_text(encoding="utf-8", errors="replace").split("\n")
    return _src_cache[name]


def line_of(name: str, lineno: int) -> str:
    lines = src(name)
    if not (1 <= lineno <= len(lines)):
        raise SystemExit(f"证据越界: {name}:{lineno}（文件共 {len(lines)} 行）")
    return lines[lineno - 1]


def load_locale(name: str) -> dict:
    path = LANG_DIR / name
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


ZH = load_locale("zh-CN.json")
ZH_OTHER = ZH.get("other", {}) if ZH else {}
ZH_MAIN = ZH.get("main", {}) if ZH else {}

# --------------------------------------------------------------------------- #
# 字段规格（label / group / min / max / evidence + 可核对的引用）
# cites 元素: (文件, 行号, 该行必须包含的片段)
# --------------------------------------------------------------------------- #

GROUP = {
    "move": "运动与移动",
    "cardio": "心血管",
    "breath": "呼吸",
    "endocrine": "内分泌",
    "mood": "情绪与创伤",
    "nutrition": "营养与代谢",
    "vigor": "体力与疲劳",
    "neuro": "神经与意识",
    "thermal": "体温与环境",
    "immune": "疾病与免疫",
    "injury": "伤情与外观",
    "dying": "濒死与最后挣扎",
    "beast": "兽化与爪",
    "skill": "技能",
}

NO_CLAMP = "（无钳制证据：全程无可证赋值钳制，min/max 记 null）"

FIELDS: list[dict] = [
    # ---------------- 运动与移动 ----------------
    dict(name="maxSpeed", label="最大移动速度", group="move", mn=None, mx=None,
         ev="Body.cs:62 声明 public float maxSpeed;（无默认值）；Body.cs:2917 仅作比较 maxSpeed*0.1f 使用；" + NO_CLAMP,
         cites=[("Body.cs", 62, "public float maxSpeed;"), ("Body.cs", 2917, "maxSpeed * 0.1f")]),
    dict(name="jumpSpeed", label="跳跃速度", group="move", mn=None, mx=None,
         ev="Body.cs:78 声明；Body.cs:608 actualJumpSpeed = legSpeedMult*jumpSpeed*Clamp01(...)；" + NO_CLAMP,
         cites=[("Body.cs", 78, "public float jumpSpeed;"), ("Body.cs", 608, "jumpSpeed * Mathf.Clamp01")]),
    dict(name="temporarySlowdown", label="临时减速（0~1 比例）", group="move", mn=None, mx=None,
         ev="Body.cs:81 声明；Body.cs:585 以 1f-temporarySlowdown 作为 Mathf.Min 的减速因子，语义上是 0~1 比例，但代码未钳制；" + NO_CLAMP,
         cites=[("Body.cs", 81, "public float temporarySlowdown;"), ("Body.cs", 585, "1f - temporarySlowdown")]),
    dict(name="moveForce", label="移动推力", group="move", mn=None, mx=None,
         ev="Body.cs:90 声明；Body.cs:612 actualMoveForce = moveForce*...；" + NO_CLAMP,
         cites=[("Body.cs", 90, "public float moveForce;"), ("Body.cs", 612, "moveForce * legSpeedMult")]),
    dict(name="slowdownAmount", label="减速量", group="move", mn=None, mx=None,
         ev="Body.cs:97 声明；全库无 Clamp/阈值引用；" + NO_CLAMP,
         cites=[("Body.cs", 97, "public float slowdownAmount;")]),
    # ---------------- 心血管 ----------------
    dict(name="bloodOxygen", label="血氧", group="cardio", mn=0, mx=100,
         ev="Body.cs:121 默认 100f；Body.cs:1116 Mathf.Clamp(bloodOxygen, 0f, 100f)",
         cites=[("Body.cs", 121, "public float bloodOxygen = 100f;"), ("Body.cs", 1116, "Mathf.Clamp(bloodOxygen, 0f, 100f)")]),
    dict(name="bloodVolume", label="血量", group="cardio", mn=None, mx=None,
         ev="Body.cs:124 默认 100f；Body.cs:3379 bleedAmount 扣减；Body.cs:642 bloodVolumePercentage=0.5+bloodVolume/200 暗示 0~100；" + NO_CLAMP,
         cites=[("Body.cs", 124, "public float bloodVolume = 100f;"), ("Body.cs", 3379, "bloodVolume -="), ("Body.cs", 642, "bloodVolume / 200f")]),
    dict(name="heartRate", label="心率", group="cardio", mn=0, mx=215,
         ev="Body.cs:127 默认 70f；Body.cs:1273 Mathf.Clamp(heartRate, 0f, 215f)（读取侧钳制）；Body.cs:1164 heartRate>280f 触发室颤 —— 写入 215 以上不会崩，但会被显示/计算钳到 215",
         cites=[("Body.cs", 127, "public float heartRate = 70f;"), ("Body.cs", 1273, "Mathf.Clamp(heartRate, 0f, 215f)"), ("Body.cs", 1164, "heartRate > 280f")]),
    dict(name="respiratoryRate", label="呼吸频率", group="breath", mn=0, mx=100,
         ev="Body.cs:130 默认 100f；Body.cs:1158 Mathf.Clamp(respiratoryRate, 0f, 100f)；Body.cs:3350 breathing = alive && respiratoryRate>10f",
         cites=[("Body.cs", 130, "public float respiratoryRate = 100f;"), ("Body.cs", 1158, "Mathf.Clamp(respiratoryRate, 0f, 100f)"), ("Body.cs", 3350, "respiratoryRate > 10f")]),
    dict(name="bloodPressure", label="血压", group="cardio", mn=0, mx=250,
         ev="Body.cs:133 默认 120f；Body.cs:1296 Mathf.Clamp(bloodPressure, 0f, 250f)",
         cites=[("Body.cs", 133, "public float bloodPressure = 120f;"), ("Body.cs", 1296, "Mathf.Clamp(bloodPressure, 0f, 250f)")]),
    dict(name="bloodVesselSize", label="血管口径", group="cardio", mn=0.85, mx=1.15,
         ev="Body.cs:136 默认 1f；Body.cs:1272 Mathf.Clamp(bloodVesselSize, 0.85f, 1.15f)",
         cites=[("Body.cs", 136, "public float bloodVesselSize = 1f;"), ("Body.cs", 1272, "Mathf.Clamp(bloodVesselSize, 0.85f, 1.15f)")]),
    dict(name="fibrillationProgress", label="室颤进度", group="cardio", mn=0, mx=100,
         ev="Body.cs:139 声明（无默认值）；Body.cs:1191 Mathf.Clamp(fibrillationProgress, 0f, 100f)",
         cites=[("Body.cs", 139, "public float fibrillationProgress;"), ("Body.cs", 1191, "Mathf.Clamp(fibrillationProgress, 0f, 100f)")]),
    dict(name="fibrillationForced", label="强制室颤", group="cardio", mn=None, mx=None,
         ev="Body.cs:142 声明 bool；只作 if (!fibrillationForced) 判据（Body.cs:622）",
         cites=[("Body.cs", 142, "public bool fibrillationForced;"), ("Body.cs", 622, "!fibrillationForced")]),
    dict(name="bloodViscosity", label="血液黏稠度", group="cardio", mn=-100, mx=100,
         ev="Body.cs:145 声明（无默认值）；Body.cs:1118 Mathf.Clamp(bloodViscosity, -100f, 100f)；Body.cs:4217 >90f 触发肺栓塞风险",
         cites=[("Body.cs", 145, "public float bloodViscosity;"), ("Body.cs", 1118, "Mathf.Clamp(bloodViscosity, -100f, 100f)"), ("Body.cs", 4217, "bloodViscosity > 90f")]),
    dict(name="heartRatePressureOffset", label="心率-血压偏移", group="cardio", mn=-30, mx=80,
         ev="Body.cs:149 声明；Body.cs:1239 Mathf.Clamp(heartRatePressureOffset, -30f, 80f)",
         cites=[("Body.cs", 149, "public float heartRatePressureOffset;"), ("Body.cs", 1239, "Mathf.Clamp(heartRatePressureOffset, -30f, 80f)")]),
    dict(name="internalBleeding", label="内出血", group="cardio", mn=0, mx=100,
         ev="Body.cs:320 声明；Body.cs:3362 Mathf.Clamp(internalBleeding - ..., 0f, 100f)；Body.cs:4454 IntBleedingClamped() 取 0~25",
         cites=[("Body.cs", 320, "public float internalBleeding;"), ("Body.cs", 3362, "Mathf.Clamp(internalBleeding"), ("Body.cs", 4454, "Mathf.Clamp(internalBleeding, 0f, 25f)")]),
    dict(name="hemothorax", label="血胸", group="cardio", mn=None, mx=None,
         ev="Body.cs:323 声明；Body.cs:3365 hemothorax += 累积，Body.cs:3372 归零；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 323, "public float hemothorax;"), ("Body.cs", 3365, "hemothorax +="), ("Body.cs", 3372, "hemothorax = 0f")]),
    dict(name="hasPulmonaryEmbolism", label="肺栓塞", group="cardio", mn=None, mx=None,
         ev="Body.cs:483 声明 bool；Body.cs:4221 bloodViscosity<50f && hasPulmonaryEmbolism 触发恢复",
         cites=[("Body.cs", 483, "public bool hasPulmonaryEmbolism;"), ("Body.cs", 4221, "hasPulmonaryEmbolism")]),
    dict(name="strokeAmount", label="中风程度", group="cardio", mn=0, mx=100,
         ev="Body.cs:486 声明；Body.cs:3581 Mathf.Clamp(strokeAmount, 0f, 100f)；Limb.cs:197 以 strokeAmount/50 归一化",
         cites=[("Body.cs", 486, "public float strokeAmount;"), ("Body.cs", 3581, "Mathf.Clamp(strokeAmount, 0f, 100f)"), ("Limb.cs", 197, "body.strokeAmount / 50f")]),
    dict(name="bloodPressureChangeFromMedicine", label="药物造成的血压变化", group="cardio", mn=None, mx=None,
         ev="Body.cs:489 声明；Body.cs:4588 重置为 0f；无 Clamp/阈值；" + NO_CLAMP,
         cites=[("Body.cs", 489, "public float bloodPressureChangeFromMedicine;"), ("Body.cs", 4588, "bloodPressureChangeFromMedicine = 0f")]),
    # ---------------- 内分泌 ----------------
    dict(name="adrenaline", label="肾上腺素（时长）", group="endocrine", mn=0, mx=100,
         ev="Body.cs:154 声明；Body.cs:3594 Mathf.Clamp(adrenaline - ..., 0f, 100f)",
         cites=[("Body.cs", 154, "public float adrenaline;"), ("Body.cs", 3594, "Mathf.Clamp(adrenaline")]),
    dict(name="curAdrenaline", label="当前肾上腺素（曲线值）", group="endocrine", mn=None, mx=None,
         ev="Body.cs:157 声明；Body.cs:4583 curAdrenaline = 0f 重置；Body.cs:1268 / MoodleManager.cs:916 仅作阈值比较；" + NO_CLAMP,
         cites=[("Body.cs", 157, "public float curAdrenaline;"), ("Body.cs", 1268, "curAdrenaline > 30f"), ("MoodleManager.cs", 916, "body.curAdrenaline > 20f")]),
    # ---------------- 情绪与创伤 ----------------
    dict(name="happiness", label="心情", group="mood", mn=None, mx=None,
         ev="Body.cs:160 声明；Body.cs:3490 向 0 MoveTowards；只有派生值 totalHappiness 在 Body.cs:646 被钳到 -100f..100f，happiness 本身无钳制；" + NO_CLAMP,
         cites=[("Body.cs", 160, "public float happiness;"), ("Body.cs", 3490, "Mathf.MoveTowards(happiness, 0f"), ("Body.cs", 646, "-100f, 100f")]),
    dict(name="desensitizedMult", label="麻木倍率（键名直译）", group="mood", mn=None, mx=None,
         ev="Body.cs:239 默认 1f；全库无 Clamp/阈值引用；" + NO_CLAMP,
         cites=[("Body.cs", 239, "public float desensitizedMult = 1f;")]),
    dict(name="corpsesSeen", label="已见尸体数", group="mood", mn=None, mx=None,
         ev="Body.cs:242 声明 int；CorpseScript.cs:97 corpsesSeen<9 作为脱敏分支判据（9 不是钳制，只是阈值）；" + NO_CLAMP,
         cites=[("Body.cs", 242, "public int corpsesSeen;"), ("CorpseScript.cs", 97, "corpsesSeen < 9")]),
    dict(name="traumaAmount", label="心理创伤", group="mood", mn=0, mx=100,
         ev="Body.cs:335 声明；Body.cs:3412 Mathf.Clamp(traumaAmount, 0f, 100f)；MoodleManager.cs:870 以 >80f 为阈值",
         cites=[("Body.cs", 335, "public float traumaAmount;"), ("Body.cs", 3412, "Mathf.Clamp(traumaAmount, 0f, 100f)"), ("MoodleManager.cs", 870, "traumaAmount > 80f")]),
    # ---------------- 营养与代谢 ----------------
    dict(name="weightOffset", label="体重偏移", group="nutrition", mn=-80, mx=100,
         ev="Body.cs:167 声明；Body.cs:3587 Mathf.Clamp(weightOffset, -80f, 100f)",
         cites=[("Body.cs", 167, "public float weightOffset;"), ("Body.cs", 3587, "Mathf.Clamp(weightOffset, -80f, 100f)")]),
    dict(name="hunger", label="饥饿", group="nutrition", mn=-50, mx=125,
         ev="Body.cs:170 默认 100f；Body.cs:3547 Mathf.Clamp(hunger - BaseHungerRate, -50f, 125f)",
         cites=[("Body.cs", 170, "public float hunger = 100f;"), ("Body.cs", 3547, "Mathf.Clamp(hunger - BaseHungerRate, -50f, 125f)")]),
    dict(name="thirst", label="口渴", group="nutrition", mn=-50, mx=250,
         ev="Body.cs:173 默认 100f；Body.cs:3548 Mathf.Clamp(thirst - BaseThirstRate(...), -50f, 250f)",
         cites=[("Body.cs", 173, "public float thirst = 100f;"), ("Body.cs", 3548, "Mathf.Clamp(thirst - BaseThirstRate(tempDiffFromNormal), -50f, 250f)")]),
    # ---------------- 体力与疲劳 ----------------
    dict(name="stamina", label="体力", group="vigor", mn=0, mx=None,
         ev="Body.cs:176 默认 100f；Body.cs:3565 Mathf.Clamp(..., 0f, Mathf.Max(70f, bloodOxygen)) —— 上界是动态的（max(70, 血氧)），故 max 记 null",
         cites=[("Body.cs", 176, "public float stamina = 100f;"), ("Body.cs", 3565, "0f, Mathf.Max(70f, bloodOxygen)")]),
    dict(name="energy", label="精力", group="vigor", mn=None, mx=None,
         ev="Body.cs:179 默认 100f；Body.cs:3500 仅做扣减，Body.cs:3526/3530/3534 直接赋值；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 179, "public float energy = 100f;"), ("Body.cs", 3500, "energy -= Time.deltaTime"), ("Body.cs", 3526, "energy = 100f;")]),
    dict(name="caffeinated", label="咖啡因（时长）", group="vigor", mn=None, mx=None,
         ev="Body.cs:312 声明；仅作 caffeinated>0f 判据（Body.cs:3565）；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 312, "public float caffeinated;"), ("Body.cs", 3565, "caffeinated > 0f")]),
    dict(name="badSleepAmount", label="睡眠不足量", group="vigor", mn=None, mx=None,
         ev="Body.cs:392 声明；Body.cs:3608 =60f、Body.cs:3612 =150f 直接赋值；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 392, "public float badSleepAmount;"), ("Body.cs", 3608, "badSleepAmount = 60f;"), ("Body.cs", 3612, "badSleepAmount = 150f;")]),
    dict(name="goodSleepTime", label="上次良好睡眠时刻（Time.time）", group="vigor", mn=None, mx=None,
         ev="Body.cs:395 声明；Body.cs:3617/3621 goodSleepTime = Time.time，是时间戳而非区间量；" + NO_CLAMP,
         cites=[("Body.cs", 395, "public float goodSleepTime;"), ("Body.cs", 3617, "goodSleepTime = Time.time;")]),
    # ---------------- 神经与意识 ----------------
    dict(name="brainHealth", label="脑健康", group="neuro", mn=0, mx=100,
         ev="Body.cs:182 默认 100f；Body.cs:3473 / Body.cs:3592 Mathf.Clamp(..., 0f, 100f)；Body.cs:648 alive => brainHealth>0f",
         cites=[("Body.cs", 182, "public float brainHealth = 100f;"), ("Body.cs", 3473, "0f, 100f"), ("Body.cs", 648, "brainHealth > 0f")]),
    dict(name="consciousness", label="意识", group="neuro", mn=0, mx=100,
         ev="Body.cs:185 默认 100f；Body.cs:3472 Mathf.Clamp(consciousness, 0f, 100f)；Body.cs:656 conscious => consciousness>30f",
         cites=[("Body.cs", 185, "public float consciousness = 100f;"), ("Body.cs", 3472, "Mathf.Clamp(consciousness, 0f, 100f)"), ("Body.cs", 656, "consciousness > 30f")]),
    dict(name="shock", label="休克值", group="neuro", mn=0, mx=100,
         ev="Body.cs:188 声明；Body.cs:3593 Mathf.Clamp(shock - ..., 0f, 100f)",
         cites=[("Body.cs", 188, "public float shock;"), ("Body.cs", 3593, "Mathf.Clamp(shock")]),
    dict(name="painShock", label="疼痛休克（0~1）", group="neuro", mn=0, mx=1,
         ev="Body.cs:330 声明；Body.cs:3453 painShock = Mathf.Clamp01(painShock)",
         cites=[("Body.cs", 330, "public float painShock;"), ("Body.cs", 3453, "Mathf.Clamp01(painShock)")]),
    dict(name="brainGrowSickness", label="脑部增生症", group="neuro", mn=None, mx=None,
         ev="Body.cs:433 声明；Body.cs:4578 重置 0f；Item.cs:1395 / MoodleManager.cs:895 仅作 >0f 判据；" + NO_CLAMP,
         cites=[("Body.cs", 433, "public float brainGrowSickness;"), ("Item.cs", 1395, "brainGrowSickness > 0f")]),
    dict(name="usedNeuralBooster", label="已使用神经增强剂", group="neuro", mn=None, mx=None,
         ev="Body.cs:438 声明 bool；单次事件标记；",
         cites=[("Body.cs", 438, "public bool usedNeuralBooster;")]),
    # ---------------- 濒死与最后挣扎 ----------------
    dict(name="triedRollingLastStand", label="已尝试最后挣扎", group="dying", mn=None, mx=None,
         ev="Body.cs:417 声明 bool；Body.cs:3492 !triedRollingLastStand && brainHealth<=15f 触发一次",
         cites=[("Body.cs", 417, "public bool triedRollingLastStand;"), ("Body.cs", 3492, "!triedRollingLastStand && brainHealth <= 15f")]),
    dict(name="succesfullyRolledLastStand", label="最后挣扎成功", group="dying", mn=None, mx=None,
         ev="Body.cs:420 声明 bool（注意原拼写 succesfully）；",
         cites=[("Body.cs", 420, "public bool succesfullyRolledLastStand;")]),
    dict(name="lastStandTime", label="最后挣扎剩余时间", group="dying", mn=None, mx=None,
         ev="Body.cs:425 声明；Body.cs:1403 复位 300f；Body.cs:3588 以 lastStandTime>0f 作判据；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 425, "public float lastStandTime;"), ("Body.cs", 1403, "lastStandTime = 300f;"), ("Body.cs", 3588, "lastStandTime > 0f")]),
    # ---------------- 疾病与免疫 ----------------
    dict(name="sicknessAmount", label="疾病程度", group="immune", mn=0, mx=100,
         ev="Body.cs:214 声明；Body.cs:3478 Mathf.Clamp(sicknessAmount - ..., 0f, 100f)",
         cites=[("Body.cs", 214, "public float sicknessAmount;"), ("Body.cs", 3478, "Mathf.Clamp(sicknessAmount")]),
    dict(name="septicShock", label="脓毒症休克", group="immune", mn=None, mx=None,
         ev="Body.cs:259 声明；Body.cs:3418 =100f、Body.cs:3426 =0f 直接赋值；Body.cs:744 以 >82.5f 为濒死判据；" + NO_CLAMP,
         cites=[("Body.cs", 259, "public float septicShock;"), ("Body.cs", 3418, "septicShock = 100f;"), ("Body.cs", 744, "septicShock > 82.5f")]),
    dict(name="radiationSickness", label="辐射病", group="immune", mn=None, mx=None,
         ev="Body.cs:301 声明；Body.cs:4376 累积疾病；Body.cs:3920 Clamp01(radiationSickness*0.02f-1f) 只是显示；字段本身无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 301, "public float radiationSickness;"), ("Body.cs", 4376, "radiationSickness"), ("Body.cs", 3920, "radiationSickness * 0.02f")]),
    dict(name="immunity", label="免疫力", group="immune", mn=0, mx=200,
         ev="Body.cs:403 声明；Body.cs:4325 Mathf.Clamp(immunity, 0f, 200f)；Body.cs:4279 >=199.5f 视为满免疫",
         cites=[("Body.cs", 403, "public float immunity;"), ("Body.cs", 4325, "Mathf.Clamp(immunity, 0f, 200f)"), ("Body.cs", 4279, "immunity >= 199.5f")]),
    dict(name="antibioticImmunityTime", label="抗生素免疫剩余时间", group="immune", mn=None, mx=None,
         ev="Body.cs:408 声明；Body.cs:1409 复位 120f；Body.cs:4310 <0f 归零；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 408, "public float antibioticImmunityTime;"), ("Body.cs", 1409, "antibioticImmunityTime = 120f;"), ("Body.cs", 4310, "antibioticImmunityTime < 0f")]),
    dict(name="venomTotal", label="毒素总量", group="immune", mn=None, mx=None,
         ev="Body.cs:492 声明；Body.cs:3429 MoveTowards 归零；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 492, "public float venomTotal;"), ("Body.cs", 3429, "venomTotal")]),
    dict(name="venomCurrent", label="当前毒素", group="immune", mn=None, mx=None,
         ev="Body.cs:495 声明；Body.cs:4214 以 1f-venomCurrent/20f 归一化（20 是归一化尺度，不是钳制）；" + NO_CLAMP,
         cites=[("Body.cs", 495, "public float venomCurrent;"), ("Body.cs", 4214, "venomCurrent / 20f")]),
    dict(name="venomFake", label="假性毒素（键名直译）", group="immune", mn=None, mx=None,
         ev="Body.cs:498 声明；Body.cs:4085 venomFake += 20f；Body.cs:3431 MoveTowards 归零；" + NO_CLAMP,
         cites=[("Body.cs", 498, "public float venomFake;"), ("Body.cs", 4085, "venomFake += 20f")]),
    # ---------------- 体温与环境 ----------------
    dict(name="temperature", label="体温（摄氏度）", group="thermal", mn=None, mx=None,
         ev="Body.cs:193 声明；Body.cs:1412/1507 复位 37f；Body.cs:3993 向环境温度 Lerp，无 Clamp；Body.cs:624 <28.5f 判低体温；" + NO_CLAMP,
         cites=[("Body.cs", 193, "public float temperature;"), ("Body.cs", 1412, "temperature = 37f;"), ("Body.cs", 624, "temperature < 28.5f")]),
    dict(name="wetness", label="湿润度", group="thermal", mn=0, mx=100,
         ev="Body.cs:363 声明；Body.cs:3591 Mathf.Clamp(wetness - ..., 0f, 100f)",
         cites=[("Body.cs", 363, "public float wetness;"), ("Body.cs", 3591, "Mathf.Clamp(wetness")]),
    dict(name="snowAmount", label="身上积雪量", group="thermal", mn=None, mx=None,
         ev="Body.cs:400 声明；LifepodShower.cs:22 以 >1f 作判据；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 400, "public float snowAmount;"), ("LifepodShower.cs", 22, "snowAmount > 1f")]),
    dict(name="dirtyness", label="污垢", group="thermal", mn=0, mx=100,
         ev="Body.cs:428 声明；Body.cs:3348 Mathf.Clamp(dirtyness + ..., 0f, 100f)",
         cites=[("Body.cs", 428, "public float dirtyness;"), ("Body.cs", 3348, "Mathf.Clamp(dirtyness")]),
    # ---------------- 伤情与外观 ----------------
    dict(name="disfigured", label="毁容", group="injury", mn=None, mx=None,
         ev="Body.cs:266 声明 bool；Body.cs:3961 disfigured && limbs[0].muscleHealth>50f 触发恢复",
         cites=[("Body.cs", 266, "public bool disfigured;"), ("Body.cs", 3961, "disfigured && limbs[0].muscleHealth > 50f")]),
    dict(name="eyeGone", label="单眼失明", group="injury", mn=None, mx=None,
         ev="Body.cs:269 声明 bool；WorldGeneration.cs 失明 runsetting 直接置位",
         cites=[("Body.cs", 269, "public bool eyeGone;")]),
    dict(name="bothEyesGone", label="双眼失明", group="injury", mn=None, mx=None,
         ev="Body.cs:272 声明 bool；PlayerCamera.cs:3402 以 bothEyesGone 增加模糊",
         cites=[("Body.cs", 272, "public bool bothEyesGone;"), ("PlayerCamera.cs", 3402, "body.bothEyesGone")]),
    dict(name="hearingLoss", label="听力损伤", group="injury", mn=0, mx=100,
         ev="Body.cs:317 声明；Body.cs:3361 Mathf.Clamp(hearingLoss - ..., 0f, 100f)",
         cites=[("Body.cs", 317, "public float hearingLoss;"), ("Body.cs", 3361, "Mathf.Clamp(hearingLoss")]),
    # ---------------- 兽化与爪 ----------------
    dict(name="clawHealth", label="爪健康", group="beast", mn=0, mx=100,
         ev="Body.cs:447 默认 100f；Body.cs:3346 Mathf.Clamp(clawHealth + ..., 0f, 100f)",
         cites=[("Body.cs", 447, "public float clawHealth = 100f;"), ("Body.cs", 3346, "Mathf.Clamp(clawHealth")]),
    dict(name="clawRegrowTime", label="爪再生剩余时间", group="beast", mn=None, mx=None,
         ev="Body.cs:450 声明；Body.cs:4590 复位 0f；Liquids.cs:1168 >3600f 作判据；无 Clamp；" + NO_CLAMP,
         cites=[("Body.cs", 450, "public float clawRegrowTime;"), ("Liquids.cs", 1168, "clawRegrowTime > 3600f")]),
    # ---------------- 容器 ----------------
    dict(name="skills", label="技能集合（子对象）", group="skill", mn=None, mx=None,
         ev="Body.cs:461 public Skills skills;（类型 Skills，非标量：写档必须用对象，其 18 个子键见下列 skills.* 条目）；Skills.cs:3-41 定义全部字段",
         cites=[("Body.cs", 461, "public Skills skills;"), ("Skills.cs", 3, "public class Skills")]),
]

# 技能子键（Skills.cs 声明顺序）
SKILL_FIELDS: list[dict] = [
    dict(name="STR", label="力量等级", mn=0, mx=None,
         ev="Skills.cs:5 public int STR;；Skills.cs:168-176 BaseSkills 按角色给 4~18 的初始等级；Skills.cs:135 targetLevel<=0 返回 0（允许 0 级）；无上限钳制（Skills.cs:121-131 升级循环无封顶）",
         cites=[("Skills.cs", 5, "public int STR;"), ("Skills.cs", 168, "public static int[] BaseSkills"), ("Skills.cs", 135, "if (targetLevel <= 0)")]),
    dict(name="RES", label="韧性等级", mn=0, mx=None,
         ev="Skills.cs:7 public int RES;；Skills.cs:172-175 BaseSkills 初始值；同 STR 无上限钳制",
         cites=[("Skills.cs", 7, "public int RES;"), ("Skills.cs", 172, "9, 8, 7")]),
    dict(name="INT", label="智力等级", mn=0, mx=None,
         ev="Skills.cs:9 public int INT;；Skills.cs:174 charType 2（犬类）初始 INT=0；无上限钳制",
         cites=[("Skills.cs", 9, "public int INT;"), ("Skills.cs", 174, "17, 18, 0")]),
    dict(name="expSTR", label="力量经验", mn=0, mx=None,
         ev="Skills.cs:11 public float expSTR;；Skills.cs:54 初始化为 minSTR；升级边界由 Skills.cs:59-67 UpdateExpBoundaries 动态给出，故 max 记 null",
         cites=[("Skills.cs", 11, "public float expSTR;"), ("Skills.cs", 59, "public void UpdateExpBoundaries")]),
    dict(name="expRES", label="韧性经验", mn=0, mx=None,
         ev="Skills.cs:13 public float expRES;；Skills.cs:55 初始化为 minRES；边界动态",
         cites=[("Skills.cs", 13, "public float expRES;"), ("Skills.cs", 55, "expRES = minRES;")]),
    dict(name="expINT", label="智力经验", mn=0, mx=None,
         ev="Skills.cs:15 public float expINT;；Skills.cs:56 初始化为 minINT；边界动态",
         cites=[("Skills.cs", 15, "public float expINT;"), ("Skills.cs", 56, "expINT = minINT;")]),
    dict(name="minSTR", label="力量当前等级经验下限", mn=0, mx=None,
         ev="Skills.cs:17 public int minSTR;；Skills.cs:61 minSTR = GetExperienceForLevel(STR)；Skills.cs:135 0 级时为 0",
         cites=[("Skills.cs", 17, "public int minSTR;"), ("Skills.cs", 61, "minSTR = GetExperienceForLevel(STR)")]),
    dict(name="maxSTR", label="力量升级经验阈值", mn=0, mx=None,
         ev="Skills.cs:19 public int maxSTR;；Skills.cs:62 maxSTR = GetExperienceForLevel(STR+1)（随等级增长，无绝对值上限）",
         cites=[("Skills.cs", 19, "public int maxSTR;"), ("Skills.cs", 62, "maxSTR = GetExperienceForLevel(STR + 1)")]),
    dict(name="minRES", label="韧性当前等级经验下限", mn=0, mx=None,
         ev="Skills.cs:21 public int minRES;；Skills.cs:63",
         cites=[("Skills.cs", 21, "public int minRES;"), ("Skills.cs", 63, "minRES = GetExperienceForLevel(RES)")]),
    dict(name="maxRES", label="韧性升级经验阈值", mn=0, mx=None,
         ev="Skills.cs:23 public int maxRES;；Skills.cs:64",
         cites=[("Skills.cs", 23, "public int maxRES;"), ("Skills.cs", 64, "maxRES = GetExperienceForLevel(RES + 1)")]),
    dict(name="minINT", label="智力当前等级经验下限", mn=0, mx=None,
         ev="Skills.cs:25 public int minINT;；Skills.cs:65",
         cites=[("Skills.cs", 25, "public int minINT;"), ("Skills.cs", 65, "minINT = GetExperienceForLevel(INT)")]),
    dict(name="maxINT", label="智力升级经验阈值", mn=0, mx=None,
         ev="Skills.cs:27 public int maxINT;；Skills.cs:66",
         cites=[("Skills.cs", 27, "public int maxINT;"), ("Skills.cs", 66, "maxINT = GetExperienceForLevel(INT + 1)")]),
    dict(name="STRGainMult", label="力量经验倍率", mn=None, mx=None,
         ev="Skills.cs:29 默认 1f；Skills.cs:179-188 BaseMultipliers 取 0.5/1；无钳制；" + NO_CLAMP,
         cites=[("Skills.cs", 29, "public float STRGainMult = 1f;"), ("Skills.cs", 179, "public static float[] BaseMultipliers")]),
    dict(name="RESGainMult", label="韧性经验倍率", mn=None, mx=None,
         ev="Skills.cs:31 默认 1f；BaseMultipliers 取 0.5/1；无钳制；" + NO_CLAMP,
         cites=[("Skills.cs", 31, "public float RESGainMult = 1f;"), ("Skills.cs", 183, "0 => new float[3] { 1f, 1f, 1f }")]),
    dict(name="INTGainMult", label="智力经验倍率", mn=None, mx=None,
         ev="Skills.cs:33 默认 1f；BaseMultipliers 取 0.5/1；无钳制；" + NO_CLAMP,
         cites=[("Skills.cs", 33, "public float INTGainMult = 1f;"), ("Skills.cs", 184, "0.5f, 0.5f, 1f")]),
    dict(name="STRFrom10", label="力量相对 10 的差值（派生只读）", mn=None, mx=None,
         ev="Skills.cs:37 public float STRFrom10 => (float)STR - 10f —— 只有 getter 的派生属性，写它不会生效（读档时会按 STR 重新计算）",
         cites=[("Skills.cs", 37, "STRFrom10"), ("Skills.cs", 37, "(float)STR - 10f")]),
    dict(name="RESFrom10", label="韧性相对 10 的差值（派生只读）", mn=None, mx=None,
         ev="Skills.cs:39 public float RESFrom10 => (float)RES - 10f —— 派生只读属性，写入无效",
         cites=[("Skills.cs", 39, "RESFrom10"), ("Skills.cs", 39, "(float)RES - 10f")]),
    dict(name="INTFrom10", label="智力相对 10 的差值（派生只读）", mn=None, mx=None,
         ev="Skills.cs:41 public float INTFrom10 => (float)INT - 10f —— 派生只读属性，写入无效",
         cites=[("Skills.cs", 41, "INTFrom10"), ("Skills.cs", 41, "(float)INT - 10f")]),
]

CSHARP_TO_JSON = {"float": "number", "int": "integer", "bool": "boolean", "string": "string", "Skills": "object"}
STEP_BY_JSON = {"number": 0.1, "integer": 1}

# --------------------------------------------------------------------------- #
# 肢体表（顺序依据：Body.GetTopOfExtremity 的 3 段分组 + 手/脚索引 + 语言键 F/B）
# --------------------------------------------------------------------------- #

LIMB_ORDER_EVIDENCE = (
    "Body.cs:1896-1926 GetTopOfExtremity：索引<=2 返回 null（0/1/2 不是四肢），"
    "3~5→limbs[3]、6~8→limbs[6]、9~11→limbs[9]、12~14→limbs[12]，即四肢是 4 组连续的 3 段链；"
    "Body.cs:704-707 bothHandsUnusable 用 limbs[5]/limbs[8] 的总力量 => 5、8 是手（所以 3~5、6~8 是两条手臂，先臂后腿）；"
    "Body.cs:2306-2326 GetAttackingLimb：handSlot 0→5→4→3，handSlot 1→8→7→6（手→前臂→上臂）；"
    "Body.cs:4328 hasLegs = !limbs[11].dismembered || !limbs[14].dismembered => 11、14 是脚（腿链 9~11、12~14）；"
    "Body.cs:2260 排便位置取 limbs[2] => 2 是腹/骨盆；Body.cs:2342 瞄准与后坐力基准取 limbs[1] => 1 是上躯干；"
    "Body.cs:744 死亡判据含 limbs[0].muscleHealth => 0 是头（脑）；"
    "Limb.cs:80-100 的 isVital/isHead/isAbdomen/isLegLimb/isArm 由 prefab 设定，"
    "资源复核（UnityPy，resources.assets 中 Body MonoBehaviour 的 limbs PPtr 数组）得到 "
    "Head,UpTorso,DownTorso,UpArmF,DownArmF,HandF,UpArmB,DownArmB,HandB,ThighF,CrusF,FootF,ThighB,CrusB,FootB；"
    "Lang/zh-CN.json other.{名}=全称、other.{名}Short=简称（F=右、B=左，如 UpArmF=右上臂/UpArmB=左上臂），"
    "Limb.cs:47-49 fullName/shortName 即按该规则取值"
)

LIMBS = [
    dict(index=0, key="Head", label="头部", shortLabel="头", isVital=False,
         ev="prefab 轴：isHead=1、isVital=0；Lang other.Head=头部 / HeadShort=头；Body.cs:744 limbs[0].muscleHealth<25f 进入濒死判据（头部/脑）"),
    dict(index=1, key="UpTorso", label="胸部", shortLabel="胸", isVital=True,
         ev="prefab 轴：isVital=1、generateHeat=1；Lang other.UpTorso=胸部 / Short=胸；Body.cs:2342 瞄准基准、AEDMinigame.cs:110 除颤目标为 limbs[1]；Limb.cs:791-796 isVital 肢体肌肉坏死会令 respiratoryRate=0"),
    dict(index=2, key="DownTorso", label="腹部", shortLabel="肚子", isVital=False,
         ev="prefab 轴：isAbdomen=1、generateHeat=1，且 isLegLimb=1 —— 这正解释了 Body.cs:3815 的 limb.isLegLimb && limb != limbs[2] 特判（反证索引 2 = DownTorso）；Lang other.DownTorso=腹部 / Short=肚子；Body.cs:2260 排便取 limbs[2].transform.position；Body.cs:870-873 被货物刺穿伤害 limbs[2]"),
    dict(index=3, key="UpArmF", label="右上臂", shortLabel="右臂", isVital=False,
         ev="prefab 轴：isArm=1、distanceToHeart=1、linked=UpArmF 链顶；Lang other.UpArmF=右上臂 / Short=右臂；Body.cs:1911 GetTopOfExtremity(3~5)=limbs[3]"),
    dict(index=4, key="DownArmF", label="右前臂", shortLabel="右臂", isVital=False,
         ev="prefab 轴：isArm=1、distanceToHeart=2；Lang other.DownArmF=右前臂 / Short=右臂；Body.cs:2312-2316 handSlot0 第二顺位"),
    dict(index=5, key="HandF", label="右手", shortLabel="右手", isVital=False,
         ev="prefab 轴：isArm=1、distanceToHeart=3；Lang other.HandF=右手；Body.cs:2308-2310 handSlot0 首选、Body.cs:704 bothHandsUnusable"),
    dict(index=6, key="UpArmB", label="左上臂", shortLabel="左臂", isVital=False,
         ev="prefab 轴：isArm=1、distanceToHeart=1；Lang other.UpArmB=左上臂 / Short=左臂；Body.cs:1915 GetTopOfExtremity(6~8)=limbs[6]"),
    dict(index=7, key="DownArmB", label="左前臂", shortLabel="左臂", isVital=False,
         ev="prefab 轴：isArm=1、distanceToHeart=2；Lang other.DownArmB=左前臂 / Short=左臂；Body.cs:2322-2326 handSlot1 第二顺位；SelfHarmer.cs:267 随机取 limbs[4]/limbs[7]（前臂自伤）"),
    dict(index=8, key="HandB", label="左手", shortLabel="左手", isVital=False,
         ev="prefab 轴：isArm=1、distanceToHeart=3；Lang other.HandB=左手；Body.cs:2318-2320 handSlot1 首选；FirstAidCourse.cs:304 教学用 limb[8]"),
    dict(index=9, key="ThighF", label="右大腿", shortLabel="右腿", isVital=False,
         ev="prefab 轴：isLegLimb=1、distanceToHeart=2；Lang other.ThighF=右大腿 / Short=右腿；Item.cs:6333 desiredWearLimb=\"ThighF\"（wearSlot thigh）"),
    dict(index=10, key="CrusF", label="右小腿", shortLabel="右腿", isVital=False,
         ev="prefab 轴：isLegLimb=1、distanceToHeart=3；Lang other.CrusF=右小腿 / Short=右腿；Item.cs:7060 desiredWearLimb=\"CrusF\"（wearSlot knees）"),
    dict(index=11, key="FootF", label="右脚", shortLabel="右脚", isVital=False,
         ev="prefab 轴：isLegLimb=1、distanceToHeart=4；Lang other.FootF=右脚 / Short=右脚爪；Body.cs:4328 hasLegs 判据、GroundGlass.cs:20 随机 11/14 踩玻璃、Item.cs:6865 desiredWearLimb=\"FootF\""),
    dict(index=12, key="ThighB", label="左大腿", shortLabel="左腿", isVital=False,
         ev="prefab 轴：isLegLimb=1、distanceToHeart=2；Lang other.ThighB=左大腿 / Short=左腿；Item.cs:6373 desiredWearLimb=\"ThighB\"（wearSlot thighback）"),
    dict(index=13, key="CrusB", label="左小腿", shortLabel="左腿", isVital=False,
         ev="prefab 轴：isLegLimb=1、distanceToHeart=3；Lang other.CrusB=左小腿 / Short=左腿"),
    dict(index=14, key="FootB", label="左脚", shortLabel="左脚", isVital=False,
         ev="prefab 轴：isLegLimb=1、distanceToHeart=4；Lang other.FootB=左脚 / Short=左脚爪；Body.cs:4328 hasLegs 判据、BananaPlantSlip.cs:14 以 limbs[11]/limbs[14] 判滑倒"),
]

LIMB_LABEL_FALLBACK = {limb["key"]: (limb["label"], limb["shortLabel"]) for limb in LIMBS}

# --------------------------------------------------------------------------- #
# meta 表
# --------------------------------------------------------------------------- #

WEAR_SLOT_LABELS = {
    "hat": "头戴", "eyes": "眼部", "mouth": "嘴部", "blindfold": "眼罩",
    "balaclava": "巴拉克拉瓦头套", "neck": "颈部", "back": "背部",
    "outertorso": "上躯干（外套）", "torso": "躯干", "torsofront": "胸前",
    "hands": "手部", "arms": "手臂", "wraps": "缠布", "bandolier": "子弹带",
    "thigh": "大腿（前）", "thighback": "大腿（后）", "knees": "膝部",
    "feet": "脚部", "belt": "腰带",
}
# Lang 里对 wearSlot 没有独立的本地化键（PlayerCamera.cs:1614 直接回显 wearSlotId），
# 以下 5 条为 Lang 中恰好同名的键，用于交叉校验；其余为语义直译。
WEAR_SLOT_LANG_KEYS = {"mouth", "blindfold", "balaclava", "bandolier", "belt"}

ITEM_CATEGORY_LABELS = {
    "medical": "医疗物品", "drug": "药物", "container": "容器", "food": "食物",
    "water": "饮料", "tool": "工具", "utility": "实用物品",
    "custom": "通用（未分类，键名直译）", "trash": "垃圾（键名直译）",
    "unobtainable": "不可获得（键名直译）",
}

RECIPE_CATEGORY_LABELS = {
    "Materials": "材料", "Tools": "工具", "Medicine": "医疗物品",
    "Utilities": "实用物品", "Food": "食物",
}

CHAR_TYPE_LABELS = {
    0: "Experiment（实验体）", 1: "Milky（白色毛茸生物）", 2: "Dune（沙丘·类昆虫科）",   # Lang other.char0name/char1name/char2name
}

# 游戏内只有 3 个技能等级（Scripts 侧只有 STR/RES/INT，无第 4/5 个技能），
# 但 save.json 的 skills 对象共 18 个键；这里覆盖全部键，前三个是等级，其余是经验/倍率/派生值。
SKILL_KEY_LABELS = {
    "STR": "力量", "RES": "韧性", "INT": "智力",
    "expSTR": "力量经验", "expRES": "韧性经验", "expINT": "智力经验",
    "minSTR": "力量当前等级经验下限", "maxSTR": "力量升级经验阈值",
    "minRES": "韧性当前等级经验下限", "maxRES": "韧性升级经验阈值",
    "minINT": "智力当前等级经验下限", "maxINT": "智力升级经验阈值",
    "STRGainMult": "力量经验倍率", "RESGainMult": "韧性经验倍率", "INTGainMult": "智力经验倍率",
    "STRFrom10": "力量相对 10 的差值（派生只读）",
    "RESFrom10": "韧性相对 10 的差值（派生只读）",
    "INTFrom10": "智力相对 10 的差值（派生只读）",
}


# --------------------------------------------------------------------------- #
# 源码声明解析
# --------------------------------------------------------------------------- #

DECL_RE = re.compile(
    r"^\s*public\s+(?:static\s+)?(float|int|bool|string|Skills)\s+([A-Za-z_]\w*)\s*(?:=>|[=;])"
)
SKILL_DECL_RE = re.compile(
    r"^\s*public\s+(?:static\s+)?(float|int)\s+([A-Za-z_]\w*)\s*(?:=>|[=;])"
)


def parse_decls(filename: str, pattern: re.Pattern) -> dict[str, tuple[str, int]]:
    out: dict[str, tuple[str, int]] = {}
    for i, line in enumerate(src(filename), 1):
        m = pattern.match(line)
        if m and m.group(2) not in out:
            out[m.group(2)] = (m.group(1), i)
    return out


def check_cites(entries: list[dict]) -> list[str]:
    """核对所有 evidence 引用：file:line 必须存在且包含所引片段。"""
    problems = []
    for e in entries:
        for file, lineno, token in e.get("cites", []):
            try:
                text = line_of(file, lineno)
            except SystemExit as exc:            # 越界
                problems.append(f"{e['name']}: {exc}")
                continue
            if token not in text:
                problems.append(
                    f"{e['name']}: 引用不符 {file}:{lineno} 期望包含 {token!r}，实际 {text.strip()[:100]!r}"
                )
    return problems


def build_bodyfields(body_keys: list[str], skill_keys: list[str]) -> tuple[dict, list[str]]:
    body_decls = parse_decls("Body.cs", DECL_RE)
    skill_decls = parse_decls("Skills.cs", SKILL_DECL_RE)

    spec_by_name = {f["name"]: f for f in FIELDS}
    spec_by_name.update({f"skills.{f['name']}": f for f in SKILL_FIELDS})

    expected = [k for k in body_keys if k != "skills"] + ["skills"] + skill_keys
    fields, problems, notes = [], [], []

    for name in expected:
        if name in skill_keys:
            spec = spec_by_name.get(f"skills.{name}")
            decl = skill_decls.get(name)
            field_name = name
        else:
            spec = spec_by_name.get(name)
            decl = body_decls.get(name)
            if name == "skills":
                decl = body_decls.get("skills")
            field_name = name
        if spec is None:
            problems.append(f"缺少规格: {name}")
            continue
        if decl is None:
            problems.append(f"源码中找不到声明: {name}")
            continue

        ctype = decl[0]
        if ctype not in CSHARP_TO_JSON:
            problems.append(f"未知 C# 类型 {ctype}: {name}")
            continue
        json_type = CSHARP_TO_JSON[ctype]
        step = STEP_BY_JSON.get(json_type)
        if name == "skills":
            notes.append("skills 是嵌套对象（csharpType=Skills），写档时必须整体给对象，不能写成数字")

        mn, mx = spec["mn"], spec["mx"]
        if mn is not None and mx is not None and mn > mx:
            problems.append(f"min>max: {name}")
        if "无钳制证据" in spec["ev"] and (mn is not None or mx is not None):
            problems.append(f"evidence 声称无钳制却给了范围: {name}")

        declared_at = f"{'Skills.cs' if name in skill_keys else 'Body.cs'}:{decl[1]}"
        fields.append({
            "name": field_name,
            "csharpType": ctype,
            "jsonType": json_type,
            "label": spec["label"],
            "group": GROUP[spec.get("group", "skill")],
            "min": mn,
            "max": mx,
            "step": step,
            "evidence": f"声明 {declared_at}；{spec['ev']}",
        })

    problems += check_cites(FIELDS)
    problems += check_cites(SKILL_FIELDS)

    names = {f["name"] for f in fields}
    missing = [k for k in expected if k not in names]
    doc = {"generatedBy": GEN_BY, "count": len(fields), "fields": fields}
    return doc, problems + [f"未覆盖: {m}" for m in missing]


def build_limbs() -> dict:
    limbs = []
    for limb in LIMBS:
        label, short = LIMB_LABEL_FALLBACK[limb["key"]]
        if ZH_OTHER:
            label = ZH_OTHER.get(limb["key"], label)
            short = ZH_OTHER.get(limb["key"] + "Short", short)
        limbs.append({
            "index": limb["index"],
            "key": limb["key"],
            "label": label,
            "shortLabel": short,
            "isVital": limb["isVital"],
            "evidence": limb["ev"],
        })
    return {"count": len(limbs), "method": LIMB_ORDER_EVIDENCE, "limbs": limbs}


def slot_ids_from_items() -> list[str]:
    found = []
    for line in src("Item.cs"):
        m = re.search(r'wearSlotId\s*=\s*"([^"]+)"', line)
        if m and m.group(1) not in found:
            found.append(m.group(1))
    return found


def item_categories_from_items() -> list[str]:
    found = []
    for line in src("Item.cs"):
        m = re.search(r'\bcategory\s*=\s*"([^"]+)"', line)
        if m and m.group(1) not in found:
            found.append(m.group(1))
    return found


def recipe_categories() -> list[str]:
    lines = src("Recipes.cs")
    start = next(i for i, l in enumerate(lines) if "enum RecipeCategory" in l)
    body_start = next(i for i in range(start, len(lines)) if "{" in lines[i])
    out = []
    for line in lines[body_start + 1:]:
        if "}" in line:
            break
        name = re.sub(r"\s*,?\s*$", "", line.strip())
        if re.fullmatch(r"[A-Za-z_]\w*", name):
            out.append(name)
    return out


def biomes() -> tuple[list[dict], str]:
    """biomeDepth 取值范围 = biomeTitles 的长度；标题按 layertitle{i+1} 取（WorldGeneration.cs:400-402）。"""
    numbered = []
    if ZH_OTHER:
        numbered = sorted(
            (int(m.group(1)), k) for k in ZH_OTHER
            if (m := re.fullmatch(r"layertitle(\d+)", k))
        )
    if not numbered:
        return [], "Lang 不可用，无法确定 biome 数量"
    out = []
    for zero_based, (n, key) in enumerate(numbered):
        out.append({"value": zero_based, "label": ZH_OTHER[key]})
    return out, f"WorldGeneration.cs:400-402 biomeTitles[i]=Locale.GetOther(\"layertitle\"+(i+1))；合法值 0~{len(out) - 1}"


def skill_key_order() -> list[str]:
    """save.json 里 skills 的全部键，等级键排前面（CONTRACT 说的 5 个技能键在实测里只有 3 个等级）。"""
    obj = json.loads(SAVE.read_text(encoding="utf-8")).get("body", {}).get("skills", {})
    keys = list(obj.keys())
    head = [k for k in ("STR", "RES", "INT") if k in keys]
    return head + [k for k in keys if k not in head]


def build_meta() -> tuple[dict, list[str], list[str]]:
    problems, notes = [], []
    slots = slot_ids_from_items()
    missing_slot_labels = [s for s in slots if s not in WEAR_SLOT_LABELS]
    if missing_slot_labels:
        problems.append(f"wearSlot 缺中文名: {missing_slot_labels}")

    cats = item_categories_from_items()
    items_json = DATA / "items.json"
    if items_json.is_file():
        try:
            payload = json.loads(items_json.read_text(encoding="utf-8"))
            for it in payload.get("items", []):
                c = it.get("category")
                if c and c not in cats:
                    cats.append(c)
                    notes.append(f"items.json 里出现 Item.cs 未匹配到的 category: {c}")
        except (json.JSONDecodeError, OSError) as exc:
            notes.append(f"items.json 读取失败，仅用 Item.cs 结果: {exc}")
    missing_cat_labels = [c for c in cats if c not in ITEM_CATEGORY_LABELS]
    if missing_cat_labels:
        problems.append(f"item category 缺中文名: {missing_cat_labels}")

    recipes_cats = recipe_categories()
    missing_recipe_labels = [c for c in recipes_cats if c not in RECIPE_CATEGORY_LABELS]
    if missing_recipe_labels:
        problems.append(f"配方分类缺中文名: {missing_recipe_labels}")

    biome_list, biome_note = biomes()
    if not biome_list:
        problems.append("biome 表为空")

    for key in ("Head", "UpTorso", "DownTorso", "UpArmF"):
        if ZH_OTHER and key not in ZH_OTHER:
            problems.append(f"Lang 缺少肢体键 {key}")

    doc = {
        "wearSlots": [{"id": s, "label": WEAR_SLOT_LABELS[s]} for s in slots],
        "charTypes": [{"value": v, "label": CHAR_TYPE_LABELS[v]} for v in sorted(CHAR_TYPE_LABELS)],
        "skillKeys": [{"key": k, "label": SKILL_KEY_LABELS.get(k, k)} for k in skill_key_order()],
        "recipeCategories": [{"key": c, "label": RECIPE_CATEGORY_LABELS[c]} for c in recipes_cats],
        "itemCategories": [{"id": c, "label": ITEM_CATEGORY_LABELS.get(c, c)} for c in cats],
        "biomes": biome_list,
    }
    notes.append(biome_note)
    notes.append("wearSlots/charTypes 标签来源：Lang 无 wearSlot 本地化键（PlayerCamera.cs:1614 直接显示 id），"
                 "故为语义直译；charTypes 依据 Locale.cs:129 GetCharacter(str, body.charType)（即 Lang character[] 按 charType 取整套台词）+ "
                 "Skills.cs:168-188 BaseSkills/BaseMultipliers（0:{9,8,7} / 1:{4,6,12} / 2:{17,18,0}）+ Body.cs:2813 charType==2 才吃肉 + "
                 "Lang other.experiment / tutorialspecieslock / main.dogfooddsc")
    return doc, problems, notes


# --------------------------------------------------------------------------- #
# 可选：用 UnityPy 复核 prefab 里的 limbs 顺序
# --------------------------------------------------------------------------- #

def verify_prefab_order() -> str:
    try:
        import UnityPy  # noqa: PLC0415
        import struct
    except ImportError:
        return "跳过（未安装 UnityPy）"
    if not ASSETS.is_file():
        return f"跳过（找不到 {ASSETS}）"

    env = UnityPy.load(str(ASSETS))
    by_pid = {o.path_id: o for o in env.objects}
    body = None
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        raw = obj.get_raw_data()
        if len(raw) < 1200:
            continue
        for stride in (12, 8):
            pad = 4 if stride == 12 else 0
            pids = [struct.unpack_from("<q", raw, off + pad)[0]
                    for off in range(0, len(raw) - stride, stride)]
            # 找连续 15 个指向 250~420 字节 MonoBehaviour 的 PPtr
            run: list[int] = []
            for pid in pids + [0]:
                hit = pids and pid in by_pid and by_pid[pid].type.name == "MonoBehaviour"
                size = 0
                if hit:
                    try:
                        size = len(by_pid[pid].get_raw_data())
                    except Exception:  # pragma: no cover
                        size = 0
                if hit and 250 <= size <= 420:
                    run.append(pid)
                    if len(run) == 15:
                        body = (obj.path_id, stride, pad, raw, run)
                        break
                else:
                    run = []
            if body:
                break
        if body:
            break
    if not body:
        return "跳过（未在资源里定位到 limbs[15] PPtr 连续块）"

    body_pid, stride, pad, raw, run = body
    names = []
    for pid in run:
        # Limb 的 m_GameObject PPtr 在 MB 头 4..11 字节（int32 fileID + int64 pathID）
        r = by_pid[pid].get_raw_data()
        go_pid = struct.unpack_from("<q", r, 4)[0]
        go = by_pid.get(go_pid)
        names.append(go.read().m_Name if go is not None else f"pid{pid}")
    ok = names == [l["key"] for l in LIMBS]
    return (f"{'一致' if ok else '不一致'}：Body MB pathID={body_pid}，stride={stride}，"
            f"顺序 {' , '.join(names)}")


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefab", action="store_true", help="用 UnityPy 复核肢体顺序")
    args = ap.parse_args()

    if not SAVE.is_file():
        raise SystemExit(f"缺少 {SAVE}")
    save = json.loads(SAVE.read_text(encoding="utf-8"))
    body = save.get("body", {})
    body_keys = list(body.keys())
    skills_obj = body.get("skills", {})
    skill_keys = list(skills_obj.keys())

    bodyfields, problems = build_bodyfields(body_keys, skill_keys)
    limbs = build_limbs()
    meta, meta_problems, meta_notes = build_meta()
    problems += meta_problems

    problems += check_limb_cites()

    # ---- limbs 自检 ----
    if limbs["count"] != 15 or [l["index"] for l in limbs["limbs"]] != list(range(15)):
        problems.append("limbs 必须恰好 15 条且 index 0..14 连续")
    used = list(save.get("limbs", []))
    if used and len(used) != limbs["count"]:
        problems.append(f"save.json limbs 长度 {len(used)} != {limbs['count']}")

    # ---- meta 覆盖率 ----
    meta_slots = {s["id"] for s in meta["wearSlots"]}
    meta_cats = {c["id"] for c in meta["itemCategories"]}
    print("=== body 覆盖率 ===")
    covered = {f["name"] for f in bodyfields["fields"]}
    flat_expected = [k for k in body_keys if k != "skills"] + ["skills"] + skill_keys
    missing = [k for k in flat_expected if k not in covered]
    print(f"body 顶层键 {len(body_keys)}（含 skills 容器）+ skills 子键 {len(skill_keys)} = 期望 {len(flat_expected)} 条；产出 {bodyfields['count']} 条")
    print(f"未覆盖清单: {missing if missing else '[]  ← 必须为空'}")
    print("=== limbs ===")
    print(f"count={limbs['count']} index={[l['index'] for l in limbs['limbs']]}")
    print("=== meta ===")
    print(f"wearSlots {len(meta['wearSlots'])}: {sorted(meta_slots)}")
    print(f"itemCategories {len(meta['itemCategories'])}: {sorted(meta_cats)}")
    print(f"recipeCategories {[c['key'] for c in meta['recipeCategories']]}")
    print(f"biomes {len(meta['biomes'])}: 0..{len(meta['biomes']) - 1}")
    for note in meta_notes:
        print("  note:", note)

    save_slots = {it.get("wearSlotId") for it in save.get("items", []) if isinstance(it, dict) and it.get("wearSlotId")}
    if save_slots:
        missing_save_slots = save_slots - meta_slots
        print(f"save.json 中出现的 wearSlot: {sorted(save_slots)} -> 缺失 {sorted(missing_save_slots) or '无'}")
        if missing_save_slots:
            problems.append(f"meta 未覆盖存档中的 wearSlot: {sorted(missing_save_slots)}")

    if args.prefab:
        print("=== prefab 顺序复核 ===")
        print(verify_prefab_order())

    if problems:
        print("\n!! 校验失败 !!")
        for p in problems:
            print("  -", p)
        return 1

    DATA.mkdir(parents=True, exist_ok=True)
    for name, payload in (
        ("bodyfields.json", bodyfields),
        ("limbs.json", limbs),
        ("meta.json", meta),
    ):
        path = DATA / name
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        json.loads(path.read_text(encoding="utf-8"))      # 写后自检
        print(f"写出 {path.relative_to(ROOT)}")

    print("\n全部校验通过：证据引用逐条核对无误。")
    return 0


def check_limb_cites() -> list[str]:
    """肢体的 evidence 里引用到的 file:line 逐条核对。"""
    problems = []
    cites = []
    for limb in LIMBS:
        for m in re.finditer(r"(\w+\.cs):(\d+)(?:-(\d+))?", limb["ev"]):
            cites.append((limb["key"], m.group(1), int(m.group(2)), m.group(3)))
    for key, file, lineno, end in cites:
        try:
            assert line_of(file, lineno) is not None
            if end:
                line_of(file, int(end))
        except SystemExit as exc:
            problems.append(f"limb {key}: {exc}")
    return problems


if __name__ == "__main__":
    sys.exit(main())
