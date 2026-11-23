// Make a Pro licence by hand (owner, gifts, testers). Keep the private key file secret.
//   node server/make-licence.mjs <private-key.jwk.json> <who> <month|year|life> [owner|gift]
import fs from 'node:fs'
import { makeLicence } from './worker.js'
const [file, who, plan = 'life', src = 'gift'] = process.argv.slice(2)
if (!file || !who) {
  console.error('usage: node server/make-licence.mjs <private-key.jwk.json> <who> <month|year|life> [owner|gift]')
  process.exit(1)
}
console.log(await makeLicence({ LICENCE_PRIVATE_JWK: fs.readFileSync(file, 'utf8') }, who, src, plan))
