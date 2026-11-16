import { describe, expect, it } from "vitest";
import { EXIT_TOOL } from "../src/core/constants.ts";
import { PLAN_TEMPLATE, checkPlanFormat } from "../src/core/plan-format.ts";
import { PLAN_PROMPT } from "../src/core/prompts.ts";

const GOOD = `# Add retry logic

## Context
Requests fail on flaky networks, so the client should retry transient errors with backoff.

## Approach
Wrap fetch in a helper.

## Implementation steps
### Phase 1 - Helper
- [ ] Create retry helper - \`src/retry.ts\` (new)

## Verification
Run \`npm test\` and simulate a 503.
`;

describe("checkPlanFormat", () => {
  it("accepts a complete plan", () => {
    expect(checkPlanFormat(GOOD)).toBeUndefined();
  });

  it("accepts the template itself", () => {
    expect(checkPlanFormat(PLAN_TEMPLATE)).toBeUndefined();
  });

  it("rejects missing sections and names them", () => {
    const noVerify = GOOD.replace(/## Verification[\s\S]*/, "");
    expect(checkPlanFormat(noVerify)).toContain("Verification");
    const noContext = GOOD.replace(/## Context\n.*\n/, "");
    expect(checkPlanFormat(noContext)).toContain("Context");
  });

  it("rejects plans that are too short", () => {
    expect(checkPlanFormat("# Plan\n## Context\nx\n## Steps\ny\n## Verify\nz")).toContain("too short");
  });

  it("feeds the template back to the model on rejection", () => {
    const msg = checkPlanFormat("just do it")!;
    expect(msg).toContain(EXIT_TOOL);
    expect(msg).toContain("## Implementation steps");
  });
});

describe("plan prompt", () => {
  it("describes every phase and embeds the template", () => {
    for (const phase of ["UNDERSTAND", "EXPLORE", "DESIGN", "WRITE THE PLAN", "SUBMIT"]) {
      expect(PLAN_PROMPT).toContain(phase);
    }
    expect(PLAN_PROMPT).toContain("## Verification");
    expect(PLAN_PROMPT).toContain("ask_user_question");
  });
});
