/**
 * dsh-factory — host half.
 *
 * Registers one client-visible session projection (`factoryTrail`) that folds
 * committed Session events into a factory-floor read model. The fold is a pure
 * synchronous function of the durable log, so every client sees the same
 * state, cold reads replay the same history, and no animation can run without
 * a real event behind it.
 *
 * Event sources used here (all durable `session/event`s):
 *   turn/start, turn/end, step/start, step/end,
 *   system/message, user/message, developer/message,
 *   request/header, request/context,
 *   assistant/message, assistant/attempt,
 *   tool/call, tool/result, subagent/catalog.
 *
 * Process-local Cordis events such as `agent/pre-step` are deliberately not
 * folded: they have no durable identity and would make a client snapshot
 * unreplayable. Their durable counterparts are `step/start` (after pre-step
 * acceptance), `system/message` / `user/message` / `request/header`
 * (assembly), and `step/end` (post-step). See docs/event-map.md.
 */
import { z } from 'zod'

export const name = 'dsh-factory'
export const inject = ['sessionProjections', 'webServer']

/** Workshop ids, in the order the factory floor reads left-to-right. */
export const WORKSHOPS = [
  'intake',
  'orchestrate',
  'assembly',
  'skill',
  'route',
  'model',
  'tools',
  'storage',
]

const number = z.number()
const nullableNumber = z.number().nullable()
const nullableString = z.string().nullable()

const workshopStats = z.object({
  lastAt: nullableNumber,
  used: z.number().int().nonnegative(),
  running: z.boolean(),
  detail: nullableString,
})

const counts = z.object({
  intake: z.number().int().nonnegative(),
  orchestrate: z.number().int().nonnegative(),
  assembly: z.number().int().nonnegative(),
  skill: z.number().int().nonnegative(),
  route: z.number().int().nonnegative(),
  model: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  storage: z.number().int().nonnegative(),
})

const bytes = z.object({
  intake: z.number().int().nonnegative(),
  orchestrate: z.number().int().nonnegative(),
  assembly: z.number().int().nonnegative(),
  skill: z.number().int().nonnegative(),
  route: z.number().int().nonnegative(),
  model: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  storage: z.number().int().nonnegative(),
})

const totals = z.object({
  turns: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  mcp: z.number().int().nonnegative(),
  skills: z.number().int().nonnegative(),
  subagents: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  storage: z.number().int().nonnegative(),
  assistant: z.number().int().nonnegative(),
  injects: z.number().int().nonnegative(),
})

const eventRecord = z.object({
  seq: z.number(),
  time: z.number(),
  workshop: z.string(),
  kind: z.string(),
  label: z.string(),
  detail: z.string(),
  status: z.string(),
})

const toolRecord = z.object({
  id: z.string(),
  name: z.string(),
  at: z.number(),
  turn: nullableNumber,
  step: nullableNumber,
  status: z.string(),
  ms: nullableNumber,
  mcp: z.boolean(),
  server: z.string(),
  error: z.string(),
  args: z.string(),
  chars: z.number().int().nonnegative(),
})

const skillRecord = z.object({
  name: z.string(),
  at: z.number(),
  via: z.string(),
  turn: nullableNumber,
})

const subagentRecord = z.object({
  id: z.string(),
  label: z.string(),
  mode: z.string(),
  at: z.number(),
})

const fileRecord = z.object({
  path: z.string(),
  op: z.string(),
  at: z.number(),
  turn: nullableNumber,
})

const current = z.object({
  workshop: z.string(),
  label: z.string(),
  at: z.number(),
}).nullable()

const modelRecord = z.object({
  provider: z.string(),
  model: z.string(),
  contextWindow: nullableNumber,
}).nullable()

const usageRecord = z.object({
  input: nullableNumber,
  output: nullableNumber,
  cacheRead: nullableNumber,
}).nullable()

const errorRecord = z.object({
  at: z.number(),
  workshop: z.string(),
  message: z.string(),
}).nullable()

const perTurn = z.object({
  turn: z.number().int().nonnegative(),
  startedAt: z.number(),
  counts,
  bytes,
  skipped: z.array(z.string()),
}).nullable()

