import type { EfetivoRow, KpiKey } from './types'

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()

const OFICIAIS = ['CEL', 'TEN CEL', 'MAJ', 'CAP', 'TEN'] as const
const PRACAS = ['SUBTEN', 'SGT', 'CB', 'SD'] as const

const OFICIAIS_SET = new Set<string>(OFICIAIS)
const PRACAS_SET = new Set<string>(PRACAS)

type GrauKey = (typeof OFICIAIS)[number] | (typeof PRACAS)[number]

const extractGrauKey = (raw: string): GrauKey | null => {
  const v = normalizeText(raw)
  if (!v) return null

  if (v.includes('TEN CEL')) return 'TEN CEL'
  if (/\bCEL\b/.test(v)) return 'CEL'
  if (/\bMAJ\b/.test(v) || v.includes('MAJ ')) return 'MAJ'
  if (/\bCAP\b/.test(v) || v.includes('CAP ')) return 'CAP'

  if (v.includes('SUBTEN') || v.includes('SUB TEN')) return 'SUBTEN'
  if (/\bSGT\b/.test(v)) return 'SGT'
  if (/\bCB\b/.test(v)) return 'CB'
  if (/\bSD\b/.test(v)) return 'SD'

  if (v.includes(' 1º TEN') || v.includes(' 2º TEN') || /\bTEN\b/.test(v)) return 'TEN'

  return null
}

export const isOficial = (row: EfetivoRow) => {
  const key = extractGrauKey(row.grauHierarquico)
  return key != null && OFICIAIS_SET.has(key)
}

export const isPraca = (row: EfetivoRow) => {
  const key = extractGrauKey(row.grauHierarquico)
  return key != null && PRACAS_SET.has(key)
}

export const isAtividadeFim = (row: EfetivoRow) => normalizeText(row.caracteristicaDaFuncao) === normalizeText('Atividade Fim')
export const isAtividadeMeio = (row: EfetivoRow) => normalizeText(row.caracteristicaDaFuncao).includes(normalizeText('Atividade Meio'))

export type Kpi = {
  key: KpiKey
  label: string
  count: number
  percent: number
}

export type ChartDatum = { name: string; value: number }

export type UnitSummary = {
  opm: string
  total: number
  oficiais: number
  pracas: number
  atividadeFim: number
  atividadeMeio: number
}

export type DrilldownData =
  | { key: 'OFICIAIS'; title: string; bars: ChartDatum[]; pie: ChartDatum[] }
  | { key: 'PRACAS'; title: string; bars: ChartDatum[]; pie: ChartDatum[] }
  | { key: 'ATIVIDADE_FIM'; title: string; bars: ChartDatum[]; pie: ChartDatum[] }
  | { key: 'ATIVIDADE_MEIO'; title: string; bars: ChartDatum[]; pie: ChartDatum[] }

const countBy = (rows: EfetivoRow[], getKey: (r: EfetivoRow) => string) => {
  const map = new Map<string, number>()
  for (const row of rows) {
    const rawKey = getKey(row)
    const key = rawKey?.trim() ? rawKey.trim() : 'Não informado'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

const mapToChartData = (map: Map<string, number>, order?: string[]) => {
  const all = Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  if (!order) return all.sort((a, b) => b.value - a.value)
  const orderIndex = new Map(order.map((v, i) => [v, i]))
  return all.sort((a, b) => {
    const ai = orderIndex.get(a.name)
    const bi = orderIndex.get(b.name)
    if (ai != null && bi != null) return ai - bi
    if (ai != null) return -1
    if (bi != null) return 1
    return b.value - a.value
  })
}

export const buildKpis = (rows: EfetivoRow[]): Kpi[] => {
  const total = rows.length
  const oficiais = rows.filter(isOficial).length
  const pracas = rows.filter(isPraca).length
  const atividadeFim = rows.filter(isAtividadeFim).length
  const atividadeMeio = rows.filter(isAtividadeMeio).length

  const pct = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 1000) / 10)

  return [
    { key: 'TOTAL', label: 'Efetivo Total', count: total, percent: 100 },
    { key: 'OFICIAIS', label: 'Oficiais', count: oficiais, percent: pct(oficiais) },
    { key: 'PRACAS', label: 'Praças', count: pracas, percent: pct(pracas) },
    { key: 'ATIVIDADE_FIM', label: 'Atividade Fim', count: atividadeFim, percent: pct(atividadeFim) },
    { key: 'ATIVIDADE_MEIO', label: 'Atividade Meio', count: atividadeMeio, percent: pct(atividadeMeio) },
  ]
}

