import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building,
  CheckCircle2,
  Clock,
  HeartPulse,
  Home,
  Lock,
  Phone,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  DriverFormTokenClient,
  type PublicDriverFormData,
} from '../../api/driverFormTokenClient';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { formatCep, formatPhone } from '../../shared/utils/phoneAndZipCode';

export const PublicDriverFormPage: React.FC<{ token: string }> = ({ token }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PublicDriverFormData | null>(null);
  const [errorStatus, setErrorStatus] = useState<'EXPIRED' | 'ALREADY_CONSUMED' | 'NOT_FOUND' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Address
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [residenceType, setResidenceType] = useState('HOUSE');
  const [residenceTypeOther, setResidenceTypeOther] = useState('');
  const [condominiumName, setCondominiumName] = useState('');
  const [blockTower, setBlockTower] = useState('');
  const [unit, setUnit] = useState('');
  const [floor, setFloor] = useState('');
  const [reference, setReference] = useState('');

  // Personal
  const [profession, setProfession] = useState('');
  const [motherName, setMotherName] = useState('');

  // Health & Emergency
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [relevantConditions, setRelevantConditions] = useState('');
  const [hasContinuousMed, setHasContinuousMed] = useState(false);
  const [continuousMedications, setContinuousMedications] = useState('');
  const [hasControlledMed, setHasControlledMed] = useState(false);
  const [controlledMedications, setControlledMedications] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');

  // LGPD Consent
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage('');

    DriverFormTokenClient.getPublicFormData(token)
      .then((res) => {
        if (!active) return;
        setData(res);
        // Pre-fill existing
        if (res.address) {
          setZipCode(formatCep(res.address.zipCode || ''));
          setStreet(res.address.street || '');
          setNumber(res.address.number || '');
          setComplement(res.address.complement || '');
          setNeighborhood(res.address.neighborhood || '');
          setCity(res.address.city || '');
          setState(res.address.state || '');
          setResidenceType(res.address.residenceType || 'HOUSE');
          setResidenceTypeOther(res.address.residenceTypeOther || '');
          setCondominiumName(res.address.condominiumName || '');
          setBlockTower(res.address.blockTower || '');
          setUnit(res.address.unit || '');
          setFloor(res.address.floor || '');
          setReference(res.address.reference || '');
        }
        setProfession(res.profession || '');
        setMotherName(res.motherName || '');
        if (res.health) {
          setBloodType(res.health.bloodType || '');
          setAllergies(res.health.allergies || '');
          setRelevantConditions(res.health.relevantConditions || '');
          if (res.health.continuousMedications) {
            setHasContinuousMed(true);
            setContinuousMedications(res.health.continuousMedications);
          }
          if (res.health.controlledMedications) {
            setHasControlledMed(true);
            setControlledMedications(res.health.controlledMedications);
          }
          setEmergencyContactName(res.health.emergencyContactName || '');
          setEmergencyContactRelationship(res.health.emergencyContactRelationship || '');
          setEmergencyContactPhone(formatPhone(res.health.emergencyContactPhone || ''));
          setEmergencyNotes(res.health.emergencyNotes || '');
        }
        setLoading(false);
      })
      .catch((err: any) => {
        if (!active) return;
        setLoading(false);
        if (err.code === 'ALREADY_CONSUMED') {
          setErrorStatus('ALREADY_CONSUMED');
          setErrorMessage(err.message || 'Este formulário já foi respondido e seu link era de uso único.');
        } else if (err.code === 'EXPIRED') {
          setErrorStatus('EXPIRED');
          setErrorMessage(err.message || 'Este formulário expirou após 24 horas.');
        } else {
          setErrorStatus('NOT_FOUND');
          setErrorMessage(err.message || 'Link inválido ou não encontrado.');
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const hasAnyHealthData = Boolean(
      bloodType ||
      allergies.trim() ||
      relevantConditions.trim() ||
      (hasContinuousMed && continuousMedications.trim()) ||
      (hasControlledMed && controlledMedications.trim()) ||
      emergencyContactName.trim() ||
      emergencyContactPhone.trim()
    );

    // PH-059: Proibido enviar dados de saúde sem aceite da LGPD
    if (hasAnyHealthData && !lgpdConsent) {
      setFormError('É obrigatório declarar o consentimento informado da LGPD para o envio de dados de saúde e emergência.');
      return;
    }

    setSubmitting(true);
    try {
      await DriverFormTokenClient.submitPublicForm(token, {
        address: {
          zipCode,
          street,
          number,
          complement,
          neighborhood,
          city,
          state,
          residenceType,
          residenceTypeOther: residenceType === 'OTHER' ? residenceTypeOther : undefined,
          condominiumName: residenceType === 'APARTMENT' ? condominiumName : undefined,
          blockTower: residenceType === 'APARTMENT' ? blockTower : undefined,
          unit: residenceType === 'APARTMENT' ? unit : undefined,
          floor: residenceType === 'APARTMENT' ? floor : undefined,
          reference,
        },
        profession: profession.trim() || undefined,
        motherName: motherName.trim() || undefined,
        health: hasAnyHealthData
          ? {
              bloodType: bloodType || undefined,
              allergies: allergies.trim() || undefined,
              relevantConditions: relevantConditions.trim() || undefined,
              continuousMedications: hasContinuousMed ? continuousMedications.trim() : undefined,
              controlledMedications: hasControlledMed ? controlledMedications.trim() : undefined,
              emergencyContactName: emergencyContactName.trim() || undefined,
              emergencyContactRelationship: emergencyContactRelationship.trim() || undefined,
              emergencyContactPhone: emergencyContactPhone.trim() || undefined,
              emergencyNotes: emergencyNotes.trim() || undefined,
            }
          : undefined,
        lgpdConsent: hasAnyHealthData ? lgpdConsent : undefined,
      });

      setSubmitted(true);
    } catch (err: any) {
      setFormError(err.message || 'Ocorreu um erro ao salvar as informações. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-graphite-50 dark:bg-graphite-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-graphite-900 rounded-2xl shadow-xl p-8 border border-graphite-200 dark:border-graphite-800 text-center space-y-4">
          <Clock className="h-10 w-10 text-action-primary mx-auto animate-pulse" />
          <h2 className="text-lg font-bold text-graphite-900 dark:text-graphite-100">Carregando formulário seguro...</h2>
          <p className="text-xs text-graphite-500">Validando autenticidade do link e permissões temporárias.</p>
        </div>
      </div>
    );
  }

  if (errorStatus === 'ALREADY_CONSUMED') {
    return (
      <div className="min-h-screen bg-graphite-50 dark:bg-graphite-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-graphite-900 rounded-2xl shadow-xl p-8 border border-graphite-200 dark:border-graphite-800 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-bg text-warning-icon">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-graphite-900 dark:text-graphite-100">Formulário Já Enviado</h2>
          <p className="text-sm text-graphite-600 dark:text-graphite-300">
            {errorMessage || 'Este link de preenchimento era de uso único e já foi concluído anteriormente.'}
          </p>
          <div className="rounded-xl border border-graphite-200 bg-graphite-50 p-4 text-xs text-graphite-500 dark:border-graphite-800 dark:bg-graphite-950">
            Por motivos de segurança e proteção de dados, o link foi desativado automaticamente. Se precisar atualizar algum dado, solicite um novo link à locadora.
          </div>
        </div>
      </div>
    );
  }

  if (errorStatus === 'EXPIRED') {
    return (
      <div className="min-h-screen bg-graphite-50 dark:bg-graphite-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-graphite-900 rounded-2xl shadow-xl p-8 border border-graphite-200 dark:border-graphite-800 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error-bg text-error-icon">
            <Clock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-graphite-900 dark:text-graphite-100">Link Expirado</h2>
          <p className="text-sm text-graphite-600 dark:text-graphite-300">
            {errorMessage || 'Este link de formulário possuía validade de 24 horas e expirou.'}
          </p>
          <div className="rounded-xl border border-graphite-200 bg-graphite-50 p-4 text-xs text-graphite-500 dark:border-graphite-800 dark:bg-graphite-950">
            Por favor, entre em contato pelo WhatsApp com o atendimento da locadora para que um novo link seguro seja gerado.
          </div>
        </div>
      </div>
    );
  }

  if (errorStatus === 'NOT_FOUND' || !data) {
    return (
      <div className="min-h-screen bg-graphite-50 dark:bg-graphite-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-graphite-900 rounded-2xl shadow-xl p-8 border border-graphite-200 dark:border-graphite-800 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error-bg text-error-icon">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-graphite-900 dark:text-graphite-100">Link Inválido</h2>
          <p className="text-sm text-graphite-600 dark:text-graphite-300">
            {errorMessage || 'O link acessado não é válido ou foi cancelado.'}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-graphite-50 dark:bg-graphite-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-graphite-900 rounded-2xl shadow-xl p-8 border border-graphite-200 dark:border-graphite-800 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success-icon">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-graphite-900 dark:text-graphite-100">Dados Enviados com Sucesso!</h2>
          <p className="text-sm text-graphite-600 dark:text-graphite-300">
            Agradecemos a colaboração! Seus dados complementares de endereço e emergência foram registrados com segurança no sistema da locadora.
          </p>
          <div className="rounded-xl border border-success-border bg-success-bg p-4 text-xs text-success-text">
            O link temporário foi encerrado. A locadora prosseguirá com a liberação do seu contrato.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-graphite-50 dark:bg-graphite-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="bg-white dark:bg-graphite-900 rounded-2xl shadow-sm border border-graphite-200 dark:border-graphite-800 p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-action-primary/10 text-action-primary">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-graphite-900 dark:text-graphite-100">
                Ficha Cadastral Complementar do Motorista
              </h1>
              <p className="text-xs text-graphite-500">
                Complete as informações para agilizar a liberação da sua locação. Link seguro e válido por 24 horas.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {formError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-error-border bg-error-bg p-4 text-sm text-error-text">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Bloco CNH Travado (Apenas para conferência) */}
          <section className="bg-white dark:bg-graphite-900 rounded-2xl shadow-sm border border-graphite-200 dark:border-graphite-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-graphite-200 dark:border-graphite-800 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-graphite-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite-900 dark:text-graphite-100">
                  Dados da Habilitação (Conferência)
                </h2>
              </div>
              <span className="text-[11px] font-medium text-graphite-500 bg-graphite-100 dark:bg-graphite-800 px-2 py-0.5 rounded">
                Somente leitura
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-graphite-600 dark:text-graphite-400">Nome Completo</label>
                <div className="mt-1 p-2.5 rounded-lg bg-graphite-100 dark:bg-graphite-800 text-sm font-medium text-graphite-800 dark:text-graphite-200">
                  {data.readOnlyCnh.fullName}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-graphite-600 dark:text-graphite-400">CPF</label>
                <div className="mt-1 p-2.5 rounded-lg bg-graphite-100 dark:bg-graphite-800 text-sm font-medium text-graphite-800 dark:text-graphite-200">
                  {data.readOnlyCnh.cpf}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-graphite-600 dark:text-graphite-400">Número da CNH</label>
                <div className="mt-1 p-2.5 rounded-lg bg-graphite-100 dark:bg-graphite-800 text-sm font-medium text-graphite-800 dark:text-graphite-200">
                  {data.readOnlyCnh.cnhNumber}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-graphite-600 dark:text-graphite-400">Categoria</label>
                  <div className="mt-1 p-2.5 rounded-lg bg-graphite-100 dark:bg-graphite-800 text-sm font-medium text-graphite-800 dark:text-graphite-200">
                    {data.readOnlyCnh.cnhCategory}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-graphite-600 dark:text-graphite-400">Validade</label>
                  <div className="mt-1 p-2.5 rounded-lg bg-graphite-100 dark:bg-graphite-800 text-sm font-medium text-graphite-800 dark:text-graphite-200">
                    {data.readOnlyCnh.cnhExpiration}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Bloco Pessoal */}
          <section className="bg-white dark:bg-graphite-900 rounded-2xl shadow-sm border border-graphite-200 dark:border-graphite-800 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-graphite-200 dark:border-graphite-800 pb-3">
              <User className="h-4 w-4 text-action-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite-900 dark:text-graphite-100">
                Dados Pessoais
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Profissão / Ocupação"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Ex: Motorista de Aplicativo"
              />
              <Input
                label="Nome da Mãe"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                placeholder="Nome completo da mãe"
              />
            </div>
          </section>

          {/* 3. Bloco Endereço Estruturado */}
          <section className="bg-white dark:bg-graphite-900 rounded-2xl shadow-sm border border-graphite-200 dark:border-graphite-800 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-graphite-200 dark:border-graphite-800 pb-3">
              <Home className="h-4 w-4 text-action-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite-900 dark:text-graphite-100">
                Endereço Residencial Completo
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="CEP"
                value={zipCode}
                onChange={(e) => setZipCode(formatCep(e.target.value))}
                placeholder="00000-000"
                maxLength={9}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Logradouro (Rua / Av)"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Nome da rua"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Número"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="123"
              />
              <Input
                label="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Bairro"
              />
              <Input
                label="Complemento"
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Casa 2, Fundos..."
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Input
                  label="Cidade"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Cidade"
                />
              </div>
              <Input
                label="Estado (UF)"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                placeholder="SP"
                maxLength={2}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Tipo de Residência"
                value={residenceType}
                onChange={(e) => setResidenceType(e.target.value)}
              >
                <option value="HOUSE">Casa</option>
                <option value="APARTMENT">Apartamento / Condomínio</option>
                <option value="OTHER">Outro</option>
              </Select>

              {residenceType === 'OTHER' && (
                <Input
                  label="Especifique o tipo"
                  value={residenceTypeOther}
                  onChange={(e) => setResidenceTypeOther(e.target.value)}
                />
              )}
            </div>

            {/* Campos estruturados quando mora em prédio/condomínio */}
            {residenceType === 'APARTMENT' && (
              <div className="rounded-xl border border-graphite-200 bg-graphite-50 p-4 dark:border-graphite-800 dark:bg-graphite-950/60 space-y-3">
                <p className="text-xs font-semibold text-graphite-800 dark:text-graphite-200">
                  Dados do Condomínio / Edifício
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Nome do Residencial / Condomínio"
                    value={condominiumName}
                    onChange={(e) => setCondominiumName(e.target.value)}
                    placeholder="Ex: Condomínio Jardim das Flores"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Torre/Bloco"
                      value={blockTower}
                      onChange={(e) => setBlockTower(e.target.value)}
                      placeholder="Bloco B"
                    />
                    <Input
                      label="Apto/Unidade"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="104"
                    />
                    <Input
                      label="Andar"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      placeholder="10º"
                    />
                  </div>
                </div>
              </div>
            )}

            <Input
              label="Ponto de Referência"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex: Próximo à padaria central"
            />
          </section>

          {/* 4. Bloco Saúde & Contato de Emergência */}
          <section className="bg-white dark:bg-graphite-900 rounded-2xl shadow-sm border border-graphite-200 dark:border-graphite-800 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-graphite-200 dark:border-graphite-800 pb-3">
              <HeartPulse className="h-4 w-4 text-action-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite-900 dark:text-graphite-100">
                Ficha Médica e Contato de Emergência
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Tipo Sanguíneo"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
              >
                <option value="">Não informado</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
              </Select>
              <Input
                label="Alergias Relevantes"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Ex: Dipirona, Penicilina..."
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-graphite-700 dark:text-graphite-300">
                  <input
                    type="checkbox"
                    checked={hasContinuousMed}
                    onChange={(e) => setHasContinuousMed(e.target.checked)}
                    className="rounded text-action-primary"
                  />
                  Faz uso de medicamento contínuo?
                </label>
                {hasContinuousMed && (
                  <div className="mt-2">
                    <Input
                      label="Quais medicamentos contínuos?"
                      value={continuousMedications}
                      onChange={(e) => setContinuousMedications(e.target.value)}
                      placeholder="Nome dos medicamentos de uso diário"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-graphite-700 dark:text-graphite-300">
                  <input
                    type="checkbox"
                    checked={hasControlledMed}
                    onChange={(e) => setHasControlledMed(e.target.checked)}
                    className="rounded text-action-primary"
                  />
                  Faz uso de medicamento controlado?
                </label>
                {hasControlledMed && (
                  <div className="mt-2">
                    <Input
                      label="Quais medicamentos controlados?"
                      value={controlledMedications}
                      onChange={(e) => setControlledMedications(e.target.value)}
                      placeholder="Nome dos medicamentos controlados"
                    />
                  </div>
                )}
              </div>
            </div>

            <Input
              label="Restrição médica para dirigir ou condições de saúde"
              value={relevantConditions}
              onChange={(e) => setRelevantConditions(e.target.value)}
              placeholder="Ex: Diabetes, labirintite, hipertensão..."
            />

            <div className="rounded-xl border border-graphite-200 bg-graphite-50 p-4 dark:border-graphite-800 dark:bg-graphite-950/60 space-y-3">
              <p className="text-xs font-semibold text-graphite-800 dark:text-graphite-200 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-action-primary" />
                Contato para Casos de Emergência
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label="Nome do Contato"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Nome do familiar/amigo"
                />
                <Input
                  label="Parentesco / Relação"
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  placeholder="Ex: Esposa, Mãe, Irmão"
                />
                <Input
                  label="Telefone / WhatsApp"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(formatPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <Input
                label="Instruções ou Observações de Emergência"
                value={emergencyNotes}
                onChange={(e) => setEmergencyNotes(e.target.value)}
                placeholder="Ex: Hospital de preferência, plano de saúde..."
              />
            </div>
          </section>

          {/* 5. Termo de Consentimento LGPD (PH-059) */}
          <section className="bg-white dark:bg-graphite-900 rounded-2xl shadow-sm border border-graphite-200 dark:border-graphite-800 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-graphite-200 dark:border-graphite-800 pb-3">
              <ShieldCheck className="h-5 w-5 text-success-icon" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite-900 dark:text-graphite-100">
                Termo de Consentimento e Privacidade (LGPD)
              </h2>
            </div>

            <div className="rounded-xl border border-graphite-200 bg-graphite-50 dark:border-graphite-800 dark:bg-graphite-950/70 p-4 text-xs text-graphite-700 dark:text-graphite-300 leading-relaxed space-y-2">
              <p className="font-semibold text-graphite-900 dark:text-graphite-100">
                Finalidade e Tratamento de Dados Sensíveis:
              </p>
              <p>{data.lgpdText}</p>
              <p className="text-[11px] text-graphite-500 pt-1">
                Termo de consentimento versão {data.lgpdVersion}. O aceite fica gravado digitalmente com data, horário e endereço IP para fins comprobatórios.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer pt-1">
              <input
                type="checkbox"
                id="driver-lgpd-consent-check"
                data-testid="driver-lgpd-consent-check"
                checked={lgpdConsent}
                onChange={(e) => setLgpdConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-graphite-300 text-action-primary focus:ring-action-primary"
              />
              <span className="text-xs font-semibold text-graphite-800 dark:text-graphite-200">
                Declaro que li e concordo expressamente com o tratamento dos meus dados de saúde e emergência nos termos da LGPD descritos acima.
              </span>
            </label>
          </section>

          {/* Botão de Envio */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              isLoading={submitting}
              className="w-full sm:w-auto px-8"
              data-testid="btn-submit-public-form"
            >
              Enviar Dados Cadastrais
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
