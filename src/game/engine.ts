import type {
  ClassId,
  ClassProfile,
  CommandResult,
  DateHistoryEntry,
  EncounterState,
  GameState,
  QuestDefinition,
  QuestObjectiveMetric,
  QuestState,
  UpgradeDefinition,
  UpgradeState,
} from './types'

export const REALTIME_TICK_MS = 1_000
export const SIMULATION_STEP_MS = 10_000
export const MAX_OFFLINE_PROGRESS_MS = 24 * 60 * 60 * 1_000
export const GLOBAL_GAME_SLOWDOWN = 0.58

const MAX_ACTIVITY_ENTRIES = 40
const MAX_DATE_HISTORY_ENTRIES = 200

const CLASS_PROFILES: Record<ClassId, ClassProfile> = {
  sentinel: {
    id: 'sentinel',
    name: 'Sentinel',
    tagline: 'Linha de frente estável e resistente.',
    base: { hp: 152, maxHp: 152, attack: 13, defense: 12, speed: 5 },
    growth: { maxHp: 18, attack: 2.1, defense: 2, speed: 0.45 },
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    tagline: 'Explosões de dano e progressão veloz.',
    base: { hp: 118, maxHp: 118, attack: 17, defense: 8, speed: 6 },
    growth: { maxHp: 12, attack: 3, defense: 1.3, speed: 0.6 },
  },
  shade: {
    id: 'shade',
    name: 'Shade',
    tagline: 'Assassino ágil, crítico e evasivo.',
    base: { hp: 126, maxHp: 126, attack: 15, defense: 9, speed: 8 },
    growth: { maxHp: 14, attack: 2.4, defense: 1.5, speed: 0.9 },
  },
}

const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'daily_hunt',
    title: 'Caçada diária',
    description: 'Derrote 8 inimigos hoje.',
    cycle: 'daily',
    target: 8,
    metric: 'kills',
    rewardXp: 100,
    rewardGold: 45,
  },
  {
    id: 'daily_contract',
    title: 'Contrato de suprimentos',
    description: 'Acumule 120 de ouro no dia.',
    cycle: 'daily',
    target: 120,
    metric: 'gold',
    rewardXp: 85,
    rewardGold: 40,
  },
  {
    id: 'weekly_command',
    title: 'Comando semanal',
    description: 'Derrote 2 chefes nesta semana.',
    cycle: 'weekly',
    target: 2,
    metric: 'bossesDefeated',
    rewardXp: 350,
    rewardGold: 180,
  },
]

function generateUpgradeLevels(baseCost: number, costMultiplier: number, maxLevels: number): Array<{ level: number; cost: number; multiplier: number }> {
  const levels = []
  for (let i = 1; i <= maxLevels; i++) {
    const cost = Math.floor(baseCost * Math.pow(costMultiplier, i - 1))
    const multiplier = 1 + (i * 0.1) // Each level adds 10% multiplier
    levels.push({ level: i, cost, multiplier })
  }
  return levels
}

const UPGRADE_DEFINITIONS: Record<string, UpgradeDefinition> = {
  damage: {
    id: 'damage',
    name: 'Dano',
    description: 'Aumenta o dano de ataque.',
    baseCost: 100,
    costMultiplier: 1.15,
    levels: generateUpgradeLevels(100, 1.15, 20),
  },
  attack_speed: {
    id: 'attack_speed',
    name: 'Velocidade de Ataque',
    description: 'Aumenta a velocidade de ataque.',
    baseCost: 120,
    costMultiplier: 1.15,
    levels: generateUpgradeLevels(120, 1.15, 20),
  },
  gold_multiplier: {
    id: 'gold_multiplier',
    name: 'Multiplicador de Ouro',
    description: 'Aumenta os ganhos de ouro.',
    baseCost: 150,
    costMultiplier: 1.2,
    levels: generateUpgradeLevels(150, 1.2, 20),
  },
  xp_multiplier: {
    id: 'xp_multiplier',
    name: 'Multiplicador de XP',
    description: 'Aumenta os ganhos de experiência.',
    baseCost: 150,
    costMultiplier: 1.2,
    levels: generateUpgradeLevels(150, 1.2, 20),
  },
}

interface MetricsDelta {
  kills: number
  gold: number
  bossesDefeated: number
  xp: number
}

export interface EngineOptions {
  rng?: () => number
  captureLogs?: boolean
}

const DEFAULT_PLAYER_NAME = 'Meaghan'

export function listClassProfiles(): ClassProfile[] {
  return Object.values(CLASS_PROFILES)
}

