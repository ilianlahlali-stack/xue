export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// New Supabase projects expose a "publishable" key; older ones an "anon" key.
// Both are safe client-side: the RLS policies in supabase/schema.sql gate access.
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
