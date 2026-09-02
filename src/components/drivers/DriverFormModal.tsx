import React, { useState, useEffect, useRef } from 'react';
import { User, CreditCard, MapPin, FileText, AlertCircle, Camera, Trash2, CheckCircle2, Plus } from 'lucide-react';
import { ModalContainer, Input, Select, Button } from '../ui';
import { DriverClient, type DriverCreateInput, type DriverUpdateInput } from '../../api/driverClient';
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

type ApprovedCnhDriverDraftWithIntake = ApprovedCnhDriverDraft & {
  intakeId?: string;
  driverId?: string;
};

type ResidenceType = 'HOUSE' | 'APARTMENT' | 'OTHER' | '';
type EarValue = '' | 'YES' | 'NO';
type FieldName =
  | 'fullName' | 'cpf' | 'birthDate' | 'phone' | 'whatsapp' | 'email'
  | 'zipCode' | 'street' | 'number' | 'complement' | 'neighborhood' | 'city' | 'state'
  | 'residenceType' | 'residenceTypeOther' | 'condominiumName' | 'unit'
  | 'cnhNumber' | 'cnhCategory' | 'cnhExpiration' | 'cnhEar';
type FieldErrors = Partial<Record<FieldName, string>>;
const STANDARD_PLATFORMS = ['Uber', '99', 'InDrive', 'Particular', 'Lalamove'] as const;

interface DriverFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverToEdit?: Driver | null;
  initialCnhDraft?: ApprovedCnhDriverDraft | null;
  onSuccess: () => void | Promise<void>;
}

