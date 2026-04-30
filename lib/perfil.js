// lib/perfil.js — módulo de perfil cualitativo de empresa + generador de reseña

export const PERFIL_EMPTY = {
  // Identificación
  razon: '',
  cuit: '',
  sector: '',
  fecha_constitucion: '',
  // Ubicación
  localidad: '',
  provincia: '',
  domicilio: '',
  // Dimensión
  empleados: '',
  facturacion_aprox: '',
  // Solicitud de crédito
  sol_monto: '',
  sol_destino: '',
  sol_plazo: '',
  // Narrativo
  historia: '',
  accionistas: [
    { nombre: '', participacion: '', cuit: '', rol: '' },
    { nombre: '', participacion: '', cuit: '', rol: '' },
  ],
  negocio: '',
  destino_fondos: '',
  productos: '',
  canales: '',
  infraestructura: '',
  // Mercado estructurado
  clientes_tabla: [
    { nombre: '', cuit: '', porcentaje: '' },
    { nombre: '', cuit: '', porcentaje: '' },
    { nombre: '', cuit: '', porcentaje: '' },
    { nombre: '', cuit: '', porcentaje: '' },
  ],
  proveedores_tabla: [
    { nombre: '', cuit: '', porcentaje: '' },
    { nombre: '', cuit: '', porcentaje: '' },
    { nombre: '', cuit: '', porcentaje: '' },
    { nombre: '', cuit: '', porcentaje: '' },
  ],
  // Contexto estratégico (reemplaza FODA)
  ventajas_competitivas: '',
  riesgos_principales: '',
  oportunidades_crecimiento: '',
  dependencias_clave: '',
  // Extras
  certificaciones: '',
  observaciones: '',
  // Metadatos (se completan al guardar)
  actualizado_en: '',
  creado_por: '',
}

// Normaliza y migra (si es necesario) un perfil cargado desde Redis o un JSON externo
export function normalizePerfil(raw) {
  if (!raw) return { ...PERFIL_EMPTY }
  const p = { ...PERFIL_EMPTY, ...raw }

  // Migrar socios string → accionistas array
  if (!Array.isArray(p.accionistas)) {
    const base = [
      { nombre: '', participacion: '', cuit: '', rol: '' },
      { nombre: '', participacion: '', cuit: '', rol: '' },
    ]
    if (p.socios && p.socios.trim()) base[0].nombre = p.socios.trim()
    p.accionistas = base
  }

  // Migrar clientes string → clientes_tabla
  if (!Array.isArray(p.clientes_tabla)) {
    p.clientes_tabla = [
      { nombre: '', cuit: '', porcentaje: '' },
      { nombre: '', cuit: '', porcentaje: '' },
      { nombre: '', cuit: '', porcentaje: '' },
      { nombre: '', cuit: '', porcentaje: '' },
    ]
  }

  // Migrar proveedores string → proveedores_tabla
  if (!Array.isArray(p.proveedores_tabla)) {
    p.proveedores_tabla = [
      { nombre: '', cuit: '', porcentaje: '' },
      { nombre: '', cuit: '', porcentaje: '' },
      { nombre: '', cuit: '', porcentaje: '' },
      { nombre: '', cuit: '', porcentaje: '' },
    ]
  }

  // Migrar FODA → contexto estratégico
  if (!p.ventajas_competitivas && !p.riesgos_principales && !p.oportunidades_crecimiento) {
    p.ventajas_competitivas = p.fortalezas || ''
    p.riesgos_principales = [p.debilidades, p.amenazas].filter(Boolean).join('. ') || ''
    p.oportunidades_crecimiento = p.oportunidades || ''
    p.dependencias_clave = p.dependencias_clave || ''
  }

  return p
}

