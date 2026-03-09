import type { TransformType } from './transforms'

export const STORAGE_KEY = 'macro_insights_panels'
const MAX_PANELS = 10
const MAX_NAME_LENGTH = 50

export interface SavedPanel {
  id: string
  name: string
  primaryKey: string
  comparisonKeys: string[]
  transformByKey: Record<string, TransformType>
  dateStart?: string
  dateEnd?: string
  createdAt: string
}

export type PanelInput = Omit<SavedPanel, 'id' | 'createdAt'>

function generateId(): string {
  return crypto.randomUUID?.() ?? `panel-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadPanels(): SavedPanel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (p): p is SavedPanel =>
          p != null &&
          typeof p === 'object' &&
          typeof p.id === 'string' &&
          typeof p.name === 'string' &&
          typeof p.primaryKey === 'string' &&
          Array.isArray(p.comparisonKeys) &&
          typeof p.transformByKey === 'object' &&
          typeof p.createdAt === 'string',
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch {
    return []
  }
}

export function savePanel(panel: PanelInput): SavedPanel | null {
  const name = String(panel.name ?? '').trim().slice(0, MAX_NAME_LENGTH)
  if (!name) return null

  const existing = loadPanels()
  if (existing.length >= MAX_PANELS) return null

  const saved: SavedPanel = {
    id: generateId(),
    name,
    primaryKey: panel.primaryKey,
    comparisonKeys: Array.isArray(panel.comparisonKeys) ? [...panel.comparisonKeys] : [],
    transformByKey: panel.transformByKey && typeof panel.transformByKey === 'object' ? { ...panel.transformByKey } : {},
    dateStart: panel.dateStart && typeof panel.dateStart === 'string' ? panel.dateStart : undefined,
    dateEnd: panel.dateEnd && typeof panel.dateEnd === 'string' ? panel.dateEnd : undefined,
    createdAt: new Date().toISOString(),
  }

  const updated = [saved, ...existing.filter((p) => p.id !== saved.id)].slice(0, MAX_PANELS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return saved
  } catch {
    return null
  }
}

export function deletePanel(id: string): void {
  const existing = loadPanels().filter((p) => p.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
  } catch {
    // ignore
  }
}
