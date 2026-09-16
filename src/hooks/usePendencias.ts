import { useState, useEffect } from 'react';
import { Pagamento, Manutencao, Motorista, Contrato } from '../types';

export interface PendenciaItem {
  id: string; // Ex: "payment-#1001" or "maint-abc" or "custom-123"
  titulo: string;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  responsavel: string;
  vencimento: string; // YYYY-MM-DD
  status: 'Aberto' | 'Resolvido';
  tipo: 'Pagamento' | 'Manutenção' | 'Manual';
}

export function usePendencias(
  pagamentos: Pagamento[],
  manutencoes: Manutencao[],
  motoristas: Motorista[],
  contratos: Contrato[] = []
) {
  const [customTasks, setCustomTasks] = useState<PendenciaItem[]>(() => {
    const saved = localStorage.getItem('auto_erp_custom_tasks');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    
    // Seed some initial custom tasks for Today & Yesterday so the popup is immediately informative
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    return [
      {
        id: 'custom-seed-1',
        titulo: 'Vistoria anual de devolução do veículo STU-5678',
        prioridade: 'Alta',
        responsavel: 'Administrativo',
        vencimento: todayStr,
        status: 'Aberto',
        tipo: 'Manual'
      },
      {
        id: 'custom-seed-2',
        titulo: 'Enviar comprovante de sinistro para Corretor de Seguros',
        prioridade: 'Média',
        responsavel: 'Operador Financeiro',
        vencimento: yesterdayStr,
        status: 'Aberto',
        tipo: 'Manual'
      }
    ];
  });

  const [resolvedIds, setResolvedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('auto_erp_resolved_pendencies_ids');
    return saved ? JSON.parse(saved) : [];
  });

  const [snoozedUntil, setSnoozedUntil] = useState<string | null>(() => {
    return localStorage.getItem('auto_erp_pendencies_snoozed_until');
  });

  useEffect(() => {
    localStorage.setItem('auto_erp_custom_tasks', JSON.stringify(customTasks));
  }, [customTasks]);

  useEffect(() => {
    localStorage.setItem('auto_erp_resolved_pendencies_ids', JSON.stringify(resolvedIds));
  }, [resolvedIds]);

  // Helper to add custom manual task
  const addCustomTask = (task: Omit<PendenciaItem, 'id' | 'status' | 'tipo'>) => {
    const newTask: PendenciaItem = {
      ...task,
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'Aberto',
      tipo: 'Manual',
    };
    setCustomTasks(prev => [newTask, ...prev]);
  };

  const editCustomTask = (edited: PendenciaItem) => {
    setCustomTasks(prev => prev.map(t => t.id === edited.id ? edited : t));
  };

  const deleteCustomTask = (id: string) => {
    setCustomTasks(prev => prev.filter(t => t.id !== id));
  };

  // Helper to resolve an item (either custom task or system item)
  const resolveItem = (id: string) => {
    if (id.startsWith('custom-')) {
      setCustomTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'Resolvido' } : t));
    } else {
      setResolvedIds(prev => {
        if (!prev.includes(id)) {
          return [...prev, id];
        }
        return prev;
      });
    }
  };

  // Helper to snooze reminders until tomorrow
  const snoozeReminders = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    localStorage.setItem('auto_erp_pendencies_snoozed_until', tomorrowStr);
    setSnoozedUntil(tomorrowStr);
  };

  // Get dynamic pendencies for HOJE and ONTEM
  const getPendenciesList = (): PendenciaItem[] => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const list: PendenciaItem[] = [];

    // 1. Process custom tasks
    customTasks.forEach(task => {
      // Custom tasks match if they are due today, yesterday or are overdue and not resolved
      const isDue = task.vencimento === todayStr || task.vencimento === yesterdayStr;
      if (task.status === 'Aberto' && isDue) {
        list.push(task);
      }
    });

    // 2. Process system payments
    pagamentos.forEach(p => {
      const isDueTodayOrYesterday = p.vencimento === todayStr || p.vencimento === yesterdayStr;
      const isUnpaid = p.status === 'Pendente' || p.status === 'Atrasado';
      const id = `payment-${p.id}`;

      if (isDueTodayOrYesterday && isUnpaid && !resolvedIds.includes(id)) {
        const driverName = motoristas.find(m => m.cpf === p.motoristaCpf)?.nome || 'Motorista';
        list.push({
          id,
          titulo: `${p.isDespesa ? 'Contas a Pagar (Saída)' : 'Aluguel Pendente (Entrada)'} - R$ ${p.valor.toFixed(2)} - Ref: ${p.periodo || ''}`,
          prioridade: 'Alta',
          responsavel: driverName,
          vencimento: p.vencimento,
          status: 'Aberto',
          tipo: 'Pagamento'
        });
      }
    });

    // 3. Process maintenance
    manutencoes.forEach(m => {
      const isDueTodayOrYesterday = m.data === todayStr || m.data === yesterdayStr;
      const isNotDone = m.status === 'Agendada' || m.status === 'Em Andamento';
      const id = `maint-${m.id}`;

      if (isDueTodayOrYesterday && isNotDone && !resolvedIds.includes(id)) {
        list.push({
          id,
          titulo: `Ordem de Serviço: ${m.tipo} - Veículo: ${m.veiculoPlaca}`,
          prioridade: m.status === 'Em Andamento' ? 'Alta' : 'Média',
          responsavel: m.oficina || 'Oficina Credenciada',
          vencimento: m.data,
          status: 'Aberto',
          tipo: 'Manutenção'
        });
      }
    });

    // 4. Process Contract Renewal Warnings (15 days before end of contract)
    if (contratos && contratos.length > 0) {
      contratos.forEach(c => {
        if (c.status !== 'Finalizado' && c.fim) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const endDate = new Date(c.fim + 'T00:00:00');
          const diffMs = endDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          if (diffDays <= 15) {
            const id = `contract-renov-${c.id}`;
            if (!resolvedIds.includes(id)) {
              const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
              const motNome = mot ? mot.nome : c.motoristaCpf;
              const timeLabel = diffDays < 0
                ? `VENCIDO há ${Math.abs(diffDays)} dia(s)`
                : diffDays === 0
                ? `VENCE HOJE`
                : `vence em ${diffDays} dia(s)`;

              list.push({
                id,
                titulo: `Aviso de Renovação: Contrato ${c.id} (Veículo ${c.veiculoPlaca}) - ${timeLabel}`,
                prioridade: diffDays <= 5 ? 'Alta' : 'Média',
                responsavel: `Motorista: ${motNome}`,
                vencimento: c.fim,
                status: 'Aberto',
                tipo: 'Manual'
              });
            }
          }
        }
      });
    }

    // Sort: Priority (Alta -> Média -> Baixa) then Date
    const priorityMap = { Alta: 1, Média: 2, Baixa: 3 };
    return list.sort((a, b) => {
      const pA = priorityMap[a.prioridade] || 3;
      const pB = priorityMap[b.prioridade] || 3;
      if (pA !== pB) return pA - pB;
      return a.vencimento.localeCompare(b.vencimento);
    });
  };

  return {
    pendencies: getPendenciesList(),
    customTasks,
    addCustomTask,
    editCustomTask,
    deleteCustomTask,
    resolveItem,
    snoozeReminders,
    snoozedUntil,
    clearSnooze: () => {
      localStorage.removeItem('auto_erp_pendencies_snoozed_until');
      setSnoozedUntil(null);
    }
  };
}
