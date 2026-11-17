# 结论报告 · save.sv 校验器

status: ready

## 1. 结论速览

| # | 用例 | 内容 | 判定 | 退出码 |
| - | --- | --- | --- | --- |
| a | cases/a_original.sv | work/save.json 原样 (经 pack 成 .sv) | **PASS** | 0 |
| b | cases/b_broken_int_field.sv | body.corpsesSeen 47 改成 47.5 (int 字段给小数) | **FAIL(1)** 定位到 body.corpsesSeen | 1 |
| b′ | 同上 + --lenient | 只按游戏真实行为 | PASS (游戏会静默读成 48) | 0 |
| c | cases/c_edited_ok.sv | body.hunger = 100.0, items[0].condition = 1.0 | **PASS** | 0 |
| d | cases/d_soft_defects.sv | 自检: 不存在的字段 + 文本塞进 float + 物品 id 打错 | FAIL(2) | 1 |
| e | cases/e_corrupt_gzip.sv | 自检: .sv 被截掉一半 | FAIL(1) 致命 | 1 |
| f | cases/f_nonascii_bytes.sv | 自检: .sv 里带 UTF-8 中文字节 | FAIL(1) (ASCII 字节被毁 + float 解析失败) | 1 |
| - | work/save.json 直接喂 | 未压缩 JSON 也支持 | PASS | 0 |

三个必需用例全部符合预期。

## 2. 类型读取方案: Mono.Cecil (成功)

- **方案**: Mono.Cecil 直读 `Assembly-CSharp.dll` 的元数据, 用现成 dll `<游戏>\BepInEx\core\Mono.Cecil.dll` (csproj HintPath 引用, 无需 NuGet/联网)。
- **结果**: 成功。不加载 Assembly-CSharp.dll, 不需要 Unity 运行时, 不需要 `AssemblyResolve`。
- **备选方案未使用**: .NET 反射 + AssemblyResolve 指向 Managed 目录 (会牵扯 UnityEngine 依赖), 不需要。
- **不依赖第三方数据**: `work/data/*.json` 不参与任何类型判断; 只有 `items[].id` 的成员核对读那张第三方物品表, 报告里标注了 [物品表是第三方数据, 仅供核对]。
- 类型真相每次运行都从 dll 现读, 报告头会打印来源与版本 (Newtonsoft.Json 13.0.0.0 = 游戏自带的那份)。

## 3. 从 dll 读到的类型规模

| 类型 | 公有实例字段 (含基类) |
| --- | --- |
| Body | **188** |
| Limb | 44 |
| Skills | 15 |
| Limb+ProstheticInfo | 10 |
| SavedItem | 7 |

Body 的 188 个字段里, 被 `Convert.ChangeType` 支持的基元类型分布:

| 类型 | 个数 |
| --- | --- |
| System.Single (float) | 109 |
| System.Boolean | 28 |
| System.Int32 | **5** |
| System.String | 1 |
| Skills (走 ToObject) | 1 |
| 其余 44 个 (引擎/引用/数组/结构体) | 44 |

补齐 188: 109 + 28 + 5 + 1 + 1 = 144 个可赋值基元字段, 另 44 个是 AnimationCurve×12, Vector2×4, AudioClip[]×3,
Limb[]×2, Animator×2, 以及 Limb / AnimationClip / Rigidbody2D / BoxCollider2D / Vector3 / Vomiter / InventorySlot[] / Talker /
SelfHarmer / ParticleSystem / Gradient / LiquidAffect / MindwipeScript / Body+SleepQuality / Transform / Single[] /
Nullable<Body+SleepQuality> / Climbable / Light2D / GameObject / AudioSource 各 1 个。
这 44 个字段游戏自己也永远赋值不成功 (`Convert.ChangeType` 产出不了这些类型), 属于存档格式的固有行为, 报告里记 [提醒] 不算失败。

### Body 的 5 个 int 字段 (dll 实测)

```
int corpsesSeen          (Cecil: System.Int32)
int charType             (Cecil: System.Int32)
int handSlot             (Cecil: System.Int32)
int overdoseIndex        (Cecil: System.Int32)
int defibShockedFrames   (Cecil: System.Int32)
```

