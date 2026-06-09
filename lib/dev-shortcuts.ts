import type { PulseProfile } from "./types";
import { createEmptyProfile } from "./profile-helpers";
import {
  createAccount,
  hasAccount,
  saveProfile,
  setOnboarded,
  setUnlocked,
} from "./storage";

const DEV_PROFILE: PulseProfile = {
  ...createEmptyProfile("Lewis"),
  dateOfBirth: "1990-06-15",
  sex: "Male",
  currentSituation:
    "About 84kg, bit of a belly. Football Sundays, desk job, drink most weekends.",
  goal: "Get leaner, maybe 10% body fat. Last the full 90 on the pitch.",
  timeline: 6,
  effortLevel: 2,
  extracted: {
    currentWeight: 84,
    targetBodyFat: 10,
    sport: "Football",
    drinkingHabit: "Weekends",
  },
  targets: {
    calories: 2400,
    protein_g: 180,
    carbs_g: 240,
    fat_g: 65,
    water_ml: 3000,
    steps: 10000,
    calculated: true,
    calculatedAt: new Date().toISOString(),
  },
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
