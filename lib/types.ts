export interface PulseAccount {
  username: string;
  pin: string;
  created_at: string;
}

export interface AnalysisScore {
  score: number;
  verdict: string;
}

export interface AnalysisScores {
  hydration: AnalysisScore;
  sleep: AnalysisScore;
  nutrition: AnalysisScore;
  activity: AnalysisScore;
  lifestyle: AnalysisScore;
}

export interface PulseProfile {
  name: string;
  dob: string;
  age: string;
  sex: string;
  height: string;
  weight: string;
  bodyFat: string;
  muscleMass: string;
  goalWeight: string;
  goalBodyFat: string;
  goals: string;
  activityLevel: string;
  sport: string;
  trainingDays: string;
  trainingIntensity: string;
  dietStyle: string;
  usualBreakfast: string;
  usualLunch: string;
  usualDinner: string;
  usualSnacks: string;
  favouriteFoods: string;
  dislikedFoods: string;
  waterHabit: string;
  medication: string;
  supplements: string;
  alcoholHabit: string;
  alcoholFreq: string;
  alcoholUnits: string;
  alcoholDrinks: string;
  smokingStatus: string;
  sleepHours: string;
  sleepQuality: string;
  stressLevel: string;
  substanceUse: string;
  otherHabits: string;
  calorieTarget: string;
  proteinTarget: string;
  carbTarget: string;
  fatTarget: string;
  waterTarget: string;
  stepsTarget: string;
  analysisScores: AnalysisScores | null;
  overallScore: number | null;
}

export interface ParsedNutrition {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_ml: number | null;
  alcohol_units: number | null;
  medication_taken: boolean | null;
  steps: number | null;
  items: unknown[];
  confidence: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  flags: string[];
  notes: string;
}

export interface LogEntry {
  id: string;
  date: string;
  time: string;
  raw: string;
  parsed: ParsedNutrition;
  created_at: string;
}

export interface DailyTotals {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
  alcohol_units: number;
  steps: number;
  medication_taken: boolean;
}

export interface Activity {
  id: string;
  type: string;
  source: string;
  date: string;
  duration: string;
  distance?: string;
  avgHR?: number;
  calories?: number;
  externalId?: string;
  created_at: string;
}

export interface ParsedActivityUpload {
  activity: string;
  type: string;
  date: string;
  dateDisplay: string;
  duration: string;
  distance?: string;
  avgHR?: number;
  calories?: number;
  externalId?: string;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: {
    id?: number;
    firstname?: string;
    lastname?: string;
  };
}

export interface StravaActivitySummary {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  start_date: string;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  calories?: number;
  kilojoules?: number;
}

export interface Measurement {
  id: string;
  date: string;
  time: string;
  weight: number;
  bodyFat?: number;
  muscleMass?: number;
  boneMass?: number;
  waterPct?: number;
  leanMass?: number;
  bmr?: number;
  bmi?: number;
  impedance?: number;
  created_at: string;
}

export interface WeekHistory {
  date: string;
  weight: number | null;
  calories: number;
  steps: number;
  alcohol: number;
}

export interface WeeklyStats {
  avgCalories: number;
  avgSteps: number;
  dryDays: number;
  activityCount: number;
}

export interface PulseBackup {
  version: number;
  exported_at: string;
  account: PulseAccount | null;
  profile: PulseProfile | null;
  onboarded: boolean;
  logs: LogEntry[];
  daily: Record<string, DailyTotals>;
  activities: Activity[];
  measurements: Measurement[];
}

export interface ParsedBackupFile extends PulseBackup {
  backupDate: string;
}
