import { beforeAll, describe, expect, it } from "vitest";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { PLAN_CHOICES, PlanReview, type PlanChoice } from "../src/pi/plan-review.ts";

const theme: any = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

const LONG_PLAN =
  "# Big plan\n\n## Context\nWhy.\n\n## Implementation steps\n" +
  Array.from({ length: 80 }, (_, i) => `- [ ] step number ${i + 1} - \`src/file${i}.ts\``).join("\n") +
  "\n\n## Verification\nRun the tests.";

const KEY = { up: "\x1b[A", down: "\x1b[B", pageDown: "\x1b[6~", pageUp: "\x1b[5~", home: "\x1b[H", end: "\x1b[F", tab: "\t", shiftTab: "\x1b[Z", enter: "\r", esc: "\x1b" };

function open(plan = LONG_PLAN) {
  let result: PlanChoice | undefined;
  let renders = 0;
  const view = new PlanReview(plan, { requestRender: () => void renders++ }, theme, (c) => (result = c));
  const lines = () => view.render(100).map(strip);
  return { view, lines, result: () => result, renders: () => renders };
}

beforeAll(() => {
  try {
    initTheme();
  } catch {
    /* theme may already be initialised */
  }
});

describe("PlanReview", () => {
  it("renders markdown (not raw syntax) with header, body and pinned choices", () => {
    const { lines } = open();
    const out = lines();
    expect(out[0]).toContain("Proposed plan");
    expect(out.join("\n")).toContain("Big plan");
    expect(out.join("\n")).not.toContain("## Context"); // headings rendered, not shown as raw markdown
    for (const c of PLAN_CHOICES) expect(out.join("\n")).toContain(c.label);
  });

  it("fits inside the terminal: a long plan never renders more rows than the screen", () => {
    const rows = process.stdout.rows || 30;
    expect(open().lines().length).toBeLessThanOrEqual(rows);
  });

  it("scrolls with arrows, pages and home/end, so the whole plan is reachable", () => {
    const { view, lines } = open();
    const top = lines().join("\n");
    expect(top).not.toContain("Run the tests.");

    view.handleInput(KEY.down);
    expect(lines().join("\n")).not.toBe(top);

    view.handleInput(KEY.home);
    expect(lines().join("\n")).toBe(top);

    for (let i = 0; i < 20; i++) view.handleInput(KEY.pageDown);
    expect(lines().join("\n")).toContain("Run the tests.");
    expect(lines()[0]).toContain("100%");

    view.handleInput(KEY.pageUp);
    expect(lines()[0]).not.toContain("100%");

    view.handleInput(KEY.end);
    expect(lines().join("\n")).toContain("Run the tests.");
    view.handleInput("g");
    expect(lines().join("\n")).toBe(top);
  });

  it("vim keys scroll too", () => {
    const { view, lines } = open();
    const top = lines().join("\n");
    view.handleInput("j");
    expect(lines().join("\n")).not.toBe(top);
    view.handleInput("k");
    expect(lines().join("\n")).toBe(top);
    view.handleInput("G");
    expect(lines().join("\n")).toContain("Run the tests.");
  });

  it("never scrolls past either end", () => {
    const { view, lines } = open();
    view.handleInput(KEY.up);
    view.handleInput(KEY.up);
    expect(lines()[0]).toContain("lines 1-");
    for (let i = 0; i < 50; i++) view.handleInput(KEY.pageDown);
    const before = lines().join("\n");
    view.handleInput(KEY.pageDown);
    expect(lines().join("\n")).toBe(before);
  });

  it("requests a re-render on scroll", () => {
    const { view, renders } = open();
    view.handleInput(KEY.down);
    expect(renders()).toBeGreaterThan(0);
  });

  it("a short plan shows 100% and needs no scrolling", () => {
    const out = open("# Tiny\n\n## Context\nx").lines();
    expect(out[0]).toContain("100%");
  });

  it("number keys pick an option directly", () => {
    PLAN_CHOICES.forEach((c, i) => {
      const { view, result } = open();
      view.handleInput(String(i + 1));
      expect(result()).toBe(c.id);
    });
  });

  it("Tab / Shift+Tab move the highlight, Enter confirms it", () => {
    const a = open();
    a.view.handleInput(KEY.tab);
    a.view.handleInput(KEY.enter);
    expect(a.result()).toBe(PLAN_CHOICES[1].id);

    const b = open();
    b.view.handleInput(KEY.shiftTab); // wraps to the last option
    b.view.handleInput(KEY.enter);
    expect(b.result()).toBe(PLAN_CHOICES[PLAN_CHOICES.length - 1].id);
  });

  it("Enter with no movement approves with auto-accept (first option)", () => {
    const { view, result } = open();
    view.handleInput(KEY.enter);
    expect(result()).toBe("approveEdits");
  });

  it("'e' edits and Esc keeps planning", () => {
    const a = open();
    a.view.handleInput("e");
    expect(a.result()).toBe("edit");
    const b = open();
    b.view.handleInput(KEY.esc);
    expect(b.result()).toBe("keep");
  });

  it("re-wraps when the terminal width changes", () => {
    const { view } = open("# T\n\n## Context\n" + "word ".repeat(80));
    const wide = view.render(120).length;
    view.invalidate();
    const narrow = view.render(40).length;
    expect(narrow).toBeGreaterThan(wide);
  });
});
