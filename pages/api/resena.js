import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

function buildPrompt(perfil, pipelineMatch) {
  const p = perfil || {}

  const accionistas = (p.accionistas || []).filter(a => a.nombre).map(a => {
    const parts = [a.nombre]
    if (a.participacion) parts.push(`${a.participacion}% de participación`)
    if (a.rol) parts.push(a.rol)
    if (a.cuit) parts.push(`CUIT ${a.cuit}`)
    return parts.join(', ')
  }).join(' / ') || 'No especificado'

  const clientes = (p.clientes_tabla || []).filter(c => c.nombre).map(c =>
    [c.nombre, c.porcentaje && `${c.porcentaje}% de facturación`, c.cuit && `CUIT ${c.cuit}`].filter(Boolean).join(' — ')
  ).join('; ') || 'No especificado'

  const proveedores = (p.proveedores_tabla || []).filter(pr => pr.nombre).map(pr =>
    [pr.nombre, pr.porcentaje && `${pr.porcentaje}% de compras`, pr.cuit && `CUIT ${pr.cuit}`].filter(Boolean).join(' — ')
  ).join('; ') || 'No especificado'

  const ubicacion = [p.domicilio, p.localidad, p.provincia].filter(Boolean).join(', ') || 'No especificada'

  let creditInfo = ''
  if (pipelineMatch) {
    const statusLabel = { approved: 'Elegible', warning: 'Elegible con observaciones', rejected: 'No elegible' }[pipelineMatch.elig?.status] || 'Sin evaluar'
    creditInfo = `
SITUACIÓN CREDITICIA (del evaluador):
- Score crediticio: ${pipelineMatch.elig?.score || '—'}/100
- Estado: ${statusLabel}
${pipelineMatch.prestamo ? `- Capacidad de endeudamiento estimada: $${Math.round(pipelineMatch.prestamo.cp).toLocaleString('es-AR')}K (corto plazo) / $${Math.round(pipelineMatch.prestamo.lp).toLocaleString('es-AR')}K (largo plazo)` : ''}
`
  }

  return `Sos un analista financiero senior especializado en PyMEs argentinas que trabaja para Fixus Consultora, una consultora de acceso al crédito para empresas.

Tu tarea es redactar la reseña corporativa de la sección de Perfil Empresarial de un informe de análisis crediticio, basándote en los datos provistos por la empresa.

DATOS DE LA EMPRESA:
- Razón social: ${p.razon || 'No especificada'}
- CUIT: ${p.cuit || 'No especificado'}
- Sector / Rubro: ${p.sector || 'No especificado'}
- Fecha de constitución: ${p.fecha_constitucion || 'No especificada'}
- Ubicación: ${ubicacion}
- Cantidad de empleados: ${p.empleados || 'No especificada'}
- Facturación aproximada: ${p.facturacion_aprox || 'No especificada'}

CONDUCCIÓN Y ESTRUCTURA SOCIETARIA:
${accionistas}

HISTORIA Y ORIGEN:
${p.historia || 'No especificada'}

MODELO DE NEGOCIO:
${p.negocio || 'No especificado'}

DESTINO DE LOS FONDOS SOLICITADOS:
${p.destino_fondos || 'No especificado'}

PRODUCTOS Y SERVICIOS:
${p.productos || 'No especificados'}

CANALES COMERCIALES:
${p.canales || 'No especificados'}

PRINCIPALES CLIENTES:
${clientes}

PRINCIPALES PROVEEDORES:
${proveedores}

INFRAESTRUCTURA Y ACTIVOS PRODUCTIVOS:
${p.infraestructura || 'No especificada'}

CERTIFICACIONES / HABILITACIONES:
${p.certificaciones || 'No especificadas'}

VENTAJAS COMPETITIVAS:
${p.ventajas_competitivas || 'No especificadas'}

RIESGOS Y DESAFÍOS PRINCIPALES:
${p.riesgos_principales || 'No especificados'}

OPORTUNIDADES DE CRECIMIENTO:
${p.oportunidades_crecimiento || 'No especificadas'}

DEPENDENCIAS CLAVE:
${p.dependencias_clave || 'No especificadas'}
${creditInfo}
INSTRUCCIONES DE REDACCIÓN:
- Redactá en español rioplatense, tono formal y profesional, propio de un informe financiero de alta calidad
- Organizá el texto en secciones claramente tituladas (usá mayúsculas y numeración: "1. IDENTIFICACIÓN Y FICHA BÁSICA", etc.)
- Dentro de cada sección, redactá en párrafos fluidos — sin bullet points ni guiones
- Usá frecuentemente el nombre de la empresa para personalizar la reseña
- Si un dato no fue suministrado o está vacío, no lo menciones ni pongas "no especificado" — simplemente omití ese punto
- Si hay información crediticia disponible, agregá al final una sección "SITUACIÓN CREDITICIA ACTUAL"
- La reseña debe ser completa, de entre 400 y 700 palabras según la cantidad de información disponible
- Solo incluí información que esté en los datos provistos — no inventes ni supongas datos

Escribí únicamente la reseña, sin preámbulos ni comentarios.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const { perfil, pipelineMatch } = req.body
  if (!perfil?.razon) return res.status(400).json({ error: 'Falta la razón social' })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: buildPrompt(perfil, pipelineMatch) }],
    })

    return res.status(200).json({ resena: message.content[0].text })
  } catch (err) {
    console.error('resena IA error:', err)
    return res.status(500).json({ error: err.message })
  }
}
