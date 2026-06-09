import { NextResponse } from "next/server";
import {
  buildChatGeminiRequest,
  buildCoachGeminiBody,
  buildExtractProfilePrompt,
  buildMilestonesPrompt,
  buildWelcomePrompt,
  normaliseCoachResponse,
  parseJsonText,
} from "@/lib/coach-prompt";
import type {
  ChatMessage,
  DailyTotals,
  PulseProfile,
} from "@/lib/types";

function getGeminiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

async function callGemini(body: Record<string, unknown>, key: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Gemini request failed.");
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No response from Gemini.");
  return parseJsonText(text);
}

export async function POST(request: Request) {
  const geminiKey = getGeminiKey();
  if (!geminiKey) {
    return NextResponse.json(
      { error: "Gemini API key is not configured. Set GEMINI_API_KEY in your environment." },
      { status: 503 }
    );
  }

  const body = await request.json();

  if (body.contents && body.action === undefined && body.input === undefined) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  }

  const action = body.action ?? "chat";

  try {
    if (action === "chat") {
      const input = String(body.input ?? "").trim();
      if (!input) {
        return NextResponse.json({ error: "Input is required." }, { status: 400 });
      }
      const geminiBody = buildChatGeminiRequest(input, {
        profile: body.profile as PulseProfile | null,
        dailyTotals: body.dailyTotals as DailyTotals,
        chatHistory: (body.chatHistory ?? []) as ChatMessage[],
        fromVoice: Boolean(body.fromVoice),
        imageContext: body.imageContext,
      });
      const raw = await callGemini(geminiBody, geminiKey);
      return NextResponse.json(normaliseCoachResponse(raw));
    }

    if (action === "welcome") {
      const profile = body.profile as PulseProfile;
      const raw = await callGemini(
        buildCoachGeminiBody(buildWelcomePrompt(profile), { temperature: 0.7, maxTokens: 300 }),
        geminiKey
      );
      return NextResponse.json({ message: raw.message ?? "" });
    }

    if (action === "extract_profile") {
      const raw = await callGemini(
        buildCoachGeminiBody(
          buildExtractProfilePrompt(body.currentSituation ?? "", body.goal ?? ""),
          { temperature: 0.2, maxTokens: 1500 }
        ),
        geminiKey
      );
      return NextResponse.json(raw);
    }

    if (action === "generate_milestones") {
      const raw = await callGemini(
        buildCoachGeminiBody(buildMilestonesPrompt(body.profile as PulseProfile), {
          temperature: 0.3,
          maxTokens: 2000,
        }),
        geminiKey
      );
      return NextResponse.json(raw);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gemini request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
