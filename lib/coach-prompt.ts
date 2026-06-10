import type {
  ChatMessage,
  DailyTotals,
  ParsedNutrition,
  PulseProfile,
  PulseProfileLearned,
} from "./types";
import { buildProfileContextSummary, EFFORT_LABELS } from "./profile-helpers";

export const COACH_SYSTEM_PROMPT = `You are a real, grounded fitness and lifestyle coach. You are not a customer service bot, a cheerleader, or an AI assistant. You speak like a real person from the UK, specifically the North East of England. Straight-talking, warm when it matters, no bullshit.

CRITICAL STYLE RULES (NON-NEGOTIABLE):
- UK English only. Colour, programme, prioritised, knackered, sorted, cheers.
- No em dashes. Use commas and full stops.
- No exclamation marks unless something genuinely warrants it.
- No AI clichés: no "Let's dive in", "Delve", "Absolutely", "Certainly", "Great question", "Great to meet you", "I'm sorry to hear that".
- No American phrases: no "a pop", "lock it in", "crush it", "you've got this", "Got that saved for you".
- Short, punchy sentences. No walls of text.

UK PHRASING BENCHMARKS:
- "Sorted. Got that down for you." not "Got that saved for you!"
- "I'll get that logged." or "Put that in for you now." not "Let's lock that in."
- "You heading out for a session today or what?" not "Are you ready to crush this workout?"
- "Each" or "a piece" not "a pop."

SMART ASSUMPTIONS:
- If the user logs something vague (e.g. "had a sandwich"), make a sensible UK baseline assumption and do a quick casual check.
- If it's impossible to guess (e.g. "had a takeaway"), push back naturally once.
- Never interrogate with a list of questions. One natural follow-up only.

BRAND SEARCHING:
- If a specific UK brand or product is mentioned, search for actual nutritional data before responding.
- If search fails, fall back to a UK baseline estimate and flag it.

PROFILE LEARNING:
- If the user mentions the same food, habit, or behaviour that appears consistent with previous logs, add it to profile_updates.
- Only update when reasonably confident it's a pattern, not a one-off.
- Example: third chicken sandwich this week → profile_updates: { "usualLunch": "chicken sandwich" }
- Medication by name → profile_updates: { "medicationMentioned": ["sertraline"] }

BACKGROUND PARSING:
- Extract health metrics silently. Return structured JSON alongside your conversational message.
- Set should_log true only when you are confident enough to log without confirmation (typically confidence >= 0.7 on key metrics).
- If unsure, ask a natural follow-up instead of logging.
- Never let data extraction make the response feel clinical.`;

export interface CoachChatContext {
  profile: PulseProfile | null;
  dailyTotals: DailyTotals;
  chatHistory: ChatMessage[];
  now?: Date;
  fromVoice?: boolean;
  imageContext?: string;
}

function formatDailySummary(totals: DailyTotals): string {
  return `Today so far: ${totals.calories} kcal, ${totals.protein_g}g protein, ${totals.water_ml}ml water, ${totals.alcohol_units} alcohol units, ${totals.steps} steps.`;
}

function formatChatHistory(history: ChatMessage[]): string {
  const recent = history.slice(-10);
  if (!recent.length) return "No prior messages today.";
  return recent
    .map((m) => `${m.role === "user" ? "User" : "Coach"}: ${m.text}`)
    .join("\n");
}

export function buildChatUserPrompt(input: string, ctx: CoachChatContext): string {
  const now = ctx.now ?? new Date();
  const notes: string[] = [
    `Current date/time: ${now.toLocaleString("en-GB")}`,
    formatDailySummary(ctx.dailyTotals),
    "",
    "USER PROFILE:",
    buildProfileContextSummary(ctx.profile) || "No profile yet.",
    "",
    "RECENT CHAT:",
    formatChatHistory(ctx.chatHistory),
  ];
  if (ctx.fromVoice) {
    notes.push("", "Note: message arrived via voice-to-text, may be messy.");
  }
  if (ctx.imageContext) {
    notes.push("", `Image context: ${ctx.imageContext}`);
  }

  return `${notes.join("\n")}

User message: "${input}"

Return ONLY valid JSON (no markdown fences):
{
  "message": "your conversational coach reply, 1-4 short sentences",
  "parsed": {
    "calories": number|null,
    "protein_g": number|null,
    "carbs_g": number|null,
    "fat_g": number|null,
    "water_ml": number|null,
    "alcohol_units": number|null,
    "medication_taken": boolean|null,
    "steps": number|null,
    "items": [],
    "confidence": {"calories":0-1,"protein":0-1,"carbs":0-1,"fat":0-1},
    "flags": [],
    "notes": ""
  },
  "profile_updates": {},
  "should_log": boolean
}

Rules:
- message obeys all style rules. No AI pleasantries.
- should_log true only when confident. Otherwise false and ask in message.
- profile_updates only for clear patterns. Empty object if none.`;
}

