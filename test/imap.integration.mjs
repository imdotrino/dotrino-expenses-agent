// fetchMails contra un servidor IMAP DE VERDAD: GreenMail en un contenedor (`npm run test:imap`,
// necesita Docker). Se le meten correos con APPEND y se comprueba lo que ve el agente: los
// últimos 30 días la primera vez, el filtro de remitentes, el cursor, un buzón renumerado,
// y los fallos con su código.

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { ImapFlow } from 'imapflow'
import { fetchMails } from '../src/imap.js'

const NAME = `expenses-agent-imap-${process.pid}`
const PORT = 31000 + (process.pid % 1000)
const cfg = { host: '127.0.0.1', port: PORT, secure: false, user: 'ana', password: 'pw', folder: 'INBOX', from: [] }

function raw ({ from, subject, date, body }) {
  return [
    `From: ${from}`, 'To: ana@example.com', `Subject: ${subject}`, `Date: ${date.toUTCString()}`,
    `Message-ID: <${subject.replace(/\W+/g, '-')}-${date.getTime()}@test>`, 'Content-Type: text/plain; charset=utf-8', '', body, '',
  ].join('\r\n')
}

async function append (mails) {
  const c = new ImapFlow({ host: cfg.host, port: cfg.port, secure: false, auth: { user: cfg.user, pass: cfg.password }, logger: false })
  await c.connect()
  for (const m of mails) await c.append('INBOX', raw(m), [], m.date)
  await c.logout()
}

before(async () => {
  execFileSync('docker', ['run', '-d', '--rm', '--name', NAME, '-p', `${PORT}:3143`,
    '-e', 'GREENMAIL_OPTS=-Dgreenmail.setup.test.imap -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users=ana:pw@example.com -Dgreenmail.users.login=local_part',
    'greenmail/standalone:2.1.3'], { stdio: 'ignore' })
  // Arranca en unos segundos: se espera a que acepte un login.
  for (let i = 0; i < 60; i++) {
    try {
      const c = new ImapFlow({ host: cfg.host, port: cfg.port, secure: false, auth: { user: 'ana', pass: 'pw' }, logger: false })
      await c.connect(); await c.logout()
      return
    } catch { await new Promise((r) => setTimeout(r, 1000)) }
  }
  throw new Error('greenmail did not start')
})

after(() => {
  try { execFileSync('docker', ['rm', '-f', NAME], { stdio: 'ignore' }) } catch { /* ya no está */ }
})

test('first read: last 30 days; then only what is new; sender filter on the server', { timeout: 60_000 }, async () => {
  const day = 86400_000
  await append([
    { from: 'Banco Pichincha <avisos@pichincha.com>', subject: 'Consumo', date: new Date(Date.now() - 2 * day), body: 'Consumo por USD 25,40 en SUPERMAXI' },
    { from: 'Tienda <promo@tienda.ec>', subject: 'Promo', date: new Date(Date.now() - 1 * day), body: 'Descuentos' },
    { from: 'Banco Pichincha <avisos@pichincha.com>', subject: 'Viejo', date: new Date(Date.now() - 60 * day), body: 'Consumo por USD 1,00' },
  ])

  const first = await fetchMails(cfg, null)
  assert.deepEqual(first.mails.map((m) => m.subject).sort(), ['Consumo', 'Promo'], 'the 60-day-old one stays out')
  const consumo = first.mails.find((m) => m.subject === 'Consumo')
  assert.match(consumo.text, /USD 25,40/)
  assert.match(consumo.from, /pichincha/)
  assert.ok(consumo.id.startsWith('<Consumo-'))

  const none = await fetchMails(cfg, first.cursor)
  assert.equal(none.mails.length, 0)
  assert.deepEqual(none.cursor, first.cursor)

  await append([{ from: 'Banco Pichincha <avisos@pichincha.com>', subject: 'Nuevo', date: new Date(), body: 'Retiro por USD 40.00' }])
  const next = await fetchMails(cfg, first.cursor)
  assert.deepEqual(next.mails.map((m) => m.subject), ['Nuevo'])
  assert.ok(next.cursor.uid > first.cursor.uid)

  const onlyBank = await fetchMails({ ...cfg, from: ['avisos@pichincha.com'] }, null)
  assert.deepEqual(onlyBank.mails.map((m) => m.subject).sort(), ['Consumo', 'Nuevo'])
  const two = await fetchMails({ ...cfg, from: ['avisos@pichincha.com', 'promo@tienda.ec'] }, null)
  assert.equal(two.mails.length, 3)

  // Un cursor de otra numeración de la carpeta no vale: se vuelve a mirar por fecha.
  const renumbered = await fetchMails(cfg, { uidValidity: '1', uid: 999999 })
  assert.equal(renumbered.mails.length, 3)
})

test('failures carry a code', { timeout: 30_000 }, async () => {
  await assert.rejects(fetchMails({ ...cfg, password: 'wrong' }, null), (e) => e.code === 'imap-auth')
  await assert.rejects(fetchMails({ ...cfg, folder: 'NoExiste' }, null), (e) => e.code === 'imap-folder')
  await assert.rejects(fetchMails({ ...cfg, port: 1 }, null), (e) => e.code === 'imap-unreachable')
})
