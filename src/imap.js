// Leer el buzón por IMAP: los correos nuevos desde un punto (el «cursor» que guarda la PWA en
// el almacén del usuario). Aquí no se guarda nada: el buzón ES el almacén de los correos, y lo
// que ya se trajo lo sabe la PWA.
//
// El cursor es { uidValidity, uid }: el UID del último correo traído en esa carpeta. Si la
// carpeta cambió de UIDVALIDITY (el servidor renumeró), el cursor no vale y se vuelve a mirar
// por fecha. Sin cursor, los últimos SINCE_DAYS días.

import { codeError } from './errors.js'

export const SINCE_DAYS = 30
export const MAX_MAILS = 50
const MAX_TEXT = 8000

/** @typedef {import('./types.js').Mail} Mail */

/**
 * Los correos nuevos desde `cursor` (o de los últimos SINCE_DAYS días sin él).
 * @type {import('./types.js').FetchMails}
 */
export async function fetchMails (cfg, cursor, deps = {}) {
  const ImapFlow = deps.ImapFlow || (await import('imapflow')).ImapFlow
  const simpleParser = deps.simpleParser || (await import('mailparser')).simpleParser
  const now = deps.now || Date.now
  const limit = Math.min(deps.limit || MAX_MAILS, MAX_MAILS)

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
  })
  try {
    await client.connect()
  } catch (e) {
    throw imapError(e)
  }
  try {
    let box
    try {
      box = await client.mailboxOpen(cfg.folder, { readOnly: true })
    } catch (e) {
      const err = /** @type {{ responseText?: string, message?: string } | undefined} */ (e)
      throw codeError('imap-folder', `cannot open folder "${cfg.folder}": ${err?.responseText || err?.message || e}`, { cause: e })
    }
    const uidValidity = String(box.uidValidity)
    const fresh = !cursor || String(cursor.uidValidity) !== uidValidity
    // Lo nuevo: por UID desde el cursor, o por fecha la primera vez. El filtro de remitentes
    // lo hace el servidor (un OR de FROM), para no bajarse el buzón entero.
    /** @type {{ since?: Date, uid?: string, from?: string, or?: Array<{ from: string }> }} */
    const query = fresh ? { since: new Date(now() - SINCE_DAYS * 86400_000) } : { uid: `${Number(cursor.uid) + 1}:*` }
    if (cfg.from.length === 1) query.from = cfg.from[0]
    else if (cfg.from.length > 1) query.or = cfg.from.map((f) => ({ from: f }))
    /** @type {number[]} */
    let uids = (await client.search(query, { uid: true })) || []
    // `n:*` devuelve el último aunque sea anterior a n: se quita lo que ya se tenía.
    if (!fresh) uids = uids.filter((u) => u > Number(cursor.uid))
    uids.sort((a, b) => a - b)
    // La primera vez, lo más reciente; después, en orden desde el cursor, para que si hay más
    // de `limit` la siguiente lectura siga donde quedó esta en vez de saltárselos.
    const take = fresh ? uids.slice(-limit) : uids.slice(0, limit)
    /** @type {Mail[]} */
    const mails = []
    let last = fresh ? 0 : Number(cursor.uid)
    for (const uid of take) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
      if (!msg?.source) continue
      const parsed = await simpleParser(msg.source)
      mails.push({
        id: parsed.messageId || `${uidValidity}:${uid}`,
        from: parsed.from?.text || '',
        subject: parsed.subject || '',
        date: parsed.date ? parsed.date.toISOString() : null,
        text: bodyText(parsed).slice(0, MAX_TEXT),
      })
      if (uid > last) last = uid
    }
    // La primera vez el cursor queda en el último UID de la carpeta al abrirla: lo de antes ya se
    // miró por fecha, y un correo viejo de más de 30 días no tiene que aparecer en la siguiente.
    if (fresh) last = Math.max(last, Number(box.uidNext || 1) - 1)
    return { mails, cursor: { uidValidity, uid: last } }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

/**
 * El texto del correo: el de texto plano, o el HTML sin etiquetas.
 * @param {{ text?: string, html?: string | false }} parsed lo que da `simpleParser`
 * @returns {string}
 */
function bodyText (parsed) {
  if (parsed.text && parsed.text.trim()) return parsed.text
  // Solo HTML: se deja el texto. El lector de la PWA vuelve a limpiarlo igual.
  return String(parsed.html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Un fallo de imapflow → un error con `code` que la PWA sabe explicar.
 * @param {any} e lo que lanza imapflow (un Error con campos propios, o cualquier cosa)
 */
function imapError (e) {
  const msg = e?.responseText || e?.message || String(e)
  if (e?.authenticationFailed || /auth/i.test(e?.serverResponseCode || '') || /authenticat|login|credentials|password/i.test(msg)) {
    return codeError('imap-auth', `the mail server rejected the user or password: ${msg}`, { cause: e })
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ECONNRESET|certificate/i.test(e?.code || msg)) {
    return codeError('imap-unreachable', `cannot reach the mail server: ${msg}`, { cause: e })
  }
  return codeError('imap-failed', `IMAP error: ${msg}`, { cause: e })
}
