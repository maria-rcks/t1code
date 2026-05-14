import { assert, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { ORCHESTRATION_WS_CHANNELS, ORCHESTRATION_WS_METHODS } from "./orchestration";
import { WebSocketRequest, WsResponse, WS_CHANNELS, WS_METHODS } from "./ws";

const decodeWebSocketRequest = Schema.decodeUnknownEffect(WebSocketRequest);
const decodeWsResponse = Schema.decodeUnknownEffect(WsResponse);

it.effect("accepts getTurnDiff requests when fromTurnCount <= toTurnCount", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-1",
      body: {
        _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
        threadId: "thread-1",
        fromTurnCount: 1,
        toTurnCount: 2,
      },
    });
    assert.strictEqual(parsed.body._tag, ORCHESTRATION_WS_METHODS.getTurnDiff);
  }),
);

it.effect("rejects getTurnDiff requests when fromTurnCount > toTurnCount", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeWebSocketRequest({
        id: "req-1",
        body: {
          _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
          threadId: "thread-1",
          fromTurnCount: 3,
          toTurnCount: 2,
        },
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("trims websocket request id and nested orchestration ids", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: " req-1 ",
      body: {
        _tag: ORCHESTRATION_WS_METHODS.getTurnDiff,
        threadId: " thread-1 ",
        fromTurnCount: 0,
        toTurnCount: 0,
      },
    });
    assert.strictEqual(parsed.id, "req-1");
    assert.strictEqual(parsed.body._tag, ORCHESTRATION_WS_METHODS.getTurnDiff);
    if (parsed.body._tag === ORCHESTRATION_WS_METHODS.getTurnDiff) {
      assert.strictEqual(parsed.body.threadId, "thread-1");
    }
  }),
);

it.effect("accepts git.preparePullRequestThread requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-pr-1",
      body: {
        _tag: WS_METHODS.gitPreparePullRequestThread,
        cwd: "/repo",
        reference: "#42",
        mode: "worktree",
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.gitPreparePullRequestThread);
  }),
);

it.effect("accepts targeted server.refreshProviders requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-providers-1",
      body: {
        _tag: WS_METHODS.serverRefreshProviders,
        instanceId: "codex",
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.serverRefreshProviders);
  }),
);

it.effect("accepts targeted server.updateProvider requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-provider-update-1",
      body: {
        _tag: WS_METHODS.serverUpdateProvider,
        provider: "codex",
        instanceId: "codex",
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.serverUpdateProvider);
  }),
);

it.effect("accepts server.getProcessDiagnostics requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-processes-1",
      body: {
        _tag: WS_METHODS.serverGetProcessDiagnostics,
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.serverGetProcessDiagnostics);
  }),
);

it.effect("accepts server.getTraceDiagnostics requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-traces-1",
      body: {
        _tag: WS_METHODS.serverGetTraceDiagnostics,
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.serverGetTraceDiagnostics);
  }),
);

it.effect("accepts server.signalProcess requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-signal-process-1",
      body: {
        _tag: WS_METHODS.serverSignalProcess,
        pid: 123,
        signal: "SIGINT",
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.serverSignalProcess);
  }),
);

it.effect("accepts server.discoverSourceControl requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-source-control-1",
      body: {
        _tag: WS_METHODS.serverDiscoverSourceControl,
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.serverDiscoverSourceControl);
  }),
);

it.effect("accepts sourceControl.lookupRepository requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-source-control-lookup-1",
      body: {
        _tag: WS_METHODS.sourceControlLookupRepository,
        provider: "github",
        repository: "owner/repo",
        cwd: "/workspace",
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.sourceControlLookupRepository);
    if (parsed.body._tag === WS_METHODS.sourceControlLookupRepository) {
      assert.strictEqual(parsed.body.repository, "owner/repo");
    }
  }),
);

it.effect("accepts sourceControl.cloneRepository requests", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWebSocketRequest({
      id: "req-source-control-clone-1",
      body: {
        _tag: WS_METHODS.sourceControlCloneRepository,
        provider: "github",
        repository: "owner/repo",
        destinationPath: "/workspace/repo",
        protocol: "ssh",
      },
    });
    assert.strictEqual(parsed.body._tag, WS_METHODS.sourceControlCloneRepository);
    if (parsed.body._tag === WS_METHODS.sourceControlCloneRepository) {
      assert.strictEqual(parsed.body.destinationPath, "/workspace/repo");
    }
  }),
);

it.effect("accepts typed websocket push envelopes with sequence", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWsResponse({
      type: "push",
      sequence: 1,
      channel: WS_CHANNELS.serverWelcome,
      data: {
        cwd: "/tmp/workspace",
        projectName: "workspace",
      },
    });

    if (!("type" in parsed) || parsed.type !== "push") {
      assert.fail("expected websocket response to decode as a push envelope");
    }

    assert.strictEqual(parsed.type, "push");
    assert.strictEqual(parsed.sequence, 1);
    assert.strictEqual(parsed.channel, WS_CHANNELS.serverWelcome);
  }),
);

it.effect("accepts git.actionProgress push envelopes", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWsResponse({
      type: "push",
      sequence: 3,
      channel: WS_CHANNELS.gitActionProgress,
      data: {
        actionId: "action-1",
        cwd: "/repo",
        action: "commit",
        kind: "phase_started",
        phase: "commit",
        label: "Committing...",
      },
    });

    if (!("type" in parsed) || parsed.type !== "push") {
      assert.fail("expected websocket response to decode as a push envelope");
    }

    assert.strictEqual(parsed.channel, WS_CHANNELS.gitActionProgress);
  }),
);

it.effect("rejects push envelopes when channel payload does not match the channel schema", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeWsResponse({
        type: "push",
        sequence: 2,
        channel: ORCHESTRATION_WS_CHANNELS.domainEvent,
        data: {
          cwd: "/tmp/workspace",
          projectName: "workspace",
        },
      }),
    );

    assert.strictEqual(result._tag, "Failure");
  }),
);
