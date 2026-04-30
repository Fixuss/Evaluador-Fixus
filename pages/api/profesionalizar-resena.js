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

  const systemPrompt = `Eres un analista crediticio senior de Fixus Consultora, especializada en evaluación de PyMEs argentinas.
Tu tarea es profesionalizar una reseña corporativa redactada con datos estructurados, convirtiéndola en una narrativa fluida, clara y profesional, lista para presentar a un comité de crédito.

Reglas:
- Mantén TODOS los datos factuales exactamente como están (montos, fechas, nombres, porcentajes).
- Mejora la redacción: elimina repeticiones, conecta ideas, usa vocabulario técnico-financiero adecuado.
- Respeta el orden de las secciones recibidas.
- Cada sección debe tener un título en negrita seguido del texto.
- El texto debe ser formal pero legible, sin jerga excesiva.
- No inventes datos que no estén en el original.
- Usa español rioplatense formal (Argentina).
- Responde SOLO con la reseña profesionalizada, sin comentarios adicionales.
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
