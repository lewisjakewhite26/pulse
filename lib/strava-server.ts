import {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  isStravaConfigured,
} from "./strava-config";
import type { StravaActivitySummary, StravaTokens } from "./types";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_URL = "https://www.strava.com/api/v3";

export function assertStravaConfigured(): void {
  if (!isStravaConfigured()) {
    throw new Error(
      "Strava is not configured. Add your client ID and secret in lib/strava-config.ts."
    );
  }
}

export function buildStravaAuthUrl(redirectUri: string): string {
  assertStravaConfigured();
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: "activity:read_all",
  });
  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeStravaCode(
  code: string,
  redirectUri: string
): Promise<StravaTokens> {
  assertStravaConfigured();
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Strava token exchange failed.");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
  };
}

export async function refreshStravaTokens(
  refreshToken: string
): Promise<StravaTokens> {
  assertStravaConfigured();
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Strava token refresh failed.");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete: data.athlete,
  };
}

export async function fetchStravaActivities(
  tokens: StravaTokens,
  perPage = 15
): Promise<{ activities: StravaActivitySummary[]; tokens: StravaTokens }> {
  let activeTokens = tokens;
  const now = Math.floor(Date.now() / 1000);
  if (activeTokens.expires_at <= now + 60) {
    activeTokens = await refreshStravaTokens(activeTokens.refresh_token);
  }

  const res = await fetch(
    `${STRAVA_API_URL}/athlete/activities?per_page=${perPage}`,
    {
      headers: { Authorization: `Bearer ${activeTokens.access_token}` },
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Could not fetch Strava activities.");
  }

  return { activities: data as StravaActivitySummary[], tokens: activeTokens };
}
