// pages/api/buscar-cuit.js
// Consulta padrón AFIP usando ws_sr_padron_a13 con autenticación WSAA

import forge from 'node-forge'

const WSAA_URL   = 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
const PADRON_URL = 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13'
const SERVICE    = 'ws_sr_padron_a13'
const CUIT_FIXUS = '30718940024'

// Cache del token (válido hasta 12hs según AFIP)
let _token = null
let _sign  = null
let _expiry = null

function crearTRA() {
  const now  = new Date()
  const from = new Date(now.getTime() - 120_000)      // 2 min atrás
  const to   = new Date(now.getTime() + 43_200_000)   // 12 horas adelante
  // AFIP acepta ISO 8601 con offset UTC explícito
  const fmt  = d => d.toISOString().replace('Z', '+00:00')
  return `<?xml version="1.0" encoding="UTF-8"?>\
<loginTicketRequest version="1.0">\
<header>\
<uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>\
<generationTime>${fmt(from)}</generationTime>\
<expirationTime>${fmt(to)}</expirationTime>\
</header>\
<service>${SERVICE}</service>\
</loginTicketRequest>`
}

function firmarTRA(tra, certPem, keyPem) {
  const cert = forge.pki.certificateFromPem(certPem)
  const key  = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(tra, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign()
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
}

async function obtenerToken(certPem, keyPem) {
  if (_token && _expiry && new Date() < _expiry) return { token: _token, sign: _sign }

  const cms = firmarTRA(crearTRA(), certPem, keyPem)

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(WSAA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: soap,
  })
  const xml = await res.text()

  // La respuesta de WSAA viene con el XML interno codificado en HTML entities
  // Extraemos el contenido de loginCmsReturn y lo decodificamos
  const innerEncoded = xml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/)?.[1] || xml
  const inner = innerEncoded
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")

  const token  = inner.match(/<token>([^<]+)<\/token>/)?.[1]
  const sign   = inner.match(/<sign>([^<]+)<\/sign>/)?.[1]
  const expStr = inner.match(/<expirationTime>([^<]+)<\/expirationTime>/)?.[1]

  if (!token || !sign) {
    const faultMsg = xml.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || ''
    const faultDetail = xml.match(/<detail[^>]*>([\s\S]*?)<\/detail>/)?.[1] || ''
    throw new Error('WSAA: ' + (faultMsg || faultDetail || xml.slice(0, 600)))
  }

  _token  = token
  _sign   = sign
  _expiry = expStr ? new Date(expStr) : new Date(Date.now() + 11 * 3_600_000)

  return { token, sign }
}

async function consultarPadron(cuit, token, sign) {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <ns2:getPersona xmlns:ns2="http://a13.soap.ws.server.puc.sr/">
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${CUIT_FIXUS}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </ns2:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(PADRON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: soap,
  })
  const text = await res.text()
  // Adjuntamos status para debug
  return { status: res.status, contentType: res.headers.get('content-type') || '', text }
}

export default async function handler(req, res) {
  const { cuit } = req.query
  if (!cuit) return res.status(400).json({ error: 'CUIT requerido' })

  const cuitLimpio = cuit.replace(/[-\s]/g, '')
  if (!/^\d{11}$/.test(cuitLimpio))
    return res.status(400).json({ error: 'CUIT inválido — debe tener 11 dígitos' })

  const certPem = process.env.AFIP_CERT?.replace(/\\n/g, '\n')
  const keyPem  = process.env.AFIP_KEY?.replace(/\\n/g, '\n')

  if (!certPem || !keyPem)
    return res.status(500).json({ error: 'Credenciales AFIP no configuradas en el servidor' })

  try {
    const { token, sign } = await obtenerToken(certPem, keyPem)
    const { status: padronStatus, contentType, text: xml } = await consultarPadron(cuitLimpio, token, sign)

    // Si la respuesta no es XML, devolvemos debug detallado
    if (!contentType.includes('xml') && !xml.trimStart().startsWith('<')) {
      return res.status(502).json({
        error: 'Respuesta inesperada del padrón AFIP',
        debug: `HTTP ${padronStatus} | Content-Type: ${contentType} | ${xml.slice(0, 400)}`
      })
    }

    // Decodificar entities del padrón
    const xmlDec = xml
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&')

    const get = (tag) => xmlDec.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim() || null

    const razonSocial =
      get('razonSocial') ||
      [get('apellido'), get('nombre')].filter(Boolean).join(' ') ||
      null

    if (!razonSocial) {
      return res.status(404).json({ error: 'CUIT no encontrado en el padrón', debug: xml.slice(0, 600) })
    }

    // Actividad principal (primer coincidencia)
    const actividad      = get('descripcionActividadPrincipal') || get('descripcionActividad')
    const estadoClave    = get('estadoClave')                         // ACTIVO / INACTIVO
    const tipoPersona    = get('tipoPersona')                        // JURIDICA / FISICA
    const mesCierre      = get('mesCierre')                         // 1-12
    // Fecha de inscripción o contrato social
    const fechaInscripcion = get('fechaInscripcion') || get('fechaContratoSocial')
    // Domicilio fiscal
    const domicilio = [
      get('direccion'),
      get('localidad'),
      get('descripcionProvincia'),
    ].filter(Boolean).join(', ') || null

    return res.status(200).json({
      razonSocial,
      actividad,
      estadoClave,
      tipoPersona,
      mesCierre,
      fechaInscripcion,
      domicilio,
    })

  } catch (err) {
    console.error('AFIP error:', err.message)
    return res.status(500).json({ error: 'Error al consultar AFIP: ' + err.message })
  }
}