export function getClassProfile(classId: ClassId): ClassProfile {
  return CLASS_PROFILES[classId]
}

export function createInitialGameState(
  now: Date = new Date(),
  playerName = DEFAULT_PLAYER_NAME,
): GameState {
  const classId: ClassId = 'sentinel'
  const profile = getClassProfile(classId)
  const nowIso = now.toISOString()

  const state: GameState = {
    version: 1,
    player: {
      name: playerName,
      level: 1,
      xp: 0,
      nextXp: 180,
      gold: 30,
      zone: 1,
    },
    stats: { ...profile.base },
    class: { id: classId },
    inventory: {},
    quests: [],
    dateHistory: [],
    recentActivity: [],
    runtime: {
      kills: 0,
      deaths: 0,
      bossesDefeated: 0,
    },
    activeEncounter: null,
    paused: false,
    lastSeenAt: nowIso,
    upgrades: {
      damage: 0,
      attack_speed: 0,
      gold_multiplier: 0,
      xp_multiplier: 0,
    },
  }

  initializeQuestCycles(state, now)
  pushActivity(state, 'Sistema iniciado. Digite "help" para comandos.', nowIso)
  pushDateHistory(state, 'session', 'Primeira inicialização da sessão', nowIso)
  pushDateHistory(
    state,
    'class',
    `Classe inicial definida: ${profile.name}`,
    nowIso,
  )

  return state
}

export function registerSession(state: GameState, now: Date, label: string): GameState {
  const nextState = cloneState(state)
  const nowIso = now.toISOString()
  pushActivity(nextState, label, nowIso)
  pushDateHistory(nextState, 'session', label, nowIso)
  nextState.lastSeenAt = nowIso
  return nextState
}

export function setPlayerClass(
  state: GameState,
  classId: ClassId,
  now: Date = new Date(),
): GameState {
  const nextState = cloneState(state)
  const previousClass = getClassProfile(nextState.class.id)
  const nextClass = getClassProfile(classId)
  const hpRatio = nextState.stats.maxHp > 0 ? nextState.stats.hp / nextState.stats.maxHp : 1

  nextState.class.id = classId
  nextState.stats = buildStatsForLevel(classId, nextState.player.level)
  nextState.stats.hp = Math.max(1, Math.round(nextState.stats.maxHp * hpRatio))

  const nowIso = now.toISOString()
  pushActivity(
    nextState,
    `Classe alterada de ${previousClass.name} para ${nextClass.name}.`,
    nowIso,
  )
  pushDateHistory(
    nextState,
    'class',
    `Classe selecionada: ${nextClass.name}`,
    nowIso,
  )
  nextState.lastSeenAt = nowIso

  return nextState
}

export function computeOfflineDeltaMs(
  lastSeenAt: string,
  now: Date,
  maxOfflineMs = MAX_OFFLINE_PROGRESS_MS,
): number {
  const then = Date.parse(lastSeenAt)
  if (Number.isNaN(then)) {
    return 0
  }

  const rawDelta = now.getTime() - then
  if (rawDelta <= 0) {
    return 0
  }

  return Math.min(rawDelta, maxOfflineMs)
}

export function applyOfflineProgress(
  state: GameState,
  now: Date,
  options: EngineOptions = {},
): { state: GameState; appliedMs: number } {
  const appliedMs = computeOfflineDeltaMs(state.lastSeenAt, now)
  if (appliedMs <= 0 || state.paused) {
    const nextState = cloneState(state)
    nextState.lastSeenAt = now.toISOString()
    return { state: nextState, appliedMs: 0 }
  }

  const progressedState = advanceGameState(state, appliedMs, now, {
    rng: options.rng,
    captureLogs: false,
  })

  const withResumeLog = cloneState(progressedState)
  pushActivity(
    withResumeLog,
    `Progresso offline aplicado: ${Math.floor(appliedMs / 60_000)} min.`,
    now.toISOString(),
  )

  return { state: withResumeLog, appliedMs }
}

export function listUpgrades(): UpgradeDefinition[] {
  return Object.values(UPGRADE_DEFINITIONS)
}

export function getUpgradeDefinition(id: string): UpgradeDefinition | null {
  return (UPGRADE_DEFINITIONS as Record<string, UpgradeDefinition | undefined>)[id] ?? null
}

export function getUpgradeCost(upgradeId: string, currentLevel: number): number {
  const definition = getUpgradeDefinition(upgradeId)
  if (!definition) return 0
  
  const nextLevel = currentLevel + 1
  if (nextLevel > definition.levels.length) return 0
  
  return definition.levels[nextLevel - 1].cost
}

