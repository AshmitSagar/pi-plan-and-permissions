import { describe, expect, it } from "vitest";
import { isReadOnlyBash, splitCommand, stripSafeRedirects } from "../src/core/shell.ts";

describe("splitCommand", () => {
  it("splits on every shell separator", () => {
    expect(splitCommand("a && b || c; d | e")).toEqual(["a", "b", "c", "d", "e"]);
    expect(splitCommand("a\nb")).toEqual(["a", "b"]);
  });

  it("treats a lone & (background) as a separator", () => {
    expect(splitCommand("npm test & rm -rf /")).toEqual(["npm test", "rm -rf /"]);
  });

  it("does not split on redirections", () => {
    expect(splitCommand("npm test 2>&1")).toEqual(["npm test 2>&1"]);
    expect(splitCommand("ls &> out.txt")).toEqual(["ls &> out.txt"]);
    expect(splitCommand("ls >&2")).toEqual(["ls >&2"]);
  });

  it("refuses commands with substitutions", () => {
    expect(splitCommand("cat $(whoami)")).toBeUndefined();
    expect(splitCommand("echo `id`")).toBeUndefined();
    expect(splitCommand("diff <(a) <(b)")).toBeUndefined();
  });
});

describe("stripSafeRedirects", () => {
  it("removes only harmless redirects", () => {
    expect(stripSafeRedirects("git log 2>&1").includes(">")).toBe(false);
    expect(stripSafeRedirects("ls 2>/dev/null").includes(">")).toBe(false);
    expect(stripSafeRedirects("ls &>/dev/null").includes(">")).toBe(false);
    expect(stripSafeRedirects("cat a > b").includes(">")).toBe(true);
  });
});

describe("isReadOnlyBash", () => {
  it.each([
    "ls -la",
    "git log 2>&1",
    "git log --oneline 2>/dev/null | head",
    "ls &> /dev/null",
    "grep foo file | wc -l",
    "ls 2>&1 | grep x",
    "git diff HEAD~1",
    "find . -name '*.ts'",
    "node --version",
  ])("allows %s", (cmd) => expect(isReadOnlyBash(cmd)).toBe(true));

  it.each([
    "cat a > b",
    "echo hi >> f",
    "ls & rm -rf x",
    "ls && rm x",
    "git diff; rm x",
    "cat $(rm x)",
    "find . -name a -delete",
    "find . -exec rm {} ;",
    "sed -i s/a/b/ f",
    "sudo ls",
    "ls | tee out.txt",
    "git push",
    "npm install",
    "rm -rf /",
  ])("blocks %s", (cmd) => expect(isReadOnlyBash(cmd)).toBe(false));
});
