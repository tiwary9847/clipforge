# Earning with ViralKaro – setup guide

Everything in the app is built. These are the steps only you can do (they need your identity, bank account or payment). Do them in order. Each step says what to send back to Claude, if anything.

| | Step | Time | Cost |
|---|---|---|---|
| 0 | Check your employment contract / company policy on side businesses | – | – |
| 1 | Keep your licence key safe | 2 min | free |
| 2 | Fill in the 4 policy pages | 20 min | free |
| 3 | Razorpay account + KYC | 1–3 days | free (≈2% per payment) |
| 4 | Cloudflare server (payments + built-in AI) | 20 min | free plan |
| 5 | Gemini key for built-in AI | 5 min | free tier, then pay-per-use |
| 6 | Android app with PWABuilder | 30 min | free |
| 7 | Google Play Console | 1–7 days | $25 once |
| 8 | Fix GitHub billing (optional) | 5 min | – |

---

## 0. Your job
Many employers (including large consulting firms) have rules about outside business or paid side projects. Read your contract or ask HR before you start charging money.

## 1. Your licence key (most important)
You received **`clipforge-licence-private.jwk.json`**. It's the key that creates Pro licences.
- Save it somewhere safe and private (a password manager, or an encrypted drive). **Never** put it in GitHub, WhatsApp or email.
- If someone gets it, they can make free Pro licences. If you lose it, existing licences keep working, but you'd need a new key and an app update to sell more.
- You also received **`owner-licence.txt`** – your own lifetime Pro. Open ViralKaro → Go Pro → “I have a licence code” → paste it. Do the same on each of your devices.
- To gift Pro (Seema, testers, collaborators), you can run this on a computer with Node.js:
  `node server/make-licence.mjs clipforge-licence-private.jwk.json "friend@email.com" year gift`
  (or ask Claude to do it).

## 2. Policy pages
Razorpay won't switch on live payments without Terms, Privacy, Refund (with delivery) and Contact pages, and Google needs the privacy page for YouTube sign-in.
Put your **full name, city, state and email** (phone optional) in **`legal.json`** – or just send them to Claude. Every build then publishes `/legal/terms.html`, `privacy.html`, `refunds.html`, `contact.html` and shows **Terms · Privacy · Refunds · Contact** on the start screen and in the Pro window. Until it's filled in, nothing is published. The wording lives in `docs/legal-templates/` (plain-language starting points, not legal advice).

## 3. Razorpay (UPI / cards on the website)
1. Sign up at **razorpay.com** → choose *Individual / Sole proprietor*, category *Software / SaaS*.
2. Website: `https://tiwary9847.github.io/clipforge/` (after step 2, the policy pages are on it).
3. Complete KYC (PAN, bank account, address).
4. While waiting, you can test: **Settings → API Keys → Test mode → Generate key**. Note the **Key ID** (`rzp_test_…`) and **Key Secret**.
5. After activation, generate **Live** keys (`rzp_live_…`).
6. **Webhooks** (Settings → Webhooks → Add): URL `https://viralkaro-pay.<your-subdomain>.workers.dev/webhook`, events **payment.captured** and **refund.processed**, and set a secret (any long random text). Note the **Webhook Secret**. (`refund.processed` is what switches Pro off when you refund someone.)

GST: as an individual, you usually don't need GST registration until your yearly turnover crosses the threshold. Ask a CA once income starts.

## 4. Cloudflare server (free)
On a computer with Node.js (Claude can walk you through this live):
```
cd clipforge/server
npx wrangler login                                 # opens the browser – sign up free at cloudflare.com
npx wrangler kv namespace create DB                # copy the id into wrangler.toml (PASTE_KV_ID_HERE)
npx wrangler secret put LICENCE_PRIVATE_JWK        # paste the WHOLE content of clipforge-licence-private.jwk.json
npx wrangler secret put RAZORPAY_KEY_ID            # rzp_test_… first, rzp_live_… later
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
npx wrangler secret put GEMINI_KEY                 # step 5
npx wrangler secret put ADMIN_TOKEN                # a long password you choose – for your seller dashboard
npx wrangler secret put KLIPY_KEY                  # step 5b – turns on the GIFs tab for everyone
npx wrangler deploy                                # prints https://viralkaro-pay.<you>.workers.dev
```
Send Claude the **workers.dev address** and your **Razorpay Key ID** (not the secret). Claude puts them in `src/plan.ts` (`CONFIG.server`, `CONFIG.razorpayKey`) and deploys. Then the “Get Pro” button goes live.

