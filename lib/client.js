window.__ModuleLoader__.load({
  id: "dsh-factory",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
/**
 * dsh-factory — browser half.
 *
 * Two skins (pixel factory / water pipes) over one real-event read model:
 * `useProjection('factoryTrail')` from the host session projection.
 *
 * The client keeps a small playback queue so each real event gets a short
 * 0.6–1.5s beat before the box moves on. The queue is empty when the session
 * is idle: the box simply parks at the last station. Nothing animates without
 * a durable event behind it.
 */
const React = require('react')
const {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} = React
const h = React.createElement
let createPortal = null
try {
  const ReactDOM = require('react-dom')
  createPortal = typeof ReactDOM?.createPortal === 'function' ? ReactDOM.createPortal : null
} catch {
  createPortal = null
}

const NS = 'dsh-factory'
const THEME_KEY = `${NS}:theme`
const SPEED_KEY = `${NS}:speed`

/* ------------------------------------------------------------------ */
/* Static floor plan                                                   */
/* ------------------------------------------------------------------ */

const NODES = {
  intake: { cx: 95, cy: 288, w: 96, h: 64, name: '入口', sub: '用户输入', icon: 'box' },
  orchestrate: { cx: 255, cy: 288, w: 128, h: 96, name: '编排车间', sub: 'turn 循环', icon: 'loop' },
  assembly: { cx: 430, cy: 132, w: 160, h: 96, name: '装配车间', sub: 'system / 上下文', icon: 'layers' },
  skill: { cx: 430, cy: 415, w: 160, h: 96, name: 'Skill 车间', sub: '技能库按需注入', icon: 'book' },
  route: { cx: 610, cy: 128, w: 128, h: 96, name: '路由车间', sub: '多对话 / 子代理', icon: 'split' },
  tools: { cx: 620, cy: 415, w: 160, h: 96, name: 'MCP / 工具车间', sub: '外部接口', icon: 'wrench' },
  model: { cx: 820, cy: 288, w: 128, h: 128, name: '模型车间', sub: '推理', icon: 'gear' },
  storage: { cx: 845, cy: 470, w: 160, h: 96, name: '仓储', sub: '工作区 / 记忆', icon: 'crate' },
  exit: { cx: 940, cy: 288, w: 96, h: 64, name: '出口', sub: '回答', icon: 'door' },
}

const WORKSHOP_IDS = ['orchestrate', 'assembly', 'skill', 'route', 'model', 'tools', 'storage']

const EDGES = [
  { id: 'entry', from: 'intake', to: 'intake', d: 'M24 304 L52 296', label: '物料', lx: 36, ly: 288, main: true },
  { id: 'intake', from: 'intake', to: 'orchestrate', d: 'M138 300 L190 290', label: '', main: true },
  { id: 'orchestrate-assembly', from: 'orchestrate', to: 'assembly', d: 'M300 278 L330 226 L355 172', label: '拼装', lx: 320, ly: 206, main: true },
  { id: 'assembly-model', from: 'assembly', to: 'model', d: 'M505 100 V52 H720 V232 H750', label: '请求', lx: 610, ly: 42, main: true },
  { id: 'skill-assembly', from: 'skill', to: 'assembly', d: 'M430 367 L430 270 L430 182', label: '按需注入', lx: 440, ly: 274, main: false },
  { id: 'orchestrate-route', from: 'orchestrate', to: 'route', d: 'M305 238 V196 L540 160', label: '派工', lx: 420, ly: 186, main: false },
  { id: 'route-model', from: 'route', to: 'model', d: 'M680 150 L720 200 L750 238', label: '回流', lx: 714, ly: 192, main: false },
  { id: 'model-tools', from: 'model', to: 'tools', d: 'M820 344 L778 372 L700 414', label: '工具', lx: 770, ly: 360, main: true },
  { id: 'tools-storage', from: 'tools', to: 'storage', d: 'M700 462 L770 456', label: '读写', lx: 735, ly: 448, main: false },
  { id: 'tools-assembly', from: 'tools', to: 'assembly', d: 'M540 368 L540 330 L505 204', label: '回填', lx: 548, ly: 322, main: false, thin: true },
  { id: 'model-exit', from: 'model', to: 'exit', d: 'M890 300 L908 296', label: '回答', lx: 900, ly: 288, main: true },
  { id: 'route-exit', from: 'route', to: 'exit', d: 'M680 100 L800 64 L920 250', label: '子代理', lx: 800, ly: 52, main: false, thin: true },
  { id: 'error-loop', from: 'tools', to: 'model', d: 'M700 392 L736 344 L750 312', label: '失败回环', lx: 744, ly: 388, main: false, thin: true, error: true },
  { id: 'skip-bypass', from: 'orchestrate', to: 'exit', d: 'M255 338 L500 548 L920 330', label: '跳过支路', lx: 600, ly: 540, main: false, thin: true, skip: true },
]

const WORKER_POSTS = [
  { id: 'assembly', x: 356, y: 196, flip: false },
  { id: 'skill', x: 336, y: 470, flip: false },
  { id: 'route', x: 700, y: 178, flip: true },
  { id: 'tools', x: 516, y: 472, flip: false },
  { id: 'model', x: 932, y: 330, flip: true },
  { id: 'storage', x: 920, y: 508, flip: true },
]

const STAGE_LABEL = {
  intake: '封箱待发',
  orchestrate: '排队等工',
  assembly: '拆箱 / 拼装',
  skill: '拆书 / 贴标',
  tools: '接口加工',
  route: '岔道分流',
  model: '推理加工',
  storage: '入库存档',
  exit: '再封箱 / 出货',
}

const RESPONSIBILITY = {
  intake: '用户输入与附件从入口进场，装进一个封好的箱子。',
  orchestrate: '把用户输入拆成 turn / step，决定每一步先拼装、再请求模型、再执行工具。',
  assembly: '把 system prompt、上下文、技能正文和工具 schema 拼成一次模型请求。',
  skill: '按需从技能库抽取技能正文；没命中就不占 token，箱子直接走跳过支路。',
  tools: '把模型请求变成对外部工具 / MCP 服务的真实调用，并把结果回填给模型。',
  route: '在多对话与子代理之间分流，决定这一箱物料走单轮、检索还是派工。',
  model: '把拼装好的请求送进模型，转成文本与工具调用意图；失败会触发重试回环。',
  storage: '读写工作区文件与会话记忆，把物料存进仓库或从仓库取出。',
  exit: '这一轮完成，箱子重新封好，带着回答从出口离开。',
}

const CONFIG_POINTS = {
  intake: [
    { name: 'Composer / 附件', where: '@deepseek-ai/dsh-client-ui-conversation' },
    { name: 'inbox 投影', where: 'agent/inbox/spliced · @deepseek-ai/dsh-agent-loop' },
  ],
  orchestrate: [
    { name: 'maxParallelToolCalls', where: '@deepseek-ai/dsh-agent-loop 配置 · profile cordis.patch.yml' },
    { name: 'agent/pre-step', where: 'Cordis waterfall · @deepseek-ai/dsh-agent' },
    { name: 'turn/step 生命周期', where: 'session/event · @deepseek-ai/dsh-session' },
  ],
  assembly: [
    { name: 'systemPrompt.section()', where: '@deepseek-ai/dsh-system-prompt 插件 API' },
    { name: 'AGENTS.md', where: '$DSH_HOME/AGENTS.md + 工作区 AGENTS.md · dsh-agent-instructions' },
    { name: 'maxBytes', where: 'dsh-agent-instructions 配置（profile cordis.patch.yml）' },
    { name: 'compaction', where: '@deepseek-ai/dsh-compaction-basic / dsh-compaction-tool-result-pruner' },
  ],
  skill: [
    { name: '技能目录', where: '~/.dsh/skills · .dsh/skills · ~/.agents/skills · .agents/skills' },
    { name: 'skill 工具', where: '@deepseek-ai/dsh-tool-skill（toolName=skill）' },
    { name: '技能清单', where: 'ctx.skills.list() · @deepseek-ai/dsh-skill' },
  ],
  route: [
    { name: 'maxDepth', where: '@deepseek-ai/dsh-subagent 配置' },
    { name: 'toolName', where: '@deepseek-ai/dsh-tool-subagent（默认 subagent）' },
    { name: 'provider', where: 'subagent provider 行（spawn / fork / ACP / Codex / Claude）' },
  ],
  model: [
    { name: 'provider / model', where: 'llm 配置 · profile cordis.patch.yml' },
    { name: 'apiKeyEnv', where: 'provider 配置只接受环境变量名' },
    { name: 'contextWindow', where: 'request/context 事件 / 模型目录' },
    { name: 'reasoningEffort', where: 'agent/request waterfall' },
  ],
  tools: [
    { name: 'MCP serverName / transport', where: '@deepseek-ai/dsh-mcp-client 行 · profile cordis.patch.yml' },
    { name: '工具命名', where: 'mcp__<server>__<tool>' },
    { name: '工具注册表', where: 'ctx.tools · @deepseek-ai/dsh-tools' },
  ],
  storage: [
    { name: '工作区 cwd', where: 'Session header / 工作区选择器' },
    { name: '会话日志', where: '$DSH_HOME/sessions/<workspace>/<session>/session.v4.jsonl.zstd' },
    { name: '投影缓存', where: '$DSH_HOME/storages/session_projcache' },
  ],
}

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

function clip(value, max) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function readLocal(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value
  } catch {
    return fallback
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage can be unavailable in private windows */
  }
}

function libraryShelf(value) {
  const list = Array.isArray(value?.libraries) ? value.libraries.slice(0, 4) : []
  const shelf = list.map((item) => ({
    id: String(item.id ?? ''),
    label: String(item.label ?? item.id ?? '技能库'),
    count: Number(item.count ?? 0),
    skills: Array.isArray(item.skills) ? item.skills : [],
    placeholder: false,
  }))
  while (shelf.length < 4) {
    shelf.push({
      id: `placeholder-${shelf.length}`,
      label: `技能库 ${shelf.length + 1}（未读取）`,
      count: 0,
      skills: [],
      placeholder: true,
    })
  }
  return shelf
}

async function fetchLibraries(sessionId) {
  try {
    const response = await fetch('/api/dsh-factory/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId ?? '' }),
      credentials: 'same-origin',
    })
    if (!response.ok) return null
    const body = await response.json()
    if (body?.ok === true && body.value) return body.value
    return null
  } catch {
    return null
  }
}

const LIBRARIES_CACHE = new Map()

function useLibraries(sessionId) {
  const [value, setValue] = useState(() => LIBRARIES_CACHE.get(sessionId) ?? null)
  useEffect(() => {
    let alive = true
    const cached = LIBRARIES_CACHE.get(sessionId)
    if (cached !== undefined && Date.now() - cached.at < 60_000) {
      setValue(cached.value)
      return undefined
    }
    fetchLibraries(sessionId).then((next) => {
      if (!alive || next === null) return
      LIBRARIES_CACHE.set(sessionId, { value: next, at: Date.now() })
      setValue(next)
    })
    return () => {
      alive = false
    }
  }, [sessionId])
  return value
}

async function fetchLive(sessionId) {
  try {
    const response = await fetch('/api/dsh-factory/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      credentials: 'same-origin',
    })
    if (!response.ok) return null
    const body = await response.json()
    return body?.ok === true ? body.value ?? null : null
  } catch {
    return null
  }
}

function useLivePhase(sessionId, running) {
  const [value, setValue] = useState(null)
  useEffect(() => {
    if (typeof sessionId !== 'string' || sessionId === '' || running !== true) {
      setValue(null)
      return undefined
    }
    let alive = true
    let timer = null
    const tick = async () => {
      const next = await fetchLive(sessionId)
      if (!alive) return
      setValue(next)
      timer = setTimeout(tick, 360)
    }
    tick()
    return () => {
      alive = false
      if (timer !== null) clearTimeout(timer)
    }
  }, [sessionId, running])
  return value
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const value = readLocal(THEME_KEY, 'pixel')
    return value === 'water' ? 'water' : 'pixel'
  })
  const change = useCallback((next) => {
    setTheme(next)
    writeLocal(THEME_KEY, next)
  }, [])
  return [theme, change]
}

function skillOfTurn(view) {
  const skills = Array.isArray(view?.skills) ? view.skills : []
  const turn = view?.turn
  const current = skills.filter((entry) => entry.turn === turn)
  if (current.length > 0) return current[current.length - 1].name
  return skills.length > 0 ? skills[skills.length - 1].name : ''
}

function routeOfView(view) {
  const turn = view?.turn
  const tools = (view?.tools ?? []).filter((tool) => tool.turn === turn)
  const subagents = (view?.subagents ?? []).filter((entry) => {
    if (entry.at === undefined) return false
    return view?.startedAt === null || view?.startedAt === undefined ? true : entry.at >= view.startedAt
  })
  if (subagents.length > 0) {
    return {
      label: '子代理',
      detail: `${subagents.length} 个子代理 · ${subagents[subagents.length - 1].label}`,
      tone: 'route',
    }
  }
  const retrieval = tools.find((tool) => /search|recall|grep|glob|retriev/i.test(tool.name ?? ''))
  if (retrieval) {
    return {
      label: retrieval.chars > 0 ? '检索命中' : '检索未命中',
      detail: `${retrieval.name} · ${retrieval.chars} 字符`,
      tone: retrieval.chars > 0 ? 'hit' : 'miss',
    }
  }
  return { label: '单轮', detail: '不派工，直连模型', tone: 'single' }
}

function cleanLabel(value) {
  return String(value ?? '')
    .replace(/\[object Object\]/g, '…')
    .replace(/undefined|null/g, '…')
}

function toDisplay(event) {
  if (event === null || event === undefined) return null
  const workshop = event.kind === 'turn/end' ? 'exit' : event.workshop
  const rawLabel = cleanLabel(event.label)
  const label = event.kind === 'turn/end' && rawLabel.includes('…')
    ? '本轮结束'
    : rawLabel
  return {
    workshop,
    label,
    detail: cleanLabel(event.detail),
    kind: event.kind ?? '',
    seq: event.seq ?? -1,
    time: event.time ?? 0,
    status: event.status ?? '',
  }
}

function eventDuration(event, speed) {
  let base = 900
  if (event.kind === 'turn/start' || event.kind === 'turn/end') base = 1100
  else if (event.workshop === 'skill') base = 1500
  else if (event.workshop === 'tools') base = 1100
  else if (event.workshop === 'route') base = 1000
  else if (event.workshop === 'model') base = 850
  return Math.round(base * (speed === 0.5 ? 2 : 1))
}

/* ------------------------------------------------------------------ */
/* Playback queue                                                      */
/* ------------------------------------------------------------------ */

function usePlayback(view, speed, stepMode, livePhase) {
  const [display, setDisplay] = useState(null)
  const [queueView, setQueueView] = useState([])
  const [playing, setPlaying] = useState(false)
  const [tick, setTick] = useState(0)
  const queue = useRef([])
  const lastSeq = useRef(-1)
  const baseline = useRef(false)
  const playingRef = useRef(false)
  const speedRef = useRef(speed)
  const stepRef = useRef(stepMode)
  const sid = useRef(null)
  const liveAt = useRef(0)

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    stepRef.current = stepMode
    if (!stepMode && !playingRef.current && queue.current.length > 0) setTick((value) => value + 1)
  }, [stepMode])

  const syncQueue = useCallback(() => {
    setQueueView(queue.current.slice())
  }, [])

  useEffect(() => {
    const nextSid = view?.sid ?? null
    if (sid.current !== nextSid) {
      sid.current = nextSid
      baseline.current = false
      lastSeq.current = -1
      liveAt.current = 0
      queue.current = []
      playingRef.current = false
      setQueueView([])
      setPlaying(false)
      setDisplay(null)
    }
    if (!view) return
    const events = Array.isArray(view.events) ? view.events : []
    if (!baseline.current) {
      baseline.current = true
      lastSeq.current = events.length > 0 ? events[events.length - 1].seq : -1
      const last = events.length > 0 ? events[events.length - 1] : null
      setDisplay(last !== null
        ? toDisplay(last)
        : view.running
          ? {
              workshop: 'intake',
              label: '等待真实事件',
              detail: '',
              kind: 'idle',
              seq: -1,
              time: view.updatedAt,
              status: '',
            }
          : null)
      return
    }
    const fresh = events.filter((event) => event.seq > lastSeq.current)
    if (fresh.length === 0) return
    lastSeq.current = fresh[fresh.length - 1].seq
    queue.current.push(...fresh)
    if (queue.current.length > 60) queue.current.splice(0, queue.current.length - 60)
    syncQueue()
    if (!playingRef.current && !stepRef.current) setTick((value) => value + 1)
  }, [view, syncQueue])

  useEffect(() => {
    if (stepMode) return undefined
    if (playingRef.current) return undefined
    const next = queue.current[0]
    if (next === undefined) return undefined
    playingRef.current = true
    queue.current.shift()
    syncQueue()
    setDisplay(toDisplay(next))
    setPlaying(true)
    const timer = setTimeout(() => {
      playingRef.current = false
      setPlaying(false)
      setTick((value) => value + 1)
    }, eventDuration(next, speedRef.current))
    return () => {
      clearTimeout(timer)
    }
  }, [tick, stepMode, syncQueue])

  const step = useCallback(() => {
    if (queue.current.length === 0) return
    const next = queue.current.shift()
    syncQueue()
    setDisplay(toDisplay(next))
  }, [syncQueue])

  const skip = useCallback(() => {
    if (queue.current.length === 0) return
    const last = queue.current[queue.current.length - 1]
    queue.current = []
    syncQueue()
    setDisplay(toDisplay(last))
  }, [syncQueue])

  useEffect(() => {
    if (livePhase === null || livePhase === undefined) return
    const entries = Array.isArray(livePhase.history) && livePhase.history.length > 0
      ? livePhase.history
      : [livePhase]
    let added = false
    for (const entry of entries) {
      const at = Number(entry.at)
      if (!Number.isFinite(at) || at <= liveAt.current) continue
      liveAt.current = at
      if (entry.phase !== 'pre-step' && entry.phase !== 'model-request') continue
      const workshop = entry.phase === 'model-request' ? 'model' : 'assembly'
      queue.current.push({
        seq: -at,
        time: at,
        workshop,
        kind: `agent/${entry.phase}`,
        label: typeof entry.label === 'string' ? entry.label : `agent/${entry.phase}`,
        detail: `host 进程事件 · ${entry.phase}`,
        status: '',
      })
      if (queue.current.length > 60) queue.current.shift()
      added = true
    }
    if (!added) return
    syncQueue()
    if (!playingRef.current && !stepRef.current) setTick((value) => value + 1)
  }, [livePhase, syncQueue])

  const replay = useCallback((events) => {
    if (!Array.isArray(events) || events.length === 0) return
    queue.current = events.slice(-60)
    syncQueue()
    playingRef.current = false
    setPlaying(false)
    setDisplay(null)
    setTick((value) => value + 1)
  }, [syncQueue])

  return { display, queue: queueView, playing, step, skip, replay }
}

