// Festival calendar, your own birthdays/anniversaries, a daily reel idea and a posting streak.
// Festival dates: Government of India 2027 holiday list (DoPT, 16 Jul 2026) and Drik Panchang.
// Moon-based dates (Eid, etc.) can move by a day.

export interface Occasion {
  id: string
  name: string
  hi?: string // Hindi / Hinglish greeting shown on the video
  emoji: string
  date: string // YYYY-MM-DD
  template: string // video template id
  texts?: string[] // replace the template's words, in order
  own?: boolean // added by you
}

const F = (id: string, name: string, date: string, emoji: string, template: string, texts?: string[]): Occasion => ({ id: `${id}-${date.slice(0, 4)}`, name, date, emoji, template, texts })

export const FESTIVALS: Occasion[] = [
  F('christmas', 'Christmas', '2026-12-25', '🎄', 'photozoom', ['Merry Christmas 🎄']),
  F('newyear', 'New Year', '2027-01-01', '🎆', 'lyrics', ['HELLO', '2027', 'NEW', 'YEAR', 'NEW', 'ME', '✨', '🎆']),
  F('lohri', 'Lohri', '2027-01-13', '🔥', 'festival', ['HAPPY LOHRI 🔥', 'लोहड़ी दी लख-लख वधाइयाँ']),
  F('sankranti', 'Makar Sankranti & Pongal', '2027-01-14', '🪁', 'festival', ['HAPPY SANKRANTI 🪁', 'मकर संक्रांति की शुभकामनाएँ']),
  F('republic', 'Republic Day', '2027-01-26', '🇮🇳', 'cinematic', ['H A P P Y   R E P U B L I C   D A Y 🇮🇳']),
  F('basant', 'Vasant Panchami', '2027-02-11', '🌼', 'photozoom', ['Happy Basant Panchami 🌼']),
  F('valentine', 'Valentine’s Day', '2027-02-14', '❤️', 'wedding', ['You ♥ Me', 'my favourite person']),
  F('shivratri', 'Maha Shivratri', '2027-03-06', '🔱', 'cinematic', ['H A R   H A R   M A H A D E V 🔱']),
  F('womensday', 'Women’s Day', '2027-03-08', '💐', 'photodump', ['for every woman who inspires me 💐']),
  F('eid', 'Eid ul-Fitr', '2027-03-10', '🌙', 'photozoom', ['Eid Mubarak 🌙']),
  F('holi', 'Holi', '2027-03-23', '🎨', 'holi'),
  F('ramnavami', 'Ram Navami', '2027-04-15', '🏹', 'cinematic', ['J A I   S H R E E   R A M 🏹']),
  F('mothersday', 'Mother’s Day', '2027-05-09', '👩‍👧', 'vhs'),
  F('bakrid', 'Eid al-Adha (Bakrid)', '2027-05-17', '🌙', 'photozoom', ['Eid al-Adha Mubarak 🌙']),
  F('fathersday', 'Father’s Day', '2027-06-20', '👨‍👦', 'vhs'),
  F('friendship', 'Friendship Day', '2027-08-01', '🤝', 'friends', ['MY PEOPLE 🤝']),
  F('independence', 'Independence Day', '2027-08-15', '🇮🇳', 'cinematic', ['J A I   H I N D 🇮🇳']),
  F('rakhi', 'Raksha Bandhan', '2027-08-17', '🎀', 'photozoom', ['Happy Raksha Bandhan 🎀']),
  F('janmashtami', 'Janmashtami', '2027-08-25', '🦚', 'festival', ['HAPPY JANMASHTAMI 🦚', 'जय श्री कृष्ण']),
  F('ganesh', 'Ganesh Chaturthi', '2027-09-04', '🐘', 'festival', ['GANPATI BAPPA MORYA 🐘', 'गणपति बप्पा मोरया']),
  F('teachers', 'Teachers’ Day', '2027-09-05', '📚', 'photozoom', ['Thank you, teacher 📚']),
  F('onam', 'Onam', '2027-09-12', '🌸', 'festival', ['HAPPY ONAM 🌸', 'ഓണാശംസകൾ']),
  F('navratri', 'Navratri', '2027-09-30', '💃', 'beatdrop', ['GARBA NIGHTS 💃']),
  F('dussehra', 'Dussehra', '2027-10-09', '🏹', 'festival', ['HAPPY DUSSEHRA 🏹', 'विजयादशमी की शुभकामनाएँ']),
  F('karwachauth', 'Karwa Chauth', '2027-10-18', '🌕', 'wedding', ['Happy Karwa Chauth 🌕', 'forever yours']),
  F('dhanteras', 'Dhanteras', '2027-10-27', '🪙', 'festival', ['HAPPY DHANTERAS 🪙', 'धनतेरस की शुभकामनाएँ']),
  F('diwali', 'Diwali', '2027-10-29', '🪔', 'festival'),
  F('bhaidooj', 'Bhai Dooj', '2027-10-31', '🧿', 'photozoom', ['Happy Bhai Dooj 🧿']),
  F('chhath', 'Chhath Puja', '2027-11-04', '🌅', 'festival', ['CHHATH PUJA 🌅', 'छठ पूजा की शुभकामनाएँ']),
  F('gurunanak', 'Guru Nanak Jayanti', '2027-11-14', '🙏', 'cinematic', ['G U R P U R A B   🙏']),
  F('childrens', 'Children’s Day', '2027-11-14', '🧸', 'photodump', ['little moments 🧸']),
  F('christmas', 'Christmas', '2027-12-25', '🎄', 'photozoom', ['Merry Christmas 🎄']),
  F('newyear', 'New Year', '2028-01-01', '🎆', 'lyrics', ['HELLO', '2028', 'NEW', 'YEAR', 'NEW', 'ME', '✨', '🎆']),
]

