import React, { useState } from 'react';
import { Bot, CheckCircle2, Info } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient } from '../../api/documentAiClient';
import { chooseLatestApprovedCnhDraft, type DriverCnhDraft } from '../../api/driverCnhPrefill';
import { Button } from '../ui';

interface DriverCnhPrefillButtonProps {
  driverId: string;
  onApply: (draft: DriverCnhDraft) => void;
}

export function DriverCnhPrefillButton({ driverId, onApply }: DriverCnhPrefillButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'info' | 'error'; text: string } | null>(null);

  const applyApprovedCnh = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [attachments, approvedExtractions] = await Promise.all([
        AttachmentClient.list({ entityType: 'Driver', entityId: driverId }),
        DocumentAiClient.list('APPROVED'),
      ]);
      const allowedAttachmentIds = new Set(
        attachments
          .filter((item) => !item.isArchived && item.entityType === 'Driver' && item.entityId === driverId)
          .map((item) => item.id),
      );
      const draft = chooseLatestApprovedCnhDraft(approvedExtractions, allowedAttachmentIds);
      if (!draft) {
        setMessage({
          kind: 'info',
          text: 'Nenhuma CNH aprovada pela revisão documental está disponível para este motorista.',
        });
        return;
      }
      onApply(draft);
      setMessage({
        kind: 'success',
        text: 'Dados aprovados da CNH aplicados ao formulário. Revise antes de salvar.',
      });
    } catch (error: unknown) {
      setMessage({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível carregar a CNH aprovada.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Preenchimento assistido pela CNH</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              Usa somente uma extração já aprovada na revisão humana e não salva nenhuma alteração automaticamente.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void applyApprovedCnh()} isLoading={loading} disabled={loading}>
          Aplicar CNH aprovada
        </Button>
      </div>
      {message && (
        <div className={`mt-3 flex items-start gap-2 text-xs ${
          message.kind === 'success'
            ? 'text-emerald-700 dark:text-emerald-300'
            : message.kind === 'error'
              ? 'text-red-700 dark:text-red-300'
              : 'text-blue-700 dark:text-blue-300'
        }`}>
          {message.kind === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}
