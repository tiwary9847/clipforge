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
npm run build    # dist/ = the website (loads in parts); dist-single/index.html = one self-contained file (also copied to dist/clipforge.html)
```

Requires Node 18+. Best in Chrome or Edge (desktop or Android); Safari and Firefox work with a few features disabled (the app tells you which).

## Deploy

- **GitHub Pages (Actions):** push to `main` – `.github/workflows/deploy.yml` builds and publishes. Set *Settings → Pages → Source* to **GitHub Actions**.
- **GitHub Pages (branch):** the ready-built site is on the `gh-pages` branch – set *Source* to **Deploy from a branch → gh-pages / root**.
- **Anywhere else:** upload the contents of `dist/` to any static host (Netlify, Cloudflare Pages, Vercel…).

The app is an installable PWA (add to home screen) and works offline after the first visit.

## Tech

React 18 + TypeScript + Vite (code-split site build + single-file build) · Canvas 2D compositor · Web Audio · [mediabunny](https://github.com/Vanilagy/mediabunny) for decoding/encoding (WebCodecs) · transformers.js (Whisper, MODNet, TTS) loaded on demand · ffmpeg.wasm (HEVC converter, on demand) · IndexedDB autosave.

## Licences of optional AI models

Downloaded only when you use the feature: Whisper (MIT), MODNet (Apache-2.0), Kokoro voices (Apache-2.0). The HEVC converter's ffmpeg core is GPL-2.0-or-later (separate program, source at github.com/ffmpegwasm/ffmpeg.wasm). MMS voices (CC BY-NC) were removed in v27.

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

## v22 – the guide inside the app
- **📖 Guide window**: press **?** in the header, **F1**, or on phones ⋯ → Guide. The whole user guide (18 chapters, 67 sections, 34 screenshots) with a chapter list that follows where you are, **search** with highlighted matches, and **⬇ PDF** for the printable copy. Follows your theme and text size; full screen on phones.
- **📖 How to use** button in every tool's panel jumps straight to that tool's section.
- Works offline: the text is built into the app; pictures and the PDF are cached after the first view. Opened as a single `clipforge.html` file, pictures and the PDF load from the website when online and are simply left out offline.
- Guide source now lives in the repo: `docs/guide/guide.html` (+ `img/`). After editing it run `python3 docs/guide/render.py` (PDF) and `python3 scripts/build-guide.py` (in-app copy: `src/guide/guide-body.html`, `public/guide/*.webp`, `public/ClipForge-User-Guide.pdf`).
- Screenshots retaken with the new UI; new sections for AI voice-over, Settings and the tool tiles.

## v23 – more music
- **🎧 Free music library** (Audio tab and Tools): searches openly licensed music and sound effects on Openverse (Jamendo, Freesound, Wikimedia Commons…) – no key, 16 mood chips, length filter, ▶ preview, + Add (under the whole video, ducked under talking, trimmed with a fade) or At ▸ playhead. Only **CC0, Public Domain Mark and CC BY** are requested: under CC 4.0 music synced to video is an adaptation, so ND and SA licences (and NC, for monetised videos) are left out. CC BY credit lines are kept in the project and appended to the generated description; removed tracks drop their credit. If a source refuses app downloads, a Download / Copy-credit fallback appears.
- **Music maker: 17 moods** (was 8) – new Romantic (bansuri flute), Travel and Acoustic (strummed guitar), Shehnai wedding, Devotional (tanpura drone + tabla), EDM party (four-on-the-floor + synth arps), Motivational, Suspense, Funny (marimba).
- Not tested against the live Openverse API or real Jamendo/Freesound downloads (blocked in the build environment); tested with mocked responses in Openverse's format.

## v24 – weak spots fixed
- **60 fps export.** Export → *Smoothness*: **Same as my video** (default – reads each clip's real frame rate and snaps to 24/25/30/50/60), 30, 60 or 24 fps. A 60 fps phone clip now exports as true 60 fps (checked: 1080 distinct frames for 18 s). Applies to fast export and parts; real-time recording stays at 30.
- **HEVC / “High Efficiency” videos convert inside the app.** When the browser can't play a clip (iPhone/Samsung HEVC or another codec) a *Convert this video?* box appears: ⚡ Quick 720p or 💎 Full quality (up to 1080p) → H.264/AAC MP4, added to your media (and to the timeline if it's empty). Uses ffmpeg's WebAssembly build in a worker, reading the file straight from disk (nothing uploaded). The converter (~32 MB, 10–30 MB to download) is fetched only the first time and then cached; from the single file it comes from the GitHub Pages site. Measured on a 2-core machine: a 20 s 1080p clip took 33 s (Quick) / 87 s (Full).
- **Faster first load.** The website now loads in parts: the editor starts with ~470 KB (gzip) of script instead of 2 MB; face tracking, noise removal, fonts, map outlines and the guide text load when first used. The service worker then stores every part in the background, so the whole editor still works offline after the first visit. `clipforge.html` (single file, ~4.7 MB) is still built for fully offline use and is offered on the site at `/clipforge.html`.

### v24.1 – performance pass
Scripted performance test of start-up, playback, 600-clip timelines, 27 tools, a 10-minute 1080p vlog and 11 exports on a 2-core machine with no GPU. Fixes:
- **Audio mixer** joins each clip's decoded sound into one buffer instead of one audio node per ~20 ms piece: loudness check on 10 min 74 s → 12 s, post-check 70 s → 16 s, 8.4-min 1080p export 314 s → 251 s, and no more tiny clicks on sped-up clips.
- **Music maker** builds tracks over 150 s from a ~75 s render with its middle 16 bars repeated (intro and ending kept): 10-min track ~290 s → 35 s.
- **Face tracking** times one frame first and samples 3–5 fps instead of 10 on slow devices: 74 s → 31 s for a 6 s 1080p clip without a GPU.
No memory growth over 8 consecutive exports (9 MB after GC each time).

## v25 – beginner-friendly
Reviewed as a first-time creator on a phone, then fixed:
- **Phone first screen** says “Tap to add videos, photos or music” (no “drop” on touch screens); the empty timeline is hidden until something is added, so the welcome screen gets the whole screen.
- **Next: row** under the preview once a video is in: ✨ Auto-edit · 💬 Add captions · 🎵 Add music · 🔤 Add text · ✅ Check & fix · ⬆ Save video (✓ when captions/music are added; × to hide, back in Settings → Look).
- **Simple Save**: Export opens with format, quality, length, a one-line summary and one big **Save video** button; GIF/sound, part of the video, Fast vs **Safe mode** (was “real-time recording”), smoothness and chapters are under **More options**. Technical words (H.264, frame-by-frame, codecs) removed.
- **Language: English / Hinglish / हिन्दी** (first screen and Settings → Look): top and bottom bars, tabs, welcome, Next row, Save, tool names and one-liners, inspector section titles, Media panel and track names. Tool settings inside each tool stay English for now. `src/i18n.ts` (`t()`, `toolText()`, `useT()`), falls back to English.
- **No duplicates**: the format is picked on the welcome cards (top menu appears once a clip is added); the welcome Auto-edit card became **Script to video** (Auto-edit stays in the top bar).
- Fixes: timeline toolbar no longer overlaps the right panel on laptops; video length badge readable in light theme.

## v26 – AI pack
- **🤖 AI assistant** (Next row → Ask AI, or Tools): type or speak (Web Speech, en-IN) a request in English/Hinglish → a plan of existing tools in a fixed working order (format, silences, keep best N s, captions, retakes, blur, zooms, B-roll, SFX, music + mood, hook, loudness, check) → untick → run with per-step results → **Undo everything** (one step, restores the exact project). Offline rule planner understands common Hinglish/English; with a Gemini/Claude key, `aiPlan` sends the request + a one-line project summary and validates/sorts the returned steps. New headless `autoCaptions()` (captionsAuto.ts) and `keepBest(N)` (liveliest window from the mix). Measured: 10-min 1080p → 30 s captioned reel with zooms, SFX, music in 37 s on a 2-core test machine.
- **📈 Retention coach** (Tools): pauses (≥1.2 s), same shot (6 s Shorts / 12 s long; counts cuts, overlays, zoom keyframes), flat delivery (8 s loudness SD < 3.2 dB), slow talk (captions, < 1.6 words/s), slow start, missing hook, Shorts over 60 s; optional AI read of captions for boring/repeated parts. Estimated retention curve (labelled as an estimate) + score; one-tap Cut / Zoom (a punch-in every 5–8 s over long stretches) / 1.25× (ripples everything after) / B-roll / Hook; “Fix the safe ones”. 0.4 s for 27 s, 16 s for 10 min.
- **🙈 Blur strangers** (Tools): tracks faces (on device), lists people with face thumbnails and screen share, keeps the main person, blurs or pixelates the rest; follows faces, applies under captions, kept in exports (`Clip.privacy`, engine `applyFaceBlur`). Measured on a 2-person clip: kept face sharpness 411 → 411, other face 403 → 1.
- **Fix: Gemini model.** `gemini-2.0-flash` was shut down by Google on 1 June 2026, breaking every Gemini feature; `askAI` now uses the auto-updating `gemini-flash-latest` alias with `gemini-3.5-flash` / `gemini-3.1-flash-lite` fallbacks on 404.

### v26.1 – select many clips
Timeline bar: **✓ Select** mode (tap clips to add/remove – works on phones), **All / None** (skips locked tracks), an “N selected” chip; click a track name (phone: track menu → Select all clips here) to select that track; deleting several shows “Deleted N clips – Undo to bring them back”.

## v27 – Free / Pro, payments, phone app
- **Free / Pro** (`src/plan.ts`): free has everything except Pro, no ads, and a small “Made with ClipForge” mark (engine `drawMark`, bottom-right above the Shorts/Reels buttons, in preview and exports). **Pro** (₹99 / 30 days, ₹699 / 12 months, ₹1,999 lifetime; passes don't auto-renew): no mark, built-in AI without a key (300 requests/month through the server), 4K export, all formats at once, brand kit. **Go Pro** in the top bar and ⋯ menu; Pro features show a locked card.
- **Licences**: `payload.signature` signed with ECDSA P-256; the app verifies with the embedded public key (offline, can't be edited). The private key is **not** in the repo (owner keeps it). `server/make-licence.mjs` makes owner/gift licences. Licence code can be copied to another device; restore with email + payment ID.
- **Payment server** (`server/worker.js`, Cloudflare Worker + KV): Razorpay orders/verify (plan and amount taken from the order, not the browser), webhook backup, restore, Google Play purchase check (Digital Goods API in the TWA; passes consumed, lifetime acknowledged), built-in AI proxy with a monthly limit. `node server/test.mjs <key> <pub>`: 23 checks incl. forged signatures, relabelled orders, wrong-email restores, fake webhooks, edited licences, AI limit.
- **Pro screen** (`components/ProDialog.tsx`): plans, Razorpay Checkout (UPI/card) on the web, Play Billing in the Android app, licence code, restore. Shows “Pro sales open soon” until `CONFIG.server` / `CONFIG.razorpayKey` are set.
- **Phone app**: Install button (welcome screen + ⋯ menu; iPhone instructions), **Share → ClipForge** from Gallery/WhatsApp (manifest `share_target` + service worker), app-icon shortcuts (New Short, New YouTube, Ask AI). Android Trusted Web Activity config `android/twa-manifest.json` (+ Play Billing) and a manual GitHub workflow; PWABuilder route in MONEY-SETUP.md.
- **Licence clean-up for selling**: removed the MMS voices (CC BY-NC). ffmpeg core (HEVC converter) is GPL-2.0-or-later and runs as a separate program in a worker; its source is at github.com/ffmpegwasm/ffmpeg.wasm.
- The “Deploy to GitHub Pages” workflow now runs only by hand: GitHub Actions on the account is locked for billing, so it failed on every push. The site publishes from the gh-pages branch as before.
- **Setup for the owner:** see **MONEY-SETUP.md** (Razorpay, Cloudflare, Gemini, PWABuilder/Play Console, policy pages in `docs/legal-templates/`).


## v28 – full payment process + every Pro feature
- **Buying:** coupon codes (price shown before paying), renew or upgrade early (the new pass starts when the current one ends, no days lost), a reminder bar 5 days before a pass ends with **Renew**, receipts after every payment (kept on the device, printable / save as PDF), plain-language messages when a payment fails (no balance, OTP not finished, bank declined, timeout), AI usage meter and a **₹49 top-up for 100 more AI requests**.
- **Refunds:** Razorpay `refund.processed` webhook marks the payment; the app asks `/check` once a day and switches Pro off for a refunded licence (offline keeps Pro). Refunded payments can't be restored or use AI.
- **Seller dashboard** (`public/admin.html` → `/clipforge/admin.html`): sales this month / all time, Pro users now, refunds, search buyers, switch off a licence, coupons (% off, max uses, last date, plans), gift licences. Protected by the `ADMIN_TOKEN` server secret; the address and password are typed in, nothing secret is in the repo.
- **Server** (`server/worker.js`): `/price`, `/check`, `/usage`, `/tts`, `/admin/*`; licences now carry the plan and payment ID; `node server/test.mjs` – **49 checks**.
- **Pro features that were promised and are now built:**
  - **Hindi AI voice-over** – 6 natural Hindi/Hinglish voices (Gemini TTS through the server, newest model with fallback); in AI voice, Script to video and Dub. Counts as 5 AI requests.
  - **One-tap upload kit** (Tools → 🚀) – a 9:16 file for Shorts and Reels and a 16:9 file for YouTube, each with its own title, description, hashtags (Shorts get `#shorts`, Reels a full Instagram caption, YouTube chapters for long videos) and a thumbnail/cover sized for that platform (1080×1920 / 1280×720), plus an `upload-kit.txt`. AI-written when Pro AI or a key is available, offline otherwise.
  - **7 premium caption styles** – Neon, Gold karaoke, Comic, Fire gradient, Desi bold, Cinematic, Rainbow.
  - **Premium template packs** – Wedding (title, save the date, thank-you), Festival (Diwali, Holi, any festival), Travel (trip title, day labels, trip cost), Devotional (aarti title, bhajan lyrics, blessing ending), with Hindi fonts.
- Browser test with mocked Razorpay/server: 34 checks (coupon, failed and successful payment, receipt, top-up, expiry banner, renewal, refund switch-off, all four packs, Neon, Hindi voice, upload kit files, dashboard).

### Sound search fixes (Nov 2026)
- Openverse: 20 results per page (more needs an account → 401); search Freesound sounds by source (most have no category); play/add Freesound's open MP3 previews, never the login-only download link.
- Freesound's file server lets browsers play previews but not download them into a web app (no CORS header). `+ Add` now goes through the server's `GET /media?u=` relay when that happens – it only fetches audio from Freesound previews, Jamendo and Wikimedia (https, ≤25 MB, audio types). Until the server is deployed, the app offers “⬇ Save the sound” + Import instead.

## v29 – Pro Autopilot (automate everything)
- **🚀 Autopilot** (top bar, Tools → Autopilot, ⋯ menu; Pro): one tap from a raw video to finished files. Runs, in order: cut pauses → auto captions → remove bad takes → retention fixes → hook text → punch-in zooms → sound effects → original music → logo → ending call-to-action → loudness (−14 LUFS), then a ready-to-post score. Every step reports ✅ done / ➖ skipped (with the reason) / ⚠️ failed, one failing step never stops the rest, and **Undo Autopilot** restores the timeline exactly.
- **Make the files**: Shorts / YouTube / Reels exports, each with its own title, description, hashtags and thumbnail/cover, in **one zip** (fflate, videos stored uncompressed). Titles come from the captions, the built-in/your AI, or the recipe's **About this video** when there's no speech (e.g. a property drone video).
- **Batch**: queue many videos; each gets a fresh project, the recipe, its own zip, and optionally a YouTube post. One Google sign-in is reused for about an hour.
- **Auto-post to YouTube**: right away (private/unlisted/public) or scheduled (tonight 7 pm, tomorrow 9 am / 7 pm – uploaded private with `publishAt`), with tags and, for 16:9 videos, the custom thumbnail (needs a verified channel). Uses the existing OAuth client-ID setup.
- **Recipes**: Talking Short, Property / business promo, Vlog, Funny / meme, Bhajan / devotional – or save your own (steps, format, caption style, music mood, zooms, sound effects, About, ending text, outputs, YouTube). Saved on the device.
- **Fixes found while building it**: the Retention coach could merge nearby pauses into one huge "pause" and cut real talking (now pauses are never merged, it listens to the voice only – not music/effects – stops at the end of the video, and refuses any single pause cut over 6 s); the ending text no longer sits on the caption lane.
- Tests: Autopilot single run, undo, zip contents, batch of 2 with scheduled YouTube posts (mocked Google), recipe saving – 6/6.

### Export quality (Nov 2026)
- Bitrate now follows YouTube's upload recommendations instead of a fixed "high" preset: 1080p 30 fps ≈ 8 Mbps, 1080p 60 fps ≈ 12 Mbps, 4K 30/60 ≈ 32/48 Mbps (`qualityBitrate` in `fastExport.ts`), keyframe every 2 s. Measured on a real 60 fps phone video: SSIM 0.932 → 0.954 against a Lanczos reference (6 → 12 Mbps).
- Frames are drawn with `imageSmoothingQuality = 'high'` (sharper when small videos are enlarged, no shimmer when 4K is shrunk).
- Autopilot uses gentle zooms when the source is much smaller than the frame (e.g. 480 px wide), and the zip stores the shared Shorts/Reels video once (`…-shorts-and-reels.mp4`).

## v30 – Text upgrade
- **40 one-tap text styles** in 9 groups (Trending, Captions, Titles, Neon & glow, Business & sale, Fun, Elegant, Gaming, हिन्दी) – `src/textstyles.ts`. Tiles are real previews drawn by the video engine (`engine.textPreview`), so they look exactly like the result.
- **20 display fonts** bundled from @fontsource (SIL Open Font License): Anton, Bebas Neue, Montserrat, Poppins, Oswald, Archivo Black, Kanit, Teko, Russo One, Bungee, Bangers, Luckiest Guy, Fredoka, Righteous, Permanent Marker, Caveat, Pacifico, Lobster, Dancing Script, Playfair Display (Latin subset, loaded only when used). Font menu grouped: Popular / Fun & handwritten / हिन्दी / Basic.
- **Text effects**: letter spacing, line spacing, neon glow (colour + strength), double outline, custom shadow (colour, softness, offset – hard 3D shadows), box roundness and padding, “use this style for all captions/text”.
- **Animations**: exit animations (fade, pop, slide up, zoom, blur, drop) and loops (pulse, heartbeat, float, swing, shake, jelly, blink) on top of the build-in animations.
- All new properties are optional, so old projects look exactly the same.

## v31 – GIFs tab
- New **GIFs** tab (next to Memes): GIFs / see-through **Stickers** switch, search as you type, quick chips (Trending, Bollywood, LOL, Wow, Clap, Thank you, Cricket, Subscribe, Arrow, Like…), **Recent**, “Show more”. Tap a tile → it is placed at the playhead on a free overlay layer, selected, looping (short GIFs repeat to at least 3 s). GIFs stay animated in the preview, in exports and after reload. `src/gifs.ts`, `src/components/GifPanel.tsx`.
- Results come from the app server (`GET /gifs`, KLIPY with `KLIPY_KEY`, else GIPHY with `GIPHY_KEY`; key never reaches the browser, results cached 10 min). Files whose host blocks browser downloads go through `GET /media` (now allows `static.klipy.com` and GIPHY media hosts, image/video types only).
- Before the server has a key: “Add a GIF from your phone/computer”, or each user can paste their own free GIPHY key. Browsers without animated-picture support (older Safari) get the MP4 version of normal GIFs.
- Memes → Online → **GIFs →** now opens this tab.

## v32 – Three new tools (Tools tab)
- **💬 Comment preview** – predicts the comments a reel will get *before* posting, as a comment section (username, comment, likes), each tied to the exact second with a one-tap fix (cut, zoom, speed up, captions, volume, hook text, “Follow for part 2”, add text). On the device it is built from measured signals (retention check, ready-to-post checks, mute check, cut-off ending) and works offline for everyone; with AI (Pro or the user's own Gemini/Claude key) the AI also watches 5 small frames and reads the captions for real-sounding Hinglish comments (questions like “location kaha hai?”, doubts, jokes, praise). `src/comments.ts`.
- **🔇 Mute check** – how the reel reads with the sound off: a strip of the whole video (green = talking with words on screen, red = talking with nothing on screen, grey = quiet), the % a muted viewer can follow, each lost part with ▶ (plays it muted) and “Add text” (adds a text there and focuses it for typing), “Add captions for everything”, a “no words in the first 2 s” warning, and **Watch muted** (`engine.previewMute`). Re-checks itself after a fix. `src/mutecheck.ts`.
- **👻 Ghost re-take** – fix a mistake mid-video without re-shooting: from the playhead, the clip's own frame shows see-through over the live camera with a live **Match %** and the last words said as a cue; 3-2-1, record, review, then **Replace the rest of this clip** or **Insert, keep the rest**. The new take is auto-aligned to its best-matching frame in the first 1.5 s, joined with tiny audio fades, later clips shift, re-said captions are dropped; one undo step. Front/back camera. `src/ghost.ts`, `src/components/NovelPanels.tsx`.
- Built-in AI (`POST /ai`) and `askAI` accept up to 6 small JPEG frames (`images`); a request with frames counts as 2.

## v33 – Basic / Advanced + first-reel guide
- **Basic / Advanced** switch at the top of the side panel (and the phone's Add sheet), also in ⚙️ Settings → Layout → Simple mode. Basic shows 7 tabs (Media, Memes, GIFs, Text, Audio, Captions, Tools), 10 tools (Autopilot, Ready to post, Comment preview, Mute check, Ghost re-take, Music maker, Free music library, Auto punch-in, Thumbnail, Titles) and only the everyday edit sections (Timing, Text, Text animation, Sticker, Transform, Crop, Speed, Audio, Studio voice, Filters & colour, Transitions). “＋ N more tools” / “＋ More options” cards switch to Advanced; tool search always finds every tool; asking for an Advanced-only tab (e.g. Templates from the start screen) switches and says so. Lists live in `settings.ts` (`BASIC_TABS`, `BASIC_TOOLS`, `BASIC_SECS`); sections are filtered centrally in `Section`.
- New visitors start in Basic; anyone who used the app before (any saved `clipforge-*` key) keeps Advanced – decided once and saved.
- The first-run tour is now **“Make your first reel in 60 seconds”**: 1 add your video (moves on by itself once a video is on the timeline) → 2 one-tap Auto-edit → 3 change anything (double-click text) → 4 export (+ Comment preview tip). The guide no longer blocks the app – each step can be done for real while it is open.

