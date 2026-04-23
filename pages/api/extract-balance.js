import Anthropic from '@anthropic-ai/sdk'

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT = `Sos un experto contable argentino. Analizá este balance general y estado de resultados y extraé los siguientes valores expresados en MILES DE PESOS ($K).

Regla de conversión:
- Si los valores en el documento están en PESOS (números grandes, ej: 15.000.000), dividí por 1000.
- Si ya están expresados en MILES, usá el valor directo.

Campos a extraer:
- ventas_ant: ventas netas del ejercicio anterior (columna comparativa)
- ventas: ventas netas del último ejercicio (columna más reciente)
- ebitda_ej: EBITDA del último ejercicio. Si no figura explícito, calculalo como: Resultado bruto − Gastos de administración − Gastos de comercialización + Amortizaciones/Depreciaciones
- act_co: activo corriente total
- act_nco: activo no corriente total
- pas_co: pasivo corriente total
- pas_nco: pasivo no corriente total
- pn: patrimonio neto total
- dcp: deudas bancarias o financieras de corto plazo (préstamos, descubiertos, obligaciones financieras CP)
- dlp: deudas bancarias o financieras de largo plazo (préstamos LP, deuda financiera no corriente)

Respondé ÚNICAMENTE con un objeto JSON válido. Sin texto adicional, sin bloques de código markdown. Usá null para los campos que no puedas determinar con certeza.

Formato esperado (solo el JSON):
{"ventas_ant":null,"ventas":null,"ebitda_ej":null,"act_co":null,"act_nco":null,"pas_co":null,"pas_nco":null,"pn":null,"dcp":null,"dlp":null}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { pdfBase64 } = req.body
  if (!pdfBase64) return res.status(400).json({ error: 'No se recibió el PDF.' })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })

    const raw = message.content[0]?.text?.trim() ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return res.status(500).json({ error: 'No se pudo interpretar la respuesta de la IA.' })

    const data = JSON.parse(match[0])
    return res.status(200).json({ data })
  } catch (err) {
    console.error('[extract-balance]', err)
    return res.status(500).json({ error: err.message || 'Error al procesar el PDF.' })
  }
}
