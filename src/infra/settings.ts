import * as fs from "node:fs";
import * as path from "node:path";
import { parseMode, type Mode } from "../core/modes.ts";
import { emptyRules, type Rules } from "../core/rules.ts";
import { globalPermissionsFile, projectPermissionsFile } from "./paths.ts";

export interface Settings {
  rules: Rules;
  defaultMode?: Mode;
  /** Raw `plansDir` setting (resolve with resolvePlansDir). The project's value wins over the global one. */
  plansDir?: string;
}

export function readJson(file: string): Record<string, any> {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** Global settings first, then project settings: rule lists are concatenated, the project's defaultMode wins. */
export function loadSettings(cwd: string): Settings {
  const rules = emptyRules();
  let defaultMode: Mode | undefined;
  let plansDir: string | undefined;
  for (const file of [globalPermissionsFile(), projectPermissionsFile(cwd)]) {
    const json = readJson(file);
    for (const key of ["allow", "ask", "deny"] as const) {
      const list = json.permissions?.[key];
      if (Array.isArray(list)) rules[key].push(...list.filter((x: unknown): x is string => typeof x === "string"));
    }
    defaultMode = parseMode(json.defaultMode) ?? defaultMode;
    if (typeof json.plansDir === "string" && json.plansDir.trim()) plansDir = json.plansDir;
  }
  return { rules, defaultMode, plansDir };
}

/** Persist a rule to <project>/.pi/permissions.json ("always allow in this project"). */
export function saveProjectAllow(cwd: string, rule: string): void {
  const file = projectPermissionsFile(cwd);
  const json = readJson(file);
  json.permissions ??= {};
  json.permissions.allow ??= [];
  if (!json.permissions.allow.includes(rule)) json.permissions.allow.push(rule);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}
