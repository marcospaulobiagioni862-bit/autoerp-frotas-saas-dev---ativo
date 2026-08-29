import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, RefreshCw, ScanLine, ShieldCheck, XCircle } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { DocumentAiClient, type DocumentAiExtraction } from '../../api/documentAiClient';
import { DocumentAiFocusedClient } from '../../api/documentAiFocusedClient';
import {
  DriverDocumentIntakeClient,
  type ApprovedCnhDriverDraft,
} from '../../api/driverDocumentIntakeClient';
import { Button, Input, ModalContainer } from '../ui';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const CNH_FIELDS = [
  ['name', 'Nome completo'],
  ['cpf', 'CPF'],
  ['birthDate', 'Data de nascimento'],
  ['registrationNumber', 'Número da CNH'],
  ['category', 'Categoria'],
  ['expirationDate', 'Validade da CNH'],
] as const;

type CnhFieldKey = (typeof CNH_FIELDS)[number][0];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onDraftReady: (draft: ApprovedCnhDriverDraft) => void;
};

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : String(value);
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir o processamento da CNH.';
}

export const DriverCnhIntakeModal: React.FC<Props> = ({ isOpen, onClose, onDraftReady }) => {
  const [file, setFile] = useState<File | null>(null);
  const [intakeId, setIntakeId] = useState('');
  const [extractionId, setExtractionId] = useState('');
  const [extraction, setExtraction] = useState<DocumentAiExtraction | null>(null);
  const [draft, setDraft] = useState<Record<CnhFieldKey, string>>({
    name: '', cpf: '', birthDate: '', registrationNumber: '', category: '', expirationDate: '',
  });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = useMemo(() => {
    if (!extractionId) return 'UPLOAD';
    return extraction?.status || 'PENDING';
  }, [extractionId, extraction?.status]);

  const reset = () => {
    setFile(null);
    setIntakeId('');
    setExtractionId('');
    setExtraction(null);
    setDraft({ name: '', cpf: '', birthDate: '', registrationNumber: '', category: '', expirationDate: '' });
    setNotes('');
    setError(null);
    setBusy(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const selectFile = (selected: File | null) => {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(selected.type)) {
      setFile(null);
      setError('Use PDF, JPG, PNG ou WebP para a CNH.');
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_BYTES) {
      setFile(null);
      setError('O arquivo da CNH deve ter no máximo 20 MB.');
      return;
    }
    setFile(selected);
  };

  const loadExtraction = async (id: string) => {
    const item = await DocumentAiFocusedClient.get(id);
    setExtraction(item);
    if (item.status === 'REVIEW_REQUIRED') {
      setDraft({
        name: valueText(item.proposedFields.name),
        cpf: valueText(item.proposedFields.cpf),
        birthDate: valueText(item.proposedFields.birthDate),
        registrationNumber: valueText(item.proposedFields.registrationNumber),
        category: valueText(item.proposedFields.category),
        expirationDate: valueText(item.proposedFields.expirationDate),
      });
    }
    return item;
  };

  const start = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const idempotencyKey = `driver-cnh-ui:${crypto.randomUUID()}`;
      const intake = await DriverDocumentIntakeClient.create(idempotencyKey);
      setIntakeId(intake.id);
      await AttachmentClient.upload({
        entityType: 'DriverDocumentIntake',
        entityId: intake.id,
        documentType: 'CNH',
        fileName: file.name,
        mimeType: file.type,
        content: file,
        description: 'CNH para pré-cadastro de motorista',
      });
      const requested = await DriverDocumentIntakeClient.requestDocumentAi(intake.id);
      setExtractionId(requested.item.id);
      await loadExtraction(requested.item.id);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!extractionId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loadExtraction(extractionId);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setBusy(false);
    }
  };

  const review = async (decision: 'APPROVE' | 'REJECT') => {
    if (!extraction || extraction.status !== 'REVIEW_REQUIRED' || busy) return;
    if (decision === 'APPROVE' && extraction.detectedDocumentType !== 'CNH') {
      setError('O documento analisado não foi reconhecido como CNH e não pode preencher o motorista.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const corrections: Record<string, unknown> = {};
      for (const [key] of CNH_FIELDS) {
        const original = valueText(extraction.proposedFields[key]);
        if (draft[key] !== original) corrections[key] = draft[key];
      }
      const reviewed = await DocumentAiClient.review(extraction.id, {
        decision,
        corrections,
        notes: notes.trim() || undefined,
      });
      setExtraction(reviewed);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setBusy(false);
    }
  };

  const useApprovedDraft = async () => {
    if (!intakeId || extraction?.status !== 'APPROVED' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const approved = await DriverDocumentIntakeClient.getApprovedCnhDraft(intakeId);
      reset();
      onClose();
      onDraftReady(approved);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={close} title="Cadastrar motorista pela CNH" maxWidth="2xl">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">A CNH não cadastra ninguém sozinha.</p>
              <p className="mt-1 text-xs text-slate-500">O documento gera uma proposta, você revisa os dados e o cadastro final continua exigindo confirmação.</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'UPLOAD' && (
          <div className="space-y-4">
            <label className="block rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
              <FileUp className="mx-auto mb-2 h-7 w-7 text-slate-400" />
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">Selecione a CNH</span>
              <span className="mt-1 block text-xs text-slate-500">PDF, JPG, PNG ou WebP · até 20 MB</span>
              <input
                className="mt-4 block w-full text-xs"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => selectFile(event.target.files?.[0] || null)}
                disabled={busy}
              />
            </label>
            {file && <p className="text-xs text-slate-500">Arquivo selecionado: <strong>{file.name}</strong></p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
              <Button type="button" variant="primary" onClick={start} disabled={!file || busy} isLoading={busy}>
                <ScanLine className="mr-1.5 h-4 w-4" />Analisar CNH
              </Button>
            </div>
          </div>
        )}

        {(step === 'PENDING' || step === 'PROCESSING') && (
          <div className="space-y-4 text-center py-4">
            <RefreshCw className={`mx-auto h-8 w-8 text-emerald-600 ${busy ? 'animate-spin' : ''}`} />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{step === 'PENDING' ? 'CNH na fila de análise' : 'CNH sendo analisada'}</p>
              <p className="mt-1 text-xs text-slate-500">Atualize o estado quando o processamento estiver disponível.</p>
            </div>
            <Button type="button" variant="outline" onClick={refresh} disabled={busy}>Atualizar estado</Button>
          </div>
        )}

        {step === 'REVIEW_REQUIRED' && extraction && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Revise os dados reconhecidos</p>
              <p className="text-xs text-slate-500">Documento detectado: {extraction.detectedDocumentType || 'não identificado'}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CNH_FIELDS.map(([key, label]) => (
                <Input
                  key={key}
                  label={label}
                  value={draft[key]}
                  onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                />
              ))}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Observação da revisão</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => review('REJECT')} disabled={busy}>
                <XCircle className="mr-1.5 h-4 w-4" />Rejeitar
              </Button>
              <Button type="button" variant="primary" onClick={() => review('APPROVE')} disabled={busy || extraction.detectedDocumentType !== 'CNH'} isLoading={busy}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />Aprovar CNH
              </Button>
            </div>
          </div>
        )}

        {step === 'APPROVED' && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">CNH revisada e aprovada</p>
              <p className="mt-1 text-xs text-slate-500">Agora os dados aprovados podem preencher o rascunho do novo motorista.</p>
            </div>
            <Button type="button" variant="primary" onClick={useApprovedDraft} disabled={busy} isLoading={busy}>Preencher cadastro</Button>
          </div>
        )}

        {(step === 'FAILED' || step === 'REJECTED') && (
          <div className="space-y-4 text-center py-4">
            <XCircle className="mx-auto h-9 w-9 text-rose-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">Esta tentativa não pode preencher o cadastro</p>
              <p className="mt-1 text-xs text-slate-500">{extraction?.failureCode ? `Falha: ${extraction.failureCode}. ` : ''}Inicie uma nova tentativa com um documento legível.</p>
            </div>
            <Button type="button" variant="outline" onClick={reset} disabled={busy}>Nova tentativa</Button>
          </div>
        )}
      </div>
    </ModalContainer>
  );
};
