import { requestGuardedClose } from '../../app/unsavedChangesAuthority';
import React, { useState, useEffect } from 'react';
import { Vehicle } from '../../types/entities';
import { VEHICLE_CATEGORIES } from '../../types/enums';
import { VehicleClient, type VehicleUpdateInput } from '../../api/vehicleClient';
import { ModalContainer } from '../ui/ModalContainer';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { AlertCircle } from 'lucide-react';

interface VehicleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicleToEdit?: Vehicle | null;
}

type NumericField = number | '';

interface VehicleFormData {
  plate: string;
  brand: string;
  model: string;
  version?: string;
  yearFabrication: NumericField;
  yearModel: NumericField;
  color: string;
  renavam: string;
  chassis: string;
  currentKm: NumericField;
  nextMaintenanceKm?: NumericField;
  fuelType: string;
  category: string;
  acquisitionValue: NumericField;
  currentValue: NumericField;
  rentalValueBase: NumericField;
  ownerType: string;
  ownerName: string;
  ownerDocument: string;
  possessionType: string;
  financialRestriction: string;
  financialInstitution: string;
  crlvExerciseYear: NumericField;
  registrationState: string;
  registrationCity: string;
  claSecurityCode: string;
  ownershipChangeReason?: string;
  notes?: string;
}

const cleanText = (value: string | undefined) => (value || '').trim();
const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

const emptyVehicleForm = (): VehicleFormData => ({
  plate: '',
  brand: '',
  model: '',
  version: '',
  yearFabrication: '',
  yearModel: '',
  color: '',
  renavam: '',
  chassis: '',
  currentKm: '',
  nextMaintenanceKm: '',
  fuelType: '',
  category: '',
  acquisitionValue: '',
  currentValue: '',
  rentalValueBase: '',
  ownerType: 'COMPANY',
  ownerName: '',
  ownerDocument: '',
  possessionType: 'PROPRIO',
  financialRestriction: 'NONE',
  financialInstitution: '',
  crlvExerciseYear: new Date().getFullYear(),
  registrationState: 'SP',
  registrationCity: '',
  claSecurityCode: '',
  ownershipChangeReason: '',
  notes: '',
});

const requiredNumber = (value: NumericField, label: string): number => {
  if (value === '' || !Number.isFinite(value)) throw new Error(`Informe ${label}.`);
  return value;
};

const optionalNumber = (value: NumericField | undefined): number | undefined =>
  value === '' || value === undefined ? undefined : value;

