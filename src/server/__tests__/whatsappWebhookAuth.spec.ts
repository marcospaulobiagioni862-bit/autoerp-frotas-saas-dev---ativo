import { describe, expect, it } from 'vitest';
import {
  canonicalizeWhatsappWebhookBody,
  createWhatsappWebhookSignature,
  WhatsappWebhookAuthenticationError,
  WhatsappWebhookAuthority,
} from '../whatsappWebhookAuth';

// Rede de regressao da verificacao do webhook de WhatsApp.
//
// Por que existe: este era o unico item da revisao do AutoERP cuja resposta
// honesta era "ninguem olhou" - o card AUTOERP-27 nasceu como registro de
// lacuna. Na revisao cruzada ele foi marcado como "confirmado 100%: webhook da
// Meta com assinatura fraca ou permissiva", sem citar arquivo nem linha, e eu
// rejeitei. Lido e medido: a verificacao e FORTE (HMAC-SHA256 com segredo por
// empresa, comparacao em tempo constante, JSON canonico com chaves ordenadas,
// janela de tempo, nonce reivindicado no banco), e nao existe webhook da Meta
// no codigo - o endpoint e sintetico e fica atras do guarda autenticado.
//
// O unico defeito real encontrado esta coberto aqui: a canonicalizacao e
// recursiva e rodava ANTES da checagem de tamanho.

const SEGREDO = 'a'.repeat(48);
const EMPRESA = 'empresa-teste';
const config = JSON.stringify({ [EMPRESA]: SEGREDO });

const cabecalhos = (body: unknown, over: Record<string, unknown> = {}) => {
  const timestamp = new Date().toISOString();
  const nonce = 'nonce-de-teste-1234567890';
  return {
    companyId: EMPRESA,
    timestamp,
    nonce,
    signature: createWhatsappWebhookSignature(SEGREDO, EMPRESA, timestamp, nonce, body),
    ...over,
  };
};

describe('canonicalizacao do corpo', () => {
  it('recusa corpo profundamente aninhado SEM estourar a pilha', () => {
    // Era o defeito: JSON.parse do V8 aguenta ~200.000 niveis porque e
    // iterativo, enquanto a recursao da canonicalizacao estourava em 3.213 - e
    // no limiar o corpo tem so ~6,4 KB, bem abaixo do teto de 16 KB. Resultado
    // antes do conserto: RangeError e resposta 500. Agora e recusa explicita.
    const profundo = JSON.parse('['.repeat(5000) + ']'.repeat(5000));
    expect(() => canonicalizeWhatsappWebhookBody(profundo)).toThrow(WhatsappWebhookAuthenticationError);
  });

  it('aceita corpo real, que e raso', () => {
    const corpo = { providerEventId: 'evt-1', outboxId: 'out-1', eventType: 'DELIVERED', occurredAt: '2026-10-06T00:00:00.000Z' };
    expect(canonicalizeWhatsappWebhookBody(corpo)).toContain('"providerEventId":"evt-1"');
  });

  it('ordena as chaves, de modo que reordenar o corpo NAO muda a assinatura', () => {
    // E a propriedade que impede burlar a assinatura reembaralhando campos.
    const a = canonicalizeWhatsappWebhookBody({ b: 2, a: 1 });
    const b = canonicalizeWhatsappWebhookBody({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('recusa valor undefined, em vez de ignorar o campo', () => {
    expect(() => canonicalizeWhatsappWebhookBody({ a: undefined })).toThrow(WhatsappWebhookAuthenticationError);
  });
});

describe('verificacao da assinatura', () => {
  const corpo = { providerEventId: 'evt-1', outboxId: 'out-1' };

  it('aceita assinatura valida', () => {
    const verificado = WhatsappWebhookAuthority.verify(cabecalhos(corpo), corpo, new Date(), config);
    expect(verificado.companyId).toBe(EMPRESA);
  });

  it('recusa quando o corpo foi alterado depois de assinado', () => {
    const headers = cabecalhos(corpo);
    expect(() =>
      WhatsappWebhookAuthority.verify(headers, { ...corpo, outboxId: 'adulterado' }, new Date(), config)
    ).toThrow(WhatsappWebhookAuthenticationError);
  });

  it('recusa assinatura antiga, fora da janela de 5 minutos', () => {
    const headers = cabecalhos(corpo);
    const seisMinutosDepois = new Date(Date.now() + 6 * 60 * 1000);
    expect(() => WhatsappWebhookAuthority.verify(headers, corpo, seisMinutosDepois, config)).toThrow(
      WhatsappWebhookAuthenticationError
    );
  });

  it('recusa assinatura do futuro, fora da folga de 1 minuto', () => {
    const futuro = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const nonce = 'nonce-de-teste-1234567890';
    const headers = {
      companyId: EMPRESA,
      timestamp: futuro,
      nonce,
      signature: createWhatsappWebhookSignature(SEGREDO, EMPRESA, futuro, nonce, corpo),
    };
    expect(() => WhatsappWebhookAuthority.verify(headers, corpo, new Date(), config)).toThrow(
      WhatsappWebhookAuthenticationError
    );
  });

  it('recusa nonce fora do formato exigido', () => {
    expect(() => WhatsappWebhookAuthority.verify(cabecalhos(corpo, { nonce: 'curto' }), corpo, new Date(), config)).toThrow(
      WhatsappWebhookAuthenticationError
    );
  });

  it('FALHA FECHADA quando nao existe segredo configurado', () => {
    expect(() => WhatsappWebhookAuthority.verify(cabecalhos(corpo), corpo, new Date(), undefined)).toThrow(
      WhatsappWebhookAuthenticationError
    );
  });

  it('recusa empresa que nao tem segredo no mapa de configuracao', () => {
    const outra = JSON.stringify({ 'outra-empresa': SEGREDO });
    expect(() => WhatsappWebhookAuthority.verify(cabecalhos(corpo), corpo, new Date(), outra)).toThrow(
      WhatsappWebhookAuthenticationError
    );
  });

  it('recusa segredo curto demais na configuracao', () => {
    const fraco = JSON.stringify({ [EMPRESA]: 'curto' });
    expect(() => WhatsappWebhookAuthority.verify(cabecalhos(corpo), corpo, new Date(), fraco)).toThrow(
      WhatsappWebhookAuthenticationError
    );
  });
});
