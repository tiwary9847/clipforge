<div align="center">

# ▶ ClipForge

**A free, in-browser video editor for YouTube Shorts, Instagram Reels, Facebook and YouTube.**
Memes with sound, auto-edit, Hinglish captions, multicam, colour grading and more – everything runs on your device. Nothing is uploaded.

**Live app:** https://tiwary9847.github.io/clipforge/ · **User guide (PDF):** [docs/ClipForge-User-Guide.pdf](docs/ClipForge-User-Guide.pdf)

</div>

## Highlights

| | |
|---|---|
| ✨ **Auto-edit** | Drop clips, set the order, pick a style – cuts, transitions, memes with sound, titles and music are added for you |
| 🤣 **Memes with sound** | ~37 one-tap meme moments, 30 synthesized sound effects, plus free online sound / GIF search |
| 📝 **Edit by text** | Transcribe, then delete words to cut the video; remove “um / uh” and long pauses |
| 💬 **Captions** | On-device Whisper captions, Hindi in English letters (Hinglish), karaoke word highlight, emoji words |
| 🎨 **Pro look** | Colour grading with .cube LUTs, chroma key, AI background removal, animated masks, motion tracking |
| 🎥 **Multicam & recording** | Sync 2–4 cameras by sound and cut live; record screen, webcam or both |
| 🔊 **Audio** | EQ, compressor, noise reduction, vocal remover, auto-ducking, loudness to −14 LUFS, AI voices |
| 📦 **Export** | Fast H.264 MP4 up to 4K, all platform formats at once, WhatsApp status splitter, thumbnail maker |
| 🇮🇳 **Hindi ready** | Seven bundled Devanagari fonts and Hindi text styles |

## Run it locally

```bash
npm install
npm run dev      # development server
npm run build    # builds a single self-contained dist/index.html
```

Requires Node 18+. Best in Chrome or Edge (desktop or Android); Safari and Firefox work with a few features disabled (the app tells you which).

## Deploy

- **GitHub Pages (Actions):** push to `main` – `.github/workflows/deploy.yml` builds and publishes. Set *Settings → Pages → Source* to **GitHub Actions**.
- **GitHub Pages (branch):** the ready-built site is on the `gh-pages` branch – set *Source* to **Deploy from a branch → gh-pages / root**.
- **Anywhere else:** upload the contents of `dist/` to any static host (Netlify, Cloudflare Pages, Vercel…).

The app is an installable PWA (add to home screen) and works offline after the first visit.

## Tech

