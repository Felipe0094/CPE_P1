import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildUnitSummaries, normalizeForComparison } from './lib/aggregation'
import { fetchEfetivoRowsFromSheets, fetchEfetivoRowsFromTsvUrl, getPlanilhaTsvUrl } from './lib/sheets'
import type { EfetivoRow } from './lib/types'

const formatNumberPt = (value: number) => value.toLocaleString('pt-BR')
const formatCount2 = (value: number) => String(value).padStart(2, '0')

const UNIDADES = ['CPE', 'BPVE', 'BEP', 'BPTUR', 'GPFER', 'RPMONT', '1ª CIPM', 'RECOM'] as const

const BRASOES_RELATIVE: Record<string, string> = {
  CPE: '../Brasoes/cpe.jpg',
  BPVE: '../Brasoes/bpve.jpg',
  BEP: '../Brasoes/bepe.jpg',
  BPTUR: '../Brasoes/bptur.jpg',
  GPFER: '../Brasoes/gpfer.jpg',
  RPMONT: '../Brasoes/rpmont.jpg',
  '1ª CIPM': '../Brasoes/1cipm.jpg',
  RECOM: '../Brasoes/recom.jpg',
}

const getBrasaoUrl = (opm: string) => {
  const rel = BRASOES_RELATIVE[opm]
  return rel ? new URL(rel, import.meta.url).href : null
}

type UnitCardProps = {
  opm: string
  total: number
  oficiais: number
  pracas: number
  active: boolean
  onClick: () => void
}

