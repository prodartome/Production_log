// supabase/functions/mrpeasy-proxy/index.ts
//
// Supabase Edge Function — MRPeasy API proxy
//
// Reads MRPEASY_USER and MRPEASY_KEY from Supabase secrets (never exposed to browser).
// The app calls THIS function; this function calls MRPeasy.
//
// Deploy:
//   supabase secrets set MRPEASY_USER=your@email.com
//   supabase secrets set MRPEASY_KEY=your_api_key_here
//   supabase functions deploy mrpeasy-proxy --no-verify-jwt

import { corsHeaders } from '../_shared/cors.ts';

const MRPEASY_BASE = 'https://api.mrpeasy.com/rest/v1';

Deno.serve(async (req: Request) => {

  // ── Preflight ────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Read secrets (set via: supabase secrets set) ───────────
    const mrpUser = Deno.env.get('MRPEASY_USER');
    const mrpKey  = Deno.env.get('MRPEASY_KEY');

    if (!mrpUser || !mrpKey) {
      return new Response(
        JSON.stringify({ error: 'MRPeasy credentials not configured in Supabase secrets. Run: supabase secrets set MRPEASY_USER=... MRPEASY_KEY=...' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Parse requested endpoint from query param ──────────────
    const url      = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint') ?? 'stock/inventory';
    const params   = url.searchParams.get('params')   ?? '';

    // Build MRPeasy URL
    const mrpUrl = `${MRPEASY_BASE}/${endpoint}${params ? '?' + params : ''}`;

    // ── Call MRPeasy with Basic Auth ───────────────────────────
    const credentials = btoa(`${mrpUser}:${mrpKey}`);

    const mrpRes = await fetch(mrpUrl, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept':        'application/json',
        'Content-Type':  'application/json',
      },
    });

    // ── Handle MRPeasy errors ──────────────────────────────────
    if (!mrpRes.ok) {
      const errText = await mrpRes.text();
      return new Response(
        JSON.stringify({ error: `MRPeasy API error ${mrpRes.status}`, detail: errText }),
        { status: mrpRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Return the MRPeasy response ────────────────────────────
    const data = await mrpRes.json();

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