/* ------------------------------------------------------------------ */
/* SVG primitives                                                      */
/* ------------------------------------------------------------------ */

function Icon({ name, x, y, size = 20, className }) {
  const half = size / 2
  const props = {
    className: `df-icon ${className ?? ''}`,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }
  const paths = {
    box: [
      h('path', { key: 'a', d: 'M-9 -6 L0 -10 L9 -6 L9 7 L0 11 L-9 7 Z' }),
      h('path', { key: 'b', d: 'M-9 -6 L0 -2 L9 -6 M0 -2 V11' }),
    ],
    loop: [
      h('path', { key: 'a', d: 'M-8 -3 A8 8 0 1 1 -8 4' }),
      h('path', { key: 'b', d: 'M-11 -7 L-8 -3 L-4 -6' }),
    ],
    layers: [
      h('path', { key: 'a', d: 'M-9 -5 L0 -10 L9 -5 L0 0 Z' }),
      h('path', { key: 'b', d: 'M-9 1 L0 6 L9 1' }),
      h('path', { key: 'c', d: 'M-9 6 L0 11 L9 6' }),
    ],
    book: [
      h('path', { key: 'a', d: 'M-9 -8 H-1 A4 4 0 0 1 3 -4 V9 H-9 Z' }),
      h('path', { key: 'b', d: 'M9 -8 H1 A4 4 0 0 0 -3 -4 V9 H9 Z' }),
    ],
    split: [
      h('path', { key: 'a', d: 'M-10 0 H-2 M-2 0 L6 -7 H10 M-2 0 L6 7 H10' }),
    ],
    wrench: [
      h('path', { key: 'a', d: 'M-9 8 L-1 0 M-3 -7 A5 5 0 1 0 4 0 L-1 5' }),
      h('circle', { key: 'b', cx: -5, cy: -5, r: 2.4 }),
    ],
    gear: [
      h('circle', { key: 'a', cx: 0, cy: 0, r: 4 }),
      h('path', { key: 'b', d: 'M0 -10 V-7 M0 7 V10 M-10 0 H-7 M7 0 H10 M-7 -7 L-5 -5 M5 5 L7 7 M-7 7 L-5 5 M5 -5 L7 -7' }),
    ],
    crate: [
      h('path', { key: 'a', d: 'M-9 -6 L0 -10 L9 -6 L9 7 L0 11 L-9 7 Z' }),
      h('path', { key: 'b', d: 'M-9 -6 L0 -2 L9 -6 M-9 7 L0 3 L9 7' }),
    ],
    door: [
      h('path', { key: 'a', d: 'M-6 -10 H6 V10 H-6 Z' }),
      h('path', { key: 'b', d: 'M2 0 H10 M7 -3 L10 0 L7 3' }),
    ],
  }
  return h('g', { transform: `translate(${x} ${y})`, ...props }, paths[name] ?? paths.box)
}

function Gear({ x, y, r, teeth = 8, className }) {
  const spokes = []
  for (let index = 0; index < teeth; index += 1) {
    const angle = (index / teeth) * Math.PI * 2
    const inner = r * 0.78
    const outer = r * 1.18
    spokes.push(h('line', {
      key: `s${index}`,
      x1: x + Math.cos(angle) * inner,
      y1: y + Math.sin(angle) * inner,
      x2: x + Math.cos(angle) * outer,
      y2: y + Math.sin(angle) * outer,
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
    }))
  }
  return h('g', { className: `df-gear ${className ?? ''}` },
    h('circle', { cx: x, cy: y, r, fill: 'none', stroke: 'currentColor', strokeWidth: 2.4 }),
    h('circle', { cx: x, cy: y, r: r * 0.28, fill: 'currentColor', opacity: 0.55 }),
    ...spokes,
  )
}

/* ------------------------------------------------------------------ */
/* Station art                                                         */
/* ------------------------------------------------------------------ */

function PixelBuilding({ node, active, skipped, done, error }) {
  const { cx, cy, w, h: nh } = node
  const d = 18
  const left = cx - w / 2
  const top = cy - nh
  const height = nh - d / 2
  const steel = ['assembly', 'model', 'tools', 'route'].includes(node.id)
  const topPoint = `${cx},${top - d / 2}`
  const topLeft = `${left},${top}`
  const topRight = `${left + w},${top}`
  const topBottom = `${cx},${top + d / 2}`
  const leftFace = `${topLeft} ${topBottom} ${cx},${top + d / 2 + height} ${left},${top + height}`
  const rightFace = `${topBottom} ${topRight} ${left + w},${top + height} ${cx},${top + d / 2 + height}`
  const sideFace = `${topRight} ${left + w + d},${top - d / 2} ${left + w + d},${top - d / 2 + height} ${left + w},${top + height}`
  return h('g', { className: 'df-pixel-only' },
    h('ellipse', { cx, cy: cy + 2, rx: w * 0.64, ry: 13, className: 'df-shadow' }),
    h('polygon', { points: `${topLeft} ${topPoint} ${topRight} ${topBottom}`, className: 'df-roof-3d' }),
    h('polyline', { points: `${topLeft} ${topPoint} ${topRight}`, className: 'df-roof-hi' }),
    h('polygon', { points: leftFace, className: 'df-wall-left' }),
    h('polygon', { points: rightFace, className: 'df-wall-right' }),
    h('polygon', { points: sideFace, className: 'df-wall-side' }),
    h('rect', { x: left + 12, y: top + 18, width: 15, height: 11, className: 'df-window-3d' }),
    h('rect', { x: left + 38, y: top + 18, width: 15, height: 11, className: 'df-window-3d' }),
    h('rect', { x: left + 22, y: cy - 26, width: 24, height: 26, className: 'df-door-glow' }),
    h('rect', { x: left + 24, y: cy - 24, width: 20, height: 24, className: 'df-door-3d' }),
    h('rect', { x: cx - 9, y: top - d / 2 - 7, width: 18, height: 7, rx: 1, className: 'df-roof-vent' }),
    node.id === 'orchestrate'
      ? h('g', { className: 'df-dial', transform: `translate(${cx} ${top - d / 2 - 12})` },
          h('circle', { cx: 0, cy: 0, r: 11 }),
          h('line', { x1: 0, y1: 0, x2: 0, y2: -7 }),
          h('line', { x1: 0, y1: 0, x2: 5, y2: 3 }),
          h('circle', { cx: 0, cy: 0, r: 1.6, className: 'df-dial-pin' }),
        )
      : null,
    node.id === 'route'
      ? h('g', { className: 'df-switch', transform: `translate(${left + 18} ${cy - 12})` },
          h('rect', { x: -6, y: -2, width: 12, height: 6, rx: 1 }),
          h('line', { x1: 0, y1: 0, x2: 8, y2: -10, className: 'df-switch-lever' }),
          h('circle', { cx: 8, cy: -10, r: 2.2, className: 'df-switch-knob' }),
        )
      : null,
    node.id === 'intake' || node.id === 'exit'
      ? h('path', { d: `M${left + 18} ${cy} V${cy - 30} Q${cx} ${cy - 42} ${left + w - 18} ${cy - 30} V${cy}`, className: 'df-arch' })
      : null,
    steel ? h('line', { x1: cx + 16, y1: top - d / 2, x2: cx + 16, y2: top - d / 2 - 16, className: 'df-antenna' }) : null,
    steel ? h('circle', { cx: cx + 16, cy: top - d / 2 - 17, r: 2, className: 'df-antenna-tip' }) : null,
    h('g', { className: 'df-puffs' },
      h('circle', { cx: left + w - 24, cy: top - 34, r: 3.2 }),
      h('circle', { cx: left + w - 18, cy: top - 41, r: 4.4 }),
      h('circle', { cx: left + w - 26, cy: top - 48, r: 2.8 }),
    ),
    steel ? h('path', { d: `M${left + w + 7} ${top + 12} V${cy - 14}`, className: 'df-side-pipe' }) : null,
    h('rect', { x: left + w - 26, y: top - 24, width: 11, height: 24, className: 'df-chimney-3d' }),
    node.id === 'skill' ? h(Bookshelf, { x: left + 30, y: top + 34, theme: 'pixel' }) : null,
    active
      ? h('g', { className: 'df-smoke' },
          h('circle', { cx: left + w - 20, cy: top - 30, r: 4 }),
          h('circle', { cx: left + w - 13, cy: top - 40, r: 5 }),
          h('circle', { cx: left + w - 24, cy: top - 49, r: 3.5 }),
        )
      : null,
    node.id === 'assembly'
      ? h('g', { className: active ? 'df-piston df-on' : 'df-piston' },
          h('rect', { x: left + w - 38, y: top + 10, width: 7, height: 22, className: 'df-piston-rod' }),
          h('rect', { x: left + w - 43, y: top + 32, width: 17, height: 9, className: 'df-piston-head' }),
        )
      : null,
    node.id === 'tools'
      ? h('g', { className: active ? 'df-robot-arm df-on' : 'df-robot-arm' },
          h('rect', { x: left + w - 20, y: cy - 46, width: 8, height: 28, className: 'df-arm-base' }),
          h('rect', { x: left + w - 52, y: cy - 52, width: 38, height: 7, className: 'df-arm-boom' }),
          h('circle', { cx: left + w - 52, cy: cy - 49, r: 5, className: 'df-arm-joint' }),
        )
      : null,
    node.id === 'storage'
      ? h('g', { className: active ? 'df-crane df-on' : 'df-crane' },
          h('rect', { x: cx - 3, y: top - 42, width: 6, height: 30, className: 'df-crane-mast' }),
          h('rect', { x: cx - 20, y: top - 44, width: 40, height: 5, className: 'df-crane-boom' }),
          h('rect', { x: cx + 14, y: top - 38, width: 2, height: 22, className: 'df-crane-hook' }),
        )
      : null,
    h('rect', { x: left - 2, y: cy - 6, width: w + d + 4, height: 6, className: 'df-plinth' }),
    done && !skipped ? h('text', { x: left + w + 4, y: top - d / 2 - 6, textAnchor: 'end', className: 'df-check' }, '✓') : null,
    error ? h('ellipse', { cx, cy: cy - nh / 2, rx: w * 0.7, ry: nh * 0.7, className: 'df-error-ring' }) : null,
  )
}

function WaterTank({ node, active, skipped, done, error }) {
  const { cx, cy, w, h: nh } = node
  const left = cx - w / 2
  const top = cy - nh
  const bottom = cy - 10
  const radius = Math.min(18, w / 3)
  return h('g', { className: 'df-water-only' },
    h('ellipse', { cx, cy: cy + 2, rx: w * 0.64, ry: 14, className: 'df-shadow' }),
    h('rect', { x: left, y: top, width: w, height: nh - 6, rx: radius, className: 'df-tank-3d' }),
    h('ellipse', { cx, cy: top, rx: w / 2, ry: 10, className: 'df-tank-top' }),
    h('path', { d: `M${cx - w / 2 + 6} ${top} Q${cx} ${top - 8} ${cx + w / 2 - 6} ${top}`, className: 'df-tank-hi' }),
    h('path', { d: `M${left + 8} ${bottom - 24} Q${cx - 20} ${bottom - 32} ${cx} ${bottom - 24} T${left + w - 8} ${bottom - 24}`, className: 'df-water-line' }),
    h('rect', { x: left + w - 16, y: top + 14, width: 9, height: nh - 30, rx: 5, className: 'df-tank-gauge' }),
    h('circle', { cx: left + 20, cy: top + 26, r: 4, className: 'df-bubble' }),
    h('circle', { cx: left + 36, cy: top + 38, r: 2.5, className: 'df-bubble df-bubble-b' }),
    h('circle', { cx: left + w - 30, cy: top + 30, r: 3, className: 'df-bubble df-bubble-c' }),
    node.id === 'skill' ? h(Bookshelf, { x: left + 38, y: top + 38, theme: 'water' }) : null,
    h('circle', { cx: left - 4, cy: cy - nh / 2, r: 9, className: 'df-valve' }),
    h('line', { x1: left - 12, y1: cy - nh / 2, x2: left + 4, y2: cy - nh / 2, className: 'df-valve-line' }),
    h('line', { x1: left - 4, y1: cy - nh / 2 - 7, x2: left - 4, y2: cy - nh / 2 + 7, className: 'df-valve-line' }),
    h('path', { d: `M${left + w - 10} ${cy - 18} H${left + w + 14} V${cy + 6}`, className: 'df-pipe-out' }),
    active
      ? h('g', { className: 'df-bubbles' },
          h('circle', { cx: left + 26, cy: top + 20, r: 3 }),
          h('circle', { cx: left + 44, cy: top + 16, r: 2 }),
        )
      : null,
    done && !skipped ? h('text', { x: left + w + 8, y: top - 10, textAnchor: 'end', className: 'df-check' }, '✓') : null,
    error ? h('ellipse', { cx, cy: cy - nh / 2, rx: w * 0.7, ry: nh * 0.7, className: 'df-error-ring' }) : null,
  )
}

function ModelExtras({ node, active, theme }) {
  const { cx, cy } = node
  const gearY = cy - 48
  if (theme === 'water') {
    return h('g', { className: active ? 'df-model-fx df-active' : 'df-model-fx' },
      h('circle', { cx, cy: gearY, r: 22, className: 'df-turbine-ring' }),
      h('path', { d: `M${cx - 19} ${gearY} A19 19 0 0 1 ${cx + 19} ${gearY}`, className: 'df-turbine-water' }),
      active ? h('g', { className: 'df-sparks' },
        h('circle', { cx: cx - 30, cy: gearY - 14, r: 2.5 }),
        h('circle', { cx: cx + 27, cy: gearY - 20, r: 2 }),
        h('circle', { cx: cx + 34, cy: gearY + 4, r: 1.8 }),
      ) : null,
    )
  }
  return h('g', { className: active ? 'df-model-fx df-active' : 'df-model-fx' },
    h(Gear, { x: cx - 18, y: gearY, r: 13, teeth: 8, className: 'df-gear-a' }),
    h(Gear, { x: cx + 16, y: gearY + 10, r: 10, teeth: 7, className: 'df-gear-b' }),
    active ? h('g', { className: 'df-sparks' },
      h('line', { x1: cx - 38, y1: gearY - 22, x2: cx - 30, y2: gearY - 14 }),
      h('line', { x1: cx + 28, y1: gearY - 26, x2: cx + 34, y2: gearY - 18 }),
      h('line', { x1: cx + 40, y1: gearY - 2, x2: cx + 48, y2: gearY - 8 }),
    ) : null,
  )
}

function Bookshelf({ x, y, theme }) {
  const books = theme === 'water'
    ? ['#a9c7c1', '#8fb0a8', '#d8e8e2', '#7fa9a1', '#4f7a78']
    : ['#c19a5b', '#9a6f3f', '#8fb0a8', '#9aa3b2', '#c19a5b']
  return h('g', { transform: `translate(${x} ${y})`, className: 'df-bookshelf' },
    h('rect', { x: -16, y: -22, width: 32, height: 40, rx: 2, className: 'df-shelf-frame' }),
    [0, 1, 2].map((row) => h('g', { key: row },
      h('rect', { x: -13, y: -18 + row * 12, width: 26, height: 2, className: 'df-shelf-board' }),
      [0, 1, 2, 3].map((book) => h('rect', {
        key: `${row}-${book}`,
        x: -12 + book * 6,
        y: -16 + row * 12,
        width: 4,
        height: 9,
        fill: books[(row * 4 + book) % books.length],
        className: 'df-shelf-book',
      })),
    )),
    h('rect', { x: -13, y: 14, width: 26, height: 2, className: 'df-shelf-board' }),
  )
}

