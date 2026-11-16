import { EXIT_TOOL } from "./constants.ts";

export const PLAN_TEMPLATE = `# <Short title>

## Context
Why this change is needed and the intended outcome (2-4 sentences).

## Approach
The chosen design and why. One line each for alternatives you rejected.

## Implementation steps
### Phase 1 - <name>
- [ ] <concrete step> - \`path/to/file\` (what changes)
### Phase 2 - <name>
- [ ] <concrete step> - \`path/to/file\` (what changes)

## Critical files
- \`path/to/file\` - its role in the change

## Risks & open questions
- <risk, assumption, or question for the user>

## Verification
Exact commands and checks that prove it works (tests, manual steps, edge cases).`;

const MIN_PLAN_LENGTH = 150;

/** Returns an error message for the model when required sections are missing, otherwise undefined. */
export function checkPlanFormat(plan: string): string | undefined {
  const missing: string[] = [];
  if (!/^#{1,3}\s*.*\b(context|goal|summary|background)\b/im.test(plan)) missing.push("Context");
  if (!/^#{1,3}\s*.*\b(steps|implementation|phase|changes)\b/im.test(plan)) {
    missing.push("Implementation steps (grouped in phases)");
  }
  if (!/^#{1,3}\s*.*\b(verif|test|validation)/im.test(plan)) missing.push("Verification");
  if (plan.length < MIN_PLAN_LENGTH) missing.push("enough detail (the plan is too short)");
  if (!missing.length) return undefined;
  return (
    `The plan was rejected before reaching the user because it is missing: ${missing.join(", ")}. ` +
    `Rewrite it using this structure and call ${EXIT_TOOL} again:\n\n${PLAN_TEMPLATE}`
  );
}
