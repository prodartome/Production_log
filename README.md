# ProdTrack — Production Tracker

A lightweight, browser-based production tracking app.  
**Stack:** GitHub Pages (hosting) + Supabase (database) — both free.

---

## 🚀 Setup Guide

### Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New project**, give it a name (e.g. `prodtrack`), set a password, choose a region close to you
3. Wait ~2 minutes for the project to be ready

### Step 2 — Run the database setup

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **New query**
3. Copy the entire contents of `supabase_setup.sql` and paste it in
4. Click **Run** (green button)
5. You should see "Success. No rows returned"

### Step 3 — Get your API credentials

1. In Supabase, go to **Settings** → **API**
2. Copy:
   - **Project URL** (looks like `https://xyzxyzxyz.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Step 4 — Add credentials to the app

1. Open `config.js` in a text editor
2. Replace the placeholder values:

```js
const SUPABASE_URL = 'https://xyzxyzxyz.supabase.co';   // your URL
const SUPABASE_KEY = 'eyJhbGci...';                      // your anon key
```

3. Save the file

### Step 5 — Publish on GitHub Pages

1. Go to [github.com](https://github.com) and create a **new repository** (e.g. `prodtrack`)
2. Make it **Public**
3. Upload all 5 files:
   - `index.html`
   - `style.css`
   - `app.js`
   - `config.js`
   - `supabase_setup.sql` (optional, just for reference)
4. Go to repository **Settings** → **Pages**
5. Under **Source**, select `main` branch, `/ (root)` folder
6. Click **Save**
7. Your app will be live at: `https://YOUR-USERNAME.github.io/prodtrack/`

---

## 📋 Managing Your Data

Everything is managed directly in the **Supabase Table Editor** (like a spreadsheet):

| Table | What to edit |
|-------|-------------|
| `workers` | Add/remove/rename worker names |
| `products` | Add/remove/rename products |
| `phases` | Add phases — set `product_id` to link to a product, `sort_order` to control display order |
| `entries` | View all logged entries (you can delete rows here too) |

### Adding a new product with phases

1. In Supabase → **Table Editor** → `products` → **Insert row**
2. Set `name` = your product name, click **Save**
3. Go to `phases` table → **Insert row**
4. Set `name` = phase name, `product_id` = the ID of your new product (check the products table for the ID), `sort_order` = 1, 2, 3...
5. Repeat for each phase
6. Reload the app — the new product and its phases appear immediately

---

## 📥 Exporting to Excel

Click **Export XLSX** in the app. The file contains:
- **Full Log** sheet — every entry with timestamp
- **Summary** sheet — totals grouped by worker + product + phase
- **One sheet per product** — filtered view with totals

---

## 🔒 Security Notes

- The `anon` key is safe to expose in a public GitHub repo — it only has the permissions defined in the SQL (read workers/products/phases, insert/delete entries)
- Workers, products, and phases are **read-only** from the app — only you can change them via the Supabase dashboard
- If you want to restrict who can log entries, you can add Supabase Auth later

---

## Files

```
prodtrack/
├── index.html          # App shell & layout
├── style.css           # All styles
├── app.js              # All logic (Supabase calls, rendering, export)
├── config.js           # 🔑 Your Supabase credentials go here
└── supabase_setup.sql  # Run once in Supabase SQL Editor
```
