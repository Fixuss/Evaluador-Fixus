import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import { PERFIL_EMPTY, PERFIL_SECCIONES, buildResena, normalizeRazon, normalizePerfil } from '../lib/perfil'

// ── helpers ────────────────────────────────────────────────────────────────
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

// Calcula la key bajo la que se guarda un perfil: CUIT limpio (11 dígitos)
// si está disponible, si no la razón social normalizada (compat con
// perfiles viejos que todavía no tienen CUIT cargado).
function perfilKeyFor(form) {
  const cuitLimpio = (form.cuit || '').replace(/[-\s]/g, '')
  if (/^\d{11}$/.test(cuitLimpio)) return cuitLimpio
  return normalizeRazon(form.razon)
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [])
  return <div className="toast">{msg}</div>
}

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
const CHIP = {
  display:'inline-flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600,
  padding:'3px 10px', borderRadius:20,
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
      ) : id === 'facturacion_aprox' || id === 'sol_monto' ? (
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

function parseAISecciones(text) {
  const blocks = text.trim().split(/\n\n+/)
  const sections = []
  for (const block of blocks) {
    const match = block.match(/^\*\*(.+?)\*\*\n?([\s\S]*)$/)
    if (match) {
      sections.push({ titulo: match[1].trim(), texto: match[2].trim() })
    } else if (block.trim() && sections.length > 0) {
      sections[sections.length - 1].texto += '\n\n' + block.trim()
    } else if (block.trim()) {
      sections.push({ titulo: '', texto: block.trim() })
    }
  }
  return sections.filter(s => s.texto)
}

function PanelPerfil({ form, setForm, perfilesList, onLoad, onNew, onDelete, onSave, saving, resenaVisible, setResenaVisible, onPDF, pdfLoading, usuarioActual, onToast }) {
  const resena = useMemo(() => buildResena(form), [form])
  const fechaInforme = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })
  const perfilKey = perfilKeyFor(form)
  const cuitLimpio = (form.cuit || '').replace(/[-\s]/g, '')
  const cuitValido = /^\d{11}$/.test(cuitLimpio)

  // ── Búsqueda AFIP ──────────────────────────────────────────────────────
  const [buscandoCuit, setBuscandoCuit] = useState(false)
  const [cuitError, setCuitError] = useState('')
  const [afipData, setAfipData] = useState(null)

  const buscarCuit = async () => {
    if (!cuitValido) { setCuitError('Ingresá un CUIT de 11 dígitos'); return }
    setCuitError('')
    setBuscandoCuit(true)
    try {
      const res = await fetch(`/api/buscar-cuit?cuit=${cuitLimpio}`)
      const data = await res.json()
      if (res.ok) {
        const partes = (data.domicilio || '').split(',').map(s => s.trim())
        const provincia = partes.length >= 3 ? partes[partes.length - 1] : ''
        const localidad = partes.length >= 2 ? partes[partes.length - 2] : ''
        setForm(f => ({
          ...f,
          ...(data.razonSocial && { razon: data.razonSocial }),
          ...(data.actividad   && { sector: data.actividad }),
          ...(data.domicilio   && { domicilio: data.domicilio }),
          ...(localidad        && { localidad }),
          ...(provincia        && { provincia }),
          ...(data.fechaInscripcion && { fecha_constitucion: data.fechaInscripcion.slice(0, 10) }),
        }))
        setAfipData({ estadoClave: data.estadoClave, tipoPersona: data.tipoPersona, domicilio: data.domicilio })
      } else {
        setCuitError(data.error || 'No se encontró el CUIT')
      }
    } catch { setCuitError('Error de conexión') }
    finally { setBuscandoCuit(false) }
  }

  // ── IA: profesionalizar reseña ────────────────────────────────────────────
  const [aiTexto, setAiTexto] = useState('')
  const [aiResena, setAiResena] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)

  const profesionalizarConIA = async () => {
    if (!resena || resena.length === 0) return
    setAiLoading(true)
    setAiError(null)
    setAiTexto('')
    setAiResena(null)
    try {
      const res = await fetch('/api/profesionalizar-resena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secciones: resena, empresa: form.razon }),
      })
      if (!res.ok) throw new Error('Error al conectar con la IA')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setAiTexto(fullText)
      }
      setAiResena(parseAISecciones(fullText))
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiLoading(false)
    }
  }

  const displayResena = aiResena || resena

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

      {/* Búsqueda AFIP — completa razón social, sector y domicilio por CUIT */}
      <div className="card section-gap" style={{ padding:'14px 18px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#4a69cc', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
          Buscar empresa en AFIP
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <input
            type="text"
            value={form.cuit || ''}
            onChange={e => { setForm(f => ({ ...f, cuit: e.target.value })); setCuitError(''); setAfipData(null) }}
            onKeyDown={e => e.key === 'Enter' && buscarCuit()}
            placeholder="30-12345678-9"
            style={{ flex:1, padding:'8px 10px', border:`1px solid ${cuitError ? '#ef4444' : '#c9d2ee'}`, borderRadius:8, fontSize:14, fontFamily:'inherit' }}
          />
          <button className="btn btn-primary" onClick={buscarCuit} disabled={buscandoCuit} style={{ fontSize:13, whiteSpace:'nowrap' }}>
            {buscandoCuit ? '...' : '🔍 Buscar'}
          </button>
        </div>
        {cuitError && (
          <div style={{ marginTop:8, padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, fontSize:13, color:'#991B1B' }}>
            ⚠ {cuitError}
          </div>
        )}
        {!cuitValido && form.cuit && !cuitError && (
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:8 }}>El link para el cliente queda vinculado a la razón social hasta que cargues un CUIT válido.</div>
        )}
        {afipData && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
            {afipData.estadoClave && (
              <span style={{ ...CHIP, background: afipData.estadoClave === 'ACTIVO' ? '#dcfce7' : '#fee2e2', color: afipData.estadoClave === 'ACTIVO' ? '#166534' : '#991b1b' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: afipData.estadoClave === 'ACTIVO' ? '#16a34a' : '#dc2626', display:'inline-block' }} />
                {afipData.estadoClave}
              </span>
            )}
            {afipData.tipoPersona && (
              <span style={{ ...CHIP, background:'#eff6ff', color:'#1e40af' }}>
                {afipData.tipoPersona === 'JURIDICA' ? 'Persona jurídica' : 'Persona física'}
              </span>
            )}
            {afipData.domicilio && (
              <span style={{ ...CHIP, background:'#fafafa', color:'#475569', border:'1px solid #e2e8f0' }}>
                📍 {afipData.domicilio}
              </span>
            )}
          </div>
        )}
      </div>

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
              <img src="/logo_white.png" alt="Fixus" className="pdf-logo" style={{ height: 29 }} />
              <div className="pdf-header-title" style={{ textAlign: 'center' }}>
                <div className="pdf-title">Reseña corporativa</div>
              </div>
              <div className="pdf-header-date">{fechaInforme}</div>
            </div>
            <div className="pdf-header-meta">
              <div><strong>Razón social:</strong> {form.razon || '—'}</div>
              <div><strong>Ubicación:</strong> {[form.localidad, form.provincia].filter(Boolean).join(', ') || '—'}</div>
              <div><strong>Facturación:</strong> {form.facturacion_aprox || '—'}</div>
              <div><strong>CUIT:</strong> {form.cuit || '—'}</div>
              <div><strong>Sector:</strong> {form.sector || '—'}</div>
              <div><strong>Antigüedad:</strong> {form.fecha_constitucion ? `${new Date().getFullYear() - new Date(form.fecha_constitucion).getFullYear()} años` : '—'}</div>
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
                {aiLoading && !aiResena ? (
                  <div className="memo-section">
                    <div className="memo-text" style={{ whiteSpace:'pre-wrap', color:'#6366f1', minHeight:60 }}>
                      {aiTexto || 'Profesionalizando con IA…'}
                    </div>
                  </div>
                ) : (
                  displayResena.map((s, i) => (
                    <div key={i} className="memo-section">
                      <div className="memo-title">{s.titulo}</div>
                      <div className="memo-text" style={{ whiteSpace:'pre-wrap' }}>{s.texto}</div>
                    </div>
                  ))
                )}
                {aiResena && (
                  <div className="ai-badge" style={{ fontSize:11, color:'#6366f1', marginTop:8, fontStyle:'italic' }}>
                    ✨ Reseña profesionalizada con IA
                  </div>
                )}
                {aiError && (
                  <div style={{ fontSize:12, color:'#DC2626', marginTop:8 }}>
                    Error: {aiError}
                  </div>
                )}
                <div className="memo-footer">
                  Fixus — Consultora para PyMEs · Documento de uso interno
                </div>
              </div>
            </div>
          </div>

          <div className="action-bar" style={{ marginTop:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <button className="btn btn-primary" onClick={() => onPDF('digital')} disabled={pdfLoading} title="PDF continuo para lectura en pantalla">
              {pdfLoading ? <span className="spinner" /> : '📄'} Descargar PDF
            </button>
            <button className="btn btn-ghost" onClick={() => onPDF('imprimible')} disabled={pdfLoading} title="PDF paginado A4 para imprimir">
              {pdfLoading ? <span className="spinner" /> : '🖨'} PDF imprimible
            </button>
            {aiResena ? (
              <button className="btn btn-ghost" onClick={() => { setAiResena(null); setAiTexto('') }}>
                ↩ Versión original
              </button>
            ) : (
              <button
                className="btn"
                style={{ background:'#6366f1', color:'#fff', opacity: aiLoading ? 0.7 : 1 }}
                onClick={profesionalizarConIA}
                disabled={aiLoading || resena.length === 0}
                title="Mejora la redacción con inteligencia artificial"
              >
                {aiLoading ? <><span className="spinner" /> Profesionalizando…</> : '✨ Profesionalizar con IA'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── APP PRINCIPAL ──────────────────────────────────────────────────────────

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

  const [toast, setToast] = useState(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  // Perfil cualitativo
  const [perfilForm, setPerfilForm] = useState(PERFIL_EMPTY)
  const [perfiles, setPerfiles] = useState({}) // dict { [key]: perfil } — key = CUIT limpio (o razón normalizada, legacy)
  const [loadedKey, setLoadedKey] = useState('') // key bajo la que está guardado el perfil actualmente abierto
  const [perfilSaving, setPerfilSaving] = useState(false)
  const [resenaVisible, setResenaVisible] = useState(false)

  const showToast = msg => setToast(msg)

  // Cargar perfiles guardados al inicio
  useEffect(() => {
    fetch('/api/perfiles').then(r => r.json()).then(d => { if (d.data) setPerfiles(d.data) })
  }, [])

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
    const key = perfilKeyFor(perfilForm)
    const perfil = { ...perfilForm, actualizado_en: new Date().toISOString() }
    try {
      await fetch('/api/perfiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_perfil', payload: { key, oldKey: loadedKey, perfil } }),
      })
      setPerfiles(prev => {
        const n = { ...prev }
        if (loadedKey && loadedKey !== key) delete n[loadedKey]
        n[key] = perfil
        return n
      })
      setLoadedKey(key)
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
    setLoadedKey(key)
    setResenaVisible(false)
    showToast(`Perfil de "${p.razon}" cargado`)
  }

  const nuevoPerfil = () => {
    setPerfilForm(PERFIL_EMPTY)
    setLoadedKey('')
    setResenaVisible(false)
  }

  const eliminarPerfil = async (key) => {
    if (!confirm('¿Eliminar este perfil? No se puede deshacer.')) return
    await fetch('/api/perfiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_perfil', payload: { key } }),
    })
    setPerfiles(prev => {
      const n = { ...prev }
      delete n[key]
      return n
    })
    if (loadedKey === key) { setPerfilForm(PERFIL_EMPTY); setLoadedKey('') }
    showToast('Perfil eliminado')
  }

  const generarResenaPDF = (modo) => {
    generarPDF(modo, {
      nodeId: 'resena-root',
      filenameBase: 'Resena-Fixus',
      razon: perfilForm.razon || 'empresa',
    })
  }

  // Exporta un nodo como PDF. modo: 'digital' = página continua; 'imprimible' = multipágina A4.
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
      const razonParaNombre = razon ?? 'informe'
      const safe = razonParaNombre.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')
      const toImg = c => c.toDataURL('image/jpeg', 0.92)

      if (modo === 'digital') {
        const MAX_PAGE_H = 14400
        if (imgH <= MAX_PAGE_H) {
          const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: [A4_W, imgH] })
          pdf.addImage(toImg(canvas), 'JPEG', 0, 0, A4_W, imgH)
          pdf.save(`${filenameBase}-${safe}-${fecha}.pdf`)
          showToast('PDF digital generado ✓')
          return
        }
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
          <div style={{ padding:'14px 16px', borderTop:'1px solid rgba(255,255,255,.08)', marginTop:'auto' }}>
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
          <div className="page-header">
            <div className="page-title">Información cualitativa</div>
            <div className="page-sub">Buscá la empresa por CUIT, cargá el contexto y generá una reseña — o mandale el link para que lo complete ella misma</div>
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
            resenaVisible={resenaVisible}
            setResenaVisible={setResenaVisible}
            onPDF={generarResenaPDF}
            pdfLoading={pdfLoading}
            usuarioActual={usuarioActual}
            onToast={showToast}
          />
        </main>
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </>
  )
}
