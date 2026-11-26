"""Makes the template card media in public/tpl/:
  <id>.mp4  – a short moving preview of each "fill with your clips" template (made with the app's own exporter)
  <id>.webp – the still picture shown before the video loads (and for text layouts / packs)

Sample footage: put your own license-free clips (e.g. from pexels.com) in docs/template-footage/
(file names starting with a scene word – city, party, street, beach, mountains, nature, food, gym, diya,
holi, cake, flowers, dull, pastel – pick which templates use them; anything else is used everywhere).
With no footage there, the script draws animated sample scenes (gradients, light, emoji – no real people).

Needs the built app served at http://localhost:8765 and Playwright + Chrome.
Run:  python3 scripts/template-previews.py [template ids…]
"""
import base64, pathlib, sys
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'public' / 'tpl'; out.mkdir(parents=True, exist_ok=True)
own = root / 'docs' / 'template-footage'
tmp = pathlib.Path('/tmp/tplfoot'); tmp.mkdir(exist_ok=True)

# scene: (top colour, bottom colour, subject emoji, motion, falling particles)
SCENES = {
  'city': ('#0b1033', '#4c1d95', '🕺', 'dance', ''), 'party': ('#3b0764', '#db2777', '🥳', 'bounce', '🎉'),
  'street': ('#1f2937', '#f59e0b', '🚕', 'drive', ''), 'beach': ('#38bdf8', '#fde68a', '🏄', 'surf', ''),
  'mountains': ('#0ea5e9', '#e0f2fe', '✈️', 'fly', '☁️'), 'nature': ('#14532d', '#86efac', '🦋', 'flutter', '🌸'),
  'food': ('#7c2d12', '#fdba74', '🍜', 'steam', ''), 'gym': ('#111827', '#4b5563', '🏋️', 'lift', ''),
  'diya': ('#1c0a00', '#b45309', '🪔', 'flicker', '✨'), 'holi': ('#db2777', '#facc15', '🎨', 'bounce', '🌈'),
  'cake': ('#831843', '#fbcfe8', '🎂', 'bounce', '🎈'), 'flowers': ('#4a0d1a', '#f9a8d4', '💐', 'sway', '🌸'),
  'dull': ('#3f3f46', '#a1a1aa', '😐', 'sway', ''), 'pastel': ('#f472b6', '#fde68a', '😍', 'bounce', '✨'),
}
USE = {
  'velocity': ['city', 'street', 'party', 'beach', 'gym'], 'beatdrop': ['city', 'party', 'street', 'holi'], 'beatshake': ['party', 'city', 'gym', 'street'],
  'thatsme': ['street', 'city', 'beach', 'party'], 'zoomchain': ['mountains', 'beach', 'nature', 'city'], 'glitch': ['city', 'street', 'party'],
  'slowmoend': ['city', 'party', 'street', 'beach', 'nature'], 'lyrics': ['city', 'beach', 'party', 'nature'], 'cinematic': ['mountains', 'beach', 'nature', 'city'],
  'vlogintro': ['street', 'food', 'beach', 'city'], 'countdown': ['dull', 'party', 'city', 'beach'], 'friends': ['party', 'beach', 'street', 'holi'],
  'fitcheck': ['city', 'street', 'party', 'pastel'], 'workout': ['gym', 'gym', 'street'], 'food': ['food', 'food', 'cake'],
  'photodump': ['beach', 'food', 'city', 'nature', 'party', 'mountains'], 'photozoom': ['mountains', 'nature', 'beach'], 'vhs': ['beach', 'party', 'cake', 'nature'],
  'glowup': ['dull', 'pastel'], 'dayinlife': ['pastel', 'food', 'city', 'street', 'gym', 'city'], 'travel': ['mountains', 'beach', 'nature', 'street'],
  'birthday': ['cake', 'party', 'pastel'], 'wedding': ['flowers', 'nature', 'pastel'], 'festival': ['diya', 'diya', 'party'], 'holi': ['holi', 'party', 'pastel'],
}

