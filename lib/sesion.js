// lib/sesion.js
// Etapa 7②/①1 (12-oct-2026): helper mínimo para exigir sesión válida en un
// endpoint de pages/api/*.js. Mismo patrón que ya usan pages/api/sesion.js
// (este repo), tablero-fixus/pages/api/leads.js y fixus-cobros/lib/sesion.ts
// — cookie fixus_sesion + verifySession/AUTH_SECRET compartido entre las 5
// apps. Se agrega acá porque, hasta hoy, ninguno de los endpoints internos
// de este repo (perfiles, buscar-cuit, profesionalizar-resena) lo exigía —
// solo la pantalla tenía el gate, no la API (mismo hallazgo ya corregido en
// fixus-cobros/portal-fixus/tablero-fixus en la Etapa 7①, ver el documento
// de diagnóstico).

import { verifySession } from 'fixus-afip'

const COOKIE_NAME = 'fixus_sesion'

export function sesionActual(req) {
  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) return null
  const header = req.headers.cookie || ''
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`))
  const token = match ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1)) : null
  return verifySession(token, authSecret)
}

// Devuelve la sesión si es válida, o escribe un 401 en `res` y devuelve null.
// Uso: const sesion = requireSesion(req, res); if (!sesion) return
export function requireSesion(req, res) {
  const sesion = sesionActual(req)
  if (!sesion) {
    res.status(401).json({ error: 'Sin sesión válida' })
    return null
  }
  return sesion
}
