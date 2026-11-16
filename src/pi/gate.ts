import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { decide } from "../core/policy.ts";
import type { ToolCall } from "../core/rules.ts";
import type { ModeController } from "./controller.ts";
import { askPermission } from "./permission-prompt.ts";

/** Wire the policy into Pi's tool_call hook. This is the only place a tool call can be blocked. */
export function registerGate(pi: ExtensionAPI, controller: ModeController): void {
  pi.on("tool_call", async (event, ctx) => {
    const call: ToolCall = {
      toolName: event.toolName,
      input: (event.input ?? {}) as Record<string, unknown>,
      cwd: ctx.cwd,
    };

    const decision = decide({
      call,
      mode: controller.mode,
      rules: controller.rules,
      sessionAllow: controller.sessionAllow,
    });

    if (decision.type === "allow") return;
    if (decision.type === "deny") return { block: true, reason: decision.reason };

    const answer = await askPermission(ctx, call, controller);
    return answer.ok ? undefined : { block: true, reason: answer.reason ?? "Denied." };
  });
}
