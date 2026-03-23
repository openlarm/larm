import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Server-side Supabase client using Service Role Key.
 * Only use in API routes / server components.
 */
export function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    )
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })
}
