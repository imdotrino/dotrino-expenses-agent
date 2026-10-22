import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeHandler } from '../src/handler.js'
import { KEYS } from '../src/config.js'
import { codeError } from '../src/errors.js'

const SECRETS = { [KEYS.host]: 'imap.example.com', [KEYS.user]: 'ana@example.com', [KEYS.password]: 'pw' }

test('status: configured or not, never the password', async () => {
  const h = makeHandler({ loadSecrets: async () => SECRETS, version: '9.9.9' })
  const r = await h({ type: 'status' })
  assert.equal(r.configured, true)
  assert.equal(r.version, '9.9.9')
  assert.equal(JSON.stringify(r).includes('pw'), false)
  const empty = makeHandler({ loadSecrets: async () => ({}), version: '1' })
  assert.deepEqual(await empty({ type: 'status' }), { type: 'status', configured: false, code: 'not-configured', version: '1' })
})

test('pull passes a valid cursor and returns mails and the next cursor', async () => {
  const seen = []
  const fetch = async (cfg, cursor) => {
    seen.push({ cfg, cursor })
    return { mails: [{ id: 'm1', from: 'b', subject: 's', date: null, text: 't' }], cursor: { uidValidity: '7', uid: 12 } }
  }
  const h = makeHandler({ loadSecrets: async () => SECRETS, fetch, version: '1' })
  const r = await h({ type: 'pull', cursor: { uidValidity: 7, uid: 10 } })
  assert.equal(r.type, 'mails')
  assert.equal(r.mails.length, 1)
  assert.deepEqual(r.cursor, { uidValidity: '7', uid: 12 })
  assert.deepEqual(seen[0].cursor, { uidValidity: '7', uid: 10 })
  await h({ type: 'pull', cursor: { uid: 'x' } })
  assert.equal(seen[1].cursor, null, 'a malformed cursor is read as no cursor')
})

test('two pulls with the same cursor share one read', async () => {
  let calls = 0
  const fetch = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { mails: [], cursor: { uidValidity: '1', uid: 0 } } }
  const h = makeHandler({ loadSecrets: async () => SECRETS, fetch, version: '1' })
  await Promise.all([h({ type: 'pull', cursor: null }), h({ type: 'pull', cursor: null })])
  assert.equal(calls, 1)
})

test('failures come back with their code', async () => {
  const h = makeHandler({ loadSecrets: async () => SECRETS, fetch: async () => { throw codeError('imap-auth', 'nope') }, version: '1' })
  assert.deepEqual(await h({ type: 'pull' }), { type: 'fail', code: 'imap-auth', message: 'nope' })
  const n = makeHandler({ loadSecrets: async () => ({}), version: '1' })
  assert.equal((await n({ type: 'pull' })).code, 'not-configured')
  assert.equal((await n({ type: 'what' })).code, 'unknown-type')
  assert.equal(await n(null), null)
})
