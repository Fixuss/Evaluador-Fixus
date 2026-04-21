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
  antiguedad:0, fin_sol:0,
  ventas_ant:0, ebitda_ant:0, deuda_ant:0,
  ventas:0, cmv:0, gastos_op:0, amort:0, res_fin:0, imp:0,
  act_co:0, act_nco:0, caja:0, pas_co:0, pas_nco:0, pn:0,
  dcp:0, dlp:0,
  m1:0, m2:0, m3:0, m4:0, m5:0, m6:0,
}

function Campo({ label, id, form, setForm, type='number', span=1, placeholder='' }) {
  return (
    <div className="field" style={span > 1 ? { gridColumn: `span ${span}` } : {}}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id} type={type}
        value={form[id] ?? ''}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [id]: type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value }))}
      />
    </div>
  )
}

// ── VISTA ANÁLISIS ─────────────────────────────────────────────────────────
const CAT_LABELS = { tendencia:'Tendencia', deuda:'Deuda', solvencia:'Solvencia', rentabilidad:'Rentabilidad', perfil:'Perfil' }
const STATUS_LABELS = { approved:'Empresa elegible — puede avanzar', warning:'Elegible con observaciones', rejected:'No cumple los criterios mínimos' }
const STATUS_ICONS  = { approved:'✓', warning:'⚠', rejected:'✗' }

