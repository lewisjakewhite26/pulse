import { NextRequest, NextResponse } from "next/server";
import { geminiGenerateContentUrl } from "@/lib/gemini-config";

function getGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
}

const VISION_PROMPT = `You are reading a nutritional label or food image for a UK health tracking app.

Extract the nutritional information and describe what you can see in a natural, conversational way that can be appended to a food log.

If it's a nutritional label, extract: product name, serving size, calories, protein, carbs, fat per serving.

If it's a photo of food, describe what you can see and estimate the portion.

Respond in plain conversational UK English as if you're describing it to add to a food diary. Keep it brief, one or two sentences max. For example: "Protein bar, 215 calories, 20g protein per bar." or "Looks like a chicken wrap, roughly 400-450 calories."

Do not use em dashes. Do not use AI phrases. Just describe it plainly.`;

export async function POST(req: NextRequest) {
  const geminiKey = getGeminiKey();
  if (!geminiKey) {
    return NextResponse.json(
      { error: "Gemini API key is not configured. Set GEMINI_API_KEY in your environment." },
      { status: 503 }
    );
  }

  const { image, mimeType } = await req.json();
  if (!image || !mimeType) {
    return NextResponse.json({ error: "Image and mimeType are required." }, { status: 400 });
  }

  const res = await fetch(
    geminiGenerateContentUrl(geminiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: image,
                },
              },
              { text: VISION_PROMPT },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 200 },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message || "Could not read image." },
      { status: res.status }
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return NextResponse.json({ text: text.trim() });
}
