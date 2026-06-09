import type {
  Activity,
  ChatMessage,
  CoachState,
  DailyTotals,
  LogEntry,
  Measurement,
  ParsedBackupFile,
  ParsedNutrition,
  PulseAccount,
  PulseBackup,
  PulseGoal,
  PulseProfile,
  WeekHistory,
  WeeklyStats,
  StravaTokens,
} from "./types";
import { isLegacyProfile, migrateLegacyProfile } from "./profile-helpers";

export const KEYS = {
  account: "pulse_account",
  profile: "pulse_profile",
  onboarded: "pulse_onboarded",
  logs: "pulse_logs",
  daily: "pulse_daily",
  activities: "pulse_activities",
  measurements: "pulse_measurements",
  a2hsDismissed: "pulse_a2hs_dismissed",
  strava: "pulse_strava",
  lastSynced: "pulse_last_synced",
  dirty: "pulse_dirty",
  chatHistory: "pulse_chat_history",
  goals: "pulse_goals",
  coachState: "pulse_coach_state",
} as const;

const BACKUP_FILENAME_RE = /^pulse-backup-(\d{4}-\d{2}-\d{2})\.json$/i;

let unlockedInMemory = false;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown): void {
  if (!isBrowser()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function remove(key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(key);
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hashPin(pin: string): string {
  return btoa(`pulse:${pin}`);
}

function emptyDailyTotals(date: string): DailyTotals {
  return {
    date,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    water_ml: 0,
    alcohol_units: 0,
    steps: 0,
    medication_taken: false,
  };
}

function aggregateLogIntoTotals(totals: DailyTotals, parsed: ParsedNutrition): void {
  totals.calories += parsed.calories ?? 0;
  totals.protein_g += parsed.protein_g ?? 0;
  totals.carbs_g += parsed.carbs_g ?? 0;
  totals.fat_g += parsed.fat_g ?? 0;
  totals.water_ml += parsed.water_ml ?? 0;
  totals.alcohol_units += parsed.alcohol_units ?? 0;
  if (parsed.steps != null) {
    totals.steps = Math.max(totals.steps, parsed.steps);
  }
  if (parsed.medication_taken) {
    totals.medication_taken = true;
  }
}

function rebuildDailyForDate(date: string, logs: LogEntry[]): DailyTotals {
  const totals = emptyDailyTotals(date);
  for (const log of logs) {
    if (log.date === date) {
      aggregateLogIntoTotals(totals, log.parsed);
    }
  }
  return totals;
}

export function markDirty(): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEYS.dirty, "true");
}

export function needsSync(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(KEYS.dirty) === "true";
}

export function getLastSynced(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(KEYS.lastSynced);
}

export function setLastSynced(): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEYS.lastSynced, new Date().toISOString());
  localStorage.removeItem(KEYS.dirty);
}

export function isUnlocked(): boolean {
  if (unlockedInMemory) return true;
  if (isBrowser()) {
    try {
      return localStorage.getItem("pulse_session_unlocked") === "true";
    } catch {
      return false;
    }
  }
  return false;
}

export function setUnlocked(unlocked: boolean): void {
  unlockedInMemory = unlocked;
}

export function createAccount(username: string, pin: string): boolean {
  if (!username.trim() || pin.length !== 4) return false;
  const account: PulseAccount = {
    username: username.trim(),
    pin: hashPin(pin),
    created_at: new Date().toISOString(),
  };
  write(KEYS.account, account);
  setUnlocked(true);
  return true;
}

export function verifyPin(pin: string): boolean {
  const account = getAccount();
  if (!account) return false;
  return account.pin === hashPin(pin);
}

export function getAccount(): PulseAccount | null {
  return read<PulseAccount | null>(KEYS.account, null);
}

export function hasAccount(): boolean {
  return getAccount() !== null;
}

export function getProfile(): PulseProfile | null {
  const raw = read<PulseProfile | null>(KEYS.profile, null);
  if (!raw) return null;
  if (isLegacyProfile(raw)) {
    const migrated = migrateLegacyProfile(raw);
    write(KEYS.profile, migrated);
    return migrated;
  }
  return raw;
}

export function saveProfile(profile: PulseProfile): void {
  write(KEYS.profile, profile);
  markDirty();
}

export function isOnboarded(): boolean {
  return read<boolean>(KEYS.onboarded, false);
}

export function setOnboarded(value: boolean): void {
  write(KEYS.onboarded, value);
}

export function isA2HSDismissed(): boolean {
  return read<boolean>(KEYS.a2hsDismissed, false);
}

export function setA2HSDismissed(): void {
  write(KEYS.a2hsDismissed, true);
}

export function getStravaTokens(): StravaTokens | null {
  return read<StravaTokens | null>(KEYS.strava, null);
}

