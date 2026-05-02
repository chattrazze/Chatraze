import { useState } from "react";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { useLang } from "@/hooks/useLang";
import { MessageCircle, Mail, Lock, User as UserIcon, Phone } from "lucide-react";

export default function AuthScreen() {
  const { t } = useLang();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email.trim(), password);
      } else {
        await signUpWithEmail(
          email.trim(),
          password,
          name.trim() || email.split("@")[0],
          phone.trim() || undefined,
        );
      }
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? t("authFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md glass rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF7A1A] to-[#FF4E00] flex items-center justify-center shadow-lg">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chatrazze</h1>
            <p className="text-sm text-muted-foreground">
              {t("fastModernMessaging")}
            </p>
          </div>
        </div>

        <div className="flex bg-input rounded-xl p-1 mb-6">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              mode === "signin"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("signIn")}
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              mode === "signup"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("signUp")}
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <>
              <Field
                icon={<UserIcon className="w-4 h-4" />}
                placeholder={t("displayNamePlaceholder")}
                value={name}
                onChange={setName}
              />
              <Field
                icon={<Phone className="w-4 h-4" />}
                placeholder={t("phoneOptionalPlaceholder")}
                value={phone}
                onChange={setPhone}
              />
            </>
          )}
          <Field
            icon={<Mail className="w-4 h-4" />}
            placeholder={t("emailPlaceholder")}
            type="email"
            value={email}
            onChange={setEmail}
          />
          <Field
            icon={<Lock className="w-4 h-4" />}
            placeholder={t("passwordPlaceholder")}
            type="password"
            value={password}
            onChange={setPassword}
          />

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#FF7A1A] to-[#FF4E00] text-white font-semibold shadow-lg hover:opacity-95 active:scale-[0.99] transition disabled:opacity-50"
          >
            {loading
              ? t("pleaseWait")
              : mode === "signin"
                ? t("signIn")
                : t("createAccount")}
          </button>
        </form>

        <p className="text-xs text-muted-foreground mt-6 text-center">
          {t("poweredBy")}
        </p>
      </div>
    </div>
  );
}

function Field({
  icon,
  ...props
}: {
  icon: React.ReactNode;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-input border border-border rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-primary/50 transition">
      <span className="text-muted-foreground">{icon}</span>
      <input
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="bg-transparent outline-none flex-1 text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}
