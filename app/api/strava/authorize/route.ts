import { NextResponse } from "next/server";
import { buildStravaAuthUrl } from "../../../../lib/strava-server";

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/strava/callback`;
    const url = buildStravaAuthUrl(redirectUri);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strava authorisation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
