/**
 * Static provider drivers shipped by this build.
 *
 * Keep this list limited to drivers that are fully implemented in this fork.
 */
import { ClaudeDriver, type ClaudeDriverEnv } from "./Drivers/ClaudeDriver.ts";
import { CodexDriver, type CodexDriverEnv } from "./Drivers/CodexDriver.ts";
import type { AnyProviderDriver } from "./ProviderDriver.ts";

export type BuiltInDriversEnv = ClaudeDriverEnv | CodexDriverEnv;

export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [
  CodexDriver,
  ClaudeDriver,
];