export const buildUnitSummaries = (rows: EfetivoRow[], opms: string[]): UnitSummary[] => {
  const byOpm = new Map<string, EfetivoRow[]>()

  const normalizeOpm = (raw: string) => {
    const v = normalizeText(raw)
    if (v === 'BEPE') return 'BEP'
    if (v === '1ªCIPM') return '1ª CIPM'
    return v
  }

  for (const row of rows) {
    const key = normalizeOpm(row.opm ?? '')
    if (!byOpm.has(key)) byOpm.set(key, [])
    byOpm.get(key)!.push(row)
  }

  return opms.map((opm) => {
    const list = byOpm.get(normalizeOpm(opm)) ?? []
    return {
      opm,
      total: list.length,
      oficiais: list.filter(isOficial).length,
      pracas: list.filter(isPraca).length,
      atividadeFim: list.filter(isAtividadeFim).length,
      atividadeMeio: list.filter(isAtividadeMeio).length,
    }
  })
}

export const buildDrilldown = (rows: EfetivoRow[], key: KpiKey): DrilldownData | null => {
  if (key === 'TOTAL') return null

  if (key === 'OFICIAIS') {
    const filtered = rows.filter(isOficial)
    const byRank = countBy(filtered, (r) => normalizeText(r.grauHierarquico))
    const bars = mapToChartData(byRank, [...OFICIAIS])
    return { key, title: 'Oficiais por posto', bars, pie: bars }
  }

  if (key === 'PRACAS') {
    const filtered = rows.filter(isPraca)
    const byRank = countBy(filtered, (r) => normalizeText(r.grauHierarquico))
    const bars = mapToChartData(byRank, [...PRACAS])
    return { key, title: 'Praças por graduação', bars, pie: bars }
  }

  if (key === 'ATIVIDADE_FIM') {
    const filtered = rows.filter(isAtividadeFim)
    const expected = ['BPVE', 'BEP', 'BPTUR', 'GPFER', 'RPMONT', '1ª CIPM']
    const byOpm = countBy(filtered, (r) => (r.opm?.trim() ? r.opm.trim() : 'Não informado'))
    const barsRaw = mapToChartData(byOpm)
    const expectedSet = new Set(expected.map((v) => normalizeText(v)))
    const barsMain = barsRaw
      .filter((d) => expectedSet.has(normalizeText(d.name)))
      .sort((a, b) => expected.indexOf(a.name) - expected.indexOf(b.name))
    const othersCount = barsRaw
      .filter((d) => !expectedSet.has(normalizeText(d.name)))
      .reduce((acc, cur) => acc + cur.value, 0)
    const bars = othersCount > 0 ? [...barsMain, { name: 'Outros', value: othersCount }] : barsMain
    return { key, title: 'Atividade Fim por OPM', bars, pie: bars }
  }

  const filtered = rows.filter(isAtividadeMeio)
  const bySetor = countBy(filtered, (r) => r.setorOuSecao ?? r.funcao)
  const barsAll = mapToChartData(bySetor)
  const bars = barsAll.slice(0, 12)
  const othersCount = barsAll.slice(12).reduce((acc, cur) => acc + cur.value, 0)
  const barsWithOthers = othersCount > 0 ? [...bars, { name: 'Outros', value: othersCount }] : bars
  return { key: 'ATIVIDADE_MEIO', title: 'Atividade Meio por setor/seção', bars: barsWithOthers, pie: barsWithOthers }
}

export const normalizeForComparison = normalizeText
