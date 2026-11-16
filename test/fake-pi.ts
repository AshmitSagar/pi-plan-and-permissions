import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";

type Handler = (event: any, ctx: any) => any;

const BUILTIN = ["read", "bash", "edit", "write", "grep", "find", "ls"];

/** A minimal in-memory stand-in for Pi's ExtensionAPI + ExtensionContext. */
export function makeFakePi(opts: { cwd?: string; flags?: Record<string, string> } = {}) {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const shortcuts = new Map<string, any>();
  const flags = new Map<string, any>();
  const entries: any[] = [];
  let active = [...BUILTIN];

  const pi: any = {
    on: (event: string, h: Handler) => void handlers.set(event, [...(handlers.get(event) ?? []), h]),
    registerTool: (t: any) => {
      tools.set(t.name, t);
      active.push(t.name); // Pi activates newly registered tools
    },
    registerCommand: (name: string, o: any) => void commands.set(name, o),
    registerShortcut: (key: string, o: any) => void shortcuts.set(key, o),
    registerFlag: (name: string, o: any) => void flags.set(name, o),
    getFlag: (name: string) => opts.flags?.[name],
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => {
      const known = new Set([...BUILTIN, ...tools.keys()]);
      active = names.filter((n) => known.has(n));
    },
    appendEntry: (customType: string, data: unknown) => void entries.push({ type: "custom", customType, data }),
  };

  const ui = {
    select: vi.fn(async (_title: string, options: string[]): Promise<string | undefined> => options[0]),
    input: vi.fn(async (): Promise<string | undefined> => undefined),
    editor: vi.fn(async (): Promise<string | undefined> => undefined),
    notify: vi.fn(),
    setStatus: vi.fn(),
    theme: { fg: (_c: string, t: string) => t, bold: (t: string) => t },
  };

  const ctx: any = {
    cwd: opts.cwd ?? process.cwd(),
    hasUI: true,
    mode: "rpc", // anything but "tui" => the plan review uses the plain select fallback
    ui,
    sessionManager: { getEntries: () => entries },
  };

  return {
    pi,
    ctx,
    ui,
    tools,
    commands,
    shortcuts,
    flags,
    entries,
    active: () => [...active],
    emit: async (event: string, payload: any = {}) => {
      let last: any;
      for (const h of handlers.get(event) ?? []) last = (await h(payload, ctx)) ?? last;
      return last;
    },
    runTool: (name: string, params: any) => tools.get(name).execute("id", params, undefined, undefined, ctx),
    gate: (toolName: string, input: Record<string, unknown>) =>
      Promise.all((handlers.get("tool_call") ?? []).map((h) => h({ toolName, input }, ctx))).then((r) => r.find(Boolean)),
  };
}

export function makeTempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-perm-"));
  const agent = path.join(root, "agent");
  const project = path.join(root, "project");
  fs.mkdirSync(agent, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  return { root, agent, project, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
