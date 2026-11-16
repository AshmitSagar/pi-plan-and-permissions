import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASK_TOOL, EXIT_TOOL } from "../src/core/constants.ts";
import { PLAN_CONTEXT_TYPE } from "../src/core/prompts.ts";
import { activate } from "../src/pi/activate.ts";
import { makeFakePi, makeTempDirs } from "./fake-pi.ts";

let dirs: ReturnType<typeof makeTempDirs>;
beforeEach(() => {
  dirs = makeTempDirs();
  process.env.PI_CODING_AGENT_DIR = dirs.agent;
});
afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  dirs.cleanup();
});

async function boot(opts: { flags?: Record<string, string>; entries?: any[] } = {}) {
  const fake = makeFakePi({ cwd: dirs.project, flags: opts.flags });
  fake.entries.push(...(opts.entries ?? []));
  activate(fake.pi);
  await fake.emit("session_start");
  return fake;
}

const GOOD_PLAN = `# Add retry logic

## Context
Requests fail on flaky networks, so the client should retry transient errors with exponential backoff.

## Implementation steps
### Phase 1 - Helper
- [ ] Create retry helper - \`src/retry.ts\` (new file)

## Verification
Run \`npm test\` and simulate a 503 response.`;

describe("registration", () => {
  it("registers tools, commands, the flag and the event handlers", async () => {
    const f = await boot();
    expect([...f.tools.keys()].sort()).toEqual([ASK_TOOL, EXIT_TOOL].sort());
    expect([...f.commands.keys()].sort()).toEqual(["mode", "permissions", "plan"]);
    expect(f.flags.has("permission-mode")).toBe(true);
    expect(f.flags.has("mode")).toBe(false); // Pi owns --mode
  });

  it("starts in manual mode with exit_plan_mode hidden and ask_user_question visible", async () => {
    const f = await boot();
    expect(f.active()).toContain(ASK_TOOL);
    expect(f.active()).not.toContain(EXIT_TOOL);
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ manual");
  });
});

