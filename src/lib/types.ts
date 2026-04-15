export type EfetivoRow = {
  opm: string
  grauHierarquico: string
  quadro: string
  funcao: string
  caracteristicaDaFuncao: string
  tipoDeServico?: string
  situacaoSanitaria?: string
  situacaoGeral: string
  setorOuSecao?: string
}

export type KpiKey = 'TOTAL' | 'OFICIAIS' | 'PRACAS' | 'ATIVIDADE_FIM' | 'ATIVIDADE_MEIO'
