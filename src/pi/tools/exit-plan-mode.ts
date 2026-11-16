import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { EXIT_TOOL } from "../../core/constants.ts";
import { modeLabel, type Mode } from "../../core/modes.ts";
import { checkPlanFormat } from "../../core/plan-format.ts";
import { savePlan } from "../../infra/plan-store.ts";
import type { ModeController } from "../controller.ts";
import { reviewPlan } from "../plan-review.ts";

const text = (value: string) => [{ type: "text" as const, text: value }];

/** The model's way out of plan mode: it submits a structured plan, the user approves, edits or rejects it. */
export function registerExitPlanMode(pi: ExtensionAPI, controller: ModeController): void {
  pi.registerTool({
    name: EXIT_TOOL,
    label: "Exit plan mode",
    description:
      "Use ONLY in plan mode, once research is finished and you are ready to present your implementation plan " +
      "for the user's approval. Pass the complete plan in markdown using the required structure " +
      "(Context, Approach, Implementation steps grouped in phases, Critical files, Risks & open questions, Verification). " +
      "The user will approve, edit, or reject it.",
    promptSnippet: "exit_plan_mode: submit your finished, structured plan for user approval (plan mode only)",
    parameters: Type.Object({
      plan: Type.String({ description: "The complete implementation plan, in markdown, following the required structure" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (controller.mode !== "plan") throw new Error(`${EXIT_TOOL} can only be used in plan mode.`);
      if (!ctx.hasUI) throw new Error("Plan approval needs an interactive session (no UI available).");

      let plan = params.plan.trim();
      const formatProblem = checkPlanFormat(plan);
      if (formatProblem) throw new Error(formatProblem);

      let edited = false;
      while (true) {
        const choice = await reviewPlan(ctx, plan);

        if (choice === "edit") {
          const next = (await ctx.ui.editor("Edit the plan:", plan))?.trim();
          if (next && next !== plan) {
            plan = next;
            edited = true;
          }
          continue;
        }

        if (choice === "keep") {
          const feedback = (await ctx.ui.editor("What should change in the plan? (optional)", ""))?.trim();
          return {
            content: text(
              "The user did NOT approve the plan. Stay in plan mode and revise it." +
                (feedback ? `\n\nUser feedback:\n${feedback}` : "") +
                `\nWhen ready, call ${EXIT_TOOL} again with the updated plan.`,
            ),
            details: { approved: false },
          };
        }

        const file = savePlan(ctx.cwd, plan, controller.plansDir);
        const next: Mode = choice === "approveEdits" ? "acceptEdits" : "default";
        controller.setMode(next, ctx, { quiet: true });
        ctx.ui.notify(`Plan approved (${modeLabel(next)}). Saved to ${file}`, "info");
        return {
          content: text(
            `The user approved the plan${edited ? " (they edited it; follow this version)" : ""}. ` +
              `Plan mode is off and ${next === "acceptEdits" ? "edits are auto-approved" : "edits need approval"}. ` +
              `Start implementing now, phase by phase.\n\nApproved plan:\n\n${plan}`,
          ),
          details: { approved: true, file, mode: next },
        };
      }
    },
  });
}
