import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MODES, modeLabel, parseMode } from "../core/modes.ts";
import type { ModeController } from "./controller.ts";

export function registerCommands(pi: ExtensionAPI, controller: ModeController): void {
  pi.registerCommand("mode", {
    description: "Show or set permission mode (default | acceptEdits | plan | bypassPermissions)",
    handler: async (args, ctx) => {
      const want = args.trim();
      if (!want) return controller.cycle(ctx);
      const mode = parseMode(want);
      if (!mode) return ctx.ui.notify(`Unknown mode. Use: ${MODES.join(", ")}`, "error");
      controller.setMode(mode, ctx);
    },
  });

  pi.registerCommand("plan", {
    description: "Toggle plan mode",
    handler: async (_args, ctx) => controller.setMode(controller.mode === "plan" ? "default" : "plan", ctx),
  });

  pi.registerCommand("permissions", {
    description: "Show the current mode and the active allow / ask / deny rules",
    handler: async (_args, ctx) => {
      const { allow, ask, deny } = controller.rules;
      const list = (title: string, rules: readonly string[]) => `${title} (${rules.length}):${rules.length ? "\n  " + rules.join("\n  ") : " none"}`;
      ctx.ui.notify(
        [
          `Mode: ${modeLabel(controller.mode)}`,
          `Plans saved to: ${controller.plansDir}`,
          list("deny", deny),
          list("ask", ask),
          list("allow", allow),
          list("allowed this session", controller.sessionAllow),
        ].join("\n"),
        "info",
      );
    },
  });
}
