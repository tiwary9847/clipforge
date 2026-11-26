"""Makes public/tpl/<id>.webp – the picture on each template card.
Draws illustrated backgrounds (gradients, light spots, emoji – no real people), puts them in the app,
applies each template and grabs a frame from the preview.
Needs a built app served at http://localhost:8765 and Playwright + Chrome.
Run:  python3 scripts/template-previews.py
"""
import base64, pathlib, sys
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'public' / 'tpl'; out.mkdir(parents=True, exist_ok=True)
tmp = pathlib.Path('/tmp/tplbg'); tmp.mkdir(exist_ok=True)

# background themes: (top colour, bottom colour, emoji list)
THEME = {
  'beatdrop': [('#3b0764', '#db2777', '⚡🎧'), ('#1e1b4b', '#7c3aed', '🔊'), ('#831843', '#f97316', '💥')],
  'travel': [('#0ea5e9', '#fde68a', '🏔️✈️'), ('#0369a1', '#38bdf8', '🏖️'), ('#065f46', '#a7f3d0', '🌴')],
  'dayinlife': [('#fde68a', '#fb923c', '☀️☕'), ('#bae6fd', '#f0abfc', '💻'), ('#1e1b4b', '#4338ca', '🌙')],
  'glowup': [('#3f3f46', '#71717a', '😐'), ('#f472b6', '#fde68a', '✨😍')],
  'friends': [('#facc15', '#22c55e', '🤪🎉'), ('#06b6d4', '#a855f7', '😂'), ('#f43f5e', '#f59e0b', '🍕')],
  'festival': [('#7c2d12', '#f59e0b', '🪔✨'), ('#9d174d', '#fb7185', '🎆'), ('#78350f', '#fbbf24', '🪔')],
  'wedding': [('#4a0d1a', '#b45309', '💍🌸')], 'pfest': [('#7c2d12', '#f59e0b', '🪔🎆')],
  'ptravel': [('#0c4a6e', '#7dd3fc', '🏔️🧳')], 'devotional': [('#9a3412', '#fdba74', '🙏🌺')],
  'layout': [('#1e1b4b', '#9333ea', '🎬')],
}
LAYOUT_THEME = {'hook-outro': ('#111827', '#2563eb', '🎣'), 'meme': ('#365314', '#a3e635', '😂'), 'lower-third': ('#0f172a', '#475569', '🎤'),
  'top3': ('#7c2d12', '#ea580c', '🏆'), 'countdown': ('#1e1b4b', '#6366f1', '⏱️'), 'quote': ('#134e4a', '#14b8a6', '💭'), 'like-sub': ('#450a0a', '#dc2626', '👍')}
PACK_BG = {'wedding': 'wedding', 'festival': 'pfest', 'travel': 'ptravel', 'devotional': 'devotional'}

DRAW = """async ([a, b, em, seed]) => {
  const c = document.createElement('canvas'); c.width = 720; c.height = 1280; const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 300, 1280); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 720, 1280)
  let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280
  for (let i = 0; i < 18; i++) { const x = r() * 720, y = r() * 1280, rad = 30 + r() * 130
    const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, 'rgba(255,255,255,' + (0.08 + r() * 0.16) + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill() }
  const list = [...new Intl.Segmenter().segment(em)].map((x) => x.segment)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  list.forEach((e, i) => { const n = list.length; g.font = (n > 1 ? 190 : 240) + 'px "Noto Color Emoji"'
    g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 40; g.fillText(e, 360 + (i - (n - 1) / 2) * 230, 900 + (i % 2) * 80); g.restore() })
  const v = g.createRadialGradient(360, 640, 300, 360, 640, 900); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = v; g.fillRect(0, 0, 720, 1280)
  return c.toDataURL('image/png')
}"""

def bg(pg, key, i, theme, small=False):
    a, b, em = theme
    if small: em = ''
    p = tmp / f'{key}-{i}.png'
    url = pg.evaluate(DRAW, [a, b, em, 7 + i * 13 + len(key)])
    p.write_bytes(base64.b64decode(url.split(',')[1]))
    return str(p)

