# UI 重做说明（按你的 5 张草图）

成品：`dist\CasualtiesUnknown存档修改器.html`（640 KB，单文件，双击即用）

## 草图 → 实现对照

| 你的草图 | 我做的 | 位置 |
|---|---|---|
| 【物品栏Web UI】三栏：左示意图 / 中详情 / 右添加 | 左=六槽径向 + 穿戴格 / 中=物品详情（图上标"跟随鼠标选中的栏位"）/ 右=搜索+耐久+确认添加+可排序全物品列表 | 「物品栏」页 |
| 【物品栏UI】游戏内径向菜单 + 装备栏 | 六槽径向：嘴部(上) 主手(左) 副手(右) 上背部(左下) 下背部(右下) 中背部(下)，中心显示件数；下方「穿戴」格 | 「物品栏」页左列 |
| 【肢体损伤】左人体点选 / 右参数 | `experimentBody.png` 做底，15 个部位热区（悬停/选中才显示名字，红色小点=有伤），右侧是该肢体 18 项参数 | 「肢体损伤」页 |
| 【医疗UI】computerBack / screenStatic / screenSmallStatic 的 LCD | 绿字 LCD 屏：顶部 角色类型·身高·年龄·编号 + UNI-HEALTH v2.05，下方按 14 个语义分组的读数，带条形与输入 | 「医疗面板」页 |
| 【技能UI】screenSkills / screenTime / screenSkillsGlow | 表格化：属性 / 数值 / 经验 / 下限 / 上限 / 倍率，绿色底线输入；顶部用小尺寸 screenSkills + screenTime 做设备条 | 「技能」页 |
| 指针换成 uicursor.png | 已换。**但用了 32×32 版本**（见下） | 全局 |

## 我替你做的决定（草图没写死的地方）

1. **光标缩到 32×32**：浏览器对自定义光标有尺寸上限（多数按 32×32 裁剪），直接塞 64×64 的 `uicursor.png` 会让整条 `cursor` 规则被忽略、退回系统箭头。我用 Pillow 裁掉透明边、等比缩到 32×32（热点 1,1）。
2. **物品图标是"放满盒子"而不是原始像素尺寸**：游戏图标很多只有 3×7、4×2 像素，按原尺寸显示等于一个点。现在用 `object-fit:contain` + `image-rendering:pixelated` 撑到 26px 格子，像素颗粒感保留。
3. **没照抄 macOS 风格的 −□✕ 窗口按钮**：草图外框更像"截图工具的画框"，我保留成游戏窗口风（黑底白字标题条 + 三个小方块）。
4. **医疗/技能不做成"背景图 + 绝对定位文字"**：贴图只有 118~271 px，直接当背景拉伸会糊，而且输入框对不齐。改用 CSS 复刻 LCD（扫描线 + 绿字 + 底线输入），贴图降级为装饰条。**这是与草图差异最大的一处**，如果你要严格"贴图为底"，我可以改成把贴图放大 3 倍铺底再定位。
5. **描述里的富文本标签已剥掉**：游戏描述里有 `<color="red">`，直接显示会露出标签。

## 现在能用的，和还没做的

- 能用：10 个页面全部可用，功能跟上一版一致（读档/改档/校验/写盘/预设/液体/容器嵌套），浏览器内 35 项断言全过。
- 没做：草图上"物品栏示意图"里画的是游戏内的圆形径向菜单**原图**，我用 CSS 拼了等效布局；如果你要一模一样的外观，需要把 `radialUp/Down/UpLeft/...` 六片按角度拼成整圆——素材里有，但缺左右两片（`radialLeft/Right` 不存在），所以拼不出完整六等分。
- 待定：「全部物品」列表现在是点选 + 确认添加；也可以改成**点一下就加**，看你习惯。

## 素材来源

- 你整理的 `UI草图/素材`（24 个）：uicursor / experimentBody / computerBack / screenStatic / screenSmallStatic / screenSkills / screenSkillsGlow / screenTime / radial* / bar* / modewound / modearmor / brokenbone / disinfected
- 我从游戏解包的 UI 件（22 个）：uiBlock 系列九宫格（做窗口与按钮边框）、uigradientblack、favouriteyes/not、pinicon、copyicon 等图标
- 物品图标 253 个（按物品 id 同名贴图）；剩下 47 件没有同名贴图，显示为首字符方块


