import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
} from 'recharts'
import {
  fetchIndicators,
  fetchIndicator,
  fetchIndicatorLocations,
  fetchIndicatorLatest,
  fetchIndicatorDimensions,
  fetchKpis,
  type IndicatorLocationsResponse,
  type IndicatorLocationType,
  type IndicatorLatestResponse,
  type IndicatorDimensionsResponse,
  type Kpis,
  type IndicatorSeries,
} from './api'
import { applyTransform, type TransformType, TRANSFORM_LABELS } from './transforms'
import { downloadCSV, downloadXLSX } from './export'
import { loadPanels, savePanel, deletePanel, type SavedPanel } from './panels'
import './App.css'

/** Escala de valor para exibição (ex.: reservas em bi, FOCUS em %). */
function scaleValue(key: string, value: number): number {
  if (key === 'reservas') return value / 1000
  if (key === 'focus_ipca12' || key === 'focus_selic') return value / 100
  // Crédito imobiliário (BACEN/SGS) costuma vir em milhões de R$ -> exibir em R$ bi
  if (
    key === 'credito_imob_saldo_total_pf' ||
    key === 'credito_imob_saldo_mercado_pf' ||
    key === 'credito_imob_concessoes_mercado_pf'
  ) return value / 1000
  return value
}

/** Normaliza série para base 100 no primeiro ponto. */
function normalizeBase100(points: { value: number }[]): number[] {
  if (points.length === 0) return []
  const v0 = points[0].value
  if (v0 === 0) return points.map(() => 100)
  return points.map((p) => (p.value / v0) * 100)
}

/** Correlação de Pearson entre duas amostras (mesmo tamanho). */
function pearsonCorrelation(x: number[], y: number[]): number | null {
  const n = x.length
  if (n < 2 || y.length !== n) return null
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0)
  const sumX2 = x.reduce((a, b) => a + b * b, 0)
  const sumY2 = y.reduce((a, b) => a + b * b, 0)
  const num = n * sumXY - sumX * sumY
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  if (den === 0) return null
  return num / den
}

/** Aproximação da CDF normal padrão (para p-value do Pearson). */
function normCDF(z: number): number {
  z = Math.max(-6, Math.min(6, z))
  return 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-(z * z) * (1.273239544735163 + 0.140068327773882 * z * z) / (1 + 0.140068327773882 * z * z))))
}

/** P-value (bicaudal) para a correlação de Pearson: teste H0 de correlação nula. Aproximação normal para n>2. */
function pearsonPValue(r: number, n: number): number | null {
  if (n < 3 || Math.abs(r) >= 1) return null
  const t = r * Math.sqrt((n - 2) / (1 - r * r))
  return 2 * (1 - normCDF(Math.abs(t)))
}

const INDICATOR_LABELS: Record<string, string> = {
  selic: 'SELIC (% a.a.)',
  usdbrl: 'Câmbio USD/BRL',
  ibcbr: 'IBC-Br',
  ipca: 'IPCA',
  ipca15: 'IPCA-15',
  inpc: 'INPC',
  focus_ipca12: 'FOCUS IPCA 12m',
  focus_selic: 'FOCUS SELIC (% a.a.)',
  reservas: 'Reservas (US$ bi)',
  desocupacao: 'Desocupação (%)',
  varejo_restrito: 'Varejo (restrito) — var. m/m-1 (% SA)',
  varejo_ampliado: 'Varejo (ampliado) — var. m/m-1 (% SA)',
  servicos: 'Serviços — var. m/m-1 (% SA)',
  ipca_alimentacao: 'IPCA — Alimentação e bebidas (m/m, %)',
  ipca_transportes: 'IPCA — Transportes (m/m, %)',
  fipezap_locacao_preco_m2: 'FipeZAP Locação — preço médio (R$/m²)',
  fipezap_locacao_mom_pct: 'FipeZAP Locação — variação mensal (%)',
  fipezap_venda_preco_m2: 'FipeZAP Venda — preço médio (R$/m²)',
  fipezap_venda_mom_pct: 'FipeZAP Venda — variação mensal (%)',
  ivgr: 'IVG-R (BCB) — índice (base)',
  credito_imob_saldo_total_pf: 'Crédito imobiliário PF — saldo total (R$ bi)',
  credito_imob_saldo_mercado_pf: 'Crédito imobiliário PF — saldo taxas de mercado (R$ bi)',
  credito_imob_concessoes_mercado_pf: 'Crédito imobiliário PF — concessões taxas de mercado (R$ bi)',
  credito_imob_taxa_juros_mercado_pf: 'Crédito imobiliário PF — taxa média juros (% a.a.)',
  credito_imob_inadimplencia_mercado_pf: 'Crédito imobiliário PF — inadimplência (% da carteira)',
  sinapi_custo_m2_uf: 'SINAPI — custo médio m² (R$)',
  sinapi_var_mensal_uf: 'SINAPI — variação no mês (%)',
  sinapi_var_12m_uf: 'SINAPI — variação em 12 meses (%)',
  edu_sup_matriculas: 'Educação Superior — matrículas (graduação)',
  edu_sup_ingressantes: 'Educação Superior — ingressantes (graduação)',
  edu_sup_concluintes: 'Educação Superior — concluintes (graduação)',
  edu_sup_docentes_exercicio: 'Educação Superior — docentes em exercício (IES)',
  edu_sup_igc_medio: 'Educação Superior — IGC contínuo médio (IES)',
  meta_inflacao: 'Meta de inflação (CMN)',
  populacao: 'População residente estimada (hab.)',
  desocupacao_uf: 'Desocupação por UF (%)',
  salario_real: 'Salário real (R$)',
}

