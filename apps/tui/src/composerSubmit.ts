import * as fs from "node:fs/promises";
import path from "node:path";

const SUPPORTED_INLINE_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".avif",
  ".heic",
  ".heif",
  ".tiff",
  ".svg",
]);

const MIME_TYPE_BY_IMAGE_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
};

const INLINE_IMAGE_PATH_PATTERN =
  /(^|[\s])(?<path>(?:~|\/)\S+\.(?:avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff|webp))(?=$|[\s])/gim;

type InlineImagePathCandidate = {
  rawPath: string;
  start: number;
  end: number;
};

export type ResolvedComposerImageAttachment = {
  type: "image";
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  localPath?: string;
};

export type ResolvedComposerSubmission = {
  promptText: string;
  attachments: ResolvedComposerImageAttachment[];
};

function scanInlineImagePathCandidates(input: string): InlineImagePathCandidate[] {
  const candidates: InlineImagePathCandidate[] = [];
  for (const match of input.matchAll(INLINE_IMAGE_PATH_PATTERN)) {
    const rawPath = match.groups?.path;
    const matchIndex = match.index;
    if (!rawPath || matchIndex === undefined) {
      continue;
    }
    const fullMatch = match[0] ?? rawPath;
    const rawPathOffset = fullMatch.lastIndexOf(rawPath);
    if (rawPathOffset < 0) {
      continue;
    }
    const start = matchIndex + rawPathOffset;
    candidates.push({
      rawPath,
      start,
      end: start + rawPath.length,
    });
  }
  return candidates;
}

function collapsePromptWhitespace(input: string): string {
  return input
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeResolvedImagePaths(
  input: string,
  resolvedCandidates: ReadonlyArray<InlineImagePathCandidate>,
): string {
  if (resolvedCandidates.length === 0) {
    return collapsePromptWhitespace(input);
  }
  let cursor = 0;
  let output = "";
  for (const candidate of resolvedCandidates.toSorted((left, right) => left.start - right.start)) {
    if (candidate.start < cursor) {
      continue;
    }
    output += input.slice(cursor, candidate.start);
    output += " ";
    cursor = candidate.end;
  }
  output += input.slice(cursor);
  return collapsePromptWhitespace(output);
}

function expandHomePath(inputPath: string, homeDir: string): string {
  if (inputPath === "~") {
    return homeDir;
  }
  if (inputPath.startsWith("~/")) {
    return path.join(homeDir, inputPath.slice(2));
  }
  return inputPath;
}

function inferImageMimeType(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_INLINE_IMAGE_EXTENSIONS.has(extension)) {
    return null;
  }
  return MIME_TYPE_BY_IMAGE_EXTENSION[extension] ?? null;
}

export async function resolveImageAttachmentFromPath(input: {
  filePath: string;
  homeDir: string;
}): Promise<ResolvedComposerImageAttachment | null> {
  const expandedPath = path.resolve(expandHomePath(input.filePath, input.homeDir));
  const mimeType = inferImageMimeType(expandedPath);
  if (!mimeType) {
    return null;
  }

  let stat;
  try {
    stat = await fs.stat(expandedPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return null;
  }

  const bytes = await fs.readFile(expandedPath);
  return {
    type: "image",
    name: path.basename(expandedPath),
    mimeType,
    sizeBytes: bytes.byteLength,
    dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    localPath: expandedPath,
  };
}

export async function resolveComposerSubmission(input: {
  text: string;
  homeDir: string;
}): Promise<ResolvedComposerSubmission> {
  const candidates = scanInlineImagePathCandidates(input.text);
  if (candidates.length === 0) {
    return {
      promptText: collapsePromptWhitespace(input.text),
      attachments: [],
    };
  }

  const attachments: ResolvedComposerImageAttachment[] = [];
  const resolvedCandidates: InlineImagePathCandidate[] = [];
  const seenPaths = new Set<string>();

  for (const candidate of candidates) {
    const expandedPath = path.resolve(expandHomePath(candidate.rawPath, input.homeDir));
    if (seenPaths.has(expandedPath)) {
      resolvedCandidates.push(candidate);
      continue;
    }

    const attachment = await resolveImageAttachmentFromPath({
      filePath: expandedPath,
      homeDir: input.homeDir,
    });
    if (!attachment) {
      continue;
    }

    attachments.push(attachment);
    resolvedCandidates.push(candidate);
    seenPaths.add(expandedPath);
  }

  return {
    promptText: removeResolvedImagePaths(input.text, resolvedCandidates),
    attachments,
  };
}
