import React, { useState, useEffect } from 'react';
import {
  Wrench,
  FileText,
  Users,
  Package,
  Droplet,
  Disc,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Play,
  DollarSign,
  Car,
} from 'lucide-react';
import { AttachmentModal } from '../documents/AttachmentModal';
import { FolderOpen } from 'lucide-react';
import { Card, Button, Badge, Input, PageHeader } from '../ui';
import {
  WorkOrderRepository,
  SupplierRepository,
  PartRepository,
  VehicleRepository,
  AccountPayableRepository,
} from '../../persistence/repositories/localRepositories';
import { WorkOrder, Supplier, Part, Vehicle, AccountPayable } from '../../types/entities';
import { MaintenanceService } from '../../domain/services/MaintenanceService';

interface MaintenanceManagementProps {
  companyId?: string;
  onOpenPaymentModal?: (payable: AccountPayable) => void;
}

export const MaintenanceManagement: React.FC<MaintenanceManagementProps> = ({
  companyId,
  onOpenPaymentModal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'workOrders' | 'suppliers' | 'parts' | 'oilTires'>('workOrders');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [payables, setPayables] = useState<AccountPayable[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachmentEntity, setAttachmentEntity] = useState<any>(null);

  // Modals state
  const [isNewWoOpen, setIsNewWoOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [isNewPartOpen, setIsNewPartOpen] = useState(false);
  const [completeWoTarget, setCompleteWoTarget] = useState<WorkOrder | null>(null);
  const [exitKmInput, setExitKmInput] = useState('');

  // Form states for New WO
  const [woNumber, setWoNumber] = useState(`OS-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [woVehicleId, setWoVehicleId] = useState('');
  const [woSupplierId, setWoSupplierId] = useState('');
  const [woEntryKm, setWoEntryKm] = useState('10000');
  const [woDescription, setWoDescription] = useState('');
  const [woPartId, setWoPartId] = useState('');
  const [woPartQty, setWoPartQty] = useState('1');
  const [woLaborCost, setWoLaborCost] = useState('150');

  // Supplier form
  const [supName, setSupName] = useState('');
  const [supDoc, setSupDoc] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supCategory, setSupCategory] = useState('Oficina Mecânica');

  // Part form
  const [partCode, setPartCode] = useState('');
  const [partName, setPartName] = useState('');
  const [partCost, setPartCost] = useState('');
  const [partStock, setPartStock] = useState('10');

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    setIsLoading(true);
    if (!companyId) {
      setWorkOrders([]);
      setSuppliers([]);
      setParts([]);
      setVehicles([]);
      setPayables([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const woRepo = new WorkOrderRepository();
      const supRepo = new SupplierRepository();
      const partRepo = new PartRepository();
      const vehRepo = new VehicleRepository();
      const payRepo = new AccountPayableRepository();

      const [woList, supList, partList, vehList, payList] = await Promise.all([
        woRepo.findAllForCompany(companyId),
        supRepo.findAllForCompany(companyId),
        partRepo.findAllForCompany(companyId),
        vehRepo.findAllForCompany(companyId),
        payRepo.findAllForCompany(companyId),
      ]);

      setWorkOrders(woList);
      setSuppliers(supList);
      setParts(partList);
      setVehicles(vehList);
      setPayables(payList);

      if (vehList.length > 0 && !woVehicleId) {
        setWoVehicleId(vehList[0].id);
        setWoEntryKm(vehList[0].currentKm?.toString() || '10000');
      }
      if (supList.length > 0 && !woSupplierId) {
        setWoSupplierId(supList[0].id);
      }
    } catch (err) {
      console.error('Error loading maintenance data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedPart = parts.find((p) => p.id === woPartId);
      const partsArr = selectedPart
        ? [{ partId: selectedPart.id, description: selectedPart.name, quantity: Number(woPartQty) || 1, unitCost: selectedPart.currentCost }]
        : [];

      await MaintenanceService.createWorkOrder({
        companyId,
        number: woNumber,
        vehicleId: woVehicleId,
        supplierId: woSupplierId || undefined,
        entryKm: Number(woEntryKm) || 10000,
        description: woDescription || 'Manutenção Corretiva/Preventiva',
        parts: partsArr,
        laborItems: [{ description: 'Mão de Obra Mecânica', hours: 1, hourlyRate: Number(woLaborCost) || 150 }],
        userId: 'user-admin-1',
        userName: 'Gestor da Frota',
      });

      setIsNewWoOpen(false);
      setWoDescription('');
      await loadData();
    } catch (err: any) {
      alert('Erro ao criar OS: ' + err.message);
    }
  };

  const handleStartWo = async (id: string) => {
    try {
      await MaintenanceService.startWorkOrder(id, 'user-admin-1', 'Gestor da Frota');
      await loadData();
    } catch (err: any) {
      alert('Erro ao iniciar OS: ' + err.message);
    }
  };

  const handleCompleteWo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeWoTarget) return;
    try {
      await MaintenanceService.completeWorkOrder({
        workOrderId: completeWoTarget.id,
        exitKm: Number(exitKmInput) || (completeWoTarget.entryKm + 50),
        categoryId: 'cat-maint-exp',
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        userId: 'user-admin-1',
        userName: 'Gestor da Frota',
      });
      setCompleteWoTarget(null);
      setExitKmInput('');
      await loadData();
    } catch (err: any) {
      alert('Erro ao concluir OS: ' + err.message);
    }
  };

  const handleCancelWo = async (id: string) => {
    const reason = prompt('Informe o motivo do cancelamento da OS:');
    if (!reason) return;
    try {
      await MaintenanceService.cancelWorkOrder(id, reason, 'user-admin-1', 'Gestor da Frota');
      await loadData();
    } catch (err: any) {
      alert('Erro ao cancelar OS: ' + err.message);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await MaintenanceService.createSupplier({
        companyId,
        name: supName,
        document: supDoc,
        phone: supPhone,
        category: supCategory,
        status: 'ACTIVE',
      }, 'user-admin-1', 'Gestor da Frota');
      setIsNewSupplierOpen(false);
      setSupName('');
      setSupDoc('');
      setSupPhone('');
      await loadData();
    } catch (err: any) {
      alert('Erro ao criar fornecedor: ' + err.message);
    }
  };

  const handleCreatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await MaintenanceService.createPart({
        companyId,
        code: partCode,
        name: partName,
        category: 'Geral',
        unit: 'UN',
        currentCost: Number(partCost) || 0,
        minimumStock: 2,
        currentStock: Number(partStock) || 10,
        status: 'ACTIVE',
      }, 'user-admin-1', 'Gestor da Frota');
      setIsNewPartOpen(false);
      setPartCode('');
      setPartName('');
      setPartCost('');
      await loadData();
    } catch (err: any) {
      alert('Erro ao cadastrar peça: ' + err.message);
    }
  };

  const getVehiclePlate = (vid: string) => {
    const v = vehicles.find((x) => x.id === vid);
    return v ? `${v.plate} (${v.model})` : 'Veículo não encontrado';
  };

  const getSupplierName = (sid?: string) => {
    if (!sid) return 'N/A';
    const s = suppliers.find((x) => x.id === sid);
    return s ? s.name : 'N/A';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="neutral">Aberta</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">Em Andamento</Badge>;
      case 'WAITING_PARTS':
        return <Badge variant="warning">Aguardando Peças</Badge>;
      case 'WAITING_APPROVAL':
        return <Badge variant="warning">Aguardando Aprovação</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">Concluída</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelada</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Metrics
  const openWos = workOrders.filter((w) => w.status !== 'COMPLETED' && w.status !== 'CANCELLED').length;
  const vehiclesInMaint = vehicles.filter((v) => v.status === 'MAINTENANCE').length;
  const totalMaintCost = workOrders
    .filter((w) => w.status === 'COMPLETED')
    .reduce((acc, w) => acc + w.total, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Manutenção & Oficinas"
        description="Ordens de serviço, peças, fornecedores, troca de óleo, pneus e integração controlada com Contas a Pagar"
        breadcrumb="Operação • Gestão de Manutenção"
        primaryAction={{
          label: 'Nova Ordem de Serviço',
          onClick: () => setIsNewWoOpen(true),
          icon: <Plus className="w-4 h-4" />
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card padding="sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">OS Abertas / Ativas</span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-mono">{openWos}</h3>
        </Card>
        <Card padding="sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Veículos em Manutenção</span>
          <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">{vehiclesInMaint}</h3>
        </Card>
        <Card padding="sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Fornecedores Cadastrados</span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-mono">{suppliers.length}</h3>
        </Card>
        <Card padding="sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Custo Total Concluído</span>
          <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
            R$ {totalMaintCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </h3>
        </Card>
      </div>

      {/* Subtabs navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveSubTab('workOrders')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'workOrders'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          Ordens de Serviço ({workOrders.length})
        </button>
        <button
          onClick={() => setActiveSubTab('suppliers')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'suppliers'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          Fornecedores / Oficinas ({suppliers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('parts')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'parts'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          Catálogo de Peças ({parts.length})
        </button>
        <button
          onClick={() => setActiveSubTab('oilTires')}
          className={`pb-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'oilTires'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Droplet className="w-4 h-4" />
          Óleo & Pneus
        </button>
      </div>

      {/* Subtab Content */}
      {activeSubTab === 'workOrders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="w-full max-w-sm">
              <Input
                placeholder="Buscar por número da OS, veículo ou fornecedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search className="w-4 h-4 text-slate-400" />}
              />
            </div>
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="p-3.5">Número / Data</th>
                    <th className="p-3.5">Veículo</th>
                    <th className="p-3.5">Fornecedor</th>
                    <th className="p-3.5">Descrição</th>
                    <th className="p-3.5">KM (Entrada/Saída)</th>
                    <th className="p-3.5">Total</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {workOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        Nenhuma ordem de serviço cadastrada.
                      </td>
                    </tr>
                  ) : (
                    workOrders.map((wo) => {
                      const payable = payables.find((p) => p.id === wo.accountPayableId);
                      return (
                        <tr key={wo.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                          <td className="p-3.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                            {wo.number}
                            <span className="block text-[10px] text-slate-400 font-sans">
                              {new Date(wo.openedAt).toLocaleDateString('pt-BR')}
                            </span>
                          </td>
                          <td className="p-3.5 font-medium text-slate-800 dark:text-slate-200">
                            {getVehiclePlate(wo.vehicleId)}
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-400">
                            {getSupplierName(wo.supplierId)}
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                            {wo.description}
                          </td>
                          <td className="p-3.5 font-mono text-slate-600 dark:text-slate-400">
                            {wo.entryKm} km {wo.exitKm ? `→ ${wo.exitKm} km` : ''}
                          </td>
                          <td className="p-3.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                            R$ {wo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5">{getStatusBadge(wo.status)}</td>
                          <td className="p-3.5 text-right space-x-2">
                            {wo.status === 'OPEN' && (
                              <button
                                onClick={() => handleStartWo(wo.id)}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                Iniciar
                              </button>
                            )}
                            {wo.status === 'IN_PROGRESS' && (
                              <button
                                onClick={() => setCompleteWoTarget(wo)}
                                className="text-emerald-600 hover:underline font-medium"
                              >
                                Concluir
                              </button>
                            )}
                            {wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED' && (
                              <button
                                onClick={() => handleCancelWo(wo.id)}
                                className="text-red-600 hover:underline font-medium"
                              >
                                Cancelar
                              </button>
                            )}
                            {wo.status === 'COMPLETED' && payable && onOpenPaymentModal && (
                              <button
                                onClick={() => onOpenPaymentModal(payable)}
                                className="text-indigo-600 hover:underline font-medium"
                              >
                                Pagar Título
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeSubTab === 'suppliers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Lista de Fornecedores & Oficinas</h3>
            <Button
              onClick={() => setIsNewSupplierOpen(true)}
              variant="primary"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              icon={<Plus className="w-4 h-4" />}
            >
              Novo Fornecedor
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {suppliers.map((sup) => (
              <Card key={sup.id} padding="md" className="space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-slate-100">{sup.name}</h4>
                    <span className="text-[11px] text-slate-500 font-mono">{sup.document}</span>
                  </div>
                  <Badge variant={sup.status === 'ACTIVE' ? 'success' : 'neutral'}>{sup.status}</Badge>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p>Categoria: {sup.category}</p>
                  <p>Telefone: {sup.phone}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'parts' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Catálogo de Peças e Insumos</h3>
            <Button
              onClick={() => setIsNewPartOpen(true)}
              variant="primary"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              icon={<Plus className="w-4 h-4" />}
            >
              Nova Peça
            </Button>
          </div>

          <Card padding="none">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3.5">Código</th>
                  <th className="p-3.5">Nome da Peça</th>
                  <th className="p-3.5">Categoria</th>
                  <th className="p-3.5">Custo Unitário</th>
                  <th className="p-3.5">Estoque Atual</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {parts.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3.5 font-mono font-medium">{p.code}</td>
                    <td className="p-3.5 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                    <td className="p-3.5 text-slate-600 dark:text-slate-400">{p.category}</td>
                    <td className="p-3.5 font-mono">R$ {p.currentCost.toFixed(2)}</td>
                    <td className="p-3.5 font-mono font-bold text-slate-800 dark:text-slate-200">{p.currentStock} {p.unit}</td>
                    <td className="p-3.5"><Badge variant="success">{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {activeSubTab === 'oilTires' && (
        <div className="space-y-4">
          <Card padding="md" className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Droplet className="w-4 h-4 text-blue-500" /> Histórico de Trocas de Óleo & Pneus
            </h3>
            <p className="text-xs text-slate-500">
              Registros integrados por veículo para monitoramento de quilometragem e preventivas.
            </p>
          </Card>
        </div>
      )}

      {/* New Work Order Modal */}
      {isNewWoOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Nova Ordem de Serviço</h3>
            <form onSubmit={handleCreateWorkOrder} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Número da OS</label>
                <Input value={woNumber} onChange={(e) => setWoNumber(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Veículo</label>
                <select
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs"
                  value={woVehicleId}
                  onChange={(e) => setWoVehicleId(e.target.value)}
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.model} ({v.currentKm || 0} km)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Fornecedor / Oficina</label>
                <select
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs"
                  value={woSupplierId}
                  onChange={(e) => setWoSupplierId(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">KM de Entrada</label>
                  <Input type="number" value={woEntryKm} onChange={(e) => setWoEntryKm(e.target.value)} required />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Peça Principal</label>
                  <select
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs"
                    value={woPartId}
                    onChange={(e) => setWoPartId(e.target.value)}
                  >
                    <option value="">Nenhuma peça</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} (R$ {p.currentCost})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Descrição / Diagnóstico</label>
                <textarea
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs"
                  rows={3}
                  value={woDescription}
                  onChange={(e) => setWoDescription(e.target.value)}
                  placeholder="Relate os serviços ou defeitos a serem reparados..."
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setIsNewWoOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" className="bg-blue-600 text-white">Criar OS (FinancialTransaction = 0)</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Complete Work Order Modal */}
      {completeWoTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Concluir OS #{completeWoTarget.number}
            </h3>
            <p className="text-xs text-slate-500">
              Ao concluir a OS, o veículo retornará ao status disponível e será gerado um título em <strong>Contas a Pagar (AccountPayable)</strong>. Nenhuma movimentação de caixa é realizada até a liquidação efetiva.
            </p>
            <form onSubmit={handleCompleteWo} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">KM de Saída</label>
                <Input
                  type="number"
                  value={exitKmInput}
                  onChange={(e) => setExitKmInput(e.target.value)}
                  placeholder={(completeWoTarget.entryKm + 50).toString()}
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setCompleteWoTarget(null)}>Cancelar</Button>
                <Button type="submit" variant="primary" className="bg-emerald-600 text-white">Confirmar Conclusão & Gerar Payable</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* New Supplier Modal */}
      {isNewSupplierOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Cadastrar Fornecedor / Oficina</h3>
            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Nome / Razão Social</label>
                <Input value={supName} onChange={(e) => setSupName(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">CNPJ / CPF</label>
                <Input value={supDoc} onChange={(e) => setSupDoc(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Telefone</label>
                <Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Categoria</label>
                <Input value={supCategory} onChange={(e) => setSupCategory(e.target.value)} required />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setIsNewSupplierOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" className="bg-blue-600 text-white">Salvar Fornecedor</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* New Part Modal */}
      {isNewPartOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Cadastrar Peça</h3>
            <form onSubmit={handleCreatePart} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Código da Peça</label>
                <Input value={partCode} onChange={(e) => setPartCode(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Nome da Peça</label>
                <Input value={partName} onChange={(e) => setPartName(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Custo Unitário (R$)</label>
                <Input type="number" step="0.01" value={partCost} onChange={(e) => setPartCost(e.target.value)} required />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Estoque Inicial</label>
                <Input type="number" value={partStock} onChange={(e) => setPartStock(e.target.value)} required />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button type="button" variant="ghost" onClick={() => setIsNewPartOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" className="bg-blue-600 text-white">Salvar Peça</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {attachmentEntity && (
        <AttachmentModal
          isOpen={!!attachmentEntity}
          onClose={() => setAttachmentEntity(null)}
          entityType="MaintenanceWorkOrder"
          entityId={attachmentEntity.id}
          documentType="MAINTENANCE_DOCUMENT"
          title={`Anexos: OS ${attachmentEntity.osNumber}`}
        />
      )}
    </div>
  );
};