### 3 个 int 字段的实测证据 (`--typeinfo` 原样输出)

```
=== int 字段的 Convert.ChangeType 实测 ===
  corpsesSeen: Convert.ChangeType(整数 7) = 7 (Int32) ; Convert.ChangeType(小数 7.5) = 8 ← 不抛异常, 静默四舍五入
  charType: Convert.ChangeType(整数 7) = 7 (Int32) ; Convert.ChangeType(小数 7.5) = 8 ← 不抛异常, 静默四舍五入
  handSlot: Convert.ChangeType(整数 7) = 7 (Int32) ; Convert.ChangeType(小数 7.5) = 8 ← 不抛异常, 静默四舍五入
```

**这是本次最重要的一条实测事实**: `Convert.ChangeType(new JValue(47.5), typeof(int))` 不抛异常而是四舍五入到偶数 (48)。
所以"int 字段给小数"在游戏里**不会报错**, 值会悄悄变成另一个数 (bool 给 1 → true, string 给数字 → 文本形式, 同理)。
校验器因此提供两种判定: 默认 **strict** (把这种静默改写算 FAIL — 必需用例 b 就是在这里 FAIL 的),
`--lenient` 只复现游戏真实行为 (同一份文件判 PASS, 并注明"值会变")。

## 4. 三个用例的完整输出摘要

### a. cases/a_original.sv → PASS

```
[1] 容器层 (文件 3446 字节)
  类型指纹: Body 188 字段 (int 5 / float 109 / bool 28 / string 1 / Skills 1)
  OK   gzip       : 解压成功 -> 23082 字节
  OK   ASCII 字节 : 全部 < 0x80 (0 个非 ASCII 字节) — 游戏 Unzip 用 Encoding.ASCII, 不会被毁
  OK   JSON 解析  : 成功 (Newtonsoft 13.0.0.0)
[2] 顶层结构
  OK   body 62 个键 / limbs 15 条 / items 45 条 / itemComponents 45 条 (与 items 一致)
  OK   bodyComponents 0 个键 / limbComponents 15 条 (与 limbs 一致) / 世界状态键 16 个齐全
[3] body 字段 (dll 里 Body 共 188 个公有实例字段, 存档里有 62 个键)
  i    已逐键核对 62 个键: 字段存在性 + Convert.ChangeType; Skills 走 ToObject<Skills>()
  [提醒] body.skills.STRFrom10 / RESFrom10 / INTFrom10  字段不存在于 Skills — Json.NET 默认忽略未知成员, 该值不生效
[4] limbs 字段 (dll 里 Limb 共 44 个公有实例字段)   i 已逐条核对 15 条 limb
[5] items   i 已核对 45 条 item: id + condition/slot/wearSlot/favourited/label/swatch 类型
=== 汇总 ===  读档中断 0 / 值被静默改写 0 / 其它提醒 3
结果: PASS
```

(3 条 [提醒] 是样本存档自己的问题: 它的 `skills` 里有 STRFrom10/RESFrom10/INTFrom10 三个键, 而当前 dll 的 Skills 类只有 STR/expSTR/minSTR/maxSTR/STRGainMult 等 15 个字段, 没有 From10。
Json.NET 对未知成员不抛异常, 所以不影响读档。这也说明**样本存档与当前 dll 不是同一版本**的产物: 存档 body 只有 62 个键, dll 有 188 个字段。)

### b. cases/b_broken_int_field.sv → FAIL(1)

```
[3] body 字段 (dll 里 Body 共 188 个公有实例字段, 存档里有 62 个键)
  [不符] body.corpsesSeen  类型 System.Int32 ← JSON 小数 47.5: Convert.ChangeType 成功但值被静默改写
         — 小数 47.5 被四舍五入成整数 48 (游戏不报错, 值就变成另一个数)
=== 汇总 ===  读档中断 0 / 值被静默改写 1 (strict 计入失败; --lenient 下放过) / 其它提醒 3
结果: FAIL(1 个致命问题)
```

定位到了唯一的那个字段 `body.corpsesSeen`, 并说明了它在游戏里会发生什么。
同一份文件加 `--lenient`: `结果: PASS` + `(lenient 视角) 这 1 项游戏确实能读进来, 但值会变`。

