import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";
import { keybindingsFile } from "../infra/paths.ts";
import { readJson } from "../infra/settings.ts";
import type { ModeController } from "./controller.ts";

const DEFAULT_KEY: KeyId = "ctrl+alt+m";
const CLAUDE_CODE_KEY: KeyId = "shift+tab";

/**
 * Pi reserves Shift+Tab for "cycle thinking level" and refuses to let extensions take reserved keys
 * (it logs a warning on every start). So we only claim Shift+Tab once the user has moved that built-in
 * action elsewhere in ~/.pi/agent/keybindings.json, e.g. { "app.thinking.cycle": "alt+t" }.
 */
export function shiftTabIsFree(): boolean {
  const bound = readJson(keybindingsFile())["app.thinking.cycle"];
  if (bound === undefined) return false;
  const keys: unknown[] = Array.isArray(bound) ? bound : [bound];
  return !keys.some((k) => String(k).toLowerCase() === CLAUDE_CODE_KEY);
}

export function registerShortcuts(pi: ExtensionAPI, controller: ModeController): void {
  const keys: KeyId[] = [DEFAULT_KEY];
  if (shiftTabIsFree()) keys.push(CLAUDE_CODE_KEY);
  for (const key of keys) {
    pi.registerShortcut(key, {
      description: "Cycle permission mode",
      handler: (ctx) => controller.cycle(ctx),
    });
  }
}