export function getUpgradeMultiplier(upgradeId: string, level: number): number {
  if (level === 0) return 1
  
  const definition = getUpgradeDefinition(upgradeId)
  if (!definition || level > definition.levels.length) return 1
  
  return definition.levels[level - 1].multiplier
}

export function applyUpgrade(state: GameState, upgradeId: string, now: Date): CommandResult {
  const result = { ok: false, message: '' }
  const definition = getUpgradeDefinition(upgradeId)
  
  if (!definition) {
    result.message = `Melhoria desconhecida: ${upgradeId}.`
    return result
  }
  
  const currentLevel = state.upgrades[definition.id as keyof UpgradeState]
  const cost = getUpgradeCost(upgradeId, currentLevel)
  
  if (cost === 0) {
    result.message = `A melhoria "${definition.name}" já atingiu o nível máximo.`
    return result
  }
  
  if (state.player.gold < cost) {
    result.message = `Ouro insuficiente. Necessário: ${cost}, Disponível: ${state.player.gold}.`
    return result
  }
  
  const newState = cloneState(state)
  newState.player.gold -= cost
  newState.upgrades[definition.id as keyof UpgradeState] += 1
  const newLevel = newState.upgrades[definition.id as keyof UpgradeState]
  
  pushActivity(newState, `Melhoria "${definition.name}" obteve nível ${newLevel}.`, now.toISOString())
  
  return {
    ok: true,
    message: `Melhoria "${definition.name}" atualizada para nível ${newLevel} (Custo: ${cost} ouro).`,
    statePatch: newState,
  }
}

export function advanceGameState(
  state: GameState,
  deltaMs: number,
  now: Date,
  options: EngineOptions = {},
): GameState {
  if (deltaMs <= 0) {
    return state
  }

  const rng = options.rng ?? Math.random
  const nextState = cloneState(state)
  const nowIso = now.toISOString()

  initializeQuestCycles(nextState, now)

  if (nextState.paused) {
    nextState.lastSeenAt = nowIso
    return nextState
  }

  let remaining = Math.max(1, Math.round(deltaMs * GLOBAL_GAME_SLOWDOWN))
  const logs: string[] = []
  const metrics: MetricsDelta = { kills: 0, gold: 0, bossesDefeated: 0, xp: 0 }

  while (remaining > 0) {
    const stepMs = Math.min(SIMULATION_STEP_MS, remaining)
    remaining -= stepMs

    regenerateHp(nextState, stepMs)

    if (nextState.activeEncounter) {
      resolveCombatStep(nextState, stepMs, rng, now, metrics, logs)
    } else {
      resolveExplorationStep(nextState, stepMs, rng, now, metrics, logs)
    }

    applyQuestProgress(nextState, metrics, now, rng, logs)
  }

  if (options.captureLogs !== false) {
    logs.slice(-6).forEach((entry) => {
      pushActivity(nextState, entry, nowIso)
    })
  }

  nextState.lastSeenAt = nowIso
  return nextState
}

function resolveExplorationStep(
  state: GameState,
  stepMs: number,
  rng: () => number,
  now: Date,
  metrics: MetricsDelta,
  logs: string[],
): void {
  const secondsFactor = Math.max(1, Math.round(stepMs / 1_000))
  const roll = rng()

  if (roll < 0.36) {
    const xpGain = randomInt(1, 3, rng) * Math.max(1, Math.round(secondsFactor / 3))
    const goldGain = randomInt(1, 2, rng) * Math.max(1, Math.round(secondsFactor / 4))

    grantRewards(state, xpGain, goldGain, now, metrics, logs, 'expedição')

    if (rng() < 0.25) {
      logs.push(`A equipe mapeou ruínas e ganhou +${xpGain} XP e +${goldGain} ouro.`)
    }
    return
  }

  if (roll < 0.66) {
    state.activeEncounter = generateEncounter(state, false, rng)
    logs.push(`Contato hostil detectado: ${state.activeEncounter.name}.`)
    return
  }

  if (roll < 0.88) {
    const lootTable = ['fragmento', 'liga', 'runa', 'selo', 'engrenagem']
    const item = lootTable[randomInt(0, lootTable.length - 1, rng)]
    state.inventory[item] = (state.inventory[item] ?? 0) + 1

    const foundGold = randomInt(4, 10, rng)
    state.player.gold += foundGold
    metrics.gold += foundGold

    logs.push(`Suprimento encontrado: ${item} (+1) e ${foundGold} ouro.`)
    return
  }

  const shouldForceBoss =
    state.player.level >= 4 &&
    (state.player.level % 4 === 0 || state.runtime.kills >= 20)
  state.activeEncounter = generateEncounter(state, shouldForceBoss, rng)
  logs.push(
    shouldForceBoss
      ? `Alvo prioritário detectado: ${state.activeEncounter.name}.`
      : `Inimigo elite aproximando: ${state.activeEncounter.name}.`,
  )
}

