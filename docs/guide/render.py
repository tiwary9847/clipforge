# Renders docs/guide/guide.html to docs/ViralKaro-User-Guide.pdf (needs Playwright + Chrome).
import pathlib
from playwright.sync_api import sync_playwright
here = pathlib.Path(__file__).resolve().parent
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg = b.new_page(); pg.goto((here / 'guide.html').as_uri()); pg.wait_for_timeout(1500)
    pg.pdf(path=str(here.parent / 'ViralKaro-User-Guide.pdf'), format='A4', print_background=True, prefer_css_page_size=True)
    b.close()
