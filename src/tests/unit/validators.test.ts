import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePhone } from '../../utils/validators'
test('normalizePhone normalizes uzbek local number', () => { assert.equal(normalizePhone('90 123 45 67'), '+998901234567') })
test('normalizePhone rejects invalid number', () => { assert.equal(normalizePhone('123'), null) })
