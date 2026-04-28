#!/usr/bin/env python3
"""
Patch pages/index.js: replace file-based form sharing with token/link-based approach.
Run with: python3 patch_index.py
"""
import re, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(BASE, 'pages', 'index.js')

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

changes = 0

# ── 1. PanelPerfil: replace signature + file-handling block ───────────────
OLD1 = '''function PanelPerfil({ form, setForm, perfilesList, onLoad, onNew, onDelete, onSave, saving, pipelineMatch, resenaVisible, setResenaVisible, onPDF, pdfLoading, onCargarFormulario }) {
  const resena = useMemo(() => buildResena(form, pipelineMatch), [form, pipelineMatch])
  const fileInputRef = useRef(null)

  const handleDescargar = () => {
    const html = generarFormularioHTML(form)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'formulario_' + (form.razon || 'empresa').replace(/[^a-zA-Z0-9]/g,'_').substring(0,30) + '.html'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCargarFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        onCargarFormulario(data)
      } catch {
        alert('El archivo no es un JSON válido. Asegurate de cargar el archivo exportado por el formulario.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }
  const fechaInforme = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })
  const perfilKey = normalizeRazon(form.razon)'''

NEW1 = '''function PanelPerfil({ form, setForm, perfilesList, onLoad, onNew, onDelete, onSave, saving, pipelineMatch, resenaVisible, setResenaVisible, onPDF, pdfLoading, usuarioActual, onToast }) {
  const resena = useMemo(() => buildResena(form, pipelineMatch), [form, pipelineMatch])
  const fechaInforme = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })
  const perfilKey = normalizeRazon(form.razon)

  // ── Token compartible ─────────────────────────────────────────────────────
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
  }'''

if OLD1 in src:
    src = src.replace(OLD1, NEW1, 1)
    changes += 1
    print("✓ Patch 1: PanelPerfil signature + token logic")
else:
    print("✗ Patch 1 not found — skipping")

# ── 2. "Formulario para el cliente" section: replace file buttons with link UI ──
OLD2 = '''      {/* Formulario para el cliente */}
      <div className="card section-gap" style={{ background:'linear-gradient(135deg,#f8faff 0%,#eef2ff 100%)', border:'1px solid rgba(74,105,204,.18)' }}>
        <div style={{ padding:'14px 20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#4a69cc', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
            Formulario para el cliente
          </div>
          <div style={{ fontSize:13, color:'#475569', marginBottom:14, lineHeight:1.5 }}>
            Descargá el formulario, enviaselo al cliente para que lo complete y luego cargalo para auto-completar el perfil.
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button className="btn btn-ghost sim-btn" onClick={handleDescargar} style={{ fontSize:13 }}>
              ⬇ Descargar formulario
            </button>
            <button className="btn btn-ghost sim-btn" onClick={() => fileInputRef.current?.click()} style={{ fontSize:13 }}>
              ⬆ Cargar formulario completado
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleCargarFile} style={{ display:'none' }} />
          </div>
        </div>
      </div>'''

NEW2 = '''      {/* Formulario para el cliente — link compartible */}
      <div className="card section-gap" style={{ background:'linear-gradient(135deg,#f8faff 0%,#eef2ff 100%)', border:'1px solid rgba(74,105,204,.18)' }}>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#4a69cc', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
            Formulario para el cliente
          </div>

          {/* Sin link aún */}
          {!tokenData && (
            <>
              <div style={{ fontSize:13, color:'#475569', marginBottom:14, lineHeight:1.5, marginTop:6 }}>
                Generá un link único para que el cliente complete la información de su empresa desde cualquier dispositivo.
              </div>
              <button className="btn btn-primary" onClick={crearLink} disabled={tokenLoading || !form.razon} style={{ fontSize:13 }}>
                {tokenLoading ? <span className="spinner" /> : '🔗'} Generar link para el cliente
              </button>
              {!form.razon && <div style={{ fontSize:12, color:'#94a3b8', marginTop:6 }}>Cargá la Razón Social primero</div>}
            </>
          )}

          {/* Link creado, esperando respuesta */}
          {tokenData && !tokenData.submitted && (
            <>
              <div style={{ fontSize:13, color:'#475569', marginTop:6, marginBottom:10, lineHeight:1.5 }}>
                Compartí este link con el cliente. Cuando lo complete, podrás importar los datos automáticamente.
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
                <input
                  readOnly value={tokenData.url || ''}
                  style={{ flex:1, padding:'9px 12px', fontSize:12, border:'1px solid #c9d2ee', borderRadius:8, background:'#f8faff', color:'#334155', outline:'none', fontFamily:'monospace' }}
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

          {/* Respuesta recibida */}
          {tokenData && tokenData.submitted && (
            <>
              <div style={{ marginTop:10, padding:'12px 14px', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:10, fontSize:13, color:'#065F46', marginBottom:14 }}>
                ✓ El cliente completó el formulario{tokenData.submitted_at ? ` el ${new Date(tokenData.submitted_at).toLocaleDateString('es-AR')}` : ''}.
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
      </div>'''

if OLD2 in src:
    src = src.replace(OLD2, NEW2, 1)
    changes += 1
    print("✓ Patch 2: Formulario para el cliente section")
else:
    print("✗ Patch 2 not found — skipping")

# ── 3. Remove handleCargarFormulario from App() ───────────────────────────
OLD3 = '''  const handleCargarFormulario = (data) => {
    setPerfilForm(normalizePerfil(data))
    setResenaVisible(false)
    showToast('Formulario del cliente cargado ✓')
  }

  const analizar = () => {'''

NEW3 = '''  const analizar = () => {'''

if OLD3 in src:
    src = src.replace(OLD3, NEW3, 1)
    changes += 1
    print("✓ Patch 3: removed handleCargarFormulario")
else:
    print("✗ Patch 3 not found — skipping")

# ── 4. Update PanelPerfil invocation ─────────────────────────────────────
OLD4 = '''                onPDF={generarResenaPDF}
                pdfLoading={pdfLoading}
                onCargarFormulario={handleCargarFormulario}
              />'''

NEW4 = '''                onPDF={generarResenaPDF}
                pdfLoading={pdfLoading}
                usuarioActual={usuarioActual}
                onToast={showToast}
              />'''

if OLD4 in src:
    src = src.replace(OLD4, NEW4, 1)
    changes += 1
    print("✓ Patch 4: PanelPerfil invocation updated")
else:
    print("✗ Patch 4 not found — skipping")

# ── Write ─────────────────────────────────────────────────────────────────
if changes > 0:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print(f"\nDone — {changes}/4 patches applied to pages/index.js")
else:
    print("\nNo changes applied.")

# ── Cleanup ───────────────────────────────────────────────────────────────
script_path = os.path.abspath(__file__)
os.unlink(script_path)
print("Patch script removed.")
