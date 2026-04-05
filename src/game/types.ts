export type ClassId = 'sentinel' | 'arcanist' | 'shade'

export interface CombatStats {
  hp: number
  maxHp: number
  attack: number
  defense: number
  speed: number
}

export interface PlayerState {
  name: string
  level: number
  xp: number
  nextXp: number
  gold: number
  zone: number
}

export interface RuntimeStats {
  kills: number
  deaths: number
  bossesDefeated: number
}

export interface EncounterState {
  id: string
  name: string
  hp: number
  maxHp: number
  attack: number
  defense: number
  rewardXp: number
  rewardGold: number
  isBoss: boolean
}

export type QuestObjectiveMetric = 'kills' | 'gold' | 'bossesDefeated' | 'xp'
export type QuestCycle = 'daily' | 'weekly'

export interface QuestDefinition {
  id: string
  title: string
  description: string
  cycle: QuestCycle
  target: number
  metric: QuestObjectiveMetric
  rewardXp: number
  rewardGold: number
}

export interface QuestState {
  id: string
  title: string
  description: string
  cycle: QuestCycle
  metric: QuestObjectiveMetric
  target: number
  progress: number
  cycleKey: string
  completedAt: string | null
  rewardXp: number
  rewardGold: number
}

export type DateHistoryKind =
  | 'session'
  | 'class'
  | 'level'
  | 'quest'
  | 'boss'
  | 'milestone'

export interface DateHistoryEntry {
  id: string
  kind: DateHistoryKind
  label: string
  at: string
}

export interface ActivityEntry {
  id: string
  message: string
  at: string
}

export type UpgradeType = 'damage' | 'attack_speed' | 'gold_multiplier' | 'xp_multiplier'

export interface UpgradeLevel {
  level: number
  cost: number
  multiplier: number
}

export interface UpgradeDefinition {
  id: UpgradeType
  name: string
  description: string
  baseCost: number
  costMultiplier: number
  levels: UpgradeLevel[]
}

export interface UpgradeState {
  damage: number
  attack_speed: number
  gold_multiplier: number
  xp_multiplier: number
}

export interface GameState {
  player: PlayerState
  stats: CombatStats
  class: {
    id: ClassId
  }
  inventory: Record<string, number>
  quests: QuestState[]
  dateHistory: DateHistoryEntry[]
  recentActivity: ActivityEntry[]
  runtime: RuntimeStats
  activeEncounter: EncounterState | null
  paused: boolean
  lastSeenAt: string
  version: 1
  upgrades: UpgradeState
}

export interface SaveFileV1 {
  version: 1
  player: PlayerState
  stats: CombatStats
  class: {
    id: ClassId
  }
  inventory: Record<string, number>
  quests: QuestState[]
  dateHistory: DateHistoryEntry[]
  lastSeenAt: string
  runtime: RuntimeStats
  recentActivity: ActivityEntry[]
  activeEncounter: EncounterState | null
  paused: boolean
  upgrades: UpgradeState
}

export interface CommandSideEffectExport {
  type: 'export'
  payload: string
  filename: string
}

export interface CommandSideEffectImportPrompt {
  type: 'import_prompt'
}

export interface InventorySlot {
  itemId: string
  label: string
  quantity: number
  category: 'reliquias' | 'itens_venda'
  isArtifact: boolean
  lore?: string
  curiosityUrl?: string
}

export interface CommandSideEffectInventoryView {
  type: 'inventory_view'
  slots: InventorySlot[]
}

export type CommandSideEffect =
  | CommandSideEffectExport
  | CommandSideEffectImportPrompt
  | CommandSideEffectInventoryView

export interface CommandResult {
  ok: boolean
  message: string
  statePatch?: GameState
  logEntries?: string[]
  sideEffect?: CommandSideEffect
}

export interface ClassProfile {
  id: ClassId
  name: string
  tagline: string
  base: CombatStats
  growth: {
    maxHp: number
    attack: number
    defense: number
    speed: number
  }
}