function digits(value: string): string { return value.replace(/\D/g, ''); }
function validPhone(value: string): boolean {
  const normalized = digits(value);
  return normalized.length === 10 || normalized.length === 11 || ((normalized.length === 12 || normalized.length === 13) && normalized.startsWith('55'));
}
function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function earValue(value: boolean | undefined): EarValue {
  return value === true ? 'YES' : value === false ? 'NO' : '';
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({ isOpen, onClose, driverToEdit, initialCnhDraft, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [createdDriverId, setCreatedDriverId] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);
  const [profilePhotoUploaded, setProfilePhotoUploaded] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [showOtherPlatform, setShowOtherPlatform] = useState(false);
  const [otherPlatform, setOtherPlatform] = useState('');
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
  const [residenceType, setResidenceType] = useState<ResidenceType>('');
  const [residenceTypeOther, setResidenceTypeOther] = useState('');
  const [condominiumName, setCondominiumName] = useState('');
  const [blockTower, setBlockTower] = useState('');
  const [unit, setUnit] = useState('');
  const [floor, setFloor] = useState('');
  const [addressReference, setAddressReference] = useState('');
  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhCategory, setCnhCategory] = useState('');
  const [cnhExpiration, setCnhExpiration] = useState('');
  const [cnhEar, setCnhEar] = useState<EarValue>('');
  const [appPlatforms, setAppPlatforms] = useState<string[]>([]);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.ACTIVE);
  const [notes, setNotes] = useState('');

  const cnhDraftMeta = initialCnhDraft as ApprovedCnhDriverDraftWithIntake | null | undefined;
  const cnhIntakeId = cnhDraftMeta?.intakeId;
  const cnhDriverId = cnhDraftMeta?.driverId;
  const isCnhCompletion = !driverToEdit && !!cnhDriverId;
  const requiresCompleteProfile = !driverToEdit || isCnhCompletion;

  useEffect(() => {
    setCreatedDriverId(null); setProfilePhoto(null); setProfilePhotoUploaded(false); setErrorMessage(null); setSuccessMessage(null); setFieldErrors({}); setCepMessage(null); setShowOtherPlatform(false); setOtherPlatform('');
    setProfilePhotoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
    if (driverToEdit) {
      setFullName(driverToEdit.fullName || ''); setCpf(driverToEdit.cpf || ''); setRg(driverToEdit.rg || ''); setBirthDate(driverToEdit.birthDate || ''); setPhone(driverToEdit.phone || ''); setWhatsapp(driverToEdit.whatsapp || ''); setEmail(driverToEdit.email || '');
      setZipCode(driverToEdit.address?.zipCode || ''); setStreet(driverToEdit.address?.street || ''); setNumber(driverToEdit.address?.number || ''); setComplement(driverToEdit.address?.complement || ''); setNeighborhood(driverToEdit.address?.neighborhood || ''); setCity(driverToEdit.address?.city || ''); setState(driverToEdit.address?.state || '');
      setResidenceType((driverToEdit.address?.residenceType || '') as ResidenceType); setResidenceTypeOther(driverToEdit.address?.residenceTypeOther || ''); setCondominiumName(driverToEdit.address?.condominiumName || ''); setBlockTower(driverToEdit.address?.blockTower || ''); setUnit(driverToEdit.address?.unit || ''); setFloor(driverToEdit.address?.floor || ''); setAddressReference(driverToEdit.address?.reference || '');
      setCnhNumber(driverToEdit.cnhNumber || ''); setCnhCategory(driverToEdit.cnhCategory || ''); setCnhExpiration(driverToEdit.cnhExpiration || ''); setCnhEar(earValue(driverToEdit.cnhEar)); setAppPlatforms(driverToEdit.appPlatforms || []); setStatus(driverToEdit.status || DriverStatus.ACTIVE); setNotes(driverToEdit.notes || '');
      setShowOtherPlatform((driverToEdit.appPlatforms || []).some((item) => !STANDARD_PLATFORMS.includes(item as typeof STANDARD_PLATFORMS[number])));
    } else {
      setFullName(initialCnhDraft?.fullName || ''); setCpf(initialCnhDraft?.cpf || ''); setRg(initialCnhDraft?.rg || ''); setBirthDate(initialCnhDraft?.birthDate || ''); setPhone(''); setWhatsapp(''); setEmail('');
      setZipCode(''); setStreet(''); setNumber(''); setComplement(''); setNeighborhood(''); setCity(''); setState(''); setResidenceType(''); setResidenceTypeOther(''); setCondominiumName(''); setBlockTower(''); setUnit(''); setFloor(''); setAddressReference('');
      setCnhNumber(initialCnhDraft?.cnhNumber || ''); setCnhCategory(initialCnhDraft?.cnhCategory || ''); setCnhExpiration(initialCnhDraft?.cnhExpiration || ''); setCnhEar(earValue(initialCnhDraft?.cnhEar)); setAppPlatforms([]); setStatus(DriverStatus.ACTIVE); setNotes('');
    }
  }, [driverToEdit, initialCnhDraft, isOpen]);

  useEffect(() => () => { if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl); }, [profilePhotoPreviewUrl]);
  const clearFieldError = (field: FieldName) => setFieldErrors((current) => { if (!current[field]) return current; const next = { ...current }; delete next[field]; return next; });
  const clearProfilePhoto = () => { setProfilePhoto(null); setProfilePhotoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; }); if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = ''; };
  const selectProfilePhoto = (selected: File | undefined) => {
    setErrorMessage(null); if (!selected) return;
    if (!PROFILE_PHOTO_MIME_TYPES.includes(selected.type)) { clearProfilePhoto(); setErrorMessage('Use uma foto JPEG, PNG ou WEBP.'); return; }
    if (selected.size <= 0 || selected.size > PROFILE_PHOTO_MAX_BYTES) { clearProfilePhoto(); setErrorMessage(selected.size <= 0 ? 'A foto está vazia.' : 'A foto excede 10 MB.'); return; }
    setProfilePhoto(selected); setProfilePhotoUploaded(false); setProfilePhotoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(selected); });
  };
  const applyApprovedCnhDraft = (draft: DriverCnhDraft) => { if (draft.fullName !== undefined) setFullName(draft.fullName); if (draft.cpf !== undefined) setCpf(draft.cpf); if (draft.rg !== undefined) setRg(draft.rg); if (draft.birthDate !== undefined) setBirthDate(draft.birthDate); if (draft.cnhNumber !== undefined) setCnhNumber(draft.cnhNumber); if (draft.cnhCategory !== undefined) setCnhCategory(draft.cnhCategory); if (draft.cnhExpiration !== undefined) setCnhExpiration(draft.cnhExpiration); };
  const togglePlatform = (platform: string) => setAppPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  const toggleAllPlatforms = () => {
    const allSelected = STANDARD_PLATFORMS.every((platform) => appPlatforms.includes(platform));
    if (allSelected) setAppPlatforms((current) => current.filter((item) => !STANDARD_PLATFORMS.includes(item as typeof STANDARD_PLATFORMS[number])));
    else setAppPlatforms((current) => [...new Set([...current, ...STANDARD_PLATFORMS])]);
  };
  const addOtherPlatform = () => { const clean = otherPlatform.trim(); if (!clean) return; setAppPlatforms((current) => current.some((item) => item.toLowerCase() === clean.toLowerCase()) ? current : [...current, clean]); setOtherPlatform(''); setShowOtherPlatform(true); };

  const lookupCep = async () => {
    const cep = digits(zipCode); setCepMessage(null); if (!cep) return;
    if (cep.length !== 8) { setFieldErrors((current) => ({ ...current, zipCode: 'Informe um CEP com 8 números.' })); return; }
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`); if (!response.ok) throw new Error('CEP_LOOKUP_FAILED');
      const data = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) { setCepMessage('CEP não encontrado. Preencha o endereço manualmente.'); return; }
      setZipCode(cep); setStreet(data.logradouro || ''); setNeighborhood(data.bairro || ''); setCity(data.localidade || ''); setState((data.uf || '').toUpperCase()); clearFieldError('zipCode'); setCepMessage('Endereço localizado. Complete tipo de residência e número.');
    } catch { setCepMessage('Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.'); }
    finally { setCepLoading(false); }
  };

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (fullName.trim().length < 3) errors.fullName = 'Informe o nome completo.';
    if (digits(cpf).length !== 11) errors.cpf = 'CPF deve ter 11 números.';
    if (!validIsoDate(birthDate)) errors.birthDate = 'Informe uma data de nascimento válida.';
    if (digits(cnhNumber).length !== 11) errors.cnhNumber = 'Número da CNH deve ter 11 números.';
    if (!cnhCategory) errors.cnhCategory = 'Selecione a categoria da CNH.';
    if (!validIsoDate(cnhExpiration)) errors.cnhExpiration = 'Informe uma validade de CNH válida.';
    if (requiresCompleteProfile && !cnhEar) errors.cnhEar = 'Informe Sim ou Não para atividade remunerada (EAR).';
    if (!isCnhCompletion && !phone.trim()) errors.phone = 'Informe o telefone principal.'; else if (phone.trim() && !validPhone(phone)) errors.phone = 'Telefone inválido. Use 10 ou 11 números, com ou sem pontuação.';
    if (whatsapp.trim() && !validPhone(whatsapp)) errors.whatsapp = 'WhatsApp inválido.';
    if (requiresCompleteProfile && !email.trim()) errors.email = 'Informe o e-mail do motorista.'; else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Informe um e-mail válido.';
    if (zipCode.trim() && digits(zipCode).length !== 8) errors.zipCode = 'CEP deve ter 8 números.';
    if (state.trim() && !/^[A-Za-z]{2}$/.test(state.trim())) errors.state = 'UF deve ter 2 letras.';
    if (requiresCompleteProfile) {
      if (!residenceType) errors.residenceType = 'Selecione Casa, Apartamento ou Outro.';
      if (digits(zipCode).length !== 8) errors.zipCode = 'Informe um CEP válido com 8 números.';
      if (!street.trim()) errors.street = 'Informe o logradouro.';
      if (!number.trim()) errors.number = 'Informe o número do endereço.';
      if (!neighborhood.trim()) errors.neighborhood = 'Informe o bairro.';
      if (!city.trim()) errors.city = 'Informe a cidade.';
      if (!/^[A-Za-z]{2}$/.test(state.trim())) errors.state = 'Informe a UF com 2 letras.';
      if (residenceType === 'APARTMENT') {
        if (!condominiumName.trim()) errors.condominiumName = 'Informe o nome do condomínio.';
        if (!unit.trim()) errors.unit = 'Informe o apartamento/unidade.';
      }
      if (residenceType === 'OTHER' && !residenceTypeOther.trim()) errors.residenceTypeOther = 'Descreva o tipo de residência.';
    }
    return errors;
  };
  const focusFirstError = (errors: FieldErrors) => { const first = Object.keys(errors)[0]; if (!first) return; window.setTimeout(() => { const element = document.getElementById(`driver-${first}`); element?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (element as HTMLElement | null)?.focus?.(); }, 0); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMessage(null); setSuccessMessage(null);
    const errors = validateForm(); setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { const count = Object.keys(errors).length; setErrorMessage(`Corrija ${count} ${count === 1 ? 'campo destacado' : 'campos destacados'} para salvar.`); focusFirstError(errors); return; }
    setLoading(true);
    try {
      const normalizedCpf = digits(cpf); const normalizedCnh = digits(cnhNumber); const normalizedPhone = digits(phone); const normalizedWhatsapp = digits(whatsapp); const normalizedZipCode = digits(zipCode);
      const addressHasData = !!(normalizedZipCode || street.trim() || number.trim() || complement.trim() || neighborhood.trim() || city.trim() || state.trim() || residenceType || residenceTypeOther.trim() || condominiumName.trim() || blockTower.trim() || unit.trim() || floor.trim() || addressReference.trim());
      const input: DriverCreateInput = {
        fullName: fullName.trim(), cpf: normalizedCpf, rg: rg.trim() || undefined, birthDate,
        phone: normalizedPhone, whatsapp: normalizedWhatsapp || normalizedPhone, email: email.trim() || undefined,
        address: addressHasData ? {
          zipCode: normalizedZipCode, street: street.trim(), number: number.trim(), complement: complement.trim() || undefined,
          neighborhood: neighborhood.trim(), city: city.trim(), state: state.trim().toUpperCase(),
          residenceType: residenceType || undefined,
          residenceTypeOther: residenceType === 'OTHER' ? residenceTypeOther.trim() || undefined : undefined,
          condominiumName: residenceType === 'APARTMENT' ? condominiumName.trim() || undefined : undefined,
          blockTower: residenceType === 'APARTMENT' ? blockTower.trim() || undefined : undefined,
          unit: residenceType === 'APARTMENT' ? unit.trim() || undefined : undefined,
          floor: residenceType === 'APARTMENT' ? floor.trim() || undefined : undefined,
          reference: addressReference.trim() || undefined,
        } : undefined,
        cnhNumber: normalizedCnh, cnhCategory, cnhExpiration, cnhEar: cnhEar ? cnhEar === 'YES' : undefined, appPlatforms, notes: notes.trim() || undefined,
      };
      let driverId = driverToEdit?.id || cnhDriverId || createdDriverId || undefined;
      if (driverToEdit) {
        await DriverClient.update(driverToEdit.id, input);
        if (status !== driverToEdit.status && status !== DriverStatus.ARCHIVED) await DriverClient.changeStatus(driverToEdit.id, status as Exclude<DriverStatus, DriverStatus.ARCHIVED>);
      } else if (isCnhCompletion && cnhDriverId) {
        const update: DriverUpdateInput = { fullName: input.fullName, cpf: input.cpf, rg: input.rg, birthDate: input.birthDate, cnhNumber: input.cnhNumber, cnhCategory: input.cnhCategory, cnhExpiration: input.cnhExpiration, cnhEar: input.cnhEar, appPlatforms: input.appPlatforms, notes: input.notes, email: input.email, address: input.address };
        if (normalizedPhone) update.phone = normalizedPhone; if (normalizedWhatsapp) update.whatsapp = normalizedWhatsapp; else if (normalizedPhone) update.whatsapp = normalizedPhone;
        await DriverClient.update(cnhDriverId, update);
      } else {
        if (!driverId) { const created = await DriverClient.create(input); driverId = created.id; setCreatedDriverId(created.id); }
      }
      if (cnhIntakeId && driverId) {
        const promotion = await DriverDocumentIntakeClient.promote(cnhIntakeId, driverId);
        if (promotion.driverId !== driverId) throw new Error('A CNH não foi vinculada ao motorista. Tente concluir o vínculo novamente.');
      }
      if (profilePhoto && !profilePhotoUploaded) {
        if (!driverId) throw new Error('O cadastro do motorista precisa existir antes de salvar a foto.');
        await AttachmentClient.upload({ entityType: 'Driver', entityId: driverId, documentType: PROFILE_PHOTO_DOCUMENT_TYPE, fileName: profilePhoto.name, mimeType: profilePhoto.type, content: profilePhoto });
        setProfilePhotoUploaded(true);
      }
      await onSuccess(); setSuccessMessage(isCnhCompletion ? 'Cadastro concluído com sucesso. A CNH permanece salva em CNH & Documentos.' : 'Cadastro salvo com sucesso.'); window.setTimeout(() => onClose(), 1100);
    } catch (err: unknown) { setErrorMessage(err instanceof Error ? err.message : 'Ocorreu um erro ao salvar os dados do motorista.'); }
    finally { setLoading(false); }
  };

  const allStandardSelected = STANDARD_PLATFORMS.every((platform) => appPlatforms.includes(platform));
  const customPlatforms = appPlatforms.filter((item) => !STANDARD_PLATFORMS.includes(item as typeof STANDARD_PLATFORMS[number]));

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} title={driverToEdit ? 'Editar Cadastro de Motorista' : isCnhCompletion ? 'Completar Cadastro do Motorista' : 'Novo Cadastro de Motorista'} maxWidth="4xl">
      <form onSubmit={handleSubmit} className="space-y-6" noValidate autoComplete="off">
        {errorMessage && <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2.5"><AlertCircle className="w-5 h-5 shrink-0" /><span>{errorMessage}</span></div>}
        {successMessage && <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2.5"><CheckCircle2 className="w-5 h-5 shrink-0" /><span>{successMessage}</span></div>}
        {!driverToEdit && initialCnhDraft && Object.keys(initialCnhDraft).length > 0 && <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-sm flex items-start gap-2.5"><FileText className="w-5 h-5 shrink-0 mt-0.5" /><span>{isCnhCompletion ? 'A CNH e os dados da habilitação já foram salvos. Para concluir o cadastro, preencha os campos obrigatórios destacados abaixo.' : 'Dados preenchidos a partir de uma CNH aprovada. Revise as informações antes de salvar.'}</span></div>}

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"><User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">1. Dados Pessoais</h3></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><Input id="driver-fullName" label="Nome Completo" value={fullName} onChange={(e) => { setFullName(e.target.value); clearFieldError('fullName'); }} required error={fieldErrors.fullName} /></div>
          <Input id="driver-cpf" label="CPF" value={cpf} onChange={(e) => { setCpf(e.target.value); clearFieldError('cpf'); }} placeholder="000.000.000-00" required error={fieldErrors.cpf} helperText="Pode digitar com ou sem pontos e traço." />
          <Input label="RG" value={rg} onChange={(e) => setRg(e.target.value)} />
          <Input id="driver-birthDate" label="Data de Nascimento" type="date" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); clearFieldError('birthDate'); }} required error={fieldErrors.birthDate} />
          <Input id="driver-phone" label="Telefone Principal" value={phone} onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }} placeholder="(11) 90000-0000" required={!isCnhCompletion} error={fieldErrors.phone} helperText={isCnhCompletion ? 'Pode ser completado nesta etapa.' : 'Pode digitar com ou sem pontuação.'} />
          <Input id="driver-whatsapp" label="WhatsApp" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); clearFieldError('whatsapp'); }} error={fieldErrors.whatsapp} />
          <div className="lg:col-span-2"><Input id="driver-email" label="E-mail" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }} required={requiresCompleteProfile} error={fieldErrors.email} /></div>
        </div></div>

        {!driverToEdit && <div className="space-y-3"><div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"><Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Foto do motorista (opcional)</h3></div><div className="flex flex-wrap items-center gap-3"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">{profilePhotoPreviewUrl ? <img src={profilePhotoPreviewUrl} alt="Prévia da foto do motorista" className="h-full w-full object-cover" /> : <User className="h-8 w-8 text-slate-400" />}</div><div className="flex flex-col gap-2"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => profilePhotoInputRef.current?.click()} disabled={loading}><Camera className="mr-1 h-4 w-4" />{profilePhoto ? 'Trocar foto' : 'Selecionar foto'}</Button>{profilePhoto && <Button type="button" size="sm" variant="ghost" onClick={clearProfilePhoto} disabled={loading}><Trash2 className="mr-1 h-4 w-4 text-rose-600" />Remover foto</Button>}</div><span className="text-xs text-slate-500 dark:text-slate-400">JPEG, PNG ou WEBP, até 10 MB. Você pode adicionar a foto depois.</span></div><input ref={profilePhotoInputRef} type="file" className="hidden" accept={PROFILE_PHOTO_MIME_TYPES.join(',')} onChange={(event) => selectProfilePhoto(event.target.files?.[0])} /></div></div>}

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"><CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">2. Carteira Nacional de Habilitação (CNH)</h3></div>{driverToEdit && <DriverCnhPrefillButton driverId={driverToEdit.id} onApply={applyApprovedCnhDraft} />}<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input id="driver-cnhNumber" label="Número do Registro CNH" value={cnhNumber} onChange={(e) => { setCnhNumber(e.target.value); clearFieldError('cnhNumber'); }} required error={fieldErrors.cnhNumber} helperText="Pontuação é ignorada; serão usados apenas os números." />
          <Select id="driver-cnhCategory" label="Categoria" value={cnhCategory} onChange={(e) => { setCnhCategory(e.target.value); clearFieldError('cnhCategory'); }} required error={fieldErrors.cnhCategory}><option value="">Selecione</option><option value="A">A (Moto)</option><option value="B">B (Carro)</option><option value="AB">AB (Carro e Moto)</option><option value="C">C (Caminhão)</option><option value="D">D (Ônibus/Vans)</option><option value="E">E (Articulados)</option></Select>
          <Input id="driver-cnhExpiration" label="Validade da CNH" type="date" value={cnhExpiration} onChange={(e) => { setCnhExpiration(e.target.value); clearFieldError('cnhExpiration'); }} required error={fieldErrors.cnhExpiration} />
          <Select id="driver-cnhEar" label="Atividade remunerada (EAR)" value={cnhEar} onChange={(e) => { setCnhEar(e.target.value as EarValue); clearFieldError('cnhEar'); }} required={requiresCompleteProfile} error={fieldErrors.cnhEar}><option value="">Selecione</option><option value="YES">Sim</option><option value="NO">Não</option></Select>
          {driverToEdit && <Select label="Status Operacional" value={status} onChange={(e) => setStatus(e.target.value as DriverStatus)}><option value={DriverStatus.ACTIVE}>Ativo</option><option value={DriverStatus.INACTIVE}>Inativo</option><option value={DriverStatus.PENDING_DOCS}>Pendente de Docs</option><option value={DriverStatus.BLOCKED}>Bloqueado</option></Select>}
        </div>{!cnhEar && isCnhCompletion && <p className="text-xs text-amber-700 dark:text-amber-300">A leitura da CNH não confirmou EAR. Selecione Sim ou Não para concluir o cadastro.</p>}</div>

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"><MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">3. Endereço {!requiresCompleteProfile && <span className="font-normal text-slate-400">(opcional)</span>}</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select id="driver-residenceType" label="Tipo de residência" value={residenceType} onChange={(e) => { setResidenceType(e.target.value as ResidenceType); clearFieldError('residenceType'); }} required={requiresCompleteProfile} error={fieldErrors.residenceType}><option value="">Selecione</option><option value="HOUSE">Casa</option><option value="APARTMENT">Apartamento</option><option value="OTHER">Outro</option></Select>
          {residenceType === 'OTHER' && <Input id="driver-residenceTypeOther" label="Qual tipo?" value={residenceTypeOther} onChange={(e) => { setResidenceTypeOther(e.target.value); clearFieldError('residenceTypeOther'); }} required={requiresCompleteProfile} error={fieldErrors.residenceTypeOther} />}
          <Input id="driver-zipCode" label="CEP" value={zipCode} onChange={(e) => { setZipCode(e.target.value); clearFieldError('zipCode'); setCepMessage(null); }} onBlur={lookupCep} required={requiresCompleteProfile} error={fieldErrors.zipCode} helperText={cepLoading ? 'Consultando CEP...' : cepMessage || 'Ao informar o CEP, rua, bairro, cidade e UF serão preenchidos automaticamente.'} />
          <div className="sm:col-span-2"><Input id="driver-street" label="Logradouro / Rua" value={street} onChange={(e) => { setStreet(e.target.value); clearFieldError('street'); }} required={requiresCompleteProfile} error={fieldErrors.street} /></div>
          <Input id="driver-number" label="Número" value={number} onChange={(e) => { setNumber(e.target.value); clearFieldError('number'); }} required={requiresCompleteProfile} error={fieldErrors.number} />
          <Input id="driver-complement" label="Complemento" value={complement} onChange={(e) => { setComplement(e.target.value); clearFieldError('complement'); }} helperText="Opcional." />
          <Input id="driver-neighborhood" label="Bairro" value={neighborhood} onChange={(e) => { setNeighborhood(e.target.value); clearFieldError('neighborhood'); }} required={requiresCompleteProfile} error={fieldErrors.neighborhood} />
          <Input id="driver-city" label="Cidade" value={city} onChange={(e) => { setCity(e.target.value); clearFieldError('city'); }} required={requiresCompleteProfile} error={fieldErrors.city} />
          <Input id="driver-state" label="Estado (UF)" value={state} onChange={(e) => { setState(e.target.value.toUpperCase()); clearFieldError('state'); }} maxLength={2} required={requiresCompleteProfile} error={fieldErrors.state} />
          {residenceType === 'APARTMENT' && <>
            <Input id="driver-condominiumName" label="Nome do condomínio" value={condominiumName} onChange={(e) => { setCondominiumName(e.target.value); clearFieldError('condominiumName'); }} required={requiresCompleteProfile} error={fieldErrors.condominiumName} />
            <Input label="Bloco / Torre" value={blockTower} onChange={(e) => setBlockTower(e.target.value)} />
            <Input id="driver-unit" label="Apartamento / Unidade" value={unit} onChange={(e) => { setUnit(e.target.value); clearFieldError('unit'); }} required={requiresCompleteProfile} error={fieldErrors.unit} />
            <Input label="Andar" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </>}
          <div className="sm:col-span-2"><Input label="Referência / observação do endereço" value={addressReference} onChange={(e) => setAddressReference(e.target.value)} /></div>
        </div></div>

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"><FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">4. Plataformas e Observações</h3></div><div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Plataformas de Atuação</label><div className="flex flex-wrap gap-2">
          <button type="button" onClick={toggleAllPlatforms} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${allStandardSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}>Todas</button>
          {STANDARD_PLATFORMS.map((platform) => { const active = appPlatforms.includes(platform); return <button type="button" key={platform} onClick={() => togglePlatform(platform)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}>{platform}</button>; })}
          <button type="button" onClick={() => setShowOtherPlatform((value) => !value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${showOtherPlatform || customPlatforms.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}>Outras</button>
        </div>{(showOtherPlatform || customPlatforms.length > 0) && <div className="mt-3 max-w-md space-y-2"><div className="flex gap-2"><Input label="Outra plataforma" value={otherPlatform} onChange={(e) => setOtherPlatform(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOtherPlatform(); } }} /><Button type="button" variant="outline" onClick={addOtherPlatform} disabled={!otherPlatform.trim()}><Plus className="h-4 w-4" /></Button></div>{customPlatforms.length > 0 && <div className="flex flex-wrap gap-2">{customPlatforms.map((platform) => <button type="button" key={platform} onClick={() => togglePlatform(platform)} className="rounded-full border border-slate-300 px-2.5 py-1 text-xs">{platform} ×</button>)}</div>}</div>}</div>
          <div><label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Observações Operacionais</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm" /></div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800"><Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button><Button type="submit" variant="primary" isLoading={loading}>{driverToEdit ? 'Salvar Alterações' : isCnhCompletion ? 'Concluir cadastro' : 'Cadastrar Motorista'}</Button></div>
      </form>
    </ModalContainer>
  );
};