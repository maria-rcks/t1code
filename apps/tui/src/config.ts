import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = "t1code";

export interface TuiPaths {
  readonly userHomeDir: string;
  readonly homeDir: string;
  readonly configHomeDir: string;
  readonly stateHomeDir: string;
  readonly prefsPath: string;
  readonly logPath: string;
  readonly imagesDir: string;
}

function resolveAppDir(explicit: string | undefined, fallback: string): string {
  const configured = explicit?.trim();
  return configured ? path.join(configured, APP_DIR_NAME) : fallback;
}

export function resolveTuiPaths(env: NodeJS.ProcessEnv = process.env): TuiPaths {
  const home = os.homedir();
  const isLinux = process.platform === "linux";
  const homeDir =
    env.T1CODE_HOME?.trim() ||
    (isLinux
      ? resolveAppDir(env.XDG_DATA_HOME, path.join(home, ".local", "share", APP_DIR_NAME))
      : path.join(home, ".t1"));
  const configHomeDir =
    env.T1CODE_CONFIG_HOME?.trim() ||
    resolveAppDir(env.XDG_CONFIG_HOME, path.join(home, ".config", APP_DIR_NAME));
  const stateHomeDir =
    env.T1CODE_STATE_HOME?.trim() ||
    (isLinux
      ? resolveAppDir(env.XDG_STATE_HOME, path.join(home, ".local", "state", APP_DIR_NAME))
      : configHomeDir);
  return {
    userHomeDir: home,
    homeDir,
    configHomeDir,
    stateHomeDir,
    prefsPath: path.join(configHomeDir, "prefs.json"),
    logPath: path.join(stateHomeDir, "tui.log"),
    imagesDir: path.join(stateHomeDir, "images"),
  };
}
