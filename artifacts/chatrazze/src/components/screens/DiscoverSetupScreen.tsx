import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/hooks/useLang";
import { useToast } from "@/components/Toast";
import {
  upsertDiscoverProfile,
  uploadDiscoverPhoto,
  deleteDiscoverPhoto,
  pauseDiscoverProfile,
  resumeDiscoverProfile,
  deleteDiscoverProfile,
  type DiscoverProfile,
} from "@/lib/discoverService";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Flame,
  Loader2,
  Pause,
  Play,
  Trash2,
  X,
} from "lucide-react";

interface Props {
  existing: DiscoverProfile | null;
  onDone: (profile: DiscoverProfile | null) => void;
}

const STEPS = 5;

const GENDER_OPTIONS = ["male", "female", "nonBinary", "other"] as const;
const LOOKING_FOR_OPTIONS = ["friendship", "dating", "relationship", "casual"] as const;
const FITNESS_OPTIONS = ["sedentary", "lightlyActive", "active", "veryActive"] as const;
const SMOKING_OPTIONS = ["neverSmoking", "sometimesSmoking", "regularlySmoking", "tryingToQuit"] as const;
const DRINKING_OPTIONS = ["neverDrinking", "socialDrinking", "regularDrinking"] as const;
const EDUCATION_OPTIONS = ["noEducation", "highSchool", "vocational", "bachelor", "master", "phd"] as const;
const RELIGION_OPTIONS = ["noReligion", "christian", "muslim", "jewish", "hindu", "buddhist", "spiritual", "otherReligion"] as const;
const CHILDREN_OPTIONS = ["noChildren", "haveChildren", "wantChildren", "openToChildren", "dontWantChildren"] as const;
const ZODIAC_OPTIONS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"] as const;

const INTEREST_TAGS = [
  "Fitness", "Travel", "Music", "Art", "Gaming", "Cooking", "Photography",
  "Reading", "Hiking", "Movies", "Coffee", "Yoga", "Dancing", "Tech",
  "Fashion", "Sports", "Pets", "Nature", "Food", "Nightlife",
];

const SPOKEN_LANGUAGES = [
  "Arabic", "English", "French", "Spanish", "German", "Portuguese",
  "Italian", "Turkish", "Chinese", "Japanese", "Korean", "Hindi",
  "Russian", "Dutch", "Persian", "Polish", "Swedish", "Greek",
];

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: STEPS }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < step
              ? "w-6 h-2 bg-primary"
              : i === step
              ? "w-8 h-2 bg-primary"
              : "w-2 h-2 bg-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

function SelectChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all border ${
        selected
          ? "bg-primary text-white border-primary shadow-md shadow-primary/25"
          : "border-border text-foreground hover:border-primary/50 hover:bg-primary/5"
      }`}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
      {children}
    </label>
  );
}

function FieldInput({
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength?: number;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-2xl bg-foreground/5 border border-border focus:border-primary focus:outline-none text-sm transition"
    />
  );
}

export default function DiscoverSetupScreen({ existing, onDone }: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [displayName, setDisplayName] = useState(existing?.displayName ?? user?.displayName ?? "");
  const [age, setAge] = useState<string>(existing?.age ? String(existing.age) : "");
  const [gender, setGender] = useState(existing?.gender ?? "");
  const [height, setHeight] = useState<string>(existing?.height ? String(existing.height) : "");
  const [nationality, setNationality] = useState(existing?.nationality ?? "");

  const [city, setCity] = useState(existing?.city ?? "");
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [lookingFor, setLookingFor] = useState(existing?.lookingFor ?? "");

  const [education, setEducation] = useState(existing?.education ?? "");
  const [occupation, setOccupation] = useState(existing?.occupation ?? "");
  const [religion, setReligion] = useState(existing?.religion ?? "");
  const [zodiac, setZodiac] = useState(existing?.zodiac ?? "");
  const [children, setChildren] = useState(existing?.children ?? "");

  const [fitness, setFitness] = useState(existing?.fitness ?? "");
  const [smoking, setSmoking] = useState(existing?.smoking ?? "");
  const [drinking, setDrinking] = useState(existing?.drinking ?? "");
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? []);
  const [languages, setLanguages] = useState<string[]>(existing?.languages ?? []);

  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

  function toggleInterest(tag: string) {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function toggleLanguage(lang: string) {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return;
    const file = e.target.files[0];
    if (!file.type.startsWith("image/")) {
      toast.show("Invalid file type");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.show("Photo must be under 10MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await uploadDiscoverPhoto(user.uid, file);
      setPhotos((prev) => [...prev, url]);
    } catch {
      toast.show(t("uploadFailed"));
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url));
    await deleteDiscoverPhoto(url).catch(() => {});
  }

  function canAdvance(): boolean {
    if (step === 0) return !!displayName.trim() && Number(age) >= 18 && !!gender;
    if (step === 1) return !!city.trim() && !!bio.trim() && !!lookingFor;
    if (step === 2) return true;
    if (step === 3) return true;
    if (step === 4) return photos.length >= 1;
    return false;
  }

  async function handleNext() {
    if (step < STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      const profile: DiscoverProfile = {
        userId: user.uid,
        displayName: displayName.trim(),
        age: Number(age),
        gender,
        city: city.trim(),
        nationality: nationality.trim() || undefined,
        height: height ? Number(height) : undefined,
        bio: bio.trim(),
        lookingFor,
        fitness,
        smoking,
        drinking: drinking || undefined,
        education: education || undefined,
        occupation: occupation.trim() || undefined,
        religion: religion || undefined,
        children: children || undefined,
        zodiac: zodiac || undefined,
        interests,
        languages,
        photos,
        isActive: photos.length >= 1,
        latitude: coords?.lat,
        longitude: coords?.lng,
      };
      await upsertDiscoverProfile(user.uid, profile);
      onDone(profile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
      console.error("[DiscoverSetup] save failed:", msg, err);
      toast.show(msg.length > 80 ? msg.slice(0, 80) + "…" : msg);
    } finally {
      setSaving(false);
    }
  }

  async function handlePause() {
    if (!user) return;
    setManageLoading(true);
    try {
      await pauseDiscoverProfile(user.uid);
      toast.show(t("profilePaused"));
      onDone(existing ? { ...existing, isActive: false } : null);
    } catch {
      toast.show(t("couldNotSend"));
    } finally {
      setManageLoading(false);
    }
  }

  async function handleResume() {
    if (!user) return;
    setManageLoading(true);
    try {
      await resumeDiscoverProfile(user.uid);
      toast.show(t("profileResumed"));
      onDone(existing ? { ...existing, isActive: true } : null);
    } catch {
      toast.show(t("couldNotSend"));
    } finally {
      setManageLoading(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    setManageLoading(true);
    try {
      await deleteDiscoverProfile(user.uid);
      toast.show(t("profileDeleted"));
      onDone(null);
    } catch {
      toast.show(t("couldNotSend"));
    } finally {
      setManageLoading(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-5 pt-10 pb-4 glass border-b border-border">
        <div className="flex items-center gap-3 mb-4">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="w-9 h-9 rounded-full hover:bg-foreground/5 flex items-center justify-center transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center">
                <Flame className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-bold">{t("discoverSetup")}</h1>
            </div>
          </div>
        </div>
        <StepDots step={step} />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">

        {/* ── Step 0: Basic Info ── */}
        {step === 0 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("basicInfo")}</h2>
              <p className="text-muted-foreground text-sm">{t("basicInfoSub")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <SectionLabel>{t("yourName")}</SectionLabel>
                <FieldInput value={displayName} onChange={setDisplayName} placeholder={t("yourName")} maxLength={40} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel>{t("yourAge")}</SectionLabel>
                  <FieldInput value={age} onChange={setAge} placeholder="18" type="number" />
                  {age && Number(age) < 18 && (
                    <p className="text-xs text-destructive mt-1">{t("mustBe18")}</p>
                  )}
                </div>
                <div>
                  <SectionLabel>{t("yourHeight")}</SectionLabel>
                  <div className="relative">
                    <FieldInput value={height} onChange={setHeight} placeholder="175" type="number" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">cm</span>
                  </div>
                </div>
              </div>
              <div>
                <SectionLabel>{t("yourGender")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <SelectChip key={g} label={t(g)} selected={gender === g} onClick={() => setGender(g)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("yourNationality")}</SectionLabel>
                <FieldInput value={nationality} onChange={setNationality} placeholder={t("yourNationality")} maxLength={60} />
              </div>
            </div>

            {/* Manage section — only when editing existing profile */}
            {existing && (
              <div className="mt-6 border-t border-border pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-muted-foreground">{t("manageProfile")}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${existing.isActive ? "bg-green-500" : "bg-amber-500"}`} />
                    <span className="text-xs text-muted-foreground">{existing.isActive ? t("activeProfile") : t("pausedProfile")}</span>
                  </div>
                </div>

                {existing.isActive ? (
                  <button
                    onClick={handlePause}
                    disabled={manageLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-border text-sm font-medium hover:bg-foreground/5 disabled:opacity-50 transition"
                  >
                    {manageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                    {t("pauseProfile")}
                  </button>
                ) : (
                  <button
                    onClick={handleResume}
                    disabled={manageLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-primary/40 text-primary text-sm font-medium hover:bg-primary/5 disabled:opacity-50 transition"
                  >
                    {manageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {t("resumeProfile")}
                  </button>
                )}

                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("deleteProfile")}
                  </button>
                ) : (
                  <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                      <p className="text-sm text-destructive">{t("deleteProfileConfirm")}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-foreground/5 transition"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={manageLoading}
                        className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-bold disabled:opacity-50 transition"
                      >
                        {manageLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t("deleteProfile")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Step 1: About Me ── */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("aboutMe")}</h2>
              <p className="text-muted-foreground text-sm">{t("aboutMeSub")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <SectionLabel>{t("yourCity")}</SectionLabel>
                <FieldInput value={city} onChange={setCity} placeholder={t("yourCity")} maxLength={60} />
              </div>
              <div>
                <SectionLabel>{t("bioLabel")}</SectionLabel>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={400}
                  rows={5}
                  placeholder={t("bioPlaceholder")}
                  className="w-full px-4 py-3 rounded-2xl bg-foreground/5 border border-border focus:border-primary focus:outline-none text-sm transition resize-none"
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{bio.length}/400</p>
              </div>
              <div>
                <SectionLabel>{t("lookingFor")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {LOOKING_FOR_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={lookingFor === opt} onClick={() => setLookingFor(opt)} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Identity ── */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("identityStep")}</h2>
              <p className="text-muted-foreground text-sm">{t("identityStepSub")}</p>
            </div>
            <div className="space-y-5">
              <div>
                <SectionLabel>{t("educationLevel")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {EDUCATION_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={education === opt} onClick={() => setEducation(education === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("yourOccupation")}</SectionLabel>
                <FieldInput value={occupation} onChange={setOccupation} placeholder={t("yourOccupation")} maxLength={80} />
              </div>
              <div>
                <SectionLabel>{t("yourReligion")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {RELIGION_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={religion === opt} onClick={() => setReligion(religion === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("yourZodiac")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {ZODIAC_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={zodiac === opt} onClick={() => setZodiac(zodiac === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("childrenPref")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {CHILDREN_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={children === opt} onClick={() => setChildren(children === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Lifestyle ── */}
        {step === 3 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("interestsStep")}</h2>
              <p className="text-muted-foreground text-sm">{t("interestsStepSub")}</p>
            </div>
            <div className="space-y-5">
              <div>
                <SectionLabel>{t("fitnessLevel")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {FITNESS_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={fitness === opt} onClick={() => setFitness(fitness === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("smokingHabit")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {SMOKING_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={smoking === opt} onClick={() => setSmoking(smoking === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("drinkingHabit")}</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {DRINKING_OPTIONS.map((opt) => (
                    <SelectChip key={opt} label={t(opt)} selected={drinking === opt} onClick={() => setDrinking(drinking === opt ? "" : opt)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("interests")} ({interests.length})</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_TAGS.map((tag) => (
                    <SelectChip key={tag} label={tag} selected={interests.includes(tag)} onClick={() => toggleInterest(tag)} />
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>{t("spokenLanguages")} ({languages.length})</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {SPOKEN_LANGUAGES.map((lang) => (
                    <SelectChip key={lang} label={lang} selected={languages.includes(lang)} onClick={() => toggleLanguage(lang)} />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 4: Photos ── */}
        {step === 4 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("addPhotos")}</h2>
              <p className="text-muted-foreground text-sm">{t("minPhotos")}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((url, i) => (
                <div key={url} className="relative aspect-[3/4] rounded-2xl overflow-hidden group">
                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition" />
                  <button
                    onClick={() => handleRemovePhoto(url)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-white" />
                  </button>
                  {i === 0 && (
                    <div className="absolute bottom-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Main
                    </div>
                  )}
                </div>
              ))}
              {photos.length < 9 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="aspect-[3/4] rounded-2xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 transition hover:bg-primary/5 disabled:opacity-50"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">{t("addPhoto")}</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            {photos.length < 1 && (
              <p className="text-xs text-muted-foreground text-center">
                {t("minPhotos")} ({photos.length}/1)
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer button */}
      <div className="px-5 pb-8 pt-4 glass border-t border-border">
        <button
          onClick={handleNext}
          disabled={!canAdvance() || saving}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF7A1A] to-[#FF4E00] text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2 shadow-lg shadow-primary/30"
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : step === STEPS - 1 ? (
            <>
              <Check className="w-5 h-5" />
              {t("saveProfile")}
            </>
          ) : (
            <>
              {t("next")}
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
        {(step === 2 || step === 3) && (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            {t("skipForNow")}
          </button>
        )}
      </div>

      {/* Close on first step when editing */}
      {step === 0 && existing && (
        <button
          onClick={() => onDone(existing)}
          className="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-foreground/5 flex items-center justify-center transition"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
