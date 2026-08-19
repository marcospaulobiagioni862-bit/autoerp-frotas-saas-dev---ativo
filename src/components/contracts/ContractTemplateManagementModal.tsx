import React, { useEffect, useState } from 'react';
import { Archive, FilePlus2, History, Save, X } from 'lucide-react';
import { ContractTemplateClient } from '../../api/contractTemplateClient';
import type { ContractTemplate } from '../../types/entities';
import { Badge, Button, Input, ModalContainer } from '../ui';

interface ContractTemplateManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PLACEHOLDERS = [
  '{{company.name}}', '{{company.document}}', '{{contract.number}}', '{{contract.startDate}}',
  '{{contract.endDate}}', '{{contract.rentalAmount}}', '{{contract.securityDepositAmount}}',
  '{{contract.franchiseKm}}', '{{contract.excessKmRate}}', '{{driver.name}}', '{{driver.cpf}}',
  '{{driver.cnh}}', '{{driver.cnhExpiration}}', '{{vehicle.plate}}', '{{vehicle.brand}}',
  '{{vehicle.model}}', '{{vehicle.renavam}}',
];

export const ContractTemplateManagementModal: React.FC<ContractTemplateManagementModalProps> = ({ isOpen, onClose }) => {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [templateKey, setTemplateKey] = useState('locacao-padrao');
  const [title, setTitle] = useState('Contrato de Locação de Veículo');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    try {
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
    void load();
  }, [isOpen]);

  const resetForm = () => {
    setEditing(null);
    setTemplateKey('locacao-padrao');
    setTitle('Contrato de Locação de Veículo');
    setContent('');
  };

  const startVersion = (item: ContractTemplate) => {
    setEditing(item);
    setTemplateKey(item.templateKey);
    setTitle(item.title);
    setContent(item.contentMarkdown);
    setError(null);
    setSuccess(null);
  };

  const save = async () => {
    if (!title.trim() || !content.trim() || (!editing && !templateKey.trim())) {
      setError('Preencha chave, título e conteúdo do modelo.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (editing) {
        const created = await ContractTemplateClient.createVersion(editing.id, {
          title: title.trim(), contentMarkdown: content,
        });
        setSuccess(`Nova versão v${created.versionNumber} criada.`);
      } else {
        await ContractTemplateClient.create({
          templateKey: templateKey.trim(), title: title.trim(), contentMarkdown: content,
        });
        setSuccess('Modelo criado com sucesso.');
      }
      resetForm();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao salvar modelo.');
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

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
        <div><h2 className="font-bold">Modelos de Contrato</h2><p className="mt-1 text-xs text-slate-500">Versionamento server-side; versões anteriores permanecem no histórico.</p></div>
        <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>

      <div className="grid max-h-[78vh] gap-5 overflow-y-auto p-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Modelos atuais</h3><Button size="sm" variant="ghost" onClick={resetForm}><FilePlus2 className="w-4 h-4" />Novo</Button></div>
          {templates.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-xs text-slate-500">Nenhum modelo cadastrado.</div> : templates.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3"><div><b className="text-sm">{item.title}</b><p className="mt-1 font-mono text-[10px] text-slate-500">{item.templateKey}</p></div><Badge variant={item.isActive ? 'success' : 'neutral'}>v{item.versionNumber}</Badge></div>
              <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => startVersion(item)}><History className="w-4 h-4" />Nova versão</Button><Button size="sm" variant="ghost" onClick={() => void archive(item)} disabled={loading}><Archive className="w-4 h-4" />Arquivar</Button></div>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div><h3 className="text-sm font-bold">{editing ? `Criar nova versão de ${editing.title}` : 'Novo modelo'}</h3>{editing && <p className="mt-1 text-xs text-slate-500">A versão v{editing.versionNumber} ficará preservada e deixará de ser a atual.</p>}</div>
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
          {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}
          <label className="block text-xs font-semibold text-slate-600">Chave do modelo<Input value={templateKey} disabled={Boolean(editing)} onChange={(event) => setTemplateKey(event.target.value)} placeholder="locacao-padrao" /></label>
          <label className="block text-xs font-semibold text-slate-600">Título<Input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="block text-xs font-semibold text-slate-600">Conteúdo Markdown<textarea className="mt-1 min-h-72 w-full rounded-lg border border-slate-200 bg-transparent p-3 font-mono text-xs dark:border-slate-700" value={content} onChange={(event) => setContent(event.target.value)} placeholder="# Contrato {{contract.number}}..." /></label>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50"><b className="text-[11px]">Placeholders permitidos</b><div className="mt-2 flex flex-wrap gap-1.5">{PLACEHOLDERS.map((item) => <code key={item} className="rounded bg-white px-1.5 py-1 text-[9px] dark:bg-slate-800">{item}</code>)}</div></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={resetForm}>Limpar</Button><Button variant="primary" isLoading={loading} onClick={() => void save()}><Save className="w-4 h-4" />{editing ? 'Criar nova versão' : 'Criar modelo'}</Button></div>
        </div>
      </div>
    </ModalContainer>
  );
};
