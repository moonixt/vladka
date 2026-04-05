import { describe, expect, it } from 'vitest'
import { executeCommand } from './commands'
import { createInitialGameState } from './engine'

describe('commands', () => {
  it('pausa e retoma o motor idle', () => {
    const base = createInitialGameState(new Date('2026-04-04T10:00:00.000Z'))

    const pauseResult = executeCommand('pause', base, new Date('2026-04-04T10:00:01.000Z'))
    expect(pauseResult.ok).toBe(true)
    expect(pauseResult.statePatch?.paused).toBe(true)

    const resumeResult = executeCommand(
      'resume',
      pauseResult.statePatch ?? base,
      new Date('2026-04-04T10:00:02.000Z'),
    )
    expect(resumeResult.ok).toBe(true)
    expect(resumeResult.statePatch?.paused).toBe(false)
  })

  it('troca de classe via comando class', () => {
    const base = createInitialGameState(new Date('2026-04-04T10:00:00.000Z'))
    const result = executeCommand('class arcanist', base, new Date('2026-04-04T10:00:01.000Z'))

    expect(result.ok).toBe(true)
    expect(result.statePatch?.class.id).toBe('arcanist')
  })

  it('export retorna side effect com payload de save', () => {
    const base = createInitialGameState(new Date('2026-04-04T10:00:00.000Z'))
    const result = executeCommand('export', base, new Date('2026-04-04T10:00:01.000Z'))

    expect(result.ok).toBe(true)
    expect(result.sideEffect?.type).toBe('export')
    if (result.sideEffect?.type === 'export') {
      expect(result.sideEffect.payload).toContain('"version": 1')
    }
  })

  it('history retorna datas registradas', () => {
    const base = createInitialGameState(new Date('2026-04-04T10:00:00.000Z'))
    const result = executeCommand('history 3', base, new Date('2026-04-04T10:00:01.000Z'))

    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/\[(session|class)\]/i)
  })

  it('inventory retorna grade com itens e lore de artefato', () => {
    const base = createInitialGameState(new Date('2026-04-04T10:00:00.000Z'))
    base.inventory['núcleo'] = 2
    base.inventory['artifact:echo_core'] = 1

    const result = executeCommand('inventory', base, new Date('2026-04-04T10:00:01.000Z'))
    expect(result.ok).toBe(true)
    expect(result.sideEffect?.type).toBe('inventory_view')
    if (result.sideEffect?.type === 'inventory_view') {
      expect(result.sideEffect.slots.length).toBeGreaterThan(0)
      const artifactSlot = result.sideEffect.slots.find((slot) => slot.isArtifact)
      const sellSlot = result.sideEffect.slots.find((slot) => slot.category === 'itens_venda')
      expect(artifactSlot?.category).toBe('reliquias')
      expect(artifactSlot?.lore).toBeTruthy()
      expect(artifactSlot?.curiosityUrl).toMatch(/^https?:\/\//)
      expect(sellSlot).toBeTruthy()
    }
  })
})
