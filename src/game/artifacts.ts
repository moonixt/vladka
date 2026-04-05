export interface ArtifactDefinition {
  id: string
  name: string
  lore: string
  curiosityLinks: string[]
}

const ARTIFACTS: ArtifactDefinition[] = [
  {
    id: 'artifact:echo_core',
    name: 'Núcleo de Eco',
    lore:
      'Um cristal que repete vozes de uma cidade que já não existe. Dizem que ele aprende o nome de quem o carrega.',
    curiosityLinks: [
      'https://www.youtube.com/watch?v=2Vv-BfVoq4g',
      'https://www.atlasobscura.com/random',
      'https://www.bbc.com/future',
    ],
  },
  {
    id: 'artifact:veil_compass',
    name: 'Bússola do Véu',
    lore:
      'A agulha não aponta para o norte, mas para rupturas na realidade. Quanto mais perto do perigo, mais ela brilha.',
    curiosityLinks: [
      'https://www.youtube.com/watch?v=JGwWNGJdvx8',
      'https://www.smithsonianmag.com/smart-news/',
      'https://www.nationalgeographic.com/science',
    ],
  },
  {
    id: 'artifact:ashen_crown',
    name: 'Coroa de Cinzas',
    lore:
      'Forjada para um rei sem reino. Toda vitória usando esta coroa custa uma memória que nunca volta.',
    curiosityLinks: [
      'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
      'https://www.openculture.com/',
      'https://www.britannica.com/one-good-fact',
    ],
  },
  {
    id: 'artifact:blood_mirror',
    name: 'Espelho Rubro',
    lore:
      'Ao olhar o reflexo, o portador enxerga versões de si que fizeram escolhas diferentes. Algumas ainda estão vivas.',
    curiosityLinks: [
      'https://www.youtube.com/watch?v=YQHsXMglC9A',
      'https://www.newscientist.com/subject/space/',
      'https://www.mentalfloss.com/amazing-facts',
    ],
  },
]

export function listArtifacts(): ArtifactDefinition[] {
  return ARTIFACTS
}

export function pickRandomArtifactId(rng: () => number): string {
  const index = Math.floor(rng() * ARTIFACTS.length)
  return ARTIFACTS[Math.max(0, Math.min(index, ARTIFACTS.length - 1))].id
}

export function getArtifactById(itemId: string): ArtifactDefinition | undefined {
  return ARTIFACTS.find((artifact) => artifact.id === itemId)
}

export function isArtifactItemId(itemId: string): boolean {
  return getArtifactById(itemId) !== undefined
}

export function getItemDisplayName(itemId: string): string {
  const artifact = getArtifactById(itemId)
  if (artifact) {
    return artifact.name
  }

  if (itemId.length === 0) {
    return itemId
  }

  return itemId.charAt(0).toUpperCase() + itemId.slice(1)
}

export function getRandomArtifactCuriosityUrl(
  itemId: string,
  rng: () => number = Math.random,
): string | undefined {
  const artifact = getArtifactById(itemId)
  if (!artifact || artifact.curiosityLinks.length === 0) {
    return undefined
  }

  const index = Math.floor(rng() * artifact.curiosityLinks.length)
  return artifact.curiosityLinks[Math.max(0, Math.min(index, artifact.curiosityLinks.length - 1))]
}
