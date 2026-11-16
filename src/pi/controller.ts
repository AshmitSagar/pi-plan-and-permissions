import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ASK_TOOL, EXIT_TOOL, PLAN_TOOLS } from "../core/constants.ts";
import { modeLabel, nextMode, parseMode, type Mode } from "../core/modes.ts";
import { emptyRules, type Rules } from "../core/rules.ts";
import { resolvePlansDir } from "../infra/paths.ts";
import { loadSettings, saveProjectAllow } from "../infra/settings.ts";

export const MODE_ENTRY = "permission-mode";
export const MODE_FLAG = "permission-mode";

interface SavedMode {
  mode?: Mode;
  toolsBeforePlan?: string[];
}

/**
 * Owns all mutable state of the extension: the current mode, the loaded rules, session-scoped
 * allowances, and the tool set swapped in and out of plan mode. Everything else is stateless.
 */
export class ModeController {
  mode: Mode = "default";
  rules: Rules = emptyRules();
  /** Where approved plans are written. */
  plansDir = resolvePlansDir(undefined, process.cwd());
  readonly sessionAllow: string[] = [];
  private toolsBeforePlan: string[] | undefined;

  constructor(private readonly pi: ExtensionAPI) {}

  /** Called on session start: load rules, then pick the mode from flag > saved session state > settings > default. */
  init(ctx: ExtensionContext): void {
    const settings = loadSettings(ctx.cwd);
    this.rules = settings.rules;
    this.plansDir = resolvePlansDir(settings.plansDir, ctx.cwd);

    const saved = this.readSaved(ctx);
    const fromFlag = parseMode(this.pi.getFlag(MODE_FLAG));

    this.mode = fromFlag ?? parseMode(saved?.mode) ?? settings.defaultMode ?? "default";
    this.toolsBeforePlan = saved?.toolsBeforePlan;
    this.applyTools(this.mode);
    this.refreshStatus(ctx);
    if (!saved || saved.mode !== this.mode) this.persist();
  }

  setMode(next: Mode, ctx: ExtensionContext, opts: { quiet?: boolean } = {}): void {
    if (next === this.mode) return this.refreshStatus(ctx);
    this.applyTools(next);
    this.mode = next;
    this.refreshStatus(ctx);
    this.persist();
    if (!opts.quiet) {
      ctx.ui.notify(`Permission mode: ${modeLabel(next)}`, next === "bypassPermissions" ? "warning" : "info");
    }
  }

  cycle(ctx: ExtensionContext): void {
    this.setMode(nextMode(this.mode), ctx);
  }

  allowForSession(rule: string): void {
    if (!this.sessionAllow.includes(rule)) this.sessionAllow.push(rule);
  }

  allowForProject(cwd: string, rule: string): void {
    saveProjectAllow(cwd, rule);
    if (!this.rules.allow.includes(rule)) this.rules.allow.push(rule);
  }

  refreshStatus(ctx: ExtensionContext): void {
    const color =
      this.mode === "bypassPermissions" ? "error" : this.mode === "plan" ? "warning" : this.mode === "acceptEdits" ? "accent" : "muted";
    ctx.ui.setStatus(MODE_ENTRY, ctx.ui.theme.fg(color, `⏵ ${modeLabel(this.mode)}`));
  }

  private persist(): void {
    const data: SavedMode = { mode: this.mode, toolsBeforePlan: this.toolsBeforePlan };
    this.pi.appendEntry(MODE_ENTRY, data);
  }

  private readSaved(ctx: ExtensionContext): SavedMode | undefined {
    const entries = ctx.sessionManager.getEntries();
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.type === "custom" && e.customType === MODE_ENTRY) return e.data as SavedMode | undefined;
    }
    return undefined;
  }

  /** Plan mode shows only read-only tools plus our two interaction tools; every other mode hides exit_plan_mode. */
  private applyTools(target: Mode): void {
    if (target === "plan") {
      this.toolsBeforePlan ??= this.pi.getActiveTools().filter((t) => t !== EXIT_TOOL);
      const keep = PLAN_TOOLS.filter((t) => this.toolsBeforePlan!.includes(t));
      this.pi.setActiveTools([...keep, ASK_TOOL, EXIT_TOOL]);
    } else {
      const base = this.toolsBeforePlan ?? this.pi.getActiveTools();
      this.pi.setActiveTools(base.filter((t) => t !== EXIT_TOOL));
      this.toolsBeforePlan = undefined;
    }
  }
}
