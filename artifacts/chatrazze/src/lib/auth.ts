import { supabase } from "./supabase";
import { ensureUserDoc } from "./userService";
import type { AppUser } from "./userService";

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  phone?: string,
) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Sign up failed");

  await ensureUserDoc({
    uid: data.user.id,
    email: data.user.email ?? null,
    phoneNumber: phone ?? null,
    displayName,
    photoURL: null,
  });

  return sessionToAppUser(data.user, displayName);
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Sign in failed");

  const displayName =
    data.user.user_metadata?.display_name ||
    data.user.email?.split("@")[0] ||
    "User";

  await ensureUserDoc({
    uid: data.user.id,
    email: data.user.email ?? null,
    displayName,
    photoURL: null,
  });

  return sessionToAppUser(data.user, displayName);
}

export async function logOut() {
  await supabase.auth.signOut();
}

export function watchAuth(cb: (user: AppUser | null) => void) {
  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.user) {
      cb(supabaseUserToAppUser(data.session.user));
    } else {
      cb(null);
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      cb(supabaseUserToAppUser(session.user));
    } else {
      cb(null);
    }
  });

  return () => subscription.unsubscribe();
}

function supabaseUserToAppUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AppUser {
  const meta = u.user_metadata ?? {};
  return {
    uid: u.id,
    email: u.email ?? null,
    phone: (meta.phone as string) ?? null,
    displayName: (meta.display_name as string) || u.email?.split("@")[0] || "User",
    photoURL: (meta.photo_url as string) ?? null,
  };
}

function sessionToAppUser(
  u: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  displayName: string,
): AppUser {
  return {
    uid: u.id,
    email: u.email ?? null,
    phone: null,
    displayName,
    photoURL: null,
  };
}
