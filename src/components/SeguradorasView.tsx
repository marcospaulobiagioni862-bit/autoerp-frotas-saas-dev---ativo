import { GeradorFinanceiroParams } from '../shared/financeiro/types';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
  FileText,
  Phone,
  Mail,
  MapPin,
  User,
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Archive
} from 'lucide-react';
import { Seguradora, Apolice, Veiculo } from '../types';

interface SeguradorasViewProps {
  seguradoras: Seguradora[];
  apolices: Apolice[];
  veiculos: Veiculo[];
  onAddSeguradora: (s: Seguradora) => void;
  onEditSeguradora: (s: Seguradora) => void;
  onArchiveSeguradora: (id: string, motivo: string) => void;
  onAddApolice: (ap: Apolice) => void;
  onEditApolice: (ap: Apolice) => void;
  onArchiveApolice: (id: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole: string;
}

export default function SeguradorasView({
  seguradoras,
  apolices,
  veiculos,
  onAddSeguradora,
  onEditSeguradora,
  onArchiveSeguradora,
  onAddApolice,
  onEditApolice,
  onArchiveApolice,
  onTriggerToast,
  userRole
}: SeguradorasViewProps) {
  const [subTab, setSubTab] = useState<'seguradoras' | 'apolices'>('seguradoras');
  const [search, setSearch] = useState('');

  // Modals state
  const [isSeguradoraModalOpen, setIsSeguradoraModalOpen] = useState(false);
  const [editingSeguradora, setEditingSeguradora] = useState<Seguradora | null>(null);

  const [isApoliceModalOpen, setIsApoliceModalOpen] = useState(false);
  const [editingApolice, setEditingApolice] = useState<Apolice | null>(null);
  const [finParams, setFinParams] = useState<GeradorFinanceiroParams>({
    tipo: 'Despesa',
    modalidade: 'Recorrente',
    valorTotal: 0,
    dataPrimeiroVencimento: new Date().toISOString().split('T')[0],
    formaPagamento: 'PIX',
    observacaoGeral: '',
    qtdParcelas: 12,
    periodicidade: 'Mensal',
    parcelasManuais: [],
    modoDivisao: 'Igual',
    semDataFim: false
  });

  // Archive modal state
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; type: 'seguradora' | 'apolice' } | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  // Seguradora Form state
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [end, setEnd] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [seguradoraObs, setSeguradoraObs] = useState('');

  // Apolice Form state
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [seguradoraId, setSeguradoraId] = useState('');
  const [numero, setNumero] = useState('');
  const [cobertura, setCobertura] = useState('');
  const [franquia, setFranquia] = useState('');
  const [valor, setValor] = useState('');
  const [inicio, setInicio] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [status, setStatus] = useState<'Ativa' | 'Vencida' | 'Renovada' | 'Cancelada'>('Ativa');
  const [apoliceObs, setApoliceObs] = useState('');

  const [originalSeguradoraFormJson, setOriginalSeguradoraFormJson] = useState('');
  const [showUnsavedConfirmSeguradora, setShowUnsavedConfirmSeguradora] = useState(false);

  const [originalApoliceFormJson, setOriginalApoliceFormJson] = useState('');
  const [showUnsavedConfirmApolice, setShowUnsavedConfirmApolice] = useState(false);

  const getSerializedSeguradoraState = () => {
    return JSON.stringify({
      nome: nome.trim(),
      cnpj: cnpj.trim(),
      tel: tel.trim(),
      email: email.trim(),
      end: end.trim(),
      responsavel: responsavel.trim(),
      obs: seguradoraObs.trim()
    });
  };

  const getSerializedStateFromSeguradora = (s: Seguradora | null) => {
    if (s) {
      return JSON.stringify({
        nome: s.nome.trim(),
        cnpj: s.cnpj.trim(),
        tel: s.tel.trim(),
        email: (s.email || '').trim(),
        end: (s.end || '').trim(),
        responsavel: (s.responsavel || '').trim(),
        obs: (s.obs || '').trim()
      });
    } else {
      return JSON.stringify({
        nome: '',
        cnpj: '',
        tel: '',
        email: '',
        end: '',
        responsavel: '',
        obs: ''
      });
    }
  };

