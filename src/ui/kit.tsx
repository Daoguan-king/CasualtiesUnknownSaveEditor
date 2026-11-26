/* 共享原语：面板容器 / 字段行 / 四种输入行 / 图标框。
   页面只用这些 + Astryx 组件拼装，不写颜色、字号、边框。 */
import type {ReactNode} from 'react';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Section} from '@astryxdesign/core/Section';
import {Toolbar} from '@astryxdesign/core/Toolbar';
import {Badge} from '@astryxdesign/core/Badge';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Slider} from '@astryxdesign/core/Slider';
import {Switch} from '@astryxdesign/core/Switch';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Center} from '@astryxdesign/core/Center';
import {Divider} from '@astryxdesign/core/Divider';
import {useStore, store, getPath, isChanged} from '../lib/store';
import {ART, itemIcon, itemName} from '../lib/data';
import type {JsonPath} from '../lib/types';

/** 只在静止显示时收敛小数位（编辑时仍是原始数字），避免长浮点把输入框撑破 */
const fmtVal = (v: number): string => {
  if (!isFinite(v)) return String(v);
  const a = Math.abs(v);
  const p = a >= 1000 ? 100 : a >= 1 ? 1000 : 10000;
  return String(Math.round(v * p) / p);
};

export function Panel({title, count, actions, description, children}: {
  title: string; count?: number | string; actions?: ReactNode; description?: ReactNode; children: ReactNode;
}) {
  return (
    <Section variant="section" padding={4}>
      <VStack gap={3}>
        <Toolbar
          label={title}
          size="md"
          startContent={
            <HStack gap={2} vAlign="center">
              <Heading level={2} textWrap="nowrap">{title}</Heading>
              {count != null ? <Badge variant="neutral" label={String(count)} /> : null}
            </HStack>
          }
          endContent={actions ? <HStack gap={2} vAlign="center">{actions}</HStack> : undefined}
        />
        {description ? <Text type="supporting">{description}</Text> : null}
        {children}
      </VStack>
    </Section>
  );
}

export function Group({title, count, children}: {title: string; count?: number | string; children: ReactNode}) {
  return (
    <VStack gap={2} width="100%">
      <HStack gap={2} vAlign="center" width="max-content">
        <Heading level={3} textWrap="nowrap">{title}</Heading>
        {count != null ? <Text type="supporting" size="sm">{count}</Text> : null}
      </HStack>
      <Divider />
      {children}
    </VStack>
  );
}

/** 一行一个字段：左标签（含已修改圆点）+ 右控件 */
export function FieldRow({label, code, hint, path, controlWidth = 360, children}: {
  label: ReactNode; code?: string; hint?: string; path?: JsonPath; controlWidth?: number; children: ReactNode;
}) {
  const changed = path ? isChanged(path) : false;
  return (
    <HStack gap={3} vAlign="center" width="100%" paddingBlock={0.5}>
      <VStack gap={0} width="100%">
        <HStack gap={1} vAlign="center">
          {changed ? <StatusDot variant="warning" label="已修改" /> : null}
          <Text type="label" maxLines={1}>{label}</Text>
        </HStack>
        {code || hint ? <Text type="code" size="xs" color="secondary" maxLines={1}>{code || hint}</Text> : null}
      </VStack>
      <VStack gap={0} width={controlWidth}>{children}</VStack>
    </HStack>
  );
}

export function NumRow({label, path, min, max, step, int, units, code, hint}: {
  label: string; path: JsonPath; min?: number | null; max?: number | null; step?: number | null;
  int?: boolean; units?: string; code?: string; hint?: string;
}) {
  useStore();
  const v = getPath(path);
  const val = typeof v === 'number' && !isNaN(v) ? v : null;
  return (
    <FieldRow label={label} code={code} hint={hint} path={path}>
      <NumberInput label={label} isLabelHidden size="sm" width="100%" value={val}
        min={min ?? null} max={max ?? null} step={step ?? null}
        isIntegerOnly={int ? true : undefined} units={units ?? null} formatValue={fmtVal}
        onChange={n => store.update(path, int ? Math.round(n) : n)} />
    </FieldRow>
  );
}