---

# 第二轮修改（按你的 8 条反馈）

| # | 你提的问题 | 改法 |
|---|---|---|
| 1 | 字体太小 | 基字号 13→15px，全站统一等宽栈（Cascadia Mono → Consolas → 等宽兜底）；标签 11.5→13.5px、导航 12→13.5px、LCD 读数 11→13px、JSON 11→13px |
| 2 | 人体图按钮偏、字体小、难点 | 热区 20×15 → 40×22px，字号 8.5→11.5px，标签常显；坐标按剪影重新贴合（头 24%、胸 40%、腹 55%、手臂 33%、大腿 70%、小腿 83%、脚 92%） |
| 3 | 技能页背景错位 + 多了三排 | 去掉 `STRFrom10/RESFrom10/INTFrom10` 三排（它们在游戏里是只读派生值，改了无效）；背景图从「整图拉伸」改成 **border-image 九宫格**（16px 切片），边角不再变形 |
| 4 | 物品栏槽位与贴图错位 | 用你给的六片半圆素材**真拼了环**：先用像素半径拟合出圆心（内径≈45、外径≈92），再把每片按 2 倍缩放放到精确偏移上，标签/图标落在每片扇形重心 |
| 5 | JSON 图标"{}"错位 + 要行号 | 导航图标换成单字形 `⌗`；JSON 页加独立行号栏（`white-space:pre` 保证 1:1 对齐） |
| 6 | 极端尺寸错位 | 给 #main/#content/.panel 加 `min-width:0`；补 1560/1320/820 三个断点（窄屏三栏堆叠、列表降高）；**修了根因**：`#statusbar` 一直没有 flex 规则，底部文字挤在一起、还会溢出到左边缘 |
| 7 | 浏览器图标换成 dunestare.png | 构建时注入 `<link rel="icon">`（base64 内嵌，单文件不变） |
| 8 | 医疗面板横线太短、数据放不下 | 数值列 74→112px、输入框 62→104px、横线 52→96px，长浮点（如 -10845.53）不再被裁 |

## 顺带修掉的三个真 bug

- 物品栏重构时把 `slotIdx` 的定义连带删了，整页报 `slotIdx is not defined`（截图时发现，已补回）。
- 导航列 132px 装不下放大后的文字，`世界与进度` 被折成两行（加宽到 156px + `nowrap`）。
- 技能表因为嵌套 `.lcdrow` grid 而塌陷，重写成六列直排。

## 仍然已知的小问题

- 技能页给内容加了半透明暗色内衬保证可读性，代价是九宫格中间的屏面纹理被压暗了 —— 如果你更想要"看得见屏幕纹理"，把内衬透明度调低即可。
- 窄窗口（<1320px）下三栏会改成单列纵向堆叠，不是重新排版成两栏。


---

# 第三轮修改（按你的 5 条反馈）

| # | 问题 | 改法 |
|---|---|---|
| 1 | 圆环没拼好、贴图超出框 | 加了一层白色圆底盘（直径 368px = 内外径比例换算值），黑色扇形原色压在上面——和草图的"白底黑扇"一致；选中扇形用 `brightness/sepia` 压成深蓝，不再用会失控的 `invert`；标签改回浅色描边（之前误改成深色，压在黑扇形上看不清）；图标固定 26px 方框 |
| 2 | 能用鼠标拖动贴图 | 全局 `img{pointer-events:none; -webkit-user-drag:none}` + `body{user-select:none}`，输入框/代码块保留可选中 |
| 3 | 有些物品没贴图 | 正在从 item prefab 的 SpriteRenderer → Sprite → Texture 链路反查真实图标（47 件没有同名贴图） |
| 4 | 人体图按钮还错位 | 生成带 10% 网格的参考图逐点校准：之前的坐标整体偏下 5~10%。新坐标：头 15%、胸 31%、腹 45%、手臂一行 31%、大腿 60%、小腿 75%、脚 86%；热区再放大到 46×24px、字号 12.5px |
| 5 | 字体太小、糊 | 基字号 15→**16px**，行高 1.6；标签 15px、导航 15px、LCD 读数 14px、JSON 14px、状态栏 14px；导航图标加 `U+FE0E` 强制文字呈现，避免被渲染成彩色 emoji（这也是"糊"的来源之一） |

