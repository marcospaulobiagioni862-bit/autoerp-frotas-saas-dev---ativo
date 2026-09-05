import React, { useEffect, useState } from 'react';
import { AlertCircle, FileText, Save, X } from 'lucide-react';
import { Button, Input, ModalContainer } from '../ui';
import { ContractClient } from '../../api/contractClient';
import { AttachmentClient } from '../../api/attachmentClient';
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

const CONTRACT_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_CONTRACT_FILE_BYTES = 10 * 1024 * 1024;

export const ContractFormModal: React.FC<ContractFormModalProps> = ({ isOpen, onClose, contractToEdit, companyId, onSuccess }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    contractNumber: '', vehicleId: '', driverId: '', startDate: '', endDate: '', rentalAmount: '',
    billingPeriodicity: '' as '' | RecurringFrequency, billingDueDayOfWeek: '', billingDueDayOfMonth: '',
    securityDepositAmount: '', franchiseKm: '', excessKmRate: '', paymentMethodId: '', templateId: '', notes: '',
  });

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError(null);
    setContractFile(null);
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
            contractNumber: '', vehicleId: '', driverId: '',
            startDate: '', endDate: '', rentalAmount: '',
            billingPeriodicity: '', billingDueDayOfWeek: '', billingDueDayOfMonth: '',
            securityDepositAmount: '', franchiseKm: '', excessKmRate: '', paymentMethodId: '', templateId: '', notes: '',
          });
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Erro ao carregar opções.'); })
      .finally(() => { if (active) setLoadingOptions(false); });
    return () => { active = false; };
  }, [isOpen, contractToEdit, companyId]);

  const selectContractFile = (file: File | null) => {
    setError(null);
    if (!file) {
      setContractFile(null);
      return;
    }
    if (!CONTRACT_FILE_TYPES.includes(file.type)) {
      setContractFile(null);
      setError('Arquivo do contrato deve ser PDF, JPG, PNG ou WebP.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_CONTRACT_FILE_BYTES) {
      setContractFile(null);
      setError('Arquivo do contrato deve ter até 10 MB e não pode estar vazio.');
      return;
    }
    setContractFile(file);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.templateId || !form.vehicleId || !form.driverId || !form.startDate || !form.billingPeriodicity || Number(form.rentalAmount) <= 0) {
      setError('Preencha modelo, veículo, motorista, data inicial, aluguel e periodicidade.');
      return;
    }
    if (form.billingPeriodicity === RecurringFrequency.WEEKLY && (!form.billingDueDayOfWeek || Number(form.billingDueDayOfWeek) < 1 || Number(form.billingDueDayOfWeek) > 7)) {
      setError('Informe o dia semanal de vencimento entre 1 e 7.');
      return;
    }
    if (form.billingPeriodicity === RecurringFrequency.MONTHLY && (!form.billingDueDayOfMonth || Number(form.billingDueDayOfMonth) < 1 || Number(form.billingDueDayOfMonth) > 31)) {
      setError('Informe o dia mensal de vencimento entre 1 e 31.');
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
        billingPeriodicity: form.billingPeriodicity as RecurringFrequency,
        billingDueDayOfWeek: Number(form.billingDueDayOfWeek),
        billingDueDayOfMonth: Number(form.billingDueDayOfMonth),
        securityDepositAmount: Number(form.securityDepositAmount || 0),
        franchiseKm: Number(form.franchiseKm || 0),
        excessKmRate: Number(form.excessKmRate || 0),
        paymentMethodId: form.paymentMethodId || undefined,
        templateId: form.templateId || undefined,
        notes: form.notes || undefined,
      };
      const savedContract = contractToEdit
        ? await ContractClient.update(contractToEdit.id, input)
        : await ContractClient.create(input);

      if (contractFile) {
        try {
          await AttachmentClient.upload({
            entityType: 'Contract',
            entityId: savedContract.id,
            documentType: 'CONTRACT_DOCUMENT',
            fileName: contractFile.name,
            mimeType: contractFile.type,
            content: contractFile,
            description: 'Contrato de locação anexado no cadastro do contrato',
          });
        } catch (uploadError) {
          onSuccess();
          onClose();
          window.alert(`Contrato salvo, mas o arquivo não foi enviado: ${uploadError instanceof Error ? uploadError.message : 'falha no upload'}. O contrato foi preservado e o arquivo pode ser reenviado nos detalhes.`);
          return;
        }
      }

      onSuccess();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao salvar contrato.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      title={contractToEdit ? 'Editar Contrato' : 'Novo Contrato'}
    >
      <form onSubmit={submit} className="p-3 space-y-3">
        {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="w-4 h-4" />{error}</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Número do contrato"><Input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} placeholder="Em branco = gerado no servidor" /></Field>
          <Field label="Modelo de contrato *"><select value={form.templateId} onChange={(e) => set('templateId', e.target.value)} disabled={loadingOptions} className="control"><option value="">Selecione</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.title} • v{item.versionNumber}</option>)}</select></Field>
          <Field label="Data inicial *"><Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="Veículo *"><select value={form.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} disabled={loadingOptions} className="control"><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} • {v.brand} {v.model}</option>)}</select></Field>
          <Field label="Motorista *"><select value={form.driverId} onChange={(e) => set('driverId', e.target.value)} disabled={loadingOptions} className="control"><option value="">Selecione</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName} • CNH {d.cnhNumber}</option>)}</select></Field>
          <Field label="Data final"><Input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
          <Field label="Aluguel *"><Input type="number" min="0.01" step="0.01" value={form.rentalAmount} onChange={(e) => set('rentalAmount', e.target.value)} /></Field>
          <Field label="Periodicidade *"><select value={form.billingPeriodicity} onChange={(e) => set('billingPeriodicity', e.target.value)} className="control"><option value="">Selecione</option>{Object.values(RecurringFrequency).map((v) => <option key={v} value={v}>{v === RecurringFrequency.WEEKLY ? 'Semanal' : v === RecurringFrequency.MONTHLY ? 'Mensal' : v === RecurringFrequency.DAILY ? 'Diária' : v === RecurringFrequency.BIWEEKLY ? 'Quinzenal' : v}</option>)}</select></Field>
          <Field label={`Dia semanal${form.billingPeriodicity === RecurringFrequency.WEEKLY ? ' *' : ''}`}><Input type="number" min="1" max="7" value={form.billingDueDayOfWeek} onChange={(e) => set('billingDueDayOfWeek', e.target.value)} disabled={form.billingPeriodicity !== RecurringFrequency.WEEKLY} /></Field>
          <Field label={`Dia mensal${form.billingPeriodicity === RecurringFrequency.MONTHLY ? ' *' : ''}`}><Input type="number" min="1" max="31" value={form.billingDueDayOfMonth} onChange={(e) => set('billingDueDayOfMonth', e.target.value)} disabled={form.billingPeriodicity !== RecurringFrequency.MONTHLY} /></Field>
          <Field label="Caução"><Input type="number" min="0" step="0.01" value={form.securityDepositAmount} onChange={(e) => set('securityDepositAmount', e.target.value)} /></Field>
          <Field label="Franquia KM"><Input type="number" min="0" value={form.franchiseKm} onChange={(e) => set('franchiseKm', e.target.value)} /></Field>
          <Field label="KM excedente"><Input type="number" min="0" step="0.01" value={form.excessKmRate} onChange={(e) => set('excessKmRate', e.target.value)} /></Field>
          <Field label="Forma de pagamento"><Input value={form.paymentMethodId} onChange={(e) => set('paymentMethodId', e.target.value)} placeholder="Opcional" /></Field>
        </div>
        <Field label="Observações"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="control" /></Field>
        <Field label="Arquivo do contrato de locação (opcional)">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
            onChange={(event) => selectContractFile(event.target.files?.[0] || null)}
            className="control border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          />
          <span className="block text-[11px] font-normal text-slate-600 dark:text-slate-300">
            {contractFile ? `Selecionado: ${contractFile.name}` : 'PDF, JPG, PNG ou WebP, até 10 MB. O arquivo será vinculado automaticamente após o contrato ser salvo.'}
          </span>
        </Field>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          <strong className="block mb-1">Integração financeira do contrato</strong>O aluguel é uma <strong>Conta a Receber do motorista</strong>, vinculada também ao veículo e ao contrato. O veículo é o ativo locado e não gera Conta a Pagar pelo aluguel. A categoria financeira de receita é obrigatória na ativação, quando o primeiro título é criado. Caução, franquia de KM e KM excedente devem ser informados conscientemente conforme a regra do contrato; não são mais preenchidos automaticamente.
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit" variant="primary" isLoading={loading} disabled={loadingOptions}><Save className="w-4 h-4" />Salvar</Button></div>
      </form>
      <style>{`.control{width:100%;border:1px solid rgb(203 213 225);border-radius:.5rem;background:transparent;padding:.625rem .75rem;font-size:.875rem;color:inherit}.dark .control{border-color:rgb(51 65 85);background:rgb(2 6 23 / .35);color:rgb(226 232 240)}`}</style>
    </ModalContainer>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><span>{label}</span>{children}</label>;
