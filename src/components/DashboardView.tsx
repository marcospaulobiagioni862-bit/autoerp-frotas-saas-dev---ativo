import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Car,
  Users,
  DollarSign,
  AlertTriangle,
  Clock,
  Wrench,
  TrendingUp,
  FileText,
  CheckCircle2,
  ChevronRight,
  Mail,
  Phone,
  Calendar,
  ShieldAlert,
  Copy,
  Send,
  Check,
  Plus,
  Trash2,
  Edit3,
  Save,
  MessageSquare,
  Camera,
  Eye
} from 'lucide-react';
import { Veiculo, Motorista, Contrato, Pagamento, Manutencao } from '../types';
import { getCnhAlert, ColorRulesConfig } from '../shared/domain/cnh';
import { getVehicleMaintenanceAlerts } from '../shared/domain/maintenance';
import PendingIssuesCenter from './dashboard/PendingIssuesCenter';

interface TemplateMensagem {
  id: string;
  titulo: string;
  tipo: 'cnh' | 'pagamento' | 'documento' | 'outro';
  texto: string;
}

const DEFAULT_TEMPLATES: TemplateMensagem[] = [
  {
    id: 'cnh_vencendo',
    titulo: 'CNH Vencendo / Vencida 🪪',
    tipo: 'cnh',
    texto: 'Olá *{nome}*,\n\nIdentificamos em nosso sistema que sua CNH (Cat. {cat}) está {label_cnh} (Vencimento: {cnh_venc}).\n\nPor favor, providencie a renovação e nos envie uma foto da CNH atualizada para regularizarmos seu cadastro.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\n*Administração*'
  },
  {
    id: 'atraso_pagamento',
    titulo: 'Atraso de Pagamento 💰',
    tipo: 'pagamento',
    texto: 'Olá *{nome}*,\n\nConsta em nosso sistema uma pendência financeira referente ao período *{periodo}* (vencido em {vencimento_pagamento}).\n\n• Valor Base: *{valor}*\n• Dias em Atraso: *{dias_atraso} dia(s)*\n• Multa de Mora: *{multa}*\n• Juros de Mora: *{juros}*\n👉 *Valor Total Atualizado: {valor_total_atualizado}*\n\nPedimos a gentileza de efetuar o pagamento via PIX e nos enviar o comprovante correspondente.\n\nChave PIX: *financeiro@empresa.com*\n\nCaso já tenha efetuado, por favor desconsidere esta mensagem e nos envie o comprovante para darmos baixa.\n\nAtenciosamente,\n*Financeiro*'
  },
  {
    id: 'documento_faltante',
    titulo: 'Documento Faltante 📄',
    tipo: 'documento',
    texto: 'Olá *{nome}*,\n\nPara fins de atualização do seu cadastro de motorista, identificamos que está pendente o seguinte documento:\n\n👉 *{documento}*\n\nPor favor, nos envie uma foto legível ou arquivo em PDF deste documento o quanto antes para evitarmos restrições na sua conta.\n\nObrigado pela colaboração!\n\nAtenciosamente,\n*Cadastro*'
  },
  {
    id: 'cobranca_geral',
    titulo: 'Lembrete de Cobrança Semanal 📅',
    tipo: 'pagamento',
    texto: 'Olá *{nome}*,\n\nPassando para lembrar que o vencimento da sua parcela semanal é hoje ({data_hoje}) no valor de *{valor}*.\n\nChave PIX para pagamento: *financeiro@empresa.com*\n\nPor favor, envie o comprovante assim que realizar o pagamento. Tenha uma excelente semana!\n\nAtenciosamente,\n*Financeiro*'
  }
];

interface VeiculoAlert {
  color: 'red' | 'yellow' | 'blue' | 'green' | 'none';
  label: string;
  diffDays?: number;
  badge: string;
}


function getVeiculoDocAlert(v: Veiculo, rules?: ColorRulesConfig): VeiculoAlert {
  const activeRules = rules || { redDays: 5, yellowDays: 15, blueDays: 29, greenDays: 30 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let closestDiff = 999;
  let label = 'Documentação em dia';
  let color = 'none';
  
  const checkDate = (dateStr: string | undefined, name: string) => {
    if (!dateStr) return;
    const date = new Date(dateStr + 'T00:00:00');
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < closestDiff) {
      closestDiff = diff;
      if (diff < 0) {
        color = 'red';
        label = `${name} Vencido há ${Math.abs(diff)}d`;
      } else if (diff <= activeRules.redDays) {
        color = 'red';
        label = `${name} vence em ${diff}d (Crítico)`;
      } else if (diff <= activeRules.yellowDays) {
        color = 'yellow';
        label = `${name} vence em ${diff}d`;
      } else if (diff <= activeRules.blueDays) {
        color = 'blue';
        label = `${name} vence em ${diff}d`;
      } else {
        color = 'green';
        label = `${name} vence em ${diff}d`;
      }
    }
  };
  
  checkDate(v.crlv_vencimento, 'CRLV');
  checkDate(v.ipva_vencimento, 'IPVA');
  
  if (!v.crlv_vencimento && !v.ipva_vencimento) {
    return {
      color: 'blue',
      label: 'Sem datas cadastradas',
      diffDays: 999,
      badge: 'bg-blue-950/40 text-blue-300 border-blue-800/40 text-[10px] px-1.5 py-0.5 rounded border'
    };
  }

  let badge = 'bg-slate-800/50 text-slate-400 border-slate-700/50';
  if (color === 'red') badge = 'bg-rose-950/40 text-rose-300 border-rose-800/40 font-bold';
  else if (color === 'yellow') badge = 'bg-amber-950/40 text-amber-300 border-amber-800/40 font-bold';
  else if (color === 'blue') badge = 'bg-blue-950/40 text-blue-300 border-blue-800/40 font-bold';
  else if (color === 'green') badge = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 font-bold';

  return { color: color as any, label, diffDays: closestDiff, badge: `${badge} text-[10px] px-1.5 py-0.5 rounded border` };
}

