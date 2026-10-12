// Etapa 3 del plan de unificación — login único con rol.
//
// Valida la sesión que llega desde el Portal (?sesion=<token>) o la cookie
// propia ya seteada en una visita anterior, con el mismo AUTH_SECRET que
// firmó el token en fixus-cobros (ver fixus-shared/auth.js). Este Generador
// de Reseñas (ex "Evaluador") nunca verifica contraseñas — eso pasa una sola
// vez, en fixus-cobros.
//
// GET con ?sesion=<token>  -> valida el token nuevo, lo guarda como cookie
//                              propia (httpOnly) y lo devuelve también en
//                              la respuesta para que el cliente lo reenvíe
//                              a otras pantallas si hiciera falta.
// GET sin query             -> valida la cookie ya existente (sesión previa).

import { verifySession } from 'fixus-afip'

const COOKIE_NAME = 'fixus_sesion'

function leerCookie(req, nombre) {
  const header = req.headers.cookie || ''
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(`${nombre}=`))
  return match ? decodeURIComponent(match.slice(nombre.length + 1)) : null
}

export default function handler(req, res) {
  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) {
    return res.status(500).json({ error: 'AUTH_SECRET no configurado en este proyecto' })
  }

  const tokenDeUrl = typeof req.query.sesion === 'string' ? req.query.sesion : null
  const token = tokenDeUrl || leerCookie(req, COOKIE_NAME)

  const payload = verifySession(token, authSecret)
  if (!payload) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`)
    return res.status(401).json({ ok: false })
  }

  if (tokenDeUrl) {
    const maxAge = Math.max(0, Math.floor((payload.exp - Date.now()) / 1000))
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(tokenDeUrl)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
    )
  }

  return res.status(200).json({
    ok: true,
    usuario: { id: payload.id, nombre: payload.nombre, inicial: payload.inicial, rol: payload.rol },
  })
}
