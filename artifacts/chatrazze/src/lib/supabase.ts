import { createClient } from "@supabase/supabase-js";

export const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co";
export const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "placeholder";

export const supabaseMisconfigured = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