/** Internal fold state; also the exact client wire value. */
export const FactoryState = z.object({
  v: z.literal(1),
  sid: z.string(),
  seq: z.number(),
  updatedAt: z.number(),
  running: z.boolean(),
  phase: z.string(),
  turn: nullableNumber,
  step: nullableNumber,
  startedAt: nullableNumber,
  endedAt: nullableNumber,
  current,
  model: modelRecord,
  usage: usageRecord,
  lastError: errorRecord,
  counts: totals,
  perTurn,
  workshops: z.object({
    intake: workshopStats,
    orchestrate: workshopStats,
    assembly: workshopStats,
    skill: workshopStats,
    route: workshopStats,
    model: workshopStats,
    tools: workshopStats,
    storage: workshopStats,
  }),
  events: z.array(eventRecord),
  tools: z.array(toolRecord),
  skills: z.array(skillRecord),
  subagents: z.array(subagentRecord),
  files: z.array(fileRecord),
})

const MAX_EVENTS = 80
const MAX_TOOLS = 30
const MAX_SKILLS = 20
const MAX_SUBAGENTS = 12
const MAX_FILES = 24

function zeroCounts() {
  return {
    intake: 0,
    orchestrate: 0,
    assembly: 0,
    skill: 0,
    route: 0,
    model: 0,
    tools: 0,
    storage: 0,
  }
}

function zeroBytes() {
  return { ...zeroCounts() }
}

function freshStats() {
  return { lastAt: null, used: 0, running: false, detail: null }
}

export function initialState(header) {
  return {
    v: 1,
    sid: String(header?.id ?? ''),
    seq: -1,
    updatedAt: 0,
    running: false,
    phase: 'idle',
    turn: null,
    step: null,
    startedAt: null,
    endedAt: null,
    current: null,
    model: null,
    usage: null,
    lastError: null,
    counts: {
      turns: 0,
      steps: 0,
      tools: 0,
      mcp: 0,
      skills: 0,
      subagents: 0,
      errors: 0,
      retries: 0,
      storage: 0,
      assistant: 0,
      injects: 0,
    },
    perTurn: null,
    workshops: {
      intake: freshStats(),
      orchestrate: freshStats(),
      assembly: freshStats(),
      skill: freshStats(),
      route: freshStats(),
      model: freshStats(),
      tools: freshStats(),
      storage: freshStats(),
    },
    events: [],
    tools: [],
    skills: [],
    subagents: [],
    files: [],
  }
}

function clip(value, max) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function textChars(message) {
  let total = 0
  const content = message?.content
  if (!Array.isArray(content)) return 0
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') total += part.text.length
    else if (part?.type === 'tool-call') total += JSON.stringify(part).length
  }
  return total
}

function parseArgs(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function argPath(args) {
  const value = args?.path ?? args?.file_path ?? args?.filePath ?? args?.target_file
  return typeof value === 'string' ? value : ''
}

function isStorageTool(name) {
  const lower = String(name ?? '').toLowerCase()
  return (
    lower === 'read' ||
    lower === 'write' ||
    lower === 'edit' ||
    lower === 'glob' ||
    lower === 'grep' ||
    lower === 'read_file' ||
    lower === 'write_file' ||
    lower === 'edit_file' ||
    lower === 'read_image' ||
    lower === 'list_directory' ||
    lower === 'list_dir' ||
    lower === 'search_files' ||
    lower === 'apply_patch' ||
    lower === 'file_info' ||
    lower.endsWith('_file') ||
    lower.startsWith('file_')
  )
}

function isSubagentTool(name) {
  const lower = String(name ?? '').toLowerCase()
  return lower === 'subagent' || lower === 'task' || lower.includes('subagent')
}

function isSkillTool(name) {
  return String(name ?? '').toLowerCase() === 'skill'
}

/** Record one real event and make its workshop the current one. */
function mark(state, workshop, label, detail, chars, status, kind) {
  const time = state.updatedAt
  const event = {
    seq: state.seq,
    time,
    workshop,
    kind: kind ?? '',
    label: clip(label, 80),
    detail: clip(detail ?? '', 150),
    status: status ?? '',
  }
  const events = [...state.events, event]
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)

  const workshops = { ...state.workshops }
  for (const key of WORKSHOPS) {
    const stats = workshops[key]
    workshops[key] = key === workshop
      ? {
          lastAt: time,
          used: stats.used + 1,
          running: true,
          detail: clip(detail ?? '', 90),
        }
      : { ...stats, running: false }
  }

  const turn = state.perTurn
  const perTurnValue = turn === null
    ? null
    : {
        ...turn,
        counts: {
          ...turn.counts,
          [workshop]: (turn.counts[workshop] ?? 0) + 1,
        },
        bytes: {
          ...turn.bytes,
          [workshop]: (turn.bytes[workshop] ?? 0) + Math.max(0, Number(chars) || 0),
        },
      }

  return {
    ...state,
    events,
    workshops,
    perTurn: perTurnValue,
    current: { workshop, label: clip(label, 80), at: time },
  }
}