function PanelResultado({ resultado, onAgregar, loading }) {
  const { r, elig, form } = resultado

  const scoreColor = elig.score >= 80 ? '#059669' : elig.score >= 60 ? '#D97706' : '#DC2626'

  const metricColor = (v, good, ok) => v >= good ? 'good' : v >= ok ? 'warn' : 'bad'

  return (
    <div>
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

      {/* Métricas clave */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Deuda / ventas</div>
          <div className={`metric-value ${r.deuda_meses_ventas <= 4 ? 'good' : r.deuda_meses_ventas <= 5 ? 'warn' : 'bad'}`}>{r.deuda_meses_ventas.toFixed(1)}m</div>
          <div style={{fontSize:11,color:'#94A3B8',marginTop:3}}>meses de ventas</div>
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
            ].map(([k,v]) => (
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #F1F5F9',fontSize:13}}>
                <span style={{color:'#64748B'}}>{k}</span><span style={{fontWeight:500}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Narrativo */}
      <div className="card section-gap">
        <div className="card-header"><div className="section-dot" style={{background:'#7C3AED'}} /><span className="card-title">Análisis narrativo</span></div>
        <div className="card-body">
          <div className="narrative-box">
            {form.razon} ({form.sector || 'sin sector'}) — {form.antiguedad} años de antigüedad.{' '}
            Ventas: {fmtK(form.ventas)} | EBITDA: {fmtK(r.ebitda)} ({r.margen_ebitda.toFixed(1)}%) | Resultado neto: {fmtK(r.res_neto)}.{' '}
            Capital de trabajo: {fmtK(r.capital_trabajo)} | Liquidez: {r.liquidez.toFixed(2)}x | Endeudamiento: {r.endeudamiento.toFixed(2)}x.{' '}
            Deuda financiera: {fmtK(r.deuda_fin)} = {r.deuda_meses_ventas.toFixed(1)} meses de ventas actuales
            {r.ebitda_mens > 0 ? ` y ${r.deuda_meses_ebitda.toFixed(1)} meses de EBITDA` : ''}.{' '}
            {r.tiene_ant ? `Variación de ventas interanual: ${r.var_ventas >= 0 ? '+' : ''}${r.var_ventas.toFixed(1)}%. ` : ''}
            {r.tiene_tend ? `Tendencia post-balance: ${r.pct_alza.toFixed(0)}% de meses con alza. ` : ''}
            Score de elegibilidad: {elig.score}/100 ({elig.pasados}/{elig.total} criterios).
            Financiamiento solicitado: {fmtK(form.fin_sol)} — Destino: {form.destino || 'no especificado'}.
          </div>
        </div>
      </div>

      {/* Botón agregar */}
      <div style={{ marginTop:16, display:'flex', gap:10 }}>
        <button className="btn btn-success" onClick={onAgregar} disabled={loading}>
          {loading ? <span className="spinner" /> : '✚'} Agregar al pipeline
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
function PanelPipeline({ pipeline, onDelete, onClear, onExport }) {
  const totales = {
    aprobadas: pipeline.filter(e => e.elig.status === 'approved').length,
    observ:    pipeline.filter(e => e.elig.status === 'warning').length,
    rechaz:    pipeline.filter(e => e.elig.status === 'rejected').length,
    scoreAvg:  pipeline.length > 0 ? Math.round(pipeline.reduce((s,e) => s + e.elig.score, 0) / pipeline.length) : 0,
  }

  return (
    <div>
      {/* Contadores */}
      <div className="metrics-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginTop:0 }}>
        {[
          ['Total empresas', pipeline.length, 'neutral'],
          ['Elegibles', totales.aprobadas, 'good'],
          ['Con observaciones', totales.observ, 'warn'],
          ['Rechazadas', totales.rechaz, 'bad'],
        ].map(([l,v,c]) => (
          <div key={l} className="metric-card">
            <div className="metric-label">{l}</div>
            <div className={`metric-value ${c}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div style={{ display:'flex', gap:10, margin:'16px 0', justifyContent:'flex-end' }}>
        <button className="btn btn-ghost" onClick={onExport} disabled={!pipeline.length}>📥 Exportar CSV</button>
        <button className="btn btn-danger" onClick={onClear} disabled={!pipeline.length}>🗑 Limpiar pipeline</button>
      </div>

      {/* Tabla */}
      {pipeline.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-icon">📋</div>
          <div className="empty-text">Aún no hay empresas en el pipeline.<br/>Analizá una empresa y agregala desde el formulario.</div>
        </div>
      ) : (
        <div className="card">
          <div style={{ overflowX:'auto' }}>
            <table className="pipeline-table">
              <thead>
                <tr>
                  <th>Empresa</th><th>Sector</th><th>Ventas</th><th>EBITDA</th>
                  <th>D/Ventas</th><th>D/EBITDA</th><th>CT</th><th>Score</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pipeline.map(e => (
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
                    <td>
                      <span className={`status-badge ${e.elig.status}`}>
                        {STATUS_ICONS[e.elig.status]} {e.elig.status === 'approved' ? 'Elegible' : e.elig.status === 'warning' ? 'Con obs.' : 'No elegible'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding:'4px 10px', fontSize:11 }} onClick={() => onDelete(e.id)}>✕</button>
                    </td>
                  </tr>
                ))}
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
  const [savingCrit, setSavingCrit] = useState(false)

  const showToast = msg => setToast(msg)

  // Cargar pipeline y criterios al inicio
  useEffect(() => {
    fetch('/api/pipeline').then(r => r.json()).then(d => { if (d.data) setPipeline(d.data) })
    fetch('/api/pipeline?type=criterios').then(r => r.json()).then(d => { if (d.data) setCriterios(d.data) })
  }, [])

  const analizar = () => {
    if (!form.razon || !form.ventas) { showToast('Completá al menos la Razón Social y las Ventas.'); return }
    const meses_post = [form.m1, form.m2, form.m3, form.m4, form.m5, form.m6]
    const r = calcularRatios({ ...form, meses_post })
    const elig = evalElegibilidad(r, form.antiguedad, form.fin_sol, criterios)
    setResultado({ r, elig, form: { ...form } })
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
    const headers = ['Empresa','CUIT','Sector','Antigüedad','Ventas','EBITDA','Mg.EBITDA%','Liquidez','Endeudamiento','CT','D/Ventas(m)','D/EBITDA(m)','Score','Estado']
    const rows = pipeline.map(e => [
      e.form.razon, e.form.cuit, e.form.sector, e.form.antiguedad,
      e.form.ventas, e.r.ebitda, e.r.margen_ebitda.toFixed(1),
      e.r.liquidez.toFixed(2), e.r.endeudamiento.toFixed(2),
      e.r.capital_trabajo, e.r.deuda_meses_ventas.toFixed(2),
      e.r.ebitda_mens > 0 ? e.r.deuda_meses_ebitda.toFixed(2) : 'n/a',
      e.elig.score, e.elig.status
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }))
    a.download = `fixus_pipeline_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const cargarEjemplo = () => setForm({
    razon:'Metalúrgica del Sur S.A.', cuit:'30-71234567-9', sector:'Manufactura metalmecánica', destino:'Capital de trabajo y maquinaria',
    antiguedad:12, fin_sol:10000,
    ventas_ant:78000, ebitda_ant:10200, deuda_ant:18000,
    ventas:85000, cmv:52000, gastos_op:12000, amort:3500, res_fin:-4200, imp:4500,
    act_co:32000, act_nco:28000, caja:5500, pas_co:18000, pas_nco:15000, pn:27000,
    dcp:8000, dlp:12000,
    m1:7200, m2:7500, m3:7900, m4:8100, m5:8400, m6:8800,
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

              <div className="card section-gap">
                <div className="card-header"><div className="section-dot" style={{background:'#64748B'}} /><span className="card-title">Ejercicio anterior (datos comparativos — $K)</span></div>
                <div className="card-body">
                  <div className="form-grid-3">
                    <Campo label="Ventas netas ej. anterior" id="ventas_ant" form={form} setForm={setForm} />
                    <Campo label="EBITDA ej. anterior" id="ebitda_ant" form={form} setForm={setForm} />
                    <Campo label="Deuda financiera ej. anterior" id="deuda_ant" form={form} setForm={setForm} />
                  </div>
                </div>
              </div>

              <div className="card section-gap">
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

              <div className="card section-gap">
                <div className="card-header"><div className="section-dot" style={{background:'#059669'}} /><span className="card-title">Último ejercicio — balance general ($K)</span></div>
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

              <div className="card section-gap">
                <div className="card-header"><div className="section-dot" style={{background:'#D97706'}} /><span className="card-title">Ventas mensuales post-balance ($K) — Mes 1 = más antiguo</span></div>
                <div className="card-body">
                  <div className="form-grid-6">
                    {['m1','m2','m3','m4','m5','m6'].map((id,i) => (
                      <Campo key={id} label={`Mes ${i+1}`} id={id} form={form} setForm={setForm} />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:12, marginTop:24 }}>
                <button className="btn btn-primary" onClick={analizar}>▶ Analizar empresa</button>
                <button className="btn btn-ghost" onClick={cargarEjemplo}>Cargar ejemplo demo</button>
                <button className="btn btn-ghost" onClick={() => setForm(FORM_EMPTY)}>↺ Limpiar</button>
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
                ? <PanelResultado resultado={resultado} onAgregar={agregarPipeline} loading={loading} />
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
