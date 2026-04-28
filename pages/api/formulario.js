import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

function makeToken() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let t = ''
  for (let i = 0; i < 10; i++) t += chars[Math.floor(Math.random() * chars.length)]
  return t
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { token, key } = req.query

      if (token) {
        const data = await kv.get(`fixus:form:${token}`)
        if (!data) return res.status(404).json({ error: 'Formulario no encontrado' })
        return res.status(200).json({ data })
      }

      if (key) {
        const activeToken = await kv.get(`fixus:form:key:${key}`)
        if (!activeToken) return res.status(200).json({ data: null })
        const data = await kv.get(`fixus:form:${activeToken}`)
        return res.status(200).json({ data: data || null })
      }

      return res.status(400).json({ error: 'Falta token o key' })
    }

    if (req.method === 'POST') {
      const { action, payload } = req.body

      if (action === 'create') {
        const { perfilKey, prefill, analista } = payload
        const token = makeToken()
        const entry = {
          token,
          perfilKey: perfilKey || '',
          razon: prefill?.razon || '',
          analista: analista || '',
          creado_en: new Date().toISOString(),
          prefill: prefill || {},
          submitted: false,
          respuesta: null,
          submitted_at: null,
        }
        await kv.set(`fixus:form:${token}`, entry)
        if (perfilKey) await kv.set(`fixus:form:key:${perfilKey}`, token)
        return res.status(200).json({ ok: true, token })
      }

      if (action === 'submit') {
        const { token, respuesta } = payload
        const existing = await kv.get(`fixus:form:${token}`)
        if (!existing) return res.status(404).json({ error: 'Formulario no encontrado' })
        if (existing.submitted) return res.status(400).json({ error: 'El formulario ya fue enviado' })
        await kv.set(`fixus:form:${token}`, {
          ...existing,
          submitted: true,
          respuesta,
          submitted_at: new Date().toISOString(),
        })
        return res.status(200).json({ ok: true })
      }
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
