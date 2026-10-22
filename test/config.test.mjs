import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configFromSecrets, publicConfig, varsFromAnswers, KEYS } from '../src/config.js'

test('missing host, user or password is not-configured, and says which', () => {
  assert.throws(() => configFromSecrets({}), (e) => e.code === 'not-configured' && e.missing.length === 3)
  assert.throws(() => configFromSecrets({ [KEYS.host]: 'h', [KEYS.user]: 'u' }), (e) => e.code === 'not-configured' && e.missing[0] === KEYS.password)
})

test('defaults: port 993 over TLS, INBOX, every sender', () => {
  const c = configFromSecrets({ [KEYS.host]: 'imap.example.com', [KEYS.user]: 'ana@example.com', [KEYS.password]: 'x' })
  assert.deepEqual([c.port, c.secure, c.folder, c.from], [993, true, 'INBOX', []])
  const d = configFromSecrets({ [KEYS.host]: 'h', [KEYS.user]: 'u', [KEYS.password]: 'p', [KEYS.port]: '143', [KEYS.from]: 'a@bank.ec, b@bank.ec ,' })
  assert.deepEqual([d.port, d.secure, d.from], [143, false, ['a@bank.ec', 'b@bank.ec']])
  assert.throws(() => configFromSecrets({ [KEYS.host]: 'h', [KEYS.user]: 'u', [KEYS.password]: 'p', [KEYS.port]: 'abc' }), (e) => e.code === 'bad-config')
})

test('what the app sees: never the password, the user masked', () => {
  const c = configFromSecrets({ [KEYS.host]: 'imap.example.com', [KEYS.user]: 'ana.perez@example.com', [KEYS.password]: 's3cret' })
  const p = publicConfig(c)
  assert.equal(JSON.stringify(p).includes('s3cret'), false)
  assert.equal(p.user, 'an…@example.com')
})

test('setup answers become drawer variables, empty ones left out', () => {
  const vars = varsFromAnswers({ host: 'h', port: '', user: 'u', password: 'p', folder: '', from: '' })
  assert.deepEqual(vars.map((v) => v.key), [KEYS.host, KEYS.port, KEYS.user, KEYS.password, KEYS.folder])
  assert.equal(vars.find((v) => v.key === KEYS.port).value, '993')
})
