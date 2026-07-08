# Daily Huddle Builder — Setup Guide (AI drafting)

This gets your huddle tool online with the "Draft with AI" button working, using
GitHub for your code and Netlify to host it and keep your API key hidden.

You do this once. After that, you and your assistant just use the website.

---

## What you'll end up with

- Your site lives on GitHub (code) + Netlify (hosting).
- The "Draft with AI" button on Standout Departments writes callouts in your voice.
- Your Anthropic API key stays hidden on Netlify's server — never in the browser.
- Everything else in the tool works with or without the internet/AI.

---

## Files in this project

```
index.html                     ← the app (rename of daily-huddle-builder.html)
netlify.toml                   ← tells Netlify how to build
netlify/functions/draft.js     ← the hidden-key AI helper
```

---

## Step 1 — Get an Anthropic API key

1. Go to **console.anthropic.com** and sign in (or create an account).
2. Add a payment method under **Billing** (usage for 2 people is a few dollars/month at most).
3. Go to **API Keys → Create Key**. Copy it (starts with `sk-ant-...`).
   Keep it somewhere safe for Step 4. Treat it like a password.

## Step 2 — Put the code on GitHub

1. Create a new repository at **github.com** (e.g. `daily-huddle`). Private is fine.
2. Upload these files, keeping the folder structure:
   - `index.html`
   - `netlify.toml`
   - `netlify/functions/draft.js`  (create the `netlify/functions` folders)

## Step 3 — Connect Netlify to the repo

1. Go to **netlify.com**, sign in with GitHub.
2. **Add new site → Import an existing project → GitHub**, pick your repo.
3. Leave build settings as detected (the `netlify.toml` handles it). Click **Deploy**.

## Step 4 — Add your API key to Netlify (this is the important part)

1. In Netlify: **Site configuration → Environment variables → Add a variable**.
2. Key: `ANTHROPIC_API_KEY`
   Value: paste your `sk-ant-...` key.
3. Save, then **Deploys → Trigger deploy → Deploy site** so it picks up the key.

## Step 5 — Use it

- Open your Netlify site URL. Fill in Department Sales and Vision Pro numbers.
- Click **Draft with AI** under Standout Departments. It picks the top and bottom
  department and writes both callouts in your voice. Edit anything, then Generate.

---

## Notes

- **If the AI button ever fails:** the rest of the tool still works. You can type the
  callouts yourself. Usually a failure means the API key isn't set, or billing lapsed.
- **Updating the app:** push a change to GitHub and Netlify redeploys automatically.
- **Your voice:** it lives in `netlify/functions/draft.js` (the `VOICE_PROFILE` text).
  Edit that anytime to fine-tune how it sounds.
- **Cost control:** you can set usage limits in the Anthropic console under Billing.
