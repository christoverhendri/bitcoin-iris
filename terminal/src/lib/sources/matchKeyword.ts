/** Normalize text for token-boundary matching; punctuation and hyphens are whitespace. */
export function normalizeKeywordText(value: string): string {
  return ` ${value.toLowerCase().replace(/[\u2010-\u2015-]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

/** Create a matcher that normalizes the headline once, regardless of keyword count. */
export function createKeywordMatcher(text: string): (keyword: string) => boolean {
  const normalizedText = normalizeKeywordText(text);
  return (keyword) => normalizedText.includes(normalizeKeywordText(keyword));
}

/** Match a keyword or phrase on token boundaries. */
export function matchesKeyword(text: string, keyword: string): boolean {
  return createKeywordMatcher(text)(keyword);
}
