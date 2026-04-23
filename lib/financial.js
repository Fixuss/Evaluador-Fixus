// lib/financial.js — motor de cálculo y evaluación crediticia Fixus

export function calcularRatios(data) {
  const {
    ventas, ebitda_ej,
    act_co, act_nco, pas_co, pas_nco, pn,
    dcp, dlp, ventas_ant, meses_post, deuda_post
  } = data

  const ebitda      = Number(ebitda_ej) || 0
  const activo_total  = act_co + act_nco
  const pasivo_total  = pas_co + pas_nco
  const deuda_fin   = dcp + dlp
  const capital_trabajo = act_co - pas_co

  const meses_validos = (meses_post || []).filter(v => v > 0)
  const nmeses = meses_validos.length
  const ventas_mens = nmeses > 0
    ? meses_validos.reduce((a, b) => a + b, 0) / nmeses
    : ventas / 12
  const ebitda_mens = ebitda > 0 ? ebitda / 12 : 0

  const deuda_meses_ventas = ventas_mens > 0 ? deuda_fin / ventas_mens : 99
  const deuda_meses_ebitda = ebitda_mens > 0 ? deuda_fin / ebitda_mens : 99

  // Deuda post-balance (al último mes cargado) y ratios comparativos
  const deuda_post_val   = deuda_post > 0 ? deuda_post : 0
  const tiene_deuda_post = deuda_post_val > 0
  const deuda_meses_post = tiene_deuda_post && ventas_mens > 0 ? deuda_post_val / ventas_mens : null
  const var_deuda        = tiene_deuda_post && deuda_fin > 0 ? (deuda_post_val - deuda_fin) / deuda_fin * 100 : null

  const var_ventas = ventas_ant > 0 ? (ventas - ventas_ant) / ventas_ant * 100 : null
  const tiene_ant  = ventas_ant > 0

  let meses_alza = 0, total_per = 0
  for (let i = 1; i < meses_validos.length; i++) {
    total_per++
    if (meses_validos[i] >= meses_validos[i - 1]) meses_alza++
  }
  const tiene_tend = total_per >= 2
  const pct_alza   = total_per > 0 ? meses_alza / total_per * 100 : 0

  return {
    ebitda,
    activo_total, pasivo_total, deuda_fin, capital_trabajo,
    margen_ebitda: ventas > 0 ? ebitda / ventas * 100 : 0,
    liquidez:      pas_co > 0 ? act_co / pas_co : 0,
    endeudamiento: pn > 0 ? pasivo_total / pn : 0,
    ventas_mens, ebitda_mens, deuda_meses_ventas, deuda_meses_ebitda,
    deuda_post: deuda_post_val, tiene_deuda_post, deuda_meses_post, var_deuda,
    var_ventas, tiene_ant, tiene_tend, pct_alza, nmeses,
    ventas: data.ventas, pn: data.pn, fin_sol: data.fin_sol || 0
  }
}

