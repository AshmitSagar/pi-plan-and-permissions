import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ASK_TOOL } from "../../core/constants.ts";

interface AskOption {
  label: string;
  description?: string;
}
interface AskQuestion {
  question: string;
  header?: string;
  options: AskOption[];
  multiSelect?: boolean;
}

const OTHER_LABEL = "Other (type your own answer)";

/** Ask one question. Returns the answer text, or undefined if the user dismissed it. */
async function askOne(ctx: ExtensionContext, q: AskQuestion): Promise<string | undefined> {
  const title = `${q.header ? `[${q.header}] ` : ""}${q.question}`;
  const labels = q.options.map((o) => (o.description ? `${o.label} — ${o.description}` : o.label));
  const typeOwn = async () => (await ctx.ui.input(title, "Type your answer"))?.trim() || undefined;

  if (!q.multiSelect) {
    const picked = await ctx.ui.select(title, [...labels, OTHER_LABEL]);
    if (!picked) return undefined;
    if (picked === OTHER_LABEL) return typeOwn();
    return q.options[labels.indexOf(picked)]?.label;
  }

  const chosen = new Set<number>();
  let custom: string | undefined;
  while (true) {
    const items = labels.map((l, i) => `${chosen.has(i) ? "[x]" : "[ ]"} ${l}`);
    const done = `Done (${chosen.size} selected${custom ? " + your own" : ""})`;
    const picked = await ctx.ui.select(`${title}\n(pick any number, toggle with Enter, then choose Done)`, [...items, OTHER_LABEL, done]);
    if (!picked) return undefined;
    if (picked === done) break;
    if (picked === OTHER_LABEL) {
      custom = (await typeOwn()) ?? custom;
      continue;
    }
    const i = items.indexOf(picked);
    if (chosen.has(i)) chosen.delete(i);
    else chosen.add(i);
  }
  const parts = [...chosen].sort((a, b) => a - b).map((i) => q.options[i].label);
  if (custom) parts.push(custom);
  return parts.length ? parts.join(", ") : undefined;
}

const text = (value: string) => [{ type: "text" as const, text: value }];

/** Multiple-choice clarifying questions, available in every mode (like Claude Code's AskUserQuestion). */
export function registerAskUserQuestion(pi: ExtensionAPI): void {
  pi.registerTool({
    name: ASK_TOOL,
    label: "Ask user",
    description:
      "Ask the user 1-4 multiple-choice questions to clarify requirements, gather preferences, or choose between " +
      "approaches. Each question has 2-4 options; the user can always type their own answer instead. Put your " +
      "recommended option first and say so in its description. Use multiSelect only when choices are not mutually " +
      "exclusive. Do not ask things you can find out by reading the code, and do not use this to ask for plan approval.",
    promptSnippet: "ask_user_question: ask the user multiple-choice clarifying questions (1-4 per call)",
    parameters: Type.Object({
      questions: Type.Array(
        Type.Object({
          question: Type.String({ description: "The complete question, ending with a question mark" }),
          header: Type.Optional(Type.String({ description: "Very short label for the question (max ~12 chars)" })),
          options: Type.Array(
            Type.Object({
              label: Type.String({ description: "Short choice text (1-5 words)" }),
              description: Type.Optional(Type.String({ description: "One line on what this choice means or implies" })),
            }),
            { minItems: 2, maxItems: 4 },
          ),
          multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting several options" })),
        }),
        { minItems: 1, maxItems: 4 },
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        throw new Error("ask_user_question needs an interactive session (no UI available). Make a reasonable assumption and state it.");
      }

      const lines: string[] = [];
      for (const q of params.questions.slice(0, 4)) {
        const answer = await askOne(ctx, q);
        if (answer === undefined) {
          lines.push(`- ${q.question} -> (the user dismissed this question)`);
          lines.push(
            "\nThe user dismissed the questions. Do not re-ask the same thing; proceed with your best recommendation or ask in plain text what they would prefer.",
          );
          return { content: text(`User answers:\n${lines.join("\n")}`), details: { dismissed: true } };
        }
        lines.push(`- ${q.question} -> ${answer}`);
      }
      return { content: text(`User answers:\n${lines.join("\n")}\n\nContinue with these answers.`), details: { dismissed: false } };
    },
  });
}
