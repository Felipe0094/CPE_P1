import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildUnitSummaries, isOficial, isPraca, normalizeForComparison } from './lib/aggregation'
import {
  fetchEfetivoAdministrativoRowsFromSheets,
  fetchEfetivoRowsFromSheets,
  fetchEfetivoRowsFromTsvUrl,
  getPlanilhaTsvUrl,
} from './lib/sheets'
import type { EfetivoAdministrativoRow, EfetivoRow } from './lib/types'
import brasaoCpe from '../Brasoes/cpe.jpg'
import brasaoBpve from '../Brasoes/bpve.jpg'
import brasaoBep from '../Brasoes/bepe.jpg'
import brasaoBptur from '../Brasoes/bptur.jpg'
import brasaoGpfer from '../Brasoes/gpfer.jpg'
import brasaoRpmont from '../Brasoes/rpmont.jpg'
import brasao1Cipm from '../Brasoes/1cipm.jpg'
import brasaoRecom from '../Brasoes/recom.jpg'

const formatNumberPt = (value: number) => value.toLocaleString('pt-BR')
const formatCount2 = (value: number) => String(value).padStart(2, '0')
const formatCount3 = (value: number) => String(value).padStart(3, '0')

const UNIDADES = ['CPE', 'BPVE', 'BEPE', 'BPTUR', 'GPFER', 'RPMONT', '1ª CIPM', 'RECOM'] as const

const BRASOES_URL: Record<string, string> = {
  CPE: brasaoCpe,
  BPVE: brasaoBpve,
  BEPE: brasaoBep,
  BPTUR: brasaoBptur,
  GPFER: brasaoGpfer,
  RPMONT: brasaoRpmont,
  '1ª CIPM': brasao1Cipm,
  RECOM: brasaoRecom,
}

const getBrasaoUrl = (opm: string) => BRASOES_URL[opm] ?? null

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

const getCpeAdminSheetsConfigFromEnv = () => {
  const apiKey = (import.meta.env.VITE_SHEETS_API_KEY as string | undefined) ?? ''
  const spreadsheetId =
    (import.meta.env.VITE_SHEETS_CPE_ADMIN_SPREADSHEET_ID as string | undefined) ??
    '11LftHQvVWdjT7QCYBVBxloo0v668igPADuXNZsRtCBA'
  const rangeA1 = (import.meta.env.VITE_SHEETS_CPE_ADMIN_RANGE as string | undefined) ?? 'A1:F'
  const enabled = apiKey.trim() !== '' && spreadsheetId.trim() !== ''
  return { enabled, apiKey, spreadsheetId, rangeA1 }
}

const isOpm = (rowOpm: string, expected: string) => normalizeForComparison(rowOpm) === normalizeForComparison(expected)

