import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/hooks/useLang";
import { useToast } from "@/components/Toast";
import {
  getMyDiscoverProfile,
  getDiscoverFeed,
  getMatches,
  swipe as doSwipe,
  type DiscoverProfile,
  type DiscoverMatch,
} from "@/lib/discoverService";
import Avatar from "@/components/Avatar";
import DiscoverSetupScreen from "@/components/screens/DiscoverSetupScreen";
import type { AppUser } from "@/lib/userService";
import {
  ChevronLeft,
  Flame,
  GraduationCap,
  Heart,
  Info,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Ruler,
  Sparkles,
  X,
} from "lucide-react";

interface Props {
  onGoToChat: (chatId: string, peer: AppUser) => void;
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/15 backdrop-blur-sm text-white border border-white/20">
      {label}
    </span>
  );
}

function PhotoDots({ total, current }: { total: number; current: number }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-1 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-200 ${
            i === current ? "w-5 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"
          }`}
        />
      ))}
    </div>
  );
}

function ActionBtn({
  icon,
  onClick,
  color,
  size = "md",
  disabled,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}) {
  const dim =
    size === "lg" ? "w-16 h-16" : size === "sm" ? "w-11 h-11" : "w-14 h-14";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${dim} rounded-full flex items-center justify-center shadow-xl active:scale-90 transition-transform disabled:opacity-40 ${color}`}
    >
      {icon}
    </button>
  );
}

/* ── Info pill ────────────────────────────────────────────────────────────── */
function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 rounded-2xl bg-foreground/5 border border-border">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}

