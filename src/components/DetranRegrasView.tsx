import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Edit2,
  CreditCard,
  Building2,
  Check,
  Search,
  Filter,
  DollarSign,
  Info,
  Clock,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Veiculo, DetranRegra, DetranCalendarioExercicio, ContaPagar } from '../types';
import { getVehiclePlateFinalDigit } from '../data/detranSpRules';

interface DetranRegrasViewProps {
  veiculos: Veiculo[];
  detranRegras: DetranRegra[];
  detranCalendarios: DetranCalendarioExercicio[];
  contasPagar: ContaPagar[];
  onUpdateVeiculo: (v: Veiculo) => void;
  onSaveDetranRegra: (regra: DetranRegra) => void;
  onSaveDetranCalendario: (cal: DetranCalendarioExercicio) => void;
  onAddContaPagar: (conta: Omit<ContaPagar, 'id' | 'numeroLancamento'>) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function DetranRegrasView({
  veiculos,
  detranRegras,
  detranCalendarios,
  contasPagar,
  onUpdateVeiculo,
  onSaveDetranRegra,
  onSaveDetranCalendario,
  onAddContaPagar,
  onTriggerToast
}: DetranRegrasViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'veiculos' | 'regras' | 'calendario'>('veiculos');
  const [search, setSearch] = useState('');
  const [filterAno, setFilterAno] = useState<number>(2026);
  const [filterTipo, setFilterTipo] = useState<'Todos' | 'IPVA' | 'Licenciamento'>('Todos');
  const [filterSituacao, setFilterSituacao] = useState<'Todas' | 'Pendente' | 'Vencido' | 'Em dia'>('Todas');

  // Modal states for creating/editing rules
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DetranRegra | null>(null);

  // Form states for rule editing
  const [ruleAno, setRuleAno] = useState(2026);
  const [ruleTipo, setRuleTipo] = useState<'IPVA' | 'Licenciamento'>('IPVA');
  const [ruleCategoria, setRuleCategoria] = useState<string>('Automóveis');
  const [ruleFinalPlaca, setRuleFinalPlaca] = useState<number>(1);
  const [ruleCotaUnica, setRuleCotaUnica] = useState('2026-01-11');
  const [ruleParcelas, setRuleParcelas] = useState('5');
  const [ruleP1, setRuleP1] = useState('2026-01-11');
  const [ruleP2, setRuleP2] = useState('2026-02-11');
  const [ruleP3, setRuleP3] = useState('2026-03-11');
  const [ruleP4, setRuleP4] = useState('2026-04-11');
  const [ruleP5, setRuleP5] = useState('2026-05-11');
  const [ruleFonte, setRuleFonte] = useState('Secretaria da Fazenda de São Paulo (SFAZ/SP)');

  // Modal for editing vehicle IPVA / Licenciamento values
  const [selectedVehicleModal, setSelectedVehicleModal] = useState<Veiculo | null>(null);
  const [vehIpvaTotal, setVehIpvaTotal] = useState('');
  const [vehIpvaForma, setVehIpvaForma] = useState<'Cota única' | 'Parcelado'>('Parcelado');
  const [vehLicencValor, setVehLicencValor] = useState('160.00');

  // Calculation logic per vehicle
  const veiculosCalculados = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];

