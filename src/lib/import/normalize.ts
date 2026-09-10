const INVISIBLE_CHARACTERS = /[​-‍⁠﻿]/gu;
const WHITESPACE = /\s+/gu;

/** Normalizes imported human text without changing letter case. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(WHITESPACE, " ")
    .trim();
}

/** Case-insensitive key for matching human labels and identities. */
export function normalizeKey(value: string): string {
  return normalizeText(value).toLocaleUpperCase("id-ID");
}

export function nullableText(value: string): string | null {
  const normalized = normalizeText(value);
  return normalized === "" ? null : normalized;
}
