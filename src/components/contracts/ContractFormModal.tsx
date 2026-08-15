import React, { useState, useEffect } from 'react';
import {
  FileText,
  Car,
  User,
  Calendar,
  DollarSign,
  AlertCircle,
  Clock,
  ShieldAlert,
  Save,
  X,
} from 'lucide-react';
import {
  ModalContainer,
  Card,
  Button,
  Input,
  Select,
} from '../ui';
import {
  VehicleRepository,
  DriverRepository,
  ContractRepository,
} from '../../persistence/repositories/localRepositories';
import { ContractService } from '../../domain/services/ContractService';
import { Vehicle, Driver, Contract } from '../../types/entities';
import { ContractStatus, RecurringFrequency, VehicleStatus, DriverStatus } from '../../types/enums';

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractToEdit?: Contract | null;
  companyId: string;
  onSuccess: () => void;
}

export const ContractFormModal: React.FC<ContractFormModalProps> = ({
  isOpen,
  onClose,
  contractToEdit,
  companyId,
  onSuccess,
}) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Form State
  const [contractNumber, setContractNumber] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ContractStatus>(ContractStatus.DRAFT);
  const [rentalAmount, setRentalAmount] = useState<number | ''>(700);
  const [billingPeriodicity, setBillingPeriodicity] = useState<RecurringFrequency>(
    RecurringFrequency.WEEKLY
  );
  const [billingDueDayOfWeek, setBillingDueDayOfWeek] = useState<number>(1);
  const [billingDueDayOfMonth, setBillingDueDayOfMonth] = useState<number>(1);
  const [securityDepositAmount, setSecurityDepositAmount] = useState<number | ''>(1000);
  const [franchiseKm, setFranchiseKm] = useState<number | ''>(1500);
  const [excessKmRate, setExcessKmRate] = useState<number | ''>(0.5);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const vehicleRepo = new VehicleRepository();
        const driverRepo = new DriverRepository();

        const [allVehicles, allDrivers] = await Promise.all([
          vehicleRepo.findAll({ companyId }),
          driverRepo.findAll({ companyId }),
        ]);

        // Filtrar veículos válidos (AVAILABLE ou associados ao contrato atual)
        const validVehicles = allVehicles.filter(
          (v) =>
            !v.isArchived &&
            v.status !== VehicleStatus.SOLD &&
            v.status !== VehicleStatus.INACTIVE &&
            (v.status === VehicleStatus.AVAILABLE ||
              (contractToEdit && v.id === contractToEdit.vehicleId))
        );

        // Filtrar motoristas válidos (não arquivados, não bloqueados)
        const validDrivers = allDrivers.filter(
          (d) =>
            !d.isArchived &&
            d.status !== DriverStatus.INACTIVE &&
            d.status !== DriverStatus.BLOCKED &&
            (d.status === DriverStatus.ACTIVE ||
              d.status === DriverStatus.PENDING ||
              d.status === DriverStatus.PENDING_DOCS ||
              (contractToEdit && d.id === contractToEdit.driverId))
        );

        setVehicles(validVehicles);
        setDrivers(validDrivers);

        if (contractToEdit) {
          setContractNumber(contractToEdit.contractNumber);
          setVehicleId(contractToEdit.vehicleId);
          setDriverId(contractToEdit.driverId);
          setStartDate(contractToEdit.startDate);
          setEndDate(contractToEdit.endDate || '');
          setStatus(contractToEdit.status);
          setRentalAmount(contractToEdit.rentalAmount);
          setBillingPeriodicity(contractToEdit.billingPeriodicity);
          setBillingDueDayOfWeek(contractToEdit.billingDueDayOfWeek || 1);
          setBillingDueDayOfMonth(contractToEdit.billingDueDayOfMonth || 1);
          setSecurityDepositAmount(contractToEdit.securityDepositAmount);
          setFranchiseKm(contractToEdit.franchiseKm || 1500);
          setExcessKmRate(contractToEdit.excessKmRate || 0.5);
          setNotes(contractToEdit.notes || '');
        } else {
          // Reset para criação
          const today = new Date().toISOString().split('T')[0];
          const dateStr = today.replace(/-/g, '');
          const randStr = Math.floor(1000 + Math.random() * 9000);

          setContractNumber(`CNT-${dateStr}-${randStr}`);
          setVehicleId(validVehicles[0]?.id || '');
          setDriverId(validDrivers[0]?.id || '');
          setStartDate(today);
          setEndDate('');
          setStatus(ContractStatus.DRAFT);
          setRentalAmount(700);
          setBillingPeriodicity(RecurringFrequency.WEEKLY);
          setBillingDueDayOfWeek(1);
          setBillingDueDayOfMonth(1);
          setSecurityDepositAmount(1000);
          setFranchiseKm(1500);
          setExcessKmRate(0.5);
          setNotes('');
        }
      } catch (err) {
        console.error('Erro ao carregar opções para formulário de contrato:', err);
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
    setError(null);
  }, [isOpen, contractToEdit, companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vehicleId) {
      setError('Selecione um veículo para o contrato.');
      return;
    }
    if (!driverId) {
      setError('Selecione um motorista para o contrato.');
      return;
    }
    if (!startDate) {
      setError('A data de início do contrato é obrigatória.');
      return;
    }
    if (rentalAmount === '' || Number(rentalAmount) <= 0) {
      setError('Informe um valor de aluguel maior que zero.');
      return;
    }

    setLoading(true);

    try {
      const contractService = new ContractService();

      if (contractToEdit) {
        // Atualização
        await contractService.updateContract(contractToEdit.id, {
          contractNumber,
          vehicleId,
          driverId,
          startDate,
          endDate: endDate || undefined,
          rentalAmount: Number(rentalAmount),
          billingPeriodicity,
          billingDueDayOfWeek: Number(billingDueDayOfWeek),
          billingDueDayOfMonth: Number(billingDueDayOfMonth),
          securityDepositAmount: Number(securityDepositAmount || 0),
          franchiseKm: Number(franchiseKm || 0),
          excessKmRate: Number(excessKmRate || 0),
          notes,
          userId: 'usr-admin',
          userName: 'Administrador',
        });

        // Se alterou status para ACTIVE
        if (status === ContractStatus.ACTIVE && contractToEdit.status !== ContractStatus.ACTIVE) {
          await contractService.activateContract({
            companyId,
            contractId: contractToEdit.id,
            userId: 'usr-admin',
            userName: 'Administrador',
          });
        }
      } else {
        // Criação
        await contractService.createContract({
          companyId,
          contractNumber,
          vehicleId,
          driverId,
          startDate,
          endDate: endDate || undefined,
          rentalAmount: Number(rentalAmount),
          billingPeriodicity,
          billingDueDayOfWeek: Number(billingDueDayOfWeek),
          billingDueDayOfMonth: Number(billingDueDayOfMonth),
          securityDepositAmount: Number(securityDepositAmount || 0),
          franchiseKm: Number(franchiseKm || 0),
          excessKmRate: Number(excessKmRate || 0),
          notes,
          status,
          userId: 'usr-admin',
          userName: 'Administrador',
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar contrato.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-600" />
          {contractToEdit ? 'Editar Contrato de Locação' : 'Novo Contrato de Locação'}
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/80 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* DADOS BÁSICOS DO CONTRATO */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
            <FileText className="w-4 h-4 text-emerald-600" />
            Identificação & Partes
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nº do Contrato *
              </label>
              <Input
                type="text"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
                placeholder="Ex: CNT-202608-001"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Veículo *
              </label>
              <Select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                required
                disabled={loadingOptions}
              >
                <option value="">Selecione o Veículo...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.brand} {v.model} - Placa: {v.plate}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Motorista *
              </label>
              <Select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                required
                disabled={loadingOptions}
              >
                <option value="">Selecione o Motorista...</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fullName} (CPF: {d.cpf})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* VIGÊNCIA E STATUS */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
            <Calendar className="w-4 h-4 text-emerald-600" />
            Vigência & Status do Ciclo de Vida
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data Inicial *
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data Final (Opcional)
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Status Inicial
              </label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ContractStatus)}
                disabled={!!contractToEdit && contractToEdit.status === ContractStatus.ACTIVE}
              >
                <option value={ContractStatus.DRAFT}>Rascunho (DRAFT)</option>
                <option value={ContractStatus.AWAITING_SIGNATURE}>Aguardando Assinatura</option>
                <option value={ContractStatus.ACTIVE}>Ativo (ACTIVE)</option>
              </Select>
            </div>
          </div>
        </div>

        {/* VALORES E RECORRÊNCIA */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-1.5">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Condições Financeiras & Recorrência
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Valor da Locação (R$) *
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={rentalAmount}
                onChange={(e) => setRentalAmount(e.target.value ? Number(e.target.value) : '')}
                placeholder="700.00"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Periodicidade de Cobrança *
              </label>
              <Select
                value={billingPeriodicity}
                onChange={(e) => setBillingPeriodicity(e.target.value as RecurringFrequency)}
              >
                <option value={RecurringFrequency.WEEKLY}>Semanal</option>
                <option value={RecurringFrequency.MONTHLY}>Mensal</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {billingPeriodicity === RecurringFrequency.WEEKLY
                  ? 'Dia do Vencimento (Semanal)'
                  : 'Dia do Vencimento (Mensal)'}
              </label>
              {billingPeriodicity === RecurringFrequency.WEEKLY ? (
                <Select
                  value={billingDueDayOfWeek}
                  onChange={(e) => setBillingDueDayOfWeek(Number(e.target.value))}
                >
                  <option value={1}>Segunda-feira</option>
                  <option value={2}>Terça-feira</option>
                  <option value={3}>Quarta-feira</option>
                  <option value={4}>Quinta-feira</option>
                  <option value={5}>Sexta-feira</option>
                  <option value={6}>Sábado</option>
                  <option value={7}>Domingo</option>
                </Select>
              ) : (
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={billingDueDayOfMonth}
                  onChange={(e) => setBillingDueDayOfMonth(Number(e.target.value))}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Valor da Caução (R$)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={securityDepositAmount}
                onChange={(e) =>
                  setSecurityDepositAmount(e.target.value ? Number(e.target.value) : '')
                }
                placeholder="1000.00"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Franquia de KM (período)
              </label>
              <Input
                type="number"
                value={franchiseKm}
                onChange={(e) => setFranchiseKm(e.target.value ? Number(e.target.value) : '')}
                placeholder="1500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Taxa KM Excedente (R$/km)
              </label>
              <Input
                type="number"
                step="0.01"
                value={excessKmRate}
                onChange={(e) => setExcessKmRate(e.target.value ? Number(e.target.value) : '')}
                placeholder="0.50"
              />
            </div>
          </div>
        </div>

        {/* OBSERVAÇÕES */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Observações Gerais / Cláusulas Especiais
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anotações adicionais do contrato..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* BOTÕES */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={loading}
            icon={<Save className="w-4 h-4 mr-1" />}
          >
            {contractToEdit ? 'Atualizar Contrato' : 'Salvar Contrato'}
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};