  const isSeguradoraDirty = () => {
    return originalSeguradoraFormJson !== getSerializedSeguradoraState();
  };

  const handleCloseSeguradoraAttempt = () => {
    if (isSeguradoraDirty()) {
      setShowUnsavedConfirmSeguradora(true);
    } else {
      setIsSeguradoraModalOpen(false);
    }
  };

  const handleConfirmDiscardSeguradora = () => {
    setShowUnsavedConfirmSeguradora(false);
    setIsSeguradoraModalOpen(false);
    onTriggerToast('As alterações não foram salvas!', 'warning');
  };

  const getSerializedApoliceState = () => {
    return JSON.stringify({
      veiculoPlaca,
      seguradoraId,
      numero: numero.trim(),
      cobertura: cobertura.trim(),
      franquia: franquia.trim(),
      valor: valor.trim(),
      inicio,
      vencimento,
      status,
      apoliceObs: apoliceObs.trim()
    });
  };

  const getSerializedStateFromApolice = (ap: Apolice | null) => {
    if (ap) {
      return JSON.stringify({
        veiculoPlaca: ap.veiculoPlaca,
        seguradoraId: ap.seguradoraId,
        numero: ap.numero.trim(),
        cobertura: ap.cobertura.trim(),
        franquia: ap.franquia.toString().trim(),
        valor: ap.valor.toString().trim(),
        inicio: ap.inicio,
        vencimento: ap.vencimento,
        status: ap.status,
        apoliceObs: (ap.obs || '').trim()
      });
    } else {
      return JSON.stringify({
        veiculoPlaca: veiculos[0]?.placa || '',
        seguradoraId: seguradoras[0]?.id || '',
        numero: '',
        cobertura: 'Completa (Colisão, Incêndio, Roubo, Danos a Terceiros)',
        franquia: '',
        valor: '',
        inicio: '',
        vencimento: '',
        status: 'Ativa',
        apoliceObs: ''
      });
    }
  };

  const isApoliceDirty = () => {
    return originalApoliceFormJson !== getSerializedApoliceState();
  };

  const handleCloseApoliceAttempt = () => {
    if (isApoliceDirty()) {
      setShowUnsavedConfirmApolice(true);
    } else {
      setIsApoliceModalOpen(false);
    }
  };

  const handleConfirmDiscardApolice = () => {
    setShowUnsavedConfirmApolice(false);
    setIsApoliceModalOpen(false);
    onTriggerToast('As alterações não foram salvas!', 'warning');
  };

  const canModify = userRole !== 'Consulta' && userRole !== 'Somente leitura';

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Seguradora Modals trigger
  const openAddSeguradora = () => {
    if (!canModify) {
      onTriggerToast('Acesso negado para alteração de cadastros.', 'warning');
      return;
    }
    setEditingSeguradora(null);
    setNome('');
    setCnpj('');
    setTel('');
    setEmail('');
    setEnd('');
    setResponsavel('');
    setSeguradoraObs('');
    setOriginalSeguradoraFormJson(JSON.stringify({
      nome: '',
      cnpj: '',
      tel: '',
      email: '',
      end: '',
      responsavel: '',
      obs: ''
    }));
    setIsSeguradoraModalOpen(true);
  };

  const openEditSeguradora = (s: Seguradora) => {
    if (!canModify) {
      onTriggerToast('Acesso negado para alteração de cadastros.', 'warning');
      return;
    }
    setEditingSeguradora(s);
    setNome(s.nome);
    setCnpj(s.cnpj);
    setTel(s.tel);
    setEmail(s.email);
    setEnd(s.end);
    setResponsavel(s.responsavel);
    setSeguradoraObs(s.obs || '');
    setOriginalSeguradoraFormJson(JSON.stringify({
      nome: s.nome.trim(),
      cnpj: s.cnpj.trim(),
      tel: s.tel.trim(),
      email: (s.email || '').trim(),
      end: (s.end || '').trim(),
      responsavel: (s.responsavel || '').trim(),
      obs: (s.obs || '').trim()
    }));
    setIsSeguradoraModalOpen(true);
  };