function WorkerArt({ theme, active, walking, flip, carrying }) {
  const scale = flip ? -1 : 1
  const body = theme === 'water'
    ? h('g', { className: 'df-worker-body' },
        h('rect', { x: -5, y: -18, width: 10, height: 13, rx: 4, className: 'df-worker-torso' }),
        h('circle', { cx: 0, cy: -22, r: 5, className: 'df-worker-head' }),
        h('rect', { x: -9, y: -16, width: 4, height: 11, rx: 2, className: 'df-worker-arm df-arm-l' }),
        h('rect', { x: 5, y: -16, width: 4, height: 11, rx: 2, className: 'df-worker-arm df-arm-r' }),
        h('rect', { x: -5, y: -6, width: 4, height: 7, rx: 2, className: 'df-worker-leg df-leg-l' }),
        h('rect', { x: 1, y: -6, width: 4, height: 7, rx: 2, className: 'df-worker-leg df-leg-r' }),
        h('rect', { x: -6, y: -28, width: 12, height: 4, rx: 2, className: 'df-worker-helmet' }),
      )
    : h('g', { className: 'df-worker-body' },
        h('rect', { x: -5, y: -18, width: 10, height: 13, className: 'df-worker-torso' }),
        h('rect', { x: -4, y: -26, width: 8, height: 8, className: 'df-worker-head' }),
        h('rect', { x: -9, y: -16, width: 4, height: 11, className: 'df-worker-arm df-arm-l' }),
        h('rect', { x: 5, y: -16, width: 4, height: 11, className: 'df-worker-arm df-arm-r' }),
        h('rect', { x: -5, y: -6, width: 4, height: 7, className: 'df-worker-leg df-leg-l' }),
        h('rect', { x: 1, y: -6, width: 4, height: 7, className: 'df-worker-leg df-leg-r' }),
        h('rect', { x: -6, y: -29, width: 12, height: 4, className: 'df-worker-helmet' }),
      )
  return h('g', { className: 'df-worker', 'data-active': active ? '1' : '0', 'data-walking': walking ? '1' : '0', 'data-carrying': carrying ? '1' : '0' },
    h('g', { transform: `scale(${carrying ? 1.7 : 1.6})` },
      h('g', { className: 'df-footprints' },
        h('ellipse', { cx: -4, cy: 2, rx: 3.2, ry: 1.2 }),
        h('ellipse', { cx: -13, cy: 3, rx: 2.8, ry: 1.1 }),
        h('ellipse', { cx: -22, cy: 3.5, rx: 2.4, ry: 1 }),
      ),
      h('ellipse', { cx: 0, cy: 1, rx: 10, ry: 3.5, className: 'df-worker-shadow' }),
      h('g', { transform: `scale(${scale} 1)`, className: 'df-worker-scale' },
        body,
        carrying ? h('rect', { x: 7, y: -16, width: 11, height: 9, className: 'df-worker-carry' }) : null,
      ),
    ),
  )
}

function Worker({ x, y, theme, active, walking, flip, carrying }) {
  return h('g', { className: 'df-worker-seat', style: { transform: `translate(${x}px, ${y}px)` } },
    h(WorkerArt, { theme, active, walking, flip, carrying }),
  )
}

function WallPlaque({ node, active, skipped, done, error }) {
  const { cx, cy, w, h: nh } = node
  const width = Math.min(88, Math.max(70, w * 0.56))
  const y = cy - nh * 0.58
  return h('g', { className: 'df-plaque' },
    h('rect', { x: cx - width / 2, y, width, height: 21, rx: 3, className: 'df-plaque-bg' }),
    h('line', { x1: cx - width / 2 + 4, y1: y + 2, x2: cx + width / 2 - 4, y2: y + 2, className: 'df-plaque-hi' }),
    h('circle', { cx: cx - width / 2 + 7, cy: y + 10, r: 2.6, className: `df-sign-lamp ${active ? 'df-on' : ''} ${error ? 'df-bad' : ''} ${done ? 'df-ok' : ''}` }),
    h('text', { x: cx - width / 2 + 14, y: y + 8, className: 'df-plaque-name' }, clip(node.name, 9)),
    h('text', { x: cx - width / 2 + 14, y: y + 17, className: 'df-plaque-sub' }, clip(node.sub, 13)),
    skipped
      ? h('text', { x: cx + width / 2 - 4, y: y + 10, textAnchor: 'end', className: 'df-skip-badge' }, '跳过')
      : null,
  )
}


function Station({ node, view, display, playing, stepMode, selected, onSelect, theme }) {
  const stats = view?.workshops?.[node.id]
  const skipped = Array.isArray(view?.perTurn?.skipped) && view.perTurn.skipped.includes(node.id)
  const active = display?.workshop === node.id && (playing || stepMode)
  const done = (stats?.used ?? 0) > 0 && !active && !skipped
  const error = view?.lastError?.workshop === node.id
  const material = ['assembly', 'model', 'tools', 'route'].includes(node.id) ? 'steel' : 'wood'
  const classes = ['df-station', `df-station-${node.id}`, `df-material-${material}`]
  if (active) classes.push('df-active')
  if (skipped) classes.push('df-skipped')
  if (selected) classes.push('df-selected')
  if (error) classes.push('df-error')
  return h('g', {
    className: classes.join(' '),
    role: 'button',
    tabIndex: 0,
    'aria-label': `${node.name}：${node.sub}`,
    onClick: () => onSelect(node.id),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(node.id)
      }
    },
    style: { cursor: 'pointer' },
  },
    h('title', null, `${node.name} · ${node.sub}`),
    active
      ? h('ellipse', { cx: node.cx, cy: node.cy + 4, rx: node.w * 0.72, ry: 18, className: 'df-active-ring' })
      : null,
    theme === 'water'
      ? h(WaterTank, { node, active, skipped, done, error })
      : h(PixelBuilding, { node, active, skipped, done, error }),
    node.id === 'model' ? h(ModelExtras, { node, active, theme }) : null,
    h(WallPlaque, { node, active, skipped, done, error }),
  )
}

function Edge({ edge, display, playing, stepMode, view }) {
  const active = display?.workshop === edge.to && (playing || stepMode)
  const skipActive = edge.skip && Array.isArray(view?.perTurn?.skipped) && view.perTurn.skipped.length > 0
  const errorActive = edge.error && view?.lastError !== null && view?.lastError !== undefined
  const classes = ['df-edge']
  if (edge.main) classes.push('df-edge-main')
  if (edge.dashed) classes.push('df-edge-dashed')
  if (active) classes.push('df-edge-active')
  if (skipActive) classes.push('df-edge-skip')
  if (errorActive) classes.push('df-edge-error')
  if (edge.thin) {
    return h('g', { className: classes.join(' ') },
      h('path', { d: edge.d, className: 'df-service-line' }),
      h('path', { d: edge.d, className: 'df-service-flow' }),
      edge.label !== '' && edge.lx !== undefined
        ? h('text', { x: edge.lx, y: edge.ly, textAnchor: 'middle', className: 'df-edge-label' }, edge.label)
        : null,
    )
  }
  return h('g', { className: classes.join(' ') },
    h('path', { d: edge.d, className: 'df-dirt-path' }),
    h('path', { d: edge.d, className: 'df-belt-shadow' }),
    h('path', { d: edge.d, className: 'df-belt-side' }),
    h('path', { d: edge.d, className: 'df-belt-top' }),
    h('path', { d: edge.d, className: 'df-belt-slats' }),
    h('path', { d: edge.d, className: 'df-belt-rollers' }),
    h('path', { d: edge.d, className: 'df-belt-legs' }),
    h('path', { d: edge.d, className: 'df-edge-flow' }),
    edge.label !== '' && edge.lx !== undefined
      ? h('text', { x: edge.lx, y: edge.ly, textAnchor: 'middle', className: 'df-edge-label' }, edge.label)
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Material box                                                        */
/* ------------------------------------------------------------------ */

function boxPos(workshop) {
  const node = NODES[workshop] ?? NODES.intake
  const dx = workshop === 'skill' ? -72 : workshop === 'tools' ? -88 : 0
  const dy = workshop === 'storage' ? 8 : 0
  return { x: node.cx + dx, y: node.cy + dy }
}

function BoxArt({ stage, skill, theme, active }) {
  const w = 50
  const bh = 34
  const d = 24
  const top = `0,${-bh - d / 2} ${w / 2},${-bh} 0,${-bh + d / 2} ${-w / 2},${-bh}`
  const left = `${-w / 2},${-bh} 0,${-bh + d / 2} 0,${d / 2} ${-w / 2},0`
  const right = `0,${-bh + d / 2} ${w / 2},${-bh} ${w / 2},0 0,${d / 2}`
  const open = stage === 'assembly'
  const sticker = skill !== '' && ['skill', 'model', 'tools', 'storage', 'exit'].includes(stage)
  return h('g', { className: 'df-box-art' },
    active ? h('ellipse', { cx: 0, cy: 6, rx: 38, ry: 12, className: 'df-box-glow-3d' }) : null,
    h('polygon', { points: top, className: `df-box-top ${theme === 'water' ? 'df-box-top-water' : ''}` }),
    h('polyline', { points: `0,${-bh - d / 2} ${w / 2},${-bh} 0,${-bh + d / 2}`, className: 'df-box-hi' }),
    h('polygon', { points: left, className: `df-box-left ${theme === 'water' ? 'df-box-left-water' : ''}` }),
    h('polygon', { points: right, className: `df-box-right ${theme === 'water' ? 'df-box-right-water' : ''}` }),
    h('polygon', { points: `-4,${-bh - d / 2} 4,${-bh - d / 2} 4,${-bh + d / 2} -4,${-bh + d / 2}`, className: 'df-box-tape-top' }),
    h('polygon', { points: `-2,${-bh + d / 2} 6,${-bh + d / 2} 6,${d / 2} -2,${d / 2}`, className: 'df-box-tape-face' }),
    theme === 'water'
      ? h('g', null,
          h('circle', { cx: -14, cy: -10, r: 2.4, className: 'df-box-bubble' }),
          h('circle', { cx: 12, cy: 7, r: 2, className: 'df-box-bubble df-box-bubble-b' }),
        )
      : h('rect', { x: -19, y: -15, width: 9, height: 6, className: 'df-box-window' }),
    open
      ? h('g', { className: 'df-box-open' },
          h('polygon', { points: `-23,${-bh} -36,${-bh - 14} -10,${-bh + d / 2}`, className: 'df-flap-left' }),
          h('polygon', { points: `23,${-bh} 36,${-bh - 14} 10,${-bh + d / 2}`, className: 'df-flap-right' }),
          h('rect', { x: -14, y: -bh - 8, width: 28, height: 7, rx: 1, className: 'df-box-paper' }),
        )
      : null,
    open
      ? h('g', { className: 'df-unbox-sparks' },
          h('line', { x1: -34, y1: -22, x2: -44, y2: -30 }),
          h('line', { x1: 34, y1: -22, x2: 44, y2: -30 }),
          h('line', { x1: -10, y1: -38, x2: -14, y2: -48 }),
          h('line', { x1: 12, y1: -38, x2: 17, y2: -48 }),
          h('circle', { cx: -40, cy: -34, r: 2 }),
          h('circle', { cx: 42, cy: -34, r: 2 }),
        )
      : null,
    sticker
      ? h('g', { className: 'df-sticker-3d', transform: 'translate(4, -8) skewY(24)' },
          h('rect', { x: -22, y: 0, width: 44, height: 14, rx: 3, className: 'df-sticker-bg' }),
          h('text', { x: 0, y: 10, textAnchor: 'middle', className: 'df-sticker-text' }, clip(skill, 8)),
        )
      : null,
    stage === 'tools' ? h('circle', { cx: w / 2 - 5, cy: -7, r: 5, className: 'df-box-port' }) : null,
    stage === 'storage' ? h('g', { className: 'df-barcode', transform: 'translate(-18, -2) skewY(24)' },
      h('line', { x1: 0, y1: 0, x2: 0, y2: 9 }),
      h('line', { x1: 4, y1: 0, x2: 4, y2: 9 }),
      h('line', { x1: 9, y1: 0, x2: 9, y2: 9 }),
      h('line', { x1: 14, y1: 0, x2: 14, y2: 9 }),
    ) : null,
    stage === 'exit' ? h('g', { className: 'df-stamp', transform: 'translate(0, -6) skewY(24)' },
      h('circle', { cx: 0, cy: 0, r: 15 }),
      h('text', { x: 0, y: 3, textAnchor: 'middle' }, 'DONE'),
    ) : null,
    stage === 'exit' ? h('rect', { x: -26, y: -bh - 2, width: 52, height: 5, className: 'df-tape-seal' }) : null,
  )
}

function usePorter(display) {
  const [walking, setWalking] = useState(false)
  const [flip, setFlip] = useState(false)
  const previous = useRef(null)
  useEffect(() => {
    if (display === null || display === undefined) return undefined
    const pos = boxPos(display.workshop)
    if (previous.current !== null && previous.current.workshop !== display.workshop) {
      setFlip(pos.x < previous.current.x)
      setWalking(true)
      previous.current = { workshop: display.workshop, x: pos.x }
      const timer = setTimeout(() => setWalking(false), 700)
      return () => clearTimeout(timer)
    }
    previous.current = { workshop: display.workshop, x: pos.x }
    return undefined
  }, [display?.workshop, display?.seq])
  return { walking, flip }
}

function PatrolWorker({ theme, running, from, to }) {
  return h('g', {
    className: `df-patrol ${running ? 'df-patrol-on' : ''}`,
    style: {
      '--df-patrol-x1': `${from.x}px`,
      '--df-patrol-y1': `${from.y}px`,
      '--df-patrol-x2': `${to.x}px`,
      '--df-patrol-y2': `${to.y}px`,
    },
  },
    h('g', { className: 'df-patrol-move', style: { transform: `translate(${from.x}px, ${from.y}px)` } },
      h(WorkerArt, { theme, active: false, walking: running, flip: false, carrying: false }),
    ),
  )
}

function MaterialBox({ display, view, theme, active }) {
  const [animated, setAnimated] = useState(false)
  const porter = usePorter(display)
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 80)
    return () => clearTimeout(timer)
  }, [])
  if (display === null || display === undefined) return null
  const stage = display.workshop
  const position = boxPos(stage)
  const skill = skillOfTurn(view)
  return h('g', { className: 'df-box-layer' },
    h('g', {
      className: `df-box ${animated ? 'df-box-animate' : ''}`,
      style: { transform: `translate(${position.x}px, ${position.y}px)` },
    },
      h('ellipse', { cx: 0, cy: 8, rx: 52, ry: 16, className: 'df-spotlight' }),
      h('g', { key: display.seq },
        h(BoxArt, { stage, skill, theme, active }),
      ),
      h('text', { x: 0, y: 26, textAnchor: 'middle', className: 'df-box-caption' }, STAGE_LABEL[stage] ?? ''),
    ),
    h(Worker, {
      x: position.x - 56,
      y: position.y + 2,
      theme,
      active: true,
      walking: porter.walking,
      flip: porter.flip,
      carrying: true,
    }),
  )
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function SkillScan({ libraryValue, skill, theme }) {
  const shelf = libraryShelf(libraryValue)
  const hit = shelf.findIndex((library) => library.skills.includes(skill))
  return h('div', { className: `df-overlay df-skill-scan df-theme-${theme}` },
    h('div', { className: 'df-overlay-title' }, 'Skill 车间 · 4 库扫描'),
    h('div', { className: 'df-skill-hit' }, skill === '' ? '扫描中…' : `命中：${skill}`),
    h('div', { className: 'df-skill-beam' }),
    h('div', { className: 'df-skill-shelf' },
      shelf.map((library, index) => h('div', {
        key: library.id,
        className: `df-skill-lib ${index === hit ? 'df-hit' : ''} ${library.placeholder ? 'df-placeholder' : ''}`,
        style: { animationDelay: `${index * 160}ms` },
      },
        h('span', { className: 'df-skill-dot' }),
        h('span', { className: 'df-skill-lib-name' }, library.label),
        h('span', { className: 'df-skill-lib-count' }, library.placeholder ? '—' : `${library.count} 项`),
      )),
    ),
    h('div', { className: 'df-skill-book' },
      h('span', { className: 'df-book-cover' }),
      h('span', { className: 'df-book-page df-book-page-a' }),
      h('span', { className: 'df-book-page df-book-page-b' }),
    ),
    h('div', { className: 'df-skill-sticker' },
      h('span', { className: 'df-skill-sticker-pin' }),
      h('span', {}, skill === '' ? '扫描中…' : `命中：${skill}`),
    ),
  )
}

