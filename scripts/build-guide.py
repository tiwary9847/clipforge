"""Turns docs/guide/guide.html into the in-app guide.

- src/guide/guide-body.html : the guide's content (no cover / print styles), images pointing at guide/<name>.webp
- public/guide/*.webp       : screenshots, resized for screens
- public/ViralKaro-User-Guide.pdf : the printable guide (from docs/)
Run after editing the guide:  python3 scripts/build-guide.py
"""
import pathlib, re, shutil
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'docs' / 'guide'
html = (src / 'guide.html').read_text()
body = html[html.index('<body>') + 6: html.index('</body>')]
body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
body = re.sub(r'<section class="cover">.*?</section>', '', body, flags=re.S)
# drop the printed "What's inside" page – the app has its own chapter list
body = re.sub(r'<h1 style="[^"]*">What’s inside</h1>\s*<div class="toc">.*?</div>\s*(?=<h1 class="part")', '', body, flags=re.S)
body = re.sub(r'(<img[^>]*?)\s*style="[^"]*"', r'\1', body)
body = re.sub(r'src="img/([\w\-]+)\.png"', r'src="guide/\1.webp" loading="lazy" alt=""', body)

out_img = root / 'public' / 'guide'
out_img.mkdir(parents=True, exist_ok=True)
used = set(re.findall(r'guide/([\w\-]+)\.webp', body))
for f in out_img.glob('*.webp'):
    if f.stem not in used:
        f.unlink()
sizes = {}
for name in sorted(used):
    im = Image.open(src / 'img' / f'{name}.png').convert('RGB')
    im.thumbnail((1280, 1280))
    im.save(out_img / f'{name}.webp', 'WEBP', quality=78, method=6)
    sizes[name] = im.size
# fixed sizes so the page doesn't jump while pictures load
body = re.sub(r'src="guide/([\w\-]+)\.webp"', lambda m: f'src="guide/{m.group(1)}.webp" width="{sizes[m.group(1)][0]}" height="{sizes[m.group(1)][1]}"', body)

(root / 'src' / 'guide').mkdir(exist_ok=True)
(root / 'src' / 'guide' / 'guide-body.html').write_text(body.strip() + '\n')
shutil.copy(root / 'docs' / 'ViralKaro-User-Guide.pdf', root / 'public' / 'ViralKaro-User-Guide.pdf')
kb = sum(f.stat().st_size for f in out_img.glob('*.webp')) // 1024
print(f'guide: {len(body)//1024} KB text, {len(used)} images ({kb} KB)')
