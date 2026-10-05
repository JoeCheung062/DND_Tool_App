export type GifFrame = {
  delayMs: number;
  rgba: Uint8ClampedArray;
};

export type GifAnimation = {
  width: number;
  height: number;
  frames: GifFrame[];
};

function u16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function lzwDecode(minCodeSize: number, data: Uint8Array) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const dict: number[][] = [];
  for (let i = 0; i < clearCode; i += 1) dict[i] = [i];

  let bitBuf = 0;
  let bitCount = 0;
  let pos = 0;
  const out: number[] = [];
  let prev: number[] | null = null;

  const readCode = () => {
    while (bitCount < codeSize) {
      if (pos >= data.length) return -1;
      bitBuf |= data[pos] << bitCount;
      bitCount += 8;
      pos += 1;
    }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize;
    bitCount -= codeSize;
    return code;
  };

  while (true) {
    const code = readCode();
    if (code < 0 || code === eoiCode) break;
    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      nextCode = eoiCode + 1;
      prev = null;
      continue;
    }
    let entry: number[] | undefined;
    if (code < nextCode) entry = dict[code];
    else if (code === nextCode && prev) entry = prev.concat(prev[0]);
    if (!entry) break;
    out.push(...entry);
    if (prev && nextCode < 4096) {
      dict[nextCode] = prev.concat(entry[0]);
      nextCode += 1;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize += 1;
    }
    prev = entry;
  }
  return out;
}

/** Decode a GIF, including GIF87a files that carry a transparent color index. */
export function decodeGif(bytes: Uint8Array): GifAnimation {
  if (bytes.length < 13 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
    throw new Error("Not a GIF");
  }
  const width = u16(bytes, 6);
  const height = u16(bytes, 8);
  const packed = bytes[10];
  const backgroundIndex = bytes[11];
  const gctFlag = (packed & 0x80) !== 0;
  const gctSize = gctFlag ? 2 ** ((packed & 7) + 1) : 0;
  let offset = 13;
  const globalTable = gctFlag ? bytes.subarray(offset, offset + gctSize * 3) : null;
  offset += gctSize * 3;

  const canvas = new Uint8ClampedArray(width * height * 4);
  const frames: GifFrame[] = [];
  let transparentIndex = -1;
  let delayMs = 100;
  let disposal = 0;

  const colorAt = (table: Uint8Array | null, index: number) => {
    const source = table ?? globalTable;
    if (!source || index * 3 + 2 >= source.length) return [0, 0, 0];
    return [source[index * 3], source[index * 3 + 1], source[index * 3 + 2]];
  };

  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      const label = bytes[offset + 1];
      offset += 2;
      if (label === 0xf9 && bytes[offset] === 4) {
        const flags = bytes[offset + 1];
        delayMs = Math.max(20, u16(bytes, offset + 2) * 10 || 100);
        disposal = (flags >> 2) & 7;
        transparentIndex = flags & 1 ? bytes[offset + 4] : -1;
      }
      while (offset < bytes.length) {
        const size = bytes[offset];
        offset += 1 + size;
        if (size === 0) break;
      }
      continue;
    }
    if (marker !== 0x2c) {
      offset += 1;
      continue;
    }
    const left = u16(bytes, offset + 1);
    const top = u16(bytes, offset + 3);
    const frameWidth = u16(bytes, offset + 5);
    const frameHeight = u16(bytes, offset + 7);
    const imagePacked = bytes[offset + 9];
    offset += 10;
    const localFlag = (imagePacked & 0x80) !== 0;
    const localSize = localFlag ? 2 ** ((imagePacked & 7) + 1) : 0;
    const localTable = localFlag ? bytes.subarray(offset, offset + localSize * 3) : null;
    offset += localSize * 3;
    const minCodeSize = bytes[offset];
    offset += 1;
    const blocks: number[] = [];
    while (offset < bytes.length) {
      const size = bytes[offset];
      offset += 1;
      if (size === 0) break;
      blocks.push(...bytes.subarray(offset, offset + size));
      offset += size;
    }
    const indexes = lzwDecode(minCodeSize, Uint8Array.from(blocks));
    const snapshot = disposal === 3 ? canvas.slice() : null;
    let pixel = 0;
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const index = indexes[pixel] ?? 0;
        pixel += 1;
        const dx = left + x;
        const dy = top + y;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const dest = (dy * width + dx) * 4;
        if (transparentIndex >= 0 && index === transparentIndex) continue;
        const [r, g, b] = colorAt(localTable, index);
        canvas[dest] = r;
        canvas[dest + 1] = g;
        canvas[dest + 2] = b;
        canvas[dest + 3] = 255;
      }
    }
    frames.push({ delayMs, rgba: canvas.slice() });
    if (disposal === 2) {
      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const dx = left + x;
          const dy = top + y;
          if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
          const dest = (dy * width + dx) * 4;
          const [r, g, b] = colorAt(globalTable, backgroundIndex);
          const clearToTransparent = transparentIndex >= 0;
          canvas[dest] = clearToTransparent ? 0 : r;
          canvas[dest + 1] = clearToTransparent ? 0 : g;
          canvas[dest + 2] = clearToTransparent ? 0 : b;
          canvas[dest + 3] = clearToTransparent ? 0 : 255;
        }
      }
    } else if (disposal === 3 && snapshot) {
      canvas.set(snapshot);
    }
    transparentIndex = -1;
    disposal = 0;
    delayMs = 100;
  }

  if (frames.length === 0) throw new Error("GIF has no frames");
  return { width, height, frames };
}
