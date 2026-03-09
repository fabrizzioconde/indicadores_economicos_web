export type TransformType = 'original' | 'mom' | 'yoy' | 'ma3' | 'ma12' | 'base100' | 'acum12m'

export const TRANSFORM_LABELS: Record<TransformType, string> = {
  original: 'Original',
  mom: 'Var. mensal (%)',
  yoy: 'Var. anual (%)',
  ma3: 'Média móvel 3M',
  ma12: 'Média móvel 12M',
  base100: 'Índice base 100',
  acum12m: 'Acumulado 12 meses (%)',
}

function detectPeriodsPerYear(data: { date: string }[]): number {
  if (data.length < 2) return 12
  const d0 = new Date(data[0].date).getTime()
  const d1 = new Date(data[1].date).getTime()
  const gapDays = (d1 - d0) / 86_400_000
  if (gapDays < 15) return 252
  if (gapDays < 60) return 12
  if (gapDays < 200) return 4
  return 1
}

function rollingMean(
  data: { date: string; value: number }[],
  window: number,
): { date: string; value: number }[] {
  if (data.length < window) return []
  const result: { date: string; value: number }[] = []
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i].value
    if (i >= window) sum -= data[i - window].value
    if (i >= window - 1) {
      result.push({ date: data[i].date, value: sum / window })
    }
  }
  return result
}

export function applyTransform(
  data: { date: string; value: number }[],
  type: TransformType,
): { date: string; value: number }[] {
  if (type === 'original' || data.length === 0) return data

  switch (type) {
    case 'mom':
      return data.slice(1).map((p, i) => ({
        date: p.date,
        value: data[i].value !== 0 ? ((p.value / data[i].value) - 1) * 100 : 0,
      }))

    case 'yoy': {
      const lookback = detectPeriodsPerYear(data)
      if (data.length <= lookback) return []
      return data.slice(lookback).map((p, i) => ({
        date: p.date,
        value: data[i].value !== 0 ? ((p.value / data[i].value) - 1) * 100 : 0,
      }))
    }

    case 'ma3':
      return rollingMean(data, 3)

    case 'ma12':
      return rollingMean(data, 12)

    case 'base100': {
      const v0 = data[0].value
      if (v0 === 0) return data.map((p) => ({ date: p.date, value: 100 }))
      return data.map((p) => ({ date: p.date, value: (p.value / v0) * 100 }))
    }

    case 'acum12m': {
      if (data.length < 12) return []
      return data.slice(11).map((p, i) => {
        const window = data.slice(i, i + 12)
        const prod = window.reduce((acc, pt) => acc * (1 + pt.value / 100), 1)
        return { date: p.date, value: (prod - 1) * 100 }
      })
    }
  }
}
