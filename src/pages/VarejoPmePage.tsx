import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { fetchVarejoDashboard, type VarejoDashboard } from '../api'
import '../App.css'

const VAREJO_LABELS: Record<string, string> = {
  salario_real: 'Salário real (R$)',
  desocupacao: 'Desemprego (%)',
  varejo_restrito: 'Varejo restrito (% m/m)',
  varejo_ampliado: 'Varejo ampliado (% m/m)',
  credito_consumo_saldo_pf: 'Crédito às famílias (R$ bi)',
  credito_consumo_juros_pf: 'Juros do crédito (% a.m.)',
  ipca: 'IPCA (% m/m)',
  ipca_alimentacao: 'IPCA Alimentos (% m/m)',
  ipca_vestuario: 'IPCA Vestuário (% m/m)',
}

/** Fallback de frequência quando a API não envia series_meta (ex.: backend antigo ou outra porta). */
const FREQUENCY_FALLBACK: Record<string, string> = {
  salario_real: 'trimestral',
  desocupacao: 'trimestral',
  varejo_restrito: 'mensal',
  varejo_ampliado: 'mensal',
  credito_consumo_saldo_pf: 'mensal',
  credito_consumo_juros_pf: 'mensal',
  ipca: 'mensal',
  ipca_alimentacao: 'mensal',
  ipca_vestuario: 'mensal',
}

/** Metadados das séries do painel: formação, fonte e como são obtidos (espelho do painel SignalEconomics). */
const VAREJO_SERIES_META: Record<string, { formacao: string; fonte: string; como: string }> = {
  salario_real: {
    formacao:
      'Rendimento medio mensal real do trabalho principal (conceito do indicador), com divulgacao trimestral pela PNAD Contínua. Salario ja deflacionado (poder de compra), para pessoas de 14 anos ou mais ocupadas com rendimento.',
    fonte: 'IBGE. API SIDRA. PNAD Continua trimestral - tabela 5436, variavel 5932 (rendimento medio mensal real).',
    como: 'Consulta a SIDRA; o valor ja vem em reais de poder de compra constante. A frequencia da serie no painel e trimestral (um ponto por trimestre), Brasil.',
  },
  desocupacao: {
    formacao:
      'Taxa de desocupação: percentual das pessoas de 14 anos ou mais que estão desocupadas na semana de referência em relação ao total da força de trabalho. PNAD Contínua, divulgação trimestral.',
    fonte: 'IBGE. API SIDRA. PNAD Contínua trimestral — tabela 4093, variável 4099 (taxa de desocupação, %).',
    como: 'Consulta à SIDRA com período no formato AAAATTT (ano + trimestre). A data no gráfico é o primeiro dia do trimestre. Série trimestral.',
  },
  varejo_restrito: {
    formacao:
      'Pesquisa Mensal de Comércio (PMC). Variação percentual do volume de vendas do comércio varejista (conceito restrito) do mês contra o mês anterior, com ajuste sazonal (M/M-1, % SA). Indicador antecedente de demanda doméstica.',
    fonte: 'IBGE. API SIDRA. PMC — tabela 8880 (2022=100), variável 11708 (variação M/M-1 com ajuste sazonal, %), volume.',
    como: 'Consulta à SIDRA por tabela, variável e período (AAAAMM). Valor retornado é a variação mensal com ajuste sazonal (%).',
  },
  varejo_ampliado: {
    formacao:
      'Pesquisa Mensal de Comércio (PMC). Variação percentual do volume de vendas do comércio varejista ampliado (inclui varejo restrito, veículos e materiais de construção) do mês contra o mês anterior, com ajuste sazonal (M/M-1, % SA).',
    fonte: 'IBGE. API SIDRA. PMC — tabela 8881 (2022=100), variável 11708 (variação M/M-1 com ajuste sazonal, %), volume.',
    como: 'Consulta à SIDRA por tabela 8881 e variável 11708. Valor é a variação M/M-1 com ajuste sazonal (%).',
  },
  credito_consumo_saldo_pf: {
    formacao:
      'Saldo da carteira de crédito ao consumidor para pessoas físicas. Reflete a oferta de crédito para financiar compras e impacta a demanda do varejo.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS (Sistema Gerenciador de Séries Temporais). Série mensal de saldo em R$.',
    como: 'Extraído da API SGS do BACEN. No painel o valor é exibido em R$ bilhões (divisão por 1.000).',
  },
  credito_consumo_juros_pf: {
    formacao:
      'Taxa média de juros (% a.m.) das operações de crédito ao consumidor para pessoas físicas. Custo do crédito que influencia a decisão de compra e o ritmo do varejo.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS. Série mensal de taxa de juros média das operações de crédito ao consumidor PF.',
    como: 'Extraído da API SGS do BACEN. Valor em percentual ao mês (% a.m.).',
  },
  ipca: {
    formacao:
      'Índice Nacional de Preços ao Consumidor Amplo (IPCA) mede a inflação para famílias com renda entre 1 e 40 salários mínimos, em áreas urbanas. Inclui habitação, alimentação, transporte, saúde, educação etc.',
    fonte: 'IBGE. API SIDRA. Tabela 1737, variável 63 (variação mensal %).',
    como: 'Consulta à SIDRA por tabela e variável; período em AAAAMM. O valor exibido é a variação mensal em %.',
  },
  ipca_alimentacao: {
    formacao:
      'Variação mensal (%) do IPCA do grupo Alimentação e bebidas. Útil para acompanhar pressões de preços em alimentos, com impacto relevante na inflação e no poder de compra.',
    fonte: 'IBGE/SIDRA (SNIPC/IPCA). Tabela 7060, variável 63 (variação mensal, %), grupo 1 — Alimentação e bebidas.',
    como: 'Consulta à API SIDRA por tabela 7060 e classificação do grupo. Resultado em % (variação mensal).',
  },
  ipca_vestuario: {
    formacao:
      'Variação mensal (%) do IPCA do grupo Vestuário. Reflete a dinâmica de preços de roupas e calçados, relevante para o varejo de moda.',
    fonte: 'IBGE/SIDRA (SNIPC/IPCA). Tabela 7060, variável 63 (variação mensal, %), grupo Vestuário.',
    como: 'Consulta à API SIDRA por tabela 7060 e classificação do grupo Vestuário. Valor em % (variação mensal).',
  },
}

