import { describe, expect, it } from 'vitest'
import {
  MAX_OFFLINE_PROGRESS_MS,
  advanceGameState,
  applyOfflineProgress,
  createInitialGameState,
} from './engine'

describe('engine', () => {
  it('evolui automaticamente com tick idle', () => {
    const start = new Date('2026-04-04T10:00:00.000Z')
    const state = createInitialGameState(start)
    const next = advanceGameState(
      state,
      30_000,
      new Date('2026-04-04T10:00:30.000Z'),
      { rng: () => 0.2 },
    )

    expect(next.player.gold).toBeGreaterThan(state.player.gold)
    expect(next.player.xp).toBeGreaterThan(state.player.xp)
    expect(next.lastSeenAt).toBe('2026-04-04T10:00:30.000Z')
  })

  it('aplica progresso offline com teto de 24h', () => {
    const now = new Date('2026-04-05T10:00:00.000Z')
    const state = createInitialGameState(new Date('2026-04-02T00:00:00.000Z'))
    state.lastSeenAt = '2026-04-03T00:00:00.000Z'

    const resumed = applyOfflineProgress(state, now, { rng: () => 0.15 })
    expect(resumed.appliedMs).toBe(MAX_OFFLINE_PROGRESS_MS)
  })

  it('resolve combate e contabiliza kill', () => {
    const start = new Date('2026-04-04T10:00:00.000Z')
    const state = createInitialGameState(start)
    state.activeEncounter = {
      id: 'enc-test',
      name: 'Test Drone',
      hp: 8,
      maxHp: 8,
      attack: 1,
      defense: 0,
      rewardXp: 20,
      rewardGold: 12,
      isBoss: false,
    }

    const next = advanceGameState(
      state,
      5_000,
      new Date('2026-04-04T10:00:05.000Z'),
      { rng: () => 0.4 },
    )

    expect(next.activeEncounter).toBeNull()
    expect(next.runtime.kills).toBe(state.runtime.kills + 1)
    expect(next.player.gold).toBeGreaterThan(state.player.gold)
  })
})
