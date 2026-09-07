-- KM-WHATSAPP-1: provider-disabled KM reading request template and outbox reference.
-- No provider call is enabled by this migration.

ALTER TABLE whatsapp_template_catalog
  DROP CONSTRAINT IF EXISTS whatsapp_template_catalog_key_check;
ALTER TABLE whatsapp_template_catalog
  ADD CONSTRAINT whatsapp_template_catalog_key_check
  CHECK (template_key IN ('DRIVER_CNH_EXPIRY', 'TRAFFIC_TICKET_NOTICE', 'KM_READING_REQUEST'));

ALTER TABLE whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_template_check;
ALTER TABLE whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_template_check
  CHECK (template_key IN ('DRIVER_CNH_EXPIRY', 'TRAFFIC_TICKET_NOTICE', 'KM_READING_REQUEST'));

ALTER TABLE whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_reference_check;
ALTER TABLE whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_reference_check
  CHECK (reference_type IN ('DRIVER', 'TRAFFIC_TICKET', 'VEHICLE_KM_READING'));

INSERT INTO whatsapp_template_catalog (
  company_id, template_key, version, status, body_text, parameter_keys
)
SELECT id, 'KM_READING_REQUEST', 1, 'ACTIVE',
       'Olá {{driverName}}, precisamos atualizar a quilometragem do veículo {{plate}} — {{vehicleDescription}}. Por favor, envie a quilometragem atual exibida no painel e, se possível, uma foto do odômetro. Data prevista da leitura: {{dueDate}}.',
       '["driverName","plate","vehicleDescription","dueDate"]'::jsonb
FROM companies
ON CONFLICT (company_id, template_key, version) DO NOTHING;
