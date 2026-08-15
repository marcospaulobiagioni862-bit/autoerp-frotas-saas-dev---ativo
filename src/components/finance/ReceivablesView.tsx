import React, { useEffect, useState } from 'react';
import { AccountReceivableRepository } from '../../persistence/repositories/localRepositories';
import { AccountReceivable } from '../../types/entities';
import { ObligationStatus, OriginType } from '../../types/enums';
import { FinanceEngine } from '../../domain/finance/FinanceEngine';
import { useAuth } from '../../hooks/useAuth';
import {
  TrendingUp,
  Search,
  Filter,
  RefreshCw,
  X,
  Plus,
} from 'lucide-react';
import { AttachmentModal } from '../documents/AttachmentModal';
import { FolderOpen } from 'lucide-react';
import { Card, Button, Badge, Input, ConfirmDialog, Skeleton, ModalContainer, Select } from '../ui';

interface ReceivablesViewProps {
  onOpenReceiptModal: (receivable: AccountReceivable) => void;
  onOpenRenegotiationModal: (receivables: AccountReceivable[]) => void;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({
  onOpenReceiptModal,
  onOpenRenegotiationModal,
}) => {
  const { user } = useAuth();
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [attachmentEntity, setAttachmentEntity] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Manual Creation State
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [competenceDate, setCompetenceDate] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('cat-manual');
  const [installmentsCount, setInstallmentsCount] = useState<string>('1');
  const [driverId, setDriverId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [contractId, setContractId] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);

  // Cancellation confirm dialog state
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  useEffect(() => {
    loadReceivables();
  }, []);

  const loadReceivables = async () => {
    setLoading(true);
    const repo = new AccountReceivableRepository();
    const list = await repo.findAll({ companyId: user.companyId });
    setReceivables(list.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()));
    setLoading(false);
  };

