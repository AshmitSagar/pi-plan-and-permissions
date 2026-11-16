import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activate } from "../src/pi/activate.ts";
import { shiftTabIsFree } from "../src/pi/shortcuts.ts";
import { makeFakePi, makeTempDirs } from "./fake-pi.ts";

let dirs: ReturnType<typeof makeTempDirs>;
beforeEach(() => {
  dirs = makeTempDirs();
  process.env.PI_CODING_AGENT_DIR = dirs.agent;
});
afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  dirs.cleanup();
});

const keybindings = (value: unknown) => fs.writeFileSync(path.join(dirs.agent, "keybindings.json"), JSON.stringify(value));

describe("shiftTabIsFree", () => {
  it("is false by default: Pi reserves shift+tab for thinking level", () => {
    expect(shiftTabIsFree()).toBe(false);
  });
  it("is true once app.thinking.cycle moves elsewhere", () => {
    keybindings({ "app.thinking.cycle": "alt+t" });
    expect(shiftTabIsFree()).toBe(true);
    keybindings({ "app.thinking.cycle": ["alt+t", "ctrl+t"] });
    expect(shiftTabIsFree()).toBe(true);
  });
  it("is false while the built-in action still includes shift+tab", () => {
    keybindings({ "app.thinking.cycle": ["alt+t", "shift+tab"] });
    expect(shiftTabIsFree()).toBe(false);
  });
});

describe("shortcut registration", () => {
  it("always registers ctrl+alt+m, and shift+tab only when free", () => {
    const a = makeFakePi();
    activate(a.pi);
    expect([...a.shortcuts.keys()]).toEqual(["ctrl+alt+m"]);

    keybindings({ "app.thinking.cycle": "alt+t" });
    const b = makeFakePi();
    activate(b.pi);
    expect([...b.shortcuts.keys()]).toEqual(["ctrl+alt+m", "shift+tab"]);
  });
});
