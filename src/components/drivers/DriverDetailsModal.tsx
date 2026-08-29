import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  Car,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  File,
  FileText,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  ShieldAlert,
  Trash2,
  Unlock,
  User,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  ModalContainer,
  Select,
  Skeleton,
} from '../ui';
import { DriverClient } from '../../api/driverClient';
import {
  WhatsappClient,
  type WhatsappConsent,
  type WhatsappOutboxItem,
  type WhatsappTaskProposal,
  type WhatsappObservabilitySummary,
} from '../../api/whatsappClient';
import { DriverHealthClient } from '../../api/driverHealthClient';
import { VehicleClient } from '../../api/vehicleClient';
import { DocumentClient } from '../../api/documentClient';
import { FileUpload } from '../documents/FileUpload';
import { AttachmentList } from '../documents/AttachmentList';
import { DocumentStatus, DriverStatus } from '../../types/enums';
import type { DriverHealthAndEmergency } from '../../types/entities';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import {
  DriverLegacyDetailsBridge,
  type DriverLegacyDetailedSummary,
} from './DriverLegacyDetailsBridge';
import {
  createWhatsappTaskProposalCounts,
  filterWhatsappTaskProposals,
  type WhatsappTaskProposalFilter,
} from './whatsappTaskProposalTriage';

interface DriverDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: string | null;
  onSelectVehicle?: (vehicleId: string) => void;
  onDriverUpdated?: () => void;
}

type DriverTab =
  | 'overview'
  | 'cnh'
  | 'vehicles'
  | 'contracts'
  | 'finance'
  | 'tickets'
  | 'communications'
  | 'health'
  | 'history';


