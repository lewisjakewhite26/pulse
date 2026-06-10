import type { CSSProperties } from "react";

export const COLORS = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  onSurface: "#1A1D24",
  onSurfaceVariant: "#6B7280",
  outline: "#E5E7EB",
  outlineVariant: "#F3F4F6",
  primary: "#EE4F4F",
  primaryLight: "rgba(238, 79, 79, 0.08)",
  primaryBorder: "rgba(238, 79, 79, 0.2)",
  success: "#ABFE67",
  successText: "#2D5A00",
  successLight: "rgba(171, 254, 103, 0.15)",
  error: "#DC2626",
  warning: "#F59E0B",
  glass: "rgba(255, 255, 255, 0.7)",
  glassBorder: "rgba(255, 255, 255, 0.4)",
  glassShadow: "0px 4px 24px rgba(0, 0, 0, 0.06)",
  teal: "#0891B2",
  blue: "#3B82F6",
  grey: "#6B7280",
  inactiveIcon: "#9CA3AF",
  strava: "#FC4C02",
} as const;

/** @deprecated Use COLORS — kept for existing AUTH_THEME imports */
export const AUTH_THEME = {
  ...COLORS,
  secondary: COLORS.success,
  amber: COLORS.warning,
  surfaceContainer: COLORS.outlineVariant,
  tertiary: COLORS.teal,
  purple: "#8B5CF6",
};

export const GLASS_CARD: CSSProperties = {
  background: COLORS.glass,
  backdropFilter: "blur(15px)",
  WebkitBackdropFilter: "blur(15px)",
  border: `1.5px solid ${COLORS.glassBorder}`,
  boxShadow: "0px 10px 30px rgba(26,29,36,0.04)",
  borderRadius: 16,
};

export const glassCardStyle: CSSProperties = {
  ...GLASS_CARD,
  padding: 20,
  width: "100%",
};

export const HEADER_STYLE: CSSProperties = {
  background: "rgba(255,255,255,0.8)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "0.5px solid rgba(0,0,0,0.06)",
  boxShadow: "0px 1px 0px rgba(0,0,0,0.04)",
  height: 60,
};

export const FLOATING_NAV: CSSProperties = {
  position: "fixed",
  bottom: 16,
  left: "50%",
  transform: "translateX(-50%)",
  width: "calc(100% - 40px)",
  maxWidth: 440,
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1.5px solid rgba(255,255,255,0.5)",
  borderRadius: 24,
  boxShadow: "0px 8px 32px rgba(0,0,0,0.08)",
  height: 64,
  padding: "0 8px",
  paddingBottom: "env(safe-area-inset-bottom)",
  zIndex: 100,
  display: "flex",
  justifyContent: "space-around",
  alignItems: "center",
};

export const TAB_ICONS: Record<string, string> = {
  dashboard: "ti-layout-dashboard",
  log: "ti-message-circle",
  activity: "ti-run",
  trends: "ti-trending-up",
  profile: "ti-user",
};
