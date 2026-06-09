import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNutrition, PulseProfile } from "../types";
import {
  addActivityIfNew,
  addLog,
  clearAllData,
  computeWellnessScore,
  createAccount,
  deleteLog,
  getActivities,
  getDailyTotals,
  getLogs,
  getProfile,
  hasAccount,
  markDirty,
  needsSync,
  parseBackupFile,
  restoreFromBackup,
  saveProfile,
  setLastSynced,
  verifyPin,
} from "../storage";

const baseParsed: ParsedNutrition = {
  calories: 500,
  protein_g: 30,
  carbs_g: 40,
  fat_g: 10,
  water_ml: 250,
  alcohol_units: 0,
  steps: null,
  medication_taken: false,
  items: [],
  confidence: {},
  flags: [],
  notes: "",
};

const emptyProfile: PulseProfile = {
  name: "Test",
  dob: "1990-01-01",
  age: "36",
  sex: "Male",
  height: "180",
  weight: "80",
  bodyFat: "18",
  muscleMass: "60",
  goalWeight: "75",
  goalBodyFat: "15",
  goals: "Get fit",
  activityLevel: "Moderate",
  sport: "Running",
  trainingDays: "3",
  trainingIntensity: "Moderate",
  dietStyle: "Balanced",
  usualBreakfast: "Porridge",
  usualLunch: "Wrap",
  usualDinner: "Pasta",
  usualSnacks: "Fruit",
  favouriteFoods: "Chicken",
  dislikedFoods: "None",
  waterHabit: "2L",
  medication: "None",
  supplements: "None",
  alcoholHabit: "Weekends",
  alcoholFreq: "Weekends",
  alcoholUnits: "14",
  alcoholDrinks: "Beer",
  smokingStatus: "Non-smoker",
  sleepHours: "7",
  sleepQuality: "Decent",
  stressLevel: "Moderate",
  substanceUse: "None",
  otherHabits: "",
  calorieTarget: "2000",
  proteinTarget: "150",
  carbTarget: "200",
  fatTarget: "65",
  waterTarget: "2500",
  stepsTarget: "8000",
  analysisScores: null,
  overallScore: null,
};

beforeEach(() => {
  localStorage.clear();
  clearAllData();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("storage account", () => {
  it("creates account and verifies PIN", () => {
    expect(createAccount("Lewis", "1234")).toBe(true);
    expect(hasAccount()).toBe(true);
    expect(verifyPin("1234")).toBe(true);
    expect(verifyPin("0000")).toBe(false);
  });
});

describe("storage logs", () => {
  it("sums nutrition fields across logs", () => {
    addLog("Breakfast", { ...baseParsed, calories: 400, protein_g: 25 });
    addLog("Lunch", { ...baseParsed, calories: 600, protein_g: 35 });

    const daily = getDailyTotals();
    expect(daily.calories).toBe(1000);
    expect(daily.protein_g).toBe(60);
  });

  it("uses highest steps reading for the day, not a sum", () => {
    addLog("Morning", { ...baseParsed, steps: 3000 });
    addLog("Afternoon", { ...baseParsed, steps: 7500 });
    addLog("Evening", { ...baseParsed, steps: 5000 });

    expect(getDailyTotals().steps).toBe(7500);
  });

  it("deleteLog removes entry and rebuilds daily totals", () => {
    const entry = addLog("Snack", { ...baseParsed, calories: 300 });
    expect(getLogs().length).toBe(1);
    expect(getDailyTotals().calories).toBe(300);

    deleteLog(entry.id);

    expect(getLogs().length).toBe(0);
    expect(getDailyTotals().calories).toBe(0);
  });
});

describe("storage activities", () => {
  it("addActivityIfNew skips duplicate externalId", () => {
    const activity = {
      type: "Run",
      source: "Strava",
      date: "2026-06-08",
      duration: "32:10",
      distance: "5.2 km",
      externalId: "strava:999",
    };

    expect(addActivityIfNew(activity)).not.toBeNull();
    expect(addActivityIfNew(activity)).toBeNull();
    expect(getActivities().length).toBe(1);
  });
});

describe("computeWellnessScore", () => {
  it("returns a score when profile targets are set", () => {
    saveProfile(emptyProfile);
    const daily = getDailyTotals();
    daily.calories = 1500;
    daily.protein_g = 120;
    daily.water_ml = 2000;
    daily.steps = 6000;

    const score = computeWellnessScore(daily, emptyProfile);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("sync state", () => {
  it("markDirty sets dirty and setLastSynced clears it", () => {
    expect(needsSync()).toBe(false);
    markDirty();
    expect(needsSync()).toBe(true);
    setLastSynced();
    expect(needsSync()).toBe(false);
  });

  it("needsSync reflects dirty flag correctly", () => {
    markDirty();
    expect(needsSync()).toBe(true);
    setLastSynced();
    expect(needsSync()).toBe(false);
    markDirty();
    expect(needsSync()).toBe(true);
  });
});

describe("restoreFromBackup", () => {
  it("restores data but does not overwrite pulse_account", () => {
    createAccount("Lewis", "1234");
    addLog("Lunch", { ...baseParsed, calories: 800 });

    const backup = {
      version: 1,
      exported_at: new Date().toISOString(),
      account: {
        username: "Hacker",
        pin: "bad",
        created_at: new Date().toISOString(),
      },
      profile: { ...emptyProfile, name: "Restored Name" },
      onboarded: true,
      logs: [],
      daily: {},
      activities: [
        {
          id: "act-1",
          type: "Run",
          source: "Manual",
          date: "2026-06-08",
          duration: "30:00",
          distance: "5 km",
          created_at: new Date().toISOString(),
        },
      ],
      measurements: [],
    };

    restoreFromBackup(backup);

    expect(hasAccount()).toBe(true);
    expect(verifyPin("1234")).toBe(true);
    expect(getProfile()?.name).toBe("Restored Name");
    expect(getLogs().length).toBe(0);
    expect(getActivities().length).toBe(1);
  });
});

describe("parseBackupFile", () => {
  const validBackupJson = JSON.stringify({
    version: 1,
    exported_at: "2026-06-09T10:00:00.000Z",
    account: null,
    profile: emptyProfile,
    onboarded: false,
    logs: [],
    daily: {},
    activities: [],
    measurements: [],
  });

  it("throws on malformed JSON", async () => {
    const file = new File(["not json"], "pulse-backup-2026-06-09.json", {
      type: "application/json",
    });
    await expect(parseBackupFile(file)).rejects.toThrow(/valid JSON/i);
  });

  it("extracts date from pulse-backup-2026-06-09.json filename", async () => {
    const file = new File([validBackupJson], "pulse-backup-2026-06-09.json", {
      type: "application/json",
    });
    const parsed = await parseBackupFile(file);
    expect(parsed.backupDate).toBe("2026-06-09");
    expect(parsed.version).toBe(1);
  });
});
