/**
 * Busca de endereço por CEP (ViaCEP), compartilhada pelos formulários que têm
 * endereço: cadastro de motorista, formulário público do motorista e cadastro
 * da empresa. Antes a chamada existia só no DriverFormModal; copiar o bloco em
 * cada tela faria três versões da mesma regra, que é como uma delas fica para
 * trás numa correção futura.
 *
 * O domínio https://viacep.com.br já está liberado no connect-src do CSP
 * (server.ts) — qualquer outro provedor exigiria mexer na política primeiro.
 */
export interface CepAddress {
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export type CepLookupResult =
  | { status: 'OK'; address: CepAddress }
  | { status: 'INVALID'; message: string }
  | { status: 'NOT_FOUND'; message: string }
  | { status: 'UNAVAILABLE'; message: string };

export function cepDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export async function lookupCepAddress(rawCep: string): Promise<CepLookupResult> {
  const cep = cepDigits(rawCep);
  if (cep.length !== 8) {
    return { status: 'INVALID', message: 'Informe um CEP com 8 números.' };
  }
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) throw new Error('CEP_LOOKUP_FAILED');
    const data = await response.json() as {
      erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string;
    };
    if (data.erro) {
      return { status: 'NOT_FOUND', message: 'CEP não encontrado. Preencha o endereço manualmente.' };
    }
    return {
      status: 'OK',
      address: {
        zipCode: cep,
        street: data.logradouro || '',
        neighborhood: data.bairro || '',
        city: data.localidade || '',
        state: (data.uf || '').toUpperCase(),
      },
    };
  } catch {
    return {
      status: 'UNAVAILABLE',
      message: 'Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.',
    };
  }
}
