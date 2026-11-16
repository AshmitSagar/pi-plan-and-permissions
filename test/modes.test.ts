import { describe, expect, it } from "vitest";
import { MODES, modeLabel, nextMode, parseMode, type Mode } from "../src/core/modes.ts";

describe("modes", () => {
  it("parses canonical names and aliases", () => {
    expect(parseMode("plan")).toBe("plan");
    expect(parseMode("manual")).toBe("default");
    expect(parseMode("ask")).toBe("default");
    expect(parseMode("accept")).toBe("acceptEdits");
    expect(parseMode("bypass")).toBe("bypassPermissions");
    expect(parseMode("yolo")).toBe("bypassPermissions");
  });

  it("rejects anything else", () => {
    expect(parseMode("nope")).toBeUndefined();
    expect(parseMode(undefined)).toBeUndefined();
    expect(parseMode(42)).toBeUndefined();
    expect(parseMode("")).toBeUndefined();
  });

  it("cycles through every mode and wraps", () => {
    let m: Mode = MODES[0];
    const seen: Mode[] = [m];
    for (let i = 0; i < MODES.length; i++) seen.push((m = nextMode(m)));
    expect(seen.slice(0, MODES.length)).toEqual([...MODES]);
    expect(seen[MODES.length]).toBe(MODES[0]);
  });

  it("has a label for every mode", () => {
    for (const m of MODES) expect(modeLabel(m)).toBeTruthy();
  });
});
