const BASE = typeof import.meta.env.VITE_API_URL === 'string' && import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : ''

export interface IndicatorPoint {
  date: string
  value: number
}

export interface IndicatorSeries {
  key: string
  data: IndicatorPoint[]
}

export interface IndicatorLatestResponse {
  key: string
  date: string | null
  value: number | null
}

export type IndicatorLocationType = 'none' | 'uf' | 'city_uf'

export interface IndicatorLocationsResponse {
  key: string
  type: IndicatorLocationType
  locations: any
}

export interface Kpis {
  selic: number | null
  ipca_acum_12m: number | null
  cambio_var_pct: number | null
  focus_ipca12: number | null
  focus_selic: number | null
  reservas_bi: number | null
  desocupacao: number | null
}

export async function fetchIndicators(): Promise<string[]> {
  const res = await fetch(`${BASE}/api/indicators`)
  if (!res.ok) throw new Error('Falha ao listar indicadores')
  const json = await res.json()
  return json.indicators ?? []
}

export async function fetchIndicator(
  key: string,
  opts?: { start?: string; end?: string; city?: string; uf?: string; rede?: string; modalidade?: string; area?: string },
): Promise<IndicatorSeries> {
  const params = new URLSearchParams()
  if (opts?.start) params.set('start', opts.start)
  if (opts?.end) params.set('end', opts.end)
  if (opts?.city) params.set('city', opts.city)
  if (opts?.uf) params.set('uf', opts.uf)
  if (opts?.rede) params.set('rede', opts.rede)
  if (opts?.modalidade) params.set('modalidade', opts.modalidade)
  if (opts?.area) params.set('area', opts.area)
  const qs = params.toString()
  const url = `${BASE}/api/indicators/${key}${qs ? `?${qs}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao carregar ${key}`)
  return res.json()
}

export async function fetchIndicatorLocations(key: string): Promise<IndicatorLocationsResponse> {
  const res = await fetch(`${BASE}/api/indicators/${key}/locations`)
  if (!res.ok) throw new Error(`Falha ao carregar locations de ${key}`)
  return res.json()
}

export async function fetchIndicatorLatest(
  key: string,
  opts?: { city?: string; uf?: string; rede?: string; modalidade?: string; area?: string },
): Promise<IndicatorLatestResponse> {
  const params = new URLSearchParams()
  if (opts?.city) params.set('city', opts.city)
  if (opts?.uf) params.set('uf', opts.uf)
  if (opts?.rede) params.set('rede', opts.rede)
  if (opts?.modalidade) params.set('modalidade', opts.modalidade)
  if (opts?.area) params.set('area', opts.area)
  const qs = params.toString()
  const url = `${BASE}/api/indicators/${key}/latest${qs ? `?${qs}` : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao carregar latest de ${key}`)
  return res.json()
}

export interface IndicatorDimensionsResponse {
  key: string
  dimensions: Record<string, string[]>
}

export async function fetchIndicatorDimensions(key: string): Promise<IndicatorDimensionsResponse> {
  const res = await fetch(`${BASE}/api/indicators/${key}/dimensions`)
  if (!res.ok) throw new Error(`Falha ao carregar dimensões de ${key}`)
  return res.json()
}

export async function fetchKpis(): Promise<Kpis> {
  const res = await fetch(`${BASE}/api/kpis`)
  if (!res.ok) throw new Error('Falha ao carregar KPIs')
  return res.json()
}

export interface VarejoSeriesMeta {
  frequency: string
  date_min: string
  date_max: string
}

export interface VarejoDashboard {
  series: Record<string, { date: string; value: number }[]>
  series_meta?: Record<string, VarejoSeriesMeta>
  indice_demanda: { date: string; value: number }[]
  radar: { demanda: string; credito: string; inflacao: string }
  radar_motivos: { demanda: string[]; credito: string[]; inflacao: string[] }
  alertas: {
    id: string
    titulo: string
    mensagem: string
    impacto: string
    severidade: 'baixa' | 'media' | 'alta'
  }[]
}

export async function fetchVarejoDashboard(): Promise<VarejoDashboard> {
  const url = `${BASE || ''}/api/varejo-pme/dashboard`
  const res = await fetch(url)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const msg = detail ? `Falha ao carregar dashboard Varejo PME (${res.status}): ${detail.slice(0, 100)}` : `Falha ao carregar dashboard Varejo PME (${res.status}). Verifique se a API está rodando: uvicorn api.main:app --reload --port 8010`
    throw new Error(msg)
  }
  return res.json()
}
