import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Head from 'next/head'
import { calcularRatios, evalElegibilidad, CRITERIOS_DEFAULT } from '../lib/financial'
import { PERFIL_EMPTY, PERFIL_SECCIONES, buildResena, normalizeRazon, normalizePerfil } from '../lib/perfil'

// ── helpers ────────────────────────────────────────────────────────────────
const fmt = (n, dec = 0) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtK = n => '$' + fmt(Math.round(n)) + 'K'

function fmtCuit(val) {
  const d = (val || '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0,2)}-${d.slice(2,10)}-${d.slice(10)}`
  return val
}

function fmtMoneda(val) {
  const n = parseInt((val || '').replace(/\D/g, ''), 10)
  if (isNaN(n)) return val
  return n.toLocaleString('es-AR')
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [])
  return <div className="toast">{msg}</div>
}

// ── FORMULARIO ─────────────────────────────────────────────────────────────
const FORM_EMPTY = {
  razon:'', cuit:'', sector:'', destino:'',
  antiguedad:'', fin_sol:'',
  cierre_ejercicio:'', incluir_mes_actual:false,
  ventas_ant:'',
  ventas:'', ebitda_ej:'',
  act_co:'', act_nco:'', pas_co:'', pas_nco:'', pn:'',
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

// ── CALCULADORA EBITDA EJERCICIO ACTUAL ────────────────────────────────────
function EbitdaEjercicioCalc({ form, setForm }) {
  const [expanded, setExpanded] = useState(false)
  const [rb, setRb] = useState(0)
  const [adm, setAdm] = useState(0)
  const [com, setCom] = useState(0)
  const [amort, setAmort] = useState(0)

  const ebitdaCalc = rb - adm - com + amort

  useEffect(() => {
    if (expanded) setForm(f => ({ ...f, ebitda_ej: ebitdaCalc }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rb, adm, com, amort, expanded])

  const toggle = () => {
    if (!expanded) { setRb(0); setAdm(0); setCom(0); setAmort(0) }
    setExpanded(e => !e)
  }

  const val = form.ebitda_ej
  const isPos = ebitdaCalc >= 0

  return (
    <div className="field" style={{ gridColumn: expanded ? 'span 2' : 'span 1' }}>
      <label>EBITDA ($K)</label>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <input
          type="text"
          inputMode="numeric"
          value={expanded ? ebitdaCalc.toLocaleString('es-AR') : (val === '' || val === undefined ? '' : Number(val).toLocaleString('es-AR'))}
          disabled={expanded}
          style={{ flex:1, opacity: expanded ? 0.65 : 1 }}
          onChange={e => {
            const cleaned = e.target.value.replace(/[^\d-]/g, '')
            const isNeg = cleaned.startsWith('-')
            const n = parseInt(cleaned.replace(/-/g,''), 10)
            setForm(f => ({ ...f, ebitda_ej: isNaN(n) ? '' : (isNeg ? -n : n) }))
          }}
        />
        <button
          type="button"
          onClick={toggle}
          style={{
            padding:'7px 12px', fontSize:12, fontWeight:600, cursor:'pointer',
            background: expanded ? '#FEE2E2' : '#EEF1FA',
            color: expanded ? '#DC2626' : '#617ECA',
            border: `1px solid ${expanded ? '#FECACA' : '#C9D2EE'}`,
            borderRadius:8, whiteSpace:'nowrap', transition:'all .15s'
          }}
        >
          {expanded ? '✕ Cerrar' : '🧮 Calcular'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop:12, padding:16, background:'#F8FAFC', borderRadius:10, border:'1px solid #E2E8F0' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#617ECA', marginBottom:10, textTransform:'uppercase', letterSpacing:'.06em' }}>
            Resultado bruto − Gs. Adm. − Gs. Comerc. + Amortizaciones
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {[
              ['Resultado bruto', rb, setRb],
              ['Gastos de adm.', adm, setAdm],
              ['Gastos de comerc.', com, setCom],
              ['Amortizaciones', amort, setAmort],
            ].map(([lbl, v, setter]) => (
              <div className="field" key={lbl} style={{ margin:0 }}>
                <label style={{ fontSize:11 }}>{lbl}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={v ? v.toLocaleString('es-AR') : ''}
                  placeholder="0"
                  onChange={e => {
                    const n = parseInt(e.target.value.replace(/[^\d]/g, ''), 10)
                    setter(isNaN(n) ? 0 : n)
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop:12, padding:'10px 14px', background: isPos ? '#F0FDF4' : '#FEF2F2', borderRadius:8, border:`1px solid ${isPos ? '#BBF7D0' : '#FECACA'}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:13, color:'#334155', fontWeight:500 }}>EBITDA calculado:</span>
            <span style={{ fontSize:20, fontWeight:700, fontFamily:"'DM Serif Display',serif", color: isPos ? '#059669' : '#DC2626' }}>
              ${ebitdaCalc.toLocaleString('es-AR')}K
            </span>
          </div>
        </div>
      )}
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
  let rent = `Sobre ventas netas de ${fmtK(form.ventas)}, la empresa genera un EBITDA de ${fmtK(r.ebitda)} `
  rent += `equivalente a un margen del ${r.margen_ebitda.toFixed(1)}%, ${califMargen}. `
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
  solv += `resultando en una relación Pasivo/PN de ${r.endeudamiento.toFixed(2)}x — ${endCalif}.`
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

// ── Usuarios ───────────────────────────────────────────────────────────────
// Cambiar los PINs antes de deployar
const USUARIOS = [
  { id: 'facundo',  nombre: 'Facundo Vallina',      pin: '1234', iniciales: 'FV' },
  { id: 'leonardo', nombre: 'Leonardo Evangelista', pin: '5678', iniciales: 'LE' },
]

function LoginScreen({ onLogin }) {
  const [selId, setSelId]   = useState(null)
  const [pin, setPin]       = useState('')
  const [error, setError]   = useState('')

  const intentar = () => {
    const user = USUARIOS.find(u => u.id === selId)
    if (!user) return
    if (pin === user.pin) { onLogin(user) }
    else { setError('PIN incorrecto'); setPin('') }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background: 'radial-gradient(ellipse at 15% 0%, rgba(74,105,204,.12) 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(14,44,80,.10) 0%, transparent 55%), linear-gradient(180deg, #d8e0ef 0%, #c8d2e6 100%)',
    }}>
      <div style={{ width:'100%', maxWidth:420, padding:'0 20px' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/logo_dark.png" alt="Fixus" style={{ height:44, marginBottom:16 }} />
          <div style={{ fontSize:15, color:'#4a5568', fontWeight:500 }}>Identificate para continuar</div>
        </div>
        <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 4px rgba(14,44,80,.06), 0 6px 18px rgba(14,44,80,.10), 0 20px 44px rgba(14,44,80,.13)', overflow:'hidden' }}>
          <div style={{ display:'flex' }}>
            {USUARIOS.map(u => (
              <button key={u.id} onClick={() => { setSelId(u.id); setPin(''); setError('') }} style={{
                flex:1, padding:'20px 16px', border:'none', cursor:'pointer',
                background: selId === u.id ? '#0e2c50' : '#f8fafc',
                borderBottom: selId === u.id ? 'none' : '1px solid #e2e8f0',
                transition:'background .15s',
              }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background: selId === u.id ? 'rgba(255,255,255,.15)' : '#eef2ff', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px', fontSize:15, fontWeight:700, color: selId === u.id ? '#fff' : '#4a69cc' }}>{u.iniciales}</div>
                <div style={{ fontSize:13, fontWeight:600, color: selId === u.id ? '#fff' : '#1a2840' }}>{u.nombre.split(' ')[0]}</div>
                <div style={{ fontSize:11, color: selId === u.id ? 'rgba(255,255,255,.6)' : '#94a3b8', marginTop:2 }}>{u.nombre.split(' ').slice(1).join(' ')}</div>
              </button>
            ))}
          </div>
          <div style={{ padding:'24px 28px' }}>
            {selId ? (
              <>
                <label style={{ fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:8 }}>PIN de acceso</label>
                <input
                  type="password"
                  value={pin}
                  onChange={e => { setPin(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && intentar()}
                  placeholder="••••"
                  autoFocus
                  style={{ width:'100%', padding:'10px 14px', fontSize:16, letterSpacing:4, border:`1px solid ${error ? '#dc2626' : '#e2e8f0'}`, borderRadius:8, outline:'none', fontFamily:'inherit', marginBottom:error ? 8 : 16, transition:'border-color .15s' }}
                />
                {error && <div style={{ fontSize:12, color:'#dc2626', marginBottom:12 }}>{error}</div>}
                <button onClick={intentar} className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'11px' }}>
                  Ingresar
                </button>
              </>
            ) : (
              <div style={{ textAlign:'center', color:'#94a3b8', fontSize:13, padding:'8px 0' }}>Seleccioná tu usuario arriba</div>
            )}
          </div>
        </div>
        <div style={{ textAlign:'center', marginTop:20, fontSize:11, color:'#94a3b8' }}>Fixus · Uso interno</div>
      </div>
    </div>
  )
}

function PanelResultado({ resultado, onAgregar, onPDF, loading, pdfLoading, usuarioActual }) {
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
          <div><strong>Analista:</strong> {usuarioActual?.nombre || '—'}</div>
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
              {prestamo.comparacion.excede ? (() => {
                const sgrs = Math.ceil(prestamo.comparacion.pidio / prestamo.comparacion.sugerido_max)
                return (
                  <span style={{ color:'#991B1B', fontWeight:500 }}>
                    supera la opción mayor sugerida ({fmtK(prestamo.comparacion.sugerido_max)}) en {((prestamo.comparacion.ratio - 1) * 100).toFixed(0)}%.{' '}
                    {sgrs <= 6
                      ? <>Para llegar a ese monto, la empresa debería calificar con <strong>{sgrs} SGRs</strong> bajo el mismo criterio.</>
                      : <>Excede la capacidad de financiamiento — requeriría más de 6 SGRs.</>
                    }
                  </span>
                )
              })() : (
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
              ['EBITDA', fmtK(r.ebitda) + ' (' + r.margen_ebitda.toFixed(1) + '%)'],
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
        <button className="btn btn-primary" onClick={() => onPDF('digital')} disabled={loading || pdfLoading} title="PDF continuo de una sola página, ideal para leer en pantalla">
          {pdfLoading ? <span className="spinner" /> : '📄'} Descargar PDF
        </button>
        <button className="btn btn-ghost" onClick={() => onPDF('imprimible')} disabled={loading || pdfLoading} title="PDF paginado en A4 con cortes limpios, listo para imprimir">
          {pdfLoading ? <span className="spinner" /> : '🖨'} PDF imprimible
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

function PanelPipeline({ pipeline, onDelete, onClear, onExport, usuarioActual }) {
  const [sortKey, setSortKey]       = useState('score')
  const [sortDir, setSortDir]       = useState('desc')
  const [soloAptas, setSoloAptas]   = useState(false)
  const [filtroEjec, setFiltroEjec] = useState('todos')

  const aptas = pipeline.filter(esApta)
  const sumCP = aptas.reduce((s, e) => s + (e.prestamo?.cp || 0), 0)
  const sumLP = aptas.reduce((s, e) => s + (e.prestamo?.lp || 0), 0)

  const totales = {
    aprobadas: pipeline.filter(e => e.elig.status === 'approved').length,
    observ:    pipeline.filter(e => e.elig.status === 'warning').length,
    rechaz:    pipeline.filter(e => e.elig.status === 'rejected').length,
    aptas:     aptas.length,
  }

  const porEjec = filtroEjec === 'todos' ? pipeline : pipeline.filter(e => e.ejecutivo === filtroEjec)
  const filtradas = soloAptas ? porEjec.filter(esApta) : porEjec
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
      <div style={{ display:'flex', gap:10, margin:'16px 0', alignItems:'center', flexWrap:'wrap' }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:500 }}>
          <input
            type="checkbox"
            checked={soloAptas}
            onChange={e => setSoloAptas(e.target.checked)}
            style={{ width:16, height:16, cursor:'pointer', accentColor:'#4F46E5' }}
          />
          <span>Ver sólo aptas para crédito</span>
          {soloAptas && <span style={{ fontSize:11, color:'#64748B' }}>({aptas.filter(e => filtroEjec==='todos'||e.ejecutivo===filtroEjec).length} de {pipeline.length})</span>}
        </label>
        <div style={{ display:'flex', borderRadius:8, border:'1px solid #e2e8f0', overflow:'hidden', background:'#fff', marginLeft:8 }}>
          {['todos', ...USUARIOS.map(u => u.nombre)].map((op, i) => (
            <button key={op} onClick={() => setFiltroEjec(op)} style={{
              padding:'6px 14px', border:'none', borderLeft: i > 0 ? '1px solid #e2e8f0' : 'none',
              fontSize:12, fontWeight:600, cursor:'pointer',
              background: filtroEjec === op ? '#0e2c50' : '#fff',
              color: filtroEjec === op ? '#fff' : '#64748b',
              transition:'background .15s',
            }}>{op === 'todos' ? 'Todos' : op.split(' ')[0]}</button>
          ))}
        </div>
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
                  <th>Ejecutivo</th>
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
                      <td style={{ fontSize:11, color:'#64748b', whiteSpace:'nowrap' }}>
                        {e.ejecutivo ? e.ejecutivo.split(' ').slice(0,2).join(' ') : '—'}
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
// ── PANEL PERFIL CUALITATIVO ───────────────────────────────────────────────

const TBL_INPUT = {
  width:'100%', padding:'8px 10px', fontSize:13,
  border:'1px solid #c9d2ee', borderRadius:7, background:'#fff',
  fontFamily:'inherit', outline:'none', color:'#1a2840',
}
const TBL_TH = {
  padding:'9px 10px', textAlign:'left', background:'#eef2ff',
  borderBottom:'2px solid #c9d2ee', fontSize:12, fontWeight:700,
  color:'#4a69cc', textTransform:'uppercase', letterSpacing:'.04em',
}

function CampoAccionistas({ label, form, setForm, style }) {
  const accionistas = form.accionistas || []
  const update = (i, field, value) =>
    setForm(f => { const a = [...(f.accionistas||[])]; a[i] = {...a[i],[field]:value}; return {...f,accionistas:a} })
  const add = () =>
    setForm(f => ({ ...f, accionistas: [...(f.accionistas||[]), {nombre:'',participacion:'',cuit:'',rol:''}] }))
  const remove = (i) =>
    setForm(f => ({ ...f, accionistas: (f.accionistas||[]).filter((_,j) => j!==i) }))
  return (
    <div className="field" style={{ ...style, gridColumn:'span 2' }}>
      <label style={{ marginBottom:8, display:'block' }}>{label}</label>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr>
            {['Nombre / Razón Social','% Participación','CUIT','Rol'].map(h => <th key={h} style={TBL_TH}>{h}</th>)}
            <th style={{ ...TBL_TH, width:36 }} />
          </tr></thead>
          <tbody>
            {accionistas.map((a, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #e8edf8' }}>
                <td style={{ padding:'6px 4px' }}><input type="text" value={a.nombre} onChange={e=>update(i,'nombre',e.target.value)} placeholder="Nombre o razón social" style={TBL_INPUT} /></td>
                <td style={{ padding:'6px 4px', width:120 }}><input type="text" value={a.participacion} onChange={e=>update(i,'participacion',e.target.value)} placeholder="ej. 50%" style={TBL_INPUT} /></td>
                <td style={{ padding:'6px 4px', width:160 }}><input type="text" value={a.cuit} onChange={e=>update(i,'cuit',e.target.value)} onBlur={e=>update(i,'cuit',fmtCuit(e.target.value))} placeholder="XX-XXXXXXXX-X" style={TBL_INPUT} /></td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={a.rol} onChange={e=>update(i,'rol',e.target.value)} placeholder="Presidente, Gerente…" style={TBL_INPUT} /></td>
                <td style={{ padding:'6px 4px', textAlign:'center' }}>
                  {accionistas.length > 1 && (
                    <button onClick={()=>remove(i)} style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:18,lineHeight:1 }}>×</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn btn-ghost" onClick={add} style={{ marginTop:8, fontSize:12 }}>+ Agregar accionista</button>
    </div>
  )
}

function CampoTablaContactos({ label, fieldId, colPct, form, setForm, style }) {
  const items = form[fieldId] || []
  const update = (i, field, value) =>
    setForm(f => { const a = [...(f[fieldId]||[])]; a[i] = {...a[i],[field]:value}; return {...f,[fieldId]:a} })
  return (
    <div className="field" style={{ ...style, gridColumn:'span 2' }}>
      <label style={{ marginBottom:8, display:'block' }}>{label}</label>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr>
            <th style={{ ...TBL_TH, width:28 }}>#</th>
            <th style={TBL_TH}>Nombre / Razón Social</th>
            <th style={{ ...TBL_TH, width:165 }}>CUIT</th>
            <th style={{ ...TBL_TH, width:145 }}>{colPct}</th>
          </tr></thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ borderBottom:'1px solid #e8edf8' }}>
                <td style={{ padding:'6px 8px', textAlign:'center', color:'#94a3b8', fontWeight:700, fontSize:12 }}>{i+1}</td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={item.nombre} onChange={e=>update(i,'nombre',e.target.value)} placeholder="Nombre o razón social" style={TBL_INPUT} /></td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={item.cuit} onChange={e=>update(i,'cuit',e.target.value)} onBlur={e=>update(i,'cuit',fmtCuit(e.target.value))} placeholder="XX-XXXXXXXX-X" style={TBL_INPUT} /></td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={item.porcentaje} onChange={e=>update(i,'porcentaje',e.target.value)} placeholder="ej. 25%" style={TBL_INPUT} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function generarFormularioHTML(p) {
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const accs = Array.isArray(p.accionistas) && p.accionistas.length ? p.accionistas : [{nombre:'',participacion:'',cuit:'',rol:''},{nombre:'',participacion:'',cuit:'',rol:''}]
  const clis = Array.isArray(p.clientes_tabla) && p.clientes_tabla.length===4 ? p.clientes_tabla : Array(4).fill(null).map(()=>({nombre:'',cuit:'',porcentaje:''}))
  const provs = Array.isArray(p.proveedores_tabla) && p.proveedores_tabla.length===4 ? p.proveedores_tabla : Array(4).fill(null).map(()=>({nombre:'',cuit:'',porcentaje:''}))
  const accRows = accs.map((a,i) => `<tr>
    <td><input type="text" data-acc="${i}_nombre" value="${esc(a.nombre)}" placeholder="Nombre o razón social"></td>
    <td><input type="text" data-acc="${i}_participacion" value="${esc(a.participacion)}" placeholder="ej. 50%"></td>
    <td><input type="text" data-acc="${i}_cuit" value="${esc(a.cuit)}" placeholder="XX-XXXXXXXX-X"></td>
    <td><input type="text" data-acc="${i}_rol" value="${esc(a.rol)}" placeholder="Presidente, Gerente…"></td>
  </tr>`).join('')
  const cliRows = clis.map((c,i) => `<tr>
    <td class="rn">${i+1}</td>
    <td><input type="text" id="cl_${i}_nombre" value="${esc(c.nombre)}" placeholder="Nombre o razón social"></td>
    <td><input type="text" id="cl_${i}_cuit" value="${esc(c.cuit)}" placeholder="XX-XXXXXXXX-X"></td>
    <td><input type="text" id="cl_${i}_porcentaje" value="${esc(c.porcentaje)}" placeholder="ej. 25%"></td>
  </tr>`).join('')
  const prvRows = provs.map((pr,i) => `<tr>
    <td class="rn">${i+1}</td>
    <td><input type="text" id="pr_${i}_nombre" value="${esc(pr.nombre)}" placeholder="Nombre o razón social"></td>
    <td><input type="text" id="pr_${i}_cuit" value="${esc(pr.cuit)}" placeholder="XX-XXXXXXXX-X"></td>
    <td><input type="text" id="pr_${i}_porcentaje" value="${esc(pr.porcentaje)}" placeholder="ej. 30%"></td>
  </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Formulario Perfil${p.razon ? ' — ' + esc(p.razon) : ''} · Fixus</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#eef2f8;color:#1a2840;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:24px 16px}
header{background:#0e2c50;color:#fff;padding:28px 32px;border-radius:12px;margin-bottom:20px}
header h1{font-size:22px;font-weight:700;margin-bottom:4px}
header p.sub{font-size:13px;opacity:.75;margin-bottom:12px}
header .instr{padding:12px 14px;background:rgba(255,255,255,.12);border-radius:8px;font-size:13px;line-height:1.6}
.sec{background:#fff;border-radius:12px;border:1px solid rgba(14,44,80,.07);box-shadow:0 2px 8px rgba(14,44,80,.08);margin-bottom:16px;overflow:hidden}
.sec-hd{padding:13px 20px;background:linear-gradient(180deg,rgba(74,105,204,.10) 0%,rgba(74,105,204,.02) 100%);border-bottom:1px solid rgba(14,44,80,.06);position:relative}
.sec-hd::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#4a69cc,#6e8fe0)}
.sec-hd h2{font-size:14px;font-weight:700;color:#0e2c50}
.sec-bd{padding:18px 20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}
.f{display:flex;flex-direction:column;gap:5px}
.f.s2{grid-column:span 2}
.f label{font-size:11.5px;font-weight:700;color:#4a69cc;text-transform:uppercase;letter-spacing:.05em}
input[type=text],input[type=date],textarea{width:100%;padding:10px 12px;font-size:13px;border:1px solid #c9d2ee;border-radius:8px;background:#fff;font-family:inherit;outline:none;transition:border-color .2s,box-shadow .2s;color:#1a2840}
input:focus,textarea:focus{border-color:#4a69cc;box-shadow:0 0 0 3px rgba(74,105,204,.15)}
textarea{resize:vertical;line-height:1.5}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:9px 10px;text-align:left;background:#eef2ff;border-bottom:2px solid #c9d2ee;font-size:11.5px;font-weight:700;color:#4a69cc;text-transform:uppercase;letter-spacing:.04em}
td{padding:6px 4px;border-bottom:1px solid #e8edf8}
td.rn{text-align:center;color:#94a3b8;font-weight:700;font-size:12px;width:28px;padding:6px 8px}
td input{border-radius:6px}
.add-btn{display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:7px 14px;font-size:12px;background:none;border:1px solid #c9d2ee;border-radius:7px;cursor:pointer;color:#4a69cc;font-weight:600}
.add-btn:hover{background:#eef2ff}
.actions{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
.btn-exp{padding:13px 26px;background:#4a69cc;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer}
.btn-exp:hover{background:#3a59bc}
.btn-prn{padding:13px 26px;background:#fff;color:#0e2c50;border:1.5px solid #c9d2ee;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
.btn-prn:hover{background:#f8faff}
.ok{display:none;padding:12px 16px;background:#ECFDF5;border:1px solid #86EFAC;border-radius:8px;color:#065F46;font-size:13px;margin-top:12px}
@media print{.actions{display:none}body{background:#fff}.sec{box-shadow:none}}
@media(max-width:600px){.grid{grid-template-columns:1fr}.f.s2{grid-column:span 1}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>Formulario de Perfil Empresarial</h1>
  <p class="sub">Fixus — Consultora para PyMEs</p>
  <div class="instr"><strong>Instrucciones:</strong> Complete los campos del formulario con la información de su empresa. Al finalizar, haga clic en <strong>"Descargar datos completados"</strong> para generar el archivo que deberá enviar al analista. También puede imprimir el formulario con el botón correspondiente.</div>
</header>

<div class="sec">
  <div class="sec-hd"><h2>1. Identificación</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2"><label>Razón Social *</label><input type="text" id="razon" value="${esc(p.razon)}" placeholder="Nombre legal de la empresa"></div>
    <div class="f"><label>CUIT</label><input type="text" id="cuit" value="${esc(p.cuit)}" placeholder="XX-XXXXXXXX-X"></div>
    <div class="f"><label>Sector / Rubro</label><input type="text" id="sector" value="${esc(p.sector)}" placeholder="ej. Industria manufacturera"></div>
    <div class="f"><label>Forma jurídica</label><input type="text" id="forma_juridica" value="${esc(p.forma_juridica)}" placeholder="SA, SRL, Unipersonal…"></div>
    <div class="f"><label>Fecha de constitución</label><input type="date" id="fecha_constitucion" value="${esc(p.fecha_constitucion)}"></div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>2. Ubicación</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2"><label>Domicilio</label><input type="text" id="domicilio" value="${esc(p.domicilio)}" placeholder="Calle y número"></div>
    <div class="f"><label>Localidad</label><input type="text" id="localidad" value="${esc(p.localidad)}" placeholder="Ciudad o localidad"></div>
    <div class="f"><label>Provincia</label><input type="text" id="provincia" value="${esc(p.provincia)}" placeholder="Buenos Aires"></div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>3. Dimensión</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f"><label>Cantidad de empleados</label><input type="text" id="empleados" value="${esc(p.empleados)}" placeholder="ej. 25"></div>
    <div class="f"><label>Facturación aproximada</label><input type="text" id="facturacion_aprox" value="${esc(p.facturacion_aprox)}" placeholder="ej. $500M anuales"></div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>4. Narrativa del negocio</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2"><label>Historia y origen</label><textarea id="historia" rows="4" placeholder="Año de inicio, fundadores, hitos de crecimiento, cambios relevantes…">${esc(p.historia)}</textarea></div>
    <div class="f s2">
      <label>Accionistas y conducción</label>
      <table><thead><tr>
        <th>Nombre / Razón Social</th><th style="width:130px">% Participación</th><th style="width:160px">CUIT</th><th>Rol</th>
      </tr></thead>
      <tbody id="acc-body">${accRows}</tbody></table>
      <button class="add-btn" onclick="addAcc()">+ Agregar accionista</button>
    </div>
    <div class="f s2"><label>Modelo de negocio</label><textarea id="negocio" rows="4" placeholder="A qué se dedica, cómo genera ingresos, ventaja competitiva…">${esc(p.negocio)}</textarea></div>
    <div class="f s2"><label>Destino de los fondos solicitados</label><textarea id="destino_fondos" rows="2" placeholder="Capital de trabajo, maquinaria, expansión, inventario…">${esc(p.destino_fondos)}</textarea></div>
    <div class="f s2"><label>Productos y servicios</label><textarea id="productos" rows="3" placeholder="Línea de productos/servicios principales, mix, estacionalidad">${esc(p.productos)}</textarea></div>
    <div class="f s2"><label>Canales comerciales</label><textarea id="canales" rows="2" placeholder="Venta directa, distribuidores, e-commerce, exportación…">${esc(p.canales)}</textarea></div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>5. Mercado — cartera comercial</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2">
      <label>Principales clientes</label>
      <table><thead><tr><th style="width:28px">#</th><th>Nombre / Razón Social</th><th style="width:160px">CUIT</th><th style="width:140px">% de facturación</th></tr></thead>
      <tbody>${cliRows}</tbody></table>
    </div>
    <div class="f s2">
      <label>Principales proveedores</label>
      <table><thead><tr><th style="width:28px">#</th><th>Nombre / Razón Social</th><th style="width:160px">CUIT</th><th style="width:140px">% de compras</th></tr></thead>
      <tbody>${prvRows}</tbody></table>
    </div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>6. Infraestructura y operaciones</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2"><label>Instalaciones y activos productivos</label><textarea id="infraestructura" rows="3" placeholder="Planta, oficinas, sucursales, vehículos, maquinaria relevante">${esc(p.infraestructura)}</textarea></div>
    <div class="f s2"><label>Certificaciones / habilitaciones / reconocimientos</label><textarea id="certificaciones" rows="2">${esc(p.certificaciones)}</textarea></div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>7. Contexto estratégico</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2"><label>¿Cuáles son las principales ventajas competitivas frente a la competencia?</label><textarea id="ventajas_competitivas" rows="3" placeholder="Marca, know-how, equipo, tecnología, precio, calidad…">${esc(p.ventajas_competitivas)}</textarea></div>
    <div class="f s2"><label>¿Cuáles son los principales riesgos o desafíos que enfrenta actualmente?</label><textarea id="riesgos_principales" rows="3" placeholder="Contexto económico, competencia, capacidad operativa, regulación…">${esc(p.riesgos_principales)}</textarea></div>
    <div class="f s2"><label>¿Qué oportunidades de crecimiento identifica en el corto y mediano plazo?</label><textarea id="oportunidades_crecimiento" rows="3" placeholder="Nuevos mercados, productos, clientes, exportación…">${esc(p.oportunidades_crecimiento)}</textarea></div>
    <div class="f s2"><label>¿Existe dependencia crítica de algún cliente, proveedor, persona clave o tecnología?</label><textarea id="dependencias_clave" rows="3" placeholder="Describir si hay concentración relevante en alguna relación clave…">${esc(p.dependencias_clave)}</textarea></div>
  </div></div>
</div>

<div class="sec">
  <div class="sec-hd"><h2>8. Información adicional</h2></div>
  <div class="sec-bd"><div class="grid">
    <div class="f s2"><label>Comentarios adicionales</label><textarea id="observaciones" rows="3" placeholder="Cualquier información relevante no cubierta anteriormente…">${esc(p.observaciones)}</textarea></div>
  </div></div>
</div>

<div class="actions">
  <button class="btn-exp" onclick="exportJSON()">⬇ Descargar datos completados</button>
  <button class="btn-prn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
</div>
<div class="ok" id="ok-msg">✓ Archivo descargado. Envielo al analista para cargar los datos automáticamente.</div>

</div>
<script>
let accN=${accs.length};
function addAcc(){
  const b=document.getElementById('acc-body'),i=accN++;
  const tr=document.createElement('tr');
  tr.innerHTML=\`<td><input type="text" data-acc="\${i}_nombre" placeholder="Nombre o razón social"></td><td><input type="text" data-acc="\${i}_participacion" placeholder="ej. 50%"></td><td><input type="text" data-acc="\${i}_cuit" placeholder="XX-XXXXXXXX-X"></td><td><input type="text" data-acc="\${i}_rol" placeholder="Presidente, Gerente…"></td>\`;
  b.appendChild(tr);
}
function exportJSON(){
  const v=id=>(document.getElementById(id)||{}).value||'';
  const d={
    razon:v('razon'),cuit:v('cuit'),sector:v('sector'),forma_juridica:v('forma_juridica'),fecha_constitucion:v('fecha_constitucion'),
    localidad:v('localidad'),provincia:v('provincia'),domicilio:v('domicilio'),
    empleados:v('empleados'),facturacion_aprox:v('facturacion_aprox'),
    historia:v('historia'),negocio:v('negocio'),destino_fondos:v('destino_fondos'),
    productos:v('productos'),canales:v('canales'),infraestructura:v('infraestructura'),
    certificaciones:v('certificaciones'),ventajas_competitivas:v('ventajas_competitivas'),
    riesgos_principales:v('riesgos_principales'),oportunidades_crecimiento:v('oportunidades_crecimiento'),
    dependencias_clave:v('dependencias_clave'),observaciones:v('observaciones'),
    accionistas:[],clientes_tabla:[],proveedores_tabla:[]
  };
  const m={};
  document.querySelectorAll('[data-acc]').forEach(el=>{
    const[r,f]=el.dataset.acc.split('_');
    const ri=parseInt(r);
    if(!m[ri])m[ri]={nombre:'',participacion:'',cuit:'',rol:''};
    m[ri][f]=el.value;
  });
  d.accionistas=Object.values(m).filter(a=>a.nombre||a.cuit);
  if(!d.accionistas.length)d.accionistas=[{nombre:'',participacion:'',cuit:'',rol:''}];
  for(let i=0;i<4;i++){
    d.clientes_tabla.push({nombre:v('cl_'+i+'_nombre'),cuit:v('cl_'+i+'_cuit'),porcentaje:v('cl_'+i+'_porcentaje')});
    d.proveedores_tabla.push({nombre:v('pr_'+i+'_nombre'),cuit:v('pr_'+i+'_cuit'),porcentaje:v('pr_'+i+'_porcentaje')});
  }
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='perfil_'+(d.razon||'empresa').replace(/[^a-zA-Z0-9]/g,'_').substring(0,30)+'.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const ok=document.getElementById('ok-msg');
  ok.style.display='block';
  setTimeout(()=>ok.style.display='none',6000);
}
</script>
</body>
</html>`
}

function CampoPerfil({ def, form, setForm }) {
  const { id, label, type = 'text', placeholder = '', rows = 3, span = 1, required = false } = def
  const val = form[id] ?? ''
  const onChange = e => setForm(f => ({ ...f, [id]: e.target.value }))
  const style = span > 1 ? { gridColumn: `span ${span}` } : {}

  if (type === 'accionistas') {
    return <CampoAccionistas label={label} form={form} setForm={setForm} style={style} />
  }
  if (type === 'clientes_tabla') {
    return <CampoTablaContactos label={label} fieldId="clientes_tabla" colPct="% de facturación" form={form} setForm={setForm} style={style} />
  }
  if (type === 'proveedores_tabla') {
    return <CampoTablaContactos label={label} fieldId="proveedores_tabla" colPct="% de compras" form={form} setForm={setForm} style={style} />
  }

  return (
    <div className="field" style={style}>
      <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      {type === 'textarea' ? (
        <textarea
          id={id} value={val} onChange={onChange} placeholder={placeholder} rows={rows}
          style={{
            width:'100%', padding:'10px 12px', fontSize:13,
            border:'1px solid #c9d2ee', borderRadius:8, background:'#fff',
            resize:'vertical', fontFamily:'inherit', lineHeight:1.5, outline:'none',
          }}
        />
      ) : id === 'facturacion_aprox' ? (
        <input
          id={id} type="text" inputMode="numeric"
          value={val} placeholder={placeholder}
          onChange={e => {
            const raw = e.target.value.replace(/\./g, '')
            setForm(f => ({ ...f, [id]: raw }))
          }}
          onBlur={e => setForm(f => ({ ...f, [id]: fmtMoneda(e.target.value) }))}
          onFocus={e => setForm(f => ({ ...f, [id]: (f[id] || '').replace(/\./g, '') }))}
        />
      ) : (
        <input
          id={id} type={type} value={val} onChange={onChange} placeholder={placeholder}
        />
      )}
    </div>
  )
}

function PanelPerfil({ form, setForm, perfilesList, onLoad, onNew, onDelete, onSave, saving, pipelineMatch, resenaVisible, setResenaVisible, onPDF, pdfLoading, usuarioActual, onToast }) {
  const resena = useMemo(() => buildResena(form, pipelineMatch), [form, pipelineMatch])
  const fechaInforme = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })
  const perfilKey = normalizeRazon(form.razon)

  // ── Token compartible ─────────────────────────────────────────────────
  const [tokenData, setTokenData] = useState(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [tokenChecking, setTokenChecking] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (!perfilKey) { setTokenData(null); return }
    fetch(`/api/formulario?key=${encodeURIComponent(perfilKey)}`)
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          const origin = typeof window !== 'undefined' ? window.location.origin : ''
          setTokenData({ ...d.data, url: `${origin}/form/${d.data.token}` })
        } else {
          setTokenData(null)
        }
      })
      .catch(() => {})
  }, [perfilKey])

  const crearLink = async () => {
    if (!form.razon) return
    setTokenLoading(true)
    try {
      const res = await fetch('/api/formulario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', payload: { perfilKey, prefill: form, analista: usuarioActual?.nombre || '' } }),
      })
      const d = await res.json()
      if (d.ok) {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        setTokenData({ token: d.token, url: `${origin}/form/${d.token}`, submitted: false, submitted_at: null, respuesta: null })
        onToast?.('Link generado ✓')
      }
    } catch { onToast?.('Error al generar el link') }
    finally { setTokenLoading(false) }
  }

  const verificarRespuesta = async () => {
    if (!tokenData?.token) return
    setTokenChecking(true)
    try {
      const res = await fetch(`/api/formulario?token=${tokenData.token}`)
      const d = await res.json()
      if (d.data) {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        setTokenData({ ...d.data, url: `${origin}/form/${d.data.token}` })
        if (d.data.submitted) onToast?.('¡El cliente completó el formulario!')
        else onToast?.('El formulario aún no fue completado')
      }
    } catch { onToast?.('Error al verificar') }
    finally { setTokenChecking(false) }
  }

  const importarRespuesta = () => {
    if (!tokenData?.respuesta) return
    setForm(normalizePerfil(tokenData.respuesta))
    setResenaVisible(false)
    onToast?.('Datos del cliente importados al perfil ✓')
  }

  const copiarLink = () => {
    if (!tokenData?.url) return
    navigator.clipboard.writeText(tokenData.url).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2200)
    })
  }

  return (
    <div>
      {/* Barra superior: gestión de perfiles guardados */}
      <div className="card" style={{ padding:'14px 18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ fontSize:12, color:'#64748B', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>
            Perfiles guardados ({perfilesList.length})
          </div>
          <select
            value={perfilKey && perfilesList.find(p => p.key === perfilKey) ? perfilKey : ''}
            onChange={e => e.target.value && onLoad(e.target.value)}
            style={{ flex:1, minWidth:200, padding:'8px 12px', fontSize:13, border:'1px solid #c9d2ee', borderRadius:8, background:'#fff', outline:'none' }}
          >
            <option value="">— Seleccionar perfil para cargar —</option>
            {perfilesList.map(p => (
              <option key={p.key} value={p.key}>{p.razon}{p.actualizado_en ? ` · ${p.actualizado_en.slice(0,10)}` : ''}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={onNew}>＋ Nuevo perfil</button>
          {perfilKey && perfilesList.find(p => p.key === perfilKey) && (
            <button className="btn btn-ghost" style={{ color:'#DC2626' }} onClick={() => onDelete(perfilKey)}>🗑 Eliminar</button>
          )}
        </div>
      </div>

      {/* Banner: vinculación con análisis crediticio */}
      {pipelineMatch && (
        <div style={{
          marginTop:16, padding:'12px 16px', display:'flex', alignItems:'center', gap:12,
          background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)',
          border:'1px solid #86EFAC', borderRadius:10,
        }}>
          <span style={{ fontSize:18 }}>🔗</span>
          <div style={{ flex:1, fontSize:13, color:'#065F46' }}>
            <strong>Vinculada al análisis crediticio.</strong> Esta empresa ya fue evaluada — score {pipelineMatch.elig?.score}/100.
            La reseña incluirá automáticamente la situación crediticia actual.
          </div>
        </div>
      )}

      {/* Formulario por secciones */}
      {PERFIL_SECCIONES.map((sec, i) => (
        <div key={i} className="card section-gap card--indigo">
          <div className="card-header"><div className="section-dot" /><span className="card-title">{sec.titulo}</span></div>
          <div className="card-body">
            <div className="form-grid">
              {sec.campos.map(c => (
                <CampoPerfil key={c.id} def={c} form={form} setForm={setForm} />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Formulario para el cliente — link compartible */}
      <div className="card section-gap" style={{ background:'linear-gradient(135deg,#f8faff 0%,#eef2ff 100%)', border:'1px solid rgba(74,105,204,.18)' }}>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#4a69cc', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
            Formulario para el cliente
          </div>

          {!tokenData && (
            <>
              <div style={{ fontSize:13, color:'#475569', marginBottom:14, lineHeight:1.5, marginTop:6 }}>
                Generá un link único para que el cliente complete la información desde cualquier dispositivo.
              </div>
              <button className="btn btn-primary" onClick={crearLink} disabled={tokenLoading || !form.razon} style={{ fontSize:13 }}>
                {tokenLoading ? <span className="spinner" /> : '🔗'} Generar link para el cliente
              </button>
              {!form.razon && <div style={{ fontSize:12, color:'#94a3b8', marginTop:6 }}>Cargá la Razón Social primero</div>}
            </>
          )}

          {tokenData && !tokenData.submitted && (
            <>
              <div style={{ fontSize:13, color:'#475569', marginTop:6, marginBottom:10, lineHeight:1.5 }}>
                Compartí este link con el cliente. Cuando lo complete, podés importar los datos automáticamente.
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
                <input
                  readOnly value={tokenData.url || ''}
                  style={{ flex:1, padding:'9px 12px', fontSize:12, border:'1px solid #c9d2ee', borderRadius:8,
                    background:'#f8faff', color:'#334155', outline:'none', fontFamily:'monospace' }}
                  onFocus={e => e.target.select()}
                />
                <button className="btn btn-ghost" onClick={copiarLink} style={{ fontSize:12, whiteSpace:'nowrap', minWidth:80 }}>
                  {linkCopied ? '✓ Copiado' : '📋 Copiar'}
                </button>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-ghost" onClick={verificarRespuesta} disabled={tokenChecking} style={{ fontSize:12 }}>
                  {tokenChecking ? <span className="spinner" /> : '🔄'} Verificar respuesta
                </button>
                <button className="btn btn-ghost" onClick={crearLink} disabled={tokenLoading} style={{ fontSize:12, color:'#94a3b8' }}>
                  Generar nuevo link
                </button>
              </div>
            </>
          )}

          {tokenData && tokenData.submitted && (
            <>
              <div style={{ marginTop:10, padding:'12px 14px', background:'#ECFDF5',
                border:'1px solid #A7F3D0', borderRadius:10, fontSize:13, color:'#065F46', marginBottom:14 }}>
                ✓ El cliente completó el formulario{tokenData.submitted_at
                  ? ` el ${new Date(tokenData.submitted_at).toLocaleDateString('es-AR')}`
                  : ''}.
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                <button className="btn btn-success" onClick={importarRespuesta} style={{ fontSize:13 }}>
                  ⬆ Importar datos al perfil
                </button>
                <button className="btn btn-ghost" onClick={crearLink} disabled={tokenLoading} style={{ fontSize:12, color:'#94a3b8' }}>
                  Generar nuevo link
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Acciones principales */}
      <div style={{ marginTop:20, display:'flex', gap:10, flexWrap:'wrap' }}>
        <button className="btn btn-primary" onClick={onSave} disabled={saving || pdfLoading}>
          {saving ? <span className="spinner" /> : '💾'} Guardar perfil
        </button>
        <button
          className="btn btn-success"
          onClick={() => setResenaVisible(v => !v)}
          disabled={!form.razon}
          title={!form.razon ? 'Cargá al menos la Razón Social' : ''}
        >
          {resenaVisible ? '👁 Ocultar reseña' : '📄 Generar reseña'}
        </button>
      </div>

      {/* Preview de la reseña + botones PDF */}
      {resenaVisible && form.razon && (
        <div id="resena-root" style={{ marginTop:24 }}>
          {/* Header PDF — oculto en UI normal, visible al capturar */}
          <div className="pdf-header">
            <div className="pdf-header-row">
              <img src="/logo.svg" alt="Fixus" className="pdf-logo" />
              <div className="pdf-header-title">
                <div className="pdf-title">Reseña corporativa</div>
                <div className="pdf-subtitle">Fixus — Consultora para PyMEs</div>
              </div>
              <div className="pdf-header-date">{fechaInforme}</div>
            </div>
            <div className="pdf-header-meta">
              <div><strong>Razón social:</strong> {form.razon || '—'}</div>
              <div><strong>CUIT:</strong> {form.cuit || '—'}</div>
              <div><strong>Sector:</strong> {form.sector || '—'}</div>
              <div><strong>Forma jurídica:</strong> {form.forma_juridica || '—'}</div>
              <div><strong>Ubicación:</strong> {[form.localidad, form.provincia].filter(Boolean).join(', ') || '—'}</div>
              <div><strong>Empleados:</strong> {form.empleados || '—'}</div>
            </div>
            <div className="pdf-divider" />
          </div>

          <div className="card card--violet">
            <div className="card-header">
              <div className="section-dot" />
              <span className="card-title">Reseña corporativa — {form.razon}</span>
            </div>
            <div className="card-body">
              <div className="memo-box">
                {resena.map((s, i) => (
                  <div key={i} className="memo-section">
                    <div className="memo-title">{s.titulo}</div>
                    <div className="memo-text" style={{ whiteSpace:'pre-wrap' }}>{s.texto}</div>
                  </div>
                ))}
                <div className="memo-footer">
                  Reseña generada el {fechaInforme} · Fixus — Consultora para PyMEs · Documento de uso interno
                </div>
              </div>
            </div>
          </div>

          <div className="action-bar" style={{ marginTop:16, display:'flex', gap:10, flexWrap:'wrap' }}>
            <button className="btn btn-primary" onClick={() => onPDF('digital')} disabled={pdfLoading} title="PDF continuo para lectura en pantalla">
              {pdfLoading ? <span className="spinner" /> : '📄'} Descargar PDF
            </button>
            <button className="btn btn-ghost" onClick={() => onPDF('imprimible')} disabled={pdfLoading} title="PDF paginado A4 para imprimir">
              {pdfLoading ? <span className="spinner" /> : '🖨'} PDF imprimible
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [usuarioActual, setUsuarioActual] = useState(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fixus_usuario')
      if (saved) {
        const u = JSON.parse(saved)
        if (USUARIOS.find(x => x.id === u.id)) setUsuarioActual(u)
      }
    } catch {}
  }, [])

  const handleLogin = (user) => {
    localStorage.setItem('fixus_usuario', JSON.stringify({ id: user.id, nombre: user.nombre, iniciales: user.iniciales }))
    setUsuarioActual(user)
  }
  const handleLogout = () => {
    localStorage.removeItem('fixus_usuario')
    setUsuarioActual(null)
  }

  const [tab, setTab] = useState('form')
  const [form, setForm] = useState(FORM_EMPTY)
  const [resultado, setResultado] = useState(null)
  const [pipeline, setPipeline] = useState([])
  const [criterios, setCriterios] = useState(CRITERIOS_DEFAULT)
  const [toast, setToast] = useState(null)
  const [loading, setLoading] = useState(false)
  // AFIP lookup
  const [buscandoCuit, setBuscandoCuit] = useState(false)
  const [cuitError, setCuitError]       = useState('')
  const [afipData, setAfipData]         = useState(null)  // { estadoClave, tipoPersona, mesCierre, fechaInscripcion, domicilio, actividad }
  const [pdfLoading, setPdfLoading] = useState(false)
  const [savingCrit, setSavingCrit] = useState(false)
  // Perfil cualitativo
  const [perfilForm, setPerfilForm] = useState(PERFIL_EMPTY)
  const [perfiles, setPerfiles] = useState({}) // dict { [razonNormalizada]: perfil }
  const [perfilSaving, setPerfilSaving] = useState(false)
  const [resenaVisible, setResenaVisible] = useState(false)

  const showToast = msg => setToast(msg)

  const buscarCuit = async () => {
    const cuitLimpio = (form.cuit || '').replace(/[-\s]/g, '')
    if (cuitLimpio.length !== 11) { setCuitError('Ingresá un CUIT de 11 dígitos'); return }
    setCuitError('')
    setBuscandoCuit(true)
    try {
      const res  = await fetch(`/api/buscar-cuit?cuit=${cuitLimpio}`)
      const data = await res.json()
      if (res.ok) {
        const antiguedad = data.fechaInscripcion
          ? Math.floor((Date.now() - new Date(data.fechaInscripcion)) / (1000 * 60 * 60 * 24 * 365.25))
          : null
        // Cierre de ejercicio: mes de AFIP + año anterior
        let cierreAFIP = ''
        if (data.mesCierre) {
          const anioAnterior = new Date().getFullYear() - 1
          cierreAFIP = `${anioAnterior}-${String(data.mesCierre).padStart(2, '0')}`
        }
        setForm(f => ({
          ...f,
          ...(data.razonSocial && { razon: data.razonSocial }),
          ...(data.actividad   && { sector: data.actividad }),
          ...(antiguedad !== null && antiguedad >= 0 && { antiguedad: String(antiguedad) }),
          ...(cierreAFIP && { cierre_ejercicio: cierreAFIP }),
        }))
        setAfipData({
          estadoClave:    data.estadoClave,
          tipoPersona:    data.tipoPersona,
          mesCierre:      data.mesCierre,
          fechaInscripcion: data.fechaInscripcion,
          domicilio:      data.domicilio,
          actividad:      data.actividad,
        })
      } else {
        setCuitError(data.error || 'No se encontró el CUIT')
      }
    } catch { setCuitError('Error de conexión') }
    finally { setBuscandoCuit(false) }
  }

  // Cargar pipeline, criterios y perfiles al inicio
  useEffect(() => {
    fetch('/api/pipeline').then(r => r.json()).then(d => { if (d.data) setPipeline(d.data) })
    fetch('/api/pipeline?type=criterios').then(r => r.json()).then(d => { if (d.data) setCriterios(d.data) })
    fetch('/api/pipeline?type=perfiles').then(r => r.json()).then(d => { if (d.data) setPerfiles(d.data) })
  }, [])

  // Sincroniza razón social y CUIT del evaluador al perfil cualitativo
  // Solo sincroniza si el perfil está vacío o es la misma empresa
  useEffect(() => {
    setPerfilForm(prev => {
      const mismaEmpresa = !prev.razon || normalizeRazon(prev.razon) === normalizeRazon(form.razon)
      if (!mismaEmpresa) return prev
      return {
        ...prev,
        ...(form.razon ? { razon: form.razon } : {}),
        ...(form.cuit  ? { cuit:  form.cuit  } : {}),
      }
    })
  }, [form.razon, form.cuit])

  // Busca en el pipeline una empresa cuya razón social coincida (normalizada) con la del perfil
  const pipelineMatch = useMemo(() => {
    const key = normalizeRazon(perfilForm.razon)
    if (!key) return null
    return pipeline.find(e => normalizeRazon(e.form?.razon) === key) || null
  }, [perfilForm.razon, pipeline])

  const perfilesList = useMemo(() => {
    return Object.entries(perfiles)
      .map(([key, p]) => ({ key, razon: p.razon || key, actualizado_en: p.actualizado_en || '' }))
      .sort((a, b) => (b.actualizado_en || '').localeCompare(a.actualizado_en || ''))
  }, [perfiles])

  const guardarPerfil = async () => {
    if (!perfilForm.razon || !perfilForm.razon.trim()) {
      showToast('Cargá al menos la Razón Social para guardar el perfil.')
      return
    }
    setPerfilSaving(true)
    const key = normalizeRazon(perfilForm.razon)
    const perfil = { ...perfilForm, actualizado_en: new Date().toISOString() }
    try {
      await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_perfil', payload: { key, perfil } }),
      })
      setPerfiles(prev => ({ ...prev, [key]: perfil }))
      setPerfilForm(perfil)
      showToast(`Perfil de "${perfil.razon}" guardado ✓`)
    } catch (err) {
      console.error(err)
      showToast('Error al guardar el perfil')
    } finally {
      setPerfilSaving(false)
    }
  }

  const cargarPerfil = (key) => {
    const p = perfiles[key]
    if (!p) return
    setPerfilForm(normalizePerfil(p))
    setResenaVisible(false)
    showToast(`Perfil de "${p.razon}" cargado`)
  }

  const nuevoPerfil = () => {
    setPerfilForm(PERFIL_EMPTY)
    setResenaVisible(false)
  }

  const eliminarPerfil = async (key) => {
    if (!confirm('¿Eliminar este perfil? No se puede deshacer.')) return
    await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_perfil', payload: { key } }),
    })
    setPerfiles(prev => {
      const n = { ...prev }
      delete n[key]
      return n
    })
    // Si el perfil eliminado era el que estaba editándose, limpiar
    if (normalizeRazon(perfilForm.razon) === key) setPerfilForm(PERFIL_EMPTY)
    showToast('Perfil eliminado')
  }

  const generarResenaPDF = (modo) => {
    generarPDF(modo, {
      nodeId: 'resena-root',
      filenameBase: 'Resena-Fixus',
      razon: perfilForm.razon || 'empresa',
    })
  }

  const analizar = () => {
    if (!form.razon || !form.ventas) { showToast('Completá al menos la Razón Social y las Ventas.'); return }
    // IDs de meses (todos los posibles) + resto de campos numéricos
    const monthIds = Array.from({ length: 24 }, (_, i) => `m${i+1}`)
    const numKeys = ['antiguedad','fin_sol','ventas_ant','ventas','ebitda_ej','act_co','act_nco','pas_co','pas_nco','pn','dcp','dlp','deuda_post', ...monthIds]
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
    const entry = { id: Date.now() + '-' + resultado.form.razon, ...resultado, ejecutivo: usuarioActual.nombre }
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

  // Exporta un nodo como PDF. modo: 'digital' = página continua; 'imprimible' = multipágina A4.
  // opts.nodeId = id del DOM a capturar (default 'pdf-root'); opts.filenameBase = prefijo del archivo;
  // opts.razon = razón social para el nombre del archivo (default resultado.form.razon)
  const generarPDF = async (modo = 'digital', opts = {}) => {
    if (typeof window === 'undefined') return
    const { nodeId = 'pdf-root', filenameBase = 'Informe-Fixus', razon } = opts
    setPdfLoading(true)
    const node = document.getElementById(nodeId)
    if (!node) { setPdfLoading(false); showToast('No se encontró el panel para exportar'); return }
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      node.classList.add('pdf-capturing')
      // Pequeña espera para que el navegador aplique los estilos de captura
      await new Promise(res => setTimeout(res, 60))
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        windowWidth: node.scrollWidth,
      })
      node.classList.remove('pdf-capturing')

      const A4_W = 595.28
      const A4_H = 841.89
      const ratio = A4_W / canvas.width
      const imgH = canvas.height * ratio
      const fecha = new Date().toISOString().slice(0, 10)
      const razonParaNombre = razon ?? (resultado?.form?.razon) ?? 'informe'
      const safe = razonParaNombre.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')
      // JPEG calidad 0.92 — el texto se ve igual y el archivo pesa ~1/3 del PNG equivalente
      const toImg = c => c.toDataURL('image/jpeg', 0.92)

      if (modo === 'digital') {
        // PDF digital: UNA sola página continua (ancho A4, alto = contenido).
        const MAX_PAGE_H = 14400 // cap interno de jsPDF
        if (imgH <= MAX_PAGE_H) {
          const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: [A4_W, imgH] })
          pdf.addImage(toImg(canvas), 'JPEG', 0, 0, A4_W, imgH)
          pdf.save(`${filenameBase}-${safe}-${fecha}.pdf`)
          showToast('PDF digital generado ✓')
          return
        }
        // Fallback: contenido enorme
        const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: [A4_W, MAX_PAGE_H] })
        const pxPorPagina = Math.floor(MAX_PAGE_H / ratio)
        let yOffset = 0, firstPage = true
        while (yOffset < canvas.height) {
          const sliceH = Math.min(pxPorPagina, canvas.height - yOffset)
          const slice = document.createElement('canvas')
          slice.width = canvas.width; slice.height = sliceH
          const ctx = slice.getContext('2d')
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, slice.width, slice.height)
          ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
          if (!firstPage) pdf.addPage([A4_W, sliceH * ratio], 'p')
          pdf.addImage(toImg(slice), 'JPEG', 0, 0, A4_W, sliceH * ratio)
          yOffset += sliceH; firstPage = false
        }
        pdf.save(`${filenameBase}-${safe}-${fecha}.pdf`)
        showToast('PDF digital generado ✓')
        return
      }

      // modo === 'imprimible' → multipágina A4 con cortes en zonas blancas
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' })
      const pxPorPagina = Math.floor(A4_H / ratio)
      const ctxFull = canvas.getContext('2d')

      // Busca una fila casi-blanca retrocediendo desde targetY. Si no encuentra, devuelve targetY.
      const findCut = (targetY, lookback = 260) => {
        const from = Math.max(0, targetY - lookback)
        for (let y = targetY; y >= from; y--) {
          const row = ctxFull.getImageData(0, y, canvas.width, 1).data
          let dirty = 0
          const maxDirty = Math.max(4, Math.floor(canvas.width * 0.01))
          for (let i = 0; i < row.length; i += 4) {
            const r = row[i], g = row[i+1], b = row[i+2]
            if (r < 240 || g < 240 || b < 240) { dirty++; if (dirty > maxDirty) { dirty = -1; break } }
          }
          if (dirty !== -1) return y
        }
        return targetY
      }

      let yOffset = 0, firstPage = true
      while (yOffset < canvas.height) {
        let sliceH
        const remaining = canvas.height - yOffset
        if (remaining <= pxPorPagina) {
          sliceH = remaining
        } else {
          const softCut = findCut(yOffset + pxPorPagina)
          sliceH = Math.max(softCut - yOffset, Math.floor(pxPorPagina * 0.6))
        }
        const slice = document.createElement('canvas')
        slice.width = canvas.width; slice.height = sliceH
        const ctx = slice.getContext('2d')
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, slice.width, slice.height)
        ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        if (!firstPage) pdf.addPage()
        pdf.addImage(toImg(slice), 'JPEG', 0, 0, A4_W, sliceH * ratio)
        yOffset += sliceH; firstPage = false
      }
      pdf.save(`${filenameBase}-${safe}-${fecha}-imprimible.pdf`)
      showToast('PDF imprimible generado ✓')
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
    const headers = ['Empresa','CUIT','Sector','Antigüedad','Ventas','EBITDA','Mg.EBITDA%','Liquidez','Endeudamiento','CT','D/Ventas(m)','D/EBITDA(m)','Score','Estado','Pidió($K)','Sug.CP($K)','Sug.LP($K)','Recomendable','Ejecutivo']
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
        apto ? 'sí' : 'no',
        e.ejecutivo || ''
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
    ventas_ant:78000,
    ventas:85000, ebitda_ej:17500,
    act_co:32000, act_nco:28000, pas_co:18000, pas_nco:15000, pn:27000,
    dcp:8000, dlp:12000,
    deuda_post:22500, // crece ~12% vs balance, escenario realista
    m1:7200, m2:7500, m3:7900, m4:8100, m5:8400, m6:8800,
    m7:9100, m8:9300, m9:9600, m10:9800, m11:10100, m12:10400,
  })

  const NAV = [
    { id:'form',      label:'Nueva empresa',      icon:'＋' },
    { id:'resultado', label:'Resultado análisis', icon:'◎' },
    { id:'perfil',    label:'Perfil cualitativo', icon:'◉', badge: Object.keys(perfiles).length },
    { id:'criterios', label:'Criterios',          icon:'⚙' },
    { id:'pipeline',  label:'Pipeline',           icon:'◈', badge: pipeline.length },
  ]

  if (!usuarioActual) return <LoginScreen onLogin={handleLogin} />

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
            <img src="/logo_white.png" alt="Fixus — Consultora para PyMEs" className="logo-img" />
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
          <div style={{ padding:'14px 16px', borderTop:'1px solid rgba(255,255,255,.08)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {usuarioActual.iniciales}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.85)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{usuarioActual.nombre}</div>
                <button onClick={handleLogout} style={{ fontSize:10, color:'rgba(255,255,255,.35)', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit', transition:'color .15s' }}
                  onMouseEnter={e => e.target.style.color='rgba(255,255,255,.65)'}
                  onMouseLeave={e => e.target.style.color='rgba(255,255,255,.35)'}>
                  Cerrar sesión
                </button>
              </div>
            </div>
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
                    {/* CUIT con botón buscar */}
                    <div className="field">
                      <label>CUIT</label>
                      <div style={{ display:'flex', gap:6 }}>
                        <input
                          type="text"
                          value={form.cuit}
                          onChange={e => { setForm(f => ({ ...f, cuit: e.target.value })); setCuitError(''); setAfipData(null) }}
                          onKeyDown={e => e.key === 'Enter' && buscarCuit()}
                          placeholder="30-12345678-9"
                          style={{ flex:1, padding:'8px 10px', border:`1px solid ${cuitError ? '#ef4444' : '#e2e8f0'}`, borderRadius:8, fontSize:14, fontFamily:'inherit' }}
                        />
                        <button
                          onClick={buscarCuit}
                          disabled={buscandoCuit}
                          style={{ padding:'8px 14px', background:'#617ECA', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
                        >
                          {buscandoCuit ? '...' : '🔍 Buscar'}
                        </button>
                      </div>
                      {cuitError && <div style={{ fontSize:11, color:'#ef4444', marginTop:4 }}>{cuitError}</div>}
                    </div>

                    <Campo label="Razón Social" id="razon" form={form} setForm={setForm} type="text" placeholder="Se completa automáticamente" />
                    <Campo label="Sector / Actividad" id="sector" form={form} setForm={setForm} type="text" placeholder="Se completa automáticamente" />
                    <Campo label="Antigüedad (años)" id="antiguedad" form={form} setForm={setForm} />
                  </div>

                  {/* Separador operación */}
                  <div style={{ margin:'18px -20px 0', padding:'14px 20px 16px', background:'#fff7ed', borderTop:'1px solid #fed7aa', borderBottom:'1px solid #fed7aa' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                      <span style={{ fontSize:11, fontWeight:700, letterSpacing:.6, color:'#c2410c', textTransform:'uppercase' }}>Operación</span>
                      <div style={{ flex:1, height:1, background:'#fdba74' }} />
                    </div>
                    <div className="form-grid">
                      <Campo label="Destino del financiamiento" id="destino" form={form} setForm={setForm} type="text" placeholder="Capital de trabajo, maquinaria..." span={1} />
                      <Campo label="Financiamiento solicitado ($K)" id="fin_sol" form={form} setForm={setForm} />
                    </div>
                  </div>
                  {/* Panel chips AFIP */}
                  {afipData && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:14, padding:'10px 14px', background:'#f4f6fc', borderRadius:8, border:'1px solid #e2e7f3' }}>
                      {afipData.estadoClave && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20,
                          background: afipData.estadoClave === 'ACTIVO' ? '#dcfce7' : '#fee2e2',
                          color:      afipData.estadoClave === 'ACTIVO' ? '#166534' : '#991b1b' }}>
                          <span style={{ width:7, height:7, borderRadius:'50%', background: afipData.estadoClave === 'ACTIVO' ? '#16a34a' : '#dc2626', display:'inline-block' }} />
                          {afipData.estadoClave}
                        </span>
                      )}
                      {afipData.tipoPersona && (
                        <span style={{ fontSize:12, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'#eff6ff', color:'#1e40af' }}>
                          {afipData.tipoPersona === 'JURIDICA' ? 'Persona jurídica' : 'Persona física'}
                        </span>
                      )}
                      {afipData.mesCierre && (
                        <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#f0fdf4', color:'#166534', fontWeight:500 }}>
                          Cierre: {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][parseInt(afipData.mesCierre,10)-1] || afipData.mesCierre}
                        </span>
                      )}
                      {afipData.fechaInscripcion && (
                        <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#fafafa', color:'#475569', border:'1px solid #e2e8f0' }}>
                          Inscripta: {afipData.fechaInscripcion.slice(0,10)}
                        </span>
                      )}
                      {afipData.domicilio && (
                        <span style={{ fontSize:12, padding:'3px 10px', borderRadius:20, background:'#fafafa', color:'#475569', border:'1px solid #e2e8f0' }}>
                          📍 {afipData.domicilio}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="card section-gap card--teal">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Ejercicio anterior (datos comparativos — $K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Ventas netas ej. anterior" id="ventas_ant" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap card--indigo">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Último ejercicio — estado de resultados ($K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Ventas netas" id="ventas" form={form} setForm={setForm} />
                    <EbitdaEjercicioCalc form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap card--green">
                <div className="card-header"><div className="section-dot" /><span className="card-title">Último ejercicio — balance general ($K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Activo corriente" id="act_co" form={form} setForm={setForm} />
                    <Campo label="Activo no corriente" id="act_nco" form={form} setForm={setForm} />
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
                ? <PanelResultado resultado={resultado} onAgregar={agregarPipeline} onPDF={generarPDF} loading={loading} pdfLoading={pdfLoading} usuarioActual={usuarioActual} />
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

          {/* PERFIL CUALITATIVO */}
          {tab === 'perfil' && (
            <>
              <div className="page-header">
                <div className="page-title">Perfil cualitativo</div>
                <div className="page-sub">Cargá la información de contexto de la empresa y generá una reseña completa</div>
              </div>
              <PanelPerfil
                form={perfilForm}
                setForm={setPerfilForm}
                perfilesList={perfilesList}
                onLoad={cargarPerfil}
                onNew={nuevoPerfil}
                onDelete={eliminarPerfil}
                onSave={guardarPerfil}
                saving={perfilSaving}
                pipelineMatch={pipelineMatch}
                resenaVisible={resenaVisible}
                setResenaVisible={setResenaVisible}
                onPDF={generarResenaPDF}
                pdfLoading={pdfLoading}
                usuarioActual={usuarioActual}
                onToast={showToast}
              />
            </>
          )}

          {/* PIPELINE */}
          {tab === 'pipeline' && (
            <>
              <div className="page-header">
                <div className="page-title">Pipeline</div>
                <div className="page-sub">{pipeline.length} empresa{pipeline.length !== 1 ? 's' : ''} analizadas · guardado automáticamente</div>
              </div>
              <PanelPipeline pipeline={pipeline} onDelete={eliminarEmpresa} onClear={limpiarPipeline} onExport={exportarCSV} usuarioActual={usuarioActual} />
            </>
          )}
        </main>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </>
  )
}
