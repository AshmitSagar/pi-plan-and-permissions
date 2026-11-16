# Pi Plan & Permissions

Claude Code–style **permission modes**, **allow / ask / deny rules**, a **structured plan-approval flow** and **multiple-choice questions** for the [pi coding agent](https://pi.dev).

Pi deliberately ships without permission prompts. This package adds them back, with the same mental model as Claude Code.

## Install

```bash
pi install npm:pi-plan-and-permissions
pi install /path/to/pi-plan-and-permissions     # from a local checkout
pi -e ./extensions/index.ts                 # try it for one run
```

## Modes

| Mode                          | Behavior                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `default` (shown as _manual_) | Reads inside the project are free. Edits, writes and bash ask first.                                                                       |
| `acceptEdits`                 | Edits and writes **inside the project** are auto-approved. Bash still asks.                                                                |
| `plan`                        | Read-only research. Editing tools are hidden and only read-only shell commands run. The model ends by submitting a plan for your approval. |
| `bypassPermissions`           | Everything runs. **Deny rules still apply.**                                                                                               |

Switch with:

- `Ctrl+Alt+M` cycles through the modes
- `/mode [name]` sets one (aliases: `manual`, `ask`, `accept`, `bypass`, `yolo`). With no argument it cycles
- `/plan` toggles plan mode
- `pi --permission-mode plan` starts in a mode (`--mode` is Pi's own output-format flag)
- `"defaultMode"` in a settings file

The current mode is shown in the footer and **saved in the session**, so `/resume` restores it.

### Using Shift+Tab (as in Claude Code)

Pi reserves Shift+Tab for "cycle thinking level" and does not let extensions take it. Move that action once and this package claims Shift+Tab automatically:

```jsonc
// ~/.pi/agent/keybindings.json
{ "app.thinking.cycle": "alt+t" }
```

## Plan mode

1. A hidden instruction tells the model it is planning and gives it five phases: **Understand → Explore → Design → Write the plan → Submit**.
2. It researches with read-only tools, and asks you questions with `ask_user_question` when a decision is yours.
3. It submits the plan with `exit_plan_mode`. A plan missing **Context**, **Implementation steps** or **Verification** is rejected before you see it, and the model is shown the template.
4. You get a scrollable, markdown-rendered review screen:

| Key                             | Action                       |
| ------------------------------- | ---------------------------- |
| `↑` `↓` / `j` `k`               | scroll a line                |
| `PgUp` `PgDn` / `b` `f` `Space` | scroll a page                |
| `g` / `G`, `Home` / `End`       | top / bottom                 |
| `Tab` / `Shift+Tab` or `1`–`4`  | choose an option             |
| `Enter`                         | confirm                      |
| `e`                             | edit the plan in your editor |
| `Esc`                           | keep planning, with feedback |

Approving switches to **accept edits** or **manual**, restores the full tool set, and saves the plan. If you edit the plan first, the model implements your version.

Plans are saved as `<project-folder>-<UTC timestamp>.md`. By default they go to `~/.pi/agent/plans/`; set `plansDir` in a settings file to put them elsewhere (for example inside the repo, so they can be committed):

```jsonc
// <project>/.pi/permissions.json  (or ~/.pi/agent/permissions.json)
{ "plansDir": "docs/plans" }
```

`~/…` expands to your home directory, absolute paths are used as-is, and relative paths resolve against the project. The project setting wins over the global one, and `/permissions` shows where plans are going.

The plan template:

```markdown
# <Short title>

## Context

## Approach

## Implementation steps

### Phase 1 - <name>

- [ ] <concrete step> - `path/to/file` (what changes)

## Critical files

## Risks & open questions

## Verification
```

## Asking questions

`ask_user_question` (available in **every** mode, never gated) lets the model ask 1–4 multiple-choice questions, 2–4 options each, with optional multi-select. You can always type your own answer. Pressing `Esc` dismisses the questions and tells the model not to re-ask.

## Rules

Rules use Claude Code's syntax and are evaluated **deny > ask > allow**:

```jsonc
// ~/.pi/agent/permissions.json   (global)
// <project>/.pi/permissions.json (project; "always allow" saves here)
{
    "defaultMode": "default",
    "plansDir": ".pi/plans", // optional; default ~/.pi/agent/plans
    "permissions": {
        "allow": ["Bash(npm run test:*)", "Bash(git diff *)", "Edit(src/**)"],
        "ask": ["Bash(git push:*)"],
        "deny": ["Read(.env*)", "Bash(rm -rf:*)"],
    },
}
```

| Rule                          | Matches                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `Bash` / `Edit` / `Read`      | every call in that category (`Edit` = `edit` + `write`; `Read` = `read`, `grep`, `find`, `ls`) |
| `Bash(npm run test:*)`        | `npm run test` and `npm run test <anything>` (prefix rule)                                     |
| `Bash(git diff *)`            | glob against the whole command                                                                 |
| `Edit(src/**)`, `Read(.env*)` | path globs, relative to the project (`*` stays in a folder, `**` crosses folders)              |

Details worth knowing:

- Compound commands (`a && b | c`, `;`, `&`) are split. An **allow** rule applies only if **every** part matches. A **deny** or **ask** rule fires if **any** part matches.
- Commands containing `$(…)`, backticks or `<(…)` are never auto-allowed.
- Deny rules are enforced in every mode, including `bypassPermissions` and `plan`.
- Allow rules never unlock mutations in plan mode.

At a prompt you can allow once, allow for the session, or **always allow in this project** (written to `.pi/permissions.json`).

`/permissions` shows the active mode and rules.

## Not a sandbox

This is a guardrail for an agent that is trying to help, not a security boundary. Shell analysis is a conservative heuristic, and an approved command can still do anything your user can. For untrusted code use a container or VM.

Headless runs (print / json) have no UI, so anything that would prompt is **blocked**.

## Layout

```
extensions/index.ts        entry point Pi loads (3 lines)
src/core/                  pure logic, no Pi imports, fully unit-tested
  modes · glob · shell · rules · policy · plan-format · prompts · constants
src/infra/                 files on disk: settings, saved plans, paths
src/pi/                    thin adapters onto Pi's extension API
  activate (composition root) · controller (all mutable state) · gate
  permission-prompt · plan-review · commands · shortcuts · lifecycle
  tools/ask-user-question · tools/exit-plan-mode
test/                      vitest, including a fake Pi that runs the whole extension
```

The permission model is a single pure function, `decide(call, mode, rules, sessionAllow) → allow | ask | deny`, so every rule of the policy is testable without Pi.

## Development

```bash
npm install
npm run check      # typecheck against Pi's real types + tests
pi -e ./extensions/index.ts
```

## License

MIT
