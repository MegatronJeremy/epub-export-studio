export type ImageKind = "png" | "jpg" | "gif" | "bmp";

export interface ImageInfo {
  kind: ImageKind;
  width: number;
  height: number;
}

/** Read type and pixel size from PNG / JPEG / GIF / BMP bytes. Returns null if unsupported (e.g. SVG, WebP). */
export function imageInfo(d: Uint8Array): ImageInfo | null {
  if (d.length > 24 && d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    return { kind: "png", width: v.getUint32(16), height: v.getUint32(20) };
  }
  if (d.length > 10 && d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) {
    return { kind: "gif", width: d[6] | (d[7] << 8), height: d[8] | (d[9] << 8) };
  }
  if (d.length > 26 && d[0] === 0x42 && d[1] === 0x4d) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    return { kind: "bmp", width: v.getInt32(18, true), height: Math.abs(v.getInt32(22, true)) };
  }
  if (d.length > 4 && d[0] === 0xff && d[1] === 0xd8) {
    let i = 2;
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = d[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        i += marker === 0xff ? 1 : 2;
        continue;
      }
      const len = (d[i + 2] << 8) | d[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { kind: "jpg", height: (d[i + 5] << 8) | d[i + 6], width: (d[i + 7] << 8) | d[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}
