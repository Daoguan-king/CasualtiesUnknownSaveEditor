/* 存档编解码：gzip 流 + ASCII 安全 JSON（游戏用 Encoding.ASCII 读写，SaveSystem.cs:458/469） */

export async function gunzip(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  if (typeof DecompressionStream === 'undefined') throw new Error('此浏览器不支持 DecompressionStream，请用 Edge/Chrome 103+');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export async function gzipText(text: string): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') throw new Error('此浏览器不支持 CompressionStream，请用 Edge/Chrome 103+');
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 非 ASCII 字符一律转成 uXXXX 转义，避免回读变 '?' */
export function toAsciiJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/[\u007f-\uffff]/g, c =>
    '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}
