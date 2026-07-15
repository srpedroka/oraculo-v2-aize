export async function encodeBackupPayload(value: string) {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isGzip(value: Uint8Array) {
  return value.byteLength >= 2 && value[0] === 0x1f && value[1] === 0x8b;
}

export async function decodeBackupPayload(value: Uint8Array) {
  if (!isGzip(value)) return new TextDecoder().decode(value);
  const bytes = Uint8Array.from(value);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}
