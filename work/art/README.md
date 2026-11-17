# 游戏美术资源解包（Casualties: Unknown）

来源：`D:\SteamLibrary\steamapps\common\Casualties Unknown\CasualtiesUnknown_Data\` 下的 4 个 assets 文件，游戏目录全程只读。

## 怎么浏览

| 方式 | 路径 | 说明 |
|---|---|---|
| **交互浏览页** | `work/art/gallery.html` | 双击用 Edge/Chrome 打开。搜索名字、按分类筛、按最小尺寸筛、点图放大看透明通道 |
| 分类总览图 | `work/art/out/contact_*.png` | 11 张拼接图，每格带文件名（`ui` 1 张 / `font` 1 张 / `anim` 1 张 / `item` 1 张 / `char` 2 张 / `other` 5 张） |
| 名单 | `work/art/out/names.txt` | 1697 行，`名字 \t 宽x高 \t 源文件` |
| 索引 | `work/art/out/index.json` | 每张图的 name / file / pathId / w / h / path / bytes / category |
| Sprite 元数据 | `work/art/out/sprites.json` | 1592 条，含 **九宫格 border**、pivot、pixelsToUnits |

## 导出规模

| 源文件 | Texture2D | 导出 PNG |
|---|---|---|
| resources.assets | 1249 | 1243 |
| sharedassets1.assets | 289 | 289 |
| sharedassets0.assets | 99 | 99 |
| globalgamemanagers.assets | 60 | 60 |
| **合计** | **1697** | **1691**（34.5 MB） |

6 张没导出的是 0×0 的空纹理（运行时才填充的字体贴图），不是解码失败。分类分布：other 962 / char 313 / anim 175 / ui 116 / item 102 / font 23（+6 空）。

## 对重做 UI 最有用的：九宫格素材（可直接拉伸）

这些 Sprite 带非零 border，等价于 CSS 的 `border-image`，能任意拉伸做面板/按钮而不糊：

| 名称 | 尺寸 | border (左,下,右,上) | 来源 |
|---|---|---|---|
| `UISprite` | 32×32 | 10,10,10,10 | sh1 |
| `Background` | 32×32 | 10,10,10,10 | sh1 |
| `UIMask` | 32×32 | 10,10,10,10 | res |
| `uiBlock` | 64×64 | 3,3,3,3 | sh0 |
| `uiBlockSmall` | 32×32 | 3,3,3,3 | sh0 |
| `uiBlockNano` | 16×16 | 1,2,1,3 | sh0 |
| `uiBlockMini` | 10×10 | 3,3,3,3 | sh1 |
| `uioutline` | 16×16 | 3,3,3,3 | sh0 |
| `darkenedUiBlockNano` | 16×16 | 1,1,1,4 | sh0 |
| `uigradientblack` | 256×256 | 126,126,126,126 | sh1 |
| `UIElement8px` | 8×8 | 0,2,0,0 | res |

## 可以拿来用的其它素材

下列名字全部与 `names.txt` 逐条核对过（`node tools/check_art_names.js` 会验）。

- **按钮底**：`bigbutton` `aedbutton` `podbutton` `exercisebutton` `sleepbuttonback` `gunmenubackground`
- **面板/背景底**：`woodpanel` `woundpanel` `steelBackground` `ventsBackground` `grassBackground` `iceBackground` `rockBackground` `marbleBackground` `sandBackground` `wastelandBackground` `defibBackground` `recipepreviewbackground` `lcdscreen`
- **光标/鼠标（全部 64×64）**：`cursor` `cursorpressed` `cursorpoint` `cursorpointpressed` `uicursor` `uicursorpressed` `grabcursor` `grabcursorpressed` `minecursor` `minecursorpressed` `containertransferCursor`
- **径向菜单件**：`radialUp` `radialDown` `radialUpLeft` `radialUpRight` `radialDownLeft` `radialDownRight` + 各自 `…Muted` 变体，另有 `radialBar`(38×2) `radialInnerCircle`(90×91) `radialWorn`(32×32)。注意**没有**左右横向件，只有上下与四个斜向。
- **图标**：`favouriteyes` `favouritenot` `hearticon` `pinicon` `playicon` `saveicon` `weighticon` `sleepIcon` `exitIcon` `copyicon` `haggleIcon` `splinticon` `tourniquetIcon` `pasteicon` `threatenIcon`（首字母大小写不一致，`sleepIcon`/`exitIcon` 里是大写 I）
- **暂停菜单**：`pauseMenuCircle` `pauseMenuDeath` `pauseMenuExit` `pauseMenuMerc` `pauseMenuReturn` `pauseMenuSettings`
- **遮罩/界面块**：`darkenedUiBlockNano` `prosthesismask` `shadecrawlerbody`
- **整屏背景**：`sleepingBagOverlay`(1920×1080) `splashscreen`(1350×810) `screenIce`(1200×800)
- **字体图集**：`Retro Gaming` / `RetroGamingFIXED` / `Consolas` / `unifont-17.0.04` / `NotoAscii`（SDF 或点阵图集，网页端不建议直接切图；要还原像素字建议找对应字体文件用 `@font-face`）

## 两点必须知道的坑

1. **很多素材是纯白/纯黑，靠运行时着色**。例如径向菜单件在 PNG 里是黑色、`favouriteyes` 是黄色，但游戏里是用 `SpriteRenderer.color` / `Image.color` 乘上去的。重做界面时按"可着色蒙版"来用，别指望 PNG 自带配色。
2. **分类是名字启发式**，只影响浏览：已知噪声如 `12gauge`(弹药) 被归到 ui、`dustmask` 被归到 ui。要精确筛选请直接用 `index.json` 的 name/file。

## 复跑

```bash
python work/art/extract_textures.py     # 重导全部 PNG + index + 总览图（约 34.5 MB）
python work/art/extract_sprites.py      # 重导 Sprite 元数据（含九宫格 border）
node  tools/build_gallery.js            # 用 index.json 重新生成 gallery.html
python work/art/verify_output.py        # 独立验收：UnityPy 重读 + 磁盘比对
node  tools/check_art_names.js          # 校验本文件里提到的素材名是否都真实存在
```

这些是游戏本体素材，只用于本工具的界面参考/皮肤，别再分发。
