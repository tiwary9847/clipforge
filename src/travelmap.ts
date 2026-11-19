// Animated travel map: a styled map (Natural Earth outlines, no internet needed) with the route drawing itself,
// a vehicle riding along it and each stop popping in.
import GEO from './geo.json'
import { Clip } from './types'

export type TravelMode = 'car' | 'train' | 'plane' | 'bike' | 'walk' | 'bus'
export interface Stop {
  n: string
  lat: number
  lon: number
}
export interface MapData {
  stops: Stop[]
  mode: TravelMode
  theme: 'light' | 'dark' | 'paper'
  title?: string
}

export const MODES: { id: TravelMode; icon: string; name: string }[] = [
  { id: 'car', icon: '🚗', name: 'Car' },
  { id: 'bike', icon: '🏍️', name: 'Bike' },
  { id: 'bus', icon: '🚌', name: 'Bus' },
  { id: 'train', icon: '🚆', name: 'Train' },
  { id: 'plane', icon: '✈️', name: 'Plane' },
  { id: 'walk', icon: '🚶', name: 'Walk' },
]

// name, lat, lon – NCR first, then cities, then trip spots, then abroad
const P = `Noida,28.535,77.391;Greater Noida,28.474,77.504;Ghaziabad,28.669,77.454;Delhi,28.614,77.209;New Delhi,28.614,77.209;Gurugram,28.459,77.026;Faridabad,28.408,77.317;Meerut,28.984,77.706;
Mumbai,19.076,72.878;Pune,18.52,73.857;Bengaluru,12.972,77.595;Bangalore,12.972,77.595;Hyderabad,17.385,78.487;Chennai,13.083,80.271;Kolkata,22.573,88.364;Ahmedabad,23.023,72.571;Surat,21.17,72.831;Jaipur,26.912,75.787;Lucknow,26.847,80.946;Kanpur,26.449,80.332;Nagpur,21.146,79.088;Indore,22.72,75.858;Bhopal,23.26,77.413;Patna,25.594,85.138;Vadodara,22.307,73.181;Ludhiana,30.901,75.857;Agra,27.177,78.008;Nashik,19.998,73.79;Rajkot,22.304,70.802;Varanasi,25.318,82.974;Prayagraj,25.435,81.846;Allahabad,25.435,81.846;Srinagar,34.084,74.797;Amritsar,31.634,74.872;Ranchi,23.344,85.31;Coimbatore,11.017,76.956;Jodhpur,26.238,73.024;Madurai,9.925,78.12;Raipur,21.251,81.63;Kota,25.214,75.865;Chandigarh,30.733,76.779;Guwahati,26.144,91.736;Mysuru,12.296,76.639;Mysore,12.296,76.639;Bhubaneswar,20.296,85.825;Thiruvananthapuram,8.524,76.937;Kochi,9.931,76.267;Dehradun,30.317,78.032;Jammu,32.727,74.857;Visakhapatnam,17.687,83.218;Vijayawada,16.506,80.648;Gwalior,26.218,78.183;Jabalpur,23.181,79.987;Aligarh,27.898,78.088;Bareilly,28.367,79.43;Moradabad,28.839,78.773;Gorakhpur,26.76,83.373;Mathura,27.492,77.673;Vrindavan,27.58,77.7;Ayodhya,26.792,82.199;Haridwar,29.946,78.164;Rishikesh,30.087,78.268;Mussoorie,30.459,78.066;Nainital,29.38,79.464;Shimla,31.105,77.173;Manali,32.24,77.189;Kasol,32.01,77.315;Dharamshala,32.219,76.323;McLeod Ganj,32.242,76.321;Dalhousie,32.537,75.971;Leh,34.152,77.577;Ladakh,34.152,77.577;Gulmarg,34.048,74.38;Pahalgam,34.016,75.315;Katra,32.991,74.932;Vaishno Devi,33.03,74.949;Kedarnath,30.735,79.067;Badrinath,30.744,79.493;Auli,30.529,79.57;
Udaipur,24.585,73.712;Jaisalmer,26.915,70.908;Pushkar,26.49,74.551;Ajmer,26.449,74.639;Mount Abu,24.593,72.708;Ranthambore,26.017,76.502;Bikaner,28.022,73.312;Khajuraho,24.832,79.919;Ujjain,23.179,75.785;Omkareshwar,22.245,76.151;Orchha,25.351,78.64;Goa,15.299,74.124;Panaji,15.491,73.828;Lonavala,18.752,73.406;Mahabaleshwar,17.925,73.657;Shirdi,19.766,74.477;Aurangabad,19.876,75.343;Ajanta,20.552,75.703;Ellora,20.026,75.179;Dwarka,22.24,68.968;Somnath,20.888,70.401;Statue of Unity,21.838,73.719;Rann of Kutch,23.734,69.86;
Ooty,11.41,76.695;Kodaikanal,10.238,77.489;Munnar,10.089,77.06;Alleppey,9.498,76.339;Alappuzha,9.498,76.339;Wayanad,11.685,76.132;Varkala,8.733,76.716;Kovalam,8.4,76.979;Kanyakumari,8.088,77.539;Rameswaram,9.288,79.313;Pondicherry,11.934,79.83;Puducherry,11.934,79.83;Mahabalipuram,12.62,80.199;Tirupati,13.629,79.419;Hampi,15.335,76.46;Coorg,12.338,75.806;Gokarna,14.55,74.318;Chikmagalur,13.316,75.772;
Darjeeling,27.036,88.263;Gangtok,27.339,88.607;Shillong,25.578,91.893;Cherrapunji,25.284,91.721;Kaziranga,26.578,93.171;Tawang,27.586,91.859;Puri,19.813,85.831;Konark,19.888,86.095;Bodh Gaya,24.696,84.991;Port Blair,11.623,92.726;Andaman,11.623,92.726;Havelock Island,11.967,93.0;Lakshadweep,10.567,72.642;Spiti,32.246,78.035;Kasauli,30.9,76.965;Jim Corbett,29.53,78.774;Lansdowne,29.84,78.68;Neemrana,27.988,76.386;
Kathmandu,27.717,85.324;Pokhara,28.21,83.986;Thimphu,27.472,89.639;Paro,27.43,89.413;Colombo,6.927,79.861;Dhaka,23.81,90.412;Male,4.175,73.509;Maldives,3.203,73.221;Dubai,25.205,55.271;Abu Dhabi,24.454,54.377;Doha,25.285,51.531;Bangkok,13.756,100.502;Phuket,7.88,98.392;Pattaya,12.936,100.882;Singapore,1.352,103.82;Kuala Lumpur,3.139,101.687;Bali,-8.409,115.189;Hong Kong,22.32,114.169;Tokyo,35.676,139.65;Istanbul,41.008,28.978;London,51.507,-0.128;Paris,48.857,2.352;New York,40.713,-74.006;Toronto,43.653,-79.383;Sydney,-33.869,151.209;Melbourne,-37.814,144.963;Los Angeles,34.052,-118.244;San Francisco,37.775,-122.419;Vietnam,16.047,108.206;Hanoi,21.028,105.854;Baku,40.41,49.867;Almaty,43.222,76.851;Moscow,55.756,37.617;Zurich,47.377,8.541`

