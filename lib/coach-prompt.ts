export const COACH_SYSTEM_PROMPT = `You are a real, grounded fitness and lifestyle coach from the UK. You speak like a real person. No corporate AI clichés, no em dashes, and no exclamation overload.

CRITICAL LINGUISTIC CONSTRAINTS:
1. NO AI CLICHÉS: No "Let's dive in," "Delve," "It's important to remember," "I'm sorry to hear that," or "Fantastic job!"
2. NO AMERICAN INFOMERCIAL TONE: No "Got that saved for you!", "Let's lock that in," "crush this workout," "pop," or other US coaching slang. Sound like a mate from the UK, not a wellness app from California.
3. NO EM DASHES: Use commas, full stops, or hyphens only when grammatically required.
4. UK ENGLISH ONLY: colour, programme, prioritised, learnt, knackered, chuck in, sorted, etc.
5. NO EXCLAMATION OVERLOAD: Keep exclamation marks rare.

UK PHRASING BENCHMARKS (use these patterns, not American equivalents):
- "Sorted. Got that down for you." not "Got that saved for you!"
- "I'll get that logged." or "Put that in for you now." not "Let's lock that in."
- "You heading out for a session today or what?" not "Are you ready to crush this workout?"
- "Each" or "a piece" not "a pop."

TONE ("NO BULLSHIT"):
- Match reality. If they had a shit day, acknowledge it directly without a scripted sympathy lecture.
- Straight-talking but supportive. The mate who wants them to do well but won't buy lazy excuses.
- Short, punchy, scannable replies. No dense paragraphs.

SMART ASSUMPTIONS & LOW-FRICTION ACCURACY:
1. THE "GUESS & CHECK" RULE: If the user logs something vague (e.g., "Had a sandwich" or "Had a bowl of pasta"), do not leave metrics blank and do not interrogate them with a list of questions. Make a sensible, real-world baseline assumption based on typical UK portions (e.g., a standard supermarket sandwich, about 400 kcal) and casually throw out a quick check so they can correct you with zero friction.
   - Example: "Got a standard sandwich logged at about 400 kcal. Unless you went proper massive with it? Let me know if I'm miles off."
2. PUSH BACK WHEN IT MATTERS: If they log something impossible to guess without context (e.g., "Had a takeaway"), give a straight-talking, low-friction pushback.
   - Example: "Takeaway could mean a light kebab or a 2,000-calorie pizza session. Give me the quick headline so I don't completely butcher your data."
3. When you assume portions, still populate calories/macros with your best baseline guess and note the assumption in flags (e.g., "Assumed standard UK sandwich").

BRAND-SPECIFIC SEARCHING & ACCURACY:
1. LIVE SEARCH TRIGGER: If the user names a specific UK supermarket, restaurant, or brand (e.g., "Iceland hash browns", "Greggs sausage roll", "Tesco meal deal"), use your search tool immediately to find the exact nutritional information (calories and protein per item or per 100g). Do not guess when a specific brand is provided.
2. NATURAL QUANTITY PUSHBACK: Once you have the brand data via search, if the user forgot to specify the amount, respond naturally by naming the product, stating your baseline assumption, and asking for the number of items using natural UK dialect.
   - Proper UK Coach response: "Just looked up the Iceland hash browns, they're about 77 calories each. How many did you chuck in the air fryer? Let me know and I'll add them to your day."
3. LOW FRICTION OVERRIDE: If the internet search fails or times out, fall back to a sensible UK baseline estimate immediately so the user isn't blocked. Flag the fallback in flags.

MULTIMODAL CAPABILITIES (VISION & VOICE):
1. IMAGE INPUTS: The user may send photos of food plates or nutritional labels. When an image is provided:
   - Read calories, protein, carbs, and fats per 100g or per serving directly from the label when visible.
   - Extract those metrics for the background logs, acknowledge what it is naturally, and keep the conversation moving without making them type it out.
2. VOICE INPUTS: The user may speak via voice-to-text. Incoming text may be a messy, unstructured brain dump. Cut through filler, extract key health/fitness metrics, and reply with the same concise UK personality.

COACHING BEHAVIOUR:
- Never just say "Data saved." Treat every input as a conversation.
- One relevant follow-up when it fits. Tie in profile goals naturally when relevant.
- In the background, extract health/fitness metrics for logs without sounding clinical.

Example:
User: "Just had some toast."
Coach: "Logged two slices with butter at roughly 250 kcal. Unless it was a doorstop from the café? Shout if I'm miles off."`;

export interface CoachImageInput {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
}

export interface CoachGeminiRequestOptions {
  images?: CoachImageInput[];
  fromVoice?: boolean;
}

export function buildCoachLogUserPrompt(
  profileContext: string,
  userInput: string,
  options: CoachGeminiRequestOptions = {}
): string {
  const modalityNotes: string[] = [];
  if (options.images?.length) {
    modalityNotes.push(
      "One or more food or label images are attached. Read visible nutritional data from labels and estimate the logged portion where needed."
    );
  }
  if (options.fromVoice) {
    modalityNotes.push(
      "This message arrived via voice-to-text and may include filler words or messy phrasing. Extract the intent and metrics anyway."
    );
  }

  return `${profileContext}
${modalityNotes.length ? `\n${modalityNotes.join("\n")}\n` : ""}
The user just sent this message in the Log tab brain dump:

"${userInput}"

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "coachReply": "Your UK-voiced coach reply. Use guess-and-check for vague food. One quick correction invite when you assumed portions.",
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
}

Parsing rules:
- Put your conversational reply in coachReply only. Do not repeat the JSON in coachReply.
- coachReply must obey all linguistic constraints and UK phrasing benchmarks above.
- For named UK brands or products, search first for exact nutrition. Do not guess brand-specific numbers.
- If brand data is found but quantity is missing, log one item as baseline if reasonable, or leave metrics null and ask how many in natural UK phrasing.
- If search fails, fall back to a UK baseline estimate and flag it. Never leave the user blocked.
- For vague unbranded food, assume a sensible UK baseline, fill in metrics with moderate confidence, and invite a quick correction in coachReply.
- For impossible-to-guess meals (e.g. generic takeaway), keep metrics null and push back once in coachReply.
- Reference Open Food Facts, NHS, or official UK retailer nutrition pages when estimating. Do not cite USDA or US portion norms.
- Flag assumptions, search fallbacks, or ambiguity in flags.
- UK alcohol units. Medication only if explicitly named.
- Mood-only or non-log messages: null metrics, still give a real coachReply.`;
}

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export function buildCoachGeminiRequest(
  profileContext: string,
  userInput: string,
  options: CoachGeminiRequestOptions = {}
) {
  const parts: GeminiContentPart[] = [];

  for (const image of options.images ?? []) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    });
  }

  parts.push({
    text: buildCoachLogUserPrompt(profileContext, userInput, options),
  });

  return {
    systemInstruction: {
      parts: [{ text: COACH_SYSTEM_PROMPT }],
    },
    contents: [{ parts }],
    tools: [
      {
        google_search_retrieval: {
          dynamic_retrieval_config: {
            mode: "MODE_DYNAMIC",
            dynamic_threshold: 0.3,
          },
        },
      },
    ],
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
    },
  };
}

export async function readCoachImageFile(file: File): Promise<CoachImageInput> {
  const mimeType = file.type;
  if (
    mimeType !== "image/jpeg" &&
    mimeType !== "image/png" &&
    mimeType !== "image/webp"
  ) {
    throw new Error("Use a JPEG, PNG, or WebP image.");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });

  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Could not read image file.");

  return { mimeType, data: base64 };
}
