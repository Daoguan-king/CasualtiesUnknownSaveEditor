'use client';
/* 外壳：侧栏导航 / 顶栏（文件与改动）/ 面板切换 / 读档与写回 / 拖放 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AppShell} from '@astryxdesign/core/AppShell';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Center} from '@astryxdesign/core/Center';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {useToast} from '@astryxdesign/core/Toast';
import {useImperativeAlertDialog} from '@astryxdesign/core/AlertDialog';
import {NAV, PANEL_TITLES} from '../lib/nav';
import type {PanelId} from '../lib/types';
import {store, useStore, changeCount, panelDirty} from '../lib/store';
import {gunzip, gzipText, toAsciiJson} from '../lib/codec';
import {validate} from '../lib/validate';
import {ART} from '../lib/data';
import Overview from '../panels/Overview';
import BodyPanel from '../panels/Body';
import LimbsPanel from '../panels/Limbs';
import SkillsPanel from '../panels/Skills';
import ItemsPanel from '../panels/Items';
import WorldPanel from '../panels/World';
import SettingsPanel from '../panels/Settings';
import RecipesPanel from '../panels/Recipes';
import JsonPanel from '../panels/Json';
import ExportPanel from '../panels/Export';

const PANELS: Record<PanelId, () => JSX.Element> = {
  overview: Overview, body: BodyPanel, limbs: LimbsPanel, skills: SkillsPanel, items: ItemsPanel,
  world: WorldPanel, settings: SettingsPanel, recipes: RecipesPanel, json: JsonPanel, export: ExportPanel
};

const SAVE_HINT = '…\\Orsoniks\\CasualtiesUnknown\\save.sv';

function fromHash(): PanelId {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '');
  return (PANEL_TITLES as Record<string, string>)[h] ? (h as PanelId) : 'overview';
}

export default function App() {
  const st = useStore();
  const [panel, setPanel] = useState<PanelId>('overview');
  const [isDragging, setIsDragging] = useState(false);
  const showToast = useToast();
  const confirm = useImperativeAlertDialog();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    setPanel(fromHash());
    const onHash = () => setPanel(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goto = useCallback((id: PanelId) => {
    setPanel(id);
    if (typeof history !== 'undefined') history.replaceState(null, '', '#' + id);
  }, []);

  const loadBytes = useCallback(async (bytes: Uint8Array, name: string, handle: any) => {
    const text = await gunzip(bytes);
    let json: any;
    try { json = JSON.parse(text); }
    catch (e: any) { throw new Error('gzip 解开了，但内容不是合法 JSON：' + e.message); }
    if (!json.body) throw new Error('这份文件不像 Casualties: Unknown 存档（缺少 body）');
    store.load(json, name || 'save.sv', handle || null);
    /* 用地址栏里的页签（截图探针按 #panel 打开），没有就回概览 */
    goto(fromHash());
    showToast({body: '已载入 ' + (name || 'save.sv') + '（body ' + Object.keys(json.body).length + ' 项 / 物品 ' + (json.items || []).length + ' 件）'});
  }, [goto, showToast]);

  const loadFile = useCallback(async (file: File, handle: any) => {
    try { await loadBytes(new Uint8Array(await file.arrayBuffer()), file.name, handle); }
    catch (e: any) { showToast({body: '载入失败：' + e.message, type: 'error'}); }
  }, [loadBytes, showToast]);

  const openPicker = useCallback(async () => {
    const api = (window as any).showOpenFilePicker;
    if (api) {
      try {
        const [fh] = await api({multiple: false, types: [{description: 'Casualties 存档', accept: {'application/octet-stream': ['.sv', '.sav', '.json']}}]});
        await loadFile(await fh.getFile(), fh);
        return;
      } catch (e: any) {
        if (e && e.name === 'AbortError') return;
      }
    }
    fileInput.current?.click();
  }, [loadFile]);

  /* 浏览器不支持文件句柄时，用隐藏的原生 input 兜底 */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = '.sv,.sav,.json,application/gzip,application/octet-stream';
    el.style.display = 'none';
    el.addEventListener('change', () => {
      const f = el.files && el.files[0];
      if (f) void loadFile(f, null);
      el.value = '';
    });
    document.body.appendChild(el);
    fileInput.current = el;
    return () => { el.remove(); fileInput.current = null; };
  }, [loadFile]);

  /* 像素光标：游戏素材 32×32（浏览器对自定义光标有尺寸上限，超限会整条规则被忽略） */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const cur = ART.user && ART.user.uicursor;
    if (cur) document.body.style.cursor = 'url("' + cur + '") 4 4, auto';
  }, []);

  /* 拖放整窗载入 */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const enter = (e: DragEvent) => { e.preventDefault(); dragDepth.current++; setIsDragging(true); };
    const over = (e: DragEvent) => { e.preventDefault(); };
    const leave = (e: DragEvent) => { e.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setIsDragging(false); } };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void loadFile(f, null);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [loadFile]);

  /* 截图/自检探针：探针页在脚本之前注入一份存档的 base64 */
  useEffect(() => {
    const b64 = (window as any).__PROBE_SV_B64__;
    if (!b64) return;
    try {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      void loadBytes(bytes, 'save.sv', null);
    } catch { /* 探针数据坏了就忽略 */ }
  }, [loadBytes]);

  const write = useCallback(async (asDownload: boolean) => {
    const snapshot = store.get();
    if (!snapshot.save) return;
    try {
      const bytes = await gzipText(toAsciiJson(snapshot.save));
      let written = false;
      if (snapshot.fileHandle && !asDownload) {
        try {
          const sink = await snapshot.fileHandle.createWritable();
          await sink.write(bytes);
          await sink.close();
          written = true;
        } catch (e: any) {
          showToast({body: '覆盖原文件失败：' + e.message + '，改为下载', type: 'error'});
        }
      }
      if (!written) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes as BlobPart], {type: 'application/gzip'}));
        a.download = 'save.sv';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        showToast({body: '已生成 save.sv，请放回存档目录替换原文件'});
      } else {
        showToast({body: '已写回 ' + snapshot.fileName});
      }
      store.commit();
    } catch (e: any) {
      showToast({body: '写入失败：' + e.message, type: 'error'});
    }
  }, [showToast]);

  const doSave = useCallback((asDownload: boolean) => {
    if (!store.get().save) return;
    const v = validate();
    if (v.errs.length) {
      confirm.show({
        title: '发现 ' + v.errs.length + ' 个会破坏存档的错误',
        description: v.errs.slice(0, 6).map(e => '· ' + e.msg).join('\n') + '\n\n仍要写入吗？（不推荐）',
        actionLabel: '仍要写入',
        onAction: () => { confirm.hide(); void write(asDownload); }
      });
      return;
    }
    void write(asDownload);
  }, [confirm, write]);

  const revert = useCallback(() => {
    confirm.show({
      title: '放弃全部改动？',
      description: '将把当前存档恢复到刚载入时的状态。',
      actionLabel: '放弃改动',
      onAction: () => { confirm.hide(); store.revert(); showToast({body: '已恢复到载入时的状态'}); }
    });
  }, [confirm, showToast]);

  const dirty = useMemo(() => {
    const map: Partial<Record<PanelId, boolean>> = {};
    for (const sec of NAV) for (const it of sec.items) map[it.id] = panelDirty(it.id);
    return map;
  }, [st.version]);

  const n = st.save ? changeCount() : 0;
  const Current = PANELS[panel] || Overview;

  return (
    <>
      <AppShell
        contentPadding={0}
        variant="surface"
        banner={isDragging
          ? <Banner status="info" title="松手载入存档" description="支持 .sv / .sav / 解压后的 .json" container="section" />
          : undefined}
        sideNav={
          <SideNav
            header={<SideNavHeading heading="存档修改器" />}
            footer={
              <SideNavSection title="存档路径" isHeaderHidden>
                <VStack gap={1} paddingInline={2} paddingBlock={1}>
                  <Text type="supporting" size="xs" color="secondary" maxLines={1} hasTruncateTooltip>{SAVE_HINT}</Text>
                </VStack>
              </SideNavSection>
            }>
            {NAV.map(sec => (
              <SideNavSection key={sec.title} title={sec.title}>
                {sec.items.map(it => (
                  <SideNavItem
                    key={it.id}
                    label={it.label}
                    icon={it.icon}
                    isSelected={panel === it.id}
                    endContent={dirty[it.id] ? <StatusDot variant="warning" label="有未保存的修改" /> : undefined}
                    onClick={() => goto(it.id)}
                  />
                ))}
              </SideNavSection>
            ))}
          </SideNav>
        }>
        <VStack height="100%" gap={0} width="100%">
          <Toolbar
            label="存档操作"
            dividers={['bottom']}
            startContent={
              <HStack gap={2} vAlign="center">
                <Text type="label">{st.save ? st.fileName : '未载入存档'}</Text>
                {st.save ? <Badge variant={st.fileHandle ? 'success' : 'warning'} label={st.fileHandle ? '可覆盖原文件' : '需另存'} /> : null}
                {st.save ? <Text type="supporting" size="sm" color="secondary">{n ? '已修改 ' + n + ' 处' : '与原文件一致'}</Text> : null}
              </HStack>
            }
            endContent={
              <HStack gap={2} vAlign="center">
                {n ? <Button label="还原改动" variant="ghost" size="sm" onClick={revert} /> : null}
                <Button label="打开存档" size="sm" onClick={() => void openPicker()} />
                <Button label="保存" variant="primary" size="sm" isDisabled={!st.save} onClick={() => doSave(false)} />
              </HStack>
            }
          />
          {st.save ? (
            <VStack isScrollable padding={5} gap={5} width="100%">
              <Current />
            </VStack>
          ) : (
            <Center axis="both" width="100%" height="100%" padding={6}>
              <EmptyState
                title="把 save.sv 拖进窗口"
                description="或点右上角「打开存档」。建议先关掉游戏，并复制一份 save.sv 备份。"
                actions={<Button label="打开存档" variant="primary" onClick={() => void openPicker()} />}
              />
            </Center>
          )}
        </VStack>
      </AppShell>
      {confirm.element}
    </>
  );
}
