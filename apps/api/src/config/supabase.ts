import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './env';

let supabaseClient: SupabaseClient | null = null;

/**
 * Returns a configured Supabase client instance with service_role privileges
 * for administrative storage operations.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!config.supabaseUrl || !config.supabaseSecretKey) {
      throw new Error(
        '[Supabase Storage Error] SUPABASE_URL and SUPABASE_SECRET_KEY must be configured in environment variables.'
      );
    }
    supabaseClient = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false },
    });
  }
  return supabaseClient;
}
