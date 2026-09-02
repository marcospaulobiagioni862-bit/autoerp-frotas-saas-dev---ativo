-- ISSUE-690: safe provider-disabled traffic-ticket communication template.

ALTER TABLE whatsapp_template_catalog
  DROP CONSTRAINT IF EXISTS whatsapp_template_catalog_key_check;
ALTER TABLE whatsapp_template_catalog
  ADD CONSTRAINT whatsapp_template_catalog_key_check
  CHECK (template_key IN ('DRIVER_CNH_EXPIRY', 'TRAFFIC_TICKET_NOTICE'));

ALTER TABLE whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_template_check;
ALTER TABLE whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_template_check
  CHECK (template_key IN ('DRIVER_CNH_EXPIRY', 'TRAFFIC_TICKET_NOTICE'));

ALTER TABLE whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_reference_check;
ALTER TABLE whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_reference_check
  CHECK (reference_type IN ('DRIVER', 'TRAFFIC_TICKET'));

INSERT INTO whatsapp_template_catalog (
  company_id, template_key, version, status, body_text, parameter_keys
)
SELECT id, 'TRAFFIC_TICKET_NOTICE', 1, 'ACTIVE',
       'Olá {{driverName}}, identificamos a multa {{autoNumber}} do veículo {{plate}}, ocorrida em {{infractionDate}} em {{infractionLocation}}. Órgão: {{organName}}. Código: {{infractionCode}}. Descrição: {{description}}. Pontos: {{points}}. Valor: R$ {{amount}}. Vencimento: {{dueDate}}. Prazo para indicação: {{indicationDeadline}}.',
       '["driverName","autoNumber","plate","infractionDate","infractionLocation","organName","infractionCode","description","points","amount","dueDate","indicationDeadline"]'::jsonb
FROM companies
ON CONFLICT (company_id, template_key, version) DO NOTHING;
