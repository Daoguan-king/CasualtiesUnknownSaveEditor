# Astryx 界面规范（第九轮重写后的唯一玩法）

这一版把整个界面换成了 **React 19 + Astryx 0.7.17 设计系统**：页面不再自己写 CSS，全部由 Astryx 组件与一套自建深色主题 \`quarantine\` 组成，最终仍由 \`astryx experimental export\` 打成**单文件 HTML**（离线、双击即用）。

## 目录

\`\`\`
src/page.tsx            页面入口：Theme(quarantine) + <App/>
src/app/App.tsx         外壳：侧栏导航 / 顶栏（文件与改动）/ 面板切换 / 读档写回 / 拖放
src/lib/store.ts        存档状态（save 工作副本 + orig 快照）、路径读写、差异与脏标记
src/lib/data.ts         元数据表与访问器（物品 / 液体 / 槽位 / 肢体 / 身体字段）
src/lib/codec.ts        gzip 流 + ASCII 安全 JSON
src/lib/validate.ts     结构校验（复现 SaveSystem.TryLoadGame 的失败条件）
src/lib/nav.ts          十个页签与分组
src/ui/kit.tsx          共享原语：Panel / Group / FieldRow / NumRow / RangeRow / BoolRow / TextRow / SelectRow / IconBox / Stat
src/ui/rich.tsx         TMP 富文本 → React 节点（只放行 color/b/i/br）
src/panels/*.tsx        十个面板
src/themes/quarantine/  主题的 app 副本（由 theme 命令生成，不手改）
themes/quarantine/      主题源与设置（settings.json 归 theme editor 所有）
src/generated/          构建期生成的数据与贴图（prebuild 产物，不入库）
tools/build.js          prebuild → astryx export → 单文件产物
tools/shots.mjs         Playwright 截图（注入真实存档，逐页）
tools/selftest.mjs      浏览器内自检（载入/改值/撤销/写盘/十页渲染）
\`\`\`

## 改界面的三条规矩

1. **只用组件，不写样式。** 布局用 \`VStack / HStack / Grid / Section / Layout\`，文本用 \`Text / Heading\`，输入用 Astryx 的 \`NumberInput / Slider / Switch / TextInput / Selector\`，列表用 \`Table\` 或 \`List/ListItem\`。页面里没有 \`<div>\`、没有颜色/字号/圆角/px/hex、没有 \`@import\` CSS、没有 \`xstyle\`。
2. **一个概念一个控件。** 布尔只有 \`Switch\`（\`BoolRow\`）；数值只有 \`NumRow\` 或 \`RangeRow\`（滑块 + 数字框）；下拉只有 \`SelectRow\`；带列语义的用 \`Table\`；「已修改」只用 \`StatusDot variant="warning"\`（由 \`isChanged(path)\` 实时判定，改回原值会自动消失）。
3. **自绘地图也要能被键盘操作。** 圆盘扇区、剪影热区、染色色块这类"像素画当控件"的地方，优先用 Astryx 的 `Button`（`isIconOnly` + `label` 就是 aria-label）；实在必须用 `Stack` 时，至少给 `role` / `tabIndex={0}` / `aria-label` / `Enter`·`空格` 处理，选中态用 `aria-pressed` 或 `aria-checked`。
4. **要改外观就改主题，不要改页面。** 颜色/字体/圆角/间距都在 \`quarantine\` 主题里，用主题编辑器一次改一处、每次都看图：

\`\`\`bash
npx astryx experimental theme editor set quarantine accent "#e0a53a"
npx astryx experimental theme editor set quarantine spacing tight --on table
npx astryx experimental theme editor show quarantine --png   # 写完一定要打开 PNG 看
\`\`\`

当前主题设定：dark-only、accent \`#e0a53a\`（琥珀，选中/主按钮）、neutral \`#4a5058\`（钢灰）、info \`#4fb3b8\`（青）、corners \`square\`、spacing \`tight\`、focus ring 内缩 2px。

## 新增/修改一个面板

\`\`\`tsx
<Panel title="医疗面板" description="…">
  <Group title="运动与移动" count="12 项">
    <RangeRow label="最大移动速度" path={['body', 'maxSpeed']} min={0} max={20} step={0.1} />
    <BoolRow  label="流血"         path={['body', 'bleeding']} />
  </Group>
</Panel>
\`\`\`

\`path\` 是存档 JSON 里的路径；\`NumRow/RangeRow/BoolRow/TextRow/SelectRow\` 直接调 \`store.update(path, value)\`，不需要自己写事件或脏标记。批量改（预设）用 \`store.mutate(save => …)\`，只触发一次重渲染。

## 构建与验收

\`\`\`bash
node tools/build.js                       # dist/CasualtiesUnknown存档修改器.html
node tools/build.js --out work/build/x.html
node tools/shots.mjs --panel items --tag x   # 截图 + 打印页面错误（必须为空）
node tools/selftest.mjs                    # 17 项浏览器断言，退出码 0 才算过
\`\`\`

构建链路依赖 \`@astryxdesign/cli\` 的 \`experimental export\`（内部用 esbuild），它只接受**不是它写的** HTML 覆盖失败，所以 \`tools/build.js\` 会先删目标文件。

## 已知取舍

- 产物约 3.5 MB：React + Astryx + 主题字体（woff2 内嵌）+ 300 个物品图标 + 全部元数据；换来完全离线、双击即用。
- 像素光标用 32×32 版（浏览器对自定义光标有尺寸上限，超限会整条规则被忽略）。
- 物品图标按贴图真实像素做整数倍放大（3×2 的贴图放大 6 倍），避免最近邻采样吃掉整行像素。
- 主题字体随包内嵌、页面不联网；断网打开与联网一致。
