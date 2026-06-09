import type { PulseProfile } from "./types";
import {
  createAccount,
  hasAccount,
  saveProfile,
  setOnboarded,
  setUnlocked,
} from "./storage";

const DEV_PROFILE: PulseProfile = {
  name: "Lewis",
  dob: "",
  age: "34",
  sex: "Male",
  height: "180",
  weight: "84",
  bodyFat: "",
  muscleMass: "",
  goalWeight: "",
  goalBodyFat: "",
  goals: "",
  activityLevel: "",
  sport: "",
  trainingDays: "",
  trainingIntensity: "",
  dietStyle: "",
  usualBreakfast: "",
  usualLunch: "",
  usualDinner: "",
  usualSnacks: "",
  favouriteFoods: "",
  dislikedFoods: "",
  waterHabit: "",
  medication: "",
  supplements: "",
  alcoholHabit: "",
  alcoholFreq: "",
  alcoholUnits: "",
  alcoholDrinks: "",
  smokingStatus: "",
  sleepHours: "",
  sleepQuality: "",
  stressLevel: "",
  substanceUse: "",
  otherHabits: "",
  calorieTarget: "2400",
  proteinTarget: "180",
  carbTarget: "240",
  fatTarget: "65",
  waterTarget: "3000",
  stepsTarget: "10000",
  analysisScores: null,
  overallScore: null,
};

/** DEBUG — remove before shipping */
export function debugSkipToApp(): void {
  if (!hasAccount()) {
    createAccount("Lewis", "0000");
  }
  try {
    localStorage.setItem("pulse_session_unlocked", "true");
    sessionStorage.setItem("pulse_dev_tab", "activity");
  } catch {
    // ignore private mode
  }
  setUnlocked(true);
  saveProfile(DEV_PROFILE);
  setOnboarded(true);
  window.location.reload();
}