function sourceKind(message) {
  const kind = message?.source?.kind
  return typeof kind === 'string' ? kind : ''
}

function sourceSkillName(message) {
  const source = message?.source
  if (source?.kind !== 'skill-invocation') return ''
  return typeof source.name === 'string' ? source.name : ''
}

function messageText(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  let text = ''
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') text += part.text
  }
  return text
}

function pushTool(state, tool) {
  const tools = [...state.tools, tool]
  if (tools.length > MAX_TOOLS) tools.splice(0, tools.length - MAX_TOOLS)
  return { ...state, tools }
}

function pushSkill(state, name, via, turn) {
  if (typeof name !== 'string' || name === '') return state
  const skills = [...state.skills, { name: clip(name, 64), at: state.updatedAt, via, turn }]
  if (skills.length > MAX_SKILLS) skills.splice(0, skills.length - MAX_SKILLS)
  return {
    ...state,
    skills,
    counts: { ...state.counts, skills: state.counts.skills + 1 },
  }
}

function pushSubagent(state, entry) {
  const subagents = [...state.subagents, entry]
  if (subagents.length > MAX_SUBAGENTS) subagents.splice(0, subagents.length - MAX_SUBAGENTS)
  return { ...state, subagents }
}

function pushFile(state, path, op, turn) {
  if (typeof path !== 'string' || path === '') return state
  const files = [...state.files, { path: clip(path, 180), op, at: state.updatedAt, turn }]
  if (files.length > MAX_FILES) files.splice(0, files.length - MAX_FILES)
  return { ...state, files }
}

function skippedWorkshops(perTurnValue) {
  if (perTurnValue === null) return []
  const optional = ['assembly', 'skill', 'tools', 'route', 'model', 'storage']
  return optional.filter((workshop) => (perTurnValue.counts[workshop] ?? 0) === 0)
}

/**
 * Pure fold: previous state + one committed Session event -> next state.
 * Events that are not part of the factory read model return the same
 * reference, which is the projection registry's zero-work signal.
 */
