import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jdtgsudjgasgtmfbmeyu.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInN1YmI6ImpkdGdzdWRqZ2FzZ3RtZmJtZXl1Iiwicm9sZSI6ImFub24iLCJleHAiOjE3NzM4Mze0MjMsImV4cCI6MjA4OTQwNzQyMyM3MC44GfTn99z_XdTmOKPB2dgQKdJ_UphjO-5ynlflx8PajQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
