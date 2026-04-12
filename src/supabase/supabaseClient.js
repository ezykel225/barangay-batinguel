import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mpcyqwasurhtdztzobwg.supabase.co'
const supabaseKey = 'sb_publishable_dKWX8b19Ua6ZZ489CALU5A_AEk60PM-'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    }
  }
)