export function evalElegibilidad(r, antiguedad, fin_sol, F, prestamo = null) {
  const sugerido = prestamo && prestamo.sugerido_max > 0 ? prestamo.sugerido_max : null
  const checks = [
    {
      id: 'var_ventas', cat: 'tendencia',
      label: 'Variación ventas entre ejercicios',
      limite: `Caída máx. ${F.caida_max}%`,
      pass: r.tiene_ant ? r.var_ventas >= -F.caida_max : null,
      valor: r.tiene_ant
        ? (r.var_ventas >= 0 ? '+' : '') + r.var_ventas.toFixed(1) + '%'
        : 'Sin dato'
    },
    {
      id: 'tendencia', cat: 'tendencia',
      label: 'Tendencia post-balance creciente',
      limite: `≥ ${F.tend_pct}% meses en alza`,
      pass: r.tiene_tend ? r.pct_alza >= F.tend_pct : null,
      valor: r.tiene_tend ? r.pct_alza.toFixed(0) + '% meses alza' : 'Sin datos'
    },
    {
      id: 'deuda_ventas', cat: 'deuda',
      label: 'Deuda ≤ N meses de ventas actuales',
      limite: `Máx. ${F.deuda_meses} meses`,
      pass: r.deuda_meses_ventas <= F.deuda_meses,
      valor: r.deuda_meses_ventas.toFixed(2) + ' meses'
    },
    {
      id: 'deuda_ebitda', cat: 'deuda',
      label: 'Deuda ≤ N meses de EBITDA',
      limite: `Máx. ${F.deuda_ebitda_m} meses`,
      pass: r.ebitda_mens > 0 ? r.deuda_meses_ebitda <= F.deuda_ebitda_m : false,
      valor: r.ebitda_mens > 0 ? r.deuda_meses_ebitda.toFixed(2) + ' meses' : 'EBITDA negativo'
    },
    {
      id: 'var_deuda', cat: 'deuda',
      label: 'Variación de deuda vs. balance controlada',
      limite: `Máx. +${F.var_deuda_max}%`,
      pass: r.tiene_deuda_post ? (r.var_deuda !== null ? r.var_deuda <= F.var_deuda_max : null) : null,
      valor: r.tiene_deuda_post
        ? (r.var_deuda !== null ? (r.var_deuda >= 0 ? '+' : '') + r.var_deuda.toFixed(1) + '%' : 'Sin balance ref.')
        : 'Sin dato post'
    },
    {
      id: 'deuda_post_ventas', cat: 'deuda',
      label: 'Deuda post-balance ≤ N meses de ventas',
      limite: `Máx. ${F.deuda_meses} meses`,
      pass: r.tiene_deuda_post && r.deuda_meses_post !== null ? r.deuda_meses_post <= F.deuda_meses : null,
      valor: r.tiene_deuda_post && r.deuda_meses_post !== null
        ? r.deuda_meses_post.toFixed(2) + ' meses'
        : 'Sin dato post'
    },
    {
      id: 'capital_trabajo', cat: 'solvencia',
      label: 'Capital de trabajo positivo',
      limite: 'AC > PC',
      pass: F.ct_positivo ? r.capital_trabajo > 0 : true,
      valor: '$' + Math.round(r.capital_trabajo).toLocaleString('es-AR') + 'K'
    },
    {
      id: 'liquidez', cat: 'solvencia',
      label: 'Liquidez corriente mínima',
      limite: `≥ ${F.liquidez}x`,
      pass: r.liquidez >= F.liquidez,
      valor: r.liquidez.toFixed(2) + 'x'
    },
    {
      id: 'endeudamiento', cat: 'solvencia',
      label: 'Endeudamiento máximo (Pasivo/PN)',
      limite: `≤ ${F.endeud}x`,
      pass: r.endeudamiento <= F.endeud,
      valor: r.endeudamiento.toFixed(2) + 'x'
    },
    {
      id: 'pn_min', cat: 'solvencia',
      label: 'Patrimonio neto mínimo',
      limite: `≥ $${F.pn_min.toLocaleString('es-AR')}K`,
      pass: r.pn >= F.pn_min,
      valor: '$' + Math.round(r.pn).toLocaleString('es-AR') + 'K'
    },
    {
      id: 'ebitda_pos', cat: 'rentabilidad',
      label: 'EBITDA positivo',
      limite: '> 0',
      pass: F.ebitda_pos ? r.ebitda > 0 : true,
      valor: r.ebitda > 0 ? 'Sí' : 'No'
    },
    {
      id: 'margen_ebitda', cat: 'rentabilidad',
      label: 'Margen EBITDA mínimo',
      limite: `≥ ${F.ebitda_pct}%`,
      pass: r.margen_ebitda >= F.ebitda_pct,
      valor: r.margen_ebitda.toFixed(1) + '%'
    },
    {
      id: 'antiguedad', cat: 'perfil',
      label: 'Antigüedad mínima',
      limite: `≥ ${F.antiguedad} años`,
      pass: antiguedad >= F.antiguedad,
      valor: antiguedad + ' años'
    },
    {
      id: 'fin_sol', cat: 'perfil',
      label: 'Financiamiento dentro del tope máximo',
      limite: `≤ $${F.max_fin.toLocaleString('es-AR')}K`,
      pass: fin_sol <= F.max_fin,
      valor: '$' + Math.round(fin_sol).toLocaleString('es-AR') + 'K'
    },
    {
      id: 'fin_sugerido', cat: 'perfil',
      label: 'Financiamiento dentro del monto sugerido',
      limite: sugerido !== null
        ? `≤ $${Math.round(sugerido).toLocaleString('es-AR')}K`
        : 'Sin datos post',
      pass: sugerido !== null ? fin_sol <= sugerido : null,
      valor: sugerido !== null
        ? (fin_sol <= sugerido
            ? 'Dentro (' + ((fin_sol / sugerido) * 100).toFixed(0) + '% del sug.)'
            : 'Excede +' + ((fin_sol / sugerido - 1) * 100).toFixed(0) + '%')
        : 'Sin datos post'
    },
  ]

  const evaluados = checks.filter(c => c.pass !== null)
  const pasados   = evaluados.filter(c => c.pass === true).length
  const score     = evaluados.length > 0 ? Math.round(pasados / evaluados.length * 100) : 0
  const hayCritico = checks.some(c => ['deuda_ventas','deuda_ebitda'].includes(c.id) && c.pass === false)
    || (checks.find(c => c.id === 'var_ventas')?.pass === false)

  let status = 'rejected'
  if (score >= 80 && !hayCritico) status = 'approved'
  else if (score >= 60) status = 'warning'

  return { checks, pasados, total: evaluados.length, score, status }
}

export const CRITERIOS_DEFAULT = {
  caida_max: 10,
  tend_pct: 60,
  deuda_meses: 4,
  deuda_ebitda_m: 4,
  ct_positivo: true,
  liquidez: 1.0,
  endeud: 3.0,
  pn_min: 3000,
  ebitda_pos: true,
  ebitda_pct: 5,
  antiguedad: 3,
  max_fin: 5000000,
  // Recomendación de préstamo
  var_deuda_max: 20,        // % máximo de crecimiento de deuda vs balance
  score_min_credito: 70,    // umbral de score para activar la recomendación
  dias_cp_sug: 20,          // días de ventas sugeridos para corto plazo
  dias_lp_sug: 30,          // días de ventas sugeridos para largo plazo
  cobertura_max_ebitda: 12, // meses máx de EBITDA que puede cubrir el préstamo (cap de solvencia)
}