def grab(pg, name, t):
    pg.evaluate(f"()=>{{__cf.engine.pause(); __cf.engine.seek({t}); __cf.engine.render()}}"); pg.wait_for_timeout(700)
    pg.evaluate(f"()=>{{__cf.engine.seek({t}); __cf.engine.render()}}"); pg.wait_for_timeout(500)
    data = pg.evaluate("""()=>{const c=[...document.querySelectorAll('.stage canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
      const o=document.createElement('canvas'); o.width=270; o.height=480; const g=o.getContext('2d'); g.imageSmoothingQuality='high'; g.drawImage(c,0,0,270,480); return o.toDataURL('image/webp',0.8)}""")
    (out / f'{name}.webp').write_bytes(base64.b64decode(data.split(',')[1]))

def fresh(pg):
    pg.evaluate("()=>{__cf.engine.pause(); __cf.store.resetProject()}"); pg.wait_for_timeout(300)

def load(pg, files):
    before = pg.evaluate("()=>__cf.store.getState().assets.length")
    pg.locator('input[type=file][accept*="image"]').first.set_input_files(files)
    pg.wait_for_function(f"()=>__cf.store.getState().assets.length>={before + len(files)}", timeout=60000); pg.wait_for_timeout(400)
    pg.evaluate("()=>__cf.store.replaceTimeline([])")  # the welcome screen puts them on the timeline – start empty
    return pg.evaluate(f"()=>__cf.store.getState().assets.slice({before}).map(a=>a.id)")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script("localStorage.setItem('clipforge-settings',JSON.stringify({skin:'aurora',mode:'advanced'}));localStorage.setItem('clipforge-tour','done')")
    pg = ctx.new_page()
    pg.goto('http://localhost:8765/'); pg.wait_for_selector('.tabs', state='attached'); pg.wait_for_timeout(800)
    pg.evaluate("()=>{__cf.engine.drawMark=()=>{}}")  # the card shows the look, not the free-plan mark
    only = set(sys.argv[1:])
    # 1. video templates: fill with 2–3 backgrounds, grab the frame where the title shows
    for tid in ['beatdrop', 'travel', 'dayinlife', 'glowup', 'friends', 'festival']:
        if only and tid not in only: continue
        fresh(pg)
        files = [bg(pg, tid, i, th) for i, th in enumerate(THEME[tid])]
        ids = load(pg, files)
        pg.evaluate("async (ids)=>{await __cf.creative.applyVideoTemplate('%s', ids, undefined, ()=>{})}" % tid, ids)
        pg.wait_for_timeout(600)
        tt = pg.evaluate("()=>{const c=__cf.store.getState().project.clips.filter(c=>c.kind==='text'); return c.length? c[0].start+Math.min(1.2,c[0].dur*0.6):0.9}")
        grab(pg, tid, tt)
        print('video', tid, round(tt, 2), pg.evaluate("()=>__cf.store.getState().project.clips.filter(c=>c.kind==='text').map(c=>[c.track,c.start,c.dur])"))
    # 2. text layouts and packs: one background, apply, grab where the text is
    layouts = pg.evaluate("()=>__cf.templates.TEMPLATES.map(t=>t.id)")
    packs = pg.evaluate("()=>__cf.templates.PACK_TEMPLATES.map(t=>[t.id,t.pack])")
    for tid, pack in [(x, None) for x in layouts] + [tuple(x) for x in packs]:
        if only and tid not in only: continue
        fresh(pg)
        th = THEME[PACK_BG[pack]][0] if pack else LAYOUT_THEME.get(tid, THEME['layout'][0])
        ids = load(pg, [bg(pg, tid, 0, th, small=bool(pack))])
        pg.evaluate("(id)=>{__cf.store.addAssetClip(id,'v1',0); const c=__cf.store.getState().project.clips.find(c=>c.track==='v1'); __cf.store.updateClip(c.id,{dur:8})}", ids[0])
        pg.evaluate("(id)=>__cf.templates.applyTemplate(id)", tid)
        # the moment with the most text on screen
        t = pg.evaluate("""()=>{const c=__cf.store.getState().project.clips.filter(c=>c.kind==='text'); let best=1, n=-1
          for (let t=0.3;t<8;t+=0.25){const k=c.filter(x=>x.start<=t&&x.start+x.dur>t).length; if(k>n){n=k;best=t}} return best+0.6}""")
        grab(pg, tid, t)
        print('layout', tid, round(t, 2))
    b.close()
print('done ->', out)
