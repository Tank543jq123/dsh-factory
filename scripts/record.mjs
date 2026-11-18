import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { connect } from './cdp.mjs'

const FRAMES = '/tmp/dsh-factory-frames'
const OUT = '/home/tank543/src/dsh-factory/docs/dsh-factory-demo.mp4'
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const cdp = await connect(9333)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.reload', { ignoreCache: false })
await cdp.waitFor(`!!document.querySelector('.df-strip')`, 20000)
await cdp.evaluate(`window.__dshFactory.openSession('session-d8284111-80ee-4c6c-87e1-e5dd60d8032c'); 'opened'`)
await new Promise((r) => setTimeout(r, 1200))
await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.trim()==='工厂'); if (b) b.click(); return !!b })()`)
await cdp.waitFor(`!!document.querySelector('.df-view .df-board')`, 20000)
await new Promise((r) => setTimeout(r, 500))

const clickText = async (text) => {
  const ok = await cdp.evaluate(`(() => { const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}); if (el) el.click(); return !!el })()`)
  if (!ok) console.log('missing', text)
  await new Promise((r) => setTimeout(r, 250))
}
await clickText('水流管道')

let frame = 0
let recording = true
const framePaths = []
cdp.on('Page.screencastFrame', (params) => {
  if (!recording) return
  const path = `${FRAMES}/frame-${String(frame).padStart(5, '0')}.jpg`
  writeFileSync(path, Buffer.from(params.data, 'base64'))
  framePaths.push(path)
  frame += 1
  cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {})
})

await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1600, maxHeight: 900, everyNthFrame: 1 })

// Start the real-event replay in water theme (skill scan + tool window).
await cdp.evaluate(`(() => { const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='重播本轮'); if (el) el.click(); return !!el })()`)
await new Promise((r) => setTimeout(r, 9000))
// Switch to pixel theme and replay the same real turn again.
await clickText('像素工厂')
await new Promise((r) => setTimeout(r, 400))
await cdp.evaluate(`(() => { const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='重播本轮'); if (el) el.click(); return !!el })()`)
await new Promise((r) => setTimeout(r, 9000))

recording = false
await cdp.send('Page.stopScreencast')
await cdp.close()

console.log('frames', framePaths.length)
if (framePaths.length === 0) throw new Error('no screencast frames')
const fps = 12
execFileSync('ffmpeg', [
  '-y',
  '-framerate', String(fps),
  '-i', `${FRAMES}/frame-%05d.jpg`,
  '-vf', 'crop=1160:699:356:90,scale=1160:699,format=yuv420p',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-movflags', '+faststart',
  OUT,
], { stdio: 'inherit' })
console.log('wrote', OUT)