function ToolExchange({ tool, theme }) {
  const name = tool?.name ?? '等待工具调用'
  const mcp = tool?.mcp === true
  const endpoint = mcp ? `mcp://${tool?.server || 'server'}` : 'tool://local'
  return h('div', { className: `df-overlay df-tool-window df-theme-${theme}` },
    h('div', { className: 'df-window-bar' },
      h('span', { className: 'df-window-dot' }),
      h('span', { className: 'df-window-dot' }),
      h('span', { className: 'df-window-dot' }),
      h('span', { className: 'df-window-title' }, endpoint),
    ),
    h('div', { className: 'df-window-body' },
      h('div', { className: 'df-window-endpoint' }, name),
      h('div', { className: 'df-window-row' },
        h('span', { className: 'df-window-arrow df-req' }, 'REQ →'),
        h('code', null, clip(tool?.args || '{}', 70)),
      ),
      h('div', { className: 'df-window-row' },
        h('span', { className: 'df-window-arrow df-res' }, '← RES'),
        h('span', null, tool ? `${tool.status} · ${tool.chars} 字符` : '等待响应'),
      ),
      h('div', { className: 'df-window-wire' },
        h('span', { className: 'df-wire-in' }),
        h('span', { className: 'df-wire-out' }),
      ),
    ),
  )
}

function RouteGate({ route, theme }) {
  return h('div', { className: `df-overlay df-route-gate df-theme-${theme}` },
    h('div', { className: 'df-overlay-title' }, '路由车间 · 岔道闸门'),
    h('div', { className: 'df-fork' },
      h('span', { className: 'df-fork-trunk' }),
      h('span', { className: `df-fork-branch df-fork-a ${route.tone === 'route' ? 'df-branch-on' : ''}` }),
      h('span', { className: `df-fork-branch df-fork-b ${route.tone !== 'route' ? 'df-branch-on' : ''}` }),
      h('span', { className: `df-gate ${route.tone === 'route' ? 'df-gate-open' : ''}` }),
    ),
    h('div', { className: 'df-route-decision' }, route.label),
    h('div', { className: 'df-route-detail' }, route.detail),
  )
}

/* ------------------------------------------------------------------ */
/* Details panel                                                       */
/* ------------------------------------------------------------------ */

function Section({ title, children }) {
  return h('div', { className: 'df-section' },
    h('div', { className: 'df-section-title' }, title),
    children,
  )
}

function StationDetails({ nodeId, view, libraryValue, onClose, theme }) {
  const node = NODES[nodeId]
  if (node === undefined) return null
  const events = (view?.events ?? []).filter((event) => event.workshop === nodeId).slice(-8).reverse()
  const perTurn = view?.perTurn
  const used = perTurn?.counts?.[nodeId] ?? 0
  const bytes = perTurn?.bytes?.[nodeId] ?? 0
  const tools = (view?.tools ?? []).filter((tool) => tool.turn === view?.turn)
  const files = (view?.files ?? []).filter((file) => file.turn === view?.turn)
  const skills = (view?.skills ?? []).filter((skill) => skill.turn === view?.turn)
  const subagents = view?.subagents ?? []
  const route = routeOfView(view)
  return h('aside', { className: `df-details df-theme-${theme}`, 'aria-label': `${node.name} 详情` },
    h('div', { className: 'df-details-head' },
      h('div', null,
        h('div', { className: 'df-details-title' }, node.name),
        h('div', { className: 'df-details-sub' }, node.sub),
      ),
      h('button', { type: 'button', className: 'df-close', onClick: onClose, 'aria-label': '关闭详情' }, '×'),
    ),
    h('p', { className: 'df-details-duty' }, RESPONSIBILITY[nodeId]),
    h('div', { className: 'df-metrics' },
      h('div', { className: 'df-metric' }, h('b', null, String(used)), h('span', null, '本 turn 次数')),
      h('div', { className: 'df-metric' }, h('b', null, String(bytes)), h('span', null, '本 turn 字符')),
      nodeId === 'model'
        ? h('div', { className: 'df-metric' }, h('b', null, view?.usage?.output ?? '—'), h('span', null, '输出 token'))
        : null,
      nodeId === 'tools'
        ? h('div', { className: 'df-metric' }, h('b', null, String(tools.filter((tool) => tool.mcp).length)), h('span', null, 'MCP 调用'))
        : null,
    ),
    h(Section, { title: '本 turn 实际发生' },
      events.length === 0
        ? h('p', { className: 'df-empty' },
            view?.perTurn?.skipped?.includes(nodeId)
              ? '本 turn 没有走到这个车间，箱子走了跳过支路。'
              : '本 turn 尚未发生；等真实事件到达后会自动出现。')
        : h('ol', { className: 'df-event-list' },
            events.map((event) => h('li', { key: `${event.seq}-${event.label}` },
              h('span', { className: `df-event-time ${event.status}` }, `#${event.seq}`),
              h('span', { className: 'df-event-label' }, event.label),
              event.detail ? h('span', { className: 'df-event-detail' }, event.detail) : null,
            )),
          ),
    ),
    nodeId === 'skill'
      ? h(Section, { title: '技能库扫描' },
          h('div', { className: 'df-library-list' },
            libraryShelf(libraryValue).map((library) => h('div', { key: library.id, className: 'df-library-row' },
              h('span', null, library.label),
              h('b', null, library.placeholder ? '—' : String(library.count)),
            )),
          ),
          skills.length > 0
            ? h('div', { className: 'df-chip-row' }, skills.map((skill) => h('span', { key: `${skill.at}-${skill.name}`, className: 'df-chip df-chip-skill' }, skill.name)))
            : h('p', { className: 'df-empty' }, '本 turn 尚未命中技能。'),
        )
      : null,
    nodeId === 'tools'
      ? h(Section, { title: '工具 / MCP 端点' },
          tools.length === 0
            ? h('p', { className: 'df-empty' }, '本 turn 尚未调用工具。')
            : h('ul', { className: 'df-tool-list' },
                tools.slice(-8).reverse().map((tool) => h('li', { key: `${tool.id}-${tool.at}` },
                  h('span', { className: `df-tool-status ${tool.status}` }, tool.status === 'error' ? '×' : tool.status === 'running' ? '…' : '✓'),
                  h('div', { className: 'df-tool-main' },
                    h('div', { className: 'df-tool-name' }, tool.mcp ? `mcp://${tool.server} · ${tool.name}` : tool.name),
                    h('div', { className: 'df-tool-meta' }, `${formatMs(tool.ms)} · ${tool.chars} 字符${tool.error ? ` · ${tool.error}` : ''}`),
                  ),
                )),
              ),
        )
      : null,
    nodeId === 'route'
      ? h(Section, { title: '岔道决策' },
          h('div', { className: `df-route-pill df-route-${route.tone}` }, route.label),
          h('p', { className: 'df-route-detail' }, route.detail),
          subagents.length > 0
            ? h('ul', { className: 'df-sub-list' },
                subagents.slice(-6).reverse().map((entry) => h('li', { key: `${entry.id}-${entry.at}` },
                  h('b', null, entry.label),
                  h('span', null, `${entry.mode} · ${clip(entry.id, 18)}`),
                )),
              )
            : null,
        )
      : null,
    nodeId === 'model'
      ? h(Section, { title: '模型路由' },
          h('div', { className: 'df-kv' },
            h('span', null, 'provider'), h('b', null, view?.model?.provider || '—'),
            h('span', null, 'model'), h('b', null, view?.model?.model || '—'),
            h('span', null, 'contextWindow'), h('b', null, view?.model?.contextWindow ?? '—'),
            h('span', null, '输出 token'), h('b', null, view?.usage?.output ?? '—'),
          ),
        )
      : null,
    nodeId === 'storage'
      ? h(Section, { title: '仓储读写' },
          files.length === 0
            ? h('p', { className: 'df-empty' }, '本 turn 尚未读写工作区文件。')
            : h('ul', { className: 'df-file-list' },
                files.slice(-8).reverse().map((file) => h('li', { key: `${file.at}-${file.path}` },
                  h('span', { className: 'df-file-op' }, file.op),
                  h('code', null, clip(file.path, 60)),
                )),
              ),
        )
      : null,
    h(Section, { title: '可配置点' },
      h('ul', { className: 'df-config-list' },
        (CONFIG_POINTS[nodeId] ?? []).map((point) => h('li', { key: point.name },
          h('b', null, point.name),
          h('span', null, point.where),
        )),
      ),
    ),
    h('div', { className: 'df-details-foot' },
      h('span', null, `session ${clip(view?.sid || '—', 12)}`),
      h('span', null, `seq ${view?.seq ?? '—'}`),
    ),
  )
}

function useVisibility(ref) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    update()
    if (typeof IntersectionObserver === 'undefined' || ref.current === null) {
      return () => document.removeEventListener('visibilitychange', update)
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) setVisible(entry.isIntersecting && document.visibilityState !== 'hidden')
    }, { threshold: 0.01 })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
    }
  }, [ref])
  return visible
}

function Crate({ x, y, scale = 1, theme }) {
  const w = 26 * scale
  const ch = 16 * scale
  const d = 10 * scale
  return h('g', { transform: `translate(${x} ${y})`, className: `df-crate ${theme === 'water' ? 'df-crate-water' : ''}` },
    h('polygon', { points: `0,${-ch - d / 2} ${w / 2},${-ch} 0,${-ch + d / 2} ${-w / 2},${-ch}`, className: 'df-crate-top' }),
    h('polygon', { points: `${-w / 2},${-ch} 0,${-ch + d / 2} 0,${d / 2} ${-w / 2},0`, className: 'df-crate-left' }),
    h('polygon', { points: `0,${-ch + d / 2} ${w / 2},${-ch} ${w / 2},0 0,${d / 2}`, className: 'df-crate-right' }),
    h('line', { x1: 0, y1: -ch - d / 2, x2: 0, y2: d / 2, className: 'df-crate-line' }),
  )
}

function Barrel({ x, y, theme }) {
  return h('g', { transform: `translate(${x} ${y})`, className: `df-barrel ${theme === 'water' ? 'df-barrel-water' : ''}` },
    h('ellipse', { cx: 0, cy: 2, rx: 9, ry: 3, className: 'df-barrel-shadow' }),
    h('rect', { x: -8, y: -20, width: 16, height: 20, rx: 4, className: 'df-barrel-body' }),
    h('ellipse', { cx: 0, cy: -20, rx: 8, ry: 3, className: 'df-barrel-top' }),
    h('line', { x1: -8, y1: -14, x2: 8, y2: -14, className: 'df-barrel-band' }),
    h('line', { x1: -8, y1: -6, x2: 8, y2: -6, className: 'df-barrel-band' }),
  )
}

function Lamp({ x, y, theme }) {
  return h('g', { transform: `translate(${x} ${y})`, className: `df-lamp ${theme === 'water' ? 'df-lamp-water' : ''}` },
    h('circle', { cx: 0, cy: -26, r: 22, className: 'df-lamp-glow' }),
    h('line', { x1: 0, y1: 0, x2: 0, y2: -26, className: 'df-lamp-pole' }),
    h('rect', { x: -3, y: -30, width: 6, height: 5, rx: 1, className: 'df-lamp-head' }),
  )
}

function Tank({ x, y, theme }) {
  return h('g', { transform: `translate(${x} ${y})`, className: `df-mini-tank ${theme === 'water' ? 'df-mini-tank-water' : ''}` },
    h('ellipse', { cx: 0, cy: 3, rx: 20, ry: 5, className: 'df-tank-shadow' }),
    h('rect', { x: -15, y: -34, width: 30, height: 36, rx: 7, className: 'df-mini-tank-body' }),
    h('ellipse', { cx: 0, cy: -34, rx: 15, ry: 5, className: 'df-mini-tank-top' }),
    h('line', { x1: -15, y1: -22, x2: 15, y2: -22, className: 'df-mini-tank-band' }),
    h('line', { x1: -15, y1: -12, x2: 15, y2: -12, className: 'df-mini-tank-band' }),
  )
}

function Pipe({ d, theme, wide = 7 }) {
  return h('g', { className: `df-pipe ${theme === 'water' ? 'df-pipe-water' : ''}` },
    h('path', { d, className: 'df-pipe-casing', strokeWidth: wide + 5 }),
    h('path', { d, className: 'df-pipe-core', strokeWidth: wide }),
    h('path', { d, className: 'df-pipe-shine', strokeWidth: Math.max(1.5, wide / 3) }),
  )
}

function Tree({ x, y, theme, scale = 1 }) {
  return h('g', { transform: `translate(${x} ${y}) scale(${scale})`, className: `df-tree ${theme === 'water' ? 'df-tree-water' : ''}` },
    h('ellipse', { cx: 0, cy: 2, rx: 14, ry: 4, className: 'df-tree-shadow' }),
    h('rect', { x: -2.5, y: -20, width: 5, height: 20, className: 'df-tree-trunk' }),
    h('circle', { cx: -7, cy: -26, r: 9, className: 'df-tree-canopy' }),
    h('circle', { cx: 6, cy: -28, r: 10, className: 'df-tree-canopy' }),
    h('circle', { cx: 0, cy: -36, r: 8, className: 'df-tree-canopy df-tree-canopy-2' }),
  )
}

function Decor({ theme }) {
  const crates = [
    { x: 150, y: 382, s: 1.1 },
    { x: 185, y: 370, s: 0.8 },
    { x: 890, y: 520, s: 1.0 },
    { x: 920, y: 508, s: 0.75 },
    { x: 700, y: 515, s: 0.9 },
    { x: 310, y: 500, s: 0.8 },
  ]
  const barrels = [
    { x: 716, y: 494 },
    { x: 738, y: 506 },
    { x: 900, y: 548 },
    { x: 206, y: 426 },
  ]
  const lamps = [
    { x: 300, y: 360 },
    { x: 548, y: 300 },
    { x: 900, y: 410 },
    { x: 206, y: 420 },
  ]
  return h('g', { className: 'df-decor' },
    h('g', { className: 'df-far-silhouette' },
      h('polygon', { points: '120,250 180,220 250,245 190,275' }),
      h('polygon', { points: '700,190 770,155 850,190 780,225' }),
      h('polygon', { points: '400,110 450,85 510,110 460,135' }),
      h('polygon', { points: '830,120 880,95 940,120 890,145' }),
    ),
    h('g', { className: 'df-ground-patches' },
      h('ellipse', { cx: 300, cy: 360, rx: 110, ry: 34 }),
      h('ellipse', { cx: 700, cy: 300, rx: 150, ry: 42 }),
      h('ellipse', { cx: 520, cy: 470, rx: 120, ry: 30 }),
    ),
    theme === 'water'
      ? h('g', { className: 'df-puddles' },
          h('ellipse', { cx: 320, cy: 392, rx: 90, ry: 20 }),
          h('ellipse', { cx: 700, cy: 238, rx: 120, ry: 26 }),
          h('ellipse', { cx: 470, cy: 508, rx: 80, ry: 16 }),
        )
      : h('g', { className: 'df-grass' },
          [[250, 330], [280, 344], [470, 300], [520, 330], [650, 350], [880, 460], [190, 450], [380, 520], [610, 520]].map(([x, y], index) =>
            h('path', { key: index, d: `M${x} ${y} l-3 -8 M${x} ${y} l0 -10 M${x} ${y} l4 -7`, className: 'df-grass-tuft' }),
          ),
        ),
    h(Tank, { x: 900, y: 220, theme }),
    h(Tank, { x: 958, y: 420, theme }),
    h(Tank, { x: 90, y: 470, theme }),
    h(Pipe, { d: 'M700 200 H760 V250', theme, wide: 6 }),
    h(Pipe, { d: 'M540 420 H590 V478 H700', theme, wide: 6 }),
    h(Pipe, { d: 'M320 340 V388 H380', theme, wide: 5 }),
    h('g', { className: 'df-fence' },
      h('line', { x1: 120, y1: 534, x2: 880, y2: 534, className: 'df-fence-rail' }),
      h('line', { x1: 120, y1: 526, x2: 880, y2: 526, className: 'df-fence-rail df-fence-rail-2' }),
      [140, 200, 260, 320, 380, 440, 500, 560, 620, 680, 740, 800, 860].map((x) =>
        h('rect', { key: x, x, y: 516, width: 3, height: 22, className: 'df-fence-post' }),
      ),
    ),
    h('g', { className: 'df-flowers' },
      [[180, 480], [230, 500], [330, 470], [480, 540], [560, 500], [660, 465], [760, 535], [860, 500], [420, 300], [640, 320]].map(([x, y], index) =>
        h('circle', { key: index, cx: x, cy: y, r: 1.6, className: index % 3 === 0 ? 'df-flower-a' : index % 3 === 1 ? 'df-flower-b' : 'df-flower-c' }),
      ),
    ),
    h(Tree, { x: 120, y: 520, theme, scale: 1.1 }),
    h(Tree, { x: 980, y: 190, theme, scale: 0.9 }),
    h(Tree, { x: 60, y: 220, theme, scale: 0.8 }),
    h(Tree, { x: 880, y: 560, theme, scale: 0.75 }),
    crates.map((item, index) => h(Crate, { key: `c${index}`, x: item.x, y: item.y, scale: item.s, theme })),
    barrels.map((item, index) => h(Barrel, { key: `b${index}`, x: item.x, y: item.y, theme })),
    lamps.map((item, index) => h(Lamp, { key: `l${index}`, x: item.x, y: item.y, theme })),
  )
}

