import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { PERFIL_SECCIONES, normalizePerfil } from '../../lib/perfil'

// ── Shared field components (inline for public page) ──────────────────────

const TH = { padding:'9px 10px', textAlign:'left', background:'#eef2ff', borderBottom:'2px solid #c9d2ee', fontSize:12, fontWeight:700, color:'#4a69cc', textTransform:'uppercase', letterSpacing:'.04em' }
const INP = { width:'100%', padding:'9px 11px', fontSize:13, border:'1px solid #c9d2ee', borderRadius:7, background:'#fff', fontFamily:'inherit', outline:'none', color:'#1a2840' }

function CampoAccionistas({ label, form, setForm }) {
  const accs = form.accionistas || []
  const upd = (i, f, v) => setForm(p => { const a=[...( p.accionistas||[])]; a[i]={...a[i],[f]:v}; return {...p,accionistas:a} })
  const add = () => setForm(p => ({ ...p, accionistas:[...(p.accionistas||[]),{nombre:'',participacion:'',cuit:'',rol:''}] }))
  const rem = (i) => setForm(p => ({ ...p, accionistas:(p.accionistas||[]).filter((_,j)=>j!==i) }))
  return (
    <div className="field" style={{ gridColumn:'span 2' }}>
      <label style={{ marginBottom:8, display:'block' }}>{label}</label>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr>
            {['Nombre / Razón Social','% Participación','CUIT','Rol'].map(h=><th key={h} style={TH}>{h}</th>)}
            <th style={{ ...TH, width:36 }} />
          </tr></thead>
          <tbody>
            {accs.map((a,i)=>(
              <tr key={i} style={{ borderBottom:'1px solid #e8edf8' }}>
                <td style={{ padding:'6px 4px' }}><input type="text" value={a.nombre} onChange={e=>upd(i,'nombre',e.target.value)} placeholder="Nombre o razón social" style={INP} /></td>
                <td style={{ padding:'6px 4px', width:120 }}><input type="text" value={a.participacion} onChange={e=>upd(i,'participacion',e.target.value)} placeholder="ej. 50%" style={INP} /></td>
                <td style={{ padding:'6px 4px', width:160 }}><input type="text" value={a.cuit} onChange={e=>upd(i,'cuit',e.target.value)} placeholder="XX-XXXXXXXX-X" style={INP} /></td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={a.rol} onChange={e=>upd(i,'rol',e.target.value)} placeholder="Presidente, Gerente…" style={INP} /></td>
                <td style={{ padding:'6px 4px', textAlign:'center' }}>
                  {accs.length > 1 && <button type="button" onClick={()=>rem(i)} style={{ background:'none',border:'none',cursor:'pointer',color:'#DC2626',fontSize:18,lineHeight:1 }}>×</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost" onClick={add} style={{ marginTop:8,fontSize:12 }}>+ Agregar accionista</button>
    </div>
  )
}

function CampoTabla({ label, fieldId, colPct, form, setForm }) {
  const items = form[fieldId] || []
  const upd = (i, f, v) => setForm(p => { const a=[...(p[fieldId]||[])]; a[i]={...a[i],[f]:v}; return {...p,[fieldId]:a} })
  return (
    <div className="field" style={{ gridColumn:'span 2' }}>
      <label style={{ marginBottom:8, display:'block' }}>{label}</label>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead><tr>
            <th style={{ ...TH, width:28 }}>#</th>
            <th style={TH}>Nombre / Razón Social</th>
            <th style={{ ...TH, width:165 }}>CUIT</th>
            <th style={{ ...TH, width:145 }}>{colPct}</th>
          </tr></thead>
          <tbody>
            {items.map((item,i)=>(
              <tr key={i} style={{ borderBottom:'1px solid #e8edf8' }}>
                <td style={{ padding:'6px 8px', textAlign:'center', color:'#94a3b8', fontWeight:700, fontSize:12 }}>{i+1}</td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={item.nombre} onChange={e=>upd(i,'nombre',e.target.value)} placeholder="Nombre o razón social" style={INP} /></td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={item.cuit} onChange={e=>upd(i,'cuit',e.target.value)} placeholder="XX-XXXXXXXX-X" style={INP} /></td>
                <td style={{ padding:'6px 4px' }}><input type="text" value={item.porcentaje} onChange={e=>upd(i,'porcentaje',e.target.value)} placeholder="ej. 25%" style={INP} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Campo({ def, form, setForm }) {
  const { id, label, type='text', placeholder='', rows=3, span=1, required=false } = def
  const val = form[id] ?? ''
  const onChange = e => setForm(f => ({ ...f, [id]: e.target.value }))
  const style = span > 1 ? { gridColumn:`span ${span}` } : {}

  if (type === 'accionistas') return <CampoAccionistas label={label} form={form} setForm={setForm} />
  if (type === 'clientes_tabla') return <CampoTabla label={label} fieldId="clientes_tabla" colPct="% de facturación" form={form} setForm={setForm} />
  if (type === 'proveedores_tabla') return <CampoTabla label={label} fieldId="proveedores_tabla" colPct="% de compras" form={form} setForm={setForm} />

  return (
    <div className="field" style={style}>
      <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      {type === 'textarea' ? (
        <textarea id={id} value={val} onChange={onChange} placeholder={placeholder} rows={rows}
          style={{ width:'100%', padding:'10px 12px', fontSize:13, border:'1px solid #c9d2ee', borderRadius:8, background:'#fff', resize:'vertical', fontFamily:'inherit', lineHeight:1.5, outline:'none' }} />
      ) : (
        <input id={id} type={type} value={val} onChange={onChange} placeholder={placeholder} />
      )}
    </div>
  )
}

// ── Secciones públicas (sin "Observaciones finales") ──────────────────────
const SECCIONES_CLIENTE = PERFIL_SECCIONES.filter(s => s.titulo !== 'Observaciones finales')

// ── Estados ───────────────────────────────────────────────────────────────

function Loader() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:16 }}>
      <div className="spinner" style={{ width:32, height:32, borderWidth:3 }} />
      <div style={{ color:'#64748b', fontSize:14 }}>Cargando formulario…</div>
    </div>
  )
}

function EstadoFinal({ icon, title, text, color='#059669', bg='#ECFDF5', border='#A7F3D0' }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:20, padding:'40px 20px' }}>
      <div style={{ fontSize:56 }}>{icon}</div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:22, fontWeight:700, color, marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:15, color:'#475569', maxWidth:480, lineHeight:1.6 }}>{text}</div>
      </div>
      <div style={{ padding:'14px 20px', background:bg, border:`1px solid ${border}`, borderRadius:12, fontSize:13, color, maxWidth:400, textAlign:'center' }}>
        Fixus — Consultora para PyMEs · Formulario de perfil empresarial
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────

export default function FormularioCliente() {
  const router = useRouter()
  const { token } = router.query

  const [status, setStatus] = useState('loading')
  const [entry, setEntry] = useState(null)
  const [form, setForm] = useState(null)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`/api/formulario?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.data) { setStatus('notfound'); return }
        if (d.data.submitted) { setStatus('already_submitted'); setEntry(d.data); return }
        setEntry(d.data)
        setForm(normalizePerfil(d.data.prefill || {}))
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [token])

  const handleSubmit = async () => {
    if (!form?.razon?.trim()) { setErrMsg('Por favor completá al menos la Razón Social antes de enviar.'); return }
    setErrMsg('')
    setStatus('submitting')
    try {
      const res = await fetch('/api/formulario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', payload: { token, respuesta: form } }),
      })
      const d = await res.json()
      if (d.ok) { setStatus('submitted') }
      else { setErrMsg(d.error || 'Error al enviar. Intentá de nuevo.'); setStatus('ready') }
    } catch {
      setErrMsg('Error de conexión. Verificá tu internet e intentá de nuevo.')
      setStatus('ready')
    }
  }

  const razon = entry?.razon || entry?.prefill?.razon || ''

  return (
    <>
      <Head>
        <title>{razon ? `Formulario — ${razon} · Fixus` : 'Formulario Empresarial · Fixus'}</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div style={{ maxWidth:780, margin:'0 auto', padding:'28px 16px 60px' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg, #0e2c50 0%, #1a3c5e 100%)', borderRadius:14, padding:'24px 28px', marginBottom:24, color:'#fff' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:razon ? 12 : 0 }}>
            <img src="/logo_white.png" alt="Fixus" style={{ height:36, width:'auto', objectFit:'contain' }} />
            <div>
              <div style={{ fontSize:18, fontWeight:700, letterSpacing:'-.2px' }}>Formulario de Perfil Empresarial</div>
              <div style={{ fontSize:12, opacity:.7, marginTop:2 }}>Fixus — Consultora para PyMEs</div>
            </div>
          </div>
          {razon && (
            <div style={{ borderTop:'1px solid rgba(255,255,255,.15)', marginTop:14, paddingTop:14, fontSize:13, opacity:.9 }}>
              Formulario enviado a: <strong>{razon}</strong>
            </div>
          )}
        </div>

        {/* Estados especiales */}
        {status === 'loading' && <Loader />}

        {status === 'notfound' && (
          <EstadoFinal icon="🔍" title="Formulario no encontrado" color='#DC2626' bg='#FEF2F2' border='#FECACA'
            text="El link que recibiste no es válido o ya fue eliminado. Solicitá un nuevo link al analista de Fixus." />
        )}

        {status === 'error' && (
          <EstadoFinal icon="⚠️" title="Error al cargar el formulario" color='#D97706' bg='#FFFBEB' border='#FDE68A'
            text="Ocurrió un error inesperado. Intentá recargar la página. Si el problema persiste, contactá al analista." />
        )}

        {status === 'already_submitted' && (
          <EstadoFinal icon="✅" title="Formulario ya enviado" color='#059669' bg='#ECFDF5' border='#A7F3D0'
            text={`Este formulario ya fue completado y enviado. El analista de Fixus recibirá la información. Muchas gracias${razon ? `, ${razon}` : ''}.`} />
        )}

        {status === 'submitted' && (
          <EstadoFinal icon="🎉" title="¡Formulario enviado con éxito!" color='#059669' bg='#ECFDF5' border='#A7F3D0'
            text="Tu información fue recibida. El equipo de Fixus analizará los datos y se pondrá en contacto a la brevedad. ¡Muchas gracias!" />
        )}

        {/* Instrucciones */}
        {(status === 'ready' || status === 'submitting') && form && (
          <>
            <div style={{ background:'#fff', border:'1px solid rgba(74,105,204,.18)', borderRadius:12, padding:'16px 20px', marginBottom:24, fontSize:13, color:'#334155', lineHeight:1.6 }}>
              <strong style={{ color:'#0e2c50' }}>Instrucciones:</strong> Completá los campos de cada sección con la información de tu empresa. Los campos marcados con <span style={{ color:'#DC2626' }}>*</span> son obligatorios. Al finalizar, hacé clic en <strong>"Enviar formulario"</strong> al final de la página.
            </div>

            {/* Secciones del formulario */}
            {SECCIONES_CLIENTE.map((sec, si) => (
              <div key={si} className="card section-gap card--indigo">
                <div className="card-header">
                  <div className="section-dot" />
                  <span className="card-title">{sec.titulo}</span>
                </div>
                <div className="card-body">
                  <div className="form-grid">
                    {sec.campos.map(c => (
                      <Campo key={c.id} def={c} form={form} setForm={setForm} />
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Error de validación */}
            {errMsg && (
              <div style={{ marginTop:20, padding:'12px 16px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:10, fontSize:13, color:'#DC2626' }}>
                {errMsg}
              </div>
            )}

            {/* Botón enviar */}
            <div style={{ marginTop:28, display:'flex', alignItems:'center', gap:14 }}>
              <button
                className="btn btn-success"
                onClick={handleSubmit}
                disabled={status === 'submitting'}
                style={{ fontSize:15, padding:'13px 32px', fontWeight:700 }}
              >
                {status === 'submitting' ? <><span className="spinner" /> Enviando…</> : '✓ Enviar formulario'}
              </button>
              <div style={{ fontSize:12, color:'#94a3b8' }}>Tus datos se envían de forma segura a Fixus</div>
            </div>
          </>
        )}

      </div>
    </>
  )
}
