import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

export type ChatBgId =
  | "default"
  | "space"
  | "forest"
  | "geometric"
  | "waves"
  | "sunset"
  | "ocean"
  | "floral"
  | "dots"
  | "hexagons"
  | "triangles"
  | "stars"
  | "diamonds"
  | "moroccan"
  | "zigzag"
  | "leaves"
  | "circles"
  | "grid"
  | "purple_night";

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
    id: "stars",
    labelEn: "Starry Night",
    labelAr: "ليلة النجوم",
    style: {
      backgroundColor: "#050510",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Ccircle cx='15' cy='30' r='1.4' fill='rgba(255,255,255,0.8)'/%3E%3Ccircle cx='95' cy='22' r='2' fill='rgba(255,255,255,0.6)'/%3E%3Ccircle cx='55' cy='88' r='1.3' fill='rgba(255,255,255,0.7)'/%3E%3Ccircle cx='125' cy='100' r='1.2' fill='rgba(255,255,255,0.9)'/%3E%3Ccircle cx='35' cy='120' r='1.6' fill='rgba(255,255,255,0.5)'/%3E%3Ccircle cx='80' cy='52' r='1.1' fill='rgba(255,255,255,0.8)'/%3E%3Ccircle cx='135' cy='68' r='1.4' fill='rgba(255,255,255,0.6)'/%3E%3Ccircle cx='68' cy='135' r='2' fill='rgba(255,255,255,0.4)'/%3E%3Ccircle cx='112' cy='12' r='0.9' fill='rgba(255,255,255,0.95)'/%3E%3Ccircle cx='6' cy='75' r='1.1' fill='rgba(255,255,255,0.65)'/%3E%3Ccircle cx='145' cy='145' r='1.3' fill='rgba(255,255,255,0.55)'/%3E%3Ccircle cx='42' cy='50' r='0.8' fill='rgba(255,255,255,0.9)'/%3E%3C/svg%3E")`,
      backgroundSize: "150px 150px",
    },
    previewStyle: { background: "#050510" },
  },
  {
    id: "hexagons",
    labelEn: "Honeycomb",
    labelAr: "خلية النحل",
    style: {
      backgroundColor: "#111827",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97'%3E%3Cpath d='M28 66L0 50V16L28 0l28 16v34z' fill='none' stroke='rgba(255,255,255,0.13)' stroke-width='1'/%3E%3Cpath d='M28 97L0 81V66' fill='none' stroke='rgba(255,255,255,0.13)' stroke-width='1'/%3E%3Cpath d='M28 97l28-16V66' fill='none' stroke='rgba(255,255,255,0.13)' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundSize: "56px 97px",
    },
    previewStyle: { background: "#111827" },
  },
  {
    id: "triangles",
    labelEn: "Triangles",
    labelAr: "مثلثات",
    style: {
      backgroundColor: "#1a1a2e",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cpolygon points='30,2 58,58 2,58' fill='none' stroke='rgba(255,255,255,0.11)' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundSize: "60px 60px",
    },
    previewStyle: { background: "#1a1a2e" },
  },
  {
    id: "dots",
    labelEn: "Dots",
    labelAr: "نقاط",
    style: {
      backgroundColor: "#111827",
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
      backgroundSize: "22px 22px",
    },
    previewStyle: {
      backgroundColor: "#111827",
      backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.25) 1.5px, transparent 1.5px)",
      backgroundSize: "9px 9px",
    },
  },
  {
    id: "grid",
    labelEn: "Grid",
    labelAr: "شبكة",
    style: {
      backgroundColor: "#0f0f23",
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
      backgroundSize: "32px 32px",
    },
    previewStyle: {
      backgroundColor: "#0f0f23",
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
      backgroundSize: "10px 10px",
    },
  },
  {
    id: "waves",
    labelEn: "Waves",
    labelAr: "أمواج",
    style: {
      backgroundColor: "#0d1b2a",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='28'%3E%3Cpath d='M0 14 Q15 4 30 14 Q45 24 60 14 Q75 4 90 14 Q105 24 120 14' fill='none' stroke='rgba(255,255,255,0.11)' stroke-width='1.5'/%3E%3C/svg%3E")`,
      backgroundSize: "120px 28px",
    },
    previewStyle: { background: "linear-gradient(135deg, #0f0c29, #302b63)" },
  },
  {
    id: "diamonds",
    labelEn: "Diamonds",
    labelAr: "معينات",
    style: {
      backgroundColor: "#1a1a2e",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 2 L38 20 L20 38 L2 20 Z' fill='none' stroke='rgba(255,255,255,0.11)' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundSize: "40px 40px",
    },
    previewStyle: { background: "#1a1a2e" },
  },
  {
    id: "floral",
    labelEn: "Floral",
    labelAr: "زهري",
    style: {
      backgroundColor: "#0d1117",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Ccircle cx='40' cy='40' r='22' fill='none' stroke='rgba(255,255,255,0.09)' stroke-width='1'/%3E%3Cellipse cx='40' cy='20' rx='8' ry='12' fill='rgba(255,255,255,0.05)'/%3E%3Cellipse cx='40' cy='60' rx='8' ry='12' fill='rgba(255,255,255,0.05)'/%3E%3Cellipse cx='20' cy='40' rx='12' ry='8' fill='rgba(255,255,255,0.05)'/%3E%3Cellipse cx='60' cy='40' rx='12' ry='8' fill='rgba(255,255,255,0.05)'/%3E%3Ccircle cx='40' cy='40' r='6' fill='rgba(255,255,255,0.09)'/%3E%3C/svg%3E")`,
      backgroundSize: "80px 80px",
    },
    previewStyle: { background: "linear-gradient(135deg, #2d0030, #c0392b)" },
  },
  {
    id: "moroccan",
    labelEn: "Moroccan",
    labelAr: "مغربي",
    style: {
      backgroundColor: "#1a1020",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M40 0 L80 20 L80 60 L40 80 L0 60 L0 20 Z' fill='none' stroke='rgba(255,255,255,0.11)' stroke-width='1'/%3E%3Cpath d='M40 18 L62 30 L62 50 L40 62 L18 50 L18 30 Z' fill='none' stroke='rgba(255,255,255,0.08)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='6' fill='none' stroke='rgba(255,255,255,0.07)' stroke-width='1'/%3E%3C/svg%3E")`,
      backgroundSize: "80px 80px",
    },
    previewStyle: { background: "#1a1020" },
  },
  {
    id: "zigzag",
    labelEn: "Zigzag",
    labelAr: "متعرج",
    style: {
      backgroundColor: "#111111",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='24'%3E%3Cpolyline points='0,12 10,2 20,12 30,2 40,12' fill='none' stroke='rgba(255,255,255,0.11)' stroke-width='1.5'/%3E%3Cpolyline points='0,12 10,22 20,12 30,22 40,12' fill='none' stroke='rgba(255,255,255,0.11)' stroke-width='1.5'/%3E%3C/svg%3E")`,
      backgroundSize: "40px 24px",
    },
    previewStyle: { background: "#111111" },
  },
  {
    id: "leaves",
    labelEn: "Leaves",
    labelAr: "أوراق",
    style: {
      backgroundColor: "#0a1a10",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cpath d='M20 40 Q40 8 60 40 Q40 72 20 40Z' fill='none' stroke='rgba(255,255,255,0.1)' stroke-width='1.2'/%3E%3Cpath d='M40 20 Q72 40 40 60 Q8 40 40 20Z' fill='none' stroke='rgba(255,255,255,0.07)' stroke-width='1.2'/%3E%3Ccircle cx='40' cy='40' r='3' fill='rgba(255,255,255,0.08)'/%3E%3C/svg%3E")`,
      backgroundSize: "80px 80px",
    },
    previewStyle: { background: "#0a1a10" },
  },
  {
    id: "circles",
    labelEn: "Circles",
    labelAr: "دوائر",
    style: {
      backgroundColor: "#0a0a1a",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='30' cy='30' r='26' fill='none' stroke='rgba(255,255,255,0.09)' stroke-width='1'/%3E%3Ccircle cx='30' cy='30' r='14' fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='1'/%3E%3Ccircle cx='30' cy='30' r='4' fill='rgba(255,255,255,0.05)'/%3E%3C/svg%3E")`,
      backgroundSize: "60px 60px",
    },
    previewStyle: { background: "#0a0a1a" },
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
    id: "purple_night",
    labelEn: "Purple Night",
    labelAr: "ليلة بنفسجية",
    style: {
      background: "linear-gradient(160deg, #1a0033 0%, #2d0057 50%, #0d001a 100%)",
    },
    previewStyle: {
      background: "linear-gradient(135deg, #1a0033, #2d0057)",
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

  // Load from Supabase on mount, overrides localStorage if set
  useEffect(() => {
    if (!uid) return;
    supabase
      .from("profiles")
      .select("chat_bg")
      .eq("uid", uid)
      .single()
      .then(({ data }) => {
        const saved = data?.chat_bg as ChatBgId | null;
        if (saved && saved !== "default") {
          setBgId(saved);
          try { localStorage.setItem(key, saved); } catch {}
        }
      });
  }, [uid, key]);

  function setChatBg(id: ChatBgId) {
    setBgId(id);
    try { localStorage.setItem(key, id); } catch {}
    // Persist to Supabase (fire-and-forget)
    supabase.from("profiles").update({ chat_bg: id }).eq("uid", uid).then(() => {});
  }

  const current =
    CHAT_BACKGROUNDS.find((b) => b.id === bgId) ?? CHAT_BACKGROUNDS[0];

  return { bgId, setChatBg, current, backgrounds: CHAT_BACKGROUNDS };
}