    return veiculos.map((v) => {
      const finalDigit = getVehiclePlateFinalDigit(v.placa);
      const cat = v.categoria || 'Automóveis';

      // Find IPVA Rule
      const ipvaRule = detranRegras.find(
        (r) =>
          r.estado === 'SP' &&
          r.ano === filterAno &&
          r.tipo === 'IPVA' &&
          r.finalPlaca === finalDigit &&
          (r.categoriaVeiculo.toLowerCase().includes(cat.toLowerCase()) || cat.toLowerCase().includes(r.categoriaVeiculo.toLowerCase()))
      ) || detranRegras.find(
        (r) => r.estado === 'SP' && r.ano === filterAno && r.tipo === 'IPVA' && r.finalPlaca === finalDigit
      );

      // Find Licenciamento Rule
      const licencRule = detranRegras.find(
        (r) =>
          r.estado === 'SP' &&
          r.ano === filterAno &&
          r.tipo === 'Licenciamento' &&
          r.finalPlaca === finalDigit
      );

      const ipvaVencimento = ipvaRule?.dataVencimentoCotaUnica || v.ipva_vencimento || `${filterAno}-01-20`;
      const licencVencimento = licencRule?.dataVencimentoCotaUnica || v.crlv_vencimento || `${filterAno}-08-31`;

      // Determine IPVA Status
      let ipvaStatusCalculado = v.ipva_situacao || 'Pendente';
      if (ipvaStatusCalculado !== 'Pago' && ipvaStatusCalculado !== 'Isento') {
        if (ipvaVencimento < today) {
          ipvaStatusCalculado = 'Vencido';
        } else {
          ipvaStatusCalculado = 'Pendente';
        }
      }

      // Determine Licenciamento Status
      let licencStatusCalculado = v.licenciamento_situacao || 'Pendente';
      if (licencStatusCalculado !== 'Pago' && licencStatusCalculado !== 'Regular') {
        if (licencVencimento < today) {
          licencStatusCalculado = 'Vencido';
        } else {
          licencStatusCalculado = 'Pendente';
        }
      }

      // Check if already in Contas a Pagar
      const existsIpvaPagar = contasPagar.some(
        (cp) => cp.veiculoPlaca === v.placa && cp.origemTipo === 'documentacao' && cp.descricao.toLowerCase().includes('ipva')
      );
      const existsLicencPagar = contasPagar.some(
        (cp) => cp.veiculoPlaca === v.placa && cp.origemTipo === 'documentacao' && cp.descricao.toLowerCase().includes('licenciamento')
      );

      return {
        ...v,
        finalDigit,
        ipvaVencimento,
        licencVencimento,
        ipvaStatusCalculado,
        licencStatusCalculado,
        ipvaRule,
        licencRule,
        existsIpvaPagar,
        existsLicencPagar
      };
    });
  }, [veiculos, detranRegras, filterAno, contasPagar]);

  const filteredVeiculos = useMemo(() => {
    return veiculosCalculados.filter((v) => {
      const matchSearch =
        v.placa.toLowerCase().includes(search.toLowerCase()) ||
        v.modelo.toLowerCase().includes(search.toLowerCase()) ||
        v.marca.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (filterSituacao === 'Pendente') {
        return v.ipvaStatusCalculado === 'Pendente' || v.licencStatusCalculado === 'Pendente';
      }
      if (filterSituacao === 'Vencido') {
        return v.ipvaStatusCalculado === 'Vencido' || v.licencStatusCalculado === 'Vencido';
      }
      if (filterSituacao === 'Em dia') {
        return (
          (v.ipvaStatusCalculado === 'Pago' || v.ipvaStatusCalculado === 'Isento') &&
          (v.licencStatusCalculado === 'Pago' || v.licencStatusCalculado === 'Regular')
        );
      }
      return true;
    });
  }, [veiculosCalculados, search, filterSituacao]);

  // Handle generating Contas a Pagar for IPVA
  const handleGerarIpvaContasPagar = (v: typeof veiculosCalculados[0]) => {
    const valorTotal = v.ipva_valor_total || (v.valor * 52 * 0.04) || 2400; // default estimated IPVA 4% of market
    const forma = v.ipva_forma_pagamento || 'Parcelado';

    if (v.existsIpvaPagar) {
      onTriggerToast(`Lançamento de IPVA para o veículo ${v.placa} já existe em Contas a Pagar!`, 'warning');
      return;
    }

    if (forma === 'Cota única' || !v.ipvaRule?.vencimentoParcelas) {
      onAddContaPagar({
        descricao: `IPVA ${filterAno} - Cota Única — ${v.marca} ${v.modelo} (${v.placa})`,
        fornecedor: 'Secretaria da Fazenda de São Paulo (SFAZ/SP)',
        veiculoPlaca: v.placa,
        categoria: 'DOCUMENTAÇÃO',
        subcategoria: 'IPVA',
        centroCusto: 'Frota & Impostos',
        valorOriginal: valorTotal,
        desconto: 0,
        juros: 0,
        multa: 0,
        valorFinal: valorTotal,
        valorPago: 0,
        saldoDevedor: valorTotal,
        dataEmissao: new Date().toISOString().split('T')[0],
        dataVencimento: v.ipvaVencimento,
        status: v.ipvaVencimento < new Date().toISOString().split('T')[0] ? 'Vencido' : 'Em aberto',
        observacoes: `IPVA SP ${filterAno} gerado automaticamente via regras oficiais do DETRAN/SP (Final ${v.finalDigit}).`,
        origemTipo: 'documentacao',
        origemId: `ipva-${v.placa}-${filterAno}-unica`
      });
    } else {
      // 5 Parcelas oficiais
      const parcelas = v.ipvaRule.vencimentoParcelas;
      const valorParcela = parseFloat((valorTotal / parcelas.length).toFixed(2));

      parcelas.forEach((p, idx) => {
        onAddContaPagar({
          descricao: `IPVA ${filterAno} - Parcela ${p.numero}/${parcelas.length} — ${v.marca} ${v.modelo} (${v.placa})`,
          fornecedor: 'Secretaria da Fazenda de São Paulo (SFAZ/SP)',
          veiculoPlaca: v.placa,
          categoria: 'DOCUMENTAÇÃO',
          subcategoria: 'IPVA',
          centroCusto: 'Frota & Impostos',
          valorOriginal: valorParcela,
          desconto: 0,
          juros: 0,
          multa: 0,
          valorFinal: valorParcela,
          valorPago: 0,
          saldoDevedor: valorParcela,
          dataEmissao: new Date().toISOString().split('T')[0],
          dataVencimento: p.vencimento,
          status: p.vencimento < new Date().toISOString().split('T')[0] ? 'Vencido' : 'Em aberto',
          observacoes: `IPVA SP ${filterAno} (Parcela ${idx + 1}/${parcelas.length}) gerado automaticamente.`,
          origemTipo: 'documentacao',
          origemId: `ipva-${v.placa}-${filterAno}-p${p.numero}`
        });
      });
    }

    // Mark vehicle IPVA generated flag
    onUpdateVeiculo({
      ...v,
      ipva_parcelado_gerado: true,
      ipva_situacao: 'Pendente'
    });

    onTriggerToast(`Lançamento de IPVA do veículo ${v.placa} enviado com sucesso para Contas a Pagar!`, 'success');
  };

  // Handle generating Contas a Pagar for Licenciamento
  const handleGerarLicenciamentoContaPagar = (v: typeof veiculosCalculados[0]) => {
    const valor = v.licenciamento_valor || 160.00;

    if (v.existsLicencPagar) {
      onTriggerToast(`Lançamento de Licenciamento para o veículo ${v.placa} já existe em Contas a Pagar!`, 'warning');
      return;
    }

    onAddContaPagar({
      descricao: `Licenciamento Anual ${filterAno} — ${v.marca} ${v.modelo} (${v.placa})`,
      fornecedor: 'DETRAN/SP - Departamento de Trânsito de SP',
      veiculoPlaca: v.placa,
      categoria: 'DOCUMENTAÇÃO',
      subcategoria: 'Licenciamento',
      centroCusto: 'Frota & Impostos',
      valorOriginal: valor,
      desconto: 0,
      juros: 0,
      multa: 0,
      valorFinal: valor,
      valorPago: 0,
      saldoDevedor: valor,
      dataEmissao: new Date().toISOString().split('T')[0],
      dataVencimento: v.licencVencimento,
      status: v.licencVencimento < new Date().toISOString().split('T')[0] ? 'Vencido' : 'Em aberto',
      observacoes: `Licenciamento Anual SP ${filterAno} (Placa Final ${v.finalDigit}) gerado via tabela oficial DETRAN/SP.`,
      origemTipo: 'documentacao',
      origemId: `licenc-${v.placa}-${filterAno}`
    });

    onUpdateVeiculo({
      ...v,
      licenciamento_pagar_gerado: true,
      licenciamento_situacao: 'Pendente'
    });

    onTriggerToast(`Licenciamento ${v.placa} adicionado a Contas a Pagar!`, 'success');
  };

  const handleOpenRuleEdit = (rule?: DetranRegra) => {
    if (rule) {
      setEditingRule(rule);
      setRuleAno(rule.ano);
      setRuleTipo(rule.tipo);
      setRuleCategoria(rule.categoriaVeiculo);
      setRuleFinalPlaca(rule.finalPlaca);
      setRuleCotaUnica(rule.dataVencimentoCotaUnica || `${rule.ano}-01-20`);
      setRuleParcelas((rule.parcelasMaximas || 5).toString());
      if (rule.vencimentoParcelas && rule.vencimentoParcelas.length >= 5) {
        setRuleP1(rule.vencimentoParcelas[0].vencimento);
        setRuleP2(rule.vencimentoParcelas[1].vencimento);
        setRuleP3(rule.vencimentoParcelas[2].vencimento);
        setRuleP4(rule.vencimentoParcelas[3].vencimento);
        setRuleP5(rule.vencimentoParcelas[4].vencimento);
      }
      setRuleFonte(rule.fonteOficial || 'Secretaria da Fazenda de SP (SFAZ/SP)');
    } else {
      setEditingRule(null);
      setRuleAno(filterAno);
      setRuleTipo('IPVA');
      setRuleCategoria('Automóveis');
      setRuleFinalPlaca(1);
      setRuleCotaUnica(`${filterAno}-01-11`);
      setRuleParcelas('5');
      setRuleP1(`${filterAno}-01-11`);
      setRuleP2(`${filterAno}-02-11`);
      setRuleP3(`${filterAno}-03-11`);
      setRuleP4(`${filterAno}-04-11`);
      setRuleP5(`${filterAno}-05-11`);
      setRuleFonte('Secretaria da Fazenda de São Paulo (SFAZ/SP)');
    }
    setIsRuleModalOpen(true);
  };

  const handleSaveRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newRule: DetranRegra = {
      id: editingRule ? editingRule.id : `rule-custom-${Date.now()}`,
      estado: 'SP',
      ano: Number(ruleAno),
      tipo: ruleTipo,
      categoriaVeiculo: ruleCategoria as any,
      finalPlaca: Number(ruleFinalPlaca),
      dataVencimentoCotaUnica: ruleCotaUnica,
      dataVencimentoCotaUnicaDesconto: ruleCotaUnica,
      parcelasMaximas: Number(ruleParcelas),
      vencimentoParcelas:
        ruleTipo === 'IPVA'
          ? [
              { numero: 1, vencimento: ruleP1 },
              { numero: 2, vencimento: ruleP2 },
              { numero: 3, vencimento: ruleP3 },
              { numero: 4, vencimento: ruleP4 },
              { numero: 5, vencimento: ruleP5 }
            ]
          : undefined,
      fonteOficial: ruleFonte,
      dataPublicacao: new Date().toISOString().split('T')[0],
      dataUltimaAtualizacao: new Date().toISOString().split('T')[0],
      status: 'Ativo'
    };

    onSaveDetranRegra(newRule);
    setIsRuleModalOpen(false);
    onTriggerToast(`Regra de ${ruleTipo} do DETRAN/SP (${ruleAno}) salva com sucesso!`, 'success');
  };

  const handleSaveVehicleIpvaLicenc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicleModal) return;

    onUpdateVeiculo({
      ...selectedVehicleModal,
      ipva_valor_total: parseFloat(vehIpvaTotal) || 0,
      ipva_forma_pagamento: vehIpvaForma,
      licenciamento_valor: parseFloat(vehLicencValor) || 160.00
    });

    setSelectedVehicleModal(null);
    onTriggerToast(`Valores de IPVA/Licenciamento atualizados para o veículo ${selectedVehicleModal.placa}`, 'success');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Card Principal */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-600/10 border border-red-600/20 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Regras e Calendários Oficiais DETRAN/SP
              </h2>
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-200">
                Estado de São Paulo
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Calendários dinâmicos de vencimento de IPVA, Licenciamento anual e integração com Contas a Pagar.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <label className="text-xs font-bold text-slate-600">Exercício:</label>
          <select
            value={filterAno}
            onChange={(e) => setFilterAno(Number(e.target.value))}
            className="bg-slate-100 border border-slate-300 text-slate-900 font-bold text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
          >
            <option value={2026}>Exercício 2026 (Oficial)</option>
            <option value={2027}>Exercício 2027 (Rascunho)</option>
          </select>

          <button
            onClick={() => handleOpenRuleEdit()}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Regra DETRAN</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveSubTab('veiculos')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'veiculos'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Visão Geral dos Veículos ({veiculosCalculados.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('regras')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'regras'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Tabela de Vencimentos SP ({detranRegras.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('calendario')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeSubTab === 'calendario'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Info className="w-4 h-4" />
          <span>Status das Legislações & Fontes Oficiais</span>
        </button>
      </div>

      {/* Sub-Tab 1: Veículos e Vencimentos Calculados */}
      {activeSubTab === 'veiculos' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por placa, veículo ou marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span>Situação:</span>
              </div>
              <select
                value={filterSituacao}
                onChange={(e) => setFilterSituacao(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-lg px-3 py-2"
              >
                <option value="Todas">Todas as Situações</option>
                <option value="Pendente">Apenas Pendentes</option>
                <option value="Vencido">Apenas Vencidos</option>
                <option value="Em dia">Apenas Em Dia / Pagos</option>
              </select>
            </div>
          </div>

          {/* Table of Vehicles with IPVA / Licenciamento Status */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Veículo / Placa</th>
                    <th className="p-4">Final Placa (SP)</th>
                    <th className="p-4">Vencimento IPVA</th>
                    <th className="p-4">Situação IPVA</th>
                    <th className="p-4">Vencimento Licenciamento</th>
                    <th className="p-4">Situação Licenciamento</th>
                    <th className="p-4 text-center">Ações Financeiras</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredVeiculos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-semibold">
                        Nenhum veículo encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredVeiculos.map((v) => (
                      <tr key={v.placa} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-bold text-slate-900">
                          <div>{v.marca} {v.modelo}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-slate-900 text-white font-mono px-2 py-0.5 rounded-md">
                              {v.placa}
                            </span>
                            <span className="text-[10px] text-slate-500 font-semibold">
                              Cat: {v.categoria || 'Automóveis'}
                            </span>
                          </div>
                        </td>

                        <td className="p-4">
                          <span className="w-7 h-7 bg-red-100 border border-red-200 text-red-700 font-black rounded-lg flex items-center justify-center text-xs">
                            {v.finalDigit}
                          </span>
                        </td>

                        <td className="p-4 font-bold">
                          <div>{new Date(v.ipvaVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {v.ipva_forma_pagamento || 'Parcelado (5x)'}
                          </div>
                        </td>

                        <td className="p-4">
                          {v.ipvaStatusCalculado === 'Pago' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Pago / Isento
                            </span>
                          ) : v.ipvaStatusCalculado === 'Vencido' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-800 px-2.5 py-1 rounded-full border border-red-200">
                              <AlertTriangle className="w-3 h-3" /> Vencido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full border border-amber-200">
                              <Clock className="w-3 h-3" /> Pendente ({v.ipvaVencimento})
                            </span>
                          )}
                        </td>

                        <td className="p-4 font-bold">
                          <div>{new Date(v.licencVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
                          <div className="text-[10px] text-slate-400 font-normal">Taxa DETRAN/SP R$ {v.licenciamento_valor || 160}</div>
                        </td>

                        <td className="p-4">
                          {v.licencStatusCalculado === 'Pago' || v.licencStatusCalculado === 'Regular' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Regular
                            </span>
                          ) : v.licencStatusCalculado === 'Vencido' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-800 px-2.5 py-1 rounded-full border border-red-200">
                              <ShieldAlert className="w-3 h-3" /> Vencido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full border border-blue-200">
                              <Clock className="w-3 h-3" /> Aguardando Mês ({v.licencVencimento})
                            </span>
                          )}
                        </td>

                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleGerarIpvaContasPagar(v)}
                              disabled={v.existsIpvaPagar}
                              title="Lançar IPVA em Contas a Pagar"
                              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border flex items-center gap-1.5 transition-all ${
                                v.existsIpvaPagar
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 cursor-pointer'
                              }`}
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>{v.existsIpvaPagar ? 'IPVA Lançado' : 'Gerar IPVA'}</span>
                            </button>

                            <button
                              onClick={() => handleGerarLicenciamentoContaPagar(v)}
                              disabled={v.existsLicencPagar}
                              title="Lançar Licenciamento em Contas a Pagar"
                              className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border flex items-center gap-1.5 transition-all ${
                                v.existsLicencPagar
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 cursor-pointer'
                              }`}
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>{v.existsLicencPagar ? 'Licenc. Lançado' : 'Gerar Licenc.'}</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedVehicleModal(v);
                                setVehIpvaTotal((v.ipva_valor_total || 2400).toString());
                                setVehIpvaForma(v.ipva_forma_pagamento || 'Parcelado');
                                setVehLicencValor((v.licenciamento_valor || 160.00).toString());
                              }}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="Editar valores de impostos do veículo"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Tabela de Regras e Calendários DETRAN/SP */}
      {activeSubTab === 'regras' && (
        <div className="space-y-4">
          <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-base uppercase tracking-wider text-white">
                Tabela Oficial DETRAN/SP — Exercício {filterAno}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Regras oficiais de parcelamento de IPVA e calendário de licenciamento para o Estado de São Paulo.
              </p>
            </div>
            <span className="bg-emerald-500/20 text-emerald-400 font-mono font-bold text-xs px-3 py-1 rounded-full border border-emerald-500/30">
              FONTE: SFAZ/SP e DETRAN/SP
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* IPVA Rules Table */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-red-600" />
                  <span>Calendário IPVA {filterAno} (SP)</span>
                </h4>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  5 Parcelas sem Juros
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Final Placa</th>
                      <th className="p-2">Cota Única</th>
                      <th className="p-2">Parcela 1</th>
                      <th className="p-2">Parcela 2</th>
                      <th className="p-2">Parcela 5</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {detranRegras
                      .filter((r) => r.ano === filterAno && r.tipo === 'IPVA' && r.categoriaVeiculo === 'Automóveis')
                      .sort((a, b) => (a.finalPlaca === 0 ? 10 : a.finalPlaca) - (b.finalPlaca === 0 ? 10 : b.finalPlaca))
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="p-2 font-black text-red-600">Final {r.finalPlaca}</td>
                          <td className="p-2 text-slate-800">{r.dataVencimentoCotaUnica}</td>
                          <td className="p-2 text-slate-600">{r.vencimentoParcelas?.[0]?.vencimento || '-'}</td>
                          <td className="p-2 text-slate-600">{r.vencimentoParcelas?.[1]?.vencimento || '-'}</td>
                          <td className="p-2 text-slate-600">{r.vencimentoParcelas?.[4]?.vencimento || '-'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Licenciamento Rules Table */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-tight flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Calendário Licenciamento {filterAno} (SP)</span>
                </h4>
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  Mês Obrigatório por Placa
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Final Placa</th>
                      <th className="p-2">Automóveis / Motos</th>
                      <th className="p-2">Caminhões</th>
                      <th className="p-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((digit) => {
                      const autoRule = detranRegras.find(
                        (r) => r.ano === filterAno && r.tipo === 'Licenciamento' && r.finalPlaca === digit && r.categoriaVeiculo === 'Automóveis'
                      );
                      const caminhaoRule = detranRegras.find(
                        (r) => r.ano === filterAno && r.tipo === 'Licenciamento' && r.finalPlaca === digit && r.categoriaVeiculo === 'Caminhões'
                      );

                      return (
                        <tr key={`lic-${digit}`} className="hover:bg-slate-50">
                          <td className="p-2 font-black text-blue-600">Final {digit}</td>
                          <td className="p-2 text-slate-800 font-bold">{autoRule?.dataVencimentoCotaUnica || '-'}</td>
                          <td className="p-2 text-slate-700">{caminhaoRule?.dataVencimentoCotaUnica || '-'}</td>
                          <td className="p-2 text-right">
                            <button
                              onClick={() => autoRule && handleOpenRuleEdit(autoRule)}
                              className="text-xs text-red-600 font-bold hover:underline cursor-pointer"
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Legislações & Fontes Oficiais */}
      {activeSubTab === 'calendario' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <h3 className="font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3">
            Histórico de Atualizações de Calendários
          </h3>

          <div className="space-y-4">
            {detranCalendarios.map((cal) => (
              <div
                key={cal.ano}
                className="p-4 border border-slate-200 rounded-xl bg-slate-50 flex items-start justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-base text-slate-900">
                      Exercício {cal.ano} — Estado de {cal.estado}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        cal.status === 'Publicado Oficial'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {cal.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">{cal.observacoes}</p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Fonte Oficial: {cal.fonteOficial} (Última Checagem: {cal.dataUltimaAtualizacao})
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Edit Vehicle IPVA / Licenciamento values */}
      <AnimatePresence>
        {selectedVehicleModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">
                  Editar Impostos — {selectedVehicleModal.placa}
                </h3>
                <button
                  onClick={() => setSelectedVehicleModal(null)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveVehicleIpvaLicenc} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-slate-700 mb-1">Valor Total Estimado do IPVA (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={vehIpvaTotal}
                    onChange={(e) => setVehIpvaTotal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Forma de Pagamento IPVA:</label>
                  <select
                    value={vehIpvaForma}
                    onChange={(e) => setVehIpvaForma(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900"
                  >
                    <option value="Parcelado">Parcelado (5 Parcelas SP)</option>
                    <option value="Cota única">Cota Única com Desconto</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Valor do Licenciamento Anual (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={vehLicencValor}
                    onChange={(e) => setVehLicencValor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedVehicleModal(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Add / Edit DETRAN Rule */}
      <AnimatePresence>
        {isRuleModalOpen && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-900 text-base">
                  {editingRule ? 'Editar Regra DETRAN/SP' : 'Cadastrar Regra Oficial DETRAN/SP'}
                </h3>
                <button
                  onClick={() => setIsRuleModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-xl font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveRuleSubmit} className="space-y-4 text-xs font-semibold">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">Ano de Exercício:</label>
                    <input
                      type="number"
                      value={ruleAno}
                      onChange={(e) => setRuleAno(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">Tipo de Imposto:</label>
                    <select
                      value={ruleTipo}
                      onChange={(e) => setRuleTipo(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    >
                      <option value="IPVA">IPVA</option>
                      <option value="Licenciamento">Licenciamento</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">Categoria Veicular:</label>
                    <select
                      value={ruleCategoria}
                      onChange={(e) => setRuleCategoria(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    >
                      <option value="Automóveis">Automóveis</option>
                      <option value="Caminhões">Caminhões</option>
                      <option value="Motos">Motos</option>
                      <option value="Ônibus">Ônibus</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">Final de Placa (0 a 9):</label>
                    <select
                      value={ruleFinalPlaca}
                      onChange={(e) => setRuleFinalPlaca(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
                        <option key={d} value={d}>
                          Final {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">Vencimento Cota Única (YYYY-MM-DD):</label>
                  <input
                    type="date"
                    value={ruleCotaUnica}
                    onChange={(e) => setRuleCotaUnica(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    required
                  />
                </div>

                {ruleTipo === 'IPVA' && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    <span className="text-[11px] font-extrabold text-slate-800 uppercase block">
                      Vencimento das 5 Parcelas
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-500">Parcela 1:</label>
                        <input
                          type="date"
                          value={ruleP1}
                          onChange={(e) => setRuleP1(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">Parcela 2:</label>
                        <input
                          type="date"
                          value={ruleP2}
                          onChange={(e) => setRuleP2(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">Parcela 3:</label>
                        <input
                          type="date"
                          value={ruleP3}
                          onChange={(e) => setRuleP3(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">Parcela 4:</label>
                        <input
                          type="date"
                          value={ruleP4}
                          onChange={(e) => setRuleP4(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500">Parcela 5:</label>
                        <input
                          type="date"
                          value={ruleP5}
                          onChange={(e) => setRuleP5(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 mb-1">Fonte Oficial do Decreto:</label>
                  <input
                    type="text"
                    value={ruleFonte}
                    onChange={(e) => setRuleFonte(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold"
                    required
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsRuleModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md"
                  >
                    Salvar Regra
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
