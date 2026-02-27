// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) {
  console.error('error:NEXT_PUBLIC_SUPABASE_URL not setup');
  throw new Error('supabaseUrl is required');
}

if (!supabaseAnonKey) {
  console.error('error:NEXT_PUBLIC_SUPABASE_ANON_KEY not setup');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);