function resolveCombatStep(
  state: GameState,
  stepMs: number,
  rng: () => number,
  now: Date,
  metrics: MetricsDelta,
  logs: string[],
): void {
  if (!state.activeEncounter) {
    return
  }

  const encounter = state.activeEncounter
  const attackSpeedMultiplier = getUpgradeMultiplier('attack_speed', state.upgrades.attack_speed)
  const damageMultiplier = getUpgradeMultiplier('damage', state.upgrades.damage)
  
  // Apply attack speed multiplier to reduce the cooldown between attacks
  const baseCooldown = Math.max(900, 2_300 - state.stats.speed * 75)
  const effectiveCooldown = baseCooldown / attackSpeedMultiplier
  
  const rounds = Math.max(1, Math.floor(stepMs / effectiveCooldown))

  for (let round = 0; round < rounds; round += 1) {
    if (!state.activeEncounter) {
      break
    }

    const baseDamage = Math.max(
      1,
      Math.round(state.stats.attack * 0.62 + randomInt(0, 3, rng) - encounter.defense * 0.45),
    )
    const playerDamage = Math.max(1, Math.round(baseDamage * damageMultiplier))
    encounter.hp -= playerDamage

    if (encounter.hp <= 0) {
      finishEncounterWin(state, now, metrics, logs, rng)
      break
    }

    const enemyDamage = Math.max(
      1,
      Math.round(encounter.attack * 0.7 + randomInt(0, 2, rng) - state.stats.defense * 0.52),
    )
    state.stats.hp -= enemyDamage

    if (state.stats.hp <= 0) {
      finishEncounterLoss(state, now, logs)
      break
    }

    if (round === 0 && rng() < 0.35) {
      logs.push(
        `${encounter.name}: -${playerDamage} HP no alvo, você recebeu ${enemyDamage} de dano.`,
      )
    }
  }
}

function finishEncounterWin(
  state: GameState,
  now: Date,
  metrics: MetricsDelta,
  logs: string[],
  rng: () => number,
): void {
  const encounter = state.activeEncounter
  if (!encounter) {
    return
  }

  state.runtime.kills += 1
  metrics.kills += 1

  if (encounter.isBoss) {
    state.runtime.bossesDefeated += 1
    metrics.bossesDefeated += 1
    pushDateHistory(state, 'boss', `Chefe derrotado: ${encounter.name}`, now.toISOString())
  }

  grantRewards(
    state,
    encounter.rewardXp,
    encounter.rewardGold,
    now,
    metrics,
    logs,
    encounter.isBoss ? 'chefe abatido' : 'combate vencido',
  )

  if (rng() < 0.4) {
    const drops = ['núcleo', 'placa', 'fio', 'foco']
    const drop = drops[randomInt(0, drops.length - 1, rng)]
    state.inventory[drop] = (state.inventory[drop] ?? 0) + 1
    logs.push(`Drop coletado: ${drop}.`)
  }

  logs.push(
    encounter.isBoss
      ? `Vitória crítica contra ${encounter.name}.`
      : `${encounter.name} neutralizado.`,
  )
  state.activeEncounter = null
}

function finishEncounterLoss(state: GameState, now: Date, logs: string[]): void {
  state.runtime.deaths += 1
  state.stats.hp = Math.max(1, Math.round(state.stats.maxHp * 0.82))

  const goldPenalty = Math.min(state.player.gold, Math.round(state.player.gold * 0.08) + 5)
  state.player.gold -= goldPenalty

  logs.push(`Você caiu em combate e perdeu ${goldPenalty} ouro ao recuar.`)
  pushDateHistory(state, 'milestone', 'Queda em combate registrada', now.toISOString())
  state.activeEncounter = null
}