顺带修的：`.railpath` 之前会溢出到窗口外（截图里左边那排杂字），现在限制 4 行并裁切；窄窗口（1174×599）下副标题不再压住数据卡片。


---

# 第四轮修改

| # | 问题 | 改法 |
|---|---|---|
| 1 | 医疗面板太花哨 | 去掉扫描线、荧光绿、内发光，改成普通深色面板：标签用常规灰色、数值用标准输入框、进度条改中性蓝，分组卡片改为常规边框；页头去掉 UNI-HEALTH 版本号，只留 角色/身高/年龄/编号 |
| 2 | 圆环重叠 + 图标超出方框 | **重叠**：根因是我按"六片是同一段弧旋转 60°"推导圆心，实测每片有自己的偏差（最多 7px）。改成对每片做像素拟合（24 个角度桶、最小化外弧半径方差），拟合值写死进 `WEDGES`，接缝现在均匀；并且给扇形加 `mix-blend-mode:multiply`，即使有交叠也不会出现双线。**图标**：之前写的 `width:auto;max-height:100%` 既不放大也不真正约束，改成 `width:100%;height:100%;object-fit:contain`，非方形贴图（如消毒剂瓶）等比缩进 32px 方框内，选中项用图标框描边表示 |
| 3 | 技能页背景图 + 极端尺寸裁切 | 删掉 `screenSkills` 九宫格外框与 `screenTime` 条，改成普通表格面板；医疗/技能的宽表都包进 `overflow-x:auto` 容器，行内列宽改 `minmax(0,…)`，窄窗口（1100×700 实测）不再横向裁切、改为纵向堆叠 |

同时删掉了技能页那三排派生值（`STRFrom10` 等，游戏里是只读属性）。


---

# 第五轮修改

| # | 问题 | 根因与改法 |
|---|---|---|
| 1 | 图标问题不只在圆盘 | 之前只给 `.wface .icon` 加了裁切约束，其它位置仍是旧规则。改成**全局统一**：`.icon{overflow:hidden; display:grid; place-items:center}` + `.icon img{width:100%;height:100%;object-fit:contain;pixelated}`，并把尺寸统一到 列表/配方 24px、穿戴 26px、详情头 40px、圆盘 32px。**配方页**另有问题：液体产物（生化流体等）没有物品贴图，之前显示成字母占位，改为按 `liquidById[id].color` 画**圆形色块** |
| 2 | 医疗面板开关不明显、进度条看不清 | 开关：`.lcdrow .sw` 那几条 CSS **替换锚点没匹配上、静默失败**，所以开关一直用基础样式（34×18、深色轨道几乎看不见）。改为追加到样式表末尾，46×24 圆角轨道 + 蓝色选中态。进度条：`barFill()` 把宽度设到了**轨道**上而不是填充条，导致所有条永远不填 —— 修成设 `<i>` 的宽度；同时 6→12px、轨道提亮、填充改绿色渐变，并清掉了 3 组互相覆盖的遗留规则 |

---

# 第六轮：全站统一（本轮的彻底版本）

> 起因：「UI 界面套用过多，界面很乱」。查证结果是**五轮补丁叠在同一个样式表上**——
> `theme.css` 末尾有三段「追加在末尾，确保优先级」的覆盖块，`style.css` 是上一版整套旧皮肤
> （build 根本不引用它），面板边框是 `uiBlock` 九宫格白框套在深色底上，
> 同一个概念在不同页有三套控件（布尔开关 3 种、数字框 3 种宽、表格 3 种写法）。

## 一、这轮做了什么

