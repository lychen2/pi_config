export type MaskedText = {
  text: string;
  restore: (translated: string) => string;
};

const PLACEHOLDER = /\[\[PI_LITERAL_(\d+)\]\]/g;

/**
 * Keep text that must remain byte-for-byte stable out of the translation model.
 * The model receives stable placeholders and restoration fails closed if it edits,
 * drops, or duplicates any placeholder.
 */
export function maskLiterals(source: string): MaskedText {
  const literals: string[] = [];
  const placeholder = (literal: string): string => {
    const index = literals.push(literal) - 1;
    return `[[PI_LITERAL_${index}]]`;
  };

  let text = source;
  const patterns = [
    /\[\[PI_LITERAL_\d+\]\]/g, // avoid collisions with the extension's placeholders
    /```[\s\S]*?```/g, // fenced code blocks first, so their contents stay untouched
    /`[^`\n]+`/g,
    /https?:\/\/[^\s<>()\[\]{},;:!?，。！？]+/g,
    /(?:~\/|\.\.?\/|\/)[^\s`"'<>()[\]{}，。！？]+/g, // common filesystem paths
    /--[A-Za-z][A-Za-z0-9-]*(?:=[^\s`"'<>()[\]{},;:!?，。！？]+)?/g,
    /(?<!\[)\b[A-Z][A-Z0-9_]{2,}\b(?!\])/g, // environment-variable names
  ];

  for (const pattern of patterns) {
    text = text.replace(pattern, placeholder);
  }

  return {
    text,
    restore(translated: string): string {
      const seen = new Map<number, number>();
      for (const match of translated.matchAll(PLACEHOLDER)) {
        const index = Number(match[1]);
        seen.set(index, (seen.get(index) ?? 0) + 1);
      }

      if (
        seen.size !== literals.length ||
        literals.some((_, index) => seen.get(index) !== 1)
      ) {
        throw new Error(
          "The translation model changed protected code, URLs, paths, flags, or placeholders. Nothing was sent.",
        );
      }

      return translated.replace(PLACEHOLDER, (_match, index: string) => {
        return literals[Number(index)] ?? _match;
      });
    },
  };
}
