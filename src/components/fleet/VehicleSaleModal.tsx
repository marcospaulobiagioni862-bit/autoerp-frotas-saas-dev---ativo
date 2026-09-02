import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { Vehicle } from '../../types/entities';
import { VehicleClient } from '../../api/vehicleClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ModalContainer } from '../ui/ModalContainer';

interface VehicleSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicle: Vehicle | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const VehicleSaleModal: React.FC<VehicleSaleModalProps> = ({ isOpen, onClose, onSuccess, vehicle }) => {
  if (!vehicle) return null;

  const [saleDate, setSaleDate] = useState(today());
  const [reason, setReason] = useState('Venda');
  const [disposalType, setDisposalType] = useState('VENDA');
  const [saleValue, setSaleValue] = useState<number>(vehicle.currentValue);
  const [finalKm, setFinalKm] = useState<number>(vehicle.currentKm);
  const [buyerName, setBuyerName] = useState('');
  const [buyerDocument, setBuyerDocument] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (finalKm < vehicle.currentKm) {
      setError(`O KM final não pode ser menor que ${vehicle.currentKm.toLocaleString('pt-BR')} KM.`);
      return;
    }
    setLoading(true);
    try {
      await VehicleClient.markSold(vehicle.id, {
        saleDate,
        reason: reason.trim(),
        disposalType: disposalType.trim(),
        saleValue: Number(saleValue),
        finalKm: Number(finalKm),
        notes: notes.trim(),
        buyerName: buyerName.trim() || undefined,
        buyerDocument: buyerDocument.trim() || undefined,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Não foi possível registrar a venda do veículo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={`Marcar veículo como vendido — ${vehicle.plate}`}
      subtitle="Esta ação preserva o histórico. Contrato ativo ou manutenção bloqueante impedem a venda."
      maxWidth="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Data da venda *" type="date" required value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          <Input label="Valor da venda *" type="number" min={0} step="0.01" required value={saleValue} onChange={(e) => setSaleValue(Number(e.target.value))} />
          <Input label="KM final *" type="number" min={vehicle.currentKm} required value={finalKm} onChange={(e) => setFinalKm(Number(e.target.value))} />
          <Input label="Tipo de baixa/alienação *" required value={disposalType} onChange={(e) => setDisposalType(e.target.value)} />
          <Input label="Motivo *" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input label="Comprador" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          <Input label="Documento do comprador" value={buyerDocument} onChange={(e) => setBuyerDocument(e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Observação *</label>
          <textarea
            required
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Registre as informações relevantes da venda."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <p className="text-xs text-slate-500">O histórico, documentos, contratos, manutenções e registros financeiros vinculados ao veículo não serão apagados.</p>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="submit" variant="primary" isLoading={loading}>Confirmar venda</Button>
        </div>
      </form>
    </ModalContainer>
  );
};
