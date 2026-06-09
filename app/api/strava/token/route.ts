import { NextResponse } from "next/server";
import { exchangeStravaCode } from "../../../../lib/strava-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = body.code as string | undefined;
    const redirectUri = body.redirect_uri as string | undefined;

    if (!code || !redirectUri) {
      return NextResponse.json(
        { error: "Missing authorisation code or redirect URI." },
        { status: 400 }
      );
    }

    const tokens = await exchangeStravaCode(code, redirectUri);
    return NextResponse.json(tokens);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strava token exchange failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