  const handleSaveSeguradora = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !cnpj || !tel) {
      onTriggerToast('Preencha os campos obrigatórios (*)', 'error');
      return;
    }

    const sData: Seguradora = {
      id: editingSeguradora ? editingSeguradora.id : `seg_${Date.now()}`,
      nome: nome.trim(),
      cnpj: cnpj.trim(),
      tel: tel.trim(),
      email: email.trim(),
      end: end.trim(),
      responsavel: responsavel.trim(),
      obs: seguradoraObs.trim() || undefined
    };

    if (editingSeguradora) {
      onEditSeguradora(sData);
      onTriggerToast(`Seguradora ${sData.nome} atualizada com sucesso!`, 'success');
    } else {
      onAddSeguradora(sData);
      onTriggerToast(`Seguradora ${sData.nome} cadastrada com sucesso!`, 'success');
    }
    setIsSeguradoraModalOpen(false);
  };

  // Apolice Modals trigger
  const openAddApolice = () => {
    if (!canModify) {
      onTriggerToast('Acesso negado para alteração de cadastros.', 'warning');
      return;
    }
    if (seguradoras.length === 0) {
      onTriggerToast('Cadastre pelo menos uma Seguradora primeiro.', 'warning');
      return;
    }
    if (veiculos.length === 0) {
      onTriggerToast('Cadastre pelo menos um Veículo primeiro.', 'warning');
      return;
    }
    const initialSegId = seguradoras[0].id;
    setEditingApolice(null);
    setVeiculoPlaca('');
    setSeguradoraId(initialSegId);
    setNumero('');
    setCobertura('Completa (Colisão, Incêndio, Roubo, Danos a Terceiros)');
    setFranquia('');
    setValor('');
    setInicio('');
    setVencimento('');
    setStatus('Ativa');
    setApoliceObs('');
    setOriginalApoliceFormJson(JSON.stringify({
      veiculoPlaca: '',
      seguradoraId: initialSegId,
      numero: '',
      cobertura: 'Completa (Colisão, Incêndio, Roubo, Danos a Terceiros)',
      franquia: '',
      valor: '',
      inicio: '',
      vencimento: '',
      status: 'Ativa',
      apoliceObs: ''
    }));
    setIsApoliceModalOpen(true);
  };

  const openEditApolice = (ap: Apolice) => {
    if (!canModify) {
      onTriggerToast('Acesso negado para alteração de cadastros.', 'warning');
      return;
    }
    setEditingApolice(ap);
    setVeiculoPlaca(ap.veiculoPlaca);
    setSeguradoraId(ap.seguradoraId);
    setNumero(ap.numero);
    setCobertura(ap.cobertura);
    setFranquia(ap.franquia.toString());
    setValor(ap.valor.toString());
    setInicio(ap.inicio);
    setVencimento(ap.vencimento);
    setStatus(ap.status);
    setApoliceObs(ap.obs || '');
    setOriginalApoliceFormJson(JSON.stringify({
      veiculoPlaca: ap.veiculoPlaca,
      seguradoraId: ap.seguradoraId,
      numero: ap.numero.trim(),
      cobertura: ap.cobertura.trim(),
      franquia: ap.franquia.toString().trim(),
      valor: ap.valor.toString().trim(),
      inicio: ap.inicio,
      vencimento: ap.vencimento,
      status: ap.status,
      apoliceObs: (ap.obs || '').trim()
    }));
    setIsApoliceModalOpen(true);
  };

  const handleSaveApolice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!veiculoPlaca || !seguradoraId || !numero || !valor) {
      onTriggerToast('Preencha os campos obrigatórios (*)', 'error');
      return;
    }


    if (finParams.modalidade === 'Parcelado' && finParams.modoDivisao === 'Personalizado') {
      const soma = finParams.parcelasManuais.reduce((a, b) => a + b.valor, 0);
      if (Math.abs(soma - finParams.valorTotal) >= 0.01) {
        onTriggerToast('A soma das parcelas deve ser igual ao valor total.', 'error');
        return;
      }
    }

    const apData: Apolice = {
      id: editingApolice ? editingApolice.id : `ap_${Date.now()}`,
      veiculoPlaca,
      seguradoraId,
      numero: numero.trim(),
      cobertura: cobertura.trim(),
      franquia: parseFloat(franquia) || 0,
      valor: parseFloat(valor) || 0,
      inicio,
      vencimento,
      status,
      obs: apoliceObs.trim() || undefined,
      finConfig: finParams
    };

    if (editingApolice) {
      onEditApolice(apData);
      onTriggerToast(`Apólice ${apData.numero} atualizada!`, 'success');
    } else {
      onAddApolice(apData);
      onTriggerToast(`Apólice ${apData.numero} cadastrada!`, 'success');
    }
    setIsApoliceModalOpen(false);
  };

  // Archive trigger
  const startArchive = (id: string, type: 'seguradora' | 'apolice') => {
    if (!canModify) {
      onTriggerToast('Sem permissão para arquivar.', 'warning');
      return;
    }
    setArchiveTarget({ id, type });
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    const { id, type } = archiveTarget;
    if (type === 'seguradora') {
      onArchiveSeguradora(id, archiveMotivo.trim() || 'Descredenciamento');
    } else {
      onArchiveApolice(id, archiveMotivo.trim() || 'Fim de vigência / Cancelamento');
    }
    onTriggerToast('Registro enviado para o arquivo morto.', 'success');
    setArchiveTarget(null);
  };

  const filteredSeguradoras = seguradoras.filter(s =>
    s.nome.toLowerCase().includes(search.toLowerCase()) ||
    s.cnpj.includes(search) ||
    s.responsavel.toLowerCase().includes(search.toLowerCase())
  );

  const filteredApolices = apolices.filter(ap =>
    ap.veiculoPlaca.toLowerCase().includes(search.toLowerCase()) ||
    ap.numero.toLowerCase().includes(search.toLowerCase()) ||
    ap.cobertura.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Sub Tabs Toggle */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => { setSubTab('seguradoras'); setSearch(''); }}
          className={`px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
            subTab === 'seguradoras'
              ? 'border-blue-600 text-blue-600 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" /> Seguradoras e Corretoras
        </button>
        <button
          onClick={() => { setSubTab('apolices'); setSearch(''); }}
          className={`px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-all ${
            subTab === 'apolices'
              ? 'border-blue-600 text-blue-600 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" /> Apólices de Seguros
        </button>
      </div>

      {/* Action bar */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder={
              subTab === 'seguradoras'
                ? 'Pesquisar seguradora por nome, CNPJ, responsável...'
                : 'Pesquisar apólice por veículo, número, cobertura...'
            }
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        {canModify && (
          <button
            onClick={subTab === 'seguradoras' ? openAddSeguradora : openAddApolice}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> {subTab === 'seguradoras' ? 'Nova Seguradora' : 'Nova Apólice'}
          </button>
        )}
      </div>

      {/* Main content lists */}
      {subTab === 'seguradoras' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredSeguradoras.length > 0 ? (
            filteredSeguradoras.map(s => {
              const countApolices = apolices.filter(ap => ap.seguradoraId === s.id).length;
              return (
                <div
                  key={s.id}
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md transition-shadow relative flex flex-col justify-between"
                >
                  <div className="space-y-3.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-base">{s.nome}</h4>
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-md mt-1 inline-block">
                          CNPJ: {s.cnpj}
                        </span>
                      </div>
                      <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                        {countApolices} {countApolices === 1 ? 'apólice' : 'apólices'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{s.tel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{s.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{s.end}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold">Responsável: {s.responsavel}</span>
                      </div>
                    </div>

                    {s.obs && (
                      <div className="bg-slate-50 text-[11px] text-slate-500 p-2.5 rounded-lg italic">
                        "{s.obs}"
                      </div>
                    )}
                  </div>

                  {canModify && (
                    <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-4">
                      <button
                        type="button"
                        onClick={() => openEditSeguradora(s)}
                        className="text-amber-700 hover:text-amber-800 hover:bg-amber-50 border border-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Pencil className="w-[18px] h-[18px] shrink-0" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => startArchive(s.id, 'seguradora')}
                        className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-slate-200 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Excluir"
                        aria-label="Excluir"
                      >
                        <Trash2 className="w-[18px] h-[18px] shrink-0" /> Arquivar
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 text-center py-12 text-slate-400 font-semibold col-span-2">
              Nenhuma seguradora cadastrada.
            </div>
          )}
        </div>
      ) : (
        /* APÓLICES RENDER */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Apólices de Seguros da Frota
            </h3>
            <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {filteredApolices.length} registradas
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                  <th className="px-5 py-3.5">Veículo</th>
                  <th className="px-5 py-3.5">Seguradora</th>
                  <th className="px-5 py-3.5">Nº Apólice</th>
                  <th className="px-5 py-3.5">Vencimento</th>
                  <th className="px-5 py-3.5">Valores</th>
                  <th className="px-5 py-3.5">Status</th>
                  {canModify && <th className="px-5 py-3.5 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredApolices.length > 0 ? (
                  filteredApolices.map(ap => {
                    const segNome = seguradoras.find(s => s.id === ap.seguradoraId)?.nome || 'Seguradora Geral';
                    const isAtiva = ap.status === 'Ativa';
                    const isVencida = ap.status === 'Vencida';
                    return (
                      <tr key={ap.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="bg-slate-100 border border-slate-300 rounded px-2.5 py-0.5 text-xs font-mono font-bold text-slate-700">
                            {ap.veiculoPlaca}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">{segNome}</td>
                        <td className="px-5 py-3.5 font-mono text-xs">{ap.numero}</td>
                        <td className="px-5 py-3.5 font-medium">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(ap.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-800">Custo: {formatBRL(ap.valor)}</div>
                          <div className="text-[10px] text-slate-400">Franquia: {formatBRL(ap.franquia)}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          {isAtiva ? (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ativa
                            </span>
                          ) : isVencida ? (
                            <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                              <AlertCircle className="w-3.5 h-3.5" /> Vencida
                            </span>
                          ) : (
                            <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 w-fit">
                              {ap.status}
                            </span>
                          )}
                        </td>
                        {canModify && (
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={() => openEditApolice(ap)}
                                className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                                title="Editar"
                                aria-label="Editar"
                              >
                                <Pencil className="w-[18px] h-[18px] shrink-0" />
                              </button>
                              <button
                                type="button"
                                onClick={() => startArchive(ap.id, 'apolice')}
                                className="min-w-[36px] min-h-[36px] p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                                title="Excluir"
                                aria-label="Excluir"
                              >
                                <Trash2 className="w-[18px] h-[18px] shrink-0" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={canModify ? 7 : 6} className="text-center py-8 text-slate-400 font-medium">
                      Nenhuma apólice cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEGURADORA MODAL */}
      <AnimatePresence>
        {isSeguradoraModalOpen && (
          <div onClick={handleCloseSeguradoraAttempt} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  {editingSeguradora ? 'Editar Seguradora' : 'Nova Seguradora'}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseSeguradoraAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSeguradora}>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Nome da Seguradora / Corretora *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Porto Seguro S.A."
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        CNPJ *
                      </label>
                      <input
                        type="text"
                        placeholder="00.000.000/0001-00"
                        value={cnpj}
                        onChange={e => setCnpj(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Telefone de Contato *
                      </label>
                      <input
                        type="text"
                        placeholder="(11) 99999-9999"
                        value={tel}
                        onChange={e => setTel(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder="atendimento@corretora.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Endereço Completo
                    </label>
                    <input
                      type="text"
                      placeholder="Rua, Número, Bairro, Cidade/UF"
                      value={end}
                      onChange={e => setEnd(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Nome do Responsável / Corretor
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Roberto Carlos"
                      value={responsavel}
                      onChange={e => setResponsavel(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Observações
                    </label>
                    <textarea
                      placeholder="Anotações gerais sobre a corretora..."
                      value={seguradoraObs}
                      onChange={e => setSeguradoraObs(e.target.value)}
                      rows={2}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseSeguradoraAttempt}
                    className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                  >
                    Salvar Seguradora
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* APÓLICE MODAL */}
      <AnimatePresence>
        {isApoliceModalOpen && (
          <div onClick={handleCloseApoliceAttempt} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  {editingApolice ? 'Editar Apólice' : 'Nova Apólice'}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseApoliceAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveApolice}>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Veículo *
                      </label>
                      <select
                        value={veiculoPlaca}
                        onChange={e => setVeiculoPlaca(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      >
                        <option value="">Selecione o veículo...</option>
                        {veiculos.map(v => (
                          <option key={v.placa} value={v.placa}>
                            {v.modelo} ({v.placa})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Seguradora *
                      </label>
                      <select
                        value={seguradoraId}
                        onChange={e => setSeguradoraId(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      >
                        {seguradoras.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Nº da Apólice *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: POL-1234"
                        value={numero}
                        onChange={e => setNumero(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                      >
                        <option value="Ativa">Ativa</option>
                        <option value="Vencida">Vencida</option>
                        <option value="Renovada">Renovada</option>
                        <option value="Cancelada">Cancelada</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Tipo de Cobertura
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Completa (Colisão, Terceiros)"
                      value={cobertura}
                      onChange={e => setCobertura(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Valor da Franquia (R$)
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 2500"
                        value={franquia}
                        onChange={e => setFranquia(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Prêmio de Seguro (R$) *
                      </label>
                      <input
                        type="number"
                        placeholder="Ex: 1800"
                        value={valor}
                        onChange={e => setValor(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Início da Vigência
                      </label>
                      <input
                        type="date"
                        value={inicio}
                        onChange={e => setInicio(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Fim da Vigência
                      </label>
                      <input
                        type="date"
                        value={vencimento}
                        onChange={e => setVencimento(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Observações da Apólice
                    </label>
                    <textarea
                      placeholder="Ex: Parcelamento, endossos..."
                      value={apoliceObs}
                      onChange={e => setApoliceObs(e.target.value)}
                      rows={2}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold"
                    />
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseApoliceAttempt}
                    className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                  >
                    Salvar Apólice
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRM ARCHIVE */}
      <AnimatePresence>
        {archiveTarget && (
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
                  Mover {archiveTarget.type === 'seguradora' ? 'Seguradora' : 'Apólice'} para Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Essa operação não exclui os dados definitivamente, mas arquiva-os removendo da visualização operacional ativa.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cancelamento de seguro / Troca de corretor"
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
                  onClick={() => setArchiveTarget(null)}
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

      {/* CONFIRMAÇÃO DE ALTERAÇÕES NÃO SALVAS - SEGURADORA */}
      <AnimatePresence>
        {showUnsavedConfirmSeguradora && (
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
                  Você realizou alterações no formulário de seguradora. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
                </p>
                <p className="text-[11px] text-slate-400">
                  Tem certeza que deseja fechar a tela sem salvar os dados?
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUnsavedConfirmSeguradora(false)}
                  className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Continuar Editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscardSeguradora}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                >
                  Sair sem Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DE ALTERAÇÕES NÃO SALVAS - APÓLICE */}
      <AnimatePresence>
        {showUnsavedConfirmApolice && (
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
                  Você realizou alterações no formulário de apólice. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
                </p>
                <p className="text-[11px] text-slate-400">
                  Tem certeza que deseja fechar a tela sem salvar os dados?
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUnsavedConfirmApolice(false)}
                  className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Continuar Editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscardApolice}
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
