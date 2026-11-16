import * as fs from "node:fs";
import * as path from "node:path";
import { defaultPlansDir } from "./paths.ts";

/** Save an approved plan as markdown (default: <agentDir>/plans/) and return its path. */
export function savePlan(cwd: string, plan: string, dir: string = defaultPlansDir()): string {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const project = path.basename(cwd).replace(/[^\w.-]+/g, "_");
  const file = path.join(dir, `${project}-${stamp}.md`);
  fs.writeFileSync(file, plan.endsWith("\n") ? plan : plan + "\n");
  return file;
}
