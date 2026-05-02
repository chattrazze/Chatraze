import { supabase } from "./supabase";

export interface AppUser {
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  photoURL: string | null;
  createdAt?: string;
  lastSeen?: string;
  online?: boolean;
  isGroup?: boolean;
  memberCount?: number;
  members?: string[];
}

export async function ensureUserDoc(user: {
  uid: string;
  email: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}) {
  const displayName =
    user.displayName ||
    (user.email ? user.email.split("@")[0] : "User");

  const { data: existing } = await supabase
    .from("profiles")
    .select("uid")
    .eq("uid", user.uid)
    .single();

  if (!existing) {
    const { data, error } = await supabase.from("profiles").insert({
      uid: user.uid,
      email: user.email,
      phone: user.phoneNumber ?? null,
      display_name: displayName,
      photo_url: user.photoURL ?? null,
      online: true,
      last_seen: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    return rowToAppUser(data);
  }

  await supabase
    .from("profiles")
    .update({ last_seen: new Date().toISOString(), online: true })
    .eq("uid", user.uid);

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("uid", user.uid)
    .single();

  return data ? rowToAppUser(data) : null;
}

function rowToAppUser(row: Record<string, unknown>): AppUser {
  return {
    uid: row.uid as string,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    displayName: (row.display_name as string) ?? "User",
    photoURL: (row.photo_url as string) ?? null,
    online: (row.online as boolean) ?? false,
    lastSeen: (row.last_seen as string) ?? undefined,
    createdAt: (row.created_at as string) ?? undefined,
  };
}

export async function getUser(uid: string): Promise<AppUser | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("uid", uid)
    .single();
  return data ? rowToAppUser(data) : null;
}

export async function searchUsers(qStr: string): Promise<AppUser[]> {
  const term = qStr.trim();
  if (!term) return [];

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .or(`display_name.ilike.%${term}%,email.ilike.%${term}%`)
    .limit(20);

  return (data ?? []).map(rowToAppUser);
}

export function listenToUser(uid: string, cb: (u: AppUser | null) => void) {
  supabase
    .from("profiles")
    .select("*")
    .eq("uid", uid)
    .single()
    .then(({ data }) => cb(data ? rowToAppUser(data) : null));

  const channel = supabase
    .channel(`profile:${uid}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `uid=eq.${uid}` },
      (payload) => {
        cb(payload.new ? rowToAppUser(payload.new as Record<string, unknown>) : null);
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function setPresence(uid: string, online: boolean) {
  await supabase
    .from("profiles")
    .update({ online, last_seen: new Date().toISOString() })
    .eq("uid", uid);
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<AppUser, "displayName" | "photoURL" | "phone">>,
) {
  const mapped: Record<string, unknown> = {};
  if (updates.displayName !== undefined) mapped.display_name = updates.displayName;
  if (updates.photoURL !== undefined) mapped.photo_url = updates.photoURL;
  if (updates.phone !== undefined) mapped.phone = updates.phone;
  await supabase.from("profiles").update(mapped).eq("uid", uid);
}

async function compressImage(file: Blob, maxSize = 256): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });

  const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function uploadAvatar(uid: string, file: Blob): Promise<string> {
  const compressed = await compressImage(file, 256);
  await supabase.from("profiles").update({ photo_url: compressed }).eq("uid", uid);
  return compressed;
}
