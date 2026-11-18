import { mkdirSync } from 'node:fs'
import { connect } from './cdp.mjs'

const SESSION = process.env.FACTORY_SESSION ?? 'session-d8284111-80ee-4c6c-87e1-e5dd60d8032c'
const OUT = '/home/tank543/src/dsh-factory/docs/screenshots'
mkdirSync(OUT, { recursive: true })

const cdp = await connect(9333)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 1600,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await cdp.send('Page.reload', { ignoreCache: false })
await cdp.waitFor(`!!document.querySelector('.df-strip')`, 20000)
console.log('page ready')

// Open the forked real session (it carries real tool + skill events).
await cdp.evaluate(`window.__dshFactory.openSession(${JSON.stringify(SESSION)}); 'opened'`)
await new Promise((resolve) => setTimeout(resolve, 1200))
const tabClicked = await cdp.evaluate(`(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  const tab = tabs.find((b) => b.textContent.trim() === '工厂')
  if (!tab) return false
  tab.click()
  return true
})()`)
if (!tabClicked) throw new Error('factory tab not found')
await cdp.waitFor(`!!document.querySelector('.df-view .df-root')`, 20000)
await new Promise((resolve) => setTimeout(resolve, 500))

const clickText = async (text) => {
  const ok = await cdp.evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})
    if (!el) return false
    el.click()
    return true
  })()`)
  if (!ok) console.log('missing button:', text)
  await new Promise((resolve) => setTimeout(resolve, 350))
}

const boardClip = async () => {
  const rect = await cdp.evaluate(`(() => {
    const root = document.querySelector('.df-view .df-root')
    const board = document.querySelector('.df-view .df-board')
    const r = root.getBoundingClientRect()
    const b = board.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: Math.round(b.bottom - r.top) }
  })()`)
  return rect
}

await clickText('像素工厂')
let clip = await boardClip()
await cdp.screenshot(`${OUT}/static-pixel-clean.png`, clip, 2)
console.log('pixel clean', clip)

await clickText('水流管道')
clip = await boardClip()
await cdp.screenshot(`${OUT}/static-water-clean.png`, clip, 2)
console.log('water clean', clip)

// Replay the real turn and catch the skill scan + tool window.
await clickText('像素工厂')
await clickText('重播本轮')
try {
  await cdp.waitFor(`!!document.querySelector('.df-skill-scan')`, 40000)
  await new Promise((resolve) => setTimeout(resolve, 1300))
  clip = await boardClip()
  await cdp.screenshot(`${OUT}/static-pixel-skill-scan.png`, clip, 2)
  console.log('skill scan captured')
} catch (error) {
  console.log('skill scan not seen:', error.message)
}
try {
  await clickText('重播本轮')
  await cdp.waitFor(`!!document.querySelector('.df-tool-window')`, 12000)
  clip = await boardClip()
  await cdp.screenshot(`${OUT}/static-pixel-tool-window.png`, clip, 2)
  console.log('tool window captured')
} catch (error) {
  console.log('tool window not seen:', error.message)
}

await cdp.close()