  const handleCreateReceivable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !totalAmount || !dueDate) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }
    setCreateLoading(true);
    try {
      await FinanceEngine.createReceivable({
        companyId: user.companyId,
        originType: OriginType.MANUAL,
        originId: 'manual-' + Date.now(),
        categoryId,
        description,
        totalAmount: parseFloat(totalAmount),
        dueDate,
        competenceDate: competenceDate || dueDate,
        installmentsCount: parseInt(installmentsCount) || 1,
        driverId: driverId.trim() || undefined,
        vehicleId: vehicleId.trim() || undefined,
        contractId: contractId.trim() || undefined,
        userId: user.userId,
        userName: user.name,
      });
      setActionMessage('Novo título a receber criado com sucesso!');
      setIsCreateOpen(false);
      // Reset form
      setDescription('');
      setTotalAmount('');
      setDueDate('');
      setCompetenceDate('');
      setCategoryId('cat-manual');
      setInstallmentsCount('1');
      setDriverId('');
      setVehicleId('');
      setContractId('');
      // Reload
      await loadReceivables();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar título a receber.');
    } finally {
      setCreateLoading(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTargetId) return;
    try {
      const item = receivables.find((r) => r.id === cancelTargetId);
      if (!item || item.companyId !== user.companyId) {
        alert('Erro de tenant: O título a receber não pertence à empresa da sessão atual.');
        setCancelTargetId(null);
        return;
      }
      await FinanceEngine.cancelReceivable(
        user.companyId,
        cancelTargetId,
        'Cancelamento via interface',
        user.userId,
        user.name
      );
      setActionMessage('Título a receber cancelado com sucesso.');
      setCancelTargetId(null);
      loadReceivables();
    } catch (err: any) {
      alert(err.message || 'Erro ao cancelar título');
      setCancelTargetId(null);
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const filtered = receivables.filter((r) => {
    const matchesSearch =
      r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.driverId && r.driverId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (r.vehicleId && r.vehicleId.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedReceivables = receivables.filter((r) => selectedIds.includes(r.id));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Contas a Receber (Receivables)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão de mensalidades, cobranças de motoristas e cauções a receber.
          </p>
        </div>

        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <Button
              onClick={() => onOpenRenegotiationModal(selectedReceivables)}
              variant="warning"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Renegociar Selecionados ({selectedIds.length})
            </Button>
          )}

          <Button
            onClick={() => setIsCreateOpen(true)}
            variant="primary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            className="!bg-emerald-600 hover:!bg-emerald-700 !text-white font-semibold"
          >
            Novo Recebível Manual
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="p-1 font-bold text-slate-500 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              type="text"
              placeholder="Buscar por descrição, motorista, veículo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
            {['ALL', ObligationStatus.PENDING, ObligationStatus.PAID, ObligationStatus.CANCELLED, ObligationStatus.RENEGOTIATED].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                  statusFilter === st
                    ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {st === 'ALL'
                  ? 'Todos'
                  : st === ObligationStatus.PENDING
                  ? 'Pendentes'
                  : st === ObligationStatus.PAID
                  ? 'Pagas'
                  : st === ObligationStatus.CANCELLED
                  ? 'Canceladas'
                  : 'Renegociadas'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-3.5 w-10 text-center">#</th>
                  <th className="p-3.5">Descrição / Origem</th>
                  <th className="p-3.5">Vencimento</th>
                  <th className="p-3.5">Valor Original</th>
                  <th className="p-3.5">Saldo Restante</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Ações Operacionais</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filtered.map((item) => {
                  const isPending = item.status === ObligationStatus.PENDING || item.status === ObligationStatus.PARTIALLY_PAID;
                  const isPaid = item.status === ObligationStatus.PAID;
                  const isOverdue = isPending && item.dueDate < new Date().toISOString().split('T')[0];

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          disabled={!isPending}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{item.description}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Origem: {item.originType} • Chave: {item.idempotencyKey}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono tabular-nums">
                        {item.dueDate}
                        {isOverdue && (
                          <span className="block text-[10px] text-red-600 dark:text-red-400 font-bold">EM ATRASO</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums font-semibold">
                        R$ {item.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                        R$ {item.balanceAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center">
                        <Badge
                          variant={
                            isPaid
                              ? 'success'
                              : isPending
                              ? isOverdue
                                ? 'danger'
                                : 'warning'
                              : 'neutral'
                          }
                        >
                          {item.status}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right space-x-2">
                        {isPending && (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onOpenReceiptModal(item)}
                            className="!bg-emerald-600 hover:!bg-emerald-700 !text-white"
                          >
                            Liquidar (Receber)
                          </Button>
                        )}

                        {isPending && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelTargetId(item.id)}
                            className="text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            Cancelar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!cancelTargetId}
        title="Cancelar Título a Receber"
        message="Deseja realmente cancelar este título a receber? Esta operação será auditada e enviada via FinanceEngine."
        confirmText="Confirmar Cancelamento"
        confirmVariant="danger"
        onConfirm={confirmCancel}
        onCancel={() => setCancelTargetId(null)}
      />

      {/* MODAL DE CRIAÇÃO MANUAL */}
      {isCreateOpen && (
        <ModalContainer
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Emitir Título a Receber (Receivable Manual)"
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleCreateReceivable} className="space-y-4">
            <Input
              label="Descrição do Título *"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Mensalidade Avulsa, Cobrança de Sinistro..."
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Valor Total (R$) *"
                type="number"
                step="0.01"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0.00"
                required
              />

              <Input
                label="Vencimento *"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Data de Competência"
                type="date"
                value={competenceDate}
                onChange={(e) => setCompetenceDate(e.target.value)}
                placeholder="Opcional"
              />

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 block">Categoria *</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                  required
                >
                  <option value="cat-rent">Aluguel / Locação</option>
                  <option value="cat-deposit">Caução / Depósito</option>
                  <option value="cat-ticket">Multa de Trânsito</option>
                  <option value="cat-manual">Outros Recebimentos</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Parcelas"
                type="number"
                min="1"
                value={installmentsCount}
                onChange={(e) => setInstallmentsCount(e.target.value)}
              />

              <Input
                label="Motorista ID (Opcional)"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                placeholder="Ex: drv-1"
              />

              <Input
                label="Veículo ID (Opcional)"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                placeholder="Ex: veh-1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={createLoading} className="!bg-emerald-600 hover:!bg-emerald-700 !text-white">
                Emitir Título
              </Button>
            </div>
          </form>
        </ModalContainer>
      )}

      {attachmentEntity && (
        <AttachmentModal
          isOpen={!!attachmentEntity}
          onClose={() => setAttachmentEntity(null)}
          entityType="FinancialReceivable"
          entityId={attachmentEntity.id}
          documentType="FINANCIAL_DOCUMENT"
          title={`Anexos: ${attachmentEntity.description}`}
        />
      )}
    </div>
  );
};