Test first with Razorpay **test** keys: test UPI id `success@razorpay` pays instantly. Then switch the two Razorpay secrets to live keys and ask Claude to swap the Key ID.

The server was tested here with simulated payments: genuine payments give a licence; forged signatures, a ₹99 order relabelled as lifetime, wrong-email restores, fake webhooks, edited licences and over-limit AI use are all refused (`node server/test.mjs`).

## 5. Gemini key (built-in AI and Hindi voices for Pro)
aistudio.google.com → Get API key. Put it in the server (step 4). Each Pro user gets 300 AI requests a month (`AI_MONTHLY` in `wrangler.toml`); one Hindi voice-over counts as 5. Buyers can add 100 more for ₹49. The Hindi voices use Google's Gemini text-to-speech models, which cost more than text – keep the budget alert on. Set a monthly budget alert in Google Cloud Billing so costs can't surprise you; Flash models cost very little per request.

## 5b. GIF search (free – KLIPY)
The **GIFs** tab searches millions of GIFs and see-through stickers. It needs one free key, kept on your server so users set up nothing:
1. klipy.com/developers → sign up → **Generate API key** (the test key allows 100 searches a minute).
2. `npx wrangler secret put KLIPY_KEY` and paste it. Done – the GIFs tab works for everyone.
3. Before launch, in the KLIPY Partner Panel fill the short form to get the **free production key** (no limits) and put that in `KLIPY_KEY` instead.

