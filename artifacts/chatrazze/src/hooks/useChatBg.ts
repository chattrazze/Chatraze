import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

export type ChatBgId =
  | "default"
  | "amoled"
  | "aurora"
  | "neon"
  | "synthwave"
  | "galaxy"
  | "golden_hour"
  | "rose_gold"
  | "deep_ocean"
  | "lava"
  | "emerald_luxe"
  | "zellige"
  | "ramadan_night"
  | "doodle"
  | "carbon"
  | "candy"
  | "midnight_city";

export interface ChatBg {
  id: ChatBgId;
  labelEn: string;
  labelAr: string;
  style: CSSProperties;
  previewStyle: CSSProperties;
}

/** Inline SVG tile -> CSS url(). encodeURIComponent keeps '#', quotes etc. safe. */
function svg(w: number, h: number, body: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(doc)}")`;
}

const STARS_TILE = svg(
  160, 160,
  [
    [14, 28, 1.3, 0.8], [96, 20, 1.8, 0.6], [56, 88, 1.2, 0.7], [126, 102, 1.1, 0.9],
    [34, 124, 1.5, 0.5], [82, 52, 1.0, 0.8], [138, 66, 1.3, 0.6], [70, 140, 1.8, 0.45],
    [114, 12, 0.9, 0.95], [6, 78, 1.0, 0.65], [148, 148, 1.2, 0.55], [44, 52, 0.8, 0.9],
  ].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,${o})"/>`).join(""),
);

// Eight-pointed star (rub el hizb) — Moroccan zellige / Islamic geometry, gold on deep blue
const ZELLIGE_TILE = svg(
  80, 80,
  `<g fill="none" stroke="rgba(224,185,92,0.30)" stroke-width="1.1">
     <rect x="20" y="20" width="40" height="40"/>
     <rect x="20" y="20" width="40" height="40" transform="rotate(45 40 40)"/>
     <circle cx="40" cy="40" r="7"/>
   </g>
   <g fill="rgba(224,185,92,0.18)">
     <circle cx="0" cy="0" r="3"/><circle cx="80" cy="0" r="3"/><circle cx="0" cy="80" r="3"/><circle cx="80" cy="80" r="3"/>
   </g>`,
);

const RAMADAN_TILE = svg(
  120, 120,
  `<path d="M34 16 A15 15 0 1 0 34 46 A11.5 11.5 0 1 1 34 16 Z" fill="rgba(255,214,120,0.30)"/>
   <polygon points="50,24 52,30 58,30 53,34 55,40 50,36 45,40 47,34 42,30 48,30" fill="rgba(255,214,120,0.28)"/>
   <polygon points="92,78 93.5,82 98,82 94.5,85 96,89.500 92,87 88,89.500 89.500,85 86,82 90.500,82" fill="rgba(255,255,255,0.18)"/>
   <circle cx="100" cy="26" r="1.4" fill="rgba(255,255,255,0.55)"/>
   <circle cx="22" cy="92" r="1.2" fill="rgba(255,255,255,0.45)"/>
   <circle cx="64" cy="104" r="1.6" fill="rgba(255,255,255,0.35)"/>
   <circle cx="8" cy="62" r="1" fill="rgba(255,255,255,0.5)"/>`,
);

// WhatsApp-style doodles: hearts, bubbles, stars, smileys, notes
const DOODLE_TILE = svg(
  130, 130,
  `<g fill="none" stroke="rgba(255,255,255,0.13)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
     <path d="M26 24c-3.500-6-13-4-13 3.500 0 7 13 14 13 14s13-7 13-14c0-7.500-9.500-9.500-13-3.500z"/>
     <rect x="76" y="14" width="34" height="24" rx="8"/>
     <path d="M86 38l-4 9 11-9"/>
     <polygon points="28,84 32,93 42,94 34.500,100 37,110 28,104.500 19,110 21.500,100 14,94 24,93"/>
     <circle cx="92" cy="92" r="13"/>
     <path d="M86 90v1M98 90v1M85.500 96q6.500 6 13 0"/>
     <path d="M62 60l8-2v14"/><circle cx="59" cy="73" r="3.500"/><circle cx="67" cy="71" r="3.500"/>
   </g>`,
);

const CARBON_TILE = svg(
  16, 16,
  `<rect width="16" height="16" fill="rgb(14,14,16)"/>
   <rect width="8" height="8" fill="rgba(255,255,255,0.045)"/>
   <rect x="8" y="8" width="8" height="8" fill="rgba(255,255,255,0.045)"/>`,
);

const GOLD_DIAMONDS = svg(
  44, 44,
  `<path d="M22 3 L41 22 L22 41 L3 22 Z" fill="none" stroke="rgba(224,185,92,0.20)" stroke-width="1"/>`,
);

function bg(
  id: ChatBgId, labelEn: string, labelAr: string, style: CSSProperties, previewStyle?: CSSProperties,
): ChatBg {
  return { id, labelEn, labelAr, style, previewStyle: previewStyle ?? style };
}

