import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";

import { deriveServerPaths, type ServerConfigShape } from "../config.ts";
import { buildServerEnvironmentDescriptor } from "./ServerEnvironmentDescriptor.ts";

function makeTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeServerConfig(baseDir: string): ServerConfigShape {
  const derived = Effect.runSync(
    deriveServerPaths(baseDir, undefined).pipe(Effect.provide(NodePath.layer)),
  );
  return {
    ...derived,
    mode: "tui",
    port: 0,
    host: undefined,
    cwd: "/workspace/t1code",
    baseDir,
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: true,
    authToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
  };
}

describe("buildServerEnvironmentDescriptor", () => {
  it("persists a stable local environment id", async () => {
    const baseDir = makeTempDir("t1code-environment-descriptor-");
    try {
      const serverConfig = makeServerConfig(baseDir);
      const effect = buildServerEnvironmentDescriptor(serverConfig).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      );

      const first = await Effect.runPromise(effect);
      const second = await Effect.runPromise(effect);

      expect(first.environmentId).toBe(second.environmentId);
      expect(fs.readFileSync(serverConfig.environmentIdPath, "utf8").trim()).toBe(
        first.environmentId,
      );
      expect(first.label.length).toBeGreaterThan(0);
      expect(first.serverVersion.length).toBeGreaterThan(0);
      expect(first.capabilities).toEqual({ repositoryIdentity: false });
      expect(["darwin", "linux", "windows", "unknown"]).toContain(first.platform.os);
      expect(["arm64", "x64", "other"]).toContain(first.platform.arch);
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