const matchesUnit = (rowOpm: string, unit: string) => {
  const v = normalizeForComparison(rowOpm)
  const u = normalizeForComparison(unit)
  if (u === normalizeForComparison('BEP') || u === normalizeForComparison('BEPE'))
    return v === normalizeForComparison('BEP') || v === normalizeForComparison('BEPE')
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

const parseBirthDate = (raw: string): Date | null => {
  const v = (raw ?? '').toString().trim()
  if (!v) return null

  const m1 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) {
    const dd = Number(m1[1])
    const mm = Number(m1[2])
    const yyyy = Number(m1[3])
    const d = new Date(yyyy, mm - 1, dd)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const m2 = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) {
    const yyyy = Number(m2[1])
    const mm = Number(m2[2])
    const dd = Number(m2[3])
    const d = new Date(yyyy, mm - 1, dd)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

const monthLabelPt = (monthIndex0: number) =>
  [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ][monthIndex0] ?? ''

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
  const [cpeAdmOpen, setCpeAdmOpen] = useState(false)
  const [cpeAdmLoading, setCpeAdmLoading] = useState(false)
  const [cpeAdmError, setCpeAdmError] = useState<string | null>(null)
  const [cpeAdmRows, setCpeAdmRows] = useState<EfetivoAdministrativoRow[]>([])
  const [page, setPage] = useState<'P1' | 'P5'>('P1')

  const unitSummaries = useMemo(() => buildUnitSummaries(rows, [...UNIDADES]), [rows])
  const totalsGeral = useMemo(() => {
    const total = rows.length
    const oficiais = rows.filter(isOficial).length
    const pracas = rows.filter(isPraca).length
    return { total, oficiais, pracas }
  }, [rows])

  const loadData = useCallback(async () => {
    const cfg = getSheetsConfigFromEnv()
    const cpeCfg = getCpeSheetsConfigFromEnv()
    setError(null)
    try {
      const tsvUrl = getPlanilhaTsvUrl()
      if (!cfg.enabled && !tsvUrl) {
        setRows([])
        setError('Sem fonte de dados: configure VITE_SHEETS_API_KEY nos Secrets do GitHub ou adicione um TSV em /planilha.')
        return
      }
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

  const loadCpeAdm = useCallback(async () => {
    const cfg = getCpeAdminSheetsConfigFromEnv()
    setCpeAdmError(null)
    if (!cfg.enabled) {
      setCpeAdmRows([])
      setCpeAdmError('Sem API key para buscar o efetivo administrativo.')
      return
    }
    setCpeAdmLoading(true)
    try {
      const all = await fetchEfetivoAdministrativoRowsFromSheets({
        apiKey: cfg.apiKey,
        spreadsheetId: cfg.spreadsheetId,
        rangeA1: cfg.rangeA1,
      })
      const onlyCpe = all.filter((r) => matchesUnit(r.unidade, 'CPE') || normalizeForComparison(r.unidade) === normalizeForComparison('CPE'))
      setCpeAdmRows(onlyCpe)
    } catch (e) {
      setCpeAdmError(e instanceof Error ? e.message : 'Falha desconhecida ao carregar efetivo administrativo.')
      setCpeAdmRows([])
    } finally {
      setCpeAdmLoading(false)
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

  const cpeAdmBySecao = useMemo(() => {
    const map = new Map<string, EfetivoAdministrativoRow[]>()
    for (const row of cpeAdmRows) {
      const key = row.secao.trim() !== '' ? row.secao.trim() : 'Não informado'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    const sections = Array.from(map.entries())
      .map(([secao, list]) => ({
        secao,
        list: [...list].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      }))
      .sort((a, b) => a.secao.localeCompare(b.secao, 'pt-BR'))
    return sections
  }, [cpeAdmRows])

  const birthdaysByMonth = useMemo(() => {
    const monthBuckets = Array.from({ length: 12 }).map((_, month) => {
      const items = cpeAdmRows
        .map((r) => {
          const d = parseBirthDate(r.dataNasc)
          return { row: r, date: d }
        })
        .filter((x) => x.date != null && x.date.getMonth() === month)
        .map((x) => ({ row: x.row, date: x.date! }))
        .sort((a, b) => a.date.getDate() - b.date.getDate() || a.row.nome.localeCompare(b.row.nome, 'pt-BR'))

      const byDay = new Map<number, EfetivoAdministrativoRow[]>()
      for (const it of items) {
        const day = it.date.getDate()
        if (!byDay.has(day)) byDay.set(day, [])
        byDay.get(day)!.push(it.row)
      }

      const days = Array.from(byDay.entries())
        .map(([day, list]) => ({ day, list }))
        .sort((a, b) => a.day - b.day)

      return { month, count: items.length, days }
    })

    return monthBuckets
  }, [cpeAdmRows])

  return (
    <div
      className={
        page === 'P5'
          ? 'relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700'
          : 'min-h-screen bg-black'
      }
    >
      {page === 'P5' ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-white/25 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-fuchsia-300/20 blur-3xl" />
          <div className="absolute left-1/3 top-12 h-64 w-64 rounded-full bg-amber-200/15 blur-3xl" />
          <div className="absolute inset-0 opacity-40 [background-size:18px_18px] [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.25)_1px,transparent_0)]" />
        </div>
      ) : null}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPage('P1')}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                page === 'P1' ? 'bg-white text-slate-900' : 'border border-slate-700 bg-black text-slate-200 hover:bg-slate-900',
              ].join(' ')}
            >
              P1 — Efetivo
            </button>
            <button
              type="button"
              onClick={async () => {
                setPage('P5')
                if (cpeAdmRows.length === 0 && !cpeAdmLoading) await loadCpeAdm()
              }}
              className={[
                'rounded-lg px-3 py-2 text-sm font-semibold transition',
                page === 'P5' ? 'bg-white text-slate-900' : 'border border-slate-700 bg-black text-slate-200 hover:bg-slate-900',
              ].join(' ')}
            >
              P5 — Comunicação Social
            </button>
          </div>

          {page === 'P1' ? (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">CPE - P1 - Demonstrativo do Efetivo</h1>
              <div className="mt-1 text-sm text-slate-300">
                Fonte: <span className="font-medium text-slate-100">{sourceLabel}</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-red-400">
                Efetivo Total: <span className="text-red-300">{formatNumberPt(totalsGeral.total)}</span>
                <span className="mx-3 text-red-500">|</span>
                Oficiais <span className="text-red-300">{formatCount2(totalsGeral.oficiais)}</span>
                <span className="mx-3 text-red-500">|</span>
                Praças <span className="text-red-300">{formatCount2(totalsGeral.pracas)}</span>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">CPE - P5 - Comunicação Social</h1>
            </div>
          )}
        </header>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
        ) : null}

        <main className="mt-6 space-y-6">
          {page === 'P5' ? (
            <section className="space-y-3">
              <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">Aniversariantes por mês (CPE)</div>
                    <div className="mt-1 text-sm text-white/80">
                      Total de registros: <span className="font-semibold text-white">{formatNumberPt(cpeAdmRows.length)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await loadCpeAdm()
                      }}
                      className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                    >
                      Atualizar
                    </button>
                  </div>
                </div>

                {cpeAdmLoading ? <div className="mt-3 text-sm text-white/80">Carregando...</div> : null}
                {cpeAdmError ? (
                  <div className="mt-3 rounded-xl border border-red-200/40 bg-red-950/40 p-3 text-sm text-red-100">
                    {cpeAdmError}
                  </div>
                ) : null}

                {!cpeAdmLoading && !cpeAdmError ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {birthdaysByMonth.map(({ month, count, days }) => (
                      <div key={month} className="overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur">
                        <div className="flex items-center justify-between border-b border-white/15 bg-white/5 px-3 py-2">
                          <div className="text-sm font-semibold text-white">{monthLabelPt(month)}</div>
                          <div className="text-sm font-semibold text-white">{formatCount3(count)}</div>
                        </div>
                        {count === 0 ? (
                          <div className="px-3 py-3 text-sm text-white/75">Sem aniversariantes.</div>
                        ) : (
                          <div className="max-h-72 overflow-auto">
                            <div className="space-y-2 px-3 py-3">
                              {days.map(({ day, list }) => (
                                <div key={day} className="rounded-xl bg-white/5">
                                  <div className="flex items-center justify-between px-3 py-2">
                                    <div className="text-sm font-semibold text-white">Dia {formatCount2(day)}</div>
                                    <div className="text-sm font-semibold text-white/90">{formatCount2(list.length)}</div>
                                  </div>
                                  <div className="divide-y divide-white/10">
                                    {list.map((r, idx) => (
                                      <div key={`${month}-${day}-${idx}-${r.nome}`} className="px-3 py-2">
                                        <div className="min-w-0 truncate text-sm font-semibold text-white">{r.nome}</div>
                                        <div className="mt-0.5 text-sm text-white/80">
                                          {r.grauHierarquico || '—'}
                                          <span className="mx-2 text-white/50">|</span>
                                          {r.secao || '—'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {page === 'P1' ? (
            <section className="space-y-3">
            <div className="space-y-3">
              {unitSummaries.map((u) => {
                const active = selectedUnit === u.opm
                const unitRows = rows.filter((r) => matchesUnit(r.opm, u.opm))
                const byTipoServico = toTopNChartData(unitRows, (r) => r.tipoDeServico)
                const bySitSanitaria = toTopNChartData(unitRows, (r) => r.situacaoSanitaria)
                const bySitGeral = toTopNChartData(unitRows, (r) => r.situacaoGeral)
                const isCpe = normalizeForComparison(u.opm) === normalizeForComparison('CPE')

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
                          <div className="flex items-center gap-2">
                            {isCpe ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextOpen = !cpeAdmOpen
                                  setCpeAdmOpen(nextOpen)
                                  if (nextOpen && cpeAdmRows.length === 0 && !cpeAdmLoading) await loadCpeAdm()
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Efetivo ADM por seção
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUnit(null)
                                setCpeAdmOpen(false)
                              }}
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              Fechar
                            </button>
                          </div>
                        </div>

                        {isCpe && cpeAdmOpen ? (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-sm font-semibold text-slate-800">Efetivo administrativo — CPE (por seção)</div>
                              <button
                                type="button"
                                onClick={async () => {
                                  await loadCpeAdm()
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                Atualizar
                              </button>
                            </div>

                            {cpeAdmLoading ? <div className="mt-2 text-sm text-slate-500">Carregando...</div> : null}
                            {cpeAdmError ? (
                              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                                {cpeAdmError}
                              </div>
                            ) : null}

                            {!cpeAdmLoading && !cpeAdmError ? (
                              cpeAdmBySecao.length === 0 ? (
                                <div className="mt-2 text-sm text-slate-500">Sem dados.</div>
                              ) : (
                                <div className="mt-3 space-y-3">
                                  {cpeAdmBySecao.map(({ secao, list }) => (
                                    <div key={secao} className="rounded-lg border border-slate-200">
                                      <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                                        <div className="text-sm font-semibold text-slate-800">{secao}</div>
                                        <div className="text-sm font-semibold text-slate-700">{formatNumberPt(list.length)}</div>
                                      </div>
                                      <div className="divide-y divide-slate-100">
                                        {list.map((r, idx) => (
                                          <div key={`${secao}-${idx}-${r.nome}`} className="px-3 py-2">
                                            <div className="min-w-0 truncate text-sm font-semibold text-slate-800">{r.nome}</div>
                                            <div className="text-sm text-slate-700">{r.grauHierarquico || '—'}</div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )
                            ) : null}
                          </div>
                        ) : null}

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
          ) : null}
        </main>
      </div>
    </div>
  )
}
