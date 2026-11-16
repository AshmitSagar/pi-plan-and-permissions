import * as path from "node:path";
import { BASH_TOOLS, EDIT_TOOLS, READ_TOOLS } from "./constants.ts";
import { globToRegExp } from "./glob.ts";
import { splitCommand } from "./shell.ts";

export interface Rules {
  allow: string[];
  ask: string[];
  deny: string[];
}

export const emptyRules = (): Rules => ({ allow: [], ask: [], deny: [] });

/** What a call looks like to the policy: just a tool name, its arguments and the project root. */
export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
}

export type Category = "Bash" | "Read" | "Edit" | "Other";

export function category(toolName: string): Category {
  if (BASH_TOOLS.has(toolName)) return "Bash";
  if (READ_TOOLS.has(toolName)) return "Read";
  if (EDIT_TOOLS.has(toolName)) return "Edit";
  return "Other";
}

/** The string a rule is matched against: the command for bash, the path/pattern otherwise. */
export function targetOf(call: Pick<ToolCall, "toolName" | "input">): string {
  const { toolName, input } = call;
  if (BASH_TOOLS.has(toolName)) return String(input.command ?? "");
  return String(input.path ?? input.file_path ?? input.pattern ?? "");
}

export function isInsideProject(target: string, cwd: string): boolean {
  if (!target) return true;
  return !path.relative(cwd, path.resolve(cwd, target)).startsWith("..");
}

interface ParsedRule {
  tool: string;
  spec?: string;
}

/** `Bash(npm run test:*)` -> { tool: "Bash", spec: "npm run test:*" }; `Edit` -> { tool: "Edit" }. */
export function parseRule(rule: string): ParsedRule | undefined {
  const m = /^(\w+)(?:\((.*)\))?$/.exec(rule.trim());
  return m ? { tool: m[1], spec: m[2] } : undefined;
}

function matchesBashSpec(spec: string, cmd: string): boolean {
  // "npm run test:*" is a prefix rule: the command alone, or followed by a space and anything.
  if (spec.endsWith(":*")) {
    const prefix = spec.slice(0, -2);
    return cmd === prefix || cmd.startsWith(prefix + " ");
  }
  return globToRegExp(spec).test(cmd);
}

function matchesPathSpec(spec: string, target: string, cwd: string): boolean {
  const abs = path.resolve(cwd, target);
  const rel = path.relative(cwd, abs);
  const s = spec.replace(/^\.\//, "");
  const re = globToRegExp(s);
  return re.test(rel) || re.test(abs) || (re.test(path.basename(abs)) && !s.includes("/"));
}

const bare = (r: ParsedRule) => r.spec === undefined || r.spec === "*";

/**
 * Does any rule in `list` match the call?
 *  - mode "any": one matching rule is enough (used for deny and ask).
 *  - mode "all": for compound bash commands every segment must match a rule (used for allow),
 *    and commands with substitutions never match.
 */
export function listMatches(list: readonly string[], call: ToolCall, mode: "any" | "all"): boolean {
  const cat = category(call.toolName);
  const target = targetOf(call);
  const relevant = list
    .map(parseRule)
    .filter((r): r is ParsedRule => !!r && (r.tool === cat || r.tool.toLowerCase() === call.toolName));

  if (cat === "Bash") {
    const segments = splitCommand(target);
    if (!segments) return false;
    const segMatches = (seg: string) => relevant.some((r) => bare(r) || matchesBashSpec(r.spec!, seg));
    if (mode === "all") return segments.every(segMatches);
    return segments.some(segMatches) || relevant.some((r) => !bare(r) && matchesBashSpec(r.spec!, target));
  }
  return relevant.some((r) => bare(r) || matchesPathSpec(r.spec!, target, call.cwd));
}

/** The rule saved when a user picks "always allow" for this call. */
export function ruleForCall(call: ToolCall): string {
  const cat = category(call.toolName);
  if (cat === "Bash") return `Bash(${targetOf(call)})`;
  if (cat === "Edit" || cat === "Read") return cat;
  return call.toolName;
}