export function fold(rawState, event) {
  const type = String(event?.type ?? '')
  const data = event?.data ?? {}
  const seq = Number(event?.seq ?? 0)
  const time = Number(event?.time ?? 0)
  if (!Number.isFinite(seq) || !Number.isFinite(time)) return rawState

  switch (type) {
    case 'turn/start': {
      const turn = Number(data.turn ?? 0)
      let state = {
        ...rawState,
        seq,
        updatedAt: time,
        running: true,
        phase: 'running',
        turn,
        step: null,
        startedAt: time,
        endedAt: null,
        current: null,
        lastError: null,
        perTurn: {
          turn,
          startedAt: time,
          counts: zeroCounts(),
          bytes: zeroBytes(),
          skipped: [],
        },
        counts: { ...rawState.counts, turns: rawState.counts.turns + 1 },
      }
      state = mark(state, 'intake', `turn ${turn} 开始：物料入场`, '用户输入离开入口，沿传送带进入编排车间', 0, '', type)
      return state
    }

    case 'turn/end': {
      const turn = Number(data.turn ?? rawState.turn ?? 0)
      const reason = typeof data.reason === 'string'
        ? data.reason
        : typeof data.reason?.kind === 'string'
          ? data.reason.kind
          : typeof data.reason?.type === 'string'
            ? data.reason.type
            : 'completed'
      let state = {
        ...rawState,
        seq,
        updatedAt: time,
      }
      state = mark(
        state,
        'orchestrate',
        `turn ${turn} 结束（${reason}）`,
        reason === 'completed' ? '本轮完成，物料从出口离开' : `本轮以 ${reason} 收尾`,
        0,
        reason === 'error' ? 'error' : '',
        type,
      )
      const perTurnValue = state.perTurn === null
        ? null
        : { ...state.perTurn, skipped: skippedWorkshops(state.perTurn) }
      return {
        ...state,
        running: false,
        phase: reason === 'error' ? 'error' : 'done',
        endedAt: time,
        step: null,
        current: null,
        perTurn: perTurnValue,
      }
    }

    case 'step/start': {
      const step = Number(data.step ?? 0)
      let state = {
        ...rawState,
        seq,
        updatedAt: time,
        step,
        counts: { ...rawState.counts, steps: rawState.counts.steps + 1 },
      }
      state = mark(
        state,
        'assembly',
        `第 ${step} 步：装配车间开工`,
        'pre-step 已通过；拼装 system prompt、上下文与工具清单',
        0,
        '',
        type,
      )
      return state
    }

    case 'step/end': {
      const step = Number(data.step ?? 0)
      const state = { ...rawState, seq, updatedAt: time }
      return mark(state, 'orchestrate', `第 ${step} 步收工`, '工具结果已回填，编排车间决定下一步', 0, '', type)
    }

    case 'system/message': {
      const message = data.message
      const chars = textChars(message)
      let state = { ...rawState, seq, updatedAt: time }
      state = mark(state, 'assembly', 'system prompt 拼装', `${chars} 字符写入模型可见面`, chars, '', type)
      return state
    }

    case 'user/message':
    case 'developer/message': {
      const message = type === 'developer/message' ? data.message : data
      const kind = sourceKind(message)
      const skill = sourceSkillName(message)
      const chars = textChars(message)

      if (skill !== '') {
        let state = { ...rawState, seq, updatedAt: time }
        state = mark(state, 'skill', `技能注入：${skill}`, '按需把技能正文加入上下文', chars, '', type)
        state = pushSkill(state, skill, 'inject', state.turn)
        return state
      }

      if (kind === 'agent-message' || kind === 'team-message' || kind === 'subagent-settled') {
        let state = { ...rawState, seq, updatedAt: time }
        const label = kind === 'subagent-settled' ? '子代理结算回流' : '跨会话消息回流'
        state = mark(state, 'route', label, `来源 ${kind}`, chars, '', type)
        state = { ...state, counts: { ...state.counts, subagents: state.counts.subagents + 1 } }
        return state
      }

      if (kind === '') {
        let state = { ...rawState, seq, updatedAt: time }
        state = mark(state, 'intake', '用户消息进入模型面', `${chars} 字符物料进入装配线`, chars, '', type)
        state = { ...state, counts: { ...state.counts, intake: state.counts.intake + 1 } }
        return state
      }

      let state = { ...rawState, seq, updatedAt: time }
      state = mark(state, 'assembly', '注入上下文', `${kind} · ${chars} 字符`, chars, '', type)
      state = { ...state, counts: { ...state.counts, injects: state.counts.injects + 1 } }
      return state
    }

    case 'request/header': {
      const header = data.header ?? {}
      const config = header.config ?? {}
      const tools = Array.isArray(header.tools) ? header.tools.length : 0
      let state = { ...rawState, seq, updatedAt: time }
      state = mark(
        state,
        'assembly',
        '请求头冻结',
        `${tools} 个工具 schema 随请求发出`,
        0,
        '',
        type,
      )
      return {
        ...state,
        model: {
          provider: typeof config.provider === 'string' ? config.provider : '',
          model: typeof config.model === 'string' ? config.model : '',
          contextWindow: state.model?.contextWindow ?? null,
        },
      }
    }

    case 'request/context': {
      const provider = typeof data.provider === 'string' ? data.provider : ''
      const model = typeof data.model === 'string' ? data.model : ''
      const contextWindow = Number(data.contextWindow)
      let state = { ...rawState, seq, updatedAt: time }
      state = mark(
        state,
        'model',
        `路由到模型：${model || provider || '未知'}`,
        `${provider || '未知 provider'} · 上下文窗口 ${Number.isFinite(contextWindow) ? contextWindow : '未知'}`,
        0,
        '',
        type,
      )
      return {
        ...state,
        model: {
          provider,
          model,
          contextWindow: Number.isFinite(contextWindow) ? contextWindow : null,
        },
      }
    }

    case 'assistant/message': {
      const chars = textChars(data.message)
      const usage = data.usage
      let state = { ...rawState, seq, updatedAt: time }
      state = mark(state, 'model', '模型回包', `${chars} 字符输出`, chars, '', type)
      state = { ...state, counts: { ...state.counts, assistant: state.counts.assistant + 1 } }
      if (usage && typeof usage === 'object') {
        const input = Number(usage.inputTokens)
        const output = Number(usage.outputTokens)
        const cacheRead = Number(usage.cacheReadTokens)
        state = {
          ...state,
          usage: {
            input: Number.isFinite(input) ? input : null,
            output: Number.isFinite(output) ? output : null,
            cacheRead: Number.isFinite(cacheRead) ? cacheRead : null,
          },
        }
      }
      return state
    }

    case 'assistant/attempt': {
      let state = { ...rawState, seq, updatedAt: time }
      state = mark(state, 'model', '模型尝试失败/重试', '本轮尝试未产生可见消息', 0, 'error', type)
      return {
        ...state,
        counts: { ...state.counts, retries: state.counts.retries + 1 },
      }
    }

    case 'tool/call': {
      const callId = String(data.callId ?? '')
      const toolName = String(data.name ?? 'unknown')
      const argsRaw = typeof data.arguments === 'string' ? data.arguments : ''
      const args = parseArgs(argsRaw)
      const mcp = toolName.startsWith('mcp__')
      const server = mcp ? toolName.split('__')[1] ?? '' : ''
      const skill = isSkillTool(toolName)
      const subagent = isSubagentTool(toolName)
      const storage = !mcp && !skill && !subagent && isStorageTool(toolName)
      const path = argPath(args)
      const turn = Number.isFinite(Number(data.turn)) ? Number(data.turn) : rawState.turn
      const step = Number.isFinite(Number(data.step)) ? Number(data.step) : rawState.step

      let state = { ...rawState, seq, updatedAt: time }
      state = pushTool(state, {
        id: callId,
        name: clip(toolName, 64),
        at: time,
        turn,
        step,
        status: 'running',
        ms: null,
        mcp,
        server: clip(server, 32),
        error: '',
        args: clip(argsRaw, 220),
        chars: 0,
      })

      let workshop = 'tools'
      let label = `工具调用：${toolName}`
      let detail = argsRaw ? clip(argsRaw, 120) : '模型发起一次工具调用'
      if (mcp) {
        workshop = 'tools'
        label = `MCP 调用：${server || 'server'}`
        detail = `${toolName} · ${argsRaw ? clip(argsRaw, 110) : '外部接口'}` 
        state = { ...state, counts: { ...state.counts, mcp: state.counts.mcp + 1 } }
      } else if (skill) {
        workshop = 'skill'
        const skillName = typeof args.name === 'string' ? args.name : typeof args.skill === 'string' ? args.skill : 'skill'
        label = `技能车间加载：${skillName}`
        detail = '模型通过 skill 工具按需取用技能'
        state = pushSkill(state, skillName, 'tool', turn)
      } else if (subagent) {
        workshop = 'route'
        const subLabel = typeof args.label === 'string' ? args.label : typeof args.description === 'string' ? args.description : '子代理'
        label = `路由车间派工：${subLabel}`
        detail = argsRaw ? clip(argsRaw, 120) : '把一段工作派给子代理'
      } else if (storage) {
        workshop = 'storage'
        label = `仓储读写：${toolName}`
        detail = path || (argsRaw ? clip(argsRaw, 120) : '工作区文件操作')
        state = { ...state, counts: { ...state.counts, storage: state.counts.storage + 1 } }
        if (path !== '') state = pushFile(state, path, toolName, turn)
      } else {
        state = { ...state, counts: { ...state.counts, tools: state.counts.tools + 1 } }
      }

      return mark(state, workshop, label, detail, 0, '', type)
    }

    case 'tool/result': {
      const message = data.message ?? {}
      const callId = String(message.toolCallId ?? message.source?.callId ?? '')
      const index = rawState.tools.findIndex((tool) => tool.id === callId)
      if (index < 0) {
        let state = { ...rawState, seq, updatedAt: time }
        state = mark(state, 'tools', '工具结果返回', '未找到对应调用的结果', textChars(message), '', type)
        return state
      }

      const tool = rawState.tools[index]
      const chars = textChars(message)
      const reason = typeof data.error?.reason === 'string'
        ? data.error.reason
        : typeof data.error?.code === 'string'
          ? data.error.code
          : message.isError === true
            ? 'tool error'
            : ''
      const failed = reason !== ''
      const ms = tool.at > 0 ? Math.max(0, time - tool.at) : null
      const tools = [...rawState.tools]
      tools[index] = {
        ...tool,
        status: failed ? 'error' : 'done',
        ms,
        error: clip(reason, 120),
        chars,
      }

      let workshop = 'tools'
      if (tool.mcp) workshop = 'tools'
      else if (isSkillTool(tool.name)) workshop = 'skill'
      else if (isSubagentTool(tool.name)) workshop = 'route'
      else if (isStorageTool(tool.name)) workshop = 'storage'

      let state = { ...rawState, seq, updatedAt: time, tools }
      state = mark(
        state,
        workshop,
        failed ? `${tool.name} 失败` : `${tool.name} 完成`,
        `${ms === null ? '耗时未知' : `${ms} ms`} · 结果 ${chars} 字符${reason ? ` · ${reason}` : ''}`,
        chars,
        failed ? 'error' : '',
        type,
      )
      if (failed) {
        state = {
          ...state,
          counts: { ...state.counts, errors: state.counts.errors + 1 },
          lastError: { at: time, workshop, message: clip(reason, 150) },
        }
      }
      return state
    }

    case 'subagent/catalog': {
      const childId = String(data.childId ?? '')
      const mode = typeof data.mode === 'string' ? data.mode : 'unknown'
      const label = typeof data.label === 'string' && data.label !== '' ? data.label : '子代理'
      let state = { ...rawState, seq, updatedAt: time }
      state = mark(state, 'route', `路由器登记子代理：${label}`, `${mode} · ${childId || '未知 id'}`, 0, '', type)
      state = pushSubagent(state, { id: childId, label: clip(label, 64), mode, at: time })
      return { ...state, counts: { ...state.counts, subagents: state.counts.subagents + 1 } }
    }

    case 'session/end-seed':
      return rawState

    default:
      return rawState
  }
}

