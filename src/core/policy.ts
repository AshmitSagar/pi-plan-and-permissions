import { ASK_TOOL, EXIT_TOOL } from "./constants.ts";
import type { Mode } from "./modes.ts";
import { category, isInsideProject, listMatches, targetOf, type Rules, type ToolCall } from "./rules.ts";
import { isReadOnlyBash } from "./shell.ts";

export type Decision =
  | { type: "allow" }
  | { type: "ask" }
  | { type: "deny"; reason: string };

export interface PolicyInput {
  call: ToolCall;
  mode: Mode;
  /** Rules from permissions.json (global + project), plus anything saved this run. */
  rules: Rules;
  /** "Don't ask again this session" rules. */
  sessionAllow: readonly string[];
}

const allow: Decision = { type: "allow" };
const ask: Decision = { type: "ask" };
const deny = (reason: string): Decision => ({ type: "deny", reason });

/**
 * The whole permission model in one pure function.
 * Order: interaction tools -> deny rules -> plan mode -> bypass -> ask rules -> allow rules -> mode defaults -> ask.
 */
export function decide({ call, mode, rules, sessionAllow }: PolicyInput): Decision {
  const { toolName } = call;
  const cat = category(toolName);
  const target = targetOf(call);

  // Asking the user a question is already an interaction: never gate it.
  if (toolName === ASK_TOOL) return allow;

  // Plan approval has its own review screen and only exists in plan mode.
  if (toolName === EXIT_TOOL) {
    return mode === "plan" ? allow : deny(`${EXIT_TOOL} is only available in plan mode.`);
  }

  // Deny rules win in every mode, including bypass.
  if (listMatches(rules.deny, call, "any")) {
    return deny(`Blocked by a deny rule in permissions.json (${toolName}: ${target}).`);
  }

  // Plan mode is strictly read-only.
  if (mode === "plan") {
    if (cat === "Read") return allow;
    if (cat === "Bash" && isReadOnlyBash(target)) return allow;
    return deny(
      `Plan mode: ${toolName} is not allowed. Finish researching, then call ${EXIT_TOOL} with your plan so the user can approve it.`,
    );
  }

  if (mode === "bypassPermissions") return allow;

  const forceAsk = listMatches(rules.ask, call, "any");
  if (!forceAsk && listMatches([...rules.allow, ...sessionAllow], call, "all")) return allow;

  if (!forceAsk) {
    const inProject = isInsideProject(target, call.cwd);
    if (cat === "Read" && inProject) return allow;
    if (cat === "Edit" && mode === "acceptEdits" && inProject) return allow;
  }

  return ask;
}