// Lista de campos agrupados por sección, útil para render del form
export const PERFIL_SECCIONES = [
  {
    titulo: 'Identificación',
    campos: [
      { id: 'razon', label: 'Razón social', type: 'text', required: true, span: 2 },
      { id: 'cuit', label: 'CUIT', type: 'text' },
      { id: 'sector', label: 'Sector / Rubro', type: 'text' },
      { id: 'fecha_constitucion', label: 'Fecha de constitución', type: 'date' },
    ],
  },
  {
    titulo: 'Ubicación',
    campos: [
      { id: 'domicilio', label: 'Domicilio (calle y número)', type: 'text', span: 2 },
      { id: 'localidad', label: 'Localidad', type: 'text' },
      { id: 'provincia', label: 'Provincia', type: 'text' },
    ],
  },
  {
    titulo: 'Dimensión',
    campos: [
      { id: 'empleados', label: 'Cantidad de empleados', type: 'text' },
      { id: 'facturacion_aprox', label: 'Facturación aproximada', type: 'text', placeholder: 'ej. $500M anuales' },
    ],
  },
  {
    titulo: 'Solicitud de crédito',
    campos: [
      { id: 'sol_monto', label: 'Monto solicitado', type: 'text', placeholder: 'ej. $5.000.000' },
      { id: 'sol_plazo', label: 'Plazo solicitado', type: 'text', placeholder: 'ej. 24 meses' },
      { id: 'sol_destino', label: 'Destino del crédito', type: 'text', span: 2, placeholder: 'ej. Capital de trabajo' },
    ],
  },
  {
    titulo: 'Narrativa del negocio',
    campos: [
      { id: 'historia', label: 'Historia y origen', type: 'textarea', rows: 4, span: 2, placeholder: 'Año de inicio, fundadores, hitos de crecimiento, cambios relevantes…' },
      { id: 'accionistas', label: 'Accionistas y conducción', type: 'accionistas', span: 2 },
      { id: 'negocio', label: 'Modelo de negocio', type: 'textarea', rows: 4, span: 2, placeholder: 'A qué se dedica, cómo genera ingresos, ventaja competitiva…' },
      { id: 'destino_fondos', label: 'Destino de los fondos solicitados', type: 'textarea', rows: 2, span: 2, placeholder: 'Capital de trabajo, compra de maquinaria, expansión, inventario…' },
      { id: 'productos', label: 'Productos y servicios', type: 'textarea', rows: 3, span: 2, placeholder: 'Línea de productos/servicios principales, mix, estacionalidad' },
      { id: 'canales', label: 'Canales comerciales', type: 'textarea', rows: 2, span: 2, placeholder: 'Venta directa, distribuidores, e-commerce, exportación…' },
    ],
  },
  {
    titulo: 'Mercado — cartera comercial',
    campos: [
      { id: 'clientes_tabla', label: 'Principales clientes', type: 'clientes_tabla', span: 2 },
      { id: 'proveedores_tabla', label: 'Principales proveedores', type: 'proveedores_tabla', span: 2 },
    ],
  },
  {
    titulo: 'Infraestructura y operaciones',
    campos: [
      { id: 'infraestructura', label: 'Instalaciones y activos productivos', type: 'textarea', rows: 3, span: 2, placeholder: 'Planta, oficinas, sucursales, vehículos, maquinaria relevante' },
      { id: 'certificaciones', label: 'Certificaciones / habilitaciones / reconocimientos', type: 'textarea', rows: 2, span: 2 },
    ],
  },
  {
    titulo: 'Contexto estratégico',
    campos: [
      { id: 'ventajas_competitivas', label: '¿Cuáles son las principales ventajas competitivas frente a la competencia?', type: 'textarea', rows: 3, span: 2, placeholder: 'Marca, know-how, equipo, tecnología, precio, calidad…' },
      { id: 'riesgos_principales', label: '¿Cuáles son los principales riesgos o desafíos que enfrenta actualmente?', type: 'textarea', rows: 3, span: 2, placeholder: 'Contexto económico, competencia, capacidad operativa, regulación…' },
      { id: 'oportunidades_crecimiento', label: '¿Qué oportunidades de crecimiento identifica en el corto y mediano plazo?', type: 'textarea', rows: 3, span: 2, placeholder: 'Nuevos mercados, productos, clientes, exportación, ampliación de capacidad…' },
      { id: 'dependencias_clave', label: '¿Existe dependencia crítica de algún cliente, proveedor, persona clave o tecnología?', type: 'textarea', rows: 3, span: 2, placeholder: 'Describir si hay concentración relevante en alguna relación clave…' },
    ],
  },
  {
    titulo: 'Observaciones finales',
    campos: [
      { id: 'observaciones', label: 'Comentarios adicionales del analista', type: 'textarea', rows: 3, span: 2 },
    ],
  },
]

