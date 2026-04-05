import type { GameState, SaveFileV1 } from './types'

const CACHE_KEY = 'terminal-rpg-cache-v1'
const META_KEY = 'terminal-rpg-meta-v1'

interface SessionMeta {
  lastSeenAt: string
}

interface CachedPayload {
  save: SaveFileV1
  cachedAt: string
}

export function toSaveFileV1(state: GameState): SaveFileV1 {
  return {
    version: 1,
    player: state.player,
    stats: state.stats,
    class: state.class,
    inventory: state.inventory,
    quests: state.quests,
    dateHistory: state.dateHistory,
    lastSeenAt: state.lastSeenAt,
    runtime: state.runtime,
    recentActivity: state.recentActivity,
    activeEncounter: state.activeEncounter,
    paused: state.paused,
    upgrades: state.upgrades,
  }
}

export function fromSaveFileV1(save: SaveFileV1): GameState {
  return {
    ...save,
    version: 1,
    upgrades: save.upgrades ?? {
      damage: 0,
      attack_speed: 0,
      gold_multiplier: 0,
      xp_multiplier: 0,
    },
  }
}

export function serializeSaveFile(state: GameState): string {
  const payload = toSaveFileV1(state)
  return JSON.stringify(payload, null, 2)
}

export function parseSaveFile(text: string): SaveFileV1 {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSON inválido para importação de save.')
  }

  return validateSaveFileV1(parsed)
}

export function validateSaveFileV1(input: unknown): SaveFileV1 {
  if (!isObject(input)) {
    throw new Error('Save inválido: estrutura base ausente.')
  }

  if (input.version !== 1) {
    throw new Error('Save inválido: version precisa ser 1.')
  }

  const requiredKeys = [
    'player',
    'stats',
    'class',
    'inventory',
    'quests',
    'dateHistory',
    'lastSeenAt',
    'runtime',
    'recentActivity',
    'activeEncounter',
    'paused',
  ] as const

  for (const key of requiredKeys) {
    if (!(key in input)) {
      throw new Error(`Save inválido: chave obrigatória ausente (${key}).`)
    }
  }

  if (!isObject(input.player) || typeof input.player.name !== 'string') {
    throw new Error('Save inválido: player malformado.')
  }

  if (!isObject(input.stats) || typeof input.stats.maxHp !== 'number') {
    throw new Error('Save inválido: stats malformado.')
  }

  if (!isObject(input.class) || typeof input.class.id !== 'string') {
    throw new Error('Save inválido: class malformado.')
  }

  if (!isObject(input.inventory)) {
    throw new Error('Save inválido: inventory malformado.')
  }

  if (!Array.isArray(input.quests) || !Array.isArray(input.dateHistory)) {
    throw new Error('Save inválido: quests/dateHistory precisam ser arrays.')
  }

  if (typeof input.lastSeenAt !== 'string') {
    throw new Error('Save inválido: lastSeenAt precisa ser string ISO.')
  }

  if (!isObject(input.runtime)) {
    throw new Error('Save inválido: runtime malformado.')
  }

  if (!Array.isArray(input.recentActivity)) {
    throw new Error('Save inválido: recentActivity precisa ser array.')
  }

  if (typeof input.paused !== 'boolean') {
    throw new Error('Save inválido: paused precisa ser boolean.')
  }

  return input as unknown as SaveFileV1
}

export function persistSessionCache(state: GameState): void {
  if (!hasStorage()) {
    return
  }

  const payload: CachedPayload = {
    save: toSaveFileV1(state),
    cachedAt: new Date().toISOString(),
  }

  const meta: SessionMeta = {
    lastSeenAt: state.lastSeenAt,
  }

  window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export function loadSessionCache(): GameState | null {
  if (!hasStorage()) {
    return null
  }

  const rawCache = window.localStorage.getItem(CACHE_KEY)
  if (!rawCache) {
    return null
  }

  try {
    const parsed = JSON.parse(rawCache) as CachedPayload
    const validated = validateSaveFileV1(parsed.save)
    const state = fromSaveFileV1(validated)

    const meta = loadSessionMeta()
    if (meta?.lastSeenAt) {
      state.lastSeenAt = meta.lastSeenAt
    }

    return state
  } catch {
    return null
  }
}

export function persistLastSeenAt(lastSeenAt: string): void {
  if (!hasStorage()) {
    return
  }

  const meta: SessionMeta = { lastSeenAt }
  window.localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export function buildExportFileName(now = new Date()): string {
  const stamp = now.toISOString().replaceAll(':', '-').split('.')[0]
  return `terminal-idle-save-${stamp}.json`
}

function loadSessionMeta(): SessionMeta | null {
  if (!hasStorage()) {
    return null
  }

  const rawMeta = window.localStorage.getItem(META_KEY)
  if (!rawMeta) {
    return null
  }

  try {
    const parsed = JSON.parse(rawMeta) as SessionMeta
    if (!parsed || typeof parsed.lastSeenAt !== 'string') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
