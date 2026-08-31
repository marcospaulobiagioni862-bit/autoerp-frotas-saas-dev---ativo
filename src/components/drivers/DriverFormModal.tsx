import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, CreditCard, FileText, MapPin, Plus, Trash2, User } from 'lucide-react';
import { ModalContainer, Input, Select, Button } from '../ui';
import { DriverClient, type DriverCreateInput, type DriverUpdateInput } from '../../api/driverClient';
import { AttachmentClient } from '../../api/attachmentClient';
import { DriverDocumentIntakeClient, type ApprovedCnhDriverDraft } from '../../api/driverDocumentIntakeClient';
import { Driver } from '../../types/entities';
import { DriverStatus } from '../../types/enums';
import { DriverCnhPrefillButton } from './DriverCnhPrefillButton';
import type { DriverCnhDraft } from '../../api/driverCnhPrefill';
import { PROFILE_PHOTO_DOCUMENT_TYPE, PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MIME_TYPES } from './DriverProfilePhoto';
import {
  type DriverAddressDraft,
  type DriverAddressField,
  type DriverResidenceType,
  hasAddressData,
  validateDriverAddress,
} from './driverAddressRules';

type ApprovedCnhDriverDraftWithIntake = ApprovedCnhDriverDraft & { intakeId?: string; driverId?: string };
type BaseField = 'fullName' | 'cpf' | 'birthDate' | 'phone' | 'whatsapp' | 'email' | 'cnhNumber' | 'cnhCategory' | 'cnhExpiration';
type FieldErrors = Partial<Record<BaseField | DriverAddressField, string>>;
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
function emptyAddress(): DriverAddressDraft {
  return { residenceType: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: '', condominiumName: '', building: '', unit: '', floor: '', reference: '', otherResidenceType: '' };
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
  const [address, setAddress] = useState<DriverAddressDraft>(emptyAddress());
  const [cnhNumber, setCnhNumber] = useState('');
  const [cnhCategory, setCnhCategory] = useState('');
  const [cnhExpiration, setCnhExpiration] = useState('');
  const [appPlatforms, setAppPlatforms] = useState<string[]>([]);
  const [status, setStatus] = useState<DriverStatus>(DriverStatus.ACTIVE);
  const [notes, setNotes] = useState('');

  const cnhDraftMeta = initialCnhDraft as ApprovedCnhDriverDraftWithIntake | null | undefined;
  const cnhIntakeId = cnhDraftMeta?.intakeId;
  const cnhDriverId = cnhDraftMeta?.driverId;
  const isCnhCompletion = !driverToEdit && !!cnhDriverId;

  const updateAddress = (field: DriverAddressField, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  };

  useEffect(() => {
    setCreatedDriverId(null); setProfilePhoto(null); setProfilePhotoUploaded(false); setErrorMessage(null); setSuccessMessage(null); setFieldErrors({}); setCepMessage(null); setShowOtherPlatform(false); setOtherPlatform('');
    setProfilePhotoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; });
    if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
    if (driverToEdit) {
      const a = driverToEdit.address || ({} as Driver['address']);
      const legacyHasAddress = !!(a.street || a.number || a.neighborhood || a.city || a.state || a.zipCode);
      setFullName(driverToEdit.fullName || ''); setCpf(driverToEdit.cpf || ''); setRg(driverToEdit.rg || ''); setBirthDate(driverToEdit.birthDate || ''); setPhone(driverToEdit.phone || ''); setWhatsapp(driverToEdit.whatsapp || ''); setEmail(driverToEdit.email || '');
      setAddress({ residenceType: a.residenceType || (legacyHasAddress ? 'HOUSE' : ''), street: a.street || '', number: a.number || '', complement: a.complement || '', neighborhood: a.neighborhood || '', city: a.city || '', state: a.state || '', zipCode: a.zipCode || '', condominiumName: a.condominiumName || '', building: a.building || '', unit: a.unit || '', floor: a.floor || '', reference: a.reference || '', otherResidenceType: a.otherResidenceType || '' });
      setCnhNumber(driverToEdit.cnhNumber || ''); setCnhCategory(driverToEdit.cnhCategory || ''); setCnhExpiration(driverToEdit.cnhExpiration || ''); setAppPlatforms(driverToEdit.appPlatforms || []); setStatus(driverToEdit.status || DriverStatus.ACTIVE); setNotes(driverToEdit.notes || '');
      setShowOtherPlatform((driverToEdit.appPlatforms || []).some((item) => !STANDARD_PLATFORMS.includes(item as typeof STANDARD_PLATFORMS[number])));
    } else {
      setFullName(initialCnhDraft?.fullName || ''); setCpf(initialCnhDraft?.cpf || ''); setRg(initialCnhDraft?.rg || ''); setBirthDate(initialCnhDraft?.birthDate || ''); setPhone(''); setWhatsapp(''); setEmail(''); setAddress(emptyAddress());
      setCnhNumber(initialCnhDraft?.cnhNumber || ''); setCnhCategory(initialCnhDraft?.cnhCategory || ''); setCnhExpiration(initialCnhDraft?.cnhExpiration || ''); setAppPlatforms([]); setStatus(DriverStatus.ACTIVE); setNotes('');
    }
  }, [driverToEdit, initialCnhDraft, isOpen]);

  useEffect(() => () => { if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl); }, [profilePhotoPreviewUrl]);

  const clearFieldError = (field: keyof FieldErrors) => setFieldErrors((current) => { if (!current[field]) return current; const next = { ...current }; delete next[field]; return next; });
  const clearProfilePhoto = () => { setProfilePhoto(null); setProfilePhotoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return null; }); if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = ''; };
  const selectProfilePhoto = (selected: File | undefined) => {
    setErrorMessage(null); if (!selected) return;
    if (!PROFILE_PHOTO_MIME_TYPES.includes(selected.type)) { clearProfilePhoto(); setErrorMessage('Use uma foto JPEG, PNG ou WEBP.'); return; }
    if (selected.size <= 0 || selected.size > PROFILE_PHOTO_MAX_BYTES) { clearProfilePhoto(); setErrorMessage(selected.size <= 0 ? 'A foto está vazia.' : 'A foto excede 10 MB.'); return; }
    setProfilePhoto(selected); setProfilePhotoUploaded(false); setProfilePhotoPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(selected); });
  };
  const applyApprovedCnhDraft = (draft: DriverCnhDraft) => { if (draft.fullName !== undefined) setFullName(draft.fullName); if (draft.cpf !== undefined) setCpf(draft.cpf); if (draft.rg !== undefined) setRg(draft.rg); if (draft.birthDate !== undefined) setBirthDate(draft.birthDate); if (draft.cnhNumber !== undefined) setCnhNumber(draft.cnhNumber); if (draft.cnhCategory !== undefined) setCnhCategory(draft.cnhCategory); if (draft.cnhExpiration !== undefined) setCnhExpiration(draft.cnhExpiration); };
  const togglePlatform = (platform: string) => setAppPlatforms((current) => current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform]);
  const toggleAllPlatforms = () => { const allSelected = STANDARD_PLATFORMS.every((platform) => appPlatforms.includes(platform)); if (allSelected) setAppPlatforms((current) => current.filter((item) => !STANDARD_PLATFORMS.includes(item as typeof STANDARD_PLATFORMS[number]))); else setAppPlatforms((current) => [...new Set([...current, ...STANDARD_PLATFORMS])]); };
  const addOtherPlatform = () => { const clean = otherPlatform.trim(); if (!clean) return; setAppPlatforms((current) => current.some((item) => item.toLowerCase() === clean.toLowerCase()) ? current : [...current, clean]); setOtherPlatform(''); setShowOtherPlatform(true); };

  const lookupCep = async () => {
    const cep = digits(address.zipCode); setCepMessage(null); if (!cep) return;
    if (cep.length !== 8) { setFieldErrors((current) => ({ ...current, zipCode: 'Informe um CEP com 8 números.' })); return; }
    setCepLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`); if (!response.ok) throw new Error('CEP_LOOKUP_FAILED');
      const data = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) { setCepMessage('CEP não encontrado. Preencha o endereço manualmente.'); return; }
      setAddress((current) => ({ ...current, zipCode: cep, street: data.logradouro || '', neighborhood: data.bairro || '', city: data.localidade || '', state: (data.uf || '').toUpperCase() }));
      clearFieldError('zipCode'); setCepMessage('Endereço localizado. Informe o tipo de residência e o número.');
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
    if (!isCnhCompletion && !phone.trim()) errors.phone = 'Informe o telefone principal.'; else if (phone.trim() && !validPhone(phone)) errors.phone = 'Telefone inválido. Use 10 ou 11 números, com ou sem pontuação.';
    if (whatsapp.trim() && !validPhone(whatsapp)) errors.whatsapp = 'WhatsApp inválido.';
    if (!email.trim()) errors.email = 'Informe o e-mail do motorista.'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Informe um e-mail válido.';
    if (address.zipCode.trim() && digits(address.zipCode).length !== 8) errors.zipCode = 'CEP deve ter 8 números.';
    if (address.state.trim() && !/^[A-Za-z]{2}$/.test(address.state.trim())) errors.state = 'UF deve ter 2 letras.';
    Object.assign(errors, validateDriverAddress(address));
    return errors;
  };
  const focusFirstError = (errors: FieldErrors) => { const first = Object.keys(errors)[0]; if (!first) return; window.setTimeout(() => { const element = document.getElementById(`driver-${first}`); element?.scrollIntoView({ behavior: 'smooth', block: 'center' }); (element as HTMLElement | null)?.focus?.(); }, 0); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMessage(null); setSuccessMessage(null);
    const errors = validateForm(); setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { const count = Object.keys(errors).length; setErrorMessage(`Corrija ${count} ${count === 1 ? 'campo destacado' : 'campos destacados'} para salvar.`); focusFirstError(errors); return; }
    setLoading(true);
    try {
      const normalizedCpf = digits(cpf); const normalizedCnh = digits(cnhNumber); const normalizedPhone = digits(phone); const normalizedWhatsapp = digits(whatsapp); const normalizedZipCode = digits(address.zipCode);
      const addressPayload = hasAddressData(address) ? { residenceType: address.residenceType as DriverResidenceType, zipCode: normalizedZipCode, street: address.street.trim(), number: address.number.trim(), complement: address.complement.trim() || undefined, neighborhood: address.neighborhood.trim(), city: address.city.trim(), state: address.state.trim().toUpperCase(), condominiumName: address.condominiumName.trim() || undefined, building: address.building.trim() || undefined, unit: address.unit.trim() || undefined, floor: address.floor.trim() || undefined, reference: address.reference.trim() || undefined, otherResidenceType: address.otherResidenceType.trim() || undefined } : undefined;
      const input: DriverCreateInput = { fullName: fullName.trim(), cpf: normalizedCpf, rg: rg.trim() || undefined, birthDate, phone: normalizedPhone, whatsapp: normalizedWhatsapp || normalizedPhone, email: email.trim(), address: addressPayload, cnhNumber: normalizedCnh, cnhCategory, cnhExpiration, appPlatforms, notes: notes.trim() || undefined };
      let driverId = driverToEdit?.id || cnhDriverId || createdDriverId || undefined;
      if (driverToEdit) {
        await DriverClient.update(driverToEdit.id, input);
        if (status !== driverToEdit.status && status !== DriverStatus.ARCHIVED) await DriverClient.changeStatus(driverToEdit.id, status as Exclude<DriverStatus, DriverStatus.ARCHIVED>);
      } else if (isCnhCompletion && cnhDriverId) {
        const update: DriverUpdateInput = { fullName: input.fullName, cpf: input.cpf, rg: input.rg, birthDate: input.birthDate, email: input.email, cnhNumber: input.cnhNumber, cnhCategory: input.cnhCategory, cnhExpiration: input.cnhExpiration, appPlatforms: input.appPlatforms, notes: input.notes };
        if (normalizedPhone) update.phone = normalizedPhone; if (normalizedWhatsapp) update.whatsapp = normalizedWhatsapp; else if (normalizedPhone) update.whatsapp = normalizedPhone; if (addressPayload) update.address = addressPayload;
        await DriverClient.update(cnhDriverId, update);
      } else {
        if (!driverId) { const created = await DriverClient.create(input); driverId = created.id; setCreatedDriverId(created.id); }
        if (cnhIntakeId && driverId) { const promotion = await DriverDocumentIntakeClient.promote(cnhIntakeId, driverId); if (promotion.driverId !== driverId) throw new Error('A CNH não foi vinculada ao motorista criado. Tente concluir o vínculo novamente.'); }
      }
      if (profilePhoto && !profilePhotoUploaded) {
        if (!driverId) throw new Error('O cadastro do motorista precisa existir antes de salvar a foto.');
        await AttachmentClient.upload({ entityType: 'Driver', entityId: driverId, documentType: PROFILE_PHOTO_DOCUMENT_TYPE, fileName: profilePhoto.name, mimeType: profilePhoto.type, content: profilePhoto });
        setProfilePhotoUploaded(true);
      }
      await onSuccess(); setSuccessMessage(isCnhCompletion ? 'Dados complementares salvos com sucesso. A CNH já permanece arquivada no cadastro.' : 'Cadastro salvo com sucesso.'); window.setTimeout(() => onClose(), 1100);
    } catch (err: unknown) { setErrorMessage(err instanceof Error ? err.message : 'Ocorreu um erro ao salvar os dados do motorista.'); }
    finally { setLoading(false); }
  };

  const allStandardSelected = STANDARD_PLATFORMS.every((platform) => appPlatforms.includes(platform));
  const customPlatforms = appPlatforms.filter((item) => !STANDARD_PLATFORMS.includes(item as typeof STANDARD_PLATFORMS[number]));

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} title={driverToEdit ? 'Editar Cadastro de Motorista' : isCnhCompletion ? 'Completar Cadastro do Motorista' : 'Novo Cadastro de Motorista'} maxWidth="4xl">
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {errorMessage && <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm flex items-center gap-2.5"><AlertCircle className="w-5 h-5 shrink-0" /><span>{errorMessage}</span></div>}
        {successMessage && <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl text-emerald-800 dark:text-emerald-300 text-sm flex items-center gap-2.5"><CheckCircle2 className="w-5 h-5 shrink-0" /><span>{successMessage}</span></div>}
        {!driverToEdit && initialCnhDraft && Object.keys(initialCnhDraft).length > 0 && <div className="p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 text-sm flex items-start gap-2.5"><FileText className="w-5 h-5 shrink-0 mt-0.5" /><span>{isCnhCompletion ? 'A CNH e os dados da habilitação já foram salvos. Complete os dados cadastrais obrigatórios abaixo.' : 'Dados preenchidos a partir de uma CNH aprovada. Revise as informações antes de salvar.'}</span></div>}

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800"><User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /><h3 className="text-sm font-semibold">1. Dados Pessoais</h3></div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><Input id="driver-fullName" label="Nome Completo" value={fullName} onChange={(e) => { setFullName(e.target.value); clearFieldError('fullName'); }} required error={fieldErrors.fullName} /></div>
          <Input id="driver-cpf" label="CPF" value={cpf} onChange={(e) => { setCpf(e.target.value); clearFieldError('cpf'); }} placeholder="000.000.000-00" required error={fieldErrors.cpf} helperText="Pode digitar com ou sem pontos e traço." />
          <Input label="RG" value={rg} onChange={(e) => setRg(e.target.value)} />
          <Input id="driver-birthDate" label="Data de Nascimento" type="date" value={birthDate} onChange={(e) => { setBirthDate(e.target.value); clearFieldError('birthDate'); }} required error={fieldErrors.birthDate} />
          <Input id="driver-phone" label="Telefone Principal" value={phone} onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }} placeholder="(11) 90000-0000" required={!isCnhCompletion} error={fieldErrors.phone} helperText={isCnhCompletion ? 'Pode ser completado depois.' : 'Pode digitar com ou sem pontuação.'} />
          <Input id="driver-whatsapp" label="WhatsApp" value={whatsapp} onChange={(e) => { setWhatsapp(e.target.value); clearFieldError('whatsapp'); }} error={fieldErrors.whatsapp} />
          <div className="lg:col-span-2"><Input id="driver-email" label="E-mail" type="email" value={email} onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }} required error={fieldErrors.email} /></div>
        </div></div>

        {!driverToEdit && <div className="space-y-3"><div className="flex items-center gap-2 pb-2 border-b"><Camera className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-semibold">Foto do motorista (opcional)</h3></div><div className="flex flex-wrap items-center gap-3"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border bg-slate-100 dark:bg-slate-800">{profilePhotoPreviewUrl ? <img src={profilePhotoPreviewUrl} alt="Prévia da foto do motorista" className="h-full w-full object-cover" /> : <User className="h-8 w-8 text-slate-400" />}</div><div className="flex flex-col gap-2"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => profilePhotoInputRef.current?.click()} disabled={loading}><Camera className="mr-1 h-4 w-4" />{profilePhoto ? 'Trocar foto' : 'Selecionar foto'}</Button>{profilePhoto && <Button type="button" size="sm" variant="ghost" onClick={clearProfilePhoto} disabled={loading}><Trash2 className="mr-1 h-4 w-4 text-rose-600" />Remover foto</Button>}</div><span className="text-xs text-slate-500">JPEG, PNG ou WEBP, até 10 MB.</span></div><input ref={profilePhotoInputRef} type="file" className="hidden" accept={PROFILE_PHOTO_MIME_TYPES.join(',')} onChange={(event) => selectProfilePhoto(event.target.files?.[0])} /></div></div>}

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b"><CreditCard className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-semibold">2. Carteira Nacional de Habilitação (CNH)</h3></div>{driverToEdit && <DriverCnhPrefillButton driverId={driverToEdit.id} onApply={applyApprovedCnhDraft} />}<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input id="driver-cnhNumber" label="Número do Registro CNH" value={cnhNumber} onChange={(e) => { setCnhNumber(e.target.value); clearFieldError('cnhNumber'); }} required error={fieldErrors.cnhNumber} />
          <Select id="driver-cnhCategory" label="Categoria" value={cnhCategory} onChange={(e) => { setCnhCategory(e.target.value); clearFieldError('cnhCategory'); }} required error={fieldErrors.cnhCategory}><option value="">Selecione</option><option value="A">A (Moto)</option><option value="B">B (Carro)</option><option value="AB">AB (Carro e Moto)</option><option value="C">C (Caminhão)</option><option value="D">D (Ônibus/Vans)</option><option value="E">E (Articulados)</option></Select>
          <Input id="driver-cnhExpiration" label="Validade da CNH" type="date" value={cnhExpiration} onChange={(e) => { setCnhExpiration(e.target.value); clearFieldError('cnhExpiration'); }} required error={fieldErrors.cnhExpiration} />
          {driverToEdit && <Select label="Status Operacional" value={status} onChange={(e) => setStatus(e.target.value as DriverStatus)}><option value={DriverStatus.ACTIVE}>Ativo</option><option value={DriverStatus.INACTIVE}>Inativo</option><option value={DriverStatus.PENDING_DOCS}>Pendente de Docs</option><option value={DriverStatus.BLOCKED}>Bloqueado</option></Select>}
        </div></div>

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b"><MapPin className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-semibold">3. Endereço</h3></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select id="driver-residenceType" label="Tipo de residência" value={address.residenceType} onChange={(e) => updateAddress('residenceType', e.target.value)} error={fieldErrors.residenceType}><option value="">Selecione</option><option value="HOUSE">Casa</option><option value="APARTMENT">Apartamento</option><option value="OTHER">Outro</option></Select>
          <Input id="driver-zipCode" label="CEP" value={address.zipCode} onChange={(e) => { updateAddress('zipCode', e.target.value); setCepMessage(null); }} onBlur={lookupCep} error={fieldErrors.zipCode} helperText={cepLoading ? 'Consultando CEP...' : cepMessage || 'Ao informar o CEP, rua, bairro, cidade e UF serão preenchidos.'} />
          <div className="sm:col-span-2"><Input id="driver-street" label="Logradouro / Rua" value={address.street} onChange={(e) => updateAddress('street', e.target.value)} /></div>
          <Input id="driver-number" label="Número" value={address.number} onChange={(e) => updateAddress('number', e.target.value)} required={hasAddressData(address)} error={fieldErrors.number} />
          <Input id="driver-complement" label="Complemento" value={address.complement} onChange={(e) => updateAddress('complement', e.target.value)} />
          <Input id="driver-neighborhood" label="Bairro" value={address.neighborhood} onChange={(e) => updateAddress('neighborhood', e.target.value)} />
          <Input id="driver-city" label="Cidade" value={address.city} onChange={(e) => updateAddress('city', e.target.value)} />
          <Input id="driver-state" label="Estado (UF)" value={address.state} onChange={(e) => updateAddress('state', e.target.value.toUpperCase())} maxLength={2} error={fieldErrors.state} />
          {address.residenceType === 'APARTMENT' && <><div className="sm:col-span-2"><Input id="driver-condominiumName" label="Nome do condomínio" value={address.condominiumName} onChange={(e) => updateAddress('condominiumName', e.target.value)} required error={fieldErrors.condominiumName} /></div><Input id="driver-building" label="Bloco / Torre" value={address.building} onChange={(e) => updateAddress('building', e.target.value)} /><Input id="driver-unit" label="Apartamento / Unidade" value={address.unit} onChange={(e) => updateAddress('unit', e.target.value)} required error={fieldErrors.unit} /><Input id="driver-floor" label="Andar" value={address.floor} onChange={(e) => updateAddress('floor', e.target.value)} /></>}
          {address.residenceType === 'OTHER' && <div className="sm:col-span-2"><Input id="driver-otherResidenceType" label="Descreva o tipo de residência" value={address.otherResidenceType} onChange={(e) => updateAddress('otherResidenceType', e.target.value)} required error={fieldErrors.otherResidenceType} /></div>}
          <div className="sm:col-span-2"><Input id="driver-reference" label="Referência / observação do endereço" value={address.reference} onChange={(e) => updateAddress('reference', e.target.value)} /></div>
        </div></div>

        <div className="space-y-4"><div className="flex items-center gap-2 pb-2 border-b"><FileText className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-semibold">4. Plataformas e Observações</h3></div><div><label className="block text-xs font-semibold mb-2">Plataformas de Atuação</label><div className="flex flex-wrap gap-2">
          <button type="button" onClick={toggleAllPlatforms} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${allStandardSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 border'}`}>Todas</button>
          {STANDARD_PLATFORMS.map((platform) => { const active = appPlatforms.includes(platform); return <button type="button" key={platform} onClick={() => togglePlatform(platform)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 border'}`}>{platform}</button>; })}
          <button type="button" onClick={() => setShowOtherPlatform((value) => !value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${showOtherPlatform || customPlatforms.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 border'}`}>Outras</button>
        </div>{(showOtherPlatform || customPlatforms.length > 0) && <div className="mt-3 max-w-md space-y-2"><div className="flex gap-2"><Input label="Outra plataforma" value={otherPlatform} onChange={(e) => setOtherPlatform(e.target.value)} /><Button type="button" variant="outline" onClick={addOtherPlatform} disabled={!otherPlatform.trim()}><Plus className="h-4 w-4" /></Button></div>{customPlatforms.length > 0 && <div className="flex flex-wrap gap-2">{customPlatforms.map((platform) => <button type="button" key={platform} onClick={() => togglePlatform(platform)} className="rounded-full border px-2.5 py-1 text-xs">{platform} ×</button>)}</div>}</div>}</div>
          <div><label className="block text-xs font-semibold mb-1">Observações Operacionais</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm" /></div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t"><Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button><Button type="submit" variant="primary" isLoading={loading}>{driverToEdit ? 'Salvar Alterações' : isCnhCompletion ? 'Salvar dados complementares' : 'Cadastrar Motorista'}</Button></div>
      </form>
    </ModalContainer>
  );
};
