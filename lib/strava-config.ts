// Register your app at https://www.strava.com/settings/api
// Set Authorisation Callback Domain to localhost (dev) or your deployed host.
// Add this exact redirect URI in your Strava app settings:
//   http://localhost:3000/strava/callback

export const STRAVA_CLIENT_ID = "";
export const STRAVA_CLIENT_SECRET = "";

export function getStravaRedirectUri(origin?: string): string {
  const base =
    origin ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return `${base}/strava/callback`;
}

export function isStravaConfigured(): boolean {
  return Boolean(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET);
}

export function isStravaClientConfigured(): boolean {
  return Boolean(STRAVA_CLIENT_ID);
}