/** Metadados de cada série: formação, fonte e como é obtida. */
const INDICATOR_META: Record<string, { formacao: string; fonte: string; como: string }> = {
  selic: {
    formacao:
      'Taxa Selic é a taxa básica de juros da economia, definida pelo Copom (Comitê de Política Monetária do Banco Central) em reuniões periódicas. Representa a taxa média dos empréstimos interbancários de um dia, lastreados em títulos federais.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS — Sistema Gerenciador de Séries Temporais (api.bcb.gov.br). Série diária, código 432.',
    como: 'Os dados são extraídos via GET em bcdata.sgs.432/dados com dataInicial e dataFinal. O valor é a taxa meta em % a.a., divulgada após cada reunião do Copom.',
  },
  usdbrl: {
    formacao:
      'Cotação do dólar americano (venda) em reais. Reflete a taxa de câmbio livre no mercado à vista (Ptax), usada como referência para contratos e balanço de pagamentos.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS. Série diária, código 1 (dólar americano — venda).',
    como: 'Consulta à API em bcdata.sgs.1/dados. O valor é a cotação R$/US$ no dia. Atualizado diariamente com o fechamento do mercado.',
  },
  ibcbr: {
    formacao:
      'Índice de Atividade Econômica do Banco Central (IBC-Br) é um indicador mensal que procura antecipar a evolução do PIB. Inclui estimativas para indústria, serviços, agropecuária e impostos, com ajuste sazonal.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS. Série mensal, código 24364 (IBC-Br com ajuste sazonal).',
    como: 'Extraído de bcdata.sgs.24364/dados. O valor é um índice (base fixa). A variação em relação ao mesmo mês do ano anterior aproxima o crescimento do PIB.',
  },
  ipca: {
    formacao:
      'Índice Nacional de Preços ao Consumidor Amplo (IPCA) mede a inflação para famílias com renda entre 1 e 40 salários mínimos, em áreas urbanas. Inclui despesas com habitação, alimentação, transporte, saúde, educação etc.',
    fonte: 'Instituto Brasileiro de Geografia e Estatística (IBGE). API SIDRA (apisidra.ibge.gov.br). Tabela 1737, variável 63 (variação mensal %).',
    como: 'Consulta à SIDRA por tabela e variável; o período é informado em AAAAMM. O valor exibido é a variação mensal em %. O acumulado em 12 meses é calculado a partir dessas variações.',
  },
  ipca15: {
    formacao:
      'IPCA-15 é uma prévia do IPCA, com coleta de preços entre o dia 16 do mês anterior e o dia 15 do mês de referência. Mesma metodologia e mesma população do IPCA, apenas com período de coleta antecipado.',
    fonte: 'IBGE. API SIDRA. Tabela 3065, variável 355 (variação mensal %).',
    como: 'Obtido da mesma forma que o IPCA, pela tabela 3065. Divulgado antes do IPCA do mês, servindo como indicador antecipado da inflação.',
  },
  inpc: {
    formacao:
      'Índice Nacional de Preços ao Consumidor (INPC) mede a inflação para famílias com renda entre 1 e 5 salários mínimos (classes de menor renda). Inclui as mesmas categorias de despesa do IPCA, com pesos diferentes.',
    fonte: 'IBGE. API SIDRA. Tabela 1736, variável 44 (variação mensal %).',
    como: 'Consulta à SIDRA, tabela 1736, variável 44. O valor é a variação mensal em %. Período em formato AAAAMM.',
  },
  focus_ipca12: {
    formacao:
      'Expectativa de inflação (IPCA) para os próximos 12 meses, calculada pela mediana das respostas do Relatório Focus, pesquisa semanal do BACEN com instituições financeiras e demais agentes de mercado.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS. Série 27574 (expectativa FOCUS — IPCA 12 meses). Valores em pontos base (100 bp = 1%).',
    como: 'Extraída de bcdata.sgs.27574/dados. A API retorna o valor em pontos base; na exibição divide-se por 100 para obter o percentual (ex.: 440,25 bp = 4,40%).',
  },
  reservas: {
    formacao:
      'Reservas internacionais em conceito de liquidez: ativos externos disponíveis e controlados pelo BACEN (moeda estrangeira, ouro, direitos especiais de saque, posição no FMI etc.) para financiar o balanço de pagamentos e intervir no câmbio.',
    fonte: 'Banco Central do Brasil (BACEN). API SGS. Série 13982 (reservas internacionais — conceito liquidez — total, diária). Valores em milhões de US$.',
    como: 'Consulta a bcdata.sgs.13982/dados. O valor bruto está em milhões de dólares; no dashboard divide-se por 1.000 para exibir em bilhões de US$.',
  },
  focus_selic: {
    formacao:
      'Expectativa de taxa SELIC para o fim do período de referência, calculada pela mediana das respostas do Relatório Focus (pesquisa semanal do BACEN com instituições financeiras e agentes de mercado).',
    fonte: 'Banco Central do Brasil (BACEN). API SGS. Série 27573 (expectativa FOCUS — SELIC). Valores em pontos base (100 bp = 1%).',
    como: 'Extraída de bcdata.sgs.27573/dados. A API retorna o valor em pontos base; na exibição divide-se por 100 para obter o percentual (% a.a.).',
  },
  desocupacao: {
    formacao:
      'Taxa de desocupação: percentual das pessoas de 14 anos ou mais de idade que estão desocupadas na semana de referência em relação ao total da força de trabalho (ocupadas + desocupadas). PNAD Contínua, divulgação trimestral.',
    fonte: 'IBGE. API SIDRA (apisidra.ibge.gov.br). PNAD Contínua trimestral — tabela 4093, variável 4099 (taxa de desocupação, %).',
    como: 'Consulta à SIDRA com período no formato AAAATTT (ano + trimestre 01–04). A data no gráfico é o primeiro dia do trimestre. Série trimestral.',
  },
  varejo_restrito: {
    formacao:
      'Pesquisa Mensal de Comércio (PMC). Mede a variação percentual do volume de vendas do comércio varejista (conceito restrito) do mês contra o mês imediatamente anterior, com ajuste sazonal (M/M-1, % SA). É um indicador antecedente de demanda doméstica.',
    fonte:
      'IBGE. API SIDRA (apisidra.ibge.gov.br). PMC — tabela 8880 (2022=100), variável 11708 (variação M/M-1 com ajuste sazonal, %), classificação c11046 (Tipos de índice): 56734 (volume).',
    como:
      'A série é extraída via consulta à SIDRA informando tabela, variável, período (AAAAMM) e o filtro de volume: /t/8880/n1/1/v/11708/p/AAAAMM-AAAAMM/c11046/56734. O valor retornado é a variação mensal com ajuste sazonal (%).',
  },
  varejo_ampliado: {
    formacao:
      'Pesquisa Mensal de Comércio (PMC). Mede a variação percentual do volume de vendas do comércio varejista ampliado (inclui, além do varejo restrito, veículos e materiais de construção) do mês contra o mês imediatamente anterior, com ajuste sazonal (M/M-1, % SA).',
    fonte:
      'IBGE. API SIDRA. PMC — tabela 8881 (2022=100), variável 11708 (variação M/M-1 com ajuste sazonal, %), classificação c11046 (Tipos de índice): 56736 (volume).',
    como:
      'Consulta à SIDRA: /t/8881/n1/1/v/11708/p/AAAAMM-AAAAMM/c11046/56736. O valor é a variação M/M-1 com ajuste sazonal (%), útil para acompanhar consumo e bens duráveis/semiduráveis no ciclo.',
  },
  servicos: {
    formacao:
      'Pesquisa Mensal de Serviços (PMS). Mede a variação percentual do volume de serviços do mês contra o mês imediatamente anterior, com ajuste sazonal (M/M-1, % SA). É um termômetro relevante da demanda doméstica e do ciclo de serviços.',
    fonte:
      'IBGE. API SIDRA. PMS — tabela 5906 (2022=100), variável 11623 (variação M/M-1 com ajuste sazonal, %), classificação c11046 (Tipos de índice): 56726 (volume).',
    como:
      'Consulta à SIDRA: /t/5906/n1/1/v/11623/p/AAAAMM-AAAAMM/c11046/56726. A série é mensal e o valor retornado é a variação com ajuste sazonal (%).',
  },
  ipca_alimentacao: {
    formacao:
      'Variação mensal (%) do IPCA do grupo 1 (Alimentação e bebidas). Útil para acompanhar pressões de preços em alimentos no domicílio e fora do domicílio, com impacto relevante na inflação corrente.',
    fonte:
      'IBGE/SIDRA (SNIPC/IPCA). Tabela 7060 (estrutura a partir de 2020), variável 63 (variação mensal, %), classificação c315=7170 (1.Alimentação e bebidas), Brasil (n1/1).',
    como:
      'Consulta à API SIDRA em /values/t/7060/n1/1/v/63/p/AAAAMM-AAAAMM/c315/7170. O resultado é normalizado para date (1º dia do mês) e value (%).',
  },
  ipca_transportes: {
    formacao:
      'Variação mensal (%) do IPCA do grupo 5 (Transportes). Captura a dinâmica de combustíveis, passagens e custos de veículo próprio, frequentemente relevantes em choques de curto prazo.',
    fonte:
      'IBGE/SIDRA (SNIPC/IPCA). Tabela 7060 (estrutura a partir de 2020), variável 63 (variação mensal, %), classificação c315=7625 (5.Transportes), Brasil (n1/1).',
    como:
      'Consulta à API SIDRA em /values/t/7060/n1/1/v/63/p/AAAAMM-AAAAMM/c315/7625. O resultado é normalizado para date (1º dia do mês) e value (%).',
  },
  fipezap_locacao_preco_m2: {
    formacao:
      'Preço médio de locação residencial (R$/m²) por cidade, com base em anúncios de apartamentos para novos aluguéis. Útil para avaliar dinâmica de preços e rentabilidade (rental yield) em mercados locais.',
    fonte:
      'Índice FipeZAP — Locação Residencial. PDFs públicos da FIPE (downloads.fipe.org.br), extraídos mensalmente.',
    como:
      'O ETL baixa o PDF do mês e extrai a tabela de “Últimos resultados” por cidade/UF, persistindo em parquet com colunas date/city/uf/value. A API exige filtros city+uf para retornar a série local.',
  },
  fipezap_locacao_mom_pct: {
    formacao:
      'Variação mensal (%) dos preços de locação residencial, por cidade/UF, do mês contra o mês anterior.',
    fonte:
      'Índice FipeZAP — Locação Residencial (PDF público).',
    como:
      'Extraído da mesma tabela de “Últimos resultados” do PDF. O valor é a variação mensal em % para a cidade selecionada.',
  },
  fipezap_venda_preco_m2: {
    formacao:
      'Preço médio de venda residencial (R$/m²) por cidade/UF, com base em anúncios.',
    fonte:
      'Índice FipeZAP — Venda Residencial. PDF público (DataZAP).',
    como:
      'O ETL baixa o PDF do mês e extrai a tabela de “Últimos resultados” por cidade/UF. A API exige filtros city+uf para retorno da série local.',
  },
  fipezap_venda_mom_pct: {
    formacao:
      'Variação mensal (%) dos preços de venda residencial por cidade/UF.',
    fonte:
      'Índice FipeZAP — Venda Residencial (PDF público).',
    como:
      'Extraído da tabela de “Últimos resultados” do PDF.',
  },
  ivgr: {
    formacao:
      'IVG-R é um índice de preços de imóveis residenciais financiados, calculado pelo Banco Central com base em valores de avaliação usados como garantia em operações de crédito. Serve como proxy nacional de preços.',
    fonte:
      'Banco Central do Brasil (BACEN). API SGS. Série 21340 (IVG-R).',
    como:
      'Consulta à API em bcdata.sgs.21340/dados. Série mensal (data no 1º dia do mês).',
  },
  credito_imob_saldo_total_pf: {
    formacao:
      'Saldo da carteira de crédito com recursos direcionados — pessoas físicas — financiamento imobiliário total. Indica o “estoque” de crédito habitacional em aberto.',
    fonte:
      'BACEN. API SGS. Série 20612 (mensal). Valores tipicamente em milhões de R$.',
    como:
      'Extraído via bcdata.sgs.20612/dados. No gráfico exibimos em R$ bilhões (divide por 1.000).',
  },
  credito_imob_saldo_mercado_pf: {
    formacao:
      'Saldo da carteira de crédito (PF) de financiamento imobiliário com taxas de mercado (recursos direcionados).',
    fonte:
      'BACEN. API SGS. Série 20611 (mensal).',
    como:
      'Extraído via bcdata.sgs.20611/dados. Exibição em R$ bilhões (divide por 1.000).',
  },
  credito_imob_concessoes_mercado_pf: {
    formacao:
      'Concessões mensais (novas operações) de crédito imobiliário PF com taxas de mercado. Proxy de fluxo de demanda via financiamento.',
    fonte:
      'BACEN. API SGS. Série 20702 (mensal).',
    como:
      'Extraído via bcdata.sgs.20702/dados. Exibição em R$ bilhões (divide por 1.000).',
  },
  credito_imob_taxa_juros_mercado_pf: {
    formacao:
      'Taxa média de juros (% a.a.) das operações de crédito imobiliário PF com taxas de mercado.',
    fonte:
      'BACEN. API SGS. Série 20772 (mensal).',
    como:
      'Extraído via bcdata.sgs.20772/dados.',
  },
  credito_imob_inadimplencia_mercado_pf: {
    formacao:
      'Inadimplência (% da carteira) do crédito imobiliário PF com taxas de mercado (tipicamente atraso >90 dias).',
    fonte:
      'BACEN. API SGS. Série 21149 (mensal).',
    como:
      'Extraído via bcdata.sgs.21149/dados.',
  },
  sinapi_custo_m2_uf: {
    formacao:
      'Custo médio do m² da construção civil (R$) por UF, segundo SINAPI. Ajuda a avaliar pressão de custos e viabilidade de oferta (lançamentos/obras).',
    fonte:
      'IBGE/SIDRA (SINAPI). Tabela 2296, variável 48 (mensal), nível territorial UF (N3).',
    como:
      'O ETL consulta a SIDRA por UF e persiste em parquet. A API exige filtro ?uf=... para retornar a série da unidade federativa.',
  },
  sinapi_var_mensal_uf: {
    formacao:
      'Variação percentual no mês (%) do custo médio do m², por UF.',
    fonte:
      'IBGE/SIDRA (SINAPI). Tabela 2296, variável 1196.',
    como:
      'Consulta SIDRA por UF; valor já vem como variação percentual.',
  },
  sinapi_var_12m_uf: {
    formacao:
      'Variação percentual em 12 meses (%) do custo médio do m², por UF.',
    fonte:
      'IBGE/SIDRA (SINAPI). Tabela 2296, variável 1198.',
    como:
      'Consulta SIDRA por UF; valor já vem como variação em 12 meses.',
  },
  edu_sup_matriculas: {
    formacao:
      'Total de matrículas em cursos de graduação, segundo o Censo da Educação Superior. Por dimensões (UF/rede/modalidade/área), ajuda a entender a estrutura e tendências do ensino superior.',
    fonte:
      'INEP. Microdados do Censo da Educação Superior (arquivo de Cursos), disponíveis publicamente em ZIP.',
    como:
      'O ETL baixa o ZIP de cada ano (2017+), lê o CSV de cursos e soma a coluna QT_MAT. A série é anual (date=YYYY-01-01) e suporta filtros por UF, rede (pública/privada), modalidade (presencial/EAD) e área CINE (grande área).',
  },
  edu_sup_ingressantes: {
    formacao:
      'Total de ingressantes em cursos de graduação no ano (fluxo de entrada). Útil para avaliar expansão/contração do sistema.',
    fonte:
      'INEP. Microdados do Censo da Educação Superior (arquivo de Cursos).',
    como:
      'O ETL soma a coluna QT_ING do CSV de cursos (2017+), gerando série anual e permitindo filtros por UF/rede/modalidade/área.',
  },
  edu_sup_concluintes: {
    formacao:
      'Total de concluintes em cursos de graduação no ano (fluxo de saída). Útil para analisar a produção de novos graduados.',
    fonte:
      'INEP. Microdados do Censo da Educação Superior (arquivo de Cursos).',
    como:
      'O ETL soma a coluna QT_CONC do CSV de cursos (2017+), gerando série anual e permitindo filtros por UF/rede/modalidade/área.',
  },
  edu_sup_docentes_exercicio: {
    formacao:
      'Total de docentes em exercício nas Instituições de Educação Superior (IES). Série no nível de IES (não segmentada por modalidade/área no microdado público).',
    fonte:
      'INEP. Microdados do Censo da Educação Superior (arquivo de IES).',
    como:
      'O ETL soma a coluna QT_DOC_EXE do CSV de IES (2017+), com filtros por UF e rede (pública/privada). Modalidade e área ficam como TOTAL.',
  },
  edu_sup_igc_medio: {
    formacao:
      'IGC (contínuo) é um indicador de qualidade que avalia as IES. Aqui exibimos o IGC contínuo médio por UF/rede quando disponível.',
    fonte:
      'INEP. Indicadores de Qualidade da Educação Superior — IGC (arquivo XLSX público por edição).',
    como:
      'O ETL baixa o XLSX do IGC (quando publicado para o ano) e calcula a média do IGC contínuo por UF e rede; também gera totais (UF=BR e rede=TOTAL) para facilitar seleção padrão.',
  },
  meta_inflacao: {
    formacao:
      'Meta de inflação definida pelo Conselho Monetário Nacional (CMN). Desde junho de 2024 o regime é de meta contínua de 3,0% a.a. com tolerância de ±1,5 p.p. Antes disso, a meta era definida ano a ano.',
    fonte: 'Conselho Monetário Nacional / Banco Central do Brasil.',
    como:
      'Série gerada internamente com os valores anuais históricos da meta (2017–2026), interpolados para frequência mensal (valor constante dentro de cada ano).',
  },
  populacao: {
    formacao:
      'População residente estimada do Brasil e das Unidades da Federação. Utilizada para análises demográficas, planejamento e estudos regionais.',
    fonte: 'IBGE. API SIDRA. Tabela 6579 (EstimaPop) — população residente estimada. Níveis: Brasil (n1) e UFs (n3).',
    como: 'Consulta à SIDRA por tabela 6579, variável 9324. Período anual. A API exige filtro ?uf=... para séries por UF (uf=BR para Brasil).',
  },
  desocupacao_uf: {
    formacao:
      'Taxa de desocupação por Unidade da Federação. Percentual das pessoas de 14 anos ou mais desocupadas em relação à força de trabalho, em cada UF.',
    fonte: 'IBGE. API SIDRA. PNAD Contínua trimestral — tabela 4093, variável 4099, nível territorial UF (n3).',
    como: 'Consulta à SIDRA por UF. Período trimestral (AAAATTT). A API exige filtro ?uf=... para retornar a série da unidade federativa.',
  },
  salario_real: {
    formacao:
      'Rendimento médio mensal real do trabalho principal. Salário já deflacionado (poder de compra), para pessoas de 14 anos ou mais ocupadas com rendimento.',
    fonte: 'IBGE. API SIDRA. PNAD Contínua trimestral — tabela 5436, variável 5932 (rendimento médio mensal real).',
    como: 'Consulta à SIDRA; o valor já vem em reais de poder de compra constante. Série trimestral, Brasil.',
  },
}

