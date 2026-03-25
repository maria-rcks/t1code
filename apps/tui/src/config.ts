import os from "node:os";
import path from "node:path";

export interface TuiPaths {
  readonly homeDir: string;
  readonly configHomeDir: string;
  readonly prefsPath: string;
  readonly logPath: string;
  readonly imagesDir: string;
}

export function resolveTuiPaths(env: NodeJS.ProcessEnv = process.env): TuiPaths {
  const homeDir = env.T3CODE_HOME?.trim() || path.join(os.homedir(), ".t1");
  const configHomeDir =
    env.T3CODE_CONFIG_HOME?.trim() || path.join(os.homedir(), ".config", "t1code");
  return {
    homeDir,
    configHomeDir,
    prefsPath: path.join(configHomeDir, "prefs.json"),
    logPath: path.join(configHomeDir, "tui.log"),
    imagesDir: path.join(configHomeDir, "images"),
  };
}
