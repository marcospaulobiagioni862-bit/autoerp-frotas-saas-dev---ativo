-- CONTRACT-TEMPLATE-MERGE-1: authorize an immutable server-generated DOCX artifact.

ALTER TABLE contract_artifacts
  DROP CONSTRAINT IF EXISTS contract_artifacts_type_check;
--> statement-breakpoint
ALTER TABLE contract_artifacts
  ADD CONSTRAINT contract_artifacts_type_check
  CHECK (artifact_type IN ('GENERATED_PDF','GENERATED_DOCX','REVIEWED_FINAL_PDF','SIGNED_EVIDENCE'));
--> statement-breakpoint
ALTER TABLE contract_artifacts
  DROP CONSTRAINT IF EXISTS contract_artifacts_generated_docx_shape;
--> statement-breakpoint
ALTER TABLE contract_artifacts
  ADD CONSTRAINT contract_artifacts_generated_docx_shape CHECK (
    artifact_type <> 'GENERATED_DOCX'
    OR (
      template_id IS NOT NULL
      AND source_artifact_id IS NULL
      AND snapshot_json IS NOT NULL
      AND signature_method IS NULL
      AND signed_by_name IS NULL
      AND signed_at IS NULL
    )
  );
