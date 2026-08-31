import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ['rg', 'RG / documento de identidade'],
  ['birthDate', 'Data de nascimento'],
  ['registrationNumber', 'Número da CNH'],
  ['category', 'Categoria'],
  ['expirationDate', 'Validade da CNH'],
] as const;

type CnhFieldKey = (typeof CNH_FIELDS)[number][0];
type ApprovedCnhDriverDraftWithIntake = ApprovedCnhDriverDraft & { intakeId: string; driverId: string };
type LocalPhase = 'IDLE' | 'UPLOADING' | 'REQUESTING';

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

function progressFor(step: string): { percent: number; label: string; detail: string } {
  if (step === 'UPLOADING') return { percent: 20, label: 'Enviando CNH', detail: 'Transferindo o arquivo com segurança.' };
  if (step === 'REQUESTING') return { percent: 40, label: 'Preparando análise', detail: 'Arquivo recebido. Preparando a leitura pela IA.' };
  if (step === 'PENDING') return { percent: 55, label: 'CNH na fila de análise', detail: 'Aguardando o processamento iniciar.' };
  if (step === 'PROCESSING') return { percent: 80, label: 'CNH sendo analisada', detail: 'Extraindo e validando os dados visíveis no documento.' };
  return { percent: 100, label: 'Análise concluída', detail: 'Dados prontos para revisão.' };
}

