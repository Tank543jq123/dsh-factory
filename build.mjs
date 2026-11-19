import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const write = (path, value) => {
  mkdirSync(dirname(resolve(root, path)), { recursive: true })
  writeFileSync(resolve(root, path), value)
}

write('lib/index.js', read('src/host.js'))

const client = read('src/client.js')
const laneConst = ''
write('lib/client.js', `window.__ModuleLoader__.load({
  id: "dsh-factory",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${client}
    return module.exports;
  }
});
`)

console.log('built lib/index.js and lib/client.js')