/** The projection definition registered on the host. */
export const factoryProjection = {
  key: 'factoryTrail',
  stateSchema: FactoryState,
  stateVersion: 2,
  init: (header) => initialState(header),
  apply: (state, event) => fold(state, event),
  wire: {
    viewSchema: FactoryState,
    view: (state) => state,
  },
}

/** Process-local phase marks for the in-flight step. Never persisted, never faked. */
const LIVE = new Map()
const LIVE_TRACE = new Map()

function markLive(agent, phase, label, extra) {
  const sessionId = agent?.id
  if (typeof sessionId !== 'string' || sessionId === '') return
  const previous = LIVE.get(sessionId)
  const at = Date.now()
  const history = [...(Array.isArray(previous?.history) ? previous.history : []), { phase, label, at }].slice(-12)
  LIVE.set(sessionId, {
    phase,
    label,
    at,
    history,
    ...extra,
  })
  LIVE_TRACE.set(sessionId, history.slice(-20))
}

function clearLive(sessionId) {
  if (typeof sessionId === 'string' && sessionId !== '') LIVE.delete(sessionId)
}

function liveHook(ctx) {
  // The exact host events the task names. Listeners call next() so the real
  // waterfall chain is untouched; they only record the in-flight phase.
  ctx.on('agent/pre-step', async (payload, next) => {
    markLive(payload?.agent, 'pre-step', `pre-step：装配第 ${payload?.step ?? '?'} 步`, {
      turn: payload?.turn,
      step: payload?.step,
    })
    try {
      return await next()
    } finally {
      markLive(payload?.agent, 'post-step', `post-step：第 ${payload?.step ?? '?'} 步装配完成`, {
        turn: payload?.turn,
        step: payload?.step,
      })
    }
  }, { prepend: true })

  ctx.on('agent/request', async (payload, next) => {
    markLive(payload?.agent, 'model-request', `agent/request：第 ${payload?.step ?? '?'} 步请求模型`, {
      turn: payload?.turn,
      step: payload?.step,
    })
    return next()
  })

  ctx.on('agent/turn-stopping', (payload) => {
    markLive(payload?.agent, 'stopping', 'turn 正在停止', {})
  })

  ctx.on('session/event', (session, event) => {
    const sessionId = session?.id
    if (typeof sessionId !== 'string') return
    const type = event?.type
    const data = event?.data ?? {}
    if (type === 'turn/start') markLive({ id: sessionId }, 'turn', `turn ${data.turn ?? '?'} 开始`, { turn: data.turn })
    else if (type === 'step/start') markLive({ id: sessionId }, 'assembly', `第 ${data.step ?? '?'} 步装配上下文`, { turn: data.turn, step: data.step })
    else if (type === 'tool/call') markLive({ id: sessionId }, 'tools', `工具调用：${data.name ?? 'tool'}`, { turn: data.turn, step: data.step })
    else if (type === 'assistant/message') markLive({ id: sessionId }, 'model', '模型回包', { turn: data.turn, step: data.step })
    else if (type === 'turn/end') clearLive(sessionId)
  })
}

