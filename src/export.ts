import * as XLSX from 'xlsx'

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(';'),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h]
          if (v == null) return ''
          if (typeof v === 'number') return String(v).replace('.', ',')
          return String(v)
        })
        .join(';'),
    ),
  ]
  const bom = '\uFEFF'
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

export function downloadXLSX(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  XLSX.writeFile(wb, filename)
}
