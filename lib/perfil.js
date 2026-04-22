// lib/perfil.js — módulo de perfil cualitativo de empresa + generador de reseña

// Estructura de datos del formulario de perfil cualitativo
export const PERFIL_EMPTY = {
  // Identificación
  razon: '',
  cuit: '',
  sector: '',
  forma_juridica: '',   // ej. SA, SRL, Unipersonal
  fecha_constitucion: '', // ISO yyyy-mm-dd
  // Ubicación
  localidad: '',
  provincia: '',
  domicilio: '',
  // Dimensión
  empleados: '',
  facturacion_aprox: '', // texto libre ej. "$500M anuales"
  // Narrativo
  historia: '',
  socios: '',           // composición accionaria, participación, roles
  negocio: '',          // modelo de negocio, a qué se dedica
  productos: '',        // productos / servicios principales
  clientes: '',         // principales clientes y concentración
  proveedores: '',      // principales proveedores y concentración
  infraestructura: '',  // planta, oficina, sucursales, vehículos, maquinaria
  canales: '',          // canales comerciales (directo, distribuidores, online, etc.)
  // FODA
  fortalezas: '',
  debilidades: '',
  oportunidades: '',
  amenazas: '',
  // Extras
  certificaciones: '',  // ISO, habilitaciones, premios
  observaciones: '',
  // Metadatos (se completan al guardar)
  actualizado_en: '',
  creado_por: '',
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
      { id: 'historia', label: 'Historia y origen', type: 'textarea', rows: 4, placeholder: 'Año de inicio, fundadores, hitos de crecimiento, cambios relevantes…' },
      { id: 'socios', label: 'Conducción y accionistas', type: 'textarea', rows: 3, placeholder: 'Socios, participación, roles operativos y no operativos, gobierno corporativo' },
      { id: 'negocio', label: 'Modelo de negocio', type: 'textarea', rows: 4, placeholder: 'A qué se dedica, cómo genera ingresos, ventaja competitiva' },
      { id: 'productos', label: 'Productos y servicios', type: 'textarea', rows: 3, placeholder: 'Línea de productos/servicios principales, mix, estacionalidad' },
      { id: 'canales', label: 'Canales comerciales', type: 'textarea', rows: 2, placeholder: 'Venta directa, distribuidores, e-commerce, exportación…' },
    ],
  },
  {
    titulo: 'Mercado — cartera comercial',
    campos: [
      { id: 'clientes', label: 'Principales clientes', type: 'textarea', rows: 4, placeholder: 'Nombres, % de facturación que representan, nivel de concentración, antigüedad' },
      { id: 'proveedores', label: 'Principales proveedores', type: 'textarea', rows: 4, placeholder: 'Nombres, concentración, insumos críticos, dependencia' },
    ],
  },
  {
    titulo: 'Infraestructura y operaciones',
    campos: [
      { id: 'infraestructura', label: 'Instalaciones y activos productivos', type: 'textarea', rows: 3, placeholder: 'Planta, oficinas, sucursales, vehículos, maquinaria relevante' },
      { id: 'certificaciones', label: 'Certificaciones / habilitaciones / reconocimientos', type: 'textarea', rows: 2 },
    ],
  },
  {
    titulo: 'Análisis FODA',
    campos: [
      { id: 'fortalezas', label: 'Fortalezas', type: 'textarea', rows: 3, placeholder: 'Ventajas internas: marca, equipo, eficiencia, know-how…' },
      { id: 'debilidades', label: 'Debilidades', type: 'textarea', rows: 3, placeholder: 'Limitaciones internas: dependencia, capacidad, estructura…' },
      { id: 'oportunidades', label: 'Oportunidades', type: 'textarea', rows: 3, placeholder: 'Factores externos favorables: mercado, demanda, regulación…' },
      { id: 'amenazas', label: 'Amenazas', type: 'textarea', rows: 3, placeholder: 'Factores externos adversos: competencia, macro, regulación…' },
    ],
  },
  {
    titulo: 'Observaciones finales',
    campos: [
      { id: 'observaciones', label: 'Comentarios adicionales del analista', type: 'textarea', rows: 3 },
    ],
  },
]

// Normaliza una razón social para matching: minúsculas, sin acentos, sin espacios extra
export function normalizeRazon(s) {
  if (!s) return ''
  return s
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
// pipelineMatch es opcional: si existe la empresa en el pipeline crediticio, se resumen sus cifras.
export function buildResena(p, pipelineMatch = null) {
  const razon = p.razon || 'La empresa'
  const secciones = []

  // Helper: devuelve texto o un placeholder si el campo está vacío
  const t = (val, fallback = 'sin información suministrada') =>
    (val && val.trim()) ? val.trim() : fallback

  // Identificación consolidada
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

  // Historia
  secciones.push({ titulo: '2. Historia y origen', texto: t(p.historia) })

  // Conducción
  secciones.push({ titulo: '3. Conducción y estructura societaria', texto: t(p.socios) })

  // Negocio
  const negocioPartes = []
  if (p.negocio) negocioPartes.push(p.negocio.trim())
  if (p.productos) negocioPartes.push(`Productos y servicios principales: ${p.productos.trim()}`)
  if (p.canales) negocioPartes.push(`Canales comerciales: ${p.canales.trim()}`)
  secciones.push({
    titulo: '4. Modelo de negocio y oferta comercial',
    texto: negocioPartes.length ? negocioPartes.join('. ') + '.' : t(null),
  })

  // Cartera (clientes + proveedores)
  const cartera = []
  if (p.clientes) cartera.push(`Principales clientes — ${p.clientes.trim()}`)
  if (p.proveedores) cartera.push(`Principales proveedores — ${p.proveedores.trim()}`)
  secciones.push({
    titulo: '5. Cartera comercial',
    texto: cartera.length ? cartera.join('. ') + '.' : t(null),
  })

  // Infraestructura + certificaciones
  const infra = []
  if (p.infraestructura) infra.push(p.infraestructura.trim())
  if (p.certificaciones) infra.push(`Certificaciones / reconocimientos: ${p.certificaciones.trim()}`)
  secciones.push({
    titulo: '6. Infraestructura y operaciones',
    texto: infra.length ? infra.join('. ') + '.' : t(null),
  })

  // FODA como sub-secciones de un mismo bloque
  const foda = []
  const pushFoda = (label, val) => {
    if (val && val.trim()) foda.push(`${label}: ${val.trim()}`)
  }
  pushFoda('Fortalezas', p.fortalezas)
  pushFoda('Debilidades', p.debilidades)
  pushFoda('Oportunidades', p.oportunidades)
  pushFoda('Amenazas', p.amenazas)
  secciones.push({
    titulo: '7. Análisis FODA',
    texto: foda.length ? foda.join(' · ') : 'FODA pendiente de completar.',
  })

  // Vinculación con el pipeline crediticio (si la empresa ya fue analizada)
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
