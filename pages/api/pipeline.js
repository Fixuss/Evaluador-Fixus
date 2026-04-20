// pages/api/pipeline.js
import { kv } from '@vercel/kv'

const PIPELINE_KEY = 'fixus:pipeline'
const CRITERIOS_KEY = 'fixus:criterios'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { type } = req.query
      if (type === 'criterios') {
        const data = await kv.get(CRITERIOS_KEY)
        return res.status(200).json({ data: data || null })
      }
      const data = await kv.get(PIPELINE_KEY)
      return res.status(200).json({ data: data || [] })
    }

    if (req.method === 'POST') {
      const { action, payload } = req.body
      if (action === 'save_criterios') {
        await kv.set(CRITERIOS_KEY, payload)
        return res.status(200).json({ ok: true })
      }
      if (action === 'add') {
        const pipeline = await kv.get(PIPELINE_KEY) || []
        const idx = pipeline.findIndex(e => e.razon === payload.razon)
        if (idx >= 0) pipeline[idx] = payload
        else pipeline.unshift(payload)
        await kv.set(PIPELINE_KEY, pipeline)
        return res.status(200).json({ ok: true, total: pipeline.length })
      }
      if (action === 'delete') {
        const pipeline = await kv.get(PIPELINE_KEY) || []
        const updated = pipeline.filter(e => e.id !== payload.id)
        await kv.set(PIPELINE_KEY, updated)
        return res.status(200).json({ ok: true })
      }
      if (action === 'clear') {
        await kv.set(PIPELINE_KEY, [])
        return res.status(200).json({ ok: true })
      }
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
