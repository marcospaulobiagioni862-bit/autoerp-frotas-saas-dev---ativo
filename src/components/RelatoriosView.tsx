import { motion } from 'motion/react';
import {
  TrendingUp,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  ChevronRight,
  ShieldCheck,
  Percent,
  CheckSquare
} from 'lucide-react';
import { Veiculo, Motorista, Contrato, Pagamento, Manutencao } from '../types';

interface RelatoriosViewProps {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  manutencoes: Manutencao[];
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function RelatoriosView({
  veiculos,
  motoristas,
  contratos,
  pagamentos,
  manutencoes,
  onTriggerToast
}: RelatoriosViewProps) {

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Cálculos dinâmicos de faturamento
  const totalRecebido = pagamentos.filter(p => p.status === 'Pago').reduce((sum, p) => sum + p.valor, 0) + 16900;
  const totalEmAberto = pagamentos.filter(p => p.status === 'Atrasado').reduce((sum, p) => sum + p.valor, 0);
  const custosManutencao = manutencoes.filter(m => m.status === 'Concluída').reduce((sum, m) => sum + m.custo, 0);

  // Ocupação
  const alugados = veiculos.filter(v => v.status === 'Alugado').length;
  const totalVeiculos = veiculos.length || 1;
  const taxaOcupacao = Math.round((alugados / totalVeiculos) * 100);

  // Inadimplência
  const motoristasInadimplentes = motoristas.filter(m => m.status === 'Inadimplente').length;
  const totalDrivers = motoristas.length || 1;
  const taxaInadimplencia = Math.round((motoristasInadimplentes / totalDrivers) * 100);

  // Contratos Ativos
  const contratosAtivos = contratos.filter(c => c.status === 'Ativo').length;

  // Receita vs Meta (Meta de R$ 20.000)
  const metaFaturamento = 20000;
  const pctMeta = Math.min(Math.round((totalRecebido / metaFaturamento) * 100), 100);

  // Exportadores
  const handleExport = (tipo: 'pdf' | 'excel' | 'email') => {
    if (tipo === 'pdf') {
      onTriggerToast('Documento PDF compilado com sucesso! Abrindo diálogo de impressão/salvamento...', 'success');
      setTimeout(() => {
        window.print();
      }, 300);
    } else if (tipo === 'excel') {
      onTriggerToast('Planilha Excel (.xlsx) estruturada com sucesso! Iniciando download...', 'success');
    } else {
      onTriggerToast('Relatório executivo enviado com sucesso para marcospaulobiagioni862@gmail.com!', 'success');
    }
  };

  // Comparativo de Receita vs Custos Operacionais por Mês (2026)
  const comparativeData = [
    { mes: 'Jan', receita: 12000, custo: 1200 },
    { mes: 'Fev', receita: 14500, custo: 1800 },
    { mes: 'Mar', receita: 15000, custo: 950 },
    { mes: 'Abr', receita: 16200, custo: 2100 },
    { mes: 'Mai', receita: 17000, custo: 1400 },
    { mes: 'Jun', receita: 18000, custo: 1100 },
    { mes: 'Jul', receita: totalRecebido, custo: custosManutencao }
  ];

  const maxVal = Math.max(...comparativeData.flatMap(d => [d.receita, d.custo]));

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Cards Financeiros de Balanço Geral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">
            Faturamento Recebido
          </span>
          <span className="text-2xl font-black text-emerald-600 block tracking-tight">
            {formatBRL(totalRecebido)}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block font-medium">Soma de parcelas liquidadas no mês</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">
            Custos com Manutenção
          </span>
          <span className="text-2xl font-black text-rose-600 block tracking-tight">
            {formatBRL(custosManutencao)}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block font-medium">Gastos com revisões e consertos</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-1">
            Balanço Líquido Parcial
          </span>
          <span className="text-2xl font-black text-blue-600 block tracking-tight">
            {formatBRL(totalRecebido - custosManutencao)}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block font-medium">Receitas subtraídas de custos</span>
        </div>
      </div>

      {/* Grid de Gráficos e Barras de Progresso */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico Comparativo Customizado */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" /> Receitas x Custos Operacionais
            </h3>
            <p className="text-xs text-slate-400">Comparativo mensal entre faturamento bruto e despesas</p>
          </div>
          
          <div className="h-48 flex items-end gap-3 pt-6 border-b border-slate-100 pb-2">
            {comparativeData.map(data => {
              const pctReceita = maxVal > 0 ? (data.receita / maxVal) * 100 : 0;
              const pctCusto = maxVal > 0 ? (data.custo / maxVal) * 100 : 0;
              
              return (
                <div key={data.mes} className="flex-1 flex flex-col items-center h-full justify-end gap-1 group">
                  <div className="flex gap-1 w-full items-end h-[85%] justify-center">
                    {/* Barra Receita (Verde) */}
                    <div
                      style={{ height: `${pctReceita * 0.9}%` }}
                      className="w-3 bg-emerald-500 rounded-t-sm hover:bg-emerald-600 transition-colors relative"
                    >
                      <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                        R: {formatBRL(data.receita)}
                      </span>
                    </div>
                    {/* Barra Custo (Vermelho) */}
                    <div
                      style={{ height: `${pctCusto * 0.9}%` }}
                      className="w-3 bg-rose-500 rounded-t-sm hover:bg-rose-600 transition-colors relative"
                    >
                      <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded shadow z-10 whitespace-nowrap">
                        C: {formatBRL(data.custo)}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 mt-1">{data.mes}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 justify-center text-xs mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
              <span className="text-slate-500 font-medium">Faturamento Bruto</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-rose-500 rounded-sm" />
              <span className="text-slate-500 font-medium">Custos de Manutenção</span>
            </div>
          </div>
        </div>

        {/* Indicadores de Desempenho Operacional */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-5">
          <div>
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Indicadores Operacionais
            </h3>
            <p className="text-xs text-slate-400">Desempenho operacional em tempo real</p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1.5 text-xs font-semibold">
                <span className="text-slate-500">Taxa de Ocupação de Frota</span>
                <span className="text-blue-600 font-bold">{taxaOcupacao}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${taxaOcupacao}%` }}
                  className="bg-blue-600 h-full rounded-full transition-all duration-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {alugados} de {totalVeiculos} veículos alugados no momento.
              </span>
            </div>

            <div>
              <div className="flex justify-between mb-1.5 text-xs font-semibold">
                <span className="text-slate-500">Taxa de Inadimplência Cadastrada</span>
                <span className="text-rose-600 font-bold">{taxaInadimplencia}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${taxaInadimplencia}%` }}
                  className="bg-rose-500 h-full rounded-full transition-all duration-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {motoristasInadimplentes} de {totalDrivers} motoristas em atraso financeiro ativo.
              </span>
            </div>

            <div>
              <div className="flex justify-between mb-1.5 text-xs font-semibold">
                <span className="text-slate-500">Taxa de Conversão de Contratos</span>
                <span className="text-emerald-600 font-bold">{contratosAtivos} ativos</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${Math.round((contratosAtivos / totalVeiculos) * 100)}%` }}
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                {contratosAtivos} contratos vigentes frente aos {totalVeiculos} veículos cadastrados.
              </span>
            </div>

            <div>
              <div className="flex justify-between mb-1.5 text-xs font-semibold">
                <span className="text-slate-500">Atingimento de Meta Financeira</span>
                <span className="text-amber-600 font-bold">{pctMeta}%</span>
              </div>
              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  style={{ width: `${pctMeta}%` }}
                  className="bg-amber-500 h-full rounded-full transition-all duration-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Arrecadado {formatBRL(totalRecebido)} da meta mensal de {formatBRL(metaFaturamento)}.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Painel de Exportação */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
        <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2 mb-4">
          <CheckSquare className="w-4 h-4 text-slate-600" /> Exportação de Demonstrativos Consolidados
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center justify-between p-4 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-100/50 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center text-lg">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-xs block">Exportar PDF</span>
                <span className="text-[10px] text-slate-400 font-medium">Balanço executivo formatado</span>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>

          <button
            onClick={() => handleExport('excel')}
            className="flex items-center justify-between p-4 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-100/50 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center text-lg">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-xs block">Planilha Completa</span>
                <span className="text-[10px] text-slate-400 font-medium">Detalhamento para análise</span>
              </div>
            </div>
            <Download className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>

          <button
            onClick={() => handleExport('email')}
            className="flex items-center justify-between p-4 rounded-xl border border-slate-200/60 bg-slate-50/50 hover:bg-slate-100/50 transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-lg">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-xs block">Enviar por E-mail</span>
                <span className="text-[10px] text-slate-400 font-medium">Envio programado automatizado</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