function IsoFloor({ theme }) {
  const ellipse = { cx: 500, cy: 300, rx: 650, ry: 350 }
  return h('g', { className: 'df-iso-floor' },
    h('ellipse', { ...ellipse, className: 'df-ground-base', style: { fill: theme === 'water' ? 'url(#df-ground-water)' : 'url(#df-ground)' } }),
    h('ellipse', { ...ellipse, className: 'df-ground-grid' }),
    h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-ground-fade' }),
    h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-ground-noise' }),
    h('path', { d: 'M500 44 L500 548 M22 296 L978 296', className: 'df-iso-axis' }),
    h('g', { className: 'df-far-wall' },
      h('path', { d: 'M22 296 L500 44 L978 296', className: 'df-far-wall-line' }),
      h('path', { d: 'M60 276 L500 60 L940 276', className: 'df-far-wall-line df-far-wall-line-2' }),
    ),
    theme === 'water'
      ? h('g', { className: 'df-floor-water' },
          h('path', { d: 'M0 410 Q240 370 500 408 T1000 380', className: 'df-canal' }),
          h('ellipse', { cx: 310, cy: 392, rx: 150, ry: 48 }),
          h('ellipse', { cx: 690, cy: 220, rx: 170, ry: 54 }),
          h('circle', { cx: 360, cy: 390, r: 2.5, className: 'df-foam' }),
          h('circle', { cx: 620, cy: 396, r: 2, className: 'df-foam' }),
          h('circle', { cx: 820, cy: 386, r: 2.2, className: 'df-foam' }),
        )
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

function Toolbar({ view, display, theme, setTheme, speed, setSpeed, stepMode, setStepMode, queue, step, skip, replay, replayEvents, liveRunning, livePhase }) {
  const running = view?.running === true && liveRunning !== false
  const status = running ? '运行中' : view ? '空闲' : '等待投影'
  return h('div', { className: 'df-toolbar' },
    h('div', { className: 'df-brand' },
      h('span', { className: 'df-brand-mark' }, '▦'),
      h('div', null,
        h('div', { className: 'df-brand-title' }, 'DSH FACTORY · 工厂蓝图'),
        h('div', { className: 'df-brand-sub' }, 'DSH Agent 内部结构 · 真实事件驱动'),
      ),
    ),
    h('div', { className: 'df-status-row' },
      h('span', { className: `df-pill df-pill-${running ? 'run' : 'idle'}` }, status),
      view?.turn !== null && view?.turn !== undefined
        ? h('span', { className: 'df-pill' }, `turn ${view.turn}${view.step !== null && view.step !== undefined ? ` · step ${view.step}` : ''}`)
        : null,
      queue.length > 0 ? h('span', { className: 'df-pill df-pill-live' }, `播放队列 ${queue.length}`) : null,
      livePhase !== null && livePhase !== undefined && running
        ? h('span', { className: 'df-pill df-pill-live' }, `LIVE · ${clip(livePhase.label ?? livePhase.phase, 26)}`)
        : null,
      display !== null && display !== undefined
        ? h('span', { className: 'df-pill df-pill-event' }, `▶ ${clip(display.label, 34)}`)
        : null,
    ),
    h('div', { className: 'df-controls' },
      h('div', { className: 'df-seg', role: 'group', 'aria-label': '主题' },
        h('button', { type: 'button', className: theme === 'pixel' ? 'df-seg-on' : '', onClick: () => setTheme('pixel') }, '像素工厂'),
        h('button', { type: 'button', className: theme === 'water' ? 'df-seg-on' : '', onClick: () => setTheme('water') }, '水流管道'),
      ),
      h('div', { className: 'df-seg', role: 'group', 'aria-label': '速度' },
        h('button', { type: 'button', className: speed === 1 ? 'df-seg-on' : '', onClick: () => setSpeed(1) }, '1×'),
        h('button', { type: 'button', className: speed === 0.5 ? 'df-seg-on' : '', onClick: () => setSpeed(0.5) }, '0.5×'),
        h('button', { type: 'button', className: stepMode ? 'df-seg-on' : '', onClick: () => setStepMode(!stepMode) }, stepMode ? '单步中' : '单步'),
      ),
      h('button', {
        type: 'button',
        className: 'df-ctl',
        disabled: queue.length === 0,
        onClick: stepMode ? step : skip,
        title: stepMode ? '播放队列中的下一个事件' : '跳到最新事件',
      }, stepMode ? `下一步 (${queue.length})` : '跳到最新'),
      h('button', {
        type: 'button',
        className: 'df-ctl',
        disabled: replayEvents.length === 0,
        onClick: () => replay(replayEvents),
        title: '用本 turn 的真实事件重新播放一遍（最多 60 个）',
      }, '重播本轮'),
    ),
  )
}

function FactoryBoard({ view, liveRunning, livePhase, theme, setTheme, speed, setSpeed, stepMode, setStepMode, compact, libraryValue }) {
  const playback = usePlayback(view, speed, stepMode, livePhase)
  const [selected, setSelected] = useState(null)
  const rootRef = useRef(null)
  const visible = useVisibility(rootRef)
  const display = playback.display
  const active = playback.playing || stepMode
  const route = routeOfView(view)
  const skill = skillOfTurn(view)
  const tool = useMemo(() => {
    const tools = (view?.tools ?? []).filter((entry) => entry.turn === view?.turn)
    return tools.length > 0 ? tools[tools.length - 1] : null
  }, [view])
  const visited = useMemo(() => {
    if (!view) return []
    const start = view.startedAt ?? 0
    const all = view.events ?? []
    const scoped = all.filter((event) => event.time >= start)
    const events = scoped.length > 0 ? scoped : all
    const seen = []
    for (const event of events) {
      if (event.workshop === 'intake' || event.workshop === 'orchestrate' || event.workshop === 'exit') continue
      if (!seen.includes(event.workshop)) seen.push(event.workshop)
    }
    return seen
  }, [view])

  return h('div', { ref: rootRef, className: `df-root df-theme-${theme} ${compact ? 'df-compact' : ''} ${visible ? '' : 'df-paused'}` },
    h(Toolbar, {
      view,
      display,
      theme,
      setTheme,
      speed,
      setSpeed,
      stepMode,
      setStepMode,
      queue: playback.queue,
      step: playback.step,
      skip: playback.skip,
      replay: playback.replay,
      replayEvents: (() => {
        const all = view?.events ?? []
        const start = view?.startedAt
        const scoped = start === null || start === undefined ? all : all.filter((event) => event.time >= start)
        return scoped.length > 0 ? scoped : all
      })(),
      liveRunning,
      livePhase,
    }),
    h('div', { className: 'df-board' },
      h('svg', { className: 'df-svg', viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'DSH Agent 工厂蓝图' },
        h('defs', null,
          h('pattern', { id: 'df-grid', width: 22, height: 22, patternUnits: 'userSpaceOnUse' },
            h('path', { d: 'M22 0 H0 V22', fill: 'none', stroke: 'currentColor', strokeWidth: 0.6, opacity: 0.16 }),
          ),
          h('pattern', { id: 'df-bubbles', width: 90, height: 90, patternUnits: 'userSpaceOnUse' },
            h('circle', { cx: 16, cy: 22, r: 2, fill: 'currentColor', opacity: 0.18 }),
            h('circle', { cx: 62, cy: 48, r: 3, fill: 'currentColor', opacity: 0.12 }),
            h('circle', { cx: 34, cy: 74, r: 1.6, fill: 'currentColor', opacity: 0.2 }),
            h('circle', { cx: 76, cy: 14, r: 1.4, fill: 'currentColor', opacity: 0.2 }),
          ),
          h('pattern', { id: 'df-iso-grid', width: 64, height: 32, patternUnits: 'userSpaceOnUse' },
            h('path', { d: 'M0 16 L32 0 L64 16 L32 32 Z', fill: 'none', stroke: '#9aa68f', strokeWidth: 0.7, opacity: 0.42 }),
          ),
          h('linearGradient', { id: 'df-ground', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: '#7a8a72', stopOpacity: 1 }),
            h('stop', { offset: '58%', stopColor: '#5f725f', stopOpacity: 1 }),
            h('stop', { offset: '100%', stopColor: '#4a5c4c', stopOpacity: 1 }),
          ),
          h('linearGradient', { id: 'df-ground-water', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: '#2a4a48', stopOpacity: 1 }),
            h('stop', { offset: '58%', stopColor: '#1f3a39', stopOpacity: 1 }),
            h('stop', { offset: '100%', stopColor: '#172c2d', stopOpacity: 1 }),
          ),
          h('radialGradient', { id: 'df-spot', cx: '50%', cy: '50%', r: '50%' },
            h('stop', { offset: '0%', stopColor: '#e0cfa7', stopOpacity: 0.22 }),
            h('stop', { offset: '100%', stopColor: '#e0cfa7', stopOpacity: 0 }),
          ),
          h('radialGradient', { id: 'df-sky-glow', cx: '50%', cy: '100%', r: '70%' },
            h('stop', { offset: '0%', stopColor: '#c19a5b', stopOpacity: 0.18 }),
            h('stop', { offset: '100%', stopColor: '#c19a5b', stopOpacity: 0 }),
          ),
          h('radialGradient', { id: 'df-sky-glow-water', cx: '50%', cy: '100%', r: '70%' },
            h('stop', { offset: '0%', stopColor: '#8fb0a8', stopOpacity: 0.14 }),
            h('stop', { offset: '100%', stopColor: '#8fb0a8', stopOpacity: 0 }),
          ),
          h('radialGradient', { id: 'df-ground-fade', cx: '50%', cy: '50%', r: '72%' },
            h('stop', { offset: '58%', stopColor: '#1b1a18', stopOpacity: 0 }),
            h('stop', { offset: '82%', stopColor: '#1b1a18', stopOpacity: 0.28 }),
            h('stop', { offset: '100%', stopColor: '#1b1a18', stopOpacity: 0.88 }),
          ),
          h('pattern', { id: 'df-noise', width: 28, height: 28, patternUnits: 'userSpaceOnUse' },
            h('circle', { cx: 5, cy: 6, r: 1, fill: '#ece6d8', opacity: 0.05 }),
            h('circle', { cx: 17, cy: 14, r: 0.8, fill: '#ece6d8', opacity: 0.04 }),
            h('circle', { cx: 24, cy: 4, r: 0.7, fill: '#ece6d8', opacity: 0.035 }),
            h('circle', { cx: 9, cy: 22, r: 0.8, fill: '#ece6d8', opacity: 0.04 }),
          ),
          h('linearGradient', { id: 'df-haze', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: '#8a9483', stopOpacity: 0.18 }),
            h('stop', { offset: '100%', stopColor: '#8a9483', stopOpacity: 0 }),
          ),
          h('radialGradient', { id: 'df-lamp-glow', cx: '50%', cy: '50%', r: '50%' },
            h('stop', { offset: '0%', stopColor: '#d6b06a', stopOpacity: 0.32 }),
            h('stop', { offset: '100%', stopColor: '#d6b06a', stopOpacity: 0 }),
          ),
          h('radialGradient', { id: 'df-water-glow', cx: '50%', cy: '50%', r: '50%' },
            h('stop', { offset: '0%', stopColor: 'currentColor', stopOpacity: 0.18 }),
            h('stop', { offset: '100%', stopColor: 'currentColor', stopOpacity: 0 }),
          ),
          h('radialGradient', { id: 'df-vignette', cx: '50%', cy: '46%', r: '72%' },
            h('stop', { offset: '58%', stopColor: '#1b1a18', stopOpacity: 0 }),
            h('stop', { offset: '100%', stopColor: '#1b1a18', stopOpacity: 0.24 }),
          ),
          h('linearGradient', { id: 'df-fog', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: '#ece6d8', stopOpacity: 0 }),
            h('stop', { offset: '78%', stopColor: '#ece6d8', stopOpacity: 0 }),
            h('stop', { offset: '100%', stopColor: '#ece6d8', stopOpacity: 0.035 }),
          ),
          h('radialGradient', { id: 'df-light', cx: '50%', cy: '40%', r: '60%' },
            h('stop', { offset: '0%', stopColor: '#c19a5b', stopOpacity: 0.2 }),
            h('stop', { offset: '100%', stopColor: '#c19a5b', stopOpacity: 0 }),
          ),
        ),
        h('g', { className: 'df-scene', transform: 'translate(20 11) scale(0.96)' },
          h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-floor' }),
          h('rect', { x: 0, y: 0, width: 1000, height: 280, className: 'df-sky-glow', style: { fill: theme === 'water' ? 'url(#df-sky-glow-water)' : 'url(#df-sky-glow)' } }),
          h('rect', { x: 0, y: 0, width: 1000, height: 300, className: 'df-haze' }),
          h('ellipse', { cx: 500, cy: 250, rx: 430, ry: 230, className: 'df-ambient' }),
          h(IsoFloor, { theme }),
          h(Decor, { theme }),
          EDGES.map((edge) => h(Edge, {
            key: edge.id,
            edge,
            display,
            playing: playback.playing,
            stepMode,
            view,
          })),
          WORKSHOP_IDS.map((id) => h(Station, {
            key: id,
            node: { ...NODES[id], id },
            view,
            display,
            playing: playback.playing,
            stepMode,
            selected: selected === id,
            onSelect: setSelected,
            theme,
          })),
          h(Station, { node: { ...NODES.intake, id: 'intake' }, view, display, playing: playback.playing, stepMode, selected: selected === 'intake', onSelect: setSelected, theme }),
          h(Station, { node: { ...NODES.exit, id: 'exit' }, view, display, playing: playback.playing, stepMode, selected: selected === 'exit', onSelect: setSelected, theme }),
          h(PatrolWorker, { theme, running: view?.running === true || playback.playing, from: { x: 156, y: 314 }, to: { x: 246, y: 302 } }),
          h(PatrolWorker, { theme, running: view?.running === true || playback.playing, from: { x: 762, y: 330 }, to: { x: 898, y: 316 } }),
          WORKER_POSTS.map((post) => h(Worker, {
            key: post.id,
            x: post.x,
            y: post.y,
            theme,
            active: display?.workshop === post.id && (playback.playing || stepMode),
            walking: false,
            flip: post.flip === true,
            carrying: false,
          })),
          h(MaterialBox, { display, view, theme, active }),
        ),
        h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-vignette', 'pointer-events': 'none' }),
        h('rect', { x: 0, y: 0, width: 1000, height: 560, className: 'df-fog', 'pointer-events': 'none' }),
      ),
      display?.workshop === 'skill' && active
        ? h(SkillScan, { libraryValue, skill, theme })
        : null,
      display?.workshop === 'tools' && active
        ? h(ToolExchange, { tool, theme })
        : null,
      display?.workshop === 'route' && active
        ? h(RouteGate, { route, theme })
        : null,
      selected !== null
        ? h(StationDetails, { nodeId: selected, view, libraryValue, onClose: () => setSelected(null), theme })
        : null,
    ),
    h('div', { className: 'df-footer' },
      h('div', { className: 'df-visited' },
        h('span', { className: 'df-visited-label' }, '本轮路线'),
        visited.length === 0
          ? h('span', { className: 'df-visited-empty' }, '等待第一个真实事件')
          : visited.map((id) => h('span', { key: id, className: 'df-visited-chip' }, NODES[id]?.name ?? id)),
      ),
      h('div', { className: 'df-legend' },
        h('span', null, h('i', { className: 'df-dot df-dot-run' }), '处理中'),
        h('span', null, h('i', { className: 'df-dot df-dot-done' }), '已走过'),
        h('span', null, h('i', { className: 'df-dot df-dot-skip' }), '跳过'),
        h('span', null, h('i', { className: 'df-dot df-dot-error' }), '失败回环'),
      ),
    ),
    view === undefined || view === null
      ? h('div', { className: 'df-empty-banner' }, '尚未收到 factoryTrail 投影：host 插件可能未加载，或本会话还没有事件。')
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

function useFactoryView(props) {
  const useProjection = props.useProjection
  const useSession = props.useSession
  const view = typeof useProjection === 'function' ? useProjection('factoryTrail') : undefined
  const liveRunning = typeof useSession === 'function' ? useSession((snapshot) => snapshot.running) : undefined
  return { view, liveRunning }
}

function Modal({ title, onClose, children }) {
  const content = h('div', { className: 'df-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { className: 'df-modal-panel' },
      h('div', { className: 'df-modal-head' },
        h('span', { className: 'df-modal-title' }, title),
        h('button', { type: 'button', className: 'df-modal-close', onClick: onClose, 'aria-label': '关闭' }, '×'),
      ),
      children,
    ),
  )
  if (createPortal !== null && typeof document !== 'undefined') return createPortal(content, document.body)
  return content
}

class FactoryBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error) {
    console.error('dsh-factory crashed', error)
  }
  render() {
    if (this.state.error !== null) {
      return h('pre', { className: 'df-crash' }, String(this.state.error?.stack || this.state.error))
    }
    return this.props.children
  }
}

function FactoryView(props) {
  const { view, liveRunning } = useFactoryView(props)
  const running = view?.running === true && liveRunning !== false
  const livePhase = useLivePhase(props.sessionId, running)
  const [theme, setTheme] = useTheme()
  const [speed, setSpeed] = useState(() => (readLocal(SPEED_KEY, '1') === '0.5' ? 0.5 : 1))
  const [stepMode, setStepMode] = useState(false)
  const libraryValue = useLibraries(props.sessionId)
  useEffect(() => {
    writeLocal(SPEED_KEY, String(speed))
  }, [speed])
  return h('div', { className: 'df-view' },
    h(FactoryBoundary, null, h(FactoryBoard, {
      view,
      liveRunning,
      livePhase,
      theme,
      setTheme,
      speed,
      setSpeed,
      stepMode,
      setStepMode,
      compact: false,
      libraryValue,
    })),
  )
}