export function saveStravaTokens(tokens: StravaTokens): void {
  write(KEYS.strava, tokens);
}

export function clearStravaTokens(): void {
  remove(KEYS.strava);
}

export function addLog(raw: string, parsed: ParsedNutrition): LogEntry {
  const now = new Date();
  const date = formatDate(now);
  const entry: LogEntry = {
    id: crypto.randomUUID(),
    date,
    time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    raw,
    parsed,
    created_at: now.toISOString(),
  };

  const logs = read<LogEntry[]>(KEYS.logs, []);
  logs.push(entry);
  write(KEYS.logs, logs);

  const daily = read<Record<string, DailyTotals>>(KEYS.daily, {});
  const day = daily[date] ?? emptyDailyTotals(date);
  aggregateLogIntoTotals(day, parsed);
  daily[date] = day;
  write(KEYS.daily, daily);

  markDirty();
  return entry;
}

export function getLogs(date?: string): LogEntry[] {
  const target = date ?? formatDate(new Date());
  const logs = read<LogEntry[]>(KEYS.logs, []);
  return logs
    .filter((l) => l.date === target)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getAllLogs(): LogEntry[] {
  return read<LogEntry[]>(KEYS.logs, []);
}

export function deleteLog(id: string): void {
  const logs = read<LogEntry[]>(KEYS.logs, []);
  const entry = logs.find((l) => l.id === id);
  if (!entry) return;

  const filtered = logs.filter((l) => l.id !== id);
  write(KEYS.logs, filtered);

  const daily = read<Record<string, DailyTotals>>(KEYS.daily, {});
  daily[entry.date] = rebuildDailyForDate(entry.date, filtered);
  write(KEYS.daily, daily);
}

export function getDailyTotals(date?: string): DailyTotals {
  const target = date ?? formatDate(new Date());
  const daily = read<Record<string, DailyTotals>>(KEYS.daily, {});
  return daily[target] ?? emptyDailyTotals(target);
}

export function getAllDailyTotals(): Record<string, DailyTotals> {
  return read<Record<string, DailyTotals>>(KEYS.daily, {});
}

export function addActivity(
  activity: Omit<Activity, "id" | "created_at">
): Activity {
  const full: Activity = {
    ...activity,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const activities = read<Activity[]>(KEYS.activities, []);
  activities.unshift(full);
  write(KEYS.activities, activities);
  markDirty();
  return full;
}

export function addActivityIfNew(
  activity: Omit<Activity, "id" | "created_at">
): Activity | null {
  const activities = read<Activity[]>(KEYS.activities, []);
  if (
    activity.externalId &&
    activities.some((a) => a.externalId === activity.externalId)
  ) {
    return null;
  }
  return addActivity(activity);
}

export function getActivities(limit?: number): Activity[] {
  const activities = read<Activity[]>(KEYS.activities, []);
  return limit ? activities.slice(0, limit) : activities;
}

export function addMeasurement(
  measurement: Omit<Measurement, "id" | "created_at">
): Measurement {
  const full: Measurement = {
    ...measurement,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  const measurements = read<Measurement[]>(KEYS.measurements, []);
  measurements.unshift(full);
  write(KEYS.measurements, measurements);
  markDirty();
  return full;
}

export function getMeasurements(limit?: number): Measurement[] {
  const measurements = read<Measurement[]>(KEYS.measurements, []);
  return limit ? measurements.slice(0, limit) : measurements;
}

export function getLatestMeasurement(): Measurement | null {
  const measurements = getMeasurements();
  return measurements.length > 0 ? measurements[0] : null;
}

export function computeWellnessScore(
  totals: DailyTotals,
  profile: PulseProfile | null
): number {
  const calorieTarget = profile?.targets?.calories ?? 2400;
  const proteinTarget = profile?.targets?.protein_g ?? 150;
  const waterTarget = profile?.targets?.water_ml ?? 2500;
  const stepsTarget = profile?.targets?.steps ?? 8000;

  const calorieScore = Math.min(100, (totals.calories / calorieTarget) * 100);
  const proteinScore = Math.min(100, (totals.protein_g / proteinTarget) * 100);
  const waterScore = Math.min(100, (totals.water_ml / waterTarget) * 100);
  const stepsScore = Math.min(100, (totals.steps / stepsTarget) * 100);

  const alcoholLimit = 14;
  const alcoholPenalty =
    totals.alcohol_units > alcoholLimit
      ? Math.min(30, (totals.alcohol_units - alcoholLimit) * 5)
      : 0;

  const medBonus = totals.medication_taken ? 5 : 0;

  const raw =
    calorieScore * 0.25 +
    proteinScore * 0.2 +
    waterScore * 0.2 +
    stepsScore * 0.25 +
    medBonus -
    alcoholPenalty;

  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function getWeekHistory(): WeekHistory[] {
  const daily = getAllDailyTotals();
  const measurements = getMeasurements();
  const days: WeekHistory[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const totals = daily[dateStr] ?? emptyDailyTotals(dateStr);

    const dayMeasurements = measurements
      .filter((m) => m.date === dateStr)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    const weight =
      dayMeasurements.length > 0
        ? dayMeasurements[dayMeasurements.length - 1].weight
        : null;

    days.push({
      date: dateStr,
      weight,
      calories: totals.calories,
      steps: totals.steps,
      alcohol: totals.alcohol_units,
    });
  }

  return days;
}

export function getWeeklyStats(): WeeklyStats {
  const history = getWeekHistory();

  const daysWithCals = history.filter((h) => h.calories > 0);
  const avgCalories =
    daysWithCals.length > 0
      ? Math.round(
          daysWithCals.reduce((s, h) => s + h.calories, 0) / daysWithCals.length
        )
      : 0;

  const daysWithSteps = history.filter((h) => h.steps > 0);
  const avgSteps =
    daysWithSteps.length > 0
      ? Math.round(
          daysWithSteps.reduce((s, h) => s + h.steps, 0) / daysWithSteps.length
        )
      : 0;

  const dryDays = history.filter((h) => h.alcohol === 0).length;

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const activityCount = getActivities().filter(
    (a) => new Date(a.created_at) >= weekStart
  ).length;

  return { avgCalories, avgSteps, dryDays, activityCount };
}

export function exportAllData(): void {
  if (!isBrowser()) return;

  const data: PulseBackup = {
    version: 2,
    exported_at: new Date().toISOString(),
    account: getAccount(),
    profile: getProfile(),
    onboarded: isOnboarded(),
    logs: getAllLogs(),
    daily: getAllDailyTotals(),
    activities: getActivities(),
    measurements: getMeasurements(),
    chatHistory: read<ChatMessage[]>(KEYS.chatHistory, []),
    goals: read<PulseGoal | null>(KEYS.goals, null),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pulse-backup-${formatDate(new Date())}.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function isValidBackup(data: unknown): data is PulseBackup {
  if (!data || typeof data !== "object") return false;
  const b = data as Record<string, unknown>;
  return (
    typeof b.version === "number" &&
    Array.isArray(b.logs) &&
    typeof b.daily === "object" &&
    b.daily !== null
  );
}

export function parseBackupFile(file: File): Promise<ParsedBackupFile> {
  return new Promise((resolve, reject) => {
    const dateMatch = file.name.match(BACKUP_FILENAME_RE);
    if (!dateMatch) {
      reject(new Error("Invalid backup filename. Expected pulse-backup-YYYY-MM-DD.json"));
      return;
    }
    const backupDate = dateMatch[1];

    const reader = new FileReader();
    reader.onload = () => {
      let data: unknown;
      try {
        data = JSON.parse(reader.result as string);
      } catch {
        reject(new Error("Backup file is not valid JSON"));
        return;
      }

      if (!isValidBackup(data)) {
        reject(new Error("Backup file has an invalid or incomplete structure"));
        return;
      }

      resolve({ ...data, backupDate });
    };
    reader.onerror = () => reject(new Error("Could not read backup file"));
    reader.readAsText(file);
  });
}

export function restoreFromBackup(backup: PulseBackup): void {
  if (backup.profile) write(KEYS.profile, backup.profile);
  else remove(KEYS.profile);
  write(KEYS.logs, backup.logs ?? []);
  write(KEYS.daily, backup.daily ?? {});
  write(KEYS.activities, backup.activities ?? []);
  write(KEYS.measurements, backup.measurements ?? []);
  if (backup.chatHistory) write(KEYS.chatHistory, backup.chatHistory);
  if (backup.goals) write(KEYS.goals, backup.goals);
}

export function importFromBackup(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!isValidBackup(data)) {
          resolve(false);
          return;
        }

        if (data.account) write(KEYS.account, data.account);
        if (data.profile) write(KEYS.profile, data.profile);
        write(KEYS.onboarded, data.onboarded ?? false);
        write(KEYS.logs, data.logs ?? []);
        write(KEYS.daily, data.daily ?? {});
        write(KEYS.activities, data.activities ?? []);
        write(KEYS.measurements, data.measurements ?? []);
        if (data.chatHistory) write(KEYS.chatHistory, data.chatHistory);
        if (data.goals) write(KEYS.goals, data.goals);

        resolve(true);
      } catch {
        resolve(false);
      }
    };
    reader.onerror = () => resolve(false);
    reader.readAsText(file);
  });
}

export function clearAllData(): void {
  Object.values(KEYS).forEach(remove);
  setUnlocked(false);
}
