import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCallback } from '../../infra/telegram/callback'
test('parseCallback splits payload', () => { assert.deepEqual(parseCallback('APP|OPT|full_name|john'), { namespace:'APP', action:'OPT', parts:['full_name','john'] }) })
