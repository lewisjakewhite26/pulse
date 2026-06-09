import { NextResponse } from "next/server";

function getGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || null;
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
