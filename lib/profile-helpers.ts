import type {
  LegacyPulseProfile,
  PulseGoal,
  PulseProfile,
  PulseProfileLearned,
  PulseProfileMeasurement,
} from "./types";

export const EFFORT_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Just having a look",
  2: "Doing my best when I can",
  3: "Serious about this",
  4: "No excuses",
};

export const TIMELINE_OPTIONS = [1, 3, 6, 12, 18] as const;

export function timelineLabel(months: number): string {
  if (months === 1) return "1 month";
  if (months === 12) return "1 year";
  if (months === 18) return "18 months";
  return `${months} months`;
}

export function effortSummary(timeline: number, effortLevel: 1 | 2 | 3 | 4): string {
  return `${timelineLabel(timeline)}, ${EFFORT_LABELS[effortLevel].toLowerCase()}`;
}

export function roundDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatDecimal(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return "";
  return roundDecimal(n).toFixed(1);
}

export function createEmptyProfile(name = ""): PulseProfile {
  return {
    name,
    dateOfBirth: "",
    sex: "Male",
    currentSituation: "",
    goal: "",
    timeline: 6,
    effortLevel: 2,
    extracted: {},
    learned: {},
    targets: { calculated: false },
  };
}

export function ageFromDateOfBirth(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function isLegacyProfile(value: unknown): value is LegacyPulseProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.name === "string" && !("dateOfBirth" in p);
}

export function migrateLegacyProfile(legacy: LegacyPulseProfile): PulseProfile {
  const parseNum = (v?: string) => {
    const n = parseFloat(v ?? "");
    return Number.isFinite(n) ? n : undefined;
  };

  const measurement: PulseProfileMeasurement | undefined = legacy.weight
    ? {
        weight: parseNum(legacy.weight),
        bodyFat: parseNum(legacy.bodyFat),
        muscleMass: parseNum(legacy.muscleMass),
      }
    : undefined;

  return {
    name: legacy.name || "User",
    dateOfBirth: legacy.dob || "",
    sex: legacy.sex === "Female" ? "Female" : "Male",
    currentSituation: legacy.otherHabits || "",
    goal: legacy.goals || "",
    timeline: 6,
    effortLevel: 2,
    extracted: {
      currentWeight: parseNum(legacy.weight),
      targetWeight: parseNum(legacy.goalWeight),
      currentBodyFat: parseNum(legacy.bodyFat),
      targetBodyFat: parseNum(legacy.goalBodyFat),
      sport: legacy.sport || undefined,
      dietStyle: legacy.dietStyle || undefined,
      drinkingHabit: legacy.alcoholHabit || undefined,
      sleepQuality: legacy.sleepQuality || undefined,
      stressLevel: legacy.stressLevel || undefined,
      medication: legacy.medication ? [legacy.medication] : undefined,
      supplements: legacy.supplements ? [legacy.supplements] : undefined,
      typicalMeals: {
        breakfast: legacy.usualBreakfast || undefined,
        lunch: legacy.usualLunch || undefined,
        dinner: legacy.usualDinner || undefined,
        snacks: legacy.usualSnacks || undefined,
      },
      avoidFoods: legacy.dislikedFoods ? [legacy.dislikedFoods] : undefined,
    },
    learned: {
      favouriteFoods: legacy.favouriteFoods ? [legacy.favouriteFoods] : undefined,
      usualBreakfast: legacy.usualBreakfast || undefined,
      usualLunch: legacy.usualLunch || undefined,
      usualDinner: legacy.usualDinner || undefined,
    },
    targets: {
      calories: parseNum(legacy.calorieTarget),
      protein_g: parseNum(legacy.proteinTarget),
      carbs_g: parseNum(legacy.carbTarget),
      fat_g: parseNum(legacy.fatTarget),
      water_ml: parseNum(legacy.waterTarget),
      steps: parseNum(legacy.stepsTarget),
      calculated: Boolean(legacy.calorieTarget),
    },
    latestMeasurement: measurement,
  };
}

export function buildProfileContextSummary(profile: PulseProfile | null): string {
  if (!profile) return "";
  const lines: string[] = [];
  lines.push(`Name: ${profile.name}`);
  const age = ageFromDateOfBirth(profile.dateOfBirth);
  if (age) lines.push(`Age: ${age}, Sex: ${profile.sex}`);
  if (profile.goal) lines.push(`Goal: ${profile.goal}`);
  lines.push(`Timeline: ${timelineLabel(profile.timeline)}, effort: ${EFFORT_LABELS[profile.effortLevel]}`);
  if (profile.currentSituation) lines.push(`Current situation: ${profile.currentSituation}`);
  if (profile.latestMeasurement?.weight) {
    lines.push(`Latest weight: ${formatDecimal(profile.latestMeasurement.weight)}kg`);
  }
  if (profile.extracted.currentBodyFat) {
    lines.push(`Body fat: ${formatDecimal(profile.extracted.currentBodyFat)}%`);
  }
  if (profile.targets.calculated && profile.targets.calories) {
    lines.push(
      `Targets: ${profile.targets.calories} kcal, ${profile.targets.protein_g ?? "?"}g protein, ${profile.targets.water_ml ?? "?"}ml water`
    );
  }
  const learned = profile.learned;
  if (learned.usualLunch) lines.push(`Usual lunch: ${learned.usualLunch}`);
  if (learned.patterns?.length) lines.push(`Patterns: ${learned.patterns.join("; ")}`);
  return lines.join("\n");
}

export function mergeLearned(
  existing: PulseProfileLearned,
  updates: Partial<PulseProfileLearned>
): PulseProfileLearned {
  const next = { ...existing };
  for (const [key, value] of Object.entries(updates) as [keyof PulseProfileLearned, unknown][]) {
    if (value === undefined) continue;
    if (Array.isArray(value) && Array.isArray(next[key])) {
      const merged = [...new Set([...(next[key] as string[]), ...(value as string[])])];
      (next as Record<string, unknown>)[key] = merged;
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

export function createEmptyGoal(profile: PulseProfile): PulseGoal {
  return {
    raw: profile.goal,
    targets: [],
    timeline: profile.timeline,
    effortLevel: profile.effortLevel,
    milestones: [],
    generatedAt: new Date().toISOString(),
  };
}

export function dobFromParts(day: number, month: number, year: number): string {
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function parseDobParts(dateOfBirth: string): { day: number; month: number; year: number } {
  if (!dateOfBirth) return { day: 1, month: 1, year: 1990 };
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  return { day: d || 1, month: m || 1, year: y || 1990 };
}

export function snapTimeline(value: number): number {
  let closest: number = TIMELINE_OPTIONS[0];
  for (const opt of TIMELINE_OPTIONS) {
    if (Math.abs(opt - value) < Math.abs(closest - value)) closest = opt;
  }
  return closest;
}
