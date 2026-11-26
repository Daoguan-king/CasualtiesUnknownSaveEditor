import {useMemo} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {HStack} from '@astryxdesign/core/Stack';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {Table, pixel} from '@astryxdesign/core/Table';
import type {TableColumn} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {Panel, Group} from '../ui/kit';
import {useStore, store, diffAll} from '../lib/store';
import {validate} from '../lib/validate';
import {gzipText, toAsciiJson} from '../lib/codec';

function fmtVal(v: unknown): string {
  if (v === undefined) return '(无)';
  const s = (typeof v === 'object' && v !== null) ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

function sanitizeCell(s: string): string {
  return s.replace(/[\t\n\r]+/g, ' ');
}

type Row = {path: string; from: string; to: string; arrow: string};

const COLUMNS: TableColumn<Row>[] = [
  {key: 'path', header: '路径', renderCell: r => <Text type="code" size="xs">{r.path}</Text>},
  {key: 'from', header: '原值', align: 'end', renderCell: r => <Text size="sm" hasTabularNumbers>{r.from}</Text>},
  {key: 'arrow', header: '→', align: 'center', width: pixel(56), renderCell: r => <Text size="sm">{r.arrow}</Text>},
  {key: 'to', header: '新值', align: 'end', renderCell: r => <Text size="sm" hasTabularNumbers>{r.to}</Text>}
];

export default function ExportPanel() {
  const st = useStore();
  const showToast = useToast();

  const v = useMemo(() => validate(), [st.version]);
  const diffs = useMemo(() => diffAll(st.orig || {}, st.save), [st.orig, st.save, st.version]);

  const rows: Row[] = useMemo(() =>
    diffs.map(d => ({path: d.path, from: fmtVal(d.from), to: fmtVal(d.to), arrow: '→'}))
  , [diffs]);

  const clipboardText = useMemo(() => {
    if (!diffs.length) return '';
    return '路径\t原值\t新值\n' + diffs.map(d => [d.path, sanitizeCell(fmtVal(d.from)), sanitizeCell(fmtVal(d.to))].join('\t')).join('\n');
  }, [diffs]);

  if (!st.save) return null;

  const download = async () => {
    const snap = store.get();
    if (!snap.save) return;
    try {
      const bytes = await gzipText(toAsciiJson(snap.save));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes as BlobPart], {type: 'application/gzip'}));
      a.download = 'save.sv';
      document.body.appendChild(a);
      a.click();
      showToast({body: '已生成 save.sv，请放回存档目录替换原文件'});
    } catch (e: any) {
      showToast({body: '下载失败：' + (e?.message || String(e)), type: 'error'});
    }
  };

  const copy = async () => {
    if (!clipboardText) { showToast({body: '没有改动可复制'}); return; }
    try {
      await navigator.clipboard.writeText(clipboardText);
      showToast({body: '已复制 ' + diffs.length + ' 处改动'});
    } catch {
      showToast({body: '复制失败：浏览器不允许访问剪贴板', type: 'error'});
    }
  };

  return (
    <Panel
      title="校验与导出"
      description={'共 ' + diffs.length + ' 处改动 · ' + v.errs.length + ' 个错误 · ' + v.warns.length + ' 个警告'}
    >
      <Group title="错误" count={v.errs.length + ' 条'}>
        {v.errs.length
          ? <List density="compact" hasDividers>
              {v.errs.map((e, i) => (
                <ListItem key={i} label={<Text size="sm">{e.msg}</Text>}
                  startContent={<StatusDot variant="error" label="错误" />} />
              ))}
            </List>
          : <Text type="supporting">无</Text>}
      </Group>

      <Group title="提醒" count={v.warns.length + ' 条'}>
        {v.warns.length
          ? <List density="compact" hasDividers>
              {v.warns.map((e, i) => (
                <ListItem key={i} label={<Text size="sm">{e.msg}</Text>}
                  startContent={<StatusDot variant="warning" label="提醒" />} />
              ))}
            </List>
          : <Text type="supporting">无</Text>}
      </Group>

      <Group title="改动清单" count={diffs.length + ' 处'}>
        <Table
          data={rows}
          columns={COLUMNS}
          idKey="path"
          density="compact"
          textOverflow="truncate"
          emptyState={<Text type="supporting">没有改动</Text>}
        />
      </Group>

      <Group title="写盘">
        <HStack gap={2} vAlign="center">
          <Button label="下载 save.sv" variant="primary" clickAction={download} />
          <Button label="复制改动清单" onClick={() => void copy()} />
        </HStack>
        <Text type="supporting" size="sm">
          写盘前请确认游戏已关闭。游戏读档成功后会删除 save.sv。本工具不自动备份 —— 请自己先复制一份。
        </Text>
      </Group>
    </Panel>
  );
}
