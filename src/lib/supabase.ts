// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

// Client for server-side operations (with service role)
export function createServerSupabaseClient() {
  console.log('[Supabase] Creating client with:', {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 10) + '...',
    keyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
  })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined')
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  console.log('[Supabase] Client created successfully')
  return client
}

// Client for client-side operations (with anon key)
export function createClientSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}