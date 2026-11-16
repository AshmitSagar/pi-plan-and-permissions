import type { ToolCall } from "../src/core/rules.ts";

export const CWD = "/work/project";

export const bash = (command: string): ToolCall => ({ toolName: "bash", input: { command }, cwd: CWD });
export const tool = (toolName: string, input: Record<string, unknown> = {}): ToolCall => ({ toolName, input, cwd: CWD });
