import React, { useEffect, useState } from 'react';
import { AlertCircle, FileText, Save, X } from 'lucide-react';
import { Button, Input, ModalContainer } from '../ui';
import { ContractClient } from '../../api/contractClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { ContractTemplateClient } from '../../api/contractTemplateClient';
import type { Contract, ContractTemplate, Driver, Vehicle } from '../../types/entities';
import { DriverStatus, RecurringFrequency, VehicleStatus } from '../../types/enums';

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractToEdit?: Contract | null;
  companyId: string;
  onSuccess: () => void;
}

export const ContractFormModal: React.FC<ContractFormModalProps> = ({ isOpen, onClose, contractToEdit, companyId, onSuccess }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    contractNumber: '', vehicleId: '', driverId: '', startDate: '', endDate: '', rentalAmount: '700',
    billingPeriodicity: RecurringFrequency.WEEKLY, billingDueDayOfWeek: '1', billingDueDayOfMonth: '1',
    securityDepositAmount: '1000', franchiseKm: '1500', excessKmRate: '0.5', paymentMethodId: '', templateId: '', notes: '',
  });

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError(null);
    setLoadingOptions(true);
    Promise.all([VehicleClient.list(), DriverClient.list(), ContractTemplateClient.list()])
      .then(([vehicleList, driverList, templateList]) => {
        if (!active) return;
        const validVehicles = vehicleList.filter((item) => !item.isArchived && (item.status === VehicleStatus.AVAILABLE || item.id === contractToEdit?.vehicleId));
        const validDrivers = driverList.filter((item) => !item.isArchived && (item.status === DriverStatus.ACTIVE || item.id === contractToEdit?.driverId));
        setVehicles(validVehicles);
        setDrivers(validDrivers);
        setTemplates(templateList);
        if (contractToEdit) {
          setForm({
            contractNumber: contractToEdit.contractNumber,
            vehicleId: contractToEdit.vehicleId,
            driverId: contractToEdit.driverId,
            startDate: contractToEdit.startDate,
            endDate: contractToEdit.endDate || '',
            rentalAmount: String(contractToEdit.rentalAmount),
            billingPeriodicity: contractToEdit.billingPeriodicity,
            billingDueDayOfWeek: String(contractToEdit.billingDueDayOfWeek || 1),
            billingDueDayOfMonth: String(contractToEdit.billingDueDayOfMonth || 1),
            securityDepositAmount: String(contractToEdit.securityDepositAmount),
            franchiseKm: String(contractToEdit.franchiseKm),
            excessKmRate: String(contractToEdit.excessKmRate),
            paymentMethodId: contractToEdit.paymentMethodId || '',
            templateId: contractToEdit.templateId || '',
            notes: contractToEdit.notes || '',
          });
        } else {
          setForm({
            contractNumber: '', vehicleId: validVehicles[0]?.id || '', driverId: validDrivers[0]?.id || '',
            startDate: new Date().toISOString().slice(0, 10), endDate: '', rentalAmount: '700',
            billingPeriodicity: RecurringFrequency.WEEKLY, billingDueDayOfWeek: '1', billingDueDayOfMonth: '1',
            securityDepositAmount: '1000', franchiseKm: '1500', excessKmRate: '0.5', paymentMethodId: '', templateId: templateList[0]?.id || '', notes: '',
          });
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao carregar opções.'); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [isOpen, contractToEdit, companyId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.vehicleId || !form.driverId || !form.startDate || Number(form.rentalAmount) <= 0) {
      setError('Preencha veículo, motorista, data inicial e valor de aluguel válido.');
      return;
    }
    if (form.endDate && form.startDate > form.endDate) {
      setError('A data final não pode ser anterior à data inicial.');
      return;
    }
    setLoading(true);
    try {
      const input = {
        contractNumber: form.contractNumber.trim() || undefined,
        vehicleId: form.vehicleId,
        driverId: form.driverId,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        rentalAmount: Number(form.rentalAmount),
        billingPeriodicity: form.billingPeriodicity,
        billingDueDayOfWeek: Number(form.billingDueDayOfWeek),
        billingDueDayOfMonth: Number(form.billingDueDayOfMonth),
        securityDepositAmount: Number(form.securityDepositAmount || 0),
        franchiseKm: Number(form.franchiseKm || 0),
        excessKmRate: Number(form.excessKmRate || 0),
        paymentMethodId: form.paymentMethodId || undefined,
        templateId: form.templateId || undefined,
        notes: form.notes || undefined,
      };
      if (contractToEdit) await ContractClient.update(contractToEdit.id, input);
      else await ContractClient.create(input);
      onSuccess();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao salvar contrato.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
        <h2 className="flex items-center gap-2 font-bold"><FileText className="w-5 h-5 text-emerald-600" />{contractToEdit ? 'Editar Contrato' : 'Novo Contrato'}</h2>
        <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>
      <form onSubmit={submit} className="max-h-[80vh] overflow-y-auto p-5 space-y-4">
        {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="w-4 h-4" />{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Número do contrato"><Input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} placeholder="Em branco = gerado no servidor" /></Field>
          <Field label="Modelo de contrato"><select value={form.templateId} onChange={(e) => set('templateId', e.target.value)} disabled={loadingOptions} className="control"><option value="">Selecione</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.title} • v{item.versionNumber}</option>)}</select></Field>
          <Field label="Data inicial"><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="Veículo"><select value={form.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} disabled={loadingOptions} className="control"><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} • {v.brand} {v.model}</option>)}</select></Field>
          <Field label="Motorista"><select value={form.driverId} onChange={(e) => set('driverId', e.target.value)} disabled={loadingOptions} className="control"><option value="">Selecione</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName} • CNH {d.cnhNumber}</option>)}</select></Field>
          <Field label="Data final"><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
          <Field label="Aluguel"><Input type="number" min="0.01" step="0.01" value={form.rentalAmount} onChange={(e) => set('rentalAmount', e.target.value)} /></Field>
          <Field label="Periodicidade"><select value={form.billingPeriodicity} onChange={(e) => set('billingPeriodicity', e.target.value)} className="control">{Object.values(RecurringFrequency).map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
          <Field label="Dia semanal"><Input type="number" min="1" max="7" value={form.billingDueDayOfWeek} onChange={(e) => set('billingDueDayOfWeek', e.target.value)} /></Field>
          <Field label="Dia mensal"><Input type="number" min="1" max="31" value={form.billingDueDayOfMonth} onChange={(e) => set('billingDueDayOfMonth', e.target.value)} /></Field>
          <Field label="Caução"><Input type="number" min="0" step="0.01" value={form.securityDepositAmount} onChange={(e) => set('securityDepositAmount', e.target.value)} /></Field>
          <Field label="Franquia KM"><Input type="number" min="0" value={form.franchiseKm} onChange={(e) => set('franchiseKm', e.target.value)} /></Field>
          <Field label="KM excedente"><Input type="number" min="0" step="0.01" value={form.excessKmRate} onChange={(e) => set('excessKmRate', e.target.value)} /></Field>
          <Field label="Forma de pagamento"><Input value={form.paymentMethodId} onChange={(e) => set('paymentMethodId', e.target.value)} placeholder="Opcional" /></Field>
        </div>
        <Field label="Observações"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="control" /></Field>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          Após salvar, a ativação e o faturamento são realizados no detalhe do contrato, onde a categoria financeira canônica da receita é selecionada.
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" isLoading={loading} disabled={loadingOptions}><Save className="w-4 h-4" />Salvar</Button></div>
      </form>
      <style>{`.control{width:100%;border:1px solid rgb(226 232 240);border-radius:.5rem;background:transparent;padding:.625rem .75rem;font-size:.875rem}`}</style>
    </ModalContainer>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block space-y-1.5 text-xs font-semibold text-slate-600"><span>{label}</span>{children}</label>;
