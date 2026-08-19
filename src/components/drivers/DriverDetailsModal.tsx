import React, { useState, useEffect } from 'react';
import {
  User,
  CreditCard,
  Car,
  FileText,
  DollarSign,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  File,
  Lock,
  Unlock,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Calendar,
  MessageSquare,
  Activity,
} from 'lucide-react';
import {
  ModalContainer,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Skeleton,
  ConfirmDialog,
} from '../ui';
import {
  DriverService,
  DriverDetailedSummary,
} from '../../domain/services/DriverService';
import { DriverStatus, DocumentStatus, TicketResponsibility, ObligationStatus } from '../../types/enums';
import { formatCurrencyBRL } from '../../shared/utils/currency';
import { DriverHealthAndEmergency } from '../../types/entities';
import { DriverHealthClient } from '../../api/driverHealthClient';

interface DriverDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: string | null;
  onSelectVehicle?: (vehicleId: string) => void;
  onDriverUpdated?: () => void;
}

export const DriverDetailsModal: React.FC<DriverDetailsModalProps> = ({
  isOpen,
  onClose,
  driverId,
  onSelectVehicle,
  onDriverUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'cnh' | 'vehicles' | 'contracts' | 'finance' | 'tickets' | 'communications' | 'health' | 'history'
  >('overview');

  const [summary, setSummary] = useState<DriverDetailedSummary | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Block/Unblock Dialogs
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [isUnblockDialogOpen, setIsUnblockDialogOpen] = useState(false);
  const [unblockReason, setUnblockReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // New Document Modal/State
  const [isAddDocOpen, setIsAddDocOpen] = useState(false);
  const [docType, setDocType] = useState('Comprovante de Residência');
  const [docNumber, setDocNumber] = useState('');
  const [docExpDate, setDocExpDate] = useState('');
  const [docNotes, setDocNotes] = useState('');

  // Health & Emergency Edit Modal/State
  const [isEditHealthOpen, setIsEditHealthOpen] = useState(false);
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [relevantConditions, setRelevantConditions] = useState('');
  const [continuousMedications, setContinuousMedications] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyNotes, setEmergencyNotes] = useState('');
  const [isHealthUnlocked, setIsHealthUnlocked] = useState(false);
  const [healthProfile, setHealthProfile] = useState<DriverHealthAndEmergency>({});

  // WhatsApp Communications State
  const [customMsg, setCustomMsg] = useState('');
  const [msgType, setMsgType] = useState<'RENT_CHARGE' | 'DUE_REMINDER' | 'TICKET_ALERT' | 'MAINTENANCE_ALERT' | 'CUSTOM'>('CUSTOM');

  const driver = summary?.driver;

  const applyHealthProfile = (h: DriverHealthAndEmergency) => {
    setHealthProfile(h);
    setBloodType(h.bloodType || ''); setAllergies(h.allergies || '');
    setRelevantConditions(h.relevantConditions || ''); setContinuousMedications(h.continuousMedications || '');
    setEmergencyContactName(h.emergencyContactName || ''); setEmergencyContactRelationship(h.emergencyContactRelationship || '');
    setEmergencyContactPhone(h.emergencyContactPhone || ''); setEmergencyNotes(h.emergencyNotes || '');
  };

  const handleUnlockHealth = async () => {
    if (!driverId) return;
    setActionLoading(true);
    try {
      const h = await DriverHealthClient.get(driverId);
      applyHealthProfile(h);
      setIsHealthUnlocked(true);
    } catch (err: any) {
      alert(err.message || 'Acesso negado aos dados de saúde.');
      setIsHealthUnlocked(false);
    } finally { setActionLoading(false); }
  };

  const handleSaveHealthAndEmergency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverId) return;
    setActionLoading(true);
    try {
      const updated = await DriverHealthClient.update(driverId, {
        bloodType, allergies, relevantConditions, continuousMedications, emergencyContactName,
        emergencyContactRelationship, emergencyContactPhone, emergencyNotes,
      });
      applyHealthProfile(updated);
      setIsEditHealthOpen(false);
    } catch (err: any) { alert(err.message || 'Erro ao atualizar dados de saúde.'); }
    finally { setActionLoading(false); }
  };

  const handleSendWhatsApp = async (type: typeof msgType, customText?: string) => {
    if (!driver || !summary) return;
    let message = '';
    let ref = '';

    if (type === 'RENT_CHARGE') {
      const pendingBRL = formatCurrencyBRL(summary.financialSummary.totalPendingAmount);
      message = `Olá ${driver.fullName}, gostaríamos de lembrar sobre a cobrança em aberto do aluguel do veículo no valor de ${pendingBRL}. Por favor, realize o pagamento para manter seu cadastro regularizado. Qualquer dúvida, estamos à disposição!`;
      ref = `Saldo devedor total: ${pendingBRL}`;
    } else if (type === 'DUE_REMINDER') {
      message = `Olá ${driver.fullName}, este é um lembrete amigável de que a sua próxima parcela de aluguel está próxima do vencimento. Mantenha os pagamentos em dia para evitar juros e bloqueios. Obrigado!`;
      ref = 'Lembrete de Vencimento';
    } else if (type === 'TICKET_ALERT') {
      const count = summary.trafficTickets.length;
      message = `Olá ${driver.fullName}, identificamos ${count} nova(s) multa(s) de trânsito vinculada(s) ao veículo durante seu período de locação. Por favor, verifique os detalhes no painel ou entre em contato para receber a guia.`;
      ref = `Aviso de Multas (${count})`;
    } else if (type === 'MAINTENANCE_ALERT') {
      message = `Olá ${driver.fullName}, lembramos que o veículo está agendado ou necessita de manutenção preventiva em breve. Favor agendar o comparecimento na oficina parceira para garantir sua segurança na via.`;
      ref = 'Aviso de Manutenção';
    } else {
      message = customText || customMsg || 'Olá!';
      ref = 'Mensagem Personalizada';
    }

    try {
      // Save Communication Log
      const driverService = new DriverService();
      await driverService.addCommunicationLog({
        companyId: driver.companyId,
        driverId: driver.id,
        type,
        phone: driver.phone,
        message,
        relatedRef: ref,
        user: 'Administrador',
        status: 'OPENED_IN_WHATSAPP',
      });

      // Open WhatsApp Web/App
      const cleanPhone = driver.phone.replace(/\D/g, '');
      const waUrl = `https://wa.me/${cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');

      setCustomMsg('');

      // Reload summary to see new log
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar log de comunicação.');
    }
  };

  const handleConfirmCommunicationSent = async (logId: string) => {
    try {
      const driverService = new DriverService();
      await driverService.updateCommunicationStatus(logId, 'MANUALLY_CONFIRMED_SENT');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao confirmar envio.');
    }
  };

  const loadData = async () => {
    if (!driverId) return;
    setLoading(true);
    setError(null);
    try {
      const driverService = new DriverService();
      const data = await driverService.getDriverDetailedSummary(driverId);
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar os detalhes do motorista.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && driverId) {
      setIsHealthUnlocked(false);
      applyHealthProfile({});
      loadData();
      setActiveTab('overview');
    }
  }, [isOpen, driverId]);

  const handleBlockDriver = async () => {
    if (!driverId || !blockReason.trim()) return;
    setActionLoading(true);
    try {
      const driverService = new DriverService();
      await driverService.blockDriver(driverId, blockReason, 'usr-admin', 'Administrador');
      setIsBlockDialogOpen(false);
      setBlockReason('');
      await loadData();
      if (onDriverUpdated) onDriverUpdated();
    } catch (err: any) {
      alert(err.message || 'Erro ao bloquear motorista.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblockDriver = async () => {
    if (!driverId || !unblockReason.trim()) return;
    setActionLoading(true);
    try {
      const driverService = new DriverService();
      await driverService.unblockDriver(driverId, unblockReason, 'usr-admin', 'Administrador');
      setIsUnblockDialogOpen(false);
      setUnblockReason('');
      await loadData();
      if (onDriverUpdated) onDriverUpdated();
    } catch (err: any) {
      alert(err.message || 'Erro ao desbloquear motorista.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverId) return;
    setActionLoading(true);
    try {
      const driverService = new DriverService();
      await driverService.addDocument(
        driverId,
        {
          documentType: docType,
          documentNumber: docNumber,
          expirationDate: docExpDate || undefined,
          notes: docNotes,
        },
        'usr-admin',
        'Administrador'
      );
      setIsAddDocOpen(false);
      setDocNumber('');
      setDocExpDate('');
      setDocNotes('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar documento.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveDocument = async (docId: string) => {
    if (!confirm('Deseja realmente remover este documento?')) return;
    try {
      const driverService = new DriverService();
      await driverService.removeDocument(docId, 'usr-admin', 'Administrador');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover documento.');
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (st?: DriverStatus) => {
    switch (st) {
      case DriverStatus.ACTIVE:
        return <Badge variant="success">Ativo</Badge>;
      case DriverStatus.INACTIVE:
        return <Badge variant="neutral">Inativo</Badge>;
      case DriverStatus.BLOCKED:
        return <Badge variant="danger">Bloqueado</Badge>;
      case DriverStatus.PENDING_DOCS:
        return <Badge variant="warning">Pendente de Docs</Badge>;
      default:
        return <Badge variant="neutral">{st || 'Sem Status'}</Badge>;
    }
  };

  const getCnhBadge = (st?: DocumentStatus) => {
    switch (st) {
      case DocumentStatus.VALID:
        return <Badge variant="success">CNH Válida</Badge>;
      case DocumentStatus.EXPIRING_SOON:
        return <Badge variant="warning">CNH Vencendo</Badge>;
      case DocumentStatus.EXPIRED:
        return <Badge variant="danger">CNH Vencida</Badge>;
      default:
        return <Badge variant="neutral">Sem Info</Badge>;
    }
  };

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
        <div className="space-y-6">
          {/* CABEÇALHO RESUMO */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-lg">
                {driver.fullName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {driver.fullName}
                  </h2>
                  {getStatusBadge(driver.status)}
                  {getCnhBadge(summary.cnhAlert.status)}
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  CPF: {driver.cpf} • CNH: {driver.cnhNumber} ({driver.cnhCategory})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              {driver.status === DriverStatus.BLOCKED ? (
                <Button
                  variant="outline"
                  onClick={() => setIsUnblockDialogOpen(true)}
                  className="text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <Unlock className="w-4 h-4 mr-1.5" />
                  Desbloquear
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsBlockDialogOpen(true)}
                  className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Lock className="w-4 h-4 mr-1.5" />
                  Bloquear
                </Button>
              )}
            </div>
          </div>

          {/* ALERTA CNH SE VENCIDA OU VENCENDO */}
          {summary.cnhAlert.status !== DocumentStatus.VALID && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                summary.cnhAlert.status === DocumentStatus.EXPIRED
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              }`}
            >
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <div className="text-xs">
                <strong>Alerta de CNH: </strong>
                {summary.cnhAlert.message} Data de validade cadastrada:{' '}
                <span className="font-mono">{driver.cnhExpiration}</span>.
              </div>
            </div>
          )}

          {/* ABAS */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar gap-1">
            {[
              { id: 'overview', label: 'Visão Geral', icon: User },
              { id: 'cnh', label: 'CNH & Documentos', icon: CreditCard },
              { id: 'vehicles', label: 'Veículos', icon: Car },
              { id: 'contracts', label: 'Contratos', icon: FileText },
              { id: 'finance', label: 'Financeiro', icon: DollarSign },
              { id: 'tickets', label: 'Multas', icon: AlertTriangle },
              { id: 'communications', label: 'Comunicações', icon: MessageSquare },
              { id: 'health', label: 'Saúde & Emergência', icon: ShieldAlert },
              { id: 'history', label: 'Histórico', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* CONTEÚDO DAS ABAS */}

          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Informações de Contato
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span>{driver.phone}</span>
                    {driver.whatsapp && (
                      <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-md font-mono">
                        WhatsApp
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span>{driver.email || 'E-mail não informado'}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>Data Nasc: {driver.birthDate}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Endereço
                </h3>
                <div className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p>
                      {driver.address?.street}, {driver.address?.number}{' '}
                      {driver.address?.complement && `(${driver.address.complement})`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {driver.address?.neighborhood} • {driver.address?.city} / {driver.address?.state}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      CEP: {driver.address?.zipCode}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 md:col-span-2 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Plataformas de Atuação & Anotações
                </h3>
                <div className="flex flex-wrap gap-2">
                  {driver.appPlatforms?.map((p) => (
                    <Badge key={p} variant="neutral">
                      {p}
                    </Badge>
                  ))}
                </div>
                {driver.notes && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    {driver.notes}
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* TAB 2: CNH & DOCUMENTOS */}
          {activeTab === 'cnh' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Documentos Registrados
                </h3>
                <Button size="sm" onClick={() => setIsAddDocOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Anexar Documento
                </Button>
              </div>

              {/* LISTA DE DOCUMENTOS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {summary.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-lg">
                        <File className="w-5 h-5" />
                      </div>
                      <div>
                        <strong className="text-sm font-semibold text-slate-900 dark:text-slate-100 block">
                          {doc.documentType}
                        </strong>
                        <p className="text-xs text-slate-500 font-mono">
                          {doc.documentNumber || 'Sem número'}
                        </p>
                        {doc.expirationDate && (
                          <p className="text-[11px] text-slate-400">
                            Validade: <span className="font-mono">{doc.expirationDate}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => handleRemoveDocument(doc.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: VEÍCULOS */}
          {activeTab === 'vehicles' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Veículo Atual Vinculado
              </h3>

              {summary.currentVehicle ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Car className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <strong className="text-base font-bold text-slate-900 dark:text-slate-100 block">
                        {summary.currentVehicle.brand} {summary.currentVehicle.model} ({summary.currentVehicle.year})
                      </strong>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                        Placa: {summary.currentVehicle.plate} • Renavam: {summary.currentVehicle.renavam}
                      </p>
                    </div>
                  </div>

                  {onSelectVehicle && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onClose();
                        onSelectVehicle(summary.currentVehicle.id);
                      }}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Ver Veículo
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs">
                  Nenhum veículo vinculado ativamente a este motorista no momento.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CONTRATOS */}
          {activeTab === 'contracts' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Histórico de Contratos
              </h3>
              {summary.contractHistory.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum contrato registrado para este motorista.</p>
              ) : (
                <div className="space-y-2">
                  {summary.contractHistory.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 block">
                          Contrato #{c.contractNumber}
                        </span>
                        <span className="text-slate-500">
                          Início: {c.startDate} • Término: {c.endDate || 'Em andamento'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                          {formatCurrencyBRL(c.recurringValue)} / {c.frequency}
                        </span>
                        <Badge variant={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {c.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: FINANCEIRO */}
          {activeTab === 'finance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block">Pendente / Em Aberto</span>
                  <strong className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrencyBRL(summary.financialSummary.totalPendingAmount)}
                  </strong>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block">Vencido / Em Atraso</span>
                  <strong className="text-lg font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrencyBRL(summary.financialSummary.totalOverdueAmount)}
                  </strong>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <span className="text-xs text-slate-400 block">Total Recebido</span>
                  <strong className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrencyBRL(summary.financialSummary.totalPaidAmount)}
                  </strong>
                </div>
              </div>

              {/* CAUÇÕES */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Garantia / Caução (Security Deposit)
                </h4>
                {summary.securityDeposits.length === 0 ? (
                  <p className="text-xs text-slate-400">Nenhuma caução registrada.</p>
                ) : (
                  summary.securityDeposits.map((dep) => (
                    <div
                      key={dep.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-semibold block">Caução Contratual</span>
                        <span className="text-slate-400">Status: {dep.status}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                          {formatCurrencyBRL(dep.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Saldo: {formatCurrencyBRL(dep.balance)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 6: MULTAS */}
          {activeTab === 'tickets' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Multas de Trânsito Atribuídas
              </h3>
              {summary.trafficTickets.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhuma multa registrada para este motorista.</p>
              ) : (
                <div className="space-y-2">
                  {summary.trafficTickets.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl flex justify-between items-center text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                          {t.infractionCode || 'Auto s/n'} — {t.description}
                        </span>
                        <span className="text-slate-400">
                          Data: {t.infractionDate} • Vencimento: {t.dueDate}
                        </span>
                      </div>
                      <div className="text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrencyBRL(t.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: COMUNICAÇÕES & WHATSAPP */}
          {activeTab === 'communications' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* GERAR MENSAGENS */}
                <Card className="p-4 space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Disparador de WhatsApp
                    </h3>
                    <p className="text-xs text-slate-500">
                      Escolha um modelo de mensagem operacional pré-formatada baseada nos dados do motorista.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMsgType('RENT_CHARGE');
                          const pendingBRL = formatCurrencyBRL(summary.financialSummary.totalPendingAmount);
                          setCustomMsg(`Olá ${driver.fullName}, gostaríamos de lembrar sobre a cobrança em aberto do aluguel do veículo no valor de ${pendingBRL}. Por favor, realize o pagamento para manter seu cadastro regularizado. Qualquer dúvida, estamos à disposição!`);
                        }}
                        className="text-xs"
                      >
                        Cobrar Aluguel
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMsgType('DUE_REMINDER');
                          setCustomMsg(`Olá ${driver.fullName}, este é um lembrete amigável de que a sua próxima parcela de aluguel está próxima do vencimento. Mantenha os pagamentos em dia para evitar juros e bloqueios. Obrigado!`);
                        }}
                        className="text-xs"
                      >
                        Lembrar Vencimento
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMsgType('TICKET_ALERT');
                          const count = summary.trafficTickets.length;
                          setCustomMsg(`Olá ${driver.fullName}, identificamos ${count} nova(s) multa(s) de trânsito vinculada(s) ao veículo durante seu período de locação. Por favor, verifique os detalhes no painel ou entre em contato para receber a guia.`);
                        }}
                        className="text-xs"
                      >
                        Avisar Multa
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMsgType('MAINTENANCE_ALERT');
                          setCustomMsg(`Olá ${driver.fullName}, lembramos que o veículo está agendado ou necessita de manutenção preventiva em breve. Favor agendar o comparecimento na oficina parceira para garantir sua segurança na via.`);
                        }}
                        className="text-xs"
                      >
                        Avisar Manutenção
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setMsgType('CUSTOM');
                          setCustomMsg('');
                        }}
                        className="text-xs"
                      >
                        Personalizada
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-500">Texto de Mensagem</label>
                      <textarea
                        rows={4}
                        value={customMsg}
                        onChange={(e) => setCustomMsg(e.target.value)}
                        placeholder="Selecione um modelo acima ou digite a mensagem personalizada..."
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <Button
                      variant="primary"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={!customMsg.trim()}
                      onClick={() => handleSendWhatsApp(msgType)}
                    >
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      Abrir no WhatsApp Web/App
                    </Button>
                  </div>
                </Card>

                {/* HISTÓRICO DE COMUNICAÇÕES */}
                <Card className="p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Histórico de Envio
                  </h3>
                  {summary.communicationLogs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">Nenhuma mensagem disparada pelo AutoERP.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {summary.communicationLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-xs"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {log.type === 'RENT_CHARGE' && 'Cobrança de Aluguel'}
                                {log.type === 'DUE_REMINDER' && 'Lembrete de Vencimento'}
                                {log.type === 'TICKET_ALERT' && 'Aviso de Multa'}
                                {log.type === 'MAINTENANCE_ALERT' && 'Aviso de Manutenção'}
                                {log.type === 'CUSTOM' && 'Personalizada'}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-mono">
                                {new Date(log.dateTime).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                              {log.status === 'OPENED_IN_WHATSAPP' && (
                                <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded font-semibold font-mono">
                                  ABERTO NO WHATSAPP
                                </span>
                              )}
                              {log.status === 'MANUALLY_CONFIRMED_SENT' && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded font-semibold font-mono">
                                  CONFIRMADO ENVIADO
                                </span>
                              )}
                              {log.status === 'OPENED_IN_WHATSAPP' && (
                                <button
                                  onClick={() => handleConfirmCommunicationSent(log.id)}
                                  className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold hover:underline"
                                >
                                  Confirmar Envio ✓
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-slate-600 dark:text-slate-400 font-sans italic border-l-2 border-slate-300 dark:border-slate-700 pl-2">
                            "{log.message}"
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Enviado por: {log.user}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* TAB: SAÚDE & EMERGÊNCIA */}
          {activeTab === 'health' && (
            <div className="space-y-4">
              {!isHealthUnlocked ? (
                <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-900/20 max-w-lg mx-auto space-y-4">
                  <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Informações de Saúde & Emergência (Acesso Restrito)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Os dados de saúde são protegidos de acordo com políticas de privacidade administrativa. O acesso é auditado na trilha do sistema.
                    </p>
                  </div>
                  <Button
                    onClick={handleUnlockHealth}
                    disabled={actionLoading}
                    variant="primary"
                    size="sm"
                  >
                    <Unlock className="w-4 h-4 mr-1.5" />
                    Desbloquear Visualização
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Dados Médicos e Contatos para Sinistros
                      </h3>
                      <button
                        onClick={() => setIsHealthUnlocked(false)}
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                      >
                        <Lock className="w-3 h-3" /> Bloquear tela
                      </button>
                    </div>
                    <Button size="sm" onClick={() => setIsEditHealthOpen(true)}>
                      Editar Informações
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CLINICOS */}
                    <Card className="p-4 space-y-3.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-600" /> Ficha de Saúde Básica
                      </h4>
                      <div className="space-y-2.5 text-xs">
                        <div>
                          <span className="text-slate-400 block">Tipo Sanguíneo</span>
                          <strong className="text-slate-800 dark:text-slate-100 text-sm font-mono">
                            {healthProfile?.bloodType || 'Não informado'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Alergias</span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium">
                            {healthProfile?.allergies || 'Nenhuma alergia conhecida registrada.'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Condições Médicas Relevantes</span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium">
                            {healthProfile?.relevantConditions || 'Nenhuma condição reportada.'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Medicamentos de Uso Contínuo</span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium font-mono">
                            {healthProfile?.continuousMedications || 'Nenhum medicamento registrado.'}
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* CONTATO DE EMERGENCIA */}
                    <Card className="p-4 space-y-3.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Phone className="w-4 h-4 text-emerald-600" /> Contato de Emergência (Sinistros)
                      </h4>
                      <div className="space-y-2.5 text-xs">
                        <div>
                          <span className="text-slate-400 block">Nome do Contato</span>
                          <strong className="text-slate-800 dark:text-slate-100 text-sm">
                            {healthProfile?.emergencyContactName || 'Não informado'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Parentesco / Relação</span>
                          <p className="text-slate-800 dark:text-slate-200 font-medium">
                            {healthProfile?.emergencyContactRelationship || 'Não informado'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Telefone de Emergência</span>
                          <p className="text-slate-800 dark:text-slate-200 font-bold font-mono text-sm">
                            {healthProfile?.emergencyContactPhone || 'Não informado'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Observações de Emergência</span>
                          <p className="text-slate-800 dark:text-slate-200 italic">
                            {healthProfile?.emergencyNotes || 'Sem observações adicionais.'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {healthProfile?.lastUpdateDate && (
                    <p className="text-[10px] text-slate-400 font-mono text-right">
                      Última atualização: {new Date(healthProfile.lastUpdateDate + 'T12:00:00').toLocaleDateString('pt-BR')} por {healthProfile.responsibleUser || 'Sistema'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: HISTÓRICO / AUDITORIA */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Trilha de Auditoria & Modificações
              </h3>
              {summary.historyLogs.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum evento registrado no histórico.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {summary.historyLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center font-semibold">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {log.action}
                        </span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {new Date(log.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        Usuário: <span className="font-semibold">{log.userName || log.userId}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL DE ADICIONAR DOCUMENTO */}
      {isAddDocOpen && (
        <ModalContainer
          isOpen={isAddDocOpen}
          onClose={() => setIsAddDocOpen(false)}
          title="Anexar Novo Documento"
          maxWidth="max-w-md"
        >
          <form onSubmit={handleAddDocument} className="space-y-4">
            <Select
              label="Tipo de Documento *"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              required
            >
              <option value="Comprovante de Residência">Comprovante de Residência</option>
              <option value="Certidão de Antecedentes Criminais">
                Certidão de Antecedentes Criminais
              </option>
              <option value="Contrato Assinado">Contrato Assinado</option>
              <option value="Outro Documento">Outro Documento</option>
            </Select>

            <Input
              label="Número do Documento (opcional)"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="Ex: 123456"
            />

            <Input
              label="Data de Validade (opcional)"
              type="date"
              value={docExpDate}
              onChange={(e) => setDocExpDate(e.target.value)}
            />

            <Input
              label="Observações"
              value={docNotes}
              onChange={(e) => setDocNotes(e.target.value)}
              placeholder="Notas adicionais"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDocOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={actionLoading}>
                Salvar Documento
              </Button>
            </div>
          </form>
        </ModalContainer>
      )}

      {/* MODAL DE EDITAR SAÚDE & EMERGÊNCIA */}
      {isEditHealthOpen && (
        <ModalContainer
          isOpen={isEditHealthOpen}
          onClose={() => setIsEditHealthOpen(false)}
          title="Editar Informações de Saúde & Emergência"
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSaveHealthAndEmergency} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Tipo Sanguíneo"
                value={bloodType}
                onChange={(e) => setBloodType(e.target.value)}
                placeholder="Ex: O+, A-, AB+..."
              />

              <Input
                label="Alergias Conhecidas"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Ex: Dipirona, Corantes, Picada de insetos..."
              />
            </div>

            <Input
              label="Condições Médicas Relevantes"
              value={relevantConditions}
              onChange={(e) => setRelevantConditions(e.target.value)}
              placeholder="Ex: Hipertensão, Diabetes, Cardiopatia..."
            />

            <Input
              label="Medicamentos de Uso Contínuo"
              value={continuousMedications}
              onChange={(e) => setContinuousMedications(e.target.value)}
              placeholder="Ex: Losartana 50mg, Insulina..."
            />

            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-3">Contato de Emergência</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Nome do Contato *"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Nome do parente/amigo"
                  required
                />

                <Input
                  label="Parentesco / Relação *"
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  placeholder="Ex: Cônjuge, Mãe, Filho, Amigo..."
                  required
                />
              </div>

              <div className="mt-4">
                <Input
                  label="Telefone do Contato *"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="Ex: (11) 99999-9999"
                  required
                />
              </div>
            </div>

            <Input
              label="Observações Adicionais de Emergência"
              value={emergencyNotes}
              onChange={(e) => setEmergencyNotes(e.target.value)}
              placeholder="Notas ou instruções para socorristas"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => setIsEditHealthOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={actionLoading}>
                Salvar Informações
              </Button>
            </div>
          </form>
        </ModalContainer>
      )}

      {/* CONFIRM DIALOG - BLOQUEAR */}
      <ConfirmDialog
        isOpen={isBlockDialogOpen}
        onClose={() => setIsBlockDialogOpen(false)}
        onConfirm={handleBlockDriver}
        title="Bloquear Motorista"
        message="Atenção: Ao bloquear o motorista, ele ficará impedido de iniciar novos contratos ou assumir novos veículos. Informe o motivo abaixo:"
        confirmText="Confirmar Bloqueio"
        confirmVariant="danger"
        isLoading={actionLoading}
      >
        <div className="mt-3">
          <Input
            label="Motivo do Bloqueio *"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="Ex: Inadimplência recorrente, documento suspenso..."
            required
          />
        </div>
      </ConfirmDialog>

      {/* CONFIRM DIALOG - DESBLOQUEAR */}
      <ConfirmDialog
        isOpen={isUnblockDialogOpen}
        onClose={() => setIsUnblockDialogOpen(false)}
        onConfirm={handleUnblockDriver}
        title="Desbloquear Motorista"
        message="Deseja reativar o motorista no sistema? Informe a justificativa administrativa:"
        confirmText="Confirmar Desbloqueio"
        confirmVariant="primary"
        isLoading={actionLoading}
      >
        <div className="mt-3">
          <Input
            label="Motivo do Desbloqueio *"
            value={unblockReason}
            onChange={(e) => setUnblockReason(e.target.value)}
            placeholder="Ex: Débitos quitados, CNH renovada..."
            required
          />
        </div>
      </ConfirmDialog>
    </ModalContainer>
  );
};
