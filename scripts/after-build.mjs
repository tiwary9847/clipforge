// The website also offers the single-file version for download (dist/viralkaro.html).
import { copyFileSync } from 'node:fs'
copyFileSync('dist-single/index.html', 'dist/viralkaro.html')
