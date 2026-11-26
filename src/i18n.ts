// Interface language: English, Hinglish (Hindi in Roman letters) or Hindi (Devanagari).
// Strings are looked up by their English text; anything not translated yet stays in English.
import { getSettings, useSettings } from './settings'

export type Lang = 'en' | 'hinglish' | 'hi'
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'hinglish', name: 'Hinglish' },
  { id: 'hi', name: 'हिन्दी' },
]

// English → [Hinglish, Hindi]
const D: Record<string, [string, string]> = {
  // top bar, bottom bar
  'Auto-edit': ['Auto-edit', 'ऑटो-एडिट'],
  New: ['Naya', 'नया'],
  Export: ['Save', 'सेव'],
  'Save video': ['Video save karo', 'वीडियो सेव करें'],
  Add: ['Jodo', 'जोड़ें'],
  Edit: ['Edit', 'एडिट'],
  Project: ['Project', 'प्रोजेक्ट'],
  Play: ['Chalao', 'चलाएँ'],
  Pause: ['Roko', 'रोकें'],
  Close: ['Band karo', 'बंद करें'],
  Settings: ['Settings', 'सेटिंग्स'],
  'Dark mode': ['Dark mode', 'डार्क मोड'],
  'Light mode': ['Light mode', 'लाइट मोड'],
  Guide: ['Guide', 'गाइड'],
  'Quick tour': ['Chhota tour', 'छोटा टूर'],
  'New project': ['Naya project', 'नया प्रोजेक्ट'],
  'Saving…': ['Save ho raha hai…', 'सेव हो रहा है…'],
  '✓ Saved': ['✓ Saved', '✓ सेव हो गया'],
  Language: ['Bhasha', 'भाषा'],
  // left panel tabs
  Media: ['Media', 'मीडिया'],
  Memes: ['Memes', 'मीम्स'],
  Templates: ['Templates', 'टेम्पलेट'],
  Text: ['Text', 'टेक्स्ट'],
  Stickers: ['Stickers', 'स्टिकर'],
  Audio: ['Audio', 'ऑडियो'],
  Captions: ['Captions', 'कैप्शन'],
  Tools: ['Tools', 'टूल्स'],
  // welcome
  'Create something': ['Banao kuch', 'बनाइए कुछ'],
  'scroll-stopping': ['scroll-rokne wala', 'स्क्रॉल रोकने वाला'],
  'Edit Shorts, Reels and YouTube videos with memes, captions and effects – right on your device.': [
    'Shorts, Reels aur YouTube videos edit karo – memes, captions aur effects ke saath, seedha apne phone ya computer par.',
    'Shorts, Reels और YouTube वीडियो एडिट करें – मीम्स, कैप्शन और इफ़ेक्ट्स के साथ, सीधे अपने डिवाइस पर।',
  ],
  'Tap to add videos, photos or music': ['Tap karke video, photo ya music jodo', 'टैप करके वीडियो, फ़ोटो या म्यूज़िक जोड़ें'],
  'Add videos, photos or music': ['Video, photo ya music jodo', 'वीडियो, फ़ोटो या म्यूज़िक जोड़ें'],
  'from your phone gallery · nothing is uploaded': ['phone gallery se · kuch upload nahi hota', 'फ़ोन गैलरी से · कुछ भी अपलोड नहीं होता'],
  'click to choose, or drop files here · nothing is uploaded': ['click karke chuno, ya files yahan daalo · kuch upload nahi hota', 'क्लिक करके चुनें, या फ़ाइलें यहाँ डालें · कुछ भी अपलोड नहीं होता'],
  Format: ['Format', 'फ़ॉर्मेट'],
  'Or start with': ['Ya shuru karo', 'या शुरू करें'],
  '· New here? Take the 30-second tour': ['· Naye ho? 30 second ka tour dekho', '· नए हैं? 30 सेकंड का टूर देखें'],
  '· New here? Make your first reel in 60 seconds': ['· Naye ho? 60 second mein pehla reel banao', '· नए हैं? 60 सेकंड में पहली रील बनाएँ'],
  'Shorts · Reels': ['Shorts · Reels', 'Shorts · Reels'],
  '9:16 vertical': ['9:16 khada', '9:16 खड़ा'],
  '16:9 widescreen': ['16:9 leta hua', '16:9 चौड़ा'],
  '4:5 portrait': ['4:5 portrait', '4:5 पोर्ट्रेट'],
  '1:1 feed': ['1:1 feed', '1:1 फ़ीड'],
  'Insta post': ['Insta post', 'Insta पोस्ट'],
  Square: ['Square', 'चौकोर'],
  Record: ['Record', 'रिकॉर्ड'],
  'Screen, webcam or both': ['Screen, camera ya dono', 'स्क्रीन, कैमरा या दोनों'],
  'Ready-made layouts': ['Bane-banaye layout', 'बने-बनाए लेआउट'],
  'With sound, one tap': ['Awaaz ke saath, ek tap', 'आवाज़ के साथ, एक टैप'],
  'Script to video': ['Script se video', 'स्क्रिप्ट से वीडियो'],
  'Type a script – get a video': ['Script likho – video pao', 'स्क्रिप्ट लिखें – वीडियो पाएँ'],
  'Importing…': ['Aa raha hai…', 'आ रहा है…'],
  // next steps
  'Next:': ['Aage:', 'आगे:'],
  'Add captions': ['Captions lagao', 'कैप्शन लगाएँ'],
  'Add music': ['Music lagao', 'म्यूज़िक लगाएँ'],
  'Add text': ['Text likho', 'टेक्स्ट लिखें'],
  'Check & fix': ['Check karo', 'जाँच करें'],
  'Hide these tips': ['Ye tips chhupao', 'ये टिप्स छुपाएँ'],
  // export
  'Export video': ['Video save karo', 'वीडियो सेव करें'],
  Resolution: ['Quality', 'क्वालिटी'],
  Length: ['Lambai', 'लंबाई'],
  'More options': ['Aur options', 'और विकल्प'],
  'Fewer options': ['Kam options', 'कम विकल्प'],
  'Only part of the video': ['Video ka sirf ek hissa', 'वीडियो का सिर्फ़ एक हिस्सा'],
  'Fast (recommended)': ['Tez (best)', 'तेज़ (सबसे अच्छा)'],
  'Safe mode': ['Safe mode', 'सेफ़ मोड'],
  Smoothness: ['Smoothness', 'स्मूदनेस'],
  'Nothing is uploaded – everything is processed on your device.': ['Kuch upload nahi hota – sab aapke device par hi banta hai.', 'कुछ भी अपलोड नहीं होता – सब आपके डिवाइस पर ही बनता है।'],
  Download: ['Download', 'डाउनलोड'],
  Share: ['Share', 'शेयर'],
  Cancel: ['Cancel', 'रद्द करें'],
  // tools panel
  All: ['Sab', 'सब'],
  '★ Pinned': ['★ Pinned', '★ पिन किए'],
  '⚡ Quick fixes': ['⚡ Jaldi fix', '⚡ झटपट सुधार'],
  '🤖 AI magic': ['🤖 AI jaadu', '🤖 AI जादू'],
  '🎵 Audio': ['🎵 Audio', '🎵 ऑडियो'],
  '🎨 Create': ['🎨 Banao', '🎨 बनाएँ'],
  '📤 Publish': ['📤 Post karo', '📤 पोस्ट करें'],
  '⚡ Fixes': ['⚡ Fix', '⚡ सुधार'],
  '🤖 AI': ['🤖 AI', '🤖 AI'],
  'Search tools…': ['{n} tools mein dhoondho… (music, zoom, captions)', '{n} टूल्स में खोजें… (म्यूज़िक, ज़ूम, कैप्शन)'],
  'Timing': ['Time', 'समय'],
  'Transform': ['Position aur size', 'जगह और आकार'],
  'Crop': ['Crop', 'क्रॉप'],
  'Keyframes & motion': ['Keyframes aur motion', 'कीफ़्रेम और मोशन'],
  'Blend mode': ['Blend mode', 'ब्लेंड मोड'],
  'Canvas · platform': ['Canvas · platform', 'कैनवस · प्लेटफ़ॉर्म'],
  'Quick start': ['Jaldi shuru', 'जल्दी शुरुआत'],
  'Shortcuts': ['Shortcuts', 'शॉर्टकट'],
  'Sticker': ['Sticker', 'स्टिकर'],
  'Text animation': ['Text animation', 'टेक्स्ट एनिमेशन'],
  'Speed': ['Speed', 'स्पीड'],
  'Speed ramp': ['Speed ramp', 'स्पीड रैंप'],
  'Audio tools': ['Audio tools', 'ऑडियो टूल्स'],
  'Volume (all audio clips)': ['Volume (saare audio)', 'वॉल्यूम (सारे ऑडियो)'],
  'Voice effect': ['Awaaz effect', 'आवाज़ इफ़ेक्ट'],
  'Transitions': ['Transitions', 'ट्रांज़िशन'],
  'Filters & colour': ['Filters aur rang', 'फ़िल्टर और रंग'],
  'Colour grading': ['Colour grading', 'कलर ग्रेडिंग'],
  'Effects (looks)': ['Effects (looks)', 'इफ़ेक्ट्स (लुक)'],
  'Mask': ['Mask', 'मास्क'],
  'Face retouch': ['Chehra sudhaar', 'चेहरा सुधार'],
  'Green screen (chroma key)': ['Green screen', 'ग्रीन स्क्रीन'],
  'Stabilise · freeze · reverse': ['Stable · freeze · ulta', 'स्थिर · फ़्रीज़ · उल्टा'],
  'Motion tracking': ['Motion tracking', 'मोशन ट्रैकिंग'],
  'Equaliser & compressor': ['Equaliser aur compressor', 'इक्वलाइज़र और कंप्रेसर'],
  'Animation (meme FX)': ['Animation (meme FX)', 'एनिमेशन (मीम FX)'],
  'AI & pro tools': ['AI aur pro tools', 'AI और प्रो टूल्स'],
  'Adjustment layer': ['Adjustment layer', 'एडजस्टमेंट लेयर'],
  '＋ Import video, image or audio': ['＋ Video, photo ya audio jodo', '＋ वीडियो, फ़ोटो या ऑडियो जोड़ें'],
  '🎬 Free stock videos & photos': ['🎬 Free stock video aur photo', '🎬 फ़्री स्टॉक वीडियो और फ़ोटो'],
  'Files stay on your device – nothing is uploaded. Drop files anywhere, or drag a card onto the timeline. For memes, import short MP4/WebM reaction clips, PNG stickers and MP3 sounds.': ['Files aapke device par hi rehti hain – kuch upload nahi hota. Card ko timeline par kheencho, ya + dabao.', 'फ़ाइलें आपके डिवाइस पर ही रहती हैं – कुछ भी अपलोड नहीं होता। कार्ड को टाइमलाइन पर खींचें, या + दबाएँ।'],
  'No media yet': ['Abhi koi media nahi', 'अभी कोई मीडिया नहीं'],
  'Main': ['Main video', 'मुख्य वीडियो'],
  'Music': ['Music', 'म्यूज़िक'],
  'Layer 1': ['Layer 1', 'लेयर 1'],
  'Layer 2': ['Layer 2', 'लेयर 2'],
  'Layer 3': ['Layer 3', 'लेयर 3'],
  'AI assistant': ['AI assistant', 'AI असिस्टेंट'],
  'Ask AI': ['AI se bolo', 'AI से कहें'],
  'Make a plan': ['Plan banao', 'प्लान बनाएँ'],
  'Do it': ['Kar do', 'कर दो'],
  'Undo everything': ['Sab wapas karo', 'सब वापस करें'],
  'Ask for something else': ['Kuch aur bolo', 'कुछ और कहें'],
  'Tell me what to do… e.g. “30 second ki reel bana do, captions aur music ke saath”': ['Batao kya karna hai… jaise “30 second ki reel bana do, captions aur music ke saath”', 'बताइए क्या करना है… जैसे “30 सेकंड की रील बना दो, कैप्शन और म्यूज़िक के साथ”'],
  'Install ClipForge on this phone': ['ClipForge phone mein install karo', 'ClipForge फ़ोन में इंस्टॉल करें'],
  '– opens like an app, works offline': ['– app jaisa khulega, bina internet bhi chalega', '– ऐप जैसा खुलेगा, बिना इंटरनेट भी चलेगा'],
  'Edit by text': ['Text se edit', 'टेक्स्ट से एडिट'],
}

