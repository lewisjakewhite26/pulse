export interface PulseAccount {
  username: string;
  pin: string;
  created_at: string;
}

export interface PulseProfileExtracted {
  currentWeight?: number;
  targetWeight?: number;
  currentBodyFat?: number;
  targetBodyFat?: number;
  activityLevel?: string;
  sport?: string;
  drinkingHabit?: string;
  sleepQuality?: string;
  stressLevel?: string;
  medication?: string[];
  supplements?: string[];
  dietStyle?: string;
  typicalMeals?: {
    breakfast?: string;
    lunch?: string;
    dinner?: string;
    snacks?: string;
  };
  avoidFoods?: string[];
  otherNotes?: string;
  primaryGoal?: string;
  extractedGoals?: string[];
}

export interface PulseProfileLearned {
  favouriteFoods?: string[];
  usualLunch?: string;
  usualBreakfast?: string;
  usualDinner?: string;
  alcoholPattern?: string;
  medicationMentioned?: string[];
  supplementsMentioned?: string[];
  patterns?: string[];
}

export interface PulseProfileTargets {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  water_ml?: number;
  steps?: number;
  calculated?: boolean;
  calculatedAt?: string;
}

export interface PulseProfileMeasurement {
  weight?: number;
  bodyFat?: number;
  muscleMass?: number;
  bmr?: number;
  date?: string;
}

export interface PulseProfile {
  name: string;
  dateOfBirth: string;
  sex: "Male" | "Female";
  currentSituation: string;
  goal: string;
  timeline: number;
  effortLevel: 1 | 2 | 3 | 4;
  extracted: PulseProfileExtracted;
  learned: PulseProfileLearned;
  targets: PulseProfileTargets;
  latestMeasurement?: PulseProfileMeasurement;
  welcomeMessage?: string;
}

/** @deprecated Legacy shape — migrated on read */
export interface LegacyPulseProfile {
  name: string;
  dob?: string;
  age?: string;
  sex?: string;
  height?: string;
  weight?: string;
  bodyFat?: string;
  muscleMass?: string;
  goalWeight?: string;
  goalBodyFat?: string;
  goals?: string;
  calorieTarget?: string;
  proteinTarget?: string;
  carbTarget?: string;
  fatTarget?: string;
  waterTarget?: string;
  stepsTarget?: string;
  sport?: string;
  dietStyle?: string;
  usualBreakfast?: string;
  usualLunch?: string;
  usualDinner?: string;
  usualSnacks?: string;
  favouriteFoods?: string;
  dislikedFoods?: string;
  medication?: string;
  supplements?: string;
  alcoholHabit?: string;
  sleepQuality?: string;
  stressLevel?: string;
  otherHabits?: string;
  analysisScores?: unknown;
  overallScore?: number | null;
}

export interface PulseGoalTarget {
  metric: string;
  current: number;
  target: number;
  unit: string;
}

export interface PulseGoalMilestone {
  label: string;
  date: string;
  projectedBodyFat?: number;
  projectedWeight?: number;
  description: string;
}

export interface PulseGoal {
  raw: string;
  targets: PulseGoalTarget[];
  timeline: number;
  effortLevel: 1 | 2 | 3 | 4;
  milestones: PulseGoalMilestone[];
  generatedAt: string;
  primaryGoal?: string;
  extractedGoals?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "coach";
  text: string;
  timestamp: string;
  imageDescription?: string;
}

export interface CoachState {
  welcomeMessage?: string;
  welcomeDelivered?: boolean;
  unreadCount: number;
  lastCoachMessageAt?: string;
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
  chatHistory?: ChatMessage[];
  goals?: PulseGoal | null;
}

export interface ParsedBackupFile extends PulseBackup {
  backupDate: string;
}

export interface CoachChatResponse {
  message: string;
  parsed: ParsedNutrition;
  profile_updates?: Partial<PulseProfileLearned>;
  should_log?: boolean;
}
