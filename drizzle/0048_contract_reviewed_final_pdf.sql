-- CONTRACT-TEMPLATE-MERGE-1: preserve a reviewed final PDF without declaring signature.

ALTER TABLE contract_artifacts
  DROP CONSTRAINT IF EXISTS contract_artifacts_type_check;
--> statement-breakpoint
ALTER TABLE contract_artifacts
  ADD CONSTRAINT contract_artifacts_type_check
  CHECK (artifact_type IN ('GENERATED_PDF','REVIEWED_FINAL_PDF','SIGNED_EVIDENCE'));
--> statement-breakpoint
ALTER TABLE contract_artifacts
  DROP CONSTRAINT IF EXISTS contract_artifacts_reviewed_final_shape;
--> statement-breakpoint
ALTER TABLE contract_artifacts
  ADD CONSTRAINT contract_artifacts_reviewed_final_shape CHECK (
    artifact_type <> 'REVIEWED_FINAL_PDF'
    OR (
      template_id IS NOT NULL
      AND source_artifact_id IS NOT NULL
      AND snapshot_json IS NOT NULL
      AND signature_method IS NULL
      AND signed_by_name IS NULL
      AND signed_at IS NULL
    )
  );