type CategoryKey = 'Macro' | 'Imoveis' | 'Social' | 'AnaliseMacro'

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  Macro: 'Macro (demais)',
  Imoveis: 'Imóveis',
  Social: 'Educação, Demografia, Renda e Trabalho',
  AnaliseMacro: 'Análise Macroeconômica',
}

const CATEGORY_KEYS: Record<CategoryKey, string[]> = {
  Macro: [
    'selic',
    'usdbrl',
    'ibcbr',
    'ipca',
    'ipca15',
    'inpc',
    'focus_ipca12',
    'focus_selic',
    'reservas',
    'desocupacao',
    'varejo_restrito',
    'varejo_ampliado',
    'servicos',
    'ipca_alimentacao',
    'ipca_transportes',
    'meta_inflacao',
  ],
  Imoveis: [
    'fipezap_locacao_preco_m2',
    'fipezap_locacao_mom_pct',
    'fipezap_venda_preco_m2',
    'fipezap_venda_mom_pct',
    'ivgr',
    'credito_imob_saldo_total_pf',
    'credito_imob_saldo_mercado_pf',
    'credito_imob_concessoes_mercado_pf',
    'credito_imob_taxa_juros_mercado_pf',
    'credito_imob_inadimplencia_mercado_pf',
    'sinapi_custo_m2_uf',
    'sinapi_var_mensal_uf',
    'sinapi_var_12m_uf',
  ],
  Social: [
    'edu_sup_matriculas',
    'edu_sup_ingressantes',
    'edu_sup_concluintes',
    'edu_sup_docentes_exercicio',
    'edu_sup_igc_medio',
    'populacao',
    'desocupacao_uf',
  ],
  AnaliseMacro: [
    'salario_real',
    'meta_inflacao',
  ],
}