| 层 | 处理 |
|---|---|
| 样式表 | `src/theme.css` **整份重写**为单一设计系统：变量 → 基础 → 组件 → 页面 → 响应式。所有「末尾追加覆盖」块被合并进定义处，不再存在后写规则改前写规则的情况 |
| 死代码 | 删除 `src/style.css`（12.4 KB，旧皮肤，build.js 从未引用） |
| 外壳 | 去掉假窗口（`#win` + 黑标题条 + 「– □ ×」死按钮）与底部状态栏；状态文字并入顶栏（品牌 / 文件 / 状态 / 徽标 / 打开 / 保存）。**像素光标按你的要求保留** |
| 面板框 | 白框九宫格 `border-image:var(--i-uiBlock)` → 一枚 1px 描边 + 8px 圆角的 `.panel`，全站唯一 |
| 物品栏 | 六槽径向圆盘**保留**（你的小巧思），左列定宽 368px 刚好放得下；穿戴位用统一 `.tile`。右列「添加物品」按 340px 窄列重排字段行，不再被面板裁切 |
| 医疗面板 | 三列 LCD（绿字 + 细进度条 + 92~124px 输入）→ 与其它页同款「分组卡片 + 标准字段行」，范围条沿用 `.field` 的 range；**列式（masonry）堆叠**，卡片各自高度、不跨列对齐 |
| 技能 / 配方 | 两套自绘行容器 → 同一个 `.tbl`（`table-layout:fixed`，技能 5 列数值、配方含图标/产/ID/INT/已制作） |
| 改动清单 | 自绘 flex 行 → `.tbl`（路径 / 原值 / → / 新值） |
| 布尔 | 3 种（方块开关 / 圆角开关 / 原生 checkbox）→ 唯一 `.sw`（40×22 圆角轨道） |
| 数字框 | 5 套宽度 → 全站 148px，医疗网格内 112px，表格内 112px，液体行 88px，均右对齐等宽字体 |
| 图标 | `.icon` 统一 26px 方框（详情头 40px、槽位 30px），`object-fit:contain` + 像素化 |

## 二、现在的规矩（以后别再加皮肤）

1. **页面里不写颜色 / 字号 / 边框 / 圆角。** 只用 `theme.css` 第 3 层组件：`.panel` `.field` `.btn` `.tbl` `.tile` `.list/.lrow` `.cards` `.note` `.badge` `.icon` `.sw` `.modal`。
2. **改样式只改一处。** 需要新外观时改组件定义，不在页面末尾追加覆盖规则（上一轮就是这么乱起来的）。
3. **一个概念一个控件。** 布尔只有 `.sw`；数值只有「range + number」或「单 number」；列表只有 `.tbl`（有列语义）与 `.list/.lrow`（无列语义）。
4. 新面板 = `panel(标题, 计数, 行数组)` + `fieldRow(标签, 键名, 控件, 单位)`，与「医疗面板」一致。

## 三、怎么复验（截图流水线已落地）

```bash
node build.js                                  # 生成 dist 单文件
node work/uiprobe/make_probe.js                # 生成带存档的截图页 work/uiprobe/probe.html
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu \
  --user-data-dir=%TEMP%\cuprobe --window-size=1680,1050 --virtual-time-budget=6000 \
  --screenshot=work\uiprobe\shots\after-items.png \
  "file:///.../work/uiprobe/probe.html#items"   # #面板名，:dlg 打开液体弹窗
```

`work/uiprobe/shots/` 里 `before-*` 是本轮改前的十页截图，`after-*` 是改后，`narrow-*` 是 1100×720 窄窗口。

---

# 第七轮：四条反馈