export function buildWelcomePrompt(profile: PulseProfile): string {
  return `You are a straight-talking UK health and fitness coach. Generate a short opening message to a new user.

User: ${profile.name}, goal: "${profile.goal}", timeline: ${profile.timeline} months, effort: ${EFFORT_LABELS[profile.effortLevel]}

The message should:
- Start with a greeting using their name
- Briefly describe what Pulse does in one sentence — tracks health, fitness, food, and lifestyle through conversation, gets smarter the more they talk to it
- Ask how things are at the minute — health, fitness, habits — and ask for the honest version
- Sound like a real person from the UK, not an AI assistant
- No em dashes. No exclamation marks. No AI clichés. No "Let's dive in". UK English only.
- 3-4 sentences maximum
- Reference something specific from their goal if possible

Example tone (do not copy verbatim):
"Hey Lewis. I'm your Pulse coach. I track your health, fitness, food, and lifestyle in the background while you just talk to me. The more you tell me, the better I get at helping you. So — how are things at the minute? Health, fitness, habits. Give me the honest version."

Return ONLY valid JSON: { "message": "..." }`;
}

export function buildGoalExtractionPrompt(profile: PulseProfile): string {
  const age = profile.dateOfBirth
    ? (() => {
        const birth = new Date(profile.dateOfBirth);
        const today = new Date();
        let a = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
        return a;
      })()
    : "unknown";

  const currentWeight = profile.latestMeasurement?.weight;
  const currentBodyFat = profile.latestMeasurement?.bodyFat;

  return `Extract structured health and fitness data from this goal statement and return ONLY valid JSON.

Goal text: "${profile.goal}"
User: ${age} year old ${profile.sex}, timeline: ${profile.timeline} months, effort: ${EFFORT_LABELS[profile.effortLevel]}
${currentWeight ? `Current weight from scale: ${currentWeight}kg` : "No current weight available."}
${currentBodyFat ? `Current body fat from scale: ${currentBodyFat}%` : ""}

Return:
{
  "targetBodyFat": number or null,
  "targetWeight": number or null,
  "primaryGoal": "string — one plain English sentence",
  "sport": "string or null",
  "extractedGoals": ["array of specific goals identified"],
  "milestones": [
    {
      "label": "string e.g. Week 2",
      "date": "ISO date string",
      "description": "one plain English sentence of what to expect at this point",
      "projectedBodyFat": number or null,
      "projectedWeight": number or null
    }
  ]
}

Generate milestones at: 2 weeks, 1 month, 6 weeks, 2 months, 3 months, then every 3 months to the end of the timeline. Be realistic. Use conservative estimates based on safe rate of fat loss (0.5-1% body fat per month for moderate effort, up to 1.5% for high effort). If no current stats are available, generate relative milestones only (descriptive, no numbers).`;
}

export function buildCoachGeminiBody(
  userPrompt: string,
  options: {
    json?: boolean;
    search?: boolean;
    temperature?: number;
    maxTokens?: number;
  } = {}
) {
  const useSearch = options.search ?? false;
  const useJsonMime = options.json !== false && !useSearch;
  return {
    systemInstruction: { parts: [{ text: COACH_SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: options.temperature ?? 0.65,
      maxOutputTokens: options.maxTokens ?? 1200,
      // google_search and responseMimeType cannot be combined on current Gemini models
      ...(useJsonMime ? { responseMimeType: "application/json" } : {}),
    },
  };
}

export function buildChatGeminiRequest(input: string, ctx: CoachChatContext) {
  return buildCoachGeminiBody(buildChatUserPrompt(input, ctx));
}

export function shouldAutoLog(parsed: ParsedNutrition): boolean {
  const conf = parsed.confidence ?? {};
  const metrics = [
    parsed.calories != null && (conf.calories ?? 0) >= 0.7,
    parsed.protein_g != null && (conf.protein ?? 0) >= 0.7,
    parsed.water_ml != null,
    parsed.alcohol_units != null,
    parsed.medication_taken === true,
    parsed.steps != null,
  ];
  return metrics.some(Boolean);
}

export function normaliseCoachResponse(raw: Record<string, unknown>): {
  message: string;
  parsed: ParsedNutrition;
  profile_updates?: Partial<PulseProfileLearned>;
  should_log: boolean;
} {
  const message =
    (typeof raw.message === "string" && raw.message) ||
    (typeof raw.coachReply === "string" && raw.coachReply) ||
    "";

  const nested =
    raw.parsed && typeof raw.parsed === "object"
      ? (raw.parsed as Record<string, unknown>)
      : raw;

  const parsed: ParsedNutrition = {
    calories: (nested.calories as number | null) ?? null,
    protein_g: (nested.protein_g as number | null) ?? null,
    carbs_g: (nested.carbs_g as number | null) ?? null,
    fat_g: (nested.fat_g as number | null) ?? null,
    water_ml: (nested.water_ml as number | null) ?? null,
    alcohol_units: (nested.alcohol_units as number | null) ?? null,
    medication_taken: (nested.medication_taken as boolean | null) ?? null,
    steps: (nested.steps as number | null) ?? null,
    items: (nested.items as unknown[]) ?? [],
    confidence: (nested.confidence as ParsedNutrition["confidence"]) ?? {},
    flags: (nested.flags as string[]) ?? [],
    notes: (typeof nested.notes === "string" && nested.notes) || "",
  };

  const profile_updates =
    raw.profile_updates && typeof raw.profile_updates === "object"
      ? (raw.profile_updates as Partial<PulseProfileLearned>)
      : undefined;

  const should_log =
    raw.should_log === true || (raw.should_log !== false && shouldAutoLog(parsed));

  return { message, parsed, profile_updates, should_log };
}

export function parseJsonText(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { message: cleaned, should_log: false };
  }
}
