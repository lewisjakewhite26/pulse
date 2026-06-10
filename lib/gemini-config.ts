/** Default model — gemini-1.5-flash was retired; override via GEMINI_MODEL if needed. */
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";

export function geminiGenerateContentUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}