/* ---------- your own dates (yearly) ---------- */
export interface MyDate { id: string; name: string; kind: 'birthday' | 'anniversary'; md: string } // md = MM-DD
const KEY = 'clipforge-my-dates'
export const myDates = (): MyDate[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
export const saveMyDates = (l: MyDate[]) => {
  localStorage.setItem(KEY, JSON.stringify(l))
  window.dispatchEvent(new Event('cf:dates'))
}

const dayMs = 86400000
const today = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const daysUntil = (date: string) => Math.round((parse(date).getTime() - today().getTime()) / dayMs)

/** Festivals and your dates in the next `within` days, soonest first. */
export function upcoming(within = 30): (Occasion & { days: number })[] {
  const t = today()
  const own: Occasion[] = myDates().map((m) => {
    let y = t.getFullYear()
    let d = `${y}-${m.md}`
    if (daysUntil(d) < 0) d = `${++y}-${m.md}`
    return m.kind === 'birthday'
      ? { id: m.id, name: `${m.name}’s birthday`, emoji: '🎂', date: d, template: 'birthday', texts: ['HAPPY BIRTHDAY', m.name], own: true }
      : { id: m.id, name: `${m.name} – anniversary`, emoji: '💞', date: d, template: 'wedding', texts: [m.name, 'happy anniversary'], own: true }
  })
  return [...own, ...FESTIVALS]
    .map((o) => ({ ...o, days: daysUntil(o.date) }))
    .filter((o) => o.days >= 0 && o.days <= within)
    .sort((a, b) => a.days - b.days || (a.own ? -1 : 1))
}
export const whenText = (d: number) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d} days`)

/* ---------- a reel idea for every day ---------- */
export const IDEAS: { title: string; how: string; template: string }[] = [
  { title: 'POV countdown', how: 'Show the “before” for 3 seconds, then the big reveal.', template: 'countdown' },
  { title: 'Day in my life', how: 'Film 6 tiny moments from today – wake-up to bedtime.', template: 'dayinlife' },
  { title: 'Fit check', how: 'Change outfits on every beat – same spot, same pose.', template: 'fitcheck' },
  { title: 'That’s me 👆', how: 'Start with a funny moment, freeze it, then tell the story.', template: 'thatsme' },
  { title: 'Photo dump', how: 'Pick 10 photos from this week – no editing, just vibes.', template: 'photodump' },
  { title: 'Velocity edit', how: 'Film walking, turning or dancing – the speed ramps do the rest.', template: 'velocity' },
  { title: 'Food reel', how: 'Close-ups of what you ate today – pour, cut, bite.', template: 'food' },
  { title: 'Before / after', how: 'Room, desk, look or skill – show the glow-up.', template: 'glowup' },
  { title: 'Lyric pop', how: 'Type one line that’s true for you, one word per beat.', template: 'lyrics' },
  { title: 'Squad montage', how: 'Your friends being silly – 7 quick clips.', template: 'friends' },
  { title: 'Travel diary', how: 'Even a short trip in the city counts – add place names.', template: 'travel' },
  { title: 'Cinematic', how: 'Slow, wide shots of something ordinary – make it look like a film.', template: 'cinematic' },
  { title: 'Old memories', how: 'Old photos or videos with the VHS look – add the year.', template: 'vhs' },
  { title: 'Workout', how: 'Your training today – hard cuts, black & white.', template: 'workout' },
  { title: 'Zoom transitions', how: 'Six places you went today, zooming into each other.', template: 'zoomchain' },
]
export const todaysIdea = () => {
  const d = today()
  const n = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / dayMs)
  return IDEAS[n % IDEAS.length]
}

/* ---------- posting streak (a saved video counts as a post) ---------- */
const SKEY = 'clipforge-post-days'
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const postDays = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SKEY) || '[]')
  } catch {
    return []
  }
}
export function recordPost() {
  const l = new Set(postDays())
  l.add(ymd(today()))
  localStorage.setItem(SKEY, JSON.stringify([...l].sort().slice(-400)))
  window.dispatchEvent(new Event('cf:streak'))
}
/** Days in a row (ending today, or yesterday if you haven't posted yet today) and the 30-day challenge progress. */
export function streak(): { days: number; today: boolean; last30: boolean[] } {
  const set = new Set(postDays())
  const t = today()
  const has = (k: number) => set.has(ymd(new Date(t.getTime() - k * dayMs)))
  const posted = has(0)
  let n = 0
  for (let k = posted ? 0 : 1; has(k); k++) n++
  const last30 = Array.from({ length: 30 }, (_, i) => has(29 - i))
  return { days: n, today: posted, last30 }
}
