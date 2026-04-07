function parseCsiParam(params: string, fallback: number): number {
  const value = Number.parseInt(params || `${fallback}`, 10);
  return Number.isFinite(value) ? value : fallback;
}

function stripAnsiControlSequences(input: string): string {
  const csiPattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");
  const oscPattern = new RegExp(String.raw`\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)`, "g");
  const controlPattern = new RegExp(String.raw`[\u0000-\u0008\u000b-\u001f\u007f]`, "g");
  const leakedCsiPattern = new RegExp(String.raw`\[(?:[?>=][0-?]*[ -/]*[@-~])+`, "g");
  const leakedQueryTailPattern = new RegExp(String.raw`\$[a-z](?=(?:\$[a-z])|\$ |\n|$)`, "g");
  return input
    .replace(csiPattern, "")
    .replace(oscPattern, "")
    .replace(leakedCsiPattern, "")
    .replace(leakedQueryTailPattern, "")
    .replace(controlPattern, "");
}

function skipTerminatedEscapeSequence(history: string, index: number): number {
  for (let cursor = index; cursor < history.length; cursor += 1) {
    const char = history[cursor];
    const next = history[cursor + 1];
    if (char === "\u0007") {
      return cursor;
    }
    if (char === "\u001b" && next === "\\") {
      return cursor + 1;
    }
  }
  return history.length - 1;
}

export function normalizeTerminalHistoryForDisplay(history: string): string {
  const lines = [""];
  let row = 0;
  let col = 0;
  let savedRow = 0;
  let savedCol = 0;

  const ensureRow = (targetRow: number) => {
    while (lines.length <= targetRow) {
      lines.push("");
    }
  };

  const writeChar = (char: string) => {
    ensureRow(row);
    const currentLine = lines[row] ?? "";
    if (col >= currentLine.length) {
      lines[row] = `${currentLine}${" ".repeat(col - currentLine.length)}${char}`;
    } else {
      lines[row] = `${currentLine.slice(0, col)}${char}${currentLine.slice(col + 1)}`;
    }
    col += 1;
  };

  const clearScreen = () => {
    lines.splice(0, lines.length, "");
    row = 0;
    col = 0;
  };

  for (let index = 0; index < history.length; index += 1) {
    const char = history[index];
    if (!char) {
      continue;
    }

    if (char === "\u001b") {
      const next = history[index + 1];
      if (next === "c") {
        clearScreen();
        index += 1;
        continue;
      }
      if (next === "]" || next === "P" || next === "_" || next === "^") {
        index = skipTerminatedEscapeSequence(history, index + 2);
        continue;
      }
      if (next !== "[") {
        continue;
      }
      const match = /^([0-?]*)([ -/]*)([@-~])/.exec(history.slice(index + 2));
      if (!match) {
        continue;
      }
      const params = match[1] ?? "";
      const intermediates = match[2] ?? "";
      const command = match[3];
      index += 1 + match[0].length;

      switch (command) {
        case "A":
          row = Math.max(0, row - parseCsiParam(params, 1));
          ensureRow(row);
          break;
        case "B":
          row += parseCsiParam(params, 1);
          ensureRow(row);
          break;
        case "C":
          col += parseCsiParam(params, 1);
          break;
        case "D":
          col = Math.max(0, col - parseCsiParam(params, 1));
          break;
        case "G":
          col = Math.max(0, parseCsiParam(params, 1) - 1);
          break;
        case "H":
        case "f": {
          const [nextRowValue, nextColValue] = params
            .split(";")
            .map((value) => Number.parseInt(value, 10));
          const nextRowRaw = nextRowValue ?? Number.NaN;
          const nextColRaw = nextColValue ?? Number.NaN;
          row = Math.max(0, (Number.isFinite(nextRowRaw) ? nextRowRaw : 1) - 1);
          col = Math.max(0, (Number.isFinite(nextColRaw) ? nextColRaw : 1) - 1);
          ensureRow(row);
          break;
        }
        case "J":
          if (params === "" || params === "2" || params === "3") {
            clearScreen();
          }
          break;
        case "K": {
          ensureRow(row);
          const currentLine = lines[row] ?? "";
          const mode = parseCsiParam(params, 0);
          if (mode === 1) {
            lines[row] = `${" ".repeat(col)}${currentLine.slice(col)}`;
          } else if (mode === 2) {
            lines[row] = "";
          } else {
            lines[row] = currentLine.slice(0, col);
          }
          break;
        }
        case "P": {
          ensureRow(row);
          const currentLine = lines[row] ?? "";
          const count = parseCsiParam(params, 1);
          lines[row] = `${currentLine.slice(0, col)}${currentLine.slice(col + count)}`;
          break;
        }
        case "X": {
          ensureRow(row);
          const currentLine = lines[row] ?? "";
          const count = parseCsiParam(params, 1);
          const lineEnd = Math.max(currentLine.length, col + count);
          const prefix = currentLine.slice(0, col);
          const suffix = currentLine.slice(Math.min(lineEnd, col + count));
          lines[row] = `${prefix}${" ".repeat(count)}${suffix}`;
          break;
        }
        case "h":
        case "l":
        case "m":
        case "p":
        case "q":
          break;
        case "s":
          if (intermediates.length > 0) {
            break;
          }
          savedRow = row;
          savedCol = col;
          break;
        case "u":
          if (intermediates.length > 0) {
            break;
          }
          row = savedRow;
          col = savedCol;
          ensureRow(row);
          break;
        default:
          break;
      }
      continue;
    }

    switch (char) {
      case "\u0007":
        break;
      case "\r":
        col = 0;
        break;
      case "\n":
        row += 1;
        col = 0;
        ensureRow(row);
        break;
      case "\b":
        col = Math.max(0, col - 1);
        break;
      default:
        writeChar(char);
        break;
    }
  }

  return stripAnsiControlSequences(lines.join("\n"));
}
