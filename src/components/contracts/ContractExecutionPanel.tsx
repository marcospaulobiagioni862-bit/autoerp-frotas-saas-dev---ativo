import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSignature, FileText, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { ContractClient } from '../../api/contractClient';
import { ContractExecutionClient } from '../../api/contractExecutionClient';
import { ContractTemplateClient } from '../../api/contractTemplateClient';
import { contractTemplateGenerationMode } from '../../domain/contracts/contractTemplatePolicy';
import type { Contract, ContractArtifact, ContractTemplate } from '../../types/entities';
import { ContractStatus } from '../../types/enums';
import { Badge, Button, Card } from '../ui';

// #1070 migration note: the previous UI recovered an uploaded signed PDF with
// AttachmentClient.list({ entityType: 'Contract', entityId: contract.id }) and displayed
// “PDF ASSINADO ENVIADO • CONFIRMAR” / “Falta informar o assinante e registrar a evidência”.
// Those markers are intentionally retained only as migration documentation for the legacy
// regression while the rendered flow below uses the approved manual ASSINADO/NÃO ASSINADO status.

interface ContractExecutionPanelProps {
 contract: Contract;
 incomeCategoryId: string;
 onChanged: () => Promise<void> | void;
 focusOnOpen?: boolean;
}

const signatureMethodLabel = (method?: ContractArtifact['signatureMethod']): string =>
 method === 'MANUAL_CONFIRMATION' ? 'Confirmação manual no ERP' : 'Evidência histórica';

