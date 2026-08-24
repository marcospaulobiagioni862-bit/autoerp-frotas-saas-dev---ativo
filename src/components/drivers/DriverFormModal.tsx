import React, { useState, useEffect } from 'react';
import { User, CreditCard, MapPin, FileText, AlertCircle } from 'lucide-react';
import { ModalContainer, Input, Select, Button } from '../ui';
import { DriverClient, type DriverCreateInput } from '../../api/driverClient';
import { Driver } from '../../types/entities';
import { DriverStatus } from '../../types/enums';

interface DriverFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverToEdit?: Driver | null;
  onSuccess: () => void;
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  isOpen,
  onClose,
  driverToEdit,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');

  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('SP');

  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhCategory, setCnhCategory] = useState('B');
  const [cnhExpiration, setCnhExpiration] = useState('');
  const [appPlatforms, setAppPlatforms] = useState<string[]>(['Uber', '99']);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.ACTIVE);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (driverToEdit) {
      setFullName(driverToEdit.fullName || '');
      setCpf(driverToEdit.cpf || '');
      setRg(driverToEdit.rg || '');
      setBirthDate(driverToEdit.birthDate || '');
      setPhone(driverToEdit.phone || '');
      setWhatsapp(driverToEdit.whatsapp || '');
      setEmail(driverToEdit.email || '');

      setZipCode(driverToEdit.address?.zipCode || '');
      setStreet(driverToEdit.address?.street || '');
      setNumber(driverToEdit.address?.number || '');
      setComplement(driverToEdit.address?.complement || '');
      setNeighborhood(driverToEdit.address?.neighborhood || '');
      setCity(driverToEdit.address?.city || '');
      setState(driverToEdit.address?.state || 'SP');

      setCnhNumber(driverToEdit.cnhNumber || '');
      setCnhCategory(driverToEdit.cnhCategory || 'B');
      setCnhExpiration(driverToEdit.cnhExpiration || '');
      setAppPlatforms(driverToEdit.appPlatforms || ['Uber', '99']);
      setStatus(driverToEdit.status || DriverStatus.ACTIVE);
      setNotes(driverToEdit.notes || '');
    } else {
      setFullName('');
      setCpf('');
      setRg('');
      setBirthDate('');
      setPhone('');
      setWhatsapp('');
      setEmail('');

      setZipCode('');
      setStreet('');
      setNumber('');
      setComplement('');
      setNeighborhood('');
      setCity('');
      setState('SP');

      setCnhNumber('');
      setCnhCategory('B');
      setCnhExpiration('');
      setAppPlatforms(['Uber', '99']);
      setStatus(DriverStatus.ACTIVE);
      setNotes('');
    }
    setErrorMessage(null);
  }, [driverToEdit, isOpen]);

  const togglePlatform = (platform: string) => {
    if (appPlatforms.includes(platform)) {
      setAppPlatforms(appPlatforms.filter((p) => p !== platform));
    } else {
      setAppPlatforms([...appPlatforms, platform]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const input: DriverCreateInput = {
        fullName,
        cpf,
        rg: rg || undefined,
        birthDate,
        phone,
        whatsapp: whatsapp || phone,
        email: email || undefined,
        address: {
          zipCode,
          street,
          number,
          complement: complement || undefined,
          neighborhood,
          city,
          state,
        },
        cnhNumber,
        cnhCategory,
        cnhExpiration,
        appPlatforms,
        notes: notes || undefined,
      };

      if (driverToEdit) {
        await DriverClient.update(driverToEdit.id, input);
        if (status !== driverToEdit.status && status !== DriverStatus.ARCHIVED) {
          await DriverClient.changeStatus(
            driverToEdit.id,
            status as Exclude<DriverStatus, DriverStatus.ARCHIVED>
          );
        }
      } else {
        await DriverClient.create(input);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Ocorreu um erro ao salvar os dados do motorista.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={driverToEdit ? 'Editar Cadastro de Motorista' : 'Novo Cadastro de Motorista'}
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              1. Dados Pessoais
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Input
                label="Nome Completo"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex: João da Silva Santos"
                required
              />
            </div>

            <Input
              label="CPF"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              required
            />

            <Input
              label="RG"
              value={rg}
              onChange={(e) => setRg(e.target.value)}
              placeholder="00.000.000-0"
            />

            <Input
              label="Data de Nascimento"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
            />

            <Input
              label="Telefone Principal"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 90000-0000"
              required
            />

            <Input
              label="WhatsApp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(11) 90000-0000"
            />

            <div className="lg:col-span-2">
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="motorista@email.com"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              2. Carteira Nacional de Habilitação (CNH)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Número do Registro CNH"
              value={cnhNumber}
              onChange={(e) => setCnhNumber(e.target.value)}
              placeholder="00000000000"
              required
            />

            <Select
              label="Categoria"
              value={cnhCategory}
              onChange={(e) => setCnhCategory(e.target.value)}
              required
            >
              <option value="A">A (Moto)</option>
              <option value="B">B (Carro)</option>
              <option value="AB">AB (Carro e Moto)</option>
              <option value="C">C (Caminhão)</option>
              <option value="D">D (Ônibus/Vans)</option>
              <option value="E">E (Articulados)</option>
            </Select>

            <Input
              label="Validade da CNH"
              type="date"
              value={cnhExpiration}
              onChange={(e) => setCnhExpiration(e.target.value)}
              required
            />

            {driverToEdit && (
              <Select
                label="Status Operacional"
                value={status}
                onChange={(e) => setStatus(e.target.value as DriverStatus)}
              >
                <option value={DriverStatus.ACTIVE}>Ativo</option>
                <option value={DriverStatus.INACTIVE}>Inativo</option>
                <option value={DriverStatus.PENDING_DOCS}>Pendente de Docs</option>
                <option value={DriverStatus.BLOCKED}>Bloqueado</option>
              </Select>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              3. Endereço
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="CEP"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="00000-000"
            />

            <div className="sm:col-span-2">
              <Input
                label="Logradouro / Rua"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Av. Paulista"
              />
            </div>

            <Input
              label="Número"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="1000"
            />

            <Input
              label="Complemento"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Apto 42"
            />

            <Input
              label="Bairro"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Bela Vista"
            />

            <Input
              label="Cidade"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="São Paulo"
            />

            <Input
              label="Estado (UF)"
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              placeholder="SP"
              maxLength={2}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              4. Plataformas e Observações
            </h3>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Plataformas de Atuação
            </label>
            <div className="flex flex-wrap gap-2">
              {['Uber', '99', 'InDrive', 'Particular', 'Lalamove'].map((p) => {
                const active = appPlatforms.includes(p);
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      active
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações Operacionais
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anotações internas sobre perfil, referências ou histórico..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" isLoading={loading}>
            {driverToEdit ? 'Salvar Alterações' : 'Cadastrar Motorista'}
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};