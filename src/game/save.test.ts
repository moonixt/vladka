import { describe, expect, it } from 'vitest'
import { createInitialGameState } from './engine'
import { parseSaveFile, serializeSaveFile, validateSaveFileV1 } from './save'

describe('save', () => {
  it('serializa e parseia SaveFileV1', () => {
    const state = createInitialGameState(new Date('2026-04-04T12:00:00.000Z'))
    const serialized = serializeSaveFile(state)
    const parsed = parseSaveFile(serialized)

    expect(parsed.version).toBe(1)
    expect(parsed.player.name).toBe(state.player.name)
    expect(parsed.class.id).toBe(state.class.id)
    expect(parsed.lastSeenAt).toBe(state.lastSeenAt)
  })

  it('valida e rejeita version incorreta', () => {
    const invalidPayload = {
      version: 2,
    }

    expect(() => validateSaveFileV1(invalidPayload)).toThrow(
      /version precisa ser 1/i,
    )
  })

  it('rejeita payload com chaves obrigatórias ausentes', () => {
    const invalidPayload = {
      version: 1,
      player: {},
    }

    expect(() => validateSaveFileV1(invalidPayload)).toThrow(
      /chave obrigatória ausente/i,
    )
  })
})