export const PLACES: Stop[] = P.split(';')
  .map((x) => x.trim())
  .filter(Boolean)
  .map((x) => {
    const [n, lat, lon] = x.split(',')
    return { n, lat: +lat, lon: +lon }
  })

/** Finds a place by name, or reads "Name, 28.5, 77.3" / "28.5, 77.3". */
export function findPlace(q: string): Stop | null {
  const s = q.trim()
  if (!s) return null
  const m = s.match(/^(.*?)[,\s]+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/) || s.match(/^()(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (m) return { n: m[1].trim() || `${(+m[2]).toFixed(2)}, ${(+m[3]).toFixed(2)}`, lat: +m[2], lon: +m[3] }
  const low = s.toLowerCase()
  return PLACES.find((p) => p.n.toLowerCase() === low) ?? PLACES.find((p) => p.n.toLowerCase().startsWith(low)) ?? null
}

export function suggest(q: string, n = 6): Stop[] {
  const low = q.trim().toLowerCase()
  if (!low) return []
  const seen = new Set<string>()
  return [...PLACES.filter((p) => p.n.toLowerCase().startsWith(low)), ...PLACES.filter((p) => p.n.toLowerCase().includes(low))]
    .filter((p) => !seen.has(p.n) && seen.add(p.n))
    .slice(0, n)
}

export function km(a: Stop, b: Stop) {
  const R = 6371
  const r = Math.PI / 180
  const dl = (b.lat - a.lat) * r
  const dn = (b.lon - a.lon) * r
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const THEMES = {
  light: { sea: '#cfe8f5', land: '#f6f1e6', border: '#c9bfa8', route: '#ff3b5c', text: '#1d1d1f', pill: '#ffffff' },
  dark: { sea: '#0d1726', land: '#1e2a3b', border: '#3a4b63', route: '#ffd400', text: '#ffffff', pill: '#111827' },
  paper: { sea: '#e9dcc0', land: '#f7efdc', border: '#b49d72', route: '#c0392b', text: '#3b2a1a', pill: '#fff8e8' },
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2)

/** Draws the map card centred at the origin, box = S*3.2 square. */
export function drawMap(ctx: CanvasRenderingContext2D, c: Clip, lt: number, S: number) {
  const m = c.map
  const size = S * 3.2
  const half = size / 2
  const th = THEMES[m?.theme ?? 'light']
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-half, -half, size, size, size * 0.05)
  ctx.fillStyle = th.sea
  ctx.fill()
  ctx.clip()
  if (!m || m.stops.length < 1) {
    ctx.restore()
    return
  }
  const st = m.stops
  // view: route bounds + padding, at least ~1.5° across so a short trip still shows context
  let la0 = Math.min(...st.map((s) => s.lat))
  let la1 = Math.max(...st.map((s) => s.lat))
  let lo0 = Math.min(...st.map((s) => s.lon))
  let lo1 = Math.max(...st.map((s) => s.lon))
  const k = Math.cos((((la0 + la1) / 2) * Math.PI) / 180)
  let spanX = (lo1 - lo0) * k
  let spanY = la1 - la0
  const span = Math.max(1.5, spanX, spanY) * 1.55
  const cx = (lo0 + lo1) / 2
  const cy = (la0 + la1) / 2
  // intro: start zoomed out 2× and settle in
  const intro = ease(Math.min(1, lt / 0.9))
  const view = span * (1.9 - 0.9 * intro)
  const sc = size / view
  const X = (lon: number) => (lon - cx) * k * sc
  const Y = (lat: number) => -(lat - cy) * sc
  void la0, la1, lo0, lo1, spanX, spanY
  // land
  ctx.lineJoin = 'round'
  const polys = [...(GEO as any).world, ...(GEO as any).southAsia] as [string, number[]][]
  const vx0 = cx - view / k / 2
  const vx1 = cx + view / k / 2
  const vy0 = cy - view / 2
  const vy1 = cy + view / 2
  for (const [, f] of polys) {
    let minX = 999
    let maxX = -999
    let minY = 999
    let maxY = -999
    for (let i = 0; i < f.length; i += 2) {
      if (f[i] < minX) minX = f[i]
      if (f[i] > maxX) maxX = f[i]
      if (f[i + 1] < minY) minY = f[i + 1]
      if (f[i + 1] > maxY) maxY = f[i + 1]
    }
    if (maxX < vx0 || minX > vx1 || maxY < vy0 || minY > vy1) continue
    ctx.beginPath()
    for (let i = 0; i < f.length; i += 2) {
      const x = X(f[i])
      const y = Y(f[i + 1])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = th.land
    ctx.fill()
    ctx.strokeStyle = th.border
    ctx.lineWidth = Math.max(1, size * 0.003)
    ctx.stroke()
  }
  // route geometry (planes fly an arc)
  const pts: [number, number][] = []
  for (let i = 0; i < st.length - 1; i++) {
    const a: [number, number] = [X(st[i].lon), Y(st[i].lat)]
    const b: [number, number] = [X(st[i + 1].lon), Y(st[i + 1].lat)]
    const N = 40
    for (let j = i === 0 ? 0 : 1; j <= N; j++) {
      const u = j / N
      let x = a[0] + (b[0] - a[0]) * u
      let y = a[1] + (b[1] - a[1]) * u
      const d = Math.hypot(b[0] - a[0], b[1] - a[1])
      const bend = m.mode === 'plane' ? 0.22 : 0.04
      const nx = -(b[1] - a[1]) / (d || 1)
      const ny = (b[0] - a[0]) / (d || 1)
      const h = Math.sin(u * Math.PI) * d * bend
      x += nx * h
      y += ny * h
      pts.push([x, y])
    }
  }
  if (st.length === 1) pts.push([X(st[0].lon), Y(st[0].lat)])
  const dur = Math.max(1.5, c.dur - 1.6)
  const prog = Math.min(1, Math.max(0, (lt - 0.9) / dur))
  const P = ease(prog)
  const lens = [0]
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = lens[lens.length - 1] || 1
  const upto = P * total
  // dashed full route faintly, solid drawn part on top
  ctx.lineCap = 'round'
  ctx.setLineDash([size * 0.012, size * 0.012])
  ctx.strokeStyle = th.route + '55'
  ctx.lineWidth = size * 0.008
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = th.route
  ctx.lineWidth = size * 0.013
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowBlur = size * 0.01
  ctx.beginPath()
  let head: [number, number] = pts[0]
  let dir = 0
  for (let i = 0; i < pts.length; i++) {
    if (lens[i] <= upto) {
      if (i) ctx.lineTo(pts[i][0], pts[i][1])
      else ctx.moveTo(pts[i][0], pts[i][1])
      head = pts[i]
      if (i) dir = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
    } else {
      const f = (upto - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1])
      head = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]
      dir = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
      ctx.lineTo(head[0], head[1])
      break
    }
  }
  ctx.stroke()
  ctx.shadowColor = 'transparent'
  // stops: pop in when the route reaches them
  const segLen = total / Math.max(1, st.length - 1)
  st.forEach((s, i) => {
    const reached = st.length === 1 ? lt > 0.9 : upto >= segLen * i - 1e-6
    if (!reached && i > 0) return
    const tReach = st.length === 1 ? 0.9 : 0.9 + dur * (i / Math.max(1, st.length - 1)) * 0.98
    const pop = Math.min(1, Math.max(0, (lt - Math.min(tReach, 0.9 + (i === 0 ? 0 : dur * 0.02))) / 0.3))
    const x = X(s.lon)
    const y = Y(s.lat)
    const r = size * 0.018 * (i === 0 || i === st.length - 1 ? 1.25 : 1) * (0.4 + 0.6 * Math.max(pop, i === 0 ? intro : 0))
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x, y, r * 1.45, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = th.route
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // label
    const fs = size * 0.042
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`
    const tw = ctx.measureText(s.n).width
    const above = i % 2 === 0
    const ly = above ? y - r * 2 - fs * 0.9 : y + r * 2 + fs * 0.9
    const lx = Math.max(-half + tw / 2 + fs * 0.6, Math.min(half - tw / 2 - fs * 0.6, x))
    ctx.globalAlpha = Math.max(pop, i === 0 ? intro : 0)
    ctx.fillStyle = th.pill
    ctx.beginPath()
    ctx.roundRect(lx - tw / 2 - fs * 0.45, ly - fs * 0.7, tw + fs * 0.9, fs * 1.4, fs * 0.7)
    ctx.fill()
    ctx.fillStyle = th.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.n, lx, ly + fs * 0.04)
    ctx.globalAlpha = 1
  })
  // vehicle at the head of the line
  if (st.length > 1 && lt > 0.9) {
    const icon = MODES.find((x) => x.id === m.mode)?.icon ?? '🚗'
    const fs = size * 0.085
    ctx.save()
    ctx.translate(head[0], head[1])
    if (m.mode === 'plane') ctx.rotate(dir + Math.PI / 4)
    else if (Math.cos(dir) > 0) ctx.scale(-1, 1) // emoji vehicles face left – flip when going right
    ctx.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(icon, 0, -fs * 0.15)
    ctx.restore()
  }
  // title + distance
  const dist = st.slice(1).reduce((s, p, i) => s + km(st[i], p), 0)
  const title = m.title || (st.length > 1 ? `${st[0].n} → ${st[st.length - 1].n}` : st[0].n)
  const fs = size * 0.055
  ctx.font = `800 ${fs}px Inter, system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = th.pill + 'e6'
  const tw = Math.min(size * 0.9, ctx.measureText(title).width)
  ctx.beginPath()
  ctx.roundRect(-half + fs * 0.5, -half + fs * 0.5, tw + fs * 0.9, fs * (st.length > 1 ? 2.25 : 1.5), fs * 0.4)
  ctx.fill()
  ctx.fillStyle = th.text
  ctx.fillText(title, -half + fs * 0.95, -half + fs * 0.75, size * 0.9)
  if (st.length > 1) {
    ctx.font = `600 ${fs * 0.55}px Inter, system-ui, sans-serif`
    ctx.globalAlpha = 0.75
    const shown = Math.round(dist * P)
    ctx.fillText(`${MODES.find((x) => x.id === m.mode)?.icon ?? ''}  ≈ ${shown.toLocaleString('en-IN')} km straight line`, -half + fs * 0.95, -half + fs * 1.75)
    ctx.globalAlpha = 1
  }
  ctx.restore()
}
