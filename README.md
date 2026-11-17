# ClipForge – browser video editor for Shorts, Reels & YouTube

Runs 100% in the browser (no server, no upload, no cost).

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
