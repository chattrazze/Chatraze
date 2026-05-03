import { useEffect, useState } from "react";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), 2000);
    const t3 = setTimeout(() => onDone(), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes splash-bg-pulse {
          0%   { opacity: 0.0; }
          40%  { opacity: 0.18; }
          100% { opacity: 0.0; }
        }
        @keyframes logo-pop {
          0%   { transform: scale(0.35); opacity: 0; }
          55%  { transform: scale(1.08); opacity: 1; }
          75%  { transform: scale(0.96); }
          100% { transform: scale(1.00); opacity: 1; }
        }
        @keyframes logo-pop-hold {
          0%,100% { transform: scale(1.00); opacity: 1; }
        }
        @keyframes name-in {
          0%   { opacity: 0; transform: translateY(14px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes from-in {
          0%   { opacity: 0; }
          100% { opacity: 0.55; }
        }
        @keyframes particles {
          0%   { transform: scale(0) translateY(0);   opacity: 0.7; }
          100% { transform: scale(1) translateY(-60px); opacity: 0; }
        }
        @keyframes ring-grow {
          0%   { transform: scale(0.6); opacity: 0.5; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes screen-out {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.06); }
        }
        .splash-screen-out {
          animation: screen-out 0.65s cubic-bezier(0.4,0,0.2,1) forwards;
        }
        .logo-pop-anim {
          animation: logo-pop 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        .name-in-anim {
          animation: name-in 0.55s cubic-bezier(0.34,1.2,0.64,1) 0.45s both;
        }
        .from-in-anim {
          animation: from-in 0.6s ease 1.0s both;
        }
        .ring-anim {
          animation: ring-grow 1.1s ease-out 0.15s both;
        }
        .ring-anim-2 {
          animation: ring-grow 1.1s ease-out 0.45s both;
        }
        .bg-pulse {
          animation: splash-bg-pulse 2.4s ease-in-out infinite;
        }
      `}</style>

      <div
        className={`fixed inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden select-none ${phase === "out" ? "splash-screen-out" : ""}`}
        style={{ background: "#000000" }}
      >
        {/* Animated gradient radial bg glow */}
        <div
          className="absolute inset-0 bg-pulse"
          style={{
            background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255,110,0,0.22) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Rings emanating from center */}
        <div className="absolute flex items-center justify-center">
          <div
            className="ring-anim"
            style={{
              width: 120, height: 120,
              borderRadius: "50%",
              border: "2px solid rgba(255,110,0,0.35)",
              position: "absolute",
            }}
          />
          <div
            className="ring-anim-2"
            style={{
              width: 120, height: 120,
              borderRadius: "50%",
              border: "2px solid rgba(255,110,0,0.2)",
              position: "absolute",
            }}
          />
        </div>

        {/* Center: Logo + name */}
        <div className="flex flex-col items-center gap-5 z-10">
          {/* Logo icon */}
          <div className={phase === "in" ? "logo-pop-anim" : ""} style={{ willChange: "transform, opacity" }}>
            <svg
              width="90" height="90"
              viewBox="0 0 90 90"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer glow shadow */}
              <defs>
                <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Chat bubble body */}
              <rect x="8" y="8" width="68" height="52" rx="18" fill="white" filter="url(#glow)" />
              {/* Bubble tail */}
              <polygon points="14,58 14,78 30,58" fill="white" />
              {/* Dots */}
              <circle cx="30" cy="34" r="6" fill="#FF6B00" />
              <circle cx="45" cy="34" r="6" fill="#FF6B00" />
              <circle cx="60" cy="34" r="6" fill="#FF6B00" />
            </svg>
          </div>

          {/* App name */}
          <div className="name-in-anim flex flex-col items-center gap-0.5">
            <span
              className="text-3xl font-bold tracking-wide"
              style={{
                background: "linear-gradient(135deg, #ffffff 30%, #FF8C42 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "0.04em",
              }}
            >
              Chatrazze
            </span>
          </div>
        </div>

        {/* Bottom "from" text */}
        <div
          className="from-in-anim absolute bottom-12 flex flex-col items-center gap-1"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          <span className="text-xs tracking-widest uppercase" style={{ letterSpacing: "0.15em" }}>from</span>
          <span className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Chatrazze Inc.</span>
        </div>
      </div>
    </>
  );
}
