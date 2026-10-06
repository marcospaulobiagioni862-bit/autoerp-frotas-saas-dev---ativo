-- Violacoes de CSP relatadas pelo navegador, agregadas por assinatura.
--
-- Por que agregada e nao log cru: o endpoint que alimenta esta tabela e
-- PUBLICO e nao autenticado, porque o navegador envia o relatorio sem sessao.
-- Guardar uma linha por relatorio seria vetor de inundacao. Agregando por
-- assinatura, uma enxurrada apenas incrementa um contador, e a leitura ja sai
-- no formato util: qual diretiva teria bloqueado o que, e quantas vezes.
--
-- Por que existe: a politica de CSP esta em Report-Only, e a unica forma de
-- decidir com seguranca a virada para bloqueio e saber o que ela TERIA
-- bloqueado. O coletor escrevia so em stdout, e o log do Render nao e
-- alcancavel sem painel nem SSH neste servico.
CREATE TABLE IF NOT EXISTS csp_violation_reports (
  signature text PRIMARY KEY,
  directive text NOT NULL,
  blocked_uri text NOT NULL,
  document_uri text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csp_violation_last_seen
  ON csp_violation_reports (last_seen DESC);
