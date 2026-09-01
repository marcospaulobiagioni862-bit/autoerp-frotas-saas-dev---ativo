import React, { useState, useEffect } from 'react';
import { Vehicle } from '../../types/entities';
import { VEHICLE_CATEGORIES } from '../../types/enums';
import { VehicleClient, type VehicleUpdateInput } from '../../api/vehicleClient';
import { ModalContainer } from '../ui/ModalContainer';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Car, AlertCircle } from 'lucide-react';

interface VehicleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicleToEdit?: Vehicle | null;
}

interface VehicleFormData {
  plate: string;
  brand: string;
  model: string;
  version?: string;
  yearFabrication: number;
  yearModel: number;
  color: string;
  renavam: string;
  chassis: string;
  currentKm: number;
  nextMaintenanceKm?: number;
  fuelType: string;
  category: string;
  acquisitionValue: number;
  currentValue: number;
  rentalValueBase: number;
  notes?: string;
}

export const VehicleFormModal: React.FC<VehicleFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  vehicleToEdit,
}) => {
  const [formData, setFormData] = useState<VehicleFormData>({
    plate: '',
    brand: '',
    model: '',
    version: '',
    yearFabrication: new Date().getFullYear(),
    yearModel: new Date().getFullYear(),
    color: 'Branco',
    renavam: '',
    chassis: '',
    currentKm: 0,
    nextMaintenanceKm: 10000,
    fuelType: 'Flex',
    category: 'Hatch / Sedan Compacto',
    acquisitionValue: 70000,
    currentValue: 65000,
    rentalValueBase: 750,
    notes: '',
  });

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
        nextMaintenanceKm: vehicleToEdit.nextMaintenanceKm ?? vehicleToEdit.currentKm + 10000,
        fuelType: vehicleToEdit.fuelType,
        category: vehicleToEdit.category,
        acquisitionValue: vehicleToEdit.acquisitionValue,
        currentValue: vehicleToEdit.currentValue,
        rentalValueBase: vehicleToEdit.rentalValueBase,
        notes: vehicleToEdit.notes || '',
      });
    } else {
      setFormData({
        plate: '',
        brand: '',
        model: '',
        version: '',
        yearFabrication: new Date().getFullYear(),
        yearModel: new Date().getFullYear(),
        color: 'Branco',
        renavam: '',
        chassis: '',
        currentKm: 0,
        nextMaintenanceKm: 10000,
        fuelType: 'Flex',
        category: 'Hatch / Sedan Compacto',
        acquisitionValue: 70000,
        currentValue: 65000,
        rentalValueBase: 750,
        notes: '',
      });
    }
    setErrorMessage(null);
  }, [vehicleToEdit, isOpen]);

  const handleChange = (field: keyof VehicleFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      if (vehicleToEdit) {
        const editableFields: VehicleUpdateInput = {
          plate: formData.plate,
          brand: formData.brand,
          model: formData.model,
          version: formData.version || '',
          yearFabrication: formData.yearFabrication,
          yearModel: formData.yearModel,
          color: formData.color,
          renavam: formData.renavam,
          chassis: formData.chassis,
          nextMaintenanceKm: formData.nextMaintenanceKm,
          fuelType: formData.fuelType,
          category: formData.category,
          acquisitionValue: formData.acquisitionValue,
          currentValue: formData.currentValue,
          rentalValueBase: formData.rentalValueBase,
          notes: formData.notes || '',
        };
        const originalFields: VehicleUpdateInput = {
          plate: vehicleToEdit.plate,
          brand: vehicleToEdit.brand,
          model: vehicleToEdit.model,
          version: vehicleToEdit.version || '',
          yearFabrication: vehicleToEdit.yearFabrication,
          yearModel: vehicleToEdit.yearModel,
          color: vehicleToEdit.color,
          renavam: vehicleToEdit.renavam,
          chassis: vehicleToEdit.chassis,
          nextMaintenanceKm: vehicleToEdit.nextMaintenanceKm ?? vehicleToEdit.currentKm + 10000,
          fuelType: vehicleToEdit.fuelType,
          category: vehicleToEdit.category,
          acquisitionValue: vehicleToEdit.acquisitionValue,
          currentValue: vehicleToEdit.currentValue,
          rentalValueBase: vehicleToEdit.rentalValueBase,
          notes: vehicleToEdit.notes || '',
        };
        const changes = Object.fromEntries(
          Object.entries(editableFields).filter(([key, value]) => value !== originalFields[key as keyof VehicleUpdateInput]),
        ) as VehicleUpdateInput;

        if (Object.keys(changes).length > 0) {
          await VehicleClient.update(vehicleToEdit.id, changes);
        }
      } else {
        await VehicleClient.create(formData);
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
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Placa *"
            placeholder="ABC1D23"
            required
            value={formData.plate}
            onChange={(e) => handleChange('plate', e.target.value.toUpperCase())}
            helperText="Formato Mercosul ou Padrão"
          />

          <Input
            label="RENAVAM *"
            placeholder="12345678900"
            required
            value={formData.renavam}
            onChange={(e) => handleChange('renavam', e.target.value)}
          />

          <Input
            label="Chassi *"
            placeholder="9BW..."
            required
            value={formData.chassis}
            onChange={(e) => handleChange('chassis', e.target.value.toUpperCase())}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Marca *"
            placeholder="Ex: Chevrolet"
            required
            value={formData.brand}
            onChange={(e) => handleChange('brand', e.target.value)}
          />

          <Input
            label="Modelo *"
            placeholder="Ex: Onix 1.0"
            required
            value={formData.model}
            onChange={(e) => handleChange('model', e.target.value)}
          />

          <Input
            label="Versão"
            placeholder="Ex: LT Turbo Flex"
            value={formData.version || ''}
            onChange={(e) => handleChange('version', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input
            label="Ano Fab. *"
            type="number"
            required
            value={formData.yearFabrication}
            onChange={(e) => handleChange('yearFabrication', Number(e.target.value))}
          />

          <Input
            label="Ano Modelo *"
            type="number"
            required
            value={formData.yearModel}
            onChange={(e) => handleChange('yearModel', Number(e.target.value))}
          />

          <Input
            label="Cor *"
            placeholder="Branco"
            required
            value={formData.color}
            onChange={(e) => handleChange('color', e.target.value)}
          />

          <Select
            label="Combustível *"
            value={formData.fuelType}
            onChange={(e) => handleChange('fuelType', e.target.value)}
            options={[
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
            onChange={(e) => handleChange('currentKm', Number(e.target.value))}
            helperText={vehicleToEdit ? 'Use “Registrar KM” para alterar o odômetro.' : 'Leitura inicial do veículo.'}
          />

          <Input
            label="Próx. Manutenção (KM)"
            type="number"
            value={formData.nextMaintenanceKm ?? ''}
            onChange={(e) => handleChange('nextMaintenanceKm', e.target.value === '' ? undefined : Number(e.target.value))}
          />

          <Select
            label="Categoria *"
            value={formData.category}
            onChange={(e) => handleChange('category', e.target.value)}
            options={VEHICLE_CATEGORIES.map((category) => ({ value: category, label: category }))}
          />
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3 border border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Valores Financeiros
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Valor de Aquisição (R$) *"
              type="number"
              required
              value={formData.acquisitionValue}
              onChange={(e) => handleChange('acquisitionValue', Number(e.target.value))}
            />

            <Input
              label="Valor Comercial Atual (R$) *"
              type="number"
              required
              value={formData.currentValue}
              onChange={(e) => handleChange('currentValue', Number(e.target.value))}
            />

            <Input
              label="Valor Aluguel Semanal (R$) *"
              type="number"
              required
              value={formData.rentalValueBase}
              onChange={(e) => handleChange('rentalValueBase', Number(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Observações
          </label>
          <textarea
            rows={2}
            value={formData.notes || ''}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Anotações gerais do veículo..."
            className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {vehicleToEdit ? 'Atualizar Veículo' : 'Cadastrar Veículo'}
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};
