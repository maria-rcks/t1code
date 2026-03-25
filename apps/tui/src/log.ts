import fs from "node:fs/promises";
import path from "node:path";

export interface T1Logger {
  log: (event: string, details?: Record<string, unknown>) => void;
}

function serializeDetails(details: Record<string, unknown> | undefined): string {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }

  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return ' {"serializationError":true}';
  }
}

export function createT1Logger(logPath: string): T1Logger {
  return {
    log(event, details) {
      const line = `${new Date().toISOString()} ${event}${serializeDetails(details)}\n`;
      void fs
        .mkdir(path.dirname(logPath), { recursive: true })
        .then(() => fs.appendFile(logPath, line, "utf8"))
        .catch(() => {});
    },
  };
}
