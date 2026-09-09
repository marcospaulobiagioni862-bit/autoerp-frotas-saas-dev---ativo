import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Download, Edit3, FilePlus2, FileText, Save, Upload } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { ContractTemplateClient, type ContractTemplateSourceMode } from '../../api/contractTemplateClient';
import type { ContractTemplate, FileAttachment } from '../../types/entities';
import { Badge, Button, Input, ModalContainer } from '../ui';

interface ContractTemplateManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SAVED_CONTRACT_KEY = /^modelo-contrato-(\d+)$/;

const PLACEHOLDERS = [
  '{{company.name}}', '{{company.document}}', '{{contract.number}}', '{{contract.startDate}}',
  '{{contract.endDate}}', '{{contract.rentalAmount}}', '{{contract.securityDepositAmount}}',
  '{{contract.franchiseKm}}', '{{contract.excessKmRate}}', '{{driver.name}}', '{{driver.cpf}}',
  '{{driver.cnh}}', '{{driver.cnhExpiration}}', '{{vehicle.plate}}', '{{vehicle.brand}}',
  '{{vehicle.model}}', '{{vehicle.renavam}}',
];

function savedContractNumber(templateKey: string): number | undefined {
  const match = SAVED_CONTRACT_KEY.exec(templateKey);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function savedContractLabel(item: ContractTemplate): string {
  const number = savedContractNumber(item.templateKey);
  return number ? `Contrato ${String(number).padStart(2, '0')}` : item.title;
}

function sourceMime(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (file.type === 'application/pdf' || lower.endsWith('.pdf')) return 'application/pdf';
  if (file.type === DOCX_MIME || lower.endsWith('.docx')) return DOCX_MIME;
  return null;
}

async function sourceAttachment(templateId: string): Promise<FileAttachment> {
  const items = await AttachmentClient.list({ entityType: 'ContractTemplate', entityId: templateId });
  const source = items.find((item) =>
    !item.isArchived &&
    item.documentType === 'CONTRACT_TEMPLATE_SOURCE' &&
    item.contentState === 'AVAILABLE'
  );
  if (!source) throw new Error('Arquivo deste contrato salvo não foi encontrado.');
  return source;
}

export const ContractTemplateManagementModal: React.FC<ContractTemplateManagementModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<'SAVED' | 'EDITOR'>('SAVED');
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceMode, setSourceMode] = useState<ContractTemplateSourceMode>('MARKDOWN');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const savedTemplates = useMemo(
    () => templates
      .filter((item) => item.isCurrent && !item.isArchived && savedContractNumber(item.templateKey) !== undefined)
      .sort((a, b) => (savedContractNumber(a.templateKey) || 0) - (savedContractNumber(b.templateKey) || 0)),
    [templates]
  );

  const nextNumber = useMemo(() => {
    let max = 0;
    for (const item of templates) max = Math.max(max, savedContractNumber(item.templateKey) || 0);
    return max + 1;
  }, [templates]);

  const load = async () => {
    setError(null);
    try {
      const list = await ContractTemplateClient.list({
        currentOnly: false,
        activeOnly: false,
        includeArchived: true,
      });
      setTemplates(list);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao carregar contratos salvos.');
    }
  };

  const resetEditor = () => {
    setEditing(null);
    setTitle('');
    setContent('');
    setSourceMode('MARKDOWN');
    setSourceFile(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab('SAVED');
    setError(null);
    setSuccess(null);
    resetEditor();
    void load();
  }, [isOpen]);

  const startNew = () => {
    resetEditor();
    setError(null);
    setSuccess(null);
    setTab('EDITOR');
  };

  const startEdit = (item: ContractTemplate) => {
    setEditing(item);
    setTitle(item.title);
    setContent(item.contentMarkdown);
    setSourceMode(item.contentMarkdown.trim() ? 'MARKDOWN' : 'FILE');
    setSourceFile(null);
    setError(null);
    setSuccess(null);
    setTab('EDITOR');
  };

  const chooseImportFile = () => {
    setSourceMode('FILE');
    setContent('');
    setError(null);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleSourceFile = (file: File | null) => {
    setSourceFile(file);
    setError(null);
    if (file && !title.trim()) {
      setTitle(file.name.replace(/\.(docx|pdf)$/i, '').replace(/[_-]+/g, ' ').trim());
    }
  };

  const save = async () => {
    if (!title.trim()) {
      setError('Informe um título para o contrato.');
      return;
    }
    if (sourceMode === 'MARKDOWN' && !content.trim()) {
      setError('Digite o conteúdo do contrato antes de salvar.');
      return;
    }
    if (sourceMode === 'FILE' && !sourceFile) {
      setError(editing
        ? 'Selecione o DOCX/PDF atualizado para criar a nova versão.'
        : 'Selecione o DOCX/PDF que será salvo como modelo.');
      return;
    }

    const mimeType = sourceFile ? sourceMime(sourceFile) : null;
    if (sourceMode === 'FILE' && !mimeType) {
      setError('O arquivo deve ser PDF ou DOCX.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    let fileCandidate: ContractTemplate | null = null;

    try {
      let saved: ContractTemplate;
      if (editing) {
        saved = await ContractTemplateClient.createVersion(editing.id, {
          title: title.trim(),
          contentMarkdown: sourceMode === 'MARKDOWN' ? content : undefined,
          sourceMode,
          isActive: sourceMode === 'MARKDOWN' ? true : false,
        });
      } else {
        saved = await ContractTemplateClient.create({
          title: title.trim(),
          contentMarkdown: sourceMode === 'MARKDOWN' ? content : undefined,
          sourceMode,
          isActive: sourceMode === 'MARKDOWN' ? true : false,
        });
      }

      if (sourceMode === 'FILE' && sourceFile && mimeType) {
        fileCandidate = saved;
        await AttachmentClient.upload({
          entityType: 'ContractTemplate',
          entityId: saved.id,
          documentType: 'CONTRACT_TEMPLATE_SOURCE',
          fileName: sourceFile.name,
          mimeType,
          content: sourceFile,
          description: 'Arquivo editável do modelo de contrato salvo',
        });
        saved = await ContractTemplateClient.promoteFileSource(saved.id);
      }

      const numberLabel = savedContractLabel(saved);
      setSuccess(editing
        ? `${numberLabel} atualizado. Nova versão v${saved.versionNumber} salva; a versão anterior foi preservada.`
        : `${numberLabel} salvo com sucesso.`);
      resetEditor();
      await load();
      setTab('SAVED');
    } catch (caught) {
      if (fileCandidate) await ContractTemplateClient.archive(fileCandidate.id).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'Erro ao salvar contrato.');
    } finally {
      setLoading(false);
    }
  };

  const archive = async (item: ContractTemplate) => {
    if (!confirm(`Arquivar ${savedContractLabel(item)} — ${item.title}? O histórico continuará preservado.`)) return;
    setLoading(true);
    setError(null);
    try {
      await ContractTemplateClient.archive(item.id);
      setSuccess(`${savedContractLabel(item)} arquivado. A numeração não será reutilizada.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao arquivar contrato.');
    } finally {
      setLoading(false);
    }
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
      setError(caught instanceof Error ? caught.message : 'Erro ao abrir arquivo do contrato.');
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      title="Modelos de contrato"
      subtitle="Salve modelos numerados e escolha depois qual será usado no contrato do motorista."
    >
      <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'SAVED' ? 'primary' : 'ghost'} onClick={() => setTab('SAVED')}>
            <FileText className="h-4 w-4" />Contratos salvos
          </Button>
          <Button size="sm" variant={tab === 'EDITOR' ? 'primary' : 'ghost'} onClick={startNew}>
            <FilePlus2 className="h-4 w-4" />Novo / importar contrato
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}

        {tab === 'SAVED' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Contratos salvos</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Apenas a versão atual aparece aqui. Versões anteriores continuam guardadas para auditoria.
                </p>
              </div>
              <Button size="sm" onClick={startNew}><FilePlus2 className="h-4 w-4" />Novo contrato</Button>
            </div>

            {savedTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                <FileText className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-3 text-sm font-semibold">Nenhum modelo editável salvo ainda.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Crie ou importe o primeiro modelo. O servidor atribuirá automaticamente o número Contrato {String(nextNumber).padStart(2, '0')}.
                </p>
                <div className="mt-4"><Button size="sm" onClick={startNew}>Criar primeiro contrato</Button></div>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {savedTemplates.map((item) => {
                  const fileBacked = !item.contentMarkdown.trim();
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold">{savedContractLabel(item)} — {item.title}</div>
                          <div className="mt-1 text-[11px] text-slate-500">
                            {fileBacked ? 'Modelo por arquivo DOCX/PDF' : 'Conteúdo editável dentro do ERP'}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant={item.isActive ? 'success' : 'neutral'}>{item.isActive ? 'Disponível' : 'Em preparação'}</Badge>
                          <Badge variant="neutral">v{item.versionNumber}</Badge>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => startEdit(item)}>
                          <Edit3 className="h-4 w-4" />{fileBacked ? 'Nova versão' : 'Editar'}
                        </Button>
                        {fileBacked && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => void openSource(item)}>
                              <FileText className="h-4 w-4" />Abrir
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void openSource(item, true)}>
                              <Download className="h-4 w-4" />Baixar
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void archive(item)} disabled={loading}>
                          <Archive className="h-4 w-4" />Arquivar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 dark:bg-slate-900/50 dark:text-slate-300">
              Os modelos mestres e registros antigos continuam preservados para histórico, mas não aparecem nesta lista operacional.
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            <div>
              <h3 className="text-sm font-bold">
                {editing
                  ? `Editar ${savedContractLabel(editing)}`
                  : `Novo modelo — próximo número: Contrato ${String(nextNumber).padStart(2, '0')}`}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                {editing
                  ? 'Ao salvar, o ERP cria uma nova versão e mantém a anterior intacta.'
                  : 'O número é gerado automaticamente pelo servidor no momento do salvamento.'}
              </p>
            </div>

            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Título do contrato
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Locação padrão semanal" />
            </label>

            <div>
              <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Como deseja manter este modelo?</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={sourceMode === 'MARKDOWN' ? 'primary' : 'secondary'}
                  onClick={() => { setSourceMode('MARKDOWN'); setSourceFile(null); }}
                >
                  <Edit3 className="h-4 w-4" />Editar texto no ERP
                </Button>
                <Button
                  size="sm"
                  variant={sourceMode === 'FILE' ? 'primary' : 'secondary'}
                  onClick={chooseImportFile}
                >
                  <Upload className="h-4 w-4" />Importar DOCX/PDF
                </Button>
              </div>
            </div>

            {sourceMode === 'MARKDOWN' ? (
              <>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Conteúdo do contrato
                  <textarea
                    className="mt-1 min-h-56 w-full rounded-lg border border-slate-200 bg-transparent p-3 font-mono text-xs dark:border-slate-700"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="# Contrato {{contract.number}}\n\nEntre {{company.name}} e {{driver.name}}..."
                  />
                </label>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
                  <b className="text-[11px]">Campos automáticos permitidos</b>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PLACEHOLDERS.map((item) => (
                      <code key={item} className="rounded bg-white px-1.5 py-1 text-[9px] dark:bg-slate-800">{item}</code>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <b className="text-xs">Arquivo DOCX ou PDF</b>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Para alterar cláusulas de um modelo por arquivo, baixe o DOCX atual, edite e envie o arquivo atualizado. O ERP salvará uma nova versão.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => handleSourceFile(event.target.files?.[0] || null)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />Selecionar DOCX/PDF
                  </Button>
                  {sourceFile
                    ? <div className="text-xs text-slate-600 dark:text-slate-300">Selecionado: <b>{sourceFile.name}</b></div>
                    : <div className="text-xs text-slate-500">Nenhum arquivo selecionado.</div>}
                </div>
                <div className="text-[10px] text-slate-500">
                  DOCX pode ficar disponível para preenchimento automático. PDF é mantido como arquivo de referência e não é ativado automaticamente.
                </div>
              </div>
            )}

            <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-1 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
              <div className="text-[11px] text-slate-500">
                {sourceMode === 'FILE'
                  ? sourceFile ? `Arquivo pronto para salvar: ${sourceFile.name}` : 'Selecione um DOCX/PDF para habilitar o salvamento.'
                  : 'Preencha o título e o conteúdo do contrato.'}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { resetEditor(); setTab('SAVED'); }}>Cancelar</Button>
                <Button
                  onClick={() => void save()}
                  isLoading={loading}
                  disabled={!title.trim() || (sourceMode === 'FILE' ? !sourceFile : !content.trim())}
                >
                  <Save className="h-4 w-4" />{editing ? 'Salvar nova versão' : 'Salvar contrato'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalContainer>
  );
};
