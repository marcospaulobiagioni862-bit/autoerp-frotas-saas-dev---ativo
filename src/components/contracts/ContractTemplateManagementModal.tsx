import React, { useEffect, useState } from 'react';
import { Archive, Download, ExternalLink, FilePlus2, History, LockKeyhole, Save, Upload, X } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { ContractTemplateClient, type ContractTemplateSourceMode } from '../../api/contractTemplateClient';
import type { ContractTemplate, FileAttachment } from '../../types/entities';
import { Badge, Button, Input, ModalContainer } from '../ui';
import { MOVEFLEX_LOGO_DATA_URL } from '../../domain/contracts/moveflexBrand';
import { getMoveFlexApprovedContractMaster } from '../../domain/contracts/moveflexApprovedContractMaster';

interface ContractTemplateManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PLACEHOLDERS = [
  '{{company.name}}', '{{company.document}}', '{{contract.number}}', '{{contract.startDate}}',
  '{{contract.endDate}}', '{{contract.rentalAmount}}', '{{contract.securityDepositAmount}}',
  '{{contract.franchiseKm}}', '{{contract.excessKmRate}}', '{{driver.name}}', '{{driver.cpf}}',
  '{{driver.cnh}}', '{{driver.cnhExpiration}}', '{{vehicle.plate}}', '{{vehicle.brand}}',
  '{{vehicle.model}}', '{{vehicle.renavam}}',
];

function sourceMime(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return 'application/pdf';
  if (file.type === DOCX_MIME || lower.endsWith('.docx')) return DOCX_MIME;
  return null;
}

async function sourceAttachment(templateId: string): Promise<FileAttachment> {
  const items = await AttachmentClient.list({ entityType: 'ContractTemplate', entityId: templateId });
  const source = items.find((item) => !item.isArchived && item.documentType === 'CONTRACT_TEMPLATE_SOURCE');
  if (!source) throw new Error('Arquivo-fonte deste modelo não foi encontrado.');
  return source;
}

