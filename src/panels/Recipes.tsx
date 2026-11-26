import {useMemo, useState} from 'react';
import type {SVGProps} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Table, TableHeader, TableBody, TableRow, TableCell, TableHeaderCell} from '@astryxdesign/core/Table';
import {HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Switch} from '@astryxdesign/core/Switch';
import {Icon} from '@astryxdesign/core/Icon';
import {Center} from '@astryxdesign/core/Center';
import {useToast} from '@astryxdesign/core/Toast';
import {Panel, IconBox} from '../ui/kit';
import {useStore, store} from '../lib/store';
import {DB, itemName, itemIcon, liquidName, liquidColor} from '../lib/data';

/** 液体产物：按数据色值画圆点（颜色来自存档数据表，非设计选色） */
function LiquidDot({id}: {id: string}) {
  const glyph = (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 10 10" aria-hidden="true" {...props}>
      <circle cx="5" cy="5" r="4.5" fill={liquidColor(id)} />
    </svg>
  );
  return <Icon icon={glyph} size="sm" label={'液体 · ' + liquidName(id)} />;
}

function RecipeIcon({m, i}: {m: any; i: number}) {
  if (m.resultId && (m.resultIsLiquid || DB.liquidById[m.resultId])) {
    return <LiquidDot id={m.resultId} />;
  }
  if (m.resultId && itemIcon(m.resultId)) {
    return <IconBox id={m.resultId} />;
  }
  return (
    <Center width={26} height={26}>
      <Text type="supporting" size="2xs">?</Text>
    </Center>
  );
}

export default function RecipesPanel() {
  const st = useStore();
  const showToast = useToast();
  const saved = (st.save && st.save.savedRecipeData && st.save.savedRecipeData.saved) || [];
  const [q, setQ] = useState('');
  const made = saved.filter((x: any) => x.Item1).length;

  const rows = useMemo(() => {
    const kw = q.trim();
    return saved
      .map((e: any, i: number) => ({e, i, m: DB.recipes[i] || {}}))
      .filter(({e, i, m}) => {
        if (!kw) return true;
        const nm = m.resultName || (m.resultId ? itemName(m.resultId) : '#' + i);
        return nm.indexOf(kw) >= 0 || String(i).indexOf(kw) >= 0 || (m.resultId || '').indexOf(kw) >= 0;
      });
  }, [saved, q]);

  const unlockAll = () => {
    store.mutate(s => {
      for (const x of s.savedRecipeData?.saved || []) x.Item1 = true;
    });
    showToast({body: '已把 ' + saved.length + ' 条配方全部标记为已制作'});
  };

  return (
    <Panel title="配方进度" description="这里有游戏的物品解锁进度"
      actions={
        <HStack gap={2} vAlign="center">
          <Text type="supporting" size="sm" textWrap="nowrap">{made} / {saved.length} 已制作</Text>
          <Button label="全部标记已制作" onClick={unlockAll} />
        </HStack>
      }>
      <TextInput type="search" label="搜索产物" isLabelHidden hasClear
        placeholder="搜索产物…" value={q} onChange={setQ} width="100%" />
      <Table density="compact" dividers="rows" hasHover verticalAlign="middle">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>{''}</TableHeaderCell>
            <TableHeaderCell>产物</TableHeaderCell>
            <TableHeaderCell>ID</TableHeaderCell>
            <TableHeaderCell>INT</TableHeaderCell>
            <TableHeaderCell>已制作</TableHeaderCell>
            <TableHeaderCell>{''}</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({e, i, m}) => {
            const nm = m.resultName || (m.resultId ? itemName(m.resultId) : '#' + i);
            return (
              <TableRow key={i}>
                <TableCell><RecipeIcon m={m} i={i} /></TableCell>
                <TableCell>{nm}</TableCell>
                <TableCell><Text type="code" size="sm">{m.resultId || ''}</Text></TableCell>
                <TableCell>
                  <NumberInput label={'INT ' + i} isLabelHidden size="sm" width={96} step={1}
                    value={typeof e.Item2 === 'number' ? e.Item2 : null}
                    onChange={n => store.update(['savedRecipeData', 'saved', i, 'Item2'], Math.trunc(n))} />
                </TableCell>
                <TableCell>
                  <Switch label={nm} isLabelHidden size="sm" value={!!e.Item1}
                    onChange={c => store.update(['savedRecipeData', 'saved', i, 'Item1'], c)} />
                </TableCell>
                <TableCell />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
