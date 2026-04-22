import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import { calcularRatios, evalElegibilidad, CRITERIOS_DEFAULT } from '../lib/financial'

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n, dec = 0) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtK = n => '$' + fmt(Math.round(n)) + 'K'

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [])
  return <div className="toast">{msg}</div>
}

// ── FORMULARIO ─────────────────────────────────────────────────────────────
const FORM_EMPTY = {
  razon:'', cuit:'', sector:'', destino:'',
  antiguedad:'', fin_sol:'',
  cierre_ejercicio:'', incluir_mes_actual:false,
  ventas_ant:'', ebitda_ant:'', deuda_ant:'',
  ventas:'', cmv:'', gastos_op:'', amort:'', res_fin:'', imp:'',
  act_co:'', act_nco:'', caja:'', pas_co:'', pas_nco:'', pn:'',
  dcp:'', dlp:'',
  deuda_post:'',
  m1:'', m2:'', m3:'', m4:'', m5:'', m6:'',
  m7:'', m8:'', m9:'', m10:'', m11:'', m12:'',
  m13:'', m14:'', m15:'', m16:'', m17:'', m18:'',
  m19:'', m20:'', m21:'', m22:'', m23:'', m24:'',
}

const MES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const FALLBACK_MONTHS = Array.from({ length: 12 }, (_, i) => ({ id: `m${i+1}`, label: `Mes ${i+1}` }))

// Devuelve el array de meses post-balance según fecha de cierre y preferencia del usuario.
// Null si no se cargó fecha → fallback a 12 meses genéricos.
function computePostBalanceMonths(cierreISO, incluirActual = false, hoy = new Date()) {
  if (!cierreISO) return null
  const [y, m] = cierreISO.split('-').map(Number)
  if (!y || !m) return null
  // Arranca el mes siguiente al cierre (m es 1-12, mes siguiente en 0-index es m)
  const cursor = new Date(y, m, 1)
  const endYear = hoy.getFullYear()
  const endMonth = incluirActual ? hoy.getMonth() : hoy.getMonth() - 1 // 0-index
  const end = new Date(endYear, endMonth, 1)
  if (end < cursor) return [] // cierre futuro o demasiado reciente
  const months = []
  let idx = 1
  while (cursor <= end && idx <= 24) {
    months.push({
      id: `m${idx}`,
      label: `${MES_CORTO[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`,
    })
    cursor.setMonth(cursor.getMonth() + 1)
    idx++
  }
  return months
}