function FactoryStrip(props) {
  const { view, liveRunning } = useFactoryView(props)
  const [theme, setTheme] = useTheme()
  const [speed, setSpeed] = useState(() => (readLocal(SPEED_KEY, '1') === '0.5' ? 0.5 : 1))
  const [stepMode, setStepMode] = useState(false)
  const [open, setOpen] = useState(false)
  const libraryValue = useLibraries(props.sessionId)
  const running = view?.running === true && liveRunning !== false
  const livePhase = useLivePhase(props.sessionId, running)
  useEffect(() => {
    writeLocal(SPEED_KEY, String(speed))
  }, [speed])
  const current = view?.current
  const display = current === null || current === undefined ? null : toDisplay({ ...current, kind: '', seq: view?.seq ?? -1, time: current.at, status: '' })
  const label = view === undefined || view === null
    ? '等待投影'
    : running
      ? `运行中 · ${current?.label ?? '处理中'}`
      : view.phase === 'done'
        ? '本轮完成 · 箱子已出货'
        : '空闲 · 箱子停在当前站'
  return h('div', { className: `df-strip df-theme-${theme} ${open ? 'df-strip-open' : ''}` },
    h('button', {
      type: 'button',
      className: 'df-strip-head',
      onClick: () => setOpen((value) => !value),
      'aria-expanded': open,
      'aria-label': open ? '收起工厂蓝图' : '展开工厂蓝图',
    },
      h('span', { className: 'df-strip-mark' }, '▦'),
      h('span', { className: 'df-strip-title' }, '工厂'),
      h('span', { className: `df-strip-dot ${running ? 'df-run' : ''}` }),
      h('span', { className: 'df-strip-label' }, label),
      h('span', { className: 'df-strip-mini' },
        WORKSHOP_IDS.map((id) => h('span', {
          key: id,
          className: `df-mini ${display?.workshop === id ? 'df-mini-on' : ''} ${view?.perTurn?.skipped?.includes(id) ? 'df-mini-skip' : ''}`,
          title: NODES[id].name,
        })),
      ),
      h('span', { className: 'df-strip-chev' }, open ? '▾' : '▸'),
    ),
    open
      ? h(Modal, { title: '工厂蓝图 · 对话上方展开', onClose: () => setOpen(false) },
          h(FactoryBoundary, null, h(FactoryBoard, {
            view,
            liveRunning,
            livePhase,
            theme,
            setTheme,
            speed,
            setSpeed,
            stepMode,
            setStepMode,
            compact: false,
            libraryValue,
          })),
        )
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* Plugin entry                                                        */
/* ------------------------------------------------------------------ */

function installStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById('dsh-factory-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh-factory-style'
  style.textContent = CSS
  document.head.appendChild(style)
}

function apply(ctx) {
  installStyle()
  if (typeof window !== 'undefined') {
    window.__dshFactory = {
      ctx,
      openSession: (sessionId) => ctx.get('uiWorkspace')?.openSession(sessionId),
    }
  }
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'factory',
    order: 40,
    label: () => '工厂',
  }, (props) => h(FactoryView, props)))
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'factory-strip',
    order: 50,
  }, (props) => h(FactoryStrip, props)))
}