| # | 你的反馈 | 根因 | 改法 |
|---|---|---|---|
| 1 | 物品栏的六个圆盘要保留；右侧「添加物品」显示不全 | 上一轮我把圆盘换成了网格；右列只有 340px，而字段行是「标签 240px + 控件 + 单位」三列布局，控件被 `.panel{overflow:hidden}` 裁掉 | 圆盘按原拟合坐标（`WEDGES`，内径≈45 / 外径≈92 像素）恢复，左列定宽 368px；右列字段行压成「标签 + 控件」两列、控件占满余宽，搜索框/下拉/数字框都能完整显示 |
| 2 | 医疗面板各卡片之间有大间隙 | `.vgrid` 是 `display:grid`，同一行的卡片被拉成同一高度，短卡片下方留空、下一行被整体推低 | 改成 CSS 多列（`column-width:368px` + `break-inside:avoid`）：卡片各自高度、按列向下堆叠，不再对齐到行 |
| 3 | 改回原值后黄色提示不消失 | `fNumber/fBool/fText/fSelect` 只在提交时 `classList.add('changed')`，从不移除（只有重渲染才清） | 改为 `classList.toggle('changed', isChanged(path))`——按「与原始快照的差异」实时判定；技能表同样处理 |
| 4 | 物品贴图被截断 / 超出框 | 游戏图标是 **3×2 ~ 12×12 的小像素图**（实测 300 件里 205 件非正方形，最大 12×12），用 `object-fit:contain` 做非整数倍缩放时，最近邻采样会吃掉整行/整列像素，看起来像被裁断 | 构建时用 PNG 头读出每张贴图真实尺寸（`art.iconSize`），运行时算**整数倍**放大（`k = floor(min(框/宽, 框/高))`）并居中；框内不再有任何缩放失真 |

## 验证方式（都已跑过）

```bash
node build.js --selftest      # dist/selftest.html：35 项断言，fails=0
node work/uiprobe/make_test.js # 交互断言页：改值→黄标出现 / 改回→黄标消失 / 圆盘 6 片 / 图标整数倍
```

实测输出（Edge headless）：

```json
{"dirty":true,"cleanAgain":true,"icon":{"css":[24,12]},"wedges":6}
```

`icon.css=[24,12]` 即 4×2 的贴图被放大 6 倍到 24×12，像素完整无裁断。

---

# 第八轮：三条反馈（容器编辑 / 窄列裁切 / 黄标可见）

| # | 反馈 | 根因 | 改法 |
|---|---|---|---|
| 1 | 详细参数在窄宽度下显示不全，收藏和颜色被拆成两行 | 详情列在中列被压到 ~370px 时，字段行仍是「标签 minmax(140,240) + 控件 + 单位」；收藏行需要 ≈240+8+40+8+148=444px，装不下就换行/被 `overflow:hidden` 裁掉 | 用 CSS 容器查询按**列自身宽度**重排：列宽 ≤560px 时标签列收到 84~120px、隐藏单位列、数字框 104px（收藏行 120+10+196=326，370px 列内一行放得下）；≤360px 才改成「标签上、控件下」。色块 16→15px、间距减小 |
| 2 | 容器里的物品无法编辑耐久等信息 | 「容器内容」只是只读列表 + 删除按钮，没有把子物品设为当前选中项 | 列表行可点：点击后详情面板显示**这件子物品**，耐久 / 位置 / 收藏色 / 自定义名 / 液体都能改；行尾 ✕ 仍是移除（`stopPropagation`，不会误选）。详情里多一个「← 回到宿主「×××」」按钮；选中子物品时圆盘仍高亮它所在的宿主槽位 |
| 3 | 怎么改都不显示黄标 | 黄标只是淡黄色背景（alpha .09）+ `.tag` 变色，而医疗页的 `.tag` 被 `display:none` 隐藏 —— 类确实加上了，肉眼几乎看不到；物品页的耐久/位置/收藏/名称四行则从未加过类 | ①视觉加强：左侧 3px 琥珀竖条 + 行背景加深 + 标签与输入框文字/边框变琥珀；表格行 `tr.changed` 同理。②全站补全：物品页四行按「与原档逐字段比对」打标，设置页新增按原值比对打标，医疗/肢体/世界/技能沿用上一轮的实时 toggle |

## 复验

```bash
node build.js --selftest   # 35 项断言 fails=0
node work/uiprobe/make_test.js && <edge --dump-dom test.html>   # 交互断言
```

本轮交互断言输出：

