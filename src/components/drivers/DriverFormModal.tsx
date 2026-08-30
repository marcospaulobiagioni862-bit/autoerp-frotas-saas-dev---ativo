import React, { useState, useEffect, useRef } from 'react';
import { User, CreditCard, MapPin, FileText, AlertCircle, Camera, Trash2 } from 'lucide-react';
import { ModalContainer, Input, Select, Button } from '../ui';
import { DriverClient, type DriverCreateInput } from '../../api/driverClient';
import { AttachmentClient } from '../../api/attachmentClient';
import {
  DriverDocumentIntakeClient,
  type ApprovedCnhDriverDraft,
} from '../../api/driverDocumentIntakeClient';
import { Driver } from '../../types/entities';
import { DriverStatus } from '../../types/enums';
import { DriverCnhPrefillButton } from './DriverCnhPrefillButton';
import type { DriverCnhDraft } from '../../api/driverCnhPrefill';
import {
  PROFILE_PHOTO_DOCUMENT_TYPE,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MIME_TYPES,
} from './DriverProfilePhoto';

type ApprovedCnhDriverDraftWithIntake = ApprovedCnhDriverDraft & { intakeId?: string };

interface DriverFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverToEdit?: Driver | null;
  initialCnhDraft?: ApprovedCnhDriverDraft | null;
  onSuccess: () => void | Promise<void>;
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  isOpen,
  onClose,
  driverToEdit,
  initialCnhDraft,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdDriverId, setCreatedDriverId] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);
  const [profilePhotoUploaded, setProfilePhotoUploaded] = useState(false);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

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
  const [state, setState] = useState('');

  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhCategory, setCnhCategory] = useState('');
  const [cnhExpiration, setCnhExpiration] = useState('');
  const [appPlatforms, setAppPlatforms] = useState<string[]>([]);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.ACTIVE);
  const [notes, setNotes] = useState('');

  const cnhIntakeId = (initialCnhDraft as ApprovedCnhDriverDraftWithIntake | null | undefined)?.intakeId;

  useEffect(() => {
    setCreatedDriverId(null);
    setProfilePhoto(null);
    setProfilePhotoUploaded(false);
    setProfilePhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
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
      setState(driverToEdit.address?.state || '');

      setCnhNumber(driverToEdit.cnhNumber || '');
      setCnhCategory(driverToEdit.cnhCategory || '');
      setCnhExpiration(driverToEdit.cnhExpiration || '');
      setAppPlatforms(driverToEdit.appPlatforms || []);
      setStatus(driverToEdit.status || DriverStatus.ACTIVE);
      setNotes(driverToEdit.notes || '');
    } else {
      setFullName(initialCnhDraft?.fullName || '');
      setCpf(initialCnhDraft?.cpf || '');
      setRg('');
      setBirthDate(initialCnhDraft?.birthDate || '');
      setPhone('');
      setWhatsapp('');
      setEmail('');

      setZipCode('');
      setStreet('');
      setNumber('');
      setComplement('');
      setNeighborhood('');
      setCity('');
      setState('');

      setCnhNumber(initialCnhDraft?.cnhNumber || '');
      setCnhCategory(initialCnhDraft?.cnhCategory || '');
      setCnhExpiration(initialCnhDraft?.cnhExpiration || '');
      setAppPlatforms([]);
      setStatus(DriverStatus.ACTIVE);
      setNotes('');
    }
    setErrorMessage(null);
  }, [driverToEdit, initialCnhDraft, isOpen]);

  useEffect(() => () => {
    if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
  }, [profilePhotoPreviewUrl]);

  const clearProfilePhoto = () => {
    setProfilePhoto(null);
    setProfilePhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
  };

  const selectProfilePhoto = (selected: File | undefined) => {
    setErrorMessage(null);
    if (!selected) return;
    if (!PROFILE_PHOTO_MIME_TYPES.includes(selected.type)) {
      clearProfilePhoto();
      setErrorMessage('Use uma foto JPEG, PNG ou WEBP.');
      return;
    }
    if (selected.size <= 0 || selected.size > PROFILE_PHOTO_MAX_BYTES) {
      clearProfilePhoto();
      setErrorMessage(selected.size <= 0 ? 'A foto está vazia.' : 'A foto excede 10 MB.');
      return;
    }
    setProfilePhoto(selected);
    setProfilePhotoUploaded(false);
    setProfilePhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(selected);
    });
  };

  const applyApprovedCnhDraft = (draft: DriverCnhDraft) => {
    if (draft.fullName !== undefined) setFullName(draft.fullName);
    if (draft.cpf !== undefined) setCpf(draft.cpf);
    if (draft.rg !== undefined) setRg(draft.rg);
    if (draft.birthDate !== undefined) setBirthDate(draft.birthDate);
    if (draft.cnhNumber !== undefined) setCnhNumber(draft.cnhNumber);
    if (draft.cnhCategory !== undefined) setCnhCategory(draft.cnhCategory);
    if (draft.cnhExpiration !== undefined) setCnhExpiration(draft.cnhExpiration);
  };

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
        let driverId = createdDriverId;
        if (!driverId) {
          const created = await DriverClient.create(input);
          driverId = created.id;
          setCreatedDriverId(created.id);
        }
        if (profilePhoto && !profilePhotoUploaded) {
          await AttachmentClient.upload({
            entityType: 'Driver',
            entityId: driverId,
            documentType: PROFILE_PHOTO_DOCUMENT_TYPE,
            fileName: profilePhoto.name,
            mimeType: profilePhoto.type,
            content: profilePhoto,
          });
          setProfilePhotoUploaded(true);
        }
        if (cnhIntakeId) {
          const promotion = await DriverDocumentIntakeClient.promote(cnhIntakeId, driverId);
          if (promotion.driverId !== driverId) {
            throw new Error('A CNH não foi vinculada ao motorista criado. Tente concluir o vínculo novamente.');
          }
        }
      }

      await onSuccess();
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

        {!driverToEdit && initialCnhDraft && Object.keys(initialCnhDraft).length > 0 && (
          <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-sm flex items-start gap-2.5">
            <FileText className="w-5 h-5 shrink-0 mt-0.5" />
            <span>Dados preenchidos a partir de uma CNH aprovada. Revise as informações, complete telefone, endereço e plataformas e clique em Cadastrar Motorista para confirmar.</span>
          </div>
        )}

        {createdDriverId && (cnhIntakeId || (profilePhoto && !profilePhotoUploaded)) && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-amber-800 dark:text-amber-300 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>O motorista já foi criado. A próxima tentativa concluirá apenas os anexos pendentes, sem criar outro cadastro.</span>
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

        {!driverToEdit && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Foto do motorista (opcional)</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                {profilePhotoPreviewUrl ? (
                  <img src={profilePhotoPreviewUrl} alt="Prévia da foto do motorista" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-slate-400" aria-label="Motorista sem foto selecionada" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => profilePhotoInputRef.current?.click()} disabled={loading}>
                    <Camera className="mr-1 h-4 w-4" />{profilePhoto ? 'Trocar foto' : 'Selecionar foto'}
                  </Button>
                  {profilePhoto && (
                    <Button type="button" size="sm" variant="ghost" onClick={clearProfilePhoto} disabled={loading}>
                      <Trash2 className="mr-1 h-4 w-4 text-rose-600" />Remover foto
                    </Button>
                  )}
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">JPEG, PNG ou WEBP, até 10 MB. Você pode adicionar a foto depois.</span>
              </div>
              <input
                ref={profilePhotoInputRef}
                type="file"
                className="hidden"
                accept={PROFILE_PHOTO_MIME_TYPES.join(',')}
                onChange={(event) => selectProfilePhoto(event.target.files?.[0])}
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              2. Carteira Nacional de Habilitação (CNH)
            </h3>
          </div>

          {driverToEdit && (
            <DriverCnhPrefillButton driverId={driverToEdit.id} onApply={applyApprovedCnhDraft} />
          )}

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
              <option value="">Selecione</option>
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
            {driverToEdit ? 'Salvar Alterações' : createdDriverId ? 'Concluir cadastro' : 'Cadastrar Motorista'}
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};
