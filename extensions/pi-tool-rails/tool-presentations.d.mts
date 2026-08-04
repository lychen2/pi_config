export type ToolPresentation = Readonly<{
  label: string;
  emoji: string;
}>;

export const TOOL_PRESENTATIONS: Readonly<Record<string, ToolPresentation>>;
export function normalizeToolName(name: string): string;
export function shortToolName(name: string): string;
export function toolEmoji(name: string): string;
