import { describe, expect, it } from "vitest";

import {
  extractSlashCommandQuery,
  matchSlashCommands,
  parseSlashCommandInput,
} from "./slashCommands";

describe("slashCommands", () => {
  it("extracts a top-level slash query while typing the command name", () => {
    expect(extractSlashCommandQuery("/pr")).toBe("pr");
  });

  it("does not treat commands with arguments as top-level query suggestions", () => {
    expect(extractSlashCommandQuery("/project add ~/repo")).toBeNull();
  });

  it("does not treat absolute paths as slash commands", () => {
    expect(extractSlashCommandQuery("/Users/maria/image.png")).toBeNull();
    expect(parseSlashCommandInput("/Users/maria/image.png")).toBeNull();
  });

  it("returns matching slash commands for a partial query", () => {
    expect(matchSlashCommands("pro").map((item) => item.command)).toEqual(["project", "provider"]);
  });

  it("parses recognized slash commands", () => {
    expect(parseSlashCommandInput("/project add ~/repo")).toEqual({
      command: "project",
      args: "add ~/repo",
    });
  });
});
