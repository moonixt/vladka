import {
  applyUpgrade,
  getClassProfile,
  getUpgradeCost,
  getUpgradeMultiplier,
  listClassProfiles,
  listUpgrades,
  setPlayerClass,
} from './engine'
import { buildExportFileName, serializeSaveFile } from './save'
import type { ClassId, CommandResult, GameState } from './types'

export function executeCommand(
  rawInput: string,
  state: GameState,
  now: Date = new Date(),
): CommandResult {
  const input = rawInput.trim()
  if (!input) {
    return {
      ok: false,
      message: 'Comando vazio. Digite "help" para listar comandos.',
    }
  }

  const [command, ...args] = input.split(/\s+/)
  const normalized = command.toLowerCase()

  switch (normalized) {
    case 'help':
      return {
        ok: true,
        message: [
          'Comandos disponíveis:',
          'help, status, class <nome>, quests, upgrades, upgrade <tipo>, log [n], history [n], pause, resume, export, import',
        ].join('\n'),
      }

    case 'status':
      return {
        ok: true,
        message: formatStatus(state),
      }

    case 'class':
      return handleClassCommand(state, args, now)

    case 'quests':
      return {
        ok: true,
        message: formatQuests(state),
      }

    case 'upgrades':
      return {
        ok: true,
        message: formatUpgrades(state),
      }

    case 'upgrade':
      return handleUpgradeCommand(state, args, now)

    case 'log':
      return {
        ok: true,
        message: formatRecentLogs(state, args[0]),
      }

    case 'history':
      return {
        ok: true,
        message: formatDateHistory(state, args[0]),
      }

    case 'pause': {
      if (state.paused) {
        return {
          ok: false,
          message: 'O motor já está pausado.',
        }
      }

      return {
        ok: true,
        message: 'Motor idle pausado.',
        statePatch: {
          ...state,
          paused: true,
          lastSeenAt: now.toISOString(),
        },
      }
    }

    case 'resume': {
      if (!state.paused) {
        return {
          ok: false,
          message: 'O motor já está em execução.',
        }
      }

      return {
        ok: true,
        message: 'Motor idle retomado.',
        statePatch: {
          ...state,
          paused: false,
          lastSeenAt: now.toISOString(),
        },
      }
    }

    case 'export': {
      const payload = serializeSaveFile(state)
      return {
        ok: true,
        message: 'Export pronto. O download será iniciado.',
        sideEffect: {
          type: 'export',
          payload,
          filename: buildExportFileName(now),
        },
      }
    }

    case 'import':
      return {
        ok: true,
        message: 'Selecione um arquivo .json de save para importar.',
        sideEffect: {
          type: 'import_prompt',
        },
      }

    default:
      return {
        ok: false,
        message: `Comando desconhecido: ${command}. Use "help".`,
      }
  }
}

function handleClassCommand(
  state: GameState,
  args: string[],
  now: Date,
): CommandResult {
  if (!args[0]) {
    const classes = listClassProfiles()
      .map((profile) => {
        const activeMark = state.class.id === profile.id ? ' [ATIVA]' : ''
        return `- ${profile.id}: ${profile.tagline}${activeMark}`
      })
      .join('\n')

    return {
      ok: true,
      message: `Classes disponíveis:\n${classes}`,
    }
  }

  const target = args[0].toLowerCase() as ClassId
  const availableIds = listClassProfiles().map((profile) => profile.id)

  if (!availableIds.includes(target)) {
    return {
      ok: false,
      message: `Classe inválida: ${args[0]}. Use: ${availableIds.join(', ')}.`,
    }
  }

  if (state.class.id === target) {
    const profile = getClassProfile(target)
    return {
      ok: true,
      message: `Classe já ativa: ${profile.name}.`,
    }
  }

  const updatedState = setPlayerClass(state, target, now)
  return {
    ok: true,
    message: `Classe alterada para ${getClassProfile(target).name}.`,
    statePatch: updatedState,
  }
}

