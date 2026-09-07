import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSignature, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { ContractClient } from '../../api/contractClient';
import { ContractExecutionClient } from '../../api/contractExecutionClient';
import { ContractTemplateClient } from '../../api/contractTemplateClient';
import type { Contract, ContractArtifact, ContractSignatureMethod, ContractTemplate, FileAttachment } from '../../types/entities';
import { ContractStatus } from '../../types/enums';
import { Badge, Button, Card, Input } from '../ui';
import { FileUpload } from '../documents/FileUpload';

interface ContractExecutionPanelProps {
  contract: Contract;
  incomeCategoryId: string;
  onChanged: () => Promise<void> | void;
  focusOnOpen?: boolean;
}

const signatureMethodLabel = (method?: ContractSignatureMethod): string =>
  method === 'GOV_BR' ? 'GOV.br' : method === 'NOTARY' ? 'Cartório' : 'Upload de PDF assinado';

export const ContractExecutionPanel: React.FC<ContractExecutionPanelProps> = ({ contract, incomeCategoryId, onChanged, focusOnOpen = false }) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [artifacts, setArtifacts] = useState<ContractArtifact[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(contract.templateId || '');
  const [signedAttachment, setSignedAttachment] = useState<FileAttachment | null>(null);
  const [signedByName, setSignedByName] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [signatureMethod, setSignatureMethod] = useState<ContractSignatureMethod>('GOV_BR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const generatedPdf = useMemo(
    () => artifacts.find((item) => item.artifactType === 'GENERATED_PDF' && item.isCurrent && !item.isArchived),
    [artifacts]
  );
  const generatedDocx = useMemo(
    () => artifacts.find((item) => item.artifactType === 'GENERATED_DOCX' && item.isCurrent && !item.isArchived),
    [artifacts]
  );
  const generated = generatedDocx || generatedPdf;
  const reviewed = useMemo(
    () => artifacts.find((item) => item.artifactType === 'REVIEWED_FINAL_PDF' && item.isCurrent && !item.isArchived),
    [artifacts]
  );
  const signed = useMemo(
    () => artifacts.find((item) => item.artifactType === 'SIGNED_EVIDENCE' && item.isCurrent && !item.isArchived),
    [artifacts]
  );

  const load = async () => {
    try {
      const [templateList, artifactList] = await Promise.all([
        ContractTemplateClient.list(),
        ContractExecutionClient.listArtifacts(contract.id),
      ]);
      setTemplates(templateList);
      setArtifacts(artifactList);
      setSelectedTemplateId((current) => current || contract.templateId || templateList.find((item) => item.templateKey === 'locacao-padrao')?.id || templateList[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao carregar execução do contrato.');
    }
  };

  useEffect(() => {
    setSignedAttachment(null);
    setSignedByName('');
    setSignedAt('');
    setSignatureMethod('GOV_BR');
    setError(null);
    setSuccess(null);
    void load();
  }, [contract.id, contract.templateId]);

  useEffect(() => {
    if (!focusOnOpen) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnOpen, contract.id]);

  const run = async (task: () => Promise<void>, successMessage: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await task();
      setSuccess(successMessage);
      await load();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha na execução do contrato.');
    } finally {
      setLoading(false);
    }
  };

  const generateOfficial = () => {
    if (!selectedTemplateId) {
      setError('Selecione um modelo de contrato.');
      return;
    }
    const selected = templates.find((item) => item.id === selectedTemplateId);
    if (!selected) {
      setError('O modelo selecionado não está disponível.');
      return;
    }
    const docxBacked = !selected.contentMarkdown.trim();
    void run(async () => {
      if (docxBacked) {
        await ContractExecutionClient.generateDocx(contract.id, selectedTemplateId);
      } else {
        await ContractExecutionClient.generatePdf(contract.id, selectedTemplateId);
      }
    }, docxBacked
      ? 'DOCX oficial preenchido preservando o layout do modelo. Revise e assine externamente em PDF.'
      : 'PDF oficial gerado no servidor e registrado com integridade SHA-256.');
  };

  const openAttachment = async (attachmentId: string) => {
    setError(null);
    try {
      const blob = await AttachmentClient.content(attachmentId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao abrir documento.');
    }
  };

  const registerEvidence = () => {
    if (!signedAttachment) {
      setError('Envie o PDF assinado antes de registrar a evidência.');
      return;
    }
    if (!signedByName.trim()) {
      setError('Informe o nome de quem assinou.');
      return;
    }
    void run(async () => {
      await ContractExecutionClient.registerSignatureEvidence(contract.id, {
        attachmentId: signedAttachment.id,
        signedByName: signedByName.trim(),
        signedAt: signedAt ? new Date(`${signedAt}T12:00:00`).toISOString() : undefined,
        signatureMethod,
      });
      setSignedAttachment(null);
    }, `Evidência do PDF assinado registrada com método ${signatureMethodLabel(signatureMethod)}.`);
  };

  const activate = () => {
    if (!incomeCategoryId) {
      setError('Selecione a categoria financeira de receita do aluguel antes de ativar.');
      return;
    }
    void run(async () => {
      await ContractClient.activate(contract.id, incomeCategoryId);
    }, 'Contrato ativado com assinatura, vínculo e cobrança confirmados.');
  };

  const canGenerate = [ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status) && !signed;
  const canActivate = [ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)
    && (contract.signatureRequired === false || Boolean(signed));

  return (
    <div ref={panelRef} data-contract-section="pdf-signature">
      <Card padding="sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-bold"><FileSignature className="w-4 h-4 text-emerald-600" />Contrato e assinatura</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Gere o documento oficial. Modelos DOCX preservam o layout do Word: abra o DOCX preenchido, revise/converta e assine externamente em PDF; depois envie o PDF assinado como evidência. GOV.br registra o método informado, sem validação criptográfica automática pelo ERP.
          </p>
        </div>
        <Badge variant={signed ? 'success' : generated ? 'warning' : 'neutral'}>
          {signed ? 'ASSINADO / EVIDÊNCIA' : generated ? 'AGUARDANDO ASSINATURA' : 'DOCUMENTO NÃO GERADO'}
        </Badge>
      </div>

      {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {success && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-slate-500" /><b className="text-xs">Documento oficial</b></div>
          <label className="block text-xs font-semibold text-slate-600">
            Modelo do contrato
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
              value={selectedTemplateId}
              disabled={!canGenerate || Boolean(generated)}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">Selecione</option>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.title} • v{item.versionNumber} • {item.contentMarkdown.trim() ? 'PDF' : 'DOCX'}</option>)}
            </select>
          </label>
          {generated ? (
            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
                <b>Snapshot SHA-256</b><div className="mt-1 break-all font-mono text-[10px] text-slate-500">{generated.snapshotHash}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {generatedDocx && (
                  <Button size="sm" variant="secondary" onClick={() => void openAttachment(generatedDocx.attachmentId)}>
                    <Download className="w-4 h-4" />Abrir DOCX preenchido
                  </Button>
                )}
                {generatedPdf && (
                  <Button size="sm" variant="secondary" onClick={() => void openAttachment(generatedPdf.attachmentId)}>
                    <Download className="w-4 h-4" />Abrir PDF gerado
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Nenhum documento oficial foi gerado para este contrato.</p>
          )}
          {canGenerate && (
            <Button size="sm" variant="primary" isLoading={loading} onClick={generateOfficial} disabled={!selectedTemplateId}>
              {generated ? <RefreshCw className="w-4 h-4" /> : <FileText className="w-4 h-4" />}{generated ? 'Regenerar documento' : 'Gerar documento'}
            </Button>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-slate-500" /><b className="text-xs">Evidência do assinado</b></div>
          {signed ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="w-4 h-4" /><b>Evidência registrada</b></div>
              <p>Método: <b>{signatureMethodLabel(signed.signatureMethod)}</b></p>
              <p>Assinado por: <b>{signed.signedByName || '—'}</b></p>
              <p>Data/hora: {signed.signedAt ? new Date(signed.signedAt).toLocaleString('pt-BR') : '—'}</p>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50"><b>Checksum do PDF assinado</b><div className="mt-1 break-all font-mono text-[10px] text-slate-500">{signed.snapshotHash}</div></div>
              <Button size="sm" variant="secondary" onClick={() => void openAttachment(signed.attachmentId)}><Download className="w-4 h-4" />Abrir PDF assinado</Button>
            </div>
          ) : generated ? (
            <div className="space-y-3">
              <FileUpload
                entityType="Contract"
                entityId={contract.id}
                documentType="SIGNED_CONTRACT"
                allowedTypes={['application/pdf']}
                multiple={false}
                onUploadComplete={(attachment) => setSignedAttachment(attachment as FileAttachment)}
              />
              {signedAttachment && <div className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-900/50">Arquivo pronto: <b>{signedAttachment.fileName}</b></div>}
              <label className="block text-xs font-semibold text-slate-600">
                Método de assinatura
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                  value={signatureMethod}
                  onChange={(event) => setSignatureMethod(event.target.value as ContractSignatureMethod)}
                >
                  <option value="GOV_BR">GOV.br</option>
                  <option value="NOTARY">Cartório</option>
                  <option value="SIGNED_PDF_UPLOAD">Outro PDF assinado</option>
                </select>
              </label>
              <Input value={signedByName} onChange={(event) => setSignedByName(event.target.value)} placeholder="Nome de quem assinou" />
              <Input type="date" value={signedAt} onChange={(event) => setSignedAt(event.target.value)} />
              <Button size="sm" variant="primary" isLoading={loading} onClick={registerEvidence} disabled={!signedAttachment || !signedByName.trim()}>
                <ShieldCheck className="w-4 h-4" />Registrar evidência assinada
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Gere o documento oficial antes de enviar o documento assinado.</p>
          )}
        </div>
      </div>

      {canActivate && contract.status !== ContractStatus.ACTIVE && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="text-xs"><b>Contrato apto para ativação</b><p className="mt-0.5 text-slate-500">O servidor repetirá todos os gates antes de vincular veículo, motorista e cobrança.</p></div>
          <Button size="sm" variant="primary" isLoading={loading} onClick={activate} disabled={!incomeCategoryId}>Ativar contrato</Button>
        </div>
      )}

      {!signed && generated && canGenerate && (
        <div className="mt-3 text-[11px] text-slate-500 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" />Os termos ficam bloqueados após a geração do documento oficial para evitar divergência entre banco e documento.</div>
      )}
      </Card>
    </div>
  );
};
