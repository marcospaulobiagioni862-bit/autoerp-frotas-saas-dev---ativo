-- Extend signed contract evidence methods to include GOV.br
ALTER TABLE contract_artifacts
  DROP CONSTRAINT IF EXISTS contract_artifacts_signed_shape;

ALTER TABLE contract_artifacts
  ADD CONSTRAINT contract_artifacts_signed_shape CHECK (
    artifact_type <> 'SIGNED_EVIDENCE'
    OR (
      source_artifact_id IS NOT NULL
      AND signature_method IN ('SIGNED_PDF_UPLOAD', 'GOV_BR')
      AND signed_by_name IS NOT NULL
      AND signed_at IS NOT NULL
    )
  );