const SERIES_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6']

function getCategoryForKey(key: string): CategoryKey {
  for (const [cat, keys] of Object.entries(CATEGORY_KEYS)) {
    if (keys.includes(key)) return cat as CategoryKey
  }
  return 'Macro'
}

/** Formata número no padrão brasileiro (vírgula como separador decimal). */
function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatKpi(value: number | null, suffix = ''): string {
  if (value == null) return '—'
  if (suffix === '%') return `${formatNumber(value)}%`
  return `${formatNumber(value)}${suffix}`
}

function formatLatestValue(key: string, raw: number | null): string {
  if (raw == null || Number.isNaN(raw)) return '—'
  const v = scaleValue(key, raw)
  if (key === 'edu_sup_igc_medio') return formatNumber(v, 3)
  if (key.startsWith('edu_sup_')) return formatNumber(v, 0)
  if (key === 'populacao') return formatNumber(v, 0)
  if (key === 'salario_real') return `R$ ${formatNumber(v, 2)}`
  // % (já vem em % para essas séries no gold)
  if (
    key.endsWith('_mom_pct') ||
    key.startsWith('sinapi_var_') ||
    key.includes('taxa_juros') ||
    key.includes('inadimplencia')
  ) return `${formatNumber(v, 2)}%`

  // R$/m²
  if (key.includes('preco_m2') || key === 'sinapi_custo_m2_uf') return `R$ ${formatNumber(v, 2)}`

  // Crédito (R$ bi)
  if (
    key.startsWith('credito_imob_') &&
    (key.includes('saldo') || key.includes('concessoes'))
  ) return `R$ ${formatNumber(v, 0)} bi`

  // câmbio / índice / outros
  if (key === 'usdbrl') return `R$ ${formatNumber(v, 2)}`
  return formatNumber(v, 2)
}

interface CorrelationPoint {
  date: string
  normA: number
  normB: number
  rawA: number
  rawB: number
}