```json
{"bodyDirty":true,"bodyBg":"linear-gradient(...240,180,90...","bodyClean":true,
 "childIdx":2,"childTitle":"消毒绷带","hasBack":true,"childEditables":3,"clickableKids":7}
```

截图：`work/uiprobe/shots/` 的 `w1680/w1300/w1240/w640-items.png`（窄列四档）、
`after-child.png`（选中容器子物品）、`crop-chg-item.png` / `crop-chg-set.png`（黄标特写）。

> 说明：概览页现在的文案（角色 / 携带物品 / 已解锁配方 / 无作弊 / 8474 Cal）不是我写的，本轮未改动它。

---

# 第九轮：物品描述的 TMP 富文本

游戏描述是 Unity TextMeshPro 富文本，存档/语言包里原样带着标签。实测 300 件物品里 **10 件**含标签：

| 形态 | 例子 | 出处 |
|---|---|---|
| `<color="red">`（**只有开标签、没有闭标签**） | 爪套 / 粗制菜刀 / 脆弱小刀 / 暴露的核心 | `items.json` 里 18 处 `color=` |
| `<i>…</i>` | 耳罩：不过对<i>极端</i>噪音也无能为力 | 2 处 |

原来的两个毛病：
1. 悬停tooltip 直接把 `it.desc` 塞进 `title`，浏览器按纯文本显示 → 露出 `<color="red">` 原文；
2. 页面里的描述走 `stripTags`，标签被整段剥掉 → 红色没了（其实"截除肢体"这句在游戏里是警告色）。

改法（`core.js`）：

```js
function richText(s){
  var esc = String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc
    .replace(/&lt;color=("?)([#\w]+)\1&gt;/gi, '<span style="color:$2">')   // 颜色
    .replace(/&lt;\/color&gt;/gi, '</span>')
    .replace(/&lt;b&gt;/gi,'<b>')…                                            // 粗体/斜体/换行
    .replace(/&lt;\/?[a-z][^&]{0,60}?&gt;/gi, '');                           // 其余标签丢掉
}
```

要点：
- **先整段转义，再只放回白名单**——原文不会漏成裸文本，也不可能注入任意 HTML（`color` 的取值被限制成 `[#\w]+`）。
- Unity 这种"只开不闭"的 `<color>` 交给浏览器自动收尾，正好和游戏内表现一致（整段变红）。
- 描述容器加 `white-space:pre-wrap`，存档里 `\n\n` 的段落间隔还原成空行。
- tooltip 仍用原生 `title`（纯文本），只把标签剥掉 —— 原生 tooltip 无法渲染颜色。

验证（Edge headless，选中「爪套」）：

```json
{"hasSpan":true,"spanStyle":"color:red","spanText":"可在医疗面板中截除肢体。",
 "leak":false,"color":"rgb(255, 0, 0)","rowTitleHasTag":false}
```

截图 `work/uiprobe/shots/crop-rich.png`；`dist/selftest.html` 仍是 35 项断言 fails=0。

---

# 第十轮：液体容器的"耐久"其实是装填率

## 查证（游戏代码）

```csharp
// WaterContainerItem.cs:231-234
public void UpdateCondition() { item.condition = CurrentTotal / Capacity; }

// Item.cs:104-112 —— 反向改 condition 只会"倒掉"液体，不会加水
public void SetCondition(float newCond){
  if (condition > 0f && TryGetComponent<WaterContainerItem>(out var component)){
    float num = newCond / condition;
    component.Drain(component.CalculateDrain(component.Capacity * (1f - num)));
  }
  condition = newCond;
}
```

结论：**液体容器没有独立的耐久**，`condition` 恒等于 `液体总量 / 容量`（60% 的 500ml 水瓶 = 300ml/500ml）。
原来界面里给这类物品一个"耐久 %"输入框，既没意义（游戏运行时会按液体重算）又容易写出自相矛盾的档
（比如"耐久 100% 但一滴水没有"）。

## 改法

