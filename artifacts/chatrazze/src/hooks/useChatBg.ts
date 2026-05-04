import { useState } from "react";
import type { CSSProperties } from "react";

export type ChatBgId =
  | "default"
  | "space"
  | "forest"
  | "geometric"
  | "waves"
  | "sunset"
  | "ocean"
  | "floral"
  | "dots";

export interface ChatBg {
  id: ChatBgId;
  labelEn: string;
  labelAr: string;
  style: CSSProperties;
  previewStyle: CSSProperties;
}

export const CHAT_BACKGROUNDS: ChatBg[] = [
  {
    id: "default",
    labelEn: "Default",
    labelAr: "افتراضي",
    style: {},
    previewStyle: { background: "#1a1a2e" },
  },
  {
    id: "space",
    labelEn: "Space",
    labelAr: "الفضاء",
    style: {
      backgroundColor: "#0d0d1f",
      backgroundImage:
        "radial-gradient(ellipse at 30% 30%, rgba(100,60,200,0.18) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(60,100,200,0.12) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(255,255,255,0.025) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 100% 100%, 80px 80px",
    },
    previewStyle: {
      background: "radial-gradient(ellipse at center, #1a1a3e 0%, #0d0d1f 100%)",
    },
  },
  {
    id: "forest",
    labelEn: "Forest",
    labelAr: "الغابة",
    style: {
      background: "linear-gradient(160deg, #0a2e1a 0%, #1a4a2e 50%, #0d3322 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #0a2e1a 0%, #1a4a2e 100%)",
    },
  },
  {
    id: "geometric",
    labelEn: "Geometric",
    labelAr: "هندسي",
    style: {
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)",
    },
  },
  {
    id: "waves",
    labelEn: "Waves",
    labelAr: "أمواج",
    style: {
      background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #0f0c29, #302b63)",
    },
  },
  {
    id: "sunset",
    labelEn: "Sunset",
    labelAr: "غروب",
    style: {
      background: "linear-gradient(160deg, #2d1b69 0%, #8b2fc9 50%, #c0392b 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #2d1b69, #c0392b)",
    },
  },
  {
    id: "ocean",
    labelEn: "Ocean",
    labelAr: "المحيط",
    style: {
      background: "linear-gradient(160deg, #0c3547 0%, #1a5276 50%, #117a65 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #0c3547, #117a65)",
    },
  },
  {
    id: "floral",
    labelEn: "Floral",
    labelAr: "زهري",
    style: {
      background: "linear-gradient(160deg, #2d0030 0%, #8b0052 50%, #c0392b 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #2d0030, #c0392b)",
    },
  },
  {
    id: "dots",
    labelEn: "Dots",
    labelAr: "نقاط",
    style: {
      backgroundColor: "#1a1a2e",
      backgroundImage:
        "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
      backgroundSize: "24px 24px",
    },
    previewStyle: {
      backgroundColor: "#1a1a2e",
      backgroundImage:
        "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)",
      backgroundSize: "10px 10px",
    },
  },
];

export function useChatBg(uid: string) {
  const key = `chatrazze:chatBg:${uid}`;
  const [bgId, setBgId] = useState<ChatBgId>(() => {
    try {
      return (localStorage.getItem(key) as ChatBgId) ?? "default";
    } catch {
      return "default";
    }
  });

  function setChatBg(id: ChatBgId) {
    setBgId(id);
    try {
      localStorage.setItem(key, id);
    } catch {}
  }

  const current =
    CHAT_BACKGROUNDS.find((b) => b.id === bgId) ?? CHAT_BACKGROUNDS[0];

  return { bgId, setChatBg, current, backgrounds: CHAT_BACKGROUNDS };
}