export const VehicleFormModal: React.FC<VehicleFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  vehicleToEdit,
}) => {
  const [formData, setFormData] = useState<VehicleFormData>(() => emptyVehicleForm());

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (vehicleToEdit) {
      setFormData({
        plate: vehicleToEdit.plate,
        brand: vehicleToEdit.brand,
        model: vehicleToEdit.model,
        version: vehicleToEdit.version || '',
        yearFabrication: vehicleToEdit.yearFabrication,
        yearModel: vehicleToEdit.yearModel,
        color: vehicleToEdit.color,
        renavam: vehicleToEdit.renavam,
        chassis: vehicleToEdit.chassis,
        currentKm: vehicleToEdit.currentKm,
        nextMaintenanceKm: vehicleToEdit.nextMaintenanceKm || vehicleToEdit.currentKm + 10000,
        fuelType: vehicleToEdit.fuelType,
        category: vehicleToEdit.category,
        acquisitionValue: vehicleToEdit.acquisitionValue,
        currentValue: vehicleToEdit.currentValue,
        rentalValueBase: vehicleToEdit.rentalValueBase,
        ownerType: vehicleToEdit.ownerType || 'COMPANY',
        ownerName: vehicleToEdit.ownerName || '',
        ownerDocument: vehicleToEdit.ownerDocument || '',
        possessionType: vehicleToEdit.possessionType || 'PROPRIO',
        financialRestriction: vehicleToEdit.financialRestriction || 'NONE',
        financialInstitution: vehicleToEdit.financialInstitution || '',
        crlvExerciseYear: vehicleToEdit.crlvExerciseYear || new Date().getFullYear(),
        registrationState: vehicleToEdit.registrationState || 'SP',
        registrationCity: vehicleToEdit.registrationCity || '',
        claSecurityCode: vehicleToEdit.claSecurityCode || '',
        ownershipChangeReason: '',
        notes: vehicleToEdit.notes || '',
      });
    } else {
      setFormData(emptyVehicleForm());
    }
    setErrorMessage(null);
  }, [vehicleToEdit, isOpen]);

  const handleChange = (field: keyof VehicleFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errorMessage) setErrorMessage(null);
  };

  const handleNumericChange = (field: keyof VehicleFormData, rawValue: string) => {
    handleChange(field, rawValue === '' ? '' : Number(rawValue));
  };

  const buildChangedFields = (existing: Vehicle): VehicleUpdateInput => {
    const changes: VehicleUpdateInput = {};
    const originalMaintenanceKm = existing.nextMaintenanceKm || existing.currentKm + 10000;
    const maintenanceKm = optionalNumber(formData.nextMaintenanceKm);

    if (normalizePlate(formData.plate) !== normalizePlate(existing.plate)) changes.plate = normalizePlate(formData.plate);
    if (cleanText(formData.renavam) !== cleanText(existing.renavam)) changes.renavam = cleanText(formData.renavam);
    if (cleanText(formData.brand) !== cleanText(existing.brand)) changes.brand = cleanText(formData.brand);
    if (cleanText(formData.model) !== cleanText(existing.model)) changes.model = cleanText(formData.model);
    if (cleanText(formData.version) !== cleanText(existing.version)) changes.version = cleanText(formData.version);
    if (formData.yearFabrication !== '' && formData.yearFabrication !== existing.yearFabrication) changes.yearFabrication = formData.yearFabrication;
    if (formData.yearModel !== '' && formData.yearModel !== existing.yearModel) changes.yearModel = formData.yearModel;
    if (cleanText(formData.color) !== cleanText(existing.color)) changes.color = cleanText(formData.color);
    if (cleanText(formData.chassis).toUpperCase() !== cleanText(existing.chassis).toUpperCase()) changes.chassis = cleanText(formData.chassis).toUpperCase();
    if ((maintenanceKm ?? 0) !== originalMaintenanceKm) changes.nextMaintenanceKm = maintenanceKm ?? 0;
    if (cleanText(formData.fuelType) !== cleanText(existing.fuelType)) changes.fuelType = cleanText(formData.fuelType);
    if (cleanText(formData.category) !== cleanText(existing.category)) changes.category = cleanText(formData.category);
    if (formData.acquisitionValue !== '' && formData.acquisitionValue !== existing.acquisitionValue) changes.acquisitionValue = formData.acquisitionValue;
    if (formData.currentValue !== '' && formData.currentValue !== existing.currentValue) changes.currentValue = formData.currentValue;
    if (formData.rentalValueBase !== '' && formData.rentalValueBase !== existing.rentalValueBase) changes.rentalValueBase = formData.rentalValueBase;

    if (formData.ownerType !== existing.ownerType) changes.ownerType = formData.ownerType;
    if (cleanText(formData.ownerName) !== cleanText(existing.ownerName)) changes.ownerName = cleanText(formData.ownerName);
    if (cleanText(formData.ownerDocument) !== cleanText(existing.ownerDocument)) changes.ownerDocument = cleanText(formData.ownerDocument);
    if (formData.possessionType !== existing.possessionType) changes.possessionType = formData.possessionType;
    if (formData.financialRestriction !== existing.financialRestriction) changes.financialRestriction = formData.financialRestriction;
    if (cleanText(formData.financialInstitution) !== cleanText(existing.financialInstitution)) changes.financialInstitution = cleanText(formData.financialInstitution);
    if (formData.crlvExerciseYear !== '' && formData.crlvExerciseYear !== existing.crlvExerciseYear) changes.crlvExerciseYear = Number(formData.crlvExerciseYear);
    if (cleanText(formData.registrationState) !== cleanText(existing.registrationState)) changes.registrationState = cleanText(formData.registrationState);
    if (cleanText(formData.registrationCity) !== cleanText(existing.registrationCity)) changes.registrationCity = cleanText(formData.registrationCity);
    if (cleanText(formData.claSecurityCode) !== cleanText(existing.claSecurityCode)) changes.claSecurityCode = cleanText(formData.claSecurityCode);
    if (cleanText(formData.ownershipChangeReason)) changes.ownershipChangeReason = cleanText(formData.ownershipChangeReason);

    if (cleanText(formData.notes) !== cleanText(existing.notes)) changes.notes = cleanText(formData.notes);

    return changes;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      if (vehicleToEdit) {
        const changedFields = buildChangedFields(vehicleToEdit);
        if (Object.keys(changedFields).length > 0) {
          await VehicleClient.update(vehicleToEdit.id, changedFields);
        }
      } else {
        await VehicleClient.create({
          plate: normalizePlate(formData.plate),
          renavam: cleanText(formData.renavam),
          brand: cleanText(formData.brand),
          model: cleanText(formData.model),
          version: cleanText(formData.version),
          yearFabrication: requiredNumber(formData.yearFabrication, 'o ano de fabricação'),
          yearModel: requiredNumber(formData.yearModel, 'o ano do modelo'),
          color: cleanText(formData.color),
          chassis: cleanText(formData.chassis).toUpperCase(),
          currentKm: requiredNumber(formData.currentKm, 'a quilometragem atual'),
          nextMaintenanceKm: optionalNumber(formData.nextMaintenanceKm),
          fuelType: cleanText(formData.fuelType),
          category: cleanText(formData.category),
          acquisitionValue: requiredNumber(formData.acquisitionValue, 'o valor de aquisição'),
          currentValue: requiredNumber(formData.currentValue, 'o valor comercial atual'),
          rentalValueBase: requiredNumber(formData.rentalValueBase, 'o valor do aluguel semanal'),
          ownerType: formData.ownerType,
          ownerName: cleanText(formData.ownerName) || undefined,
          ownerDocument: cleanText(formData.ownerDocument) || undefined,
          possessionType: formData.possessionType,
          financialRestriction: formData.financialRestriction,
          financialInstitution: cleanText(formData.financialInstitution) || undefined,
          crlvExerciseYear: optionalNumber(formData.crlvExerciseYear),
          registrationState: cleanText(formData.registrationState) || undefined,
          registrationCity: cleanText(formData.registrationCity) || undefined,
          claSecurityCode: cleanText(formData.claSecurityCode) || undefined,
          notes: cleanText(formData.notes),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar informações do veículo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={vehicleToEdit ? `Editar Veículo — ${vehicleToEdit.plate}` : 'Cadastrar Novo Veículo'}
      subtitle="Insira os dados cadastrais, operacionais e financeiros do veículo."
      maxWidth="5xl"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {errorMessage && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Placa *" placeholder="ABC1D23" required value={formData.plate} onChange={(e) => handleChange('plate', e.target.value.toUpperCase())} helperText="Formato Mercosul ou Padrão" />
          <Input label="RENAVAM *" placeholder="12345678900" required value={formData.renavam} onChange={(e) => handleChange('renavam', e.target.value)} />
          <Input label="Chassi *" placeholder="9BW..." required value={formData.chassis} onChange={(e) => handleChange('chassis', e.target.value.toUpperCase())} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Marca *" placeholder="Ex: Chevrolet" required value={formData.brand} onChange={(e) => handleChange('brand', e.target.value)} />
          <Input label="Modelo *" placeholder="Ex: Onix 1.0" required value={formData.model} onChange={(e) => handleChange('model', e.target.value)} />
          <Input label="Versão" placeholder="Ex: LT Turbo Flex" value={formData.version || ''} onChange={(e) => handleChange('version', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="Ano Fab. *" type="number" required value={formData.yearFabrication} onChange={(e) => handleNumericChange('yearFabrication', e.target.value)} />
          <Input label="Ano Modelo *" type="number" required value={formData.yearModel} onChange={(e) => handleNumericChange('yearModel', e.target.value)} />
          <Input label="Cor *" placeholder="Ex: Branco" required value={formData.color} onChange={(e) => handleChange('color', e.target.value)} />
          <Select
            label="Combustível *"
            required
            value={formData.fuelType}
            onChange={(e) => handleChange('fuelType', e.target.value)}
            options={[
              { value: '', label: 'Selecione...', disabled: true },
              { value: 'Flex', label: 'Flex' },
              { value: 'Gasolina', label: 'Gasolina' },
              { value: 'Etanol', label: 'Etanol' },
              { value: 'Diesel', label: 'Diesel' },
              { value: 'Elétrico', label: 'Elétrico' },
              { value: 'Híbrido', label: 'Híbrido' },
              { value: 'GNV', label: 'GNV' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="KM Atual *"
            type="number"
            required
            disabled={!!vehicleToEdit}
            value={formData.currentKm}
            onChange={(e) => handleNumericChange('currentKm', e.target.value)}
            helperText={vehicleToEdit ? 'Use “Registrar KM” para alterar o odômetro.' : 'Leitura inicial do veículo.'}
          />
          <Input label="Próx. Manutenção (KM)" type="number" value={formData.nextMaintenanceKm ?? ''} onChange={(e) => handleNumericChange('nextMaintenanceKm', e.target.value)} />
          <Select
            label="Categoria *"
            required
            value={formData.category}
            onChange={(e) => handleChange('category', e.target.value)}
            options={[
              { value: '', label: 'Selecione...', disabled: true },
              ...VEHICLE_CATEGORIES.map((category) => ({ value: category, label: category })),
            ]}
          />
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Titularidade e Propriedade (Frota Mista)
            </h4>
            {formData.ownerType === 'COMPANY' && (
              <button
                type="button"
                onClick={() => {
                  handleChange('ownerName', 'TRIFLEX ASSISTENCIA TECNICA DE MAQUINAS');
                  handleChange('ownerDocument', '22.791.551/0001-53');
                }}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Preencher dados da empresa
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Tipo de Titular *"
              required
              value={formData.ownerType}
              onChange={(e) => {
                const val = e.target.value;
                handleChange('ownerType', val);
                if (val === 'COMPANY') {
                  handleChange('possessionType', 'PROPRIO');
                  handleChange('financialRestriction', 'NONE');
                } else if (val === 'FINANCED_LEASING') {
                  handleChange('possessionType', 'FINANCIAMENTO_LEASING');
                  handleChange('financialRestriction', 'ARRENDAMENTO_MERCANTIL');
                  handleChange('financialInstitution', 'Banco Bradesco Financiamentos S.A.');
                } else if (val === 'PARTNER') {
                  handleChange('possessionType', 'CESSAO_SOCIO');
                  handleChange('financialRestriction', 'NONE');
                } else if (val === 'THIRD_PARTY') {
                  handleChange('possessionType', 'SUBLOCACAO_TERCEIRO');
                  handleChange('financialRestriction', 'NONE');
                }
              }}
              options={[
                { value: 'COMPANY', label: 'Próprio da Empresa' },
                { value: 'FINANCED_LEASING', label: 'Financiado / Leasing (Banco)' },
                { value: 'PARTNER', label: 'Veículo de Sócio (Pessoa Física)' },
                { value: 'THIRD_PARTY', label: 'Terceiro (Sublocação / Cessão)' },
              ]}
            />
            <Input
              label="Nome do Proprietário no CRLV"
              placeholder="Ex: TRIFLEX ou Banco..."
              value={formData.ownerName}
              onChange={(e) => handleChange('ownerName', e.target.value)}
            />
            <Input
              label="CPF ou CNPJ do Proprietário"
              placeholder="00.000.000/0000-00"
              value={formData.ownerDocument}
              onChange={(e) => handleChange('ownerDocument', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Restrição Financeira / Gravame"
              value={formData.financialRestriction}
              onChange={(e) => handleChange('financialRestriction', e.target.value)}
              options={[
                { value: 'NONE', label: 'Nenhuma' },
                { value: 'ALIENACAO_FIDUCIARIA', label: 'Alienação Fiduciária' },
                { value: 'ARRENDAMENTO_MERCANTIL', label: 'Arrendamento Mercantil (Leasing)' },
                { value: 'OUTRO', label: 'Outro Gravame' },
              ]}
            />
            <Input
              label="Instituição Financeira / Banco"
              placeholder="Ex: Banco Bradesco Financiamentos"
              value={formData.financialInstitution}
              onChange={(e) => handleChange('financialInstitution', e.target.value)}
            />
            <Input
              label="Exercício CRLV (Ano)"
              type="number"
              placeholder="2026"
              value={formData.crlvExerciseYear}
              onChange={(e) => handleNumericChange('crlvExerciseYear', e.target.value)}
              helperText="Ano do licenciamento vigente"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="UF Emplacamento"
              placeholder="SP"
              value={formData.registrationState}
              onChange={(e) => handleChange('registrationState', e.target.value.toUpperCase().slice(0, 2))}
            />
            <Input
              label="Município Emplacamento"
              placeholder="Ex: Sorocaba"
              value={formData.registrationCity}
              onChange={(e) => handleChange('registrationCity', e.target.value)}
            />
            <Input
              label="Cód. Segurança CLA"
              placeholder="11 dígitos do CRLV"
              value={formData.claSecurityCode}
              onChange={(e) => handleChange('claSecurityCode', e.target.value)}
            />
          </div>

          {vehicleToEdit && (
            <Input
              label="Motivo da Alteração de Titularidade (se houver transferência)"
              placeholder="Ex: Quitação de leasing, compra pelo sócio, etc."
              value={formData.ownershipChangeReason || ''}
              onChange={(e) => handleChange('ownershipChangeReason', e.target.value)}
              helperText="Ficará registrado na linha do tempo histórica do veículo."
            />
          )}
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3 border border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Valores Financeiros</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Valor de Aquisição (R$) *" type="number" required value={formData.acquisitionValue} onChange={(e) => handleNumericChange('acquisitionValue', e.target.value)} />
            <Input label="Valor Comercial Atual (R$) *" type="number" required value={formData.currentValue} onChange={(e) => handleNumericChange('currentValue', e.target.value)} />
            <Input label="Valor Aluguel Semanal (R$) *" type="number" required value={formData.rentalValueBase} onChange={(e) => handleNumericChange('rentalValueBase', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Observações</label>
          <textarea
            rows={2}
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Anotações gerais do veículo..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={(event)=>requestGuardedClose(event,onClose)} disabled={loading}>Cancelar</Button>
          <Button type="submit" variant="primary" isLoading={loading}>{vehicleToEdit ? 'Atualizar Veículo' : 'Cadastrar Veículo'}</Button>
        </div>
      </form>
    </ModalContainer>
  );
};