const LIBRARY_LABELS = {
  'user-dsh': '用户技能库 · ~/.dsh/skills',
  'project-dsh': '项目技能库 · .dsh/skills',
  'user-agents': '用户 Agents 库 · ~/.agents/skills',
  'project-agents': '项目 Agents 库 · .agents/skills',
  bundled: '插件自带技能',
  runtime: '运行时注册技能',
  custom: '自定义技能库',
}

function libraryLabel(source) {
  return LIBRARY_LABELS[source] ?? `技能库 · ${source}`
}

/** Read the live skill registry into the four-library shelf the client scans. */
async function readLibraries(ctx, sessionId) {
  let skills = ctx.get('skills')
  let scope
  const debug = { sessionId: typeof sessionId === 'string' && sessionId !== '' }
  const presets = ctx.get('agentPresets')
  const agents = ctx.get('agents')
  debug.globalSkills = skills !== undefined && typeof skills.list === 'function'
  debug.agentsService = agents !== undefined
  debug.presetsService = presets !== undefined
  if (agents !== undefined) {
    try {
      let agent = typeof sessionId === 'string' && sessionId !== '' && typeof agents.get === 'function'
        ? agents.get(sessionId)
        : undefined
      if (agent === undefined && typeof agents.list === 'function') {
        const live = agents.list()
        agent = Array.isArray(live) && live.length > 0 ? live[0] : undefined
      }
      debug.agentFound = agent !== undefined
      const scoped = agent === undefined ? undefined : presets?.serviceFor?.(agent, 'skills')
      debug.scopedService = scoped !== undefined && typeof scoped.list === 'function'
      if (scoped !== undefined && typeof scoped.list === 'function') skills = scoped
      else if (agent !== undefined) scope = agent
      else if (typeof presets?.acquireScope === 'function') {
        const lease = await presets.acquireScope(undefined)
        scope = lease?.key
        debug.scopeAcquired = scope !== undefined
      }
    } catch (error) {
      debug.error = error instanceof Error ? error.message : String(error)
    }
  }
  if (skills === undefined || typeof skills.list !== 'function') {
    return { libraries: [], total: 0, at: Date.now(), error: 'skills service unavailable' }
  }
  try {
    const list = await skills.list(scope === undefined ? {} : { scope })
    const groups = new Map()
    for (const entry of Array.isArray(list) ? list : []) {
      if (entry === null || typeof entry !== 'object') continue
      const name = typeof entry.name === 'string' ? entry.name : ''
      if (name === '') continue
      const source = typeof entry.source === 'string' && entry.source !== ''
        ? entry.source
        : typeof entry.provider === 'string' && entry.provider !== ''
          ? entry.provider
          : 'runtime'
      if (!groups.has(source)) groups.set(source, { source, skills: [] })
      groups.get(source).skills.push(name)
    }
    const categories = [
      { id: 'user-dsh', label: '用户技能库 · ~/.dsh/skills', sources: ['user-dsh'] },
      { id: 'project-dsh', label: '项目技能库 · .dsh/skills', sources: ['project-dsh'] },
      { id: 'user-agents', label: '用户 Agents 库 · ~/.agents/skills', sources: ['user-agents', 'project-agents'] },
      { id: 'runtime', label: '运行时 / 插件技能', sources: ['runtime', 'bundled', 'custom'] },
    ]
    const libraries = categories.map((category) => {
      const skills = []
      for (const source of category.sources) {
        const group = groups.get(source)
        if (group !== undefined) skills.push(...group.skills)
      }
      return { id: category.id, label: category.label, count: skills.length, skills: skills.sort() }
    })
    for (const [source, group] of groups) {
      if (categories.some((category) => category.sources.includes(source))) continue
      libraries[3].skills.push(...group.skills)
      libraries[3].count = libraries[3].skills.length
    }
    libraries[3].skills.sort()
    return { libraries, total: libraries.reduce((sum, item) => sum + item.count, 0), at: Date.now(), debug }
  } catch (error) {
    return {
      libraries: [],
      total: 0,
      at: Date.now(),
      debug,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 蓝图页：CrommaCode 网格版（web/factory-cromma.html），与 lane 蛇形产线版并存以便对比。 */
function registerBlueprintRoute(ctx) {
  ctx.inject(['webServer'], (scoped) => {
    const server = scoped.get('webServer')
    if (typeof server?.register !== 'function') return
    const file = new URL('../web/factory-cromma.html', import.meta.url)
    scoped.effect(
      () => server.register({
        kind: 'exact',
        path: '/dsh-factory/blueprint',
        handler: async (req, res) => {
          try {
            const { readFile } = await import('node:fs/promises')
            const buf = await readFile(file)
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': buf.length, 'cache-control': 'no-store' })
            res.end(buf)
          } catch (error) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('blueprint page missing: ' + String(error?.message || error))
          }
        },
      }),
      'dsh-factory: blueprint page route',
    )
  })
}

function registerLibraryRoute(ctx) {
  ctx.inject(['connection', 'skills'], (scoped) => {
    const connection = scoped.get('connection')
    const register = connection?.fetch?.register
    if (typeof register !== 'function') return
    scoped.effect(
      () => register({
        path: '/api/dsh-factory/libraries',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let sessionId = ''
          try {
            const body = await request.json()
            sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          } catch {
            sessionId = ''
          }
          const value = await readLibraries(scoped, sessionId)
          return Response.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } })
        },
      }),
      'dsh-factory: library shelf route',
    )
  })
}

