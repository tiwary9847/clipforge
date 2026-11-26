// Builds the policy pages (public/legal/*.html) from docs/legal-templates/*.md + legal.json.
// Runs before every build. If legal.json isn't filled in yet, nothing is published (and the app hides the links).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'

const info = JSON.parse(readFileSync('legal.json', 'utf8'))
const out = 'public/legal'
const ready = ['name', 'city', 'state', 'email'].every((k) => String(info[k] || '').trim())
if (!ready) {
  if (existsSync(out)) rmSync(out, { recursive: true })
  console.log('legal: legal.json not filled in – no policy pages published')
  process.exit(0)
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const date = info.updated?.trim() || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
const phone = String(info.phone || '').trim()
const fill = (md) =>
  md
    .replace(/\[date\]/g, date)
    .replace(/\[email\]/g, info.email.trim())
    .replace(/\[your full name\]/g, info.name.trim())
    .replace(/\[city, state\]/g, `${info.city.trim()}, ${info.state.trim()}`)
    .replace(/\[city\]/g, info.city.trim())
    .replace(/ · \[phone, optional\]/g, phone ? ` · ${phone}` : '')
    .replace(/^- \*\*Phone \/ WhatsApp:\*\* \[optional\]\n/m, phone ? `- **Phone / WhatsApp:** ${phone}\n` : '')

// tiny Markdown → HTML: headings, lists, bold, italics, code, links, emails, paragraphs
const inline = (s) =>
  esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,)]|$)/g, '$1<i>$2</i>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, '<a href="mailto:$1">$1</a>')
function md2html(md) {
  const html = []
  let list = null
  const close = () => list && (html.push(`</${list}>`), (list = null))
  for (const raw of md.split('\n')) {
    const l = raw.trimEnd()
    let m
    if (!l.trim()) close()
    else if ((m = l.match(/^#\s+(.*)/))) close(), html.push(`<h1>${inline(m[1])}</h1>`)
    else if ((m = l.match(/^-\s+(.*)/))) list !== 'ul' && (close(), html.push('<ul>'), (list = 'ul')), html.push(`<li>${inline(m[1])}</li>`)
    else if ((m = l.match(/^\d+\.\s+(.*)/))) list !== 'ol' && (close(), html.push('<ol>'), (list = 'ol')), html.push(`<li>${inline(m[1])}</li>`)
    else close(), html.push(`<p>${inline(l)}</p>`)
  }
  close()
  return html.join('\n')
}
const PAGES = [
  ['privacy', 'Privacy policy'],
  ['terms', 'Terms of use'],
  ['refunds', 'Cancellation, refund & delivery'],
  ['contact', 'Contact us'],
]
const nav = (cur) => PAGES.map(([id, t]) => (id === cur ? `<b>${t}</b>` : `<a href="./${id}.html">${t}</a>`)).join(' · ')
const page = (id, title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} – ClipForge</title><meta name="description" content="${esc(title)} for ClipForge, the in-browser video editor.">
<style>body{margin:0;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1d2033;background:#f6f6fb}main{max-width:760px;margin:0 auto;padding:28px 20px 60px}
header{display:flex;align-items:center;gap:10px;margin-bottom:18px}header a{font-weight:800;color:#1d2033;text-decoration:none;font-size:20px}header i{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#7c5cff,#c04dff);display:inline-grid;place-items:center}header i:after{content:"";border-left:11px solid #fff;border-top:7px solid transparent;border-bottom:7px solid transparent;margin-left:3px}
h1{font-size:28px;line-height:1.2;margin:8px 0 6px}a{color:#5b3fe0}li{margin:6px 0}nav{font-size:14px;margin-top:36px;padding-top:16px;border-top:1px solid #dcdcea;color:#555}code{background:#ebe9f7;padding:1px 5px;border-radius:4px}
@media (prefers-color-scheme:dark){body{background:#0f1117;color:#e7e8f2}header a{color:#fff}a{color:#a996ff}nav{border-color:#2a2d3d;color:#aaa}code{background:#23263a}}</style></head>
<body><main><header><i></i><a href="../">ClipForge</a></header>
${body}
<nav>${nav(id)} · <a href="../">Open ClipForge</a></nav></main></body></html>
`
mkdirSync(out, { recursive: true })
for (const [id, title] of PAGES) {
  const md = fill(readFileSync(`docs/legal-templates/${id}.md`, 'utf8'))
  if (/\[[a-z ,]+\]/i.test(md.replace(/\[[^\]]+\]\(https?:[^)]+\)/g, ''))) throw new Error(`legal: ${id}.md still has a […] blank`)
  writeFileSync(`${out}/${id}.html`, page(id, title, md2html(md)))
}
writeFileSync(`${out}/index.html`, page('', 'Policies', `<h1>ClipForge policies</h1><ul>${PAGES.map(([id, t]) => `<li><a href="./${id}.html">${t}</a></li>`).join('')}</ul>`))
console.log('legal: published', PAGES.map((p) => p[0]).join(', '))