function getVeiculoSeguroAlert(v: Veiculo, rules?: ColorRulesConfig): VeiculoAlert {
  if (!v.segurado) {
    return {
      color: 'red',
      label: 'Sem Seguro Ativo',
      diffDays: -999,
      badge: 'bg-rose-950/40 text-rose-300 border-rose-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  }

  const activeRules = rules || { redDays: 5, yellowDays: 15, blueDays: 29, greenDays: 30 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const vencStr = v.seguro_vencimento || v.seguro_vigencia_fim;
  if (!vencStr) {
    return {
      color: 'yellow',
      label: 'Sem vencimento salvo',
      diffDays: 999,
      badge: 'bg-amber-950/40 text-amber-300 border-amber-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  }

  const venc = new Date(vencStr + 'T00:00:00');
  const diff = Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  let color = 'none';
  let label = 'Seguro em dia';
  
  if (diff < 0) {
    color = 'red';
    label = `Seguro Vencido há ${Math.abs(diff)}d`;
  } else if (diff <= activeRules.redDays) {
    color = 'red';
    label = `Seguro vence em ${diff}d (Crítico)`;
  } else if (diff <= activeRules.yellowDays) {
    color = 'yellow';
    label = `Seguro vence em ${diff}d`;
  } else if (diff <= activeRules.blueDays) {
    color = 'blue';
    label = `Seguro vence em ${diff}d`;
  } else {
    color = 'green';
    label = `Seguro vence em ${diff}d`;
  }

  let badge = 'bg-slate-800/50 text-slate-400 border-slate-700/50';
  if (color === 'red') badge = 'bg-rose-950/40 text-rose-300 border-rose-800/40 font-bold';
  else if (color === 'yellow') badge = 'bg-amber-950/40 text-amber-300 border-amber-800/40 font-bold';
  else if (color === 'blue') badge = 'bg-blue-950/40 text-blue-300 border-blue-800/40 font-bold';
  else if (color === 'green') badge = 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 font-bold';

  return { color: color as any, label, diffDays: diff, badge: `${badge} text-[10px] px-1.5 py-0.5 rounded border` };
}

function getVeiculoRastreadorAlert(v: Veiculo): VeiculoAlert {
  if (!v.possui_rastreador) {
    return {
      color: 'red',
      label: 'Sem Rastreador',
      badge: 'bg-rose-950/40 text-rose-300 border-rose-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  }

  const status = (v.rastreador_status || '').toLowerCase();
  if (status === 'inativo' || status === 'desativado') {
    return {
      color: 'red',
      label: 'Rastreador Inativo',
      badge: 'bg-rose-950/40 text-rose-300 border-rose-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  } else if (status === 'alerta' || status === 'falha' || status === 'bateria baixa' || status === 'pendente') {
    return {
      color: 'yellow',
      label: `Alerta: ${v.rastreador_status}`,
      badge: 'bg-amber-950/40 text-amber-300 border-amber-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  } else if (status === 'teste' || status === 'revisar') {
    return {
      color: 'blue',
      label: 'Revisão Necessária',
      badge: 'bg-blue-950/40 text-blue-300 border-blue-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  } else {
    return {
      color: 'green',
      label: 'Rastreador OK',
      badge: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  }
}

function getVeiculoMidiaAlert(v: Veiculo): VeiculoAlert {
  const mediaCount = v.fotos_videos ? v.fotos_videos.length : 0;
  
  if (mediaCount === 0) {
    return {
      color: 'red',
      label: 'Sem Mídias de Vistoria',
      badge: 'bg-rose-950/40 text-rose-300 border-rose-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold animate-pulse'
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (v.vistoria_vencimento) {
    const venc = new Date(v.vistoria_vencimento + 'T00:00:00');
    const diff = Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) {
      return {
        color: 'red',
        label: `Vistoria Vencida (${Math.abs(diff)}d)`,
        badge: 'bg-rose-950/40 text-rose-300 border-rose-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
      };
    } else if (diff <= 5) {
      return {
        color: 'red',
        label: `Vistoria vence em ${diff}d`,
        badge: 'bg-rose-950/40 text-rose-300 border-rose-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
      };
    } else if (diff <= 10) {
      return {
        color: 'yellow',
        label: `Vistoria vence em ${diff}d`,
        badge: 'bg-amber-950/40 text-amber-300 border-amber-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
      };
    } else if (diff <= 15) {
      return {
        color: 'blue',
        label: `Vistoria vence em ${diff}d`,
        badge: 'bg-blue-950/40 text-blue-300 border-blue-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
      };
    } else if (diff <= 30) {
      return {
        color: 'green',
        label: `Vistoria vence em ${diff}d`,
        badge: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
      };
    }
  }

  if (mediaCount < 3) {
    return {
      color: 'yellow',
      label: `Apenas ${mediaCount} mídias (Incompleto)`,
      badge: 'bg-amber-950/40 text-amber-300 border-amber-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
    };
  }

  return {
    color: 'green',
    label: `${mediaCount} mídias • Regular`,
    badge: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40 text-[10px] px-1.5 py-0.5 rounded border font-bold'
  };
}

interface DashboardViewProps {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  manutencoes: Manutencao[];
  onNavigate: (tab: string) => void;
  onQuickPay: (paymentId: string) => void;
  colorRules?: ColorRulesConfig;
  onUpdateColorRules?: (rules: ColorRulesConfig) => void;
}

export default function DashboardView({
  veiculos,
  motoristas,
  contratos,
  pagamentos,
  manutencoes,
  onNavigate,
  onQuickPay,
  colorRules,
  onUpdateColorRules
}: DashboardViewProps) {

  // Formatar Moeda
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Obter pendências ERP integrado para um contrato
  const getContractERPChecks = (c: Contrato) => {
    const m = motoristas.find(driver => driver.cpf === c.motoristaCpf);
    const v = veiculos.find(veic => veic.placa === c.veiculoPlaca);
    const todayStr = new Date().toISOString().split('T')[0];

    const driverIssues: string[] = [];
    const vehicleIssues: string[] = [];

    if (m) {
      if (!m.cnh || m.cnh.trim() === '') {
        driverIssues.push('CNH não cadastrada');
      }
      if (m.cnh_venc && m.cnh_venc < todayStr) {
        driverIssues.push(`CNH vencida em ${m.cnh_venc.split('-').reverse().join('/')}`);
      }
      if (m.status === 'Bloqueado') {
        driverIssues.push('Cadastro bloqueado');
      }
      if (m.status === 'Inativo') {
        driverIssues.push('Cadastro inativo');
      }
      if (m.status === 'Inadimplente') {
        driverIssues.push('Status de Inadimplente');
      }
      const driverPayments = (pagamentos || []).filter(
        p => p.motoristaCpf === m.cpf && (p.status === 'Pendente' || p.status === 'Atrasado')
      );
      if (driverPayments.length > 0) {
        const delayed = driverPayments.filter(p => p.status === 'Atrasado').length;
        const pending = driverPayments.filter(p => p.status === 'Pendente').length;
        if (delayed > 0) {
          driverIssues.push(`${delayed} parcelas em atraso`);
        }
        if (pending > 0) {
          driverIssues.push(`${pending} parcelas pendentes`);
        }
      }
    } else {
      driverIssues.push('Motorista não encontrado');
    }

    if (v) {
      if (v.crlv_vencimento && v.crlv_vencimento < todayStr) {
        vehicleIssues.push(`CRLV vencido em ${v.crlv_vencimento.split('-').reverse().join('/')}`);
      } else if (v.crlv_situacao === 'Vencido') {
        vehicleIssues.push('CRLV marcado como Vencido');
      }
      if (v.ipva_vencimento && v.ipva_vencimento < todayStr) {
        vehicleIssues.push(`IPVA vencido em ${v.ipva_vencimento.split('-').reverse().join('/')}`);
      } else if (v.ipva_situacao === 'Pendente') {
        vehicleIssues.push('IPVA com débito pendente');
      }
      if (v.vistoria_vencimento && v.vistoria_vencimento < todayStr) {
        vehicleIssues.push(`Laudo de Vistoria vencido em ${v.vistoria_vencimento.split('-').reverse().join('/')}`);
      }

      if (!v.segurado) {
        vehicleIssues.push('Veículo sem seguro ativo');
      } else if (v.seguro_vencimento && v.seguro_vencimento < todayStr) {
        vehicleIssues.push(`Seguro vencido (${v.seguro_vencimento.split('-').reverse().join('/')})`);
      }

      const pendingMaintenances = (manutencoes || []).filter(
        maint => maint.veiculoPlaca === v.placa && maint.status !== 'Concluída'
      );
      if (pendingMaintenances.length > 0) {
        vehicleIssues.push(`${pendingMaintenances.length} O.S. de manutenção pendente`);
      }

      // Preventive maintenance alerts
      const maintAlerts = getVehicleMaintenanceAlerts(v, manutencoes);
      maintAlerts.forEach(alert => {
        if (alert.color === 'red') {
          vehicleIssues.push(`[Crítico] ${alert.label} vencida/próxima`);
        } else if (alert.color === 'yellow') {
          vehicleIssues.push(`[Atenção] ${alert.label} recomendada`);
        }
      });

      if (!v.possui_rastreador) {
        vehicleIssues.push('Sem rastreador ativo');
      } else {
        const rStatus = (v.rastreador_status || '').toLowerCase();
        if (rStatus === 'inativo' || rStatus === 'desativado' || rStatus === 'alerta' || rStatus === 'falha' || rStatus === 'pendente') {
          vehicleIssues.push(`Sinal do rastreador: ${v.rastreador_status}`);
        }
      }
    } else {
      vehicleIssues.push('Veículo não encontrado');
    }

    // Check lease renewal rule for contract end date
    const contractIssues: string[] = [];
    let renewalColor: 'red' | 'yellow' | 'green' = 'green';
    let renewalMessage = '';

    if (c.fim) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(c.fim + 'T00:00:00');
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const redDays = colorRules?.redDays ?? 5;
      const yellowDays = colorRules?.yellowDays ?? 15;

      if (diffDays < 0) {
        renewalColor = 'red';
        renewalMessage = `VENCIDO há ${Math.abs(diffDays)}d`;
        contractIssues.push(`Aviso de Renovação: Contrato VENCIDO há ${Math.abs(diffDays)} dia(s)`);
      } else if (diffDays <= redDays) {
        renewalColor = 'red';
        renewalMessage = `Vence em ${diffDays}d (Crítico)`;
        contractIssues.push(`Aviso de Renovação: Vence em ${diffDays}d (${c.fim.split('-').reverse().join('/')})`);
      } else if (diffDays <= yellowDays) {
        renewalColor = 'yellow';
        renewalMessage = `Vence em ${diffDays}d (Atenção)`;
        contractIssues.push(`Aviso de Renovação: Vence em ${diffDays}d (${c.fim.split('-').reverse().join('/')})`);
      } else {
        renewalColor = 'green';
        renewalMessage = `Vence em ${diffDays}d`;
      }
    }

    const allOk = driverIssues.length === 0 && vehicleIssues.length === 0 && contractIssues.length === 0;

    return {
      driverIssues,
      vehicleIssues,
      contractIssues,
      renewalColor,
      renewalMessage,
      allOk,
      driverName: m?.nome || 'Desconhecido',
      vehicleModel: v?.modelo || 'Desconhecido'
    };
  };

  // KPIs
  const totalVeiculos = veiculos.length;
  const motoristasAtivos = motoristas.filter(m => m.status === 'Ativo').length;
  
  // Receita do mês (Soma de Pagos + R$ 16.900 de semanas passadas)
  const receitaPaga = pagamentos.filter(p => p.status === 'Pago').reduce((sum, p) => sum + p.valor, 0);
  const receitaDoMes = receitaPaga + 16900; 

  // Inadimplência
  const motoristasInadimplentes = motoristas.filter(m => m.status === 'Inadimplente').length;
  const totalAtrasado = pagamentos.filter(p => p.status === 'Atrasado').reduce((sum, p) => sum + p.valor, 0);

  // Status da Frota
  const alugados = veiculos.filter(v => v.status === 'Alugado').length;
  const disponiveis = veiculos.filter(v => v.status === 'Disponível').length;
  const emManutencao = veiculos.filter(v => v.status === 'Em preparação').length;
  const foraDaFrota = veiculos.filter(v => v.status === 'Fora da frota').length;
  const ativosOcupacao = totalVeiculos - foraDaFrota;
  const taxaOcupacao = ativosOcupacao > 0 ? Math.round((alugados / ativosOcupacao) * 100) : 0;

  // Manutenções Pendentes
  const manutencoesPendentes = manutencoes.filter(m => m.status !== 'Concluída').length;

  // Ticket Médio Semanal
  const ticketMedio = contratos.length > 0 
    ? Math.round(contratos.reduce((sum, c) => sum + c.valor, 0) / contratos.length) 
    : 0;

  // Listas detalhadas para visualização de alertas na aba superior do Dashboard
  const cnhVermelhaList = motoristas.filter(m => {
    const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
    return alertInfo.isExpired || (alertInfo.alertColor === 'red' && alertInfo.diffDays <= (colorRules?.redDays ?? 5));
  });

  const cnhAmarelaList = motoristas.filter(m => {
    const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
    return alertInfo.alertColor === 'yellow';
  });

  const cnhAzulList = motoristas.filter(m => {
    const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
    return alertInfo.alertColor === 'blue';
  });

  const cnhVerdeList = motoristas.filter(m => {
    const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
    return alertInfo.alertColor === 'green';
  });

  const pagamentosAtrasadosList = pagamentos.filter(p => p.status === 'Atrasado').map(p => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    return {
      ...p,
      motoristaNome: mot?.nome || 'Motorista não cadastrado',
      motoristaTel: mot?.tel_contato || mot?.tel || ''
    };
  });

  // Banco de Dados de Mensagens Prontas
  const [templates, setTemplates] = useState<TemplateMensagem[]>(() => {
    const saved = localStorage.getItem('mensagens_templates');
    return saved ? JSON.parse(saved) : DEFAULT_TEMPLATES;
  });

  const [selectedDriverCpf, setSelectedDriverCpf] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const [selectedPagamentoId, setSelectedPagamentoId] = useState<string>('');
  const [selectedDocumento, setSelectedDocumento] = useState<string>('CRLV do Veículo');
  const [customDocumento, setCustomDocumento] = useState<string>('');
  const [editedMessageText, setEditedMessageText] = useState<string>('');
  const [copiedStatus, setCopiedStatus] = useState<boolean>(false);
  const [isEditingTemplates, setIsEditingTemplates] = useState<boolean>(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateTitle, setEditingTemplateTitle] = useState<string>('');
  const [editingTemplateText, setEditingTemplateText] = useState<string>('');

  const [expandedVehicleTab, setExpandedVehicleTab] = useState<'documentacao' | 'seguro' | 'rastreador' | 'midia' | null>(null);

  // Listas detalhadas de auditoria de veículos
  const docAlerts = veiculos.map(v => ({ v, alert: getVeiculoDocAlert(v, colorRules) }));
  const seguroAlerts = veiculos.map(v => ({ v, alert: getVeiculoSeguroAlert(v, colorRules) }));
  const trackerAlerts = veiculos.map(v => ({ v, alert: getVeiculoRastreadorAlert(v) }));
  const mediaAlerts = veiculos.map(v => ({ v, alert: getVeiculoMidiaAlert(v) }));

  const docCriticalCount = docAlerts.filter(a => a.alert.color === 'red').length;
  const docWarningCount = docAlerts.filter(a => a.alert.color === 'yellow').length;
  const docAttentionCount = docAlerts.filter(a => a.alert.color === 'blue').length;
  const docOkCount = docAlerts.filter(a => a.alert.color === 'green' || a.alert.color === 'none').length;

  const seguroCriticalCount = seguroAlerts.filter(a => a.alert.color === 'red').length;
  const seguroWarningCount = seguroAlerts.filter(a => a.alert.color === 'yellow').length;
  const seguroAttentionCount = seguroAlerts.filter(a => a.alert.color === 'blue').length;
  const seguroOkCount = seguroAlerts.filter(a => a.alert.color === 'green' || a.alert.color === 'none').length;

  const trackerCriticalCount = trackerAlerts.filter(a => a.alert.color === 'red').length;
  const trackerWarningCount = trackerAlerts.filter(a => a.alert.color === 'yellow').length;
  const trackerAttentionCount = trackerAlerts.filter(a => a.alert.color === 'blue').length;
  const trackerOkCount = trackerAlerts.filter(a => a.alert.color === 'green' || a.alert.color === 'none').length;

  const mediaCriticalCount = mediaAlerts.filter(a => a.alert.color === 'red').length;
  const mediaWarningCount = mediaAlerts.filter(a => a.alert.color === 'yellow').length;
  const mediaAttentionCount = mediaAlerts.filter(a => a.alert.color === 'blue').length;
  const mediaOkCount = mediaAlerts.filter(a => a.alert.color === 'green' || a.alert.color === 'none').length;

  const getActiveDriverForVehicle = (placa: string) => {
    const activeContract = contratos.find(c => c.veiculoPlaca === placa && c.status === 'Ativo');
    if (!activeContract) return null;
    return motoristas.find(m => m.cpf === activeContract.motoristaCpf);
  };

  const getSortedVehicles = (tab: 'documentacao' | 'seguro' | 'rastreador' | 'midia') => {
    return [...veiculos].map(v => {
      let alertInfo;
      if (tab === 'documentacao') alertInfo = getVeiculoDocAlert(v, colorRules);
      else if (tab === 'seguro') alertInfo = getVeiculoSeguroAlert(v, colorRules);
      else if (tab === 'rastreador') alertInfo = getVeiculoRastreadorAlert(v);
      else alertInfo = getVeiculoMidiaAlert(v);

      let priority = 0;
      if (alertInfo.color === 'red') priority = 4;
      else if (alertInfo.color === 'yellow') priority = 3;
      else if (alertInfo.color === 'blue') priority = 2;
      else if (alertInfo.color === 'green') priority = 1;

      return { v, alert: alertInfo, priority };
    }).sort((a, b) => b.priority - a.priority);
  };

  // Auto selecionar o primeiro motorista na carga inicial
  useEffect(() => {
    if (motoristas.length > 0 && !selectedDriverCpf) {
      setSelectedDriverCpf(motoristas[0].cpf);
    }
  }, [motoristas, selectedDriverCpf]);

  const activeDriver = motoristas.find(m => m.cpf === selectedDriverCpf);
  const activeTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];
  const driverPayments = pagamentos.filter(p => p.motoristaCpf === selectedDriverCpf);
  const activePayment = driverPayments.find(p => p.id === selectedPagamentoId) || driverPayments.find(p => p.status === 'Atrasado') || driverPayments[0];

  // Compilar mensagem dinamicamente
  const compileMessage = () => {
    if (!activeDriver || !activeTemplate) return '';

    let text = activeTemplate.texto;

    // {nome}
    text = text.replace(/{nome}/g, activeDriver.nome);
    
    // {cat}
    text = text.replace(/{cat}/g, activeDriver.cat || '—');
    
    // {cnh_venc}
    const cnhVenc = activeDriver.cnh_venc ? activeDriver.cnh_venc.split('-').reverse().join('/') : '—';
    text = text.replace(/{cnh_venc}/g, cnhVenc);

    // label cnh
    const alertInfo = getCnhAlert(activeDriver.cnh_venc, colorRules);
    const labelCnhText = alertInfo.isExpired 
      ? 'vencida' 
      : alertInfo.diffDays <= 0 
        ? 'vencida' 
        : `próxima do vencimento (${alertInfo.diffDays} dias restantes)`;
    text = text.replace(/{label_cnh}/g, labelCnhText);

    // {periodo}
    const pPeriodo = activePayment ? activePayment.periodo : 'Semana Atual';
    text = text.replace(/{periodo}/g, pPeriodo);

    // Calculation for active payment late interest & fine
    const baseVal = activePayment ? (activePayment.saldoDevedor !== undefined && activePayment.saldoDevedor > 0 ? activePayment.saldoDevedor : (activePayment.valorOriginal || activePayment.valor)) : 450;
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const vencDate = activePayment ? new Date(activePayment.vencimento + 'T12:00:00') : today;
    const timeDiff = today.getTime() - vencDate.getTime();
    const diasAtraso = (activePayment && activePayment.status !== 'Pago') ? Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24))) : 0;
    const multaRate = activePayment?.multaMoraRate ?? 2.0;
    const jurosRate = activePayment?.jurosDiarioRate ?? 0.033;
    const multaValue = diasAtraso > 0 ? baseVal * (multaRate / 100) : 0;
    const jurosValue = diasAtraso > 0 ? baseVal * (jurosRate / 100) * diasAtraso : 0;
    const valorTotalAtualizado = baseVal + multaValue + jurosValue;

    // {valor}
    text = text.replace(/{valor}/g, formatBRL(baseVal));

    // {multa}, {juros}, {dias_atraso}, {valor_total_atualizado}
    text = text.replace(/{multa}/g, formatBRL(multaValue));
    text = text.replace(/{juros}/g, formatBRL(jurosValue));
    text = text.replace(/{dias_atraso}/g, String(diasAtraso));
    text = text.replace(/{valor_total_atualizado}/g, formatBRL(valorTotalAtualizado));

    // {vencimento_pagamento}
    const pVenc = activePayment ? activePayment.vencimento.split('-').reverse().join('/') : '—';
    text = text.replace(/{vencimento_pagamento}/g, pVenc);

    // {documento}
    const docValue = selectedDocumento === 'Outro' ? (customDocumento || 'Documentação Pendente') : selectedDocumento;
    text = text.replace(/{documento}/g, docValue);

    // {data_hoje}
    const hojeFormatted = new Date().toLocaleDateString('pt-BR');
    text = text.replace(/{data_hoje}/g, hojeFormatted);

    return text;
  };

  useEffect(() => {
    setEditedMessageText(compileMessage());
  }, [selectedDriverCpf, selectedTemplateId, selectedPagamentoId, selectedDocumento, customDocumento, templates]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editedMessageText);
    setCopiedStatus(true);
    setTimeout(() => setCopiedStatus(false), 2000);
  };

  const handleSendWhatsapp = () => {
    if (!activeDriver) return;
    // Enviar exclusivamente para o telefone pessoal do motorista (tel), nunca contato de emergência
    const phone = (activeDriver.tel || '').replace(/\D/g, '');
    const url = `https://api.whatsapp.com/send?phone=55${phone}&text=${encodeURIComponent(editedMessageText)}`;
    window.open(url, '_blank');
  };

  const handleSaveTemplates = (newTemplates: TemplateMensagem[]) => {
    setTemplates(newTemplates);
    localStorage.setItem('mensagens_templates', JSON.stringify(newTemplates));
  };

  const handleResetTemplates = () => {
    if (window.confirm('Deseja restaurar os modelos de mensagens originais? Isso apagará suas personalizações.')) {
      setTemplates(DEFAULT_TEMPLATES);
      localStorage.removeItem('mensagens_templates');
    }
  };

  const handleAddNewTemplate = () => {
    const newId = 'custom_' + Date.now();
    const newTemplate: TemplateMensagem = {
      id: newId,
      titulo: 'Novo Modelo Customizado 📝',
      tipo: 'outro',
      texto: 'Olá *{nome}*,\n\n[Escreva sua mensagem personalizada aqui]\n\nAtenciosamente,\n*Administração*'
    };
    const updated = [...templates, newTemplate];
    handleSaveTemplates(updated);
    setSelectedTemplateId(newId);
    setEditingTemplateId(newId);
    setEditingTemplateTitle(newTemplate.titulo);
    setEditingTemplateText(newTemplate.texto);
    setIsEditingTemplates(true);
  };

  const handleDeleteTemplate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (templates.length <= 1) {
      alert('Você precisa ter pelo menos um modelo de mensagem cadastrado.');
      return;
    }
    if (window.confirm('Deseja realmente excluir este modelo?')) {
      const updated = templates.filter(t => t.id !== id);
      handleSaveTemplates(updated);
      setSelectedTemplateId(updated[0].id);
      if (editingTemplateId === id) {
        setEditingTemplateId(null);
      }
    }
  };

  // Alertas Recentes Dinâmicos
  const alertas: Array<{
    id: string;
    tipo: 'danger' | 'warning' | 'success' | 'info';
    msg: string;
    desc: string;
    whatsapp?: string;
    whatsappText?: string;
  }> = [];

  // 1. Verificar CNHs Expiradas ou Expirando
  motoristas.forEach(m => {
    const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
    if (alertInfo.alertColor !== 'none' || alertInfo.isExpired) {
      let tipo: 'danger' | 'warning' | 'success' | 'info' = 'warning';
      if (alertInfo.alertColor === 'red') tipo = 'danger';
      else if (alertInfo.alertColor === 'yellow') tipo = 'warning';
      else if (alertInfo.alertColor === 'blue') tipo = 'info';
      else if (alertInfo.alertColor === 'green') tipo = 'success';

      alertas.push({
        id: `cnh-${m.cpf}`,
        tipo,
        msg: `CNH ${alertInfo.isExpired ? 'Vencida' : 'a Vencer'} — ${m.nome}`,
        desc: `${alertInfo.label} (Cat: ${m.cat}, Venc: ${m.cnh_venc.split('-').reverse().join('/')}).`,
        whatsapp: m.tel,
        whatsappText: `Olá ${m.nome}, notamos que sua CNH (Cat ${m.cat}) está ${alertInfo.label.toLowerCase()} (Vencimento: ${m.cnh_venc.split('-').reverse().join('/')}). Favor providenciar a regularização.`
      });
    }
  });

  // 2. Verificar Pagamentos em Atraso
  pagamentos.filter(p => p.status === 'Atrasado').forEach(p => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    const vencFormat = p.vencimento.split('-').reverse().join('/');
    const baseVal = p.saldoDevedor !== undefined && p.saldoDevedor > 0 ? p.saldoDevedor : (p.valorOriginal || p.valor);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const venc = new Date(p.vencimento + 'T12:00:00');
    const timeDiff = today.getTime() - venc.getTime();
    const diasAtraso = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
    const multaRate = p.multaMoraRate ?? 2.0;
    const jurosRate = p.jurosDiarioRate ?? 0.033;
    const multaValue = baseVal * (multaRate / 100);
    const jurosValue = baseVal * (jurosRate / 100) * diasAtraso;
    const totalAtualizado = baseVal + multaValue + jurosValue;

    alertas.push({
      id: `pag-atrasado-${p.id}`,
      tipo: 'danger',
      msg: `Pagamento em atraso — ${mot?.nome || 'Motorista'}`,
      desc: `Período ${p.periodo}: Base ${formatBRL(baseVal)} + ${formatBRL(multaValue + jurosValue)} (Juros/Multa) = ${formatBRL(totalAtualizado)} (Vencido em ${vencFormat}).`,
      whatsapp: mot?.tel,
      whatsappText: `Olá *${mot?.nome || ''}*,\n\nIdentificamos um atraso no pagamento do período *${p.periodo}* (vencido em *${vencFormat}*).\n\n• Valor base: *${formatBRL(baseVal)}*\n• Dias em atraso: *${diasAtraso} dia(s)*\n• Multa por atraso (${multaRate}%): *${formatBRL(multaValue)}*\n• Juros de mora (${jurosRate}%/dia): *${formatBRL(jurosValue)}*\n👉 *Valor Total Atualizado: ${formatBRL(totalAtualizado)}*\n\nFavor nos enviar o comprovante de pagamento via PIX para darmos baixa.`
    });
  });

  // 3. Manutenções (Ordens de Serviço e Manutenção Preventiva)
  manutencoes.filter(m => m.status !== 'Concluída').forEach(m => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mDate = new Date(m.data + 'T00:00:00');
    const diffDays = Math.ceil((mDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const redDays = colorRules?.redDays ?? 5;
    const yellowDays = colorRules?.yellowDays ?? 15;

    let tipo: 'danger' | 'warning' | 'info' = 'warning';
    let statusLabel = '';

    if (diffDays < 0) {
      tipo = 'danger';
      statusLabel = `VENCIDA há ${Math.abs(diffDays)} dia(s) (${m.data.split('-').reverse().join('/')})`;
    } else if (diffDays <= redDays) {
      tipo = 'danger';
      statusLabel = `vence em ${diffDays} dia(s) (${m.data.split('-').reverse().join('/')}) - Crítico`;
    } else if (diffDays <= yellowDays) {
      tipo = 'warning';
      statusLabel = `vence em ${diffDays} dia(s) (${m.data.split('-').reverse().join('/')}) - Atenção`;
    } else {
      tipo = 'warning';
      statusLabel = `agendada para ${m.data.split('-').reverse().join('/')}`;
    }

    alertas.push({
      id: `manut-${m.id}`,
      tipo,
      msg: `Manutenção ${m.tipo} — Veículo ${m.veiculoPlaca}`,
      desc: `${m.desc || m.tipo} na oficina ${m.oficina}: ${statusLabel} (Custo: ${formatBRL(m.custo)}).`
    });
  });

  // Manutenção Preventiva (Troca de Óleo, Correia, Freios, etc.)
  veiculos.forEach(v => {
    const alerts = getVehicleMaintenanceAlerts(v, manutencoes);
    alerts.filter(a => a.color === 'red' || a.color === 'yellow').forEach(a => {
      alertas.push({
        id: `prev-maint-${v.placa}-${a.type}`,
        tipo: a.color === 'red' ? 'danger' : 'warning',
        msg: `Manutenção Preventiva ${a.color === 'red' ? 'CRÍTICA / VENCIDA' : 'Próxima do Vencimento'} (${a.label}) — Veículo ${v.placa}`,
        desc: `${v.modelo} (${v.placa}): ${a.description}.`
      });
    });
  });

  // 4. Avisos de Renovação de Locação (Contratos a Vencer ou Vencidos)
  contratos.filter(c => c.status !== 'Finalizado' && c.fim).forEach(c => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(c.fim + 'T00:00:00');
    const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const redDays = colorRules?.redDays ?? 5;
    const yellowDays = colorRules?.yellowDays ?? 15;

    if (diffDays <= yellowDays) {
      const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
      const driverName = mot?.nome || 'Motorista';
      let tipo: 'danger' | 'warning' | 'info' = 'warning';
      let statusDesc = '';

      if (diffDays < 0) {
        tipo = 'danger';
        statusDesc = `VENCIDO há ${Math.abs(diffDays)} dia(s) (${c.fim.split('-').reverse().join('/')})`;
      } else if (diffDays <= redDays) {
        tipo = 'danger';
        statusDesc = `vence em ${diffDays} dia(s) (${c.fim.split('-').reverse().join('/')})`;
      } else {
        tipo = 'warning';
        statusDesc = `vence em ${diffDays} dia(s) (${c.fim.split('-').reverse().join('/')})`;
      }

      alertas.push({
        id: `renov-locacao-${c.id}`,
        tipo,
        msg: `Aviso de Renovação de Locação — Contrato #${c.id}`,
        desc: `Locação do veículo ${c.veiculoPlaca} (${driverName}) ${statusDesc}. Providencie a renovação do termo de aluguel.`,
        whatsapp: mot?.tel,
        whatsappText: `Olá ${driverName}, seu contrato de locação do veículo ${c.veiculoPlaca} (${statusDesc}) está próximo do vencimento/renovação. Favor entrar em contato para tratarmos do novo termo de aluguel.`
      });
    }
  });

  // Caso não tenha nenhum alerta
  if (alertas.length === 0) {
    alertas.push({
      id: 'default-ok',
      tipo: 'success',
      msg: 'Tudo operacional e em dia!',
      desc: 'Nenhuma CNH vencendo nos próximos 30 dias e nenhum pagamento em atraso identificado.'
    });
  }

  // Últimas Movimentações (Pegar os 5 pagamentos mais recentes)
  const ultimasMovimentacoes = [...pagamentos]
    .sort((a, b) => {
      const today = new Date().toISOString().split('T')[0];
      const aIsFuture = a.vencimento > today;
      const bIsFuture = b.vencimento > today;
      if (aIsFuture && !bIsFuture) return 1;
      if (!aIsFuture && bIsFuture) return -1;
      if (!aIsFuture && !bIsFuture) {
        return b.vencimento.localeCompare(a.vencimento);
      }
      return a.vencimento.localeCompare(b.vencimento);
    })
    .slice(0, 5);

  // Dados do Gráfico de Barras (Receita)
  const meses = [
    { nome: 'Jan', valor: 12000 },
    { nome: 'Fev', valor: 14500 },
    { nome: 'Mar', valor: 15000 },
    { nome: 'Abr', valor: 16200 },
    { nome: 'Mai', valor: 17000 },
    { nome: 'Jun', valor: 18000 },
    { nome: 'Jul', valor: receitaDoMes }
  ];

  const maxMensal = Math.max(...meses.map(m => m.valor));

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* CENTRAL DE PENDÊNCIAS POR CORES COM LINK ATIVO */}
      <PendingIssuesCenter
        veiculos={veiculos}
        motoristas={motoristas}
        contratos={contratos}
        pagamentos={pagamentos}
        manutencoes={manutencoes}
        onNavigate={onNavigate}
        colorRules={colorRules}
      />
      {/* ABA SUPERIOR: PAINEL DE MONITORAMENTO ITEM A ITEM (CNH E PAGAMENTOS) */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Abstract background highlights */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-rose-500/5 rounded-full blur-2xl -ml-12 -mb-12 pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-black tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Monitoramento Crítico CNH & Financeiro (Item a Item)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Visualização rápida dos motoristas e cobranças ativas com base nas regras de validade
            </p>
          </div>
          <div className="flex gap-2 text-[10px] uppercase font-bold text-slate-400 bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50 self-start md:self-center">
            <span>Regras:</span>
            <span className="text-rose-400">🔴 ≤ {colorRules?.redDays ?? 5}d/Vencida</span>
            <span>•</span>
            <span className="text-amber-400">🟡 ≤ {colorRules?.yellowDays ?? 15}d</span>
            <span>•</span>
            <span className="text-blue-400">🔵 ≤ {colorRules?.blueDays ?? 29}d</span>
            <span>•</span>
            <span className="text-emerald-400">🟢 ≥ {colorRules?.greenDays ?? 30}d</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: Vermelho - CNH Crítica / Vencida */}
          <div className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
            cnhVermelhaList.length > 0 
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-100 shadow-lg shadow-rose-950/20' 
              : 'bg-slate-800/40 border-slate-800 text-slate-400'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">CNH Crítica / Vencida</span>
                <span className="text-xs">🔴 ≤ {colorRules?.redDays ?? 5}d</span>
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {cnhVermelhaList.length} {cnhVermelhaList.length === 1 ? 'Motorista' : 'Motoristas'}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] space-y-1.5 min-h-[50px] max-h-[100px] overflow-y-auto">
              {cnhVermelhaList.length > 0 ? (
                cnhVermelhaList.map(m => {
                  const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
                  return (
                    <div key={m.cpf} className="flex justify-between items-center gap-1 font-bold">
                      <span className="truncate text-white" title={m.nome}>{m.nome.split(' ')[0]} {m.nome.split(' ')[1] || ''}</span>
                      <span className="text-[9px] bg-rose-500/20 text-rose-300 px-1 py-0.2 rounded shrink-0">
                        {alertInfo.diffDays < 0 ? 'Vencida' : `${alertInfo.diffDays}d`}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic text-[10px] flex items-center gap-1">
                  ✨ Tudo regularizado
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Amarelo - CNH Vencendo em até 10 dias */}
          <div className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
            cnhAmarelaList.length > 0 
              ? 'bg-amber-950/30 border-amber-800/50 text-amber-100 shadow-lg shadow-amber-950/20' 
              : 'bg-slate-800/40 border-slate-800 text-slate-400'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">CNH Alerta</span>
                <span className="text-xs">🟡 ≤ {colorRules?.yellowDays ?? 15}d</span>
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {cnhAmarelaList.length} {cnhAmarelaList.length === 1 ? 'Motorista' : 'Motoristas'}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] space-y-1.5 min-h-[50px] max-h-[100px] overflow-y-auto">
              {cnhAmarelaList.length > 0 ? (
                cnhAmarelaList.map(m => {
                  const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
                  return (
                    <div key={m.cpf} className="flex justify-between items-center gap-1 font-bold">
                      <span className="truncate text-white" title={m.nome}>{m.nome.split(' ')[0]} {m.nome.split(' ')[1] || ''}</span>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded shrink-0">
                        {alertInfo.diffDays}d
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic text-[10px]">Nenhum neste período</div>
              )}
            </div>
          </div>

          {/* Card 3: Azul - CNH Vencendo em até 15 dias */}
          <div className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
            cnhAzulList.length > 0 
              ? 'bg-blue-950/30 border-blue-800/50 text-blue-100 shadow-lg shadow-blue-950/20' 
              : 'bg-slate-800/40 border-slate-800 text-slate-400'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">CNH Atenção</span>
                <span className="text-xs">🔵 ≤ {colorRules?.blueDays ?? 29}d</span>
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {cnhAzulList.length} {cnhAzulList.length === 1 ? 'Motorista' : 'Motoristas'}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] space-y-1.5 min-h-[50px] max-h-[100px] overflow-y-auto">
              {cnhAzulList.length > 0 ? (
                cnhAzulList.map(m => {
                  const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
                  return (
                    <div key={m.cpf} className="flex justify-between items-center gap-1 font-bold">
                      <span className="truncate text-white" title={m.nome}>{m.nome.split(' ')[0]} {m.nome.split(' ')[1] || ''}</span>
                      <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1 py-0.2 rounded shrink-0">
                        {alertInfo.diffDays}d
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic text-[10px]">Nenhum neste período</div>
              )}
            </div>
          </div>

          {/* Card 4: Verde - CNH Regular / Aviso em até 30 dias */}
          <div className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
            cnhVerdeList.length > 0 
              ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-100 shadow-lg shadow-emerald-950/20' 
              : 'bg-slate-800/40 border-slate-800 text-slate-400'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">CNH Próximos</span>
                <span className="text-xs">🟢 ≥ {colorRules?.greenDays ?? 30}d</span>
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {cnhVerdeList.length} {cnhVerdeList.length === 1 ? 'Motorista' : 'Motoristas'}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] space-y-1.5 min-h-[50px] max-h-[100px] overflow-y-auto">
              {cnhVerdeList.length > 0 ? (
                cnhVerdeList.map(m => {
                  const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
                  return (
                    <div key={m.cpf} className="flex justify-between items-center gap-1 font-bold">
                      <span className="truncate text-white" title={m.nome}>{m.nome.split(' ')[0]} {m.nome.split(' ')[1] || ''}</span>
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 py-0.2 rounded shrink-0">
                        {alertInfo.diffDays}d
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic text-[10px]">Nenhum neste período</div>
              )}
            </div>
          </div>

          {/* Card 5: Financeiro - Cobranças em Atraso */}
          <div className={`p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
            pagamentosAtrasadosList.length > 0 
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-100 shadow-lg shadow-rose-950/20' 
              : 'bg-slate-800/40 border-slate-800 text-slate-400'
          }`}>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Cobranças Atrasadas</span>
                <span className="text-xs">💰 Fluxo</span>
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {pagamentosAtrasadosList.length} {pagamentosAtrasadosList.length === 1 ? 'Débito' : 'Débitos'}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] space-y-1.5 min-h-[50px] max-h-[100px] overflow-y-auto">
              {pagamentosAtrasadosList.length > 0 ? (
                pagamentosAtrasadosList.map(p => {
                  return (
                    <div key={p.id} className="flex justify-between items-center gap-1 font-bold">
                      <span className="truncate text-white" title={p.motoristaNome}>{p.motoristaNome.split(' ')[0]}</span>
                      <span className="text-[9px] bg-rose-500/30 text-rose-200 px-1 py-0.2 rounded shrink-0">
                        {formatBRL(p.valor)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-500 italic text-[10px] flex items-center gap-1">
                  ☀️ Adimplência 100%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* DIVIDER */}
        <div className="border-t border-slate-800/80 my-6 pt-6" />

        {/* SEÇÃO DE AUDITORIA DE FROTA */}
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-black tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Monitoramento da Frota (Verificação Diária / Semanal / Mensal)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Clique nos cartões abaixo para abrir e gerenciar a situação de cada veículo, com filtros de atenção ordenados por necessidade
            </p>
          </div>
          <div className="flex gap-2 text-[10px] uppercase font-bold text-slate-400 bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/50 self-start md:self-center">
            <span>Alertas:</span>
            <span className="text-rose-400">🔴 Crítico</span>
            <span>•</span>
            <span className="text-amber-400">🟡 Atenção</span>
            <span>•</span>
            <span className="text-blue-400">🔵 Mensal</span>
            <span>•</span>
            <span className="text-emerald-400">🟢 Ok</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: DOCUMENTAÇÃO */}
          <button
            onClick={() => setExpandedVehicleTab(expandedVehicleTab === 'documentacao' ? null : 'documentacao')}
            className={`p-4 rounded-xl border transition-all duration-300 text-left flex flex-col justify-between hover:scale-[1.01] focus:outline-none ${
              expandedVehicleTab === 'documentacao'
                ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                : 'bg-slate-800/30 border-slate-800/60 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Documentos (CRLV/IPVA)</span>
                <FileText className={`w-4 h-4 ${expandedVehicleTab === 'documentacao' ? 'text-blue-400' : 'text-slate-500'}`} />
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {veiculos.length} Veículos
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[9px] font-bold">
              <span className={`px-1.5 py-0.5 rounded ${docCriticalCount > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500'}`}>
                🔴 {docCriticalCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${docWarningCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
                🟡 {docWarningCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${docAttentionCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                🔵 {docAttentionCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                🟢 {docOkCount}
              </span>
            </div>
          </button>

          {/* CARD 2: SEGURO */}
          <button
            onClick={() => setExpandedVehicleTab(expandedVehicleTab === 'seguro' ? null : 'seguro')}
            className={`p-4 rounded-xl border transition-all duration-300 text-left flex flex-col justify-between hover:scale-[1.01] focus:outline-none ${
              expandedVehicleTab === 'seguro'
                ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                : 'bg-slate-800/30 border-slate-800/60 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Seguro & Apólice</span>
                <ShieldAlert className={`w-4 h-4 ${expandedVehicleTab === 'seguro' ? 'text-emerald-400' : 'text-slate-500'}`} />
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {veiculos.filter(v => v.segurado).length} Segurados
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[9px] font-bold">
              <span className={`px-1.5 py-0.5 rounded ${seguroCriticalCount > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500'}`}>
                🔴 {seguroCriticalCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${seguroWarningCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
                🟡 {seguroWarningCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${seguroAttentionCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                🔵 {seguroAttentionCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                🟢 {seguroOkCount}
              </span>
            </div>
          </button>

          {/* CARD 3: RASTREADOR */}
          <button
            onClick={() => setExpandedVehicleTab(expandedVehicleTab === 'rastreador' ? null : 'rastreador')}
            className={`p-4 rounded-xl border transition-all duration-300 text-left flex flex-col justify-between hover:scale-[1.01] focus:outline-none ${
              expandedVehicleTab === 'rastreador'
                ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                : 'bg-slate-800/30 border-slate-800/60 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Rastreadores</span>
                <Wrench className={`w-4 h-4 ${expandedVehicleTab === 'rastreador' ? 'text-amber-400' : 'text-slate-500'}`} />
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {veiculos.filter(v => v.possui_rastreador).length} Equipados
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[9px] font-bold">
              <span className={`px-1.5 py-0.5 rounded ${trackerCriticalCount > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500'}`}>
                🔴 {trackerCriticalCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${trackerWarningCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
                🟡 {trackerWarningCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${trackerAttentionCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                🔵 {trackerAttentionCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                🟢 {trackerOkCount}
              </span>
            </div>
          </button>

          {/* CARD 4: FOTOS E VÍDEOS */}
          <button
            onClick={() => setExpandedVehicleTab(expandedVehicleTab === 'midia' ? null : 'midia')}
            className={`p-4 rounded-xl border transition-all duration-300 text-left flex flex-col justify-between hover:scale-[1.01] focus:outline-none ${
              expandedVehicleTab === 'midia'
                ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                : 'bg-slate-800/30 border-slate-800/60 hover:border-slate-700 text-slate-300'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Fotos & Vídeos (Vistoria)</span>
                <Camera className={`w-4 h-4 ${expandedVehicleTab === 'midia' ? 'text-rose-400' : 'text-slate-500'}`} />
              </div>
              <span className="text-2xl font-black block leading-none tracking-tight mb-2">
                {veiculos.filter(v => v.fotos_videos && v.fotos_videos.length > 0).length} Vistoriados
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 text-[9px] font-bold">
              <span className={`px-1.5 py-0.5 rounded ${mediaCriticalCount > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500'}`}>
                🔴 {mediaCriticalCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${mediaWarningCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
                🟡 {mediaWarningCount}
              </span>
              <span className={`px-1.5 py-0.5 rounded ${mediaAttentionCount > 0 ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
                🔵 {mediaAttentionCount}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                🟢 {mediaOkCount}
              </span>
            </div>
          </button>
        </div>

        {/* EXPANSION AREA: VEÍCULOS LIST */}
        {expandedVehicleTab && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6 pt-5 border-t border-slate-800/80"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 bg-slate-900 border border-slate-800/80 p-4 rounded-xl">
              <div>
                <h3 className="text-sm font-black text-slate-200 uppercase flex items-center gap-2">
                  <span className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
                  Lista de Carros de acordo com sua necessidade
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Filtro ativo: <span className="text-blue-400 font-extrabold capitalize">{expandedVehicleTab === 'midia' ? 'vistorias e fotos' : expandedVehicleTab}</span> • Ordenado por criticidade (diário/semanal/mensal)
                </p>
              </div>
              <button
                onClick={() => setExpandedVehicleTab(null)}
                className="text-xs font-black text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700/60 self-start sm:self-auto"
              >
                Fechar Detalhes ×
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-300 border-b border-slate-800 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-4">Veículo / Placa</th>
                    <th className="p-4">Situação Geral</th>
                    {expandedVehicleTab === 'documentacao' && (
                      <>
                        <th className="p-4">CRLV / Vencimento</th>
                        <th className="p-4">IPVA / Vencimento</th>
                        <th className="p-4">Situação Multas</th>
                      </>
                    )}
                    {expandedVehicleTab === 'seguro' && (
                      <>
                        <th className="p-4">Seguradora</th>
                        <th className="p-4">Apólice nº</th>
                        <th className="p-4">Fim Vigência</th>
                        <th className="p-4">Franquia</th>
                      </>
                    )}
                    {expandedVehicleTab === 'rastreador' && (
                      <>
                        <th className="p-4">Marca / Modelo</th>
                        <th className="p-4">Número IMEI</th>
                        <th className="p-4">Operadora</th>
                        <th className="p-4">Observação</th>
                      </>
                    )}
                    {expandedVehicleTab === 'midia' && (
                      <>
                        <th className="p-4">Total Mídias</th>
                        <th className="p-4">Última Vistoria</th>
                        <th className="p-4">Resultado</th>
                        <th className="p-4">Imagens</th>
                      </>
                    )}
                    <th className="p-4 text-right">Contrato / Alerta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60">
                  {getSortedVehicles(expandedVehicleTab).map(({ v, alert }) => {
                    const activeDriver = getActiveDriverForVehicle(v.placa);
                    return (
                      <tr key={v.placa} className="hover:bg-slate-900/30 text-slate-300 transition-colors">
                        {/* Veiculo / Placa */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-850/80 border border-slate-700/50 p-2 rounded-lg shrink-0">
                              <Car className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <div className="font-extrabold text-white text-sm flex items-center gap-1.5">
                                {v.modelo}
                                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono border border-slate-700/50">
                                  {v.placa}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {v.marca} • {v.ano_fab || v.ano}/{v.ano_mod || v.ano}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Situação Geral */}
                        <td className="p-4">
                          <span className={alert.badge}>
                            {alert.label}
                          </span>
                        </td>

                        {/* Documentacao Fields */}
                        {expandedVehicleTab === 'documentacao' && (
                          <>
                            <td className="p-4">
                              <div className="font-semibold text-white">
                                {v.crlv_vencimento ? v.crlv_vencimento.split('-').reverse().join('/') : '—'}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Exercício: {v.crlv_ano_exercicio || '—'}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="font-semibold text-white">
                                {v.ipva_vencimento ? v.ipva_vencimento.split('-').reverse().join('/') : '—'}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 text-amber-400">
                                Situação: {v.ipva_situacao || '—'}
                              </div>
                            </td>
                            <td className="p-4">
                              {v.multas_quantidade && v.multas_quantidade > 0 ? (
                                <div className="text-rose-400">
                                  <div className="font-semibold flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {v.multas_quantidade} Multas
                                  </div>
                                  <div className="text-[10px] mt-0.5">
                                    Total: {formatBRL(v.multas_valor_total || 0)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-emerald-400 font-semibold">Tudo em dia</span>
                              )}
                            </td>
                          </>
                        )}

                        {/* Seguro Fields */}
                        {expandedVehicleTab === 'seguro' && (
                          <>
                            <td className="p-4">
                              <div className="font-semibold text-white">
                                {v.seguro_seguradora || '—'}
                              </div>
                              {v.seguro_corretor_nome && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Corretor: {v.seguro_corretor_nome}
                                </div>
                              )}
                            </td>
                            <td className="p-4 font-mono text-slate-300">
                              {v.seguro_apolice_numero || '—'}
                            </td>
                            <td className="p-4">
                              <div className="font-semibold text-white">
                                {v.seguro_vencimento ? v.seguro_vencimento.split('-').reverse().join('/') : (v.seguro_vigencia_fim ? v.seguro_vigencia_fim.split('-').reverse().join('/') : '—')}
                              </div>
                            </td>
                            <td className="p-4 text-slate-200">
                              {v.seguro_valor_franquia ? formatBRL(v.seguro_valor_franquia) : '—'}
                            </td>
                          </>
                        )}

                        {/* Rastreador Fields */}
                        {expandedVehicleTab === 'rastreador' && (
                          <>
                            <td className="p-4">
                              <div className="font-semibold text-white">
                                {v.rastreador_marca || '—'}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Modelo: {v.rastreador_modelo || '—'}
                              </div>
                            </td>
                            <td className="p-4 font-mono text-slate-300">
                              {v.rastreador_imei || '—'}
                            </td>
                            <td className="p-4 text-white">
                              {v.rastreador_operadora || '—'}
                            </td>
                            <td className="p-4 text-slate-400 max-w-[150px] truncate" title={v.rastreador_obs}>
                              {v.rastreador_obs || '—'}
                            </td>
                          </>
                        )}

                        {/* Mídias Fields */}
                        {expandedVehicleTab === 'midia' && (
                          <>
                            <td className="p-4">
                              <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                {v.fotos_videos ? v.fotos_videos.length : 0} mídias
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="font-semibold text-white">
                                {v.vistoria_data_ultima ? v.vistoria_data_ultima.split('-').reverse().join('/') : '—'}
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                v.vistoria_resultado === 'Aprovado' 
                                  ? 'bg-emerald-500/20 text-emerald-300' 
                                  : v.vistoria_resultado === 'Reprovado'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {v.vistoria_resultado || 'Não Informado'}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-1 overflow-x-auto max-w-[120px]">
                                {v.fotos_videos && v.fotos_videos.length > 0 ? (
                                  v.fotos_videos.slice(0, 3).map((item, idx) => (
                                    <div key={item.id || idx} className="w-8 h-8 rounded border border-slate-800 overflow-hidden bg-slate-900 shrink-0 relative group">
                                      <img src={item.url} alt={item.descricao || 'vistoria'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic">Nenhuma</span>
                                )}
                              </div>
                            </td>
                          </>
                        )}

                        {/* Action / Aluguel status */}
                        <td className="p-4 text-right">
                          {activeDriver ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px] font-bold">
                                Rent: <span className="text-blue-400">{activeDriver.nome.split(' ')[0]}</span>
                              </span>
                              <button
                                onClick={() => {
                                  setSelectedDriverCpf(activeDriver.cpf);
                                  setSelectedDocumento(
                                    expandedVehicleTab === 'documentacao' 
                                      ? 'CRLV do Veículo' 
                                      : expandedVehicleTab === 'seguro' 
                                        ? 'Apólice de Seguro' 
                                        : expandedVehicleTab === 'rastreador' 
                                          ? 'Status de Instalação do Rastreador' 
                                          : 'Mídias de Vistoria do Veículo'
                                  );
                                  // Scroll dynamically to driver notifications
                                  const targetElem = document.getElementById('notificacoes-motorista');
                                  if (targetElem) {
                                    targetElem.scrollIntoView({ behavior: 'smooth' });
                                  }
                                }}
                                className="flex items-center gap-1 text-[9px] bg-blue-600 hover:bg-blue-500 text-white font-black px-2 py-1 rounded transition-all shadow-sm"
                              >
                                <MessageSquare className="w-3 h-3" /> Notificar
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] bg-slate-850 text-slate-400 px-2 py-0.5 rounded border border-slate-700/60 font-semibold font-mono">
                              Disponível
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {/* Grid de Estatísticas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-4 border-l-4 border-l-blue-600">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl font-bold">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {totalVeiculos}
            </span>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
              Total de Veículos
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-4 border-l-4 border-l-emerald-600">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-2xl font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {motoristasAtivos}
            </span>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
              Motoristas Ativos
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-2xl font-bold">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {formatBRL(receitaDoMes)}
            </span>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
              Receita do Mês
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex items-center gap-4 border-l-4 border-l-rose-600">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-2xl font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight block leading-none mb-1">
              {motoristasInadimplentes}
            </span>
            <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider block">
              Inadimplentes
            </span>
          </div>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-100 p-4 text-center shadow-xs">
          <span className="text-slate-400 text-xs block mb-1">Taxa de Ocupação</span>
          <span className="text-xl font-bold text-blue-600">{taxaOcupacao}%</span>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-4 text-center shadow-xs">
          <span className="text-slate-400 text-xs block mb-1">Ticket Médio/Semana</span>
          <span className="text-xl font-bold text-slate-800">{formatBRL(ticketMedio)}</span>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-4 text-center shadow-xs">
          <span className="text-slate-400 text-xs block mb-1">Manutenções Pendentes</span>
          <span className="text-xl font-bold text-amber-600">{manutencoesPendentes}</span>
        </div>
        <div className="bg-white rounded-lg border border-slate-100 p-4 text-center shadow-xs">
          <span className="text-slate-400 text-xs block mb-1">Inadimplência Total</span>
          <span className="text-xl font-bold text-rose-600">{formatBRL(totalAtrasado)}</span>
        </div>
      </div>

      {/* Seção de Gráficos e Distribuição */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Barras Customizado */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" /> Receita Mensal (2026)
            </h3>
            <p className="text-xs text-slate-400">Total acumulado mês a mês (em R$)</p>
          </div>
          <div className="h-44 flex items-end gap-3 pt-4">
            {meses.map(mes => {
              const pct = maxMensal > 0 ? (mes.valor / maxMensal) * 100 : 0;
              return (
                <div key={mes.nome} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="relative w-full flex justify-center">
                    <span className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow transition-opacity font-semibold z-10 whitespace-nowrap">
                      {formatBRL(mes.valor)}
                    </span>
                  </div>
                  <div
                    style={{ height: `${pct * 0.8}%` }}
                    className="w-full bg-blue-600/85 hover:bg-blue-600 rounded-t-md transition-all duration-300 min-h-[5px] shadow-sm shadow-blue-500/10"
                  />
                  <span className="text-[10px] font-bold text-slate-400">{mes.nome}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status da Frota - Visualização de Anel */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="mb-4">
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-600" /> Status da Frota
            </h3>
            <p className="text-xs text-slate-400">Divisão operacional dos {totalVeiculos} veículos</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
            <div className="relative flex items-center justify-center w-28 h-28">
              {/* SVG de Anel Circular Progress */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-slate-100"
                  strokeWidth="3.2"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* Alugados ring segment */}
                {totalVeiculos > 0 && (
                  <path
                    className="text-blue-500"
                    strokeDasharray={`${(alugados / totalVeiculos) * 100}, 100`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
                {/* Disponíveis ring segment, shifted */}
                {totalVeiculos > 0 && (
                  <path
                    className="text-emerald-500"
                    strokeDasharray={`${(disponiveis / totalVeiculos) * 100}, 100`}
                    strokeDashoffset={`-${(alugados / totalVeiculos) * 100}`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
                {/* Em Manutenção segment */}
                {totalVeiculos > 0 && (
                  <path
                    className="text-amber-500"
                    strokeDasharray={`${(emManutencao / totalVeiculos) * 100}, 100`}
                    strokeDashoffset={`-${((alugados + disponiveis) / totalVeiculos) * 100}`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
                {/* Fora da frota segment */}
                {totalVeiculos > 0 && (
                  <path
                    className="text-rose-500"
                    strokeDasharray={`${(foraDaFrota / totalVeiculos) * 100}, 100`}
                    strokeDashoffset={`-${((alugados + disponiveis + emManutencao) / totalVeiculos) * 100}`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                )}
              </svg>
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-slate-800">{totalVeiculos}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Frota</span>
              </div>
            </div>

            <div className="space-y-2.5 w-full sm:w-auto">
              <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs text-slate-600 font-medium">Alugados:</span>
                <span className="text-xs font-bold text-slate-800">{alugados} ({totalVeiculos > 0 ? Math.round((alugados/totalVeiculos)*100) : 0}%)</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-slate-600 font-medium">Disponíveis:</span>
                <span className="text-xs font-bold text-slate-800">{disponiveis} ({totalVeiculos > 0 ? Math.round((disponiveis/totalVeiculos)*100) : 0}%)</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs text-slate-600 font-medium">Manutenção:</span>
                <span className="text-xs font-bold text-slate-800">{emManutencao} ({totalVeiculos > 0 ? Math.round((emManutencao/totalVeiculos)*100) : 0}%)</span>
              </div>
              <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="text-xs text-slate-600 font-medium">Fora da Frota:</span>
                <span className="text-xs font-bold text-slate-800">{foraDaFrota} ({totalVeiculos > 0 ? Math.round((foraDaFrota/totalVeiculos)*100) : 0}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO DETALHADA: CNH E FINANCEIRO (PAGAMENTOS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Painel de Controle: CNH dos Motoristas */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" /> Controle de CNH dos Motoristas
              </h3>
              <p className="text-xs text-slate-400">Status de validade da habilitação dos motoristas cadastrados</p>
            </div>
            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
              Regras de Alerta
            </span>
          </div>

          {/* Legenda das Regras de Alerta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-[10px]">
            <div className="flex items-center gap-1.5 font-bold text-rose-700">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>≤ 5d ou Vencido (Vermelho)</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>≤ 10d (Amarelo)</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-blue-700">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>≤ 15d (Azul)</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>≤ 30d (Verde)</span>
            </div>
          </div>

          {/* Lista de Motoristas Expiring/Expired */}
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {(() => {
              const list = motoristas.map(m => {
                const alertInfo = getCnhAlert(m.cnh_venc);
                return { m, alertInfo };
              }).filter(item => item.alertInfo.alertColor !== 'none' || item.alertInfo.isExpired);

              if (list.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    🎉 Nenhuma CNH vencendo nos próximos 30 dias! Todos os motoristas estão regulares.
                  </div>
                );
              }

              return list.map(({ m, alertInfo }) => {
                let iconStr = '🟢';
                if (alertInfo.alertColor === 'red') iconStr = '🔴';
                else if (alertInfo.alertColor === 'yellow') iconStr = '🟡';
                else if (alertInfo.alertColor === 'blue') iconStr = '🔵';

                const defaultText = `Olá ${m.nome}, notamos que sua CNH (Cat ${m.cat}) está ${alertInfo.label.toLowerCase()} (Vencimento: ${m.cnh_venc.split('-').reverse().join('/')}). Favor providenciar a renovação de sua CNH para continuar operando sem restrições.`;

                return (
                  <div key={m.cpf} className="p-3 rounded-lg border border-slate-100 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 truncate">{m.nome}</span>
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-extrabold px-1 rounded">
                          Cat {m.cat}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span>CPF: {m.cpf}</span>
                        <span>•</span>
                        <span>Vence em: <b className="text-slate-600 font-bold">{m.cnh_venc.split('-').reverse().join('/')}</b></span>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className={alertInfo.badgeClass}>
                          {iconStr} {alertInfo.label}
                        </span>
                      </div>
                    </div>

                    <a
                      href={`https://api.whatsapp.com/send?phone=55${(m.tel_contato || m.tel).replace(/\D/g, '')}&text=${encodeURIComponent(defaultText)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold tracking-tight flex items-center gap-1 uppercase transition-all"
                      title="Cobrar regularização via WhatsApp"
                    >
                      💬 Notificar
                    </a>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Painel de Controle: Pagamentos e Cobrança */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" /> Cobranças & Fluxo de Pagamento
              </h3>
              <p className="text-xs text-slate-400">Resumo financeiro das semanas ativas e status de adimplência</p>
            </div>
            <button
              onClick={() => onNavigate('pagamentos')}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold"
            >
              Financeiro →
            </button>
          </div>

          {/* Gráfico Linear / Progresso de Pagamentos */}
          <div className="space-y-3.5 mb-5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            {(() => {
              const totalPagamentosValor = pagamentos.reduce((sum, p) => sum + p.valor, 0);
              const pagosValor = pagamentos.filter(p => p.status === 'Pago').reduce((sum, p) => sum + p.valor, 0);
              const atrasadosValor = pagamentos.filter(p => p.status === 'Atrasado').reduce((sum, p) => sum + p.valor, 0);
              const pendentesValor = pagamentos.filter(p => p.status === 'Pendente').reduce((sum, p) => sum + p.valor, 0);

              const pagosPct = totalPagamentosValor > 0 ? Math.round((pagosValor / totalPagamentosValor) * 100) : 0;
              const atrasadosPct = totalPagamentosValor > 0 ? Math.round((atrasadosValor / totalPagamentosValor) * 100) : 0;
              const pendentesPct = totalPagamentosValor > 0 ? Math.round((pendentesValor / totalPagamentosValor) * 100) : 0;

              return (
                <>
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Recebido (Pago):</span>
                      <span>{formatBRL(pagosValor)} <span className="text-slate-400 text-[10px] font-normal">({pagosPct}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${pagosPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Pendente de Liquidação:</span>
                      <span>{formatBRL(pendentesValor)} <span className="text-slate-400 text-[10px] font-normal">({pendentesPct}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${pendentesPct}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> Atraso (Inadimplente):</span>
                      <span>{formatBRL(atrasadosValor)} <span className="text-slate-400 text-[10px] font-normal">({atrasadosPct}%)</span></span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full transition-all duration-500" style={{ width: `${atrasadosPct}%` }} />
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Motoristas em Atraso */}
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Devedores Ativos</h4>
          <div className="space-y-3 max-h-[175px] overflow-y-auto pr-1">
            {(() => {
              const atrasadosList = pagamentos.filter(p => p.status === 'Atrasado');
              if (atrasadosList.length === 0) {
                return (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    ☀️ Tudo zerado! Nenhum motorista com pagamentos em atraso.
                  </div>
                );
              }

              return atrasadosList.map(p => {
                const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
                const vencFormat = p.vencimento.split('-').reverse().join('/');
                const baseVal = p.saldoDevedor !== undefined && p.saldoDevedor > 0 ? p.saldoDevedor : (p.valorOriginal || p.valor);
                const today = new Date();
                today.setHours(12, 0, 0, 0);
                const venc = new Date(p.vencimento + 'T12:00:00');
                const timeDiff = today.getTime() - venc.getTime();
                const diasAtraso = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
                const multaRate = p.multaMoraRate ?? 2.0;
                const jurosRate = p.jurosDiarioRate ?? 0.033;
                const multaValue = baseVal * (multaRate / 100);
                const jurosValue = baseVal * (jurosRate / 100) * diasAtraso;
                const totalAtualizado = baseVal + multaValue + jurosValue;

                const message = `Olá *${mot?.nome || ''}*,\n\nIdentificamos um atraso na parcela do período *${p.periodo}* (vencida em *${vencFormat}*).\n\n• Valor base: *${formatBRL(baseVal)}*\n• Dias em atraso: *${diasAtraso} dia(s)*\n• Multa (${multaRate}%): *${formatBRL(multaValue)}*\n• Juros de mora (${jurosRate}%/dia): *${formatBRL(jurosValue)}*\n👉 *Valor Total Atualizado: ${formatBRL(totalAtualizado)}*\n\nPor favor, envie o comprovante de PIX para darmos baixa em seu cadastro. Obrigado!`;

                return (
                  <div key={p.id} className="p-3 rounded-lg border border-rose-100 bg-rose-50/10 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-800 truncate">{mot?.nome || 'Motorista'}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                        <span>Ref: <b className="text-slate-700">{p.periodo}</b></span>
                        <span>Venceu: <b className="text-slate-700">{vencFormat}</b> ({diasAtraso}d)</span>
                      </div>
                      <div className="mt-1 text-xs font-black text-rose-700 flex items-center gap-1.5">
                        <span>{formatBRL(totalAtualizado)}</span>
                        {multaValue + jurosValue > 0 && (
                          <span className="text-[9px] font-semibold text-rose-500 bg-rose-100/80 px-1 py-0.2 rounded">
                            +{formatBRL(multaValue + jurosValue)} juros/multa
                          </span>
                        )}
                      </div>
                    </div>

                    <a
                      href={`https://api.whatsapp.com/send?phone=55${(mot?.tel_contato || mot?.tel || '').replace(/\D/g, '')}&text=${encodeURIComponent(message)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold tracking-tight flex items-center gap-1 uppercase transition-all"
                      title="Enviar cobrança via WhatsApp"
                    >
                      💬 Cobrar
                    </a>
                  </div>
                );
              });
            })()}
          </div>
        </div>

      </div>

      {/* BANCO DE DADOS DE MENSAGENS PRONTAS (CRIAR, COPIAR & ENVIAR) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" /> Banco de Mensagens Prontas (Copiar & Enviar)
            </h3>
            <p className="text-xs text-slate-400">Modelos automáticos para CNH, atraso de pagamentos e documentos pendentes</p>
          </div>
          
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setIsEditingTemplates(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                !isEditingTemplates 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              💬 Enviar Notificação
            </button>
            <button
              onClick={() => {
                setIsEditingTemplates(true);
                // Select first template for editing if none is set
                if (!editingTemplateId && templates.length > 0) {
                  const first = templates[0];
                  setEditingTemplateId(first.id);
                  setEditingTemplateTitle(first.titulo);
                  setEditingTemplateText(first.texto);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                isEditingTemplates 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              ⚙️ Configurar Modelos
            </button>
          </div>
        </div>

        {!isEditingTemplates ? (
          /* MODO DE ENVIO DE MENSAGENS */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* CONFIGURAÇÃO DA MENSAGEM (COLUNA ESQUERDA) */}
            <div className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-black text-slate-400 tracking-wider mb-1.5">
                  1. Selecione o Motorista
                </label>
                {motoristas.length > 0 ? (
                  <select
                    value={selectedDriverCpf}
                    onChange={(e) => {
                      setSelectedDriverCpf(e.target.value);
                      const mCpf = e.target.value;
                      const pays = pagamentos.filter(p => p.motoristaCpf === mCpf && p.status === 'Atrasado');
                      setSelectedPagamentoId(pays[0]?.id || '');
                    }}
                    className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg p-2.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                  >
                    {motoristas.map(m => {
                      const paysCount = pagamentos.filter(p => p.motoristaCpf === m.cpf && p.status === 'Atrasado').length;
                      const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
                      let suffix = '';
                      if (paysCount > 0) suffix += ` • 💰 ${paysCount} atrasado(s)`;
                      if (alertInfo.isExpired || alertInfo.alertColor === 'red') suffix += ' • 🚨 CNH';
                      
                      return (
                        <option key={m.cpf} value={m.cpf}>
                          {m.nome} ({m.status}){suffix}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 italic">Nenhum motorista cadastrado.</span>
                )}
              </div>

              <div>
                <label className="block text-[11px] uppercase font-black text-slate-400 tracking-wider mb-1.5">
                  2. Escolha o Modelo de Mensagem
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTemplateId(t.id)}
                      className={`text-left p-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-between gap-2 ${
                        selectedTemplateId === t.id 
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-emerald-500/20' 
                          : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className="truncate">{t.titulo}</span>
                      <span className="text-[9px] uppercase font-black bg-slate-200/60 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                        {t.tipo === 'cnh' ? '🪪 CNH' : t.tipo === 'pagamento' ? '💰 Cobrança' : t.tipo === 'documento' ? '📄 Doc' : '📝 Outro'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* CAMPOS ADICIONAIS CONFORME TIPO DE TEMPLATE */}
              {activeTemplate && (
                <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 space-y-3">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                    Campos Dinâmicos do Modelo
                  </span>

                  {activeTemplate.tipo === 'pagamento' && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Selecione a Cobrança / Referência:
                      </label>
                      {driverPayments.length > 0 ? (
                        <select
                          value={selectedPagamentoId}
                          onChange={(e) => setSelectedPagamentoId(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded-md p-1.5 font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Parcela Padrão Contrato --</option>
                          {driverPayments.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.periodo} • {formatBRL(p.valor)} ({p.status})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-[10px] text-slate-500 italic bg-amber-50 border border-amber-100 p-2 rounded text-amber-800">
                          Nenhum pagamento registrado para o motorista. Usando valor padrão.
                        </div>
                      )}
                    </div>
                  )}

                  {activeTemplate.tipo === 'documento' && (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        Selecione o Documento Pendente:
                      </label>
                      <select
                        value={selectedDocumento}
                        onChange={(e) => setSelectedDocumento(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-md p-1.5 font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="CRLV do Veículo">CRLV do Veículo</option>
                        <option value="Comprovante de Residência">Comprovante de Residência</option>
                        <option value="Atestado de Antecedentes Criminais">Atestado de Antecedentes Criminais</option>
                        <option value="Foto de Perfil (Atualizada)">Foto de Perfil (Atualizada)</option>
                        <option value="Foto Nítida da CNH">Foto Nítida da CNH</option>
                        <option value="Outro">Outro documento (digitar...)</option>
                      </select>

                      {selectedDocumento === 'Outro' && (
                        <div>
                          <input
                            type="text"
                            placeholder="Ex: Contrato assinado, Laudo de vistoria"
                            value={customDocumento}
                            onChange={(e) => setCustomDocumento(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded-md p-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[9px] text-slate-400 leading-normal">
                    💡 Os dados do motorista e valores são substituídos em tempo real nas tags do modelo de mensagem.
                  </div>
                </div>
              )}
            </div>

            {/* PREVISÃO E ENVIO (COLUNA DIREITA) */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
              <div className="flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] uppercase font-black text-slate-400 tracking-wider">
                    3. Revise e Envie (Mensagem Final)
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    {editedMessageText.length} caracteres
                  </span>
                </div>
                <textarea
                  value={editedMessageText}
                  onChange={(e) => setEditedMessageText(e.target.value)}
                  rows={9}
                  className="w-full flex-1 text-xs font-mono bg-slate-900 text-emerald-400 p-4 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-none shadow-inner animate-fade-in"
                  placeholder="Selecione um motorista e modelo para compilar a mensagem..."
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  onClick={handleCopy}
                  disabled={!editedMessageText}
                  className={`flex-1 font-bold text-xs py-2.5 rounded-lg border flex items-center justify-center gap-1.5 transition-all ${
                    copiedStatus 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/10' 
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {copiedStatus ? (
                    <>
                      <Check className="w-4 h-4" /> Copiado com sucesso!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-400" /> Copiar Mensagem (Área de Trab.)
                    </>
                  )}
                </button>

                <button
                  onClick={handleSendWhatsapp}
                  disabled={!editedMessageText || !activeDriver}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs py-2.5 rounded-lg flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/15 border border-emerald-700/10 transition-colors"
                >
                  <Send className="w-4 h-4" /> Enviar para WhatsApp do Motorista
                </button>
              </div>

              {activeDriver && (
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-bold">
                  <span>Destinatário: <b className="text-slate-700">{activeDriver.nome}</b></span>
                  <span className="text-slate-400 font-medium">
                    Contato do Motorista: <b className="text-red-600">{activeDriver.tel || 'Não cadastrado'}</b>
                    <span className="ml-1 text-red-600 font-extrabold">(⚠️ Alertas e cobranças vão somente para o motorista)</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* MODO DE CONFIGURAÇÃO DE MODELOS (CRIAR/EDITAR BANCO DE DADOS) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LISTA DE MODELOS EXISTENTES (COLUNA ESQUERDA) */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[11px] uppercase font-black text-slate-400 tracking-wider">
                  Modelos Cadastrados
                </span>
                <button
                  onClick={handleAddNewTemplate}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-2 py-1 rounded flex items-center gap-1 uppercase tracking-tight transition-colors shadow-xs"
                >
                  <Plus className="w-3 h-3" /> Novo
                </button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {templates.map(t => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setEditingTemplateId(t.id);
                      setEditingTemplateTitle(t.titulo);
                      setEditingTemplateText(t.texto);
                    }}
                    className={`p-3 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      editingTemplateId === t.id 
                        ? 'bg-blue-50/50 border-blue-300 text-blue-900 ring-2 ring-blue-500/15' 
                        : 'bg-slate-50/40 border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="truncate">{t.titulo}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] uppercase font-black bg-slate-200/50 text-slate-500 px-1 py-0.2 rounded">
                        {t.tipo}
                      </span>
                      <button
                        onClick={(e) => handleDeleteTemplate(t.id, e)}
                        className="p-1 hover:bg-rose-100 text-rose-500 rounded hover:text-rose-700 transition-colors"
                        title="Deletar este modelo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={handleResetTemplates}
                  className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-500 hover:text-slate-700 text-[10px] font-bold py-1.5 rounded transition-all uppercase tracking-tight"
                >
                  Restaurar Modelos Originais
                </button>
              </div>
            </div>

            {/* FORMULÁRIO DE EDIÇÃO DO MODELO SELECIONADO (COLUNA DIREITA) */}
            <div className="lg:col-span-8 space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-150">
              {editingTemplateId ? (
                (() => {
                  const currentT = templates.find(t => t.id === editingTemplateId);
                  if (!currentT) return <div className="text-xs text-slate-400 italic">Selecione um modelo à esquerda para editar.</div>;

                  return (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <span className="text-xs font-extrabold text-slate-700 uppercase tracking-tight flex items-center gap-1">
                          <Edit3 className="w-3.5 h-3.5 text-blue-600" /> Editando: {editingTemplateTitle}
                        </span>
                        <span className="text-[9px] uppercase font-black bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                          ID: {editingTemplateId}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Título do Modelo:
                          </label>
                          <input
                            type="text"
                            value={editingTemplateTitle}
                            onChange={(e) => setEditingTemplateTitle(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded-md p-2 font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Ex: Aviso de Cobrança Semanal"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            Tipo de Mensagem:
                          </label>
                          <select
                            value={currentT.tipo}
                            onChange={(e) => {
                              const updated = templates.map(t => t.id === editingTemplateId ? { ...t, tipo: e.target.value as any } : t);
                              handleSaveTemplates(updated);
                            }}
                            className="w-full text-xs bg-white border border-slate-200 rounded-md p-2 font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="cnh">🪪 CNH</option>
                            <option value="pagamento">💰 Pagamento / Cobrança</option>
                            <option value="documento">📄 Documento Faltante</option>
                            <option value="outro">📝 Outro Assunto</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[10px] font-bold text-slate-500">
                            Texto do Modelo (Suporta quebra de linha e negrito no WhatsApp usando *texto*):
                          </label>
                          <span className="text-[9px] text-slate-400">Variáveis válidas estão abaixo</span>
                        </div>
                        <textarea
                          value={editingTemplateText}
                          onChange={(e) => setEditingTemplateText(e.target.value)}
                          rows={8}
                          className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg p-3 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed resize-none"
                          placeholder="Olá *{nome}*,\n\nConstatamos pendências...\n\nAtenciosamente..."
                        />
                      </div>

                      {/* GUIA DE COPINHA DE TAGS */}
                      <div className="bg-white p-3 rounded-lg border border-slate-150">
                        <span className="text-[10px] uppercase font-black text-slate-400 block tracking-wider mb-2">
                          Guia de Tags Disponíveis para Autocompletar:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{nome}`}</span>
                            <span className="text-slate-400 truncate">Nome do Motorista</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{cat}`}</span>
                            <span className="text-slate-400 truncate">Categoria CNH</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{cnh_venc}`}</span>
                            <span className="text-slate-400 truncate">Vencimento CNH</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{label_cnh}`}</span>
                            <span className="text-slate-400 truncate">Status CNH descritivo</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{periodo}`}</span>
                            <span className="text-slate-400 truncate">Período de referência</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{valor}`}</span>
                            <span className="text-slate-400 truncate">Valor da Cobrança</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{vencimento_pagamento}`}</span>
                            <span className="text-slate-400 truncate">Venc. Cobrança</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{documento}`}</span>
                            <span className="text-slate-400 truncate">Documento faltante</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="bg-slate-100 text-slate-600 font-mono px-1 rounded font-bold shrink-0">{`{data_hoje}`}</span>
                            <span className="text-slate-400 truncate">Data de hoje</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5">
                        <button
                          onClick={() => {
                            const updated = templates.map(t => 
                              t.id === editingTemplateId 
                                ? { ...t, titulo: editingTemplateTitle, texto: editingTemplateText } 
                                : t
                            );
                            handleSaveTemplates(updated);
                            alert('Modelo atualizado e salvo com sucesso no banco!');
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-4 py-2 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Save className="w-4 h-4" /> Salvar Modelo no Banco
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-16 text-slate-400 text-xs italic">
                  Selecione um modelo na lista à esquerda ou clique em "+ Novo" para editar ou cadastrar no banco.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Alertas Recentes */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" /> Alertas Operacionais
          </h3>
          <span className="bg-indigo-50 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-full">
            {alertas.length} ativos
          </span>
        </div>
        <div className="p-4 space-y-3">
          {alertas.map(alerta => {
            let alertClass = '';
            if (alerta.tipo === 'danger') alertClass = 'bg-rose-50/80 text-rose-800 border-rose-100';
            else if (alerta.tipo === 'warning') alertClass = 'bg-amber-50/80 text-amber-800 border-amber-100';
            else if (alerta.tipo === 'info') alertClass = 'bg-blue-50/80 text-blue-800 border-blue-100';
            else alertClass = 'bg-emerald-50/80 text-emerald-800 border-emerald-100';

            return (
              <div key={alerta.id} className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 shadow-2xs ${alertClass}`}>
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5">
                    {alerta.tipo === 'danger' ? '🔴' : alerta.tipo === 'warning' ? '🟡' : alerta.tipo === 'info' ? '🔵' : '🟢'}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold tracking-tight">{alerta.msg}</h4>
                    <p className="text-[11px] opacity-80 mt-0.5">{alerta.desc}</p>
                  </div>
                </div>
                {alerta.whatsapp && (
                  <a
                    href={`https://api.whatsapp.com/send?phone=55${alerta.whatsapp.replace(/\D/g, '')}&text=${encodeURIComponent(alerta.whatsappText || '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] px-2.5 py-1.5 rounded shadow-xs uppercase tracking-wider transition-colors self-center"
                  >
                    💬 Notificar
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contratos de Aluguel x ERP Integrado */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Contratos de Aluguel & Auditoria ERP Integrado
            </h3>
            <p className="text-xs text-slate-400">Varredura em tempo real de conformidade e pendências financeiras/cadastrais de cada locação ativa</p>
          </div>
          <span className="bg-blue-50 text-blue-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full self-start sm:self-center">
            {contratos.filter(c => c.status !== 'Finalizado').length} contratos ativos
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/30 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Contrato ID</th>
                <th className="px-5 py-3.5">Motorista</th>
                <th className="px-5 py-3.5">Veículo</th>
                <th className="px-5 py-3.5">Vigência & Valor</th>
                <th className="px-5 py-3.5">Auditoria ERP Integrado</th>
                <th className="px-5 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                const activeConts = contratos.filter(c => c.status !== 'Finalizado');
                if (activeConts.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400 text-xs italic">
                        Não existem contratos de aluguel ativos no momento para auditoria.
                      </td>
                    </tr>
                  );
                }

                return activeConts.map(c => {
                  const checks = getContractERPChecks(c);
                  const dtInicio = c.inicio.split('-').reverse().join('/');
                  const dtFim = c.fim ? c.fim.split('-').reverse().join('/') : 'Indeterminado';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* ID e Status */}
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{c.id}</div>
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded mt-1 inline-block ${
                          c.status === 'Ativo' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                        }`}>
                          {c.status}
                        </span>
                      </td>

                      {/* Motorista */}
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{checks.driverName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{c.motoristaCpf}</div>
                      </td>

                      {/* Veículo */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-700">{checks.vehicleModel}</div>
                        <div className="text-[11px] text-slate-400 font-mono uppercase bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                          {c.veiculoPlaca}
                        </div>
                      </td>

                      {/* Vigência & Valor */}
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        <div className="font-medium">{dtInicio} a {dtFim}</div>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-850">{formatBRL(c.valor)}</span>
                          <span className="text-[9px] uppercase bg-slate-100 px-1 rounded font-bold">{c.frequencia || 'Semanal'}</span>
                          {c.fim && (
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                checks.renewalColor === 'red'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : checks.renewalColor === 'yellow'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {checks.renewalMessage}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Auditoria ERP */}
                      <td className="px-5 py-3.5">
                        {checks.allOk ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50/80 border border-emerald-200/50 px-2.5 py-1 rounded-lg w-fit text-xs font-semibold shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>100% Regularizado no ERP</span>
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-w-xs md:max-w-md">
                            {/* Contract Renewal Issues */}
                            {checks.contractIssues.map((issue, idx) => (
                              <div
                                key={`c-${idx}`}
                                className={`flex items-start gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                                  checks.renewalColor === 'red'
                                    ? 'text-rose-800 bg-rose-50/70 border-rose-200/50'
                                    : checks.renewalColor === 'yellow'
                                    ? 'text-amber-800 bg-amber-50/70 border-amber-200/50'
                                    : 'text-slate-700 bg-slate-50 border-slate-200'
                                }`}
                              >
                                <span className="mt-0.5 shrink-0">📝</span>
                                <span>{issue}</span>
                              </div>
                            ))}
                            {/* Driver Issues */}
                            {checks.driverIssues.map((issue, idx) => (
                              <div key={`d-${idx}`} className="flex items-start gap-1 text-[11px] font-bold text-amber-800 bg-amber-50/60 border border-amber-200/40 px-2 py-0.5 rounded-md">
                                <span className="text-amber-500 mt-0.5 shrink-0">👤</span>
                                <span>{issue}</span>
                              </div>
                            ))}
                            {/* Vehicle Issues */}
                            {checks.vehicleIssues.map((issue, idx) => (
                              <div key={`v-${idx}`} className="flex items-start gap-1 text-[11px] font-bold text-rose-800 bg-rose-50/60 border border-rose-200/40 px-2 py-0.5 rounded-md">
                                <span className="text-rose-500 mt-0.5 shrink-0">🚗</span>
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Ação */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => onNavigate('contratos')}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-bold"
                        >
                          Gerenciar Contrato
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Últimas Movimentações */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-600" /> Últimas Movimentações Financeiras
          </h3>
          <button
            onClick={() => onNavigate('pagamentos')}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5"
          >
            Ver tudo <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Período</th>
                <th className="px-5 py-3.5">Motorista</th>
                <th className="px-5 py-3.5">Valor</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ultimasMovimentacoes.map(pag => {
                const mot = motoristas.find(m => m.cpf === pag.motoristaCpf);
                const vencFormat = pag.vencimento.split('-').reverse().join('/');
                
                return (
                  <tr key={pag.id} className="hover:bg-slate-50/60 transition-colors text-sm">
                    <td className="px-5 py-3.5 font-semibold text-slate-700">{pag.periodo}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-800">{mot?.nome || 'Desconhecido'}</div>
                      <div className="text-[11px] text-slate-400">{pag.motoristaCpf}</div>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-800">{formatBRL(pag.valor)}</td>
                    <td className="px-5 py-3.5 text-slate-500">{vencFormat}</td>
                    <td className="px-5 py-3.5">
                      {pag.status === 'Pago' ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                          Pago
                        </span>
                      ) : pag.status === 'Atrasado' ? (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                          Atrasado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200/60 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {pag.status !== 'Pago' ? (
                        <button
                          onClick={() => onNavigate(pag.isDespesa ? 'pagamentos' : 'recebimentos')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-all shadow-xs"
                          title={pag.isDespesa ? 'Ir para Contas a Pagar para dar baixa' : 'Ir para Contas a Receber para dar baixa'}
                        >
                          Ir p/ {pag.isDespesa ? 'Contas a Pagar' : 'Contas a Receber'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Liquidado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIGURAÇÃO DE CORES E REGRAS DE ALERTA DO ERP */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" /> Configuração de Cores e Regras de Alerta do Sistema
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Personalize a quantidade de dias para cada regra de cor. As cores refletem em todo o ERP (Documentos, CNH e Dashboard).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Vermelho */}
          <div className="border border-slate-200 rounded-xl p-4 bg-rose-50/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 bg-red-600 rounded-full inline-block" />
              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">Vermelho (Crítico)</span>
            </div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
              Dias até o vencimento:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={colorRules?.redDays ?? 5}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  if (onUpdateColorRules && colorRules) {
                    onUpdateColorRules({ ...colorRules, redDays: val });
                  }
                }}
                className="w-full bg-white text-xs font-bold p-2 border border-slate-200 rounded-lg text-slate-850 text-center focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <span className="text-xs text-slate-500 shrink-0 font-medium">dias</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1.5 font-medium">
              Vencidos ou a vencer em menos de {colorRules?.redDays ?? 5} dias.
            </span>
          </div>

          {/* Amarelo */}
          <div className="border border-slate-200 rounded-xl p-4 bg-amber-50/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 bg-amber-500 rounded-full inline-block" />
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Amarelo (Atenção)</span>
            </div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
              Dias até o vencimento:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={colorRules?.yellowDays ?? 15}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  if (onUpdateColorRules && colorRules) {
                    onUpdateColorRules({ ...colorRules, yellowDays: val });
                  }
                }}
                className="w-full bg-white text-xs font-bold p-2 border border-slate-200 rounded-lg text-slate-850 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-xs text-slate-500 shrink-0 font-medium">dias</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1.5 font-medium">
              A vencer entre {colorRules?.redDays ? colorRules.redDays + 1 : 6} e {colorRules?.yellowDays ?? 15} dias.
            </span>
          </div>

          {/* Azul */}
          <div className="border border-slate-200 rounded-xl p-4 bg-blue-50/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full inline-block" />
              <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Azul (Informativo)</span>
            </div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
              Dias até o vencimento:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={colorRules?.blueDays ?? 29}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  if (onUpdateColorRules && colorRules) {
                    onUpdateColorRules({ ...colorRules, blueDays: val });
                  }
                }}
                className="w-full bg-white text-xs font-bold p-2 border border-slate-200 rounded-lg text-slate-850 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-500 shrink-0 font-medium">dias</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1.5 font-medium">
              A vencer entre {colorRules?.yellowDays ? colorRules.yellowDays + 1 : 16} e {colorRules?.blueDays ?? 29} dias.
            </span>
          </div>

          {/* Verde */}
          <div className="border border-slate-200 rounded-xl p-4 bg-emerald-50/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 bg-emerald-500 rounded-full inline-block" />
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Verde (Regular)</span>
            </div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
              Limite Mínimo Seguro:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={colorRules?.greenDays ?? 30}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  if (onUpdateColorRules && colorRules) {
                    onUpdateColorRules({ ...colorRules, greenDays: val });
                  }
                }}
                className="w-full bg-white text-xs font-bold p-2 border border-slate-200 rounded-lg text-slate-850 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-500 shrink-0 font-medium">dias</span>
            </div>
            <span className="text-[10px] text-slate-400 block mt-1.5 font-medium">
              Regularizados. Vencimento em {colorRules?.greenDays ?? 30} dias ou mais.
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
