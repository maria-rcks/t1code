import os from "node:os";
import crypto from "node:crypto";

import { EnvironmentId, type ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import { Effect, FileSystem, Path } from "effect";

import type { ServerConfigShape } from "../config.ts";
import packageJson from "../../package.json" with { type: "json" };

function platformOs(): ExecutionEnvironmentDescriptor["platform"]["os"] {
  switch (process.platform) {
    case "darwin":
      return "darwin";
    case "linux":
      return "linux";
    case "win32":
      return "windows";
    default:
      return "unknown";
  }
}

function platformArch(): ExecutionEnvironmentDescriptor["platform"]["arch"] {
  switch (process.arch) {
    case "arm64":
      return "arm64";
    case "x64":
      return "x64";
    default:
      return "other";
  }
}

function normalizeLabel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

const readEnvironmentId = Effect.fn("readEnvironmentId")(function* (environmentIdPath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const exists = yield* fileSystem
    .exists(environmentIdPath)
    .pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return null;
  }
  const raw = yield* fileSystem
    .readFileString(environmentIdPath)
    .pipe(Effect.map((value) => value.trim()));
  return raw.length > 0 ? raw : null;
});

const persistEnvironmentId = Effect.fn("persistEnvironmentId")(function* (
  environmentIdPath: string,
  value: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fileSystem.makeDirectory(path.dirname(environmentIdPath), { recursive: true });
  yield* fileSystem.writeFileString(environmentIdPath, `${value}\n`);
});

export const buildServerEnvironmentDescriptor = Effect.fn("buildServerEnvironmentDescriptor")(
  function* (serverConfig: ServerConfigShape) {
    const persistedEnvironmentId = yield* readEnvironmentId(serverConfig.environmentIdPath);
    const environmentIdRaw = persistedEnvironmentId ?? crypto.randomUUID();
    if (!persistedEnvironmentId) {
      yield* persistEnvironmentId(serverConfig.environmentIdPath, environmentIdRaw);
    }

    const path = yield* Path.Path;
    const cwdBaseName = normalizeLabel(path.basename(serverConfig.cwd));
    const label = normalizeLabel(os.hostname()) ?? cwdBaseName ?? "T1 environment";

    return {
      environmentId: EnvironmentId.make(environmentIdRaw),
      label,
      platform: {
        os: platformOs(),
        arch: platformArch(),
      },
      serverVersion: packageJson.version,
      capabilities: {
        repositoryIdentity: false,
      },
    } satisfies ExecutionEnvironmentDescriptor;
  },
);
