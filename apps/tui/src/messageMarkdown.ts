export type MessageMarkdownSegment =
  | {
      kind: "markdown";
      content: string;
    }
  | {
      kind: "code";
      content: string;
      language: string | null;
    };

type FenceState = {
  marker: "`" | "~";
  length: number;
  language: string | null;
};

function parseFenceStart(line: string): FenceState | null {
  const match = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
  if (!match) {
    return null;
  }

  const fence = match[1] ?? "";
  const marker = fence[0];
  if (marker !== "`" && marker !== "~") {
    return null;
  }

  const info = (match[2] ?? "").trim();
  const languageMatch = /^([^\s{]+)/.exec(info);
  return {
    marker,
    length: fence.length,
    language: languageMatch?.[1] ?? null,
  };
}

function isFenceEnd(line: string, state: FenceState): boolean {
  const pattern = new RegExp(`^ {0,3}${state.marker}{${state.length},}\\s*$`);
  return pattern.test(line);
}

function flushMarkdown(segments: MessageMarkdownSegment[], lines: string[]): void {
  if (lines.length === 0) {
    return;
  }
  segments.push({ kind: "markdown", content: lines.join("\n") });
  lines.length = 0;
}

export function parseMessageMarkdownSegments(content: string): MessageMarkdownSegment[] {
  if (!content) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  const segments: MessageMarkdownSegment[] = [];
  const markdownLines: string[] = [];
  const codeLines: string[] = [];
  let fenceState: FenceState | null = null;

  for (const line of lines) {
    if (fenceState) {
      if (isFenceEnd(line, fenceState)) {
        segments.push({
          kind: "code",
          content: codeLines.join("\n"),
          language: fenceState.language,
        });
        codeLines.length = 0;
        fenceState = null;
        continue;
      }
      codeLines.push(line);
      continue;
    }

    const nextFenceState = parseFenceStart(line);
    if (!nextFenceState) {
      markdownLines.push(line);
      continue;
    }

    flushMarkdown(segments, markdownLines);
    fenceState = nextFenceState;
  }

  if (fenceState) {
    segments.push({
      kind: "code",
      content: codeLines.join("\n"),
      language: fenceState.language,
    });
  } else {
    flushMarkdown(segments, markdownLines);
  }

  return segments;
}

export function resolveCodeBlockFiletype(language: string | null): string | undefined {
  if (!language) {
    return undefined;
  }

  const normalized = language.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "patch" || normalized === "udiff" || normalized === "unified-diff") {
    return "diff";
  }

  return normalized;
}

export function isDiffLikeCodeBlockFiletype(filetype: string | undefined): boolean {
  return filetype === "diff";
}
