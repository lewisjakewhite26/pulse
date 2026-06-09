"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage, DailyTotals, PulseProfile } from "@/lib/types";
import {
  addChatMessage,
  addLog,
  getChatHistory,
  getDailyTotals,
  getProfile,
  markCoachUnread,
  updateLearnedProfile,
} from "@/lib/storage";
import { sendCoachMessage } from "@/lib/onboarding-client";
import { AUTH_THEME } from "../AuthShell";

const C = AUTH_THEME;

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
  const todayLogs = messages.length ? getChatHistory() : [];

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: compact ? 320 : "calc(100vh - 180px)", minHeight: compact ? 320 : 400, minWidth: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: compact ? "8px 0" : "0 0 16px", minWidth: 0 }}>
        {visibleMessages.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12, padding: "0 4px" }}>
            <div style={{ maxWidth: "85%", minWidth: 0 }}>
              <div style={{
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: m.role === "user" ? C.primary : "rgba(255,255,255,0.7)",
                color: m.role === "user" ? "#fff" : C.onSurface,
                fontSize: 14, lineHeight: 1.55, wordBreak: "break-word",
                border: m.role === "coach" ? `1px solid ${C.outlineVariant}40` : "none",
                backdropFilter: m.role === "coach" ? "blur(8px)" : undefined,
              }}>
                {m.text}
              </div>
              <div style={{ fontSize: 10, color: C.onSurfaceVariant, marginTop: 4, textAlign: m.role === "user" ? "right" : "left" }}>
                {new Date(m.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{ display: "flex", marginBottom: 12 }}>
            <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: "rgba(255,255,255,0.7)", border: `1px solid ${C.outlineVariant}40` }}>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="typing-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: C.onSurfaceVariant, display: "inline-block", animation: `typing-bounce 1.2s ${i * 0.15}s infinite` }} />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {compact && onExpand && (
        <button type="button" onClick={onExpand} style={{ background: "none", border: "none", color: C.primary, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", marginBottom: 8 }}>
          See full conversation
        </button>
      )}

      {showTodayLog && !compact && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setLogExpanded(!logExpanded)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.5)", border: `1px solid ${C.outlineVariant}40`, borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.onSurfaceVariant, letterSpacing: "0.06em", textTransform: "uppercase" }}>Today&apos;s log</span>
            <span style={{ fontSize: 12, color: C.primary }}>{daily.calories} kcal · {daily.protein_g}g protein</span>
          </button>
          {logExpanded && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: C.surface, borderRadius: 12, fontSize: 12, color: C.onSurfaceVariant }}>
              Calories {daily.calories} · Protein {daily.protein_g}g · Water {(daily.water_ml / 1000).toFixed(1)}L · Alcohol {daily.alcohol_units} units
            </div>
          )}
        </div>
      )}

      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
        background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)",
        borderRadius: 999, border: `1px solid ${C.outlineVariant}40`, minWidth: 0,
      }}>
        {voiceSupported && (
          <button type="button" onClick={startVoice} disabled={listening || typing} aria-label="Voice" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: listening ? "rgba(186,26,26,0.12)" : "rgba(26,115,232,0.08)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: listening ? C.error : C.primary }}>mic</span>
          </button>
        )}
        {voiceSupported && (
          <>
            <button type="button" onClick={() => cameraRef.current?.click()} disabled={imageProcessing} aria-label="Camera" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(26,115,232,0.08)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: C.primary }}>{imageProcessing ? "progress_activity" : "photo_camera"}</span>
            </button>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImage(f); e.target.value = ""; }} style={{ display: "none" }} />
          </>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void sendMessage(input)}
          placeholder="Talk to your coach..."
          style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", outline: "none", color: C.onSurface }}
        />
        <button type="button" onClick={() => void sendMessage(input)} disabled={!input.trim() || typing} aria-label="Send" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: input.trim() && !typing ? C.primary : C.outlineVariant, cursor: input.trim() ? "pointer" : "not-allowed", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#fff" }}>arrow_upward</span>
        </button>
      </div>
    </div>
  );
}
