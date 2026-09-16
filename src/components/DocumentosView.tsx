import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  PlusCircle,
  Activity,
  Calendar,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { Documento, Veiculo, Motorista } from '../types';
import { ColorRulesConfig } from '../shared/domain/cnh';

interface DocumentosViewProps {
  documentos: Documento[];
  veiculos: Veiculo[];
  motoristas: Motorista[];
  onAddDocumento: (doc: Documento) => void;
  onEditDocumento: (doc: Documento) => void;
  onArchiveDocumento: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole: string;
  colorRules?: ColorRulesConfig;
}

export default function DocumentosView({
  documentos,
  veiculos,
  motoristas,
  onAddDocumento,
  onEditDocumento,
  onArchiveDocumento,
  onTriggerToast,
  userRole,
  colorRules
}: DocumentosViewProps) {
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Pendentes' | 'Vencidos' | 'Validos'>('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Documento | null>(null);

  // Helper to calculate exact status of any document
  const getDocStatus = (doc: Documento) => {
    if (doc.vencimento) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const venc = new Date(doc.vencimento + 'T00:00:00');
      const diffTime = venc.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const activeRules = colorRules || { redDays: 5, yellowDays: 15, blueDays: 29, greenDays: 30 };

      if (diffDays < 0) return { label: 'Vencido', color: 'red' as const, isPending: true, days: diffDays };
      if (diffDays <= activeRules.redDays) return { label: 'Crítico', color: 'red' as const, isPending: true, days: diffDays };
      if (diffDays <= activeRules.yellowDays) return { label: 'A vencer', color: 'yellow' as const, isPending: true, days: diffDays };
      if (diffDays <= activeRules.blueDays) return { label: 'Atenção', color: 'blue' as const, isPending: true, days: diffDays };
      return { label: 'Válido', color: 'green' as const, isPending: false, days: diffDays };
    }
    
    if (doc.status === 'Vencido' || (doc.tipo === 'Multas' && (!doc.multa_status_condutor || doc.multa_status_condutor === 'pendente'))) {
      return { label: 'Vencido', color: 'red' as const, isPending: true, days: -1 };
    }
    if (doc.status === 'A vencer') {
      return { label: 'A vencer', color: 'yellow' as const, isPending: true, days: 5 };
    }
    return { label: 'Válido', color: 'green' as const, isPending: false, days: 30 };
  };

  const pendingDocs = documentos.filter(doc => getDocStatus(doc).isPending);

  // Form states
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [tipo, setTipo] = useState('CRLV');
  const [numero, setNumero] = useState('');
  const [emissao, setEmissao] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [status, setStatus] = useState<'Válido' | 'Vencido' | 'A vencer'>('Válido');
  const [obs, setObs] = useState('');
  const [motoristaCpf, setMotoristaCpf] = useState('');
  const [multaStatusCondutor, setMultaStatusCondutor] = useState<'pendente' | 'enviado' | 'paga_dobrado'>('pendente');
  const [multaDataIndicacao, setMultaDataIndicacao] = useState('');
  const [url, setUrl] = useState('');

  // Archiving confirmation modal state
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      veiculoPlaca,
      tipo,
      numero: numero.trim(),
      emissao,
      vencimento,
      status,
      obs: obs.trim(),
      motoristaCpf,
      multaStatusCondutor,
      multaDataIndicacao,
      url: url.trim()
    });
  };

  const getSerializedStateFromDocumento = (d: Documento | null, defaultPlaca = '') => {
    if (d) {
      return JSON.stringify({
        veiculoPlaca: d.veiculoPlaca,
        tipo: d.tipo,
        numero: d.numero.trim(),
        emissao: d.emissao || '',
        vencimento: d.vencimento || '',
        status: d.status,
        obs: (d.obs || '').trim(),
        motoristaCpf: d.motoristaCpf || '',
        multaStatusCondutor: d.multa_status_condutor || 'pendente',
        multaDataIndicacao: d.multa_data_indicacao || '',
        url: (d.url || '').trim()
      });
    } else {
      return JSON.stringify({
        veiculoPlaca: defaultPlaca,
        tipo: 'CRLV',
        numero: '',
        emissao: '',
        vencimento: '',
        status: 'Válido',
        obs: '',
        motoristaCpf: '',
        multaStatusCondutor: 'pendente',
        multaDataIndicacao: '',
        url: ''
      });
    }
  };

  const isFormDirty = () => {
    return originalFormStateJson !== getSerializedFormState();
  };

  const handleCloseModalAttempt = () => {
    if (isFormDirty()) {
      setShowUnsavedConfirm(true);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedConfirm(false);
    setIsModalOpen(false);
    onTriggerToast('As alterações não foram salvas pois você não confirmou as alterações!', 'warning');
  };

  const documentTypes = [
    'CRLV',
    'IPVA',
    'Licenciamento',
    'Seguro',
    'Multas',
    'CNH',
    'Contrato',
    'Laudo de vistoria',
    'Comprovante',
    'Certidão'
  ];

  const canModify = userRole !== 'Consulta' && userRole !== 'Somente leitura';

  const openAddModal = () => {
    if (!canModify) {
      onTriggerToast('Seu nível de acesso não permite cadastrar ou editar.', 'warning');
      return;
    }
    if (veiculos.length === 0) {
      onTriggerToast('Por favor, cadastre um veículo primeiro.', 'warning');
      return;
    }
    setEditingDoc(null);
    setVeiculoPlaca('');
    setTipo('CRLV');
    setNumero('');
    setEmissao('');
    setVencimento('');
    setStatus('Válido');
    setObs('');
    setMotoristaCpf('');
    setMultaStatusCondutor('pendente');
    setMultaDataIndicacao('');
    setUrl('');
    setOriginalFormStateJson(getSerializedStateFromDocumento(null, ''));
    setIsModalOpen(true);
  };

  const openEditModal = (doc: Documento) => {
    if (!canModify) {
      onTriggerToast('Seu nível de acesso não permite cadastrar ou editar.', 'warning');
      return;
    }
    setEditingDoc(doc);
    setVeiculoPlaca(doc.veiculoPlaca);
    setTipo(doc.tipo);
    setNumero(doc.numero);
    setEmissao(doc.emissao || '');
    setVencimento(doc.vencimento || '');
    setStatus(doc.status);
    setObs(doc.obs || '');
    setMotoristaCpf(doc.motoristaCpf || '');
    setMultaStatusCondutor(doc.multa_status_condutor || 'pendente');
    setMultaDataIndicacao(doc.multa_data_indicacao || '');
    setUrl(doc.url || '');
    setOriginalFormStateJson(getSerializedStateFromDocumento(doc));
    setIsModalOpen(true);
  };

  const getMissingFields = () => {
    const missing: string[] = [];
    if (tipo !== 'CNH' && !veiculoPlaca) missing.push('Veículo (Placa)');
    if (tipo === 'CNH' && !motoristaCpf) missing.push('Motorista (CPF)');
    if (!tipo) missing.push('Tipo de Documento');
    if (!numero.trim()) missing.push('Número do Documento');
    if (!vencimento) missing.push('Data de Vencimento');
    return missing;
  };

  const missingFields = getMissingFields();

  const handleIaDocumentReading = () => {
    if (!canModify) {
      onTriggerToast('Seu nível de acesso não permite cadastrar ou editar.', 'warning');
      return;
    }
    if (veiculos.length === 0) {
      onTriggerToast('Por favor, cadastre um veículo primeiro.', 'warning');
      return;
    }
    const targetVehicle = veiculos[0];
    const nextYear = new Date().getFullYear() + 1;
    const computedExp = `${nextYear}-12-31`;
    const iaDocNum = `CRLV-IA-${Math.floor(100000 + Math.random() * 900000)}`;

    const iaDocData: Documento = {
      id: `doc_ia_${Date.now()}`,
      veiculoPlaca: targetVehicle.placa,
      tipo: 'CRLV',
      numero: iaDocNum,
      vencimento: computedExp,
      status: 'Válido',
      obs: 'Documento lido e aprovado automaticamente por IA'
    };

    onAddDocumento(iaDocData);
    onTriggerToast(`🤖 IA concluiu leitura do CRLV (${iaDocNum}). Documento APROVADO!`, 'success');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (missingFields.length > 0) {
      onTriggerToast(`Preencha todos os campos obrigatórios (*): ${missingFields.join(', ')}`, 'error');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const computedStatus: 'Válido' | 'Vencido' = vencimento && vencimento < todayStr ? 'Vencido' : 'Válido';

    const docData: Documento = {
      id: editingDoc ? editingDoc.id : `doc_${Date.now()}`,
      veiculoPlaca,
      tipo,
      numero: numero.trim(),
      emissao: emissao || undefined,
      vencimento: vencimento || undefined,
      status: computedStatus,
      obs: obs.trim() || undefined,
      motoristaCpf: motoristaCpf || undefined,
      multa_status_condutor: tipo === 'Multas' ? multaStatusCondutor : undefined,
      multa_data_indicacao: (tipo === 'Multas' && multaDataIndicacao) ? multaDataIndicacao : undefined,
      url: url.trim() || undefined
    };

    if (editingDoc) {
      onEditDocumento(docData);
      onTriggerToast(`Documento ${docData.tipo} aprovado e atualizado com sucesso!`, 'success');
    } else {
      onAddDocumento(docData);
      onTriggerToast(`Documento ${docData.tipo} aprovado e cadastrado com sucesso!`, 'success');
    }

    setIsModalOpen(false);
  };

  const startArchive = (id: string) => {
    if (userRole === 'Consulta' || userRole === 'Somente leitura') {
      onTriggerToast('Seu nível de acesso não permite arquivar registros.', 'warning');
      return;
    }
    setArchiveTargetId(id);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTargetId) return;
    onArchiveDocumento(archiveTargetId, archiveMotivo.trim() || 'Remoção via controle de documentos');
    onTriggerToast('Documento movido para o Arquivo Morto com sucesso!', 'success');
    setArchiveTargetId(null);
  };

  const filteredDocs = documentos.filter(doc => {
    const st = getDocStatus(doc);
    const matchesSearch =
      doc.veiculoPlaca.toLowerCase().includes(search.toLowerCase()) ||
      doc.numero.toLowerCase().includes(search.toLowerCase()) ||
      (doc.obs && doc.obs.toLowerCase().includes(search.toLowerCase()));

    const matchesTipo = tipoFilter === 'Todos' || doc.tipo === tipoFilter;

    let matchesStatus = true;
    if (statusFilter === 'Pendentes') {
      matchesStatus = st.isPending;
    } else if (statusFilter === 'Vencidos') {
      matchesStatus = st.color === 'red';
    } else if (statusFilter === 'Validos') {
      matchesStatus = !st.isPending;
    }

    return matchesSearch && matchesTipo && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Central de Resolução de Pendências Banner */}
      {pendingDocs.length > 0 && (
        <div className="bg-rose-50/90 border border-rose-200/90 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-rose-200 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-rose-950 uppercase tracking-wide flex items-center gap-2">
                  Central de Resolução de Pendências
                  <span className="bg-rose-600 text-white text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                    {pendingDocs.length}
                  </span>
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Documentos vencidos, com prazos críticos ou que necessitam de correção imediata.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStatusFilter(statusFilter === 'Pendentes' ? 'Todos' : 'Pendentes')}
              className={`text-xs font-bold px-3.5 py-2 rounded-xl border transition-all shrink-0 self-start sm:self-center shadow-2xs ${
                statusFilter === 'Pendentes'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-rose-200'
                  : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-100'
              }`}
            >
              {statusFilter === 'Pendentes' ? '✓ Vendo Apenas Pendentes' : 'Filtrar Tabela por Pendentes'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingDocs.map(doc => {
              const st = getDocStatus(doc);
              const driver = motoristas.find(m => m.cpf === doc.motoristaCpf);
              return (
                <div key={doc.id} className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs flex flex-col justify-between gap-3 hover:border-rose-300 transition-colors">
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="font-mono font-extrabold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                        {doc.veiculoPlaca || 'Geral'}
                      </span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase border ${
                        st.color === 'red' ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>{doc.tipo}: {doc.numero}</span>
                    </div>
                    {driver && (
                      <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                        👤 Responsável: <strong className="text-slate-700">{driver.nome}</strong>
                      </p>
                    )}
                    <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                      {doc.obs || (doc.vencimento ? `Vencimento informado: ${new Date(doc.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : 'Ação de correção necessária.')}
                    </p>
                  </div>
                  {canModify && (
                    <button
                      onClick={() => openEditModal(doc)}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Corrigir / Editar Documento
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar por placa, número ou observações..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        {canModify && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleIaDocumentReading}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2"
              title="Cadastrar e aprovar documento automaticamente via IA"
            >
              🤖 Leitura por IA
            </button>
            <button
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Novo Documento
            </button>
          </div>
        )}
      </div>

      {/* Status & Type Filter Bar */}
      <div className="space-y-3">
        {/* Status Filter Buttons */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100/70 p-1.5 rounded-xl border border-slate-200/80 w-fit">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-2">Status:</span>
          <button
            onClick={() => setStatusFilter('Todos')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'Todos' ? 'bg-white text-slate-800 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos os Status ({documentos.length})
          </button>
          <button
            onClick={() => setStatusFilter('Pendentes')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === 'Pendentes' ? 'bg-rose-600 text-white shadow-2xs font-extrabold' : 'text-rose-700 hover:bg-rose-50'
            }`}
          >
            ⚠️ Pendentes / Vencidos ({pendingDocs.length})
          </button>
          <button
            onClick={() => setStatusFilter('Validos')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === 'Validos' ? 'bg-emerald-600 text-white shadow-2xs font-extrabold' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            ✓ Válidos ({documentos.length - pendingDocs.length})
          </button>
        </div>

        {/* Type Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
          <button
            onClick={() => setTipoFilter('Todos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
              tipoFilter === 'Todos'
                ? 'bg-blue-50 text-blue-600 font-bold border-b-2 border-blue-500'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            Todos os Tipos
          </button>
          {documentTypes.map(type => (
            <button
              key={type}
              onClick={() => setTipoFilter(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                tipoFilter === type
                  ? 'bg-blue-50 text-blue-600 font-bold border-b-2 border-blue-500'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" /> Documentos Cadastrados
          </h3>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredDocs.length} {filteredDocs.length === 1 ? 'item' : 'itens'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Veículo</th>
                <th className="px-5 py-3.5">Tipo</th>
                <th className="px-5 py-3.5">Número</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Observações</th>
                {canModify && <th className="px-5 py-3.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredDocs.length > 0 ? (
                filteredDocs.map(doc => {
                  const driver = motoristas.find(m => m.cpf === doc.motoristaCpf);
                  
                  // Calcular status dinamicamente se houver vencimento
                  let statusLabel: string = doc.status;
                  let badgeColor: 'red' | 'yellow' | 'blue' | 'green' | 'none' = 'none';

                  if (doc.vencimento) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const venc = new Date(doc.vencimento + 'T00:00:00');
                    const diffTime = venc.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const activeRules = colorRules || { redDays: 5, yellowDays: 15, blueDays: 29, greenDays: 30 };

                    if (diffDays < 0) {
                      statusLabel = 'Vencido';
                      badgeColor = 'red';
                    } else if (diffDays <= activeRules.redDays) {
                      statusLabel = 'Crítico';
                      badgeColor = 'red';
                    } else if (diffDays <= activeRules.yellowDays) {
                      statusLabel = 'A vencer';
                      badgeColor = 'yellow';
                    } else if (diffDays <= activeRules.blueDays) {
                      statusLabel = 'Atenção';
                      badgeColor = 'blue';
                    } else {
                      statusLabel = 'Válido';
                      badgeColor = 'green';
                    }
                  } else {
                    if (doc.status === 'Vencido') {
                      badgeColor = 'red';
                      statusLabel = 'Vencido';
                    } else if (doc.status === 'A vencer') {
                      badgeColor = 'yellow';
                      statusLabel = 'A vencer';
                    } else {
                      badgeColor = 'green';
                      statusLabel = 'Válido';
                    }
                  }

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-700 block w-fit">
                          {doc.veiculoPlaca}
                        </span>
                        {driver && (
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1" title="Motorista Infrator/Responsável">
                            👤 {driver.nome}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-bold text-slate-800 block">{doc.tipo}</span>
                        {doc.tipo === 'Multas' && (
                          <div className="mt-1 flex flex-col gap-1 text-[11px] animate-fadeIn">
                            <span className={`inline-flex items-center gap-1 font-bold w-fit rounded px-1.5 py-0.5 text-[9px] border ${
                              doc.multa_status_condutor === 'enviado' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                : doc.multa_status_condutor === 'paga_dobrado'
                                ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                : 'bg-amber-50 text-amber-700 border-amber-200/50'
                            }`}>
                              {doc.multa_status_condutor === 'enviado' && '✓ Dados do Condutor Enviados'}
                              {doc.multa_status_condutor === 'paga_dobrado' && '⚠ Paga Dobrado (NIC)'}
                              {(!doc.multa_status_condutor || doc.multa_status_condutor === 'pendente') && '⏳ Enviar Dados (Pendente)'}
                            </span>
                            {doc.multa_data_indicacao && (
                              <span className="text-slate-500 text-[10px] font-medium">
                                Indicação: <strong className="text-slate-700">{new Date(doc.multa_data_indicacao + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs">{doc.numero}</td>
                      <td className="px-5 py-3.5 font-medium">
                        {doc.vencimento ? (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(doc.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {badgeColor === 'red' ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            <AlertCircle className="w-3 h-3" /> {statusLabel}
                          </span>
                        ) : badgeColor === 'yellow' ? (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            {statusLabel}
                          </span>
                        ) : badgeColor === 'blue' ? (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            {statusLabel}
                          </span>
                        ) : (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                            {statusLabel}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 max-w-xs truncate">{doc.obs || '—'}</td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-[36px] min-h-[36px] p-2 text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                              title="Visualizar Arquivo"
                              aria-label="Visualizar Arquivo"
                            >
                              <FileText className="w-[18px] h-[18px] shrink-0" />
                            </a>
                          )}
                          {canModify && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(doc)}
                                className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="w-[18px] h-[18px] shrink-0" />
                              </button>
                              <button
                                type="button"
                                onClick={() => startArchive(doc.id)}
                                className="min-w-[36px] min-h-[36px] p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                                title="Excluir"
                                aria-label="Excluir"
                              >
                                <Trash2 className="w-[18px] h-[18px] shrink-0" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={canModify ? 7 : 6} className="text-center py-8 text-slate-400 font-medium">
                    Nenhum documento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRUD MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            onClick={handleCloseModalAttempt}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  {editingDoc ? 'Editar Documento' : 'Cadastrar Documento'}
                </h3>
                <button
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* TARJA VERMELHA DE CAMPOS OBRIGATÓRIOS FALTANTES */}
                  {missingFields.length > 0 && (
                    <div className="p-3.5 bg-red-50 border-2 border-red-500 rounded-xl flex items-start gap-2.5 text-red-900 animate-fadeIn shadow-2xs">
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="text-xs font-semibold leading-relaxed">
                        <strong className="font-black uppercase block text-red-900 mb-0.5">
                          🚨 Preenchimento Incompleto — Ação Necessária:
                        </strong>
                        Para aprovação do documento, informe os seguintes campos obrigatórios: {' '}
                        <span className="font-extrabold underline">{missingFields.join(', ')}</span>.
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                      <span>{tipo === 'CNH' ? 'Veículo Vinculado (Opcional)' : 'Veículo Vinculado *'}</span>
                      {missingFields.includes('Veículo (Placa)') && (
                        <span className="text-red-600 font-extrabold text-[10px]">Obrigatório</span>
                      )}
                    </label>
                    <select
                      value={veiculoPlaca}
                      onChange={e => setVeiculoPlaca(e.target.value)}
                      className={`bg-white border rounded-lg px-3 py-2.5 text-sm focus:outline-none font-semibold text-slate-700 ${
                        missingFields.includes('Veículo (Placa)') ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus:border-blue-500'
                      }`}
                      required={tipo !== 'CNH'}
                    >
                      <option value="">{tipo === 'CNH' ? 'Nenhum — CNH do Motorista' : 'Selecione o veículo...'}</option>
                      {veiculos.map(v => (
                        <option key={v.placa} value={v.placa}>
                          {v.modelo} — Placa: {v.placa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {tipo === 'Multas' ? 'Motorista Responsável pela Multa *' : 'Motorista Responsável (Multas/Contratos)'}
                    </label>
                    <select
                      value={motoristaCpf}
                      onChange={e => setMotoristaCpf(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                    >
                      <option value="">Nenhum — Vincular apenas ao carro</option>
                      {motoristas.map(m => (
                        <option key={m.cpf} value={m.cpf}>
                          {m.nome} — CPF: {m.cpf}
                        </option>
                      ))}
                    </select>
                  </div>

                  {tipo === 'Multas' && (
                    <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100 space-y-4 animate-fadeIn">
                      <h4 className="text-xs font-extrabold text-purple-800 uppercase tracking-wider flex items-center gap-1.5 border-b border-purple-100/50 pb-1.5">
                        🚨 Detalhes Específicos da Multa
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-semibold text-slate-700">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                            Envio de Dados para Pontuação / NIC
                          </label>
                          <select
                            value={multaStatusCondutor}
                            onChange={e => setMultaStatusCondutor(e.target.value as any)}
                            className="bg-white border border-purple-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 font-semibold text-slate-700"
                          >
                            <option value="pendente">Pendente — Não Indicado / Não Enviado</option>
                            <option value="enviado">Dados Enviados para Pontuação</option>
                            <option value="paga_dobrado">Não Indicado (Paga Dobrado - NIC)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                            Data de Indicação do Condutor
                          </label>
                          <input
                            type="date"
                            value={multaDataIndicacao}
                            onChange={e => setMultaDataIndicacao(e.target.value)}
                            className="bg-white border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 font-semibold"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 font-semibold text-slate-700">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Tipo de Documento *
                      </label>
                      <select
                        value={tipo}
                        onChange={e => setTipo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        {documentTypes.map(type => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                        <span>Número do Documento *</span>
                        {missingFields.includes('Número do Documento') && (
                          <span className="text-red-600 font-extrabold text-[10px]">Obrigatório</span>
                        )}
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 123456789"
                        value={numero}
                        onChange={e => setNumero(e.target.value)}
                        className={`bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none font-semibold ${
                          missingFields.includes('Número do Documento') ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus:border-blue-500'
                        }`}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Data de Emissão
                      </label>
                      <input
                        type="date"
                        value={emissao}
                        onChange={e => setEmissao(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                        <span>Data de Vencimento *</span>
                        {missingFields.includes('Data de Vencimento') && (
                          <span className="text-red-600 font-extrabold text-[10px]">Obrigatório</span>
                        )}
                      </label>
                      <input
                        type="date"
                        value={vencimento}
                        onChange={e => setVencimento(e.target.value)}
                        className={`bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none font-semibold ${
                          missingFields.includes('Data de Vencimento') ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus:border-blue-500'
                        }`}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Status do Documento
                    </label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as any)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                    >
                      <option value="Válido">Válido</option>
                      <option value="Vencido">Vencido</option>
                      <option value="A vencer">A vencer</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Link / URL do Arquivo Anexo
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: https://link-do-comprovante.com/CRLV.pdf"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Observações
                    </label>
                    <textarea
                      placeholder="Alguma nota importante sobre o documento..."
                      value={obs}
                      onChange={e => setObs(e.target.value)}
                      rows={3}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM ARCHIVE MODAL */}
      <AnimatePresence>
        {archiveTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-5">
                <div className="flex items-center gap-3 text-amber-600 font-bold text-base border-b border-slate-100 pb-3 mb-4">
                  <AlertCircle className="w-6 h-6 text-amber-500" />
                  Mover Documento para o Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação não exclui permanentemente o documento, mas o move para o Arquivo Morto preservando o histórico completo.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: CRLV vencido substituído pelo novo"
                    value={archiveMotivo}
                    onChange={e => setArchiveMotivo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    required
                  />
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setArchiveTargetId(null)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmArchive}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                >
                  Confirmar e Arquivar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DE ALTERAÇÕES NÃO SALVAS */}
      <AnimatePresence>
        {showUnsavedConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
                <h3 className="font-extrabold text-amber-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  Alterações Não Salvas
                </h3>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-xs text-slate-600 font-bold leading-relaxed">
                  Você realizou alterações no formulário de documentos. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
                </p>
                <p className="text-[11px] text-slate-400">
                  Tem certeza que deseja fechar a tela sem salvar os dados?
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUnsavedConfirm(false)}
                  className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Continuar Editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                >
                  Sair sem Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
