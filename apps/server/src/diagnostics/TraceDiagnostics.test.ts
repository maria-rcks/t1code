import { describe, expect, it } from "vitest";

import { aggregateTraceDiagnostics } from "./TraceDiagnostics";

const traceId = "0123456789abcdef0123456789abcdef";

function unixNano(iso: string): string {
  return `${BigInt(Date.parse(iso)) * 1_000_000n}`;
}

describe("TraceDiagnostics", () => {
  it("aggregates trace spans, failures, slow spans, and warning logs", () => {
    const diagnostics = aggregateTraceDiagnostics({
      traceFilePath: "/tmp/server.trace.ndjson",
      scannedFilePaths: ["/tmp/server.trace.ndjson.1", "/tmp/server.trace.ndjson"],
      readAt: "2026-01-01T00:00:10.000Z",
      slowSpanThresholdMs: 1_000,
      files: [
        {
          path: "/tmp/server.trace.ndjson.1",
          text: [
            JSON.stringify({
              name: "provider.turn",
              traceId,
              spanId: "span-1",
              startTimeUnixNano: unixNano("2026-01-01T00:00:00.000Z"),
              endTimeUnixNano: unixNano("2026-01-01T00:00:02.000Z"),
              durationMs: 2_000,
              exit: { _tag: "Failure", cause: "provider crashed" },
              events: [
                {
                  name: "provider failed",
                  timeUnixNano: unixNano("2026-01-01T00:00:01.000Z"),
                  attributes: { "effect.logLevel": "Error" },
                },
              ],
            }),
            "not-json",
          ].join("\n"),
        },
        {
          path: "/tmp/server.trace.ndjson",
          text: JSON.stringify({
            name: "provider.turn",
            traceId,
            spanId: "span-2",
            startTimeUnixNano: unixNano("2026-01-01T00:00:03.000Z"),
            endTimeUnixNano: unixNano("2026-01-01T00:00:03.500Z"),
            durationMs: 500,
            exit: { _tag: "Success" },
          }),
        },
      ],
    });

    expect(diagnostics.recordCount).toBe(2);
    expect(diagnostics.parseErrorCount).toBe(1);
    expect(diagnostics.failureCount).toBe(1);
    expect(diagnostics.slowSpanCount).toBe(1);
    expect(diagnostics.firstSpanAt).toBe("2026-01-01T00:00:00.000Z");
    expect(diagnostics.lastSpanAt).toBe("2026-01-01T00:00:03.500Z");
    expect(diagnostics.logLevelCounts).toEqual({ Error: 1 });
    expect(diagnostics.topSpansByCount).toEqual([
      {
        name: "provider.turn",
        count: 2,
        failureCount: 1,
        totalDurationMs: 2_500,
        averageDurationMs: 1_250,
        maxDurationMs: 2_000,
      },
    ]);
    expect(diagnostics.latestFailures).toEqual([
      {
        name: "provider.turn",
        cause: "provider crashed",
        durationMs: 2_000,
        endedAt: "2026-01-01T00:00:02.000Z",
        traceId,
        spanId: "span-1",
      },
    ]);
    expect(diagnostics.latestWarningAndErrorLogs).toEqual([
      {
        spanName: "provider.turn",
        level: "Error",
        message: "provider failed",
        seenAt: "2026-01-01T00:00:01.000Z",
        traceId,
        spanId: "span-1",
      },
    ]);
  });

  it("returns a not-found summary when no trace files are loaded", () => {
    const diagnostics = aggregateTraceDiagnostics({
      traceFilePath: "/tmp/missing.trace.ndjson",
      scannedFilePaths: ["/tmp/missing.trace.ndjson"],
      readAt: "2026-01-01T00:00:10.000Z",
      files: [],
    });

    expect(diagnostics.recordCount).toBe(0);
    expect(diagnostics.error).toEqual({
      kind: "trace-file-not-found",
      message: "No local trace files were found.",
    });
  });
});