| 位置 | 改动 |
|---|---|
| 详情首行 | 液体容器不再是「耐久 %」输入，而是**「装填量」ml 输入 + `/ 容量 ml（xx%）`**，键名提示写明 `condition = 液体总量 / 容量`。填 ml → 按比例重算 `stack` 每份的体积 → 同步 `it.condition = total / cap`（不是游戏那种"只能倒掉"的 SetCondition） |
| 操作按钮 | 液体容器的「耐久满」换成**「装满液体」**（直接填到容量） |
| 液体弹窗 | 顶部标题改成 `合计 75 / 容量 100 ml（75%）· 耐久（装填率）随液体自动同步`；改体积 / 加一种 / 删一种都会同步 `condition` |
| 列表与圆盘 | 容器内容行、圆盘扇区的数值：液体容器显示 `75/100 ml`，其它物品仍是 `100%`（新增 `fillLabel(i)`） |
| 添加物品 | 液体容器按**空容器**入库（`condition = 0` + 空的 `WaterContainerItem.stack`），面板里加了说明，避免"耐久 100% 的空瓶" |
| 创建液体组件 | 建立空 stack 时同时把 `condition` 置 0 |

## 验证（Edge headless，选中医疗箱里的「头孢曲松注射器」，容量 100ml）

```json
{"vesselId":"ceftriaxone","cap":100,"rowLabel":"装填量","volBefore":"75","condBefore":0.7456705,
 "filledBtn":true,"volAfter":"100","condAfter":1,"stackSum":100,
 "nonVesselRow":"耐久","afterClickCond":1,"afterClickSum":100}
```

- 容器类：行标题是「装填量」，输入 100 → 液体合计正好 100 = 容量，`condition` 同步为 1；「装满液体」按钮点一次同样得到 1 / 100。
- 非容器类：行标题仍是「耐久」。
- 截图：`work/uiprobe/shots/crop-vessel.png`（装填量行）、`crop-kids.png`（容器内容里 `75/100 ml` 与其它物品的 `%` 并存）。
- `dist/selftest.html` 35 项断言 fails=0。

---

# 第十一轮：液体弹窗改动是否即时刷新

## 原因

`liquidDialog()` 里每个改动点只做了 `refreshFooter()`（只更新顶栏的"已修改 N 处"），而「装填量 / 液体」这些行是**渲染时一次性构建的 DOM**，所以数据变了界面不动——必须切一次页触发 `renderPanel()` 才看到新值。

## 改法

`core.js` 新增：

```js
function rerenderKeepScroll(){
  var c = document.getElementById('content');
  var top = c ? c.scrollTop : 0;
  renderPanel();
  if (c) c.scrollTop = top;     // 重渲染但不弹回顶部
}
```

`liquidDialog()` 里所有改动点（改体积 / 换液体种类 / 删一种 / 加一种 / 创建液体组件）统一走

```js
function afterChange(){ refreshFooter(); rerenderKeepScroll(); }
```

弹窗本身挂在 `document.body` 上，`renderPanel()` 只清空 `#content`，所以**弹窗不会被打断**；同时圆盘扇区、容器内容行、装填量、液体行都会当场同步。

## 验证（Edge headless，弹窗里把 75 ml 改成 30 ml）

```json
{"dialogOpened":true,"rowLabel":"装填量","volInput":"30","pctTag":"/ 100 ml（30%）",
 "cond":0.3,"liqText":"头孢曲松 3030/100 ml","wheelStillThere":6,
 "dialogStillOpen":true,"scrollBefore":49,"scrollAfter":49,"sameTitle":"头孢曲松注射器"}
```

- 弹窗没关、当前物品没变、滚动位置 49 保持不变，后面两行已经变成 30 ml / 30%。
- 加/删液体同样即时：`{"start":1,"afterAdd":2,"liqAfterAdd":"头孢曲松 75过滤水 25100/100 ml","afterRemove":1,"overlayClosed":true,"condAfterFill":1,"volAfterFill":"100"}`。
- 截图 `work/uiprobe/shots/crop-live.png`：弹窗显示 30，背后「装填量」已是 30 / 100 ml（30%）并带改动黄标。
- `dist/selftest.html` 35 项断言 fails=0。
