// Auto b-roll: reads what you say (captions) and drops matching stock clips over your talking parts.
import { contentWords, spokenFromCaptions } from './chapters'
import { Hit, Prov, getKey, search } from './components/StockPanel'
import { addAsset, baseClip, checkpoint, getPreset, getState, insertSilent } from './store'
import { engine } from './engine'
import { Asset, Clip } from './types'
import { PLACES } from './travelmap'

// Hinglish / Hindi words → English search words (stock sites only understand English)
const DICT: Record<string, string> = {
  khana: 'food', khaana: 'food', bhojan: 'food', nashta: 'breakfast', chai: 'tea', coffee: 'coffee', paani: 'water', pani: 'water', doodh: 'milk', lassi: 'lassi', samosa: 'samosa', momos: 'momos', biryani: 'biryani', roti: 'roti', paratha: 'paratha', mithai: 'indian sweets', jalebi: 'jalebi', golgappe: 'street food', panipuri: 'street food', chaat: 'street food',
  ghar: 'home', kamra: 'room', rasoi: 'kitchen', bazaar: 'market', bazar: 'market', market: 'market', dukaan: 'shop', mall: 'shopping mall', mandir: 'temple', masjid: 'mosque', gurudwara: 'gurudwara', school: 'school', office: 'office', hospital: 'hospital', station: 'railway station', airport: 'airport',
  gaadi: 'car', gadi: 'car', car: 'car', bike: 'motorbike', train: 'train', rail: 'train', bus: 'bus', auto: 'auto rickshaw', metro: 'metro train', flight: 'airplane', jahaz: 'airplane',
  pahad: 'mountains', pahaad: 'mountains', parvat: 'mountains', nadi: 'river', samundar: 'ocean', samudra: 'ocean', beach: 'beach', jungle: 'forest', jangal: 'forest', ped: 'trees', phool: 'flowers', baarish: 'rain', barish: 'rain', dhoop: 'sunshine', suraj: 'sunrise', chaand: 'moon', raat: 'night city', subah: 'morning', shaam: 'sunset', aasman: 'sky', baadal: 'clouds', barf: 'snow',
  shaadi: 'indian wedding', shadi: 'indian wedding', diwali: 'diwali', holi: 'holi', festival: 'festival', puja: 'puja', party: 'party', birthday: 'birthday', dost: 'friends', dosto: 'friends', parivaar: 'family', family: 'family', bachche: 'children', baccha: 'child', maa: 'mother', papa: 'father',
  paisa: 'money', paise: 'money', rupay: 'money', rupees: 'money', kamai: 'money', salary: 'salary', business: 'business', kaam: 'work', naukri: 'job', padhai: 'studying', kitab: 'books', phone: 'smartphone', mobile: 'smartphone', laptop: 'laptop', computer: 'computer',
  gym: 'gym', yoga: 'yoga', khel: 'sports', cricket: 'cricket', football: 'football', daud: 'running', safar: 'travel', yatra: 'travel', ghoomna: 'travel', trip: 'travel', hotel: 'hotel', shopping: 'shopping', kapde: 'clothes', kapda: 'clothes', joote: 'shoes', sheher: 'city', shahar: 'city', gaon: 'village', khet: 'farm',
  khushi: 'happy people', dukh: 'sad', pyaar: 'love', pyar: 'love', gussa: 'angry', darr: 'scared', thand: 'winter', garmi: 'summer heat', traffic: 'traffic', road: 'road',
}
// English things you can film (a stock search for them makes sense)
const FILMABLE = new Set(
  'beach sunset sunrise ocean sea river lake mountain mountains hills forest jungle desert snow rain clouds sky city street road highway bridge traffic village farm garden park temple church mosque palace fort museum market shop mall hotel restaurant cafe kitchen food pizza burger coffee tea cake dessert fruit fruits vegetables dog cat cow birds horse car bike train bus airplane flight airport station boat ship office laptop computer phone money gym yoga running cricket football festival wedding party dance music guitar concert fireworks lights night stars moon waterfall island lighthouse camping tent books school college classroom hospital doctor baby kids family friends couple shopping clothes shoes'.split(' '),
)
const FILLER = new Set('today video vlog guys channel subscribe like share something everything nothing really very thing things time people'.split(' '))

