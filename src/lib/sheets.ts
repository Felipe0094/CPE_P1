import type { EfetivoRow } from './types'
import { normalizeForComparison } from './aggregation'

type SheetsFetchConfig = {
  apiKey: string
  spreadsheetId: string
  rangeA1: string
}

type SheetsValuesResponse = {
  values?: string[][]
}

const normalizeHeader = (value: string) => normalizeForComparison(value).replace(/\s*\/\s*/g, '/')

const pickIndex = (headers: string[], candidates: string[]) => {
  const normalizedCandidates = candidates.map(normalizeHeader)
  for (let i = 0; i < headers.length; i++) {
    if (normalizedCandidates.includes(normalizeHeader(headers[i] ?? ''))) return i
  }
  return -1
}

const findHeaderRowIndex = (values: string[][]) => {
  const opmMarkers = ['OPM']
  const grauMarkers = [
    'GRAU HIERARQUICO',
    'GRAU HIERÁRQUICO',
    'POSTO/GRADUACAO',
    'POSTO/GRADUAÇÃO',
    'POSTO/GRAD',
    'POSTO',
    'GRADUACAO',
    'GRADUAÇÃO',
    'POSTO GRADUACAO',
    'POSTO GRADUAÇÃO',
  ]

  const opmSet = new Set(opmMarkers.map(normalizeHeader))
  const grauSet = new Set(grauMarkers.map(normalizeHeader))

  const maxScan = Math.min(values.length, 30)
  for (let i = 0; i < maxScan; i++) {
    const row = values[i] ?? []
    const normalizedCells = row.map((c) => normalizeHeader((c ?? '').toString()))
    const hasOpm = normalizedCells.some((c) => opmSet.has(c))
    const hasGrau = normalizedCells.some((c) => grauSet.has(c))
    if (hasOpm && hasGrau) return i
  }

  return 0
}

type TsvUrlGlob = Record<string, string>

const PLANILHA_TSV_GLOB = import.meta.glob('../../planilha/*.tsv', {
  query: '?url',
  import: 'default',
  eager: true,
}) as TsvUrlGlob

export const getPlanilhaTsvUrl = (): string | null => {
  const entries = Object.entries(PLANILHA_TSV_GLOB)
  if (entries.length === 0) return null

  const preferred = entries.find(([path]) => normalizeForComparison(path).includes(normalizeForComparison('EFETIVO TOTAL')))
  if (preferred) return preferred[1]

  return entries[0][1]
}

const parseEfetivoRowsFromTable = (values: string[][]): EfetivoRow[] => {
  if (values.length === 0) return []

  const headerRowIndex = findHeaderRowIndex(values)
  const headerRow = values[headerRowIndex] ?? []
  const dataRows = values.slice(headerRowIndex + 1)
  const headers = (headerRow ?? []).map((v) => (v ?? '').toString())

  const idxOpm = pickIndex(headers, ['OPM'])
  const idxGrau = pickIndex(headers, [
    'GRAU HIERARQUICO',
    'GRAU HIERÁRQUICO',
    'POSTO/GRADUACAO',
    'POSTO/GRADUAÇÃO',
    'POSTO/GRAD',
    'POSTO',
    'GRADUACAO',
    'GRADUAÇÃO',
    'POSTO GRADUACAO',
    'POSTO GRADUAÇÃO',
    'POSTO/GRADUACAO ',
    'POSTO/GRADUAÇÃO ',
  ])
  const idxQuadro = pickIndex(headers, ['QUADRO'])
  const idxFuncao = pickIndex(headers, ['FUNCAO', 'FUNÇÃO'])
  const idxTipoServico = pickIndex(headers, ['TIPO DE SERVICO', 'TIPO DE SERVIÇO'])
  const idxSitSanitaria = pickIndex(headers, ['SITUACAO SANITARIA', 'SITUAÇÃO SANITÁRIA'])
  const idxCarac = pickIndex(headers, [
    'CARACTERISTICA DA FUNCAO',
    'CARACTERÍSTICA DA FUNÇÃO',
    'CARACTERISTA DA FUNCAO',
    'CARACTERISTA DA FUNÇÃO',
  ])
  const idxSit = pickIndex(headers, ['SITUACAO GERAL', 'SITUAÇÃO GERAL'])
  const idxSetor = pickIndex(headers, ['SETOR/SECAO', 'SETOR/SEÇÃO', 'SETOR', 'SECAO', 'SEÇÃO'])

  const get = (row: string[], idx: number) => (idx < 0 ? '' : (row[idx] ?? '').toString())

  return dataRows
    .filter((r) => (r ?? []).some((cell) => (cell ?? '').toString().trim() !== ''))
    .map((r) => {
      const row = (r ?? []).map((v) => (v ?? '').toString())
      const funcao = get(row, idxFuncao)
      const setor = get(row, idxSetor)
      return {
        opm: get(row, idxOpm),
        grauHierarquico: get(row, idxGrau),
        quadro: get(row, idxQuadro),
        funcao,
        tipoDeServico: get(row, idxTipoServico),
        situacaoSanitaria: get(row, idxSitSanitaria),
        caracteristicaDaFuncao: get(row, idxCarac),
        situacaoGeral: get(row, idxSit),
        setorOuSecao: setor || funcao,
      }
    })
}

const parseTsv = (text: string) => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((l) => l.trim() !== '')
  return lines.map((line) => line.split('\t'))
}

export const fetchEfetivoRowsFromTsvUrl = async (tsvUrl: string): Promise<EfetivoRow[]> => {
  const res = await fetch(tsvUrl)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Falha ao carregar TSV (${res.status}). ${body}`)
  }
  const text = await res.text()
  const values = parseTsv(text)
  return parseEfetivoRowsFromTable(values)
}

export const fetchEfetivoRowsFromSheets = async (config: SheetsFetchConfig): Promise<EfetivoRow[]> => {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(
      config.rangeA1,
    )}`,
  )
  url.searchParams.set('key', config.apiKey)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Falha ao carregar Google Sheets (${res.status}). ${body}`)
  }

  const json = (await res.json()) as SheetsValuesResponse
  const values = json.values ?? []
  return parseEfetivoRowsFromTable(values)
}