function registerLiveRoute(ctx) {
  ctx.inject(['connection'], (scoped) => {
    const connection = scoped.get('connection')
    const register = connection?.fetch?.register
    if (typeof register !== 'function') return
    scoped.effect(
      () => register({
        path: '/api/dsh-factory/live',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let sessionId = ''
          try {
            const body = await request.json()
            sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          } catch {
            sessionId = ''
          }
          const value = sessionId === '' ? null : LIVE.get(sessionId) ?? null
          const trace = sessionId === '' ? [] : LIVE_TRACE.get(sessionId) ?? []
          return Response.json({ ok: true, value, trace }, { headers: { 'cache-control': 'no-store' } })
        },
      }),
      'dsh-factory: live phase route',
    )
  })
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.sessionProjections.register(factoryProjection),
    'dsh-factory: factoryTrail projection',
  )
  registerLibraryRoute(ctx)
  registerBlueprintRoute(ctx)
  registerLiveRoute(ctx)
  liveHook(ctx)
  ctx.logger.info('dsh-factory: factoryTrail projection registered')
}

// Kept for offline tests and the event-map verifier.
export const __test = {
  initialState,
  fold,
  skippedWorkshops,
  textChars,
  parseArgs,
  isStorageTool,
  isSubagentTool,
  isSkillTool,
  markLive,
  LIVE,
}
