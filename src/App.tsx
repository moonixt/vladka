import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
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
import type { GameState } from './game/types'

interface BootResult {
  state: GameState
  lines: string[]
}

function App() {
  const boot = useMemo<BootResult>(() => {
    const now = new Date()
    const cached = loadSessionCache()

    if (!cached) {
      const state = createInitialGameState(now)
      return {
        state,
        lines: [
          'terminal-idle-rpg v1.0',
          'Sessão nova criada.',
          'Digite `help` para ver comandos.',
        ],
      }
    }

    const resumed = applyOfflineProgress(cached, now)
    const state = registerSession(resumed.state, now, 'Sessão reaberta pelo operador.')
    const offlineMinutes = Math.floor(resumed.appliedMs / 60_000)
// caguei
    return {
      state,
      lines: [
        'terminal-idle-rpg v1.0',
        `Save local restaurado. Offline processado: ${offlineMinutes} min.`,
        'Digite `status` para conferir a evolução.',
      ],
    }
  }, [])

  const [gameState, setGameState] = useState<GameState>(boot.state)
  const [commandInput, setCommandInput] = useState('')
  const [terminalLines, setTerminalLines] = useState<string[]>(boot.lines)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!outputRef.current) {
      return
    }

    outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [terminalLines])

  const activeClass = getClassProfile(gameState.class.id)

  const recentActivity = gameState.recentActivity.slice(0, 7)
  const commandHint =
    'help | status | class <sentinel|arcanist|shade> | quests | log | history | pause | resume | export | import'

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

  function handleCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submitted = commandInput.trim()
    if (!submitted) {
      return
    }

    appendTerminal(`> ${submitted}`)

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

    appendTerminal(result.message)
    setCommandInput('')
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

  function appendTerminal(message: string): void {
    setTerminalLines((prev) => {
      const lines = message.split('\n')
      const next = [...prev, ...lines]
      return next.slice(-240)
    })
  }

  return (
    <main className="shell">
      <header className="title-bar">
        <span>terminal-idle-rpg v1.0</span>
        <span>{new Date().toLocaleString()}</span>
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
                <span className="line-col">{entry.message}</span>
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
          {terminalLines.map((line, index) => (
            <p key={`${line}-${index}`} className="terminal-line">
              {line}
            </p>
          ))}
        </div>

        <form className="prompt" onSubmit={handleCommandSubmit}>
          <span className="prompt-symbol">$</span>
          <input
            autoFocus
            value={commandInput}
            onChange={(event) => setCommandInput(event.target.value)}
            placeholder="Digite um comando..."
            spellCheck={false}
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

  return 'src/assets/stone_axe-export.png'
}

export default App