function formatStatus(state: GameState): string {
  const classProfile = getClassProfile(state.class.id)
  const hpPercent = Math.round((state.stats.hp / state.stats.maxHp) * 100)

  return [
    `Operador: ${state.player.name}`,
    `Classe: ${classProfile.name}`,
    `Nível: ${state.player.level} | XP: ${state.player.xp}/${state.player.nextXp}`,
    `HP: ${state.stats.hp}/${state.stats.maxHp} (${hpPercent}%)`,
    `ATK ${state.stats.attack} | DEF ${state.stats.defense} | SPD ${state.stats.speed}`,
    `Ouro: ${state.player.gold} | Zona: ${state.player.zone}`,
    `Kills: ${state.runtime.kills} | Bosses: ${state.runtime.bossesDefeated} | Mortes: ${state.runtime.deaths}`,
    `Motor: ${state.paused ? 'PAUSADO' : 'ATIVO'}`,
  ].join('\n')
}

function formatQuests(state: GameState): string {
  if (state.quests.length === 0) {
    return 'Nenhuma missão ativa no momento.'
  }

  const lines = state.quests.map((quest) => {
    const status = quest.completedAt
      ? `concluída em ${new Date(quest.completedAt).toLocaleString()}`
      : `${Math.min(quest.progress, quest.target)}/${quest.target}`

    return `- ${quest.title} [${quest.cycle}] -> ${status}`
  })

  return ['Missões recorrentes:', ...lines].join('\n')
}

function formatRecentLogs(state: GameState, rawLimit: string | undefined): string {
  const limit = parseLimit(rawLimit, 8)
  const entries = state.recentActivity.slice(0, limit)

  if (entries.length === 0) {
    return 'Sem atividade recente.'
  }

  return entries
    .map((entry) => `${new Date(entry.at).toLocaleTimeString()}  ${entry.message}`)
    .join('\n')
}

function formatDateHistory(state: GameState, rawLimit: string | undefined): string {
  const limit = parseLimit(rawLimit, 10)
  const entries = state.dateHistory.slice(0, limit)

  if (entries.length === 0) {
    return 'Histórico de datas vazio.'
  }

  return entries
    .map((entry) => {
      const stamp = new Date(entry.at).toLocaleString()
      return `${stamp} [${entry.kind}] ${entry.label}`
    })
    .join('\n')
}

function formatUpgrades(state: GameState): string {
  const upgrades = listUpgrades()
  const lines: string[] = [
    'Sistema de Melhorias:',
    `Ouro disponível: ${state.player.gold}\n`,
  ]

  for (const upgrade of upgrades) {
    const currentLevel = state.upgrades[upgrade.id as keyof typeof state.upgrades]
    const cost = currentLevel === 20 ? '-' : String(getUpgradeCost(upgrade.id, currentLevel))
    const multiplier = getUpgradeMultiplier(upgrade.id, currentLevel)
    
    const levelStr = currentLevel === 20 ? 'MAX' : `${currentLevel}/20`
    const multiplierStr = multiplier > 1 ? ` (x${multiplier.toFixed(1)})` : ''
    const costStr = cost === '-' ? ' [MÁXIMO]' : ` | Próximo: ${cost} ouro`
    
    lines.push(`${upgrade.name}: Nível ${levelStr}${multiplierStr}${costStr}`)
    lines.push(`  ${upgrade.description}`)
  }

  lines.push('')
  lines.push('Use "upgrade <tipo>" para comprar. Exemplos:')
  lines.push('  upgrade damage')
  lines.push('  upgrade attack_speed')
  lines.push('  upgrade gold_multiplier')
  lines.push('  upgrade xp_multiplier')

  return lines.join('\n')
}

function handleUpgradeCommand(
  state: GameState,
  args: string[],
  now: Date,
): CommandResult {
  if (!args[0]) {
    return {
      ok: false,
      message: 'Use "upgrades" para ver as melhorias disponíveis. Use "upgrade <tipo>" para comprar.',
    }
  }

  const upgradeId = args[0].toLowerCase()
  return applyUpgrade(state, upgradeId, now)
}

function parseLimit(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback
  }

  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, 40)
}
