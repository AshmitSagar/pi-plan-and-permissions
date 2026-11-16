import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Markdown, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";

export type PlanChoice = "approveEdits" | "approveManual" | "edit" | "keep";

export const PLAN_CHOICES: readonly { id: PlanChoice; label: string }[] = [
  { id: "approveEdits", label: "Yes, and auto-accept edits" },
  { id: "approveManual", label: "Yes, and ask before each edit" },
  { id: "edit", label: "Edit the plan first" },
  { id: "keep", label: "No, keep planning (give feedback)" },
];

const FOOTER_ROWS = PLAN_CHOICES.length + 1; // choices + key hints
const CHROME_ROWS = 2 /* title + rule */ + 1 /* rule */ + FOOTER_ROWS + 2 /* breathing room */;

/** Scrollable, markdown-rendered plan with a pinned choice list. */
export class PlanReview implements Component {
  private offset = 0;
  private selected = 0;
  private cachedWidth: number | undefined;
  private cachedLines: string[] = [];
  private totalLines = 0;
  private viewHeight = 10;

  constructor(
    private readonly plan: string,
    private readonly tui: { requestRender(): void },
    private readonly theme: Theme,
    private readonly done: (choice: PlanChoice) => void,
  ) {}

  private body(width: number): string[] {
    if (this.cachedWidth !== width) {
      this.cachedLines = new Markdown(this.plan, 1, 0, getMarkdownTheme()).render(width);
      this.cachedWidth = width;
    }
    return this.cachedLines;
  }

  render(width: number): string[] {
    const t = this.theme;
    const lines = this.body(width);
    const rows = process.stdout.rows || 30;
    const viewHeight = Math.max(5, Math.min(lines.length, rows - CHROME_ROWS));
    const maxOffset = Math.max(0, lines.length - viewHeight);
    this.offset = Math.min(Math.max(0, this.offset), maxOffset);
    this.totalLines = lines.length;
    this.viewHeight = viewHeight;

    const from = lines.length ? this.offset + 1 : 0;
    const to = Math.min(lines.length, this.offset + viewHeight);
    const percent = maxOffset === 0 ? 100 : Math.round((this.offset / maxOffset) * 100);
    const rule = t.fg("muted", "─".repeat(Math.max(1, width)));

    const out: string[] = [];
    out.push(
      truncateToWidth(
        t.fg("accent", t.bold(" Proposed plan")) + t.fg("muted", `  ·  lines ${from}-${to} of ${lines.length}  ·  ${percent}%`),
        width,
      ),
    );
    out.push(rule);
    for (const line of lines.slice(this.offset, this.offset + viewHeight)) out.push(truncateToWidth(line, width));
    out.push(rule);
    PLAN_CHOICES.forEach((c, i) => {
      const active = i === this.selected;
      const text = `${active ? "❯" : " "} ${i + 1}. ${c.label}`;
      out.push(truncateToWidth(" " + (active ? t.fg("accent", text) : text), width));
    });
    out.push(
      truncateToWidth(
        t.fg("muted", " ↑↓/jk scroll · PgUp/PgDn page · g/G top/bottom · Tab/1-4 choose · Enter confirm · e edit · Esc keep planning"),
        width,
      ),
    );
    return out;
  }

  handleInput(data: string): void {
    const page = Math.max(1, this.viewHeight - 1);
    const max = Math.max(0, this.totalLines - this.viewHeight);
    const scroll = (n: number) => {
      this.offset = Math.min(max, Math.max(0, this.offset + n));
    };
    const choices = PLAN_CHOICES.length;

    if (matchesKey(data, "up") || data === "k") scroll(-1);
    else if (matchesKey(data, "down") || data === "j") scroll(1);
    else if (matchesKey(data, "pageUp") || data === "b") scroll(-page);
    else if (matchesKey(data, "pageDown") || data === " " || data === "f") scroll(page);
    else if (matchesKey(data, "home") || data === "g") this.offset = 0;
    else if (matchesKey(data, "end") || data === "G") this.offset = max;
    else if (matchesKey(data, "shift+tab")) this.selected = (this.selected + choices - 1) % choices;
    else if (matchesKey(data, "tab")) this.selected = (this.selected + 1) % choices;
    else if (/^[1-4]$/.test(data)) return this.done(PLAN_CHOICES[Number(data) - 1].id);
    else if (data === "e") return this.done("edit");
    else if (matchesKey(data, "enter")) return this.done(PLAN_CHOICES[this.selected].id);
    else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) return this.done("keep");

    this.tui.requestRender();
  }

  invalidate(): void {
    this.cachedWidth = undefined;
  }
}

/** Show the plan and return the user's choice. Falls back to a plain select where custom UI is unavailable. */
export async function reviewPlan(ctx: ExtensionContext, plan: string): Promise<PlanChoice> {
  if (ctx.mode === "tui") {
    try {
      const choice = await ctx.ui.custom<PlanChoice>((tui, theme, _keybindings, done) => new PlanReview(plan, tui, theme, done));
      return choice ?? "keep";
    } catch {
      /* fall through to the select fallback */
    }
  }
  const lines = plan.split("\n");
  const preview =
    lines.slice(0, 40).join("\n") +
    (lines.length > 40 ? `\n… (${lines.length - 40} more lines; choose “Edit the plan first” to read all)` : "");
  const picked = await ctx.ui.select(
    `Proposed plan\n\n${preview}\n\nReady to proceed?`,
    PLAN_CHOICES.map((c) => c.label),
  );
  return PLAN_CHOICES.find((c) => c.label === picked)?.id ?? "keep";
}
