// ─────────────────────────────────────────────────────────────
//  ProdTrack — Configuration
//  Fill in your Supabase project details below.
//  MRPeasy credentials are stored in Supabase Secrets (not here).
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = 'YOUR_SUPABASE_URL';       // e.g. https://xyzxyz.supabase.co
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';  // starts with eyJ...

// Edge Function URL — automatically derived from SUPABASE_URL.
// No need to change this line.
const MRPEASY_PROXY_URL = SUPABASE_URL + '/functions/v1/mrpeasy-proxy';

// ─────────────────────────────────────────────────────────────
//  App Password
// ─────────────────────────────────────────────────────────────
const APP_PASSWORD = 'changeme';
