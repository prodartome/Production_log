# MRPeasy Stock Integration — Setup Guide

The stock page connects to MRPeasy via a **Supabase Edge Function**.
Your MRPeasy credentials never touch the browser — they live securely in Supabase Secrets.

---

## How it works

```
Browser  →  Supabase Edge Function (mrpeasy-proxy)  →  MRPeasy API
              ↑ credentials stored here as secrets
```

---

## Step 1 — Install Supabase CLI

```bash
npm install -g supabase
```

Or on Mac:
```bash
brew install supabase/tap/supabase
```

---

## Step 2 — Link your Supabase project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Find your project ref in: **Supabase Dashboard → Settings → General → Reference ID**

---

## Step 3 — Get your MRPeasy API key

1. Log into [MRPeasy](https://app.mrpeasy.com)
2. Go to **Settings** (top right gear icon)
3. Click **Integration**
4. Click **API Access**
5. Copy your **API Key**
6. Your **API User** is your MRPeasy login email

---

## Step 4 — Store credentials as Supabase Secrets

```bash
supabase secrets set MRPEASY_USER=your@email.com
supabase secrets set MRPEASY_KEY=your_mrpeasy_api_key_here
```

These are encrypted and never visible in your code or GitHub repo.

---

## Step 5 — Deploy the Edge Function

From the root of your project folder:

```bash
supabase functions deploy mrpeasy-proxy --no-verify-jwt
```

The `--no-verify-jwt` flag allows the app to call the function using just the anon key.

---

## Step 6 — Test it

Go to your app → click **Stock** in the sidebar → click **Load Stock from MRPeasy**

If it works, you'll see your full inventory table.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `MRPeasy credentials not configured` | Run `supabase secrets set` again |
| `MRPeasy API error 401` | Check your API user email and key in MRPeasy |
| `Proxy error 500` | Check Edge Function logs in Supabase Dashboard → Edge Functions |
| CORS error | Make sure you deployed with `--no-verify-jwt` |

**View live logs:**
```bash
supabase functions logs mrpeasy-proxy
```

Or in Supabase Dashboard → **Edge Functions** → **mrpeasy-proxy** → **Logs**

---

## Updating credentials

To change the API key at any time:
```bash
supabase secrets set MRPEASY_KEY=new_key_here
```
No redeployment needed — secrets are read at runtime.

---

## File structure

```
supabase/
└── functions/
    ├── _shared/
    │   └── cors.ts              ← shared CORS headers
    └── mrpeasy-proxy/
        └── index.ts             ← the proxy function
```