function formatValue(key: string, value: number): string {
  if (key === 'credito_consumo_saldo_pf') return `${(value / 1000).toFixed(1)} bi`
  if (key === 'salario_real') return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  if (key.includes('juros') || key.includes('desocupacao') || key.includes('ipca') || key.includes('varejo'))
    return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%`
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function RadarBadge({ label, value }: { label: string; value: string }) {
  const color =
    value === 'forte' || value === 'expansivo' || value === 'desacelerando'
      ? 'var(--chart-line)'
      : value === 'fraca' || value === 'restrito' || value === 'acelerando'
        ? '#f87171'
        : 'var(--accent-blue)'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.25rem 0.6rem',
        background: 'var(--bg-secondary)',
        border: `1px solid ${color}`,
        borderRadius: 6,
        fontSize: '0.875rem',
      }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </span>
  )
}

function getSeverityColor(severidade: 'baixa' | 'media' | 'alta'): string {
  if (severidade === 'alta') return '#f87171'
  if (severidade === 'media') return '#f59e0b'
  return 'var(--accent-blue)'
}

/** Formata YYYY-MM-DD para DD/MM/AAAA */
function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Capitaliza primeira letra (ex.: mensal -> Mensal) */
function capitalizeFrequency(freq: string): string {
  if (!freq) return '—'
  return freq.charAt(0).toUpperCase() + freq.slice(1).toLowerCase()
}

/** Estatísticas descritivas sobre um array de valores (últimos 24 meses) */
function computeSeriesStats(points: { date: string; value: number }[]): {
  media: number
  minimo: number
  maximo: number
  mediana: number
  desvioPadrao: number
  primeiroValor: number
  ultimoValor: number
  primeiraData: string
  ultimaData: string
  n: number
} {
  if (!points.length) {
    return { media: 0, minimo: 0, maximo: 0, mediana: 0, desvioPadrao: 0, primeiroValor: 0, ultimoValor: 0, primeiraData: '', ultimaData: '', n: 0 }
  }
  const values = points.map((p) => p.value)
  const sorted = [...values].sort((a, b) => a - b)
  const n = values.length
  const media = values.reduce((a, b) => a + b, 0) / n
  const minimo = Math.min(...values)
  const maximo = Math.max(...values)
  const mediana = n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2
  const variance = values.reduce((acc, v) => acc + (v - media) ** 2, 0) / (n - 1 || 1)
  const desvioPadrao = Math.sqrt(variance)
  return {
    media,
    minimo,
    maximo,
    mediana,
    desvioPadrao,
    primeiroValor: points[0]!.value,
    ultimoValor: points[points.length - 1]!.value,
    primeiraData: points[0]!.date,
    ultimaData: points[points.length - 1]!.date,
    n,
  }
}

function buildFallbackRadarMotivos(data: VarejoDashboard): Record<'demanda' | 'credito' | 'inflacao', string[]> {
  const motivos = {
    demanda: [] as string[],
    credito: [] as string[],
    inflacao: [] as string[],
  }

  const salario = data.series.salario_real ?? []
  if (salario.length >= 3) {
    const delta = salario[salario.length - 1].value - salario[salario.length - 3].value
    if (delta > 0) motivos.demanda.push('salário real em alta recente')
    else if (delta < 0) motivos.demanda.push('salário real em queda recente')
    else motivos.demanda.push('salário real estável')
  }
  if (data.indice_demanda.length >= 3) {
    const trend = data.indice_demanda[data.indice_demanda.length - 1].value - data.indice_demanda[data.indice_demanda.length - 3].value
    if (trend > 0.8) motivos.demanda.push('índice de demanda melhorando nos últimos meses')
    else if (trend < -0.8) motivos.demanda.push('índice de demanda perdendo força nos últimos meses')
    else motivos.demanda.push('índice de demanda sem aceleração forte')
  }

  const credito = data.series.credito_consumo_saldo_pf ?? []
  if (credito.length >= 3) {
    const last = credito[credito.length - 1].value
    const prev = credito[credito.length - 3].value
    if (prev !== 0) {
      const varPct = (last / prev - 1) * 100
      if (varPct > 5) motivos.credito.push('saldo de crédito em expansão')
      else if (varPct < -2) motivos.credito.push('saldo de crédito em retração')
      else motivos.credito.push('saldo de crédito com variação moderada')
    }
  }
  const juros = data.series.credito_consumo_juros_pf ?? []
  if (juros.length > 0) {
    const lastJuros = juros[juros.length - 1].value
    if (lastJuros > 4) motivos.credito.push('juros ainda elevados restringem o crédito')
    else motivos.credito.push('juros em patamar mais benigno')
  }

  const ipca = data.series.ipca ?? []
  if (ipca.length >= 12) {
    const last12 = ipca.slice(-12).map((p) => p.value)
    const ipca12 = (last12.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100
    if (ipca12 > 6) motivos.inflacao.push(`IPCA acumulado em 12 meses em ${ipca12.toFixed(1)}%`)
    else if (ipca12 < 4) motivos.inflacao.push(`IPCA acumulado em 12 meses em ${ipca12.toFixed(1)}%`)
    else motivos.inflacao.push(`IPCA em faixa intermediária (${ipca12.toFixed(1)}% em 12 meses)`)
  }

  if (motivos.demanda.length === 0) motivos.demanda.push('dados insuficientes para detalhar o motivo')
  if (motivos.credito.length === 0) motivos.credito.push('dados insuficientes para detalhar o motivo')
  if (motivos.inflacao.length === 0) motivos.inflacao.push('dados insuficientes para detalhar o motivo')
  return motivos
}

type ModalType = 'info' | 'stats'

export default function VarejoPmePage() {
  const [data, setData] = useState<VarejoDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openModal, setOpenModal] = useState<{ key: string; type: ModalType } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchVarejoDashboard()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Erro ao carregar'
          setError(msg.includes('Failed to fetch') || msg.includes('NetworkError')
            ? 'Não foi possível conectar à API. Verifique se o backend está rodando: uvicorn api.main:app --reload --port 8010'
            : msg)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="app" style={{ padding: '2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Carregando dashboard…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="app" style={{ padding: '2rem' }}>
        <p style={{ color: '#f87171' }}>{error ?? 'Dados não disponíveis.'}</p>
        <Link to="/" style={{ color: 'var(--accent-blue)', marginTop: '1rem', display: 'inline-block' }}>
          Voltar ao Cenário Econômico (SignalEconomics)
        </Link>
      </div>
    )
  }

  const indiceLatest = data.indice_demanda.length ? data.indice_demanda[data.indice_demanda.length - 1] : null
  const indicePrev =
    data.indice_demanda.length >= 2 ? data.indice_demanda[data.indice_demanda.length - 2] : null
  const indiceTrend = indiceLatest && indicePrev ? indiceLatest.value - indicePrev.value : 0

  const chartData = data.indice_demanda.map((p) => ({
    ...p,
    dateShort: p.date.slice(0, 7),
  }))
  const fallbackRadarMotivos = buildFallbackRadarMotivos(data)

  return (
    <div className="app">
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem 1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Varejo (SignalRetail) — Inteligência Econômica</h1>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.9rem' }} aria-label="Painéis">
          <Link to="/" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Cenário Econômico (SignalEconomics)
          </Link>
          <Link to="/agro" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Agronegócio (SignalAgro)
          </Link>
          <Link to="/industria" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Indústria (SignalIndustry)
          </Link>
          <Link to="/energia" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Energia (SignalEnergy)
          </Link>
        </nav>
      </header>

      {/* Índice de demanda */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Índice de demanda do varejo
        </h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        >
          <div>
            <span style={{ fontSize: '2rem', fontWeight: 700 }}>
              {indiceLatest ? indiceLatest.value.toFixed(1) : '—'}
            </span>
            {indiceTrend !== 0 && (
              <span
                style={{
                  marginLeft: '0.5rem',
                  color: indiceTrend > 0 ? 'var(--chart-line)' : '#f87171',
                  fontSize: '1rem',
                }}
              >
                {indiceTrend > 0 ? '↑' : '↓'} {Math.abs(indiceTrend).toFixed(1)}
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Indicador sintético: salário real, crédito e desemprego (base 100).
          </p>
        </div>
        {chartData.length > 0 && (
          <div style={{ height: 220, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="dateShort" stroke="var(--text-secondary)" fontSize={11} />
                <YAxis stroke="var(--text-secondary)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
                  formatter={(v: number) => [v.toFixed(1), 'Índice']}
                />
                <Line type="monotone" dataKey="value" stroke="var(--chart-line)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Radar econômico */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Radar econômico
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {[
            { key: 'demanda', label: 'Demanda', value: data.radar.demanda, motivos: data.radar_motivos?.demanda ?? [] },
            { key: 'credito', label: 'Crédito', value: data.radar.credito, motivos: data.radar_motivos?.credito ?? [] },
            { key: 'inflacao', label: 'Inflação', value: data.radar.inflacao, motivos: data.radar_motivos?.inflacao ?? [] },
          ].map((item) => {
            const motivosRender = item.motivos.length
              ? item.motivos
              : fallbackRadarMotivos[item.key as 'demanda' | 'credito' | 'inflacao']
            return (
            <div
              key={item.key}
              style={{
                padding: '0.75rem',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <RadarBadge label={item.label} value={item.value} />
              <div style={{ marginTop: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Motivo:</div>
              <ul style={{ margin: '0.35rem 0 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                {motivosRender.map((motivo, idx) => (
                  <li key={idx} style={{ marginBottom: '0.2rem' }}>
                    {motivo}
                  </li>
                ))}
              </ul>
            </div>
          )})}
        </div>
      </section>

      {/* Alertas */}
      {data.alertas.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            Alertas econômicos
          </h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {data.alertas.map((alerta) => {
              const severityColor = getSeverityColor(alerta.severidade)
              return (
                <div
                  key={alerta.id}
                  style={{
                    padding: '0.85rem',
                    background: 'var(--bg-card)',
                    border: `1px solid ${severityColor}`,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.95rem' }}>{alerta.titulo}</strong>
                    <span style={{ color: severityColor, fontSize: '0.8rem', textTransform: 'uppercase' }}>{alerta.severidade}</span>
                  </div>
                  <div style={{ marginBottom: '0.35rem' }}>{alerta.mensagem}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{alerta.impacto}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Painel econômico — cards */}
      <section>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Painel econômico do varejo
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          {Object.entries(data.series).map(([key, points]) => {
            const last = points.length ? points[points.length - 1] : null
            const label = VAREJO_LABELS[key] ?? key
            return (
              <div
                key={key}
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                  {label}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {last ? formatValue(key, last.value) : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Gráficos das séries principais */}
      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Séries principais (últimos 24 meses)
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {['salario_real', 'desocupacao', 'varejo_restrito', 'varejo_ampliado', 'credito_consumo_saldo_pf', 'credito_consumo_juros_pf', 'ipca'].map(
            (key) => {
              const points = data.series[key]
              if (!points || points.length === 0) return null
              const chartPoints = points.map((p) => ({
                ...p,
                dateShort: p.date.slice(0, 7),
              }))
              return (
                <div
                  key={key}
                  style={{
                    padding: '1rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    {VAREJO_LABELS[key] ?? key}
                  </div>
                  <div style={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartPoints} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                        <XAxis dataKey="dateShort" stroke="var(--text-secondary)" fontSize={10} />
                        <YAxis stroke="var(--text-secondary)" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                          }}
                          formatter={(v: number) => [formatValue(key, v), '']}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="var(--accent-blue)"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setOpenModal({ key, type: 'info' })}
                      style={{
                        padding: '0.35rem 0.6rem',
                        fontSize: '0.8rem',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      + info
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenModal({ key, type: 'stats' })}
                      style={{
                        padding: '0.35rem 0.6rem',
                        fontSize: '0.8rem',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      Estatísticas
                    </button>
                  </div>
                </div>
              )
            },
          )}
        </div>
      </section>

      {/* Modal: + info ou Estatísticas */}
      {openModal && data && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setOpenModal(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              maxWidth: 480,
              maxHeight: '85vh',
              overflow: 'auto',
              padding: '1.25rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 id="modal-title" style={{ margin: 0, fontSize: '1rem' }}>
                {VAREJO_LABELS[openModal.key] ?? openModal.key}
              </h3>
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                }}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            {openModal.type === 'info' && (() => {
              const meta = VAREJO_SERIES_META[openModal.key]
              const apiMeta = data.series_meta?.[openModal.key]
              const frequency =
                apiMeta?.frequency
                  ? capitalizeFrequency(apiMeta.frequency)
                  : FREQUENCY_FALLBACK[openModal.key]
                    ? capitalizeFrequency(FREQUENCY_FALLBACK[openModal.key])
                    : '—'
              const points = data.series[openModal.key] ?? []
              const hasFullWindow = Boolean(apiMeta?.date_min && apiMeta?.date_max)
              const chartDateInicial = points.length >= 1 ? points[0].date : null
              const chartDateFinal = points.length >= 1 ? points[points.length - 1].date : null
              return (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Frequência:</strong> {frequency}
                  </p>
                  <div style={{ margin: '0 0 0.75rem 0' }}>
                    <p style={{ margin: '0 0 0.25rem 0' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Período completo da série</strong>
                      <span style={{ fontWeight: 400 }}> (série completa no banco)</span>
                    </p>
                    {hasFullWindow ? (
                      <>
                        <p style={{ margin: '0.15rem 0 0 0' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>Data inicial:</strong> {formatDateBR(apiMeta!.date_min)}
                        </p>
                        <p style={{ margin: '0.15rem 0 0 0' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>Data final:</strong> {formatDateBR(apiMeta!.date_max)}
                        </p>
                      </>
                    ) : (
                      <p style={{ margin: '0.15rem 0 0 0' }}>Não disponível (reinicie o backend na porta 8010 para exibir).</p>
                    )}
                  </div>
                  {chartDateInicial != null && chartDateFinal != null && (
                    <div style={{ margin: '0 0 1rem 0' }}>
                      <p style={{ margin: '0 0 0.25rem 0' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Período exibido no gráfico</strong>
                        <span style={{ fontWeight: 400 }}> (últimos 24 meses)</span>
                      </p>
                      <p style={{ margin: '0.15rem 0 0 0' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Data inicial:</strong> {formatDateBR(chartDateInicial)}
                      </p>
                      <p style={{ margin: '0.15rem 0 0 0' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>Data final:</strong> {formatDateBR(chartDateFinal)}
                      </p>
                    </div>
                  )}
                  {meta && (
                    <dl style={{ margin: 0 }}>
                      <dt style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Como a série é formada</dt>
                      <dd style={{ margin: '0.15rem 0 0 0' }}>{meta.formacao}</dd>
                      <dt style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Fonte dos dados</dt>
                      <dd style={{ margin: '0.15rem 0 0 0' }}>{meta.fonte}</dd>
                      <dt style={{ marginTop: '0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>Como os dados são obtidos</dt>
                      <dd style={{ margin: '0.15rem 0 0 0' }}>{meta.como}</dd>
                    </dl>
                  )}
                </div>
              )
            })()}
            {openModal.type === 'stats' && (() => {
              const points = data.series[openModal.key] ?? []
              const stats = computeSeriesStats(points)
              return (
                <div style={{ fontSize: '0.9rem' }}>
                  <p
                    style={{
                      margin: '0 0 1rem 0',
                      padding: '0.5rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    Referente aos últimos 24 meses.
                  </p>
                  <dl style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Média</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>{formatValue(openModal.key, stats.media)}</dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Mínimo</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>{formatValue(openModal.key, stats.minimo)}</dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Máximo</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>{formatValue(openModal.key, stats.maximo)}</dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Mediana</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>{formatValue(openModal.key, stats.mediana)}</dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Desvio padrão</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>{formatValue(openModal.key, stats.desvioPadrao)}</dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Primeiro valor</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>
                      {stats.primeiraData ? `${formatValue(openModal.key, stats.primeiroValor)} (${formatDateBR(stats.primeiraData)})` : '—'}
                    </dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Último valor</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>
                      {stats.ultimaData ? `${formatValue(openModal.key, stats.ultimoValor)} (${formatDateBR(stats.ultimaData)})` : '—'}
                    </dd>
                    <dt style={{ marginTop: '0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>Número de observações</dt>
                    <dd style={{ margin: '0.1rem 0 0 0' }}>{stats.n}</dd>
                  </dl>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