const UnitCard = ({ opm, total, oficiais, pracas, active, onClick }: UnitCardProps) => {
  const brasaoUrl = getBrasaoUrl(opm)
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full overflow-hidden rounded-xl border bg-white text-left shadow-sm transition',
        'hover:-translate-y-0.5 hover:shadow-md',
        active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200',
      ].join(' ')}
    >
      <div className="flex h-24">
        <div className="h-full aspect-square border-r border-slate-200 bg-slate-50 p-2">
          <div className="h-full w-full overflow-hidden rounded-full bg-white shadow-sm">
            {brasaoUrl ? (
              <img src={brasaoUrl} alt={`Brasão ${opm}`} className="h-full w-full object-cover" />
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-stretch p-3 text-left">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-4">
            <div className="truncate text-base font-semibold text-slate-900">{opm}</div>
            <div className="text-sm text-slate-700">
              Oficiais <span className="font-semibold text-slate-900">{formatCount2(oficiais)}</span>
              <span className="mx-4 text-slate-300">|</span>
              Praças <span className="font-semibold text-slate-900">{formatCount2(pracas)}</span>
            </div>
          </div>

          <div className="flex flex-none items-center gap-6 border-l border-slate-200 pl-4">
            <div className="flex flex-col items-start leading-tight">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Efetivo total</div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">{formatNumberPt(total)}</div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

const getSheetsConfigFromEnv = () => {
  const apiKey = (import.meta.env.VITE_SHEETS_API_KEY as string | undefined) ?? ''
  const spreadsheetId =
    (import.meta.env.VITE_SHEETS_SPREADSHEET_ID as string | undefined) ?? '1ZHnZoGma_pEVrgOiXPMQDBztkNro_Rxcvzbf1auBssk'
  const rangeA1 = (import.meta.env.VITE_SHEETS_RANGE as string | undefined) ?? "'EFETIVO TOTAL'!A1:AA"
  const enabled = apiKey.trim() !== '' && spreadsheetId.trim() !== ''
  return { enabled, apiKey, spreadsheetId, rangeA1 }
}

const getCpeSheetsConfigFromEnv = () => {
  const apiKey = (import.meta.env.VITE_SHEETS_API_KEY as string | undefined) ?? ''
  const spreadsheetId =
    (import.meta.env.VITE_SHEETS_CPE_SPREADSHEET_ID as string | undefined) ?? '1PzMkqcMqR_I9RKAGRG53U1gGXy1p2eg3CLDTiGpiqIA'
  const rangeA1 = (import.meta.env.VITE_SHEETS_CPE_RANGE as string | undefined) ?? "'CPE'!A1:AA"
  const enabled = apiKey.trim() !== '' && spreadsheetId.trim() !== ''
  return { enabled, apiKey, spreadsheetId, rangeA1 }
}

const isOpm = (rowOpm: string, expected: string) => normalizeForComparison(rowOpm) === normalizeForComparison(expected)

const matchesUnit = (rowOpm: string, unit: string) => {
  const v = normalizeForComparison(rowOpm)
  const u = normalizeForComparison(unit)
  if (u === normalizeForComparison('BEP')) return v === normalizeForComparison('BEP') || v === normalizeForComparison('BEPE')
  if (u === normalizeForComparison('1ª CIPM')) return v === normalizeForComparison('1ª CIPM') || v === normalizeForComparison('1ªCIPM')
  return v === u
}

type ChartDatum = { name: string; value: number }

const toTopNChartData = (rows: EfetivoRow[], getValue: (r: EfetivoRow) => string | undefined, topN = 8): ChartDatum[] => {
  const map = new Map<string, number>()
  for (const r of rows) {
    const raw = (getValue(r) ?? '').toString().trim()
    const key = raw !== '' ? raw : 'Não informado'
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  const sorted = Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const head = sorted.slice(0, topN)
  const tailSum = sorted.slice(topN).reduce((acc, cur) => acc + cur.value, 0)
  return tailSum > 0 ? [...head, { name: 'Outros', value: tailSum }] : head
}

const formatPercent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`

const BreakdownBlock = ({ data, total }: { data: ChartDatum[]; total: number }) => {
  if (data.length === 0) return <div className="text-sm text-slate-500">Sem dados.</div>

  return (
    <div className="space-y-1">
      {data.map((item) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={item.name} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-2 py-1.5 text-sm">
            <div className="truncate text-slate-700" title={item.name}>
              {item.name}
            </div>
            <div className="flex flex-none items-center gap-3">
              <span className="font-semibold text-slate-900">{formatNumberPt(item.value)}</span>
              <span className="w-14 text-right text-slate-600">{formatPercent(pct)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [rows, setRows] = useState<EfetivoRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null)

  const unitSummaries = useMemo(() => buildUnitSummaries(rows, [...UNIDADES]), [rows])

  const loadData = useCallback(async () => {
    const cfg = getSheetsConfigFromEnv()
    const cpeCfg = getCpeSheetsConfigFromEnv()
    setError(null)
    try {
      const tsvUrl = getPlanilhaTsvUrl()
      const nextRows = cfg.enabled
        ? await (async () => {
            const [mainRows, cpeRows] = await Promise.all([
              fetchEfetivoRowsFromSheets({ apiKey: cfg.apiKey, spreadsheetId: cfg.spreadsheetId, rangeA1: cfg.rangeA1 }),
              cpeCfg.enabled
                ? fetchEfetivoRowsFromSheets({
                    apiKey: cpeCfg.apiKey,
                    spreadsheetId: cpeCfg.spreadsheetId,
                    rangeA1: cpeCfg.rangeA1,
                  })
                : Promise.resolve<EfetivoRow[]>([]),
            ])

            const mainWithoutCpe = mainRows.filter((r) => !isOpm(r.opm, 'CPE'))
            const cpeRowsNormalized = cpeRows.map((r) => ({ ...r, opm: 'CPE' }))

            return [...mainWithoutCpe, ...cpeRowsNormalized]
          })()
        : tsvUrl
          ? await fetchEfetivoRowsFromTsvUrl(tsvUrl)
          : []
      setRows(nextRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha desconhecida ao carregar dados.')
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const tsvUrl = getPlanilhaTsvUrl()
  const sheetsCfg = getSheetsConfigFromEnv()
  const cpeSheetsCfg = getCpeSheetsConfigFromEnv()
  const sourceLabel = sheetsCfg.enabled
    ? cpeSheetsCfg.enabled
      ? 'Google Sheets (EFETIVO TOTAL + CPE)'
      : 'Google Sheets (aba EFETIVO TOTAL)'
    : tsvUrl
      ? 'Planilha TSV (pasta planilha)'
      : 'Dados fictícios (modo demo)'

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">CPE - P1 - Demonstrativo do Efetivo</h1>
            <div className="mt-1 text-sm text-slate-300">
              Fonte: <span className="font-medium text-slate-100">{sourceLabel}</span>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : null}

        <main className="mt-6 space-y-6">
          <section className="space-y-3">
            <div className="space-y-3">
              {unitSummaries.map((u) => {
                const active = selectedUnit === u.opm
                const unitRows = rows.filter((r) => matchesUnit(r.opm, u.opm))
                const byTipoServico = toTopNChartData(unitRows, (r) => r.tipoDeServico)
                const bySitSanitaria = toTopNChartData(unitRows, (r) => r.situacaoSanitaria)
                const bySitGeral = toTopNChartData(unitRows, (r) => r.situacaoGeral)

                return (
                  <div key={u.opm} className="space-y-3">
                    <UnitCard
                      opm={u.opm}
                      total={u.total}
                      oficiais={u.oficiais}
                      pracas={u.pracas}
                      active={active}
                      onClick={() => setSelectedUnit((prev) => (prev === u.opm ? null : u.opm))}
                    />

                    {active ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-sm font-semibold text-slate-800">Detalhamento — {u.opm}</div>
                          <button
                            type="button"
                            onClick={() => setSelectedUnit(null)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Fechar
                          </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-sm font-semibold text-slate-700">Tipo de serviço</div>
                            <div className="mt-2">
                              <BreakdownBlock data={byTipoServico} total={u.total} />
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-sm font-semibold text-slate-700">Situação sanitária</div>
                            <div className="mt-2">
                              <BreakdownBlock data={bySitSanitaria} total={u.total} />
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="text-sm font-semibold text-slate-700">Situação geral</div>
                            <div className="mt-2">
                              <BreakdownBlock data={bySitGeral} total={u.total} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
