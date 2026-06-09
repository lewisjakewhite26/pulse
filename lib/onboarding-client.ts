import type { PulseGoal, PulseProfile } from "./types";
import {
  addChatMessage,
  getProfile,
  saveGoals,
  saveProfile,
  updateExtractedProfile,
  updateProfileTargets,
  saveCoachState,
  getCoachState,
} from "./storage";

export async function runOnboardingBackgroundTasks(profile: PulseProfile): Promise<void> {
  try {
    const extractRes = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "extract_profile",
        currentSituation: profile.currentSituation,
        goal: profile.goal,
      }),
    });
    const extractData = await extractRes.json();
    if (!extractData.error) {
      const current = getProfile();
      if (current) {
        saveProfile({
          ...current,
          extracted: { ...current.extracted, ...(extractData.extracted ?? {}) },
          targets: {
            ...current.targets,
            ...(extractData.targets ?? {}),
            calculated: Boolean(extractData.targets?.calories),
            calculatedAt: extractData.targets?.calories
              ? new Date().toISOString()
              : current.targets.calculatedAt,
          },
        });
      } else if (extractData.extracted) {
        updateExtractedProfile(extractData.extracted);
      }
      if (extractData.targets) {
        updateProfileTargets({
          ...extractData.targets,
          calculated: Boolean(extractData.targets.calories),
          calculatedAt: new Date().toISOString(),
        });
      }
    }
  } catch {
    // silent background task
  }

  try {
    const updated = getProfile() ?? profile;
    const milestoneRes = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_milestones", profile: updated }),
    });
    const milestoneData = await milestoneRes.json();
    if (!milestoneData.error) {
      const goals: PulseGoal = {
        raw: updated.goal,
        targets: milestoneData.targets ?? [],
        timeline: updated.timeline,
        effortLevel: updated.effortLevel,
        milestones: milestoneData.milestones ?? [],
        generatedAt: new Date().toISOString(),
      };
      saveGoals(goals);
    }
  } catch {
    // silent background task
  }
}

export async function fetchWelcomeMessage(profile: PulseProfile): Promise<string> {
  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "welcome", profile }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const message = data.message || "Right, let's get started. Log whatever you eat or do today and I'll handle the rest.";
    addChatMessage({
      role: "coach",
      text: message,
      timestamp: new Date().toISOString(),
    });
    saveCoachState({
      ...getCoachState(),
      welcomeMessage: message,
      welcomeDelivered: true,
      unreadCount: 1,
      lastCoachMessageAt: new Date().toISOString(),
    });
    return message;
  } catch {
    const fallback = `${profile.name}, I've read what you wrote. Let's keep this simple — log food, training, and whatever else matters today. I'll pick up the patterns.`;
    addChatMessage({ role: "coach", text: fallback, timestamp: new Date().toISOString() });
    saveCoachState({
      ...getCoachState(),
      welcomeMessage: fallback,
      welcomeDelivered: true,
      unreadCount: 1,
    });
    return fallback;
  }
}

export async function sendCoachMessage(options: {
  input: string;
  profile: PulseProfile | null;
  dailyTotals: import("./types").DailyTotals;
  chatHistory: import("./types").ChatMessage[];
  fromVoice?: boolean;
  imageContext?: string;
}) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      input: options.input,
      profile: options.profile,
      dailyTotals: options.dailyTotals,
      chatHistory: options.chatHistory,
      fromVoice: options.fromVoice,
      imageContext: options.imageContext,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : "Coach unavailable");
  return data as {
    message: string;
    parsed: import("./types").ParsedNutrition;
    profile_updates?: import("./types").PulseProfileLearned;
    should_log: boolean;
  };
}
