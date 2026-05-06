import { useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLang } from "@/hooks/useLang";
import { useToast } from "@/components/Toast";
import {
  upsertDiscoverProfile,
  uploadDiscoverPhoto,
  deleteDiscoverPhoto,
  type DiscoverProfile,
} from "@/lib/discoverService";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Flame,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

interface Props {
  existing: DiscoverProfile | null;
  onDone: (profile: DiscoverProfile) => void;
}

const STEPS = 4;

const GENDER_OPTIONS = ["male", "female", "nonBinary", "other"] as const;
const LOOKING_FOR_OPTIONS = ["friendship", "dating", "relationship", "casual"] as const;
const FITNESS_OPTIONS = ["sedentary", "lightlyActive", "active", "veryActive"] as const;
const SMOKING_OPTIONS = ["neverSmoking", "sometimesSmoking", "regularlySmoking", "tryingToQuit"] as const;

const INTEREST_TAGS = [
  "Fitness", "Travel", "Music", "Art", "Gaming", "Cooking", "Photography",
  "Reading", "Hiking", "Movies", "Coffee", "Yoga", "Dancing", "Tech",
  "Fashion", "Sports", "Pets", "Nature", "Food", "Nightlife",
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

export default function DiscoverSetupScreen({ existing, onDone }: Props) {
  const { user } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [displayName, setDisplayName] = useState(existing?.displayName ?? user?.displayName ?? "");
  const [age, setAge] = useState<string>(existing?.age ? String(existing.age) : "");
  const [gender, setGender] = useState(existing?.gender ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [lookingFor, setLookingFor] = useState(existing?.lookingFor ?? "");
  const [fitness, setFitness] = useState(existing?.fitness ?? "");
  const [smoking, setSmoking] = useState(existing?.smoking ?? "");
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? []);
  const [photos, setPhotos] = useState<string[]>(existing?.photos ?? []);

  function toggleInterest(tag: string) {
    setInterests((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
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
    if (step === 2) return !!fitness && !!smoking;
    if (step === 3) return photos.length >= 3;
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
        bio: bio.trim(),
        lookingFor,
        fitness,
        smoking,
        interests,
        photos,
        isActive: photos.length >= 3,
      };
      await upsertDiscoverProfile(user.uid, profile);
      onDone(profile);
    } catch {
      toast.show(t("couldNotSend"));
    } finally {
      setSaving(false);
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
        {/* Step 0: Basic info */}
        {step === 0 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("basicInfo")}</h2>
              <p className="text-muted-foreground text-sm">{t("basicInfoSub")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("yourName")}
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                  placeholder={t("yourName")}
                  className="w-full px-4 py-3 rounded-2xl bg-foreground/5 border border-border focus:border-primary focus:outline-none text-sm transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("yourAge")}
                </label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  min={18}
                  max={99}
                  placeholder="18"
                  className="w-full px-4 py-3 rounded-2xl bg-foreground/5 border border-border focus:border-primary focus:outline-none text-sm transition"
                />
                {age && Number(age) < 18 && (
                  <p className="text-xs text-destructive mt-1">{t("mustBe18")}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("yourGender")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <SelectChip
                      key={g}
                      label={t(g)}
                      selected={gender === g}
                      onClick={() => setGender(g)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 1: About me */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("aboutMe")}</h2>
              <p className="text-muted-foreground text-sm">{t("aboutMeSub")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("yourCity")}
                </label>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  maxLength={60}
                  placeholder={t("yourCity")}
                  className="w-full px-4 py-3 rounded-2xl bg-foreground/5 border border-border focus:border-primary focus:outline-none text-sm transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("bioLabel")}
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={300}
                  rows={4}
                  placeholder={t("bioPlaceholder")}
                  className="w-full px-4 py-3 rounded-2xl bg-foreground/5 border border-border focus:border-primary focus:outline-none text-sm transition resize-none"
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{bio.length}/300</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("lookingFor")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {LOOKING_FOR_OPTIONS.map((opt) => (
                    <SelectChip
                      key={opt}
                      label={t(opt)}
                      selected={lookingFor === opt}
                      onClick={() => setLookingFor(opt)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 2: Lifestyle */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-2xl font-bold mb-1">{t("lifestyle")}</h2>
              <p className="text-muted-foreground text-sm">{t("lifestyleSub")}</p>
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("fitnessLevel")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {FITNESS_OPTIONS.map((opt) => (
                    <SelectChip
                      key={opt}
                      label={t(opt)}
                      selected={fitness === opt}
                      onClick={() => setFitness(opt)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("smokingHabit")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {SMOKING_OPTIONS.map((opt) => (
                    <SelectChip
                      key={opt}
                      label={t(opt)}
                      selected={smoking === opt}
                      onClick={() => setSmoking(opt)}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  {t("interests")} ({interests.length})
                </label>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_TAGS.map((tag) => (
                    <SelectChip
                      key={tag}
                      label={tag}
                      selected={interests.includes(tag)}
                      onClick={() => toggleInterest(tag)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Photos */}
        {step === 3 && (
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
                      <span className="text-xs text-muted-foreground font-medium">
                        {t("addPhoto")}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
            {photos.length < 3 && (
              <p className="text-xs text-muted-foreground text-center">
                {t("minPhotos")} ({photos.length}/3)
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
        {step === 2 && (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="w-full mt-2 py-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            {t("skipForNow")}
          </button>
        )}
      </div>

      {/* Close / X on first step */}
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
