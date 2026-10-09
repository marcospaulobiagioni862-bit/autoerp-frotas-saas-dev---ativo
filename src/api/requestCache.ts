/**
 * Deduplicação e cache curto de leituras de API (AUTOERP-85).
 *
 * POR QUE: medição no staging em 2026-10-09 mostrou 123 chamadas de API para
 * apenas 40 rotas distintas numa navegação — `/api/fleet/vehicles` sozinha foi
 * chamada 14 vezes, `/api/contracts` e `/api/drivers` 8 vezes cada. A causa é
 * estrutural: 19 componentes chamam `VehicleClient.list()` por conta própria,
 * 14 chamam `DriverClient.list()`, e não existe nada coordenando. Com ~475ms
 * por ida e volta, isso é a lentidão que o usuário sente.
 *
 * A CORREÇÃO FICA AQUI, DENTRO DO CLIENTE, de propósito: nenhum dos 19
 * componentes precisa mudar. Eles continuam chamando `list()` como sempre.
 *
 * Duas proteções distintas, e a diferença importa:
 *  - Deduplicação de chamadas em voo: chamadas simultâneas para a mesma chave
 *    compartilham UMA requisição. Isso não tem risco de dado velho nenhum,
 *    porque é a mesma resposta do mesmo instante.
 *  - Cache de vida curta (padrão 10s): cobre o caso de componentes que montam
 *    em sequência, não ao mesmo tempo. O prazo é curto de propósito — o
 *    suficiente para colapsar a rajada de uma mesma tela, curto demais para o
 *    usuário perceber defasagem.
 *
 * Toda mutação invalida o próprio recurso (ver chamadas de `invalidate` nos
 * clientes), então criar um veículo e voltar para a lista mostra o veículo novo.
 */

type CacheEntry = { value: unknown; expiresAt: number };

const inFlight = new Map<string, Promise<unknown>>();
const cache = new Map<string, CacheEntry>();

export const DEFAULT_CACHE_TTL_MS = 10_000;

/**
 * Cópia rasa de arrays antes de entregar. Sem isso, dois componentes recebem
 * a MESMA referência e um `sort()` ou `splice()` de um corromperia a lista do
 * outro — `sort` altera o array no lugar.
 */
function detach<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}

export async function cachedRead<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_CACHE_TTL_MS
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return detach(hit.value as T);

  const flying = inFlight.get(key) as Promise<T> | undefined;
  if (flying) return detach(await flying);

  const promise = (async () => {
    try {
      const value = await fetcher();
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      // Erro nunca é cacheado: só o `cache.set` acima guarda, e ele só roda no
      // caminho de sucesso. Aqui apenas liberamos a chave para a próxima tentativa.
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return detach(await promise);
}

/** Invalida tudo que começa com o prefixo. Chamar em toda mutação do recurso. */
export function invalidateCache(prefix: string): void {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
  for (const key of [...inFlight.keys()]) if (key.startsWith(prefix)) inFlight.delete(key);
}

/** Limpa tudo. Usar ao trocar de sessão/empresa, para não vazar dado entre contextos. */
export function invalidateAllCache(): void {
  cache.clear();
  inFlight.clear();
}
