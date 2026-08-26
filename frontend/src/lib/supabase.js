import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://wvejhtqckwwlxfvlsxmy.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ttm03drKHFCUZWQkkv6cFA_lqlJHpzV'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(supabaseUrl && publishableKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