function App() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [indicators, setIndicators] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('Macro')
  const [selectedKey, setSelectedKey] = useState<string>('selic')
  const [series, setSeries] = useState<IndicatorSeries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingChart, setLoadingChart] = useState(false)
  const [locations, setLocations] = useState<IndicatorLocationsResponse | null>(null)
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [selectedCity, setSelectedCity] = useState<string>('')
  const [selectedUf, setSelectedUf] = useState<string>('')
  const [eduDimensions, setEduDimensions] = useState<IndicatorDimensionsResponse | null>(null)
  const [selectedEduUf, setSelectedEduUf] = useState<string>('BR')
  const [selectedEduRede, setSelectedEduRede] = useState<string>('TOTAL')
  const [selectedEduModalidade, setSelectedEduModalidade] = useState<string>('TOTAL')
  const [selectedEduArea, setSelectedEduArea] = useState<string>('TOTAL')
  const [latestByKey, setLatestByKey] = useState<Record<string, IndicatorLatestResponse | null>>({})
  const [loadingCards, setLoadingCards] = useState(false)
  const [corrA, setCorrA] = useState<string>('')
  const [corrB, setCorrB] = useState<string>('')
  const [correlationData, setCorrelationData] = useState<CorrelationPoint[]>([])
  const [loadingCorrelation, setLoadingCorrelation] = useState(false)
  const [showCorrelationPanel, setShowCorrelationPanel] = useState(false)
  const [comparisonKeys, setComparisonKeys] = useState<string[]>([])
  const [comparisonData, setComparisonData] = useState<Map<string, { date: string; value: number }[]>>(new Map())
  const [transformByKey, setTransformByKey] = useState<Record<string, TransformType>>({})
  const [dateStart, setDateStart] = useState<string>('')
  const [dateEnd, setDateEnd] = useState<string>('')
  const [savedPanels, setSavedPanels] = useState<SavedPanel[]>([])
  const [panelFeedback, setPanelFeedback] = useState<string | null>(null)
  const [showPhillipsCurve, setShowPhillipsCurve] = useState(false)
  const [phillipsData, setPhillipsData] = useState<{ desocupacao: number; inflacao: number; date: string }[]>([])
  const [loadingPhillips, setLoadingPhillips] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      setLoading(true)
      try {
        const [kpisRes, indRes] = await Promise.all([fetchKpis(), fetchIndicators()])
        if (!cancelled) {
          setKpis(kpisRes)
          setIndicators(indRes.length ? indRes : ['selic', 'usdbrl', 'ipca', 'ibcbr', 'focus_ipca12', 'focus_selic', 'reservas', 'desocupacao'])
          if (indRes.length && !indRes.includes(selectedKey)) setSelectedKey(indRes[0])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setSavedPanels(loadPanels())
  }, [])

  const categoryOptions = useMemo(() => {
    const avail = new Set(indicators)
    const cats = (Object.keys(CATEGORY_KEYS) as CategoryKey[]).filter((c) => CATEGORY_KEYS[c].some((k) => avail.has(k)))
    return cats.length ? cats : (['Macro'] as CategoryKey[])
  }, [indicators])

  useEffect(() => {
    if (!categoryOptions.includes(selectedCategory)) setSelectedCategory(categoryOptions[0])
  }, [categoryOptions])

  // Garantir defaults de localização quando a categoria exige dimensões
  useEffect(() => {
    let cancelled = false
    async function ensureDefaults() {
      try {
        if (selectedCategory !== 'Imoveis') return

        // Defaults para cidade/UF (FipeZAP)
        if (!selectedCity || !selectedUf) {
          const loc = await fetchIndicatorLocations('fipezap_locacao_preco_m2')
          if (cancelled) return
          if (loc.type === 'city_uf' && Array.isArray(loc.locations) && loc.locations.length) {
            const first = loc.locations[0] as any
            setSelectedCity(String(first.city ?? ''))
            setSelectedUf(String(first.uf ?? ''))
          }
        }

        // Defaults para UF (SINAPI) — só sobrescreve se não houver UF
        if (!selectedUf) {
          const loc = await fetchIndicatorLocations('sinapi_custo_m2_uf')
          if (cancelled) return
          if (loc.type === 'uf' && Array.isArray(loc.locations) && loc.locations.length) {
            setSelectedUf(String(loc.locations[0] ?? ''))
          }
        }
      } catch {
        // silencioso; UI continuará sem cards até ter filtros
      }
    }
    ensureDefaults()
    return () => { cancelled = true }
  }, [selectedCategory])

  const indicatorOptions = useMemo(() => {
    const avail = new Set(indicators)
    const ordered = CATEGORY_KEYS[selectedCategory].filter((k) => avail.has(k))
    // fallback: se categoria vazia (pouco provável), mostrar todos
    return ordered.length ? ordered : indicators
  }, [indicators, selectedCategory])

  useEffect(() => {
    // se trocar de categoria e a chave atual não existir nela, escolher a primeira disponível
    if (!selectedKey || indicatorOptions.includes(selectedKey)) return
    if (indicatorOptions.length) setSelectedKey(indicatorOptions[0])
  }, [indicatorOptions, selectedKey])

  useEffect(() => {
    if (!selectedKey) return
    let cancelled = false
    setLoadingLocations(true)
    if (selectedKey.startsWith('edu_sup_')) {
      fetchIndicatorDimensions(selectedKey)
        .then((dims) => {
          if (cancelled) return
          setEduDimensions(dims)
          setLocations(null)

          const ufVals = dims.dimensions?.uf ?? []
          const redeVals = dims.dimensions?.rede ?? []
          const modVals = dims.dimensions?.modalidade ?? []
          const areaVals = dims.dimensions?.area ?? []

          if (ufVals.length && !ufVals.includes(selectedEduUf)) setSelectedEduUf(ufVals.includes('BR') ? 'BR' : ufVals[0])
          if (redeVals.length && !redeVals.includes(selectedEduRede)) setSelectedEduRede(redeVals.includes('TOTAL') ? 'TOTAL' : redeVals[0])
          if (modVals.length && !modVals.includes(selectedEduModalidade)) setSelectedEduModalidade(modVals.includes('TOTAL') ? 'TOTAL' : modVals[0])
          if (areaVals.length && !areaVals.includes(selectedEduArea)) setSelectedEduArea(areaVals.includes('TOTAL') ? 'TOTAL' : areaVals[0])
        })
        .catch(() => { if (!cancelled) setEduDimensions(null) })
        .finally(() => { if (!cancelled) setLoadingLocations(false) })
    } else {
      setEduDimensions(null)
      fetchIndicatorLocations(selectedKey)
        .then((loc) => {
          if (cancelled) return
          setLocations(loc)
          // defaults de seleção
          if (loc.type === 'city_uf') {
            const arr = Array.isArray(loc.locations) ? loc.locations : []
            const first = arr[0]
            if (first && (!selectedCity || !selectedUf)) {
              setSelectedCity(String(first.city ?? ''))
              setSelectedUf(String(first.uf ?? ''))
            } else if (first) {
              // se a seleção atual não existe mais, cai no primeiro
              const exists = arr.some((x: any) => String(x.city) === selectedCity && String(x.uf).toUpperCase() === selectedUf.toUpperCase())
              if (!exists) {
                setSelectedCity(String(first.city ?? ''))
                setSelectedUf(String(first.uf ?? ''))
              }
            }
          } else if (loc.type === 'uf') {
            const arr = Array.isArray(loc.locations) ? loc.locations : []
            const preferred = arr.includes('BR') ? 'BR' : arr[0]
            const first = preferred ?? arr[0]
            if (first && !selectedUf) setSelectedUf(String(first))
            if (first && selectedUf) {
              const exists = arr.some((x: any) => String(x).toUpperCase() === selectedUf.toUpperCase())
              if (!exists) setSelectedUf(String(first))
            }
          } else {
            // reset seleções dimensionais quando não aplicável
            setSelectedCity('')
            setSelectedUf('')
          }
        })
        .catch(() => { if (!cancelled) setLocations(null) })
        .finally(() => { if (!cancelled) setLoadingLocations(false) })
    }
    return () => { cancelled = true }
  }, [selectedKey, selectedCategory, selectedEduUf, selectedEduRede, selectedEduModalidade, selectedEduArea])

  // Cards: últimos valores por categoria (mais atual)
  useEffect(() => {
    if (!indicators.length) return
    if (selectedCategory === 'Macro') return

    const keys = CATEGORY_KEYS[selectedCategory].filter((k) => indicators.includes(k))
    if (!keys.length) return

    // Pré-condições para séries dimensionais
    if (selectedCategory === 'Imoveis' && (!selectedUf || !selectedCity)) return

    let cancelled = false
    setLoadingCards(true)
    Promise.all(
      keys.map(async (k) => {
        const needsCityUf = k.startsWith('fipezap_')
        const needsUf = k.startsWith('sinapi_') || k === 'populacao' || k === 'desocupacao_uf'
        const opts: any = {}
        if (needsCityUf) {
          opts.city = selectedCity
          opts.uf = selectedUf
        } else if (needsUf) {
          opts.uf = selectedUf
        } else if (k.startsWith('edu_sup_')) {
          if (selectedEduUf) opts.uf = selectedEduUf
          if (selectedEduRede) opts.rede = selectedEduRede
          if (selectedEduModalidade) opts.modalidade = selectedEduModalidade
          if (selectedEduArea) opts.area = selectedEduArea
        }
        try {
          const latest = await fetchIndicatorLatest(k, opts)
          return [k, latest] as const
        } catch {
          return [k, null] as const
        }
      }),
    )
      .then((pairs) => {
        if (cancelled) return
        const obj: Record<string, IndicatorLatestResponse | null> = {}
        for (const [k, v] of pairs) obj[k] = v
        setLatestByKey(obj)
      })
      .finally(() => { if (!cancelled) setLoadingCards(false) })

    return () => { cancelled = true }
  }, [selectedCategory, indicators, selectedCity, selectedUf, selectedEduUf, selectedEduRede, selectedEduModalidade, selectedEduArea])

  useEffect(() => {
    if (!selectedKey) return
    let cancelled = false
    setLoadingChart(true)
    const locType: IndicatorLocationType = (locations?.type ?? 'none') as any
    const opts: any = {}
    if (selectedKey.startsWith('edu_sup_')) {
      if (selectedEduUf) opts.uf = selectedEduUf
      if (selectedEduRede) opts.rede = selectedEduRede
      if (selectedEduModalidade) opts.modalidade = selectedEduModalidade
      if (selectedEduArea) opts.area = selectedEduArea
    } else {
      if (locType === 'city_uf') {
        opts.city = selectedCity
        opts.uf = selectedUf
      } else if (locType === 'uf') {
        opts.uf = selectedUf
      }
    }
    fetchIndicator(selectedKey, opts)
      .then((data) => { if (!cancelled) setSeries(data) })
      .catch(() => { if (!cancelled) setSeries(null) })
      .finally(() => { if (!cancelled) setLoadingChart(false) })
    return () => { cancelled = true }
  }, [selectedKey, selectedCategory, locations?.type, selectedCity, selectedUf, selectedEduUf, selectedEduRede, selectedEduModalidade, selectedEduArea])

  useEffect(() => {
    if (!corrA || !corrB || corrA === corrB) {
      setCorrelationData([])
      return
    }
    let cancelled = false
    setLoadingCorrelation(true)
    Promise.all([fetchIndicator(corrA), fetchIndicator(corrB)])
      .then(([resA, resB]) => {
        if (cancelled) return
        const mapA = new Map<string, number>(resA.data.map((p) => [p.date, scaleValue(corrA, p.value)]))
        const mapB = new Map<string, number>(resB.data.map((p) => [p.date, scaleValue(corrB, p.value)]))
        const dates = resA.data.map((p) => p.date).filter((d) => mapB.has(d))
        if (dates.length === 0) {
          setCorrelationData([])
          return
        }
        dates.sort()
        const rawA = dates.map((d) => mapA.get(d)!)
        const rawB = dates.map((d) => mapB.get(d)!)
        const normA = normalizeBase100(rawA.map((v) => ({ value: v })))
        const normB = normalizeBase100(rawB.map((v) => ({ value: v })))
        const merged: CorrelationPoint[] = dates.map((date, i) => ({
          date,
          normA: normA[i],
          normB: normB[i],
          rawA: rawA[i],
          rawB: rawB[i],
        }))
        setCorrelationData(merged)
      })
      .catch(() => { if (!cancelled) setCorrelationData([]) })
      .finally(() => { if (!cancelled) setLoadingCorrelation(false) })
    return () => { cancelled = true }
  }, [corrA, corrB])

  useEffect(() => {
    if (!showPhillipsCurve) return
    let cancelled = false
    setLoadingPhillips(true)
    Promise.all([fetchIndicator('ipca'), fetchIndicator('desocupacao')])
      .then(([ipcaRes, desocRes]) => {
        if (cancelled) return
        if (!ipcaRes?.data?.length || !desocRes?.data?.length) {
          setPhillipsData([])
          return
        }
        const ipcaAcum = applyTransform(ipcaRes.data, 'acum12m')
        const ipcaByDate = new Map<string, number>()
        ipcaAcum.forEach((p) => ipcaByDate.set(p.date, p.value))
        const points: { desocupacao: number; inflacao: number; date: string }[] = []
        desocRes.data.forEach((p) => {
          const [y, m] = p.date.split('-').map(Number)
          const lastMonth = m === 1 ? `${y}-03` : m === 4 ? `${y}-06` : m === 7 ? `${y}-09` : `${y}-12`
          const inflacao = ipcaByDate.get(lastMonth)
          if (inflacao != null) {
            points.push({ desocupacao: p.value, inflacao, date: p.date })
          }
        })
        setPhillipsData(points)
      })
      .catch(() => { if (!cancelled) setPhillipsData([]) })
      .finally(() => { if (!cancelled) setLoadingPhillips(false) })
    return () => { cancelled = true }
  }, [showPhillipsCurve])

  useEffect(() => {
    if (comparisonKeys.length === 0) {
      setComparisonData(new Map())
      return
    }
    let cancelled = false
    Promise.all(comparisonKeys.map((k) => fetchIndicator(k).catch(() => null)))
      .then((results) => {
        if (cancelled) return
        const map = new Map<string, { date: string; value: number }[]>()
        for (const r of results) {
          if (r?.data?.length) map.set(r.key, r.data)
        }
        setComparisonData(map)
      })
    return () => { cancelled = true }
  }, [comparisonKeys])

  const comparisonOptions = useMemo(() => {
    return indicators.filter(
      (k) =>
        !k.startsWith('fipezap_') &&
        !k.startsWith('sinapi_') &&
        !k.startsWith('edu_sup_') &&
        k !== 'populacao' &&
        k !== 'desocupacao_uf' &&
        k !== selectedKey &&
        !comparisonKeys.includes(k),
    )
  }, [indicators, selectedKey, comparisonKeys])

  const correlationCoeff = useMemo(() => {
    if (correlationData.length < 2) return null
    const x = correlationData.map((p) => p.normA)
    const y = correlationData.map((p) => p.normB)
    return pearsonCorrelation(x, y)
  }, [correlationData])

  const correlationPValue = useMemo(() => {
    if (correlationCoeff == null || correlationData.length < 3) return null
    return pearsonPValue(correlationCoeff, correlationData.length)
  }, [correlationCoeff, correlationData.length])

  const multiChartData = useMemo(() => {
    const seriesMap = new Map<string, { date: string; value: number }[]>()

    if (series?.data?.length) {
      seriesMap.set(
        selectedKey,
        series.data.map((p) => ({ date: p.date, value: scaleValue(selectedKey, p.value) })),
      )
    }
    for (const k of comparisonKeys) {
      const raw = comparisonData.get(k)
      if (raw?.length) {
        seriesMap.set(k, raw.map((p) => ({ date: p.date, value: scaleValue(k, p.value) })))
      }
    }

    const transformed = new Map<string, { date: string; value: number }[]>()
    seriesMap.forEach((data, key) => {
      transformed.set(key, applyTransform(data, transformByKey[key] ?? 'original'))
    })

    const allDates = new Set<string>()
    transformed.forEach((data) => data.forEach((p) => allDates.add(p.date)))
    let dates = [...allDates].sort()

    if (dateStart) dates = dates.filter((d) => d >= dateStart)
    if (dateEnd) dates = dates.filter((d) => d <= dateEnd)

    const lookups = new Map<string, Map<string, number>>()
    transformed.forEach((data, key) => {
      const m = new Map<string, number>()
      data.forEach((p) => m.set(p.date, p.value))
      lookups.set(key, m)
    })

    return dates.map((date) => {
      const row: Record<string, any> = { date }
      lookups.forEach((m, key) => {
        const v = m.get(date)
        if (v !== undefined) row[key] = v
      })
      return row
    })
  }, [series, comparisonData, selectedKey, comparisonKeys, transformByKey, dateStart, dateEnd])

  const activeSeriesKeys = useMemo(() => {
    return [selectedKey, ...comparisonKeys].filter((k) =>
      multiChartData.some((row) => row[k] !== undefined),
    )
  }, [multiChartData, selectedKey, comparisonKeys])

  const exportRows = useMemo(() => {
    return multiChartData.map((row) => {
      const r: Record<string, unknown> = { Data: row.date }
      activeSeriesKeys.forEach((k) => {
        const label = INDICATOR_LABELS[k] ?? k
        const t = transformByKey[k] ?? 'original'
        const colName = t === 'original' ? label : `${label} (${TRANSFORM_LABELS[t]})`
        r[colName] = row[k] ?? ''
      })
      return r
    })
  }, [multiChartData, activeSeriesKeys, transformByKey])

  const handleSavePanel = () => {
    const name = window.prompt('Nome do painel:', 'Meu painel')
    if (!name?.trim()) return
    const avail = new Set(indicators)
    if (!avail.has(selectedKey)) {
      setPanelFeedback('Indicador principal não disponível.')
      setTimeout(() => setPanelFeedback(null), 3000)
      return
    }
    const filteredComparison = comparisonKeys.filter((k) => avail.has(k))
    const result = savePanel({
      name: name.trim(),
      primaryKey: selectedKey,
      comparisonKeys: filteredComparison,
      transformByKey: { ...transformByKey },
      dateStart: dateStart || undefined,
      dateEnd: dateEnd || undefined,
    })
    if (result) {
      setSavedPanels(loadPanels())
      setPanelFeedback(`Painel "${result.name}" salvo.`)
      setTimeout(() => setPanelFeedback(null), 3000)
    } else {
      setPanelFeedback('Não foi possível salvar (limite de 10 painéis ou nome inválido).')
      setTimeout(() => setPanelFeedback(null), 3000)
    }
  }

  const handleLoadPanel = (panel: SavedPanel) => {
    const avail = new Set(indicators)
    setSelectedCategory(getCategoryForKey(panel.primaryKey))
    setSelectedKey(avail.has(panel.primaryKey) ? panel.primaryKey : indicators[0] ?? 'selic')
    setComparisonKeys(panel.comparisonKeys.filter((k) => avail.has(k)))
    setTransformByKey(panel.transformByKey ?? {})
    setDateStart(panel.dateStart ?? '')
    setDateEnd(panel.dateEnd ?? '')
    setPanelFeedback(`Painel "${panel.name}" carregado.`)
    setTimeout(() => setPanelFeedback(null), 2000)
  }

  const handleDeletePanel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deletePanel(id)
    setSavedPanels(loadPanels())
  }

  return (
    <div className="app">
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem 1rem', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>Cenário Econômico (SignalEconomics)</h1>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 0.9rem' }} aria-label="Painéis">
          <Link to="/varejo" style={{ color: 'var(--accent-blue)', fontSize: '0.9rem', textDecoration: 'none' }}>
            Varejo (SignalRetail)
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

      <div className="panelsSection">
        <button type="button" className="savePanelBtn" onClick={handleSavePanel} disabled={loading || !indicators.length}>
          Salvar painel
        </button>
        {savedPanels.length > 0 && (
          <div className="panelsList">
            <span className="panelsListLabel">Meus painéis:</span>
            {savedPanels.map((p) => (
              <span key={p.id} className="panelItem" onClick={() => handleLoadPanel(p)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleLoadPanel(p)}>
                {p.name}
                <button type="button" className="panelDeleteBtn" onClick={(ev) => handleDeletePanel(ev, p.id)} aria-label={`Excluir ${p.name}`}>&times;</button>
              </span>
            ))}
          </div>
        )}
        {panelFeedback && <span className="panelFeedback">{panelFeedback}</span>}
      </div>

      {error && <div className="error">{error}. Verifique se a API está rodando (uvicorn api.main:app).</div>}

      {loading && <div className="loading">Carregando…</div>}

      {!loading && (
        <section className="kpiGrid" aria-label="Cards de indicadores mais recentes">
          {selectedCategory === 'Macro' && kpis && (
            <>
              <div className="card">
                <h3>Última SELIC (% a.a.)</h3>
                <div className="value">{formatKpi(kpis.selic, '%')}</div>
              </div>
              <div className="card">
                <h3>IPCA acum. 12 meses</h3>
                <div className="value">{formatKpi(kpis.ipca_acum_12m, '%')}</div>
              </div>
              <div className="card">
                <h3>Var. USD/BRL (%)</h3>
                <div className="value blue">{formatKpi(kpis.cambio_var_pct, '%')}</div>
              </div>
              <div className="card">
                <h3>FOCUS IPCA 12m (%)</h3>
                <div className="value">{formatKpi(kpis.focus_ipca12, '%')}</div>
              </div>
              <div className="card">
                <h3>Reservas (US$ bi)</h3>
                <div className="value blue">{formatKpi(kpis.reservas_bi)}</div>
              </div>
              <div className="card">
                <h3>FOCUS SELIC (% a.a.)</h3>
                <div className="value">{formatKpi(kpis.focus_selic, '%')}</div>
              </div>
              <div className="card">
                <h3>Desocupação (%)</h3>
                <div className="value blue">{formatKpi(kpis.desocupacao, '%')}</div>
              </div>
            </>
          )}

          {selectedCategory !== 'Macro' && (
            <>
              {loadingCards && <div className="loading">Atualizando cards…</div>}
              {!loadingCards && CATEGORY_KEYS[selectedCategory]
                .filter((k) => indicators.includes(k))
                .map((k) => (
                  <div className="card" key={k}>
                    <h3>
                      {INDICATOR_LABELS[k] ?? k}
                      {k.startsWith('fipezap_') && selectedCity && selectedUf ? ` — ${selectedCity} (${selectedUf.toUpperCase()})` : ''}
                      {k.startsWith('sinapi_') && selectedUf ? ` — ${selectedUf.toUpperCase()}` : ''}
                    </h3>
                    <div className="value">{formatLatestValue(k, latestByKey[k]?.value ?? null)}</div>
                  </div>
                ))}
            </>
          )}
        </section>
      )}

      <section className="chartSection">
        <h2>Série histórica</h2>
        <div className="tabs" style={{ gap: 10, flexWrap: 'wrap' as any }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Categoria</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as CategoryKey)}
              aria-label="Categoria de indicadores"
            >
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Indicador</span>
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              aria-label="Indicador"
            >
              {indicatorOptions.map((key) => (
                <option key={key} value={key}>{INDICATOR_LABELS[key] ?? key}</option>
              ))}
            </select>
          </label>
          {loadingLocations && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Carregando filtros…</span>
          )}
          {!loadingLocations && selectedKey.startsWith('edu_sup_') && eduDimensions?.dimensions && (
            <>
              {Array.isArray(eduDimensions.dimensions.uf) && eduDimensions.dimensions.uf.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>UF</span>
                  <select value={selectedEduUf} onChange={(e) => setSelectedEduUf(e.target.value)} aria-label="UF (Educação)">
                    {eduDimensions.dimensions.uf.map((u) => (
                      <option key={u} value={u}>{u.toUpperCase()}</option>
                    ))}
                  </select>
                </label>
              )}
              {Array.isArray(eduDimensions.dimensions.rede) && eduDimensions.dimensions.rede.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Rede</span>
                  <select value={selectedEduRede} onChange={(e) => setSelectedEduRede(e.target.value)} aria-label="Rede (Educação)">
                    {eduDimensions.dimensions.rede.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
              )}
              {Array.isArray(eduDimensions.dimensions.modalidade) && eduDimensions.dimensions.modalidade.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Modalidade</span>
                  <select value={selectedEduModalidade} onChange={(e) => setSelectedEduModalidade(e.target.value)} aria-label="Modalidade (Educação)">
                    {eduDimensions.dimensions.modalidade.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
              )}
              {Array.isArray(eduDimensions.dimensions.area) && eduDimensions.dimensions.area.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Área (CINE)</span>
                  <select value={selectedEduArea} onChange={(e) => setSelectedEduArea(e.target.value)} aria-label="Área (Educação)">
                    {eduDimensions.dimensions.area.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {!loadingLocations && locations?.type === 'city_uf' && Array.isArray(locations.locations) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Cidade (UF)</span>
              <select
                value={`${selectedUf}||${selectedCity}`}
                onChange={(e) => {
                  const [ufVal, cityVal] = e.target.value.split('||')
                  setSelectedUf(ufVal)
                  setSelectedCity(cityVal)
                }}
                aria-label="Cidade/UF"
              >
                {(locations.locations as any[]).map((l) => {
                  const city = String(l.city ?? '')
                  const uf = String(l.uf ?? '').toUpperCase()
                  return (
                    <option key={`${uf}-${city}`} value={`${uf}||${city}`}>
                      {city} ({uf})
                    </option>
                  )
                })}
              </select>
            </label>
          )}
          {!loadingLocations && locations?.type === 'uf' && Array.isArray(locations.locations) && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>UF</span>
              <select value={selectedUf} onChange={(e) => setSelectedUf(e.target.value)} aria-label="UF">
                {(locations.locations as any[]).map((u) => (
                  <option key={String(u)} value={String(u)}>{String(u).toUpperCase()}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {comparisonKeys.length > 0 && (
          <div className="comparisonChips">
            {comparisonKeys.map((k, i) => (
              <span key={k} className="comparisonChip" style={{ borderColor: SERIES_COLORS[(i + 1) % SERIES_COLORS.length] }}>
                <span className="chipDot" style={{ background: SERIES_COLORS[(i + 1) % SERIES_COLORS.length] }} />
                {INDICATOR_LABELS[k] ?? k}
                <button type="button" onClick={() => setComparisonKeys((prev) => prev.filter((x) => x !== k))} aria-label={`Remover ${INDICATOR_LABELS[k] ?? k}`}>&times;</button>
              </span>
            ))}
          </div>
        )}

        <div className="chartToolbar">
          <div className="chartToolbarGroup">
            {comparisonKeys.length < 4 && comparisonOptions.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>+ Comparar</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setComparisonKeys((prev) => [...prev, e.target.value])
                  }}
                  aria-label="Adicionar série para comparação"
                >
                  <option value="">Selecione…</option>
                  {comparisonOptions.map((k) => (
                    <option key={k} value={k}>{INDICATOR_LABELS[k] ?? k}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="transformPerSeries">
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}>Transformação por série</span>
            <div className="transformPerSeriesList">
              {[selectedKey, ...comparisonKeys].map((key, i) => (
                <label key={key} className="transformPerSeriesRow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="chipDot" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length], width: 10, height: 10, borderRadius: '50%', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                    {INDICATOR_LABELS[key] ?? key}
                  </span>
                  <select
                    value={transformByKey[key] ?? 'original'}
                    onChange={(e) => setTransformByKey((prev) => ({ ...prev, [key]: e.target.value as TransformType }))}
                    aria-label={`Transformação para ${INDICATOR_LABELS[key] ?? key}`}
                  >
                    {(Object.keys(TRANSFORM_LABELS) as TransformType[]).map((t) => (
                      <option key={t} value={t}>{TRANSFORM_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="chartToolbarGroup">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>De</span>
              <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} aria-label="Data início" />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Até</span>
              <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} aria-label="Data fim" />
            </label>
            {(dateStart || dateEnd) && (
              <button type="button" className="resetDatesBtn" onClick={() => { setDateStart(''); setDateEnd('') }}>Limpar datas</button>
            )}
          </div>
          <div className="chartToolbarGroup exportBtns">
            <button type="button" onClick={() => downloadCSV(exportRows, 'macro_insights.csv')} disabled={exportRows.length === 0}>CSV</button>
            <button type="button" onClick={() => downloadXLSX(exportRows, 'macro_insights.xlsx')} disabled={exportRows.length === 0}>XLSX</button>
          </div>
        </div>

        <div className="chartCard">
          {loadingChart && <div className="loading">Carregando gráfico…</div>}
          {!loadingChart && multiChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={multiChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.6} />
                <XAxis
                  dataKey="date"
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickFormatter={(v) => selectedKey.startsWith('edu_sup_') ? v.slice(0, 4) : v.slice(0, 7)}
                />
                <YAxis
                  stroke="var(--text-secondary)"
                  tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                  tickFormatter={(v) => formatNumber(Number(v), 2)}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  labelFormatter={(label) => label}
                  formatter={(value: number, name: string) => {
                    const label = INDICATOR_LABELS[name] ?? name
                    return [typeof value === 'number' ? formatNumber(value) : value, label]
                  }}
                />
                {activeSeriesKeys.length > 1 && <Legend />}
                {activeSeriesKeys.map((key, i) => {
                  const label = INDICATOR_LABELS[key] ?? key
                  const t = transformByKey[key] ?? 'original'
                  const displayName = t === 'original' ? label : `${label} (${TRANSFORM_LABELS[t]})`
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      name={displayName}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
          {!loadingChart && multiChartData.length === 0 && series !== null && (
            <div className="loading">Nenhum dado no período.</div>
          )}
        </div>
        {selectedKey && INDICATOR_META[selectedKey] && (
          <div className="seriesInfo">
            <h3>Sobre esta série</h3>
            <dl>
              <dt>Como a série é formada</dt>
              <dd>{INDICATOR_META[selectedKey].formacao}</dd>
              <dt>Fonte dos dados</dt>
              <dd>{INDICATOR_META[selectedKey].fonte}</dd>
              <dt>Como os dados são obtidos</dt>
              <dd>{INDICATOR_META[selectedKey].como}</dd>
            </dl>
          </div>
        )}
      </section>

      <div className="correlationToggleWrap">
        <button
          type="button"
          className="correlationToggleBtn"
          onClick={() => setShowCorrelationPanel((v) => !v)}
          aria-expanded={showCorrelationPanel}
        >
          {showCorrelationPanel ? 'Ocultar Análise Conjunta entre Duas Séries' : 'Análise Conjunta entre Duas Séries'}
        </button>
      </div>

      {showCorrelationPanel && (
        <section className="correlationSection" aria-label="Análise conjunta entre duas séries">
          <h2>Análise Conjunta entre Duas Séries</h2>
          <p className="correlationIntro">
            Compare a evolução de dois indicadores no mesmo gráfico. As séries são normalizadas em base 100 no início do período.
            Pares sugeridos: <strong>SELIC × IPCA</strong>, <strong>Câmbio × Reservas</strong>, <strong>IBC-Br × IPCA</strong>, <strong>FOCUS × IPCA</strong>.
          </p>
          <div className="correlationControls">
            <label>
              <span>Série A</span>
              <select
                value={corrA}
                onChange={(e) => setCorrA(e.target.value)}
                aria-label="Primeira série para cruzamento"
              >
                <option value="">Selecione…</option>
                {indicators
                  .filter((k) => !k.startsWith('fipezap_') && !k.startsWith('sinapi_'))
                  .map((key) => (
                  <option key={key} value={key}>{INDICATOR_LABELS[key] ?? key}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Série B</span>
              <select
                value={corrB}
                onChange={(e) => setCorrB(e.target.value)}
                aria-label="Segunda série para cruzamento"
              >
                <option value="">Selecione…</option>
                {indicators
                  .filter((k) => !k.startsWith('fipezap_') && !k.startsWith('sinapi_'))
                  .map((key) => (
                  <option key={key} value={key}>{INDICATOR_LABELS[key] ?? key}</option>
                ))}
              </select>
            </label>
          </div>

          {!loadingCorrelation && correlationData.length > 0 && correlationCoeff != null && (
            <div className="correlationStats">
              <div className="correlationStatsRow">
                <span className="correlationStatsLabel">Correlação de Pearson</span>
                <span className="correlationStatsValue">{formatNumber(correlationCoeff, 3)}</span>
              </div>
              {correlationPValue != null && (
                <>
                  <div className="correlationStatsRow">
                    <span className="correlationStatsLabel">Valor-p (bicaudal)</span>
                    <span className="correlationStatsValue">{correlationPValue < 0.001 ? '< 0,001' : formatNumber(correlationPValue, 4)}</span>
                  </div>
                  <p className="correlationPValueExplain">
                    O valor-p indica a probabilidade de observar uma correlação tão forte quanto esta (ou maior) se não houvesse relação entre as séries na população. Valores menores que 0,05 costumam ser interpretados como evidência de que a correlação é estatisticamente significativa (não apenas por acaso).
                  </p>
                </>
              )}
            </div>
          )}

          <div className="chartCard correlationChart">
            {loadingCorrelation && <div className="loading">Carregando cruzamento…</div>}
            {!loadingCorrelation && corrA && corrB && corrA !== corrB && correlationData.length === 0 && (
              <div className="loading">Nenhum dado comum no período ou séries sem sobreposição de datas.</div>
            )}
            {!loadingCorrelation && correlationData.length > 0 && (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={correlationData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.6} />
                  <XAxis
                    dataKey="date"
                    stroke="var(--text-secondary)"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => v.slice(0, 7)}
                  />
                  <YAxis
                    stroke="var(--text-secondary)"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    tickFormatter={(v) => formatNumber(Number(v), 1)}
                    label={{ value: 'Base 100', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 11 } }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    labelFormatter={(label) => label}
                    formatter={(value: number, name: string) => [formatNumber(Number(value), 2) + ' (base 100)', name]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="normA"
                    stroke="var(--accent-blue)"
                    strokeWidth={2}
                    dot={false}
                    name={INDICATOR_LABELS[corrA] ?? corrA}
                  />
                  <Line
                    type="monotone"
                    dataKey="normB"
                    stroke="var(--accent-yellow)"
                    strokeWidth={2}
                    dot={false}
                    name={INDICATOR_LABELS[corrB] ?? corrB}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            {!loadingCorrelation && (!corrA || !corrB || corrA === corrB) && (
              <div className="loading">Selecione duas séries diferentes acima para visualizar o cruzamento.</div>
            )}
          </div>
        </section>
      )}

      <div className="correlationToggleWrap">
        <button
          type="button"
          className="correlationToggleBtn"
          onClick={() => setShowPhillipsCurve((v) => !v)}
          aria-expanded={showPhillipsCurve}
        >
          {showPhillipsCurve ? 'Ocultar Curva de Phillips' : 'Ver Curva de Phillips'}
        </button>
      </div>

      {showPhillipsCurve && (
        <section className="correlationSection" aria-label="Curva de Phillips">
          <h2>Curva de Phillips</h2>
          <p className="correlationIntro">
            Relação entre inflação (IPCA acumulado 12 meses) e desemprego (taxa de desocupação). Cada ponto representa um trimestre.
          </p>
          <div className="chartCard correlationChart">
            {loadingPhillips && <div className="loading">Carregando…</div>}
            {!loadingPhillips && phillipsData.length > 0 && (
              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 16, right: 16, left: 16, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.6} />
                  <XAxis
                    type="number"
                    dataKey="desocupacao"
                    name="Desocupação (%)"
                    stroke="var(--text-secondary)"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    label={{ value: 'Desocupação (%)', position: 'bottom', style: { fill: 'var(--text-secondary)', fontSize: 11 } }}
                  />
                  <YAxis
                    type="number"
                    dataKey="inflacao"
                    name="Inflação (% a.a.)"
                    stroke="var(--text-secondary)"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                    label={{ value: 'IPCA acum. 12m (%)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)', fontSize: 11 } }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div style={{ padding: 8 }}>
                          <div>Trimestre: {payload[0].payload.date}</div>
                          <div>Desocupação: {formatNumber(payload[0].payload.desocupacao, 2)}%</div>
                          <div>IPCA acum. 12m: {formatNumber(payload[0].payload.inflacao, 2)}%</div>
                        </div>
                      ) : null
                    }
                  />
                  <Scatter
                    data={phillipsData}
                    fill="var(--accent-blue)"
                    fillOpacity={0.7}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
            {!loadingPhillips && phillipsData.length === 0 && (
              <div className="loading">Sem dados de IPCA ou desocupação para exibir.</div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