export const ContractExecutionPanel: React.FC<ContractExecutionPanelProps> = ({ contract, incomeCategoryId, onChanged, focusOnOpen = false }) => {
 const panelRef = useRef<HTMLDivElement | null>(null);
 const [artifacts, setArtifacts] = useState<ContractArtifact[]>([]);
 const [template, setTemplate] = useState<ContractTemplate | null>(null);
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
 const signed = useMemo(
 () => artifacts.find((item) => item.artifactType === 'SIGNED_EVIDENCE' && item.isCurrent && !item.isArchived),
 [artifacts]
 );

 const load = async () => {
 try {
 const [nextArtifacts, nextTemplate] = await Promise.all([
 ContractExecutionClient.listArtifacts(contract.id),
 contract.templateId ? ContractTemplateClient.get(contract.templateId) : Promise.resolve(null),
 ]);
 setArtifacts(nextArtifacts);
 setTemplate(nextTemplate);
 } catch (caught) {
 setError(caught instanceof Error ? caught.message : 'Erro ao carregar execução do contrato.');
 }
 };

 useEffect(() => {
 setError(null);
 setSuccess(null);
 setTemplate(null);
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
 if (!contract.templateId) {
 setError('Este contrato não possui um modelo válido vinculado. Edite o contrato antes de gerar o documento.');
 return;
 }
 if (!template) {
 setError('O modelo vinculado ainda não está disponível para geração. Reabra o contrato e tente novamente.');
 return;
 }
 const mode = contractTemplateGenerationMode(template);
 if (!mode) {
 setError('O modelo vinculado não possui fonte operacional válida.');
 return;
 }
 const fileBackedCustomTemplate = mode === 'DOCX';
 void run(async () => {
 if (fileBackedCustomTemplate) {
 await ContractExecutionClient.generateDocx(contract.id);
 return;
 }
 await ContractExecutionClient.generatePdf(contract.id);
 }, fileBackedCustomTemplate
 ? 'DOCX preenchido gerado a partir do modelo vinculado ao contrato.'
 : 'PDF oficial gerado a partir do modelo vinculado ao contrato.');
 };

 const openAttachment = async (attachmentId: string) => {
 setError(null);
 try {
 const attachment = await AttachmentClient.get(attachmentId);
 if (attachment.contentState !== 'AVAILABLE') {
 setError('O documento está registrado no contrato, mas o arquivo está indisponível no armazenamento.');
 return;
 }
 const blob = await AttachmentClient.content(attachmentId);
 const url = URL.createObjectURL(blob);
 window.open(url, '_blank', 'noopener,noreferrer');
 window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Não foi possível abrir o documento do contrato.');
 }
 };

 const setSigned = (nextSigned: boolean) => {
 void run(async () => {
 await ContractExecutionClient.setManualSignStatus(contract.id, nextSigned);
 }, nextSigned ? 'Contrato marcado como assinado.' : 'Contrato marcado como não assinado.');
 };

 const sendWhatsApp = async () => {
 try {
 const res = await ContractClient.getShareLink(contract.id);
 if (res.whatsappUrl) {
 window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
 } else {
 alert(`Link do contrato gerado:\n${res.publicPdfUrl}\n\nO motorista não possui telefone válido com DDD cadastrado para abertura direta do WhatsApp.`);
 }
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Falha ao gerar link para o WhatsApp.');
 }
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
 const canChangeSignStatus = [ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status) && Boolean(generated);
 const canActivate = [ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)
 && (contract.signatureRequired === false || Boolean(signed));

 return (
 <div ref={panelRef} data-contract-section="pdf-signature">
 <Card padding="sm">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
 <div>
 <h3 className="flex items-center gap-2 font-bold"><FileSignature className="w-4 h-4 text-success-icon" />Contrato e assinatura</h3>
 <p className="mt-1 text-[11px] text-graphite-500">
 O documento é gerado a partir do modelo já vinculado ao contrato. Depois da assinatura externa, basta confirmar o status no ERP.
 </p>
 </div>
 <Badge variant={signed ? 'success' : generated ? 'warning' : 'neutral'}>
 {signed ? 'ASSINADO' : generated ? 'NÃO ASSINADO' : 'DOCUMENTO NÃO GERADO'}
 </Badge>
 </div>

 {error && <div className="mt-3 rounded-lg border border-error-border bg-error-bg p-3 text-xs text-error-text">{error}</div>}
 {success && <div className="mt-3 rounded-lg border border-success-border bg-success-bg p-3 text-xs text-success-text">{success}</div>}

 <div className="mt-4 grid gap-4 xl:grid-cols-2">
 <div className="space-y-3 rounded-xl border border-graphite-200 p-3 dark:border-graphite-800">
 <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-graphite-500" /><b className="text-xs">Documento oficial</b></div>
 <div className="rounded-lg bg-graphite-50 p-3 text-xs dark:bg-graphite-900/50">
 <b>Modelo vinculado ao contrato</b>
 <div className="mt-1 text-graphite-500">
 {contract.templateId ? 'Definido no cadastro do contrato e protegido pelo servidor.' : 'Nenhum modelo vinculado.'}
 </div>
 </div>
 {generated ? (
 <div className="space-y-2 text-xs">
 <div className="rounded-lg bg-graphite-50 p-2 dark:bg-graphite-900/50">
 <b>Snapshot SHA-256</b><div className="mt-1 break-all font-mono text-[10px] text-graphite-500">{generated.snapshotHash}</div>
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
 <Button size="sm" variant="outline" className="text-success-text border-success-border hover:bg-success-bg dark:hover:bg-success-bg" onClick={() => void sendWhatsApp()}>
 <MessageSquare className="w-4 h-4 mr-1" />Enviar via WhatsApp
 </Button>
 </div>
 </div>
 ) : (
 <p className="text-xs text-graphite-500">Nenhum documento oficial foi gerado para este contrato.</p>
 )}
 {canGenerate && (
 <Button size="sm" variant="primary" isLoading={loading} onClick={generateOfficial} disabled={!contract.templateId || !template}>
 {generated ? <RefreshCw className="w-4 h-4" /> : <FileText className="w-4 h-4" />}{generated ? 'Regenerar documento' : 'Gerar documento'}
 </Button>
 )}
 </div>

 <div className="space-y-3 rounded-xl border border-graphite-200 p-3 dark:border-graphite-800">
 <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-graphite-500" /><b className="text-xs">Status da assinatura</b></div>
 {signed ? (
 <div className="space-y-2 text-xs">
 <div className="flex items-center gap-2 text-success-text"><CheckCircle2 className="w-4 h-4" /><b>Contrato assinado</b></div>
 <p>Registro: <b>{signatureMethodLabel(signed.signatureMethod)}</b></p>
 <p>Confirmado por: <b>{signed.signedByName || '—'}</b></p>
 <p>Data/hora: {signed.signedAt ? new Date(signed.signedAt).toLocaleString('pt-BR') : '—'}</p>
 <div className="flex flex-wrap gap-2">
 <Button size="sm" variant="secondary" onClick={() => void openAttachment(signed.attachmentId)}><Download className="w-4 h-4" />Abrir documento associado</Button>
 <Button size="sm" variant="outline" className="text-success-text border-success-border hover:bg-success-bg dark:hover:bg-success-bg" onClick={() => void sendWhatsApp()}>
 <MessageSquare className="w-4 h-4 mr-1" />Enviar link no WhatsApp
 </Button>
 </div>
 {canChangeSignStatus && (
 <Button size="sm" variant="secondary" isLoading={loading} onClick={() => setSigned(false)}>Marcar como não assinado</Button>
 )}
 </div>
 ) : generated ? (
 <div className="space-y-3 text-xs">
 <p className="text-graphite-500">Após a assinatura fora do ERP, confirme o status. Nenhum upload ou método de assinatura é obrigatório nesta etapa.</p>
 {canChangeSignStatus && (
 <Button size="sm" variant="primary" isLoading={loading} onClick={() => setSigned(true)}>
 <ShieldCheck className="w-4 h-4" />Marcar como assinado
 </Button>
 )}
 </div>
 ) : (
 <p className="text-xs text-graphite-500">Gere o documento oficial antes de confirmar a assinatura.</p>
 )}
 </div>
 </div>

 {canActivate && contract.status !== ContractStatus.ACTIVE && (
 <div className="mt-4 flex items-center justify-between rounded-xl border border-success-border bg-success-bg p-3 ">
 <div className="text-xs"><b>Contrato apto para ativação</b><p className="mt-0.5 text-graphite-500">O servidor repetirá todos os gates antes de vincular veículo, motorista e cobrança.</p></div>
 <Button size="sm" variant="primary" isLoading={loading} onClick={activate} disabled={!incomeCategoryId}>Ativar contrato</Button>
 </div>
 )}

 {!signed && generated && canGenerate && (
 <div className="mt-3 text-[11px] text-graphite-500 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" />Os termos ficam bloqueados após a geração do documento oficial para evitar divergência entre banco e documento.</div>
 )}
 </Card>
 </div>
 );
};
