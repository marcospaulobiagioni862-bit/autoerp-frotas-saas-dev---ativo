import React, { useState, useEffect } from 'react';
import { TrafficTicketService, CreateTrafficTicketDTO } from '../../domain/services/TrafficTicketService';
import { VehicleRepository, DriverRepository, ContractRepository } from '../../persistence/repositories/localRepositories';
import { Vehicle, Driver, Contract } from '../../types/entities';
import { TicketResponsibility } from '../../types/enums';
import { ModalContainer, Input, Select, Button, Card } from '../ui';
import { AlertTriangle, Car, User, DollarSign, FileText, Calendar } from 'lucide-react';

interface TrafficTicketFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: () => void;
  initialVehicleId?: string;
  initialDriverId?: string;
}

export const TrafficTicketFormModal: React.FC<TrafficTicketFormModalProps> = ({
  isOpen,
  onClose,
  companyId,
  onSuccess,
  initialVehicleId,
  initialDriverId,
}) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [vehicleId, setVehicleId] = useState<string>(initialVehicleId || '');
  const [driverId, setDriverId] = useState<string>(initialDriverId || '');
  const [autoNumber, setAutoNumber] = useState<string>('');
  const [organName, setOrganName] = useState<string>('DETRAN');
  const [infractionCode, setInfractionCode] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [infractionDate, setInfractionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [discountDueDate, setDiscountDueDate] = useState<string>('');
  const [originalAmount, setOriginalAmount] = useState<string>('195.23');
  const [discountedAmount, setDiscountedAmount] = useState<string>('');
  const [points, setPoints] = useState<string>('4');
  const [responsibility, setResponsibility] = useState<TicketResponsibility>(
    TicketResponsibility.DRIVER
  );
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
      setError(null);
    }
  }, [isOpen]);

  const loadInitialData = async () => {
    setLoadingData(true);
    try {
      const vRepo = new VehicleRepository();
      const dRepo = new DriverRepository();
      const vList = await vRepo.findAll({ companyId });
      const dList = await dRepo.findAll({ companyId });

      setVehicles(vList);
      setDrivers(dList);

      if (!vehicleId && vList.length > 0) {
        setVehicleId(vList[0].id);
      }
    } catch (err) {
      console.error('Erro ao carregar dados iniciais:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vehicleId) {
      setError('Selecione um veículo.');
      return;
    }

    if (!autoNumber.trim()) {
      setError('Informe o número do auto de infração.');
      return;
    }

    const origAmountNum = parseFloat(originalAmount.replace(',', '.'));
    if (isNaN(origAmountNum) || origAmountNum <= 0) {
      setError('Informe um valor de multa válido.');
      return;
    }

    let discAmountNum: number | undefined;
    if (discountedAmount.trim()) {
      discAmountNum = parseFloat(discountedAmount.replace(',', '.'));
      if (isNaN(discAmountNum)) discAmountNum = undefined;
    }

    const pointsNum = parseInt(points, 10) || 0;

    setSubmitting(true);
    try {
      const ticketService = new TrafficTicketService();
      const dto: CreateTrafficTicketDTO = {
        companyId,
        vehicleId,
        driverId: driverId || undefined,
        autoNumber: autoNumber.trim().toUpperCase(),
        organName: organName.trim() || 'DETRAN',
        infractionCode: infractionCode.trim(),
        description: description.trim(),
        infractionDate,
        dueDate,
        discountDueDate: discountDueDate || undefined,
        originalAmount: origAmountNum,
        discountedAmount: discAmountNum,
        points: pointsNum,
        responsibility,
        notes: notes.trim() || undefined,
      };

      await ticketService.createTicket(dto, 'usr-admin', 'Administrador');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar a multa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} title="Cadastrar Nova Multa de Trânsito" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Veículo */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Veículo (Placa / Modelo) *
            </label>
            <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
              <option value="">Selecione o veículo...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.brand} {v.model} ({v.year})
                </option>
              ))}
            </Select>
          </div>

          {/* Condutor Responsável */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Motorista Identificado (Opcional)
            </label>
            <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">-- Não Identificado no Momento --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName} (CPF: {d.cpf})
                </option>
              ))}
            </Select>
          </div>

          {/* Auto de Infração */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Auto de Infração (Número) *
            </label>
            <Input
              type="text"
              placeholder="Ex: AB12345678"
              value={autoNumber}
              onChange={(e) => setAutoNumber(e.target.value.toUpperCase())}
              required
            />
          </div>

          {/* Órgão Autuador */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Órgão Autuador
            </label>
            <Input
              type="text"
              placeholder="Ex: DETRAN, PRF, EPTC"
              value={organName}
              onChange={(e) => setOrganName(e.target.value)}
            />
          </div>

          {/* Código de Infração */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Código da Infração *
            </label>
            <Input
              type="text"
              placeholder="Ex: 501-0"
              value={infractionCode}
              onChange={(e) => setInfractionCode(e.target.value)}
              required
            />
          </div>

          {/* Pontos CNH */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Pontuação na CNH
            </label>
            <Input
              type="number"
              min="0"
              max="20"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>

          {/* Descrição */}
          <div className="md:col-span-2">
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Descrição da Infração *
            </label>
            <Input
              type="text"
              placeholder="Ex: Transitar em velocidade superior à máxima permitida em até 20%"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Data da Infração */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Data da Infração *
            </label>
            <Input
              type="date"
              value={infractionDate}
              onChange={(e) => setInfractionDate(e.target.value)}
              required
            />
          </div>

          {/* Data de Vencimento */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Data de Vencimento *
            </label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </div>

          {/* Valor Original */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Valor Original (R$) *
            </label>
            <Input
              type="text"
              placeholder="195,23"
              value={originalAmount}
              onChange={(e) => setOriginalAmount(e.target.value)}
              required
            />
          </div>

          {/* Valor com Desconto */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Valor com Desconto (R$)
            </label>
            <Input
              type="text"
              placeholder="156,18"
              value={discountedAmount}
              onChange={(e) => setDiscountedAmount(e.target.value)}
            />
          </div>

          {/* Data Limite do Desconto */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Vencimento com Desconto
            </label>
            <Input
              type="date"
              value={discountDueDate}
              onChange={(e) => setDiscountDueDate(e.target.value)}
            />
          </div>

          {/* Responsabilidade */}
          <div>
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Atribuição de Responsabilidade *
            </label>
            <Select
              value={responsibility}
              onChange={(e) => setResponsibility(e.target.value as TicketResponsibility)}
              required
            >
              <option value={TicketResponsibility.DRIVER}>Motorista (Gera Conta a Receber)</option>
              <option value={TicketResponsibility.COMPANY}>Empresa/Locadora (Gera Conta a Pagar)</option>
              <option value={TicketResponsibility.UNIDENTIFIED}>Não Identificado (Pendente)</option>
            </Select>
          </div>

          {/* Observações */}
          <div className="md:col-span-2">
            <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Observações
            </label>
            <textarea
              className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações adicionais, localização do radar, recurso pendente..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar e Gerar Obrigação'}
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};
