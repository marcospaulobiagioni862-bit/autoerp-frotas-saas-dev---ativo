import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckSquare,
  AlertTriangle,
  RefreshCw,
  Plus,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  Car,
  User,
  Wrench,
  ShieldAlert,
  ArrowRight,
  Info,
  Calendar,
  Layers,
  Check,
  Zap,
  Sparkles,
  Search,
  Activity
} from 'lucide-react';
import { Motorista, Veiculo, Contrato, Pagamento, Manutencao, Rastreador, formatBRL } from '../types';

interface AuditoriaViewProps {
  pagamentos: Pagamento[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  contratos: Contrato[];
  manutencoes: Manutencao[];
  rastreadores: Rastreador[];
  onAddPagamento: (p: Pagamento) => void;
  onEditPagamento: (p: Pagamento) => void;
  onEditMotorista: (m: Motorista) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

interface Inconsistencia {
  id: string;
  tipo: 'motorista_sem_cobranca' | 'status_motorista_divergente' | 'manutencao_sem_despesa' | 'seguro_sem_despesa' | 'rastreador_sem_despesa' | 'renovacao_contrato';
  severidade: 'Alta' | 'Média' | 'Baixa';
  titulo: string;
  descricao: string;
  entidadeId: string; // ID, placa, CPF correspondente
  entidadeNome: string;
  detalhes: {
    valorDivergente?: number;
    campo1?: string;
    campo2?: string;
  };
  dadosOriginais: any;
  acaoRotulo: string;
}

export default function AuditoriaView({
  pagamentos,
  motoristas,
  veiculos,
  contratos,
  manutencoes,
  rastreadores,
  onAddPagamento,
  onEditPagamento,
  onEditMotorista,
  onTriggerToast
}: AuditoriaViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'pendentes' | 'conciliados' | 'fluxo_cruzado'>('pendentes');
  const [filterType, setFilterType] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [recalculating, setRecalculating] = useState(false);

  // Trigger manual refresh with mock delay
  const handleRefresh = () => {
    setRecalculating(true);
    setTimeout(() => {
      setRecalculating(false);
      onTriggerToast('Auditoria e cruzamento de dados atualizados com sucesso!', 'success');
    }, 600);
  };

  // Run audit checks reactively over state
  const auditResult = useMemo(() => {
    const pendentes: Inconsistencia[] = [];
    const conciliados: { id: string; titulo: string; descricao: string; tipo: string }[] = [];
    
    let totalChecks = 0;
    let passedChecks = 0;

    // -------------------------------------------------------------
    // 1. CHECK: ACTIVE CONTRACTS WITHOUT RENT RECEIVABLES
    // -------------------------------------------------------------
    const contratosAtivos = contratos.filter(c => c.status === 'Ativo');
    contratosAtivos.forEach(c => {
      totalChecks++;
      const motorista = motoristas.find(m => m.cpf === c.motoristaCpf);
      const veiculo = veiculos.find(v => v.placa === c.veiculoPlaca);
      
      // Look for any receivables (isDespesa !== true) for this driver
      const recebimentosDoContrato = pagamentos.filter(
        p => p.motoristaCpf === c.motoristaCpf && !p.isDespesa
      );

      if (recebimentosDoContrato.length === 0) {
        pendentes.push({
          id: `sem-cobranca-${c.id}`,
          tipo: 'motorista_sem_cobranca',
          severidade: 'Alta',
          titulo: 'Contrato Ativo sem nenhuma Cobrança Gerada',
          descricao: `O contrato #${c.id} do motorista ${motorista?.nome || 'Desconhecido'} está Ativo, mas não possui nenhum lançamento de contas a receber (aluguel) registrado no sistema.`,
          entidadeId: c.motoristaCpf,
          entidadeNome: motorista?.nome || 'Motorista Desconhecido',
          detalhes: {
            valorDivergente: c.valor,
            campo1: c.veiculoPlaca,
            campo2: `R$ ${c.valor} / ${c.frequenciaRecorrente || 'Semanal'}`
          },
          dadosOriginais: { contrato: c, motorista },
          acaoRotulo: 'Gerar Cobrança Inicial'
        });
      } else {
        passedChecks++;
        conciliados.push({
          id: `conc-cobranca-${c.id}`,
          tipo: 'Contrato x Faturamento',
          titulo: `Contrato de ${motorista?.nome || 'Motorista'} Conciliado`,
          descricao: `Contrato ativo possui ${recebimentosDoContrato.length} parcelas de aluguel/recebimento devidamente associadas no sistema.`
        });
      }
    });

    // -------------------------------------------------------------
    // 1.1 CHECK: CONTRACT EXPIRATION & RENEWAL NOTICE (15 DAYS NOTICE)
    // -------------------------------------------------------------
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    contratosAtivos.forEach(c => {
      if (c.fim) {
        totalChecks++;
        const endDate = new Date(c.fim + 'T00:00:00');
        const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const motorista = motoristas.find(m => m.cpf === c.motoristaCpf);

        if (diffDays <= 15) {
          const timeDesc = diffDays < 0
            ? `Vencido há ${Math.abs(diffDays)} dia(s) em ${c.fim.split('-').reverse().join('/')}`
            : diffDays === 0
            ? `Vence HOJE (${c.fim.split('-').reverse().join('/')})`
            : `Vencerá em ${diffDays} dia(s) em ${c.fim.split('-').reverse().join('/')}`;

          pendentes.push({
            id: `renovacao-contrato-${c.id}`,
            tipo: 'renovacao_contrato',
            severidade: diffDays <= 5 ? 'Alta' : 'Média',
            titulo: 'Aviso de Renovação de Contrato de Locação',
            descricao: `O contrato #${c.id} do veículo ${c.veiculoPlaca} (${motorista?.nome || 'Motorista'}) ${timeDesc}. Providencie a renovação do termo de locação.`,
            entidadeId: c.id,
            entidadeNome: `${motorista?.nome || 'Motorista'} (${c.veiculoPlaca})`,
            detalhes: {
              valorDivergente: c.valor,
              campo1: `Vencimento: ${c.fim.split('-').reverse().join('/')}`,
              campo2: `Veículo: ${c.veiculoPlaca}`
            },
            dadosOriginais: { contrato: c, motorista },
            acaoRotulo: 'Aviso de Renovação'
          });
        } else {
          passedChecks++;
          conciliados.push({
            id: `conc-renov-${c.id}`,
            tipo: 'Contrato x Vigência',
            titulo: `Vigência do Contrato #${c.id} Regular`,
            descricao: `Contrato ativo com vigência em dia (vencimento em ${c.fim.split('-').reverse().join('/')}, restante ${diffDays} dias).`
          });
        }
      }
    });

    // -------------------------------------------------------------
    // 2. CHECK: DRIVER STATUS MISMATCH & MISSING DATA
    // -------------------------------------------------------------
    motoristas.forEach(m => {
      totalChecks++;
      
      // A. STATUS MISMATCH
      // Find all unpaid overdue receivables
      const recebimentosAtrasados = pagamentos.filter(
        p => p.motoristaCpf === m.cpf && !p.isDespesa && p.status === 'Atrasado'
      );

      if (m.status === 'Ativo' && recebimentosAtrasados.length > 0) {
        const totalAtrasado = recebimentosAtrasados.reduce((sum, p) => sum + p.valor, 0);
        pendentes.push({
          id: `status-ativo-inad-${m.cpf}`,
          tipo: 'status_motorista_divergente',
          severidade: 'Média',
          titulo: 'Motorista Ativo com Parcelas Vencidas',
          descricao: `O motorista possui ${recebimentosAtrasados.length} parcelas vencidas acumulando ${formatBRL(totalAtrasado)}. É recomendável atualizá-lo para "Inadimplente".`,
          entidadeId: m.cpf,
          entidadeNome: m.nome,
          detalhes: { valorDivergente: totalAtrasado, campo1: 'Status: Ativo' },
          dadosOriginais: { motorista: m, statusDesejado: 'Inadimplente' },
          acaoRotulo: 'Alterar para Inadimplente'
        });
      } else if (m.status === 'Inadimplente' && recebimentosAtrasados.length === 0) {
        pendentes.push({
          id: `status-inad-ativo-${m.cpf}`,
          tipo: 'status_motorista_divergente',
          severidade: 'Baixa',
          titulo: 'Motorista Inadimplente sem Parcelas Vencidas',
          descricao: `O motorista regularizou seus débitos. É necessário restaurar seu status para "Ativo".`,
          entidadeId: m.cpf,
          entidadeNome: m.nome,
          detalhes: { valorDivergente: 0, campo1: 'Nenhuma pendência' },
          dadosOriginais: { motorista: m, statusDesejado: 'Ativo' },
          acaoRotulo: 'Restaurar para Ativo'
        });
      }

      // B. MISSING DATA (Pendências de Cadastro)
      const missingData = [];
      if (!m.cnh) missingData.push('CNH');
      if (!m.end) missingData.push('Endereço');
      if (!m.tel_contato) missingData.push('Contato de Emergência');
      if (m.cnh_venc && m.cnh_venc < new Date().toISOString().split('T')[0]) {
        missingData.push('CNH Vencida');
      }

      if (missingData.length > 0) {
        totalChecks++;
        pendentes.push({
          id: `missing-data-mot-${m.cpf}`,
          tipo: 'status_motorista_divergente', // Reusing type for UI simplicity
          severidade: 'Alta',
          titulo: 'Pendência de Cadastro - Motorista',
          descricao: `Faltam dados ou há documentos vencidos: ${missingData.join(', ')}.`,
          entidadeId: m.cpf,
          entidadeNome: m.nome,
          detalhes: { campo1: 'Dados Incompletos', campo2: missingData.join(', ') },
          dadosOriginais: { motorista: m },
          acaoRotulo: 'Completar Cadastro'
        });
      }
    });

    // -------------------------------------------------------------
    // 2.5. CHECK: VEHICLE MISSING DATA
    // -------------------------------------------------------------
    veiculos.forEach(v => {
      totalChecks++;
      const missingData = [];
      if (!v.renavam) missingData.push('RENAVAM');
      if (!v.chassi) missingData.push('Chassi');
      if (!v.seguro_apolice_numero) missingData.push('Apólice Seguro');

      if (missingData.length > 0) {
        pendentes.push({
          id: `missing-data-veic-${v.placa}`,
          tipo: 'status_motorista_divergente',
          severidade: 'Média',
          titulo: 'Pendência de Cadastro - Veículo',
          descricao: `Faltam dados essenciais do veículo: ${missingData.join(', ')}.`,
          entidadeId: v.placa,
          entidadeNome: v.placa,
          detalhes: { campo1: 'Veículo', campo2: missingData.join(', ') },
          dadosOriginais: { veiculo: v },
          acaoRotulo: 'Completar Cadastro'
        });
      }
    });

    // -------------------------------------------------------------
    // 3. CHECK: COMPLETED MAINTENANCE WITHOUT CORRESPONDING DESPESA (PAYABLE)
    // -------------------------------------------------------------
    const manutencoesConcluidas = manutencoes.filter(m => m.status === 'Concluída' && m.custo > 0);
    manutencoesConcluidas.forEach(man => {
      totalChecks++;
      
      // Look for any despesa (isDespesa === true) with category "Manutenção" or matching cost & plate
      const despesasManutencao = pagamentos.filter(
        p => p.isDespesa && 
             p.veiculoPlaca === man.veiculoPlaca && 
             (Math.abs(p.valor - man.custo) < 1.5 || (p.obs && p.obs.toLowerCase().includes(man.id.toLowerCase())))
      );

      if (despesasManutencao.length === 0) {
        pendentes.push({
          id: `sem-despesa-man-${man.id}`,
          tipo: 'manutencao_sem_despesa',
          severidade: 'Alta',
          titulo: 'Ordem de Serviço Concluída sem Lançamento de Despesa',
          descricao: `A manutenção do veículo ${man.veiculoPlaca} na oficina "${man.oficina}" foi concluída com o custo de ${formatBRL(man.custo)}, mas não foi encontrado nenhum registro correspondente nas Contas a Pagar (Despesas/Saídas).`,
          entidadeId: man.id,
          entidadeNome: `${man.veiculoPlaca} - ${man.tipo}`,
          detalhes: {
            valorDivergente: man.custo,
            campo1: `Oficina: ${man.oficina}`,
            campo2: `Data do Serviço: ${man.data.split('-').reverse().join('/')}`
          },
          dadosOriginais: man,
          acaoRotulo: 'Registrar Saída Financeira'
        });
      } else {
        passedChecks++;
        conciliados.push({
          id: `conc-man-${man.id}`,
          tipo: 'Manutenção x Contas a Pagar',
          titulo: `O.S. de ${man.tipo} Conciliada com Contas a Pagar`,
          descricao: `O custo de ${formatBRL(man.custo)} da manutenção do veículo ${man.veiculoPlaca} foi devidamente lançado nas contas a pagar.`
        });
      }
    });

    // -------------------------------------------------------------
    // 4. CHECK: VEHICLES WITH SEGURADO=TRUE WITHOUT ACTIVE INSURANCE EXPENSES
    // -------------------------------------------------------------
    const veiculosSegurados = veiculos.filter(v => v.segurado && v.seguro_valor && v.seguro_valor > 0);
    veiculosSegurados.forEach(v => {
      totalChecks++;
      
      // Look for a payment of category "Seguro" or contains "Seguro" and vehicle plate
      const despesasSeguro = pagamentos.filter(
        p => p.isDespesa && 
             p.veiculoPlaca === v.placa && 
             (p.categoria === 'Seguro' || (p.obs && p.obs.toLowerCase().includes('seguro')))
      );

      if (despesasSeguro.length === 0) {
        pendentes.push({
          id: `sem-seguro-desp-${v.placa}`,
          tipo: 'seguro_sem_despesa',
          severidade: 'Média',
          titulo: 'Seguro Ativo sem Despesa Programada correspondente',
          descricao: `O veículo ${v.modelo} (${v.placa}) está marcado como segurado (Prêmio: ${formatBRL(v.seguro_valor || 0)}), mas não existe nenhum lançamento de contas a pagar registrado na categoria "Seguro" para esta placa.`,
          entidadeId: v.placa,
          entidadeNome: `${v.marca} ${v.modelo}`,
          detalhes: {
            valorDivergente: v.seguro_valor || 0,
            campo1: `Seguradora: ${v.seguro_seguradora || 'Geral'}`,
            campo2: `Vencimento: ${v.seguro_vencimento ? v.seguro_vencimento.split('-').reverse().join('/') : 'Não informado'}`
          },
          dadosOriginais: v,
          acaoRotulo: 'Lançar Despesa de Seguro'
        });
      } else {
        passedChecks++;
        conciliados.push({
          id: `conc-seguro-${v.placa}`,
          tipo: 'Seguro x Contas a Pagar',
          titulo: `Seguro da Placa ${v.placa} Conciliado`,
          descricao: `O prêmio anual/mensal do seguro de ${formatBRL(v.seguro_valor || 0)} possui lançamentos financeiros associados.`
        });
      }
    });

    // -------------------------------------------------------------
    // 5. CHECK: ACTIVE TRACKERS WITH valorMensal WITHOUT CORRESPONDING EXPENSES
    // -------------------------------------------------------------
    const rastreadoresAtivos = rastreadores.filter(r => r.status === 'Ativo' && r.valorMensal && r.valorMensal > 0);
    rastreadoresAtivos.forEach(r => {
      totalChecks++;
      
      const despesasRastreador = pagamentos.filter(
        p => p.isDespesa && 
             p.veiculoPlaca === r.veiculoPlaca && 
             (p.categoria === 'Rastreador' || p.categoria === 'Mensalidade' || (p.obs && p.obs.toLowerCase().includes('rastreador')))
      );

      if (despesasRastreador.length === 0) {
        pendentes.push({
          id: `sem-rastreador-desp-${r.id}`,
          tipo: 'rastreador_sem_despesa',
          severidade: 'Baixa',
          titulo: 'Rastreador Ativo sem Lançamento de Mensalidade',
          descricao: `O rastreador ${r.marca} ${r.modelo} instalado na placa ${r.veiculoPlaca} possui mensalidade de ${formatBRL(r.valorMensal)}, porém não possui nenhuma despesa de monitoramento correspondente sob Contas a Pagar.`,
          entidadeId: r.id,
          entidadeNome: `Rastreador Placa ${r.veiculoPlaca}`,
          detalhes: {
            valorDivergente: r.valorMensal,
            campo1: `Operadora: ${r.operadora}`,
            campo2: `Mensalidade: R$ ${r.valorMensal}`
          },
          dadosOriginais: r,
          acaoRotulo: 'Lançar Despesa de Monitoramento'
        });
      } else {
        passedChecks++;
        conciliados.push({
          id: `conc-rastreador-${r.id}`,
          tipo: 'Rastreadores x Contas a Pagar',
          titulo: `Mensalidade do Rastreador (Placa ${r.veiculoPlaca}) Conciliada`,
          descricao: `O custo mensal de monitoramento de ${formatBRL(r.valorMensal)} foi encontrado na lista de contas a pagar.`
        });
      }
    });

    // Score calculation
    const complianceScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

    return {
      pendentes,
      conciliados,
      totalChecks,
      passedChecks,
      complianceScore
    };
  }, [pagamentos, motoristas, veiculos, contratos, manutencoes, rastreadores]);

  // Execute quick automatic fixes
  const handleAutoFix = (incon: Inconsistencia) => {
    const today = new Date().toISOString().split('T')[0];

    if (incon.tipo === 'motorista_sem_cobranca') {
      const { contrato, motorista } = incon.dadosOriginais;
      const nextVencDate = new Date();
      nextVencDate.setDate(nextVencDate.getDate() + 7);
      const nextVenc = nextVencDate.toISOString().split('T')[0];

      const newP: Pagamento = {
        id: `#COB-${Date.now().toString().slice(-4)}`,
        motoristaCpf: contrato.motoristaCpf,
        veiculoPlaca: contrato.veiculoPlaca,
        periodo: 'Primeira Semana (Gerado via Auditoria)',
        valor: contrato.valor,
        vencimento: today,
        status: 'Pendente',
        isDespesa: false,
        categoria: 'Aluguel de Veículo',
        forma: contrato.formaPagamento || 'Pix',
        obs: `Faturamento semanal inicial gerado via assistente de auditoria inteligente para o Contrato #${contrato.id}.`
      };

      onAddPagamento(newP);
      onTriggerToast(`Cobrança de aluguel no valor de ${formatBRL(contrato.valor)} gerada com sucesso para ${motorista?.nome || 'Motorista'}!`, 'success');

    } else if (incon.tipo === 'status_motorista_divergente') {
      const { motorista, statusDesejado } = incon.dadosOriginais;
      onEditMotorista({
        ...motorista,
        status: statusDesejado
      });
      onTriggerToast(`Status do motorista ${motorista.nome} atualizado com sucesso para "${statusDesejado}"!`, 'success');

    } else if (incon.tipo === 'manutencao_sem_despesa') {
      const man = incon.dadosOriginais as Manutencao;
      
      const newP: Pagamento = {
        id: `#DESP-MAN-${Date.now().toString().slice(-4)}`,
        motoristaCpf: '',
        veiculoPlaca: man.veiculoPlaca,
        periodo: 'Despesa de Oficina',
        valor: man.custo,
        vencimento: man.data,
        dataPagamento: man.status === 'Concluída' ? man.data : undefined,
        forma: man.formaPagamento || 'Pix',
        status: man.status === 'Concluída' ? 'Pago' : 'Pendente',
        isDespesa: true,
        categoria: 'Manutenção',
        obs: `Contas a pagar gerado automaticamente via Auditoria referente à O.S. #${man.id} (${man.tipo}) executada na oficina ${man.oficina}.`
      };

      onAddPagamento(newP);
      onTriggerToast(`Despesa de manutenção de ${formatBRL(man.custo)} para o veículo ${man.veiculoPlaca} registrada com sucesso!`, 'success');

    } else if (incon.tipo === 'seguro_sem_despesa') {
      const v = incon.dadosOriginais as Veiculo;
      
      const newP: Pagamento = {
        id: `#SEG-${Date.now().toString().slice(-4)}`,
        motoristaCpf: '',
        veiculoPlaca: v.placa,
        periodo: 'Prêmio de Seguro Veicular',
        valor: v.seguro_valor || 0,
        vencimento: v.seguro_vencimento || today,
        status: 'Pendente',
        isDespesa: true,
        categoria: 'Seguro',
        forma: v.seguro_forma_pagamento || 'Boleto',
        obs: `Lançamento de despesa de seguro programado via Auditoria para o veículo ${v.modelo} (Placa ${v.placa}).`
      };

      onAddPagamento(newP);
      onTriggerToast(`Despesa de seguro de ${formatBRL(v.seguro_valor || 0)} registrada para o veículo ${v.placa}!`, 'success');

    } else if (incon.tipo === 'rastreador_sem_despesa') {
      const r = incon.dadosOriginais as Rastreador;
      
      const newP: Pagamento = {
        id: `#MONIT-${Date.now().toString().slice(-4)}`,
        motoristaCpf: '',
        veiculoPlaca: r.veiculoPlaca,
        periodo: 'Mensalidade de Monitoramento',
        valor: r.valorMensal,
        vencimento: today,
        status: 'Pendente',
        isDespesa: true,
        categoria: 'Rastreador',
        forma: 'Pix',
        obs: `Assinatura de rastreador ${r.marca} via Auditoria para a placa ${r.veiculoPlaca}.`
      };

      onAddPagamento(newP);
      onTriggerToast(`Mensalidade de rastreador de ${formatBRL(r.valorMensal)} registrada para o veículo ${r.veiculoPlaca}!`, 'success');
    }
  };

  // Perform a full global automatic reconciliation of ALL pending items
  const handleAutoReconcileAll = () => {
    if (auditResult.pendentes.length === 0) {
      onTriggerToast('Não há nenhuma inconsistência pendente no sistema!', 'warning');
      return;
    }

    if (confirm(`Confirmar a conciliação automatizada de todas as ${auditResult.pendentes.length} inconsistências financeiras encontradas?`)) {
      auditResult.pendentes.forEach(incon => {
        handleAutoFix(incon);
      });
      onTriggerToast('Processo global de conciliação concluído!', 'success');
    }
  };

  // Filtered anomalies list
  const filteredInconsistencias = useMemo(() => {
    return auditResult.pendentes.filter(item => {
      const matchesSearch = 
        item.entidadeNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.entidadeId.toLowerCase().includes(searchTerm.toLowerCase());

      if (filterType === 'todos') return matchesSearch;
      return item.tipo === filterType && matchesSearch;
    });
  }, [auditResult.pendentes, filterType, searchTerm]);

  // -------------------------------------------------------------
  // DATA AND CALCULATIONS FOR CROSS CASH FLOW PROJECTION (Fluxo Cruzado)
  // -------------------------------------------------------------
  const fluxosMensais = useMemo(() => {
    const projection: Record<string, { mes: string; recebimentos: number; despesas: number; saldo: number }> = {};
    const mesesNomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const cAtivos = contratos.filter(c => c.status === 'Ativo');
    const rAtivos = rastreadores.filter(r => r.status === 'Ativo' && r.valorMensal && r.valorMensal > 0);

    // Prepopulate 2026 months
    mesesNomes.forEach(m => {
      projection[m] = { mes: m, recebimentos: 0, despesas: 0, saldo: 0 };
    });

    // Populate actual payments in the database
    pagamentos.forEach(p => {
      if (!p.vencimento) return;
      const parts = p.vencimento.split('-');
      if (parts.length < 2) return;
      const mesNum = parseInt(parts[1], 10);
      if (mesNum >= 1 && mesNum <= 12) {
        const mesNome = mesesNomes[mesNum - 1];
        if (p.isDespesa) {
          projection[mesNome].despesas += p.valor;
        } else {
          projection[mesNome].recebimentos += p.valor;
        }
      }
    });

    // Also factor in current active contract projected weekly rents for July & August (to show predictive cash flow)
    cAtivos.forEach(c => {
      // July
      projection['Jul'].recebimentos += c.valor * 2; // Project 2 more weeks
      // August
      projection['Ago'].recebimentos += c.valor * 4; // Project 4 weeks of rent
    });

    // Factor in active maintenance & recurring track fees in July/August as projected despesas
    manutencoes.forEach(m => {
      if (m.status !== 'Concluída') {
        projection['Jul'].despesas += m.custo;
      }
    });

    rAtivos.forEach(r => {
      projection['Jul'].despesas += r.valorMensal;
      projection['Ago'].despesas += r.valorMensal * 1.5;
    });

    // Calc totals
    return Object.values(projection).map(item => ({
      ...item,
      saldo: item.recebimentos - item.despesas
    }));
  }, [pagamentos, contratos, manutencoes, rastreadores]);

  const maxProjectionVal = useMemo(() => {
    return Math.max(...fluxosMensais.flatMap(f => [f.recebimentos, f.despesas, Math.abs(f.saldo)])) || 1;
  }, [fluxosMensais]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header and Compliance Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Compliance Circle Score Card */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden group col-span-1">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Activity className="w-24 h-24 text-slate-900" />
          </div>
          <div>
            <div className="text-slate-400 text-[10px] font-extrabold uppercase tracking-widest block mb-1">
              Saúde de Integração Financeira
            </div>
            <h3 className="text-lg font-black text-slate-800 tracking-tight leading-none mb-1">
              Conformidade de Lançamentos
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
              Verificação cruzada de pagamentos, despesas de manutenção, contratos e seguros.
            </p>
          </div>

          <div className="flex items-center gap-5 mt-4">
            <div className="relative w-20 h-20 flex items-center justify-center">
              {/* Circular progress bar SVG */}
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  stroke="#f1f5f9"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  stroke={auditResult.complianceScore > 80 ? '#10b981' : auditResult.complianceScore > 50 ? '#f59e0b' : '#f43f5e'}
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 34}
                  strokeDashoffset={2 * Math.PI * 34 * (1 - auditResult.complianceScore / 100)}
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <span className="absolute text-xl font-black text-slate-800">
                {auditResult.complianceScore}%
              </span>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-500">
                Total de Testes Rodados: <b className="text-slate-800 font-extrabold">{auditResult.totalChecks}</b>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Corretos / Conciliados: <b className="text-emerald-600 font-extrabold">{auditResult.passedChecks}</b>
              </div>
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                Anomalias: <b className={`font-extrabold ${auditResult.pendentes.length > 0 ? 'text-red-500' : 'text-slate-500'}`}>{auditResult.pendentes.length}</b>
              </div>
            </div>
          </div>
        </div>

        {/* Audit Instructions/Explanation Card */}
        <div className="bg-slate-900 text-slate-300 p-5 rounded-xl border border-slate-800 shadow-md col-span-1 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-rose-500 bg-rose-500/10 p-1.5 rounded-lg text-xs font-extrabold">🚨 AI-Audit Engine</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">• Auditoria Automática</span>
            </div>
            <h4 className="text-white font-extrabold text-sm uppercase tracking-wider mb-2">
              Como funciona o Cruzamento de Informações?
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">
              Nosso motor inteligente analisa de forma cruzada os cadastros de motoristas, ordens de serviços de manutenção concluídas, rastreadores instalados e seguros contratados. Ele verifica se as despesas correspondentes estão registradas nas <strong>Contas a Pagar (Saídas)</strong>, e se as cobranças de aluguel estão ativas nas <strong>Contas a Receber (Entradas)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={handleRefresh}
              disabled={recalculating}
              className="bg-white/10 hover:bg-white/15 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin text-red-500' : ''}`} />
              Reavaliar Sistema
            </button>
            
            {auditResult.pendentes.length > 0 && (
              <button
                onClick={handleAutoReconcileAll}
                className="bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-600/20"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                Conciliar Tudo ({auditResult.pendentes.length} pendências)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audit View Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-1 mt-6">
        <button
          onClick={() => setActiveSubTab('pendentes')}
          className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'pendentes'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Inconsistências Pendentes ({auditResult.pendentes.length})
        </button>

        <button
          onClick={() => setActiveSubTab('conciliados')}
          className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'conciliados'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Itens Reconciliados OK ({auditResult.conciliados.length})
        </button>

        <button
          onClick={() => setActiveSubTab('fluxo_cruzado')}
          className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
            activeSubTab === 'fluxo_cruzado'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Fluxo de Caixa Cruzado
        </button>
      </div>

      {/* TAB CONTENT: PENDENTES */}
      {activeSubTab === 'pendentes' && (
        <div className="space-y-4">
          
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="flex gap-2 shrink-0">
              {['todos', 'motorista_sem_cobranca', 'status_motorista_divergente', 'manutencao_sem_despesa', 'seguro_sem_despesa', 'rastreador_sem_despesa'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all ${
                    filterType === type
                      ? 'bg-red-600/10 text-red-600 border-red-600/30 font-extrabold'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {type === 'todos' ? 'Todos' :
                   type === 'motorista_sem_cobranca' ? 'Sem Cobrança' :
                   type === 'status_motorista_divergente' ? 'Status' :
                   type === 'manutencao_sem_despesa' ? 'Manutenções' :
                   type === 'seguro_sem_despesa' ? 'Seguro' : 'Rastreador'}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar inconsistências..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-red-600 font-semibold"
              />
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {filteredInconsistencias.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-8 text-center space-y-2"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <h4 className="font-extrabold text-base">Nenhuma inconsistência financeira detectada!</h4>
                <p className="text-xs text-emerald-600 font-medium max-w-[450px] mx-auto">
                  Excelente! Todas as manutenções, contratos e serviços estão 100% integrados com as Contas a Pagar e Contas a Receber. O sistema está perfeitamente auditado.
                </p>
              </motion.div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredInconsistencias.map((incon, index) => {
                  return (
                    <motion.div
                      key={incon.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className={`p-4 rounded-xl border bg-white shadow-xs flex flex-col md:flex-row gap-4 justify-between items-start md:items-center relative overflow-hidden group ${
                        incon.severidade === 'Alta' 
                          ? 'border-l-4 border-l-rose-500 border-slate-200' 
                          : incon.severidade === 'Média'
                          ? 'border-l-4 border-l-amber-500 border-slate-200'
                          : 'border-l-4 border-l-blue-400 border-slate-200'
                      }`}
                    >
                      {/* Icon & Details */}
                      <div className="flex gap-3.5 items-start">
                        <div className={`p-2.5 rounded-lg ${
                          incon.tipo === 'motorista_sem_cobranca' ? 'bg-indigo-50 text-indigo-600' :
                          incon.tipo === 'status_motorista_divergente' ? 'bg-amber-50 text-amber-600' :
                          incon.tipo === 'manutencao_sem_despesa' ? 'bg-rose-50 text-rose-600' : 'bg-cyan-50 text-cyan-600'
                        }`}>
                          {incon.tipo === 'motorista_sem_cobranca' && <User className="w-5 h-5" />}
                          {incon.tipo === 'status_motorista_divergente' && <AlertTriangle className="w-5 h-5" />}
                          {incon.tipo === 'manutencao_sem_despesa' && <Wrench className="w-5 h-5" />}
                          {incon.tipo === 'seguro_sem_despesa' && <ShieldAlert className="w-5 h-5" />}
                          {incon.tipo === 'rastreador_sem_despesa' && <Car className="w-5 h-5" />}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-800 text-xs sm:text-sm tracking-tight leading-tight">
                              {incon.titulo}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              incon.severidade === 'Alta' ? 'bg-rose-50 text-rose-600 border border-rose-200/50' :
                              incon.severidade === 'Média' ? 'bg-amber-50 text-amber-600 border border-amber-200/40' :
                              'bg-blue-50 text-blue-600 border border-blue-200/40'
                            }`}>
                              {incon.severidade}
                            </span>
                          </div>

                          <p className="text-xs text-slate-500 leading-relaxed max-w-[700px] font-medium">
                            {incon.descricao}
                          </p>

                          {/* Meta tags for info */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] font-bold text-slate-400 font-mono">
                            <span className="flex items-center gap-1">
                              📍 Identificador: <span className="text-slate-600 font-extrabold">{incon.entidadeId}</span>
                            </span>
                            {incon.detalhes.campo1 && (
                              <span className="flex items-center gap-1">
                                ℹ️ {incon.detalhes.campo1}
                              </span>
                            )}
                            {incon.detalhes.campo2 && (
                              <span className="flex items-center gap-1">
                                ⚙️ {incon.detalhes.campo2}
                              </span>
                            )}
                            {incon.detalhes.valorDivergente ? (
                              <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded font-black font-sans text-[10px]">
                                Divergência: {formatBRL(incon.detalhes.valorDivergente)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Instant Action Fix Button */}
                      <button
                        onClick={() => handleAutoFix(incon)}
                        className="bg-slate-900 hover:bg-red-600 text-white hover:text-white text-xs font-extrabold px-3.5 py-2 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer border border-transparent shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {incon.acaoRotulo}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* TAB CONTENT: CONCILIADOS */}
      {activeSubTab === 'conciliados' && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl flex items-start gap-3">
            <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-500 leading-relaxed font-medium">
              Abaixo estão os cruzamentos de dados que foram **validados e estão corretos** no sistema. Significa que as relações entre contratos, veículos, motoristas e despesas de ordens de serviço estão em perfeita sintonia e sem divergências financeiras.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {auditResult.conciliados.map(item => (
              <div
                key={item.id}
                className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-2xs flex items-start gap-3"
              >
                <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shrink-0 text-xs font-black">
                  ✓
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-700 uppercase tracking-wide">
                      {item.tipo}
                    </span>
                    <span className="bg-emerald-50 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Conciliado
                    </span>
                  </div>
                  <h5 className="text-xs font-extrabold text-slate-800">
                    {item.titulo}
                  </h5>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {item.descricao}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: FLUXO DE CAIXA CRUZADO */}
      {activeSubTab === 'fluxo_cruzado' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
            <div>
              <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" /> Projeção de Balanço Cruzado Mensal (2026)
              </h4>
              <p className="text-xs text-slate-400">
                Comparativo em tempo real do faturamento (Aluguéis e Contas a Receber) cruzado com custos reais e provisionados (Manutenções, Seguros e Rastreadores).
              </p>
            </div>

            {/* Visual Bar Graph */}
            <div className="space-y-4 pt-4">
              {fluxosMensais.map(flux => {
                const totalRecebimentos = flux.recebimentos;
                const totalDespesas = flux.despesas;
                const pctReceita = maxProjectionVal > 0 ? (totalRecebimentos / maxProjectionVal) * 100 : 0;
                const pctCusto = maxProjectionVal > 0 ? (totalDespesas / maxProjectionVal) * 100 : 0;
                
                return (
                  <div key={flux.mes} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border-b border-slate-100 pb-3">
                    <span className="md:col-span-1 text-xs font-black text-slate-700 uppercase font-mono tracking-wider">
                      {flux.mes}
                    </span>
                    
                    {/* Progress bars of Recebimentos vs Despesas */}
                    <div className="md:col-span-8 space-y-1.5">
                      {/* Recebimentos (Green) */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pctReceita}%` }}
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                          />
                        </div>
                        <span className="text-[10px] font-black font-mono text-emerald-600 shrink-0 w-16 text-right">
                          {formatBRL(totalRecebimentos)}
                        </span>
                      </div>

                      {/* Despesas (Red) */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pctCusto}%` }}
                            className="bg-rose-500 h-full rounded-full transition-all duration-300"
                          />
                        </div>
                        <span className="text-[10px] font-black font-mono text-rose-500 shrink-0 w-16 text-right">
                          {formatBRL(totalDespesas)}
                        </span>
                      </div>
                    </div>

                    {/* Net balance monthly projection */}
                    <div className="md:col-span-3 text-right">
                      <span className={`text-xs font-black block font-mono ${flux.saldo >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {flux.saldo >= 0 ? '+' : ''}{formatBRL(flux.saldo)}
                      </span>
                      <small className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">
                        Saldo Projetado
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Graph Legend */}
            <div className="flex gap-4 justify-center text-xs mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                <span className="text-slate-500 font-bold">Faturamento (Recebimentos)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-rose-500 rounded-sm" />
                <span className="text-slate-500 font-bold">Custos (Contas a Pagar)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
