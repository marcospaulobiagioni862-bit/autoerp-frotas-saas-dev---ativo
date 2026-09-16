import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/layout/Sidebar';
import ResetConfirmModal from './components/layout/ResetConfirmModal';
import DesktopHeader from './components/layout/DesktopHeader';
import MobileHeader from './components/layout/MobileHeader';
import useToastSystem from './hooks/useToastSystem';
import useUserRole from './hooks/useUserRole';
import { useColorRules } from './hooks/useColorRules';
import { usePendencias } from './hooks/usePendencias';
import PendenciasModal from './components/PendenciasModal';
import getTabTitle from './shared/navigation/getTabTitle';
import DashboardView from './components/DashboardView';
import FleetDashboardView from './components/FleetDashboardView';
import VeiculosView from './components/VeiculosView';
import MotoristasView from './components/MotoristasView';
import ContratosView from './components/ContratosView';
import PagamentosView from './components/PagamentosView';
import RecebimentosView from './components/RecebimentosView';
import KmCarrosView from './components/KmCarrosView';
import ManutencaoView from './components/ManutencaoView';
import RelatoriosView from './components/RelatoriosView';
import InadimplentesView from './components/InadimplentesView';
import AuditoriaView from './components/AuditoriaView';
import SeguradorasView from './components/SeguradorasView';
import DocumentosView from './components/DocumentosView';
import RastreadoresView from './components/RastreadoresView';
import AcessoriosView from './components/AcessoriosView';
import ArquivoMortoView from './components/ArquivoMortoView';
import FotosVideosView from './components/FotosVideosView';
import SegurancaStatusView from './components/SegurancaStatusView';
import ModeloContratoView from './components/ModeloContratoView';
import FinanceiroView from './components/FinanceiroView';
import DetranRegrasView from './components/DetranRegrasView';
import { useFinanceiroSystem } from './hooks/useFinanceiroSystem';
import { buildParcelas, generateKey } from './shared/financeiro/financialGeneratorLogic';
import { hasSimulationData as checkSimData, applySimulation, clearSimulation } from './utils/simulationData';

import Toast from './shared/components/Toast';
import BackupManagerModal from './components/layout/BackupManagerModal';
import UndoToastBanner from './components/layout/UndoToastBanner';

import {
  Veiculo,
  Motorista,
  Contrato,
  Pagamento,
  Manutencao,
  Documento,
  Seguradora,
  Apolice,
  Rastreador,
  Acessorio,
  ContaPagar,
  ContaReceber,
  ArquivoMortoItem,
  DetranRegra,
  DetranCalendarioExercicio,
  KmRegistro,
  ApuracaoKmCobranca,
  KmAuditLog,
  PlanilhaBackup,
  PlanilhaBackupDetails,
  PlanilhaBackupSnapshot,
  PlanilhaResetAuditLog
} from './types';

import {
  initialVeiculos,
  initialMotoristas,
  initialContratos,
  initialPagamentos,
  initialManutencoes,
  initialDocumentos,
  initialSeguradoras,
  initialApolices,
  initialRastreadores,
  initialAcessorios,
  initialArquivoMorto
} from './data';

