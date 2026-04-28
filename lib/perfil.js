// lib/perfil.js — módulo de perfil cualitativo de empresa + generador de reseña

export const PERFIL_EMPTY = {
  // Identificación
  razon: '',
  cuit: '',
  sector: '',
  forma_juridica: '',
  fecha_constitucion: '',
  // Ubicación
  localidad: '',
  provincia: '',
  domicilio: '',
  // Dimensión
  empleados: '',
  facturacion_aprox: '',
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
      { id: 'forma_juridica', label: 'Forma jurídica', type: 'text', placeholder: 'SA, SRL, Unipersonal…' },
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

// Devuelve las secciones del memo de reseña corporativa.
export function buildResena(p, pipelineMatch = null) {
  const razon = p.razon || 'La empresa'
  const secciones = []

  const t = (val, fallback = 'sin información suministrada') =>
    (val && val.trim()) ? val.trim() : fallback

  // 1. Identificación
  const idParts = []
  if (p.forma_juridica) idParts.push(`Forma jurídica: ${p.forma_juridica}`)
  if (p.cuit) idParts.push(`CUIT ${p.cuit}`)
  if (p.sector) idParts.push(`Sector ${p.sector}`)
  if (p.fecha_constitucion) {
    const anios = antiguedadDesde(p.fecha_constitucion)
    idParts.push(`Constituida el ${fechaAR(p.fecha_constitucion)}${anios != null ? ` (${anios} años de trayectoria)` : ''}`)
  }
  const ubicacion = [p.domicilio, p.localidad, p.provincia].filter(Boolean).join(', ')
  if (ubicacion) idParts.push(`Ubicación: ${ubicacion}`)
  if (p.empleados) idParts.push(`Plantilla: ${p.empleados} empleados`)
  if (p.facturacion_aprox) idParts.push(`Facturación aproximada: ${p.facturacion_aprox}`)
  secciones.push({
    titulo: '1. Identificación y ficha básica',
    texto: idParts.length
      ? `${razon} — ${idParts.join('. ')}.`
      : `${razon}. Información de identificación no suministrada.`,
  })

  // 2. Historia
  secciones.push({ titulo: '2. Historia y origen', texto: t(p.historia) })

  // 3. Conducción y estructura societaria
  const accsArr = Array.isArray(p.accionistas) ? p.accionistas.filter(a => a && a.nombre) : []
  let conductionText
  if (accsArr.length > 0) {
    const lines = accsArr.map(a => {
      const parts = [a.nombre]
      if (a.participacion) parts.push(`${a.participacion}% de participación`)
      if (a.cuit) parts.push(`CUIT ${a.cuit}`)
      if (a.rol) parts.push(a.rol)
      return parts.join(' — ')
    })
    conductionText = lines.join('; ') + '.'
  } else if (p.socios) {
    conductionText = p.socios.trim()
  } else {
    conductionText = t(null)
  }
  secciones.push({ titulo: '3. Conducción y estructura societaria', texto: conductionText })

  // 4. Modelo de negocio y oferta
  const negocioPartes = []
  if (p.negocio) negocioPartes.push(p.negocio.trim())
  if (p.destino_fondos) negocioPartes.push(`Destino de los fondos solicitados: ${p.destino_fondos.trim()}`)
  if (p.productos) negocioPartes.push(`Productos y servicios principales: ${p.productos.trim()}`)
  if (p.canales) negocioPartes.push(`Canales comerciales: ${p.canales.trim()}`)
  secciones.push({
    titulo: '4. Modelo de negocio y oferta comercial',
    texto: negocioPartes.length ? negocioPartes.join('. ') + '.' : t(null),
  })

  // 5. Cartera comercial
  const cliArr = Array.isArray(p.clientes_tabla) ? p.clientes_tabla.filter(c => c && c.nombre) : []
  let clientesText = null
  if (cliArr.length > 0) {
    clientesText = cliArr.map(c => {
      const parts = [c.nombre]
      if (c.cuit) parts.push(`CUIT ${c.cuit}`)
      if (c.porcentaje) parts.push(`${c.porcentaje}% de facturación`)
      return parts.join(' — ')
    }).join('; ')
  } else if (p.clientes) {
    clientesText = p.clientes.trim()
  }

  const provArr = Array.isArray(p.proveedores_tabla) ? p.proveedores_tabla.filter(pr => pr && pr.nombre) : []
  let proveedoresText = null
  if (provArr.length > 0) {
    proveedoresText = provArr.map(pr => {
      const parts = [pr.nombre]
      if (pr.cuit) parts.push(`CUIT ${pr.cuit}`)
      if (pr.porcentaje) parts.push(`${pr.porcentaje}% de compras`)
      return parts.join(' — ')
    }).join('; ')
  } else if (p.proveedores) {
    proveedoresText = p.proveedores.trim()
  }

  const cartera = []
  if (clientesText) cartera.push(`Principales clientes — ${clientesText}`)
  if (proveedoresText) cartera.push(`Principales proveedores — ${proveedoresText}`)
  secciones.push({
    titulo: '5. Cartera comercial',
    texto: cartera.length ? cartera.join('. ') + '.' : t(null),
  })

  // 6. Infraestructura + certificaciones
  const infra = []
  if (p.infraestructura) infra.push(p.infraestructura.trim())
  if (p.certificaciones) infra.push(`Certificaciones / reconocimientos: ${p.certificaciones.trim()}`)
  secciones.push({
    titulo: '6. Infraestructura y operaciones',
    texto: infra.length ? infra.join('. ') + '.' : t(null),
  })

  // 7. Contexto estratégico (reemplaza FODA)
  const contextual = []
  const pushCtx = (label, val, fallback) => {
    const text = (val && val.trim()) ? val.trim() : (fallback && fallback.trim() ? fallback.trim() : null)
    if (text) contextual.push(`${label}: ${text}`)
  }
  pushCtx('Ventajas competitivas', p.ventajas_competitivas, p.fortalezas)
  pushCtx('Riesgos y desafíos', p.riesgos_principales, [p.debilidades, p.amenazas].filter(Boolean).join('. '))
  pushCtx('Oportunidades de crecimiento', p.oportunidades_crecimiento, p.oportunidades)
  pushCtx('Dependencias clave', p.dependencias_clave, null)
  secciones.push({
    titulo: '7. Contexto estratégico',
    texto: contextual.length ? contextual.join(' · ') : 'Contexto estratégico pendiente de completar.',
  })

  // 8. Situación crediticia (opcional)
  if (pipelineMatch) {
    const e = pipelineMatch
    const statusLabel = { approved: 'Elegible', warning: 'Elegible con observaciones', rejected: 'No elegible' }[e.elig?.status] || 'Sin evaluar'
    const apto = e.prestamo && e.elig && e.elig.score >= (e.prestamo.umbral ?? 70) && e.r?.ventas_mens > 0
    const partes = []
    partes.push(`La empresa cuenta con análisis crediticio cargado en el evaluador`)
    if (e.elig) partes.push(`con un score de ${e.elig.score}/100 — estado "${statusLabel}"`)
    if (apto && e.prestamo) {
      partes.push(`habilitando asistencia sugerida por hasta $${Math.round(e.prestamo.cp).toLocaleString('es-AR')}K a corto plazo o $${Math.round(e.prestamo.lp).toLocaleString('es-AR')}K a largo plazo`)
    }
    secciones.push({
      titulo: '8. Situación crediticia actual',
      texto: partes.join(', ') + '. El análisis detallado se encuentra en el informe de evaluación crediticia.',
    })
  }

  // Observaciones finales
  if (p.observaciones && p.observaciones.trim()) {
    secciones.push({
      titulo: `${pipelineMatch ? '9' : '8'}. Observaciones del analista`,
      texto: p.observaciones.trim(),
    })
  }

  return secciones
}
