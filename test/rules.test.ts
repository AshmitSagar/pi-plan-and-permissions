import { describe, expect, it } from "vitest";
import { category, isInsideProject, listMatches, parseRule, ruleForCall, targetOf } from "../src/core/rules.ts";
import { globToRegExp } from "../src/core/glob.ts";
import { CWD, bash, tool } from "./helpers.ts";

describe("globToRegExp", () => {
  it("* stays within a segment, ** crosses segments", () => {
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/x/a.ts")).toBe(false);
    expect(globToRegExp("src/**").test("src/x/y/a.ts")).toBe(true);
  });
  it("escapes regex metacharacters", () => {
    expect(globToRegExp("a.b").test("axb")).toBe(false);
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
    expect(globToRegExp("(x)").test("(x)")).toBe(true);
  });
});

describe("parseRule", () => {
  it("parses tool with and without spec", () => {
    expect(parseRule("Bash(npm test:*)")).toEqual({ tool: "Bash", spec: "npm test:*" });
    expect(parseRule("Edit")).toEqual({ tool: "Edit", spec: undefined });
    expect(parseRule("not a rule!")).toBeUndefined();
  });
});

describe("category / targetOf", () => {
  it("maps tools to rule categories", () => {
    expect(category("bash")).toBe("Bash");
    expect(category("powershell")).toBe("Bash");
    expect(category("read")).toBe("Read");
    expect(category("grep")).toBe("Read");
    expect(category("edit")).toBe("Edit");
    expect(category("write")).toBe("Edit");
    expect(category("mcp_thing")).toBe("Other");
  });
  it("extracts the matchable target", () => {
    expect(targetOf(bash("ls"))).toBe("ls");
    expect(targetOf(tool("read", { path: "a.ts" }))).toBe("a.ts");
    expect(targetOf(tool("grep", { pattern: "foo" }))).toBe("foo");
  });
});

describe("isInsideProject", () => {
  it("detects paths that escape the project", () => {
    expect(isInsideProject("src/a.ts", CWD)).toBe(true);
    expect(isInsideProject("", CWD)).toBe(true);
    expect(isInsideProject("../other/a.ts", CWD)).toBe(false);
    expect(isInsideProject("/etc/passwd", CWD)).toBe(false);
  });
});

describe("listMatches", () => {
  it("matches prefix rules on the command alone or followed by arguments", () => {
    const rules = ["Bash(npm run test:*)"];
    expect(listMatches(rules, bash("npm run test"), "all")).toBe(true);
    expect(listMatches(rules, bash("npm run test -- --watch"), "all")).toBe(true);
    expect(listMatches(rules, bash("npm run testing"), "all")).toBe(false);
    expect(listMatches(rules, bash("npm run build"), "all")).toBe(false);
  });

  it("matches glob specs on whole commands", () => {
    expect(listMatches(["Bash(git diff *)"], bash("git diff HEAD"), "all")).toBe(true);
    expect(listMatches(["Bash(git diff *)"], bash("git push"), "all")).toBe(false);
  });

  it("requires EVERY segment of a compound command to match an allow rule", () => {
    const rules = ["Bash(npm test:*)"];
    expect(listMatches(rules, bash("npm test && npm test -- -u"), "all")).toBe(true);
    expect(listMatches(rules, bash("npm test && rm -rf /"), "all")).toBe(false);
    expect(listMatches(rules, bash("npm test & rm -rf /"), "all")).toBe(false);
  });

  it("never proves an allow for commands with substitutions", () => {
    expect(listMatches(["Bash(echo:*)"], bash("echo $(rm -rf /)"), "all")).toBe(false);
  });

  it("any-mode (deny/ask) fires if ANY segment matches", () => {
    expect(listMatches(["Bash(rm:*)"], bash("ls && rm -rf x"), "any")).toBe(true);
    expect(listMatches(["Bash(rm:*)"], bash("ls && cat x"), "any")).toBe(false);
  });

  it("bare tool rules match the whole category", () => {
    expect(listMatches(["Bash"], bash("anything"), "all")).toBe(true);
    expect(listMatches(["Edit"], tool("write", { path: "a.ts" }), "all")).toBe(true);
    expect(listMatches(["Edit"], tool("read", { path: "a.ts" }), "all")).toBe(false);
  });

  it("matches path specs relative to the project", () => {
    expect(listMatches(["Edit(src/**)"], tool("edit", { path: "src/a/b.ts" }), "all")).toBe(true);
    expect(listMatches(["Edit(src/**)"], tool("edit", { path: "lib/b.ts" }), "all")).toBe(false);
    expect(listMatches(["Read(.env*)"], tool("read", { path: ".env.local" }), "any")).toBe(true);
    expect(listMatches(["Read(.env*)"], tool("read", { path: "config/.env" }), "any")).toBe(true);
  });
});

describe("ruleForCall", () => {
  it("builds the rule saved by 'always allow'", () => {
    expect(ruleForCall(bash("npm test"))).toBe("Bash(npm test)");
    expect(ruleForCall(tool("write", { path: "a" }))).toBe("Edit");
    expect(ruleForCall(tool("read", { path: "a" }))).toBe("Read");
    expect(ruleForCall(tool("custom"))).toBe("custom");
  });
});
