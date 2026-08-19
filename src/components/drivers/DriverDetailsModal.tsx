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
import { DriverHealthClient } from '../../api/driverHealthClient';
import { VehicleClient } from '../../api/vehicleClient';
import { DocumentClient } from '../../api/documentClient';
import { FileUpload } from '../documents/FileUpload';
import { DocumentStatus, DriverStatus } from '../../types/enums';
import type { DriverHealthAndEmergency } from '../../types/entities';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import {
  DriverLegacyDetailsBridge,
  type DriverLegacyDetailedSummary,
} from './DriverLegacyDetailsBridge';

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

type MessageType = 'RENT_CHARGE' | 'DUE_REMINDER' | 'TICKET_ALERT' | 'MAINTENANCE_ALERT' | 'CUSTOM';

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

  const [customMsg, setCustomMsg] = useState('');
  const [msgType, setMsgType] = useState<MessageType>('CUSTOM');

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

  useEffect(() => {
    if (!isOpen || !driverId) return;
    setActiveTab('overview');
    setIsHealthUnlocked(false);
    applyHealthProfile({});
    void loadData();
  }, [isOpen, driverId]);

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

  const buildMessage = (type: MessageType, customText?: string) => {
    if (!driver || !summary) return { message: '', ref: '' };
    if (type === 'RENT_CHARGE') {
      const amount = formatCurrencyBRL(summary.financialSummary.totalPendingAmount);
      return {
        message: `Olá ${driver.fullName}, gostaríamos de lembrar sobre a cobrança em aberto do aluguel do veículo no valor de ${amount}. Por favor, realize o pagamento para manter seu cadastro regularizado. Qualquer dúvida, estamos à disposição!`,
        ref: `Saldo devedor total: ${amount}`,
      };
    }
    if (type === 'DUE_REMINDER') {
      return {
        message: `Olá ${driver.fullName}, este é um lembrete amigável de que a sua próxima parcela de aluguel está próxima do vencimento. Mantenha os pagamentos em dia para evitar juros e bloqueios. Obrigado!`,
        ref: 'Lembrete de Vencimento',
      };
    }
    if (type === 'TICKET_ALERT') {
      return {
        message: `Olá ${driver.fullName}, identificamos ${summary.trafficTickets.length} nova(s) multa(s) de trânsito vinculada(s) ao veículo durante seu período de locação. Entre em contato para verificar os detalhes.`,
        ref: `Aviso de Multas (${summary.trafficTickets.length})`,
      };
    }
    if (type === 'MAINTENANCE_ALERT') {
      return {
        message: `Olá ${driver.fullName}, lembramos que o veículo está agendado ou necessita de manutenção preventiva em breve. Favor agendar o comparecimento na oficina parceira.`,
        ref: 'Aviso de Manutenção',
      };
    }
    return { message: customText || customMsg || 'Olá!', ref: 'Mensagem Personalizada' };
  };

  const handleSendWhatsApp = async (type: MessageType) => {
    if (!driver) return;
    const { message, ref } = buildMessage(type);
    if (!message) return;
    try {
      await bridge.addCommunicationLog(driver, {
        type,
        phone: driver.phone,
        message,
        relatedRef: ref,
        user: 'UI legada — entidade suplementar',
        status: 'OPENED_IN_WHATSAPP',
      });
      const cleanPhone = driver.phone.replace(/\D/g, '');
      const destination = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      window.open(`https://wa.me/${destination}?text=${encodeURIComponent(message)}`, '_blank');
      setCustomMsg('');
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao registrar comunicação.');
    }
  };

  const handleConfirmCommunicationSent = async (logId: string) => {
    try {
      await bridge.updateCommunicationStatus(logId, 'MANUALLY_CONFIRMED_SENT');
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao confirmar envio.');
    }
  };

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-bold">Disparador de WhatsApp</h3>
                <div className="flex flex-wrap gap-2">
                  {(['RENT_CHARGE','DUE_REMINDER','TICKET_ALERT','MAINTENANCE_ALERT','CUSTOM'] as MessageType[]).map((type) => (
                    <Button key={type} size="sm" variant="outline" onClick={() => { setMsgType(type); setCustomMsg(buildMessage(type).message); }}>{type}</Button>
                  ))}
                </div>
                <textarea rows={5} value={customMsg} onChange={(event) => setCustomMsg(event.target.value)} className="w-full p-2 text-xs rounded-lg border bg-transparent" />
                <Button disabled={!customMsg.trim()} onClick={() => handleSendWhatsApp(msgType)}><ExternalLink className="w-4 h-4 mr-1" />Abrir WhatsApp</Button>
              </Card>
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-bold">Histórico de Envio</h3>
                {summary.communicationLogs.length === 0 ? <p className="text-xs text-slate-400">Nenhuma comunicação registrada.</p> : summary.communicationLogs.map((log) => (
                  <div key={log.id} className="p-2 border rounded-lg text-xs"><strong>{log.type}</strong><p className="text-slate-500">{log.message}</p><span className="text-[10px]">{new Date(log.dateTime).toLocaleString('pt-BR')} • {log.status}</span>{log.status === 'OPENED_IN_WHATSAPP' && <button className="block text-emerald-600 mt-1" onClick={() => handleConfirmCommunicationSent(log.id)}>Confirmar envio ✓</button>}</div>
                ))}
              </Card>
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