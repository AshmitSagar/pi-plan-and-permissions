import * as os from "node:os";
import * as path from "node:path";

/** Pi's per-user directory. Read lazily so tests and PI_CODING_AGENT_DIR overrides work. */
export const agentDir = (): string => process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");

export const globalPermissionsFile = (): string => path.join(agentDir(), "permissions.json");
export const projectPermissionsFile = (cwd: string): string => path.join(cwd, ".pi", "permissions.json");
export const keybindingsFile = (): string => path.join(agentDir(), "keybindings.json");
export const defaultPlansDir = (): string => path.join(agentDir(), "plans");

/**
 * Resolve the `plansDir` setting. Unset -> <agentDir>/plans. `~` expands to the home directory,
 * absolute paths are used as-is, and relative paths are resolved against the project directory.
 */
export function resolvePlansDir(setting: string | undefined, cwd: string): string {
  const value = setting?.trim();
  if (!value) return defaultPlansDir();
  if (value === "~") return os.homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(cwd, value);
}
