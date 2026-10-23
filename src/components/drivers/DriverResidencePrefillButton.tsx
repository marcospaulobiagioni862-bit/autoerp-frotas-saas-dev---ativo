import React, { useState } from 'react';
import { Home, Bot, CheckCircle2, AlertCircle } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient } from '../../api/documentAiClient';
import { resolveResidenceDraft, type DriverResidenceDraft } from '../../api/driverResidencePrefill';
import { Button } from '../ui';

interface DriverResidencePrefillButtonProps {
  driverId: string;
  onApply: (draft: DriverResidenceDraft) => void;
}

export function DriverResidencePrefillButton({ driverId, onApply }: DriverResidencePrefillButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null);

  const applyResidenceProof = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [attachments, extractions] = await Promise.all([
        AttachmentClient.list({ entityType: 'Driver', entityId: driverId }),
        DocumentAiClient.list(),
      ]);

      const draft = await resolveResidenceDraft(extractions, attachments);
      if (!draft) {
        setMessage({
          kind: 'info',
          text: 'Nenhum comprovante de residência com dados extraídos foi encontrado para este motorista. Certifique-se de que o comprovante foi anexado e revisado.',
        });
        return;
      }

      onApply(draft);
      setMessage({
        kind: 'success',
        text: 'Endereço preenchido automaticamente a partir do comprovante de residência! Revise os campos antes de salvar.',
      });
    } catch (error: unknown) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível ler o comprovante de residência.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-info-border bg-info-bg p-3" id="driver-residence-prefill-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-info-icon" />
          <div>
            <p className="text-sm font-semibold text-graphite-800 dark:text-graphite-100">Preenchimento assistido pelo Comprovante</p>
            <p className="mt-0.5 text-xs text-graphite-600 dark:text-graphite-400">
              Extrai endereço (CEP, logradouro, número, bairro, cidade, UF) a partir do comprovante de residência anexado.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          id="btn-apply-residence-proof"
          onClick={() => void applyResidenceProof()}
          isLoading={loading}
          disabled={loading}
        >
          <Home className="mr-1.5 h-3.5 w-3.5" />
          Preencher do Comprovante
        </Button>
      </div>
      {message && (
        <div className={`mt-3 flex items-start gap-2 text-xs ${
          message.kind === 'success' ? 'text-success-text' : message.kind === 'error' ? 'text-error-text' : 'text-graphite-600 dark:text-graphite-300'
        }`}>
          {message.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-icon" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info-icon" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}
