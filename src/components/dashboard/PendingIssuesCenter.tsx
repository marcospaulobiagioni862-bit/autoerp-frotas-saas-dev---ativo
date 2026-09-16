import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  Users,
  Car,
  FileText,
  Shield,
  Locate,
  Camera,
  DollarSign,
  Wrench,
  CheckCircle2,
  ArrowRight,
  Eye
} from 'lucide-react';
import { Veiculo, Motorista, Contrato, Pagamento, Manutencao } from '../../types';
import { getCnhAlert, ColorRulesConfig } from '../../shared/domain/cnh';
import { getVehicleMaintenanceAlerts } from '../../shared/domain/maintenance';

interface PendingIssuesCenterProps {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  manutencoes: Manutencao[];
  onNavigate: (tab: string) => void;
  colorRules?: ColorRulesConfig;
}

export interface PendingIssue {
  id: string;
  type: 'cnh' | 'crlv_ipva' | 'seguro' | 'rastreador' | 'vistoria' | 'financeiro' | 'motorista_status' | 'manutencao' | 'renovacao_locacao' | 'documentacao';
  color: 'red' | 'yellow' | 'green';
  title: string;
  description: string;
  targetTab: string;
  entityName: string;
}

export default function PendingIssuesCenter({
  veiculos,
  motoristas,
  contratos,
  pagamentos,
  manutencoes,
  onNavigate,
  colorRules
}: PendingIssuesCenterProps) {
  const [selectedColor, setSelectedColor] = useState<'red' | 'yellow' | 'green'>('red');
  const [searchTerm, setSearchTerm] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const redIssues: PendingIssue[] = [];
  const yellowIssues: PendingIssue[] = [];
  const greenIssues: PendingIssue[] = [];

  const addIssue = (
    color: 'red' | 'yellow' | 'green',
    type: PendingIssue['type'],
    title: string,
    description: string,
    targetTab: string,
    entityName: string
  ) => {
    const issue: PendingIssue = {
      id: `${type}-${entityName}-${title}-${Math.random().toString(36).substr(2, 4)}`.replace(/\s+/g, '-'),
      type,
      color,
      title,
      description,
      targetTab,
      entityName
    };
    if (color === 'red') redIssues.push(issue);
    else if (color === 'yellow') yellowIssues.push(issue);
    else greenIssues.push(issue);
  };

  // 1. MOTORISTAS: CNH & Status
  motoristas.forEach(m => {
    // CNH
    const alertInfo = getCnhAlert(m.cnh_venc, colorRules);
    if (alertInfo.isExpired) {
      addIssue(
        'red',
        'cnh',
        'CNH Vencida 🪪',
        `A CNH de ${m.nome} está vencida desde ${m.cnh_venc.split('-').reverse().join('/')}.`,
        'motoristas',
        m.nome
      );
    } else if (alertInfo.alertColor === 'red') {
      addIssue(
        'red',
        'cnh',
        'CNH Vencendo (Crítico) 🪪',
        `A CNH de ${m.nome} vence em ${alertInfo.diffDays} dias (${m.cnh_venc.split('-').reverse().join('/')}).`,
        'motoristas',
        m.nome
      );
    } else if (alertInfo.alertColor === 'yellow' || alertInfo.alertColor === 'blue') {
      addIssue(
        'yellow',
        'cnh',
        'CNH a Vencer (Atenção) 🪪',
        `A CNH de ${m.nome} vence em ${alertInfo.diffDays} dias (${m.cnh_venc.split('-').reverse().join('/')}).`,
        'motoristas',
        m.nome
      );
    } else {
      addIssue(
        'green',
        'cnh',
        'CNH Regularizada 🪪',
        `CNH de ${m.nome} em dia. Vence em ${alertInfo.diffDays} dias (${m.cnh_venc.split('-').reverse().join('/')}).`,
        'motoristas',
        m.nome
      );
    }

    // Status
    if (m.status === 'Bloqueado') {
      addIssue(
        'red',
        'motorista_status',
        'Cadastro Bloqueado ❌',
        `O motorista ${m.nome} está com cadastro bloqueado no sistema.`,
        'motoristas',
        m.nome
      );
    } else if (m.status === 'Inadimplente') {
      addIssue(
        'red',
        'motorista_status',
        'Status Inadimplente ⚠️',
        `O motorista ${m.nome} possui cobranças em atraso e está inadimplente.`,
        'inadimplentes',
        m.nome
      );
    } else if (m.status === 'Inativo') {
      addIssue(
        'yellow',
        'motorista_status',
        'Cadastro Inativo 💤',
        `O motorista ${m.nome} está inativo no sistema.`,
        'motoristas',
        m.nome
      );
    } else if (m.status === 'Ativo') {
      addIssue(
        'green',
        'motorista_status',
        'Cadastro Ativo & Regular ✅',
        `O motorista ${m.nome} está ativo e em conformidade operacional.`,
        'motoristas',
        m.nome
      );
    }
  });

  // 2. VEÍCULOS: CRLV, IPVA, Seguro, Rastreador, Vistoria
  veiculos.forEach(v => {
    // CRLV
    if (v.crlv_vencimento) {
      const crlvDate = new Date(v.crlv_vencimento + 'T00:00:00');
      const diffDays = Math.ceil((crlvDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || v.crlv_situacao === 'Vencido') {
        addIssue(
          'red',
          'crlv_ipva',
          'CRLV Vencido 📄',
          `O licenciamento (CRLV) do carro ${v.modelo} (${v.placa}) venceu em ${v.crlv_vencimento.split('-').reverse().join('/')}.`,
          'documentos',
          v.placa
        );
      } else if (diffDays <= (colorRules?.redDays ?? 5)) {
        addIssue(
          'red',
          'crlv_ipva',
          'CRLV Vencendo (Crítico) 📄',
          `O CRLV de ${v.modelo} (${v.placa}) vence em ${diffDays} dias.`,
          'documentos',
          v.placa
        );
      } else if (diffDays <= (colorRules?.yellowDays ?? 15)) {
        addIssue(
          'yellow',
          'crlv_ipva',
          'CRLV Vencendo (Atenção) 📄',
          `O CRLV de ${v.modelo} (${v.placa}) vence em ${diffDays} dias.`,
          'documentos',
          v.placa
        );
      } else {
        addIssue(
          'green',
          'crlv_ipva',
          'CRLV Regularizado 📄',
          `CRLV de ${v.modelo} (${v.placa}) regular até ${v.crlv_vencimento.split('-').reverse().join('/')} (${diffDays} dias).`,
          'documentos',
          v.placa
        );
      }
    } else {
      addIssue(
        'yellow',
        'crlv_ipva',
        'Sem CRLV Cadastrado 📂',
        `Veículo ${v.modelo} (${v.placa}) está sem data de CRLV cadastrada.`,
        'documentos',
        v.placa
      );
    }

    // IPVA
    if (v.ipva_vencimento) {
      const ipvaDate = new Date(v.ipva_vencimento + 'T00:00:00');
      const diffDays = Math.ceil((ipvaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0 || v.ipva_situacao === 'Pendente') {
        addIssue(
          'red',
          'crlv_ipva',
          'IPVA Pendente 💵',
          `O IPVA de ${v.modelo} (${v.placa}) está vencido ou pendente de pagamento (${v.ipva_vencimento.split('-').reverse().join('/')}).`,
          'documentos',
          v.placa
        );
      } else if (diffDays <= (colorRules?.redDays ?? 5)) {
        addIssue(
          'red',
          'crlv_ipva',
          'IPVA Vencendo (Crítico) 💵',
          `O IPVA do carro ${v.modelo} (${v.placa}) vence em ${diffDays} dias.`,
          'documentos',
          v.placa
        );
      } else if (diffDays <= (colorRules?.yellowDays ?? 15)) {
        addIssue(
          'yellow',
          'crlv_ipva',
          'IPVA Vencendo (Atenção) 💵',
          `O IPVA do carro ${v.modelo} (${v.placa}) vence em ${diffDays} dias.`,
          'documentos',
          v.placa
        );
      } else {
        addIssue(
          'green',
          'crlv_ipva',
          'IPVA Pago ✅',
          `IPVA de ${v.modelo} (${v.placa}) está quitado/em dia.`,
          'documentos',
          v.placa
        );
      }
    } else {
      addIssue(
        'yellow',
        'crlv_ipva',
        'Sem IPVA Cadastrado 📂',
        `Veículo ${v.modelo} (${v.placa}) está sem data de vencimento de IPVA cadastrada.`,
        'documentos',
        v.placa
      );
    }

    // Seguro
    if (!v.segurado) {
      addIssue(
        'red',
        'seguro',
        'Sem Seguro Ativo 🛡️',
        `O veículo ${v.modelo} (${v.placa}) não possui apólice de seguro ativa no sistema.`,
        'seguradoras',
        v.placa
      );
    } else {
      const vencStr = v.seguro_vencimento || v.seguro_vigencia_fim;
      if (vencStr) {
        const segDate = new Date(vencStr + 'T00:00:00');
        const diffDays = Math.ceil((segDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          addIssue(
            'red',
            'seguro',
            'Seguro Vencido 🛡️',
            `O seguro de ${v.modelo} (${v.placa}) expirou em ${vencStr.split('-').reverse().join('/')}.`,
            'seguradoras',
            v.placa
          );
        } else if (diffDays <= (colorRules?.redDays ?? 5)) {
          addIssue(
            'red',
            'seguro',
            'Seguro Vencendo (Crítico) 🛡️',
            `A apólice de seguro de ${v.modelo} (${v.placa}) vence em ${diffDays} dias.`,
            'seguradoras',
            v.placa
          );
        } else if (diffDays <= (colorRules?.yellowDays ?? 15)) {
          addIssue(
            'yellow',
            'seguro',
            'Seguro Vencendo (Atenção) 🛡️',
            `A apólice de seguro de ${v.modelo} (${v.placa}) vence em ${diffDays} dias.`,
            'seguradoras',
            v.placa
          );
        } else {
          addIssue(
            'green',
            'seguro',
            'Seguro Ativo & Em Dia 🛡️',
            `Seguro de ${v.modelo} (${v.placa}) ativo até ${vencStr.split('-').reverse().join('/')} (${diffDays} dias).`,
            'seguradoras',
            v.placa
          );
        }
      } else {
        addIssue(
          'yellow',
          'seguro',
          'Seguro sem Vencimento 🛡️',
          `O veículo ${v.modelo} (${v.placa}) tem seguro ativo mas sem data de expiração cadastrada.`,
          'seguradoras',
          v.placa
        );
      }
    }

    // Rastreador
    if (!v.possui_rastreador) {
      addIssue(
        'red',
        'rastreador',
        'Sem Rastreador 📡',
        `O veículo ${v.modelo} (${v.placa}) não possui equipamento de rastreamento instalado.`,
        'rastreadores',
        v.placa
      );
    } else {
      const rStatus = (v.rastreador_status || '').toLowerCase();
      if (rStatus === 'inativo' || rStatus === 'desativado') {
        addIssue(
          'red',
          'rastreador',
          'Rastreador Inativo 📡',
          `O rastreador de ${v.modelo} (${v.placa}) está desligado ou sem sinal de comunicação.`,
          'rastreadores',
          v.placa
        );
      } else if (rStatus === 'alerta' || rStatus === 'falha' || rStatus === 'bateria baixa' || rStatus === 'pendente') {
        addIssue(
          'yellow',
          'rastreador',
          `Rastreador: ${v.rastreador_status} 📡`,
          `O rastreador de ${v.modelo} (${v.placa}) requer atenção devido ao status: ${v.rastreador_status}.`,
          'rastreadores',
          v.placa
        );
      } else {
        addIssue(
          'green',
          'rastreador',
          'Rastreador Online 📡',
          `Sinal do rastreador do veículo ${v.modelo} (${v.placa}) operando perfeitamente.`,
          'rastreadores',
          v.placa
        );
      }
    }

    // Vistoria / Mídias
    const mediaCount = v.fotos_videos ? v.fotos_videos.length : 0;
    if (mediaCount === 0) {
      addIssue(
        'red',
        'vistoria',
        'Falta de Vistoria (Sem fotos/vídeos) 📸',
        `O veículo ${v.modelo} (${v.placa}) está sem nenhuma mídia de vistoria registrada.`,
        'fotos_videos',
        v.placa
      );
    } else {
      if (v.vistoria_vencimento) {
        const venc = new Date(v.vistoria_vencimento + 'T00:00:00');
        const diff = Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff < 0) {
          addIssue(
            'red',
            'vistoria',
            'Laudo de Vistoria Expirado 📸',
            `A validade da vistoria de ${v.modelo} (${v.placa}) expirou em ${v.vistoria_vencimento.split('-').reverse().join('/')}.`,
            'fotos_videos',
            v.placa
          );
        } else if (diff <= 5) {
          addIssue(
            'red',
            'vistoria',
            'Vistoria Expirando (Crítico) 📸',
            `O laudo de vistoria de ${v.modelo} (${v.placa}) vence em ${diff} dias.`,
            'fotos_videos',
            v.placa
          );
        } else if (diff <= 15) {
          addIssue(
            'yellow',
            'vistoria',
            'Vistoria Próxima do Vencimento 📸',
            `O laudo de vistoria de ${v.modelo} (${v.placa}) vence em ${diff} dias.`,
            'fotos_videos',
            v.placa
          );
        } else {
          addIssue(
            'green',
            'vistoria',
            'Laudo de Vistoria Válido 📸',
            `Vistoria regularizada até ${v.vistoria_vencimento.split('-').reverse().join('/')} (${diff} dias).`,
            'fotos_videos',
            v.placa
          );
        }
      }

      if (mediaCount < 3) {
        addIssue(
          'yellow',
          'vistoria',
          'Vistoria Incompleta (< 3 Mídias) 📸',
          `O veículo ${v.modelo} (${v.placa}) possui apenas ${mediaCount} arquivos de mídia de vistoria cadastrados.`,
          'fotos_videos',
          v.placa
        );
      } else if (!v.vistoria_vencimento) {
        addIssue(
          'green',
          'vistoria',
          'Mídias de Vistoria Salvas 📸',
          `Possui ${mediaCount} mídias de vistoria salvas regularmente para ${v.modelo} (${v.placa}).`,
          'fotos_videos',
          v.placa
        );
      }
    }
  });

  // 3. FINANCEIRO: Cobranças de Contratos
  pagamentos.forEach(p => {
    const mot = motoristas.find(m => m.cpf === p.motoristaCpf);
    const driverName = mot?.nome || 'Motorista Não Cadastrado';
    const valStr = p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    if (p.status === 'Atrasado') {
      addIssue(
        'red',
        'financeiro',
        'Semana em Atraso 💰',
        `Aluguel de ${valStr} vencido em ${p.vencimento.split('-').reverse().join('/')} do período ${p.periodo} (${driverName}).`,
        'recebimentos',
        driverName
      );
    } else if (p.status === 'Pendente') {
      addIssue(
        'yellow',
        'financeiro',
        'Parcela Pendente 💰',
        `Aluguel de ${valStr} vencerá em ${p.vencimento.split('-').reverse().join('/')} do período ${p.periodo} (${driverName}).`,
        'recebimentos',
        driverName
      );
    } else if (p.status === 'Pago') {
      addIssue(
        'green',
        'financeiro',
        'Semana Quitada 💰',
        `Aluguel de ${valStr} quitado em ${p.dataPagamento ? p.dataPagamento.split('-').reverse().join('/') : 'dia'} por ${driverName} (${p.periodo}).`,
        'recebimentos',
        driverName
      );
    }
  });

  // 4. MANUTENÇÕES: Ordens de Serviço
  manutencoes.forEach(m => {
    const costStr = m.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const mDate = new Date(m.data + 'T00:00:00');
    const diffDays = Math.ceil((mDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const redDays = colorRules?.redDays ?? 5;
    const yellowDays = colorRules?.yellowDays ?? 15;

    if (m.status === 'Concluída') {
      addIssue(
        'green',
        'manutencao',
        'Manutenção Concluída 🔧',
        `${m.tipo} finalizada no dia ${m.data.split('-').reverse().join('/')} (Custo: ${costStr}, Oficina: ${m.oficina}).`,
        'manutencao',
        m.veiculoPlaca
      );
    } else if (diffDays < 0) {
      addIssue(
        'red',
        'manutencao',
        'Manutenção VENCIDA 🔧',
        `Manutenção ${m.tipo} (${m.veiculoPlaca}) estava agendada para ${m.data.split('-').reverse().join('/')} e está VENCIDA há ${Math.abs(diffDays)} dia(s) na oficina ${m.oficina}. Custo: ${costStr}.`,
        'manutencao',
        m.veiculoPlaca
      );
    } else if (diffDays <= redDays) {
      addIssue(
        'red',
        'manutencao',
        'Manutenção Próxima do Vencimento (Crítica) 🔧',
        `Manutenção ${m.tipo} (${m.veiculoPlaca}) vence em ${diffDays} dia(s) (${m.data.split('-').reverse().join('/')}) na oficina ${m.oficina}. Custo: ${costStr}.`,
        'manutencao',
        m.veiculoPlaca
      );
    } else if (diffDays <= yellowDays) {
      addIssue(
        'yellow',
        'manutencao',
        'Manutenção Próxima do Vencimento (Atenção) 🔧',
        `Manutenção ${m.tipo} (${m.veiculoPlaca}) agendada para ${m.data.split('-').reverse().join('/')} (vence em ${diffDays} dia(s)) na oficina ${m.oficina}. Custo: ${costStr}.`,
        'manutencao',
        m.veiculoPlaca
      );
    } else if (m.status === 'Em Andamento') {
      addIssue(
        'yellow',
        'manutencao',
        'Serviço em Execução 🔧',
        `Carro ${m.veiculoPlaca} em manutenção (${m.tipo}) na oficina ${m.oficina}. Custo estimado: ${costStr}.`,
        'manutencao',
        m.veiculoPlaca
      );
    } else {
      addIssue(
        'green',
        'manutencao',
        'Serviço Agendado 🔧',
        `Manutenção ${m.tipo} agendada para ${m.data.split('-').reverse().join('/')} na oficina ${m.oficina} (${m.veiculoPlaca}).`,
        'manutencao',
        m.veiculoPlaca
      );
    }
  });

  // 5. MANUTENÇÃO PREVENTIVA (KM / ÓLEO / OUTROS)
  veiculos.forEach(v => {
    const alerts = getVehicleMaintenanceAlerts(v, manutencoes);
    alerts.forEach(alert => {
      // We only want to flag alerts that are not 'green' (i.e. 'red' or 'yellow'), or we can add green ones too
      // PendingIssuesCenter tracks all issues (red, yellow, green) inside addIssue and groups them.
      addIssue(
        alert.color,
        'manutencao',
        `Preventiva: ${alert.label} ${alert.emoji}`,
        `${alert.label} para ${v.modelo} (${v.placa}): ${alert.description}`,
        'km_carros',
        v.placa
      );
    });
  });

  // 6. CONTRATOS: Aviso de Renovação de Locação
  contratos.forEach(c => {
    if (c.status === 'Finalizado') return;

    const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
    const veic = veiculos.find(v => v.placa === c.veiculoPlaca);
    const driverName = mot?.nome || c.motoristaCpf;
    const vehicleName = veic ? `${veic.modelo} (${veic.placa})` : c.veiculoPlaca;

    if (c.fim) {
      const endDate = new Date(c.fim + 'T00:00:00');
      const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        addIssue(
          'red',
          'renovacao_locacao',
          'Aviso de Renovação de Locação (Vencido) 📝',
          `O contrato de locação #${c.id} (${driverName} - ${vehicleName}) venceu em ${c.fim.split('-').reverse().join('/')} (há ${Math.abs(diffDays)} dia(s)). Providencie a renovação do termo.`,
          'contratos',
          `Contrato ${c.id}`
        );
      } else if (diffDays <= (colorRules?.redDays ?? 5)) {
        addIssue(
          'red',
          'renovacao_locacao',
          'Aviso de Renovação de Locação (Crítico) 📝',
          `O contrato de locação #${c.id} (${driverName} - ${vehicleName}) vence em ${diffDays} dia(s) (${c.fim.split('-').reverse().join('/')}). Providencie a renovação urgente.`,
          'contratos',
          `Contrato ${c.id}`
        );
      } else if (diffDays <= (colorRules?.yellowDays ?? 15)) {
        addIssue(
          'yellow',
          'renovacao_locacao',
          'Aviso de Renovação de Locação (Atenção) 📝',
          `O contrato de locação #${c.id} (${driverName} - ${vehicleName}) vence em ${diffDays} dia(s) (${c.fim.split('-').reverse().join('/')}). Próximo da renovação.`,
          'contratos',
          `Contrato ${c.id}`
        );
      } else {
        addIssue(
          'green',
          'renovacao_locacao',
          'Renovação de Locação Regular 📝',
          `Contrato de locação #${c.id} (${driverName} - ${vehicleName}) em dia. Vence em ${diffDays} dia(s) (${c.fim.split('-').reverse().join('/')}).`,
          'contratos',
          `Contrato ${c.id}`
        );
      }
    } else {
      addIssue(
        'green',
        'renovacao_locacao',
        'Locação Vigente (Prazo Indeterminado) 📝',
        `Contrato de locação #${c.id} (${driverName} - ${vehicleName}) está ativo com prazo indeterminado.`,
        'contratos',
        `Contrato ${c.id}`
      );
    }
  });

  // Filter list by selected tab and search term
  const allCurrentIssues =
    selectedColor === 'red' ? redIssues : selectedColor === 'yellow' ? yellowIssues : greenIssues;

  const filteredIssues = allCurrentIssues.filter(
    issue =>
      issue.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      issue.entityName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Icon selector
  const getIssueIcon = (type: PendingIssue['type']) => {
    switch (type) {
      case 'cnh':
        return <Users className="w-4 h-4 text-slate-300" />;
      case 'motorista_status':
        return <Users className="w-4 h-4 text-slate-300" />;
      case 'crlv_ipva':
        return <FileText className="w-4 h-4 text-slate-300" />;
      case 'seguro':
        return <Shield className="w-4 h-4 text-slate-300" />;
      case 'rastreador':
        return <Locate className="w-4 h-4 text-slate-300" />;
      case 'vistoria':
        return <Camera className="w-4 h-4 text-slate-300" />;
      case 'financeiro':
        return <DollarSign className="w-4 h-4 text-slate-300" />;
      case 'manutencao':
        return <Wrench className="w-4 h-4 text-slate-300" />;
      case 'renovacao_locacao':
        return <FileText className="w-4 h-4 text-amber-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-300" />;
    }
  };

  // Label resolving tab translating
  const getTabLabel = (tab: string) => {
    switch (tab) {
      case 'motoristas':
        return 'Cadastro de Motoristas';
      case 'inadimplentes':
        return 'Painel Inadimplência';
      case 'documentos':
        return 'Controle de Documentos';
      case 'seguradoras':
        return 'Seguradoras e Apólices';
      case 'rastreadores':
        return 'Gestão de Rastreadores';
      case 'fotos_videos':
        return 'Fotos e Vistas';
      case 'recebimentos':
        return 'Contas a Receber';
      case 'manutencao':
        return 'Ordens de Serviço';
      case 'km_carros':
        return 'Odômetro & Trocas de Óleo';
      case 'contratos':
        return 'Contratos de Aluguel';
      default:
        return 'Abrir Pasta';
    }
  };

  return (
    <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden p-6 mb-6">
      {/* Background glowing rings */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
        <div>
          <h2 className="text-base font-extrabold tracking-wider text-white uppercase flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            Painel Semáforo: Resolução Ativa de Pendências
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Mapeamento dinâmico por cor. Clique no nível para ver as pendências e acesse diretamente a pasta responsável para resolvê-las.
          </p>
        </div>

        {/* Search input inside panel */}
        <div className="w-full lg:w-72">
          <input
            type="text"
            placeholder="Buscar por placa, motorista ou item..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs px-3.5 py-2 rounded-xl focus:outline-none focus:border-red-500 transition-all font-medium"
          />
        </div>
      </div>

      {/* Selector Semáforo Pills */}
      <div className="grid grid-cols-3 gap-3 md:gap-5 mb-6">
        {/* RED PILL */}
        <button
          onClick={() => setSelectedColor('red')}
          className={`relative p-3 rounded-2xl border text-left transition-all duration-300 focus:outline-none hover:scale-[1.01] ${
            selectedColor === 'red'
              ? 'bg-rose-950/40 border-rose-500 text-white shadow-lg shadow-rose-950/50'
              : 'bg-slate-950/20 border-slate-800/80 text-slate-400 hover:border-rose-950/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Vermelho (Crítico)</span>
            <span className={`w-2.5 h-2.5 rounded-full bg-rose-500 ${selectedColor === 'red' ? 'animate-pulse' : ''}`} />
          </div>
          <span className="text-xl md:text-2xl font-black block leading-none">
            {redIssues.length}
          </span>
          <span className="text-[9px] md:text-[10px] text-slate-400 block mt-0.5">Pendências Urgentes</span>
        </button>

        {/* YELLOW PILL */}
        <button
          onClick={() => setSelectedColor('yellow')}
          className={`relative p-3 rounded-2xl border text-left transition-all duration-300 focus:outline-none hover:scale-[1.01] ${
            selectedColor === 'yellow'
              ? 'bg-amber-950/30 border-amber-500 text-white shadow-lg shadow-amber-950/40'
              : 'bg-slate-950/20 border-slate-800/80 text-slate-400 hover:border-amber-950/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Amarelo (Atenção)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          </div>
          <span className="text-xl md:text-2xl font-black block leading-none">
            {yellowIssues.length}
          </span>
          <span className="text-[9px] md:text-[10px] text-slate-400 block mt-0.5">Alertas e Prazos</span>
        </button>

        {/* GREEN PILL */}
        <button
          onClick={() => setSelectedColor('green')}
          className={`relative p-3 rounded-2xl border text-left transition-all duration-300 focus:outline-none hover:scale-[1.01] ${
            selectedColor === 'green'
              ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-lg shadow-emerald-950/40'
              : 'bg-slate-950/20 border-slate-800/80 text-slate-400 hover:border-emerald-950/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Verde (Regular)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <span className="text-xl md:text-2xl font-black block leading-none">
            {greenIssues.length}
          </span>
          <span className="text-[9px] md:text-[10px] text-slate-400 block mt-0.5">Itens em Conformidade</span>
        </button>
      </div>

      {/* Issues Viewer Area */}
      <div className="bg-slate-950/60 border border-slate-850 rounded-xl overflow-hidden">
        <div className="bg-slate-900/60 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">
            Mostrando {filteredIssues.length} de {allCurrentIssues.length} pendências do nível{' '}
            <span
              className={`font-black capitalize ${
                selectedColor === 'red'
                  ? 'text-rose-400'
                  : selectedColor === 'yellow'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {selectedColor === 'red' ? 'Vermelho' : selectedColor === 'yellow' ? 'Amarelo' : 'Verde'}
            </span>
          </span>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-[10px] bg-slate-800 text-slate-400 hover:text-white px-2 py-0.5 rounded"
            >
              Limpar Filtro
            </button>
          )}
        </div>

        <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="popLayout">
            {filteredIssues.length > 0 ? (
              filteredIssues.map((issue, idx) => (
                <motion.div
                  key={issue.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15, delay: Math.min(idx * 0.03, 0.3) }}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon container */}
                    <div
                      className={`p-2 rounded-lg shrink-0 border ${
                        issue.color === 'red'
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          : issue.color === 'yellow'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {getIssueIcon(issue.type)}
                    </div>
                    {/* Title and Description */}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-xs text-white">
                          {issue.title}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.2 rounded font-mono">
                          {issue.entityName}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                        {issue.description}
                      </p>
                    </div>
                  </div>

                  {/* Navigation Link Badge */}
                  <button
                    onClick={() => onNavigate(issue.targetTab)}
                    className={`flex items-center gap-1.5 text-[11px] font-black px-3.5 py-1.5 rounded-xl border shrink-0 group focus:outline-none transition-all duration-200 self-start md:self-center ${
                      issue.color === 'red'
                        ? 'bg-rose-950/20 hover:bg-rose-900/40 border-rose-800/40 hover:border-rose-500 text-rose-300'
                        : issue.color === 'yellow'
                        ? 'bg-amber-950/25 hover:bg-amber-900/35 border-amber-800/40 hover:border-amber-500 text-amber-300'
                        : 'bg-emerald-950/20 hover:bg-emerald-900/40 border-emerald-800/40 hover:border-emerald-500 text-emerald-300'
                    }`}
                  >
                    <span>{getTabLabel(issue.targetTab)}</span>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </button>
                </motion.div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 italic text-xs">
                {searchTerm
                  ? 'Nenhuma pendência encontrada correspondente à busca.'
                  : `Nenhuma pendência ativa no nível ${
                      selectedColor === 'red' ? 'Vermelho' : selectedColor === 'yellow' ? 'Amarelo' : 'Verde'
                    }.`}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
