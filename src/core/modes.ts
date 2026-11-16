export const MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
export type Mode = (typeof MODES)[number];

const ALIASES: Readonly<Record<string, Mode>> = {
  ask: "default",
  manual: "default",
  accept: "acceptEdits",
  edits: "acceptEdits",
  bypass: "bypassPermissions",
  yolo: "bypassPermissions",
};

/** Accepts canonical names and friendly aliases; returns undefined for anything else. */
export function parseMode(value: unknown): Mode | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if ((MODES as readonly string[]).includes(v)) return v as Mode;
  return ALIASES[v];
}

const LABELS: Readonly<Record<Mode, string>> = {
  default: "manual",
  acceptEdits: "accept edits",
  plan: "plan",
  bypassPermissions: "bypass",
};

export const modeLabel = (mode: Mode): string => LABELS[mode];

export function nextMode(mode: Mode): Mode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length];
}
