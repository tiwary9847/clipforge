import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Two builds:
//  • `vite build`               → dist/: the website. The editor loads first; tools, fonts, models and the guide load when needed.
//  • `vite build --mode single` → dist-single/index.html: one self-contained file (viralkaro.html) that works offline.

/** Lists the website's build files so the service worker can store them for offline use. */
function precacheList(): Plugin {
  return {
    name: 'precache-list',
    apply: 'build',
    closeBundle() {
      const out = 'dist'
      const files: string[] = []
      const walk = (d: string) => {
        for (const f of readdirSync(join(out, d))) {
          const p = d ? `${d}/${f}` : f
          if (statSync(join(out, p)).isDirectory()) walk(p)
          else if (p.startsWith('assets/')) files.push('./' + p)
        }
      }
      walk('')
      writeFileSync(join(out, 'precache.json'), JSON.stringify(files))
    },
  }
}

export default defineConfig(({ mode }) =>
  mode === 'single'
    ? {
        plugins: [react(), viteSingleFile()],
        publicDir: false,
        build: { target: 'es2020', outDir: 'dist-single', emptyOutDir: true },
      }
    : {
        base: './',
        plugins: [react(), precacheList()],
        build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
      },
)
