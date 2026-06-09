import type {
  ChatMessage,
  CoachState,
  PulseGoal,
  PulseProfile,
  PulseProfileExtracted,
  PulseProfileLearned,
  PulseProfileTargets,
} from "./types";
import {
  createEmptyProfile,
  mergeLearned,
} from "./profile-helpers";
import {
  KEYS,
  markDirty,
  read,
  write,
  getProfile as getProfileCore,
  saveProfile as saveProfileCore,
} from "./storage-core";

export * from "./storage-core";

const CHAT_MAX = 50;

export function getProfile(): PulseProfile | null {
  return getProfileCore();
}

export function saveProfile(profile: PulseProfile): void {
  saveProfileCore(profile);
}

export function updateExtractedProfile(updates: Partial<PulseProfileExtracted>): void {
  const profile = getProfile();
  if (!profile) return;
  saveProfile({
    ...profile,
    extracted: { ...profile.extracted, ...updates },
  });
}

export function updateLearnedProfile(updates: Partial<PulseProfileLearned>): void {
  const profile = getProfile();
  if (!profile) return;
  saveProfile({
    ...profile,
    learned: mergeLearned(profile.learned, updates),
  });
}

export function updateProfileTargets(updates: Partial<PulseProfileTargets>): void {
  const profile = getProfile();
  if (!profile) return;
  saveProfile({
    ...profile,
    targets: {
      ...profile.targets,
      ...updates,
      calculated: updates.calculated ?? profile.targets.calculated,
      calculatedAt: updates.calculatedAt ?? profile.targets.calculatedAt,
    },
  });
}

export function updateLatestMeasurement(
  measurement: PulseProfile["latestMeasurement"]
): void {
  const profile = getProfile();
  if (!profile) return;
  saveProfile({ ...profile, latestMeasurement: measurement });
}

export function getChatHistory(): ChatMessage[] {
  return read<ChatMessage[]>(KEYS.chatHistory, []);
}

export function addChatMessage(message: Omit<ChatMessage, "id">): ChatMessage {
  const entry: ChatMessage = { ...message, id: crypto.randomUUID() };
  const history = getChatHistory();
  history.push(entry);
  while (history.length > CHAT_MAX) history.shift();
  write(KEYS.chatHistory, history);
  markDirty();
  return entry;
}

export function getCoachState(): CoachState {
  return read<CoachState>(KEYS.coachState, { unreadCount: 0 });
}

export function saveCoachState(state: CoachState): void {
  write(KEYS.coachState, state);
}

export function markCoachUnread(): void {
  const state = getCoachState();
  saveCoachState({
    ...state,
    unreadCount: state.unreadCount + 1,
    lastCoachMessageAt: new Date().toISOString(),
  });
}

export function clearCoachUnread(): void {
  const state = getCoachState();
  saveCoachState({ ...state, unreadCount: 0 });
}

export function getGoals(): PulseGoal | null {
  return read<PulseGoal | null>(KEYS.goals, null);
}

export function saveGoals(goals: PulseGoal): void {
  write(KEYS.goals, goals);
  markDirty();
}

export function createDefaultProfile(name: string): PulseProfile {
  return createEmptyProfile(name);
}
