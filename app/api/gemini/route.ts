import { NextResponse } from "next/server";

const GEMINI_KEY = "AIzaSyCSBLHuvrEmZEACUxPPh-LmSTli8pkhfXY";

export async function POST(request: Request) {
  const body = await request.json();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : res.status });
}
