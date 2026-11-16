import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.ts";
import { ModeController } from "./controller.ts";
import { registerGate } from "./gate.ts";
import { registerFlags, registerLifecycle } from "./lifecycle.ts";
import { registerShortcuts } from "./shortcuts.ts";
import { registerAskUserQuestion } from "./tools/ask-user-question.ts";
import { registerExitPlanMode } from "./tools/exit-plan-mode.ts";

/** Composition root: builds the controller and plugs every feature into Pi. */
export function activate(pi: ExtensionAPI): void {
  const controller = new ModeController(pi);

  registerFlags(pi);
  registerLifecycle(pi, controller);
  registerGate(pi, controller);
  registerAskUserQuestion(pi);
  registerExitPlanMode(pi, controller);
  registerCommands(pi, controller);
  registerShortcuts(pi, controller);
}