export const DriverDetailsModal: React.FC<DriverDetailsModalProps> = ({
  isOpen,
  onClose,
  driverId,
  onSelectVehicle,
  onDriverUpdated,
}) => {
  const bridge = useMemo(() => new DriverLegacyDetailsBridge(), []);
  const [activeTab, setActiveTab] = useState<DriverTab>('overview');
  const [summary, setSummary] = useState<DriverLegacyDetailedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [isUnblockDialogOpen, setIsUnblockDialogOpen] = useState(false);
  const [unblockReason, setUnblockReason] = useState('');

  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [docType, setDocType] = useState('Comprovante de Residência');
  const [docNumber, setDocNumber] = useState('');
  const [docExpDate, setDocExpDate] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [docAttachmentId, setDocAttachmentId] = useState('');
  const [driverAttachmentRefresh, setDriverAttachmentRefresh] = useState(0);

  const [isHealthUnlocked, setIsHealthUnlocked] = useState(false);
  const [isEditHealthOpen, setIsEditHealthOpen] = useState(false);
  const [healthProfile, setHealthProfile] = useState<DriverHealthAndEmergency>({});
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [relevantConditions, setRelevantConditions] = useState('');
  const [continuousMedications, setContinuousMedications] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');

  const [whatsappConsent, setWhatsappConsent] = useState<WhatsappConsent | null>(null);
  const [whatsappOutbox, setWhatsappOutbox] = useState<WhatsappOutboxItem[]>([]);
  const [whatsappTaskProposals, setWhatsappTaskProposals] = useState<WhatsappTaskProposal[]>([]);
  const [whatsappObservability, setWhatsappObservability] = useState<WhatsappObservabilitySummary | null>(null);
  const [whatsappWindowDays, setWhatsappWindowDays] = useState<WhatsappObservabilitySummary['windowDays']>(30);
  const [whatsappProposalFilter, setWhatsappProposalFilter] = useState<WhatsappTaskProposalFilter>('ALL');
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  const driver = summary?.driver;

  const applyHealthProfile = (health: DriverHealthAndEmergency) => {
    setHealthProfile(health);
    setBloodType(health.bloodType || '');
    setAllergies(health.allergies || '');
    setRelevantConditions(health.relevantConditions || '');
    setContinuousMedications(health.continuousMedications || '');
    setEmergencyContactName(health.emergencyContactName || '');
    setEmergencyContactRelationship(health.emergencyContactRelationship || '');
    setEmergencyContactPhone(health.emergencyContactPhone || '');
    setEmergencyNotes(health.emergencyNotes || '');
  };

  const loadData = async () => {
    if (!driverId) return;
    setLoading(true);
    setError(null);
    try {
      const coreDriver = await DriverClient.get(driverId);
      const supplemental = await bridge.getSupplementalSummary(coreDriver);
      supplemental.documents = await DocumentClient.list({ subjectType: 'DRIVER', subjectId: coreDriver.id });
      if (coreDriver.currentVehicleId) {
        const vehicle = await VehicleClient.get(coreDriver.currentVehicleId);
        supplemental.currentVehicle = { ...vehicle, year: vehicle.yearModel || vehicle.yearFabrication };
      }
      setSummary(supplemental);
    } catch (err: unknown) {
      setSummary(null);
      setError(err instanceof Error ? err.message : 'Erro ao carregar os detalhes do motorista.');
    } finally {
      setLoading(false);
    }
  };

  const loadWhatsappData = async () => {
    if (!driverId) return;
    setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      const [consent, outbox, taskProposals, observability] = await Promise.all([
        WhatsappClient.getConsent(driverId),
        WhatsappClient.listForDriver(driverId),
        WhatsappClient.listTaskProposalsForDriver(driverId),
        WhatsappClient.getObservability(whatsappWindowDays),
      ]);
      setWhatsappConsent(consent);
      setWhatsappOutbox(outbox);
      setWhatsappTaskProposals(taskProposals);
      setWhatsappObservability(observability);
    } catch (err: unknown) {
      setWhatsappError(err instanceof Error ? err.message : 'Erro ao carregar a autoridade de WhatsApp.');
    } finally {
      setWhatsappLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !driverId) return;
    setActiveTab('overview');
    setIsHealthUnlocked(false);
    setWhatsappConsent(null);
    setWhatsappOutbox([]);
    setWhatsappTaskProposals([]);
    setWhatsappObservability(null);
    setWhatsappProposalFilter('ALL');
    setWhatsappError(null);
    applyHealthProfile({});
    void loadData();
  }, [isOpen, driverId]);

  useEffect(() => {
    if (!isOpen || !driverId || activeTab !== 'communications') return;
    void loadWhatsappData();
  }, [isOpen, driverId, activeTab, whatsappWindowDays]);

  const handleBlockDriver = async () => {
    if (!driverId || !blockReason.trim()) return;
    setActionLoading(true);
    try {
      await DriverClient.changeStatus(driverId, DriverStatus.BLOCKED);
      setIsBlockDialogOpen(false);
      setBlockReason('');
      await loadData();
      onDriverUpdated?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao bloquear motorista.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblockDriver = async () => {
    if (!driverId || !unblockReason.trim()) return;
    setActionLoading(true);
    try {
      await DriverClient.changeStatus(driverId, DriverStatus.ACTIVE);
      setIsUnblockDialogOpen(false);
      setUnblockReason('');
      await loadData();
      onDriverUpdated?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao desbloquear motorista.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlockHealth = async () => {
    if (!driverId) return;
    setActionLoading(true);
    try {
      const health = await DriverHealthClient.get(driverId);
      applyHealthProfile(health);
      setIsHealthUnlocked(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Acesso negado aos dados de saúde.');
      setIsHealthUnlocked(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveHealthAndEmergency = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!driverId) return;
    setActionLoading(true);
    try {
      const health = await DriverHealthClient.update(driverId, {
        bloodType,
        allergies,
        relevantConditions,
        continuousMedications,
        emergencyContactName,
        emergencyContactRelationship,
        emergencyContactPhone,
        emergencyNotes,
      });
      applyHealthProfile(health);
      setIsEditHealthOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar dados de saúde.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!driver) return;
    setActionLoading(true);
    try {
      await DocumentClient.create({
        subjectType: 'DRIVER',
        subjectId: driver.id,
        documentType: docType,
        documentNumber: docNumber || undefined,
        expirationDate: docExpDate || undefined,
        attachmentId: docAttachmentId || undefined,
        notes: docNotes || undefined,
      });
      setIsAddDocOpen(false);
      setDocNumber('');
      setDocExpDate('');
      setDocNotes('');
      setDocAttachmentId('');
      setDriverAttachmentRefresh((value) => value + 1);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao adicionar documento.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDocument = async (documentId: string) => {
    if (!confirm('Deseja arquivar este documento? O histórico será preservado.')) return;
    try {
      await DocumentClient.archive(documentId);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao arquivar documento.');
    }
  };

  const handleWhatsappConsent = async (decision: 'GRANT' | 'REVOKE') => {
    if (!driverId) return;
    const prompt = decision === 'GRANT'
      ? 'Confirma que o motorista autorizou o uso deste número para comunicações de WhatsApp?'
      : 'Revogar o consentimento e cancelar todas as solicitações ainda retidas?';
    if (!confirm(prompt)) return;
    setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      await WhatsappClient.decideConsent(driverId, decision);
      await loadWhatsappData();
    } catch (err: unknown) {
      setWhatsappError(err instanceof Error ? err.message : 'Erro ao registrar a decisão de consentimento.');
      setWhatsappLoading(false);
    }
  };

  const handlePrepareCnhReminder = async () => {
    if (!driverId || whatsappConsent?.status !== 'GRANTED') return;
    if (!confirm('Preparar o lembrete de vencimento da CNH? O provedor está desativado e nenhuma mensagem será enviada.')) return;
    setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      const result = await WhatsappClient.createCnhReminder(driverId);
      await loadWhatsappData();
      if (!result.created) {
        alert('Este mesmo lembrete já estava preparado; nenhuma duplicata foi criada.');
      }
    } catch (err: unknown) {
      setWhatsappError(err instanceof Error ? err.message : 'Erro ao preparar o lembrete.');
      setWhatsappLoading(false);
    }
  };

  const handleWhatsappTaskProposalReview = async (proposal: WhatsappTaskProposal, decision: 'APPROVE' | 'REJECT') => {
    const reason = window.prompt(
      decision === 'APPROVE'
        ? 'Justifique a criação da tarefa operacional:'
        : 'Justifique por que nenhuma tarefa deve ser criada:',
    );
    if (!reason?.trim() || reason.trim().length < 3) return;
    setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      await WhatsappClient.reviewTaskProposal(proposal.id, decision, reason);
      await loadWhatsappData();
    } catch (err: unknown) {
      setWhatsappError(err instanceof Error ? err.message : 'Erro ao revisar a proposta recebida.');
      setWhatsappLoading(false);
    }
  };

  const getWhatsappProposalCategory = (category: WhatsappTaskProposal['replyCategory']) => ({
    PAYMENT_QUESTION: 'Dúvida de pagamento',
    DOCUMENT_QUESTION: 'Dúvida documental',
    MAINTENANCE_REPORT: 'Relato de manutenção',
    GENERAL: 'Assunto geral',
  }[category]);

  const whatsappTaskProposalCounts = createWhatsappTaskProposalCounts(whatsappTaskProposals);
  const visibleWhatsappTaskProposals = filterWhatsappTaskProposals(whatsappTaskProposals, whatsappProposalFilter);

  const getStatusBadge = (status?: DriverStatus) => {
    if (status === DriverStatus.ACTIVE) return <Badge variant="success">Ativo</Badge>;
    if (status === DriverStatus.BLOCKED) return <Badge variant="danger">Bloqueado</Badge>;
    if (status === DriverStatus.PENDING || status === DriverStatus.PENDING_DOCS) return <Badge variant="warning">Pendente</Badge>;
    return <Badge variant="neutral">{status || 'Sem Status'}</Badge>;
  };

  const getCnhBadge = (status?: DocumentStatus) => {
    if (status === DocumentStatus.VALID) return <Badge variant="success">CNH Válida</Badge>;
    if (status === DocumentStatus.EXPIRING_SOON) return <Badge variant="warning">CNH Vencendo</Badge>;
    if (status === DocumentStatus.EXPIRED) return <Badge variant="danger">CNH Vencida</Badge>;
    return <Badge variant="neutral">Sem Info</Badge>;
  };

  if (!isOpen) return null;

  const tabs: Array<{ id: DriverTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Visão Geral', icon: User },
    { id: 'cnh', label: 'CNH & Documentos', icon: CreditCard },
    { id: 'vehicles', label: 'Veículos', icon: Car },
    { id: 'contracts', label: 'Contratos', icon: FileText },
    { id: 'finance', label: 'Financeiro', icon: DollarSign },
    { id: 'tickets', label: 'Multas', icon: AlertTriangle },
    { id: 'communications', label: 'Comunicações', icon: MessageSquare },
    { id: 'health', label: 'Saúde & Emergência', icon: ShieldAlert },
    { id: 'history', label: 'Histórico', icon: Clock },
  ];

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={driver ? `Motorista — ${driver.fullName}` : 'Detalhes do Motorista'}
      maxWidth="max-w-5xl"
    >
      {loading ? (
        <div className="space-y-4 p-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-60 w-full rounded-xl" />
        </div>
      ) : error || !summary || !driver ? (
        <div className="p-8 text-center text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2" />
          <p className="font-semibold">{error || 'Motorista não encontrado.'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-700 font-bold">
                {driver.fullName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold">{driver.fullName}</h2>
                  {getStatusBadge(driver.status)}
                  {getCnhBadge(summary.cnhAlert.status)}
                </div>
                <p className="text-xs text-slate-500 font-mono">CPF: {driver.cpf} • CNH: {driver.cnhNumber} ({driver.cnhCategory})</p>
              </div>
            </div>
            {driver.status === DriverStatus.BLOCKED ? (
              <Button variant="outline" onClick={() => setIsUnblockDialogOpen(true)}>
                <Unlock className="w-4 h-4 mr-1.5" />Desbloquear
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setIsBlockDialogOpen(true)}>
                <Lock className="w-4 h-4 mr-1.5" />Bloquear
              </Button>
            )}
          </div>

          {summary.cnhAlert.status !== DocumentStatus.VALID && (
            <div className="p-3.5 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-xs">
              <ShieldAlert className="w-4 h-4 inline mr-2" />
              <strong>Alerta de CNH:</strong> {summary.cnhAlert.message}
            </div>
          )}

          <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 ${activeTab === tab.id ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500'}`}
                >
                  <Icon className="w-4 h-4" />{tab.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-400">Contato</h3>
                <p className="text-sm flex items-center gap-2"><Phone className="w-4 h-4" />{driver.phone}</p>
                <p className="text-sm flex items-center gap-2"><Mail className="w-4 h-4" />{driver.email || 'E-mail não informado'}</p>
                <p className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4" />{driver.birthDate}</p>
              </Card>
              <Card className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-400">Endereço</h3>
                <div className="text-sm flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5" />
                  <span>{driver.address.street}, {driver.address.number} — {driver.address.neighborhood}, {driver.address.city}/{driver.address.state} • CEP {driver.address.zipCode}</span>
                </div>
              </Card>
              <Card className="p-4 md:col-span-2 space-y-3">
                <h3 className="text-xs font-bold uppercase text-slate-400">Plataformas & Observações</h3>
                <div className="flex flex-wrap gap-2">{driver.appPlatforms.map((platform) => <Badge key={platform} variant="neutral">{platform}</Badge>)}</div>
                {driver.notes && <p className="text-xs text-slate-500">{driver.notes}</p>}
              </Card>
            </div>
          )}

          {activeTab === 'cnh' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">Documentos Registrados</h3>
                <Button size="sm" onClick={() => setIsAddDocOpen(true)}><Plus className="w-4 h-4 mr-1" />Anexar Documento</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {summary.documents.length === 0 && <p className="text-xs text-slate-400">Nenhum documento suplementar registrado.</p>}
                {summary.documents.map((doc) => (
                  <div key={doc.id} className="p-3 border rounded-xl flex justify-between items-center">
                    <div className="flex gap-3 items-center">
                      <File className="w-5 h-5 text-emerald-600" />
                      <div><strong className="text-sm block">{doc.documentType}</strong><span className="text-xs text-slate-500">{doc.documentNumber || 'Sem número'} {doc.expirationDate ? `• ${doc.expirationDate}` : ''} • v{doc.versionNumber}</span><div className="mt-1"><Badge variant={doc.complianceStatus === DocumentStatus.VALID ? 'success' : doc.complianceStatus === DocumentStatus.EXPIRED ? 'danger' : 'warning'}>{doc.complianceStatus}</Badge></div></div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveDocument(doc.id)}><Trash2 className="w-4 h-4 text-rose-600" /></Button>
                  </div>
                ))}
              </div>
              <Card className="p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase text-slate-400">Arquivos do Motorista — authority do servidor</h4>
                <div key={`${driver.id}-${driverAttachmentRefresh}`}><AttachmentList entityType="Driver" entityId={driver.id} /></div>
              </Card>
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Veículo Atual Vinculado</h3>
              {summary.currentVehicle ? (
                <Card className="p-4 flex justify-between items-center">
                  <div><strong>{summary.currentVehicle.brand} {summary.currentVehicle.model} ({summary.currentVehicle.year})</strong><p className="text-xs text-slate-500">Placa {summary.currentVehicle.plate} • Renavam {summary.currentVehicle.renavam}</p></div>
                  {onSelectVehicle && <Button size="sm" variant="outline" onClick={() => { onClose(); onSelectVehicle(summary.currentVehicle.id); }}><ExternalLink className="w-4 h-4 mr-1" />Ver Veículo</Button>}
                </Card>
              ) : <p className="text-xs text-slate-400">Nenhum veículo vinculado.</p>}
            </div>
          )}

          {activeTab === 'contracts' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Histórico de Contratos</h3>
              {summary.contractHistory.length === 0 ? <p className="text-xs text-slate-400">Nenhum contrato registrado.</p> : summary.contractHistory.map((contract) => (
                <Card key={contract.id} className="p-3 flex justify-between text-xs">
                  <div><strong className="font-mono block">Contrato #{contract.contractNumber || contract.id}</strong><span>{contract.startDate || '—'} → {contract.endDate || 'Em andamento'}</span></div>
                  <div className="text-right"><strong className="text-emerald-600 block">{formatCurrencyBRL(Number(contract.recurringValue || 0))}</strong><Badge variant={contract.status === 'ACTIVE' ? 'success' : 'neutral'}>{contract.status}</Badge></div>
                </Card>
              ))}
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-3"><span className="text-xs text-slate-400 block">Pendente</span><strong className="text-amber-600">{formatCurrencyBRL(summary.financialSummary.totalPendingAmount)}</strong></Card>
                <Card className="p-3"><span className="text-xs text-slate-400 block">Vencido</span><strong className="text-rose-600">{formatCurrencyBRL(summary.financialSummary.totalOverdueAmount)}</strong></Card>
                <Card className="p-3"><span className="text-xs text-slate-400 block">Recebido</span><strong className="text-emerald-600">{formatCurrencyBRL(summary.financialSummary.totalPaidAmount)}</strong></Card>
              </div>
              <h4 className="text-xs font-bold uppercase text-slate-400">Cauções</h4>
              {summary.securityDeposits.length === 0 ? <p className="text-xs text-slate-400">Nenhuma caução registrada.</p> : summary.securityDeposits.map((deposit) => (
                <Card key={deposit.id} className="p-3 flex justify-between text-xs"><span>Status: {deposit.status}</span><strong>{formatCurrencyBRL(Number(deposit.amount || 0))}</strong></Card>
              ))}
            </div>
          )}

          {activeTab === 'tickets' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Multas de Trânsito Atribuídas</h3>
              {summary.trafficTickets.length === 0 ? <p className="text-xs text-slate-400">Nenhuma multa registrada.</p> : summary.trafficTickets.map((ticket) => (
                <Card key={ticket.id} className="p-3 flex justify-between text-xs"><div><strong className="block">{ticket.infractionCode || 'Auto s/n'} — {ticket.description}</strong><span>{ticket.infractionDate} • vence {ticket.dueDate}</span></div><strong className="text-rose-600">{formatCurrencyBRL(Number(ticket.amount || 0))}</strong></Card>
              ))}
            </div>
          )}

          {activeTab === 'communications' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-xs">
                <ShieldAlert className="w-4 h-4 inline mr-2" />
                <strong>Modo econômico e seguro:</strong> o provedor está desativado. Preparar um lembrete apenas grava uma solicitação retida; não abre WhatsApp e não envia mensagem.
              </div>

              {whatsappError && (
                <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                  {whatsappError}
                </div>
              )}

              <Card className="p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold">Observabilidade sanitizada</h3>
                    <p className="text-xs text-slate-500">Somente totais por período. Não há telefone, conteúdo, tenant, provedor ou ação automática nesta tela.</p>
                  </div>
                  <Select
                    label="Período"
                    value={String(whatsappWindowDays)}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (parsed === 7 || parsed === 30 || parsed === 90 || parsed === 365) {
                        setWhatsappWindowDays(parsed);
                      }
                    }}
                  >
                    <option value="7">7 dias</option>
                    <option value="30">30 dias</option>
                    <option value="90">90 dias</option>
                    <option value="365">365 dias</option>
                  </Select>
                </div>
                {whatsappObservability ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Card className="p-3"><span className="block text-xs text-slate-400">Outbox</span><strong>{whatsappObservability.outbox.total}</strong><p className="text-[11px] text-slate-500">{whatsappObservability.outbox.heldProviderDisabled} retidas • {whatsappObservability.outbox.cancelled} canceladas</p></Card>
                      <Card className="p-3"><span className="block text-xs text-slate-400">Eventos</span><strong>{whatsappObservability.webhookEvents.total}</strong><p className="text-[11px] text-slate-500">{whatsappObservability.webhookEvents.repliesReceived} respostas classificadas</p></Card>
                      <Card className="p-3"><span className="block text-xs text-slate-400">Propostas</span><strong>{whatsappObservability.taskProposals.total}</strong><p className="text-[11px] text-slate-500">{whatsappObservability.taskProposals.pending} aguardando revisão</p></Card>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Janela iniciada em {new Date(whatsappObservability.windowStartAt).toLocaleString('pt-BR')}. Provedor: desativado. Mutação automática: não aplicada.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-400">Carregando agregados sanitizados…</p>
                )}
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold">Consentimento</h3>
                    <Badge variant={whatsappConsent?.status === 'GRANTED' ? 'success' : whatsappConsent?.status === 'REVOKED' ? 'danger' : 'neutral'}>
                      {whatsappConsent?.status === 'GRANTED' ? 'Autorizado' : whatsappConsent?.status === 'REVOKED' ? 'Revogado' : 'Não registrado'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Número verificado pelo servidor: {whatsappConsent?.phoneMasked || 'disponível somente após decisão'}
                  </p>
                  <p className="text-xs text-slate-500">
                    A decisão deve refletir uma autorização real do motorista. O navegador não escolhe empresa, telefone ou conteúdo.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {whatsappConsent?.status !== 'GRANTED' && (
                      <Button size="sm" onClick={() => handleWhatsappConsent('GRANT')} isLoading={whatsappLoading}>
                        Registrar consentimento
                      </Button>
                    )}
                    {whatsappConsent?.status === 'GRANTED' && (
                      <Button size="sm" variant="danger" onClick={() => handleWhatsappConsent('REVOKE')} isLoading={whatsappLoading}>
                        Revogar e cancelar pendências
                      </Button>
                    )}
                  </div>
                </Card>

                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-bold">Lembrete de vencimento da CNH</h3>
                  <p className="text-xs text-slate-500">
                    Template fixo, com nome e validade derivados do PostgreSQL pelo servidor. Nenhum texto livre é aceito.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={whatsappConsent?.status !== 'GRANTED' || whatsappLoading}
                    onClick={handlePrepareCnhReminder}
                  >
                    Preparar lembrete — sem enviar
                  </Button>
                  {whatsappConsent?.status !== 'GRANTED' && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">É necessário consentimento vigente para preparar a solicitação.</p>
                  )}
                </Card>
              </div>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">Fila auditável deste motorista</h3>
                  {whatsappLoading && <span className="text-xs text-slate-400">Atualizando…</span>}
                </div>
                {whatsappOutbox.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma solicitação preparada.</p>
                ) : whatsappOutbox.map((item) => (
                  <div key={item.id} className="p-3 border rounded-xl text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <strong className="block">Vencimento de CNH — {item.templateParameters.cnhExpiration}</strong>
                      <span className="text-slate-500">{new Date(item.createdAt).toLocaleString('pt-BR')} • {item.id}</span>
                    </div>
                    <Badge variant={item.status === 'HELD_PROVIDER_DISABLED' ? 'warning' : 'neutral'}>
                      {item.status === 'HELD_PROVIDER_DISABLED' ? 'Retida — provedor desativado' : 'Cancelada'}
                    </Badge>
                  </div>
                ))}
              </Card>

              <Card className="p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold">Respostas recebidas — revisão humana</h3>
                    <p className="text-xs text-slate-500">O conteúdo bruto não é armazenado nem exibido. Aprovar cria somente uma tarefa operacional; não altera financeiro, contratos ou documentos.</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:min-w-52">
                    <Select
                      label="Triagem"
                      value={whatsappProposalFilter}
                      onChange={(event) => setWhatsappProposalFilter(event.target.value as WhatsappTaskProposalFilter)}
                    >
                      <option value="ALL">Todas ({whatsappTaskProposalCounts.ALL})</option>
                      <option value="PENDING">Aguardando revisão ({whatsappTaskProposalCounts.PENDING})</option>
                      <option value="COMPLETED">Concluídas ({whatsappTaskProposalCounts.COMPLETED})</option>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={whatsappLoading || whatsappTaskProposalCounts.PENDING === 0}
                      onClick={() => setWhatsappProposalFilter('PENDING')}
                    >
                      Priorizar pendências
                    </Button>
                  </div>
                </div>
                {whatsappLoading && <span className="text-xs text-slate-400">Atualizando…</span>}
                {whatsappTaskProposals.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma proposta sanitizada para este motorista.</p>
                ) : visibleWhatsappTaskProposals.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-xs text-slate-500">
                    <p>Nenhuma proposta corresponde à triagem atual. As outras propostas autorizadas continuam disponíveis.</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setWhatsappProposalFilter('ALL')}>
                      Mostrar todas
                    </Button>
                  </div>
                ) : visibleWhatsappTaskProposals.map((proposal) => (
                  <div key={proposal.id} className="p-3 border rounded-xl text-xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <strong className="block">{getWhatsappProposalCategory(proposal.replyCategory)}</strong>
                        <span className="text-slate-500">{new Date(proposal.createdAt).toLocaleString('pt-BR')} • {proposal.id}</span>
                      </div>
                      <Badge variant={proposal.status === 'PENDING' ? 'warning' : proposal.status === 'APPROVED' ? 'success' : 'neutral'}>
                        {proposal.status === 'PENDING' ? 'Aguardando revisão' : proposal.status === 'APPROVED' ? 'Tarefa criada' : 'Sem tarefa'}
                      </Badge>
                    </div>
                    {proposal.status === 'APPROVED' && proposal.taskId && (
                      <p className="text-emerald-700 dark:text-emerald-300">Tarefa operacional: {proposal.taskId}</p>
                    )}
                    {proposal.status === 'PENDING' && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={whatsappLoading} onClick={() => handleWhatsappTaskProposalReview(proposal, 'APPROVE')}>
                          Aprovar e criar tarefa
                        </Button>
                        <Button size="sm" variant="outline" disabled={whatsappLoading} onClick={() => handleWhatsappTaskProposalReview(proposal, 'REJECT')}>
                          Rejeitar proposta
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </Card>

              {summary.communicationLogs.length > 0 && (
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-bold">Histórico anterior à autoridade atual</h3>
                  <p className="text-xs text-slate-500">Somente leitura. Confirmações manuais e abertura direta do WhatsApp foram desativadas nesta tela.</p>
                  {summary.communicationLogs.map((log) => (
                    <div key={log.id} className="p-2 border rounded-lg text-xs">
                      <strong>{log.type}</strong>
                      <p className="text-slate-500">{log.message}</p>
                      <span className="text-[10px]">{new Date(log.dateTime).toLocaleString('pt-BR')} • {log.status}</span>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          {activeTab === 'health' && (
            !isHealthUnlocked ? (
              <div className="p-8 text-center border border-dashed rounded-2xl space-y-3">
                <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="text-sm font-bold">Saúde & Emergência — acesso restrito</h3>
                <p className="text-xs text-slate-500">O acesso é autorizado e auditado no servidor.</p>
                <Button size="sm" onClick={handleUnlockHealth} disabled={actionLoading}><Unlock className="w-4 h-4 mr-1" />Desbloquear Visualização</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between"><Button size="sm" variant="ghost" onClick={() => setIsHealthUnlocked(false)}><Lock className="w-4 h-4 mr-1" />Bloquear tela</Button><Button size="sm" onClick={() => setIsEditHealthOpen(true)}>Editar Informações</Button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4 space-y-2"><h4 className="text-xs font-bold uppercase"><Activity className="w-4 h-4 inline mr-1" />Ficha de Saúde</h4><p><strong>Tipo sanguíneo:</strong> {healthProfile.bloodType || 'Não informado'}</p><p><strong>Alergias:</strong> {healthProfile.allergies || 'Não informado'}</p><p><strong>Condições:</strong> {healthProfile.relevantConditions || 'Não informado'}</p><p><strong>Medicamentos:</strong> {healthProfile.continuousMedications || 'Não informado'}</p></Card>
                  <Card className="p-4 space-y-2"><h4 className="text-xs font-bold uppercase"><Phone className="w-4 h-4 inline mr-1" />Emergência</h4><p><strong>Contato:</strong> {healthProfile.emergencyContactName || 'Não informado'}</p><p><strong>Relação:</strong> {healthProfile.emergencyContactRelationship || 'Não informado'}</p><p><strong>Telefone:</strong> {healthProfile.emergencyContactPhone || 'Não informado'}</p><p><strong>Notas:</strong> {healthProfile.emergencyNotes || 'Sem observações'}</p></Card>
                </div>
              </div>
            )
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Histórico legado disponível</h3>
              {summary.historyLogs.length === 0 ? <p className="text-xs text-slate-400">Nenhum evento legado registrado.</p> : summary.historyLogs.map((log) => (
                <Card key={log.id} className="p-2 text-xs"><strong className="text-emerald-600">{log.action}</strong><span className="float-right text-slate-400">{new Date(log.timestamp || log.createdAt).toLocaleString('pt-BR')}</span></Card>
              ))}
            </div>
          )}
        </div>
      )}

      {isAddDocOpen && (
        <ModalContainer isOpen={isAddDocOpen} onClose={() => setIsAddDocOpen(false)} title="Anexar Novo Documento" maxWidth="max-w-md">
          <form onSubmit={handleAddDocument} className="space-y-4">
            <Select label="Tipo de Documento *" value={docType} onChange={(event) => setDocType(event.target.value)} required>
              <option value="CNH">CNH</option>
              <option value="RG">RG</option>
              <option value="CPF">CPF</option>
              <option value="Comprovante de Residência">Comprovante de Residência</option>
              <option value="Certidão de Antecedentes Criminais">Certidão de Antecedentes Criminais</option>
              <option value="Contrato Assinado">Contrato Assinado</option>
              <option value="Outro Documento">Outro Documento</option>
            </Select>
            <Input label="Número do Documento" value={docNumber} onChange={(event) => setDocNumber(event.target.value)} />
            <Input label="Data de Validade" type="date" value={docExpDate} onChange={(event) => setDocExpDate(event.target.value)} />
            <FileUpload entityType="Driver" entityId={driver?.id || ''} documentType={docType} onUploadComplete={(attachment) => setDocAttachmentId(attachment.id)} />
            {docAttachmentId && <p className="text-xs text-emerald-600">Arquivo enviado e vinculado ao servidor.</p>}
            <Input label="Observações" value={docNotes} onChange={(event) => setDocNotes(event.target.value)} />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsAddDocOpen(false)}>Cancelar</Button><Button type="submit" isLoading={actionLoading}>Salvar Documento</Button></div>
          </form>
        </ModalContainer>
      )}

      {isEditHealthOpen && (
        <ModalContainer isOpen={isEditHealthOpen} onClose={() => setIsEditHealthOpen(false)} title="Editar Saúde & Emergência" maxWidth="max-w-xl">
          <form onSubmit={handleSaveHealthAndEmergency} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label="Tipo Sanguíneo" value={bloodType} onChange={(event) => setBloodType(event.target.value)} /><Input label="Alergias" value={allergies} onChange={(event) => setAllergies(event.target.value)} /></div>
            <Input label="Condições Médicas" value={relevantConditions} onChange={(event) => setRelevantConditions(event.target.value)} />
            <Input label="Medicamentos Contínuos" value={continuousMedications} onChange={(event) => setContinuousMedications(event.target.value)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label="Contato de Emergência *" value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} required /><Input label="Relação *" value={emergencyContactRelationship} onChange={(event) => setEmergencyContactRelationship(event.target.value)} required /></div>
            <Input label="Telefone de Emergência *" value={emergencyContactPhone} onChange={(event) => setEmergencyContactPhone(event.target.value)} required />
            <Input label="Observações de Emergência" value={emergencyNotes} onChange={(event) => setEmergencyNotes(event.target.value)} />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsEditHealthOpen(false)}>Cancelar</Button><Button type="submit" isLoading={actionLoading}>Salvar Informações</Button></div>
          </form>
        </ModalContainer>
      )}

      <ConfirmDialog
        isOpen={isBlockDialogOpen}
        onClose={() => setIsBlockDialogOpen(false)}
        onConfirm={handleBlockDriver}
        title="Bloquear Motorista"
        message="Ao bloquear, o motorista ficará impedido de novas operações. Informe o motivo:"
        confirmText="Confirmar Bloqueio"
        confirmVariant="danger"
        isLoading={actionLoading}
      >
        <div className="mt-3"><Input label="Motivo *" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} required /></div>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={isUnblockDialogOpen}
        onClose={() => setIsUnblockDialogOpen(false)}
        onConfirm={handleUnblockDriver}
        title="Desbloquear Motorista"
        message="Deseja reativar o motorista? Informe a justificativa:"
        confirmText="Confirmar Desbloqueio"
        confirmVariant="primary"
        isLoading={actionLoading}
      >
        <div className="mt-3"><Input label="Motivo *" value={unblockReason} onChange={(event) => setUnblockReason(event.target.value)} required /></div>
      </ConfirmDialog>
    </ModalContainer>
  );
};