export const DriverCnhIntakeModal: React.FC<Props> = ({ isOpen, onClose, onDraftReady }) => {
  const [file, setFile] = useState<File | null>(null);
  const [intakeId, setIntakeId] = useState('');
  const [extractionId, setExtractionId] = useState('');
  const [extraction, setExtraction] = useState<DocumentAiExtraction | null>(null);
  const [savedDriverId, setSavedDriverId] = useState('');
  const [draft, setDraft] = useState<Record<CnhFieldKey, string>>({
    name: '', cpf: '', rg: '', birthDate: '', registrationNumber: '', category: '', expirationDate: '',
  });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPhase, setLocalPhase] = useState<LocalPhase>('IDLE');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const step = useMemo(() => {
    if (localPhase === 'UPLOADING') return 'UPLOADING';
    if (localPhase === 'REQUESTING') return 'REQUESTING';
    if (!extractionId) return 'UPLOAD';
    return extraction?.status || 'PENDING';
  }, [localPhase, extractionId, extraction?.status]);

  const reset = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIntakeId('');
    setExtractionId('');
    setExtraction(null);
    setSavedDriverId('');
    setDraft({ name: '', cpf: '', rg: '', birthDate: '', registrationNumber: '', category: '', expirationDate: '' });
    setNotes('');
    setError(null);
    setBusy(false);
    setLocalPhase('IDLE');
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
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Use PDF, JPG, PNG ou WebP para a CNH.');
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_BYTES) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('O arquivo da CNH deve ter no máximo 20 MB.');
      return;
    }
    setFile(selected);
  };

  const clearSelectedFile = () => {
    if (busy) return;
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadExtraction = async (id: string) => {
    const item = await DocumentAiFocusedClient.get(id);
    setExtraction(item);
    if (item.status === 'REVIEW_REQUIRED') {
      setDraft({
        name: valueText(item.proposedFields.name),
        cpf: valueText(item.proposedFields.cpf),
        rg: valueText(item.proposedFields.rg),
        birthDate: valueText(item.proposedFields.birthDate),
        registrationNumber: valueText(item.proposedFields.registrationNumber),
        category: valueText(item.proposedFields.category),
        expirationDate: valueText(item.proposedFields.expirationDate),
      });
    }
    return item;
  };

  useEffect(() => {
    if (!isOpen || !extractionId || (step !== 'PENDING' && step !== 'PROCESSING')) return undefined;
    const timer = window.setInterval(() => {
      void loadExtraction(extractionId).catch((err) => setError(safeError(err)));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isOpen, extractionId, step]);

  const start = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setLocalPhase('UPLOADING');
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
      setLocalPhase('REQUESTING');
      const requested = await DriverDocumentIntakeClient.requestDocumentAi(intake.id);
      setExtractionId(requested.item.id);
      setLocalPhase('IDLE');
      await loadExtraction(requested.item.id);
    } catch (err) {
      setLocalPhase('IDLE');
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
      if (decision === 'APPROVE' && reviewed.status === 'APPROVED') {
        if (!intakeId) throw new Error('A aprovação não possui um processo de CNH válido.');
        const materialized = await DriverDocumentIntakeClient.materializeApprovedCnh(intakeId);
        setSavedDriverId(materialized.driverId);
      }
    } catch (err) {
      setError(safeError(err));
    } finally {
      setBusy(false);
    }
  };

  const useApprovedDraft = async () => {
    if (!intakeId || extraction?.status !== 'APPROVED' || !savedDriverId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const approved = await DriverDocumentIntakeClient.getApprovedCnhDraft(intakeId);
      const approvedWithIntake: ApprovedCnhDriverDraftWithIntake = {
        ...approved,
        intakeId,
        driverId: savedDriverId,
      };
      reset();
      onClose();
      onDraftReady(approvedWithIntake);
    } catch (err) {
      setError(safeError(err));
    } finally {
      setBusy(false);
    }
  };

  const progress = progressFor(step);
  const showProgress = ['UPLOADING', 'REQUESTING', 'PENDING', 'PROCESSING'].includes(step);

  return (
    <ModalContainer isOpen={isOpen} onClose={close} title="Cadastrar motorista pela CNH" maxWidth="2xl">
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">A CNH salva o documento e cria o cadastro inicial após sua aprovação.</p>
              <p className="mt-1 text-xs text-slate-500">Você revisa os dados da habilitação. Telefone, endereço, e-mail e plataformas podem ser completados depois.</p>
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
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
              <FileUp className="mx-auto mb-2 h-8 w-8 text-slate-400" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Adicionar arquivo da CNH</p>
              <p className="mt-1 text-xs text-slate-500">PDF, JPG, PNG ou WebP · até 20 MB</p>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => selectFile(event.target.files?.[0] || null)}
                disabled={busy}
              />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                  <FileUp className="mr-1.5 h-4 w-4" />{file ? 'Trocar arquivo' : 'Selecionar CNH'}
                </Button>
                {file && (
                  <Button type="button" variant="outline" onClick={clearSelectedFile} disabled={busy}>
                    Remover arquivo
                  </Button>
                )}
              </div>
            </div>
            {file ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <strong>CNH selecionada:</strong> {file.name}
              </div>
            ) : (
              <p className="text-center text-xs text-slate-500">Nenhum arquivo selecionado. Selecione a CNH para liberar a análise.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
              <Button type="button" variant="primary" onClick={start} disabled={!file || busy} isLoading={busy}>
                <ScanLine className="mr-1.5 h-4 w-4" />Analisar CNH
              </Button>
            </div>
          </div>
        )}

        {showProgress && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{progress.label}</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{progress.percent}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
              <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="text-center">
              <RefreshCw className="mx-auto mb-2 h-7 w-7 animate-spin text-emerald-600" />
              <p className="text-xs text-slate-500">{progress.detail}</p>
              {(step === 'PENDING' || step === 'PROCESSING') && (
                <p className="mt-1 text-[11px] text-slate-400">O status é atualizado automaticamente a cada 4 segundos.</p>
              )}
            </div>
            {(step === 'PENDING' || step === 'PROCESSING') && (
              <div className="text-center">
                <Button type="button" variant="outline" onClick={refresh} disabled={busy}>Atualizar agora</Button>
              </div>
            )}
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
                <CheckCircle2 className="mr-1.5 h-4 w-4" />Aprovar e salvar CNH
              </Button>
            </div>
          </div>
        )}

        {step === 'APPROVED' && (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {savedDriverId ? 'CNH revisada, aprovada e salva' : 'CNH aprovada, aguardando gravação'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {savedDriverId
                  ? 'O arquivo original e os dados da habilitação já estão vinculados ao cadastro inicial. Os demais dados podem ser completados agora ou depois.'
                  : 'A CNH foi aprovada, mas o cadastro inicial ainda não foi salvo. Verifique o aviso acima antes de continuar.'}
              </p>
            </div>
            <Button type="button" variant="primary" onClick={useApprovedDraft} disabled={busy || !savedDriverId} isLoading={busy}>
              Completar dados agora
            </Button>
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