/** English stock-search words for a sentence, or '' when nothing visual is said. */
export function visualWords(text: string): string {
  const low = ` ${text.toLowerCase()} `
  for (const p of PLACES) if (low.includes(` ${p.n.toLowerCase()} `)) return `${p.n.replace(/ \(.*\)$/, '')}`
  const words = contentWords(text).filter((w) => !FILLER.has(w))
  for (const w of words) if (DICT[w]) return DICT[w]
  for (const w of words) if (FILMABLE.has(w)) return w
  return ''
}

export interface BrollOpts {
  stock: Prov
  every: number // seconds between b-roll moments
  len: number // seconds each b-roll stays
  style: 'full' | 'pip'
}

async function download(h: Hit): Promise<Asset | null> {
  const r = await fetch(h.url)
  if (!r.ok) return null
  const b = await r.blob()
  const a = await engine.importFile(new File([b], `B-roll – ${h.title.replace(/[^\w ]+/g, '').slice(0, 24) || 'stock'}.mp4`, { type: 'video/mp4' }))
  if (a) addAsset(a)
  return a
}

export async function autoBroll(o: BrollOpts, status: (m: string, p?: number) => void, signal: { cancelled: boolean }): Promise<string> {
  const said = spokenFromCaptions()
  if (!said.length) throw new Error('Make captions first (Captions tab) – b-roll follows what you say.')
  const key = getKey(o.stock)
  if (!key) throw new Error(`Add your free ${o.stock === 'pexels' ? 'Pexels' : 'Pixabay'} key first (Media tab → Free stock videos & photos).`)
  // pick moments: a sentence that names something visual, spaced out
  const picks: { t: number; dur: number; q: string; text: string }[] = []
  for (const s of said) {
    const q = visualWords(s.text)
    if (!q) continue
    if (picks.length && s.start - picks[picks.length - 1].t < o.every) continue
    if (s.start < 1.5) continue // keep the opening on your face (the hook)
    picks.push({ t: s.start, dur: Math.max(1.8, Math.min(o.len, s.end - s.start + 0.6)), q, text: s.text })
  }
  if (!picks.length) throw new Error('Nothing visual found in your captions (try talking about places, food, things you see).')
  const P = getPreset()
  const portrait = P.h > P.w
  const used = new Set<string>()
  const made: Clip[] = []
  for (let i = 0; i < picks.length; i++) {
    if (signal.cancelled) throw new Error('Cancelled.')
    const pk = picks[i]
    status(`B-roll ${i + 1} of ${picks.length}: “${pk.q}”…`, (i / picks.length) * 100)
    let hits: Hit[] = []
    try {
      hits = (await search(o.stock, 'videos', pk.q, key, portrait)).filter((h) => !used.has(h.id))
    } catch (e) {
      if (/rejected/.test((e as Error).message)) throw e
    }
    const h = hits[0]
    if (!h) continue
    used.add(h.id)
    const a = await download(h)
    if (!a) continue
    const busy = (tr: string) => getState().project.clips.some((c) => c.track === tr && c.start < pk.t + pk.dur && c.start + c.dur > pk.t)
    const track = ['v2', 'v3'].find((tr) => !busy(tr) && !made.some((m) => m.track === tr && m.start < pk.t + pk.dur && m.start + m.dur > pk.t)) ?? 'v2'
    const pip = o.style === 'pip'
    made.push(
      baseClip('video', track, {
        assetId: a.id,
        label: `B-roll: ${pk.q}`,
        start: pk.t,
        dur: Math.min(pk.dur, a.duration),
        srcIn: Math.min(Math.max(0, a.duration - pk.dur), a.duration * 0.2),
        volume: 0,
        fit: 'cover',
        ...(pip ? { scale: 0.42, x: 0.73, y: 0.27, mask: { shape: 'rounded', radius: 0.12 } } : {}),
        transIn: { type: pip ? 'zoom-in' : 'fade', dur: 0.2 },
        transOut: { type: 'fade', dur: 0.2 },
        kf: pip ? undefined : { scale: [{ t: 0, v: 1 }, { t: pk.dur, v: 1.08 }] },
      } as Partial<Clip>),
    )
  }
  if (!made.length) throw new Error('No matching stock clips found.')
  checkpoint()
  insertSilent(made)
  engine.requestRender()
  return `Added ${made.length} b-roll clips: ${made.map((m) => m.label.replace('B-roll: ', '')).join(', ')}. Your voice keeps playing underneath; drag or delete any of them.`
}
