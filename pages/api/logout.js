// Etapa 3 — borra la cookie de sesión propia de este Evaluador. El Portal
// tiene su propia sesión separada (sessionStorage) y no se ve afectado.

export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'fixus_sesion=; Path=/; Max-Age=0; SameSite=Lax')
  return res.status(200).json({ ok: true })
}