# draws one animated scene on a canvas and records it (real time) as WebM
RECORD = """async ([a, b, em, motion, fall, secs]) => {
  const W = 540, H = 960, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')
  let s = 11; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280
  const dots = Array.from({ length: 12 }, () => ({ x: r() * W, y: r() * H, rad: 8 + r() * 40, v: 10 + r() * 40, a: 0.05 + r() * 0.12 }))
  const falls = Array.from({ length: fall ? 9 : 0 }, () => ({ x: r() * W, y: -r() * H, v: 80 + r() * 120, s: 30 + r() * 30, w: r() * 6 }))
  const em1 = [...new Intl.Segmenter().segment(em)].map((x) => x.segment)[0]
  const st = c.captureStream(30); const rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 2500000 }); const chunks = []
  rec.ondataavailable = (e) => chunks.push(e.data); rec.start()
  const t0 = performance.now()
  await new Promise((done) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000
      const gr = g.createLinearGradient(0, 0, W * 0.4, H); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H)
      for (const d of dots) { const y = (d.y - d.v * t + H * 2) % (H + 200) - 100; const x = d.x + Math.sin(t + d.y) * 20
        const rg = g.createRadialGradient(x, y, 0, x, y, d.rad); rg.addColorStop(0, `rgba(255,255,255,${d.a})`); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, y, d.rad, 0, 7); g.fill() }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, H * 0.78, W, H * 0.22)
      let x = W / 2, y = H * 0.6, rot = 0, sc = 1
      if (motion === 'dance') { rot = Math.sin(t * 6) * 0.25; y += Math.abs(Math.sin(t * 6)) * -40; x += Math.sin(t * 3) * 60 }
      if (motion === 'bounce') { y -= Math.abs(Math.sin(t * 4)) * 120; sc = 1 + Math.sin(t * 8) * 0.04 }
      if (motion === 'drive') { x = ((t * 220) % (W + 300)) - 150; y = H * 0.74 }
      if (motion === 'surf') { x = W / 2 + Math.sin(t * 1.5) * 150; y = H * 0.62 + Math.sin(t * 3) * 30; rot = Math.sin(t * 1.5) * 0.3 }
      if (motion === 'fly') { x = ((t * 180) % (W + 300)) - 150; y = H * 0.35 + Math.sin(t * 2) * 40; rot = -0.2 }
      if (motion === 'flutter') { x = W / 2 + Math.sin(t * 1.3) * 160; y = H * 0.45 + Math.sin(t * 2.6) * 120; sc = 1 + Math.sin(t * 14) * 0.08 }
      if (motion === 'steam' || motion === 'flicker') { sc = 1 + Math.sin(t * 2) * 0.05 }
      if (motion === 'lift') { y = H * 0.6 - Math.abs(Math.sin(t * 2.5)) * 80 }
      if (motion === 'sway') { rot = Math.sin(t * 1.5) * 0.12 }
      if (motion === 'steam') for (let i = 0; i < 6; i++) { const p = (t * 0.7 + i / 6) % 1; g.fillStyle = `rgba(255,255,255,${0.25 * (1 - p)})`; g.beginPath(); g.arc(W / 2 + Math.sin(p * 9 + i) * 30, H * 0.5 - p * 260, 18 + p * 30, 0, 7); g.fill() }
      if (motion === 'flicker') { const fl = 0.6 + Math.random() * 0.4; const rg = g.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, 260); rg.addColorStop(0, `rgba(255,190,80,${0.45 * fl})`); rg.addColorStop(1, 'rgba(255,190,80,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H) }
      g.fillStyle = '#000'; g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc); g.font = '230px "Noto Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 30; g.fillText(em1, 0, 0); g.restore()
      g.fillStyle = '#000'; if (fall) for (const f of falls) { const yy = ((f.y + f.v * t) % (H + 100)); g.save(); g.translate(f.x + Math.sin(t * 2 + f.w) * 25, yy); g.rotate(t + f.w); g.font = f.s + 'px "Noto Color Emoji"'; g.fillText(fall, 0, 0); g.restore() }
      const v = g.createRadialGradient(W / 2, H / 2, W * 0.4, W / 2, H / 2, H * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.4)'); g.fillStyle = v; g.fillRect(0, 0, W, H)
      if (t < secs) requestAnimationFrame(frame); else done()
    }
    frame()
  })
  rec.stop(); await new Promise((d) => (rec.onstop = d))
  const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()
  let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 32768) bin += String.fromCharCode(...u.subarray(i, i + 32768))
  return btoa(bin)
}"""

def footage(pg, scene):
    mine = sorted([p for p in own.glob('*') if p.suffix.lower() in ('.mp4', '.webm', '.mov', '.jpg', '.jpeg', '.png')]) if own.exists() else []
    if mine:
        pick = [p for p in mine if p.name.lower().startswith(scene)] or mine
        return str(pick[hash(scene) % len(pick)])
    f = tmp / f'{scene}.webm'
    if not f.exists():
        a, b, em, motion, fall = SCENES[scene]
        f.write_bytes(base64.b64decode(pg.evaluate(RECORD, [a, b, em, motion, fall, 5])))
    return str(f)

def poster(pg, name, t):
    pg.evaluate(f"()=>{{__cf.engine.pause(); __cf.engine.seek({t}); __cf.engine.render()}}"); pg.wait_for_timeout(900)
    pg.evaluate(f"()=>{{__cf.engine.seek({t}); __cf.engine.render()}}"); pg.wait_for_timeout(600)
    data = pg.evaluate("""()=>{const c=[...document.querySelectorAll('.stage canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
      const o=document.createElement('canvas'); o.width=270; o.height=480; const g=o.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(c,0,0,270,480); return o.toDataURL('image/webp',0.8)}""")
    (out / f'{name}.webp').write_bytes(base64.b64decode(data.split(',')[1]))

