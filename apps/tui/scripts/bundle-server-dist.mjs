import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tuiRoot = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(tuiRoot, "../..");
const serverRoot = path.resolve(repoRoot, "apps/server");
const serverDistSource = path.resolve(serverRoot, "dist");
const serverDistTarget = path.resolve(tuiRoot, "dist/server");
const serverClientSource = path.resolve(serverDistSource, "client");
const nodePtyTarget = path.resolve(serverDistTarget, "node_modules/node-pty");
const nodePtyRuntimeEntries = [
  "LICENSE",
  "README.md",
  "package.json",
  "lib",
  "prebuilds",
  "typings",
];

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveNodePtySource() {
  const directCandidates = [
    path.resolve(tuiRoot, "node_modules/node-pty"),
    path.resolve(repoRoot, "node_modules/node-pty"),
  ];

  for (const candidate of directCandidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  const bunStoreDir = path.resolve(repoRoot, "node_modules/.bun");
  const bunStoreEntries = await fs.readdir(bunStoreDir, { withFileTypes: true }).catch(() => []);

  for (const entry of bunStoreEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith("node-pty@")) {
      continue;
    }

    const candidate = path.resolve(bunStoreDir, entry.name, "node_modules/node-pty");
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to locate node-pty runtime files under ${tuiRoot}/node_modules or ${bunStoreDir}.`,
  );
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed in ${cwd} (${signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`}).`,
        ),
      );
    });
    child.once("error", reject);
  });
}

await run("bun", ["run", "build"], serverRoot);
await fs.rm(serverDistTarget, { recursive: true, force: true });
await fs.mkdir(path.dirname(serverDistTarget), { recursive: true });
await run(
  "bun",
  [
    "build",
    "src/index.ts",
    "--target=node",
    "--format=esm",
    "--splitting",
    "--packages=bundle",
    "--external",
    "node-pty",
    "--outdir",
    serverDistTarget,
  ],
  serverRoot,
);
if (await exists(serverClientSource)) {
  await fs.cp(serverClientSource, path.resolve(serverDistTarget, "client"), { recursive: true });
}
const nodePtySource = await resolveNodePtySource();
await fs.mkdir(path.dirname(nodePtyTarget), { recursive: true });
await fs.rm(nodePtyTarget, { recursive: true, force: true });
await fs.mkdir(nodePtyTarget, { recursive: true });
for (const entry of nodePtyRuntimeEntries) {
  await fs.cp(path.resolve(nodePtySource, entry), path.resolve(nodePtyTarget, entry), {
    recursive: true,
  });
}