// tool tiles by id: [Hinglish title, Hinglish line, Hindi title, Hindi line]
const TOOLS: Record<string, [string, string, string, string]> = {
  assistant: ['AI assistant', 'Bolo kya chahiye – ye edit kar dega', 'AI असिस्टेंट', 'बताइए क्या चाहिए – यह एडिट कर देगा'],
  retention: ['Retention coach', 'Log kahan video chhod dete hain – aur ek tap fix', 'रिटेंशन कोच', 'लोग कहाँ वीडियो छोड़ते हैं – और एक टैप में सुधार'],
  blur: ['Anjaan chehre blur', 'Aas-paas ke logon ke chehre blur, aapka nahi', 'अनजान चेहरे ब्लर', 'आसपास के लोगों के चेहरे ब्लर, आपका नहीं'],
  ready: ['Post karne ko ready?', 'Video ko score karo, galtiyan ek tap mein theek', 'पोस्ट के लिए तैयार?', 'वीडियो को स्कोर करें, ग़लतियाँ एक टैप में ठीक'],
  badtakes: ['Galat take hatao', 'Dohraayi lines kaato, aakhri try rakho', 'ग़लत टेक हटाएँ', 'दोहराई लाइनें काटें, आख़िरी कोशिश रखें'],
  music: ['Music maker', 'Apna background music – koi copyright nahi', 'म्यूज़िक मेकर', 'अपना बैकग्राउंड म्यूज़िक – कोई कॉपीराइट नहीं'],
  musiclib: ['Free music library', 'Free gaane aur sound effects jo safe hain', 'फ़्री म्यूज़िक लाइब्रेरी', 'फ़्री गाने और साउंड इफ़ेक्ट जो सुरक्षित हैं'],
  zooms: ['Auto zoom', 'Khaas pal par chehre par zoom', 'ऑटो ज़ूम', 'ख़ास पल पर चेहरे पर ज़ूम'],
  sfx: ['Auto sound effects', 'Cut par whoosh, khaas shabdon par pop', 'ऑटो साउंड इफ़ेक्ट', 'कट पर व्हूश, ख़ास शब्दों पर पॉप'],
  broll: ['Auto B-roll', 'Aapki baat se milte stock clips', 'ऑटो B-roll', 'आपकी बात से मिलते स्टॉक क्लिप'],
  chat: ['Chat story', 'Message ek-ek karke aane wali chat', 'चैट स्टोरी', 'एक-एक करके आने वाले मैसेज'],
  reply: ['Comment ka jawab', '“@naam ko jawab” wala bubble', 'कमेंट का जवाब', '“@नाम को जवाब” वाला बबल'],
  script: ['Script se video', 'Script likho – awaaz, clips aur captions pao', 'स्क्रिप्ट से वीडियो', 'स्क्रिप्ट लिखें – आवाज़, क्लिप और कैप्शन पाएँ'],
  map: ['Travel map', 'Jagahon ke beech chalta hua rasta', 'ट्रैवल मैप', 'जगहों के बीच चलता हुआ रास्ता'],
  chapters: ['Auto chapters', 'Aapki baaton se YouTube chapters', 'ऑटो चैप्टर', 'आपकी बातों से YouTube चैप्टर'],
  titles: ['Title aur hashtags', 'Title, description aur hashtags likh kar milenge', 'टाइटल और हैशटैग', 'टाइटल, विवरण और हैशटैग लिखकर मिलेंगे'],
  enhance: ['Photo sudharo', 'Photo saaf aur HD karo', 'फ़ोटो सुधारें', 'फ़ोटो साफ़ और HD करें'],
  shorts: ['Lambi video → Shorts', 'Best pal dhoondh kar Shorts banao', 'लंबा वीडियो → Shorts', 'सबसे अच्छे पल ढूँढकर Shorts बनाएँ'],
  layouts: ['Split-screen', 'Do ya zyada video saath-saath', 'स्प्लिट-स्क्रीन', 'दो या ज़्यादा वीडियो साथ-साथ'],
  adjust: ['Adjustment layer', 'Neeche ki har cheez par filter', 'एडजस्टमेंट लेयर', 'नीचे की हर चीज़ पर फ़िल्टर'],
  wa: ['WhatsApp status', '30, 60 ya 90 second ke hisson mein baanto', 'WhatsApp स्टेटस', '30, 60 या 90 सेकंड के हिस्सों में बाँटें'],
  multicam: ['Multicam', 'Camera angle badlo', 'मल्टीकैम', 'कैमरा एंगल बदलें'],
  speakers: ['Kaun bol raha hai', 'Har insaan ke captions alag rang mein', 'कौन बोल रहा है', 'हर व्यक्ति के कैप्शन अलग रंग में'],
  dub: ['English mein dub', 'Hindi ko English awaaz mein badlo', 'अंग्रेज़ी में डब', 'हिंदी को अंग्रेज़ी आवाज़ में बदलें'],
  tts: ['AI awaaz', 'Likha hua bolkar sunao', 'AI आवाज़', 'लिखा हुआ बोलकर सुनाएँ'],
  loud: ['Awaaz theek karo', 'YouTube aur Instagram ke liye sahi volume', 'आवाज़ ठीक करें', 'YouTube और Instagram के लिए सही वॉल्यूम'],
  hooklines: ['Hook lines', 'AI shuruaat ki line likhega', 'हुक लाइनें', 'AI शुरुआत की लाइन लिखेगा'],
  hookfinder: ['Hook finder', 'Best pal ko shuru mein lagao', 'हुक फ़ाइंडर', 'सबसे अच्छे पल को शुरू में लगाएँ'],
  thumb: ['Thumbnail', 'Thumbnail maker aur teleprompter', 'थंबनेल', 'थंबनेल मेकर और टेलीप्रॉम्प्टर'],
  autopilot: ['Autopilot', 'Ek tap mein poora edit, files aur YouTube post', 'ऑटोपायलट', 'एक टैप में पूरा एडिट, फ़ाइलें और YouTube पोस्ट'],
  uploadkit: ['Upload kit ek tap mein', 'Shorts, YouTube aur Reels – title, hashtags aur thumbnail ke saath', 'एक टैप अपलोड किट', 'Shorts, YouTube और Reels – टाइटल, हैशटैग और थंबनेल के साथ'],
  brand: ['Brand kit', 'Logo, rang aur font ek tap mein', 'ब्रांड किट', 'लोगो, रंग और फ़ॉन्ट एक टैप में'],
  formats: ['Sab formats', '16:9, 9:16 aur 1:1 ek saath save', 'सभी फ़ॉर्मेट', '16:9, 9:16 और 1:1 एक साथ सेव'],
  versions: ['Purane version', 'Pehle wale version par wapas jao', 'पुराने वर्ज़न', 'पहले वाले वर्ज़न पर वापस जाएँ'],
  backup: ['Backup', 'Poora project file mein save ya load', 'बैकअप', 'पूरा प्रोजेक्ट फ़ाइल में सेव या लोड'],
}

export const lang = (): Lang => (getSettings().lang as Lang) || 'en'

/** Translates an English UI string into the chosen language (English when not translated). */
export function t(s: string): string {
  const l = lang()
  if (l === 'en') return s === 'Search tools…' ? 'Search {n} tools… (music, zoom, captions)' : s
  const e = D[s]
  return e ? e[l === 'hinglish' ? 0 : 1] : s
}

/** A tool tile's title and one-line description in the chosen language. */
export function toolText(id: string, title: string, desc: string): { title: string; desc: string } {
  const l = lang()
  const e = l === 'en' ? undefined : TOOLS[id]
  if (!e) return { title, desc }
  return l === 'hinglish' ? { title: e[0], desc: e[1] } : { title: e[2], desc: e[3] }
}

/** Re-renders the calling component when the language changes; returns t. */
export function useT() {
  useSettings((s) => s.lang)
  return t
}