// Normaliza una razón social para matching: minúsculas, sin acentos, sin espacios extra
export function normalizeRazon(s) {
  if (!s) return ''
  return s
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Formato de fecha dd/mm/yyyy desde ISO yyyy-mm-dd
function fechaAR(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

// Calcula la antigüedad en años desde la fecha de constitución
function antiguedadDesde(iso) {
  if (!iso) return null
  const f = new Date(iso)
  if (isNaN(f.getTime())) return null
  const hoy = new Date()
  let years = hoy.getFullYear() - f.getFullYear()
  const m = hoy.getMonth() - f.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) years--
  return years
}

function cap(s) {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Devuelve las secciones del memo de reseña corporativa.
export function buildResena(p, pipelineMatch = null) {
  const razon = p.razon || 'La empresa'
  const secciones = []
  const ok = v => v && typeof v === 'string' && v.trim()
  const fmtM = v => { const n = parseInt(v.replace(/\D/g, ''), 10); return isNaN(n) ? v : '$' + n.toLocaleString('es-AR') }

  // ── Solicitud de crédito (primera sección) ───────────────────────────────────
  if (ok(p.sol_monto) || ok(p.sol_destino) || ok(p.sol_plazo)) {
    const partesSol = [
      ok(p.sol_monto) ? `Monto: ${fmtM(p.sol_monto.trim())}` : null,
      ok(p.sol_plazo) ? `Plazo: ${p.sol_plazo.trim()}` : null,
      ok(p.sol_destino) ? `Destino: ${p.sol_destino.trim()}` : null,
    ].filter(Boolean)
    secciones.push({ titulo: 'Solicitud de crédito', texto: partesSol.join('  ·  ') })
  }

  // ── 1. Identificación ───────────────────────────────────────────────────────
  const partes1 = []

  // Apertura: "X es una SA del sector Y, con sede en Z."
  const apertura = []
  if (ok(p.sector)) apertura.push(`del sector ${p.sector.trim()}`)
  const ubicacion = [p.localidad, p.provincia].filter(ok).map(s => s.trim()).join(', ')
  if (ubicacion) apertura.push(`con sede en ${ubicacion}`)
  if (ok(p.domicilio)) apertura.push(`(${p.domicilio.trim()})`)

  let frase1 = razon
  if (ok(p.cuit)) frase1 += ` (CUIT ${p.cuit.trim()})`
  if (apertura.length) frase1 += ` es una empresa ${apertura.join(', ')}.`
  else frase1 += ' es la empresa evaluada.'
  partes1.push(frase1)

  // Constitución y trayectoria
  if (ok(p.fecha_constitucion)) {
    const anios = antiguedadDesde(p.fecha_constitucion)
    const frase = anios != null
      ? `Fue constituida el ${fechaAR(p.fecha_constitucion)}, acumulando ${anios} año${anios !== 1 ? 's' : ''} de trayectoria en el mercado.`
      : `Fue constituida el ${fechaAR(p.fecha_constitucion)}.`
    partes1.push(frase)
  }

  // Dimensión
  const dim = []
  if (ok(p.empleados)) dim.push(`una plantilla de ${p.empleados.trim()} empleado${p.empleados.trim() !== '1' ? 's' : ''}`)
  if (ok(p.facturacion_aprox)) {
    const facVal = p.facturacion_aprox.trim().replace(/^\$/, '')
    dim.push(`una facturación aproximada de $${facVal}`)
  }
  if (dim.length) partes1.push(`La compañía cuenta con ${dim.join(' y ')}.`)

  secciones.push({ titulo: '1. Identificación y ficha básica', texto: partes1.join(' ') })

  // ── 2. Historia y origen ────────────────────────────────────────────────────
  if (ok(p.historia)) {
    secciones.push({ titulo: '2. Historia y origen', texto: cap(p.historia.trim()) })
  }

  // ── 3. Conducción y estructura societaria ───────────────────────────────────
  const accsArr = Array.isArray(p.accionistas) ? p.accionistas.filter(a => a && ok(a.nombre)) : []
  if (accsArr.length > 0 || ok(p.socios)) {
    let texto3 = ''
    if (accsArr.length > 0) {
      if (accsArr.length === 1) {
        const a = accsArr[0]
        const det = [
          ok(a.rol) ? `en carácter de ${a.rol.trim()}` : null,
          ok(a.participacion) ? `con el ${a.participacion.trim()}% de participación societaria` : null,
          ok(a.cuit) ? `(CUIT ${a.cuit.trim()})` : null,
        ].filter(Boolean).join(' ')
        texto3 = `La conducción de ${razon} recae en ${a.nombre.trim()}${det ? ', ' + det : ''}.`
      } else {
        const lineas = accsArr.map((a, idx) => {
          const det = [
            ok(a.participacion) ? `${a.participacion.trim()}% de participación` : null,
            ok(a.rol) ? a.rol.trim() : null,
            ok(a.cuit) ? `CUIT ${a.cuit.trim()}` : null,
          ].filter(Boolean).join(', ')
          return `${idx === 0 ? '' : idx === accsArr.length - 1 ? 'y ' : ''}${a.nombre.trim()}${det ? ` (${det})` : ''}`
        })
        texto3 = `La conducción y estructura societaria de ${razon} está integrada por ${lineas.join('; ')}.`
        const totalPct = accsArr
          .map(a => parseFloat((a.participacion || '').replace('%','').replace(',','.').trim()))
          .filter(n => !isNaN(n))
          .reduce((s, n) => s + n, 0)
        if (totalPct > 0 && totalPct <= 100) {
          texto3 += accsArr.length === 2
            ? ' La estructura societaria presenta participación distribuida entre ambos socios.'
            : ' La estructura societaria presenta participación distribuida entre los socios.'
        }
      }
    } else {
      texto3 = p.socios.trim()
    }
    secciones.push({ titulo: '3. Conducción y estructura societaria', texto: texto3 })
  }

  // ── 4. Modelo de negocio y oferta comercial ─────────────────────────────────
  const partes4 = []
  if (ok(p.negocio)) partes4.push(cap(p.negocio.trim()))
  if (ok(p.destino_fondos)) partes4.push(`En cuanto al destino de los fondos solicitados, ${razon} los destinará a ${p.destino_fondos.trim().replace(/^[A-Z]/, c => c.toLowerCase())}.`)
  if (ok(p.productos)) partes4.push(`La oferta comercial de la empresa comprende: ${p.productos.trim()}.`)
  if (ok(p.canales)) partes4.push(`Sus canales comerciales incluyen ${p.canales.trim().replace(/^[A-Z]/, c => c.toLowerCase())}.`)
  if (partes4.length) {
    secciones.push({ titulo: '4. Modelo de negocio y oferta comercial', texto: partes4.join(' ') })
  }

  // ── 5. Cartera comercial ────────────────────────────────────────────────────
  const cliArr = Array.isArray(p.clientes_tabla) ? p.clientes_tabla.filter(c => c && ok(c.nombre)) : []
  const provArr = Array.isArray(p.proveedores_tabla) ? p.proveedores_tabla.filter(pr => pr && ok(pr.nombre)) : []

  const partes5 = []
  if (cliArr.length > 0) {
    const listaCli = cliArr.map(c => {
      const det = [
        ok(c.porcentaje) ? `representa el ${c.porcentaje.trim().replace(/%$/, '')}% de la facturación` : null,
        ok(c.cuit) ? `CUIT ${c.cuit.trim()}` : null,
      ].filter(Boolean)
      return `${c.nombre.trim()}${det.length ? ` (${det.join(', ')})` : ''}`
    })
    const intro = cliArr.length === 1
      ? `El principal cliente de ${razon} es ${listaCli[0]}.`
      : `Entre los principales clientes de ${razon} se destacan ${listaCli.slice(0,-1).join(', ')} y ${listaCli.slice(-1)[0]}.`
    partes5.push(intro)
  } else if (ok(p.clientes)) {
    partes5.push(`Clientes principales: ${p.clientes.trim()}.`)
  }

  if (provArr.length > 0) {
    const listaProv = provArr.map(pr => {
      const det = [
        ok(pr.porcentaje) ? `representa el ${pr.porcentaje.trim().replace(/%$/, '')}% de las compras` : null,
        ok(pr.cuit) ? `CUIT ${pr.cuit.trim()}` : null,
      ].filter(Boolean)
      return `${pr.nombre.trim()}${det.length ? ` (${det.join(', ')})` : ''}`
    })
    const introProv = provArr.length === 1
      ? `El principal proveedor de la compañía es ${listaProv[0]}.`
      : `En el plano de los proveedores, los más relevantes son ${listaProv.slice(0,-1).join(', ')} y ${listaProv.slice(-1)[0]}.`
    partes5.push(introProv)
  } else if (ok(p.proveedores)) {
    partes5.push(`Proveedores principales: ${p.proveedores.trim()}.`)
  }

  if (partes5.length) {
    secciones.push({ titulo: '5. Cartera comercial', texto: partes5.join(' ') })
  }

  // ── 6. Infraestructura y operaciones ────────────────────────────────────────
  const partes6 = []
  if (ok(p.infraestructura)) partes6.push(cap(p.infraestructura.trim()))
  if (ok(p.certificaciones)) partes6.push(`En materia de certificaciones y habilitaciones, ${razon} cuenta con: ${p.certificaciones.trim()}.`)
  if (partes6.length) {
    secciones.push({ titulo: '6. Infraestructura y operaciones', texto: partes6.join(' ') })
  }

  // ── 7. Contexto estratégico ─────────────────────────────────────────────────
  const partes7 = []
  const vc = ok(p.ventajas_competitivas) ? p.ventajas_competitivas.trim() : (ok(p.fortalezas) ? p.fortalezas.trim() : null)
  const rp = ok(p.riesgos_principales) ? p.riesgos_principales.trim() : ([p.debilidades, p.amenazas].filter(ok).map(s=>s.trim()).join('. ') || null)
  const oc = ok(p.oportunidades_crecimiento) ? p.oportunidades_crecimiento.trim() : (ok(p.oportunidades) ? p.oportunidades.trim() : null)
  const dk = ok(p.dependencias_clave) ? p.dependencias_clave.trim() : null

  if (vc) partes7.push(`Las principales ventajas competitivas de ${razon} residen en ${vc.replace(/^[A-Z]/, c => c.toLowerCase())}.`)
  if (rp) partes7.push(`Entre los riesgos y desafíos que enfrenta la compañía se destacan ${rp.replace(/^[A-Z]/, c => c.toLowerCase())}.`)
  if (oc) partes7.push(`En cuanto a oportunidades de crecimiento, la empresa identifica ${oc.replace(/^[A-Z]/, c => c.toLowerCase())}.`)
  if (dk) partes7.push(`Respecto de dependencias críticas: ${dk}.`)

  if (partes7.length) {
    secciones.push({ titulo: '7. Contexto estratégico', texto: partes7.join(' ') })
  }

  // ── 8. Situación crediticia (solo si hay datos del pipeline) ────────────────
  if (pipelineMatch) {
    const e = pipelineMatch
    const statusLabel = { approved: 'elegible', warning: 'elegible con observaciones', rejected: 'no elegible' }[e.elig?.status] || 'sin evaluar'
    const apto = e.prestamo && e.elig && e.elig.score >= (e.prestamo.umbral ?? 70) && e.r?.ventas_mens > 0
    const partes8 = [`${razon} cuenta con evaluación crediticia registrada en el sistema, con un score de ${e.elig?.score ?? '—'}/100, resultando ${statusLabel}.`]
    if (apto && e.prestamo) {
      partes8.push(`La capacidad de asistencia sugerida asciende a $${Math.round(e.prestamo.cp).toLocaleString('es-AR')}K en el corto plazo y $${Math.round(e.prestamo.lp).toLocaleString('es-AR')}K en el largo plazo. El análisis detallado obra en el informe de evaluación crediticia.`)
    }
    secciones.push({ titulo: '8. Situación crediticia actual', texto: partes8.join(' ') })
  }

  // ── Observaciones del analista ──────────────────────────────────────────────
  if (ok(p.observaciones)) {
    const n = secciones.length + 1
    secciones.push({ titulo: `${n}. Observaciones del analista`, texto: p.observaciones.trim() })
  }


  return secciones
}
