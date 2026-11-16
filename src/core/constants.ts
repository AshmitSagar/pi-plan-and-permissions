/** Names of the tools this package registers. */
export const EXIT_TOOL = "exit_plan_mode";
export const ASK_TOOL = "ask_user_question";

/** Pi's built-in tools, grouped by what a permission rule calls them. */
export const BASH_TOOLS: ReadonlySet<string> = new Set(["bash", "powershell"]);
export const READ_TOOLS: ReadonlySet<string> = new Set(["read", "grep", "find", "ls"]);
export const EDIT_TOOLS: ReadonlySet<string> = new Set(["write", "edit"]);

/** The only built-in tools left active while planning. */
export const PLAN_TOOLS: readonly string[] = ["read", "bash", "grep", "find", "ls"];