export function RangeRow({label, path, min, max, step = 0.01, units, code, hint, int}: {
  label: string; path: JsonPath; min: number; max: number; step?: number; units?: string;
  code?: string; hint?: string; int?: boolean;
}) {
  useStore();
  const v = getPath(path);
  const val = typeof v === 'number' && !isNaN(v) ? v : min;
  const set = (n: number) => store.update(path, int ? Math.round(n) : n);
  return (
    <FieldRow label={label} code={code} hint={hint} path={path} controlWidth={560}>
      <HStack gap={2} vAlign="center" width="100%">
        <VStack width="100%">
          <Slider label={label} isLabelHidden value={val} min={min} max={max} step={step}
            valueDisplay="none" onChange={set} />
        </VStack>
        <NumberInput label={label} isLabelHidden size="sm" width={128} value={val}
          min={min} max={max} step={step} units={units ?? null} formatValue={fmtVal} onChange={set} />
      </HStack>
    </FieldRow>
  );
}

export function BoolRow({label, path, code, hint}: {label: string; path: JsonPath; code?: string; hint?: string}) {
  useStore();
  return (
    <FieldRow label={label} code={code} hint={hint} path={path}>
      <Switch label={label} isLabelHidden size="sm" value={!!getPath(path)} onChange={c => store.update(path, c)} />
    </FieldRow>
  );
}

export function TextRow({label, path, placeholder, code, hint}: {
  label: string; path: JsonPath; placeholder?: string; code?: string; hint?: string;
}) {
  useStore();
  return (
    <FieldRow label={label} code={code} hint={hint} path={path}>
      <TextInput label={label} isLabelHidden size="sm" value={String(getPath(path) ?? '')}
        placeholder={placeholder} onChange={s => store.update(path, s)} />
    </FieldRow>
  );
}

export function SelectRow({label, path, options, numeric, code, hint}: {
  label: string; path: JsonPath; options: {value: string; label: string}[];
  numeric?: boolean; code?: string; hint?: string;
}) {
  useStore();
  const cur = getPath(path);
  return (
    <FieldRow label={label} code={code} hint={hint} path={path}>
      <Selector label={label} isLabelHidden size="sm" width="100%" options={options}
        value={cur == null ? null : String(cur)}
        onChange={v => store.update(path, numeric ? Number(v) : v)} />
    </FieldRow>
  );
}

/** 物品图标：按贴图真实像素整数倍放大，避免最近邻采样吃掉整行像素 */
export function IconBox({id, size = 26}: {id: string; size?: number}) {
  const src = itemIcon(id);
  const dim = ART.iconSize[id];
  let w = size;
  let h = size;
  if (src && dim && dim[0] && dim[1]) {
    const k = Math.max(1, Math.floor(Math.min(size / dim[0], size / dim[1])));
    w = dim[0] * k;
    h = dim[1] * k;
  }
  return (
    <Center width={size} height={size}>
      {src
        ? <img src={src} alt="" width={w} height={h} draggable={false}
            style={{imageRendering: 'pixelated', flex: 'none'}} />
        : <Text type="supporting" size="xs">{itemName(id).slice(0, 1)}</Text>}
    </Center>
  );
}

/** 键值小块：概览/详情用，不是卡片列表 */
export function Stat({label, value, hint}: {label: string; value: ReactNode; hint?: string}) {
  return (
    <VStack gap={0.5}>
      <Text type="supporting" size="xs">{label}</Text>
      <HStack gap={1} vAlign="center">
        <Text type="body" hasTabularNumbers>{value}</Text>
        {hint ? <Text type="supporting" size="xs" color="secondary">{hint}</Text> : null}
      </HStack>
    </VStack>
  );
}
