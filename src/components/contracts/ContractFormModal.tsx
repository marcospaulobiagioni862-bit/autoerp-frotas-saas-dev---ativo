import React, { useEffect, useState } from 'react';
import { AlertCircle, FileText, Save, X } from 'lucide-react';
import { Button, Input, ModalContainer } from '../ui';
import { ContractClient } from '../../api/contractClient';
import { AttachmentClient } from '../../api/attachmentClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { ContractTemplateClient } from '../../api/contractTemplateClient';
import { ContractExecutionClient } from '../../api/contractExecutionClient';
import type { Contract, ContractTemplate, Driver, Vehicle } from '../../types/entities';
import { DriverStatus, RecurringFrequency, VehicleStatus } from '../../types/enums';
import { isContractBlocking } from '../../domain/operations/fleetOperationalState';

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractToEdit?: Contract | null;
  companyId: string;
  onSuccess: (result: { contract: Contract; openPdfSignature: boolean; warning?: string }) => void;
}

const SAVED_CONTRACT_KEY = /^modelo-contrato-(\d+)$/;

function savedContractNumber(templateKey: string): number | undefined {
  const match = SAVED_CONTRACT_KEY.exec(templateKey);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function contractTemplateOptionLabel(item: ContractTemplate): string {
  const number = savedContractNumber(item.templateKey);
  return number
    ? `Contrato ${String(number).padStart(2, '0')} — ${item.title} • v${item.versionNumber}`
    : `${item.title} • v${item.versionNumber} • Histórico`;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [form, setForm] = useState({
    contractNumber: '', vehicleId: '', driverId: '', startDate: '', endDate: '', rentalAmount: '',
    billingPeriodicity: '' as '' | RecurringFrequency, billingDueDayOfWeek: '', billingDueDayOfMonth: '',
    securityDepositAmount: '', franchiseKm: '', excessKmRate: '', paymentMethodId: '', templateId: '', notes: '',
  });

  const set = (key: keyof typeof form, value: string) => { setHasUnsavedChanges(true); setForm((current) => ({ ...current, [key]: value })); setFieldErrors((current)=>{if(!current[key])return current;const next={...current};delete next[key];return next;}); };

  const setBillingPeriodicity = (value: string) => {
    setHasUnsavedChanges(true);
    setForm((current) => ({
      ...current,
      billingPeriodicity: value as '' | RecurringFrequency,
      billingDueDayOfWeek: value === RecurringFrequency.WEEKLY ? current.billingDueDayOfWeek : '',
      billingDueDayOfMonth: value && value !== RecurringFrequency.WEEKLY ? current.billingDueDayOfMonth : '',
    }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.billingPeriodicity;
      delete next.billingDueDayOfWeek;
      delete next.billingDueDayOfMonth;
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError(null);
    setFieldErrors({});
    setContractFile(null);
    setHasUnsavedChanges(false);
    setLoadingOptions(true);
    Promise.all([VehicleClient.list(), DriverClient.list(), ContractClient.list(), ContractTemplateClient.list()])
      .then(([vehicleList, driverList, contractList, templateList]) => {
        if (!active) return;
        const blockingContracts = contractList.filter((item) =>
          !item.isArchived &&
          item.id !== contractToEdit?.id &&
          isContractBlocking(item.status)
        );
        const blockedVehicleIds = new Set(blockingContracts.map((item) => item.vehicleId));
        const blockedDriverIds = new Set(blockingContracts.map((item) => item.driverId));
        const validVehicles = vehicleList.filter((item) =>
          !item.isArchived &&
          !blockedVehicleIds.has(item.id) &&
          (item.status === VehicleStatus.AVAILABLE || item.id === contractToEdit?.vehicleId)
        );
        const validDrivers = driverList.filter((item) =>
          !item.isArchived &&
          !blockedDriverIds.has(item.id) &&
          (item.status === DriverStatus.ACTIVE || item.id === contractToEdit?.driverId)
        );
        const savedTemplates = templateList
          .filter((item) => savedContractNumber(item.templateKey) !== undefined)
          .sort((a, b) => (savedContractNumber(a.templateKey) || 0) - (savedContractNumber(b.templateKey) || 0));
        const currentHistoricalTemplate = contractToEdit?.templateId
          ? templateList.find((item) => item.id === contractToEdit.templateId)
          : undefined;
        const selectableTemplates = currentHistoricalTemplate && !savedTemplates.some((item) => item.id === currentHistoricalTemplate.id)
          ? [...savedTemplates, currentHistoricalTemplate]
          : savedTemplates;
        setVehicles(validVehicles);
        setDrivers(validDrivers);
        setTemplates(selectableTemplates);
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
          if (savedTemplates.length === 0) {
            setError('Nenhum contrato salvo está disponível. Abra Modelos de Contrato, crie ou importe um modelo e salve antes de cadastrar o contrato do motorista.');
          }
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
    setHasUnsavedChanges(true);
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

  const requestClose = () => {
    if (loading) return;
    if (hasUnsavedChanges && !window.confirm('Existem informações não salvas. Deseja sair sem salvar?')) return;
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const nextErrors:Record<string,string>={};
    if(!form.templateId)nextErrors.templateId='Selecione o modelo de contrato.';
    if(!form.vehicleId)nextErrors.vehicleId='Selecione o veículo.';
    if(!form.driverId)nextErrors.driverId='Selecione o motorista.';
    if(!form.startDate)nextErrors.startDate='Informe a data inicial.';
    if(!form.billingPeriodicity)nextErrors.billingPeriodicity='Selecione a periodicidade.';
    if(!Number.isFinite(Number(form.rentalAmount))||Number(form.rentalAmount)<=0)nextErrors.rentalAmount='Informe um aluguel maior que zero.';
    if(form.billingPeriodicity===RecurringFrequency.WEEKLY&&(!form.billingDueDayOfWeek||Number(form.billingDueDayOfWeek)<1||Number(form.billingDueDayOfWeek)>7))nextErrors.billingDueDayOfWeek='Informe o dia semanal entre 1 e 7.';
    if(form.billingPeriodicity&&form.billingPeriodicity!==RecurringFrequency.WEEKLY&&(!form.billingDueDayOfMonth||Number(form.billingDueDayOfMonth)<1||Number(form.billingDueDayOfMonth)>31))nextErrors.billingDueDayOfMonth='Informe o dia do vencimento entre 1 e 31.';
    if(form.endDate&&form.startDate&&form.startDate>form.endDate)nextErrors.endDate='A data final não pode ser anterior à data inicial.';
    setFieldErrors(nextErrors);
    if(Object.keys(nextErrors).length){setError('Corrija os campos destacados em vermelho antes de salvar o contrato.');return;}
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
        billingDueDayOfWeek: form.billingPeriodicity === RecurringFrequency.WEEKLY ? Number(form.billingDueDayOfWeek) : undefined,
        billingDueDayOfMonth: form.billingPeriodicity !== RecurringFrequency.WEEKLY ? Number(form.billingDueDayOfMonth) : undefined,
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

      const warnings: string[] = [];
      if (contractFile) {
        try {
          await AttachmentClient.upload({
            entityType: 'Contract',
            entityId: savedContract.id,
            documentType: 'CONTRACT_DOCUMENT',
            fileName: contractFile.name,
            mimeType: contractFile.type,
            content: contractFile,
            description: 'Documento externo anexado ao contrato',
          });
        } catch (uploadError) {
          warnings.push(`O contrato foi salvo, mas o anexo externo não foi enviado: ${uploadError instanceof Error ? uploadError.message : 'falha no upload'}.`);
        }
      }

      let completedContract = savedContract;
      if (!contractToEdit) {
        const selectedTemplate = templates.find((item) => item.id === form.templateId);
        if (selectedTemplate) {
          try {
            if (selectedTemplate.contentMarkdown.trim()) {
              completedContract = (await ContractExecutionClient.generatePdf(savedContract.id, selectedTemplate.id)).contract;
            } else {
              completedContract = (await ContractExecutionClient.generateDocx(savedContract.id, selectedTemplate.id)).contract;
            }
          } catch (generationError) {
            warnings.push(`Contrato salvo, mas o documento oficial automático não foi gerado: ${generationError instanceof Error ? generationError.message : 'falha na geração'}.`);
          }
        }
      }

      setHasUnsavedChanges(false);
      onClose();
      onSuccess({
        contract: completedContract,
        openPdfSignature: !contractToEdit,
        warning: warnings.length ? warnings.join(' ') : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao salvar contrato.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={requestClose}
      size="5xl"
      title={contractToEdit ? 'Editar Contrato' : 'Novo Contrato'}
    >
      <form onSubmit={submit} className="p-3 space-y-3">
        {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="w-4 h-4" />{error}</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Número do contrato"><Input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} placeholder="Em branco = gerado no servidor" /></Field>
          <Field label="Modelo de contrato *" error={fieldErrors.templateId}><select value={form.templateId} onChange={(e) => set('templateId', e.target.value)} disabled={loadingOptions} className={`control ${fieldErrors.templateId?'border-red-500':''}`}><option value="">Selecione</option>{templates.map((item) => <option key={item.id} value={item.id}>{contractTemplateOptionLabel(item)}</option>)}</select></Field>
          <Field label="Data inicial *"><Input type="date" value={form.startDate} error={fieldErrors.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="Veículo *" error={fieldErrors.vehicleId}><select value={form.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} disabled={loadingOptions} className={`control ${fieldErrors.vehicleId?'border-red-500':''}`}><option value="">Selecione</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} • {v.brand} {v.model}</option>)}</select></Field>
          <Field label="Motorista *" error={fieldErrors.driverId}><select value={form.driverId} onChange={(e) => set('driverId', e.target.value)} disabled={loadingOptions} className={`control ${fieldErrors.driverId?'border-red-500':''}`}><option value="">Selecione</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName} • CNH {d.cnhNumber}</option>)}</select></Field>
          <Field label="Data final"><Input type="date" value={form.endDate} error={fieldErrors.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
          <Field label="Aluguel *"><Input type="number" min="0.01" step="0.01" value={form.rentalAmount} error={fieldErrors.rentalAmount} onChange={(e) => set('rentalAmount', e.target.value)} /></Field>
          <Field label="Periodicidade *" error={fieldErrors.billingPeriodicity}><select value={form.billingPeriodicity} onChange={(e) => setBillingPeriodicity(e.target.value)} className={`control ${fieldErrors.billingPeriodicity?'border-red-500':''}`}><option value="">Selecione</option>{Object.values(RecurringFrequency).map((v) => <option key={v} value={v}>{v === RecurringFrequency.WEEKLY ? 'Semanal' : v === RecurringFrequency.MONTHLY ? 'Mensal' : v === RecurringFrequency.QUARTERLY ? 'Trimestral' : v === RecurringFrequency.SEMI_ANNUAL ? 'Semestral' : 'Anual'}</option>)}</select></Field>
          {form.billingPeriodicity === RecurringFrequency.WEEKLY && <Field label="Dia semanal *" error={fieldErrors.billingDueDayOfWeek}><select value={form.billingDueDayOfWeek} onChange={(e) => set('billingDueDayOfWeek', e.target.value)} className={`control ${fieldErrors.billingDueDayOfWeek?'border-red-500':''}`}><option value="">Selecione</option><option value="1">Segunda-feira</option><option value="2">Terça-feira</option><option value="3">Quarta-feira</option><option value="4">Quinta-feira</option><option value="5">Sexta-feira</option><option value="6">Sábado</option><option value="7">Domingo</option></select></Field>}
          {form.billingPeriodicity && form.billingPeriodicity !== RecurringFrequency.WEEKLY && <Field label="Dia do vencimento no mês *"><Input type="number" min="1" max="31" value={form.billingDueDayOfMonth} error={fieldErrors.billingDueDayOfMonth} onChange={(e) => set('billingDueDayOfMonth', e.target.value)} /></Field>}
          <Field label="Caução"><Input type="number" min="0" step="0.01" value={form.securityDepositAmount} onChange={(e) => set('securityDepositAmount', e.target.value)} /></Field>
          <Field label="Franquia KM"><Input type="number" min="0" value={form.franchiseKm} onChange={(e) => set('franchiseKm', e.target.value)} /></Field>
          <Field label="KM excedente"><Input type="number" min="0" step="0.01" value={form.excessKmRate} onChange={(e) => set('excessKmRate', e.target.value)} /></Field>
          <Field label="Forma de pagamento"><Input value={form.paymentMethodId} onChange={(e) => set('paymentMethodId', e.target.value)} placeholder="Opcional" /></Field>
        </div>
        <Field label="Observações"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="control" /></Field>
        <Field label="Anexo externo do contrato (opcional)">
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp"
            onChange={(event) => selectContractFile(event.target.files?.[0] || null)}
            className="control border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-100"
          />
          <span className="block text-[11px] font-normal text-slate-600 dark:text-slate-300">
            {contractFile ? `Selecionado: ${contractFile.name}` : 'Use somente para anexar um documento externo. Os modelos padrão MoveFlex VISUAL_FIXO geram PDF sobre as páginas imutáveis aprovadas; modelos personalizados seguem o fluxo configurado.'}
          </span>
        </Field>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          <strong className="block mb-1">Integração financeira do contrato</strong>O aluguel é uma <strong>Conta a Receber do motorista</strong>, vinculada também ao veículo e ao contrato. O veículo é o ativo locado e não gera Conta a Pagar pelo aluguel. A categoria financeira de receita é obrigatória na ativação, quando o primeiro título é criado. Caução, franquia de KM e KM excedente devem ser informados conscientemente conforme a regra do contrato; não são mais preenchidos automaticamente.
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={requestClose}>Cancelar</Button><Button type="submit" variant="primary" isLoading={loading} disabled={loadingOptions}><Save className="w-4 h-4" />Salvar</Button></div>
      </form>
      <style>{`.control{width:100%;border:1px solid rgb(203 213 225);border-radius:.5rem;background:transparent;padding:.625rem .75rem;font-size:.875rem;color:inherit}.dark .control{border-color:rgb(51 65 85);background:rgb(2 6 23 / .35);color:rgb(226 232 240)}`}</style>
    </ModalContainer>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; error?:string }> = ({ label, children, error }) => {
  const required = label.endsWith(' *');
  const displayLabel = required ? label.slice(0, -2) : label;
  return <label className="block space-y-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
    <span>{displayLabel}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}</span>
    {children}
    {error&&<span className="block text-[11px] font-normal text-red-600 dark:text-red-400">{error}</span>}
  </label>;
};