/* ── Match Modal ─────────────────────────────────────────────────────────── */
function MatchModal({
  me,
  matched,
  onChat,
  onClose,
  t,
}: {
  me: DiscoverProfile | null;
  matched: DiscoverProfile;
  onChat: () => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: "linear-gradient(135deg, rgba(255,122,26,0.92) 0%, rgba(255,78,0,0.95) 100%)" }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-white/30 animate-ping"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1.5 + Math.random()}s`,
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-0 mb-8">
        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-2xl z-10">
          {me?.photos[0] ? (
            <img src={me.photos[0]} alt="you" className="w-full h-full object-cover" />
          ) : (
            <Avatar name={me?.displayName ?? "You"} size={112} />
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center -mx-3 z-20 shadow-lg">
          <Heart className="w-4 h-4 text-primary fill-primary" />
        </div>
        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-2xl z-10">
          {matched.photos[0] ? (
            <img src={matched.photos[0]} alt="match" className="w-full h-full object-cover" />
          ) : (
            <Avatar name={matched.displayName} size={112} />
          )}
        </div>
      </div>

      <Flame className="w-8 h-8 text-white mb-3" />
      <h2 className="text-4xl font-black text-white mb-2">{t("matchTitle")}</h2>
      <p className="text-white/90 text-base text-center mb-10">{t("matchSub")}</p>

      <div className="w-full space-y-3">
        <button
          onClick={onChat}
          className="w-full py-4 rounded-2xl bg-white text-primary font-bold text-base shadow-xl hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" />
          {t("startChat")}
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl border border-white/40 text-white font-semibold text-sm hover:bg-white/10 transition"
        >
          {t("keepSwiping")}
        </button>
      </div>
    </div>
  );
}

/* ── Profile Detail Sheet ──────────────────────────────────────────────────
   Used for both swipe card detail view AND match profile view.
   When onChat is provided → show chat button at the bottom.
────────────────────────────────────────────────────────────────────────── */
function ProfileSheet({
  profile,
  onClose,
  onChat,
  t,
}: {
  profile: DiscoverProfile;
  onClose: () => void;
  onChat?: () => void;
  t: (k: string) => string;
}) {
  const [photoIdx, setPhotoIdx] = useState(0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background overflow-y-auto">
      {/* Hero photo */}
      <div className="relative h-[60vh] shrink-0">
        {profile.photos.length > 0 ? (
          <img
            src={profile.photos[photoIdx]}
            alt={profile.displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-foreground/10 flex items-center justify-center">
            <Avatar name={profile.displayName} size={120} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        {profile.photos.length > 1 && (
          <>
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <PhotoDots total={profile.photos.length} current={photoIdx} />
            </div>
            <div className="absolute inset-0 flex">
              <div className="flex-1" onClick={() => setPhotoIdx((i) => Math.max(0, i - 1))} />
              <div className="flex-1" onClick={() => setPhotoIdx((i) => Math.min(profile.photos.length - 1, i + 1))} />
            </div>
          </>
        )}
        {/* Thumbnail strip */}
        {profile.photos.length > 1 && (
          <div className="absolute bottom-16 left-4 right-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {profile.photos.map((url, i) => (
              <button
                key={url}
                onClick={() => setPhotoIdx(i)}
                className={`shrink-0 w-12 h-16 rounded-xl overflow-hidden border-2 transition ${i === photoIdx ? "border-white" : "border-white/30"}`}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="absolute bottom-4 left-4 right-4">
          <h2 className="text-white text-3xl font-black">
            {profile.displayName}{profile.age ? `, ${profile.age}` : ""}
          </h2>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
            {profile.city && (
              <div className="flex items-center gap-1 text-white/90 text-sm">
                <MapPin className="w-3.5 h-3.5" />
                {profile.city}{profile.nationality ? `, ${profile.nationality}` : ""}
              </div>
            )}
            {profile.height && (
              <div className="flex items-center gap-1 text-white/80 text-sm">
                <Ruler className="w-3.5 h-3.5" />
                {profile.height} cm
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-6 space-y-5">
        {/* Looking for badge */}
        {profile.lookingFor && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-primary/10 border border-primary/20 w-fit">
            <Heart className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">{t(profile.lookingFor as Parameters<typeof t>[0])}</span>
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("aboutMe")}</h3>
            <p className="text-sm leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* Occupation */}
        {profile.occupation && (
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm">{profile.occupation}</span>
          </div>
        )}

        {/* Info grid */}
        {(profile.education || profile.religion || profile.zodiac || profile.children ||
          profile.fitness || profile.smoking || profile.drinking) && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t("lifestyle")}</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {profile.education && <InfoPill label={t("educationLevel")} value={t(profile.education as Parameters<typeof t>[0])} />}
              {profile.religion && <InfoPill label={t("yourReligion")} value={t(profile.religion as Parameters<typeof t>[0])} />}
              {profile.zodiac && <InfoPill label={t("yourZodiac")} value={t(profile.zodiac as Parameters<typeof t>[0])} />}
              {profile.children && <InfoPill label={t("childrenPref")} value={t(profile.children as Parameters<typeof t>[0])} />}
              {profile.fitness && <InfoPill label={t("fitnessLevel")} value={t(profile.fitness as Parameters<typeof t>[0])} />}
              {profile.smoking && <InfoPill label={t("smokingHabit")} value={t(profile.smoking as Parameters<typeof t>[0])} />}
              {profile.drinking && <InfoPill label={t("drinkingHabit")} value={t(profile.drinking as Parameters<typeof t>[0])} />}
            </div>
          </div>
        )}

        {/* Interests */}
        {profile.interests.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("interests")}</h3>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((i) => (
                <span key={i} className="px-3 py-1.5 rounded-full bg-foreground/8 text-sm font-medium border border-border">
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {profile.languages && profile.languages.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("spokenLanguages")}</h3>
            <div className="flex flex-wrap gap-2">
              {profile.languages.map((l) => (
                <span key={l} className="px-3 py-1.5 rounded-full bg-foreground/8 text-sm font-medium border border-border">
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Chat button for match profile view */}
        {onChat && (
          <div className="pt-2 pb-4">
            <button
              onClick={onChat}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF7A1A] to-[#FF4E00] text-white font-bold text-base shadow-lg shadow-primary/30 hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              {t("goToChat")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Matches list ─────────────────────────────────────────────────────────── */
function MatchesList({
  matches,
  onViewProfile,
  t,
}: {
  matches: DiscoverMatch[];
  onViewProfile: (m: DiscoverMatch) => void;
  t: (k: string) => string;
}) {
  if (matches.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center shadow-xl mb-5">
          <Heart className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-xl font-bold mb-2">{t("noMatchesYet")}</h3>
        <p className="text-muted-foreground text-sm">{t("noMatchesYetSub")}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      {matches.map((m) => (
        <button
          key={m.id}
          onClick={() => onViewProfile(m)}
          className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-foreground/5 transition border-b border-border"
        >
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/30">
              {m.photos[0] ? (
                <img src={m.photos[0]} alt={m.displayName} className="w-full h-full object-cover" />
              ) : (
                <Avatar name={m.displayName} size={56} />
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <Heart className="w-2.5 h-2.5 text-white fill-white" />
            </span>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-semibold text-[15px] truncate">{m.displayName}</p>
            {m.profile?.city && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 inline" />
                {m.profile.city}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{t("viewMatchProfile")}</span>
            <Info className="w-4 h-4 text-primary" />
          </div>
        </button>
      ))}
    </div>
  );
}

/* ── Main card ────────────────────────────────────────────────────────────── */
function SwipeCard({
  profile,
  photoIdx,
  onPhotoNav,
  onShowProfile,
  dragX,
  dragY,
  isDragging,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  profile: DiscoverProfile;
  photoIdx: number;
  onPhotoNav: (dir: "left" | "right") => void;
  onShowProfile: () => void;
  dragX: number;
  dragY: number;
  isDragging: boolean;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const rotation = dragX * 0.08;
  const likeOpacity = Math.min(Math.max(dragX / 80, 0), 1);
  const nopeOpacity = Math.min(Math.max(-dragX / 80, 0), 1);

  return (
    <div
      className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl select-none cursor-grab active:cursor-grabbing"
      style={{
        transform: isDragging ? `translate(${dragX}px, ${dragY * 0.3}px) rotate(${rotation}deg)` : undefined,
        transition: isDragging ? "none" : "transform 0.3s ease",
        touchAction: "none",
        userSelect: "none",
      }}
      onMouseDown={(e) => { onDragStart(e.clientX, e.clientY); }}
      onMouseMove={(e) => { if (isDragging) onDragMove(e.clientX, e.clientY); }}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      onTouchStart={(e) => { onDragStart(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchMove={(e) => { e.preventDefault(); onDragMove(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchEnd={onDragEnd}
    >
      {profile.photos[photoIdx] ? (
        <img
          src={profile.photos[photoIdx]}
          alt={profile.displayName}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-foreground/10 to-foreground/20 flex items-center justify-center">
          <Avatar name={profile.displayName} size={100} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

      {/* LIKE overlay */}
      <div
        className="absolute top-10 left-6 border-[3px] border-green-400 px-5 py-2 rounded-xl"
        style={{ opacity: likeOpacity, transform: "rotate(-20deg)" }}
      >
        <span className="text-green-400 text-2xl font-black tracking-widest">LIKE</span>
      </div>
      {/* NOPE overlay */}
      <div
        className="absolute top-10 right-6 border-[3px] border-red-400 px-5 py-2 rounded-xl"
        style={{ opacity: nopeOpacity, transform: "rotate(20deg)" }}
      >
        <span className="text-red-400 text-2xl font-black tracking-widest">NOPE</span>
      </div>

      <div className="absolute top-4 left-0 right-0 px-4">
        <PhotoDots total={profile.photos.length} current={photoIdx} />
      </div>
      {/* Photo nav — only tappable when not dragging */}
      {!isDragging && (
        <div className="absolute inset-0 flex">
          <div className="w-1/3 h-full" onClick={() => onPhotoNav("left")} />
          <div className="flex-1 h-full" onClick={() => onPhotoNav("right")} />
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
        <div className="flex items-end justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-white text-2xl font-black leading-tight truncate">
              {profile.displayName}{profile.age ? `, ${profile.age}` : ""}
            </h2>
            <div className="flex items-center gap-3 mt-0.5">
              {profile.city && (
                <div className="flex items-center gap-1 text-white/80 text-sm">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{profile.city}</span>
                </div>
              )}
              {profile.height && (
                <span className="text-white/70 text-sm">{profile.height} cm</span>
              )}
            </div>
          </div>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onShowProfile(); }}
            className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0"
          >
            <Info className="w-4 h-4 text-white" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {profile.lookingFor && (
            <Tag label={profile.lookingFor === "friendship" ? "Friendship"
              : profile.lookingFor === "dating" ? "Dating"
              : profile.lookingFor === "relationship" ? "Relationship"
              : "Casual"} />
          )}
          {profile.zodiac && <Tag label={profile.zodiac.charAt(0).toUpperCase() + profile.zodiac.slice(1)} />}
          {profile.interests.slice(0, 2).map((i) => <Tag key={i} label={i} />)}
        </div>
        {profile.bio && (
          <p className="text-white/75 text-xs leading-relaxed line-clamp-2">{profile.bio}</p>
        )}
      </div>
    </div>
  );
}

function EmptyFeed({ onRefresh, loading, t }: { onRefresh: () => void; loading: boolean; t: (k: string) => string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#FF7A1A]/20 to-[#FF4E00]/10 flex items-center justify-center mb-5 border border-primary/20">
        <Sparkles className="w-10 h-10 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-2">{t("noMoreProfiles")}</h3>
      <p className="text-muted-foreground text-sm mb-6">{t("noMoreProfilesSub")}</p>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        {t("refresh")}
      </button>
    </div>
  );
}

/* ── MAIN ──────────────────────────────────────────────────────────────────── */
export default function DiscoverScreen({ onGoToChat }: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();

  const [myProfile, setMyProfile] = useState<DiscoverProfile | null>(null);
  const [feed, setFeed] = useState<DiscoverProfile[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [view, setView] = useState<"swipe" | "matches" | "setup">("swipe");
  const [match, setMatch] = useState<{ profile: DiscoverProfile; chatId: string } | null>(null);
  const [matches, setMatches] = useState<DiscoverMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState<"like" | "skip" | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [viewingMatch, setViewingMatch] = useState<DiscoverMatch | null>(null);
  const swipeLock = useRef(false);

  /* ── Drag state for Tinder-like swipe ── */
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const SWIPE_THRESHOLD = 90;

  function handleDragStart(x: number, y: number) {
    if (swiping || swipeLock.current) return;
    dragStartX.current = x;
    dragStartY.current = y;
    setIsDragging(true);
  }

  function handleDragMove(x: number, y: number) {
    if (!isDragging) return;
    setDragX(x - dragStartX.current);
    setDragY(y - dragStartY.current);
  }

  function handleDragEnd() {
    if (!isDragging) return;
    setIsDragging(false);
    const finalX = dragX;
    setDragX(0);
    setDragY(0);
    if (Math.abs(finalX) >= SWIPE_THRESHOLD) {
      handleSwipe(finalX > 0 ? "like" : "skip");
    }
  }

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [profile, feedData, matchesData] = await Promise.all([
        getMyDiscoverProfile(user.uid),
        getDiscoverFeed(user.uid),
        getMatches(user.uid),
      ]);
      setMyProfile(profile);
      setFeed(feedData);
      setCurrentIdx(0);
      setPhotoIdx(0);
      setMatches(matchesData);
    } catch {
      toast.show(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const current = feed[currentIdx];

  function handlePhotoNav(dir: "left" | "right") {
    if (!current) return;
    setPhotoIdx((i) =>
      dir === "left" ? Math.max(0, i - 1) : Math.min(current.photos.length - 1, i + 1)
    );
  }

  async function handleSwipe(direction: "like" | "skip") {
    if (!user || !current || swipeLock.current) return;
    swipeLock.current = true;
    setSwiping(direction);
    await new Promise((r) => setTimeout(r, 320));
    try {
      const result = await doSwipe(user.uid, current.userId, direction);
      if (result.matched && result.matchedProfile) {
        setMatch({ profile: result.matchedProfile, chatId: result.chatId! });
        setMatches((prev) => [
          {
            id: Date.now().toString(),
            userId: result.matchedProfile!.userId,
            displayName: result.matchedProfile!.displayName,
            photos: result.matchedProfile!.photos,
            chatId: result.chatId!,
            matchedAt: new Date().toISOString(),
            profile: result.matchedProfile!,
          },
          ...prev,
        ]);
      }
    } catch {
      /* ignore */
    }
    setCurrentIdx((i) => i + 1);
    setPhotoIdx(0);
    setSwiping(null);
    swipeLock.current = false;
  }

  function handleGoToChat(chatId: string, userId: string, displayName: string, photoURL?: string) {
    const peer: AppUser = {
      uid: userId,
      displayName,
      email: null,
      phone: null,
      photoURL: photoURL ?? null,
    };
    onGoToChat(chatId, peer);
  }

  // Setup not complete
  if (!loading && !myProfile && view !== "setup") {
    return (
      <DiscoverSetupScreen
        existing={null}
        onDone={(p) => {
          if (p) { setMyProfile(p); setView("swipe"); loadData(); }
        }}
      />
    );
  }

  if (view === "setup") {
    return (
      <DiscoverSetupScreen
        existing={myProfile}
        onDone={(p) => {
          if (p) { setMyProfile(p); }
          else { setMyProfile(null); }
          setView("swipe");
          loadData();
        }}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="px-5 pt-8 pb-3 glass border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center shadow-md">
            <Flame className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-black tracking-tight">{t("discover")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === "matches" ? "swipe" : "matches")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition border ${
              view === "matches"
                ? "bg-primary text-white border-primary"
                : "border-border text-foreground hover:bg-foreground/5"
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            {t("discoverMatches")}
            {matches.length > 0 && (
              <span className={`text-xs font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center ${
                view === "matches" ? "bg-white/20" : "bg-primary text-white"
              }`}>
                {matches.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setView("setup")}
            className="w-8 h-8 rounded-full hover:bg-foreground/5 flex items-center justify-center transition"
            title={t("editDiscoverProfile")}
          >
            <Pencil className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Matches view */}
      {view === "matches" && (
        <MatchesList
          matches={matches}
          onViewProfile={(m) => setViewingMatch(m)}
          t={t}
        />
      )}

      {/* Swipe view */}
      {view === "swipe" && (
        <>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : !current ? (
            <EmptyFeed onRefresh={loadData} loading={loading} t={t} />
          ) : (
            <>
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-3 min-h-0">
                {feed[currentIdx + 1] && (
                  <div
                    className="absolute mx-4 rounded-3xl overflow-hidden shadow-lg opacity-70 scale-95"
                    style={{ width: "calc(100% - 32px)", height: "clamp(320px, 62vh, 520px)", zIndex: 1 }}
                  >
                    {feed[currentIdx + 1].photos[0] && (
                      <img src={feed[currentIdx + 1].photos[0]} alt="" className="w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  </div>
                )}

                <div
                  className="relative w-full transition-all duration-300 ease-out"
                  style={{
                    height: "clamp(320px, 62vh, 520px)",
                    zIndex: 2,
                    transform: swiping === "like"
                      ? "translateX(130%) rotate(20deg)"
                      : swiping === "skip"
                      ? "translateX(-130%) rotate(-20deg)"
                      : "translateX(0) rotate(0deg)",
                    opacity: swiping ? 0 : 1,
                  }}
                >
                  <SwipeCard
                    profile={current}
                    photoIdx={photoIdx}
                    onPhotoNav={handlePhotoNav}
                    onShowProfile={() => setShowDetail(true)}
                    dragX={dragX}
                    dragY={dragY}
                    isDragging={isDragging}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                  />
                </div>

                {feed.length - currentIdx > 1 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {feed.length - currentIdx - 1} {t("moreProfiles")}
                  </p>
                )}
              </div>

              <div className="shrink-0 px-6 pb-8 pt-2">
                <div className="flex items-center justify-center gap-5">
                  <ActionBtn
                    icon={<X className="w-7 h-7 text-rose-500" />}
                    onClick={() => handleSwipe("skip")}
                    color="bg-card border border-border shadow-lg hover:border-rose-300"
                    size="lg"
                    disabled={!!swiping}
                  />
                  <ActionBtn
                    icon={<ChevronLeft className="w-4 h-4 text-amber-500" />}
                    onClick={() => {
                      if (currentIdx > 0) { setCurrentIdx((i) => i - 1); setPhotoIdx(0); }
                    }}
                    color="bg-card border border-border hover:border-amber-300"
                    size="sm"
                    disabled={currentIdx === 0 || !!swiping}
                  />
                  <ActionBtn
                    icon={<Heart className="w-7 h-7 text-white fill-white" />}
                    onClick={() => handleSwipe("like")}
                    color="bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] shadow-xl shadow-primary/30"
                    size="lg"
                    disabled={!!swiping}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Swipe card detail sheet */}
      {showDetail && current && (
        <ProfileSheet
          profile={current}
          onClose={() => setShowDetail(false)}
          t={t}
        />
      )}

      {/* Match profile sheet (from matches list) */}
      {viewingMatch && (
        <ProfileSheet
          profile={viewingMatch.profile ?? {
            userId: viewingMatch.userId,
            displayName: viewingMatch.displayName,
            age: 0,
            gender: "",
            city: "",
            bio: "",
            lookingFor: "",
            fitness: "",
            smoking: "",
            interests: [],
            photos: viewingMatch.photos,
            isActive: true,
          }}
          onClose={() => setViewingMatch(null)}
          onChat={() => {
            handleGoToChat(
              viewingMatch.chatId,
              viewingMatch.userId,
              viewingMatch.displayName,
              viewingMatch.photos[0]
            );
            setViewingMatch(null);
          }}
          t={t}
        />
      )}

      {/* Match modal */}
      {match && (
        <MatchModal
          me={myProfile}
          matched={match.profile}
          onChat={() => {
            handleGoToChat(match.chatId, match.profile.userId, match.profile.displayName, match.profile.photos[0]);
            setMatch(null);
          }}
          onClose={() => setMatch(null)}
          t={t}
        />
      )}
    </div>
  );
}