import {
  initialDetranRegras,
  initialDetranCalendarios,
  initialKmRegistros,
  initialApuracoesKm,
  initialKmAuditLogs
} from './data/detranSpRules';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { userRole, setUserRole } = useUserRole();
  const { colorRules, setColorRules } = useColorRules();

  // Core Reactive States with LocalStorage persistence
  const [veiculos, setVeiculos] = useState<Veiculo[]>(() => {
    const isPruned = localStorage.getItem('auto_erp_pruned_v6');
    if (!isPruned) {
      localStorage.setItem('auto_erp_veiculos', JSON.stringify(initialVeiculos));
      localStorage.setItem('auto_erp_motoristas', JSON.stringify(initialMotoristas));
      localStorage.setItem('auto_erp_contratos', JSON.stringify(initialContratos));
      localStorage.setItem('auto_erp_pagamentos', JSON.stringify(initialPagamentos));
      localStorage.setItem('auto_erp_manutencoes', JSON.stringify(initialManutencoes));
      localStorage.setItem('auto_erp_documentos', JSON.stringify(initialDocumentos));
      localStorage.setItem('auto_erp_seguradoras', JSON.stringify(initialSeguradoras));
      localStorage.setItem('auto_erp_apolices', JSON.stringify(initialApolices));
      localStorage.setItem('auto_erp_rastreadores', JSON.stringify(initialRastreadores));
      localStorage.setItem('auto_erp_acessorios', JSON.stringify(initialAcessorios));
      localStorage.setItem('auto_erp_arquivo_morto', JSON.stringify(initialArquivoMorto));
      localStorage.setItem('auto_erp_pruned_v6', 'true');
      return initialVeiculos;
    }
    const local = localStorage.getItem('auto_erp_veiculos');
    return local ? JSON.parse(local) : initialVeiculos;
  });

  const [motoristas, setMotoristas] = useState<Motorista[]>(() => {
    const local = localStorage.getItem('auto_erp_motoristas');
    return local ? JSON.parse(local) : initialMotoristas;
  });

  const [contratos, setContratos] = useState<Contrato[]>(() => {
    const local = localStorage.getItem('auto_erp_contratos');
    return local ? JSON.parse(local) : initialContratos;
  });

    // --- SIMULATION ---
  const [hasSimulationData, setHasSimulationData] = useState(() => checkSimData());

  const handleToggleSimulation = () => {
    if (hasSimulationData) {
      if (window.confirm('Deseja remover todos os dados fictícios de teste?\n\nOs dados reais não serão alterados.')) {
        clearSimulation();
        setHasSimulationData(false);
        window.location.reload();
      }
    } else {
      if (window.confirm('Deseja criar uma base completa de testes com 5 motoristas, 7 veículos, contratos e financeiro?\n\nEsses dados são FICTÍCIOS e EXCLUSIVOS PARA TESTE.')) {
        applySimulation();
        setHasSimulationData(true);
        window.location.reload();
      }
    }
  };
  const [pagamentos, setPagamentos] = useState<Pagamento[]>(() => {
    const local = localStorage.getItem('auto_erp_pagamentos');
    return local ? JSON.parse(local) : initialPagamentos;
  });

  const [manutencoes, setManutencoes] = useState<Manutencao[]>(() => {
    const local = localStorage.getItem('auto_erp_manutencoes');
    return local ? JSON.parse(local) : initialManutencoes;
  });

  const [documentos, setDocumentos] = useState<Documento[]>(() => {
    const local = localStorage.getItem('auto_erp_documentos');
    return local ? JSON.parse(local) : initialDocumentos;
  });

  const [seguradoras, setSeguradoras] = useState<Seguradora[]>(() => {
    const local = localStorage.getItem('auto_erp_seguradoras');
    return local ? JSON.parse(local) : initialSeguradoras;
  });

  const [apolices, setApolices] = useState<Apolice[]>(() => {
    const local = localStorage.getItem('auto_erp_apolices');
    return local ? JSON.parse(local) : initialApolices;
  });

  const [rastreadores, setRastreadores] = useState<Rastreador[]>(() => {
    const local = localStorage.getItem('auto_erp_rastreadores');
    return local ? JSON.parse(local) : initialRastreadores;
  });

  const [acessorios, setAcessorios] = useState<Acessorio[]>(() => {
    const local = localStorage.getItem('auto_erp_acessorios');
    return local ? JSON.parse(local) : initialAcessorios;
  });

  const [arquivoMorto, setArquivoMorto] = useState<ArquivoMortoItem[]>(() => {
    const local = localStorage.getItem('auto_erp_arquivo_morto');
    return local ? JSON.parse(local) : initialArquivoMorto;
  });

  // DETRAN SP Rules and Calendars State
  const [detranRegras, setDetranRegras] = useState<DetranRegra[]>(() => {
    const local = localStorage.getItem('auto_erp_detran_regras');
    return local ? JSON.parse(local) : initialDetranRegras;
  });

  const [detranCalendarios, setDetranCalendarios] = useState<DetranCalendarioExercicio[]>(() => {
    const local = localStorage.getItem('auto_erp_detran_calendarios');
    return local ? JSON.parse(local) : initialDetranCalendarios;
  });

  // KM Registros & Apurações
  const [kmRegistros, setKmRegistros] = useState<KmRegistro[]>(() => {
    const local = localStorage.getItem('auto_erp_km_registros');
    return local ? JSON.parse(local) : initialKmRegistros;
  });

  const [apuracoesKm, setApuracoesKm] = useState<ApuracaoKmCobranca[]>(() => {
    const local = localStorage.getItem('auto_erp_apuracoes_km');
    return local ? JSON.parse(local) : initialApuracoesKm;
  });

  const [kmAuditLogs, setKmAuditLogs] = useState<KmAuditLog[]>(() => {
    const local = localStorage.getItem('auto_erp_km_audit_logs');
    return local ? JSON.parse(local) : initialKmAuditLogs;
  });

  // Toast notifications state
  const { toast, setToast, triggerToast } = useToastSystem();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isBackupManagerOpen, setIsBackupManagerOpen] = useState(false);
  const [isResetProcessing, setIsResetProcessing] = useState(false);
  const [showUndoBanner, setShowUndoBanner] = useState(false);
  const [lastBackupForUndo, setLastBackupForUndo] = useState<PlanilhaBackup | null>(null);

  const [planilhaBackups, setPlanilhaBackups] = useState<PlanilhaBackup[]>(() => {
    const local = localStorage.getItem('auto_erp_planilha_backups');
    return local ? JSON.parse(local) : [];
  });

  useEffect(() => {
    localStorage.setItem('auto_erp_planilha_backups', JSON.stringify(planilhaBackups));
  }, [planilhaBackups]);

  const [resetAuditLogs, setResetAuditLogs] = useState<PlanilhaResetAuditLog[]>(() => {
    const local = localStorage.getItem('auto_erp_reset_audit_logs');
    return local ? JSON.parse(local) : [];
  });

  useEffect(() => {
    localStorage.setItem('auto_erp_reset_audit_logs', JSON.stringify(resetAuditLogs));
  }, [resetAuditLogs]);

  // Módulo Financeiro Integrado Hook
  const fin = useFinanceiroSystem(
    contratos,
    veiculos,
    motoristas,
    manutencoes,
    documentos,
    apolices,
    rastreadores,
    pagamentos,
    setPagamentos
  );

  // Derive a unified pagamentos list that combines legacy synchronized pagamentos 
  // with any manual entries created directly in the V2 Financeiro module.
  const unifiedPagamentos: Pagamento[] = useMemo(() => {
    const map = new Map<string, Pagamento>();
    
    // 1. Add all legacy synchronized pagamentos
    pagamentos.forEach(p => {
       map.set(p.id, p);
    });

    // 2. Add manual V2 Recebimentos (ignore ones auto-generated from contracts as they exist in legacy)
    fin.contasReceber.forEach(cr => {
       if (cr.origemTipo && cr.origemTipo !== 'manual') return;
       map.set(cr.id, {
          id: cr.id,
          motoristaCpf: cr.motoristaCpf || '',
          veiculoPlaca: cr.veiculoPlaca || '',
          periodo: cr.descricao,
          valor: cr.valorFinal,
          vencimento: cr.dataVencimento,
          dataPagamento: cr.dataRealRecebimento,
          forma: cr.formaPagamento,
          status: cr.status === 'Recebido' ? 'Pago' : (cr.status === 'Vencido' ? 'Atrasado' : 'Pendente'),
          obs: cr.observacoes,
          isDespesa: false,
          valorOriginal: cr.valorOriginal,
          valorPago: cr.valorRecebido,
          saldoDevedor: cr.saldoDevedor,
          categoria: cr.categoria
       });
    });

    // 3. Add manual V2 Pagamentos (ignore auto-generated ones from maintenance/docs as they exist in legacy)
    fin.contasPagar.forEach(cp => {
       if (cp.origemTipo && cp.origemTipo !== 'manual') return;
       map.set(cp.id, {
          id: cp.id,
          motoristaCpf: '',
          veiculoPlaca: cp.veiculoPlaca || '',
          periodo: cp.descricao,
          valor: cp.valorFinal,
          vencimento: cp.dataVencimento,
          dataPagamento: cp.dataRealPagamento,
          forma: cp.formaPagamento,
          status: cp.status === 'Pago' ? 'Pago' : (cp.status === 'Em aberto' && cp.dataVencimento < new Date().toISOString().split('T')[0] ? 'Atrasado' : 'Pendente'),
          obs: cp.observacoes,
          isDespesa: true,
          valorOriginal: cp.valorOriginal,
          valorPago: cp.valorPago,
          saldoDevedor: cp.saldoDevedor,
          categoria: cp.categoria
       });
    });

    return Array.from(map.values());
  }, [pagamentos, fin.contasReceber, fin.contasPagar]);

  // Pendencias modal and hook state
  const {
    pendencies,
    customTasks,
    addCustomTask,
    resolveItem,
    deleteCustomTask,
    snoozeReminders,
    snoozedUntil,
    clearSnooze
  } = usePendencias(unifiedPagamentos, manutencoes, motoristas, contratos);

  const [isPendenciasModalOpen, setIsPendenciasModalOpen] = useState(false);
  const [pendenciasModalMode, setPendenciasModalMode] = useState<'startup' | 'shutdown'>('startup');
  const [isSessionClosed, setIsSessionClosed] = useState(false);

  // Auto trigger startup modal if pendencies exist and not snoozed
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (snoozedUntil && snoozedUntil >= todayStr) {
      console.log('Reminders are snoozed until:', snoozedUntil);
    } else {
      if (pendencies.length > 0) {
        setPendenciasModalMode('startup');
        setIsPendenciasModalOpen(true);
      }
    }
  }, [snoozedUntil, pendencies.length]);

  // Exit handlers
  const handleExitAppAttempt = () => {
    if (pendencies.length > 0) {
      setPendenciasModalMode('shutdown');
      setIsPendenciasModalOpen(true);
    } else {
      setIsSessionClosed(true);
    }
  };

  const handleConfirmExit = () => {
    setIsPendenciasModalOpen(false);
    setIsSessionClosed(true);
  };

  const handleCancelExit = () => {
    setIsPendenciasModalOpen(false);
  };

  const handleSnoozeExit = () => {
    snoozeReminders();
    setIsPendenciasModalOpen(false);
    setIsSessionClosed(true);
    triggerToast('Lembretes adiados para amanhã com sucesso!', 'success');
  };

  // Synchronize with LocalStorage on any change
  useEffect(() => {
    localStorage.setItem('auto_erp_veiculos', JSON.stringify(veiculos));
  }, [veiculos]);

  useEffect(() => {
    localStorage.setItem('auto_erp_motoristas', JSON.stringify(motoristas));
  }, [motoristas]);

  useEffect(() => {
    localStorage.setItem('auto_erp_contratos', JSON.stringify(contratos));
  }, [contratos]);

  useEffect(() => {
    localStorage.setItem('auto_erp_pagamentos', JSON.stringify(pagamentos));
  }, [pagamentos]);

  useEffect(() => {
    localStorage.setItem('auto_erp_manutencoes', JSON.stringify(manutencoes));
  }, [manutencoes]);

  useEffect(() => {
    localStorage.setItem('auto_erp_documentos', JSON.stringify(documentos));
  }, [documentos]);

  useEffect(() => {
    localStorage.setItem('auto_erp_seguradoras', JSON.stringify(seguradoras));
  }, [seguradoras]);

  useEffect(() => {
    localStorage.setItem('auto_erp_apolices', JSON.stringify(apolices));
  }, [apolices]);

  useEffect(() => {
    localStorage.setItem('auto_erp_rastreadores', JSON.stringify(rastreadores));
  }, [rastreadores]);

  useEffect(() => {
    localStorage.setItem('auto_erp_acessorios', JSON.stringify(acessorios));
  }, [acessorios]);

  useEffect(() => {
    localStorage.setItem('auto_erp_arquivo_morto', JSON.stringify(arquivoMorto));
  }, [arquivoMorto]);

  useEffect(() => {
    localStorage.setItem('auto_erp_detran_regras', JSON.stringify(detranRegras));
  }, [detranRegras]);

  useEffect(() => {
    localStorage.setItem('auto_erp_detran_calendarios', JSON.stringify(detranCalendarios));
  }, [detranCalendarios]);

  useEffect(() => {
    localStorage.setItem('auto_erp_km_registros', JSON.stringify(kmRegistros));
  }, [kmRegistros]);

  useEffect(() => {
    localStorage.setItem('auto_erp_apuracoes_km', JSON.stringify(apuracoesKm));
  }, [apuracoesKm]);

  useEffect(() => {
    localStorage.setItem('auto_erp_km_audit_logs', JSON.stringify(kmAuditLogs));
  }, [kmAuditLogs]);

  // Inteligência de Sincronização: Ajusta status de Contas a Receber de acordo com a data de vencimento
  // - Até antes da data de vencimento: Pendente
  // - Na data do vencimento ou posterior: Atrasado
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    setPagamentos(prev => {
      let changed = false;
      const updated = prev.map(p => {
        if (p.status === 'Pago') return p;
        const targetStatus = p.vencimento <= todayStr ? 'Atrasado' : 'Pendente';
        if (p.status !== targetStatus) {
          changed = true;
          return { ...p, status: targetStatus as any };
        }
        return p;
      });
      return changed ? updated : prev;
    });
  }, []);

  // Inteligência de Sincronização: Ajusta status de Motoristas de acordo com pagamentos atrasados
  useEffect(() => {
    setMotoristas(prevDrivers => {
      let changed = false;
      const updated = prevDrivers.map(m => {
        const hasOverdue = pagamentos.some(p => p.motoristaCpf === m.cpf && p.status === 'Atrasado');
        const newStatus = hasOverdue ? 'Inadimplente' : 'Ativo';
        
        if (m.status !== 'Inativo' && m.status !== newStatus) {
          changed = true;
          return { ...m, status: newStatus as any };
        }
        return m;
      });
      return changed ? updated : prevDrivers;
    });
  }, [pagamentos]);

  // Replicação automática de documentos preenchidos do cadastro de Veículos para a aba lateral Documentos
  useEffect(() => {
    setDocumentos(prevDocs => {
      let isChanged = false;
      const updatedDocs = [...prevDocs];

      veiculos.forEach(v => {
        // 1. CRLV Sync
        const crlvIdx = updatedDocs.findIndex(d => d.veiculoPlaca === v.placa && d.tipo === 'CRLV' && !d.id.startsWith('doc_anexo_'));
        const crlvExpired = v.crlv_vencimento ? new Date(v.crlv_vencimento + 'T00:00:00') < new Date() : false;
        const isCrlvValid = (v.crlv_situacao === 'Regular' || v.crlv_situacao === 'Em dia' || (!v.crlv_situacao && !!v.crlv_vencimento)) && !crlvExpired;
        const crlvStatus = isCrlvValid ? 'Válido' : 'Vencido';
        const crlvNum = v.renavam || 'CRLV-' + v.placa;
        if (crlvIdx > -1) {
          const current = updatedDocs[crlvIdx];
          if (current.vencimento !== v.crlv_vencimento || current.numero !== crlvNum || current.status !== crlvStatus) {
            updatedDocs[crlvIdx] = {
              ...current,
              vencimento: v.crlv_vencimento,
              numero: crlvNum,
              status: crlvStatus,
              obs: v.crlv_vencimento ? 'Gerado automaticamente do cadastro de veículo' : 'CRLV pendente de cadastro de data de vencimento'
            };
            isChanged = true;
          }
        } else {
          updatedDocs.push({
            id: `doc_crlv_${v.placa}_${Date.now()}`,
            veiculoPlaca: v.placa,
            tipo: 'CRLV',
            numero: crlvNum,
            vencimento: v.crlv_vencimento,
            status: crlvStatus,
            obs: v.crlv_vencimento ? 'Gerado automaticamente do cadastro de veículo' : 'CRLV pendente de cadastro de data de vencimento'
          });
          isChanged = true;
        }

        // 2. IPVA Sync
        const ipvaIdx = updatedDocs.findIndex(d => d.veiculoPlaca === v.placa && d.tipo === 'IPVA' && !d.id.startsWith('doc_anexo_'));
        const ipvaExpired = v.ipva_vencimento ? new Date(v.ipva_vencimento + 'T00:00:00') < new Date() : true;
        const ipvaStatus = v.ipva_situacao === 'Pago' ? 'Válido' : (ipvaExpired ? 'Vencido' : 'A vencer');
        const ipvaNum = `IPVA-${v.ipva_ano_referencia || '2026'}`;
        if (ipvaIdx > -1) {
          const current = updatedDocs[ipvaIdx];
          if (current.vencimento !== v.ipva_vencimento || current.status !== ipvaStatus || current.numero !== ipvaNum) {
            updatedDocs[ipvaIdx] = {
              ...current,
              vencimento: v.ipva_vencimento,
              numero: ipvaNum,
              status: ipvaStatus,
              obs: v.ipva_vencimento ? 'Gerado automaticamente do cadastro de veículo' : 'IPVA pendente de cadastro de data ou pagamento'
            };
            isChanged = true;
          }
        } else {
          updatedDocs.push({
            id: `doc_ipva_${v.placa}_${Date.now()}`,
            veiculoPlaca: v.placa,
            tipo: 'IPVA',
            numero: ipvaNum,
            vencimento: v.ipva_vencimento,
            status: ipvaStatus,
            obs: v.ipva_vencimento ? 'Gerado automaticamente do cadastro de veículo' : 'IPVA pendente de cadastro de data ou pagamento'
          });
          isChanged = true;
        }

        // 3. Vistoria Sync
        if (v.vistoria_vencimento || v.vistoria_resultado === 'Reprovado') {
          const existingIdx = updatedDocs.findIndex(d => d.veiculoPlaca === v.placa && d.tipo === 'Laudo de vistoria' && !d.id.startsWith('doc_anexo_'));
          const isExpired = v.vistoria_vencimento ? new Date(v.vistoria_vencimento + 'T00:00:00') < new Date() : true;
          const statusVal = v.vistoria_resultado === 'Reprovado' ? 'Vencido' : (isExpired ? 'Vencido' : 'Válido');
          if (existingIdx > -1) {
            const current = updatedDocs[existingIdx];
            if (current.vencimento !== v.vistoria_vencimento || current.status !== statusVal) {
              updatedDocs[existingIdx] = {
                ...current,
                vencimento: v.vistoria_vencimento,
                status: statusVal
              };
              isChanged = true;
            }
          } else {
            updatedDocs.push({
              id: `doc_vistoria_${v.placa}_${Date.now()}`,
              veiculoPlaca: v.placa,
              tipo: 'Laudo de vistoria',
              numero: `Vistoria-${v.placa}`,
              vencimento: v.vistoria_vencimento,
              status: statusVal,
              obs: 'Gerado automaticamente do cadastro de veículo'
            });
            isChanged = true;
          }
        }

        // 4. Seguro Sync
        const seguroVenc = v.seguro_vencimento || v.seguro_vigencia_fim;
        if (seguroVenc) {
          const existingIdx = updatedDocs.findIndex(d => d.veiculoPlaca === v.placa && d.tipo === 'Seguro' && !d.id.startsWith('doc_anexo_'));
          const isExpired = new Date(seguroVenc + 'T00:00:00') < new Date();
          const statusVal = isExpired ? 'Vencido' : 'Válido';
          if (existingIdx > -1) {
            const current = updatedDocs[existingIdx];
            if (current.vencimento !== seguroVenc || current.status !== statusVal || current.numero !== (v.seguro_apolice_numero || 'Seguro-' + v.placa)) {
              updatedDocs[existingIdx] = {
                ...current,
                vencimento: seguroVenc,
                numero: v.seguro_apolice_numero || 'Seguro-' + v.placa,
                status: statusVal
              };
              isChanged = true;
            }
          } else {
            updatedDocs.push({
              id: `doc_seguro_${v.placa}_${Date.now()}`,
              veiculoPlaca: v.placa,
              tipo: 'Seguro',
              numero: v.seguro_apolice_numero || 'Seguro-' + v.placa,
              vencimento: seguroVenc,
              status: statusVal,
              obs: 'Gerado automaticamente do cadastro de veículo'
            });
            isChanged = true;
          }
        }

        // 5. Multas Sync
        if (v.multas_quantidade && v.multas_quantidade > 0) {
          const existingIdx = updatedDocs.findIndex(d => d.veiculoPlaca === v.placa && d.tipo === 'Multas' && !d.id.startsWith('doc_anexo_'));
          const isExpired = v.multas_data ? new Date(v.multas_data + 'T00:00:00') < new Date() : false;
          const statusVal = v.multas_situacao === 'Paga' ? 'Válido' : (isExpired ? 'Vencido' : 'A vencer');
          const numVal = `${v.multas_quantidade} Multa(s)`;
          if (existingIdx > -1) {
            const current = updatedDocs[existingIdx];
            if (current.vencimento !== v.multas_data || current.status !== statusVal || current.numero !== numVal) {
              updatedDocs[existingIdx] = {
                ...current,
                vencimento: v.multas_data,
                numero: numVal,
                status: statusVal
              };
              isChanged = true;
            }
          } else {
            updatedDocs.push({
              id: `doc_multas_${v.placa}_${Date.now()}`,
              veiculoPlaca: v.placa,
              tipo: 'Multas',
              numero: numVal,
              vencimento: v.multas_data,
              status: statusVal,
              obs: 'Gerado automaticamente do cadastro de veículo'
            });
            isChanged = true;
          }
        }

        // 6. Documentos Anexos Sync
        if (v.documentos_anexos && v.documentos_anexos.length > 0) {
          v.documentos_anexos.forEach(anexo => {
            const docId = `doc_anexo_${v.placa}_${anexo.id}`;
            const existingIdx = updatedDocs.findIndex(d => d.id === docId);
            const statusVal = 'Válido';
            
            // Deduce a smart document type based on the file name
            let guessedTipo: any = 'Outros';
            const nameLower = anexo.nome.toLowerCase();
            if (nameLower.includes('crlv')) guessedTipo = 'CRLV';
            else if (nameLower.includes('ipva')) guessedTipo = 'IPVA';
            else if (nameLower.includes('vistoria') || nameLower.includes('laudo')) guessedTipo = 'Laudo de vistoria';
            else if (nameLower.includes('seguro') || nameLower.includes('apolice')) guessedTipo = 'Seguro';
            else if (nameLower.includes('contrato')) guessedTipo = 'Contrato';
            else if (nameLower.includes('comprovante') || nameLower.includes('pagamento')) guessedTipo = 'Comprovante';
            else if (nameLower.includes('certidao')) guessedTipo = 'Certidão';

            if (existingIdx > -1) {
              const current = updatedDocs[existingIdx];
              if (current.numero !== anexo.nome || current.url !== anexo.url || current.tipo !== guessedTipo) {
                updatedDocs[existingIdx] = {
                  ...current,
                  tipo: guessedTipo,
                  numero: anexo.nome,
                  url: anexo.url,
                  status: statusVal
                };
                isChanged = true;
              }
            } else {
              updatedDocs.push({
                id: docId,
                veiculoPlaca: v.placa,
                tipo: guessedTipo,
                numero: anexo.nome,
                url: anexo.url,
                vencimento: undefined,
                status: statusVal,
                obs: `Anexo de veículo - ${anexo.data_upload || ''}`
              });
              isChanged = true;
            }
          });
        }
      });

      // 7. Motoristas CNH Sync
      motoristas.forEach(m => {
        const cnhDocId = `doc_cnh_${m.cpf.replace(/\D/g, '')}`;
        const existingIdx = updatedDocs.findIndex(d => d.id === cnhDocId || (d.motoristaCpf === m.cpf && d.tipo === 'CNH'));
        const cnhDate = m.cnh_venc || (m as any).cnh_vencimento || '';
        const isExpired = cnhDate ? new Date(cnhDate + 'T00:00:00') < new Date() : false;
        const cnhStatus = cnhDate ? (isExpired ? 'Vencido' : 'Válido') : 'A vencer';
        const cnhNum = m.cnh || 'CNH Não Informada';
        const driverPlate = m.veiculoPlaca || '';

        if (existingIdx > -1) {
          const current = updatedDocs[existingIdx];
          if (current.vencimento !== cnhDate || current.status !== cnhStatus || current.veiculoPlaca !== driverPlate || current.numero !== cnhNum) {
            updatedDocs[existingIdx] = {
              ...current,
              veiculoPlaca: driverPlate,
              motoristaCpf: m.cpf,
              numero: cnhNum,
              vencimento: cnhDate,
              status: cnhStatus,
              obs: `CNH do motorista: ${m.nome}`
            };
            isChanged = true;
          }
        } else {
          updatedDocs.push({
            id: cnhDocId,
            veiculoPlaca: driverPlate,
            motoristaCpf: m.cpf,
            tipo: 'CNH',
            numero: cnhNum,
            vencimento: cnhDate,
            status: cnhStatus,
            obs: `CNH do motorista: ${m.nome}`
          });
          isChanged = true;
        }
      });

      // Clean up orphaned attachment documents
      const activeAttachmentIds = new Set<string>();
      veiculos.forEach(v => {
        if (v.documentos_anexos) {
          v.documentos_anexos.forEach(anexo => {
            activeAttachmentIds.add(`doc_anexo_${v.placa}_${anexo.id}`);
          });
        }
      });

      const beforeCleanupLength = updatedDocs.length;
      const filteredDocs = updatedDocs.filter(d => {
        if (d.id.startsWith('doc_anexo_')) {
          return activeAttachmentIds.has(d.id);
        }
        return true;
      });

      if (filteredDocs.length !== beforeCleanupLength) {
        isChanged = true;
        return filteredDocs;
      }

      return isChanged ? updatedDocs : prevDocs;
    });
  }, [veiculos, motoristas]);

  // Replicação automática de informações de Seguros e Rastreadores dos Veículos para as abas específicas
  useEffect(() => {
    // 1. Sync Seguradoras
    setSeguradoras(prevSeguradoras => {
      const updatedSeguradoras = [...prevSeguradoras];
      let localChanged = false;

      veiculos.forEach(v => {
        if (v.segurado && v.seguro_seguradora) {
          const nameToFind = v.seguro_seguradora.trim();
          if (nameToFind) {
            const exists = updatedSeguradoras.some(s => 
              s.id === nameToFind || s.nome.toLowerCase() === nameToFind.toLowerCase()
            );

            if (!exists) {
              const newSegId = `seg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
              updatedSeguradoras.push({
                id: newSegId,
                nome: nameToFind,
                cnpj: '',
                tel: v.seguro_telefone_corretora || '',
                email: '',
                end: '',
                responsavel: v.seguro_corretor_nome || '',
                obs: 'Gerada automaticamente do cadastro de veículo'
              });
              localChanged = true;
            }
          }
        }
      });

      return localChanged ? updatedSeguradoras : prevSeguradoras;
    });

    // 2. Sync Apólices
    setApolices(prevApolices => {
      const updatedApolices = [...prevApolices];
      let localChanged = false;

      veiculos.forEach(v => {
        if (v.segurado) {
          const segNameOrId = v.seguro_seguradora || '';
          // Resolve correct Seguradora ID by checking state
          const foundSeg = seguradoras.find(s => s.id === segNameOrId || s.nome.toLowerCase() === segNameOrId.toLowerCase());
          const actualSegId = foundSeg ? foundSeg.id : (segNameOrId || 'Não cadastrada');

          const existingIdx = updatedApolices.findIndex(ap => ap.veiculoPlaca === v.placa);
          const venc = v.seguro_vencimento || v.seguro_vigencia_fim || '';
          const num = v.seguro_apolice_numero || `AP-${v.placa}`;
          const val = v.seguro_valor || 0;
          const fran = v.seguro_valor_franquia || 0;
          const statusVal = 'Ativa';
          const obsVal = v.seguro_obs || '';

          if (existingIdx > -1) {
            const current = updatedApolices[existingIdx];
            if (
              current.numero !== num ||
              current.vencimento !== venc ||
              current.valor !== val ||
              current.franquia !== fran ||
              current.status !== statusVal ||
              current.seguradoraId !== actualSegId ||
              current.obs !== obsVal
            ) {
              updatedApolices[existingIdx] = {
                ...current,
                seguradoraId: actualSegId,
                numero: num,
                vencimento: venc,
                valor: val,
                franquia: fran,
                status: statusVal,
                obs: obsVal
              };
              localChanged = true;
            }
          } else {
            updatedApolices.push({
              id: `ap_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              veiculoPlaca: v.placa,
              seguradoraId: actualSegId,
              numero: num,
              cobertura: v.seguro_tipo_cobertura || 'Completa (Auto-sincronizada)',
              franquia: fran,
              valor: val,
              inicio: v.seguro_vigencia_inicio || new Date().toISOString().split('T')[0],
              vencimento: venc,
              status: statusVal,
              obs: obsVal
            });
            localChanged = true;
          }
        } else {
          // If not segurado, mark active policy for that vehicle as Cancelada
          const existingIdx = updatedApolices.findIndex(ap => ap.veiculoPlaca === v.placa && ap.status === 'Ativa');
          if (existingIdx > -1) {
            updatedApolices[existingIdx] = {
              ...updatedApolices[existingIdx],
              status: 'Cancelada'
            };
            localChanged = true;
          }
        }
      });

      return localChanged ? updatedApolices : prevApolices;
    });

    // 3. Sync Rastreadores
    setRastreadores(prevRastreadores => {
      const updatedRastreadores = [...prevRastreadores];
      let localChanged = false;

      veiculos.forEach(v => {
        if (v.possui_rastreador) {
          const existingIdx = updatedRastreadores.findIndex(r => r.veiculoPlaca === v.placa);
          const brand = v.rastreador_marca || 'Não informada';
          const model = v.rastreador_modelo || 'Não informado';
          const imeiNum = v.rastreador_imei || '';
          const oper = v.rastreador_operadora || '';
          const stat = (v.rastreador_status as any) || 'Ativo';
          const notes = v.rastreador_obs || '';

          if (existingIdx > -1) {
            const current = updatedRastreadores[existingIdx];
            if (
              current.marca !== brand ||
              current.modelo !== model ||
              current.imei !== imeiNum ||
              current.operadora !== oper ||
              current.status !== stat ||
              current.obs !== notes
            ) {
              updatedRastreadores[existingIdx] = {
                ...current,
                marca: brand,
                modelo: model,
                imei: imeiNum,
                operadora: oper,
                status: stat,
                obs: notes
              };
              localChanged = true;
            }
          } else {
            updatedRastreadores.push({
              id: `rast_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              veiculoPlaca: v.placa,
              marca: brand,
              modelo: model,
              imei: imeiNum,
              operadora: oper,
              instalacao: new Date().toISOString().split('T')[0],
              planoMensal: 'Mensal',
              valorMensal: 0,
              status: stat,
              ultimaAtualizacao: new Date().toISOString().split('T')[0],
              obs: notes
            });
            localChanged = true;
          }
        } else {
          const existingIdx = updatedRastreadores.findIndex(r => r.veiculoPlaca === v.placa && r.status === 'Ativo');
          if (existingIdx > -1) {
            updatedRastreadores[existingIdx] = {
              ...updatedRastreadores[existingIdx],
              status: 'Inativo'
            };
            localChanged = true;
          }
        }
      });

      return localChanged ? updatedRastreadores : prevRastreadores;
    });
  }, [veiculos, seguradoras]);

  // Helper para disparar toasts

  // Archive helper
  const handleArchiveItem = (tipo: ArquivoMortoItem['tipo'], originalId: string, dados: any, motivo: string) => {
    const newItem: ArquivoMortoItem = {
      id: `arq_${Date.now()}`,
      tipo,
      originalId,
      dados,
      arquivado_em: new Date().toISOString().split('T')[0],
      arquivado_por: userRole,
      motivo_arquivamento: motivo || 'Arquivamento via painel'
    };
    setArquivoMorto(prev => [newItem, ...prev]);
  };

  // Restore helper
  const handleRestoreItem = (item: ArquivoMortoItem) => {
    // Check for duplicates before restoring
    if (item.tipo === 'Veículo') {
      const restored = item.dados as Veiculo;
      if (veiculos.some(v => v.placa === restored.placa)) {
        triggerToast(`Erro: Já existe um veículo ativo com a placa ${restored.placa}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Motorista') {
      const restored = item.dados as Motorista;
      if (motoristas.some(m => m.cpf === restored.cpf)) {
        triggerToast(`Erro: Já existe um motorista ativo com o CPF ${restored.cpf}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Contrato') {
      const restored = item.dados as Contrato;
      if (contratos.some(c => c.id === restored.id)) {
        triggerToast(`Erro: Já existe um contrato ativo com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Rastreador') {
      const restored = item.dados as Rastreador;
      if (rastreadores.some(r => r.id === restored.id)) {
        triggerToast(`Erro: Já existe um rastreador ativo com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Acessório') {
      const restored = item.dados as Acessorio;
      if (acessorios.some(ac => ac.id === restored.id)) {
        triggerToast(`Erro: Já existe um acessório ativo com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Seguradora') {
      const restored = item.dados as Seguradora;
      if (seguradoras.some(s => s.id === restored.id)) {
        triggerToast(`Erro: Já existe uma seguradora ativa com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Apólice') {
      const restored = item.dados as Apolice;
      if (apolices.some(ap => ap.id === restored.id)) {
        triggerToast(`Erro: Já existe uma apólice ativa com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Documento') {
      const restored = item.dados as Documento;
      if (documentos.some(d => d.id === restored.id)) {
        triggerToast(`Erro: Já existe um documento ativo com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Pagamento') {
      const restored = item.dados as Pagamento;
      if (pagamentos.some(p => p.id === restored.id)) {
        triggerToast(`Erro: Já existe um pagamento ativo com o ID ${restored.id}!`, 'error');
        return;
      }
    } else if (item.tipo === 'Manutenção') {
      const restored = item.dados as Manutencao;
      if (manutencoes.some(m => m.id === restored.id)) {
        triggerToast(`Erro: Já existe uma manutenção ativa com o ID ${restored.id}!`, 'error');
        return;
      }
    }

    // Restore item and run post-restore side-effects
    if (item.tipo === 'Veículo') {
      setVeiculos(prev => {
        const next = [item.dados as Veiculo, ...prev];
        const activeOrSuspended = contratos.filter(c => c.status !== 'Finalizado');
        const activeContract = activeOrSuspended.find(c => c.veiculoPlaca === (item.dados as Veiculo).placa);
        return next.map(v => {
          if (v.placa === (item.dados as Veiculo).placa) {
            if (activeContract) {
              return { ...v, status: 'Alugado', motoristaCpf: activeContract.motoristaCpf };
            } else {
              return { ...v, status: v.status === 'Alugado' ? 'Disponível' : v.status, motoristaCpf: undefined };
            }
          }
          return v;
        });
      });
    } else if (item.tipo === 'Motorista') {
      setMotoristas(prev => {
        const next = [item.dados as Motorista, ...prev];
        const activeOrSuspended = contratos.filter(c => c.status !== 'Finalizado');
        const activeContract = activeOrSuspended.find(c => c.motoristaCpf === (item.dados as Motorista).cpf);
        return next.map(m => {
          if (m.cpf === (item.dados as Motorista).cpf) {
            if (activeContract) {
              return { ...m, veiculoPlaca: activeContract.veiculoPlaca };
            } else {
              return { ...m, veiculoPlaca: undefined };
            }
          }
          return m;
        });
      });
    } else if (item.tipo === 'Contrato') {
      const restoredContrato = item.dados as Contrato;
      const nextContracts = [restoredContrato, ...contratos];
      setContratos(nextContracts);
      syncStatusAfterContractsChange(nextContracts);
      syncContratoToRecebimentos(restoredContrato, 'add');
    } else if (item.tipo === 'Rastreador') {
      const restoredRastreador = item.dados as Rastreador;
      setRastreadores(prev => [restoredRastreador, ...prev]);
      setVeiculos(prev => prev.map(v => v.placa === restoredRastreador.veiculoPlaca ? {
        ...v,
        possui_rastreador: restoredRastreador.status === 'Ativo',
        rastreador_marca: restoredRastreador.marca,
        rastreador_modelo: restoredRastreador.modelo,
        rastreador_imei: restoredRastreador.imei,
        rastreador_operadora: restoredRastreador.operadora,
        rastreador_status: restoredRastreador.status,
        rastreador_obs: restoredRastreador.obs
      } : v));
      syncRastreadorToPagamento(restoredRastreador, 'add');
    } else if (item.tipo === 'Acessório') {
      const restoredAcessorio = item.dados as Acessorio;
      setAcessorios(prev => [restoredAcessorio,
 ...prev]);
      syncAcessorioToPagamento(restoredAcessorio,
 'add');
    } else if (item.tipo === 'Seguradora') {
      setSeguradoras(prev => [item.dados as Seguradora, ...prev]);
    } else if (item.tipo === 'Apólice') {
      const restoredApolice = item.dados as Apolice;
      setApolices(prev => [restoredApolice, ...prev]);
      setVeiculos(prev => prev.map(v => v.placa === restoredApolice.veiculoPlaca ? {
        ...v,
        segurado: restoredApolice.status === 'Ativa',
        seguro_vencimento: restoredApolice.vencimento,
        seguro_seguradora: restoredApolice.seguradoraId,
        seguro_valor: restoredApolice.valor,
        seguro_apolice_numero: restoredApolice.numero,
        seguro_valor_franquia: restoredApolice.franquia,
        seguro_obs: restoredApolice.obs
      } : v));
      syncApoliceToPagamento(restoredApolice, 'add');
    } else if (item.tipo === 'Documento') {
      const restoredDoc = item.dados as Documento;
      setDocumentos(prev => [restoredDoc, ...prev]);
      syncDocumentToVehicle(restoredDoc, 'add');
    } else if (item.tipo === 'Pagamento') {
      setPagamentos(prev => [item.dados as Pagamento, ...prev]);
    } else if (item.tipo === 'Manutenção') {
      const restoredM = item.dados as Manutencao;
      setManutencoes(prev => [restoredM, ...prev]);
      syncManutencaoToPagamento(restoredM, 'add');
    }
    setArquivoMorto(prev => prev.filter(a => a.id !== item.id));
    triggerToast(`${item.tipo} restaurado com sucesso!`, 'success');
  };

  // Permanent Delete helper
  const handleDeleteArchiveItem = (item: ArquivoMortoItem) => {
    setArquivoMorto(prev => prev.filter(a => a.id !== item.id));
    triggerToast(`${item.tipo} excluído permanentemente!`, 'success');
  };

  // Record count breakdown & period calculation for Zerar Planilha modal
  const recordDetails: PlanilhaBackupDetails = {
    veiculos: veiculos.length,
    motoristas: motoristas.length,
    contratos: contratos.length,
    pagamentos: pagamentos.length,
    manutencoes: manutencoes.length,
    contasReceber: fin.contasReceber.length,
    contasPagar: fin.contasPagar.length,
    documentos: documentos.length,
    seguradoras: seguradoras.length,
    apolices: apolices.length,
    rastreadores: rastreadores.length,
    acessorios: acessorios.length,
    arquivoMorto: arquivoMorto.length,
    kmRegistros: kmRegistros.length,
    apuracoesKm: apuracoesKm.length,
    kmAuditLogs: kmAuditLogs.length,
    totalGeral:
      veiculos.length +
      motoristas.length +
      contratos.length +
      pagamentos.length +
      manutencoes.length +
      fin.contasReceber.length +
      fin.contasPagar.length +
      documentos.length +
      seguradoras.length +
      apolices.length +
      rastreadores.length +
      acessorios.length +
      arquivoMorto.length +
      kmRegistros.length +
      apuracoesKm.length +
      kmAuditLogs.length
  };

  const periodoStr = (() => {
    const dates: string[] = [];
    veiculos.forEach(v => { if (v.aquisicao) dates.push(v.aquisicao); });
    contratos.forEach(c => { if (c.inicio) dates.push(c.inicio); });
    pagamentos.forEach(p => { if (p.vencimento) dates.push(p.vencimento); });
    manutencoes.forEach(m => { if (m.data) dates.push(m.data); });
    fin.contasReceber.forEach(r => { if (r.dataVencimento) dates.push(r.dataVencimento); });

    if (dates.length === 0) return 'Sem registros no período';
    dates.sort();
    const minD = dates[0];
    const maxD = dates[dates.length - 1];

    const formatD = (d: string) => {
      if (!d) return '';
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d;
    };

    return `De ${formatD(minD)} a ${formatD(maxD)}`;
  })();

  // Core Zerar Planilha function with automatic backup and audit trail
  const handlePerformResetPlanilha = async (motivo?: string) => {
    if (userRole !== 'Administrador' && userRole !== 'Financeiro') {
      triggerToast('Acesso negado: Somente Administradores ou Financeiro podem zerar a planilha.', 'error');
      return;
    }

    setIsResetProcessing(true);

    try {
      const backupId = `backup_${Date.now()}`;
      const nowStr = new Date().toLocaleString('pt-BR');

      const snapshot: PlanilhaBackupSnapshot = {
        veiculos: [...veiculos],
        motoristas: [...motoristas],
        contratos: [...contratos],
        pagamentos: [...pagamentos],
        manutencoes: [...manutencoes],
        contasReceber: [...fin.contasReceber],
        contasPagar: [...fin.contasPagar],
        documentos: [...documentos],
        seguradoras: [...seguradoras],
        apolices: [...apolices],
        rastreadores: [...rastreadores],
        acessorios: [...acessorios],
        arquivoMorto: [...arquivoMorto],
        kmRegistros: [...kmRegistros],
        apuracoesKm: [...apuracoesKm],
        kmAuditLogs: [...kmAuditLogs]
      };

      const backupObj: PlanilhaBackup = {
        id: backupId,
        nomePlanilha: "AutoERP — Base Completa de Frotas e Financeiro",
        dataHora: nowStr,
        usuarioResponsavel: userRole,
        quantidadeRegistrosTotal: recordDetails.totalGeral,
        detalhesRegistros: recordDetails,
        periodoInicio: periodoStr,
        dadosSnapshot: snapshot,
        motivoExclusao: motivo
      };

      // 1. Create automatic backup
      setPlanilhaBackups(prev => [backupObj, ...prev]);

      // 2. Register audit log
      const auditLog: PlanilhaResetAuditLog = {
        id: `audit_reset_${Date.now()}`,
        usuario: userRole,
        dataHora: nowStr,
        nomePlanilha: "AutoERP — Base Completa",
        quantidadeRegistrosRemovidos: recordDetails.totalGeral,
        backupId,
        motivo: motivo || 'Exclusão completa realizada pelo usuário (Zerar Planilha)',
        tipoAcao: 'ZERAR_PLANILHA'
      };
      setResetAuditLogs(prev => [auditLog, ...prev]);

      // 3. Clear user data atomically
      setVeiculos([]);
      setMotoristas([]);
      setContratos([]);
      setPagamentos([]);
      setManutencoes([]);
      setDocumentos([]);
      setSeguradoras([]);
      setApolices([]);
      setRastreadores([]);
      setAcessorios([]);
      setArquivoMorto([]);
      setKmRegistros([]);
      setApuracoesKm([]);
      setKmAuditLogs([]);
      fin.resetFinanceiro([], []);

      localStorage.setItem('auto_erp_veiculos', JSON.stringify([]));
      localStorage.setItem('auto_erp_motoristas', JSON.stringify([]));
      localStorage.setItem('auto_erp_contratos', JSON.stringify([]));
      localStorage.setItem('auto_erp_pagamentos', JSON.stringify([]));
      localStorage.setItem('auto_erp_manutencoes', JSON.stringify([]));
      localStorage.setItem('auto_erp_documentos', JSON.stringify([]));
      localStorage.setItem('auto_erp_seguradoras', JSON.stringify([]));
      localStorage.setItem('auto_erp_apolices', JSON.stringify([]));
      localStorage.setItem('auto_erp_rastreadores', JSON.stringify([]));
      localStorage.setItem('auto_erp_acessorios', JSON.stringify([]));
      localStorage.setItem('auto_erp_arquivo_morto', JSON.stringify([]));
      localStorage.setItem('auto_erp_km_registros', JSON.stringify([]));
      localStorage.setItem('auto_erp_apuracoes_km', JSON.stringify([]));
      localStorage.setItem('auto_erp_km_audit_logs', JSON.stringify([]));

      setLastBackupForUndo(backupObj);
      setShowUndoBanner(true);
      triggerToast('Planilha zerada com sucesso! Backup automático salvo.', 'success');
    } catch (err) {
      console.error('Erro ao zerar planilha:', err);
      triggerToast('Erro ao zerar a planilha. Nenhum dado foi excluído.', 'error');
    } finally {
      setIsResetProcessing(false);
    }
  };

  // Undo Reset handler (30s window)
  const handleUndoReset = () => {
    if (!lastBackupForUndo) return;
    const snap = lastBackupForUndo.dadosSnapshot;

    setVeiculos(snap.veiculos || []);
    setMotoristas(snap.motoristas || []);
    setContratos(snap.contratos || []);
    setPagamentos(snap.pagamentos || []);
    setManutencoes(snap.manutencoes || []);
    setDocumentos(snap.documentos || []);
    setSeguradoras(snap.seguradoras || []);
    setApolices(snap.apolices || []);
    setRastreadores(snap.rastreadores || []);
    setAcessorios(snap.acessorios || []);
    setArquivoMorto(snap.arquivoMorto || []);
    setKmRegistros(snap.kmRegistros || []);
    setApuracoesKm(snap.apuracoesKm || []);
    setKmAuditLogs(snap.kmAuditLogs || []);
    fin.resetFinanceiro(snap.contasReceber || [], snap.contasPagar || []);

    const nowStr = new Date().toLocaleString('pt-BR');
    const undoAudit: PlanilhaResetAuditLog = {
      id: `audit_restore_${Date.now()}`,
      usuario: userRole,
      dataHora: nowStr,
      nomePlanilha: "AutoERP — Base Completa",
      quantidadeRegistrosRemovidos: lastBackupForUndo.quantidadeRegistrosTotal,
      backupId: lastBackupForUndo.id,
      motivo: 'Ação Desfeita pelo Usuário no Banner de 30s',
      tipoAcao: 'RESTAURAR_BACKUP'
    };
    setResetAuditLogs(prev => [undoAudit, ...prev]);

    setShowUndoBanner(false);
    setLastBackupForUndo(null);
    triggerToast('Ação desfeita! Todos os dados foram restaurados com sucesso.', 'success');
  };

  // Restore backup handler from Backup Manager Modal
  const handleRestoreBackup = (backup: PlanilhaBackup) => {
    const snap = backup.dadosSnapshot;

    setVeiculos(snap.veiculos || []);
    setMotoristas(snap.motoristas || []);
    setContratos(snap.contratos || []);
    setPagamentos(snap.pagamentos || []);
    setManutencoes(snap.manutencoes || []);
    setDocumentos(snap.documentos || []);
    setSeguradoras(snap.seguradoras || []);
    setApolices(snap.apolices || []);
    setRastreadores(snap.rastreadores || []);
    setAcessorios(snap.acessorios || []);
    setArquivoMorto(snap.arquivoMorto || []);
    setKmRegistros(snap.kmRegistros || []);
    setApuracoesKm(snap.apuracoesKm || []);
    setKmAuditLogs(snap.kmAuditLogs || []);
    fin.resetFinanceiro(snap.contasReceber || [], snap.contasPagar || []);

    const nowStr = new Date().toLocaleString('pt-BR');
    const restoreAudit: PlanilhaResetAuditLog = {
      id: `audit_restore_${Date.now()}`,
      usuario: userRole,
      dataHora: nowStr,
      nomePlanilha: "AutoERP — Base Completa",
      quantidadeRegistrosRemovidos: backup.quantidadeRegistrosTotal,
      backupId: backup.id,
      motivo: `Restauração manual do backup de ${backup.dataHora}`,
      tipoAcao: 'RESTAURAR_BACKUP'
    };
    setResetAuditLogs(prev => [restoreAudit, ...prev]);

    setIsBackupManagerOpen(false);
    triggerToast(`Backup de ${backup.dataHora} restaurado com sucesso!`, 'success');
  };

  // Delete single backup handler
  const handleDeleteBackup = (backupId: string) => {
    setPlanilhaBackups(prev => prev.filter(b => b.id !== backupId));
    triggerToast('Backup removido do histórico.', 'success');
  };

  const syncVehicleInsuranceAndTracker = (v: Veiculo) => {
    // Sync Insurance
    if (v.segurado) {
      setApolices(prev => {
        const existing = prev.find(ap => ap.veiculoPlaca === v.placa);
        if (existing) {
          return prev.map(ap => ap.veiculoPlaca === v.placa ? {
            ...ap,
            numero: v.seguro_apolice_numero || ap.numero,
            vencimento: v.seguro_vencimento || ap.vencimento,
            valor: v.seguro_valor || ap.valor,
            franquia: v.seguro_valor_franquia || ap.franquia,
            status: 'Ativa',
            obs: v.seguro_obs || ap.obs
          } : ap);
        } else {
          const newAp: Apolice = {
            id: `ap_${Date.now()}`,
            veiculoPlaca: v.placa,
            seguradoraId: v.seguro_seguradora || 'Não cadastrada',
            numero: v.seguro_apolice_numero || `AP-${v.placa}`,
            cobertura: 'Completa (Auto-sincronizada)',
            franquia: v.seguro_valor_franquia || 0,
            valor: v.seguro_valor || 0,
            inicio: new Date().toISOString().split('T')[0],
            vencimento: v.seguro_vencimento || '',
            status: 'Ativa',
            obs: v.seguro_obs
          };
          return [newAp, ...prev];
        }
      });
    } else {
      setApolices(prev => prev.map(ap => ap.veiculoPlaca === v.placa && ap.status === 'Ativa' ? { ...ap, status: 'Cancelada' } : ap));
    }

    // Sync Tracker
    if (v.possui_rastreador) {
      setRastreadores(prev => {
        const existing = prev.find(r => r.veiculoPlaca === v.placa);
        if (existing) {
          return prev.map(r => r.veiculoPlaca === v.placa ? {
            ...r,
            marca: v.rastreador_marca || r.marca,
            modelo: v.rastreador_modelo || r.modelo,
            imei: v.rastreador_imei || r.imei,
            operadora: v.rastreador_operadora || r.operadora,
            status: (v.rastreador_status as any) || 'Ativo',
            obs: v.rastreador_obs || r.obs
          } : r);
        } else {
          const newR: Rastreador = {
            id: `rast_${Date.now()}`,
            veiculoPlaca: v.placa,
            marca: v.rastreador_marca || 'Não informada',
            modelo: v.rastreador_modelo || 'Não informado',
            imei: v.rastreador_imei || '',
            operadora: v.rastreador_operadora || '',
            instalacao: new Date().toISOString().split('T')[0],
            planoMensal: 'Mensal',
            valorMensal: 0,
            status: 'Ativo',
            ultimaAtualizacao: new Date().toISOString().split('T')[0],
            obs: v.rastreador_obs
          };
          return [newR, ...prev];
        }
      });
    } else {
      setRastreadores(prev => prev.map(r => r.veiculoPlaca === v.placa && r.status === 'Ativo' ? { ...r, status: 'Inativo' } : r));
    }
  };

  // Synchronize financial records with other entities (toda a planilha devidamente ligada)
  const syncManutencaoToPagamento = (m: Manutencao, action: 'add' | 'edit' | 'delete') => {
    // Delete any existing payments for this maintenance (both single and installment IDs)
    const cleanPayments = (prevList: Pagamento[]) => {
      return prevList.filter(p => p.id !== `maint_pay_${m.id}` && !p.id.startsWith(`maint_pay_${m.id}_`));
    };

    if (action === 'delete' || m.custo <= 0 || m.modoPagamento === 'Cortesia') {
      setPagamentos(prev => cleanPayments(prev));
      fin.setContasPagar(prev => prev.filter(p => p.origemTipo !== 'manutencao' || p.origemId !== m.id));
      return;
    }

    // V2 Sync - Conta a Pagar
    const isPaid = m.status === 'Concluída';
    const launchNum = `PAG-${new Date().getFullYear()}-MAINT-${m.id.substring(0, 4)}`;
    
    const newContaPagar: ContaPagar = {
      id: `pag-maint-${m.id}`,
      numeroLancamento: launchNum,
      descricao: `Manutenção: ${m.tipo} — ${m.veiculoPlaca}`,
      fornecedor: m.oficina || 'Oficina Especializada',
      veiculoPlaca: m.veiculoPlaca,
      categoria: 'MANUTENÇÃO',
      subcategoria: m.tipo || 'Preventiva',
      centroCusto: 'Oficina & Manutenção',
      valorOriginal: m.custo,
      desconto: 0,
      juros: 0,
      multa: 0,
      valorFinal: m.custo,
      valorPago: isPaid ? m.custo : 0,
      saldoDevedor: isPaid ? 0 : m.custo,
      dataEmissao: m.data,
      dataVencimento: m.data,
      dataRealPagamento: isPaid ? m.data : undefined,
      formaPagamento: m.formaPagamento || 'PIX',
      status: isPaid ? 'Pago' : 'Em aberto',
      observacoes: m.desc || 'Sincronizado do módulo de Manutenção',
      origemTipo: 'manutencao',
      origemId: m.id
    };

    fin.setContasPagar(prev => {
      const filtered = prev.filter(p => p.origemTipo !== 'manutencao' || p.origemId !== m.id);
      return [newContaPagar, ...filtered];
    });

    // Despesa operacional do veículo: não deve ser agregada ao motorista
    const driverCpf = '';

    setPagamentos(prev => {
      const filtered = cleanPayments(prev);
      const newPayments: Pagamento[] = [];

      if (m.modoPagamento === 'Parcelado' && m.qtdParcelas && m.qtdParcelas > 1) {
        const qty = m.qtdParcelas;
        const baseCost = m.custo;
        const eachCost = parseFloat((baseCost / qty).toFixed(2));
        
        // Parse date parts for monthly progression
        const dateParts = m.data.split('-');
        const year = parseInt(dateParts[0]) || new Date().getFullYear();
        const month = (parseInt(dateParts[1]) || 1) - 1; // 0-indexed
        const day = parseInt(dateParts[2]) || 1;

        for (let i = 1; i <= qty; i++) {
          // Generate due date monthly
          const d = new Date(year, month + (i - 1), day);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dueDate = `${yyyy}-${mm}-${dd}`;

          const itemStatus = (m.status === 'Concluída' && i === 1) ? 'Pago' : 'Pendente';
          const itemDataPagamento = itemStatus === 'Pago' ? m.data : undefined;

          newPayments.push({
            id: `maint_pay_${m.id}_${i}`,
            motoristaCpf: driverCpf,
            veiculoPlaca: m.veiculoPlaca,
            periodo: `${m.tipo} (Parc. ${i}/${qty})`,
            valor: eachCost,
            vencimento: dueDate,
            dataPagamento: itemDataPagamento,
            forma: m.formaPagamento || 'Pix',
            status: itemStatus,
            obs: `Manutenção OS #${m.id} (Parcela ${i}/${qty}) - Veículo: ${m.veiculoPlaca} (${m.oficina})`,
            isDespesa: true,
            valorOriginal: baseCost,
            valorPago: itemStatus === 'Pago' ? eachCost : 0,
            saldoDevedor: itemStatus === 'Pago' ? 0 : eachCost,
            qtdParcelas: qty,
            parcelaNumero: i,
            valorTotal: baseCost,
            valorParcela: eachCost
          });
        }
      } else {
        // À Vista or single payment
        const itemStatus = m.status === 'Concluída' ? 'Pago' : 'Pendente';
        const itemDataPagamento = itemStatus === 'Pago' ? m.data : undefined;

        newPayments.push({
          id: `maint_pay_${m.id}`,
          motoristaCpf: driverCpf,
          veiculoPlaca: m.veiculoPlaca,
          periodo: m.tipo,
          valor: m.custo,
          vencimento: m.data,
          dataPagamento: itemDataPagamento,
          forma: m.formaPagamento || 'Pix',
          status: itemStatus,
          obs: `Manutenção OS #${m.id} - Veículo: ${m.veiculoPlaca} (${m.oficina})`,
          isDespesa: true,
          valorOriginal: m.custo,
          valorPago: itemStatus === 'Pago' ? m.custo : 0,
          saldoDevedor: itemStatus === 'Pago' ? 0 : m.custo,
          qtdParcelas: 1,
          parcelaNumero: 1,
          valorTotal: m.custo,
          valorParcela: m.custo
        });
      }

      return [...newPayments, ...filtered];
    });
  };

  const syncAcessorioToPagamento = (ac: Acessorio,
 action: 'add' | 'edit' | 'delete') => {
    if (action === 'delete') {
      setPagamentos(prev => prev.filter(p => p.id !== `acc_pay_${ac.id}`));
      fin.setContasPagar(prev => prev.filter(p => p.origemTipo !== 'manual' || p.origemId !== `acess-${ac.id}`));
      return;
    }

    const totalCost = ac.valor * ac.qtd;
    const isPaid = ac.status === 'Ativo';
    
    // V2 Sync - Conta a Pagar
    const launchNum = `PAG-${new Date().getFullYear()}-ACC-${ac.id.substring(0, 4)}`;
    const newContaPagar: ContaPagar = {
      id: `pag-acc-${ac.id}`,
      numeroLancamento: launchNum,
      descricao: `Acessório: ${ac.nome} (${ac.qtd}x) — ${ac.veiculoPlaca}`,
      fornecedor: 'Fornecedor de Acessórios',
      veiculoPlaca: ac.veiculoPlaca,
      categoria: 'OUTRAS DESPESAS',
      subcategoria: 'Acessório',
      centroCusto: 'Frota Principal',
      valorOriginal: totalCost,
      desconto: 0,
      juros: 0,
      multa: 0,
      valorFinal: totalCost,
      valorPago: isPaid ? totalCost : 0,
      saldoDevedor: isPaid ? 0 : totalCost,
      dataEmissao: ac.instalacao,
      dataVencimento: ac.instalacao,
      dataRealPagamento: isPaid ? ac.instalacao : undefined,
      formaPagamento: 'PIX',
      status: isPaid ? 'Pago' : 'Em aberto',
      observacoes: ac.obs || 'Despesa com acessório veicular',
      origemTipo: 'manual',
      origemId: `acess-${ac.id}`
    };

    fin.setContasPagar(prev => {
      const filtered = prev.filter(p => p.origemTipo !== 'manual' || p.origemId !== `acess-${ac.id}`);
      return [newContaPagar, ...filtered];
    });

    // Despesa operacional do veículo: não deve ser agregada ao motorista
    const driverCpf = '';

    setPagamentos(prev => {
      const existingIndex = prev.findIndex(p => p.id === `acc_pay_${ac.id}`);
      const payData: Pagamento = {
        id: `acc_pay_${ac.id}`,
        motoristaCpf: driverCpf,
        veiculoPlaca: ac.veiculoPlaca,
        periodo: new Date(ac.instalacao).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }),
        valor: totalCost,
        vencimento: ac.instalacao,
        dataPagamento: ac.status === 'Ativo' ? ac.instalacao : undefined,
        forma: 'Pix',
        status: ac.status === 'Ativo' ? 'Pago' : 'Pendente',
        obs: `Acessório: ${ac.nome} (${ac.qtd}x) - Veículo: ${ac.veiculoPlaca}`,
        isDespesa: true,
        valorOriginal: totalCost,
        valorPago: ac.status === 'Ativo' ? totalCost : 0,
        saldoDevedor: ac.status === 'Ativo' ? 0 : totalCost
      };
      if (existingIndex > -1) {
        return prev.map((p, i) => i === existingIndex ? payData : p);
      } else {
        return [payData, ...prev];
      }
    });
  };

  const syncApoliceToPagamento = (ap: Apolice, action: 'add' | 'edit' | 'delete') => {
    if (action === 'delete') {
      setPagamentos(prev => prev.filter(p => p.id !== `ins_pay_${ap.id}`));
      fin.setContasPagar(prev => prev.filter(p => p.origemTipo !== 'seguro' || p.origemId !== ap.id));
      return;
    }

    const insuranceForma = veiculos.find(veh => veh.placa === ap.veiculoPlaca)?.seguro_forma_pagamento || 'Boleto';
    const isPaid = ap.status === 'Ativa' || ap.status === 'Renovada';
    
    // V2 Sync - Conta a Pagar
    const launchNum = `PAG-${new Date().getFullYear()}-SEG-${ap.id.substring(0, 4)}`;
    const newContaPagar: ContaPagar = {
      id: `pag-seg-${ap.id}`,
      numeroLancamento: launchNum,
      descricao: `Seguro Apólice ${ap.numero} — ${ap.veiculoPlaca}`,
      fornecedor: ap.seguradoraId || 'Seguradora',
      veiculoPlaca: ap.veiculoPlaca,
      categoria: 'SEGURO',
      subcategoria: 'Apólice',
      centroCusto: 'Proteção & Seguro',
      valorOriginal: ap.valor,
      desconto: 0,
      juros: 0,
      multa: 0,
      valorFinal: ap.valor,
      valorPago: isPaid ? ap.valor : 0,
      saldoDevedor: isPaid ? 0 : ap.valor,
      dataEmissao: ap.inicio,
      dataVencimento: ap.vencimento,
      dataRealPagamento: isPaid ? ap.inicio : undefined,
      formaPagamento: insuranceForma,
      status: isPaid ? 'Pago' : 'Em aberto',
      observacoes: ap.obs || 'Apólice de Seguro de Veículo',
      origemTipo: 'seguro',
      origemId: ap.id
    };

    fin.setContasPagar(prev => {
      const filtered = prev.filter(p => p.origemTipo !== 'seguro' || p.origemId !== ap.id);
      return [newContaPagar, ...filtered];
    });

    // Despesa operacional do veículo: não deve ser agregada ao motorista
    const driverCpf = '';

    setPagamentos(prev => {
      const existingIndex = prev.findIndex(p => p.id === `ins_pay_${ap.id}`);
      const insuranceForma = veiculos.find(veh => veh.placa === ap.veiculoPlaca)?.seguro_forma_pagamento || 'Boleto';
      const payData: Pagamento = {
        id: `ins_pay_${ap.id}`,
        motoristaCpf: driverCpf,
        veiculoPlaca: ap.veiculoPlaca,
        periodo: new Date(ap.inicio).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }),
        valor: ap.valor,
        vencimento: ap.vencimento,
        dataPagamento: ap.status === 'Renovada' || ap.status === 'Ativa' ? ap.inicio : undefined,
        forma: insuranceForma,
        status: ap.status === 'Ativa' || ap.status === 'Renovada' ? 'Pago' : 'Pendente',
        obs: `Seguro (Apólice nº ${ap.numero}) - Veículo: ${ap.veiculoPlaca}`,
        isDespesa: true,
        valorOriginal: ap.valor,
        valorPago: ap.status === 'Ativa' || ap.status === 'Renovada' ? ap.valor : 0,
        saldoDevedor: ap.status === 'Ativa' || ap.status === 'Renovada' ? 0 : ap.valor
      };
      if (existingIndex > -1) {
        return prev.map((p, i) => i === existingIndex ? payData : p);
      } else {
        return [payData, ...prev];
      }
    });
  };

  const syncRastreadorToPagamento = (r: Rastreador, action: 'add' | 'edit' | 'delete') => {
    if (action === 'delete') {
      setPagamentos(prev => prev.filter(p => p.id !== `track_pay_${r.id}` && p.id !== `track_chip_pay_${r.id}` && p.id !== `track_company_pay_${r.id}`));
      fin.setContasPagar(prev => prev.filter(p => p.origemTipo !== 'rastreador' || p.origemId !== r.id));
      return;
    }

    const isPaid = r.status === 'Ativo';
    
    fin.setContasPagar(prev => {
      const filtered = prev.filter(p => p.origemTipo !== 'rastreador' || p.origemId !== r.id);
      const newItems: ContaPagar[] = [];
      const dataEmissao = r.instalacao || new Date().toISOString().split('T')[0];
      
      if (r.valorMensal > 0) {
        newItems.push({
          id: `pag-track-aparelho-${r.id}`,
          numeroLancamento: `PAG-${new Date().getFullYear()}-TRACK-${r.id.substring(0, 4)}-A`,
          descricao: `Rastreador Aparelho: ${r.marca} — ${r.veiculoPlaca}`,
          fornecedor: 'Fornecedor de Rastreador',
          veiculoPlaca: r.veiculoPlaca,
          categoria: 'RASTREADOR',
          subcategoria: 'Aparelho',
          centroCusto: 'Rastreamento & Segurança',
          valorOriginal: r.valorMensal,
          desconto: 0,
          juros: 0,
          multa: 0,
          valorFinal: r.valorMensal,
          valorPago: isPaid ? r.valorMensal : 0,
          saldoDevedor: isPaid ? 0 : r.valorMensal,
          dataEmissao: dataEmissao,
          dataVencimento: r.ultimaAtualizacao || dataEmissao,
          dataRealPagamento: isPaid ? dataEmissao : undefined,
          formaPagamento: r.aparelho_forma || 'PIX',
          status: isPaid ? 'Pago' : 'Em aberto',
          observacoes: 'Despesa de aparelho rastreador',
          origemTipo: 'rastreador',
          origemId: r.id
        });
      }

      if (r.chip_valor && r.chip_valor > 0) {
        newItems.push({
          id: `pag-track-chip-${r.id}`,
          numeroLancamento: `PAG-${new Date().getFullYear()}-TRACK-${r.id.substring(0, 4)}-C`,
          descricao: `Rastreador Chip: ${r.operadora} — ${r.veiculoPlaca}`,
          fornecedor: r.operadora || 'Operadora Telefonia',
          veiculoPlaca: r.veiculoPlaca,
          categoria: 'RASTREADOR',
          subcategoria: 'Chip Telefonia',
          centroCusto: 'Rastreamento & Segurança',
          valorOriginal: r.chip_valor,
          desconto: 0,
          juros: 0,
          multa: 0,
          valorFinal: r.chip_valor,
          valorPago: isPaid ? r.chip_valor : 0,
          saldoDevedor: isPaid ? 0 : r.chip_valor,
          dataEmissao: dataEmissao,
          dataVencimento: r.chip_vencimento || dataEmissao,
          dataRealPagamento: isPaid ? dataEmissao : undefined,
          formaPagamento: r.chip_forma || 'PIX',
          status: isPaid ? 'Pago' : 'Em aberto',
          observacoes: 'Despesa de chip de telemetria',
          origemTipo: 'rastreador',
          origemId: r.id
        });
      }
      
      if (r.empresa_valor && r.empresa_valor > 0) {
        newItems.push({
          id: `pag-track-emp-${r.id}`,
          numeroLancamento: `PAG-${new Date().getFullYear()}-TRACK-${r.id.substring(0, 4)}-E`,
          descricao: `Rastreador Empresa: ${r.operadora} — ${r.veiculoPlaca}`,
          fornecedor: r.operadora || 'Empresa de Rastreamento',
          veiculoPlaca: r.veiculoPlaca,
          categoria: 'RASTREADOR',
          subcategoria: 'Plataforma / Serviço',
          centroCusto: 'Rastreamento & Segurança',
          valorOriginal: r.empresa_valor,
          desconto: 0,
          juros: 0,
          multa: 0,
          valorFinal: r.empresa_valor,
          valorPago: isPaid ? r.empresa_valor : 0,
          saldoDevedor: isPaid ? 0 : r.empresa_valor,
          dataEmissao: dataEmissao,
          dataVencimento: r.empresa_vencimento || dataEmissao,
          dataRealPagamento: isPaid ? dataEmissao : undefined,
          formaPagamento: r.empresa_forma || 'PIX',
          status: isPaid ? 'Pago' : 'Em aberto',
          observacoes: 'Despesa de plataforma de rastreamento',
          origemTipo: 'rastreador',
          origemId: r.id
        });
      }

      return [...newItems, ...filtered];
    });

    // Despesa operacional do veículo: não deve ser agregada ao motorista
    const driverCpf = '';
    const periodoStr = r.instalacao 
      ? new Date(r.instalacao).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }) 
      : new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' });

    setPagamentos(prev => {
      let updated = [...prev];

      // 1. Aparelho (Tracker Device)
      if (r.valorMensal > 0) {
        const payId = `track_pay_${r.id}`;
        const payData: Pagamento = {
          id: payId,
          motoristaCpf: driverCpf,
          veiculoPlaca: r.veiculoPlaca,
          periodo: periodoStr,
          valor: r.valorMensal,
          vencimento: r.ultimaAtualizacao || r.instalacao || new Date().toISOString().split('T')[0],
          dataPagamento: r.status === 'Ativo' ? (r.instalacao || new Date().toISOString().split('T')[0]) : undefined,
          forma: r.aparelho_forma || 'Pix',
          status: r.status === 'Ativo' ? 'Pago' : 'Pendente',
          obs: `Plano Mensal Rastreador (${r.aparelho_frequencia || 'Mensal'}): ${r.marca} - Veículo: ${r.veiculoPlaca}`,
          isDespesa: true,
          valorOriginal: r.valorMensal,
          valorPago: r.status === 'Ativo' ? r.valorMensal : 0,
          saldoDevedor: r.status === 'Ativo' ? 0 : r.valorMensal,
          isRecorrente: r.aparelho_frequencia !== 'Única',
          frequenciaRecorrente: r.aparelho_frequencia === 'Anual' ? 'Anual' : 'Mensal',
          categoria: 'Rastreador'
        };
        const existingIdx = updated.findIndex(p => p.id === payId);
        if (existingIdx > -1) {
          updated[existingIdx] = payData;
        } else {
          updated.unshift(payData);
        }
      } else {
        updated = updated.filter(p => p.id !== `track_pay_${r.id}`);
      }

      // 2. Chip (SIM Card)
      if (r.chip_valor !== undefined && r.chip_valor > 0) {
        const payId = `track_chip_pay_${r.id}`;
        const payData: Pagamento = {
          id: payId,
          motoristaCpf: driverCpf,
          veiculoPlaca: r.veiculoPlaca,
          periodo: periodoStr,
          valor: r.chip_valor,
          vencimento: r.chip_vencimento || r.instalacao || new Date().toISOString().split('T')[0],
          dataPagamento: r.status === 'Ativo' ? (r.chip_vencimento || r.instalacao || new Date().toISOString().split('T')[0]) : undefined,
          forma: r.chip_forma || 'Pix',
          status: r.status === 'Ativo' ? 'Pago' : 'Pendente',
          obs: `Chip de Telemetria (${r.chip_frequencia || 'Mensal'}): ${r.operadora} - Veículo: ${r.veiculoPlaca}`,
          isDespesa: true,
          valorOriginal: r.chip_valor,
          valorPago: r.status === 'Ativo' ? r.chip_valor : 0,
          saldoDevedor: r.status === 'Ativo' ? 0 : r.chip_valor,
          isRecorrente: r.chip_frequencia !== 'Única',
          frequenciaRecorrente: r.chip_frequencia === 'Anual' ? 'Anual' : 'Mensal',
          categoria: 'Rastreador'
        };
        const existingIdx = updated.findIndex(p => p.id === payId);
        if (existingIdx > -1) {
          updated[existingIdx] = payData;
        } else {
          updated.unshift(payData);
        }
      } else {
        updated = updated.filter(p => p.id !== `track_chip_pay_${r.id}`);
      }

      // 3. Empresa (Tracking Company)
      if (r.empresa_valor !== undefined && r.empresa_valor > 0) {
        const payId = `track_company_pay_${r.id}`;
        const payData: Pagamento = {
          id: payId,
          motoristaCpf: driverCpf,
          veiculoPlaca: r.veiculoPlaca,
          periodo: periodoStr,
          valor: r.empresa_valor,
          vencimento: r.empresa_vencimento || r.instalacao || new Date().toISOString().split('T')[0],
          dataPagamento: r.status === 'Ativo' ? (r.empresa_vencimento || r.instalacao || new Date().toISOString().split('T')[0]) : undefined,
          forma: r.empresa_forma || 'Pix',
          status: r.status === 'Ativo' ? 'Pago' : 'Pendente',
          obs: `Mensalidade Empresa de Rastreamento (${r.empresa_frequencia || 'Mensal'}) - Veículo: ${r.veiculoPlaca}`,
          isDespesa: true,
          valorOriginal: r.empresa_valor,
          valorPago: r.status === 'Ativo' ? r.empresa_valor : 0,
          saldoDevedor: r.status === 'Ativo' ? 0 : r.empresa_valor,
          isRecorrente: r.empresa_frequencia !== 'Única',
          frequenciaRecorrente: r.empresa_frequencia === 'Anual' ? 'Anual' : 'Mensal',
          categoria: 'Rastreador'
        };
        const existingIdx = updated.findIndex(p => p.id === payId);
        if (existingIdx > -1) {
          updated[existingIdx] = payData;
        } else {
          updated.unshift(payData);
        }
      } else {
        updated = updated.filter(p => p.id !== `track_company_pay_${r.id}`);
      }

      return updated;
    });
  };

  const syncContratoToRecebimentos = (c: Contrato, action: 'add' | 'edit' | 'delete') => {
    // Legacy cleaner
    setPagamentos(prev => prev.filter(p => !p.id.includes(`contract_dep_${c.id}`) && !p.id.includes(`contract_rent_${c.id}`) && !p.id.includes(`contract_sched_${c.id}`)));

    if (action === 'delete') {
      fin.setContasReceber(prev => prev.filter(cr => cr.origemTipo !== 'contrato' || cr.origemId !== c.id));
      return;
    }

    const contasGeradas: ContaReceber[] = [];

    // 1. Caução (Security Deposit)
    if (c.caucao && c.caucao > 0) {
      const isPaid = false;
      contasGeradas.push({
        id: `rec-caucao-${c.id}`,
        numeroLancamento: `REC-${new Date().getFullYear()}-CAU-${c.id.substring(0, 4)}`,
        descricao: `Caução de Aluguel`,
        clienteResponsavel: motoristas.find(m => m.cpf === c.motoristaCpf)?.nome || 'Motorista',
        motoristaCpf: c.motoristaCpf,
        veiculoPlaca: c.veiculoPlaca,
        contratoId: c.id,
        categoria: 'Caução',
        subcategoria: 'Garantia',
        centroCusto: 'Locação de Frota',
        valorOriginal: c.caucao,
        desconto: 0,
        acrescimo: 0,
        juros: 0,
        multa: 0,
        valorFinal: c.caucao,
        valorRecebido: isPaid ? c.caucao : 0,
        saldoDevedor: isPaid ? 0 : c.caucao,
        dataEmissao: c.inicio,
        dataVencimento: c.inicio,
        dataPrevistaRecebimento: c.inicio,
        dataRealRecebimento: isPaid ? c.inicio : undefined,
        formaPagamento: 'PIX',
        status: isPaid ? 'Recebido' : 'Em aberto',
        observacoes: `Caução referente ao contrato ${c.id}`,
        origemTipo: 'contrato',
        origemId: c.id
      });
    }

    // 2. Aluguel (from finConfig)
    if (c.finConfig) {
      const parcelas = buildParcelas(c.finConfig);
      parcelas.forEach(p => {
        const ch = generateKey('RECEITA', 'contrato', c.id, c.veiculoPlaca, c.motoristaCpf, c.id, p.numero, p.vencimento);
        const isPaid = false; // We can't know from finConfig if it's paid, rely on existing status in state
        contasGeradas.push({
          id: ch,
          numeroLancamento: `REC-${new Date().getFullYear()}-ALUG-${c.id.substring(0, 4)}-${p.numero}`,
          descricao: `Aluguel Veículo — ${c.veiculoPlaca}` + (c.finConfig?.modalidade !== 'À vista' ? ` (Parc. ${p.numero})` : ''),
          clienteResponsavel: motoristas.find(m => m.cpf === c.motoristaCpf)?.nome || 'Motorista',
          motoristaCpf: c.motoristaCpf,
          veiculoPlaca: c.veiculoPlaca,
          contratoId: c.id,
          categoria: 'Aluguel de Veículo',
          subcategoria: c.finConfig?.periodicidade || 'Semanal',
          centroCusto: 'Locação de Frota',
          valorOriginal: p.valor,
          desconto: 0,
          acrescimo: 0,
          juros: 0,
          multa: 0,
          valorFinal: p.valor,
          valorRecebido: isPaid ? p.valor : 0,
          saldoDevedor: isPaid ? 0 : p.valor,
          dataEmissao: c.inicio,
        dataVencimento: p.vencimento,
          dataPrevistaRecebimento: p.vencimento,
          dataRealRecebimento: undefined,
          formaPagamento: c.finConfig?.formaPagamento || 'PIX',
          status: isPaid ? 'Recebido' : 'Em aberto',
          observacoes: c.obs || '',
          origemTipo: 'contrato',
          origemId: c.id
        });
      });
    }

    fin.setContasReceber(prev => {
      const filtered = prev.filter(cr => cr.origemTipo !== 'contrato' || cr.origemId !== c.id);
      const mapped = contasGeradas.map(nova => {
        const existente = prev.find(p => p.id === nova.id);
        if (existente && (existente.status === 'Recebido' || existente.status === 'Pago' || existente.status === 'Parcialmente recebido')) {
          return { ...nova, status: existente.status, valorRecebido: existente.valorRecebido, saldoDevedor: existente.saldoDevedor, dataRealRecebimento: existente.dataRealRecebimento };
        }
        return nova;
      });
      return [...filtered, ...mapped];
    });
  };

  const syncVeiculoDocsToPagamentos = (v: Veiculo, action: 'add' | 'edit' | 'delete') => {
    if (action === 'delete') {
      setPagamentos(prev => prev.filter(p => 
        p.id !== `ipva_pay_${v.placa}` && 
        p.id !== `dpvat_pay_${v.placa}` && 
        p.id !== `multas_pay_${v.placa}` && 
        p.id !== `alienation_pay_${v.placa}`
      ));
      return;
    }

    // Despesa operacional do veículo (IPVA, DPVAT, Multas, Financiamento): não deve ser agregada ao motorista
    const driverCpf = '';

    setPagamentos(prev => {
      let updated = [...prev];

      // 1. IPVA
      if (v.ipva_valor_total && v.ipva_valor_total > 0 && v.ipva_situacao !== 'Isento') {
        const todayStr = new Date().toISOString().split('T')[0];

        if (v.ipva_forma_pagamento === 'Parcelado') {
          // Clean up single payment if it exists
          updated = updated.filter(p => p.id !== `ipva_pay_${v.placa}`);

          const parcels = [
            { num: 1, val: v.ipva_p1_valor, venc: v.ipva_p1_vencimento },
            { num: 2, val: v.ipva_p2_valor, venc: v.ipva_p2_vencimento },
            { num: 3, val: v.ipva_p3_valor, venc: v.ipva_p3_vencimento },
            { num: 4, val: v.ipva_p4_valor, venc: v.ipva_p4_vencimento },
            { num: 5, val: v.ipva_p5_valor, venc: v.ipva_p5_vencimento },
            { num: 6, val: v.ipva_p6_valor, venc: v.ipva_p6_vencimento },
          ];

          parcels.forEach(({ num, val, venc }) => {
            const pId = `ipva_pay_${v.placa}_p${num}`;
            if (val && val > 0) {
              const existingIdx = updated.findIndex(p => p.id === pId);
              const existing = existingIdx > -1 ? updated[existingIdx] : null;

              let currentStatus: 'Pago' | 'Pendente' | 'Atrasado' = 'Pendente';
              let currentDataPagamento: string | undefined = undefined;
              let currentValorPago = 0;
              let currentSaldoDevedor = val;

              // Default due date logic
              const dueDate = venc || todayStr;
              if (dueDate < todayStr) {
                currentStatus = 'Atrasado';
              }

              if (v.ipva_situacao === 'Pago') {
                currentStatus = 'Pago';
                currentDataPagamento = venc || todayStr;
                currentValorPago = val;
                currentSaldoDevedor = 0;
              } else if (existing) {
                currentStatus = existing.status as any;
                currentDataPagamento = existing.dataPagamento;
                currentValorPago = existing.valorPago || (existing.status === 'Pago' ? val : 0);
                currentSaldoDevedor = existing.saldoDevedor !== undefined ? existing.saldoDevedor : (existing.status === 'Pago' ? 0 : val);
              }

              const pData: Pagamento = {
                id: pId,
                motoristaCpf: driverCpf,
                veiculoPlaca: v.placa,
                periodo: `IPVA Parcela ${num}`,
                valor: val,
                vencimento: dueDate,
                dataPagamento: currentDataPagamento,
                status: currentStatus,
                obs: `IPVA ${v.ipva_ano_referencia || new Date().getFullYear()} - Parcela ${num} de ${v.placa}`,
                isDespesa: true,
                valorOriginal: val,
                valorPago: currentValorPago,
                saldoDevedor: currentSaldoDevedor,
                forma: 'Boleto'
              };

              if (existingIdx > -1) {
                updated[existingIdx] = pData;
              } else {
                updated = [pData, ...updated];
              }
            } else {
              // If parcel is no longer active, filter it out
              updated = updated.filter(p => p.id !== pId);
            }
          });
        } else {
          // Cota única or single payment
          // Clean up parcel payments
          updated = updated.filter(p => !p.id.startsWith(`ipva_pay_${v.placa}_p`));

          const id = `ipva_pay_${v.placa}`;
          const existingIdx = updated.findIndex(p => p.id === id);
          
          let currentStatus: 'Pago' | 'Pendente' | 'Atrasado' = v.ipva_situacao === 'Pago' ? 'Pago' : 'Pendente';
          const dueDate = v.ipva_vencimento || todayStr;
          if (currentStatus !== 'Pago' && dueDate < todayStr) {
            currentStatus = 'Atrasado';
          }

          const discountPct = v.ipva_desconto_cota_unica || 0;
          const valorTotal = v.ipva_valor_total || 0;
          const valorComDesconto = discountPct > 0 
            ? Number((valorTotal * (1 - discountPct / 100)).toFixed(2)) 
            : valorTotal;

          const pData: Pagamento = {
            id,
            motoristaCpf: driverCpf,
            veiculoPlaca: v.placa,
            periodo: v.ipva_vencimento ? new Date(v.ipva_vencimento + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }) : 'Anual',
            valor: valorComDesconto,
            vencimento: dueDate,
            dataPagamento: v.ipva_situacao === 'Pago' ? (v.ipva_vencimento || todayStr) : undefined,
            status: currentStatus,
            obs: `IPVA ${v.ipva_ano_referencia || new Date().getFullYear()} - Veículo: ${v.placa}${discountPct > 0 ? ` (Cota única com ${discountPct}% desc.)` : ''}`,
            isDespesa: true,
            valorOriginal: valorTotal,
            valorPago: v.ipva_situacao === 'Pago' ? valorComDesconto : 0,
            saldoDevedor: v.ipva_situacao === 'Pago' ? 0 : valorComDesconto,
            forma: 'Boleto'
          };
          if (existingIdx > -1) {
            updated[existingIdx] = pData;
          } else {
            updated = [pData, ...updated];
          }
        }
      } else {
        updated = updated.filter(p => p.id !== `ipva_pay_${v.placa}` && !p.id.startsWith(`ipva_pay_${v.placa}_p`));
      }

      // 2. DPVAT
      if (v.dpvat_valor && v.dpvat_valor > 0) {
        const id = `dpvat_pay_${v.placa}`;
        const existingIdx = updated.findIndex(p => p.id === id);
        const pData: Pagamento = {
          id,
          motoristaCpf: driverCpf,
          veiculoPlaca: v.placa,
          periodo: v.dpvat_data_pagamento ? new Date(v.dpvat_data_pagamento).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }) : 'Anual',
          valor: v.dpvat_valor,
          vencimento: v.dpvat_data_pagamento || new Date().toISOString().split('T')[0],
          dataPagamento: v.dpvat_situacao === 'Pago' ? (v.dpvat_data_pagamento || new Date().toISOString().split('T')[0]) : undefined,
          status: v.dpvat_situacao === 'Pago' ? 'Pago' : 'Pendente',
          obs: `DPVAT ${v.dpvat_ano_referencia || new Date().getFullYear()} - Veículo: ${v.placa}`,
          isDespesa: true,
          valorOriginal: v.dpvat_valor,
          valorPago: v.dpvat_situacao === 'Pago' ? v.dpvat_valor : 0,
          saldoDevedor: v.dpvat_situacao === 'Pago' ? 0 : v.dpvat_valor,
          forma: 'Boleto'
        };
        if (existingIdx > -1) {
          updated = updated.map((p, i) => i === existingIdx ? pData : p);
        } else {
          updated = [pData, ...updated];
        }
      } else {
        updated = updated.filter(p => p.id !== `dpvat_pay_${v.placa}`);
      }

      // 3. Multas
      if (v.multas_valor_total && v.multas_valor_total > 0) {
        const id = `multas_pay_${v.placa}`;
        const existingIdx = updated.findIndex(p => p.id === id);
        const pData: Pagamento = {
          id,
          motoristaCpf: driverCpf,
          veiculoPlaca: v.placa,
          periodo: v.multas_data ? new Date(v.multas_data).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }) : 'Multas',
          valor: v.multas_valor_total,
          vencimento: v.multas_data || new Date().toISOString().split('T')[0],
          dataPagamento: v.multas_situacao === 'Paga' ? (v.multas_data || new Date().toISOString().split('T')[0]) : undefined,
          status: v.multas_situacao === 'Paga' ? 'Pago' : 'Pendente',
          obs: `Multas acumuladas (${v.multas_quantidade || 1}x) - Veículo: ${v.placa}`,
          isDespesa: true,
          valorOriginal: v.multas_valor_total,
          valorPago: v.multas_situacao === 'Paga' ? v.multas_valor_total : 0,
          saldoDevedor: v.multas_situacao === 'Paga' ? 0 : v.multas_valor_total,
          forma: 'Boleto'
        };
        if (existingIdx > -1) {
          updated = updated.map((p, i) => i === existingIdx ? pData : p);
        } else {
          updated = [pData, ...updated];
        }
      } else {
        updated = updated.filter(p => p.id !== `multas_pay_${v.placa}`);
      }

      // 4. Alienação / Financiamento
      if (v.alienacao_valor_parcela && v.alienacao_valor_parcela > 0) {
        const id = `alienation_pay_${v.placa}`;
        const existingIdx = updated.findIndex(p => p.id === id);
        const pData: Pagamento = {
          id,
          motoristaCpf: driverCpf,
          veiculoPlaca: v.placa,
          periodo: v.alienacao_data_pagamento ? new Date(v.alienacao_data_pagamento).toLocaleDateString('pt-BR', { month: '2-digit', year: '2-digit' }) : 'Financiamento',
          valor: v.alienacao_valor_parcela,
          vencimento: v.alienacao_data_pagamento || new Date().toISOString().split('T')[0],
          dataPagamento: v.alienacao_data_pagamento || undefined,
          status: 'Pendente',
          obs: `Parcela Financiamento (${v.alienacao_credor || 'Banco'}) - Veículo: ${v.placa} (Restam ${v.alienacao_parcelas_restantes || 0})`,
          isDespesa: true,
          valorOriginal: v.alienacao_valor_parcela,
          valorPago: 0,
          saldoDevedor: v.alienacao_valor_parcela,
          forma: 'Boleto'
        };
        if (existingIdx > -1) {
          updated = updated.map((p, i) => i === existingIdx ? pData : p);
        } else {
          updated = [pData, ...updated];
        }
      } else {
        updated = updated.filter(p => p.id !== `alienation_pay_${v.placa}`);
      }

      // V2 Sync - Map to fin.contasPagar
      setTimeout(() => {
        fin.setContasPagar(prevCP => {
          const cleanCP = prevCP.filter(cp => cp.origemTipo !== 'documentacao' || cp.origemId !== v.placa);
          
          const vehiclePayments = updated.filter(p => 
            p.id.startsWith(`ipva_pay_${v.placa}`) || 
            p.id === `dpvat_pay_${v.placa}` || 
            p.id === `multas_pay_${v.placa}` || 
            p.id === `alienation_pay_${v.placa}`
          );

          const mappedCP: ContaPagar[] = vehiclePayments.map((p, idx) => ({
            id: `pag-auto-${p.id}`,
            numeroLancamento: `PAG-${new Date().getFullYear()}-DOCS-${v.placa}-${idx}`,
            descricao: p.obs || p.periodo,
            fornecedor: p.id.includes('alienation') ? (v.alienacao_credor || 'Banco') : 'Detran / Órgão Público',
            veiculoPlaca: v.placa,
            categoria: 'DOCUMENTAÇÃO',
            subcategoria: p.id.includes('ipva') ? 'IPVA' : p.id.includes('dpvat') ? 'DPVAT' : p.id.includes('multa') ? 'Multas' : 'Financiamento',
            centroCusto: 'Legalização & Docs',
            valorOriginal: p.valorOriginal || p.valor,
            desconto: 0,
            juros: 0,
            multa: 0,
            valorFinal: p.valor,
            valorPago: p.valorPago || 0,
            saldoDevedor: p.saldoDevedor || p.valor,
            dataEmissao: p.vencimento,
            dataVencimento: p.vencimento,
            dataRealPagamento: p.dataPagamento,
            formaPagamento: 'BOLETO',
            status: p.status === 'Pago' ? 'Pago' : (p.status === 'Atrasado' ? 'Em aberto' : 'Em aberto'),
            observacoes: p.obs,
            origemTipo: 'documentacao',
            origemId: v.placa
          }));

          return [...mappedCP, ...cleanCP];
        });
      }, 0);

      return updated;
    });
  };

  // CRUD handlers - Veículos
  const handleAddVeiculo = (v: Veiculo) => {
    setVeiculos(prev => {
      const list = [v, ...prev];
      return list.map(item => {
        if (v.motoristaCpf && item.placa !== v.placa && item.motoristaCpf === v.motoristaCpf) {
          return { ...item, motoristaCpf: undefined };
        }
        return item;
      });
    });
    // Sync driver association
    setMotoristas(prev => prev.map(d => {
      if (v.motoristaCpf && d.cpf === v.motoristaCpf) {
        return { ...d, veiculoPlaca: v.placa };
      }
      if (d.veiculoPlaca === v.placa) {
        return { ...d, veiculoPlaca: undefined };
      }
      return d;
    }));
    syncVehicleInsuranceAndTracker(v);
    syncVeiculoDocsToPagamentos(v, 'add');
  };
  const handleEditVeiculo = (v: Veiculo, oldPlaca?: string) => {
    const targetPlaca = oldPlaca || v.placa;
    setVeiculos(prev => {
      // Find items to extend to all vehicles
      const itemsToExtend = (v.maint_custom_items || []).filter(item => item.extendToAll);

      const list = prev.map(item => {
        if (item.placa === targetPlaca) {
          // For the saved vehicle, remove the temporary extendToAll flag so it doesn't persist
          const cleanedItems = (v.maint_custom_items || []).map(ci => {
            const { extendToAll, ...rest } = ci;
            return rest;
          });
          return { ...v, maint_custom_items: cleanedItems };
        }

        // For other vehicles, append the items to extend if they do not already exist
        if (itemsToExtend.length > 0) {
          const updatedCustomItems = [...(item.maint_custom_items || [])];
          let updated = false;

          itemsToExtend.forEach(extendItem => {
            const exists = updatedCustomItems.some(ci => ci.label.toLowerCase() === extendItem.label.toLowerCase());
            if (!exists) {
              updatedCustomItems.push({
                id: `custom_${Date.now()}_${item.placa}_${Math.floor(Math.random() * 10000)}`,
                label: extendItem.label,
                emoji: extendItem.emoji,
                lastKm: item.km_atual, // Fresh start at their current odometer reading
                period: extendItem.period
              });
              updated = true;
            }
          });

          if (updated) {
            return { ...item, maint_custom_items: updatedCustomItems };
          }
        }

        return item;
      });

      return list.map(item => {
        if (v.motoristaCpf && item.placa !== v.placa && item.motoristaCpf === v.motoristaCpf) {
          return { ...item, motoristaCpf: undefined };
        }
        return item;
      });
    });
    // Sync driver association
    setMotoristas(prev => prev.map(d => {
      if (v.motoristaCpf && d.cpf === v.motoristaCpf) {
        return { ...d, veiculoPlaca: v.placa };
      }
      if (d.veiculoPlaca === v.placa || d.veiculoPlaca === targetPlaca) {
        return { ...d, veiculoPlaca: undefined };
      }
      return d;
    }));
    syncVehicleInsuranceAndTracker(v);
    syncVeiculoDocsToPagamentos(v, 'edit');

    if (oldPlaca && oldPlaca !== v.placa) {
      setContratos(prev => prev.map(c => c.veiculoPlaca === oldPlaca ? { ...c, veiculoPlaca: v.placa } : c));
      setManutencoes(prev => prev.map(m => m.veiculoPlaca === oldPlaca ? { ...m, veiculoPlaca: v.placa } : m));
      setDocumentos(prev => prev.map(d => d.veiculoPlaca === oldPlaca ? { ...d, veiculoPlaca: v.placa } : d));
      setApolices(prev => prev.map(a => a.veiculoPlaca === oldPlaca ? { ...a, veiculoPlaca: v.placa } : a));
      setRastreadores(prev => prev.map(r => r.veiculoPlaca === oldPlaca ? { ...r, veiculoPlaca: v.placa } : r));
      setAcessorios(prev => prev.map(a => a.veiculoPlaca === oldPlaca ? { ...a, veiculoPlaca: v.placa } : a));
    }
  };
  const handleDeleteVeiculo = (placa: string) => {
    const v = veiculos.find(item => item.placa === placa);
    if (v) {
      handleArchiveItem('Veículo', placa, v, 'Movido para o Arquivo Morto');
      triggerToast(`Veículo ${placa} movido para o Arquivo Morto!`, 'success');
      syncVeiculoDocsToPagamentos(v, 'delete');
    }
    setVeiculos(prev => prev.filter(item => item.placa !== placa));
    // Clear driver association
    setMotoristas(prev => prev.map(d => d.veiculoPlaca === placa ? { ...d, veiculoPlaca: undefined } : d));
  };
  const handleArchiveVeiculo = (placa: string, motivo: string) => {
    const v = veiculos.find(item => item.placa === placa);
    if (v) {
      handleArchiveItem('Veículo', placa, v, motivo);
      syncVeiculoDocsToPagamentos(v, 'delete');
      setVeiculos(prev => prev.filter(item => item.placa !== placa));
      // Clear driver association
      setMotoristas(prev => prev.map(d => d.veiculoPlaca === placa ? { ...d, veiculoPlaca: undefined } : d));
    }
  };

  // CRUD handlers - Motoristas
  const handleAddMotorista = (m: Motorista) => {
    setMotoristas(prev => {
      const list = [m, ...prev];
      return list.map(item => {
        if (m.veiculoPlaca && item.cpf !== m.cpf && item.veiculoPlaca === m.veiculoPlaca) {
          return { ...item, veiculoPlaca: undefined };
        }
        return item;
      });
    });
    // Sync vehicle association
    setVeiculos(prev => prev.map(v => {
      if (m.veiculoPlaca && v.placa === m.veiculoPlaca) {
        return { ...v, motoristaCpf: m.cpf };
      }
      if (v.motoristaCpf === m.cpf) {
        return { ...v, motoristaCpf: undefined };
      }
      return v;
    }));
  };
  const handleEditMotorista = (m: Motorista) => {
    setMotoristas(prev => {
      const list = prev.map(item => item.cpf === m.cpf ? m : item);
      return list.map(item => {
        if (m.veiculoPlaca && item.cpf !== m.cpf && item.veiculoPlaca === m.veiculoPlaca) {
          return { ...item, veiculoPlaca: undefined };
        }
        return item;
      });
    });
    // Sync vehicle association
    setVeiculos(prev => prev.map(v => {
      if (m.veiculoPlaca && v.placa === m.veiculoPlaca) {
        return { ...v, motoristaCpf: m.cpf };
      }
      if (v.motoristaCpf === m.cpf) {
        return { ...v, motoristaCpf: undefined };
      }
      return v;
    }));
  };
  const handleDeleteMotorista = (cpf: string) => {
    const m = motoristas.find(item => item.cpf === cpf);
    if (m) {
      handleArchiveItem('Motorista', cpf, m, 'Excluído / Movido para a lixeira');
    }
    setMotoristas(prev => prev.filter(item => item.cpf !== cpf));
    // Clear vehicle association
    setVeiculos(prev => prev.map(v => v.motoristaCpf === cpf ? { ...v, motoristaCpf: undefined } : v));
  };
  const handleArchiveMotorista = (cpf: string, motivo: string) => {
    const m = motoristas.find(item => item.cpf === cpf);
    if (m) {
      handleArchiveItem('Motorista', cpf, m, motivo);
      setMotoristas(prev => prev.filter(item => item.cpf !== cpf));
      // Clear vehicle association
      setVeiculos(prev => prev.map(v => v.motoristaCpf === cpf ? { ...v, motoristaCpf: undefined } : v));
    }
  };

  // Helper to synchronize all vehicles and drivers based on contracts list state
  const syncStatusAfterContractsChange = (updatedContracts: Contrato[]) => {
    const activeOrSuspended = updatedContracts.filter(c => c.status !== 'Finalizado');

    const vehicleToDriverMap = new Map<string, string>();
    const driverToVehicleMap = new Map<string, string>();

    activeOrSuspended.forEach(c => {
      vehicleToDriverMap.set(c.veiculoPlaca, c.motoristaCpf);
      driverToVehicleMap.set(c.motoristaCpf, c.veiculoPlaca);
    });

    setVeiculos(prev => prev.map(v => {
      const activeDriverCpf = vehicleToDriverMap.get(v.placa);
      if (activeDriverCpf) {
        return {
          ...v,
          status: 'Alugado',
          motoristaCpf: activeDriverCpf
        };
      } else {
        return {
          ...v,
          status: v.status === 'Alugado' ? 'Disponível' : v.status,
          motoristaCpf: undefined
        };
      }
    }));

    setMotoristas(prev => prev.map(m => {
      const activeVehiclePlaca = driverToVehicleMap.get(m.cpf);
      if (activeVehiclePlaca) {
        return {
          ...m,
          veiculoPlaca: activeVehiclePlaca
        };
      } else {
        return {
          ...m,
          veiculoPlaca: undefined
        };
      }
    }));
  };

  // CRUD handlers - Contratos
  const handleAddContrato = (c: Contrato) => {
    let nextContracts = [c, ...contratos];

    if (c.status === 'Ativo') {
      const olderContracts = contratos.filter(
        old => old.id !== c.id && old.status !== 'Finalizado' &&
        (old.motoristaCpf === c.motoristaCpf || old.veiculoPlaca === c.veiculoPlaca)
      );

      if (olderContracts.length > 0) {
        nextContracts = nextContracts.map(item => {
          if (olderContracts.some(o => o.id === item.id)) {
            return { ...item, status: 'Finalizado' };
          }
          return item;
        });

        olderContracts.forEach(oldC => {
          const finishedOldC: Contrato = { ...oldC, status: 'Finalizado' };
          handleArchiveItem('Contrato', oldC.id, finishedOldC, `Substituído pelo novo contrato ${c.id}`);
          syncContratoToRecebimentos(finishedOldC, 'edit');
        });
      }
    }

    setContratos(nextContracts);
    syncStatusAfterContractsChange(nextContracts);
    syncContratoToRecebimentos(c, 'add');
  };

  const handleEditContrato = (c: Contrato) => {
    let nextContracts = contratos.map(item => item.id === c.id ? c : item);

    if (c.status === 'Ativo') {
      const olderContracts = contratos.filter(
        old => old.id !== c.id && old.status !== 'Finalizado' &&
        (old.motoristaCpf === c.motoristaCpf || old.veiculoPlaca === c.veiculoPlaca)
      );

      if (olderContracts.length > 0) {
        nextContracts = nextContracts.map(item => {
          if (olderContracts.some(o => o.id === item.id)) {
            return { ...item, status: 'Finalizado' };
          }
          return item;
        });

        olderContracts.forEach(oldC => {
          const finishedOldC: Contrato = { ...oldC, status: 'Finalizado' };
          handleArchiveItem('Contrato', oldC.id, finishedOldC, `Substituído pelo contrato ativo ${c.id}`);
          syncContratoToRecebimentos(finishedOldC, 'edit');
        });
      }
    }

    setContratos(nextContracts);
    syncStatusAfterContractsChange(nextContracts);
    syncContratoToRecebimentos(c, 'edit');
    if (c.status === 'Finalizado') {
      handleArchiveItem('Contrato', c.id, c, 'Encerramento de contrato de locação');
    }
  };

  const handleDeleteContrato = (id: string, motivo: string = 'Excluído / Movido para a lixeira') => {
    const c = contratos.find(item => item.id === id);
    if (c) {
      handleArchiveItem('Contrato', id, c, motivo);
      syncContratoToRecebimentos(c, 'delete');
    }
    const nextContracts = contratos.filter(item => item.id !== id);
    setContratos(nextContracts);
    syncStatusAfterContractsChange(nextContracts);
  };

  const handleArchiveContrato = (id: string, motivo: string) => {
    const c = contratos.find(item => item.id === id);
    if (c) {
      handleArchiveItem('Contrato', id, c, motivo);
      syncContratoToRecebimentos(c, 'delete');
    }
    const nextContracts = contratos.filter(item => item.id !== id);
    setContratos(nextContracts);
    syncStatusAfterContractsChange(nextContracts);
  };

  // CRUD handlers - Pagamentos
  const handleAddPagamento = (p: Pagamento) => {
    setPagamentos(prev => [p, ...prev]);
  };
  const handleEditPagamento = (p: Pagamento) => {
    setPagamentos(prev => prev.map(item => item.id === p.id ? p : item));
  };
  const handleDeletePagamento = (id: string, motivo: string = 'Excluído / Movido para a lixeira') => {
    const p = pagamentos.find(item => item.id === id);
    if (p) {
      handleArchiveItem('Pagamento', id, p, motivo);
    }
    setPagamentos(prev => prev.filter(item => item.id !== id));
  };

  // Ação de Quitação Rápida (Settle single invoice)
  const handleQuickPay = (paymentId: string) => {
    const today = new Date().toISOString().split('T')[0];
    setPagamentos(prev => prev.map(p => {
      if (p.id === paymentId) {
        return {
          ...p,
          status: 'Pago',
          dataPagamento: today,
          forma: 'PIX',
          obs: p.obs ? `${p.obs} | Quitado via painel` : 'Liquidado via painel de controle'
        };
      }
      return p;
    }));
  };

  // CRUD handlers - Manutenção
  const handleAddManutencao = (m: Manutencao) => {
    setManutencoes(prev => [m, ...prev]);
    if (m.status === 'Em Andamento') {
      setVeiculos(prev => prev.map(v => v.placa === m.veiculoPlaca ? { ...v, status: 'Em preparação' } : v));
    }
    syncManutencaoToPagamento(m, 'add');
  };
  const handleEditManutencao = (m: Manutencao) => {
    setManutencoes(prev => prev.map(item => item.id === m.id ? m : item));
    if (m.status === 'Concluída') {
      setVeiculos(prev => prev.map(v => v.placa === m.veiculoPlaca ? { ...v, status: 'Disponível' } : v));
    } else if (m.status === 'Em Andamento') {
      setVeiculos(prev => prev.map(v => v.placa === m.veiculoPlaca ? { ...v, status: 'Em preparação' } : v));
    }
    syncManutencaoToPagamento(m, 'edit');
  };
  const handleDeleteManutencao = (id: string, motivo: string = 'Excluído / Movido para a lixeira') => {
    const m = manutencoes.find(item => item.id === id);
    if (m) {
      handleArchiveItem('Manutenção', id, m, motivo);
      syncManutencaoToPagamento(m, 'delete');
    }
    setManutencoes(prev => prev.filter(item => item.id !== id));
  };

  const syncDocumentToVehicle = (doc: Documento, action: 'add' | 'edit' | 'delete') => {
    if (doc.tipo === 'CNH' && doc.motoristaCpf) {
      setMotoristas(prev => prev.map(m => {
        if (m.cpf === doc.motoristaCpf) {
          return {
            ...m,
            cnh: doc.numero || m.cnh,
            cnh_venc: doc.vencimento || m.cnh_venc
          };
        }
        return m;
      }));
    }

    setVeiculos(prev => prev.map(v => {
      if (v.placa !== doc.veiculoPlaca) return v;

      const updated = { ...v };
      let updatedAnexos = [...(v.documentos_anexos || [])];
      
      if (action === 'delete') {
        if (doc.tipo === 'CRLV') {
          updated.crlv_vencimento = undefined;
          updated.crlv_situacao = undefined;
        } else if (doc.tipo === 'IPVA') {
          updated.ipva_vencimento = undefined;
          updated.ipva_situacao = undefined;
        } else if (doc.tipo === 'Laudo de vistoria') {
          updated.vistoria_vencimento = undefined;
          updated.vistoria_resultado = undefined;
        } else if (doc.tipo === 'Seguro') {
          updated.segurado = false;
          updated.seguro_vencimento = undefined;
          updated.seguro_apolice_numero = undefined;
        } else if (doc.tipo === 'Multas') {
          updated.multas_data = undefined;
          updated.multas_situacao = undefined;
        }
        
        // Remove from documentos_anexos if it was synced
        const cleanDocId = doc.id.replace('doc_anexo_', '');
        updatedAnexos = updatedAnexos.filter(a => a.id !== doc.id && a.id !== cleanDocId);
        updated.documentos_anexos = updatedAnexos;
        return updated;
      }

      // Add or Edit
      if (doc.tipo === 'CRLV') {
        updated.crlv_vencimento = doc.vencimento;
        updated.renavam = doc.numero;
        updated.crlv_situacao = doc.status === 'Válido' ? 'Em dia' : 'Vencido';
      } else if (doc.tipo === 'IPVA') {
        updated.ipva_vencimento = doc.vencimento;
        updated.ipva_situacao = doc.status === 'Válido' ? 'Pago' : 'Pendente';
      } else if (doc.tipo === 'Laudo de vistoria') {
        updated.vistoria_vencimento = doc.vencimento;
        updated.vistoria_resultado = doc.status === 'Válido' ? 'Aprovado' : 'Reprovado';
      } else if (doc.tipo === 'Seguro') {
        updated.segurado = doc.status === 'Válido';
        updated.seguro_vencimento = doc.vencimento;
        updated.seguro_apolice_numero = doc.numero;
        updated.seguro_vigencia_fim = doc.vencimento;
      } else if (doc.tipo === 'Multas') {
        updated.multas_data = doc.vencimento;
        updated.multas_situacao = doc.status === 'Válido' ? 'Paga' : 'Pendente';
      }

      // Handle attachment URL if provided in the document
      if (doc.url) {
        const cleanDocId = doc.id.replace('doc_anexo_', '');
        const existingAnexoIdx = updatedAnexos.findIndex(a => a.id === cleanDocId || a.id === doc.id);
        const anexoData = {
          id: cleanDocId,
          nome: doc.numero || doc.tipo,
          url: doc.url,
          data_upload: new Date().toISOString().split('T')[0]
        };

        if (existingAnexoIdx > -1) {
          updatedAnexos[existingAnexoIdx] = anexoData;
        } else {
          updatedAnexos.push(anexoData);
        }
      }

      updated.documentos_anexos = updatedAnexos;
      return updated;
    }));
  };

  // CRUD handlers - Documentos
  const handleAddDocumento = (doc: Documento) => {
    setDocumentos(prev => [doc, ...prev]);
    syncDocumentToVehicle(doc, 'add');
  };
  const handleEditDocumento = (doc: Documento) => {
    setDocumentos(prev => prev.map(item => item.id === doc.id ? doc : item));
    syncDocumentToVehicle(doc, 'edit');
  };
  const handleArchiveDocumento = (id: string, motivo: string) => {
    const doc = documentos.find(item => item.id === id);
    if (doc) {
      handleArchiveItem('Documento', id, doc, motivo);
      setDocumentos(prev => prev.filter(item => item.id !== id));
      syncDocumentToVehicle(doc, 'delete');
    }
  };

  // CRUD handlers - Seguradoras
  const handleAddSeguradora = (s: Seguradora) => {
    setSeguradoras(prev => [s, ...prev]);
  };
  const handleEditSeguradora = (s: Seguradora) => {
    setSeguradoras(prev => prev.map(item => item.id === s.id ? s : item));
  };
  const handleArchiveSeguradora = (id: string, motivo: string) => {
    const seg = seguradoras.find(item => item.id === id);
    if (seg) {
      handleArchiveItem('Seguradora', id, seg, motivo);
      setSeguradoras(prev => prev.filter(item => item.id !== id));
    }
  };

  // CRUD handlers - Apólices
  const handleAddApolice = (ap: Apolice) => {
    setApolices(prev => [ap, ...prev]);
    setVeiculos(prev => prev.map(v => v.placa === ap.veiculoPlaca ? {
      ...v,
      segurado: ap.status === 'Ativa',
      seguro_vencimento: ap.vencimento,
      seguro_seguradora: ap.seguradoraId,
      seguro_valor: ap.valor,
      seguro_apolice_numero: ap.numero,
      seguro_valor_franquia: ap.franquia,
      seguro_obs: ap.obs
    } : v));
    syncApoliceToPagamento(ap, 'add');
  };
  const handleEditApolice = (ap: Apolice) => {
    setApolices(prev => prev.map(item => item.id === ap.id ? ap : item));
    setVeiculos(prev => prev.map(v => v.placa === ap.veiculoPlaca ? {
      ...v,
      segurado: ap.status === 'Ativa',
      seguro_vencimento: ap.vencimento,
      seguro_seguradora: ap.seguradoraId,
      seguro_valor: ap.valor,
      seguro_apolice_numero: ap.numero,
      seguro_valor_franquia: ap.franquia,
      seguro_obs: ap.obs
    } : v));
    syncApoliceToPagamento(ap, 'edit');
  };
  const handleArchiveApolice = (id: string, motivo: string) => {
    const ap = apolices.find(item => item.id === id);
    if (ap) {
      handleArchiveItem('Apólice', id, ap, motivo);
      syncApoliceToPagamento(ap, 'delete');
      setApolices(prev => prev.filter(item => item.id !== id));
      setVeiculos(prev => prev.map(v => v.placa === ap.veiculoPlaca ? {
        ...v,
        segurado: false,
        seguro_vencimento: undefined,
        seguro_seguradora: undefined,
        seguro_valor: undefined,
        seguro_apolice_numero: undefined,
        seguro_valor_franquia: undefined,
        seguro_obs: undefined
      } : v));
    }
  };

  // CRUD handlers - Rastreadores
  const handleAddRastreador = (r: Rastreador) => {
    setRastreadores(prev => [r, ...prev]);
    setVeiculos(prev => prev.map(v => v.placa === r.veiculoPlaca ? {
      ...v,
      possui_rastreador: r.status === 'Ativo',
      rastreador_marca: r.marca,
      rastreador_modelo: r.modelo,
      rastreador_imei: r.imei,
      rastreador_operadora: r.operadora,
      rastreador_status: r.status,
      rastreador_obs: r.obs
    } : v));
    syncRastreadorToPagamento(r, 'add');
  };
  const handleEditRastreador = (r: Rastreador) => {
    setRastreadores(prev => prev.map(item => item.id === r.id ? r : item));
    setVeiculos(prev => prev.map(v => v.placa === r.veiculoPlaca ? {
      ...v,
      possui_rastreador: r.status === 'Ativo',
      rastreador_marca: r.marca,
      rastreador_modelo: r.modelo,
      rastreador_imei: r.imei,
      rastreador_operadora: r.operadora,
      rastreador_status: r.status,
      rastreador_obs: r.obs
    } : v));
    syncRastreadorToPagamento(r, 'edit');
  };
  const handleArchiveRastreador = (id: string, motivo: string) => {
    const r = rastreadores.find(item => item.id === id);
    if (r) {
      handleArchiveItem('Rastreador', id, r, motivo);
      syncRastreadorToPagamento(r, 'delete');
      setRastreadores(prev => prev.filter(item => item.id !== id));
      setVeiculos(prev => prev.map(v => v.placa === r.veiculoPlaca ? {
        ...v,
        possui_rastreador: false,
        rastreador_marca: undefined,
        rastreador_modelo: undefined,
        rastreador_imei: undefined,
        rastreador_operadora: undefined,
        rastreador_status: undefined,
        rastreador_obs: undefined
      } : v));
    }
  };

  // CRUD handlers - Acessórios
  const handleAddAcessorio = (ac: Acessorio) => {
    setAcessorios(prev => [ac, ...prev]);
    syncAcessorioToPagamento(ac, 'add');
  };
  const handleEditAcessorio = (ac: Acessorio) => {
    setAcessorios(prev => prev.map(item => item.id === ac.id ? ac : item));
    syncAcessorioToPagamento(ac, 'edit');
  };
  const handleArchiveAcessorio = (id: string, motivo: string) => {
    const ac = acessorios.find(item => item.id === id);
    if (ac) {
      handleArchiveItem('Acessório', id, ac, motivo);
      syncAcessorioToPagamento(ac, 'delete');
      setAcessorios(prev => prev.filter(item => item.id !== id));
    }
  };

  // Handlers - DETRAN Regras e Calendários
  const handleSaveDetranRegra = (regra: DetranRegra) => {
    setDetranRegras(prev => {
      const idx = prev.findIndex(r => r.id === regra.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = regra;
        return next;
      }
      return [regra, ...prev];
    });
  };

  const handleSaveDetranCalendario = (cal: DetranCalendarioExercicio) => {
    setDetranCalendarios(prev => {
      const idx = prev.findIndex(c => c.ano === cal.ano && c.estado === cal.estado);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = cal;
        return next;
      }
      return [cal, ...prev];
    });
  };

  // Handlers - Controle e Registro de KM
  const handleAddKmRegistro = (registro: KmRegistro) => {
    setKmRegistros(prev => [registro, ...prev]);

    // Log to KM Audit
    const audit: KmAuditLog = {
      id: `km-audit-${Date.now()}`,
      dataHora: new Date().toLocaleString('pt-BR'),
      usuario: registro.usuario || userRole,
      acao: 'Cadastro de Quilometragem',
      veiculoPlaca: registro.veiculoPlaca,
      contratoId: registro.contratoId,
      valorAnterior: registro.kmAnterior,
      valorNovo: registro.km,
      motivo: registro.observacao || 'Registro de rotina / Vistoria'
    };
    setKmAuditLogs(prev => [audit, ...prev]);
  };

  const handleAprovarCorrecaoKm = (veiculoPlaca: string, novoKm: number, motivo: string, usuario: string) => {
    const v = veiculos.find(ve => ve.placa === veiculoPlaca);
    if (!v) return;

    const kmAnterior = v.km_atual;

    // Update vehicle KM
    handleEditVeiculo({
      ...v,
      km_atual: novoKm,
      km: novoKm
    });

    // Create Correction KM Record
    const reg: KmRegistro = {
      id: `km-corr-${Date.now()}`,
      veiculoPlaca,
      dataHora: new Date().toISOString(),
      km: novoKm,
      kmAnterior,
      kmPercorridos: 0,
      usuario,
      origem: 'Registro Manual',
      observacao: `[CORREÇÃO DE DIGITAÇÃO APROVADA]: ${motivo}`,
      isCorrecaoAprovada: true,
      motivoCorrecao: motivo
    };
    setKmRegistros(prev => [reg, ...prev]);

    // Log to KM Audit
    const audit: KmAuditLog = {
      id: `km-audit-corr-${Date.now()}`,
      dataHora: new Date().toLocaleString('pt-BR'),
      usuario,
      acao: 'Correção de Digitação de KM',
      veiculoPlaca,
      valorAnterior: kmAnterior,
      valorNovo: novoKm,
      motivo
    };
    setKmAuditLogs(prev => [audit, ...prev]);
  };

  const handleApurarExcedenteKm = (apuracao: ApuracaoKmCobranca) => {
    // 1. Add apuracao
    setApuracoesKm(prev => [apuracao, ...prev]);

    // 2. Automatically create Conta a Receber in Módulo Financeiro
    const c = contratos.find(ct => ct.id === apuracao.contratoId);
    const mName = motoristas.find(m => m.cpf === apuracao.motoristaCpf)?.nome || 'Motorista';

    fin.addContaReceber({
      descricao: `KM Excedente (${apuracao.kmExcedente} km x R$ ${apuracao.valorPorKm.toFixed(2)}) — ${apuracao.veiculoPlaca}`,
      clienteResponsavel: mName,
      motoristaCpf: apuracao.motoristaCpf,
      contratoId: apuracao.contratoId,
      veiculoPlaca: apuracao.veiculoPlaca,
      categoria: 'Aluguel de Veículo',
      subcategoria: 'Quilometragem Excedente',
      centroCusto: 'Locação de Frota',
      valorOriginal: apuracao.valorTotalExcedente,
      desconto: 0,
      acrescimo: 0,
      juros: 0,
      multa: 0,
      valorFinal: apuracao.valorTotalExcedente,
      valorRecebido: 0,
      saldoDevedor: apuracao.valorTotalExcedente,
      dataEmissao: new Date().toISOString().split('T')[0],
      dataVencimento: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      status: 'Em aberto',
      periodicidade: 'Única',
      observacoes: `Cobrança automática de KM excedente. Limite contratado: ${apuracao.limiteContratado} km. Utilizado: ${apuracao.kmUtilizado} km. Excedente: ${apuracao.kmExcedente} km.`,
      origemTipo: 'contrato',
      origemId: apuracao.id
    });

    // 3. Log to Audit
    const audit: KmAuditLog = {
      id: `km-audit-apur-${Date.now()}`,
      dataHora: new Date().toLocaleString('pt-BR'),
      usuario: userRole,
      acao: 'Cobrança Automática KM Excedente',
      veiculoPlaca: apuracao.veiculoPlaca,
      contratoId: apuracao.contratoId,
      valorNovo: apuracao.valorTotalExcedente,
      motivo: `Apuração ${apuracao.dataInicial} a ${apuracao.dataFinal}. ${apuracao.kmExcedente} KM excedentes cobrados.`
    };
    setKmAuditLogs(prev => [audit, ...prev]);
  };

  // Contagem para o badge da Sidebar
  const inadimplentesCount = motoristas.filter(m => m.status === 'Inadimplente').length;

  if (isSessionClosed) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-slate-100 antialiased font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl"
        >
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-red-500/10">
            🔒
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black uppercase tracking-wider text-white">Sessão Encerrada</h1>
            <p className="text-sm text-slate-400">
              O AutoERP foi desconectado e sua sessão foi encerrada de forma segura.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-left space-y-1.5">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Resumo do Dia</span>
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Pendências restantes:</span>
              <span className={pendencies.length > 0 ? 'text-red-400' : 'text-emerald-400'}>
                {pendencies.length} pendentes
              </span>
            </div>
            {snoozedUntil && (
              <div className="text-[10px] text-amber-400/85 font-semibold">
                🔔 Lembretes adiados com sucesso até amanhã!
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsSessionClosed(false);
              clearSnooze(); // Automatically clear snooze so they can verify startup modal as well if they wish
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm py-3 rounded-xl shadow-lg shadow-red-600/10 transition-all uppercase tracking-wider cursor-pointer"
          >
            Reabrir Sistema / Entrar Novamente
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    
    <div className="flex flex-col min-h-screen">
      {hasSimulationData && (
        <div className="w-full bg-amber-500 text-black text-center font-bold text-xs py-1.5 z-[9999] uppercase tracking-wider border-b-2 border-amber-600 shadow-sm relative">
          ⚠️ BASE DE TESTE — DADOS FICTÍCIOS — NÃO UTILIZAR PARA OPERAÇÕES REAIS ⚠️
        </div>
      )}
      <div className="flex-1 bg-slate-50 flex flex-col md:flex-row text-slate-800 antialiased font-sans relative">

{/* Menu Lateral Integrado */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        inadimplentesCount={inadimplentesCount}
        userRole={userRole}
        setUserRole={setUserRole}
        onClearAllData={() => setIsResetModalOpen(true)}
        onOpenBackupManager={() => setIsBackupManagerOpen(true)}
        onExitApp={handleExitAppAttempt}
        hasSimulationData={hasSimulationData}
        onToggleSimulation={handleToggleSimulation}
      />

      {/* Área de Conteúdo Principal */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-60 pt-[52px] md:pt-0">
        
        {/* Barra de Cabeçalho do Admin */}
        <DesktopHeader title={getTabTitle(activeTab)} />

        {/* Painel Mobile Header Compensator (Informa a aba ativa em dispositivos pequenos) */}
        <MobileHeader title={getTabTitle(activeTab)} />

        {/* Hub de Abas / Roteamento Interno */}
        <main className="p-4 md:p-8 flex-1 overflow-y-auto">
          {/* Cabeçalho de Impressão (Exclusivo para Relatórios Gerados em PDF) */}
          <div className="hidden print:block mb-6 border-b-2 border-slate-900 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 uppercase tracking-tight">AutoERP — Gestão de Frotas & Locação</h1>
                <p className="text-sm font-bold text-slate-700 mt-1">Relatório Oficial: {getTabTitle(activeTab)}</p>
              </div>
              <div className="text-right text-xs text-slate-600 font-medium">
                <div>Data de Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>Sistema: AutoERP Enterprise v1.2</div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <DashboardView
                  veiculos={veiculos}
                  motoristas={motoristas}
                  contratos={contratos}
                  pagamentos={unifiedPagamentos}
                  manutencoes={manutencoes}
                  onNavigate={setActiveTab}
                  onQuickPay={handleQuickPay}
                  colorRules={colorRules}
                  onUpdateColorRules={setColorRules}
                />
              </motion.div>
            )}
            {activeTab === 'fleet_dashboard' && (
              <motion.div key="fleet_dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <FleetDashboardView
                  veiculos={veiculos}
                  contratos={contratos}
                  pagamentos={unifiedPagamentos}
                  manutencoes={manutencoes}
                  motoristas={motoristas}
                  onNavigate={setActiveTab}
                />
              </motion.div>
            )}
            {activeTab === 'veiculos' && (
              <motion.div key="veiculos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <VeiculosView
                  veiculos={veiculos}
                  motoristas={motoristas}
                  contratos={contratos}
                  pagamentos={unifiedPagamentos}
                  manutencoes={manutencoes}
                  seguradoras={seguradoras}
                  apolices={apolices}
                  contasReceber={fin.contasReceber}
                  contasPagar={fin.contasPagar}
                  onAddVeiculo={handleAddVeiculo}
                  onEditVeiculo={handleEditVeiculo}
                  onDeleteVeiculo={handleDeleteVeiculo}
                  onArchiveVeiculo={handleArchiveVeiculo}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'motoristas' && (
              <motion.div key="motoristas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <MotoristasView
                  motoristas={motoristas}
                  contratos={contratos}
                  veiculos={veiculos}
                  pagamentos={unifiedPagamentos}
                  contasReceber={fin.contasReceber}
                  contasPagar={fin.contasPagar}
                  onAddMotorista={handleAddMotorista}
                  onEditMotorista={handleEditMotorista}
                  onArchiveMotorista={handleArchiveMotorista}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'contratos' && (
              <motion.div key="contratos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <ContratosView
                  contratos={contratos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  manutencoes={manutencoes}
                  pagamentos={unifiedPagamentos}
                  onAddContrato={handleAddContrato}
                  onEditContrato={handleEditContrato}
                  onDeleteContrato={handleDeleteContrato}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'modelo_contrato' && (
              <motion.div key="modelo_contrato" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <ModeloContratoView
                  contratos={contratos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {['financeiro_dashboard', 'contas_receber', 'contas_pagar', 'fluxo_caixa', 'despesas_veiculo'].includes(activeTab) && (
              <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <FinanceiroView
                  contasReceber={fin.contasReceber}
                  contasPagar={fin.contasPagar}
                  categorias={fin.categorias}
                  formasPagamento={fin.formasPagamento}
                  historicoInadimplencia={fin.historicoInadimplencia}
                  veiculos={veiculos}
                  motoristas={motoristas}
                  contratos={contratos}
                  onRegistrarRecebimento={fin.registrarRecebimento}
                  onEstornarRecebimento={fin.estornarRecebimento}
                  onAddContaReceber={fin.addContaReceber}
                  onEditContaReceber={fin.editContaReceber}
                  onCancelContaReceber={fin.cancelContaReceber}
                  onRenegociarContaReceber={fin.renegociarContaReceber}
                  onRegistrarPagamentoDespesa={fin.registrarPagamentoDespesa}
                  onEstornarPagamentoDespesa={fin.estornarPagamentoDespesa}
                  onAddContaPagar={fin.addContaPagar}
                  onEditContaPagar={fin.editContaPagar}
                  onCancelContaPagar={fin.cancelContaPagar}
                  onAddContatoInadimplencia={fin.addContatoInadimplencia}
                  onAddCategoria={fin.addCategoria}
                  onAddFormaPagamento={fin.addFormaPagamento}
                  onToggleFormaPagamento={fin.toggleFormaPagamento}
                  onTriggerToast={triggerToast}
                  defaultSubTab={
                    activeTab === 'financeiro_dashboard' ? 'dashboard' :
                    activeTab === 'contas_receber' ? 'receber' :
                    activeTab === 'contas_pagar' ? 'pagar' :
                    activeTab === 'fluxo_caixa' ? 'fluxo_caixa' :
                    activeTab === 'despesas_veiculo' ? 'despesas_veiculo' :
                    'dashboard'
                  }
                />
              </motion.div>
            )}
            {activeTab === 'pagamentos' && (
              <motion.div key="pagamentos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <PagamentosView
                  pagamentos={unifiedPagamentos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  contratos={contratos}
                  onAddPagamento={handleAddPagamento}
                  onEditPagamento={handleEditPagamento}
                  onDeletePagamento={handleDeletePagamento}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'recebimentos' && (
              <motion.div key="recebimentos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <RecebimentosView
                  pagamentos={unifiedPagamentos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  contratos={contratos}
                  onAddRecebimento={handleAddPagamento}
                  onEditRecebimento={handleEditPagamento}
                  onDeleteRecebimento={handleDeletePagamento}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'auditoria' && (
              <motion.div key="auditoria" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <AuditoriaView
                  pagamentos={unifiedPagamentos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  contratos={contratos}
                  manutencoes={manutencoes}
                  rastreadores={rastreadores}
                  onAddPagamento={handleAddPagamento}
                  onEditPagamento={handleEditPagamento}
                  onEditMotorista={handleEditMotorista}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'manutencao' && (
              <motion.div key="manutencao" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <ManutencaoView
                  manutencoes={manutencoes}
                  veiculos={veiculos}
                  onAddManutencao={handleAddManutencao}
                  onEditManutencao={handleEditManutencao}
                  onDeleteManutencao={handleDeleteManutencao}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'km_carros' && (
              <motion.div key="km_carros" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <KmCarrosView
                  veiculos={veiculos}
                  motoristas={motoristas}
                  contratos={contratos}
                  manutencoes={manutencoes}
                  kmRegistros={kmRegistros}
                  apuracoesKm={apuracoesKm}
                  kmAuditLogs={kmAuditLogs}
                  onUpdateVeiculo={handleEditVeiculo}
                  onEditContrato={handleEditContrato}
                  onAddManutencao={handleAddManutencao}
                  onAddKmRegistro={handleAddKmRegistro}
                  onAprovarCorrecaoKm={handleAprovarCorrecaoKm}
                  onApurarExcedenteKm={handleApurarExcedenteKm}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'detran_regras' && (
              <motion.div key="detran_regras" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <DetranRegrasView
                  veiculos={veiculos}
                  detranRegras={detranRegras}
                  detranCalendarios={detranCalendarios}
                  contasPagar={fin.contasPagar}
                  onUpdateVeiculo={handleEditVeiculo}
                  onSaveDetranRegra={handleSaveDetranRegra}
                  onSaveDetranCalendario={handleSaveDetranCalendario}
                  onAddContaPagar={fin.addContaPagar}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'relatorios' && (
              <motion.div key="relatorios" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <RelatoriosView
                  veiculos={veiculos}
                  motoristas={motoristas}
                  contratos={contratos}
                  pagamentos={unifiedPagamentos}
                  manutencoes={manutencoes}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'inadimplentes' && (
              <motion.div key="inadimplentes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <InadimplentesView
                  pagamentos={unifiedPagamentos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  contratos={contratos}
                  documentos={documentos}
                  onQuickPay={handleQuickPay}
                  onNavigate={setActiveTab}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'seguradoras' && (
              <motion.div key="seguradoras" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <SeguradorasView
                  seguradoras={seguradoras}
                  apolices={apolices}
                  veiculos={veiculos}
                  onAddSeguradora={handleAddSeguradora}
                  onEditSeguradora={handleEditSeguradora}
                  onArchiveSeguradora={handleArchiveSeguradora}
                  onAddApolice={handleAddApolice}
                  onEditApolice={handleEditApolice}
                  onArchiveApolice={handleArchiveApolice}
                  onTriggerToast={triggerToast}
                  userRole={userRole}
                />
              </motion.div>
            )}
            {activeTab === 'documentos' && (
              <motion.div key="documentos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <DocumentosView
                  documentos={documentos}
                  veiculos={veiculos}
                  motoristas={motoristas}
                  onAddDocumento={handleAddDocumento}
                  onEditDocumento={handleEditDocumento}
                  onArchiveDocumento={handleArchiveDocumento}
                  onTriggerToast={triggerToast}
                  userRole={userRole}
                  colorRules={colorRules}
                />
              </motion.div>
            )}
            {activeTab === 'rastreadores' && (
              <motion.div key="rastreadores" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <RastreadoresView
                  rastreadores={rastreadores}
                  veiculos={veiculos}
                  onAddRastreador={handleAddRastreador}
                  onEditRastreador={handleEditRastreador}
                  onArchiveRastreador={handleArchiveRastreador}
                  onTriggerToast={triggerToast}
                  userRole={userRole}
                />
              </motion.div>
            )}
            {activeTab === 'acessorios' && (
              <motion.div key="acessorios" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <AcessoriosView
                  acessorios={acessorios}
                  veiculos={veiculos}
                  onAddAcessorio={handleAddAcessorio}
                  onEditAcessorio={handleEditAcessorio}
                  onArchiveAcessorio={handleArchiveAcessorio}
                  onTriggerToast={triggerToast}
                  userRole={userRole}
                />
              </motion.div>
            )}
            {activeTab === 'arquivo_morto' && (
              <motion.div key="arquivo_morto" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <ArquivoMortoView
                  arquivoMorto={arquivoMorto}
                  onRestoreItem={handleRestoreItem}
                  onDeleteArchiveItem={handleDeleteArchiveItem}
                  onTriggerToast={triggerToast}
                  userRole={userRole}
                />
              </motion.div>
            )}
            {activeTab === 'fotos_videos' && (
              <motion.div key="fotos_videos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <FotosVideosView
                  veiculos={veiculos}
                  onEditVeiculo={handleEditVeiculo}
                  onTriggerToast={triggerToast}
                />
              </motion.div>
            )}
            {activeTab === 'seguranca_status' && (
              <motion.div key="seguranca_status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                <SegurancaStatusView
                  veiculos={veiculos}
                  rastreadores={rastreadores}
                  apolices={apolices}
                  seguradoras={seguradoras}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Toast Animado */}
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* MODAL DE CONFIRMAÇÃO DE RESET TOTAL */}
      <ResetConfirmModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirmReset={handlePerformResetPlanilha}
        recordDetails={recordDetails}
        periodoStr={periodoStr}
        userRole={userRole}
        isProcessing={isResetProcessing}
      />

      {/* GERENCIADOR DE BACKUPS E RESTAURAÇÃO */}
      <BackupManagerModal
        isOpen={isBackupManagerOpen}
        onClose={() => setIsBackupManagerOpen(false)}
        backups={planilhaBackups}
        onRestoreBackup={handleRestoreBackup}
        onDeleteBackup={handleDeleteBackup}
      />

      {/* BANNER FLUTUANTE DE 30S PARA DESFAZER */}
      <UndoToastBanner
        isVisible={showUndoBanner}
        onUndo={handleUndoReset}
        onDismiss={() => setShowUndoBanner(false)}
        durationSeconds={30}
      />

      {/* MODAL DE PENDÊNCIAS E TAREFAS */}
      <AnimatePresence>
        {isPendenciasModalOpen && (
          <PendenciasModal
            isOpen={isPendenciasModalOpen}
            onClose={() => setIsPendenciasModalOpen(false)}
            mode={pendenciasModalMode}
            pendencies={pendencies}
            customTasks={customTasks}
            onAddCustomTask={addCustomTask}
            onResolveItem={resolveItem}
            onDeleteCustomTask={deleteCustomTask}
            onSnooze={handleSnoozeExit}
            onConfirmExit={handleConfirmExit}
            onCancelExit={handleCancelExit}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
