# save.sv 校验器 (Casualties Unknown)

用游戏自己的类型信息复现 `SaveSystem.TryLoadGame()` 的反射赋值过程, 判定一份 `save.sv` 会不会被游戏正常读进来。
**这是验收工具, 不是给玩家用的。**

## 一条命令

在仓库根目录 (`Casualties_Unknown/`) 执行:

```
dotnet run --project work/verify -- work/verify/cases/a_original.sv
```

或用包装脚本 (任意目录都可):

```
work\verify\run.bat work\verify\cases\b_broken_int_field.sv
```

退出码: 0 = PASS, 1 = FAIL, 2 = 用法/文件错误, 4 = 校验器内部错误 (有 bug)。

## 选项

| 选项 | 作用 |
| --- | --- |
| `--lenient` | 只按游戏**真实行为**判定: `Convert.ChangeType` 不抛异常就放过。int 字段给 47.5 这种会被静默四舍五入的值, 这里算通过 |
| `--strict` | **默认**。在游戏真实行为之上, 把"会被静默改写/会被丢弃"的值也算失败 |
| `--typeinfo` | 打印从 dll 读出的类型表 (Body / Limb / Skills / Limb+ProstheticInfo / SavedItem) 与 int 字段实测, 不需要存档参数 |
| `--items <path>` | 第三方物品表, 默认自动找 `work/data/items.json` (只用于核对 `items[].id`, **不参与类型判断**) |
| `--game <dir>` | 游戏根目录, 默认 `D:\SteamLibrary\steamapps\common\Casualties Unknown` |
| `--report <path>` | 额外把报告写成 UTF-8 文件 |
| `--verbose` | 展开 [信息] 级 (JSON null 变 null) 的无害条目 |

其他子命令:

```
dotnet run --project work/verify -- pack <输入.json> <输出.sv>
```

把 JSON 按**游戏的方式**压成 .sv (gzip + `Encoding.ASCII`, 非 ASCII 字符会被换成 `?`, 与 `SaveSystem.Zip()` 一致)。
输入也可以直接给未压缩的 JSON (`work/save.json`), 校验器按纯 JSON 处理并提示一句。

## 类型真相从哪来

`work/decompile` 只是只读参考。校验器的字段名/类型**全部**由 **Mono.Cecil** 直接从
`<游戏>\CasualtiesUnknown_Data\Managed\Assembly-CSharp.dll` 的元数据读出; `work/data/*.json` 不参与类型判断
(只有 `items[].id` 的成员核对会读那张第三方物品表, 报告里会标注)。

- Cecil 用现成的 `<游戏>\BepInEx\core\Mono.Cecil.dll` (csproj 里 HintPath 直接引用, 不需要 NuGet, 不需要联网)。
- 不需要 Unity 运行时, 不加载 Assembly-CSharp.dll, 只读元数据。
- 读到的字段数写在每次报告头: Body 188 / Limb 44 / Skills 15 / Limb+ProstheticInfo 10 / SavedItem 7。

## 每项检查对应游戏里的哪一步

| 报告分段 | 复现的游戏行为 (work/decompile/SaveSystem.cs) |
| --- | --- |
| [1] gzip | `Unzip(File.ReadAllBytes(...))`; 解压失败 → catch 里 return, 读档直接放弃 |
| [1] ASCII 字节 | `new StreamReader(stream, Encoding.ASCII)`: 任何 >= 0x80 的字节都被换成 '?', 字符串内容被毁 |
| [1] JSON 解析 | `JObject.Parse(Unzip(...))`; 抛异常 → 弹 could not be parsed 并 return |
| [2] 顶层结构 | `jObject["body"/"limbs"/"items"/"itemComponents"]` 缺失会在没有 try 包裹处 NullReference, 或让 `ToObject<SavedItem[]>` 失败后 return |
| [3] body | `typeof(Body).GetField(name)` 取 FieldInfo, 再 `Convert.ChangeType(value, fieldType)`; Skills 类型走 `ToObject<Skills>()` |
| [4] limbs | 同上, 对象是 `body.limbs[i]`; Limb.ProstheticInfo 走 `ToObject` |
| [5] items | `jObject["items"].ToObject<SavedItem[]>()` (失败 → 读档取消); id 找不到 → Resources.Load 失败, 该物品被丢弃 |

严重级别:

- [致命] 读档会中断/崩溃 (gzip/JSON 失败, 结构缺失, items 反序列化失败)
- [不符] 值不会被恢复 / 被静默改写 (strict 下计入 FAIL, --lenient 下放过)
- [提醒] 游戏只弹提示、读档继续 (多余字段, 结构性不可恢复字段, 世界状态键缺失)
- [信息] 无害 (JSON null 变 null), 默认折叠

## 一个重要的实测事实

`Convert.ChangeType(new JValue(47.5), typeof(int))` **不抛异常**, 返回 48 (四舍五入到偶数)。
也就是说 int 字段被填成小数, 游戏**不会报错**, 值会悄悄变成另一个数。同理 bool 字段给 1 会得到 true,
string 字段给数字会得到它的文本形式。所以本工具默认 **strict**: 这类"能读进来但值不对"的编辑错误也算 FAIL;
想只看游戏真实行为就加 --lenient。两边结论都会打印 (见 out/b_broken.txt 与 out/b_broken_lenient.txt)。

## 复现全部用例

```
python work/verify/cases/make_cases.py          # a / b / c 的 JSON
python work/verify/cases/make_more_cases.py     # d / e
python work/verify/cases/make_nonascii_case.py  # f
for f in a_original b_broken_int_field c_edited_ok d_soft_defects; do
  dotnet run --project work/verify -- pack work/verify/cases/$f.json work/verify/cases/$f.sv
done
dotnet run --project work/verify -- work/verify/cases/a_original.sv
dotnet run --project work/verify -- work/verify/cases/b_broken_int_field.sv
dotnet run --project work/verify -- work/verify/cases/c_edited_ok.sv
```

## 已知限制

1. `body.limbs[i]` 指游戏内**实时** body 的 limbs 数组, 离线无法核对"存档第 i 条 limb 对上哪条肢体"; 本工具只校验每条 limb 的字段名与值类型。
2. 转换语义是在 .NET 8 + **游戏自带的** Newtonsoft.Json 13.0.0.0 上实测的 (见 --typeinfo); 游戏跑在 Unity 的 Mono 上, Convert 语义一致属 C# 规范层面的推断。
3. --items 那张表是第三方产出, 只用来核对 id, 不当作类型真相; 找不到它会降级为"跳过 id 核对"并提示。
4. 只做**读档路径**的判定, 不检查数值是否"合理" (hunger 给 1e9 也 PASS)。
