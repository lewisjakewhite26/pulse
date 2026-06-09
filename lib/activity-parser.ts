import FitParser from "fit-file-parser";
import type { ParsedActivityUpload } from "./types";

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatDistanceMetres(metres: number): string | undefined {
  if (!metres || metres <= 0) return undefined;
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres)} m`;
}

function formatSportName(sport: string): string {
  return sport
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function dateDisplayFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function buildResult(
  activity: string,
  source: string,
  dateIso: string,
  durationSec: number,
  distanceM?: number,
  avgHR?: number,
  calories?: number,
  externalId?: string
): ParsedActivityUpload {
  const date = dateIso.slice(0, 10);
  return {
    activity,
    type: source,
    date,
    dateDisplay: dateDisplayFromIso(dateIso),
    duration: formatDuration(durationSec),
    distance: distanceM != null ? formatDistanceMetres(distanceM) : undefined,
    avgHR: avgHR ? Math.round(avgHR) : undefined,
    calories: calories ? Math.round(calories) : undefined,
    externalId,
  };
}

async function parseFitFile(file: File): Promise<ParsedActivityUpload> {
  const buffer = await file.arrayBuffer();
  const parser = new FitParser({
    force: true,
    speedUnit: "km/h",
    lengthUnit: "km",
    temperatureUnit: "celsius",
  });
  const data = await parser.parseAsync(buffer);
  const session = data.sessions?.[0] as Record<string, unknown> | undefined;
  if (!session) {
    throw new Error("No activity session found in FIT file.");
  }

  const sport = session.sport ? formatSportName(String(session.sport)) : "Activity";
  const durationSec = Number(
    session.total_timer_time ??
      session.total_elapsed_time ??
      session.timer_time ??
      0
  );
  const distanceM = Number(session.total_distance ?? 0);
  const avgHR = session.avg_heart_rate ?? session.average_heart_rate;
  const calories = session.total_calories;
  const timestamp = String(
    session.start_time ?? session.timestamp ?? new Date().toISOString()
  );

  return buildResult(
    sport,
    "Garmin FIT",
    timestamp,
    durationSec,
    distanceM,
    avgHR != null ? Number(avgHR) : undefined,
    calories != null ? Number(calories) : undefined
  );
}

function parseGpxXml(xml: string): ParsedActivityUpload {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid GPX file.");
  }

  const name = doc.querySelector("trk > name")?.textContent?.trim() || "Activity";
  const type = doc.querySelector("trk > type")?.textContent?.trim();
  const activity = type ? formatSportName(type) : formatSportName(name);

  const times = Array.from(doc.querySelectorAll("trkpt > time"))
    .map((el) => el.textContent)
    .filter(Boolean) as string[];

  let durationSec = 0;
  if (times.length >= 2) {
    const start = new Date(times[0]).getTime();
    const end = new Date(times[times.length - 1]).getTime();
    durationSec = Math.max(0, (end - start) / 1000);
  }

  let distanceM = 0;
  const points = Array.from(doc.querySelectorAll("trkpt"));
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const lat1 = parseFloat(prev.getAttribute("lat") || "0");
    const lon1 = parseFloat(prev.getAttribute("lon") || "0");
    const lat2 = parseFloat(curr.getAttribute("lat") || "0");
    const lon2 = parseFloat(curr.getAttribute("lon") || "0");
    distanceM += haversineMetres(lat1, lon1, lat2, lon2);
  }

  const dateIso = times[0] || new Date().toISOString();
  return buildResult(activity, "GPX", dateIso, durationSec, distanceM);
}

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTcxXml(xml: string): ParsedActivityUpload {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid TCX file.");
  }

  const lap = doc.querySelector("Lap");
  if (!lap) throw new Error("No lap data found in TCX file.");

  const activityEl = doc.querySelector("Activity");
  const sport = activityEl?.getAttribute("Sport") || "Activity";
  const id = doc.querySelector("Id")?.textContent || new Date().toISOString();
  const tcxNumber = (name: string): number => {
    const child = lap.querySelector(name)?.textContent;
    if (child) return parseFloat(child);
    return parseFloat(lap.getAttribute(name) || "0");
  };
  const durationSec = tcxNumber("TotalTimeSeconds");
  const distanceM = tcxNumber("DistanceMeters");
  const calories = tcxNumber("Calories");
  const avgHR = parseFloat(
    lap.querySelector("AverageHeartRateBpm > Value")?.textContent || "0"
  );

  return buildResult(
    formatSportName(sport),
    "Garmin TCX",
    id,
    durationSec,
    distanceM,
    avgHR || undefined,
    calories || undefined
  );
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function findColumn(headers: string[], candidates: string[]): number {
  const normalised = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = normalised.indexOf(key);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < normalised.length; i++) {
    if (candidates.some((c) => normalised[i].includes(c.toLowerCase().replace(/[^a-z0-9]/g, "")))) {
      return i;
    }
  }
  return -1;
}

function parseDurationValue(value: string): number {
  if (!value) return 0;
  if (value.includes(":")) {
    const parts = value.split(":").map((p) => parseInt(p, 10));
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseGarminCsv(text: string): ParsedActivityUpload {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV file has no activity rows.");

  const headers = parseCsvLine(lines[0]);
  const row = parseCsvLine(lines[1]);

  const typeIdx = findColumn(headers, ["Activity Type", "Sport", "Type"]);
  const dateIdx = findColumn(headers, ["Date", "Activity Date", "Start Time"]);
  const durationIdx = findColumn(headers, ["Moving Time", "Elapsed Time", "Time", "Duration"]);
  const distanceIdx = findColumn(headers, ["Distance", "Distance (km)", "Distance km"]);
  const hrIdx = findColumn(headers, ["Avg HR", "Average HR", "Avg Heart Rate"]);
  const calIdx = findColumn(headers, ["Calories", "Energy"]);

  const activity =
    typeIdx >= 0 ? row[typeIdx] || "Activity" : "Activity";
  const dateRaw = dateIdx >= 0 ? row[dateIdx] : new Date().toISOString();
  const parsedDate = new Date(dateRaw);
  const dateIso = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  let distanceM = 0;
  if (distanceIdx >= 0) {
    const dist = parseFloat(row[distanceIdx].replace(/[^\d.]/g, ""));
    if (Number.isFinite(dist)) {
      distanceM = row[distanceIdx].toLowerCase().includes("km") || dist < 100
        ? dist * 1000
        : dist;
    }
  }

  const durationSec = durationIdx >= 0 ? parseDurationValue(row[durationIdx]) : 0;
  const avgHR = hrIdx >= 0 ? parseFloat(row[hrIdx]) : undefined;
  const calories = calIdx >= 0 ? parseFloat(row[calIdx]) : undefined;

  return buildResult(
    formatSportName(activity),
    "Garmin CSV",
    dateIso,
    durationSec,
    distanceM,
    avgHR,
    calories
  );
}

export async function parseActivityFile(file: File): Promise<ParsedActivityUpload> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  if (ext === "fit") return parseFitFile(file);

  const text = await file.text();
  if (ext === "gpx") return parseGpxXml(text);
  if (ext === "tcx") return parseTcxXml(text);
  if (ext === "csv") return parseGarminCsv(text);

  throw new Error(`Unsupported file type: .${ext}`);
}

export function stravaActivityToUpload(
  activity: import("./types").StravaActivitySummary
): ParsedActivityUpload {
  const calories =
    activity.calories ??
    (activity.kilojoules ? Math.round(activity.kilojoules / 4.184) : undefined);

  return buildResult(
    activity.name || formatSportName(activity.sport_type || activity.type),
    "Strava",
    activity.start_date,
    activity.moving_time,
    activity.distance,
    activity.average_heartrate,
    calories,
    `strava:${activity.id}`
  );
}