describe("mode switching", () => {
  it("/plan swaps to the read-only tool set and back", async () => {
    const f = await boot();
    const before = f.active();
    await f.commands.get("plan").handler("", f.ctx);
    expect(f.active().sort()).toEqual(["read", "bash", "grep", "find", "ls", ASK_TOOL, EXIT_TOOL].sort());
    await f.commands.get("plan").handler("", f.ctx);
    expect(f.active().sort()).toEqual(before.sort());
  });

  it("/mode cycles and accepts names and aliases; rejects junk", async () => {
    const f = await boot();
    const mode = f.commands.get("mode");
    await mode.handler("accept", f.ctx);
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ accept edits");
    await mode.handler("bypass", f.ctx);
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ bypass");
    await mode.handler("", f.ctx); // cycles on from bypass -> manual
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ manual");
    await mode.handler("nonsense", f.ctx);
    expect(f.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("Unknown mode"), "error");
  });

  it("the shortcut cycles the mode", async () => {
    const f = await boot();
    await f.shortcuts.get("ctrl+alt+m").handler(f.ctx);
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ accept edits");
  });

  it("/permissions reports the loaded rules", async () => {
    fs.mkdirSync(path.join(dirs.project, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(dirs.project, ".pi", "permissions.json"), JSON.stringify({ permissions: { deny: ["Read(.env*)"] } }));
    const f = await boot();
    await f.commands.get("permissions").handler("", f.ctx);
    const msg = f.ui.notify.mock.calls.at(-1)![0] as string;
    expect(msg).toContain("Read(.env*)");
    expect(msg).toContain("Mode: manual");
  });
});

describe("startup mode precedence", () => {
  it("--permission-mode beats saved session state beats permissions.json", async () => {
    fs.mkdirSync(path.join(dirs.project, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(dirs.project, ".pi", "permissions.json"), JSON.stringify({ defaultMode: "acceptEdits" }));
    const saved = [{ type: "custom", customType: "permission-mode", data: { mode: "bypassPermissions" } }];

    const fromSettings = await boot();
    expect(fromSettings.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ accept edits");

    const fromSession = await boot({ entries: saved });
    expect(fromSession.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ bypass");

    const fromFlag = await boot({ entries: saved, flags: { "permission-mode": "plan" } });
    expect(fromFlag.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ plan");
    expect(fromFlag.active()).toContain(EXIT_TOOL);
  });

  it("the mode survives a resume (persisted as a session entry)", async () => {
    const first = await boot();
    await first.commands.get("plan").handler("", first.ctx);
    const resumed = await boot({ entries: first.entries });
    expect(resumed.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ plan");
    expect(resumed.active()).toContain(EXIT_TOOL);
    expect(resumed.active()).not.toContain("edit");
  });
});

describe("permission gate", () => {
  it("manual mode: asks, and a 'No' blocks", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("No");
    const r = await f.gate("bash", { command: "npm test" });
    expect(r).toEqual({ block: true, reason: "Denied by user." });
    expect(f.ui.select).toHaveBeenCalledOnce();
  });

  it("'Yes, once' lets it through and asks again next time", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValue("Yes, once");
    expect(await f.gate("bash", { command: "npm test" })).toBeUndefined();
    expect(await f.gate("bash", { command: "npm test" })).toBeUndefined();
    expect(f.ui.select).toHaveBeenCalledTimes(2);
  });

  it("'don't ask again this session' stops the prompts", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("Yes, and don't ask again this session");
    expect(await f.gate("bash", { command: "npm test" })).toBeUndefined();
    expect(await f.gate("bash", { command: "npm test" })).toBeUndefined();
    expect(f.ui.select).toHaveBeenCalledOnce();
    // ...but only for that command
    f.ui.select.mockResolvedValueOnce("No");
    expect(await f.gate("bash", { command: "npm publish" })).toMatchObject({ block: true });
  });

  it("'always allow in this project' is written to .pi/permissions.json", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("Yes, and always allow in this project (saved)");
    await f.gate("bash", { command: "npm test" });
    const saved = JSON.parse(fs.readFileSync(path.join(dirs.project, ".pi", "permissions.json"), "utf8"));
    expect(saved.permissions.allow).toEqual(["Bash(npm test)"]);
    expect(await f.gate("bash", { command: "npm test" })).toBeUndefined();
    expect(f.ui.select).toHaveBeenCalledOnce();
  });

  it("accepting edits for the session switches to acceptEdits", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("Yes, and accept edits for this session");
    await f.gate("edit", { path: "src/a.ts" });
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ accept edits");
    expect(await f.gate("write", { path: "src/b.ts" })).toBeUndefined();
    expect(f.ui.select).toHaveBeenCalledOnce();
  });

  it("deny rules block without prompting", async () => {
    fs.mkdirSync(path.join(dirs.project, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(dirs.project, ".pi", "permissions.json"), JSON.stringify({ permissions: { deny: ["Read(.env*)"] } }));
    const f = await boot();
    const r = await f.gate("read", { path: ".env" });
    expect(r).toMatchObject({ block: true });
    expect(f.ui.select).not.toHaveBeenCalled();
  });

  it("headless: anything needing a prompt is blocked", async () => {
    const f = await boot();
    f.ctx.hasUI = false;
    expect(await f.gate("bash", { command: "ls" })).toMatchObject({ block: true, reason: expect.stringContaining("no UI") });
  });

  it("plan mode blocks edits with guidance, allows reads", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    expect(await f.gate("read", { path: "a.ts" })).toBeUndefined();
    const r = await f.gate("edit", { path: "a.ts" });
    expect(r).toMatchObject({ block: true, reason: expect.stringContaining(EXIT_TOOL) });
  });
});

describe("plan prompt injection", () => {
  it("is injected only in plan mode and stripped from context afterwards", async () => {
    const f = await boot();
    expect(await f.emit("before_agent_start")).toBeUndefined();

    await f.commands.get("plan").handler("", f.ctx);
    const injected = await f.emit("before_agent_start");
    expect(injected.message.customType).toBe(PLAN_CONTEXT_TYPE);
    expect(injected.message.display).toBe(false);
    expect(injected.message.content).toContain("UNDERSTAND");

    const messages = [{ role: "user" }, { customType: PLAN_CONTEXT_TYPE }];
    expect(await f.emit("context", { messages })).toBeUndefined(); // kept while planning

    await f.commands.get("plan").handler("", f.ctx);
    const after = await f.emit("context", { messages });
    expect(after.messages).toEqual([{ role: "user" }]);
  });
});

describe("exit_plan_mode", () => {
  const APPROVE_EDITS = "Yes, and auto-accept edits";
  const APPROVE_MANUAL = "Yes, and ask before each edit";

  it("approval switches mode, restores tools and saves the plan", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce(APPROVE_EDITS);
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });

    expect(res.details).toMatchObject({ approved: true, mode: "acceptEdits" });
    expect(res.content[0].text).toContain("Start implementing");
    expect(f.ui.setStatus).toHaveBeenLastCalledWith("permission-mode", "⏵ accept edits");
    expect(f.active()).toContain("edit");
    expect(f.active()).not.toContain(EXIT_TOOL);
    expect(fs.readFileSync(res.details.file, "utf8")).toContain("Add retry logic");
  });

  it("saves to the default plans directory when plansDir is not set", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce(APPROVE_EDITS);
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });
    expect(path.dirname(res.details.file)).toBe(path.join(dirs.agent, "plans"));
  });

  it("saves to the configured plansDir (relative to the project)", async () => {
    fs.mkdirSync(path.join(dirs.project, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(dirs.project, ".pi", "permissions.json"), JSON.stringify({ plansDir: "docs/plans" }));
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce(APPROVE_EDITS);
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });
    expect(path.dirname(res.details.file)).toBe(path.join(dirs.project, "docs", "plans"));
    expect(fs.readFileSync(res.details.file, "utf8")).toContain("Add retry logic");
    await f.commands.get("permissions").handler("", f.ctx);
    expect(f.ui.notify.mock.calls.at(-1)![0]).toContain(path.join(dirs.project, "docs", "plans"));
  });

  it("'ask before each edit' returns to manual mode", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce(APPROVE_MANUAL);
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });
    expect(res.details).toMatchObject({ approved: true, mode: "default" });
  });

  it("rejecting passes the user's feedback back and stays in plan mode", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce("No, keep planning (give feedback)");
    f.ui.editor.mockResolvedValueOnce("Use exponential backoff, not fixed delay");
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });
    expect(res.details).toEqual({ approved: false });
    expect(res.content[0].text).toContain("Use exponential backoff");
    expect(f.active()).toContain(EXIT_TOOL);
  });

  it("editing first sends the user's version to the model", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce("Edit the plan first").mockResolvedValueOnce(APPROVE_MANUAL);
    f.ui.editor.mockResolvedValueOnce(GOOD_PLAN + "\n- extra requirement from the user");
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });
    expect(res.content[0].text).toContain("they edited it");
    expect(res.content[0].text).toContain("extra requirement from the user");
  });

  it("dismissing the review counts as 'keep planning'", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    f.ui.select.mockResolvedValueOnce(undefined);
    const res = await f.runTool(EXIT_TOOL, { plan: GOOD_PLAN });
    expect(res.details).toEqual({ approved: false });
  });

  it("a malformed plan is rejected before the user ever sees it", async () => {
    const f = await boot({ flags: { "permission-mode": "plan" } });
    await expect(f.runTool(EXIT_TOOL, { plan: "just do the thing" })).rejects.toThrow(/missing/);
    expect(f.ui.select).not.toHaveBeenCalled();
  });

  it("refuses to run outside plan mode or without a UI", async () => {
    const manual = await boot();
    await expect(manual.runTool(EXIT_TOOL, { plan: GOOD_PLAN })).rejects.toThrow(/only be used in plan mode/);
    const headless = await boot({ flags: { "permission-mode": "plan" } });
    headless.ctx.hasUI = false;
    await expect(headless.runTool(EXIT_TOOL, { plan: GOOD_PLAN })).rejects.toThrow(/interactive/);
  });
});

