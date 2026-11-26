import {useDeferredValue, useMemo, useState} from 'react';
import {CodeBlock} from '@astryxdesign/core/CodeBlock';
import {HStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Panel} from '../ui/kit';
import {useStore} from '../lib/store';

/** 与 lib/codec.ts 的 toAsciiJson 同一规则：写盘前非 ASCII 会变成 \uXXXX */
function escapeNonAscii(s: string): string {
  return s.replace(/[\u007f-\uffff]/g, c => '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}

export default function JsonPanel() {
  const st = useStore();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const doc = useMemo(() => {
    if (!st.save) return {code: '', lines: [] as string[]};
    const code = escapeNonAscii(JSON.stringify(st.save, null, 2));
    return {code, lines: code.split('\n')};
  }, [st.save, st.version]);

  const q = deferredQuery.trim();
  const matched = useMemo(() => {
    if (!q) return null;
    const out: number[] = [];
    for (let i = 0; i < doc.lines.length; i++) if (doc.lines[i].includes(q)) out.push(i + 1);
    return out;
  }, [doc.lines, q]);

  if (!st.save) return null;

  return (
    <Panel
      title="原始 JSON"
      count={doc.lines.length + ' 行'}
      description="写盘时所有非 ASCII 字符会转成 \uXXXX（游戏用 Encoding.ASCII 读写）。"
      actions={
        <HStack gap={2} vAlign="center">
          <TextInput
            label="搜索 JSON"
            isLabelHidden
            type="search"
            size="sm"
            width={300}
            placeholder="搜索…"
            hasClear
            startIcon="search"
            value={query}
            onChange={setQuery}
          />
          <Text type="supporting" size="sm" color="secondary" textWrap="nowrap">
            {q ? '命中 ' + (matched?.length ?? 0) + ' 行' : (doc.code.length / 1024).toFixed(1) + ' KB'}
          </Text>
        </HStack>
      }
    >
      <CodeBlock
        code={doc.code}
        title="save.sv"
        language="plaintext"
        hasLanguageLabel={false}
        hasLineNumbers
        startLineNumber={1}
        highlightLines={matched ?? undefined}
        size="sm"
        width="100%"
        maxHeight={760}
      />
    </Panel>
  );
}
