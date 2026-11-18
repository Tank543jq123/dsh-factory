import { connect } from './cdp.mjs'
const OUT = '/home/tank543/src/dsh-factory/docs/screenshots'
const cdp = await connect(9333)
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
await cdp.send('Page.reload')
await cdp.waitFor(`!!document.querySelector('.df-strip')`, 20000)
await cdp.evaluate(`window.__dshFactory.openSession('session-d8284111-80ee-4c6c-87e1-e5dd60d8032c'); 'opened'`)
await new Promise((r) => setTimeout(r, 1200))
await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.trim()==='工厂'); if (b) b.click(); return !!b })()`)
await cdp.waitFor(`!!document.querySelector('.df-view .df-board')`, 20000)
const click = async (text) => {
  const ok = await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)}); if (b) b.click(); return !!b })()`)
  if (!ok) console.log('missing', text)
  await new Promise((r) => setTimeout(r, 300))
}
await click('水流管道')
const resetScroll = async () => {
  await cdp.evaluate(`(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    const view = document.querySelector('.df-view')
    if (view) view.scrollTop = 0
    return 'reset'
  })()`)
  await new Promise((r) => setTimeout(r, 200))
}
const clip = async () => {
  await resetScroll()
  return cdp.evaluate(`(() => { const root=document.querySelector('.df-view .df-root'); const board=document.querySelector('.df-view .df-board'); const r=root.getBoundingClientRect(); const b=board.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:Math.round(b.bottom-r.top)} })()`)
}
const shot = async (name) => { const c = await clip(); await cdp.screenshot(`${OUT}/${name}`, c, 2); console.log(name, c) }

await click('重播本轮')
try {
  await cdp.waitFor(`!!document.querySelector('.df-skill-scan')`, 40000)
  await new Promise((r) => setTimeout(r, 1300))
  await shot('static-water-skill-scan.png')
} catch (e) { console.log('skill', e.message) }

await click('重播本轮')
try {
  await cdp.waitFor(`!!document.querySelector('.df-tool-window')`, 20000)
  await new Promise((r) => setTimeout(r, 300))
  await shot('static-water-tool-window.png')
} catch (e) { console.log('tool', e.message) }

cdp.close()