describe("ask_user_question", () => {
  const q = (extra = {}) => ({
    question: "Which database?",
    header: "DB",
    options: [
      { label: "Postgres", description: "Recommended" },
      { label: "SQLite", description: "Zero setup" },
    ],
    ...extra,
  });

  it("returns the chosen option's label", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("SQLite — Zero setup");
    const res = await f.runTool(ASK_TOOL, { questions: [q()] });
    expect(res.content[0].text).toContain("Which database? -> SQLite");
    expect(res.details).toEqual({ dismissed: false });
  });

  it("'Other' collects free text", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("Other (type your own answer)");
    f.ui.input.mockResolvedValueOnce("DuckDB");
    const res = await f.runTool(ASK_TOOL, { questions: [q()] });
    expect(res.content[0].text).toContain("-> DuckDB");
  });

  it("multi-select toggles options until Done", async () => {
    const f = await boot();
    f.ui.select
      .mockResolvedValueOnce("[ ] Postgres — Recommended")
      .mockResolvedValueOnce("[ ] SQLite — Zero setup")
      .mockResolvedValueOnce("[x] Postgres — Recommended") // toggle off again
      .mockResolvedValueOnce("Done (1 selected)");
    const res = await f.runTool(ASK_TOOL, { questions: [q({ multiSelect: true })] });
    expect(res.content[0].text).toContain("-> SQLite");
    expect(res.content[0].text).not.toContain("Postgres,");
  });

  it("asks several questions in order", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce("Postgres — Recommended").mockResolvedValueOnce("SQLite — Zero setup");
    const res = await f.runTool(ASK_TOOL, { questions: [q(), q({ question: "Fallback?" })] });
    expect(res.content[0].text).toContain("Which database? -> Postgres");
    expect(res.content[0].text).toContain("Fallback? -> SQLite");
  });

  it("dismissal stops the sequence and tells the model not to re-ask", async () => {
    const f = await boot();
    f.ui.select.mockResolvedValueOnce(undefined);
    const res = await f.runTool(ASK_TOOL, { questions: [q(), q({ question: "Never asked?" })] });
    expect(res.details).toEqual({ dismissed: true });
    expect(res.content[0].text).toContain("Do not re-ask");
    expect(res.content[0].text).not.toContain("Never asked?");
    expect(f.ui.select).toHaveBeenCalledOnce();
  });

  it("works in every mode without a permission prompt", async () => {
    for (const mode of ["default", "acceptEdits", "plan", "bypassPermissions"]) {
      const f = await boot({ flags: { "permission-mode": mode } });
      expect(await f.gate(ASK_TOOL, {})).toBeUndefined();
      expect(f.ui.select).not.toHaveBeenCalled();
    }
  });

  it("errors in headless sessions so the model assumes instead", async () => {
    const f = await boot();
    f.ctx.hasUI = false;
    await expect(f.runTool(ASK_TOOL, { questions: [q()] })).rejects.toThrow(/no UI/);
  });
});
