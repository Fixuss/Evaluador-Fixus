// pages/api/buscar-cuit.js
// Consulta padron AFIP — delega la logica a fixus-afip (modulo compartido,
// ver /home/claude/fixus-shared). Antes este archivo tenia la implementacion
// completa copiada; a partir de la Etapa 0 del plan de unificacion solo
// adapta request/response.

import { consultarCuit, AfipError } from 'fixus-afip'

export default async function handler(req, res) {
  const { cuit } = req.query

  const certPem = process.env.AFIP_CERT?.replace(/\\n/g, '\n')
  const keyPem  = process.env.AFIP_KEY?.replace(/\\n/g, '\n')

  try {
    const data = await consultarCuit(cuit, { certPem, keyPem })
    return res.status(200).json(data)
  } catch (err) {
    if (err instanceof AfipError) {
      return res.status(err.status).json({ error: err.message, ...(err.debug ? { debug: err.debug } : {}) })
    }
    console.error('AFIP error:', err.message)
    return res.status(500).json({ error: 'Error al consultar AFIP: ' + err.message })
  }
}