def fresh(pg):
    pg.evaluate("()=>{__cf.engine.pause(); __cf.store.resetProject()}"); pg.wait_for_timeout(300)

def load(pg, files):
    before = pg.evaluate("()=>__cf.store.getState().assets.length")
    pg.locator('input[type=file][accept*="image"]').first.set_input_files(files)
    pg.wait_for_function(f"()=>__cf.store.getState().assets.length>={before + len(set(files))}", timeout=90000); pg.wait_for_timeout(500)
    pg.evaluate("()=>__cf.store.replaceTimeline([])")  # the welcome screen puts them on the timeline – start empty
    return pg.evaluate(f"()=>__cf.store.getState().assets.slice({before}).filter(a=>a.kind!=='audio').map(a=>a.id)")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("localStorage.setItem('clipforge-settings',JSON.stringify({skin:'aurora',mode:'advanced'}));localStorage.setItem('clipforge-tour-done','1')")
    pg = ctx.new_page()
    pg.goto('http://localhost:8765/'); pg.wait_for_selector('.tabs', state='attached'); pg.wait_for_timeout(800)
    pg.evaluate("()=>{__cf.engine.drawMark=()=>{}}")  # the card shows the look, not the free-plan mark
    only = set(sys.argv[1:])
    vids = pg.evaluate("()=>__cf.creative.VIDEO_TEMPLATES.map(t=>t.id)")
    for tid in vids:
        if only and tid not in only: continue
        fresh(pg)
        files = [footage(pg, s) for s in USE.get(tid, ['city', 'beach', 'party'])]
        ids = load(pg, files)
        # keep the picked order (the same file twice is one asset – reuse it)
        order = []
        for f in files: order.append(ids[min(len(ids) - 1, sorted(set(files), key=files.index).index(f))])
        pg.evaluate("async ([id, ids])=>{await __cf.creative.applyVideoTemplate(id, ids, undefined, ()=>{})}", [tid, order])
        pg.wait_for_timeout(800)
        total = pg.evaluate("()=>__cf.store.getState().project.clips.filter(c=>c.track==='v1').reduce((m,c)=>Math.max(m,c.start+c.dur),0)")
        end = min(total, 7.0)
        b64 = pg.evaluate("""async (end)=>{const r = await __cf.fastExport.fastExport(()=>{}, {cancelled:false}, {from:0, to:end, maxSide:432, fps:24, bitrate:330000, audioBitrate:64000})
          if (!r) return ''; const u=new Uint8Array(await r.blob.arrayBuffer()); let s=''; for(let i=0;i<u.length;i+=32768) s+=String.fromCharCode(...u.subarray(i,i+32768)); return r.ext+'|'+btoa(s)}""", end)
        ext, data = b64.split('|', 1)
        (out / f'{tid}.mp4').write_bytes(base64.b64decode(data))
        tt = pg.evaluate("()=>{const c=__cf.store.getState().project.clips.filter(c=>c.kind==='text').sort((a,b)=>a.start-b.start); return c.length? Math.min(7, c[0].start+Math.min(1.2,c[0].dur*0.6)):1.2}")
        poster(pg, tid, tt)
        print('video', tid, ext, f'{total:.1f}s', (out / f'{tid}.mp4').stat().st_size // 1024, 'KB')
    # text layouts and packs keep a still picture
    layouts = pg.evaluate("()=>__cf.templates.TEMPLATES.map(t=>t.id)")
    packs = pg.evaluate("()=>__cf.templates.PACK_TEMPLATES.map(t=>[t.id,t.pack])")
    BG = {'wedding': 'flowers', 'festival': 'diya', 'travel': 'mountains', 'devotional': 'diya'}
    LBG = {'hook-outro': 'city', 'meme': 'party', 'lower-third': 'street', 'top3': 'food', 'countdown': 'party', 'quote': 'nature', 'like-sub': 'city'}
    for tid, pack in [(x, None) for x in layouts] + [tuple(x) for x in packs]:
        if only and tid not in only: continue
        fresh(pg)
        ids = load(pg, [footage(pg, BG[pack] if pack else LBG.get(tid, 'city'))])
        pg.evaluate("(id)=>{__cf.store.addAssetClip(id,'v1',0); const c=__cf.store.getState().project.clips.find(c=>c.track==='v1'); __cf.store.updateClip(c.id,{dur:Math.min(c.dur,4.9)})}", ids[0])
        pg.evaluate("(id)=>__cf.templates.applyTemplate(id)", tid)
        t = pg.evaluate("""()=>{const c=__cf.store.getState().project.clips.filter(c=>c.kind==='text'); let best=1, n=-1
          for (let t=0.3;t<4.8;t+=0.25){const k=c.filter(x=>x.start<=t&&x.start+x.dur>t).length; if(k>n){n=k;best=t}} return Math.min(4.7,best+0.5)}""")
        poster(pg, tid, t)
        print('layout', tid)
    b.close()
print('done ->', out)
