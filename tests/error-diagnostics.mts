import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosedError, describeFailure } from '../src/server/errorDiagnostics.ts';

test('identifica a etapa e os códigos sem guardar mensagens sensíveis', () => {
  const original = Object.assign(new Error('fetch failed: token secreto abc123'), {
    name: 'AuthApiError', status: 503, code: 'SERVICE_UNAVAILABLE',
    cause: { code: 'ECONNRESET', url: 'https://example.test?token=secreto' },
  });
  const result = describeFailure(new DiagnosedError('Supabase Auth / consulta do usuário administrativo', original));
  assert.equal(result.stage, 'Supabase Auth / consulta do usuário administrativo');
  assert.equal(result.diagnostic, 'AuthApiError · HTTP 503 · SERVICE_UNAVAILABLE · ECONNRESET · falha de rede');
  assert.ok(!JSON.stringify(result).includes('secreto'));
});

test('ignora código arbitrário que poderia conter credenciais', () => {
  const result = describeFailure({ name: 'TypeError', code: 'token=segredo&key=abc', message: 'outro erro' });
  assert.equal(result.diagnostic, 'TypeError');
});
