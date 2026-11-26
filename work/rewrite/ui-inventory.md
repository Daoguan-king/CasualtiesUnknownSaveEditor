
# 现有修改器界面与行为清单（UI Inventory）

> 用途：为 React + Astryx UI 重写提供「不再读源码也能复刻」的行为基线。事实全部来自以下只读文件，行号 = 该文件内 1 起始行号。
> 源文件：src/app.js（173 行）、src/core.js（391 行）、src/panels.js（910 行）、src/selftest.js（164 行）、src/template.html（35 行）、src/theme.css（398 行）、build.js（127 行）。
> 数据文件（用于核对行数，只读）：work/data/*.json、work/save.json。
> 约定：`file:line` 中的 `panels.js:123` 指 src/panels.js 第 123 行；`build.js:21` 指 SaveEditor/build.js 第 21 行。无法从上述文件唯一确定的事实标「待验证」并给原因。

## 1. 外壳与全局行为

### 1.1 页面骨架（template.html:11-34）
`#app` 纵向排布（theme.css:52），内含 `#topbar`（template.html:12-20）与 `#main`（template.html:21-24，`#rail` + `#content`）。全局浮层：`#drop`（template.html:26）、`#toast`（template.html:27）、隐藏的 `#fileinput`（template.html:28）。脚本注入顺序：`__DATA`、`__ART`、`__CORE__`、`__PANELS__`、`__APP__`（template.html:29-33；build.js:85-93）。

### 1.2 顶栏（template.html:12-20；theme.css:53-68）
- `#brand`：主标题「Casualties: Unknown」+ 小字「存档修改器」。
- `#filechip`：文件状态徽片。内容由 `updateFileChip()` 维护（app.js:105-116）：无存档显示「未载入存档」；有存档显示文件名 + 标签「可覆盖原文件」（有 FileSystem handle）或「需另存」（无 handle）。
- `#status`：底部状态文本，由 `refreshFooter()` 维护（core.js:347-357）：无存档「未载入存档」；有改动「已修改 **N** 处」；无改动「与原文件一致」。
- `#savebadge`：徽标，`badge ok`=「干净」、`badge warn`=「有未保存修改」（core.js:353-357）。
- `#btnOpen`：打开存档（app.js:153 绑定 `openPicker`）；`#btnSave`：保存（app.js:154 绑定 `doSave(false)`）。

### 1.3 导航 rail（app.js:2-18；buildRail app.js:26-38）
`NAV` 数组定义 10 个面板与 5 个分组。点按钮设 `S.panel = n.id` 并 `renderPanel()`（app.js:31）。当前项加 `.on`（app.js:33；theme.css:80）。表：
| 分组 | panel id | 中文名 | 图标 |
|---|---|---|---|
| 档案 | overview | 概览 | ▣ |
| 身体 | body | 医疗面板 | ♥ |
| 身体 | limbs | 肢体损伤 | ✚ |
| 身体 | skills | 技能 | ▲ |
| 物品 | items | 物品栏 | ▤ |
| 世界 | world | 世界与进度 | ◈ |
| 世界 | settings | 运行设置 | ≡ |
| 世界 | recipes | 配方进度 | ✦ |
| 文件 | json | 原始 JSON | ⌗ |
| 文件 | export | 校验与导出 | ⇩ |
rail 底部固定显示分组「存档路径」+ 文本「…\LocalLow\Orsoniks\CasualtiesUnknown\save.sv」（app.js:36-37）。每个 rail 按钮有一个 `.dot` 圆点，仅当该面板有改动时加 `.dirty` 显示（app.js:32；core.js:358-362；theme.css:82-83）。窗口 <980px 时 rail 变横向（theme.css:382-392）。

### 1.4 无存档空状态（app.js:44-51；theme.css:238-239）
`renderPanel()` 在 `!S.save` 时渲染 `.empty`：图标 ▤、提示「把 **save.sv** 拖进窗口」、提示「或点右上角「打开存档」」、路径提示（建议先关游戏并备份）。此时 nav 仍可点，但所有面板都显示同一个空状态。

### 1.5 拖放（app.js:161-169；theme.css:270-275）
window 级 `dragenter/dragover/dragleave/drop`。用计数器 `depth` 控制 `#drop.show`（dragenter +1，dragleave -1，<=0 隐藏）。drop 取 `e.dataTransfer.files[0]` 调 `loadFile(f)`。

### 1.6 toast（core.js:120-125；theme.css:263-269）
`toast(msg, bad)`：写 `#toast` 文本，加 `.show`（bad 时再加 `.bad`），2600ms 后自动消失，重复调用重置计时。

### 1.7 状态 / 脏计数（core.js:347-363）
- `changeCount()` = `diffAll(S.orig, S.save).length`（core.js:202）。`diffAll` 递归逐叶子比对，数组用 `[i]` 记路径，新增键记 `from: undefined`（core.js:182-201）。
- `refreshFooter()`：写 `#status` 与 `#savebadge`，并给每个 rail 按钮按 `panelDirty(p)` 加 `.dirty`（core.js:347-363）。
- `S.orig` 在载入时设为 `S.save` 的深拷贝（app.js:70），在写回后重新同步（app.js:145），因此「干净」= 与最近一次载入/写回一致。

### 1.8 文件读写
- 打开：`openPicker()` 优先 `showOpenFilePicker`（类型 .sv/.sav/.json，app.js:88-103），失败回退 `#fileinput.click()`；`loadFile()`（app.js:79-86）→ `loadBytes()`（app.js:63-77）：`gunzip` → `JSON.parse` → 校验 `json.body` 存在 → 设 `S.save/S.orig/fileName/fileHandle`，重置 `S.panel="overview"`、`S.sel=null`，`updateFileChip`+`renderPanel`+toast（「已载入 X（body N 项 / 物品 M 件）」）。
- 保存：`doSave(asDownload)`（app.js:119-148）：先 `validate()`，有错误则 `confirm` 列出前 6 条；`gzipText(toAsciiJson(S.save))` 后，若 `S.fileHandle && !asDownload` 用 File System Access API 覆盖写，否则 Blob 下载固定名 `save.sv`；最后 `S.orig = 深拷贝(S.save)` 并刷新。
- 编码：`toAsciiJson(obj)` 把 U+007F..U+FFFF 全部转 `\uXXXX`（core.js:162-166），因为游戏用 Encoding.ASCII 读写档（注释 core.js:161）。`gunzip`/`gzipText` 用浏览器 `DecompressionStream`/`CompressionStream`，要求 Edge/Chrome 103+（core.js:151-160）。

## 2. 逐面板清单

### 2.1 overview 概览（panels.js:30-70）
结构：页头（ptitle + sub）→ 10 张摘要卡 → 「一键预设」面板。
| 卡片标签 | 取值来源 | 证据 |
|---|---|---|
| 角色 | `charTypeName(S.save.character)` | panels.js:36 |
| 身高 / 年龄 | `cHeight + " cm / " + cAge + " y"` | panels.js:37 |
| 当前层数 | `biome` | panels.js:38 |
| 行进距离 | `totalTraveled` m | panels.js:39 |
| 游玩时长 | `fmtTime(runTime)`（hh:mm:ss） | panels.js:40；fmtTime panels.js:7-11 |
| 摄食热量 | `caloriesConsumed` Cal | panels.js:41 |
| 携带物品 | `items.length` 件 | panels.js:42 |
| 已解锁配方 | `savedRecipeData.saved` 中 `Item1===true` 数 / 总数 | panels.js:43 |
| 作弊标记 | `cheatedSave ? 已标记 : 无作弊`（bad 高亮） | panels.js:44 |
| 佣兵局 | `isMercRun ? 是 : 否` | panels.js:45 |
一键预设面板：7 个按钮，标题见 panels.js:48-63；点击执行 `p.f()` 后 toast「已应用：X」并 `renderPanel()+refreshFooter()`（panels.js:66）。面板头部计数 `PRESETS.length + " 项"`，下方提示「当前有 N 处改动未保存」（panels.js:68-69）。各预设改动的字段见 §6。

### 2.2 body 医疗面板（panels.js:627-666）
结构：页头 → 4 张卡（角色类型/身高/年龄/编号，panels.js:633-636）→ 按组分组的字段面板网格（`.vgrid`，panels.js:648-665）。
分组规则（panels.js:640-646）：遍历 `S.save.body` 的键，跳过 `skills`；组名 = `fieldMeta(k).group`，无元数据归「其他」；组顺序 = 键首次出现顺序。行构造（panels.js:650-662）：
- `csharpType === "bool"` → `fBool(["body",k])`，单位列写 `bool`。
- 其余 → `fNumber(["body",k], {min:m.min, max:m.max, int:m.csharpType==="int", step: int?1:0.01})`；`min`+`max` 都非空时 fNumber 生成 range+number 双控件（core.js:214-219）。
- 标签 = `fieldMeta.label`，键名列 = `k`；`isChanged(["body",k])` 为真时行加 `.changed`（panels.js:660）。
分组行数（依据打包样例 work/save.json 的 `body` 键，共 61 行、13 组；行数动态，见 §8 坑 1）：
| 分组标题 | 行数 | 分组标题 | 行数 |
|---|---|---|---|
| 运动与移动 | 5 | 心血管 | 14 |
| 呼吸 | 1 | 内分泌 | 2 |
| 情绪与创伤 | 4 | 营养与代谢 | 3 |
| 体力与疲劳 | 5 | 神经与意识 | 6 |
| 体温与环境 | 4 | 疾病与免疫 | 8 |
| 伤情与外观 | 4 | 濒死与最后挣扎 | 3 |
| 爪子 | 2 | | |
61 行明细（键 / 中文标签 / 分组 / 类型 / 控件 / 取值范围；范围来自 work/data/bodyfields.json 的 min/max，`—` 表示无钳制；控件规则见上）：
| 键 | 中文标签 | 分组 | 类型 | 控件 | 取值范围 |
|---|---|---|---|---|---|
| maxSpeed | 最大移动速度 | 运动与移动 | float | number | — |
| jumpSpeed | 跳跃速度 | 运动与移动 | float | number | — |
| temporarySlowdown | 临时减速（0~1 比例） | 运动与移动 | float | number | — |
| moveForce | 移动推力 | 运动与移动 | float | number | — |
| slowdownAmount | 减速量 | 运动与移动 | float | number | — |
| bloodOxygen | 血氧 | 心血管 | float | range+number | 0~100 |
| bloodVolume | 血量 | 心血管 | float | number | — |
| heartRate | 心率 | 心血管 | float | range+number | 0~215 |
| respiratoryRate | 呼吸频率 | 呼吸 | float | range+number | 0~100 |
| bloodPressure | 血压 | 心血管 | float | range+number | 0~250 |
| bloodVesselSize | 血管口径 | 心血管 | float | range+number | 0.85~1.15 |
| fibrillationProgress | 室颤进度 | 心血管 | float | range+number | 0~100 |
| fibrillationForced | 强制室颤 | 心血管 | bool | switch | — |
| bloodViscosity | 血液黏稠度 | 心血管 | float | range+number | -100~100 |
| heartRatePressureOffset | 心率-血压偏移 | 心血管 | float | range+number | -30~80 |
| adrenaline | 肾上腺素（时长） | 内分泌 | float | range+number | 0~100 |
| curAdrenaline | 当前肾上腺素（曲线值） | 内分泌 | float | number | — |
| happiness | 心情 | 情绪与创伤 | float | number | — |
| weightOffset | 体重偏移 | 营养与代谢 | float | range+number | -80~100 |
| hunger | 饥饿 | 营养与代谢 | float | range+number | -50~125 |
| thirst | 口渴 | 营养与代谢 | float | range+number | -50~250 |
| stamina | 体力 | 体力与疲劳 | float | number | — |
| energy | 精力 | 体力与疲劳 | float | number | — |
| brainHealth | 脑健康 | 神经与意识 | float | range+number | 0~100 |
| consciousness | 意识 | 神经与意识 | float | range+number | 0~100 |
| shock | 休克值 | 神经与意识 | float | range+number | 0~100 |
| temperature | 体温（摄氏度） | 体温与环境 | float | number | — |
| sicknessAmount | 疾病程度 | 疾病与免疫 | float | range+number | 0~100 |
| desensitizedMult | 麻木倍率 | 情绪与创伤 | float | number | — |
| corpsesSeen | 已见尸体数 | 情绪与创伤 | int | number | — |
| septicShock | 脓毒症休克 | 疾病与免疫 | float | number | — |
| disfigured | 毁容 | 伤情与外观 | bool | switch | — |
| eyeGone | 单眼失明 | 伤情与外观 | bool | switch | — |
| bothEyesGone | 双眼失明 | 伤情与外观 | bool | switch | — |
| radiationSickness | 辐射病 | 疾病与免疫 | float | number | — |
| caffeinated | 咖啡因（时长） | 体力与疲劳 | float | number | — |
| hearingLoss | 听力损伤 | 伤情与外观 | float | range+number | 0~100 |
| internalBleeding | 内出血 | 心血管 | float | range+number | 0~100 |
| hemothorax | 血胸 | 心血管 | float | number | — |
| painShock | 疼痛休克（0~1） | 神经与意识 | float | range+number | 0~1 |
| traumaAmount | 心理创伤 | 情绪与创伤 | float | range+number | 0~100 |
| wetness | 湿润度 | 体温与环境 | float | range+number | 0~100 |
| badSleepAmount | 睡眠不足量 | 体力与疲劳 | float | number | — |
| goodSleepTime | 上次良好睡眠时刻 | 体力与疲劳 | float | number | — |
| snowAmount | 身上积雪量 | 体温与环境 | float | number | — |
| immunity | 免疫力 | 疾病与免疫 | float | range+number | 0~200 |
| antibioticImmunityTime | 抗生素免疫剩余时间 | 疾病与免疫 | float | number | — |
| triedRollingLastStand | 已尝试最后挣扎 | 濒死与最后挣扎 | bool | switch | — |
| succesfullyRolledLastStand | 最后挣扎成功 | 濒死与最后挣扎 | bool | switch | — |
| lastStandTime | 最后挣扎剩余时间 | 濒死与最后挣扎 | float | number | — |
| dirtyness | 污垢 | 体温与环境 | float | range+number | 0~100 |
| brainGrowSickness | 脑部增生症 | 神经与意识 | float | number | — |
| usedNeuralBooster | 已使用神经增强剂 | 神经与意识 | bool | switch | — |
| clawHealth | 爪子健康 | 爪子 | float | range+number | 0~100 |
| clawRegrowTime | 爪子再生剩余时间 | 爪子 | float | number | — |
| hasPulmonaryEmbolism | 肺栓塞 | 心血管 | bool | switch | — |
| strokeAmount | 中风程度 | 心血管 | float | range+number | 0~100 |
| bloodPressureChangeFromMedicine | 药物造成的血压变化 | 心血管 | float | number | — |
| venomTotal | 毒素总量 | 疾病与免疫 | float | number | — |
| venomCurrent | 当前毒素 | 疾病与免疫 | float | number | — |
| venomFake | 假性毒素（键名直译） | 疾病与免疫 | float | number | — |
小计：range+number 25 行、number 28 行、switch 8 行，共 61 行。验收表写的「医疗 62 项」与当前样例差 1：待验证 —— 打包样例 body 非 skills 键为 61 个；若把 `body.skills` 键算入才是 62，而 body 面板明确跳过 `skills`（panels.js:641）。

### 2.3 limbs 肢体损伤（panels.js:555-624）
结构：左侧「人体图」面板（15 个热区按钮叠在 `ART.user.experimentBody` 图上）+ 右侧「详细参数」面板 +「快捷操作」面板。`S.sel` 存肢体下标，`>20` 时钳到 0（panels.js:556）。
15 个热区（LIMB_HOT，panels.js:540-546；坐标是相对 `.bodystage` 的百分比）：
| 序号 | 名称 | x% | y% | 序号 | 名称 | x% | y% |
|---|---|---|---|---|---|---|---|
| 0 | 头部 | 50 | 15 | 1 | 胸部 | 50 | 31 |
| 2 | 腹部 | 50 | 45 | 3 | 右上臂 | 33 | 31 |
| 4 | 右前臂 | 19 | 31 | 5 | 右手 | 7 | 31 |
| 6 | 左上臂 | 66 | 31 | 7 | 左前臂 | 80 | 31 |
| 8 | 左手 | 93 | 31 | 9 | 右大腿 | 42 | 60 |
| 10 | 右小腿 | 42 | 75 | 11 | 右脚 | 42 | 86 |
| 12 | 左大腿 | 57 | 60 | 13 | 左小腿 | 57 | 75 |
| 14 | 左脚 | 57 | 86 | | | | |
热区标题 tooltip：「label · 皮肤 X% 肌肉 Y%」（panels.js:569）。有伤判定：`broken||dislocated||dismembered||infected||pain>20||bleedAmount>0` → 加 `.hurt` 红点（panels.js:565；theme.css:348-349）。
详细参数行构造（panels.js:588-602）：遍历 `limbs[idx]` 的键，`null` 或 `object` 跳过；`boolean`→`fBool`（单位 bool）、`string`→`fText`（单位 string）、`number`→`fNumber`（整数 step 1 并 int 取整，浮点 step 0.01；单位 int/float）。标签查 LIMB_LABELS（panels.js:547-553），缺省用键名。`isChanged(["limbs",idx,k])` 为真行加 `.changed`（panels.js:600）。
肢体字段表（19 键；`prostheticInfo` 是对象被跳过，因此每个肢体渲染 18 行；打包样例 15 个肢体均为 18 行，共 15×18=270 行）：
| 键 | 中文标签 | 样本类型 | 控件 | 单位 |
|---|---|---|---|---|
| skinHealth | 皮肤健康 | number | number | int |
| muscleHealth | 肌肉健康 | number | number | int |
| dislocated | 脱臼 | boolean | switch | bool |
| broken | 骨折 | boolean | switch | bool |
| splinted | 已固定 | boolean | switch | bool |
| infected | 已感染 | boolean | switch | bool |
| infectionAmount | 感染度 | number | number | int |
| pain | 疼痛 | number | number | int |
| bleedAmount | 出血量 | number | number | int |
| dislocationTimer | 脱臼计时 | number | number | float |
| boneHealTimer | 骨骼愈合计时 | number | number | float |
| blockedBleeding | 出血已止住 | boolean | switch | bool |
| shrapnel | 异物/弹片 | number | number | int |
| furBloodAmount | 毛发血污 | number | number | int |
| disinfectionTime | 消毒计时 | number | number | int |
| bandageSlowAmount | 绷带减缓 | number | number | int |
| skinHealAmount | 皮肤愈合量 | number | number | int |
| dismembered | 已截断 | boolean | switch | bool |
| prostheticInfo | 假肢信息 | object | 不渲染（跳过） | — |
快捷操作（panels.js:605-621）：「这个部位治好」与「全部治好」各把 12 个字段写成治疗值（skinHealth=100、muscleHealth=100、pain=0、bleedAmount=0、infectionAmount=0、broken=false、splinted=false、dislocated=false、infected=false、shrapnel=0、blockedBleeding=false、dismembered=false）。

### 2.4 skills 技能（panels.js:682-710）
结构：页头 → 「属性与经验」面板，一张 `.tbl.fixed` 表格。只渲染 `STR/RES/INT` 三行（若 `a.k in sk`），每行 7 列：属性代号 / 名称 / 数值 / 经验 / 下限 / 上限 / 倍率（panels.js:693-707）。输入用 `skInput`（panels.js:669-681）：number 输入，`int` 时 step 1 并取整，否则 step 0.01；无 min/max 钳制；change 时按 `isChanged(path)` 给所在 `tr` 加 `.changed`。路径：`body.skills.<key>`。
ATTRS 定义（panels.js:687-691）：
| 代号 | 名称 | 经验键 | 下限键 | 上限键 | 倍率键 |
|---|---|---|---|---|---|
| STR | 力量 | expSTR | minSTR | maxSTR | STRGainMult |
| RES | 耐力 | expRES | minRES | maxRES | RESGainMult |
| INT | 智力 | expINT | minINT | maxINT | INTGainMult |
注意：`body.skills` 里还有 `STRFrom10/RESFrom10/INTFrom10` 三个键，本面板不渲染（见 §8 坑 2）。

### 2.5 items 物品栏（panels.js:99-467）—— 详见 §3 专节。

### 2.6 world 世界与进度（panels.js:713-739）
结构：页头 → 「世界状态」面板（14 行）→ 一条 `.note.warn`（cheatedSave 成就警告，panels.js:738）。行构造：`num(key,label,opt,unit)` 用 `fNumber([key], opt)` 并在 `isChanged([key])` 时加 `.changed`（panels.js:717-721）。
| 中文标签 | 键 | 控件 | 单位 | 取值范围/步进 | 证据 |
|---|---|---|---|---|---|
| 层数 biome | biome | number | int | min 1；step 1 int | panels.js:722 |
| 无尽循环 | endlessLoops | number | int | step 1 int | panels.js:723 |
| 已行进距离 | totalTraveled | number | m | step 1 int | panels.js:724 |
| 累计热量 | caloriesConsumed | number | int | step 1 int | panels.js:725 |
| 身高 | cHeight | number | cm | step 1 int | panels.js:726 |
| 年龄 | cAge | number | y | step 1 int | panels.js:727 |
| 编号 | cId | number | int | step 1 int | panels.js:728 |
| 外观版本 | cVer | number | int | step 1 int | panels.js:729 |
| 游玩时长 | runTime | number | s | step 1 int | panels.js:730 |
| 陷阱倍率 | trapRarity | number | float | step 0.01 | panels.js:731 |
| 战利品倍率 | lootRarity | number | float | step 0.01 | panels.js:732 |
| 角色类型 | character | select | int | 选项 = meta.charTypes（`value · label`），numeric | panels.js:733-734 |
| 佣兵局 | isMercRun | switch | bool | — | panels.js:735 |
| 作弊标记 | cheatedSave | switch | bool | — | panels.js:736 |

### 2.7 settings 运行设置（panels.js:742-805）
结构：页头 → 「全部设置」面板，计数 `rows.length + " / " + arr.length`（panels.js:804）。渲染规则：先按 `DB.settings` 顺序渲染「在 runSettings 中存在的键」，再渲染「runSettings 中未在 DB.settings 出现的键」为「未知项」（panels.js:751-803）。
控件按 `m.type`（panels.js:758-781）：
- `bool` → `switchCtl`（panels.js:758-759）。
- `dropdown` → select，选项来自 `m.options` 与 `m.optionsLabels`（显示 `label (value)`），值写回选项下标 `oi`，保持 Item2 的 number/string 类型（panels.js:760-769）。
- 其他 → number 输入：`wholeNum` 时 step 1，否则 step 0.01；有 min/max 时设属性并在 change 时钳制（panels.js:770-781）。无 range 滑杆。
行标签 `m.label||m.key`，键名列 `m.key`，右侧 tag = `postfix + " " + (min~max)`（panels.js:783-784）。改动判定：与 `S.orig.runSettings` 中同键 Item2 的 JSON 串比较，不同则 `.changed`（panels.js:746-747,756）。
51 行明细（work/data/runsettings.json；type 为 float 的用 number 控件；dropdown 用 select；bool 用 switch；「范围」为 min~max，`—` 表示无）：
| 键 | 中文标签 | 类型 | 控件 | 范围 | 后缀 |
|---|---|---|---|---|---|
| unchipped | 未植入芯片 | bool | switch | — |  |
| endless | 无尽模式 | bool | switch | — |  |
| baselootdensity | 物资密度 | float | number | 0~2 | x |
| lootmultiplier | 物资衰减倍率 | float | number | 0~1 | x |
| basetrapdensity | 陷阱密度 | float | number | 0~3 | x |
| trapincrease | 陷阱增长倍率 | float | number | 0~1 | x |
| ambientlight | 环境光照 | dropdown | select | — |  |
| timelimit | 地层时间限制 | float | number | 5~300 | m |
| oreamount | 矿石数量 | float | number | 0~3 | x |
| layermodifierchance | 地层随机效果几率 | float | number | 0~100 | % |
| timebetweenearthquakes | 地震间隔时间 | float | number | 0.1~5 | x |
| temperatureoffset | 环境温度修正 | float | number | -80~50 | 'C |
| allowlayerendmovement | 允许在地层底部自由移动 | bool | switch | — |  |
| startingsupplies | 初始物资 | dropdown | select | — |  |
| xpgain | 经验获取倍率 | float | number | 0~5 | x |
| metabolismrate | 新陈代谢速率 | float | number | 0.1~2 | x |
| healingrate | 创伤恢复速率 | float | number | 0.1~3 | x |
| fracturepain | 骨折疼痛倍率 | float | number | 0~1.5 | x |
| bleedrate | 流血速率 | float | number | 0.2~2 | x |
| infectionspeed | 感染速率 | float | number | 0.1~3 | x |
| infectionchance | 感染几率 | float | number | 0~3 | x |
| fibrillationrate | 心律失常恶化速率 | float | number | 0.1~3 | x |
| moodnormalizationrate | 心情平复速率 | float | number | 0~3 | x |
| bonuslimbarmor | 四肢伤害抗性 | float | number | 0~4 |  |
| staminaregen | 体力恢复速率 | float | number | 0.5~2 | x |
| attackdamage | 攻击伤害 | float | number | 0.2~3 | x |
| minigamehandshake | 小游戏手部抖动 | float | number | 0~2 | x |
| sleepcyclespeed | 精力变化速度 | float | number | 0.1~2 | x |
| encumbrancecap | 负重上限 | float | number | 0.5~3 | x |
| insulationmultiplier | 保温度倍率 | float | number | 0.5~2 | x |
| strokes | 允许中风 | bool | switch | — |  |
| braindamagefx | 开启脑损伤症状发作 | bool | switch | — |  |
| forcesleep | 强制睡眠 | bool | switch | — |  |
| lowmoodevents | 情绪低落事件 | bool | switch | — |  |
| liquidpushing | 液体推力 | bool | switch | — |  |
| disfigurement | 允许面部缺损 | bool | switch | — |  |
| crushdepth | 开启坠落伤害 | bool | switch | — |  |
| nosleeprestrictions | 无睡眠条件限制 | bool | switch | — |  |
| infinitelaststand | 无限背水一战 | bool | switch | — |  |
| traderchance | 幸存者生成几率 | float | number | 0~100 | % |
| traderitemamount | 幸存者商品数量 | float | number | 0.2~3 | x |
| traderrepoffset | 幸存者好感度修正 | float | number | -100~100 |  |
| enemystrength | 敌对生物的力量 | float | number | 0.2~2 | x |
| itemdecayrate | 物品腐坏速率 | float | number | 0~3 | x |
| lockpickprecision | 开锁宽容度 | float | number | 0.5~3 | x |
| permanentaddiction | 瘾君子 | bool | switch | — |  |
| mindwiped | 精神抹除 | bool | switch | — |  |
| zeroskills | 无用之人 | bool | switch | — |  |
| blind | 失明 | bool | switch | — |  |
| amputee | 木手木脚 | bool | switch | — |  |
| immortalsnail | 蜗牛追杀 | bool | switch | — |  |
统计：bool 18、dropdown 2、float 31，共 51；wholeNum=true 2（timelimit、temperatureoffset）。打包样例 runSettings 恰有 51 项且全部命中 DB.settings，未知项 0。

### 2.8 recipes 配方进度（panels.js:808-852）
结构：页头 → 「配方」面板：工具行（搜索框 + 计数「X / Y 已制作」+ 「全部标记已制作」按钮）→ `.tbl.fixed` 表格。表头：空列(图标) / 产物 / ID / INT / 已制作 / 空列（panels.js:847-850）。
行渲染（panels.js:818-843）：遍历 `savedRecipeData.saved`（与 DB.recipes 按下标 i 对齐），产物名 = `m.resultName || itemName(m.resultId) || "#"+i`；图标 = 物品图标，缺图但 `DB.liquidById` 有则画液体色点，否则「?」。
- `Item2` → number 输入 step 1，change 时 `parseInt` 写回（panels.js:825-826），无 min/max、不取整显示。
- `Item1` → switch（`.sw`），change 写 bool（panels.js:833-834）。
- 搜索只过滤产物名（区分大小写）、序号、resultId（panels.js:824）。改动只调 `refreshFooter()`，行本身不加 `.changed`（见 §8 坑 8）。
行数：`savedRecipeData.saved.length` = 137（work/save.json；DB.recipes = 137）。搜索不截断（过滤后全渲染）。

### 2.9 json 原始 JSON（panels.js:855-868）
结构：页头（sub 说明写盘时非 ASCII 会转 `\uXXXX`）→ 「save.sv」面板：双列 `pre`（行号 gutter + 代码），只读。`JSON.stringify(S.save, null, 2)`，超过 400000 字符截断预览（panels.js:858-860）。面板计数 `KB · 行数（已截断预览）`（panels.js:866）。

### 2.10 export 校验与导出（panels.js:871-904）
结构：页头（共 N 处改动 · N 个错误 · N 个警告，panels.js:875）→ 「校验结果」面板（逐条 `.note`，bad=错误 / warn=警告；全过显示「结构校验全部通过」）→ 「改动清单」面板（diffAll 表格：路径 / 原值 / → / 新值，`fmtVal` 截断 60 字符，panels.js:883-896,906-910）→ 「写盘」面板（「保存到原文件」`doSave(false)`、「另存为 save.sv」`doSave(true)` + 警告 note，panels.js:898-903）。校验规则全表见 §4.7。

## 3. 物品栏专节（panels.js:99-467）

### 3.1 三栏布局
`.inv3`：`368px | minmax(0,1fr) | minmax(0,340px)`（theme.css:280）；<1420px 右列缩到 300px（theme.css:375-377），<1240px 单列堆叠（theme.css:378-381）。右列 `.invright` 的 `.field` 压成两列并隐藏键名/tag（theme.css:293-298）。
分组模型（panels.js:102-107）：`gkey(it) = slot>=0 ? "s"+slot : wearSlot ? "w"+wearSlot : null`；同组第一件 = 宿主（head），其余 = 容器子物品（children）。无 slot 且无 wearSlot 的物品自成一组。`S.sel` 是 `S.save.items` 的下标；`S.sel==null || >=items.length` 时钳到 0（panels.js:109）。

### 3.2 左：六槽径向圆盘
`slotIdx[slot] = 该槽位第一件物品下标`（panels.js:116）。WEDGES 硬编码 6 片贴图的拼环参数（panels.js:118-126）：
| 槽位 s | 槽位名 slotLabel | 对应肢体 slotLimb | 贴图 art.user | 角度 a | w | h | ox | oy | left px | top px |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 嘴部 | 头部 | radialUp | 0 | 91 | 48 | 45.5 | 89 | 93.0 | 6.0 |
| 1 | 副手 | 左手 | radialUpRight | 60 | 66 | 78 | -24 | 76.5 | 232.0 | 31.0 |
| 5 | 下背部 | 腹部 | radialDownRight | 120 | 66 | 80 | -25 | 0.5 | 234.0 | 183.0 |
| 4 | 中背部 | 胸部 | radialDown | 180 | 92 | 50 | 46 | -41 | 92.0 | 266.0 |
| 3 | 上背部 | 胸部 | radialDownLeft | 240 | 68 | 81 | 92 | 0 | 0.0 | 184.0 |
| 0 | 主手 | 右手 | radialUpLeft | 300 | 68 | 80 | 92 | 78.5 | 0.0 | 27.0 |
舞台参数：`SCALE=2, STAGE=368, R_MID=67.0`（panels.js:126）；`.radialplate` 是 362px 圆盘（theme.css:305-306）。wedge 定位 `left = STAGE/2 - ox*SCALE`、`top = STAGE/2 - oy*SCALE`，尺寸 `w*SCALE × h*SCALE`（panels.js:138-139）。
圆盘内容（panels.js:133-161）：
- wedge 图来自 `ART.user[wd.img]`（radialUp 等 6 张，panels.js:146-147）。空槽位 wedge 加 `.empty`（panels.js:137）。选中态：`selHead === idx`（宿主高亮，panels.js:135）。
- wedge title = 「槽位名 · 肢体」（panels.js:140）。点击：空槽 toast「X 是空的」；有物品 `S.sel = idx; renderPanel()`（panels.js:141-144）。
- 每个槽位中心放 `.wface`：图标（iconBox 32px，无物品显示「空」）、槽位名、耐久/装填量 `fillLabel(idx)`（panels.js:149-156）。wface 坐标 `mx = STAGE/2 + sin(a)*R_MID*SCALE`、`my = STAGE/2 - cos(a)*R_MID*SCALE`（panels.js:149-151）。
- 圆心 `.radialcore`：标题「物品栏」+ 副标题「N 件」（panels.js:159-161）。
- 槽位面板头部计数 = `HAND_SLOTS 个`（panels.js:164）。HAND_SLOTS 取 meta.handSlots 长度，缺省 6（core.js:31）。
槽位名与肢体映射（meta.handSlots，work/data/meta.json；selftest.js:49-50 断言）：
| index | key | 中文 label | limb | hint |
|---|---|---|---|---|
| 0 | mainhand | 主手 | 右手 | 一般是右手，可在医疗面板切换（挂在右手上） |
| 1 | secondaryhand | 副手 | 左手 | 一般是左手（挂在左手上） |
| 2 | mouth | 嘴部 | 头部 | 能用嘴叼一件（挂在头部上） |
| 3 | upperback | 上背部 | 胸部 | 背上三件之一（挂在胸部上） |
| 4 | middleback | 中背部 | 胸部 | 背上三件之一（挂在胸部上） |
| 5 | lowerback | 下背部 | 腹部 | 背上三件之一（挂在腹部上） |

### 3.3 左：穿戴格（panels.js:167-180）
`wear[wearSlot]` 收集 `slot<0 && wearSlot` 的物品下标（panels.js:168）。按 `meta.wearSlots` 顺序排序；不在元数据里的穿戴位排最后（panels.js:170-171）。每格：图标（30px）、穿戴位名、`+N` 徽标（该位多件时，panels.js:173-177）。点击选宿主 `S.sel = head`（panels.js:174）。无穿戴物品显示「没有穿戴中的物品」（panels.js:179）。面板计数 = 穿戴位数。
meta.wearSlots 19 个：outertorso 上躯干（外套）、back 背部、thigh 大腿（前）、torsofront 胸前、thighback 大腿（后）、hat 头戴、mouth 嘴部、eyes 眼部、blindfold 眼罩、balaclava 巴拉克拉瓦头套、neck 颈部、hands 手部、arms 手臂、wraps 缠布、torso 躯干、feet 脚部、bandolier 子弹带、knees 膝部、belt 腰带（work/data/meta.json）。

### 3.4 中：详情（panels.js:184-371）
选中物品后：头部 `dthead`（图标 40px、物品名、`id · nameEn`、位置 chip，panels.js:191-196）。若是容器子物品，先插一条 `.note`：「这件物品装在容器「X」里…」（panels.js:198-199）。描述 `itemDescRich`（富文本过滤，panels.js:200）。
改动标记（panels.js:203-209）：`origItem = S.orig.items[i]`（同下标比较！增删后下标错位，见 §8 坑 3）；`differs(key)` 比较 JSON 串，`paint(row,chg)` 给 `.field` 加 `.changed`。
「详细参数」面板行（行数 = 非容器 4 行 / 容器 5 行）：
| 行标签 | 键 | 控件 | 单位/规则 | 证据 |
|---|---|---|---|---|
| 装填量（容器）| condition | number | 0~容量 ml，step 1；输入按比例缩放各液体分量并 `syncCondition()` | panels.js:214-245 |
| 耐久（非容器）| condition | number | 0~100，step 0.1，显示 1 位小数；写回 `it.condition = round(v*10)/1000` | panels.js:246-255 |
| 位置 | slot / wearSlot | select | 选项 = `s0..s5` + `w:<穿戴位id>`（含存档里出现的未知穿戴位）；s→slot 数值且 wearSlot=null，w→slot=-1 且 wearSlot=id；不查重复占用 | panels.js:259-279 |
| 收藏 / 颜色 | favourited / swatch | switch + 8 色 chip | 色板 SWATCHES 8 色（core.js:34-43）；chip 点选写 `it.swatch=i` 并切换高亮 | panels.js:283-305 |
| 自定义名 | label | text | 空占位「（无）」 | panels.js:307-315 |
| 液体（仅容器）| WaterContainerItem.stack | 自定义（chips + 编辑按钮）| chips 显示「液体名 量」，超出容量行加 `.over`；「编辑」打开 liquidDialog | panels.js:317-327 |
液体分量逻辑（panels.js:214-245）：`getWaterComp(i)` 从 `itemComponents[i]` 找 WATERCOMP（类型名 `WaterContainerItem, Assembly-CSharp...`）或 `WaterContainerItem` 前缀的键（panels.js:73-79）。`vTotal()` 求和；`syncCondition()`：`it.condition = min(1, round(vTotal()/vcap*10000)/10000)`；`setVolume(target)`：空 stack 拒绝（toast「这件容器里还没有液体…」），有液体按比例缩放，四舍五入到 0.01。`fillLabel(i)`：容器显示 `总ml/容量 ml`，其他显示 `round(condition*100)%`（panels.js:82-92）。
「容器内容」面板（panels.js:331-348，仅宿主有子物品时出现）：每个子物品一行 `.lrow.clickable`（图标、名称、id、耐久），点击 `S.sel = ci` 选中该子物品；`✕` 按钮 `removeItems({ci:1})` 从 items/itemComponents 双数组同步删除。
「操作」面板（panels.js:349-367）：
- 子物品：`← 回到「宿主名」`（panels.js:350-351）。
- 容器：`装满液体`（容量未知或空 stack 时 toast 拒绝，否则 setVolume(vcap)，panels.js:352-357）；非容器：`耐久满`（condition=1，panels.js:358-360）。
- `删除此物品`：宿主带子物品时 confirm「一起删除 / 只删这一件」，`removeItems` 后 `S.sel=null`（panels.js:361-366）。
`removeItems(kill)`（panels.js:93-97）：保留 kill 之外的下标，同步压缩 items 与 itemComponents。

### 3.5 液体弹窗 liquidDialog（panels.js:469-537）
`overlay` 全屏遮罩 + `modal`（宽 660px，theme.css:254-262）。头部：标题「液体内容 · 物品名」+ 计数（id / 容量）。点击遮罩关闭（panels.js:534）。
内容（panels.js:479-527）：
- 无液体组件但 `isLiquidVessel`：提示 note + 「创建液体组件」按钮 → `cs[i][WATERCOMP] = {stack:[]}` 且 `condition=0`（panels.js:482-491）。
- 每份液体一行：select（选项 = DB.liquids 全部，未知 liquidId 追加「id（未知）」选项）、数量 number（step 1，>=0）、`✕` 删除该份（panels.js:504-518）。
- 顶部合计：`合计 X / 容量 C ml（P%）`，超出容量追加「⚠ 超出容量」+ 提示「耐久（装填率）随液体自动同步」（panels.js:474-478）。
- `＋ 添加一种液体`：push `{liquidId:"water", amount: 剩余容量||100}`（panels.js:521-526）。
- 每次改动 `afterChange()` = `refreshFooter() + rerenderKeepScroll()`（panels.js:500-501），详情/圆盘/列表即时刷新且保持滚动（core.js:365-370）。

### 3.6 右：添加物品（panels.js:373-466）
「添加物品」面板（panels.js:456-461）：搜索框 → 耐久行 → 放到行 → 提示 → 确认添加按钮。
- 搜索：`.trim().toLowerCase()` 匹配 `name`（未转小写，区分大小写！）、`id`（小写）、`nameEn`（小写）（panels.js:405-407）。
- 排序 select（panels.js:396-411）：name=按 id（localeCompare）；size=按 weight 降序；cat=按 category localeCompare 再 id。
- 结果列表 `.list`：图标、name、id、weight（`Xu`）；点击行选中 `picked`；最多显示 400 条，超出提示「还有 N 条未显示」（panels.js:412-424）；计数「显示 X / 300」。DB.items = 300（work/data/items.json）。
- 耐久输入：number 0~100 step 1 默认 100（panels.js:376）。
- 「放到」select（panels.js:377-394）：`s0..s5`（附「（已占用）/（空）」）、`w:<穿戴位id>`（meta.wearSlots 全部 19 个）、`optgroup「放进已有容器」`（当前存档里 id 在 containers.containerIds 的宿主物品，值 `c<下标>`）。
确认添加规则（panels.js:428-454）：
- 未选物品 → toast「先在下方列表里选一个物品」。
- 新物品默认：`{id:picked, condition: 液体容器?0:耐久换算值, slot:-1, wearSlot:null, favourited:false, label:"", swatch:0}`；液体容器同时生成 `newComp[WATERCOMP]={stack:[]}`（panels.js:434-438）。耐久换算：`round(clamp(parseFloat(condAdd)||100, 0..100)*10)/1000`（panels.js:434）。
- 目标 `s` → `item.slot`；`w` → `item.wearSlot`；`c` → 在宿主下标后 `splice(pi+1,0,…)` 插入 items 与 itemComponents，继承宿主 slot/wearSlot，`S.sel=pi+1`（panels.js:440-449）。
- 目标 `s`/`w`：push 到数组末尾，`S.sel=length-1`（panels.js:450-453）。
- toast：「已添加：X」（容器追加「（空容器，去「液体」里装）」）。
「全部物品」面板（panels.js:462）：工具行（排序 select + 计数）+ 结果列表。`renderAdd()` 在面板末尾执行一次（panels.js:466）。

## 4. core.js 公共 API 清单

### 4.1 状态与数据
`S` 状态对象（core.js:46）：`{ save:null, orig:null, fileName:"", fileHandle:null, panel:"overview", sel:null }`。`save`=工作副本；`orig`=最近载入/写回快照；`panel`=当前面板 id；`sel`=当前选中（items=物品下标 / limbs=肢体下标，两面板共用）。
`DB`（core.js:11-26）：`items`（物品表 300）、`itemById`、`recipes`（137）、`settings`（51）、`fields`（身体字段 80，含 19 条技能）、`fieldByName`、`limbs`（肢体元数据 15）、`meta`、`containers`（`DATA.containers.ok` 才非空，否则 null）、`liquids`（75）、`liquidById`、`liquidcapacity`（id→{capacity,…}）、`vessels`（当前未使用）、`slots`（当前未使用）。
常量：`HAND_SLOTS`（core.js:31）、`SWATCHES` 8 色表（core.js:34-43，index 0~7 = 白/灰/绿/橙/品红/蓝紫/青/黄）、`WATERCOMP` = `WaterContainerItem, Assembly-CSharp, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null`（core.js:44）。

### 4.2 名字 / 图标 / 富文本
| 签名 | 行为 | 证据 |
|---|---|---|
| `function itemName(id)` | 返回 DB.itemById[id].name，缺省返回 id | core.js:49 |
| `function stripTags(s)` | `String(s||"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()` | core.js:50 |
| `function itemDesc(id)` | 返回 stripTags(DB.itemById[id].desc) | core.js:51 |
| `function richText(s)` | 先全转义 HTML，再只放回 `<color=#hex>`/`</color>`/`<b>`/`</b>`/`<i>`/`</i>`/`<br>`，其余标签删除 | core.js:55-64 |
| `function itemDescRich(id)` | 返回 richText(desc) | core.js:65 |
| `function itemEn(id)` | 返回 DB.itemById[id].nameEn，缺省 "" | core.js:66 |
| `function itemIcon(id)` | 返回 ART.items[id] 或 null | core.js:67 |
| `function liquidName(id)` / `liquidColor(id)` | DB.liquidById 的 name / color（缺省 id / "#666666"） | core.js:68-69 |
| `function itemCapacity(id)` | DB.liquidcapacity[id].capacity，缺省 null | core.js:70 |
| `function isLiquidVessel(id)` | `!!DB.liquidcapacity[id] || DB.itemById[id].class === "LiquidItemInfo"` | core.js:71 |
| `function wearSlotName(id)` | meta.wearSlots 里同 id 的 label，缺省返回 id | core.js:72-76 |
| `function charTypeName(v)` | meta.charTypes 里 value 相等的 label，缺省 "类型 "+v | core.js:77-81 |
| `function fieldMeta(n)` | DB.fieldByName[n] 或 null | core.js:82 |
| `function slotLabel(i)` | meta.handSlots 里 index===i 的 label，缺省 "槽位 "+i | core.js:83-87 |
| `function slotLimb(i)` | meta.handSlots 里 index===i 的 limb，缺省 null | core.js:88-92 |
| `function limbMeta(i)` | DB.limbs[i] 或 {} | core.js:93 |

### 4.3 DOM 工具
| 签名 | 行为 | 证据 |
|---|---|---|
| `function h(tag, attrs, ...kids)` | 创建元素；attrs 支持 class/text/html/style/on*（事件）/value/checked/其他 setAttribute；忽略 null/undefined/false；后续参数递归 addKid | core.js:96-112 |
| `function addKid(el, k)` | Node 追加；数组递归；其他转文本节点；忽略 null/undefined/false | core.js:113-118 |
| `function clear(el)` | 清空子节点并返回 el | core.js:119 |
| `function toast(msg, bad)` | 显示 #toast 2600ms，bad 加 .bad | core.js:120-125 |
| `function iconBox(id, size)` | 物品图标框；默认 26px；有 ART.iconSize 时按整数倍放大（防最近邻采样截断）居中；无图标显示名字首字符，加 .ph | core.js:128-148 |

### 4.4 gzip / ASCII
| 签名 | 行为 | 证据 |
|---|---|---|
| `async function gunzip(bytes)` | DecompressionStream("gzip") 解压为文本；不支持时 throw（Edge/Chrome 103+） | core.js:151-155 |
| `async function gzipText(text)` | TextEncoder + CompressionStream("gzip") 压缩为 Uint8Array | core.js:156-160 |
| `function toAsciiJson(obj)` | JSON.stringify 后把 U+007F..U+FFFF 替换为 `\uXXXX` | core.js:162-166 |

### 4.5 路径 / 差异
| 签名 | 行为 | 证据 |
|---|---|---|
| `function getPath(path)` | 按路径数组读 S.save；中途 null/undefined 返回 undefined | core.js:169-173 |
| `function setPath(path, val)` | 按路径数组写 S.save，缺中间对象自动补 {} | core.js:174-178 |
| `function getOrig(path)` | 按路径数组读 S.orig | core.js:179 |
| `function isChanged(path)` | `JSON.stringify(getOrig(path)) !== JSON.stringify(getPath(path))` | core.js:180 |
| `function diffAll(a, b, prefix, out)` | 递归逐叶子差异，返回 `[{path, from, to}]`；类型不同或非对象直接比 JSON；数组按 `[i]` 记路径 | core.js:182-201 |
| `function changeCount()` | `diffAll(S.orig, S.save).length` | core.js:202 |

### 4.6 控件工厂（签名含参数名）
| 签名 | 行为 | 证据 |
|---|---|---|
| `function fNumber(path, opt)` | number 输入；`opt.step`（默认 any）、`opt.min/max` 设属性；min+max 都非空时追加 range 滑杆（step 默认 0.01）并与 number 双向同步；change/input 时 `commit()`：parseFloat，NaN 回弹为当前值，`opt.int` 取整，min/max 钳制，`setPath` 后把 `.field` 的 `.changed` 设为 `isChanged(path)` 并 `refreshFooter()` | core.js:205-236 |
| `function fBool(path)` | checkbox + `.sw` 开关；change 时 setPath 布尔、更新 `.changed` 与 refreshFooter | core.js:237-246 |
| `function fText(path, ph)` | text 输入；`ph` 为 placeholder；change 时 setPath 字符串、更新 `.changed` 与 refreshFooter | core.js:247-252 |
| `function fSelect(path, options, opt)` | select；options 支持 `{value,label}` 或裸值；`String(v)===String(cur)` 选中；change 时 `opt.numeric` 则 parseFloat 写回，否则写字符串；更新 `.changed`、refreshFooter、`opt.onChange(v)` | core.js:253-273 |
| `function fieldRow(label, key, ctl, extra)` | 标准字段行 `.field`：标签列（label + 键名 `.k`）+ 控件 + 右侧 `.tag`（extra） | core.js:274-277 |
| `function panel(title, count, kids, cls)` | 面板 `.panel`：`.ph` 标题栏（`.t` 标题 + `.n` 计数）+ `.pb` 体；cls 追加类名 | core.js:279-288 |

### 4.7 校验 validate()（core.js:291-344）
返回 `{errs:[{msg}], warns:[{msg}]}`。规则全表：
| # | 类型 | 判定条件 | 文案 | 证据 |
|---|---|---|---|---|
| 1 | err | `!S.save` | 尚未载入存档 | core.js:293 |
| 2 | err | 顶层缺 `body/limbs/items/itemComponents/bodyComponents/limbComponents/savedRecipeData/runSettings` 之一 | 缺少顶层字段 K | core.js:295-296 |
| 3 | err | items 与 itemComponents 均为数组且长度不等 | items 与 itemComponents 长度不一致（N vs M） | core.js:297-298 |
| 4 | err | limbs 与 limbComponents 均为数组且长度不等 | limbs 与 limbComponents 长度不一致 | core.js:299-300 |
| 5 | warn | `savedRecipeData.saved` 是数组且 DB.recipes 非空且长度不等 | 配方表长度 N 与当前配方数 M 不同 | core.js:301-302 |
| 6 | warn | 物品 id 不在 DB.itemById | 有 N 件物品 id 不在物品表中，读档会被跳过：…（列前 8 个） | core.js:309-310,323 |
| 7 | err | `it.condition` 非 number / NaN / <0 | 物品 #i condition 非法: v | core.js:311-312 |
| 8 | warn | `it.condition > 1` | 物品 #i condition=v > 1 | core.js:313 |
| 9 | warn | `it.slot >= HAND_SLOTS` | 物品 #i 槽位 v 超出 0-(HAND_SLOTS-1) | core.js:314-315 |
| 10 | warn | `it.slot < 0` 且 `it.wearSlot == null` | 物品 #i 既无槽位也无穿戴位 | core.js:317-318 |
| 11 | warn | 同槽位多件且宿主（该槽第一件）不是容器（isContainer!==true；未知也算） | 「槽位名」里有 N 件物品，但宿主「名」不是容器 / 容器属性未知 | core.js:324-328 |
| 12 | warn | 同穿戴位多件且宿主不是容器 | 穿戴位 X 里有 N 件物品，但宿主「名」不是容器 / 容器属性未知 | core.js:329-333 |
| 13 | err | DB.fields 中 csharpType==="int" 的字段，`body.<name>` 或 `body.skills.<name>` 是小数 | `<path> 是 int 字段，给小数 v 会被静默四舍五入成 r` | core.js:334-341 |
| 14 | warn | `cheatedSave === true` | cheatedSave = true：读档后会禁用本次运行的成就 | core.js:342 |
`isContainer(id)`：DB.containers.containerIds 含 id → true；DB.containers 缺失 → null（触发「容器属性未知」）（core.js:304-307）。

### 4.8 底部状态与面板归属
| 签名 | 行为 | 证据 |
|---|---|---|
| `function refreshFooter()` | 更新 #status、#savebadge、rail 的 .dirty（见 §1.7） | core.js:347-363 |
| `function rerenderKeepScroll()` | 记录 #content.scrollTop → renderPanel → 恢复滚动 | core.js:365-370 |
| `function panelDirty(p)` | diffAll 结果中有任一路径属于面板 p | core.js:371-373 |
| `function pathInPanel(path, p)` | body→`body.` 开头且不含 `body.skills`；skills→`body.skills` 开头；limbs→`limbs.`/`limbComponents` 开头；items→`items.`/`itemComponents` 开头；world→首段在 15 个顶层键列表内；settings→`runSettings` 开头；recipes→`savedRecipeData` 开头；其余 false | core.js:374-384 |
`window.CU` 导出（core.js:385-391）：S, DB, ART, h, iconBox, getPath, setPath, isChanged, fieldRow, fNumber, fBool, fText, fSelect, panel, toast, refreshFooter, rerenderKeepScroll, itemName, validate, diffAll, changeCount, clear, itemDesc, itemDescRich, richText, stripTags, itemEn, itemIcon, wearSlotName, charTypeName, fieldMeta, toAsciiJson, HAND_SLOTS, SWATCHES, WATERCOMP, liquidName, liquidColor, itemCapacity, isLiquidVessel, slotLabel, slotLimb, limbMeta。

### 4.9 panels.js 局部助手
| 签名 | 行为 | 证据 |
|---|---|---|
| `function fmtTime(sec)` | 秒 → `h:mm:ss`（mm/ss 补零） | panels.js:7-11 |
| `function switchCtl(checked, onchange)` | 无路径开关（运行设置/配方用），change 回调收到布尔 | panels.js:13-17 |
| `function th(text, cls)` | 表头单元格 | panels.js:18 |
| `function toolRow(...)` | 工具行 `.toolrow` | panels.js:19-23 |
| `function card(t, v, bad)` | 摘要卡 `.card`（bad 红字） | panels.js:24-27 |
| `function getWaterComp(i)` | 返回 `{comp, key}`：itemComponents[i] 中 WATERCOMP 或 `WaterContainerItem` 前缀的组件；无则 null | panels.js:73-79 |
| `function fillLabel(i)` | 容器 → `总ml/容量 ml`；其他 → `round(condition*100)%` | panels.js:82-92 |
| `function removeItems(kill)` | 按 kill 下标删除并同步压缩 items 与 itemComponents | panels.js:93-97 |
| `function skInput(path, opt)` | 技能表 number 输入（int 取整；无 min/max；tr.changed） | panels.js:669-681 |
| `function fmtVal(v)` | undefined→(无)；对象 JSON 串；>60 字符截断加 … | panels.js:906-910 |

## 5. 数据契约

### 5.1 window.__DATA 键结构（build.js:21-33 组装，运行时注入 template.html:29）
| 键 | 结构 | 打包来源 | 面板使用 |
|---|---|---|---|
| items | `{items:[{id,name,nameEn,desc,descEn,category,weight,value,wearable,wearSlotId,usable,usableOnLimb,combineable,secret,tags,qualities,class}]}`（300 条） | work/data/items.json | items 搜索列表、itemName/itemDesc/itemEn/isLiquidVessel |
| recipes | `{recipes:[{index,int,resultId,resultName,resultAmount,category,ingredients,resultCondition,resultIsLiquid,isRepair,dontDrainResultLiquid}]}`（137 条） | work/data/recipes.json | recipes 表、validate 长度比对 |
| runsettings | `{settings:[{key,type,label,desc,min,max,wholeNum,postfix,options,optionsLabels,divider,class}]}`（51 条） | work/data/runsettings.json | settings 面板 |
| bodyfields | `{fields:[{name,csharpType,jsonType,label,group,min,max,step,evidence}]}`（80 条：61 非技能 + 19 技能） | work/data/bodyfields.json | body 分组与标签/范围；validate int 规则 |
| limbs | `{limbs:[{index,key,label,shortLabel,isVital,evidence}]}`（15 条） | work/data/limbs.json | limbs 面板热区标题 |
| meta | `{wearSlots,charTypes,skillKeys,recipeCategories,itemCategories,biomes,handSlots,handSlotsEvidence}` | work/data/meta.json | wearSlots（穿戴格/位置下拉）、charTypes（角色类型）、handSlots（槽位名/肢体/HAND_SLOTS）；其余键当前未使用 |
| containers | `{ok:bool, containerIds:[...]}`（ok=true 时才注入 DB，25 个 id） | work/data/containers.json | isContainer（validate）、「放进已有容器」optgroup |
| liquids | `{liquids:[{id,localeName,name,nameEn,color,valuePerLiter,danger}]}`（75 条） | work/data/liquids.json | 液体 select、liquidName/liquidColor、recipes 液体图标 |
| liquidcapacity | `{items:{<id>:{capacity,autoFill,hasDefaultContents}}}`（54 个 id） | work/data/liquidcapacity.json | itemCapacity、isLiquidVessel、装填量 |
| vessels | 容器/液体容器描述数据 | work/data/vessels.json | DB.vessels 载入但当前面板未使用 |
| slots | `{slots:[...]}`（6 条） | work/data/slots.json | DB.slots 载入但当前面板未使用 |

### 5.2 window.__ART 键结构（build.js:36-82，注入 template.html:30）
| 键 | 结构 | 说明 | 消费位置 |
|---|---|---|---|
| ui | `{uiBlock, uiBlockSmall, ..., saveicon}`（UI_WANT 21 项，build.js:51-54） | 解包 UI 贴图 → 注入 CSS 变量 `--i-<k>`（app.js:22-23） | 当前 theme.css 未引用任何 `--i-*`，等于预留 |
| user | `{radialUp, radialUpRight, radialDownRight, radialDown, radialDownLeft, radialUpLeft, experimentBody, uicursor, ...}` | `UI草图/素材/*.png` 全部（build.js:39-44）+ `uicursor`（build.js:47-48）→ CSS 变量 `--u-<k>`（app.js:22） | wedge 图（panels.js:146）、人体图（panels.js:561）、光标 `var(--u-uicursor)`（theme.css:38） |
| items | `{<itemId>: dataUri}` | itemicons.json 反查或同名回退（build.js:70-82） | itemIcon（core.js:67）、iconBox |
| iconSize | `{<itemId>:[w,h]}` | PNG IHDR 宽高（build.js:19,79） | iconBox 整数倍缩放（core.js:135-142） |
| missingIcons | `[itemId,...]` | 缺图标物品 id 列表（build.js:81） | 当前面板未使用 |

### 5.3 save.sv 顶层结构（work/save.json；validate 需要 core.js:295）
顶层键：`body, limbs, items, itemComponents, bodyComponents, limbComponents, savedRecipeData, runSettings`（校验必需）+ `biome, endlessLoops, totalTraveled, runTime, cHeight, cAge, cId, cVer, lastHappiness, trapRarity, lootRarity, caloriesConsumed, character, isMercRun, cheatedSave`（world/overview 使用）。
关键子结构：
- `items[i]`：`{id, condition, slot, wearSlot, favourited, label, swatch}`；`slot>=0` 手持槽，`slot=-1` 且 `wearSlot` 非空为穿戴，两者皆空校验警告（core.js:314-318）。
- `itemComponents[i]`：`{ "WaterContainerItem, Assembly-CSharp...": {stack:[{liquidId, amount}]} }`（WATERCOMP，core.js:44；panels.js:73-79）。
- `limbs[i]`：19 键，其中 18 个标量 + `prostheticInfo` 对象（见 §2.3 表）。
- `body`：61 个非技能标量键（见 §2.2 表）+ `skills`（15 键，STR/RES/INT 系列 + STRFrom10/RESFrom10/INTFrom10）。
- `savedRecipeData.saved[i]`：`{Item1:bool, Item2:number}`（recipes 面板）；`runSettings[i]`：`{Item1:key, Item2:value}`（settings 面板）。

### 5.4 各面板用到的 DB/ART 键速查
| 面板 | DB 键 | ART 键 |
|---|---|---|
| overview | meta.charTypes（charTypeName） | 无 |
| body | fields/fieldByName | 无 |
| limbs | limbs（limbMeta）、meta.handSlots 不涉及 | user.experimentBody |
| skills | 无（标签硬编码 ATTRS） | 无 |
| items | items/itemById、meta.wearSlots、meta.handSlots、containers、liquids/liquidById、liquidcapacity | user.radial* 6 张、items、iconSize |
| world | meta.charTypes | 无 |
| settings | settings | 无 |
| recipes | recipes、liquids/liquidById（液体产物图标） | items、iconSize |
| json | 无 | 无 |
| export | recipes（validate 长度）、fields（validate int）、containers（validate） | 无 |

## 6. 一键预设（7 个，panels.js:48-63）
| 预设 | 改动字段 | 证据 |
|---|---|---|
| 伤势全愈 | 每个 limbs[i] 14 字段：skinHealth=100、muscleHealth=100、pain=0、bleedAmount=0、infectionAmount=0、broken=false、splinted=false、dislocated=false、infected=false、shrapnel=0、blockedBleeding=false、dismembered=false、dislocationTimer=0、boneHealTimer=0 | panels.js:49-53 |
| 状态拉满 | body 12 字段：hunger/thirst/stamina/energy/bloodOxygen/bloodVolume/consciousness/brainHealth/immunity=100；temperature=37；shock=0；painShock=0（仅当键存在） | panels.js:54-56 |
| 疾病清零 | body 15 字段置 0：sicknessAmount、radiationSickness、septicShock、internalBleeding、hemothorax、strokeAmount、brainGrowSickness、venomTotal、venomCurrent、venomFake、fibrillationProgress、hearingLoss、traumaAmount、wetness、dirtyness（仅当键存在） | panels.js:57-58 |
| 耐久全满 | 每个 items[i].condition = 1 | panels.js:59 |
| 解锁配方 | savedRecipeData.saved 每个 Item1 = true | panels.js:60 |
| 技能 +5 | body.skills.STR/RES/INT 各 +5（仅当键存在） | panels.js:61 |
| 撤销全部 | `S.save = JSON.parse(JSON.stringify(S.orig))` | panels.js:62 |
注意：预设只改 S.save，不改 S.orig；点击后统一 `toast + renderPanel + refreshFooter`（panels.js:66）。

## 7. 「脏标记」机制（changed 类）

### 7.1 判定规则
统一标准：把「当前值」与「S.orig 快照中的对应值」做 JSON 序列化字符串比较，不同即脏。三处实现：
| 位置 | 比较方式 | 触发时机 | 证据 |
|---|---|---|---|
| fNumber/fBool/fText/fSelect 提交时 | `isChanged(path)` → 给最近的 `.field` 加 `.changed` | 每次 input/change（fNumber 的 input 也提交） | core.js:229,242,250,268 |
| body/limbs/world 渲染时 | `isChanged(path)` → 行加 `.changed` | 渲染时一次性 | panels.js:660,600,719 |
| settings 渲染+change | `JSON.stringify(origVal[key]) !== JSON.stringify(Item2)` | 渲染与 change | panels.js:746-747,756,791 |
| recipes | 无行级 changed，只 refreshFooter（rail 圆点会亮） | 渲染与 change | panels.js:826,834 |
| items 详情 | `differs(key)` 比较 `S.orig.items[i][key]` 与当前同下标物品 | 渲染与 change | panels.js:204-209 |
`.changed` 视觉：`.field` 加渐变底 + 左侧 3px 橙条 + 控件黄框（theme.css:113-118）；表格行 `.tbl tr.changed td` 淡橙底（theme.css:119,190）。

### 7.2 覆盖范围（pathInPanel，core.js:374-384）
| 面板 | 归属判定 | 覆盖到的改动 |
|---|---|---|
| body | `path` 以 `body.` 开头且不以 `body.skills` 开头 | body 非技能字段 |
| skills | `path` 以 `body.skills` 开头 | 技能字段 |
| limbs | `path` 以 `limbs.` 或 `limbComponents` 开头 | 肢体及组件 |
| items | `path` 以 `items.` 或 `itemComponents` 开头 | 物品及组件 |
| world | 首段 ∈ {biome,endlessLoops,totalTraveled,runTime,cHeight,cAge,cId,cVer,character,isMercRun,cheatedSave,trapRarity,lootRarity,caloriesConsumed,lastHappiness} | 顶层世界字段 |
| settings | `path` 以 `runSettings` 开头 | 运行设置 |
| recipes | `path` 以 `savedRecipeData` 开头 | 配方 |
| overview / json / export | 永远 false | 不亮圆点 |

## 8. 重写时必须注意的坑

1. 医疗面板行数是动态的，不是 62 也不是 80。规则：`S.save.body` 的键减去 `skills`，逐个渲染（panels.js:640-646）；打包样例 work/save.json 为 61 行（13 组）；bodyfields.json 共 80 条（含 19 条技能字段，body 面板不渲染）。验收表写「医疗 62 项」与当前样例差 1：待验证 —— 若把 body.skills 键算入才是 62，而 body 面板明确跳过 `skills`（panels.js:641）。重写时按「body 键动态渲染」实现，写死行数会错。

2. 技能面板只渲染 STR/RES/INT 三行（panels.js:693-703），但 body.skills 里还有 STRFrom10/RESFrom10/INTFrom10（work/save.json），当前 UI 无法编辑这三键；技能输入走 `skInput`（无 min/max、int 取整），不是 fNumber。

3. 物品详情的 changed 对比用「同下标」取 `S.orig.items[i]`（panels.js:204），不是按物品 id。增删物品后下标错位，改动高亮会标到错位的物品；`S.sel` 也是下标，删除后置 null（panels.js:365），重写应改为按稳定 id 对齐。

4. 液体容器的 `condition` 是装填率（0..1 = 液体总量/容量），不是耐久（panels.js:210-213,220）；UI 对容器把「耐久%」换成「装填量 ml」，改动液体时 `syncCondition` 覆盖 condition；新增容器强制 condition=0 + 空 stack（panels.js:431-438），避免「耐久 100% 但没水」的自相矛盾。

5. 「位置」下拉不保证槽位唯一：可以把多件物品塞进同一手持槽/穿戴位，validate 只对「同槽多件且宿主非容器」给警告（core.js:324-333），不报错；槽位下拉选项标注「已占用」仅是提示（panels.js:379-380）。

6. fNumber 在 input 事件即时提交并钳制（core.js:233），用户清空输入、敲负号等中间态会被回弹为当前值；range 与 number 双向同步（core.js:217）。重写时要复刻「输入即生效」的节奏，不要等 blur。

7. 写回编码：游戏用 Encoding.ASCII 读档，`toAsciiJson` 把 U+007F..U+FFFF 转 `\uXXXX`（core.js:161-166）；下载文件名固定 `save.sv`（app.js:138），不随 S.fileName；覆盖写依赖 File System Access API handle（app.js:128-134）。

8. recipes 面板的行不做 changed 高亮（只 refreshFooter 亮 rail 圆点，panels.js:826,834）；settings 面板把 DB.settings 里不存在的键渲染为「未知项」（panels.js:788-803）；settings 的 dropdown 写回的是选项下标，不是选项值（panels.js:768）。

9. ART.ui 被注入成 CSS 变量 `--i-*`（app.js:23），但当前 theme.css 一个都没引用；wedge 贴图实际来自 `ART.user.radial*`（panels.js:146），UI_WANT 里的 radialWorn（build.js:52）没有用到。重写若沿用贴图，要从 art.user 取，不是 art.ui。

10. S.sel 被 items 与 limbs 两面板共用（items=物品下标、limbs=肢体下标），各自在渲染入口钳制（panels.js:109,556）；切换面板不会清空 sel。单页应用重写时建议拆成两个独立 selection 状态。

## 附录：面板行数统计表（依据打包样例 work/save.json）
| 面板 | 行/项数 | 说明 |
|---|---|---|
| overview | 10 卡片 + 7 预设按钮 | 卡片 panels.js:36-45；预设 panels.js:48-63 |
| body | 61 字段行（13 组）+ 4 卡片 | 组行数见 §2.2；验收表写 62，待验证 |
| limbs | 15 热区 + 每肢体 18 行（15×18=270）+ 2 按钮 | 19 键中 prostheticInfo 为对象被跳过 |
| skills | 3 行（STR/RES/INT） | 每行 6 个数字输入 |
| items | 详情 4 行（容器 5 行）+ 添加 2 字段行 + 300 条物品列表 | 详见 §3 |
| world | 14 行（11 number + 1 select + 2 switch） | panels.js:722-736 |
| settings | 51 行（DB.settings 全命中）+ 未知项 0 | panels.js:751-803 |
| recipes | 137 行（savedRecipeData.saved 长度） | panels.js:821 |
| json | 只读，无字段行 | panels.js:855-868 |
| export | 校验 note 条数 + 改动清单 N 行（=changeCount） | panels.js:871-896 |
数据核对：DB.items=300（work/data/items.json；selftest.js:37）、DB.recipes=137（selftest.js:39）、DB.settings=51（selftest.js:38）、DB.liquids=75（selftest.js:45 断言 >50，实际 75）、DB.limbs=15（work/data/limbs.json）。