(Tenor's GIF API was shut down by Google on 30 June 2026. GIPHY also works – `GIPHY_KEY` – but its free key allows only 100 searches an hour for the whole app, so use KLIPY.) Until a key is set, the tab lets users add GIFs from their phone, or paste their own free GIPHY key.

## 5c. YouTube posting for everyone (Google sign-in)
So users can post straight to YouTube without any setup, the app needs one Google sign-in ID of yours:
1. console.cloud.google.com → create a project “ViralKaro” → **APIs & Services → Library** → enable **YouTube Data API v3**.
2. **OAuth consent screen**: app name ViralKaro, your email, home page = the app's address, privacy policy = `…/legal/privacy.html`, terms = `…/legal/terms.html`; add the scope `…/auth/youtube.upload`.
3. **Credentials → Create credentials → OAuth client ID → Web application** → Authorised JavaScript origins: `https://tiwary9847.github.io` (plus your own domain later). Copy the client ID (`…apps.googleusercontent.com`).
4. Send it to Claude (or put it in `googleClientId` in `src/plan.ts`). It is not a secret.
5. Until Google **verifies** the app (needed because of the upload permission; can take a few weeks, they review the privacy page and a short screen recording of the sign-in), only up to 100 test users you add can sign in, and they see an “unverified app” warning. Submit for verification as soon as the policy pages are live.

## 6. Android app (PWABuilder – no Android Studio needed)
1. Go to **pwabuilder.com**, enter `https://tiwary9847.github.io/clipforge/` → *Package for stores* → **Android** → *Google Play*.
2. Package ID: `io.github.tiwary9847.viralkaro` · App name: `ViralKaro – Video Editor` · Launcher name: `ViralKaro`.
3. Under *Signing key* choose **Create new** and fill your name. Download the zip.
4. **Keep the `signing.keystore` and `signing-key-info.txt` from the zip forever**, with the licence key. Every app update must be signed with them.
5. The zip has an `.apk` (install on your phone to test – allow “install unknown apps”) and an `.aab` (for the Play Store).
6. The zip also has **`assetlinks.json`**. Without it, the app shows a small address bar at the top. To remove it: on GitHub create a public repository named exactly **`tiwary9847.github.io`**, add the file at `.well-known/assetlinks.json`, and in that repo's Settings → Pages publish from the main branch. (Or send Claude the file and the repository and Claude will do it.)
7. Turn on **Play Billing** in PWABuilder's options if shown – ViralKaro uses it for in-app Pro.

The same app setup is in `android/twa-manifest.json` for GitHub's automatic build (step 9).

## 7. Google Play Console
1. play.google.com/console → developer account ($25 once, identity check).
2. Create app → upload the `.aab`. Fill in the store listing (Claude can write the description and screenshots), content rating and data safety (“no data collected” except purchase email – see the privacy page).
3. **In-app products** (Monetize → Products → In-app products), all *Managed products*:
   - `pro_month` – ₹99 – “ViralKaro Pro – 30 days”
   - `pro_year` – ₹699 – “ViralKaro Pro – 12 months”
   - `pro_life` – ₹1,999 – “ViralKaro Pro – Lifetime”
4. **Server access to purchases:** Google Cloud → create a *service account* → in Play Console → Users and permissions → invite its email with “View financial data / manage orders”. Download its JSON key, then:
   `npx wrangler secret put PLAY_SERVICE_ACCOUNT` (paste the JSON) and `npx wrangler secret put PLAY_PACKAGE` (`io.github.tiwary9847.viralkaro`).
5. New personal developer accounts must run a closed test with at least 12 testers for 14 days before going public – friends and family can join.

Inside the Play app, Pro is bought through Google Play (Play's policy). In India Google currently keeps 15% of your first $1M a year; it has started lower fees and web-payment links in the US, UK and EEA, and says more markets will follow. Razorpay on the website takes about 2%.

## 7b. Moving to your own domain (optional)
Change `VITE_SITE_URL` in **`.env`** (link previews and policy links use it), add the domain to `ALLOWED_ORIGINS` in `server/wrangler.toml` and to the Google sign-in origins (5c), and update `host`/URLs in `android/twa-manifest.json`. On your own domain the `assetlinks.json` file can sit on the same site, so the separate `tiwary9847.github.io` repository isn't needed.

## 8. Running the shop (seller dashboard)
Open **https://tiwary9847.github.io/clipforge/admin.html**, type your workers.dev address and your `ADMIN_TOKEN` password. You get:
- **Sales:** this month, all time, Pro users right now, refunds, sales by plan.
- **Buyers & payments:** search by email or payment ID. “Switch off Pro” stops a licence without moving money.
- **Coupons:** e.g. `DIWALI30` = 30% off, with a limit on uses, a last date and which plans it works for. Buyers type it on the Pro screen.
- **Gift a licence:** for giveaways, YouTubers who review the app, or a buyer whose payment got stuck.

**Refunds:** refund the money in the Razorpay dashboard. The `refund.processed` webhook marks it and Pro switches off on the buyer's device the next time it's online (the app checks once a day).

**What buyers get automatically:** a receipt (printable / save as PDF) after paying, a reminder 5 days before a pass ends with a Renew button (renewing early keeps the days left), clear messages when a payment fails, and their AI requests left this month.

## 9. GitHub billing (optional)
GitHub Actions on your account is locked because of a billing issue (every automatic job shows “account is locked due to a billing issue”). The website isn't affected. To use the automatic Android build instead of PWABuilder: fix it at github.com → Settings → Billing, add the keystore as secrets (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`), then Actions → **Android app** → Run workflow.

---

### What's already in the app
- **Free:** everything except the Pro features, **no ads**, a small “Made with ViralKaro” mark (bottom-right, above the Shorts/Reels buttons).
- **Pro (₹99 / 30 days, ₹699 / year, ₹1,999 lifetime):** **🚀 Autopilot** (one tap: raw video → edited Shorts/YouTube/Reels files with titles, hashtags and thumbnails; batch many videos; auto-post or schedule on YouTube; saved recipes), no mark, built-in AI without a key (300 requests a month, +100 for ₹49), **Hindi AI voices**, **one-tap upload kit** (Shorts + YouTube + Reels files with titles, description, hashtags and thumbnail each), **7 premium caption styles**, **premium template packs** (wedding, festival, travel, devotional), 4K export, all formats at once, brand kit.
- Licences are signed and checked in the app (works offline, can't be faked); “Get it back” restores Pro on a new phone with email + payment ID; Pro can be copied to another device with the licence code.
- Until steps 3–4 are done, the Pro screen says “Pro sales open soon” and accepts licence codes.
