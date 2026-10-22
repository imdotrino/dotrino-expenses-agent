// Las credenciales del buzón viven en el cajón `expenses` de la bóveda del usuario, nunca en
// el disco de esta máquina ni en la PWA. Las sube este agente (`setup`) y las lee al atender.

import { codeError } from './errors.js'

export const NS = 'expenses'

export const KEYS = Object.freeze({
  host: 'IMAP_HOST',
  port: 'IMAP_PORT',
  user: 'IMAP_USER',
  password: 'IMAP_PASSWORD',
  folder: 'IMAP_FOLDER',
  from: 'IMAP_FROM',
})

/**
 * Lo guardado en el cajón → la configuración. Falta host, usuario o contraseña: `not-configured`.
 * @param {Record<string,string>} secrets
 */
export function configFromSecrets (secrets) {
  const host = String(secrets[KEYS.host] || '').trim()
  const user = String(secrets[KEYS.user] || '').trim()
  const password = String(secrets[KEYS.password] || '')
  const missing = [[KEYS.host, host], [KEYS.user, user], [KEYS.password, password]].filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) throw codeError('not-configured', `the mailbox is not set up (missing ${missing.join(', ')}): run \`dotrino-expenses-agent setup\``, { missing })
  const port = Number(secrets[KEYS.port] || 993)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw codeError('bad-config', `${KEYS.port} is not a port: ${secrets[KEYS.port]}`)
  return {
    host,
    port,
    // 993 es IMAP sobre TLS desde el primer byte; en cualquier otro puerto imapflow sube a TLS
    // con STARTTLS si el servidor lo ofrece.
    secure: port === 993,
    user,
    password,
    folder: String(secrets[KEYS.folder] || 'INBOX').trim() || 'INBOX',
    from: String(secrets[KEYS.from] || '').split(',').map((s) => s.trim()).filter(Boolean),
  }
}

/** Lo que se le enseña a la PWA: nunca la contraseña, y el usuario a medias. */
export function publicConfig (cfg) {
  const [name, domain] = cfg.user.split('@')
  const masked = domain ? `${name.slice(0, 2)}…@${domain}` : `${cfg.user.slice(0, 2)}…`
  return { host: cfg.host, user: masked, folder: cfg.folder, from: cfg.from }
}

/** Las respuestas de `setup` → las variables del cajón. */
export function varsFromAnswers ({ host, port, user, password, folder, from }) {
  const vars = [
    { key: KEYS.host, value: host },
    { key: KEYS.port, value: String(port || 993) },
    { key: KEYS.user, value: user },
    { key: KEYS.password, value: password },
    { key: KEYS.folder, value: folder || 'INBOX' },
  ]
  if (from) vars.push({ key: KEYS.from, value: from })
  return vars.filter((v) => v.value)
}
