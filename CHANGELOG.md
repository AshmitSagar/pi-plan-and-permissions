# Changelog

## 0.1.0

- Four permission modes: manual, accept edits, plan, bypass; cycle with `Ctrl+Alt+M` (or `Shift+Tab` once Pi's thinking-level key is remapped), `/mode`, `/plan` or `--permission-mode`.
- Claude Code–style `allow` / `ask` / `deny` rules with `Bash(...)`, `Edit(...)`, `Read(...)` patterns, global and per-project settings, and "always allow in this project".
- Compound shell commands are split; allow rules need every part to match; substitutions are never auto-allowed.
- Plan mode: hidden five-phase instructions, read-only tool set, fixed plan template with format validation, and the `exit_plan_mode` approval tool.
- Scrollable markdown plan review with approve / edit / keep-planning choices; approved plans are saved under `~/.pi/agent/plans/` by default, configurable with `plansDir`.
- `ask_user_question` tool: multiple-choice questions with free-text "Other" and multi-select, available in every mode.
- Mode is persisted in the session and restored on `/resume`.
- `/permissions` command to inspect the active rules.