React 18 + TypeScript + Vite (single-file build) · Canvas 2D compositor · Web Audio · [mediabunny](https://github.com/Vanilagy/mediabunny) for decoding/encoding (WebCodecs) · transformers.js (Whisper, MODNet, TTS) loaded on demand · IndexedDB autosave.

## Licences of optional AI models

Downloaded only when you use the feature: Whisper (MIT), MODNet (Apache-2.0), Kokoro voices (Apache-2.0), MMS Hindi/English voices (**CC BY-NC 4.0 – not for monetised videos**).

---

## Changelog


## Use it
- Easiest: open `clipforge.html` in Chrome or Edge (double-click).
- Developers: `npm install && npm run dev` (edit in `src/`), `npm run build` → `dist/index.html`.

## Included
Multi-track timeline (trim, split, move, snap, undo/redo, zoom), canvas move/scale/rotate,
text (meme/Impact, subtitle, neon…), emoji stickers, synthesized sound effects, SRT/script captions,
filters & colour, speed 0.25–4×, transitions, meme FX (shake, beat punch, glitch…),
9:16 / 1:1 / 4:5 / 16:9 presets, safe-zone guide, MP4/WebM export.

## v2 additions
- Auto-captions (Whisper via transformers.js, in-browser; word-highlight / phrase / one-word styles)
- Keyframes (position, scale, rotation, opacity) + quick motions (zoom, pan, pop, drop, spin)
- Autosave to IndexedDB (project + media) with restore on reopen
- Fast frame-by-frame H.264 MP4 export (WebCodecs via mediabunny) with real-time fallback
- Animated GIF / WebP import (WebCodecs ImageDecoder)

## v3 additions
- Green/blue-screen chroma key with eyedropper, similarity / softness / spill controls
- Crop, shape masks (circle, oval, rounded, diamond, star, heart) and 16 blend modes
- Stabilisation (analyse once, adjustable smoothing, auto-zoom), freeze frame, reverse
- Audio tools: voice-over recording, noise reduction, auto-ducking, beat detection -> timeline markers
- Text animations: typewriter, pop, fade, slide, wave
- Multi-select (Shift/Ctrl-click, drag-box, Ctrl+A), group move, ripple delete (Shift+Del), markers (M)
- Filmstrip thumbnails and waveforms on video clips

## v4 additions
- Templates (hook + outro, meme, lower-third, Top-3, countdown, quote card, like/share/subscribe)
- Phone layout with bottom bar, slide-up panels, touch targets, pinch-to-scale on the preview
- Share sheet (phones) and optional direct YouTube upload (needs https hosting + your own Google OAuth client ID)
- Proxy editing: low-res preview copy for large videos; exports always use the original file
- Auto-cut silences, speed ramps, volume points + drag-able fade handles on the timeline
- Saved text styles, .srt export, browser-compatibility banner

## Known limits / next steps
- Real-time export mode needs the tab visible; fast mode needs WebCodecs (Chrome/Edge/Safari 17+).
- AAC audio encoding is missing on Linux Chrome → falls back to Opus audio in the MP4.
- Auto-captions need internet the first time (model download from Hugging Face).
- Chroma key is a colour key, not AI background removal. Stabilisation corrects translation shake only (not rotation/rolling shutter).
- Noise reduction is spectral subtraction learned from the clip's quietest moments; it needs some background-only audio.
- Reverse re-encodes the clip, so it suits short clips. No smooth (optical-flow) slow motion.
- Facebook/Instagram direct upload is not possible from a browser-only app (needs a server + app review); use Download or the phone Share sheet.
- YouTube upload is untested here (needs a real Google project). Unverified Google projects can only upload private videos.
- Firefox/Safari could not be tested in this build environment; the app detects missing features (Safari has no canvas filters) and shows a notice.
- Proxy copies are not saved between sessions (regenerate after reopening).

## v5 – Memes with sound
- **Memes tab**: ~37 one-tap memes in six groups (Reactions, Fails, Drama, Wins, Comedy, Text memes). Each drops a sound, stickers, caption text and an optional picture effect (shake, noir, deep-fry, freeze-frame, glitch…) at the playhead. Everything stays editable.
- 22 new built-in synthesized sounds (rimshot, dun-dun-DUN, crickets, boing, wrong buzzer, wow, bruh, siren, gong, drum roll, camera click, applause, ka-ching, heartbeat, sus, ta-da, level up, coin, laser, sparkle, womp womp) – also in the Audio tab.
- 🔈 button previews a meme's sound. "Import my meme sound / GIF / image" adds real viral clips you own.
- Sounds are original sound-alikes, not recordings of the famous clips.

## v6 – Auto-edit (✨ button in the top bar)
Upload clips, set the order (↑/↓), optionally add a caption per clip, pick a style (Funny/Meme, Hype, Cinematic, Vlog) and press Auto-edit. It:
- finds the liveliest part of each clip (skips dead air, picks the highest-energy window) and sizes clips to your target length;
- applies style colour, zoom variety, transitions with whoosh sounds, intro title and an outro "follow" call-to-action;
- drops meme moments with sound on loud spikes / clip endings (none / few / normal / lots);
- adds your chosen music, ducked under speech, with optional beat-synced cuts;
- sets the output format, all in one undo step. Everything stays editable on the timeline.

## v7 – Online memes
Memes tab → 🌐 Online: search free Creative-Commons sound effects (Openverse, no key), search meme GIFs/stickers (GIPHY, free key pasted once), or add any direct media link. Results add at the playhead in one click. memes.co.in and MyInstants have no public API and their clips are copyrighted, so they open in a new tab: download, then import/drag the files in.

## v8 – Creator tools
- **Hinglish captions**: Hindi speech can be shown in English letters (or देवनागरी); optional emoji after key words. Tip: use the Small model for Hindi.
- **Auto-reframe** (Inspector → Stabilise·freeze·reverse): follows the action when turning a wide clip into a vertical one.
- **Beat zoom**: pulses the picture on every beat of the clip's audio, the music under it, or your markers.
- **🧰 Tools tab**: Hook finder, Thumbnail maker, Teleprompter (+ records your voice), Brand kit (logo watermark, colours, ending card), All formats at once, Backup/restore (.clipforge file with media).
- Not included (needs large downloaded AI models): background removal, smooth slow-mo, text-to-speech, motion tracking.

## v9 – Pro / "paid editor" features
- **Colour grading** (Inspector): looks (Teal & orange, Film fade, Moody…), temperature/tint, shadows/highlights, vibrance, 5-point tone curve, shadow/highlight colour wheels, **.cube LUT import** with strength, live RGB histogram, apply grade to all clips.
- **Motion tracking**: put a sticker/text/overlay on an object, press Track & follow – it gets X/Y keyframes that follow it.
- **AI background removal** (no green screen): MODNet model runs on-device (downloads once); video becomes a keyed clip, photos become transparent PNGs.
- **Smooth slow motion**: frame-blended re-render for clips below 1×.
- **Audio**: 3-band EQ + compressor with presets (Voice clarity, Podcast, Bass boost, Phone), **vocal remover** (karaoke), **loudness normalisation** to −14 / −16 LUFS with a peak limiter (Tools tab).
- **AI voice** (Tools tab): Kokoro English voices (commercial-OK licence), Hindi + English MMS voices (non-commercial licence).
- **4K export presets** (YouTube 4K, Shorts/Reels 4K).

## v10 – Multicam, groups, animated masks
- **Multicam** (Tools tab): pick 2–4 angles → synced automatically by their sound → live angle viewer; click an angle or press 1–4 while playing to cut. Sound stays from Cam 1. "Finish multicam" keeps the cuts.
- **Group clips**: select clips → 🔗 Group (Ctrl+G). Clicking one selects the group; dragging moves it; trimming one clip's outer edge trims the rest to match; duplicates get their own group. Ungroup with Ctrl+Shift+G.
- **Animated masks**: shapes with modes Show inside / Cut out / Blur inside / Pixelate / Spotlight; position and size are keyframeable (◆); one-tap Grow-in reveal; 🎯 Track mask makes a blur/pixelate follow a face or object.

## v11 – Text editing, recording, Hindi fonts, WhatsApp
- **Edit by text** (Tools tab): transcribe a clip, then delete words in the transcript to cut the video; one-tap removal of filler words (um/uh…, optional like/basically/matlab/toh…) and long pauses. Hindi can be shown in English letters.
- **Record** (Tools tab): screen, webcam, or screen + webcam bubble, with mic and tab/system sound; lands on the timeline.
- **Hindi fonts** bundled (Baloo 2, Mukta, Hind, Noto Sans Devanagari, Rozha One, Yatra One, Kalam), Devanagari fallback for every font, three Hindi text presets.
- **WhatsApp status splitter** (Tools tab): 30 / 60 / 90-second parts, "1/3" badges, 720p compression, download or share each part.

## v12 – Modern "Aurora" UI
Glassy panels with soft colour glows, Inter typeface, gradient primary buttons, pill chips, custom sliders, card hover effects, two-row tool tabs, card-style inspector sections, glossy timeline clips with a glowing playhead, animated dialogs and toasts, compact phone header. Respects "reduce motion".

## v13 – UI polish
Line-icon set replacing emoji controls (tabs, header, transport, timeline toolbar, phone nav), welcome screen for new projects (drop zone that imports straight to the timeline, format cards, quick starts for Auto-edit / Record / Templates / Memes), colour-coded track headers, gradient wordmark, compact phone layout. Fixed: frosted panels no longer trap pop-up windows.

## v14 – First-time tour + long-video performance
- **Quick tour**: 5-step spotlight walkthrough (import → edit → memes → captions → export) shown on the first visit; replay any time from the **?** button or "Take the 30-second tour" on the welcome screen. Phone-specific wording.
- **Long videos**: exports stream straight to the browser's private disk (no whole-file-in-memory), audio is mixed in 10-second chunks with pre-roll (identical output, no clicks), one decoder per source file during export, and only clips near the playhead keep a live video player.

## v15 – Light theme
☀️/🌙 switch in the top bar. Follows the device's light/dark setting until you choose; your choice is remembered. Applied before first paint (no flash). Light styling covers every panel, dialog, timeline, welcome screen, tour and the phone layout.

## v16 – "everything the paid apps have"
- **Effects library**: film grain, VHS, RGB split, light leak, lens flare, zoom blur, glow, vignette; new motions (quake, bounce, zoom pulse, drift, tilt).
- **More transitions**: flash, blur, glitch, whip pan, circle reveal, flip, bounce.
- **Split-screen layouts**: stack, side-by-side, picture-in-picture, reaction, 3-up, grid (Tools tab).
- **Portrait background blur** (AI person cut-out, background blurred).
- **Scene detection**: splits a clip at every camera cut, one undo step.
- **Colour match**: makes one clip look like another.
- **Adjustment layer**: a clip on V-tracks that grades/looks everything under it.
- **Text styles**: gradient fill, curved text, letter pop/bounce, neon glow, rainbow.
- **Shapes & callouts**: arrows, circles, boxes, underline, ✓/✗, subscribe button, like, progress bar, speech callout (draw-on animated).
- **Smooth keyframes**: smooth / linear / ease in / ease out / bounce / elastic / hold.
- **Voice effects**: chipmunk, deep, robot, echo, reverb, cave, phone, megaphone, radio, alien (preview + export).
- **Audio visualizers**: bars, wave, circle – react to your music/voice.
- **Long video → Shorts**: finds the liveliest moments and exports each as a 9:16 Short.
- **Caption translation**: speech → English captions (Whisper translate).
- **Free stock**: Pexels & Pixabay search (bring your own free API key).
- **More export**: GIF, sound only (.m4a/.wav), only part of the video, YouTube chapters from markers.
- **Version history**: auto snapshot every 5 min + named versions, restore with undo.

## v16.1 – real-world test fixes
- **Export ~7–14× faster**: video frames are now read in order with one running decoder per clip, instead of re-seeking from the last keyframe for every frame (a 22 s Short went from 266 s to 42 s on a no-GPU test machine; 10-min 1080p exports at ~1.6× real time with <20 MB memory). Frame-exact – verified on 240 frames with trims, 0.5×/1.5× speed and jumps.
- **Long video → Shorts and captions ~40× faster** on long videos: sound is decoded straight into one array (10-min analysis 412 s → 10 s), matches ffmpeg (0.998 correlation, 0 ms offset).
- **Captions for the whole video**: after an auto-edit or any multi-clip edit, captions cover every clip (each source file transcribed once); "Selected clip only" still available.
- **iPhone/Samsung HEVC videos**: clear message with the fix instead of silently importing a broken clip; fast export names any clip the browser can't decode.
- Drag-and-drop import now shows its errors; long messages stay on screen longer and can be clicked away.

## v17 – creator AI pack
- **Face retouch / beauty** (clip → Face retouch): finds and follows faces (bundled tiny face detector + 68-point landmarks, works offline), then smooths skin, brightens and evens skin tone on faces only – eyes and lips stay sharp. Natural / Glow / Smooth presets, per-person choice.
- **Face-following stickers** (Stickers → Face stickers): deal-with-it glasses, heart/fire eyes, tears, crown, halo, horns, cap, moustache, clown nose, blush, emoji faces – stay on the face as it moves, tilts and changes size.
- **Speaker detection** (Tools → Speakers): tells voices apart by pitch + timbre; rename speakers; captions can use a colour per speaker; multicam can cut to whoever is talking.
- **Dub into English** (Tools): Whisper translates the speech, an English AI voice (one per speaker) reads each sentence at the moment it was said – sped up to 1.35× when needed with pitch kept (WSOLA) – and the original is turned down.
- **Animated travel map** (Tools): route drawing itself with car/bike/bus/train/plane/walk, stops popping in, distance counter; 580 places offline (incl. every Bihar district town) + any town or village via online OpenStreetMap search (remembered for offline use), or "Name, lat, lon"; light/dark/paper themes; Natural Earth outlines, no internet needed.
- **Auto chapters** (Tools): from topic changes in what you say (plus pauses and cuts), named from each part's keywords; becomes markers and the Export → YouTube chapters list.
- **Title, description & hashtags** (Tools): offline keyword ideas in Hinglish, or better ones with your own Gemini (free tier) / Claude key.
- **Photo enhance & upscale** (Tools, or clip → Photo enhance): auto light & colour, low-light lift, grain removal, sharpening, 2×/4× enlarging, optional AI 2× upscaler (Swin2SR) for small photos.

## v17.1 – travel map on a real map
- **Real map styles**: Street (OpenStreetMap), Clean (CARTO Voyager), Satellite (Esri imagery + place names), Dark (CARTO), Simple (offline outline). Web-Mercator tiles at a zoom that keeps labels readable in the final video; all tiles are downloaded before export; missing tiles fall back to a lower zoom, then to the offline outline map. Required map credits are drawn in the corner. If OpenStreetMap refuses tiles (e.g. a page opened from disk) Street switches to Clean.
- Navigation-style route (white casing), map pins for stops, labels that avoid the title card, vehicle on a white disc.
- **Any place**: 580 built-in places + OpenStreetMap search for any town or village (remembered offline).

## v18 – creative pro tools
- **Text behind you** (clip → You: text behind & effects): AI cut-out of the person on a layer above a giant title; 4 styles.
- **Person effects**: glow outline (any colour), echo trail (ghost copies), 2–3 clones of you.
- **Fill-in video templates** (Templates tab): Beat drop, Travel diary, Day in my life, Before/after, Squad montage, Festival vibes – your clips (best moment of each) cut on the beat of your song or a generated drum beat, with transitions, looks and text.
- **Photo slideshow**: beat-synced, Ken Burns zoom/pan, Smooth / Punchy / Memories styles, title.
- **Studio voice**: bundled RNNoise (AI noise suppression, offline, 112 KB) + broadcast chain (HPF, de-boom, presence, air, compression, level match); Natural/Warm/Bright/Podcast. Test: noise in pauses −32 → −58 dB.
- **Cartoon / pencil sketch / comic** looks (live, video and photo).
- **Sky replacement**: sky mask (bright, smooth, connected to the top, grown to edges, temporally smoothed) + 7 generated skies with light matching. Test: 97.5 % pixel accuracy, 0.5 % false sky.
- **Object eraser** for photos: brush + multi-scale PatchMatch fill (no download).
- **Tap to cut out anything** (SlimSAM, on-device): sticker / blur / erase / keep only it; video uses the current frame.
- **3D photo zoom**: Depth Anything depth map → Otsu near/far split → filled background plate + near layers with parallax; zoom in/out, slide, orbit.
- **Script to video**: AI-written or pasted script → scenes with keywords → TTS voice-over → Pexels/Pixabay clips (or colour backgrounds) → captions.

## v19 – auto-editor pack
- **Music maker** (Tools tab, and top of the Audio tab): original, copyright-free background music made in the browser – 8 moods (Vlog, Chill, Lo-fi, Hype, Cinematic, Sad, Desi with dholak + sitar, Festive), any length or exactly the video's length, "Another version" for a new tune. Goes on the Music track, turned down under talking.
- **Auto punch-in zooms**: zooms on the face at the start of each phrase and on loud moments; Subtle / Punchy / Crazy.
- **Auto sound effects**: whoosh on every cut, and pops/dings/cash/boom on words like "wow", "paisa", "finally" (from your captions).
- **Trending caption styles**: 🔥 Big bounce, 💚 Keyword colour, 🟪 Highlight box, 😂 Emoji pop (one keyword per line picked automatically, with a matching emoji).
- **Auto b-roll** (Tools tab): reads your captions, finds lines that name something you can film (places from the 580-place list, Hinglish words like khana/pahad/bazaar translated to English, common English nouns), searches Pexels/Pixabay and lays 2–3 s clips over your talking on V2/V3, full screen or small corner; the opening stays on your face. Test (mocked stock): "Goa", "mountains", "market" picked from 6 lines; "subscribe kar dena guys" correctly skipped.
- **Object through a whole video** (video clip → ✂️ Tap to cut out anything): tap it once, then **Blur it in the whole clip**, **Pixelate it**, or **Cut it out** (its own transparent layer). The tap is tracked forwards and backwards from the frame you tapped. Test: a moving face (345–626 px travel) tracked within ~20 px on most frames over 6 s; cut-out follows it.

## v20 – post-ready pack
- **✅ Ready to post?** (Tools tab): scores the video out of 100 like a Shorts/Reels coach – speech in the first second, hook text, captions, long pauses, something changing on screen every 6 s (12 s for 16:9), length, text under the app buttons, black gaps, background music, loudness (−14 LUFS) – with a one-tap fix for most, and **Fix all**. Test: a raw 27 s talking clip went 45 → 100 after Fix all.
- **🔁 Bad-take remover**: finds lines you said again soon after (false starts and repeated sentences) from your captions, shows ✗ bad / ✓ kept, and ripple-cuts the bad tries across every track so captions stay in sync. Test: both planted retakes found, the later legit repeat left alone, every caption still on its exact words afterwards.
- **🪝 Hook lines**: 3 opening lines from what you say (offline, or written by Gemini/Claude with your key), or your own; the pick goes on the first 2.6 s in big Impact text with a highlighted keyword and a whoosh.
- **💬 Chat story**: type “Name: message” lines (Me: for your side) → messages pop in one by one with typing dots, message/sent sounds and optional lo-fi music; Green / Blue / Dark looks; group chats show names.
- **🗨 Reply to a comment**: “Reply to @name’s comment” bubble (Light / Dark / Glass) at the playhead with a pop.
- **🎨 Colour match – all clips**: “Make all other clips match this one” (gentle, camera-level correction). Test: a blue-tinted copy of a photo went from mean RGB 139/154/55 to 167/164/24 vs the original 168/164/17.
- **Progress bar** sticker: top or bottom, Thin bar / Rounded (with a dot) / Chapters (split at your markers).

## v21 – your editor, your way (UI customisation + redesign)
- **⚙️ Settings** (header gear; ⋯ menu on phones), saved in this browser:
  - **Themes:** Aurora, Midnight (navy), Pure black (OLED), Light, Warm paper – or follow the device's light/dark setting.
  - **7 accent colours** (violet, blue, teal, green, orange, pink, red) recolour buttons, tabs, sliders, playhead and highlights.
  - **Text & button size** (Small → Extra large) for panels, timeline toolbar and windows; animations on/off.
  - **Track height** (4 sizes) and **timeline height** – or drag the timeline's top edge.
  - **Tools:** show/hide the grey explanations, open every tool (classic list), choose which tools appear.
- **Tools tab:** fold-up cards with a one-line description, **search** (English + Hinglish words like “gaana”), category filters (Fixes, AI, Audio, Create, Publish), **★ pin** favourites to the top. A tool keeps its results and typed text while you switch filters.
- **Inspector:** click any section heading to fold it (remembered), plus **Fold all / Open all**.
- **Timeline:** drag-to-resize, bigger tracks, zoom −/+ buttons, and per-track **👁 hide** (left out of preview and export), **🔇 mute** (silent in preview and export) and **🔒 lock** (no accidental moves or drops). On phones: tap a track's icon for the same menu.
- **Phones:** header with a ⋯ menu (Settings, light/dark, tour, new project) so nothing is cut off; icon-only timeline toolbar; narrow track headers so clips get the width; taller default timeline that shows all six tracks.

### v21.1 – roomier tools
- **Tools tab is a grid of big tiles** (icon, name, two-line description), grouped by category with pins on top – all tools visible at a glance.
- **A tool opens in a big panel** beside the tiles that runs the full screen height (about twice the old width, larger text and buttons). Click another tile to switch – each tool keeps its results and typed text. ← / ✕ / Esc closes it. On phones it opens full screen.
- **Tall side panels** (new default on computers): Tools and the Inspector use the full height, the timeline sits under the preview. Turn off in ⚙️ Settings → Layout.
- **Drag the side panel's right edge** to make it wider.
- The old fold-up list is still there: ⚙️ Settings → Tools → Open every tool.