export const ContractTemplateManagementModal: React.FC<ContractTemplateManagementModalProps> = ({ isOpen, onClose }) => {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [templateKey, setTemplateKey] = useState('locacao-padrao');
  const [title, setTitle] = useState('Contrato de Locação de Veículo');
  const [content, setContent] = useState('');
  const [sourceMode, setSourceMode] = useState<ContractTemplateSourceMode>('MARKDOWN');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    try {
      await ContractTemplateClient.ensureMoveFlexDefault();
      setTemplates(await ContractTemplateClient.list({ activeOnly: false }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao carregar modelos.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setEditing(null);
    setError(null);
    setSuccess(null);
    setSourceMode('MARKDOWN');
    setSourceFile(null);
    void load();
  }, [isOpen]);

  const resetForm = () => {
    setEditing(null);
    setTemplateKey('locacao-padrao');
    setTitle('Contrato de Locação de Veículo');
    setContent('');
    setSourceMode('MARKDOWN');
    setSourceFile(null);
  };

  const startVersion = (item: ContractTemplate) => {
    setEditing(item);
    setTemplateKey(item.templateKey);
    setTitle(item.title);
    setContent(item.contentMarkdown);
    setSourceMode(item.contentMarkdown.trim() ? 'MARKDOWN' : 'FILE');
    setSourceFile(null);
    setError(null);
    setSuccess(null);
  };

  const save = async () => {
    if (!title.trim() || (!editing && !templateKey.trim())) {
      setError('Preencha chave e título do modelo.');
      return;
    }
    if (sourceMode === 'MARKDOWN' && !content.trim()) {
      setError('Preencha o conteúdo Markdown do modelo.');
      return;
    }
    if (sourceMode === 'FILE' && !sourceFile) {
      setError('Selecione um arquivo PDF ou DOCX.');
      return;
    }
    const mimeType = sourceFile ? sourceMime(sourceFile) : null;
    if (sourceMode === 'FILE' && !mimeType) {
      setError('O arquivo do modelo deve ser PDF ou DOCX.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    let createdFileTemplate: ContractTemplate | null = null;
    try {
      if (editing) {
        const created = await ContractTemplateClient.createVersion(editing.id, {
          title: title.trim(),
          contentMarkdown: sourceMode === 'MARKDOWN' ? content : undefined,
          sourceMode,
          isActive: sourceMode === 'FILE' ? false : undefined,
        });
        if (sourceMode === 'FILE' && sourceFile && mimeType) {
          createdFileTemplate = created;
          await AttachmentClient.upload({
            entityType: 'ContractTemplate',
            entityId: created.id,
            documentType: 'CONTRACT_TEMPLATE_SOURCE',
            fileName: sourceFile.name,
            mimeType,
            content: sourceFile,
            description: 'Arquivo-fonte do modelo de contrato',
          });
          await ContractTemplateClient.promoteFileSource(created.id);
        }
        setSuccess(`Nova versão v${created.versionNumber} criada.`);
      } else {
        const created = await ContractTemplateClient.create({
          templateKey: templateKey.trim(),
          title: title.trim(),
          contentMarkdown: sourceMode === 'MARKDOWN' ? content : undefined,
          sourceMode,
          isActive: sourceMode === 'FILE' ? false : undefined,
        });
        if (sourceMode === 'FILE' && sourceFile && mimeType) {
          createdFileTemplate = created;
          await AttachmentClient.upload({
            entityType: 'ContractTemplate',
            entityId: created.id,
            documentType: 'CONTRACT_TEMPLATE_SOURCE',
            fileName: sourceFile.name,
            mimeType,
            content: sourceFile,
            description: 'Arquivo-fonte do modelo de contrato',
          });
          await ContractTemplateClient.promoteFileSource(created.id);
        }
        setSuccess('Modelo criado com sucesso.');
      }
      resetForm();
      await load();
    } catch (caught) {
      if (createdFileTemplate) await ContractTemplateClient.archive(createdFileTemplate.id).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'Erro ao salvar modelo.');
    } finally {
      setLoading(false);
    }
  };

  const uploadApprovedMaster = async (item: ContractTemplate, file: File | null) => {
    if (!file) return;
    const master = getMoveFlexApprovedContractMaster(item.templateKey);
    if (!master) return;
    if (sourceMime(file) !== DOCX_MIME) {
      setError(`Selecione o arquivo mestre DOCX aprovado: ${master.fileName}.`);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await AttachmentClient.upload({
        entityType: 'ContractTemplate',
        entityId: item.id,
        documentType: 'CONTRACT_TEMPLATE_SOURCE',
        fileName: file.name,
        mimeType: DOCX_MIME,
        content: file,
        description: `Arquivo mestre aprovado e imutável: ${master.fileName}`,
      });
      await ContractTemplateClient.promoteFileSource(item.id);
      setSuccess(`Arquivo mestre aprovado ativado: ${master.fileName}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'O arquivo enviado não corresponde ao mestre aprovado.');
    } finally {
      setLoading(false);
    }
  };

  const archive = async (item: ContractTemplate) => {
    if (!confirm(`Arquivar o modelo “${item.title}”? O histórico será preservado.`)) return;
    setLoading(true);
    setError(null);
    try {
      await ContractTemplateClient.archive(item.id);
      if (editing?.id === item.id) resetForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao arquivar modelo.');
    } finally {
      setLoading(false);
    }
  };

  const downloadSelectedSource = () => {
    if (!sourceFile) {
      setError('Selecione um arquivo PDF ou DOCX para baixar.');
      return;
    }
    const url = URL.createObjectURL(sourceFile);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = sourceFile.name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const openSource = async (item: ContractTemplate, download = false) => {
    setError(null);
    try {
      const attachment = await sourceAttachment(item.id);
      const blob = await AttachmentClient.content(attachment.id);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = attachment.fileName;
        anchor.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao abrir arquivo-fonte.');
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="5xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <img src={MOVEFLEX_LOGO_DATA_URL} alt="MoveFlex" className="h-10 w-auto rounded-md object-contain" />
          <div><h2 className="font-bold">Modelos de Contrato MoveFlex</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Os modelos padrão usam somente os arquivos mestres aprovados; cabeçalho, rodapé e conteúdo não podem ser substituídos.</p></div>
        </div>
        <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>

      <div className="grid gap-4 p-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Modelos atuais</h3><Button size="sm" variant="ghost" onClick={resetForm}><FilePlus2 className="w-4 h-4" />Novo</Button></div>
          {templates.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-xs text-slate-500 dark:text-slate-300"><p>Nenhum modelo cadastrado.</p><p className="mt-2 text-[10px]">Atualize a tela para o servidor preparar os registros dos arquivos mestres aprovados.</p></div> : templates.map((item) => {
            const fileBacked = !item.contentMarkdown.trim();
            const approvedMaster = getMoveFlexApprovedContractMaster(item.templateKey);
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3"><div><b className="text-sm">{item.title}</b><p className="mt-1 font-mono text-[10px] text-slate-500 dark:text-slate-400">{item.templateKey}</p>{approvedMaster ? <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"><LockKeyhole className="h-3 w-3" />{item.isActive ? 'Arquivo mestre aprovado • imutável' : `Aguardando mestre aprovado: ${approvedMaster.fileName}`}</p> : fileBacked ? <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Fonte: arquivo PDF/DOCX personalizado</p> : null}</div><Badge variant={item.isActive ? 'success' : 'neutral'}>v{item.versionNumber}</Badge></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {approvedMaster ? (
                    item.isActive ? <>
                      <Button size="sm" variant="ghost" onClick={() => void openSource(item)}><ExternalLink className="w-4 h-4" />Abrir mestre</Button>
                      <Button size="sm" variant="ghost" onClick={() => void openSource(item, true)}><Download className="w-4 h-4" />Baixar mestre</Button>
                    </> : <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                      <Upload className="h-4 w-4" />Carregar arquivo mestre
                      <input type="file" className="hidden" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={loading} onChange={(event) => { const file = event.target.files?.[0] || null; event.currentTarget.value = ''; void uploadApprovedMaster(item, file); }} />
                    </label>
                  ) : <>
                    <Button size="sm" variant="secondary" onClick={() => startVersion(item)}><History className="w-4 h-4" />Nova versão</Button>
                    {fileBacked && <Button size="sm" variant="ghost" onClick={() => void openSource(item)}><ExternalLink className="w-4 h-4" />Abrir arquivo</Button>}
                    {fileBacked && <Button size="sm" variant="ghost" onClick={() => void openSource(item, true)}><Download className="w-4 h-4" />Baixar</Button>}
                    <Button size="sm" variant="ghost" onClick={() => void archive(item)} disabled={loading}><Archive className="w-4 h-4" />Arquivar</Button>
                  </>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div><h3 className="text-sm font-bold">{editing ? `Criar nova versão de ${editing.title}` : 'Novo modelo'}</h3>{editing && <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">A versão atual só será substituída após o arquivo da nova versão ser salvo com sucesso.</p>}</div>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
          {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Chave do modelo<Input value={templateKey} disabled={Boolean(editing)} onChange={(event) => setTemplateKey(event.target.value)} placeholder="locacao-padrao" /></label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Título<Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>

          <div className="flex gap-2">
            <Button size="sm" variant={sourceMode === 'MARKDOWN' ? 'primary' : 'secondary'} onClick={() => { setSourceMode('MARKDOWN'); setSourceFile(null); }}>Conteúdo Markdown</Button>
            <Button size="sm" variant={sourceMode === 'FILE' ? 'primary' : 'secondary'} onClick={() => setSourceMode('FILE')}>Anexar PDF/DOCX</Button>
          </div>

          {sourceMode === 'MARKDOWN' ? (
            <>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Conteúdo Markdown<textarea className="mt-1 min-h-72 w-full rounded-lg border border-slate-200 bg-transparent p-3 font-mono text-xs dark:border-slate-700" value={content} onChange={(event) => setContent(event.target.value)} placeholder="# Contrato {{contract.number}}..." /></label>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50"><b className="text-[11px]">Placeholders permitidos</b><div className="mt-2 flex flex-wrap gap-1.5">{PLACEHOLDERS.map((item) => <code key={item} className="rounded bg-white px-1.5 py-1 text-[9px] dark:bg-slate-800">{item}</code>)}</div></div>
            </>
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Arquivo-fonte PDF ou DOCX<input className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setSourceFile(event.target.files?.[0] || null)} /></label>
              {sourceFile && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50"><p className="text-xs text-slate-500 dark:text-slate-300">Selecionado: {sourceFile.name}</p><Button size="sm" variant="ghost" onClick={downloadSelectedSource}><Download className="w-4 h-4" />Baixar arquivo selecionado</Button></div>}
              <p className="text-[11px] text-slate-500 dark:text-slate-300">Esta área é apenas para modelos personalizados. Os dois modelos padrão MoveFlex são bloqueados e aceitam exclusivamente os arquivos mestres aprovados exibidos na coluna ao lado.</p>
            </div>
          )}

          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={resetForm}>Limpar</Button><Button variant="primary" isLoading={loading} onClick={() => void save()}><Save className="w-4 h-4" />{editing ? 'Criar nova versão' : 'Criar modelo'}</Button></div>
        </div>
      </div>
    </ModalContainer>
  );
};