// Convierte cualquier valor del form a número (vacío/NaN → 0) para los cálculos
const toNum = v => {
  if (v === '' || v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? 0 : n
}

function Campo({ label, id, form, setForm, type='number', span=1, placeholder='' }) {
  const [focused, setFocused] = useState(false)
  const isNum = type === 'number'
  const raw = form[id]

  const display = () => {
    if (!isNum) return raw ?? ''
    if (raw === '' || raw === null || raw === undefined) return ''
    if (focused) return String(raw)  // edición → dígitos crudos
    return Number(raw).toLocaleString('es-AR', { maximumFractionDigits: 0 })
  }

  return (
    <div className="field" style={span > 1 ? { gridColumn: `span ${span}` } : {}}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={isNum ? 'text' : type}
        inputMode={isNum ? 'numeric' : undefined}
        value={display()}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={e => {
          const v = e.target.value
          setForm(f => {
            if (!isNum) return { ...f, [id]: v }
            // Acepta dígitos y opcional signo menos al inicio
            const cleaned = v.replace(/[^\d-]/g, '')
            const isNeg = cleaned.startsWith('-')
            const digits = cleaned.replace(/-/g, '')
            if (digits === '') return { ...f, [id]: '' }
            const n = parseInt(digits, 10)
            return { ...f, [id]: isNeg ? -n : n }
          })
        }}
      />
    </div>
  )
}

// ── MEMO ANALÍTICO ─────────────────────────────────────────────────────────
// Construye un memo crediticio argumentado a partir de los ratios y el análisis.
// Devuelve un array de secciones { titulo, texto } para renderizar o exportar.
function buildMemoAnalista(r, elig, form, prestamo) {
  const razon = form.razon || 'La empresa'
  const sector = form.sector ? `el sector ${form.sector}` : 'un sector no informado'
  const antig = form.antiguedad || 0
  const secciones = []

  // 1) SÍNTESIS DEL CASO
  const statusFrase = {
    approved: 'reúne los criterios de elegibilidad establecidos por la política crediticia vigente',
    warning:  'presenta un perfil aceptable pero con observaciones puntuales que merecen análisis complementario',
    rejected: 'no alcanza los estándares mínimos requeridos por la política crediticia vigente',
  }[elig.status]
  let sint = `${razon} desarrolla su actividad en ${sector} con ${antig} años de trayectoria. `
  sint += `Sobre un total de ${elig.total} criterios evaluados, la empresa cumple ${elig.pasados}, `
  sint += `arrojando un score de ${elig.score}/100. En tal sentido, ${razon} ${statusFrase}. `
  if (form.fin_sol > 0) {
    sint += `El financiamiento solicitado asciende a ${fmtK(form.fin_sol)}`
    sint += form.destino ? `, con destino a ${form.destino}.` : '.'
  }
  secciones.push({ titulo: 'Síntesis del caso', texto: sint })

  // 2) RENTABILIDAD Y GENERACIÓN OPERATIVA
  const califMargen =
    r.margen_ebitda >= 15 ? 'holgado y por encima del promedio PyME habitual'
    : r.margen_ebitda >= 8  ? 'en línea con los estándares esperables para el segmento'
    : r.margen_ebitda >= 5  ? 'ajustado, cubriendo mínimamente la estructura operativa'
    :                          'deficiente, comprometiendo la sustentabilidad del negocio'
  const resNetoFrase = r.res_neto > 0
    ? `arrojando un resultado neto positivo de ${fmtK(r.res_neto)} (${r.margen_neto.toFixed(1)}%), consistente con una operación rentable`
    : `con un resultado neto negativo de ${fmtK(r.res_neto)} (${r.margen_neto.toFixed(1)}%), señal de alerta que debe contextualizarse (inversiones, cargos no recurrentes, situación excepcional)`
  let rent = `Sobre ventas netas de ${fmtK(form.ventas)}, la empresa genera un EBITDA de ${fmtK(r.ebitda)} `
  rent += `equivalente a un margen del ${r.margen_ebitda.toFixed(1)}%, ${califMargen}. `
  rent += `El margen bruto se sitúa en el ${r.margen_bruto.toFixed(1)}%, `
  rent += `y el ejercicio cierra ${resNetoFrase}. `
  if (r.ebitda > 0 && r.intereses > 0) {
    rent += `La cobertura de intereses alcanza ${r.cobertura.toFixed(1)}x, `
    rent += r.cobertura >= 3 ? 'con holgura suficiente para atender el costo financiero.' :
            r.cobertura >= 1.5 ? 'cobertura ajustada pero viable.' :
            'cobertura crítica que debe ser considerada.'
  }
  secciones.push({ titulo: 'Rentabilidad y generación operativa', texto: rent })

  // 3) SOLVENCIA Y LIQUIDEZ
  const liqFrase =
    r.liquidez >= 1.5 ? 'posición de liquidez holgada frente a los compromisos corrientes'
    : r.liquidez >= 1.0 ? 'cobertura ajustada pero suficiente del pasivo corriente'
    :                     'déficit de liquidez corriente que exige atención'
  const ctFrase = r.capital_trabajo > 0
    ? `capital de trabajo positivo por ${fmtK(r.capital_trabajo)}, consistente con el giro comercial`
    : `capital de trabajo negativo por ${fmtK(r.capital_trabajo)}, debilidad estructural a considerar en la toma de decisión`
  const endCalif =
    r.endeudamiento <= 1.5 ? 'apalancamiento conservador'
    : r.endeudamiento <= 3.0 ? 'apalancamiento dentro de parámetros aceptables'
    :                          'apalancamiento elevado que exige cautela adicional'
  let solv = `La empresa evidencia una ${liqFrase} (liquidez corriente de ${r.liquidez.toFixed(2)}x) y un ${ctFrase}. `
  solv += `El patrimonio neto asciende a ${fmtK(form.pn)} frente a un pasivo total de ${fmtK(r.pasivo_total)}, `
  solv += `resultando en una relación Pasivo/PN de ${r.endeudamiento.toFixed(2)}x — ${endCalif}. `
  solv += `El ROE se ubica en ${r.roe.toFixed(1)}% y el ROA en ${r.roa.toFixed(1)}%.`
  secciones.push({ titulo: 'Solvencia y estructura patrimonial', texto: solv })

  // 4) ESTRUCTURA Y EVOLUCIÓN DE LA DEUDA
  let deu = `La deuda financiera al cierre del ejercicio asciende a ${fmtK(r.deuda_fin)}, `
  deu += `equivalente a ${r.deuda_meses_ventas.toFixed(1)} meses de ventas`
  deu += r.ebitda_mens > 0 ? ` y ${r.deuda_meses_ebitda.toFixed(1)} meses de EBITDA. ` : '. '
  if (r.tiene_deuda_post) {
    const signoVar = r.var_deuda >= 0 ? `se incrementó un ${r.var_deuda.toFixed(1)}%` : `se redujo un ${Math.abs(r.var_deuda).toFixed(1)}%`
    const califVar = r.var_deuda > 20 ? 'variación significativa que debe ser justificada'
      : r.var_deuda > 0 ? 'crecimiento moderado y dentro de parámetros'
      : 'evolución favorable en el período'
    deu += `Al mes de referencia post-balance, la deuda financiera se ubica en ${fmtK(r.deuda_post)} (${r.deuda_meses_post.toFixed(1)} meses de ventas promedio post), `
    deu += `lo que implica que ${signoVar} respecto del balance cerrado — ${califVar}. `
  }
  const califDeu =
    r.deuda_meses_ventas <= 3 ? 'La estructura de endeudamiento es conservadora'
    : r.deuda_meses_ventas <= 4 ? 'La estructura se mantiene dentro del umbral aceptable'
    :                              'La estructura se ubica por encima del umbral recomendado por la política'
  deu += `${califDeu} para el perfil evaluado.`
  secciones.push({ titulo: 'Estructura y evolución de la deuda', texto: deu })

  // 5) DINÁMICA COMERCIAL POST-BALANCE
  let dim = ''
  if (r.tiene_ant) {
    const signo = r.var_ventas >= 0 ? `crecimiento interanual del ${r.var_ventas.toFixed(1)}%` : `caída interanual del ${Math.abs(r.var_ventas).toFixed(1)}%`
    const cal = r.var_ventas >= 10 ? 'expansión sólida'
      : r.var_ventas >= 0 ? 'estabilidad con sesgo positivo'
      : r.var_ventas >= -10 ? 'retracción leve'
      : 'contracción significativa'
    dim += `La comparación entre ejercicios muestra un ${signo}, consistente con una ${cal}. `
  } else {
    dim += 'No se dispone de datos del ejercicio anterior para evaluar variación interanual. '
  }
  if (r.tiene_tend) {
    const cal = r.pct_alza >= 70 ? 'dinámica comercial sólida'
      : r.pct_alza >= 50 ? 'dinámica comercial estable'
      : 'dinámica comercial decreciente que debe ser monitoreada'
    dim += `Sobre los ${r.nmeses} meses post-balance relevados, el ${r.pct_alza.toFixed(0)}% muestra crecimiento respecto del período previo, indicando una ${cal}. `
    dim += `Las ventas promedio mensuales se ubican en ${fmtK(r.ventas_mens)}.`
  } else {
    dim += 'La información post-balance aportada resulta insuficiente para construir una tendencia robusta.'
  }
  secciones.push({ titulo: 'Dinámica comercial post-balance', texto: dim })

  // 6) CONSIDERACIÓN CREDITICIA
  const apta = prestamo && elig.score >= prestamo.umbral && r.ventas_mens > 0
  if (apta) {
    const capFrase = prestamo.cap_activo
      ? `respetando el cap de solvencia de ${prestamo.cobertura_max_ebitda} meses de EBITDA mensual (${fmtK(r.ebitda_mens * prestamo.cobertura_max_ebitda)})`
      : 'sin aplicación de cap EBITDA por no resultar éste positivo'
    let cc = `En virtud del score alcanzado (${elig.score} ≥ umbral ${prestamo.umbral}), se considera habilitada una asistencia sugerida de `
    cc += `${fmtK(prestamo.cp)} a corto plazo (${prestamo.dias_cp} días de ventas promedio post) `
    cc += `o bien ${fmtK(prestamo.lp)} a largo plazo (${prestamo.dias_lp} días de ventas promedio post), `
    cc += `siendo ambas opciones alternativas y no acumulables, ${capFrase}. `
    if (prestamo.comparacion) {
      cc += prestamo.comparacion.excede
        ? `El monto solicitado por la empresa (${fmtK(prestamo.comparacion.pidio)}) supera la opción mayor sugerida (${fmtK(prestamo.comparacion.sugerido_max)}) en un ${((prestamo.comparacion.ratio - 1) * 100).toFixed(0)}%, por lo cual se recomienda reformular plazos o ajustar el importe a los parámetros habilitados antes de elevar a comité.`
        : `El monto solicitado por la empresa (${fmtK(prestamo.comparacion.pidio)}) cubre el ${(prestamo.comparacion.ratio * 100).toFixed(0)}% de la opción mayor sugerida, ubicándose dentro de los parámetros recomendables.`
    }
    secciones.push({ titulo: 'Consideración crediticia', texto: cc })
  } else if (prestamo && r.ventas_mens > 0) {
    secciones.push({
      titulo: 'Consideración crediticia',
      texto: `El score obtenido (${elig.score}) no alcanza el umbral mínimo de ${prestamo.umbral} exigido para activar la recomendación automática de crédito. Se recomienda resolver las debilidades señaladas en el checklist antes de avanzar con el análisis crediticio.`
    })
  }

  return secciones
}

// ── VISTA ANÁLISIS ─────────────────────────────────────────────────────────
const CAT_LABELS = { tendencia:'Tendencia', deuda:'Deuda', solvencia:'Solvencia', rentabilidad:'Rentabilidad', perfil:'Perfil' }
const STATUS_LABELS = { approved:'Empresa elegible — puede avanzar', warning:'Elegible con observaciones', rejected:'No cumple los criterios mínimos' }
const STATUS_ICONS  = { approved:'✓', warning:'⚠', rejected:'✗' }

function PanelResultado({ resultado, onAgregar, onPDF, loading, pdfLoading }) {
  const { r, elig, form, prestamo } = resultado
  const recomendable = prestamo && elig.score >= prestamo.umbral && r.ventas_mens > 0

  const scoreColor = elig.score >= 80 ? '#059669' : elig.score >= 60 ? '#D97706' : '#DC2626'

  const metricColor = (v, good, ok) => v >= good ? 'good' : v >= ok ? 'warn' : 'bad'

  const memo = buildMemoAnalista(r, elig, form, prestamo)
  const fechaInforme = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })

  return (
    <div id="pdf-root">
      {/* Header visible sólo durante la captura PDF */}
      <div className="pdf-header">
        <div className="pdf-header-row">
          <img src="/logo.svg" alt="Fixus" className="pdf-logo" />
          <div className="pdf-header-title">
            <div className="pdf-title">Informe de Evaluación Crediticia</div>
            <div className="pdf-subtitle">Fixus — Consultora para PyMEs</div>
          </div>
          <div className="pdf-header-date">{fechaInforme}</div>
        </div>
        <div className="pdf-header-meta">
          <div><strong>Razón social:</strong> {form.razon || '—'}</div>
          <div><strong>CUIT:</strong> {form.cuit || '—'}</div>
          <div><strong>Sector:</strong> {form.sector || '—'}</div>
          <div><strong>Antigüedad:</strong> {form.antiguedad || 0} años</div>
          <div><strong>Financiamiento solicitado:</strong> {fmtK(form.fin_sol)}</div>
          <div><strong>Destino:</strong> {form.destino || '—'}</div>
        </div>
        <div className="pdf-divider" />
      </div>
      {/* Banner */}
      <div className={`status-banner ${elig.status}`}>
        <span className="status-icon">{STATUS_ICONS[elig.status]}</span>
        <div>
          <div className={`status-text ${elig.status}`}>{STATUS_LABELS[elig.status]}</div>
          <div className="status-sub">{elig.pasados}/{elig.total} criterios · Score {elig.score}/100</div>
        </div>
        <div style={{ marginLeft:'auto', textAlign:'right' }}>
          <div style={{ fontSize: 28, fontFamily:"'DM Serif Display',serif", fontWeight:400, color: scoreColor }}>{elig.score}</div>
          <div style={{ fontSize: 10, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'.06em' }}>Score</div>
        </div>
      </div>
      <div className="score-bar-wrap">
        <div className="score-bar" style={{ width: elig.score+'%', background: scoreColor }} />
      </div>

      {/* Recomendación de crédito — se activa cuando score supera el umbral */}
      {recomendable && (
        <div style={{
          marginTop: 16, padding: '16px 20px',
          background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)',
          border: '1px solid #86EFAC', borderRadius: 12,
          boxShadow: '0 2px 8px rgba(5,150,105,.08)'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ fontSize:18 }}>💡</span>
            <div style={{ fontWeight:600, color:'#065F46', fontSize:14 }}>Recomendación de crédito sugerida</div>
            <span style={{
              marginLeft:'auto', fontSize:11, padding:'3px 10px',
              background:'#D1FAE5', color:'#065F46', borderRadius:10, fontWeight:500
            }}>Score {elig.score} ≥ {prestamo.umbral}</span>
          </div>
          <div style={{ fontSize:11, color:'#475569', marginBottom:12, fontStyle:'italic' }}>
            Dos opciones alternativas (no se suman) — se elige CP <em>o</em> LP según necesidad de la empresa.
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:10, alignItems:'stretch' }}>
            <div style={{ padding:'12px 16px', background:'#fff', borderRadius:8, border:'1px solid #D1FAE5' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:11, color:'#047857', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Corto plazo</div>
                {prestamo.cp_capeado && (
                  <span title={`Cap de ${prestamo.cobertura_max_ebitda}m de EBITDA`} style={{ fontSize:10, padding:'2px 6px', background:'#FEF3C7', color:'#92400E', borderRadius:6, fontWeight:500 }}>cap EBITDA</span>
                )}
              </div>
              <div style={{ fontSize:24, fontWeight:600, color:'#065F46', marginTop:4 }}>{fmtK(prestamo.cp)}</div>
              <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{prestamo.dias_cp} días de ventas</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', fontSize:11, fontStyle:'italic', padding:'0 4px' }}>o bien</div>
            <div style={{ padding:'12px 16px', background:'#fff', borderRadius:8, border:'1px solid #D1FAE5' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:11, color:'#047857', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Largo plazo</div>
                {prestamo.lp_capeado && (
                  <span title={`Cap de ${prestamo.cobertura_max_ebitda}m de EBITDA`} style={{ fontSize:10, padding:'2px 6px', background:'#FEF3C7', color:'#92400E', borderRadius:6, fontWeight:500 }}>cap EBITDA</span>
                )}
              </div>
              <div style={{ fontSize:24, fontWeight:600, color:'#065F46', marginTop:4 }}>{fmtK(prestamo.lp)}</div>
              <div style={{ fontSize:11, color:'#64748B', marginTop:2 }}>{prestamo.dias_lp} días de ventas</div>
            </div>
          </div>

          {/* Comparación con el monto solicitado */}
          {prestamo.comparacion && (
            <div style={{
              marginTop:12, padding:'10px 14px',
              background: prestamo.comparacion.excede ? '#FEF2F2' : '#F0FDF4',
              border: `1px solid ${prestamo.comparacion.excede ? '#FECACA' : '#BBF7D0'}`,
              borderRadius:8, fontSize:12
            }}>
              <span style={{ color:'#475569' }}>La empresa solicitó <strong>{fmtK(prestamo.comparacion.pidio)}</strong> — </span>
              {prestamo.comparacion.excede ? (
                <span style={{ color:'#991B1B', fontWeight:500 }}>
                  supera la opción mayor sugerida ({fmtK(prestamo.comparacion.sugerido_max)}) en {((prestamo.comparacion.ratio - 1) * 100).toFixed(0)}%. Revisar plazo o monto.
                </span>
              ) : (
                <span style={{ color:'#065F46', fontWeight:500 }}>
                  cubre el {(prestamo.comparacion.ratio * 100).toFixed(0)}% de la opción mayor sugerida ({fmtK(prestamo.comparacion.sugerido_max)}). Dentro de lo recomendable.
                </span>
              )}
            </div>
          )}

          <div style={{ fontSize:11, color:'#475569', marginTop:10, fontStyle:'italic' }}>
            Base: ventas promedio post-balance de {fmtK(r.ventas_mens)}/mes
            {prestamo.cap_activo ? ` · cap de solvencia: ${prestamo.cobertura_max_ebitda}m de EBITDA = ${fmtK(r.ebitda_mens * prestamo.cobertura_max_ebitda)}` : ' · sin cap EBITDA (EBITDA no positivo)'}.
          </div>
        </div>
      )}

      {/* Métricas clave */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Deuda / ventas {r.tiene_deuda_post ? '(post)' : ''}</div>
          {r.tiene_deuda_post ? (
            <>
              <div className={`metric-value ${r.deuda_meses_post <= 4 ? 'good' : r.deuda_meses_post <= 5 ? 'warn' : 'bad'}`}>{r.deuda_meses_post.toFixed(1)}m</div>
              <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>
                balance: {r.deuda_meses_ventas.toFixed(1)}m
                {r.var_deuda !== null && (
                  <span style={{
                    marginLeft:6,
                    color: r.var_deuda > 10 ? '#DC2626' : r.var_deuda < -5 ? '#059669' : '#64748B',
                    fontWeight:500
                  }}>
                    ({r.var_deuda >= 0 ? '+' : ''}{r.var_deuda.toFixed(0)}%)
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={`metric-value ${r.deuda_meses_ventas <= 4 ? 'good' : r.deuda_meses_ventas <= 5 ? 'warn' : 'bad'}`}>{r.deuda_meses_ventas.toFixed(1)}m</div>
              <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>meses de ventas (balance)</div>
            </>
          )}
        </div>
        <div className="metric-card">
          <div className="metric-label">Deuda / EBITDA</div>
          <div className={`metric-value ${r.ebitda_mens > 0 && r.deuda_meses_ebitda <= 4 ? 'good' : r.ebitda_mens > 0 && r.deuda_meses_ebitda <= 5 ? 'warn' : 'bad'}`}>
            {r.ebitda_mens > 0 ? r.deuda_meses_ebitda.toFixed(1)+'m' : 'n/a'}
          </div>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>meses de EBITDA</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Capital de trabajo</div>
          <div className={`metric-value ${r.capital_trabajo > 0 ? 'good' : 'bad'}`}>{fmtK(r.capital_trabajo)}</div>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>activo corriente – pasivo cte.</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Tendencia post-balance</div>
          <div className={`metric-value ${!r.tiene_tend ? 'neutral' : r.pct_alza >= 60 ? 'good' : r.pct_alza >= 40 ? 'warn' : 'bad'}`} style={{fontSize:18}}>
            {r.tiene_tend ? r.pct_alza.toFixed(0)+'%' : '—'}
          </div>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>meses en alza</div>
        </div>
      </div>

      {/* Checklist */}
      <div className="card section-gap">
        <div className="card-header"><div className="section-dot" /><span className="card-title">Criterios de elegibilidad</span></div>
        <div className="card-body">
          <div className="checklist">
            {elig.checks.map(c => (
              <div key={c.id} className={`check-item ${c.pass === null ? 'neutral' : c.pass ? 'pass' : 'fail'}`}>
                <span className="check-icon" style={{color: c.pass === null ? '#94A3B8' : c.pass ? '#059669' : '#DC2626'}}>
                  {c.pass === null ? '—' : c.pass ? '✓' : '✗'}
                </span>
                <span className="check-label">{c.label}</span>
                <span className="check-value">{c.valor}</span>
                <span className={`check-cat cat-${c.cat}`}>{CAT_LABELS[c.cat]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tablas de resultados */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
        <div className="card">
          <div className="card-header"><div className="section-dot" /><span className="card-title">Estado de resultados</span></div>
          <div className="card-body">
            {[
              ['Ventas netas', fmtK(form.ventas)],
              ['Ganancia bruta', fmtK(r.gan_bruta) + ' (' + r.margen_bruto.toFixed(1) + '%)'],
              ['EBITDA', fmtK(r.ebitda) + ' (' + r.margen_ebitda.toFixed(1) + '%)'],
              ['EBIT', fmtK(r.ebit)],
              ['Resultado neto', fmtK(r.res_neto) + ' (' + r.margen_neto.toFixed(1) + '%)'],
            ].map(([k,v]) => (
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}>
                <span style={{color:'#64748B'}}>{k}</span><span style={{fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="section-dot" /><span className="card-title">Posición patrimonial</span></div>
          <div className="card-body">
            {[
              ['Activo total', fmtK(r.activo_total)],
              ['Pasivo total', fmtK(r.pasivo_total)],
              ['Patrimonio neto', fmtK(form.pn)],
              ['Liquidez corriente', r.liquidez.toFixed(2) + 'x'],
              ['Endeudamiento (P/PN)', r.endeudamiento.toFixed(2) + 'x'],
              ['Deuda financiera (balance)', fmtK(r.deuda_fin) + ' · ' + r.deuda_meses_ventas.toFixed(2) + 'm'],
              ...(r.tiene_deuda_post ? [
                ['Deuda financiera (post-balance)', fmtK(r.deuda_post) + ' · ' + r.deuda_meses_post.toFixed(2) + 'm'],
                ['Variación de deuda', (r.var_deuda >= 0 ? '+' : '') + r.var_deuda.toFixed(1) + '%'],
              ] : []),
            ].map(([k,v]) => (
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}>
                <span style={{color:'#64748B'}}>{k}</span><span style={{fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Memo analítico */}
      <div className="card section-gap card--violet">
        <div className="card-header">
          <div className="section-dot" />
          <span className="card-title">Análisis crediticio — Memo del analista</span>
        </div>
        <div className="card-body">
          <div className="memo-box">
            {memo.map((s, i) => (
              <div key={i} className="memo-section">
                <div className="memo-title">{i + 1}. {s.titulo}</div>
                <div className="memo-text">{s.texto}</div>
              </div>
            ))}
            <div className="memo-footer">
              Informe generado el {fechaInforme} · Evaluador crediticio Fixus · Documento de uso interno
            </div>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="action-bar" style={{ marginTop:16, display:'flex', gap:10, flexWrap:'wrap' }}>
        <button className="btn btn-success" onClick={onAgregar} disabled={loading || pdfLoading}>
          {loading ? <span className="spinner" /> : '✚'} Agregar al pipeline
        </button>
        <button className="btn btn-primary" onClick={onPDF} disabled={loading || pdfLoading} title="Exporta el informe completo en PDF con el logo de la consultora">
          {pdfLoading ? <span className="spinner" /> : '📄'} Descargar PDF
        </button>
      </div>
    </div>
  )
}

// ── CRITERIOS ──────────────────────────────────────────────────────────────
function PanelCriterios({ criterios, setCriterios, onSave, saving }) {
  const F = criterios
  const set = (k, v) => setCriterios(c => ({ ...c, [k]: v }))

  const Row = ({ label, k, type='number', step=1, note='' }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #F1F5F9' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, color:'#334155', fontWeight:500 }}>{label}</div>
        {note && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{note}</div>}
      </div>
      {type === 'bool' ? (
        <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
          <input type="checkbox" checked={F[k]} onChange={e => set(k, e.target.checked)} style={{ width:16, height:16, accentColor:'#617ECA' }} />
          <span style={{ fontSize:12, color:'#64748B' }}>{F[k] ? 'Requerido' : 'Opcional'}</span>
        </label>
      ) : (
        <input
          type="number" step={step} value={F[k]}
          onChange={e => set(k, parseFloat(e.target.value) || 0)}
          style={{ width:90, padding:'6px 10px', fontSize:13, fontWeight:600, color:'#617ECA',
            border:'1px solid #c9d2ee', borderRadius:8, background:'#eef1fa', textAlign:'center', outline:'none' }}
        />
      )}
    </div>
  )

  const Section = ({ title, color='#617ECA', children }) => (
    <div className="card section-gap">
      <div className="card-header">
        <div className="section-dot" style={{ background: color }} />
        <span className="card-title">{title}</span>
      </div>
      <div className="card-body">{children}</div>
    </div>
  )

  return (
    <div>
      <Section title="Tendencia de ventas" color="#617ECA">
        <Row k="caida_max" label="Caída máxima tolerable entre ejercicios (%)" note="Ej: 10 = acepta hasta −10% interanual" />
        <Row k="tend_pct" label="Meses en alza mínimos post-balance (%)" note="Ej: 60 = al menos 60% de los meses deben crecer" />
      </Section>
      <Section title="Estructura de deuda (en meses)" color="#D97706">
        <Row k="deuda_meses" label="Deuda financiera ≤ X meses de ventas actuales" note="Referencia: 4 meses es estándar bancario PyME" step={0.5} />
        <Row k="deuda_ebitda_m" label="Deuda financiera ≤ X meses de EBITDA mensual" note="Equivale a Deuda/EBITDA anual ≤ 0.33x" step={0.5} />
        <Row k="var_deuda_max" label="Variación máx. de deuda post-balance (%)" note="Se evalúa sólo si cargás deuda post-balance. Ej: 20 = la deuda no debe crecer más de +20% vs balance" step={1} />
      </Section>
      <Section title="Recomendación de crédito" color="#059669">
        <Row k="score_min_credito" label="Score mínimo para activar recomendación" note="Si el score supera este umbral, se calcula el préstamo sugerido automáticamente" step={1} />
        <Row k="dias_cp_sug" label="Días de ventas sugeridos (corto plazo)" note="Monto CP = ventas diarias post-balance × este valor. CP y LP son opciones alternativas." step={1} />
        <Row k="dias_lp_sug" label="Días de ventas sugeridos (largo plazo)" note="Monto LP = ventas diarias post-balance × este valor" step={1} />
        <Row k="cobertura_max_ebitda" label="Cap de solvencia: meses de EBITDA máx." note="Ningún préstamo sugerido debe superar X meses de EBITDA. Default: 12 = la empresa podría repagarlo con 1 año de EBITDA" step={1} />
      </Section>
      <Section title="Solvencia y liquidez" color="#059669">
        <Row k="ct_positivo" label="Capital de trabajo positivo" type="bool" note="Activo Corriente debe superar Pasivo Corriente" />
        <Row k="liquidez" label="Liquidez corriente mínima (veces)" step={0.1} />
        <Row k="endeud" label="Endeudamiento máximo Pasivo/PN (veces)" step={0.1} />
        <Row k="pn_min" label="Patrimonio neto mínimo ($K)" step={500} />
      </Section>
      <Section title="Rentabilidad" color="#7C3AED">
        <Row k="ebitda_pos" label="EBITDA positivo requerido" type="bool" />
        <Row k="ebitda_pct" label="Margen EBITDA mínimo (%)" step={0.5} />
      </Section>
      <Section title="Perfil de empresa" color="#64748B">
        <Row k="antiguedad" label="Antigüedad mínima (años)" />
        <Row k="max_fin" label="Financiamiento máximo aceptado ($K)" step={1000} />
      </Section>
      <div style={{ marginTop:20 }}>
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? <span className="spinner" /> : '💾'} Guardar criterios
        </button>
      </div>
    </div>
  )
}

// ── PIPELINE ───────────────────────────────────────────────────────────────
// Determina si una entry del pipeline es apta para crédito (score sobre umbral + tiene prestamo + tiene ventas post)
const esApta = e => e.prestamo && e.elig.score >= (e.prestamo.umbral ?? 70) && e.r.ventas_mens > 0

function PanelPipeline({ pipeline, onDelete, onClear, onExport }) {
  const [sortKey, setSortKey]   = useState('score')
  const [sortDir, setSortDir]   = useState('desc')
  const [soloAptas, setSoloAptas] = useState(false)

  const aptas = pipeline.filter(esApta)
  const sumCP = aptas.reduce((s, e) => s + (e.prestamo?.cp || 0), 0)
  const sumLP = aptas.reduce((s, e) => s + (e.prestamo?.lp || 0), 0)

  const totales = {
    aprobadas: pipeline.filter(e => e.elig.status === 'approved').length,
    observ:    pipeline.filter(e => e.elig.status === 'warning').length,
    rechaz:    pipeline.filter(e => e.elig.status === 'rejected').length,
    aptas:     aptas.length,
  }

  const filtradas = soloAptas ? aptas : pipeline
  const sortVal = (e, k) => {
    switch (k) {
      case 'razon':   return (e.form.razon || '').toLowerCase()
      case 'ventas':  return e.form.ventas || 0
      case 'score':   return e.elig.score || 0
      case 'credito': return esApta(e) ? (e.prestamo.lp || 0) : -1
      case 'estado':  return ({ approved:3, warning:2, rejected:1 }[e.elig.status] || 0)
      default: return 0
    }
  }
  const ordenadas = [...filtradas].sort((a,b) => {
    const va = sortVal(a, sortKey), vb = sortVal(b, sortKey)
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const toggleSort = k => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'razon' ? 'asc' : 'desc') }
  }
  const arrow = k => sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''
  const thSort = k => ({
    style: { cursor:'pointer', userSelect:'none' },
    onClick: () => toggleSort(k),
    title: 'Clickeá para ordenar',
    'data-sortable': 'true',
  })

  return (
    <div>
      {/* Contadores principales */}
      <div className="metrics-grid" style={{ gridTemplateColumns:'repeat(5,1fr)', marginTop:0 }}>
        {[
          ['Total empresas', pipeline.length, 'neutral'],
          ['Elegibles', totales.aprobadas, 'good'],
          ['Con observaciones', totales.observ, 'warn'],
          ['Rechazadas', totales.rechaz, 'bad'],
          ['Aptas para crédito', totales.aptas, totales.aptas > 0 ? 'good' : 'neutral'],
        ].map(([l,v,c]) => (
          <div key={l} className="metric-card">
            <div className="metric-label">{l}</div>
            <div className={`metric-value ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* Banner: Cartera crediticia potencial */}
      {totales.aptas > 0 && (
        <div style={{
          marginTop: 14, padding: '16px 20px',
          background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
          border: '1px solid #C7D2FE', borderRadius: 12,
          boxShadow: '0 2px 8px rgba(99,102,241,.08)',
          display:'flex', alignItems:'center', gap:20, flexWrap:'wrap'
        }}>
          <div style={{ fontSize:28 }}>💼</div>
          <div style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:11, color:'#4338CA', textTransform:'uppercase', letterSpacing:'.06em', fontWeight:600, marginBottom:3 }}>Cartera crediticia potencial</div>
            <div style={{ fontSize:11, color:'#64748B' }}>{totales.aptas} {totales.aptas === 1 ? 'empresa apta' : 'empresas aptas'} · suma de préstamos sugeridos si cada una optara por la misma modalidad</div>
          </div>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ padding:'10px 16px', background:'#fff', borderRadius:8, border:'1px solid #C7D2FE', minWidth:140 }}>
              <div style={{ fontSize:11, color:'#4338CA', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Si todas toman CP</div>
              <div style={{ fontSize:22, fontWeight:600, color:'#312E81', marginTop:3 }}>{fmtK(sumCP)}</div>
            </div>
            <div style={{ padding:'10px 16px', background:'#4F46E5', borderRadius:8, minWidth:140 }}>
              <div style={{ fontSize:11, color:'#C7D2FE', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>Si todas toman LP</div>
              <div style={{ fontSize:22, fontWeight:600, color:'#fff', marginTop:3 }}>{fmtK(sumLP)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Acciones + filtro */}
      <div style={{ display:'flex', gap:10, margin:'16px 0', alignItems:'center' }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--ink-2)', fontWeight:500 }}>
          <input
            type="checkbox"
            checked={soloAptas}
            onChange={e => setSoloAptas(e.target.checked)}
            style={{ width:16, height:16, cursor:'pointer', accentColor:'#4F46E5' }}
          />
          <span>Ver sólo aptas para crédito</span>
          {soloAptas && <span style={{ fontSize:11, color:'#64748B' }}>({aptas.length} de {pipeline.length})</span>}
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
          <button className="btn btn-ghost" onClick={onExport} disabled={!pipeline.length}>📥 Exportar CSV</button>
          <button className="btn btn-danger" onClick={onClear} disabled={!pipeline.length}>🗑 Limpiar pipeline</button>
        </div>
      </div>

      {/* Tabla */}
      {pipeline.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📋</div>
          <div className="empty-text">Aún no hay empresas en el pipeline.<br/>Analizá una empresa y agregala desde el formulario.</div>
        </div>
      ) : ordenadas.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">🔍</div>
          <div className="empty-text">Ninguna empresa apta para crédito con los criterios actuales.<br/>Destildá el filtro para ver todas.</div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX:'auto' }}>
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th {...thSort('razon')}>Empresa{arrow('razon')}</th>
                  <th>Sector</th>
                  <th {...thSort('ventas')}>Ventas{arrow('ventas')}</th>
                  <th>EBITDA</th>
                  <th>D/Ventas</th>
                  <th>D/EBITDA</th>
                  <th>CT</th>
                  <th {...thSort('score')}>Score{arrow('score')}</th>
                  <th {...thSort('credito')}>Crédito sugerido{arrow('credito')}</th>
                  <th {...thSort('estado')}>Estado{arrow('estado')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map(e => {
                  const p = e.prestamo
                  const apto = esApta(e)
                  return (
                    <tr key={e.id}>
                      <td>
                        <div style={{ fontWeight:500, color:'#0F172A' }}>{e.form.razon}</div>
                        <div style={{ fontSize:11, color:'#94A3B8' }}>{e.form.cuit}</div>
                      </td>
                      <td style={{ color:'#64748B' }}>{e.form.sector || '—'}</td>
                      <td>{fmtK(e.form.ventas)}</td>
                      <td>{fmtK(e.r.ebitda)}<span style={{fontSize:11,color:'#94A3B8'}}> {e.r.margen_ebitda.toFixed(1)}%</span></td>
                      <td style={{ color: e.r.deuda_meses_ventas <= 4 ? '#059669' : '#DC2626', fontWeight:500 }}>{e.r.deuda_meses_ventas.toFixed(1)}m</td>
                      <td style={{ color: e.r.ebitda_mens > 0 && e.r.deuda_meses_ebitda <= 4 ? '#059669' : '#DC2626', fontWeight:500 }}>
                        {e.r.ebitda_mens > 0 ? e.r.deuda_meses_ebitda.toFixed(1)+'m' : 'n/a'}
                      </td>
                      <td style={{ color: e.r.capital_trabajo > 0 ? '#059669' : '#DC2626', fontWeight:500 }}>{fmtK(e.r.capital_trabajo)}</td>
                      <td style={{ fontWeight:600, fontFamily:"'DM Serif Display',serif", fontSize:16 }}>{e.elig.score}</td>
                      <td style={{ fontSize:12 }}>
                        {apto ? (
                          <>
                            <div style={{ color:'#065F46', fontWeight:500 }}>CP {fmtK(p.cp)}</div>
                            <div style={{ color:'#065F46', fontWeight:500 }}>LP {fmtK(p.lp)}</div>
                          </>
                        ) : <span style={{ color:'#CBD5E1' }}>—</span>}
                      </td>
                      <td>
                        <span className={`status-badge ${e.elig.status}`}>
                          {STATUS_ICONS[e.elig.status]} {e.elig.status === 'approved' ? 'Elegible' : e.elig.status === 'warning' ? 'Con obs.' : 'No elegible'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost" style={{ padding:'4px 10px', fontSize:11 }} onClick={() => onDelete(e.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── APP PRINCIPAL ──────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('form')
  const [form, setForm] = useState(FORM_EMPTY)
  const [resultado, setResultado] = useState(null)
  const [pipeline, setPipeline] = useState([])
  const [criterios, setCriterios] = useState(CRITERIOS_DEFAULT)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [savingCrit, setSavingCrit] = useState(false)

  const showToast = msg => setToast(msg)

  // Cargar pipeline y criterios al inicio
  useEffect(() => {
    fetch('/api/pipeline').then(r => r.json()).then(d => { if (d.data) setPipeline(d.data) })
    fetch('/api/pipeline?type=criterios').then(r => r.json()).then(d => { if (d.data) setCriterios(d.data) })
  }, [])

  const analizar = () => {
    if (!form.razon || !form.ventas) { showToast('Completá al menos la Razón Social y las Ventas.'); return }
    // IDs de meses (todos los posibles) + resto de campos numéricos
    const monthIds = Array.from({ length: 24 }, (_, i) => `m${i+1}`)
    const numKeys = ['antiguedad','fin_sol','ventas_ant','ebitda_ant','deuda_ant','ventas','cmv','gastos_op','amort','res_fin','imp','act_co','act_nco','caja','pas_co','pas_nco','pn','dcp','dlp','deuda_post', ...monthIds]
    const formNum = { ...form }
    numKeys.forEach(k => { formNum[k] = toNum(form[k]) })
    // Si hay fecha de cierre, tomamos solo los meses que correspondan; si no, los 12 clásicos.
    const monthsForCalc = computePostBalanceMonths(form.cierre_ejercicio, form.incluir_mes_actual) ?? FALLBACK_MONTHS
    const meses_post = monthsForCalc.map(m => formNum[m.id] || 0)
    const r = calcularRatios({ ...formNum, meses_post, deuda_post: formNum.deuda_post })
    // Préstamo sugerido: días de ventas promedio post-balance (/30 para ventas diarias) — CP y LP son opciones alternativas.
    // Se calcula ANTES de evalElegibilidad para poder comparar el financiamiento solicitado con el monto sugerido.
    const diarias = r.ventas_mens / 30
    const raw_cp = diarias * criterios.dias_cp_sug
    const raw_lp = diarias * criterios.dias_lp_sug
    const cap = r.ebitda_mens > 0 ? r.ebitda_mens * criterios.cobertura_max_ebitda : Infinity
    const cp = Math.min(raw_cp, cap)
    const lp = Math.min(raw_lp, cap)
    const sugerido_max = Math.max(cp, lp)
    const comparacion_fin = formNum.fin_sol > 0 && sugerido_max > 0
      ? { pidio: formNum.fin_sol, sugerido_max, ratio: formNum.fin_sol / sugerido_max, excede: formNum.fin_sol > sugerido_max }
      : null
    const prestamo = {
      cp, lp, cp_raw: raw_cp, lp_raw: raw_lp,
      sugerido_max,
      cp_capeado: raw_cp > cap && r.ebitda_mens > 0,
      lp_capeado: raw_lp > cap && r.ebitda_mens > 0,
      cap_activo: r.ebitda_mens > 0,
      dias_cp: criterios.dias_cp_sug, dias_lp: criterios.dias_lp_sug,
      umbral: criterios.score_min_credito,
      cobertura_max_ebitda: criterios.cobertura_max_ebitda,
      comparacion: comparacion_fin,
    }
    const elig = evalElegibilidad(r, formNum.antiguedad, formNum.fin_sol, criterios, prestamo)
    setResultado({ r, elig, prestamo, form: { ...formNum, razon: form.razon, cuit: form.cuit, sector: form.sector, destino: form.destino, cierre_ejercicio: form.cierre_ejercicio, incluir_mes_actual: form.incluir_mes_actual } })
    setTab('resultado')
  }

  const agregarPipeline = async () => {
    if (!resultado) return
    setLoading(true)
    const entry = { id: Date.now() + '-' + resultado.form.razon, ...resultado }
    await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', payload: entry })
    })
    setPipeline(p => {
      const idx = p.findIndex(e => e.form.razon === entry.form.razon)
      if (idx >= 0) { const n = [...p]; n[idx] = entry; return n }
      return [entry, ...p]
    })
    setLoading(false)
    showToast(`"${resultado.form.razon}" agregada al pipeline ✓`)
    setTab('pipeline')
  }

  // Exporta el PanelResultado como PDF multipágina con header (logo + razón social + fecha)
  const generarPDF = async () => {
    if (typeof window === 'undefined' || !resultado) return
    setPdfLoading(true)
    const node = document.getElementById('pdf-root')
    if (!node) { setPdfLoading(false); showToast('No se encontró el panel para exportar'); return }
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      node.classList.add('pdf-capturing')
      // Pequeña espera para que el navegador aplique los estilos de captura (header visible, spacing)
      await new Promise(res => setTimeout(res, 60))
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        windowWidth: node.scrollWidth,
      })
      node.classList.remove('pdf-capturing')

      const pdf = new jsPDF('p', 'pt', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const ratio = pageW / canvas.width
      const imgH = canvas.height * ratio

      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, imgH)
      } else {
        // Cortar en páginas buscando filas blancas para NO partir elementos a la mitad.
        const pxPorPagina = Math.floor(pageH / ratio)
        const ctxFull = canvas.getContext('2d')

        // Devuelve el y más cercano <= targetY donde hay una fila "casi blanca" (espacio entre bloques).
        // Retrocede hasta lookback píxeles. Si no encuentra, devuelve targetY (fallback al corte duro).
        const findCut = (targetY, lookback = 260) => {
          const from = Math.max(0, targetY - lookback)
          for (let y = targetY; y >= from; y--) {
            const row = ctxFull.getImageData(0, y, canvas.width, 1).data
            let white = true
            // Contamos píxeles "no blancos"; toleramos un 1% de ruido para evitar bordes anti-alias.
            let dirty = 0
            const maxDirty = Math.max(4, Math.floor(canvas.width * 0.01))
            for (let i = 0; i < row.length; i += 4) {
              const r = row[i], g = row[i+1], b = row[i+2]
              if (r < 240 || g < 240 || b < 240) {
                dirty++
                if (dirty > maxDirty) { white = false; break }
              }
            }
            if (white) return y
          }
          return targetY
        }

        let yOffset = 0
        let firstPage = true
        while (yOffset < canvas.height) {
          let sliceH
          const remaining = canvas.height - yOffset
          if (remaining <= pxPorPagina) {
            sliceH = remaining // última página
          } else {
            const hardCut = yOffset + pxPorPagina
            const softCut = findCut(hardCut)
            sliceH = Math.max(softCut - yOffset, Math.floor(pxPorPagina * 0.6)) // al menos 60% de página para no desperdiciar
          }
          const slice = document.createElement('canvas')
          slice.width = canvas.width
          slice.height = sliceH
          const ctx = slice.getContext('2d')
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, slice.width, slice.height)
          ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
          if (!firstPage) pdf.addPage()
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, pageW, sliceH * ratio)
          yOffset += sliceH
          firstPage = false
        }
      }

      const fecha = new Date().toISOString().slice(0, 10)
      const safe = (resultado.form.razon || 'informe').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')
      pdf.save(`Informe-Fixus-${safe}-${fecha}.pdf`)
      showToast('PDF generado correctamente ✓')
    } catch (err) {
      console.error('Error generando PDF:', err)
      showToast('No se pudo generar el PDF. Revisá la consola.')
      node.classList.remove('pdf-capturing')
    } finally {
      setPdfLoading(false)
    }
  }

  const eliminarEmpresa = async (id) => {
    await fetch('/api/pipeline', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'delete', payload:{ id } }) })
    setPipeline(p => p.filter(e => e.id !== id))
  }

  const limpiarPipeline = async () => {
    if (!confirm('¿Limpiar todo el pipeline? Esta acción no se puede deshacer.')) return
    await fetch('/api/pipeline', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'clear' }) })
    setPipeline([])
    showToast('Pipeline limpiado.')
  }

  const guardarCriterios = async () => {
    setSavingCrit(true)
    await fetch('/api/pipeline', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'save_criterios', payload: criterios }) })
    setSavingCrit(false)
    showToast('Criterios guardados correctamente ✓')
  }

  const exportarCSV = () => {
    const headers = ['Empresa','CUIT','Sector','Antigüedad','Ventas','EBITDA','Mg.EBITDA%','Liquidez','Endeudamiento','CT','D/Ventas(m)','D/EBITDA(m)','Score','Estado','Pidió($K)','Sug.CP($K)','Sug.LP($K)','Recomendable']
    const rows = pipeline.map(e => {
      const p = e.prestamo
      const apto = p && e.elig.score >= (p.umbral ?? 70) && e.r.ventas_mens > 0
      return [
        e.form.razon, e.form.cuit, e.form.sector, e.form.antiguedad,
        e.form.ventas, e.r.ebitda, e.r.margen_ebitda.toFixed(1),
        e.r.liquidez.toFixed(2), e.r.endeudamiento.toFixed(2),
        e.r.capital_trabajo, e.r.deuda_meses_ventas.toFixed(2),
        e.r.ebitda_mens > 0 ? e.r.deuda_meses_ebitda.toFixed(2) : 'n/a',
        e.elig.score, e.elig.status,
        e.form.fin_sol || 0,
        apto ? Math.round(p.cp) : '',
        apto ? Math.round(p.lp) : '',
        apto ? 'sí' : 'no'
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }))
    a.download = `fixus_pipeline_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const cargarEjemplo = () => setForm({
    ...FORM_EMPTY,
    razon:'Metalúrgica del Sur S.A.', cuit:'30-71234567-9', sector:'Manufactura metalmecánica', destino:'Capital de trabajo y maquinaria',
    antiguedad:12, fin_sol:10000,
    cierre_ejercicio:'2025-03', incluir_mes_actual:false, // Abr 2025 → Mar 2026 = 12 meses completos
    ventas_ant:78000, ebitda_ant:10200, deuda_ant:18000,
    ventas:85000, cmv:52000, gastos_op:12000, amort:3500, res_fin:-4200, imp:4500,
    act_co:32000, act_nco:28000, caja:5500, pas_co:18000, pas_nco:15000, pn:27000,
    dcp:8000, dlp:12000,
    deuda_post:22500, // crece ~12% vs balance, escenario realista
    m1:7200, m2:7500, m3:7900, m4:8100, m5:8400, m6:8800,
    m7:9100, m8:9300, m9:9600, m10:9800, m11:10100, m12:10400,
  })

  const NAV = [
    { id:'form',      label:'Nueva empresa',    icon:'＋' },
    { id:'resultado', label:'Resultado análisis', icon:'◎' },
    { id:'criterios', label:'Criterios',          icon:'⚙' },
    { id:'pipeline',  label:'Pipeline',           icon:'◈', badge: pipeline.length },
  ]

  return (
    <>
      <Head>
        <title>Fixus — Consultora para PyMEs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='16' fill='%23162937'/><rect x='62' y='20' width='18' height='18' fill='%23617ECA'/><text x='50' y='72' text-anchor='middle' font-family='DM Sans,sans-serif' font-size='52' font-weight='700' fill='%23ffffff'>F</text></svg>" />
      </Head>

      <div className="app-shell">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <img src="/logo.svg" alt="Fixus — Consultora para PyMEs" className="logo-img" />
          </div>
          <nav className="sidebar-nav">
            {NAV.map(n => (
              <button key={n.id} className={`nav-item ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
                <span className="nav-icon">{n.icon}</span>
                {n.label}
                {n.badge > 0 && <span className="pipeline-count">{n.badge}</span>}
              </button>
            ))}
          </nav>
          <div style={{ padding:'16px 24px', borderTop:'1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.25)', textTransform:'uppercase', letterSpacing:'.08em' }}>v1.0 · Fixus 2025</div>
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          {/* FORMULARIO */}
          {tab === 'form' && (
            <>
              <div className="page-header">
                <div className="page-title">Nueva empresa</div>
                <div className="page-sub">Completá los datos del balance para analizar elegibilidad crediticia</div>
              </div>

              <div className="card">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Identificación</span></div>
                <div className="card-body">
                  <div className="form-grid">
                    <Campo label="Razón Social" id="razon" form={form} setForm={setForm} type="text" placeholder="Ej: Metalúrgica del Sur S.A." />
                    <Campo label="CUIT" id="cuit" form={form} setForm={setForm} type="text" placeholder="30-12345678-9" />
                    <Campo label="Sector / Actividad" id="sector" form={form} setForm={setForm} type="text" placeholder="Ej: Manufactura metalmecánica" />
                    <Campo label="Antigüedad (años)" id="antiguedad" form={form} setForm={setForm} />
                    <Campo label="Destino del financiamiento" id="destino" form={form} setForm={setForm} type="text" placeholder="Capital de trabajo, maquinaria..." span={1} />
                    <Campo label="Financiamiento solicitado ($K)" id="fin_sol" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap card--teal">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Ejercicio anterior (datos comparativos — $K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Ventas netas ej. anterior" id="ventas_ant" form={form} setForm={setForm} />
                    <Campo label="EBITDA ej. anterior" id="ebitda_ant" form={form} setForm={setForm} />
                    <Campo label="Deuda financiera ej. anterior" id="deuda_ant" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap card--indigo">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Último ejercicio — estado de resultados ($K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Ventas netas" id="ventas" form={form} setForm={setForm} />
                    <Campo label="CMV / Costo de ventas" id="cmv" form={form} setForm={setForm} />
                    <Campo label="Gastos operativos" id="gastos_op" form={form} setForm={setForm} />
                    <Campo label="Amortizaciones / Dep." id="amort" form={form} setForm={setForm} />
                    <Campo label="Resultado financiero" id="res_fin" form={form} setForm={setForm} />
                    <Campo label="Impuesto a las ganancias" id="imp" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap card--green">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Último ejercicio — balance general ($K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Activo corriente" id="act_co" form={form} setForm={setForm} />
                    <Campo label="Activo no corriente" id="act_nco" form={form} setForm={setForm} />
                    <Campo label="Disponibilidades / Caja" id="caja" form={form} setForm={setForm} />
                    <Campo label="Pasivo corriente" id="pas_co" form={form} setForm={setForm} />
                    <Campo label="Pasivo no corriente" id="pas_nco" form={form} setForm={setForm} />
                    <Campo label="Patrimonio neto" id="pn" form={form} setForm={setForm} />
                    <Campo label="Deuda bancaria corto plazo" id="dcp" form={form} setForm={setForm} />
                    <Campo label="Deuda bancaria largo plazo" id="dlp" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap card--amber">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Ventas mensuales post-balance ($K)</span></div>
                <div className="card-body">
                  <div className="form-grid" style={{ marginBottom: 14 }}>
                    <div className="field">
                      <label htmlFor="cierre_ejercicio">Fecha de cierre de ejercicio</label>
                      <input
                        id="cierre_ejercicio"
                        type="month"
                        value={form.cierre_ejercicio || ''}
                        onChange={e => setForm(f => ({ ...f, cierre_ejercicio: e.target.value }))}
                      />
                    </div>
                    <div className="field" style={{ justifyContent:'flex-end' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight:500, color:'var(--ink-2)' }}>
                        <input
                          type="checkbox"
                          checked={!!form.incluir_mes_actual}
                          onChange={e => setForm(f => ({ ...f, incluir_mes_actual: e.target.checked }))}
                          style={{ width:16, height:16, cursor:'pointer' }}
                        />
                        <span>Incluir mes actual (parcial)</span>
                      </label>
                    </div>
                  </div>

                  {(() => {
                    const pm = computePostBalanceMonths(form.cierre_ejercicio, form.incluir_mes_actual)
                    const visibleMonths = pm === null ? FALLBACK_MONTHS : pm
                    const lastLabel = visibleMonths.length > 0 ? visibleMonths[visibleMonths.length - 1].label : 'último mes'

                    if (pm && pm.length === 0) {
                      return (
                        <div style={{ fontSize:13, color:'#92400E', padding:'10px 14px', background:'#FEF3C7', borderRadius:8, borderLeft:'3px solid var(--amber)' }}>
                          La fecha de cierre es muy reciente o futura. No hay meses post-balance para completar todavía.
                        </div>
                      )
                    }

                    return (
                      <>
                        {pm === null ? (
                          <div style={{ fontSize:13, color:'var(--ink-3)', marginBottom:10, padding:'8px 12px', background:'#F1F5F9', borderRadius:8, borderLeft:'3px solid var(--accent)' }}>
                            Cargá la fecha de cierre arriba para generar los meses automáticamente. Mientras tanto, mostrando 12 meses genéricos.
                          </div>
                        ) : (
                          <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:10 }}>
                            {pm.length} {pm.length === 1 ? 'mes' : 'meses'} desde el cierre · <strong>{pm[0].label}</strong> → <strong>{pm[pm.length-1].label}</strong>
                          </div>
                        )}
                        <div className="form-grid-6">
                          {visibleMonths.map(m => (
                            <Campo key={m.id} label={m.label} id={m.id} form={form} setForm={setForm} />
                          ))}
                        </div>

                        {/* Deuda al último mes post-balance */}
                        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px dashed var(--gray-200)' }}>
                          <div style={{ fontSize:12, color:'var(--ink-3)', marginBottom:8 }}>
                            Para ver la relación deuda/ventas actualizada al cierre del último mes cargado:
                          </div>
                          <div className="form-grid-3">
                            <Campo label={`Deuda total al ${lastLabel} ($K)`} id="deuda_post" form={form} setForm={setForm} placeholder="Ej: 19000" />
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>

              <div style={{ display:'flex', gap:12, marginTop:24 }}>
                <button className="btn btn-primary" onClick={analizar}>▶ Analizar empresa</button>
                <button className="btn btn-ghost" onClick={cargarEjemplo}>Cargar ejemplo demo</button>
                <button className="btn btn-ghost-danger" onClick={() => setForm(FORM_EMPTY)}>↺ Limpiar</button>
              </div>
            </>
          )}

          {/* RESULTADO */}
          {tab === 'resultado' && (
            <>
              <div className="page-header">
                <div className="page-title">{resultado ? resultado.form.razon : 'Sin análisis'}</div>
                <div className="page-sub">{resultado ? `${resultado.form.sector} · CUIT ${resultado.form.cuit}` : 'Analizá una empresa primero'}</div>
              </div>
              {resultado
                ? <PanelResultado resultado={resultado} onAgregar={agregarPipeline} onPDF={generarPDF} loading={loading} pdfLoading={pdfLoading} />
                : (
                  <div className="empty-state card">
                    <div className="empty-icon">◎</div>
                    <div className="empty-text">Aún no analizaste ninguna empresa.<br/>
                      <button className="btn btn-primary" style={{marginTop:16}} onClick={() => setTab('form')}>Ir al formulario</button>
                    </div>
                  </div>
                )
              }
            </>
          )}

          {/* CRITERIOS */}
          {tab === 'criterios' && (
            <>
              <div className="page-header">
                <div className="page-title">Criterios de elegibilidad</div>
                <div className="page-sub">Configurá los umbrales que deben cumplir las empresas para avanzar</div>
              </div>
              <PanelCriterios criterios={criterios} setCriterios={setCriterios} onSave={guardarCriterios} saving={savingCrit} />
            </>
          )}

          {/* PIPELINE */}
          {tab === 'pipeline' && (
            <>
              <div className="page-header">
                <div className="page-title">Pipeline</div>
                <div className="page-sub">{pipeline.length} empresa{pipeline.length !== 1 ? 's' : ''} analizadas · guardado automáticamente</div>
              </div>
              <PanelPipeline pipeline={pipeline} onDelete={eliminarEmpresa} onClear={limpiarPipeline} onExport={exportarCSV} />
            </>
          )}
        </main>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </>
  )
}
