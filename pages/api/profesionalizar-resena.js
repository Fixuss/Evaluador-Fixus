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

  const systemPrompt = `Eres un analista crediticio de Fixus Consultora, especializada en evaluación de PyMEs argentinas.

Tu tarea es profesionalizar una reseña corporativa: mejorar la redacción, darle fluidez y agregar una breve interpretación analítica por sección, sin extenderte demasiado.

Reglas:
- Mantené TODOS los datos factuales exactamente como están (montos, fechas, nombres, porcentajes).
- Cada sección: reescribí el contenido en prosa fluida y sumá 1-2 oraciones de valor analítico derivadas de los datos (ej: implicancia crediticia, fortaleza o riesgo que se desprende).
- Usá vocabulario técnico-financiero adecuado pero accesible.
- Respetá el orden de las secciones recibidas.
- Tono formal, directo. Sin relleno ni redundancias.
- No inventés datos que no estén en el original.
- Usá español rioplatense formal (Argentina).
- Respondé SOLO con la reseña profesionalizada, sin comentarios adicionales.
- Formato: cada sección con "**Título**\nTexto." separadas por línea en blanco.`

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
