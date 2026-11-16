import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as os from "node:os";
import { savePlan } from "../src/infra/plan-store.ts";
import { resolvePlansDir } from "../src/infra/paths.ts";
import { loadSettings, saveProjectAllow } from "../src/infra/settings.ts";
import { makeTempDirs } from "./fake-pi.ts";

let dirs: ReturnType<typeof makeTempDirs>;
beforeEach(() => {
  dirs = makeTempDirs();
  process.env.PI_CODING_AGENT_DIR = dirs.agent;
});
afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  dirs.cleanup();
});

const write = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
};

describe("loadSettings", () => {
  it("returns empty rules when nothing is configured", () => {
    expect(loadSettings(dirs.project)).toEqual({ rules: { allow: [], ask: [], deny: [] }, defaultMode: undefined });
  });

  it("merges global and project rules; project defaultMode wins", () => {
    write(path.join(dirs.agent, "permissions.json"), { defaultMode: "plan", permissions: { allow: ["Read"], deny: ["Bash(rm:*)"] } });
    write(path.join(dirs.project, ".pi", "permissions.json"), { defaultMode: "accept", permissions: { allow: ["Edit(src/**)"] } });
    const s = loadSettings(dirs.project);
    expect(s.rules.allow).toEqual(["Read", "Edit(src/**)"]);
    expect(s.rules.deny).toEqual(["Bash(rm:*)"]);
    expect(s.defaultMode).toBe("acceptEdits");
  });

  it("ignores malformed files and non-string rules", () => {
    write(path.join(dirs.agent, "permissions.json"), "{ not json");
    write(path.join(dirs.project, ".pi", "permissions.json"), { defaultMode: "bogus", permissions: { allow: ["Read", 5, null] } });
    const s = loadSettings(dirs.project);
    expect(s.rules.allow).toEqual(["Read"]);
    expect(s.defaultMode).toBeUndefined();
  });
});

describe("saveProjectAllow", () => {
  it("creates the file, preserves existing content, and is idempotent", () => {
    const file = path.join(dirs.project, ".pi", "permissions.json");
    write(file, { defaultMode: "plan", permissions: { deny: ["Bash(rm:*)"] } });
    saveProjectAllow(dirs.project, "Bash(npm test)");
    saveProjectAllow(dirs.project, "Bash(npm test)");
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(json.permissions.allow).toEqual(["Bash(npm test)"]);
    expect(json.permissions.deny).toEqual(["Bash(rm:*)"]);
    expect(json.defaultMode).toBe("plan");
  });

  it("works when no file exists yet", () => {
    saveProjectAllow(dirs.project, "Edit");
    expect(loadSettings(dirs.project).rules.allow).toEqual(["Edit"]);
  });
});

describe("savePlan", () => {
  it("writes a markdown file named after the project under <agentDir>/plans", () => {
    const file = savePlan("/some/My Project!", "# Plan");
    expect(file.startsWith(path.join(dirs.agent, "plans"))).toBe(true);
    expect(path.basename(file)).toMatch(/^My_Project_-.*\.md$/);
    expect(fs.readFileSync(file, "utf8")).toBe("# Plan\n");
  });
});

describe("plansDir", () => {
  it("defaults to <agentDir>/plans, exactly as before", () => {
    expect(resolvePlansDir(undefined, dirs.project)).toBe(path.join(dirs.agent, "plans"));
    expect(resolvePlansDir("   ", dirs.project)).toBe(path.join(dirs.agent, "plans"));
  });

  it("resolves ~, absolute and project-relative values", () => {
    expect(resolvePlansDir("~/notes/plans", dirs.project)).toBe(path.join(os.homedir(), "notes", "plans"));
    expect(resolvePlansDir("/var/plans", dirs.project)).toBe("/var/plans");
    expect(resolvePlansDir(".pi/plans", dirs.project)).toBe(path.join(dirs.project, ".pi", "plans"));
  });

  it("is read from settings; the project value wins over the global one", () => {
    expect(loadSettings(dirs.project).plansDir).toBeUndefined();
    write(path.join(dirs.agent, "permissions.json"), { plansDir: "~/global-plans" });
    expect(loadSettings(dirs.project).plansDir).toBe("~/global-plans");
    write(path.join(dirs.project, ".pi", "permissions.json"), { plansDir: ".pi/plans" });
    expect(loadSettings(dirs.project).plansDir).toBe(".pi/plans");
  });

  it("ignores non-string or blank values", () => {
    write(path.join(dirs.project, ".pi", "permissions.json"), { plansDir: 5 });
    expect(loadSettings(dirs.project).plansDir).toBeUndefined();
    write(path.join(dirs.project, ".pi", "permissions.json"), { plansDir: "  " });
    expect(loadSettings(dirs.project).plansDir).toBeUndefined();
  });

  it("savePlan writes into a custom directory, creating it", () => {
    const custom = path.join(dirs.project, "docs", "plans");
    const file = savePlan(dirs.project, "# Plan", custom);
    expect(path.dirname(file)).toBe(custom);
    expect(fs.readFileSync(file, "utf8")).toBe("# Plan\n");
  });
});
