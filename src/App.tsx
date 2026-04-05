import {
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import './App.css'
import {
  REALTIME_TICK_MS,
  advanceGameState,
  applyOfflineProgress,
  createInitialGameState,
  getClassProfile,
  registerSession,
} from './game/engine'
import { executeCommand } from './game/commands'
import {
  fromSaveFileV1,
  loadSessionCache,
  parseSaveFile,
  persistLastSeenAt,
  persistSessionCache,
} from './game/save'
import type { GameState, InventorySlot } from './game/types'
import ostTrackBuw from './sound/ost/Buw.wav'
import ostTrackHihi from './sound/ost/hihi.wav'
import ostTrackHisto from './sound/ost/histo histo.wav'
import ostTrackHistory from './sound/ost/history.wav'
import ostTrackZuzu from './sound/ost/zuzu.wav'
import goldDropSfx from './sound/effects/gold-drop-1s.mp3'

interface BootResult {
  state: GameState
  entries: TerminalEntry[]
}

type TerminalTextEntry = {
  id: string
  type: 'text'
  text: string
}

type TerminalInventoryEntry = {
  id: string
  type: 'inventory'
  slots: InventorySlot[]
}

type TerminalEntry = TerminalTextEntry | TerminalInventoryEntry
type InventoryViewFilter = 'all' | InventorySlot['category']

const OST_TRACKS = [
  { name: 'Buw', src: ostTrackBuw },
  { name: 'Hihi', src: ostTrackHihi },
  { name: 'Histo Histo', src: ostTrackHisto },
  { name: 'History', src: ostTrackHistory },
  { name: 'Zuzu', src: ostTrackZuzu },
]

function App() {
  const boot = useMemo<BootResult>(() => {
    const now = new Date()
    const cached = loadSessionCache()

    if (!cached) {
      const state = createInitialGameState(now)
      return {
        state,
        entries: asTextEntries([
          'terminal-idle-rpg v1.0',
          'Sessão nova criada.',
          'Digite `help` para ver comandos.',
        ]),
      }
    }

    const resumed = applyOfflineProgress(cached, now)
    const state = registerSession(resumed.state, now, 'Sessão reaberta pelo operador.')
    const offlineMinutes = Math.floor(resumed.appliedMs / 60_000)

    return {
      state,
      entries: asTextEntries([
        'terminal-idle-rpg v1.0',
        `Save local restaurado. Offline processado: ${offlineMinutes} min.`,
        'Digite `status` para conferir a evolução.',
      ]),
    }
  }, [])

  const [gameState, setGameState] = useState<GameState>(boot.state)
  const [commandInput, setCommandInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>(boot.entries)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const terminalIdRef = useRef(boot.entries.length + 1)
  const ostAudioRef = useRef<HTMLAudioElement | null>(null)
  const goldDropAudioRef = useRef<HTMLAudioElement | null>(null)
  const seenActivityIdsRef = useRef<Set<string>>(
    new Set(boot.state.recentActivity.map((entry) => entry.id)),
  )
  const [isOstPlaying, setIsOstPlaying] = useState(false)
  const [ostTrackIndex, setOstTrackIndex] = useState(0)

  useEffect(() => {
    const loop = window.setInterval(() => {
      setGameState((prev) => advanceGameState(prev, REALTIME_TICK_MS, new Date()))
    }, REALTIME_TICK_MS)

    return () => {
      window.clearInterval(loop)
    }
  }, [])

  useEffect(() => {
    persistSessionCache(gameState)
  }, [gameState])

  useEffect(() => {
    const onBeforeUnload = () => {
      persistLastSeenAt(new Date().toISOString())
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      onBeforeUnload()
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const appendTerminal = useCallback((message: string): void => {
    setTerminalEntries((prev) => {
      const lines = message.split('\n')
      const next = [
        ...prev,
        ...lines.map((line) => ({
          id: nextTerminalId(terminalIdRef),
          type: 'text' as const,
          text: line,
        })),
      ]
      return next.slice(-240)
    })
  }, [])

  useEffect(() => {
    const track = OST_TRACKS[ostTrackIndex]
    const audio = new Audio(track.src)
    audio.loop = true
    audio.volume = 0.42
    ostAudioRef.current = audio

    if (isOstPlaying) {
      void audio.play().catch(() => {
        setIsOstPlaying(false)
        appendTerminal('[OST] Falha ao trocar faixa automaticamente.')
      })
    }

    return () => {
      audio.pause()
      ostAudioRef.current = null
    }
  }, [appendTerminal, isOstPlaying, ostTrackIndex])

  useEffect(() => {
    const audio = new Audio(goldDropSfx)
    audio.volume = 0.72
    goldDropAudioRef.current = audio

    return () => {
      audio.pause()
      goldDropAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    let shouldPlay = false

    for (const entry of gameState.recentActivity) {
      if (seenActivityIdsRef.current.has(entry.id)) {
        continue
      }

      seenActivityIdsRef.current.add(entry.id)
      if (isPositiveGoldDropMessage(entry.message)) {
        shouldPlay = true
      }
    }

    if (!shouldPlay) {
      return
    }

    const baseAudio = goldDropAudioRef.current
    if (!baseAudio) {
      return
    }

    const oneShot = baseAudio.cloneNode(true) as HTMLAudioElement
    oneShot.volume = baseAudio.volume
    void oneShot.play().catch(() => {})
  }, [gameState.recentActivity])

  useEffect(() => {
    if (!outputRef.current) {
      return
    }

    outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [terminalEntries])

  const activeClass = getClassProfile(gameState.class.id)

  const recentActivity = gameState.recentActivity.slice(0, 7)
  const commandHint =
    'help | status | class <sentinel|arcanist|shade> | quests | log | history | pause | resume | inventory |  export | import | upgrades | upgrade'

  const levelTierClass = getLevelTierClass(gameState.player.level)
  const enemyHpPercent = gameState.activeEncounter
    ? Math.max(
        0,
        Math.round((gameState.activeEncounter.hp / gameState.activeEncounter.maxHp) * 100),
      )
    : 0
  const enemySpritePath = gameState.activeEncounter
    ? getEnemySpritePath(gameState.activeEncounter.name)
    : null

  async function toggleOst(): Promise<void> {
    const audio = ostAudioRef.current
    if (!audio) {
      return
    }

    if (isOstPlaying) {
      audio.pause()
      setIsOstPlaying(false)
      appendTerminal('[OST] Pausada.')
      return
    }

    try {
      await audio.play()
      setIsOstPlaying(true)
      appendTerminal(`[OST] Tocando: ${OST_TRACKS[ostTrackIndex].name}.`)
    } catch {
      setIsOstPlaying(false)
      appendTerminal('[OST] Não foi possível iniciar. Interaja com a janela e tente novamente.')
    }
  }

  function changeOstTrack(direction: 'prev' | 'next'): void {
    setOstTrackIndex((current) => {
      const delta = direction === 'next' ? 1 : -1
      const next = (current + delta + OST_TRACKS.length) % OST_TRACKS.length
      return next
    })
    const targetName =
      direction === 'next'
        ? OST_TRACKS[(ostTrackIndex + 1) % OST_TRACKS.length].name
        : OST_TRACKS[(ostTrackIndex - 1 + OST_TRACKS.length) % OST_TRACKS.length].name
    appendTerminal(`[OST] Faixa selecionada: ${targetName}.`)
  }

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submitted = commandInput.trim()
    if (!submitted) {
      return
    }

    appendTerminal(`> ${submitted}`)

    // Add to command history
    setCommandHistory((prev) => [submitted, ...prev.slice(0, 49)])
    setHistoryIndex(-1)

    const result = executeCommand(submitted, gameState, new Date())
    if (result.statePatch) {
      setGameState(result.statePatch)
    }

    if (result.sideEffect?.type === 'export') {
      triggerExport(result.sideEffect.payload, result.sideEffect.filename)
    }

    if (result.sideEffect?.type === 'import_prompt') {
      fileInputRef.current?.click()
    }

    if (result.sideEffect?.type === 'inventory_view') {
      appendInventoryGrid(result.sideEffect.slots)
    }

    appendTerminal(result.message)
    setCommandInput('')
  }



  function handleCommandKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    // Handle up/down arrows for history navigation
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const newIndex = historyIndex + 1
      if (newIndex < commandHistory.length) {
        setHistoryIndex(newIndex)
        setCommandInput(commandHistory[newIndex])
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommandInput(commandHistory[newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommandInput('')
      }
    }
  }

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        const text = String(reader.result ?? '')
        const saveFile = parseSaveFile(text)
        const imported = fromSaveFileV1(saveFile)
        const resumed = applyOfflineProgress(imported, new Date())
        const withSession = registerSession(
          resumed.state,
          new Date(),
          'Save importado e sessão retomada.',
        )

        setGameState(withSession)
        appendTerminal('Import concluído com sucesso.')
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Erro desconhecido ao importar save.'
        appendTerminal(`Falha no import: ${message}`)
      } finally {
        event.target.value = ''
      }
    }

    reader.onerror = () => {
      appendTerminal('Falha na leitura do arquivo de save.')
      event.target.value = ''
    }

    reader.readAsText(file)
  }

  const appendInventoryGrid = useCallback((slots: InventorySlot[]): void => {
    setTerminalEntries((prev) => {
      const next = [
        ...prev,
        {
          id: nextTerminalId(terminalIdRef),
          type: 'inventory' as const,
          slots,
        },
      ]
      return next.slice(-240)
    })
  }, [])

  const handleInventorySlotClick = useCallback(
    (slot: InventorySlot): void => {
      if (!slot.isArtifact || !slot.lore) {
        appendTerminal(`[ITEM] ${slot.label} x${slot.quantity}`)
        return
      }

      appendTerminal(`[ARTEFATO] ${slot.label}`)
      appendTerminal(`[LORE] ${slot.lore}`)
      if (slot.curiosityUrl) {
        appendTerminal(`[CURIOSIDADE] ${slot.curiosityUrl}`)
        window.open(slot.curiosityUrl, '_blank', 'noopener,noreferrer')
      }
    },
    [appendTerminal],
  )

  return (
    <main className="shell">
      <header className="title-bar">
        <span>terminal-idle-rpg v1.0</span>
        <div className="title-actions">
          <button type="button" className="ost-toggle ost-nav" onClick={() => void changeOstTrack('prev')}>
            {'<'}
          </button>
          <span className="ost-track-name">{OST_TRACKS[ostTrackIndex].name}</span>
          <button type="button" className="ost-toggle ost-nav" onClick={() => void changeOstTrack('next')}>
            {'>'}
          </button>
          <button type="button" className="ost-toggle" onClick={() => void toggleOst()}>
            OST: {isOstPlaying ? 'Pause' : 'Play'}
          </button>
          <span>{new Date().toLocaleString()}</span>
        </div>
      </header>

      <section className="board-grid">
        <article className="panel player-panel">
          <h2>Operador</h2>
          <pre className="ascii-avatar" aria-hidden="true">
{`  /\\_/\\
 ( o.o )
  > ^ <`}
          </pre>
          <p>{gameState.player.name}</p>
          <p>{activeClass.name}</p>
          <p className="muted">{activeClass.tagline}</p>
          <div className="stats-list">
            <p className={`level-line ${levelTierClass}`}>
              Nível: {gameState.player.level}
            </p>
            <p>XP: {gameState.player.xp}/{gameState.player.nextXp}</p>
            <p>ATK {gameState.stats.attack} DEF {gameState.stats.defense} SPD {gameState.stats.speed}</p>
            <p>Ouro: {gameState.player.gold}</p>
            <p>Zona: {gameState.player.zone}</p>
          </div>
          <div className="enemy-box">
            <p className="enemy-title">Alvo atual</p>
            {gameState.activeEncounter ? (
              <>
                <div className="enemy-visual">
                  {enemySpritePath ? (
                    <img
                      className="enemy-sprite"
                      src={enemySpritePath}
                      alt={gameState.activeEncounter.name}
                    />
                  ) : null}
                  <p
                    className={`enemy-name ${
                      gameState.activeEncounter.isBoss ? 'enemy-name-boss' : ''
                    }`}
                  >
                    {gameState.activeEncounter.name}
                    {gameState.activeEncounter.isBoss ? ' [BOSS] ☠' : ''}
                  </p>
                </div>
                <div className="hp-track" aria-label="Barra de HP do inimigo">
                  <div
                    className="hp-fill"
                    style={{ width: `${enemyHpPercent}%` }}
                  />
                </div>
                <p className="enemy-hp">
                  HP {Math.max(0, gameState.activeEncounter.hp)}/{gameState.activeEncounter.maxHp} ({enemyHpPercent}%)
                </p>
              </>
            ) : (
              <p className="muted">Sem contato hostil no momento.</p>
            )}
          </div>
        </article>

        <article className="panel activity-panel">
          <h2>Atividade recente</h2>
          <ul className="activity-list">
            {recentActivity.length === 0 ? <li>Sem eventos ainda.</li> : null}
            {recentActivity.map((entry) => (
              <li key={entry.id}>
                <span className="time-col">{formatAgo(entry.at)}</span>
                <span className="line-col">{renderActivityMessage(entry.message)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel help-panel">
          <h2>Comandos e memória</h2>
          <p className="muted">{commandHint}</p>
          <div className="memory-box">
            <p>Marcos de data:</p>
            <ul>
              {gameState.dateHistory.slice(0, 4).map((entry) => (
                <li key={entry.id}>
                  [{entry.kind}] {new Date(entry.at).toLocaleDateString()} - {entry.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="engine-state">
            <span>{gameState.paused ? 'PAUSADO' : 'ATIVO'}</span>
            <span>Kills: {gameState.runtime.kills}</span>
            <span>Bosses: {gameState.runtime.bossesDefeated}</span>
          </div>
        </article>
      </section>

      <section className="panel terminal-panel">
        <div className="output" ref={outputRef}>
          {terminalEntries.map((entry) => {
            if (entry.type === 'text') {
              return (
                <p key={entry.id} className="terminal-line">
                  {entry.text}
                </p>
              )
            }

            return (
              <div key={entry.id} className="terminal-inventory">
                <p className="terminal-line terminal-inventory-title">Inventário (bolsa)</p>
                <InventoryTerminalBlock
                  slots={entry.slots}
                  onSlotClick={handleInventorySlotClick}
                />
              </div>
            )
          })}
        </div>

        <form className="prompt" onSubmit={handleCommandSubmit}>
          <span className="prompt-symbol">$</span>
          <input
            autoFocus
            value={commandInput}
            onChange={(event) => setCommandInput(event.target.value)}
            onKeyDown={handleCommandKeyDown}
            placeholder="Digite um comando..."
            spellCheck={false}
            className="command-input"
          />
        </form>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleImportFile}
          hidden
        />
      </section>
    </main>
  )
}

function triggerExport(payload: string, filename: string): void {
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function formatAgo(isoDate: string): string {
  const deltaMs = Date.now() - Date.parse(isoDate)
  if (deltaMs <= 0) {
    return 'agora'
  }

  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) {
    return 'agora'
  }

  if (minutes < 60) {
    return `${minutes}m atrás`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h atrás`
  }

  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}

function renderActivityMessage(message: string): ReactNode {
  const tokenPattern =
    /(\+\d+\sXP|\+\d+\souro|-\d+\sHP|\bHP\b|\bDrop\b|\bArtefato\b|\bBOSS\b|\bChefe\b|\bdano\b)/gi
  const tokens = message.split(tokenPattern)

  return tokens.map((token, index) => {
    if (token.length === 0) {
      return null
    }

    const normalized = token.toLowerCase()
    let className: string | undefined

    if (/^\+\d+\sxp$/i.test(token)) {
      className = 'activity-xp'
    } else if (/^\+\d+\souro$/i.test(token)) {
      className = 'activity-gold'
    } else if (/^-\d+\shp$/i.test(token) || normalized === 'dano') {
      className = 'activity-damage'
    } else if (normalized === 'hp') {
      className = 'activity-hp'
    } else if (normalized === 'drop') {
      className = 'activity-drop'
    } else if (normalized === 'artefato') {
      className = 'activity-artifact'
    } else if (normalized === 'boss' || normalized === 'chefe') {
      className = 'activity-boss'
    }

    return (
      <span key={`${token}-${index}`} className={className}>
        {token}
      </span>
    )
  })
}

function isPositiveGoldDropMessage(message: string): boolean {
  if (/perdeu\s+\d+\souro/i.test(message)) {
    return false
  }

  return /\+\d+\souro\b/i.test(message) || /\be\s+\d+\souro\b/i.test(message)
}

function getLevelTierClass(level: number): string {
  if (level >= 40) {
    return 'level-tier-red'
  }

  if (level >= 30) {
    return 'level-tier-purple'
  }

  if (level >= 20) {
    return 'level-tier-blue'
  }

  if (level >= 10) {
    return 'level-tier-yellow'
  }

  return 'level-tier-default'
}

function getEnemySpritePath(enemyName: string): string | null {
  const normalized = enemyName.toLowerCase()

  if (normalized.includes('leviathan') || normalized.includes('overseer')) {
    return 'src/assets/Princ.gif'
  }

  if (normalized.includes('beast') || normalized.includes('marauder')) {
    return 'src/assets/Zomb.gif'
  }

  if (normalized.includes('drone') || normalized.includes('shade') || normalized.includes('executor')) {
    return 'src/assets/Xman.gif'
  }

  if (normalized.includes('slime')) {
    return 'src/assets/slime.gif'
  }

  return 'src/assets/stone_axe-export.png'
}

function asTextEntries(lines: string[]): TerminalEntry[] {
  return lines.map((line, index) => ({
    id: `boot-${index}`,
    type: 'text',
    text: line,
  }))
}

function InventoryTerminalBlock({
  slots,
  onSlotClick,
}: {
  slots: InventorySlot[]
  onSlotClick: (slot: InventorySlot) => void
}) {
  const [filter, setFilter] = useState<InventoryViewFilter>('all')

  const filteredSlots = slots.filter((slot) => {
    if (filter === 'all') {
      return true
    }

    return slot.category === filter
  })

  return (
    <>
      <div className="inventory-header-tabs">
        <button
          type="button"
          className={`inventory-tab ${filter === 'all' ? 'inventory-tab-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          ALL
        </button>
        <button
          type="button"
          className={`inventory-tab ${filter === 'reliquias' ? 'inventory-tab-active' : ''}`}
          onClick={() => setFilter('reliquias')}
        >
          RELÍQUIAS
        </button>
        <button
          type="button"
          className={`inventory-tab ${filter === 'itens_venda' ? 'inventory-tab-active' : ''}`}
          onClick={() => setFilter('itens_venda')}
        >
          VENDA
        </button>
      </div>
      {filteredSlots.length > 0 ? (
        <div className="inventory-grid">
          {filteredSlots.map((slot) => (
            <button
              type="button"
              key={slot.itemId}
              className={`inventory-slot ${slot.isArtifact ? 'inventory-slot-artifact' : ''}`}
              onClick={() => onSlotClick(slot)}
            >
              <span className="inventory-slot-name">{slot.label}</span>
              <span className="inventory-slot-count">x{slot.quantity}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="terminal-line">Nada nesta categoria.</p>
      )}
    </>
  )
}

function nextTerminalId(counterRef: MutableRefObject<number>): string {
  const id = `term-${counterRef.current}`
  counterRef.current += 1
  return id
}

export default App
