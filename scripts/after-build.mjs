// The website also offers the single-file version for download (dist/clipforge.html).
import { copyFileSync } from 'node:fs'
copyFileSync('dist-single/index.html', 'dist/clipforge.html')
