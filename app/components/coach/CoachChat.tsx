"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import {
  addChatMessage,
  addLog,
  getChatHistory,
  getDailyTotals,
  getLogs,
  getProfile,
  markCoachUnread,
  updateLearnedProfile,
} from "@/lib/storage";
import { sendCoachMessage } from "@/lib/onboarding-client";
import { COLORS } from "@/lib/design-tokens";

const C = COLORS;

function isChromeAndroid() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg|OPR|SamsungBrowser|Firefox/i.test(ua);
}

interface CoachChatProps {
  compact?: boolean;
  onExpand?: () => void;
  onMessageSent?: () => void;
  showTodayLog?: boolean;
  markUnread?: boolean;
}

export default function CoachChat({
  compact = false,
  onExpand,
  onMessageSent,
  showTodayLog = true,
  markUnread = true,
}: CoachChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => getChatHistory());
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const daily = getDailyTotals();
  const todayLogs = getLogs();

  useEffect(() => {
    setVoiceSupported(
      isChromeAndroid() &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    );
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = async (text: string, opts?: { fromVoice?: boolean; imageContext?: string }) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;

    const userMsg = addChatMessage({
      role: "user",
      text: trimmed,
      timestamp: new Date().toISOString(),
    });
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      const profile = getProfile();
      const history = getChatHistory();
      const data = await sendCoachMessage({
        input: trimmed,
        profile,
        dailyTotals: getDailyTotals(),
        chatHistory: history.slice(0, -1),
        fromVoice: opts?.fromVoice,
        imageContext: opts?.imageContext,
      });

      if (data.profile_updates) {
        updateLearnedProfile(data.profile_updates);
      }

      if (data.should_log && data.parsed) {
        addLog(trimmed, data.parsed);
      }

      const coachMsg = addChatMessage({
        role: "coach",
        text: data.message,
        timestamp: new Date().toISOString(),
      });
      setMessages((prev) => [...prev, coachMsg]);
      if (markUnread) markCoachUnread();
      onMessageSent?.();
    } catch {
      const errMsg = addChatMessage({
        role: "coach",
        text: "Couldn't reach me just then. Check your connection and try again.",
        timestamp: new Date().toISOString(),
      });
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setTyping(false);
    }
  };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-GB";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = e.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const handleImage = async (file: File) => {
    setImageProcessing(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = reader.result as string;
          resolve(r.split(",")[1] ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/gemini-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (data.text) {
        await sendMessage(data.text, { imageContext: data.text });
      }
    } finally {
      setImageProcessing(false);
    }
  };

  const visibleMessages = compact ? messages.slice(-3) : messages;
  let lastSessionLabel = "";

  const inputBar = (
    <div style={{
      background: "rgba(255,255,255,0.9)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderTop: compact ? "none" : "0.5px solid rgba(0,0,0,0.06)",
      padding: compact ? "8px 0 0" : "10px 16px",
      paddingBottom: compact ? 0 : "calc(10px + env(safe-area-inset-bottom))",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      flexShrink: 0,
    }}>
      {listening && (
        <div style={{ fontSize: 12, fontWeight: 600, color: C.warning, textAlign: "center" }}>Listening...</div>
      )}
      {imageProcessing && (
        <div style={{ fontSize: 12, fontWeight: 600, color: C.blue, textAlign: "center" }}>Reading label...</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {voiceSupported && (
          <button
            type="button"
            onClick={startVoice}
            disabled={listening || typing}
            aria-label="Voice"
            style={{
              width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
              border: `1px solid ${C.primaryBorder}`,
              background: listening ? "rgba(238,79,79,0.2)" : C.primaryLight,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              animation: listening ? "pulse-mic 1.5s ease-in-out infinite" : undefined,
              transition: "all 0.2s ease",
            }}
          >
            <i className="ti ti-microphone" style={{ fontSize: 18, color: C.primary }} />
          </button>
        )}
        {voiceSupported && (
          <>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={imageProcessing}
              aria-label="Camera"
              style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                border: `1px solid ${C.primaryBorder}`, background: C.primaryLight,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {imageProcessing
                ? <span style={{ width: 16, height: 16, border: `2px solid ${C.primary}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                : <i className="ti ti-camera" style={{ fontSize: 18, color: C.primary }} />}
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); e.target.value = ""; }} style={{ display: "none" }} />
          </>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void sendMessage(input)}
          placeholder="Talk to your coach..."
          style={{
            flex: 1, minWidth: 0, border: `1.5px solid ${C.outline}`, borderRadius: 999,
            background: "rgba(255,255,255,0.8)", padding: "10px 16px", fontSize: 14,
            fontFamily: "inherit", outline: "none", color: C.onSurface, transition: "border-color 0.2s ease",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = C.outline; }}
        />
        {input.trim() && (
          <button
            type="button"
            onClick={() => void sendMessage(input)}
            disabled={typing}
            aria-label="Send"
            style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", background: C.primary,
              cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0px 4px 16px rgba(238,79,79,0.35)",
            }}
          >
            <i className="ti ti-arrow-up" style={{ fontSize: 18, color: "#fff" }} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: compact ? 320 : "calc(100dvh - 60px - 80px - 16px)",
      minHeight: compact ? 320 : 360,
      minWidth: 0,
      margin: compact ? 0 : "-20px",
      width: compact ? "100%" : "calc(100% + 40px)",
    }}>
      {!compact && (
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>Brain dump</div>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: C.onSurfaceVariant, margin: 0 }}>
            Talk to your coach, food, training, mood, sleep, whatever&apos;s on your mind.
          </p>
        </div>
      )}

      {compact && onExpand && (
        <button type="button" onClick={onExpand} style={{ background: "none", border: "none", color: C.primary, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginBottom: 12, textAlign: "left", padding: 0 }}>
          See full conversation
        </button>
      )}

      <div ref={scrollRef} className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: compact ? "0" : "0 20px 16px", minWidth: 0 }}>
        {visibleMessages.map((m, idx) => {
          const sessionKey = m.timestamp.slice(0, 13);
          const showSession = m.role === "coach" && sessionKey !== lastSessionLabel;
          if (showSession) lastSessionLabel = sessionKey;
          const showCoachLabel = showSession && (idx === 0 || visibleMessages[idx - 1]?.role === "user");

          return (
            <div key={m.id}>
              {showCoachLabel && (
                <div style={{ fontSize: 11, fontWeight: 600, color: C.primary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, marginTop: idx > 0 ? 16 : 0 }}>
                  Pulse
                </div>
              )}
              <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{
                  maxWidth: "85%", minWidth: 0,
                  padding: "10px 14px",
                  borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: m.role === "user" ? C.primary : "rgba(255,255,255,0.85)",
                  backdropFilter: m.role === "coach" ? "blur(12px)" : undefined,
                  WebkitBackdropFilter: m.role === "coach" ? "blur(12px)" : undefined,
                  border: m.role === "coach" ? "1.5px solid rgba(255,255,255,0.5)" : "none",
                  color: m.role === "user" ? "#fff" : C.onSurface,
                  fontSize: 14, lineHeight: 1.6, wordBreak: "break-word",
                }}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div style={{ display: "flex", marginBottom: 12 }}>
            <div style={{
              padding: "12px 16px", borderRadius: "18px 18px 18px 4px",
              background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(255,255,255,0.5)",
            }}>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.primary, display: "inline-block", animation: `typing-bounce 1.2s ${i * 0.15}s infinite` }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {showTodayLog && !compact && (
        <div style={{ padding: "0 20px 12px", flexShrink: 0 }}>
          <button type="button" onClick={() => setLogExpanded(!logExpanded)} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "rgba(255,255,255,0.7)", backdropFilter: "blur(15px)",
            border: `1.5px solid ${C.glassBorder}`, borderRadius: 16, padding: "12px 16px",
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease",
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.onSurfaceVariant, letterSpacing: "0.08em", textTransform: "uppercase" }}>Today&apos;s log</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: C.onSurfaceVariant }}>{daily.calories} kcal · {daily.protein_g}g protein</span>
              <i className={`ti ti-chevron-${logExpanded ? "up" : "down"}`} style={{ fontSize: 16, color: C.onSurfaceVariant }} />
            </span>
          </button>
          {logExpanded && (
            <div style={{ ...{ background: C.glass, backdropFilter: "blur(15px)", border: `1.5px solid ${C.glassBorder}`, borderRadius: 16 }, marginTop: 8, padding: "4px 16px" }}>
              {todayLogs.length === 0 ? (
                <p style={{ fontSize: 15, color: C.onSurfaceVariant, padding: "12px 0", margin: 0 }}>Nothing logged yet today.</p>
              ) : todayLogs.slice().reverse().map((entry, i, arr) => (
                <div key={entry.id} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
                  borderBottom: i < arr.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none",
                }}>
                  <div style={{ fontSize: 12, color: C.onSurfaceVariant, width: 48, flexShrink: 0 }}>{entry.time}</div>
                  <div style={{ flex: 1, fontSize: 15, color: C.onSurface, wordBreak: "break-word" }}>{entry.raw}</div>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: C.success, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <i className="ti ti-check" style={{ fontSize: 10, color: "#fff" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!compact && (
        <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, zIndex: 50 }}>
          {inputBar}
        </div>
      )}
      {compact && inputBar}
    </div>
  );
}
