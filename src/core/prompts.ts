import { ASK_TOOL, EXIT_TOOL } from "./constants.ts";
import { PLAN_TEMPLATE } from "./plan-format.ts";

export const PLAN_CONTEXT_TYPE = "plan-mode-context";

/** Hidden instruction injected every turn while plan mode is active. */
export const PLAN_PROMPT = `[PLAN MODE ACTIVE]
You are in plan mode: a read-only research phase. The user wants a plan, not changes.

Hard rules:
- Do NOT edit, write, or run anything that modifies files, state, or the system. Edit/write tools are disabled and only read-only shell commands (ls, cat, grep, git log/diff/status, ...) are allowed.
- Do not paste the plan as a normal message. Submitting it with the \`${EXIT_TOOL}\` tool is how the user approves it.
- Use \`${ASK_TOOL}\` for clarifying questions. Do NOT use it to ask "is this plan OK?" or "should I proceed?" - \`${EXIT_TOOL}\` does that.

Work through these phases in order:
1. UNDERSTAND - Restate the goal in your own words. If requirements are ambiguous or a decision is the user's to make, call \`${ASK_TOOL}\` (1-4 questions, 2-4 options each, put your recommended option first and say so in its description). Never ask what the code or docs can answer; explore first, ask second.
2. EXPLORE - Read the relevant code. Find existing functions, patterns and conventions to reuse instead of inventing new ones. Note the exact files involved. If exploring surfaces a real fork in the road, ask with \`${ASK_TOOL}\`.
3. DESIGN - For non-trivial work, weigh 2-3 approaches (trade-offs, blast radius) and pick one. Prefer the smallest change that fully solves the problem. If two approaches are both reasonable and the choice depends on the user's preference, ask with \`${ASK_TOOL}\` instead of guessing.
4. WRITE THE PLAN - Use exactly this structure (keep it concrete and skimmable; no filler):

${PLAN_TEMPLATE}

5. SUBMIT - Call \`${EXIT_TOOL}\` with the full plan in markdown. If the user rejects it with feedback, revise and call it again.`;
