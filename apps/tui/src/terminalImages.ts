import * as fs from "node:fs/promises";
import path from "node:path";

type RendererLike = {
  capabilities?: {
    kitty_graphics?: boolean;
    sixel?: boolean;
  } | null;
  resolution?: {
    width: number;
    height: number;
  } | null;
  writeOut?: (chunk: string) => void;
};

type TerminalImageAttachment = {
  id?: string;
  name: string;
  mimeType: string;
};

type ImageSize = {
  width: number;
  height: number;
};

export type TerminalImageSupport =
  | {
      supported: true;
      mode: "kitty";
      pixelWidth: number | null;
      pixelHeight: number | null;
    }
  | {
      supported: false;
      mode: "none";
      reason: string;
      pixelWidth: number | null;
      pixelHeight: number | null;
    };

const MIME_EXTENSION_FALLBACK: Record<string, string> = {
  "image/avif": ".avif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/tiff": ".tiff",
  "image/webp": ".webp",
};

function oscEscape(payload: string): string {
  return `\u001b_G${payload}\u001b\\`;
}

function moveCursor(row: number, column: number): string {
  return `\u001b[${Math.max(row, 1)};${Math.max(column, 1)}H`;
}

function resolveAttachmentExtension(attachment: TerminalImageAttachment): string {
  const ext = path.extname(attachment.name).toLowerCase();
  if (ext.length > 0) {
    return ext;
  }
  return MIME_EXTENSION_FALLBACK[attachment.mimeType] ?? ".bin";
}

function sanitizeFileStem(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "image"
  );
}

export function resolveTerminalImageSupport(
  renderer: RendererLike | null | undefined,
): TerminalImageSupport {
  const pixelWidth = renderer?.resolution?.width ?? null;
  const pixelHeight = renderer?.resolution?.height ?? null;
  if (renderer?.capabilities?.kitty_graphics) {
    return {
      supported: true,
      mode: "kitty",
      pixelWidth,
      pixelHeight,
    };
  }
  if (renderer?.capabilities?.sixel) {
    return {
      supported: false,
      mode: "none",
      reason:
        "Sixel is detected, but T1 image preview is only implemented for kitty graphics right now.",
      pixelWidth,
      pixelHeight,
    };
  }
  return {
    supported: false,
    mode: "none",
    reason: "This terminal does not report inline image support.",
    pixelWidth,
    pixelHeight,
  };
}

export function clearTerminalImagePreview(renderer: RendererLike | null | undefined): void {
  renderer?.writeOut?.(oscEscape("a=d,d=A"));
}

function chunkBase64Payload(payload: string, chunkSize = 4096): string[] {
  return payload.length <= chunkSize
    ? [payload]
    : (payload.match(new RegExp(`.{1,${chunkSize}}`, "g")) ?? [payload]);
}

export function renderKittyImagePreview(
  renderer: RendererLike | null | undefined,
  input: {
    filePath: string;
    top: number;
    left: number;
    width: number;
    height: number;
    cellPixelWidth: number;
    cellPixelHeight: number;
  },
): void {
  void renderKittyImagePreviewAsync(renderer, input).catch(() => undefined);
}

function readPngSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 24) return null;
  if (bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readGifSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 10) return null;
  const header = bytes.toString("ascii", 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  return {
    width: bytes.readUInt16LE(6),
    height: bytes.readUInt16LE(8),
  };
}

function readJpegSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (
      marker === 0xc0 ||
      marker === 0xc1 ||
      marker === 0xc2 ||
      marker === 0xc3 ||
      marker === 0xc5 ||
      marker === 0xc6 ||
      marker === 0xc7 ||
      marker === 0xc9 ||
      marker === 0xca ||
      marker === 0xcb ||
      marker === 0xcd ||
      marker === 0xce ||
      marker === 0xcf
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpSize(bytes: Buffer): ImageSize | null {
  if (bytes.length < 30) return null;
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const chunkType = bytes.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  return null;
}

function readImageSize(bytes: Buffer): ImageSize | null {
  return readPngSize(bytes) ?? readJpegSize(bytes) ?? readGifSize(bytes) ?? readWebpSize(bytes);
}

async function renderKittyImagePreviewAsync(
  renderer: RendererLike | null | undefined,
  input: {
    filePath: string;
    top: number;
    left: number;
    width: number;
    height: number;
    cellPixelWidth: number;
    cellPixelHeight: number;
  },
): Promise<void> {
  if (!renderer?.writeOut || input.width <= 0 || input.height <= 0) {
    return;
  }

  const imageBytes = await fs.readFile(input.filePath);
  const imageSize = readImageSize(imageBytes);
  const chunks = chunkBase64Payload(imageBytes.toString("base64"));

  let targetColumns = input.width;
  let targetRows = input.height;
  let targetTop = input.top;
  let targetLeft = input.left;
  if (
    imageSize &&
    imageSize.width > 0 &&
    imageSize.height > 0 &&
    input.cellPixelWidth > 0 &&
    input.cellPixelHeight > 0
  ) {
    const maxPixelWidth = input.width * input.cellPixelWidth;
    const maxPixelHeight = input.height * input.cellPixelHeight;
    const scale = Math.min(maxPixelWidth / imageSize.width, maxPixelHeight / imageSize.height);
    const scaledPixelWidth = Math.max(1, Math.round(imageSize.width * scale));
    const scaledPixelHeight = Math.max(1, Math.round(imageSize.height * scale));
    targetColumns = Math.max(
      1,
      Math.min(input.width, Math.ceil(scaledPixelWidth / input.cellPixelWidth)),
    );
    targetRows = Math.max(
      1,
      Math.min(input.height, Math.ceil(scaledPixelHeight / input.cellPixelHeight)),
    );
    targetTop = input.top + Math.max(0, Math.floor((input.height - targetRows) / 2));
    targetLeft = input.left + Math.max(0, Math.floor((input.width - targetColumns) / 2));
  }

  renderer.writeOut(moveCursor(targetTop, targetLeft));
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }
    const hasMore = index < chunks.length - 1 ? 1 : 0;
    if (index === 0) {
      renderer.writeOut(
        oscEscape(`a=T,f=100,q=2,C=1,c=${targetColumns},r=${targetRows},m=${hasMore};${chunk}`),
      );
      continue;
    }
    renderer.writeOut(oscEscape(`m=${hasMore};${chunk}`));
  }
}

export async function cacheRemoteAttachmentToFile(input: {
  attachment: TerminalImageAttachment & { id: string };
  baseUrl: string;
  cacheDir: string;
}): Promise<string> {
  await fs.mkdir(input.cacheDir, { recursive: true });
  const fileName = `${sanitizeFileStem(input.attachment.id)}${resolveAttachmentExtension(input.attachment)}`;
  const filePath = path.join(input.cacheDir, fileName);

  try {
    await fs.stat(filePath);
    return filePath;
  } catch {}

  const response = await fetch(
    `${input.baseUrl.replace(/\/+$/, "")}/attachments/${encodeURIComponent(input.attachment.id)}`,
  );
  if (!response.ok) {
    throw new Error(`Attachment fetch failed with ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, bytes);
  return filePath;
}
