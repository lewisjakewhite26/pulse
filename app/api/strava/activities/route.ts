import { NextResponse } from "next/server";
import { fetchStravaActivities } from "../../../../lib/strava-server";
import type { StravaTokens } from "../../../../lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tokens = body.tokens as StravaTokens | undefined;

    if (!tokens?.access_token || !tokens.refresh_token) {
      return NextResponse.json(
        { error: "Strava is not connected." },
        { status: 400 }
      );
    }

    const result = await fetchStravaActivities(tokens);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not fetch Strava activities.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
