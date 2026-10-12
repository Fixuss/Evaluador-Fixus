// pages/api/perfiles.js
// Almacena los perfiles cualitativos de empresas ("Información cualitativa").
// Reemplaza a pages/api/pipeline.js (dado de baja en la Etapa 1 del plan de
// unificación junto con todo el motor de scoring financiero).
//
// Misma clave de Redis que antes (fixus:perfiles) y mismo formato — un
// diccionario { [key]: perfil } — para no perder ningún dato existente.
// Lo único que cambia es qué se usa como `key` de cada entrada: antes era
// la razón social normalizada (normalizeRazon), ahora es el CUIT limpio
// (11 dígitos) cuando está disponible. Los perfiles viejos que todavía no
// tienen CUIT cargado siguen funcionando con su key de razón social hasta
// que se editan y guardan de nuevo — en ese momento se "migran" solos a la
// key por CUIT (ver payload.oldKey abajo). No hace falta correr ningún
// script de migración aparte.
//
// Etapa 7②/①1 (12-oct-2026): este endpoint no exigía sesión — cualquiera
// que conociera la URL podía leer los 36 perfiles completos (datos de
// crédito de clientes reales) o escribir/borrar cualquiera, sin loguearse.
// Mismo hallazgo que ya se corrigió en Cobros/Portal/Tablero en la Etapa
// 7①; acá se encontró un poco más tarde, al revisar este archivo para la
// limpieza de campos pre-FODA. Se agrega el mismo chequeo mínimo
// (`requireSesion`, lib/sesion.js) a los tres métodos.

import { Redis } from '@upstash/redis'
import { requireSesion } from '../../lib/sesion'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const PERFILES_KEY = 'fixus:perfiles'

export default async function handler(req, res) {
  if (!requireSesion(req, res)) return

  try {
    if (req.method === 'GET') {
      const data = await kv.get(PERFILES_KEY)
      return res.status(200).json({ data: data || {} })
    }

    if (req.method === 'POST') {
      const { action, payload } = req.body

      if (action === 'save_perfil') {
        const { key, oldKey, perfil } = payload
        if (!key) return res.status(400).json({ error: 'Falta key' })
        const perfiles = (await kv.get(PERFILES_KEY)) || {}
        // Si el perfil se guarda bajo una key distinta a la que tenía antes
        // (típicamente: se cargó el CUIT por primera vez), movemos la
        // entrada en vez de duplicarla.
        if (oldKey && oldKey !== key) delete perfiles[oldKey]
        perfiles[key] = perfil
        await kv.set(PERFILES_KEY, perfiles)
        return res.status(200).json({ ok: true, total: Object.keys(perfiles).length })
      }

      if (action === 'delete_perfil') {
        const { key } = payload
        const perfiles = (await kv.get(PERFILES_KEY)) || {}
        delete perfiles[key]
        await kv.set(PERFILES_KEY, perfiles)
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ error: 'Acción no reconocida' })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
