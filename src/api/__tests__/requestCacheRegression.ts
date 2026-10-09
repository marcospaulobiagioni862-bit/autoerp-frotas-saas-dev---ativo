import assert from 'node:assert/strict';
import { cachedRead, invalidateCache, invalidateAllCache } from '../requestCache';

/**
 * Regressão da deduplicação/cache de leituras (AUTOERP-85).
 * Cada cenário é escrito para FALHAR se a proteção correspondente sumir.
 */

function contador() {
  let chamadas = 0;
  return {
    get chamadas() { return chamadas; },
    fetcher: async (valor: unknown = ['a', 'b']) => { chamadas += 1; return valor as any; },
  };
}

async function run() {
  // 1. Chamadas SIMULTÂNEAS compartilham uma requisição só
  invalidateAllCache();
  {
    const c = contador();
    const [r1, r2, r3] = await Promise.all([
      cachedRead('t:simultaneo', () => c.fetcher()),
      cachedRead('t:simultaneo', () => c.fetcher()),
      cachedRead('t:simultaneo', () => c.fetcher()),
    ]);
    assert.equal(c.chamadas, 1, `3 chamadas simultaneas deveriam virar 1 requisicao, viraram ${c.chamadas}`);
    assert.deepEqual(r1, ['a', 'b']);
    assert.deepEqual(r2, ['a', 'b']);
    assert.deepEqual(r3, ['a', 'b']);
    console.log('PASS 1/6: chamadas simultaneas sao deduplicadas');
  }

  // 2. Chamadas SEQUENCIAIS dentro do prazo reaproveitam o resultado
  invalidateAllCache();
  {
    const c = contador();
    await cachedRead('t:sequencial', () => c.fetcher());
    await cachedRead('t:sequencial', () => c.fetcher());
    await cachedRead('t:sequencial', () => c.fetcher());
    assert.equal(c.chamadas, 1, `3 chamadas sequenciais dentro do TTL deveriam virar 1, viraram ${c.chamadas}`);
    console.log('PASS 2/6: chamadas sequenciais dentro do prazo reaproveitam');
  }

  // 3. Depois do prazo, busca de novo (nao serve dado velho pra sempre)
  invalidateAllCache();
  {
    const c = contador();
    await cachedRead('t:expira', () => c.fetcher(), 1);
    await new Promise((r) => setTimeout(r, 25));
    await cachedRead('t:expira', () => c.fetcher(), 1);
    assert.equal(c.chamadas, 2, 'apos o prazo expirar deveria buscar de novo');
    console.log('PASS 3/6: cache expira e busca de novo');
  }

  // 4. Invalidar por prefixo força nova busca (mutação tem que refletir na lista)
  invalidateAllCache();
  {
    const c = contador();
    await cachedRead('vehicles:list', () => c.fetcher());
    invalidateCache('vehicles');
    await cachedRead('vehicles:list', () => c.fetcher());
    assert.equal(c.chamadas, 2, 'depois de invalidar, a proxima leitura tem que ir na rede');
    // e nao pode invalidar o que nao e do recurso
    const outro = contador();
    await cachedRead('drivers:list', () => outro.fetcher());
    invalidateCache('vehicles');
    await cachedRead('drivers:list', () => outro.fetcher());
    assert.equal(outro.chamadas, 1, 'invalidar vehicles nao pode derrubar o cache de drivers');
    console.log('PASS 4/6: invalidacao por prefixo atinge so o recurso certo');
  }

  // 5. Erro NUNCA e cacheado (senao uma falha momentanea travaria a tela)
  invalidateAllCache();
  {
    let tentativas = 0;
    const falha = async () => { tentativas += 1; throw new Error('rede caiu'); };
    await assert.rejects(() => cachedRead('t:erro', falha), /rede caiu/);
    await assert.rejects(() => cachedRead('t:erro', falha), /rede caiu/);
    assert.equal(tentativas, 2, 'erro nao pode ser cacheado: a segunda chamada tem que tentar de novo');
    console.log('PASS 5/6: erro nao e cacheado');
  }

  // 6. Um consumidor nao pode corromper a lista do outro (sort altera no lugar)
  invalidateAllCache();
  {
    const c = contador();
    const a = await cachedRead<string[]>('t:isolamento', () => c.fetcher(['b', 'a', 'c']));
    a.sort();
    const b = await cachedRead<string[]>('t:isolamento', () => c.fetcher(['b', 'a', 'c']));
    assert.deepEqual(b, ['b', 'a', 'c'], `ordenar a lista de um consumidor corrompeu a do outro: ${JSON.stringify(b)}`);
    console.log('PASS 6/6: consumidores recebem copias independentes');
  }

  console.log('\nrequestCache (AUTOERP-85): 6/6 PASS');
}

run().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
