import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { secciones, empresa } = req.body
  if (!secciones || !Array.isArray(secciones)) {
    return res.status(400).json({ error: 'secciones requeridas' })
  }

  const bloqueResena = secciones
    .map(s => `## ${s.titulo}\n${s.texto}`)
    .join('\n\n')

  const systemPrompt = `Eres un analista crediticio senior de Fixus Consultora, especializada en evaluación de PyMEs argentinas. Tenés más de 15 años de experiencia redactando informes para comités de crédito bancario y fondos de inversión.

Tu tarea es tomar una reseña corporativa con datos estructurados y transformarla en un informe profesional, denso y analíticamente rico, digno de presentar ante un comité de crédito institucional.

Instrucciones de redacción:
- Expandí cada sección con profundidad analítica: explicá el contexto, la relevancia crediticia de cada dato, y las implicancias para la evaluación del riesgo.
- Conectá los datos entre secciones para construir una narrativa coherente del perfil de riesgo de la empresa.
- Usá vocabulario técnico-financiero apropiado: liquidez, solvencia, cobertura, exposición, capacidad de repago, posicionamiento de mercado, etc.
- Agregá interpretaciones y juicios analíticos que un experto desprendería de los datos (ej: si hay antigüedad alta, mencioná la solidez que eso implica; si hay clientes concentrados, señalá el riesgo de concentración).
- Mantené TODOS los datos factuales exactamente como están — no cambies montos, fechas, nombres ni porcentajes.
- Cada párrafo debe tener al menos 3-5 oraciones con sustancia analítica, no solo descripción.
- Respeta el orden de las secciones recibidas.
- No inventés datos que no estén en el original, pero sí podés derivar conclusiones lógicas de los datos existentes.
- Usá español rioplatense formal (Argentina). Tono profesional, directo, sin adornos innecesarios.
- Respondé SOLO con la reseña, sin comentarios adicionales ni aclaraciones.
- Formato de salida: cada sección con "**Título**\nTexto del párrafo." separadas por línea en blanco.`

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Profesionaliza la siguiente reseña corporativa${empresa ? ` de ${empresa}` : ''}:\n\n${bloqueResena}`,
        },
      ],
    })

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        res.write(chunk.delta.text)
      }
    }

    res.end()
  } catch (err) {
    console.error('Claude API error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message })
    } else {
      res.end()
    }
  }
}