exports.name = NS
exports.inject = ['slots']
exports.apply = apply

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
.df-root {
  --df-bg: #1b1a18;
  --df-panel: #24221e;
  --df-panel-2: #1f1d19;
  --df-line: #3f3a33;
  --df-text: #e8e2d4;
  --df-muted: #a39b8c;
  --df-faint: #6f695d;
  --df-accent: #c19a5b;
  --df-green: #8fb0a8;
  --df-amber: #d6b06a;
  --df-red: #a85f3d;
  --df-radius: 10px;
  --df-ink: #26231f;
  --df-deep: #34312b;
  --df-steel: #47433b;
  --df-steel-2: #5a554b;
  --df-warm: #6f695d;
  --df-wood-dark: #6b4f36;
  --df-wood: #8a6644;
  --df-wood-light: #a98356;
  --df-brass-dark: #9a6f3f;
  --df-brass: #c19a5b;
  --df-cream: #e0cfa7;
  --df-steam: #ece6d8;
  --df-rust: #a85f3d;
  --df-teal: #5f827c;
  --df-teal-light: #8fb0a8;
  --df-stroke-wood: #3c2c20;
  --df-stroke-steel: #35312b;
  --df-shadow: #141310;
  position: relative;
  color: var(--df-text);
  font-family: var(--dsw-font-family, Inter, system-ui, sans-serif);
  background:
    radial-gradient(ellipse at 50% 34%, rgba(193,154,91,.10), transparent 58%),
    radial-gradient(ellipse at 50% 100%, rgba(236,230,216,.045), transparent 62%),
    var(--df-bg);
  border: 1px solid var(--df-line);
  border-radius: var(--df-radius);
  overflow: hidden;
  box-sizing: border-box;
}
.df-root * { box-sizing: border-box; }
.df-theme-pixel { --df-accent: #c19a5b; --df-green: #8fb0a8; --df-amber: #d6b06a; --df-shadow: #080604; }
.df-theme-water { --df-accent: #7fa9a1; --df-green: #8fb0a8; --df-amber: #a9c7c1; --df-shadow: #030a12; }
.df-paused * { animation-play-state: paused !important; }

/* Toolbar */
.df-toolbar {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  border-bottom: 1px solid var(--df-line); background: var(--df-panel); flex-wrap: wrap;
}
.df-brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
.df-brand-mark {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px;
  background: color-mix(in srgb, var(--df-accent) 18%, transparent); color: var(--df-accent);
  font-size: 17px; flex: none;
}
.df-brand-title { font-size: 13px; font-weight: 700; line-height: 1.2; }
.df-brand-sub { font-size: 10px; color: var(--df-muted); line-height: 1.3; }
.df-status-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.df-pill {
  font-size: 10px; line-height: 18px; padding: 0 7px; border-radius: 999px;
  border: 1px solid var(--df-line); color: var(--df-muted); white-space: nowrap;
}
.df-pill-run { color: var(--df-green); border-color: color-mix(in srgb, var(--df-green) 46%, transparent); background: color-mix(in srgb, var(--df-green) 10%, transparent); }
.df-pill-live { color: var(--df-accent); border-color: color-mix(in srgb, var(--df-accent) 46%, transparent); }
.df-controls { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.df-seg { display: inline-flex; border: 1px solid var(--df-line); border-radius: 7px; overflow: hidden; }
.df-seg button, .df-ctl {
  appearance: none; border: 0; background: transparent; color: var(--df-muted);
  font: inherit; font-size: 11px; line-height: 24px; padding: 0 9px; cursor: pointer;
}
.df-seg button + button { border-left: 1px solid var(--df-line); }
.df-seg button:hover, .df-ctl:hover { color: var(--df-text); background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.06)); }
.df-seg-on { color: var(--df-accent) !important; background: color-mix(in srgb, var(--df-accent) 13%, transparent) !important; font-weight: 600; }
.df-ctl { border: 1px solid var(--df-line); border-radius: 7px; }
.df-ctl:disabled { opacity: .4; cursor: default; }

/* Stage */
.df-board { position: relative; aspect-ratio: 1000 / 560; background: var(--df-bg); overflow: hidden; }
.df-svg { display: block; width: 100%; height: 100%; color: var(--df-muted); }
.df-floor { fill: var(--df-bg); }
.df-ground-base { fill: url(#df-ground); }
.df-ground-grid { fill: url(#df-iso-grid); opacity: .3; }
.df-ground-fade { fill: url(#df-ground-fade); pointer-events: none; }
.df-ground-noise { fill: url(#df-noise); pointer-events: none; }
.df-dirt-path { fill: none; stroke: #6b5a3f; stroke-width: 38; stroke-linecap: round; opacity: .16; transform: translate(2px, 8px); }
.df-belt-rollers { fill: none; stroke: #d6b06a; stroke-width: 3; stroke-dasharray: 1 18; opacity: .55; }
.df-door-glow { fill: #d6b06a; opacity: .18; filter: blur(2px); }
.df-roof-vent { fill: #6b675c; stroke: #4a463d; stroke-width: 1; }
.df-side-pipe { fill: none; stroke: #c19a5b; stroke-width: 3; opacity: .5; }
.df-iso-base { fill: url(#df-ground); }
.df-iso-grid { fill: url(#df-iso-grid); }
.df-iso-axis { fill: none; stroke: #7f8a7b; stroke-width: 1; stroke-dasharray: 2 9; opacity: .28; }
.df-iso-rim { fill: none; stroke: #7f8a7b; stroke-width: 1.4; opacity: .45; }
.df-far-wall-line { fill: none; stroke: #7f8a7b; stroke-width: 1; opacity: .28; }
.df-far-wall-line-2 { opacity: .22; }
.df-floor-water ellipse { fill: color-mix(in srgb, var(--df-accent) 8%, transparent); }
.df-canal { fill: none; stroke: #7fd3d0; stroke-width: 54; stroke-linecap: round; opacity: .12; }
.df-foam { fill: #e8fffb; opacity: .45; }
.df-theme-pixel .df-floor-water { display: none; }

/* Station 3D bodies */
.df-shadow { fill: var(--df-shadow); opacity: .55; filter: blur(1px); }
.df-roof-3d { fill: #4a3525; stroke: #3c2c20; stroke-width: 1.6; }
.df-wall-left { fill: #3a2f25; stroke: #5b3e2b; stroke-width: 1.5; }
.df-wall-right { fill: #4a3c2e; stroke: #5b3e2b; stroke-width: 1.5; }
.df-wall-side { fill: #1d1611; stroke: #4a2f1e; stroke-width: 1.5; }
.df-window-3d { fill: #c19a5b; opacity: .78; }
.df-door-3d { fill: #2f2720; stroke: #6b4f36; stroke-width: 1.2; }
.df-chimney-3d { fill: #4a3c2e; stroke: #3c2c20; stroke-width: 1.4; }
.df-plinth { fill: #2f2720; opacity: .9; }
.df-station.df-active .df-roof-3d,
.df-station.df-active .df-wall-left,
.df-station.df-active .df-wall-right { filter: drop-shadow(0 0 7px color-mix(in srgb, var(--df-accent) 70%, transparent)); }
.df-station.df-selected .df-roof-3d,
.df-station.df-selected .df-wall-left,
.df-station.df-selected .df-wall-right { stroke: #fff; stroke-width: 2; }
.df-station.df-error .df-wall-left, .df-station.df-error .df-wall-right { stroke: var(--df-red); }
.df-station.df-skipped { opacity: .45; }
.df-active-ring { fill: none; stroke: var(--df-accent); stroke-width: 2; stroke-dasharray: 8 7; opacity: .8; animation: df-flow 1s linear infinite; }
.df-error-ring { fill: none; stroke: var(--df-red); stroke-width: 2; stroke-dasharray: 5 4; animation: df-error-pulse 1.2s linear infinite; }
.df-smoke circle { fill: #a7b0c0; opacity: .22; animation: df-smoke 1.8s ease-out infinite; }
.df-smoke circle:nth-child(2) { animation-delay: .45s; }
.df-smoke circle:nth-child(3) { animation-delay: .9s; }
.df-piston-rod { fill: #9aa3b2; transform-box: fill-box; transform-origin: bottom center; }
.df-piston-head { fill: #c19a5b; }
.df-piston.df-on .df-piston-rod { animation: df-piston 1.2s ease-in-out infinite; }
.df-arm-base { fill: #6b4f36; }
.df-arm-boom { fill: #c19a5b; transform-box: fill-box; transform-origin: right center; }
.df-arm-joint { fill: #1b1f27; stroke: #c19a5b; stroke-width: 1.5; }
.df-robot-arm.df-on .df-arm-boom { animation: df-arm 1.5s ease-in-out infinite; }
.df-crane-mast { fill: #6b4f36; }
.df-crane-boom { fill: #c19a5b; }
.df-crane-hook { fill: #9aa3b2; transform-box: fill-box; transform-origin: top center; }
.df-crane.df-on .df-crane-hook { animation: df-crane 1.6s ease-in-out infinite; }

/* Water tank 3D */
.df-tank-3d { fill: color-mix(in srgb, var(--df-accent) 22%, #22383a); stroke: color-mix(in srgb, var(--df-accent) 65%, #fff 8%); stroke-width: 1.8; }
.df-tank-top { fill: #c9e8e2; stroke: #f2fffb; stroke-width: 1.4; }
.df-water-line { fill: none; stroke: #c9ddd6; stroke-width: 2; opacity: .55; }
.df-tank-gauge { fill: #c9e8e2; opacity: .35; stroke: #eefaf7; stroke-width: 1; }
.df-valve { fill: #c19a5b; stroke: #e0cfa7; stroke-width: 2; }
.df-valve-line { stroke: #2a2723; stroke-width: 2; }
.df-pipe-out { fill: none; stroke: color-mix(in srgb, var(--df-accent) 55%, #22383a); stroke-width: 9; stroke-linecap: round; }
.df-bubble { fill: #dcebe6; opacity: .55; animation: df-bubble 2.8s ease-in-out infinite; }
.df-bubble-b { animation-delay: .7s; }
.df-bubble-c { animation-delay: 1.3s; }
.df-bubbles circle { fill: #dcebe6; opacity: .5; animation: df-bubble 1.8s ease-in-out infinite; }
.df-bubbles circle:nth-child(2) { animation-delay: .5s; }
.df-turbine-ring { fill: none; stroke: var(--df-accent); stroke-width: 2; opacity: .55; }
.df-turbine-water { fill: none; stroke: var(--df-accent); stroke-width: 3; opacity: .35; }
.df-theme-pixel .df-tank-3d, .df-theme-pixel .df-tank-top, .df-theme-pixel .df-water-line,
.df-theme-pixel .df-tank-gauge, .df-theme-pixel .df-valve, .df-theme-pixel .df-valve-line,
.df-theme-pixel .df-pipe-out, .df-theme-pixel .df-bubble, .df-theme-pixel .df-bubbles,
.df-theme-pixel .df-turbine-ring, .df-theme-pixel .df-turbine-water { display: none; }
.df-theme-water .df-roof-3d, .df-theme-water .df-wall-left, .df-theme-water .df-wall-right,
.df-theme-water .df-wall-side, .df-theme-water .df-window-3d, .df-theme-water .df-door-3d,
.df-theme-water .df-chimney-3d, .df-theme-water .df-plinth, .df-theme-water .df-smoke,
.df-theme-water .df-piston, .df-theme-water .df-robot-arm, .df-theme-water .df-crane { display: none; }

.df-material-steel .df-roof-3d { fill: #a8a293; stroke: #5a554b; }
.df-material-steel .df-wall-left { fill: #837e72; stroke: #5a554b; }
.df-material-steel .df-wall-right { fill: #6b675c; stroke: #5a554b; }
.df-material-steel .df-wall-side { fill: #555147; stroke: #45423a; }
.df-material-steel .df-window-3d { fill: #d6b06a; opacity: .85; }
.df-material-steel .df-roof-hi { stroke: #e0d8c4; opacity: .6; }
.df-material-wood .df-roof-3d { fill: #a97f50; stroke: #5a3b28; }
.df-material-wood .df-wall-left { fill: #8a6644; stroke: #5a3b28; }
.df-material-wood .df-wall-right { fill: #6f5138; stroke: #5a3b28; }
.df-material-wood .df-wall-side { fill: #5a412d; stroke: #4a3424; }
.df-material-wood .df-roof-hi { stroke: #e0cfa7; opacity: .5; }
.df-ambient { fill: url(#df-light); }
/* Station signs */
.df-sign-bg { fill: #2a2723; stroke: #c19a5b; stroke-width: .7; opacity: .9; }
.df-sign-hi { stroke: #c19a5b; stroke-width: .8; opacity: .45; }
.df-sign-lamp { fill: #8a8578; }
.df-sign-lamp.df-on { fill: var(--df-accent); filter: drop-shadow(0 0 5px var(--df-accent)); animation: df-pulse 1.1s ease-in-out infinite; }
.df-sign-lamp.df-ok { fill: var(--df-green); }
.df-sign-lamp.df-bad { fill: var(--df-red); }
.df-station-name { fill: #ece6d8; font-size: 10.5px; font-weight: 700; }
.df-station-sub { fill: #a39b8c; font-size: 7.5px; }
.df-skip-badge { fill: var(--df-amber); font-size: 9px; font-weight: 700; letter-spacing: .04em; }
.df-check { fill: var(--df-green); font-size: 14px; font-weight: 800; }

/* Conveyor / pipes */
.df-belt-shadow { fill: none; stroke: #171512; stroke-width: 24; stroke-linecap: round; stroke-linejoin: round; opacity: .45; transform: translate(3px, 7px); }
.df-belt-side { fill: none; stroke: #3a2a1c; stroke-width: 19; stroke-linecap: round; stroke-linejoin: round; }
.df-belt-top { fill: none; stroke: #6b4f36; stroke-width: 14; stroke-linecap: round; stroke-linejoin: round; }
.df-belt-slats { fill: none; stroke: #3a2f25; stroke-width: 12; stroke-dasharray: 2 12; animation: df-belt 1.3s linear infinite; stroke-linecap: butt; }
.df-edge-flow { fill: none; stroke: transparent; stroke-width: 3; stroke-linecap: round; }
.df-edge-dashed .df-belt-top { stroke-dasharray: 8 7; opacity: .75; }
.df-edge-active .df-belt-top { stroke: var(--df-accent); filter: drop-shadow(0 0 5px color-mix(in srgb, var(--df-accent) 65%, transparent)); }
.df-edge-active .df-belt-slats { stroke: color-mix(in srgb, var(--df-accent) 45%, #1a120a); animation-duration: .55s; }
.df-edge-active .df-edge-flow { stroke: var(--df-accent); stroke-width: 4; stroke-dasharray: 7 11; animation: df-flow .55s linear infinite; }
.df-edge-error .df-belt-top { stroke: var(--df-red); stroke-dasharray: 4 5; }
.df-edge-error .df-belt-slats { stroke: color-mix(in srgb, var(--df-red) 55%, #1a120a); }
.df-edge-skip .df-belt-top { stroke: var(--df-amber); stroke-dasharray: 7 7; }
.df-edge-label { fill: var(--df-faint); font-size: 8.5px; letter-spacing: .04em; paint-order: stroke; stroke: var(--df-bg); stroke-width: 2.5px; }
.df-theme-water .df-belt-shadow { stroke-width: 30; }
.df-theme-water .df-belt-side { stroke: #0d2528; stroke-width: 25; }
.df-theme-water .df-belt-top { stroke: color-mix(in srgb, var(--df-accent) 48%, #1d3438); stroke-width: 16; }
.df-theme-water .df-belt-slats { stroke: #e8fffb; stroke-width: 3; stroke-dasharray: 5 15; opacity: .9; }
.df-theme-water .df-edge-flow { stroke: #d8e8e2; }

/* Workers */
.df-worker-seat { transition: transform .55s cubic-bezier(.4,0,.2,1); }
.df-worker-shadow { fill: #000; opacity: .35; }
.df-worker-head { fill: #c19a5b; }
.df-worker-torso { fill: #6f9e9a; stroke: #3c4a48; stroke-width: 1; }
.df-worker-arm, .df-worker-leg { fill: #5f827c; transform-box: fill-box; transform-origin: center top; }
.df-worker-helmet { fill: #c19a5b; stroke: #8a5a0c; stroke-width: .8; }
.df-worker-carry { fill: #a98356; stroke: #5a3b28; stroke-width: 1; }
.df-worker[data-walking="1"] .df-leg-l { animation: df-leg-a .42s ease-in-out infinite; }
.df-worker[data-walking="1"] .df-leg-r { animation: df-leg-b .42s ease-in-out infinite; }
.df-worker[data-walking="1"] .df-arm-l { animation: df-arm-a .42s ease-in-out infinite; }
.df-worker[data-walking="1"] .df-arm-r { animation: df-arm-b .42s ease-in-out infinite; }
.df-worker[data-active="1"] .df-arm-r { animation: df-hammer .52s ease-in-out infinite; }
.df-theme-water .df-worker-torso { fill: #4f7a78; stroke: #1d3438; }
.df-theme-water .df-worker-arm, .df-theme-water .df-worker-leg { fill: #4f7a78; }
.df-theme-water .df-worker-helmet { fill: #a9c7c1; stroke: #2f4f52; }

/* Material box 3D */
.df-box { transition: transform .55s cubic-bezier(.4,0,.2,1); }
.df-box-animate { will-change: transform; }
.df-box-top { fill: #a98356; stroke: #5a3b28; stroke-width: 1.8; }
.df-box-left { fill: #8a6644; stroke: #5a3b28; stroke-width: 1.8; }
.df-box-right { fill: #6b4f36; stroke: #5a3b28; stroke-width: 1.8; }
.df-box-top-water { fill: #c9ddd6; stroke: #2f4f52; }
.df-box-left-water { fill: #57b8e8; stroke: #2f4f52; }
.df-box-right-water { fill: #2f7fa8; stroke: #2f4f52; }
.df-box-tape-top { fill: #e0cfa7; opacity: .92; }
.df-box-tape-face { fill: #c9b98f; opacity: .92; }
.df-box-window { fill: #c19a5b; opacity: .65; }
.df-box-bubble { fill: #eef5f1; opacity: .65; }
.df-box-bubble-b { opacity: .4; }
.df-box-port { fill: #1b1f27; stroke: var(--df-accent); stroke-width: 2; }
.df-box-paper { fill: #ece6d8; stroke: #9a8f7a; stroke-width: 1; }
.df-box-caption { fill: var(--df-muted); font-size: 8.5px; letter-spacing: .03em; paint-order: stroke; stroke: var(--df-bg); stroke-width: 2.4px; }
.df-box-glow-3d { fill: var(--df-accent); opacity: .2; filter: blur(5px); animation: df-glow 1.2s ease-in-out infinite; }
.df-flap-left, .df-flap-right { fill: #c98b4b; stroke: #5a3b28; stroke-width: 1.4; transform-box: fill-box; }
.df-box-open .df-flap-left { animation: df-flap-l 0.9s ease-out both; transform-origin: right bottom; }
.df-box-open .df-flap-right { animation: df-flap-r 0.9s ease-out both; transform-origin: left bottom; }
.df-sticker-bg { fill: #d6b06a; stroke: #8a6a2f; stroke-width: 1; }
.df-sticker-text { fill: #3a2f25; font-size: 7.5px; font-weight: 700; }
.df-barcode line { stroke: #3a2f25; stroke-width: 1.6; }
.df-stamp circle { fill: none; stroke: var(--df-green); stroke-width: 2; }
.df-stamp text { fill: var(--df-green); font-size: 7px; font-weight: 800; letter-spacing: .06em; }
.df-tape-seal { fill: #e0cfa7; transform-box: fill-box; transform-origin: left center; animation: df-seal .8s .15s ease-out both; }
.df-model-fx { color: var(--df-accent); }
.df-gear { color: var(--df-accent); opacity: .85; transform-box: fill-box; transform-origin: center; }
.df-active .df-gear-a { animation: df-spin 2.4s linear infinite; }
.df-active .df-gear-b { animation: df-spin-rev 1.8s linear infinite; }
.df-sparks line, .df-sparks circle { stroke: var(--df-amber); stroke-width: 2; fill: var(--df-amber); opacity: 0; animation: df-spark 1s ease-out infinite; }
.df-sparks line:nth-child(2) { animation-delay: .25s; }
.df-sparks line:nth-child(3) { animation-delay: .55s; }
.df-sparks circle:nth-child(2) { animation-delay: .3s; }
.df-sparks circle:nth-child(3) { animation-delay: .6s; }

/* Overlays */
.df-overlay {
  position: absolute; z-index: 3; border-radius: 10px; padding: 10px 12px;
  background: color-mix(in srgb, var(--df-panel) 94%, transparent);
  border: 1px solid color-mix(in srgb, var(--df-accent) 40%, var(--df-line));
  box-shadow: 0 12px 30px rgba(0,0,0,.32); backdrop-filter: blur(8px); color: var(--df-text);
}
.df-overlay-title { font-size: 10px; font-weight: 700; color: var(--df-accent); letter-spacing: .05em; margin-bottom: 6px; }
.df-skill-scan { left: 66%; top: 62%; transform: translate(-50%, -50%); width: 330px; }
.df-tool-window { left: 62%; top: 55%; transform: translate(-50%, -50%); width: 330px; }
.df-route-gate { left: 61%; top: 30%; transform: translate(-50%, -50%); width: 280px; }
.df-skill-beam { position: absolute; left: 12px; right: 12px; height: 2px; top: 30px; background: linear-gradient(90deg, transparent, var(--df-accent), transparent); animation: df-beam 1.4s ease-in-out infinite; }
.df-skill-shelf { display: flex; flex-direction: column; gap: 5px; position: relative; z-index: 1; }
.df-skill-lib { display: flex; align-items: center; gap: 8px; padding: 4px 7px; border-radius: 6px; border: 1px solid var(--df-line); background: color-mix(in srgb, var(--df-bg) 70%, transparent); font-size: 10px; animation: df-lib-scan 1.4s ease-in-out both; }
.df-skill-lib.df-hit { border-color: #d6b06a; background: color-mix(in srgb, #d6b06a 14%, transparent); box-shadow: 0 0 0 1px #d6b06a inset; }
.df-skill-lib.df-placeholder { opacity: .45; }
.df-skill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--df-muted); flex: none; }
.df-skill-lib.df-hit .df-skill-dot { background: #d6b06a; box-shadow: 0 0 8px #d6b06a; }
.df-skill-lib-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-skill-lib-count { color: var(--df-muted); font-size: 9px; flex: none; }
.df-skill-book { position: absolute; right: 20px; top: -26px; width: 34px; height: 26px; transform: translateY(10px) scale(.7); opacity: 0; animation: df-book-out 1.6s ease-out forwards; }
.df-book-cover { position: absolute; inset: 0; border-radius: 3px 6px 6px 3px; background: #9a6f3f; border: 1px solid #5a3b28; }
.df-book-page { position: absolute; right: 2px; top: 3px; width: 14px; height: 20px; background: #ece6d8; border: 1px solid #9a8f7a; transform-origin: left center; animation: df-page 1.5s ease-in-out infinite; }
.df-book-page-b { animation-delay: .18s; }
.df-skill-sticker { margin-top: 7px; display: inline-flex; align-items: center; gap: 5px; background: #d6b06a; color: #3a2f25; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 3px; transform: rotate(-2deg); animation: df-sticker-in .5s .9s ease-out both; }
.df-skill-sticker-pin { width: 5px; height: 5px; border-radius: 50%; background: #8a6a2f; }
.df-window-bar { display: flex; align-items: center; gap: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--df-line); margin-bottom: 6px; }
.df-window-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--df-muted); opacity: .5; }
.df-window-title { margin-left: auto; font-size: 9px; color: var(--df-accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.df-window-endpoint { font-size: 11px; font-weight: 700; color: var(--df-text); margin-bottom: 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.df-window-row { display: flex; gap: 6px; align-items: baseline; font-size: 9.5px; color: var(--df-muted); margin: 3px 0; min-width: 0; }
.df-window-row code { font-size: 9px; color: var(--df-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-window-arrow { flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; }
.df-window-arrow.df-req { color: var(--df-accent); }
.df-window-arrow.df-res { color: var(--df-green); }
.df-window-wire { position: relative; height: 8px; margin-top: 5px; }
.df-wire-in, .df-wire-out { position: absolute; top: 3px; width: 8px; height: 2px; background: var(--df-accent); animation: df-wire-in 1.2s linear infinite; }
.df-wire-out { background: var(--df-green); animation: df-wire-out 1.2s .5s linear infinite; }
.df-fork { position: relative; height: 46px; margin: 4px 0 6px; }
.df-fork-trunk { position: absolute; left: 50%; top: 0; bottom: 50%; width: 3px; background: var(--df-line); transform: translateX(-50%); }
.df-fork-branch { position: absolute; top: 50%; width: 44%; height: 3px; background: var(--df-line); border-radius: 3px; }
.df-fork-a { left: 0; transform: rotate(-18deg); transform-origin: right center; }
.df-fork-b { right: 0; transform: rotate(18deg); transform-origin: left center; }
.df-fork-branch.df-branch-on { background: var(--df-accent); box-shadow: 0 0 8px color-mix(in srgb, var(--df-accent) 60%, transparent); }
.df-gate { position: absolute; left: 50%; top: 38%; width: 14px; height: 22px; background: var(--df-panel-2); border: 2px solid var(--df-amber); transform: translate(-50%, -50%); border-radius: 2px; }
.df-gate.df-gate-open { transform: translate(-50%, -50%) rotate(38deg); border-color: var(--df-green); }
.df-route-decision { font-size: 13px; font-weight: 800; color: var(--df-accent); }
.df-route-detail { font-size: 9.5px; color: var(--df-muted); margin-top: 2px; }

/* Details */
.df-details { position: absolute; z-index: 5; right: 10px; top: 10px; width: 326px; max-height: calc(100% - 20px); overflow: auto; background: color-mix(in srgb, var(--df-panel) 96%, transparent); border: 1px solid var(--df-line); border-radius: 10px; box-shadow: 0 16px 40px rgba(0,0,0,.4); padding: 12px; font-size: 11px; }
.df-details-head { display: flex; align-items: flex-start; gap: 8px; }
.df-details-title { font-size: 14px; font-weight: 800; }
.df-details-sub { font-size: 10px; color: var(--df-muted); }
.df-close { margin-left: auto; appearance: none; border: 1px solid var(--df-line); background: transparent; color: var(--df-muted); width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 16px; line-height: 1; }
.df-close:hover { color: var(--df-text); }
.df-details-duty { margin: 8px 0; color: var(--df-muted); line-height: 1.55; }
.df-metrics { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.df-metric { flex: 1; min-width: 74px; border: 1px solid var(--df-line); border-radius: 7px; padding: 5px 7px; background: color-mix(in srgb, var(--df-bg) 55%, transparent); }
.df-metric b { display: block; font-size: 15px; }
.df-metric span { font-size: 9px; color: var(--df-muted); }
.df-section { margin-top: 10px; }
.df-section-title { font-size: 9px; font-weight: 800; letter-spacing: .08em; color: var(--df-accent); text-transform: uppercase; margin-bottom: 4px; }
.df-empty { color: var(--df-muted); line-height: 1.5; margin: 4px 0; }
.df-event-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.df-event-list li { display: grid; grid-template-columns: 38px 1fr; gap: 2px 6px; padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--df-line) 55%, transparent); }
.df-event-time { color: var(--df-faint); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; }
.df-event-time.error { color: var(--df-red); }
.df-event-label { color: var(--df-text); font-size: 10.5px; }
.df-event-detail { grid-column: 2; color: var(--df-muted); font-size: 9.5px; line-height: 1.4; }
.df-library-list { display: flex; flex-direction: column; gap: 3px; }
.df-library-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 6px; border: 1px solid var(--df-line); border-radius: 5px; font-size: 10px; }
.df-library-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-library-row b { color: var(--df-accent); }
.df-chip-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.df-chip { font-size: 9.5px; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--df-line); }
.df-chip-skill { color: #d6b06a; border-color: color-mix(in srgb, #d6b06a 50%, transparent); background: color-mix(in srgb, #d6b06a 10%, transparent); }
.df-tool-list, .df-file-list, .df-sub-list, .df-config-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.df-tool-list li { display: flex; gap: 6px; align-items: flex-start; }
.df-tool-status { width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--df-line); display: grid; place-items: center; font-size: 9px; flex: none; }
.df-tool-status.done { color: var(--df-green); border-color: var(--df-green); }
.df-tool-status.error { color: var(--df-red); border-color: var(--df-red); }
.df-tool-status.running { color: var(--df-amber); border-color: var(--df-amber); }
.df-tool-name { font-size: 10px; color: var(--df-text); overflow-wrap: anywhere; }
.df-tool-meta { font-size: 9px; color: var(--df-muted); }
.df-route-pill { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--df-line); }
.df-route-route { color: var(--df-accent); border-color: var(--df-accent); }
.df-route-hit { color: var(--df-green); border-color: var(--df-green); }
.df-route-miss { color: var(--df-amber); border-color: var(--df-amber); }
.df-route-single { color: var(--df-muted); }
.df-route-detail { color: var(--df-muted); font-size: 9.5px; margin: 4px 0; }
.df-sub-list li { display: flex; flex-direction: column; padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--df-line) 55%, transparent); }
.df-sub-list b { font-size: 10px; }
.df-sub-list span { font-size: 9px; color: var(--df-muted); }
.df-kv { display: grid; grid-template-columns: 82px 1fr; gap: 3px 6px; font-size: 10px; }
.df-kv span { color: var(--df-muted); }
.df-kv b { font-weight: 500; color: var(--df-text); overflow-wrap: anywhere; }
.df-file-list li { display: flex; gap: 6px; align-items: baseline; }
.df-file-op { color: var(--df-accent); font-size: 9px; flex: none; }
.df-file-list code { font-size: 9px; color: var(--df-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-config-list li { display: flex; flex-direction: column; padding: 3px 0; border-bottom: 1px solid color-mix(in srgb, var(--df-line) 55%, transparent); }
.df-config-list b { font-size: 10px; font-weight: 600; }
.df-config-list span { font-size: 9px; color: var(--df-muted); overflow-wrap: anywhere; }
.df-details-foot { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; color: var(--df-faint); font-size: 8.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

/* Footer / strip / empty */
.df-footer { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-top: 1px solid var(--df-line); background: var(--df-panel); flex-wrap: wrap; }
.df-visited { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0; }
.df-visited-label { font-size: 9px; color: var(--df-muted); }
.df-visited-empty { font-size: 9px; color: var(--df-faint); }
.df-visited-chip { font-size: 9px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--df-line); color: var(--df-text); }
.df-visited-chip + .df-visited-chip::before { content: '→'; color: var(--df-faint); margin-right: 4px; }
.df-legend { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.df-legend span { display: inline-flex; align-items: center; gap: 3px; font-size: 8.5px; color: var(--df-muted); }
.df-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.df-dot-run { background: var(--df-accent); box-shadow: 0 0 6px var(--df-accent); }
.df-dot-done { background: var(--df-green); }
.df-dot-skip { background: var(--df-amber); }
.df-dot-error { background: var(--df-red); }
.df-empty-banner { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 4; max-width: 420px; text-align: center; font-size: 11px; line-height: 1.6; color: var(--df-muted); background: color-mix(in srgb, var(--df-panel) 92%, transparent); border: 1px solid var(--df-line); border-radius: 9px; padding: 10px 14px; }
.df-view { height: 100%; overflow: auto; padding: 14px; background: var(--dsw-alias-bg-base, #101216); }
.df-view .df-root { max-width: 1160px; margin: 0 auto; }
.df-strip { width: 100%; max-width: var(--dsh-composer-card-max-width, 920px); margin: 0 auto 4px; border: 1px solid var(--df-line); border-radius: 9px; background: var(--df-panel); overflow: hidden; color: var(--df-text); font-family: var(--dsw-font-family, Inter, system-ui, sans-serif); }
.df-strip-head { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 30px; padding: 2px 9px; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; text-align: left; }
.df-strip-head:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.05)); }
.df-strip-mark { color: var(--df-accent); font-size: 15px; }
.df-strip-title { font-size: 12px; font-weight: 700; }
.df-strip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--df-muted); flex: none; }
.df-strip-dot.df-run { background: var(--df-green); box-shadow: 0 0 6px var(--df-green); animation: df-pulse 1.2s ease-in-out infinite; }
.df-strip-label { font-size: 10px; color: var(--df-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
.df-strip-mini { display: inline-flex; gap: 2px; flex: none; }
.df-mini { width: 6px; height: 6px; border-radius: 2px; background: color-mix(in srgb, var(--df-muted) 35%, transparent); }
.df-mini-on { background: var(--df-accent); box-shadow: 0 0 5px var(--df-accent); }
.df-mini-skip { background: var(--df-amber); }
.df-strip-chev { font-size: 10px; color: var(--df-muted); margin-left: 2px; }
.df-strip-body { border-top: 1px solid var(--df-line); max-height: 460px; overflow: auto; }
.df-strip-body .df-root { border: 0; border-radius: 0; }
.df-compact .df-toolbar { padding: 6px 8px; gap: 6px; }
.df-compact .df-brand-sub { display: none; }
.df-compact .df-footer { display: none; }
.df-compact .df-station-sub { display: none; }
.df-compact .df-details { width: 300px; }

/* Bookshelf / patrol / unbox sparks */
.df-shelf-frame { fill: #2f2720; stroke: #6b4f36; stroke-width: 1.4; }
.df-shelf-board { fill: #6b4f36; }
.df-shelf-book { opacity: .9; }
.df-theme-water .df-shelf-frame { fill: #0a2636; stroke: #4f7a78; }
.df-theme-water .df-shelf-board { fill: #4f7a78; }
.df-skill-hit {
  display: inline-block; margin: 0 0 6px; padding: 2px 8px; border-radius: 4px;
  background: #d6b06a; color: #3a2f25; font-size: 10px; font-weight: 800;
  transform: rotate(-1.5deg); animation: df-sticker-in .45s .9s ease-out both;
}
.df-unbox-sparks line { stroke: var(--df-amber); stroke-width: 2; stroke-linecap: round; animation: df-spark .75s ease-out infinite; }
.df-unbox-sparks circle { fill: var(--df-amber); animation: df-spark .75s .2s ease-out infinite; }
.df-patrol { pointer-events: none; }
.df-patrol-on .df-patrol-move { animation: df-patrol 7s ease-in-out infinite alternate; }
@keyframes df-patrol {
  0% { transform: translate(var(--df-patrol-x1), var(--df-patrol-y1)); }
  100% { transform: translate(var(--df-patrol-x2), var(--df-patrol-y2)); }
}
/* Environment decor */
.df-far-silhouette polygon { fill: #2b332e; opacity: .55; }
.df-ground-patches ellipse { fill: #5f6b5e; opacity: .28; }
.df-grass-tuft { stroke: #7fa98f; stroke-width: 1; opacity: .5; fill: none; }
.df-puddles ellipse { fill: #7fa9a1; opacity: .22; }
.df-crate-top { fill: var(--df-wood-light); stroke: var(--df-stroke-wood); stroke-width: 1.2; }
.df-crate-left { fill: var(--df-wood); stroke: var(--df-stroke-wood); stroke-width: 1.2; }
.df-crate-right { fill: var(--df-wood-dark); stroke: var(--df-stroke-wood); stroke-width: 1.2; }
.df-crate-line { stroke: var(--df-cream); stroke-width: 1; opacity: .28; }
.df-crate-water .df-crate-top { fill: var(--df-teal-light); }
.df-crate-water .df-crate-left { fill: var(--df-teal); }
.df-crate-water .df-crate-right { fill: #3f5f5c; }
.df-barrel-shadow { fill: var(--df-shadow); opacity: .4; }
.df-barrel-body { fill: var(--df-steel-2); stroke: var(--df-stroke-steel); stroke-width: 1.2; }
.df-barrel-top { fill: var(--df-warm); stroke: var(--df-stroke-steel); stroke-width: 1; }
.df-barrel-band { stroke: var(--df-brass-dark); stroke-width: 1.4; opacity: .8; }
.df-barrel-water .df-barrel-body { fill: var(--df-teal); }
.df-barrel-water .df-barrel-top { fill: var(--df-teal-light); }
.df-lamp-glow { fill: url(#df-lamp-glow); opacity: .85; }
.df-lamp-pole { stroke: var(--df-stroke-steel); stroke-width: 2; }
.df-lamp-head { fill: var(--df-cream); stroke: var(--df-stroke-steel); stroke-width: 1; }
.df-lamp-water .df-lamp-glow { fill: var(--df-teal-light); opacity: .14; }
.df-vignette { fill: url(#df-vignette); }
.df-haze { fill: url(#df-haze); pointer-events: none; }
.df-fog { fill: url(#df-fog); }
.df-roof-hi { fill: none; stroke: var(--df-cream); stroke-width: 1.2; opacity: .28; }
.df-tank-hi { fill: none; stroke: var(--df-steam); stroke-width: 1.4; opacity: .32; }
.df-box-hi { fill: none; stroke: var(--df-cream); stroke-width: 1.2; opacity: .34; }
.df-shadow { fill: var(--df-shadow); opacity: .3; filter: blur(2px); }
/* Extra props */
.df-tank-shadow { fill: var(--df-shadow); opacity: .35; }
.df-mini-tank-body { fill: #837e72; stroke: #5a554b; stroke-width: 1.2; }
.df-mini-tank-top { fill: #a8a293; stroke: #5a554b; stroke-width: 1; }
.df-mini-tank-band { stroke: #c19a5b; stroke-width: 1.4; opacity: .6; }
.df-mini-tank-water .df-mini-tank-body { fill: #5f9a94; }
.df-mini-tank-water .df-mini-tank-top { fill: #c9e8e2; }
.df-pipe-casing { fill: none; stroke: #3a4a46; stroke-linecap: round; stroke-linejoin: round; opacity: .9; }
.df-pipe-core { fill: none; stroke: #6f8a84; stroke-linecap: round; stroke-linejoin: round; }
.df-pipe-shine { fill: none; stroke: #c9ddd6; stroke-linecap: round; opacity: .35; }
.df-pipe-water .df-pipe-core { stroke: #5f827c; }
.df-tree-shadow { fill: var(--df-shadow); opacity: .35; }
.df-tree-trunk { fill: #5a4632; }
.df-tree-canopy { fill: #4f6b52; stroke: #3a4f3c; stroke-width: 1; }
.df-tree-canopy-2 { fill: #5f7d5f; }
.df-tree-water .df-tree-canopy { fill: #3f5f5c; stroke: #2f4f4c; }
.df-tree-water .df-tree-canopy-2 { fill: #4f7a78; }
.df-belt-legs { fill: none; stroke: #3a2b20; stroke-width: 6; stroke-dasharray: 3 26; opacity: .5; transform: translate(0, 16px); }
/* Atmosphere */
.df-puffs circle { fill: #c9c2b2; opacity: .13; }
.df-fence-rail { stroke: #6b4f36; stroke-width: 1.5; opacity: .55; }
.df-fence-rail-2 { opacity: .3; }
.df-fence-post { fill: #5a4632; opacity: .75; }
.df-flower-a { fill: #d6b06a; opacity: .65; }
.df-flower-b { fill: #c9ddd6; opacity: .55; }
.df-flower-c { fill: #a85f3d; opacity: .45; }
.df-sky-glow { fill: url(#df-sky-glow); pointer-events: none; }
/* Station-specific details */
.df-dial circle { fill: #2a2723; stroke: #c19a5b; stroke-width: 1.4; }
.df-dial line { stroke: #e0cfa7; stroke-width: 1.2; stroke-linecap: round; }
.df-dial-pin { fill: #c19a5b; }
.df-switch rect { fill: #6b675c; stroke: #5a554b; stroke-width: 1; }
.df-switch-lever { stroke: #c19a5b; stroke-width: 2; stroke-linecap: round; }
.df-switch-knob { fill: #e0cfa7; stroke: #8a6a2f; stroke-width: .8; }
.df-arch { fill: none; stroke: #c19a5b; stroke-width: 2; opacity: .55; }
.df-antenna { stroke: #837e72; stroke-width: 1.5; }
.df-antenna-tip { fill: #d6b06a; opacity: .8; }
/* Billboard / spotlight / HUD event */
.df-billboard-shadow { fill: var(--df-shadow); opacity: .35; }
.df-billboard-post { fill: #5a4632; }
.df-billboard-panel { fill: #2a2723; stroke: #c19a5b; stroke-width: 1.2; }
.df-billboard-title { fill: #e0cfa7; font-size: 16px; font-weight: 800; letter-spacing: .08em; }
.df-billboard-sub { fill: #a39b8c; font-size: 7px; letter-spacing: .14em; }
.df-billboard-water .df-billboard-panel { stroke: #8fb0a8; }
.df-billboard-water .df-billboard-title { fill: #d8e8e2; }
.df-spotlight { fill: url(#df-spot); opacity: .85; }
.df-pill-event { color: #e0cfa7; border-color: color-mix(in srgb, #c19a5b 55%, transparent); background: color-mix(in srgb, #c19a5b 8%, transparent); max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
/* Wall plaques */
.df-plaque-bg { fill: #2a2723; stroke: #c19a5b; stroke-width: .8; opacity: .94; }
.df-plaque-hi { stroke: #c19a5b; stroke-width: .7; opacity: .5; }
.df-plaque-name { fill: #ece6d8; font-size: 8.8px; font-weight: 700; }
.df-plaque-sub { fill: #a39b8c; font-size: 6.4px; }
/* Footprints / carrying */
.df-footprints ellipse { fill: #141310; opacity: .16; }
.df-worker[data-walking="1"] .df-footprints { animation: df-foot .42s linear infinite; }
.df-worker[data-carrying="1"] .df-worker-body { transform: rotate(-5deg); }
.df-worker[data-carrying="1"] .df-arm-l { animation: none; transform: rotate(-62deg); transform-box: fill-box; transform-origin: top center; }
.df-worker[data-carrying="1"] .df-arm-r { animation: none; transform: rotate(-70deg); transform-box: fill-box; transform-origin: top center; }
/* Thin service lines and bridges */
.df-service-line { fill: none; stroke: #c19a5b; stroke-width: 2; stroke-dasharray: 5 6; opacity: .55; stroke-linecap: round; }
.df-service-flow { fill: none; stroke: #e0cfa7; stroke-width: 2; stroke-dasharray: 2 10; opacity: .4; animation: df-flow 1.4s linear infinite; }
.df-edge-active .df-service-line { stroke: var(--df-accent); opacity: 1; }
.df-edge-error .df-service-line { stroke: var(--df-red); }
.df-edge-skip .df-service-line { stroke: var(--df-amber); }
.df-bridge-deck { fill: #8a6644; stroke: #5a3b28; stroke-width: 1.4; }
.df-bridge-arch { fill: none; stroke: #5a3b28; stroke-width: 4; }
.df-bridge-hi { stroke: #e0cfa7; stroke-width: 1; opacity: .5; }
/* Keyframes */
@keyframes df-flow { to { stroke-dashoffset: -18; } }
@keyframes df-spin { to { transform: rotate(360deg); } }
@keyframes df-spin-rev { to { transform: rotate(-360deg); } }
@keyframes df-pulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
@keyframes df-glow { 0%,100% { opacity: .1; transform: scale(.94); } 50% { opacity: .3; transform: scale(1.06); } }
@keyframes df-smoke { 0% { opacity: .2; transform: translate(0, 0) scale(.7); } 100% { opacity: 0; transform: translate(-5px, -20px) scale(1.6); } }
@keyframes df-bubble { 0%,100% { transform: translateY(0); opacity: .35; } 50% { transform: translateY(-5px); opacity: .75; } }
@keyframes df-spark { 0% { opacity: 0; transform: translate(0,0); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(9px,-9px); } }
@keyframes df-error-pulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes df-belt { to { stroke-dashoffset: -14; } }
@keyframes df-piston { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes df-arm { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(24deg); } }
@keyframes df-crane { 0%,100% { transform: translateY(0); } 50% { transform: translateY(14px); } }
@keyframes df-leg-a { 0%,100% { transform: rotate(12deg); } 50% { transform: rotate(-14deg); } }
@keyframes df-leg-b { 0%,100% { transform: rotate(-14deg); } 50% { transform: rotate(12deg); } }
@keyframes df-arm-a { 0%,100% { transform: rotate(-10deg); } 50% { transform: rotate(10deg); } }
@keyframes df-arm-b { 0%,100% { transform: rotate(10deg); } 50% { transform: rotate(-10deg); } }
@keyframes df-foot { 0%,100% { opacity: .16; transform: translateY(0); } 50% { opacity: .06; transform: translateY(-1px); } }
@keyframes df-hammer { 0%,100% { transform: rotate(0deg); } 45% { transform: rotate(-55deg); } }
@keyframes df-flap-l { 0% { transform: rotate(0deg); } 100% { transform: rotate(-26deg); } }
@keyframes df-flap-r { 0% { transform: rotate(0deg); } 100% { transform: rotate(26deg); } }
@keyframes df-seal { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
@keyframes df-beam { 0% { transform: scaleX(0); transform-origin: left; opacity: 0; } 30% { opacity: 1; } 100% { transform: scaleX(1); transform-origin: left; opacity: 0; } }
@keyframes df-lib-scan { 0%,100% { border-color: var(--df-line); } 45% { border-color: var(--df-accent); } }
@keyframes df-book-out { 0% { opacity: 0; transform: translate(20px, 14px) scale(.6) rotate(-8deg); } 35% { opacity: 1; transform: translate(-8px, -10px) scale(1) rotate(-3deg); } 100% { opacity: 1; transform: translate(-8px, -22px) scale(1.05) rotate(-2deg); } }
@keyframes df-page { 0%,100% { transform: rotateY(0deg); } 50% { transform: rotateY(-55deg); } }
@keyframes df-sticker-in { 0% { opacity: 0; transform: translateY(-4px) scale(.85) rotate(-8deg); } 100% { opacity: 1; transform: translateY(0) scale(1) rotate(-2deg); } }
@keyframes df-wire-in { 0% { left: 0; opacity: 0; } 30% { opacity: 1; } 100% { left: 100%; opacity: 0; } }
@keyframes df-wire-out { 0% { right: 0; opacity: 0; } 30% { opacity: 1; } 100% { right: 100%; opacity: 0; } }

@media (max-width: 720px) {
  .df-details { position: static; width: auto; max-height: none; margin: 8px; }
  .df-skill-scan, .df-tool-window, .df-route-gate { width: 260px; }
  .df-controls { width: 100%; margin-left: 0; }
}
.df-modal {
  position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
  padding: 34px; background: rgba(0,0,0,.58); backdrop-filter: blur(3px);
}
.df-modal-panel {
  width: min(1220px, 96vw); max-height: 92vh; overflow: auto; border-radius: 12px;
  background: var(--df-bg); border: 1px solid var(--df-line); box-shadow: 0 30px 80px rgba(0,0,0,.55);
}
.df-modal-head {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--df-line); background: var(--df-panel);
}
.df-modal-title { font-size: 12px; font-weight: 700; color: var(--df-text); }
.df-modal-close {
  margin-left: auto; appearance: none; border: 1px solid var(--df-line); background: transparent;
  color: var(--df-muted); width: 26px; height: 26px; border-radius: 7px; cursor: pointer; font-size: 17px; line-height: 1;
}
.df-modal-close:hover { color: var(--df-text); }
.df-modal .df-root { border: 0; border-radius: 0; }
@media (prefers-reduced-motion: reduce) {
  .df-root *, .df-root *::before, .df-root *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}
`

    return module.exports;
  }
});
