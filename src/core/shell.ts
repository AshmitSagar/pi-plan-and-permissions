/**
 * Conservative shell-command analysis. Nothing here executes anything; it only decides whether a
 * command string is safe to reason about and whether it is read-only.
 */

/** &&, ||, ;, |, newline, and a lone & (backgrounding). `2>&1` and `&>file` are not separators. */
const SEGMENT_SPLIT = /&&|\|\||;|\||\n|(?<![>&])&(?![>&])/;

/** Returns undefined when the command contains substitutions we cannot reason about. */
export function splitCommand(cmd: string): string[] | undefined {
  if (/\$\(|`|<\(/.test(cmd)) return undefined;
  return cmd
    .split(SEGMENT_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);
}

const SAFE_BASH: readonly RegExp[] = [
  /^(ls|pwd|cat|head|tail|wc|file|stat|du|df|tree|which|whoami|echo|printf|date|env|uname|realpath|basename|dirname)(\s|$)/,
  /^(grep|rg|ag)(\s|$)/,
  /^find(\s|$)(?!.*-(exec|execdir|delete|ok)\b)/,
  /^git\s+(status|log|diff|show|branch|tag|remote|rev-parse|ls-files|blame|describe|config\s+--get)(\s|$)/,
  /^(npm|pnpm|yarn)\s+(ls|list|view|outdated)(\s|$)/,
  /^(node|python3?|tsc)\s+(-v|--version)$/,
];

/** Remove harmless redirections (2>&1, >&2, 2>/dev/null, &>/dev/null) so they do not look like file writes. */
export function stripSafeRedirects(cmd: string): string {
  return cmd
    .replace(/&>>?\s*\/dev\/null/g, " ")
    .replace(/\d*>>?\s*\/dev\/null/g, " ")
    .replace(/\d*>&\d+/g, " ");
}

export function isReadOnlyBash(cmd: string): boolean {
  const cleaned = stripSafeRedirects(cmd);
  if (/>|\btee\b|\bsed\s+(-\w*i|--in-place)|\bsudo\b/.test(cleaned)) return false;
  const segments = splitCommand(cleaned);
  return !!segments && segments.length > 0 && segments.every((s) => SAFE_BASH.some((re) => re.test(s)));
}
