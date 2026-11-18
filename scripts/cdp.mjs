/**
 * Minimal Chrome DevTools Protocol client for the local DSH page.
 * Used only by the screenshot / recording scripts, never by the plugin.
 */
export async function connect(port = 9333) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = targets.find((target) => target.type === 'page')
  if (page === undefined) throw new Error('no page target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let nextId = 0
  const pending = new Map()
  const listeners = new Map()
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data)
    if (data.id !== undefined) {
      const job = pending.get(data.id)
      if (job !== undefined) {
        pending.delete(data.id)
        if (data.error) job.reject(new Error(data.error.message))
        else job.resolve(data.result)
      }
      return
    }
    const handler = listeners.get(data.method)
    if (handler !== undefined) handler(data.params)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const on = (method, handler) => {
    listeners.set(method, handler)
  }
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluation failed')
    return result.result?.value
  }
  const waitFor = async (expression, timeoutMs = 15000) => {
    const started = Date.now()
    for (;;) {
      const value = await evaluate(expression)
      if (value) return value
      if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${expression}`)
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }
  const screenshot = async (path, clip, scale = 1) => {
    const params = { format: 'png', captureBeyondViewport: true }
    if (clip !== undefined) params.clip = { ...clip, scale }
    const result = await send('Page.captureScreenshot', params)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path, Buffer.from(result.data, 'base64'))
    return path
  }
  return { ws, send, on, evaluate, waitFor, screenshot, close: () => ws.close() }
}