function grantRewards(
  state: GameState,
  xp: number,
  gold: number,
  now: Date,
  metrics: MetricsDelta,
  logs: string[],
  source: string,
): void {
  // Apply multipliers
  const xpMultiplier = getUpgradeMultiplier('xp_multiplier', state.upgrades.xp_multiplier)
  const goldMultiplier = getUpgradeMultiplier('gold_multiplier', state.upgrades.gold_multiplier)
  
  const finalXp = Math.round(xp * xpMultiplier)
  const finalGold = Math.round(gold * goldMultiplier)

  if (finalXp > 0) {
    state.player.xp += finalXp
    metrics.xp += finalXp
  }

  if (finalGold > 0) {
    state.player.gold += finalGold
    metrics.gold += finalGold
  }

  if (finalXp > 0 || finalGold > 0) {
    const xpStr = xpMultiplier > 1 ? `+${finalXp} XP (x${xpMultiplier.toFixed(1)})` : `+${finalXp} XP`
    const goldStr = goldMultiplier > 1 ? `+${finalGold} ouro (x${goldMultiplier.toFixed(1)})` : `+${finalGold} ouro`
    logs.push(`Recompensa (${source}): ${xpStr}, ${goldStr}.`)
  }

  processLevelUps(state, now, logs)
}

function processLevelUps(state: GameState, now: Date, logs: string[]): void {
  while (state.player.xp >= state.player.nextXp) {
    state.player.xp -= state.player.nextXp
    state.player.level += 1
    state.player.nextXp = Math.round(state.player.nextXp * 1.35 + 44)

    const rebuiltStats = buildStatsForLevel(state.class.id, state.player.level)
    const oldMaxHp = state.stats.maxHp
    const hpPercent = oldMaxHp > 0 ? state.stats.hp / oldMaxHp : 1

    state.stats.maxHp = rebuiltStats.maxHp
    state.stats.attack = rebuiltStats.attack
    state.stats.defense = rebuiltStats.defense
    state.stats.speed = rebuiltStats.speed
    state.stats.hp = Math.max(1, Math.round(state.stats.maxHp * Math.max(0.45, hpPercent)))

    logs.push(`LEVEL UP -> ${state.player.level}.`)
    pushDateHistory(
      state,
      'level',
      `Level ${state.player.level} alcançado`,
      now.toISOString(),
    )

    if (state.player.level % 3 === 0) {
      state.player.zone += 1
      logs.push(`Zona avançada para setor ${state.player.zone}.`)
    }
  }
}

function applyQuestProgress(
  state: GameState,
  metrics: MetricsDelta,
  now: Date,
  rng: () => number,
  logs: string[],
): void {
  if (!hasPositiveMetrics(metrics)) {
    return
  }

  initializeQuestCycles(state, now)

  for (const quest of state.quests) {
    if (quest.completedAt) {
      continue
    }

    const delta = metricValueForQuest(metrics, quest.metric)
    if (delta <= 0) {
      continue
    }

    quest.progress = Math.min(quest.target, quest.progress + delta)
    if (quest.progress < quest.target) {
      continue
    }

    quest.completedAt = now.toISOString()
    logs.push(`Missão concluída: ${quest.title}.`)
    pushDateHistory(state, 'quest', `Quest concluída: ${quest.title}`, now.toISOString())
    grantRewards(state, quest.rewardXp, quest.rewardGold, now, metrics, logs, 'missão')

    if (rng() < 0.2) {
      logs.push('Nova mensagem da central: contratos atualizados automaticamente.')
    }
  }

  resetMetrics(metrics)
}

function initializeQuestCycles(state: GameState, now: Date): void {
  for (const definition of QUEST_DEFINITIONS) {
    const quest = state.quests.find((entry) => entry.id === definition.id)
    const cycleKey = buildCycleKey(definition, now)

    if (!quest) {
      state.quests.push(createQuestState(definition, cycleKey))
      continue
    }

    if (quest.cycleKey !== cycleKey) {
      quest.cycleKey = cycleKey
      quest.progress = 0
      quest.completedAt = null
    }
  }
}

function createQuestState(definition: QuestDefinition, cycleKey: string): QuestState {
  return {
    id: definition.id,
    title: definition.title,
    description: definition.description,
    cycle: definition.cycle,
    metric: definition.metric,
    target: definition.target,
    progress: 0,
    cycleKey,
    completedAt: null,
    rewardXp: definition.rewardXp,
    rewardGold: definition.rewardGold,
  }
}

function metricValueForQuest(metrics: MetricsDelta, metric: QuestObjectiveMetric): number {
  switch (metric) {
    case 'kills':
      return metrics.kills
    case 'gold':
      return metrics.gold
    case 'bossesDefeated':
      return metrics.bossesDefeated
    case 'xp':
      return metrics.xp
    default:
      return 0
  }
}

