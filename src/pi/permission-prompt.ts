import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { category, ruleForCall, targetOf, type ToolCall } from "../core/rules.ts";
import type { ModeController } from "./controller.ts";

export interface PromptResult {
  ok: boolean;
  reason?: string;
}

/** Ask the user whether one tool call may run, and record any "don't ask again" choice. */
export async function askPermission(ctx: ExtensionContext, call: ToolCall, controller: ModeController): Promise<PromptResult> {
  if (!ctx.hasUI) return { ok: false, reason: "Permission required but no UI is available (headless)." };

  const cat = category(call.toolName);
  const target = targetOf(call);
  const title =
    cat === "Bash"
      ? `Run command?\n\n  ${target}`
      : `${call.toolName} ${target || JSON.stringify(call.input).slice(0, 200)}?`;

  const once = "Yes, once";
  const session = cat === "Edit" ? "Yes, and accept edits for this session" : "Yes, and don't ask again this session";
  const always = "Yes, and always allow in this project (saved)";
  const no = "No";

  const choice = await ctx.ui.select(title, [once, session, always, no]);
  if (!choice || choice === no) return { ok: false, reason: "Denied by user." };

  if (choice === session) {
    if (cat === "Edit") controller.setMode("acceptEdits", ctx);
    else controller.allowForSession(ruleForCall(call));
  } else if (choice === always) {
    controller.allowForProject(call.cwd, ruleForCall(call));
  }
  return { ok: true };
}