### c. cases/c_edited_ok.sv → PASS

改动: `body.hunger` 83.1026459 → 100.0 (dll 里是 System.Single), `items[0].condition` 0.237151742 → 1.0 (SavedItem.condition 是 System.Single)。

```
[1] gzip 解压成功 -> 23069 字节 / ASCII 全部 < 0x80 / JSON 解析成功
[2] body 62 键 / limbs 15 条 / items 45 条 / itemComponents 45 条 / limbComponents 15 条 / 世界状态键 16 个齐全
[3] 62 个键全部通过 (含 body.hunger = 100.0 ← float 字段, 无改写)
[4] 15 条 limb 全部通过
[5] 45 条 item 全部通过 (含 items[0].condition = 1.0)
=== 汇总 ===  读档中断 0 / 值被静默改写 0 / 其它提醒 3
结果: PASS
```

## 5. 附带的三个自检用例 (证明检查项真的会报, 不是永远 PASS)

- **d. d_soft_defects.sv → FAIL(2)**:
  `[提醒] body.zzNotAField 字段不存在于 Body` (游戏弹提示并跳过) +
  `[不符] body.hunger 类型 System.Single ← JSON 字符串 "???": Convert.ChangeType 抛 FormatException` +
  `[不符] items[0].id 物品 id "claws_typo" 不在物品表 (300 条) 内`。
- **e. e_corrupt_gzip.sv → FAIL(1)**: 截断的 gzip 被 .NET 宽松地解出 12389 字节, 随后
  `[致命] JObject.Parse 失败: JsonReaderException: Unexpected end of content ... Path 'items[26].condition'` — 游戏在这里 return。
- **f. f_nonascii_bytes.sv → FAIL(1)**: `WARN ASCII 字节 : 9 个字节 >= 0x80 (首个偏移 456...)`, 中文被 ASCII 解码器换成 '?',
  连带 `body.hunger` 变成 "?????????" 解析失败。这一条正是"非 ASCII 字节会被毁"的现场证据。

## 6. 覆盖范围 (与 SaveSystem.TryLoadGame 的对应)

| 检查 | 对应源码行为 | 失败时的真实后果 |
| --- | --- | --- |
| gzip 解压 | `Unzip`, `SaveSystem.cs:238` | catch 里 return, 读档放弃 |
| ASCII 字节 | `new StreamReader(stream, Encoding.ASCII)`, `:464-471` | 字符串被毁 (读档一般不中断) |
| JSON 解析 | `JObject.Parse`, `:238` | 弹 could not be parsed, return |
| body/limbs 键 | `typeof(...).GetField(name)` + `Convert.ChangeType`, `:251-283` | 弹提示, 该字段值不恢复, 读档继续 |
| Skills / ProstheticInfo | `item.Value.ToObject<Skills>()` / `ToObject<Limb.ProstheticInfo>()`, `:258-276` | 同上 |
| items 反序列化 | `jObject["items"].ToObject<SavedItem[]>()`, `:287-296` | 弹提示并 **return**, 读档取消 |
| items[].id | `Resources.Load(savedItem.id)`, `:305` | 该物品被丢弃 (读档继续) |
| 顶层结构齐全性 | `jObject["limbs"/"itemComponents"]` 等无 try 包裹处 | NullReference, 读档崩 |

## 7. 已知限制

1. `body.limbs[i]` 指向的是游戏内**实时** body 的 limbs 数组, 离线无法核对"存档第 i 条 limb 会赋给哪条肢体"; 只校验字段名与值类型。
2. 转换语义在 .NET 8 + 游戏自带 Newtonsoft.Json 13.0.0.0 上实测; 游戏跑在 Unity Mono 上, `Convert` 语义一致属 C# 规范层面的推断。
3. 只判读档路径, 不判数值是否合理 (hunger 给 1e9 也 PASS)。
4. `--items` 的物品表是第三方产出, 只用于 id 核对; 找不到会降级为跳过并提示 (不影响其它检查)。

## 8. work/verify 文件清单

见 README.md 与同目录结构 (Program.cs / Verify.csproj / run.bat / README.md / REPORT.md / cases/ / out/)。