function hasPositiveMetrics(metrics: MetricsDelta): boolean {
  return (
    metrics.kills > 0 ||
    metrics.gold > 0 ||
    metrics.bossesDefeated > 0 ||
    metrics.xp > 0
  )
}

function resetMetrics(metrics: MetricsDelta): void {
  metrics.kills = 0
  metrics.gold = 0
  metrics.bossesDefeated = 0
  metrics.xp = 0
}

function buildStatsForLevel(classId: ClassId, level: number) {
  const profile = getClassProfile(classId)
  const levelOffset = Math.max(0, level - 1)

  const maxHp = Math.round(profile.base.maxHp + profile.growth.maxHp * levelOffset)
  return {
    hp: maxHp,
    maxHp,
    attack: Math.round(profile.base.attack + profile.growth.attack * levelOffset),
    defense: Math.round(profile.base.defense + profile.growth.defense * levelOffset),
    speed: Math.round(profile.base.speed + profile.growth.speed * levelOffset),
  }
}

function regenerateHp(state: GameState, stepMs: number): void {
  if (state.stats.hp >= state.stats.maxHp) {
    return
  }

  const regen = Math.max(1, Math.round((state.stats.maxHp * 0.01 * stepMs) / 4_000))
  state.stats.hp = Math.min(state.stats.maxHp, state.stats.hp + regen)
}

function generateEncounter(
  state: GameState,
  forceBoss: boolean,
  rng: () => number,
): EncounterState {
  const levelScale = state.player.level + state.player.zone * 1.4
  const isBoss = forceBoss || rng() > 0.87

  const regularNames = ['Drone Raider', 'Scrap Marauder', 'Null Beast', 'Iron Shade']
  const bossNames = ['Executor Vanta', 'Prime Leviathan', 'Overseer Kharon']

  const namePool = isBoss ? bossNames : regularNames
  const name = namePool[randomInt(0, namePool.length - 1, rng)]

  const hpBase = Math.round(levelScale * (isBoss ? 42 : 24) + randomInt(10, 20, rng))
  const attack = Math.round(levelScale * (isBoss ? 2.5 : 1.5) + randomInt(3, 7, rng))
  const defense = Math.round(levelScale * (isBoss ? 1.7 : 1.1) + randomInt(1, 4, rng))

  return {
    id: `enc-${Math.round(rng() * 1_000_000)}`,
    name,
    hp: hpBase,
    maxHp: hpBase,
    attack,
    defense,
    rewardXp: Math.round(levelScale * (isBoss ? 26 : 10) + randomInt(7, 14, rng)),
    rewardGold: Math.round(levelScale * (isBoss ? 16 : 5) + randomInt(4, 11, rng)),
    isBoss,
  }
}

function buildCycleKey(definition: QuestDefinition, now: Date): string {
  if (definition.cycle === 'daily') {
    return formatDateKey(now)
  }

  return formatWeekKey(now)
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatWeekKey(date: Date): string {
  const tmp = new Date(date)
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))

  const weekYear = tmp.getFullYear()
  const weekOne = new Date(weekYear, 0, 4)
  const dayOfYear =
    (tmp.getTime() - new Date(weekYear, 0, 1).getTime()) / 86_400_000 + 1
  const weekNumber = Math.ceil((dayOfYear + ((weekOne.getDay() + 6) % 7) - 3) / 7)

  return `${weekYear}-W${String(Math.max(1, weekNumber)).padStart(2, '0')}`
}

function pushActivity(state: GameState, message: string, at: string): void {
  state.recentActivity.unshift({
    id: `act-${Math.round(Math.random() * 1_000_000)}-${state.recentActivity.length}`,
    message,
    at,
  })

  if (state.recentActivity.length > MAX_ACTIVITY_ENTRIES) {
    state.recentActivity.length = MAX_ACTIVITY_ENTRIES
  }
}

function pushDateHistory(
  state: GameState,
  kind: DateHistoryEntry['kind'],
  label: string,
  at: string,
): void {
  state.dateHistory.unshift({
    id: `date-${Math.round(Math.random() * 1_000_000)}-${state.dateHistory.length}`,
    kind,
    label,
    at,
  })

  if (state.dateHistory.length > MAX_DATE_HISTORY_ENTRIES) {
    state.dateHistory.length = MAX_DATE_HISTORY_ENTRIES
  }
}

function cloneState(state: GameState): GameState {
  return structuredClone(state)
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
