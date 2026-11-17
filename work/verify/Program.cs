using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using Mono.Cecil;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace SaveVerify
{
    enum Sev { Abort, Mismatch, Warn, Info }
    enum Kind { Primitive, Skills, Prosthetic, Enum, StructOther, ArrayRef, ClassRef }

    sealed class FieldDef
    {
        public string Name;
        public string TypeName;
        public Kind Kind;
        public Type Clr;
        public bool Nullable;
    }

    sealed class TypeInfo
    {
        public string Name;
        public readonly List<FieldDef> Fields = new List<FieldDef>();
        public readonly Dictionary<string, FieldDef> Map = new Dictionary<string, FieldDef>();
        public void Add(FieldDef f)
        {
            if (Map.ContainsKey(f.Name)) return;
            Map[f.Name] = f;
            Fields.Add(f);
        }
    }

    sealed class Types
    {
        public TypeInfo Body, Limb, Skills, Prosthetic, SavedItem;
        public string SourceSummary;
    }

    sealed class Issue
    {
        public Sev Sev;
        public string Path;
        public string Reason;
    }

    sealed class Report
    {
        public readonly List<Issue> Issues = new List<Issue>();
        public void Add(Sev s, string path, string reason)
        {
            Issues.Add(new Issue { Sev = s, Path = path, Reason = reason });
        }
        public int Count(Sev s) { return Issues.Count(i => i.Sev == s); }
    }

    sealed class UsageException : Exception { public UsageException(string m) : base(m) { } }

    sealed class Resolver : IAssemblyResolver
    {
        readonly string dir;
        readonly Dictionary<string, AssemblyDefinition> cache = new Dictionary<string, AssemblyDefinition>();
        public Resolver(string dir) { this.dir = dir; }
        public AssemblyDefinition Resolve(AssemblyNameReference name) { return Resolve(name, new ReaderParameters()); }
        public AssemblyDefinition Resolve(AssemblyNameReference name, ReaderParameters p)
        {
            AssemblyDefinition a;
            if (cache.TryGetValue(name.Name, out a)) return a;
            string path = Path.Combine(dir, name.Name + ".dll");
            if (!File.Exists(path)) throw new FileNotFoundException("程序集解析失败, 缺少 " + path);
            a = AssemblyDefinition.ReadAssembly(path, p);
            cache[name.Name] = a;
            return a;
        }
        public void Dispose() { }
    }

    static class Program
    {
        const string DefaultGame = @"D:\SteamLibrary\steamapps\common\Casualties Unknown";
        // System.Nullable + char 0x60 + "1", 避免源码里出现反引号
        static readonly string NullableOpen = "System.Nullable" + (char)0x60 + "1";

        static string GameDir = DefaultGame;
        static bool Strict = true;
        static string ItemsPath;
        static string ReportPath;
        static bool TypeInfoMode;
        static bool Verbose;
        static Types Ts;

        static int Main(string[] args)
        {
            try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
            try { return Run(args); }
            catch (UsageException ue) { Console.Error.WriteLine("错误: " + ue.Message); return 2; }
            catch (Exception e) { Console.Error.WriteLine("校验器内部错误: " + e); return 4; }
        }

        static string Next(string[] a, int i, string flag)
        {
            if (i + 1 >= a.Length) throw new UsageException(flag + " 需要一个参数");
            return a[i + 1];
        }

        static int Run(string[] args)
        {
            var positional = new List<string>();
            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--lenient": Strict = false; break;
                    case "--strict": Strict = true; break;
                    case "--typeinfo": TypeInfoMode = true; break;
                    case "--verbose": Verbose = true; break;
                    case "--items": ItemsPath = Next(args, i++, "--items"); break;
                    case "--game": GameDir = Next(args, i++, "--game"); break;
                    case "--report": ReportPath = Next(args, i++, "--report"); break;
                    case "-h":
                    case "--help": Usage(); return 0;
                    default: positional.Add(args[i]); break;
                }
            }
            if (positional.Count == 0 && !TypeInfoMode) { Usage(); return 2; }
            if (positional.Count > 0 && positional[0] == "pack")
            {
                if (positional.Count < 3) throw new UsageException("pack 用法: dotnet run --project work/verify -- pack <输入.json> <输出.sv>");
                return Pack(positional[1], positional[2]);
            }
            return Verify(positional.Count > 0 ? positional[0] : "(未指定存档, 仅 --typeinfo)");
        }

        static void Usage()
        {
            Console.WriteLine("Casualties Unknown 存档校验器");
            Console.WriteLine();
            Console.WriteLine("  dotnet run --project work/verify -- <存档.sv> [选项]");
            Console.WriteLine();
            Console.WriteLine("选项:");
            Console.WriteLine("  --lenient          只按游戏真实行为判定 (Convert.ChangeType 成功即放过; int 字段给 47.5 会被静默四舍五入)");
            Console.WriteLine("  --strict           默认. 在游戏真实行为之上, 把会被静默改写的值也算失败");
            Console.WriteLine("  --typeinfo         打印从 dll 读出的类型表 (Body/Limb/Skills/ProstheticInfo/SavedItem) 并退出");
            Console.WriteLine("  --verbose          展开 [信息] 级别的无害条目");
            Console.WriteLine("  --items <path>     第三方物品表 JSON, 默认自动找 work/data/items.json (只用于核对 items[].id, 不参与类型判断)");
            Console.WriteLine("  --game <dir>       游戏根目录, 默认 " + DefaultGame);
            Console.WriteLine("  --report <path>    额外把报告写成 UTF-8 文件");
            Console.WriteLine();
            Console.WriteLine("子命令:");
            Console.WriteLine("  pack <输入.json> <输出.sv>   把 JSON 按游戏的方式压成 .sv (gzip + Encoding.ASCII, 非 ASCII 字符变 '?')");
        }

        // ---------- 类型真相: 全部来自 Assembly-CSharp.dll (Mono.Cecil) ----------

        static Types LoadTypes()
        {
            string managed = Path.Combine(GameDir, "CasualtiesUnknown_Data", "Managed");
            string asmPath = Path.Combine(managed, "Assembly-CSharp.dll");
            string cecilPath = Path.Combine(GameDir, "BepInEx", "core", "Mono.Cecil.dll");
            if (!File.Exists(cecilPath))
                throw new UsageException("找不到 Mono.Cecil.dll: " + cecilPath + " (用 --game 指定游戏目录)");
            if (!File.Exists(asmPath))
                throw new UsageException("找不到 Assembly-CSharp.dll: " + asmPath + " (用 --game 指定游戏目录)");

            var rp = new ReaderParameters { AssemblyResolver = new Resolver(managed) };
            AssemblyDefinition asm = AssemblyDefinition.ReadAssembly(asmPath, rp);
            ModuleDefinition mod = asm.MainModule;

            var t = new Types
            {
                Body = BuildType(mod, "Body", "Body"),
                Limb = BuildType(mod, "Limb", "Limb"),
                Skills = BuildType(mod, "Skills", "Skills"),
                Prosthetic = BuildType(mod, "Limb/ProstheticInfo", "Limb+ProstheticInfo"),
                SavedItem = BuildType(mod, "SavedItem", "SavedItem"),
            };
            t.SourceSummary = string.Format(
                "Mono.Cecil 直读 {0} (Assembly-CSharp {1}) — Body {2} / Limb {3} / Skills {4} / Limb+ProstheticInfo {5} / SavedItem {6} 个公有实例字段; Newtonsoft.Json {7}",
                asmPath, asm.Name.Version, t.Body.Fields.Count, t.Limb.Fields.Count, t.Skills.Fields.Count,
                t.Prosthetic.Fields.Count, t.SavedItem.Fields.Count, typeof(JObject).Assembly.GetName().Version);
            return t;
        }

        static TypeInfo BuildType(ModuleDefinition mod, string cecilName, string display)
        {
            TypeDefinition td = mod.GetType(cecilName);
            if (td == null) throw new UsageException("Assembly-CSharp.dll 里找不到类型 " + cecilName);
            var info = new TypeInfo { Name = display };
            var chain = new Stack<TypeDefinition>();
            for (TypeDefinition cur = td; cur != null; cur = SafeResolve(cur.BaseType)) chain.Push(cur);
            while (chain.Count > 0)     // 基类先入, 派生类覆盖 (与 Type.GetField 的查找顺序一致)
            {
                TypeDefinition cur = chain.Pop();
                foreach (FieldDefinition f in cur.Fields.Where(x => x.IsPublic && !x.IsStatic)) info.Add(MakeField(f));
            }
            return info;
        }

        static TypeDefinition SafeResolve(TypeReference tr)
        {
            if (tr == null) return null;
            try { return tr.Resolve(); } catch { return null; }
        }

        static FieldDef MakeField(FieldDefinition f)
        {
            var fd = new FieldDef { Name = f.Name, TypeName = f.FieldType.FullName };
            TypeReference tr = f.FieldType;
            var git = tr as GenericInstanceType;
            if (git != null && git.ElementType.FullName == NullableOpen && git.GenericArguments.Count == 1)
            {
                fd.Nullable = true;
                tr = git.GenericArguments[0];
            }
            Classify(fd, tr);
            return fd;
        }

        static void Classify(FieldDef fd, TypeReference tr)
        {
            string n = tr.FullName;
            Type prim = PrimitiveOf(n);
            if (prim != null) { fd.Kind = Kind.Primitive; fd.Clr = prim; return; }
            if (n == "Skills") { fd.Kind = Kind.Skills; return; }
            if (n == "Limb/ProstheticInfo") { fd.Kind = Kind.Prosthetic; return; }
            if (tr is ArrayType) { fd.Kind = Kind.ArrayRef; return; }
            TypeDefinition def = SafeResolve(tr);
            if (def != null && def.IsEnum) { fd.Kind = Kind.Enum; return; }
            if (def != null && def.IsValueType) { fd.Kind = Kind.StructOther; return; }
            fd.Kind = Kind.ClassRef;
        }

        static Type PrimitiveOf(string n)
        {
            switch (n)
            {
                case "System.Boolean": return typeof(bool);
                case "System.Int32": return typeof(int);
                case "System.Int64": return typeof(long);
                case "System.Int16": return typeof(short);
                case "System.UInt32": return typeof(uint);
                case "System.UInt64": return typeof(ulong);
                case "System.Byte": return typeof(byte);
                case "System.SByte": return typeof(sbyte);
                case "System.Single": return typeof(float);
                case "System.Double": return typeof(double);
                case "System.Decimal": return typeof(decimal);
                case "System.String": return typeof(string);
                case "System.Char": return typeof(char);
                default: return null;
            }
        }

        // ---------- 子命令: pack ----------

        static int Pack(string inJson, string outSv)
        {
            string text = File.ReadAllText(inJson, Encoding.UTF8);
            byte[] ascii = Encoding.ASCII.GetBytes(text);
            int replaced = text.Count(c => c > 0x7F);
            using (var ms = new MemoryStream())
            {
                using (var gz = new GZipStream(ms, CompressionLevel.Optimal, true))
                {
                    gz.Write(ascii, 0, ascii.Length);
                }
                byte[] packed = ms.ToArray();
                File.WriteAllBytes(outSv, packed);
                Console.WriteLine("已打包 " + inJson + " -> " + outSv);
                Console.WriteLine("  JSON 字符 " + text.Length + " / 写入字节 " + ascii.Length + " / gzip 后 " + packed.Length + " 字节");
                if (replaced > 0)
                    Console.WriteLine("  [提] 有 " + replaced + " 个非 ASCII 字符被 Encoding.ASCII 换成 '?' (与游戏 SaveSystem.Zip 行为一致)");
            }
            return 0;
        }

        // ---------- 主校验 ----------

        static int Verify(string savePath)
        {
            Ts = LoadTypes();
            if (TypeInfoMode) { DumpTypes(); return 0; }

            var sb = new StringBuilder();
            TextWriter w = new StringWriter(sb);
            var rep = new Report();

            w.WriteLine("=== Casualties Unknown 存档校验器 ===");
            w.WriteLine("输入    : " + Path.GetFullPath(savePath));
            w.WriteLine("模式    : " + (Strict ? "strict (默认: 静默改写也算失败)" : "lenient (只按游戏真实行为)"));
            w.WriteLine("类型真相: " + Ts.SourceSummary);
            w.WriteLine();

            byte[] fileBytes;
            try { fileBytes = File.ReadAllBytes(savePath); }
            catch (Exception e) { throw new UsageException("读不到存档文件: " + e.Message); }
            string text = null;

            w.WriteLine("[1] 容器层 (文件 " + fileBytes.Length + " 字节)");
            w.WriteLine("  类型指纹: Body " + Ts.Body.Fields.Count + " 字段 (int " + CountOf(Ts.Body, typeof(int)) + " / float " + CountOf(Ts.Body, typeof(float))
                + " / bool " + CountOf(Ts.Body, typeof(bool)) + " / string " + CountOf(Ts.Body, typeof(string))
                + " / Skills " + Ts.Body.Fields.Count(f => f.Kind == Kind.Skills) + ")");
            int mark = 0;
            bool gz = fileBytes.Length > 2 && fileBytes[0] == 0x1F && fileBytes[1] == 0x8B;
            byte[] raw = null;
            if (!gz)
            {
                raw = fileBytes;
                Line(w, "-", "gzip       : 输入没有 gzip 魔数 1F 8B, 按未压缩 JSON 校验 (游戏只写 gzip; 这样可以直接校验 work/save.json)");
            }
            else
            {
                try
                {
                    using (var ms = new MemoryStream(fileBytes))
                    using (var gzs = new GZipStream(ms, CompressionMode.Decompress))
                    using (var outMs = new MemoryStream())
                    {
                        gzs.CopyTo(outMs);
                        raw = outMs.ToArray();
                    }
                    Line(w, "OK", "gzip       : 解压成功 -> " + raw.Length + " 字节");
                }
                catch (Exception e)
                {
                    rep.Add(Sev.Abort, "<file>", "gzip 解压失败: " + e.GetType().Name + ": " + e.Message + " — 游戏 TryLoadGame 在这里就 return, 存档完全读不进来");
                    Line(w, "FAIL", "gzip       : 解压失败");
                }
            }
            if (raw != null)
            {
                var badOffsets = new List<int>();
                int badCount = 0;
                for (int i = 0; i < raw.Length; i++) if (raw[i] >= 0x80) { badCount++; if (badOffsets.Count < 5) badOffsets.Add(i); }
                if (badCount == 0)
                    Line(w, "OK", "ASCII 字节 : 全部 < 0x80 (0 个非 ASCII 字节) — 游戏 Unzip 用 Encoding.ASCII, 不会被毁");
                else
                {
                    Line(w, "WARN", "ASCII 字节 : " + badCount + " 个字节 >= 0x80 (首个偏移 " + string.Join(", ", badOffsets) + ")");
                    rep.Add(Sev.Warn, "<file>", badCount + " 个非 ASCII 字节: 游戏 Unzip 用 new StreamReader(stream, Encoding.ASCII) 解码, 这些字节会被换成 '?', 字符串内容被毁 (读档一般不中断, 但文字会变成问号)");
                }
                text = Encoding.ASCII.GetString(raw);
                try
                {
                    JObject root = JObject.Parse(text);
                    Line(w, "OK", "JSON 解析  : 成功 (Newtonsoft " + typeof(JObject).Assembly.GetName().Version + ")");
                    PrintIssues(w, rep, mark);
                    w.WriteLine();
                    return RunChecks(w, rep, root, savePath);
                }
                catch (Exception e)
                {
                    rep.Add(Sev.Abort, "<file>", "JObject.Parse 失败: " + e.GetType().Name + ": " + e.Message + " — 游戏在这里 return, 存档读不进来");
                    Line(w, "FAIL", "JSON 解析  : 失败");
                }
            }
            PrintIssues(w, rep, mark);
            return Finish(w, rep, savePath);
        }

        static int CountOf(TypeInfo ti, Type t)
        {
            int n = 0;
            foreach (var f in ti.Fields) if (f.Clr == t) n++;
            return n;
        }

        static int RunChecks(TextWriter w, Report rep, JObject root, string savePath)
        {
            w.WriteLine("[2] 顶层结构");
            int mark = rep.Issues.Count;

            JObject bodyObj = root["body"] as JObject;
            if (bodyObj == null) rep.Add(Sev.Abort, "body", "缺少 body 或不是 JSON 对象 — jObject[\"body\"].Children<JProperty>() 会 NullReferenceException, 读档直接崩");
            else Line(w, "OK", "body            : " + bodyObj.Count + " 个键");

            var limbsArr = root["limbs"] as JArray;
            if (limbsArr == null) rep.Add(Sev.Abort, "limbs", "缺少 limbs 或不是 JSON 数组 — jObject[\"limbs\"].Children<JObject>() 会 NullReferenceException, 读档直接崩");
            else Line(w, "OK", "limbs           : " + limbsArr.Count + " 条");

            var itemsArr = root["items"] as JArray;
            if (itemsArr == null) rep.Add(Sev.Abort, "items", "缺少 items 或不是数组 — ToObject<SavedItem[]>() 失败后游戏 return, 读档取消");
            else Line(w, "OK", "items           : " + itemsArr.Count + " 条");

            var icArr = root["itemComponents"] as JArray;
            if (icArr == null) rep.Add(Sev.Abort, "itemComponents", "缺少 itemComponents 或不是数组 — jObject[\"itemComponents\"][num] 会抛异常且没有 try 包裹, 读档崩");
            else if (itemsArr != null && icArr.Count != itemsArr.Count)
                rep.Add(Sev.Abort, "itemComponents", "长度 " + icArr.Count + " 与 items 的 " + itemsArr.Count + " 不一致 — 索引越界, 读档崩");
            else Line(w, "OK", "itemComponents  : " + icArr.Count + " 条 (与 items 一致)");

            var bcObj = root["bodyComponents"] as JObject;
            if (bcObj == null) rep.Add(Sev.Warn, "bodyComponents", "缺少 bodyComponents — 触发 \"Error occured during applying player components\" 提示, 读档继续");
            else Line(w, "OK", "bodyComponents  : " + bcObj.Count + " 个键");

            var lcArr = root["limbComponents"] as JArray;
            if (lcArr == null) rep.Add(Sev.Warn, "limbComponents", "缺少 limbComponents — 触发 \"Error occured during applying player components\" 提示, 读档继续");
            else if (limbsArr != null && lcArr.Count != limbsArr.Count)
                rep.Add(Sev.Warn, "limbComponents", "长度 " + lcArr.Count + " 与 limbs 的 " + limbsArr.Count + " 不一致 — 只弹提示, 读档继续");
            else Line(w, "OK", "limbComponents  : " + lcArr.Count + " 条 (与 limbs 一致)");

            string[] worldKeys = {
                "biome", "totalTraveled", "lootRarity", "trapRarity", "runSettings", "caloriesConsumed", "runTime",
                "cHeight", "cAge", "cId", "cVer", "lastHappiness", "savedRecipeData", "endlessLoops", "isMercRun", "cheatedSave"
            };
            var missingWorld = worldKeys.Where(k => root[k] == null || root[k].Type == JTokenType.Null).ToList();
            if (missingWorld.Count == 0) Line(w, "OK", "世界状态键      : 16 个齐全 (SaveSystem.cs:415-450)");
            else
            {
                Line(w, "WARN", "世界状态键      : 缺 " + string.Join(", ", missingWorld));
                rep.Add(Sev.Warn, "<root>", "缺少世界状态键 " + string.Join(", ", missingWorld) + " — 触发 \"Error occured during applying world state\" 提示, 读档继续 (SaveSystem.cs:415-450)");
            }
            PrintIssues(w, rep, mark);
            w.WriteLine();

            mark = rep.Issues.Count;
            w.WriteLine("[3] body 字段 (dll 里 Body 共 " + Ts.Body.Fields.Count + " 个公有实例字段, 存档里有 " + (bodyObj == null ? 0 : bodyObj.Count) + " 个键)");
            if (bodyObj != null)
            {
                foreach (JProperty p in bodyObj.Properties()) CheckMember(Ts.Body, p, "body", rep, Sev.Mismatch);
                Line(w, "i", "已逐键核对 " + bodyObj.Count + " 个键: 字段存在性 + Convert.ChangeType; Skills 走 ToObject<Skills>()");
            }
            PrintIssues(w, rep, mark);
            w.WriteLine();

            mark = rep.Issues.Count;
            w.WriteLine("[4] limbs 字段 (dll 里 Limb 共 " + Ts.Limb.Fields.Count + " 个公有实例字段)");
            if (limbsArr != null)
            {
                for (int i = 0; i < limbsArr.Count; i++)
                {
                    var lim = limbsArr[i] as JObject;
                    if (lim == null)
                    {
                        rep.Add(Sev.Abort, "limbs[" + i + "]", "不是 JSON 对象 — Children<JObject>() 拿不到这一项, 这条 limb 的赋值被跳过");
                        continue;
                    }
                    foreach (JProperty p in lim.Properties()) CheckMember(Ts.Limb, p, "limbs[" + i + "]", rep, Sev.Mismatch);
                }
                Line(w, "i", "已逐条核对 " + limbsArr.Count + " 条 limb; Limb+ProstheticInfo 走 ToObject");
            }
            PrintIssues(w, rep, mark);
            w.WriteLine();

            mark = rep.Issues.Count;
            w.WriteLine("[5] items");
            HashSet<string> idSet = LoadItemIds();
            if (itemsArr != null)
            {
                for (int i = 0; i < itemsArr.Count; i++)
                {
                    var it = itemsArr[i] as JObject;
                    if (it == null)
                    {
                        rep.Add(Sev.Abort, "items[" + i + "]", "不是 JSON 对象 — ToObject<SavedItem[]>() 整体失败, 游戏 return, 读档取消");
                        continue;
                    }
                    foreach (JProperty p in it.Properties()) CheckMember(Ts.SavedItem, p, "items[" + i + "]", rep, Sev.Abort);
                    JToken idTok = it["id"];
                    string id = (idTok == null || idTok.Type == JTokenType.Null) ? null : idTok.ToString();
                    if (id == null) rep.Add(Sev.Abort, "items[" + i + "].id", "id 缺失 — Resources.Load 拿不到预制体, 该物品被丢弃");
                    else if (idSet != null && !idSet.Contains(id))
                        rep.Add(Sev.Mismatch, "items[" + i + "].id", "物品 id \"" + id + "\" 不在物品表 (" + idSet.Count + " 条) 内: Resources.Load 找不到, 该物品被丢弃 (读档继续) [物品表是第三方数据, 仅供核对]");
                }
                Line(w, "i", "已核对 " + itemsArr.Count + " 条 item: id 是否在物品表 + condition/slot/wearSlot/favourited/label/swatch 的类型 (SavedItem 定义取自 dll)");
            }
            PrintIssues(w, rep, mark);
            w.WriteLine();

            return Finish(w, rep, savePath);
        }

        static HashSet<string> LoadItemIds()
        {
            string p = ItemsPath;
            if (p == null)
            {
                string[] candidates = {
                    Path.Combine("work", "data", "items.json"),
                    Path.Combine("data", "items.json")
                };
                p = candidates.FirstOrDefault(File.Exists);
            }
            if (p == null || !File.Exists(p))
            {
                Console.Error.WriteLine("[提] 找不到物品表 (work/data/items.json), 跳过 items[].id 核对");
                return null;
            }
            try
            {
                JObject root = JObject.Parse(File.ReadAllText(p, Encoding.UTF8).TrimStart((char)0xFEFF));
                var set = new HashSet<string>(StringComparer.Ordinal);
                var arr = root["items"] as JArray;
                if (arr != null) foreach (JToken t in arr) { string id = (string)t["id"]; if (id != null) set.Add(id); }
                return set;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("[提] 物品表读取失败 (" + e.Message + "), 跳过 items[].id 核对");
                return null;
            }
        }

        static void CheckMember(TypeInfo ti, JProperty p, string pathPrefix, Report rep, Sev failSev)
        {
            string path = pathPrefix + "." + p.Name;
            FieldDef fd;
            if (!ti.Map.TryGetValue(p.Name, out fd))
            {
                rep.Add(Sev.Warn, path, "字段不存在于 " + ti.Name + " (GetField 返回 null) — 游戏弹 \"such field does not exist\" 提示并跳过该键, 读档继续");
                return;
            }
            CheckValue(fd, p.Value, path, rep, failSev);
        }

        static void CheckValue(FieldDef fd, JToken tok, string path, Report rep, Sev failSev)
        {
            if (fd.Kind == Kind.Skills) { CheckNested(Ts.Skills, tok, path, rep, failSev, "ToObject<Skills>()"); return; }
            if (fd.Kind == Kind.Prosthetic) { CheckNested(Ts.Prosthetic, tok, path, rep, failSev, "ToObject<Limb.ProstheticInfo>()"); return; }

            if (fd.Kind == Kind.Primitive)
            {
                if (tok.Type == JTokenType.Null)
                {
                    if (!fd.Clr.IsValueType)
                    {
                        rep.Add(Sev.Info, path, "类型 " + fd.TypeName + " ← JSON null: Convert.ChangeType 得到 null, 与游戏一致");
                        return;
                    }
                    rep.Add(failSev, path, "类型 " + fd.TypeName + " ← JSON null: Convert.ChangeType 抛 ArgumentException (Can not convert Null to " + fd.Clr.Name + "), 该字段值不恢复");
                    return;
                }
                try
                {
                    object v = Convert.ChangeType(tok, fd.Clr);
                    string lossy = LossyNote(fd, tok, v);
                    if (lossy != null)
                        rep.Add(Sev.Mismatch, path, "类型 " + fd.TypeName + " ← JSON " + Describe(tok) + ": Convert.ChangeType 成功但值被静默改写 — " + lossy);
                }
                catch (Exception e)
                {
                    rep.Add(failSev, path, "类型 " + fd.TypeName + " ← JSON " + Describe(tok) + ": Convert.ChangeType 抛 " + e.GetType().Name + ": " + e.Message);
                }
                return;
            }

            bool tokNull = tok == null || tok.Type == JTokenType.Null;
            bool refLike = fd.Kind == Kind.ArrayRef || fd.Kind == Kind.ClassRef || fd.Nullable;
            if (tokNull && refLike)
            {
                rep.Add(Sev.Info, path, "类型 " + fd.TypeName + " ← JSON null: 赋 null, 与游戏一致");
                return;
            }
            rep.Add(Sev.Warn, path, "类型 " + fd.TypeName + " 无法由 Convert.ChangeType 赋值 (JSON " + Describe(tok) + ") — 这是游戏自身的字段类型限制 (该字段本来就不从存档恢复), 任何存档都一样, 读档继续");
        }

        static void CheckNested(TypeInfo ti, JToken tok, string path, Report rep, Sev failSev, string how)
        {
            if (tok == null || tok.Type == JTokenType.Null)
            {
                rep.Add(Sev.Info, path, "JSON null → " + how + " 得到默认值, 与游戏一致");
                return;
            }
            var obj = tok as JObject;
            if (obj == null)
            {
                rep.Add(failSev, path, "JSON " + Describe(tok) + " 不是对象 — " + how + " 会抛异常, 该字段整块不恢复");
                return;
            }
            foreach (JProperty p in obj.Properties())
            {
                string sub = path + "." + p.Name;
                FieldDef fd;
                if (!ti.Map.TryGetValue(p.Name, out fd))
                {
                    rep.Add(Sev.Warn, sub, "字段不存在于 " + ti.Name + " — Json.NET 默认忽略未知成员 (不抛异常), 该值不生效");
                    continue;
                }
                CheckValue(fd, p.Value, sub, rep, failSev);
            }
        }

        static string LossyNote(FieldDef fd, JToken tok, object converted)
        {
            Type t = fd.Clr;
            bool integral = t == typeof(int) || t == typeof(long) || t == typeof(short) || t == typeof(uint) || t == typeof(byte) || t == typeof(ulong);
            if (integral && tok.Type == JTokenType.Float)
            {
                double d = tok.Value<double>();
                if (d != Math.Truncate(d))
                    return "小数 " + tok.ToString(Formatting.None) + " 被四舍五入成整数 " + converted + " (游戏不报错, 值就变成另一个数)";
                return null;
            }
            if (integral && tok.Type == JTokenType.Boolean)
                return "JSON true/false 被当成 1/0 (" + converted + ")";
            if (t == typeof(bool) && (tok.Type == JTokenType.Integer || tok.Type == JTokenType.Float))
                return "数值 " + tok.ToString(Formatting.None) + " 被当成 bool (" + converted + "; 0=false, 非 0=true)";
            return null;
        }

        static string Describe(JToken t)
        {
            if (t == null) return "<null>";
            switch (t.Type)
            {
                case JTokenType.Null: return "null";
                case JTokenType.Integer: return "整数 " + t.ToString(Formatting.None);
                case JTokenType.Float: return "小数 " + t.ToString(Formatting.None);
                case JTokenType.String: return "字符串 " + Trunc(t.ToString(Formatting.None));
                case JTokenType.Boolean: return "布尔 " + t.ToString(Formatting.None);
                case JTokenType.Object: return "对象 {...}";
                case JTokenType.Array: return "数组 [...]";
                default: return t.Type + " " + Trunc(t.ToString(Formatting.None));
            }
        }

        static string Trunc(string s)
        {
            if (s == null) return "<null>";
            return s.Length <= 60 ? s : s.Substring(0, 57) + "...";
        }

        static void Line(TextWriter w, string status, string msg)
        {
            w.WriteLine("  " + status.PadRight(4) + " " + msg);
        }

        static void PrintIssues(TextWriter w, Report rep, int from)
        {
            int infoCount = 0;
            for (int i = from; i < rep.Issues.Count; i++)
            {
                Issue it = rep.Issues[i];
                if (it.Sev == Sev.Info && !Verbose) { infoCount++; continue; }
                string tag;
                switch (it.Sev)
                {
                    case Sev.Abort: tag = "[致命]"; break;
                    case Sev.Mismatch: tag = "[不符]"; break;
                    case Sev.Warn: tag = "[提醒]"; break;
                    default: tag = "[信息]"; break;
                }
                w.WriteLine("  " + tag + " " + it.Path + "  " + it.Reason);
            }
            if (infoCount > 0)
                w.WriteLine("  [信息] 另有 " + infoCount + " 条 JSON-null 变 null/默认值的无害条目 (加 --verbose 展开)");
        }

        static int Finish(TextWriter w, Report rep, string savePath)
        {
            int abort = rep.Count(Sev.Abort);
            int mismatch = rep.Count(Sev.Mismatch);
            int warn = rep.Count(Sev.Warn);
            int blocking = abort + (Strict ? mismatch : 0);

            w.WriteLine("=== 汇总 ===");
            w.WriteLine("  读档中断/直接崩溃      : " + abort);
            w.WriteLine("  值不恢复或被静默改写   : " + mismatch + (Strict ? "  (strict 计入失败; --lenient 下放过)" : "  (lenient 下放过)"));
            w.WriteLine("  其它提醒(不影响读档)   : " + warn);
            w.WriteLine();
            if (blocking == 0)
            {
                w.WriteLine("结果: PASS");
                if (mismatch > 0) w.WriteLine("  (lenient 视角) 这 " + mismatch + " 项游戏确实能读进来, 但值会变/物品会被丢弃");
            }
            else
            {
                w.WriteLine("结果: FAIL(" + blocking + " 个致命问题)");
            }
            string text = w.ToString();
            Console.Write(text);
            if (ReportPath != null)
            {
                try
                {
                    File.WriteAllText(ReportPath, text, new UTF8Encoding(false));
                    Console.WriteLine("报告已写入 " + ReportPath);
                }
                catch (Exception e) { Console.Error.WriteLine("[提] 报告写入失败: " + e.Message); }
            }
            return blocking == 0 ? 0 : 1;
        }

        // ---------- --typeinfo ----------

        static void DumpTypes()
        {
            Console.WriteLine("类型真相来源: " + Ts.SourceSummary);
            Console.WriteLine();
            DumpOne(Ts.Body);
            DumpOne(Ts.Limb);
            DumpOne(Ts.Skills);
            DumpOne(Ts.Prosthetic);
            DumpOne(Ts.SavedItem);

            Console.WriteLine("=== Body 字段类型分布 ===");
            foreach (var g in Ts.Body.Fields.GroupBy(f => f.TypeName).OrderByDescending(g => g.Count()))
                Console.WriteLine("  " + g.Key.PadRight(46) + " " + g.Count());
            Console.WriteLine();
            Console.WriteLine("=== Body 的 int 字段 (" + CountOf(Ts.Body, typeof(int)) + " 个) ===");
            var ints = Ts.Body.Fields.Where(f => f.Clr == typeof(int)).ToList();
            foreach (var f in ints) Console.WriteLine("  int " + f.Name + "   (Cecil 类型 " + f.TypeName + ")");
            Console.WriteLine();
            Console.WriteLine("=== int 字段的 Convert.ChangeType 实测 ===");
            foreach (var f in ints.Take(3))
            {
                try
                {
                    object ok = Convert.ChangeType(new JValue(7), typeof(int));
                    object bad = Convert.ChangeType(new JValue(7.5), typeof(int));
                    Console.WriteLine("  " + f.Name + ": Convert.ChangeType(整数 7) = " + ok + " (" + ok.GetType().Name + ")"
                        + " ; Convert.ChangeType(小数 7.5) = " + bad + " ← 不抛异常, 静默四舍五入");
                }
                catch (Exception e)
                {
                    Console.WriteLine("  " + f.Name + ": " + e.GetType().Name + ": " + e.Message);
                }
            }
        }

        static void DumpOne(TypeInfo ti)
        {
            Console.WriteLine("=== " + ti.Name + " (" + ti.Fields.Count + " 个公有实例字段, 含基类) ===");
            foreach (var f in ti.Fields)
                Console.WriteLine("  " + (f.TypeName + " ").PadRight(44) + f.Name + "   [" + f.Kind + (f.Nullable ? ",Nullable" : "") + "]");
            Console.WriteLine();
        }
    }
}
