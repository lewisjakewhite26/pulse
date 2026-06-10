import type { PulseProfile } from "./types";
import { createEmptyProfile } from "./profile-helpers";
import {
  createAccount,
  hasAccount,
  saveProfile,
  setOnboarded,
  setUnlocked,
} from "./storage";

const DEV_GOAL =
  "Want to get to 10% body fat and last the full 90 minutes on the pitch. Play Sunday league football, want to feel fitter and leaner.";

export function buildDevProfile(): PulseProfile {
  return {
    ...createEmptyProfile("Lewis"),
    dateOfBirth: "1990-06-15",
    sex: "Male",
    goal: DEV_GOAL,
    timeline: 6,
    effortLevel: 3,
    extracted: {},
    learned: {},
    targets: { calculated: false },
  };
}

/** DEBUG — auto-fill onboarding and skip to dashboard */
export function debugSkipOnboarding(): void {
  if (!hasAccount()) {
    createAccount("Lewis", "0000"); // DEBUG — default PIN
  }
  try {
    localStorage.setItem("pulse_session_unlocked", "true");
  } catch {
    // ignore private mode
  }
  setUnlocked(true);
  saveProfile(buildDevProfile());
  setOnboarded(true);
  window.location.reload();
}

/** DEBUG — remove before shipping */
export function debugSkipToApp(): void {
  debugSkipOnboarding();
}
