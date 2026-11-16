import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PLAN_CONTEXT_TYPE, PLAN_PROMPT } from "../core/prompts.ts";
import { MODE_FLAG, type ModeController } from "./controller.ts";

export function registerFlags(pi: ExtensionAPI): void {
  // Pi already owns `--mode` (output format), so ours is `--permission-mode`.
  pi.registerFlag(MODE_FLAG, {
    description: "Start in a permission mode: default | acceptEdits | plan | bypassPermissions (aliases: ask, manual, accept, bypass)",
    type: "string",
  });
}

export function registerLifecycle(pi: ExtensionAPI, controller: ModeController): void {
  pi.on("session_start", (_event, ctx) => controller.init(ctx));

  // While planning, remind the model of the rules and phases on every turn (hidden from the transcript).
  pi.on("before_agent_start", () => {
    if (controller.mode !== "plan") return;
    return { message: { customType: PLAN_CONTEXT_TYPE, content: PLAN_PROMPT, display: false } };
  });

  // Once plan mode is over, drop the stale instructions from the model's context.
  pi.on("context", (event) => {
    if (controller.mode === "plan") return;
    const messages = event.messages.filter((m) => (m as { customType?: string }).customType !== PLAN_CONTEXT_TYPE);
    return { messages };
  });
}