export const CHAT_BACKGROUNDS: ChatBg[] = [
  bg("default", "Default", "افتراضي", {}, { background: "#1a1a2e" }),

  bg("amoled", "Pure Black", "أسود صافي", { background: "#000000" }),

  bg("aurora", "Aurora", "الشفق القطبي", {
    backgroundColor: "#050b18",
    backgroundImage:
      "radial-gradient(ellipse 80% 50% at 20% 10%, rgba(0,255,170,0.30) 0%, transparent 60%)," +
      "radial-gradient(ellipse 70% 45% at 85% 25%, rgba(120,80,255,0.34) 0%, transparent 60%)," +
      "radial-gradient(ellipse 90% 50% at 50% 95%, rgba(0,160,255,0.26) 0%, transparent 65%)",
  }),

  bg("neon", "Neon Glow", "نيون", {
    backgroundColor: "#07060f",
    backgroundImage:
      "radial-gradient(circle at 10% 15%, rgba(255,0,153,0.38) 0%, transparent 38%)," +
      "radial-gradient(circle at 92% 85%, rgba(0,229,255,0.34) 0%, transparent 40%)," +
      "radial-gradient(circle at 80% 8%, rgba(150,60,255,0.22) 0%, transparent 35%)",
  }),

  bg("synthwave", "Synthwave", "سينث ويف", {
    backgroundColor: "#12002b",
    backgroundImage:
      "linear-gradient(rgba(255,46,147,0.20) 1px, transparent 1px)," +
      "linear-gradient(90deg, rgba(255,46,147,0.20) 1px, transparent 1px)," +
      "linear-gradient(180deg, #12002b 0%, #3a0a63 55%, #8a1670 100%)",
    backgroundSize: "44px 44px, 44px 44px, 100% 100%",
  }),

  bg("galaxy", "Galaxy", "المجرة", {
    backgroundColor: "#060414",
    backgroundImage:
      `${STARS_TILE},` +
      "radial-gradient(ellipse 60% 40% at 25% 20%, rgba(168,85,247,0.38) 0%, transparent 65%)," +
      "radial-gradient(ellipse 55% 40% at 80% 70%, rgba(59,130,246,0.32) 0%, transparent 65%)," +
      "radial-gradient(ellipse 40% 30% at 55% 45%, rgba(236,72,153,0.20) 0%, transparent 70%)",
    backgroundSize: "160px 160px, 100% 100%, 100% 100%, 100% 100%",
  }),

  bg("golden_hour", "Golden Hour", "الساعة الذهبية", {
    background: "linear-gradient(165deg, #3b1054 0%, #9d2b6b 38%, #e8683a 72%, #f6b24a 100%)",
  }),

  bg("rose_gold", "Rose Gold", "روز جولد", {
    background: "linear-gradient(155deg, #2a0f1c 0%, #5a1f3a 45%, #b0556b 100%)",
  }),

  bg("deep_ocean", "Deep Ocean", "أعماق المحيط", {
    backgroundColor: "#021726",
    backgroundImage:
      "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(34,211,238,0.28) 0%, transparent 65%)," +
      "radial-gradient(ellipse 60% 40% at 15% 85%, rgba(20,184,166,0.22) 0%, transparent 65%)," +
      "linear-gradient(180deg, #06324a 0%, #021726 100%)",
  }),

  bg("lava", "Lava", "حمم", {
    backgroundColor: "#12040a",
    backgroundImage:
      "radial-gradient(ellipse 70% 45% at 30% 100%, rgba(255,90,20,0.45) 0%, transparent 65%)," +
      "radial-gradient(ellipse 50% 35% at 90% 85%, rgba(220,30,60,0.35) 0%, transparent 65%)," +
      "linear-gradient(180deg, #12040a 0%, #2a0a10 100%)",
  }),

  bg("emerald_luxe", "Emerald Luxe", "زمرد فاخر", {
    backgroundColor: "#04251c",
    backgroundImage:
      `${GOLD_DIAMONDS},` +
      "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(16,185,129,0.30) 0%, transparent 70%)",
    backgroundSize: "44px 44px, 100% 100%",
  }),

  bg("zellige", "Zellige", "زليج مغربي", {
    backgroundColor: "#0b1b3a",
    backgroundImage: ZELLIGE_TILE,
    backgroundSize: "80px 80px",
  }),

  bg("ramadan_night", "Ramadan Night", "ليل رمضان", {
    backgroundColor: "#0a1233",
    backgroundImage:
      `${RAMADAN_TILE},` +
      "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(99,102,241,0.30) 0%, transparent 70%)",
    backgroundSize: "120px 120px, 100% 100%",
  }),

  bg("doodle", "Doodles", "رسومات", {
    backgroundColor: "#0b2a2a",
    backgroundImage: DOODLE_TILE,
    backgroundSize: "130px 130px",
  }),

  bg("carbon", "Carbon", "كربون", {
    backgroundColor: "#0e0e10",
    backgroundImage: CARBON_TILE,
    backgroundSize: "16px 16px",
  }),

  bg("candy", "Candy", "حلوى", {
    background: "linear-gradient(150deg, #3a1a5e 0%, #7a2f8f 45%, #d6498f 100%)",
  }),

  bg("midnight_city", "Midnight City", "مدينة الليل", {
    backgroundColor: "#0a0f24",
    backgroundImage:
      "linear-gradient(180deg, transparent 60%, rgba(251,146,60,0.22) 100%)," +
      "radial-gradient(ellipse 70% 40% at 80% 10%, rgba(99,102,241,0.30) 0%, transparent 65%)," +
      "linear-gradient(180deg, #0a0f24 0%, #1b1f4a 100%)",
  }),
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
