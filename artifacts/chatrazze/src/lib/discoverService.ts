import { supabase } from "./supabase";
import { createChat } from "./chatService";

export interface DiscoverProfile {
  userId: string;
  displayName: string;
  age: number;
  gender: string;
  city: string;
  nationality?: string;
  height?: number;
  bio: string;
  lookingFor: string;
  fitness: string;
  smoking: string;
  drinking?: string;
  education?: string;
  occupation?: string;
  religion?: string;
  children?: string;
  zodiac?: string;
  interests: string[];
  languages?: string[];
  photos: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DiscoverMatch {
  id: string;
  userId: string;
  displayName: string;
  photos: string[];
  chatId: string;
  matchedAt: string;
  profile?: DiscoverProfile;
}

function rowToProfile(row: Record<string, unknown>): DiscoverProfile {
  return {
    userId: row.user_id as string,
    displayName: (row.display_name as string) ?? "",
    age: (row.age as number) ?? 0,
    gender: (row.gender as string) ?? "",
    city: (row.city as string) ?? "",
    nationality: (row.nationality as string) ?? undefined,
    height: (row.height as number) ?? undefined,
    bio: (row.bio as string) ?? "",
    lookingFor: (row.looking_for as string) ?? "friendship",
    fitness: (row.fitness as string) ?? "",
    smoking: (row.smoking as string) ?? "",
    drinking: (row.drinking as string) ?? undefined,
    education: (row.education as string) ?? undefined,
    occupation: (row.occupation as string) ?? undefined,
    religion: (row.religion as string) ?? undefined,
    children: (row.children as string) ?? undefined,
    zodiac: (row.zodiac as string) ?? undefined,
    interests: (row.interests as string[]) ?? [],
    languages: (row.languages as string[]) ?? [],
    photos: (row.photos as string[]) ?? [],
    isActive: (row.is_active as boolean) ?? false,
    createdAt: (row.created_at as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

export async function getMyDiscoverProfile(uid: string): Promise<DiscoverProfile | null> {
  const { data } = await supabase
    .from("discover_profiles")
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();
  return data ? rowToProfile(data as Record<string, unknown>) : null;
}

export async function upsertDiscoverProfile(
  uid: string,
  profile: Partial<DiscoverProfile>
): Promise<void> {
  const photos = profile.photos ?? [];
  const isActive =
    photos.length >= 3 &&
    !!profile.displayName?.trim() &&
    (profile.age ?? 0) >= 18 &&
    !!profile.bio?.trim();

  const { error } = await supabase.from("discover_profiles").upsert(
    {
      user_id: uid,
      display_name: profile.displayName ?? "",
      age: profile.age ?? 0,
      gender: profile.gender ?? "",
      city: profile.city ?? "",
      nationality: profile.nationality ?? null,
      height: profile.height ?? null,
      bio: profile.bio ?? "",
      looking_for: profile.lookingFor ?? "friendship",
      fitness: profile.fitness ?? "",
      smoking: profile.smoking ?? "",
      drinking: profile.drinking ?? null,
      education: profile.education ?? null,
      occupation: profile.occupation ?? null,
      religion: profile.religion ?? null,
      children: profile.children ?? null,
      zodiac: profile.zodiac ?? null,
      interests: profile.interests ?? [],
      languages: profile.languages ?? [],
      photos,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

export async function pauseDiscoverProfile(uid: string): Promise<void> {
  const { error } = await supabase
    .from("discover_profiles")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", uid);
  if (error) throw error;
}

export async function resumeDiscoverProfile(uid: string): Promise<void> {
  const { error } = await supabase
    .from("discover_profiles")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("user_id", uid);
  if (error) throw error;
}

export async function deleteDiscoverProfile(uid: string): Promise<void> {
  const { error } = await supabase
    .from("discover_profiles")
    .delete()
    .eq("user_id", uid);
  if (error) throw error;
}

export async function uploadDiscoverPhoto(uid: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `discover/${uid}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("chatrazze-media")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("chatrazze-media").getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteDiscoverPhoto(url: string): Promise<void> {
  const marker = "/chatrazze-media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  await supabase.storage.from("chatrazze-media").remove([path]);
}

export async function getDiscoverFeed(uid: string): Promise<DiscoverProfile[]> {
  const { data: swiped } = await supabase
    .from("swipes")
    .select("swiped_id")
    .eq("swiper_id", uid);

  const swipedIds: string[] = (swiped ?? []).map(
    (s: Record<string, unknown>) => s.swiped_id as string
  );

  let query = supabase
    .from("discover_profiles")
    .select("*")
    .eq("is_active", true)
    .neq("user_id", uid);

  if (swipedIds.length > 0) {
    query = query.not("user_id", "in", `(${swipedIds.map((id) => `"${id}"`).join(",")})`);
  }

  const { data } = await query.order("updated_at", { ascending: false }).limit(30);
  return (data ?? []).map((r) => rowToProfile(r as Record<string, unknown>));
}

export async function swipe(
  swiperId: string,
  swipedId: string,
  direction: "like" | "skip"
): Promise<{ matched: boolean; chatId?: string; matchedProfile?: DiscoverProfile }> {
  await supabase.from("swipes").upsert(
    {
      swiper_id: swiperId,
      swiped_id: swipedId,
      direction,
      created_at: new Date().toISOString(),
    },
    { onConflict: "swiper_id,swiped_id" }
  );

  if (direction === "skip") return { matched: false };

  const { data: reverse } = await supabase
    .from("swipes")
    .select("id")
    .eq("swiper_id", swipedId)
    .eq("swiped_id", swiperId)
    .eq("direction", "like")
    .maybeSingle();

  if (!reverse) return { matched: false };

  const { data: existingMatch } = await supabase
    .from("matches")
    .select("chat_id")
    .or(
      `and(user1_id.eq.${swiperId},user2_id.eq.${swipedId}),and(user1_id.eq.${swipedId},user2_id.eq.${swiperId})`
    )
    .maybeSingle();

  let chatId: string;
  if (existingMatch) {
    chatId = existingMatch.chat_id as string;
  } else {
    chatId = await createChat(swiperId, swipedId);
    await supabase.from("matches").insert({
      user1_id: swiperId,
      user2_id: swipedId,
      chat_id: chatId,
      created_at: new Date().toISOString(),
    });
  }

  const matchedProfile = await getMyDiscoverProfile(swipedId);
  return { matched: true, chatId, matchedProfile: matchedProfile ?? undefined };
}

export async function getMatches(uid: string): Promise<DiscoverMatch[]> {
  const { data } = await supabase
    .from("matches")
    .select("id, chat_id, created_at, user1_id, user2_id")
    .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) return [];

  const otherIds = (data as Record<string, string>[]).map((m) =>
    m.user1_id === uid ? m.user2_id : m.user1_id
  );

  const { data: profiles } = await supabase
    .from("discover_profiles")
    .select("*")
    .in("user_id", otherIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: Record<string, unknown>) => [
      p.user_id as string,
      rowToProfile(p),
    ])
  );

  return (data as Record<string, string>[]).map((m) => {
    const otherId = m.user1_id === uid ? m.user2_id : m.user1_id;
    const profile = profileMap.get(otherId);
    return {
      id: m.id,
      userId: otherId,
      displayName: profile?.displayName ?? "User",
      photos: profile?.photos ?? [],
      chatId: m.chat_id,
      matchedAt: m.created_at,
      profile: profile ?? undefined,
    };
  });
}
