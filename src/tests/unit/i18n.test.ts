import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLang, t } from '../../core/i18n'
test('detectLang detects russian', () => { assert.equal(detectLang('ru-RU'), 'ru') })
test('t returns translation', () => { assert.match(t('uz','courses'), /Kurs/) })
