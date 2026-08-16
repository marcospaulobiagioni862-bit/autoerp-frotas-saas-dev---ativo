import React, { useState, useEffect } from 'react';
import { AttachmentList } from '../documents/AttachmentList';
import { FileUpload } from '../documents/FileUpload';
import { ShieldCheck } from 'lucide-react';
import { TrafficTicketService } from '../../domain/services/TrafficTicketService';
import {
  TrafficTicketRepository,
  VehicleRepository,
  DriverRepository,
  ContractRepository,
  AccountReceivableRepository,
  AccountPayableRepository,
  AuditLogRepository,
} from '../../persistence/repositories/localRepositories';
import { TrafficTicket, Vehicle, Driver, Contract, AccountReceivable, AccountPayable, AuditLog } from '../../types/entities';
import { TicketResponsibility, TicketStatus, ObligationStatus } from '../../types/enums';
import { ModalContainer, Card, Badge, Button, Input, Select } from '../ui';
import { AlertTriangle, Car, User, FileText, DollarSign, ShieldAlert, History, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface TrafficTicketDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string | null;
  companyId: string;
  onRefresh: () => void;
}

export const TrafficTicketDetailsModal: React.FC<TrafficTicketDetailsModalProps> = ({
  isOpen,
  onClose,
  ticketId,
  companyId,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RESPONSIBILITY' | 'FINANCIAL' | 'APPEAL' | 'AUDIT'>('OVERVIEW');

  const [ticket, setTicket] = useState<TrafficTicket | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [receivable, setReceivable] = useState<AccountReceivable | null>(null);
  const [payable, setPayable] = useState<AccountPayable | null>(null);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for assignment / appeal / cancel
  const [newDriverId, setNewDriverId] = useState<string>('');
  const [newResponsibility, setNewResponsibility] = useState<TicketResponsibility>(TicketResponsibility.DRIVER);
  const [appealNotes, setAppealNotes] = useState<string>('');
  const [cancelReason, setCancelReason] = useState<string>('');

  useEffect(() => {
    if (isOpen && ticketId) {
      loadDetails();
    }
  }, [isOpen, ticketId]);

  const loadDetails = async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const ticketRepo = new TrafficTicketRepository();
      const vehicleRepo = new VehicleRepository();
      const driverRepo = new DriverRepository();
      const contractRepo = new ContractRepository();
      const recRepo = new AccountReceivableRepository();
      const payRepo = new AccountPayableRepository();
      const auditRepo = new AuditLogRepository();

      const t = await ticketRepo.findByIdForCompany(ticketId, companyId);
      if (!t) {
        setError('Multa não encontrada.');
        setLoading(false);
        return;
      }
      setTicket(t);
      setNewDriverId(t.driverId || '');
      setNewResponsibility(t.responsibility);

      if (t.vehicleId) {
        const v = await vehicleRepo.findByIdForCompany(t.vehicleId, companyId);
        setVehicle(v);
      }

      if (t.driverId) {
        const d = await driverRepo.findByIdForCompany(t.driverId, companyId);
        setDriver(d);
      }

      if (t.contractId) {
        const c = await contractRepo.findByIdForCompany(t.contractId, companyId);
        setContract(c);
      }

      if (t.receivableId) {
        const r = await recRepo.findByIdForCompany(t.receivableId, companyId);
        setReceivable(r);
      }

      if (t.payableId) {
        const p = await payRepo.findByIdForCompany(t.payableId, companyId);
        setPayable(p);
      }

      const driversList = await driverRepo.findAllForCompany(companyId);
      setAllDrivers(driversList);

      const logs = await auditRepo.findAllForCompany(companyId);
      const ticketLogs = logs.filter((l) => l.entityId === ticketId);
      setAuditLogs(ticketLogs);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar detalhes da multa.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateResponsibility = async () => {
    if (!ticket) return;
    setActionLoading(true);
    setError(null);
    try {
      const service = new TrafficTicketService();
      await service.assignDriverAndResponsibility(
        ticket.id,
        newDriverId || undefined,
        newResponsibility,
        'usr-admin',
        'Administrador'
      );
      setSuccessMsg('Responsabilidade e condutor atualizados com sucesso!');
      await loadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar responsabilidade.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAppeal = async () => {
    if (!ticket || !appealNotes.trim()) {
      setError('Informe os detalhes do recurso.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      const service = new TrafficTicketService();
      await service.appealTicket(ticket.id, appealNotes.trim(), 'usr-admin', 'Administrador');
      setSuccessMsg('Status de Recurso registrado com sucesso.');
      setAppealNotes('');
      await loadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar recurso.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!ticket || !cancelReason.trim()) {
      setError('Informe a justificativa do cancelamento.');
      return;
    }
    if (!confirm('Tem certeza que deseja cancelar esta multa de trânsito?')) return;

    setActionLoading(true);
    setError(null);
    try {
      const service = new TrafficTicketService();
      await service.cancelTicket(ticket.id, cancelReason.trim(), 'usr-admin', 'Administrador');
      setSuccessMsg('Multa cancelada com sucesso.');
      setCancelReason('');
      await loadDetails();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao cancelar multa.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} title={`Detalhes da Multa: Auto ${ticket?.autoNumber || ''}`} size="xl">
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-xs">Carregando detalhes da multa...</div>
      ) : !ticket ? (
        <div className="p-4 bg-rose-50 text-rose-700 text-xs rounded-xl">{error || 'Multa não encontrada.'}</div>
      ) : (
        <div className="space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'OVERVIEW'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('RESPONSIBILITY')}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'RESPONSIBILITY'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Condutor & Responsabilidade
            </button>
            <button
              onClick={() => setActiveTab('FINANCIAL')}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'FINANCIAL'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Financeiro
            </button>
            <button
              onClick={() => setActiveTab('APPEAL')}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'APPEAL'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Recurso & Cancelamento
            </button>
            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                activeTab === 'AUDIT'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Auditoria ({auditLogs.length})
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'OVERVIEW' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Dados da Infração
                </h4>
                <div className="space-y-1.5 text-slate-600 dark:text-slate-400">
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Auto de Infração:</strong>{' '}
                    <span className="font-mono font-bold text-indigo-600">{ticket.autoNumber}</span>
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Órgão Autuador:</strong> {ticket.organName}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Código da Infração:</strong>{' '}
                    {ticket.infractionCode}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Descrição:</strong> {ticket.description}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Pontuação CNH:</strong>{' '}
                    <span className="font-bold text-amber-600">{ticket.points} Pts</span>
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Data da Infração:</strong>{' '}
                    {new Date(ticket.infractionDate).toLocaleDateString('pt-BR')}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-slate-100">Vencimento:</strong>{' '}
                    {new Date(ticket.dueDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Valores & Responsabilidade
                </h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-500 block">Valor Original</span>
                    <strong className="text-lg font-mono text-slate-900 dark:text-slate-100">
                      {formatCurrencyBRL(ticket.originalAmount)}
                    </strong>
                  </div>

                  {ticket.discountedAmount && (
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                      <span className="text-emerald-700 dark:text-emerald-400 block font-semibold">
                        Valor com Desconto: {formatCurrencyBRL(ticket.discountedAmount)}
                      </span>
                      {ticket.discountDueDate && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-500">
                          Válido até: {new Date(ticket.discountDueDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <p>
                      <strong className="text-slate-900 dark:text-slate-100">Atribuição:</strong>{' '}
                      <Badge variant={ticket.responsibility === TicketResponsibility.DRIVER ? 'indigo' : 'slate'}>
                        {ticket.responsibility}
                      </Badge>
                    </p>
                    <p>
                      <strong className="text-slate-900 dark:text-slate-100">Status Operacional:</strong>{' '}
                      <Badge variant="warning">{ticket.status}</Badge>
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 md:col-span-2 space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-600" />
                  Vínculos (Veículo, Motorista & Contrato)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <span className="text-slate-400 block font-semibold">Veículo</span>
                    {vehicle ? (
                      <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">
                        {vehicle.plate} — {vehicle.brand} {vehicle.model}
                      </p>
                    ) : (
                      <p className="text-slate-400 italic mt-1">Nenhum</p>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <span className="text-slate-400 block font-semibold">Motorista</span>
                    {driver ? (
                      <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">
                        {driver.fullName}
                      </p>
                    ) : (
                      <p className="text-slate-400 italic mt-1">Não Identificado</p>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl">
                    <span className="text-slate-400 block font-semibold">Contrato</span>
                    {contract ? (
                      <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">
                        Contrato #{contract.id.slice(0, 8)}
                      </p>
                    ) : (
                      <p className="text-slate-400 italic mt-1">Sem Vínculo Direto</p>
                    )}
                  </div>
                </div>
              </Card>

              {ticket.notes && (
                <Card className="p-4 md:col-span-2 space-y-1 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <h4 className="font-bold text-amber-900 dark:text-amber-200">Observações</h4>
                  <p className="text-amber-800 dark:text-amber-300 whitespace-pre-line">{ticket.notes}</p>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: RESPONSIBILITY & DRIVER ASSIGNMENT */}
          {activeTab === 'RESPONSIBILITY' && (
            <Card className="p-4 space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-600" />
                Atribuir Motorista e Alterar Responsabilidade
              </h4>
              <p className="text-slate-500">
                Ao alterar a responsabilidade para <strong>MOTORISTA</strong>, o sistema cria automaticamente uma Conta a Receber vinculada. Se alterar para <strong>EMPRESA</strong>, cria uma Conta a Pagar.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-semibold mb-1">Motorista</label>
                  <Select value={newDriverId} onChange={(e) => setNewDriverId(e.target.value)}>
                    <option value="">-- Selecionar Motorista --</option>
                    {allDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} (CPF: {d.cpf})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Responsabilidade</label>
                  <Select
                    value={newResponsibility}
                    onChange={(e) => setNewResponsibility(e.target.value as TicketResponsibility)}
                  >
                    <option value={TicketResponsibility.DRIVER}>Motorista (Cobrar)</option>
                    <option value={TicketResponsibility.COMPANY}>Empresa/Locadora (Pagar)</option>
                    <option value={TicketResponsibility.UNIDENTIFIED}>Não Identificado</option>
                  </Select>
                </div>
              </div>

              <div className="pt-3 flex justify-end">
                <Button
                  variant="primary"
                  onClick={handleUpdateResponsibility}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Atualizando...' : 'Salvar Responsabilidade'}
                </Button>
              </div>
            </Card>
          )}

          {/* TAB 3: FINANCIAL */}
          {activeTab === 'FINANCIAL' && (
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Obrigações Financeiras Vinculadas
                </h4>

                {receivable && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-emerald-900 dark:text-emerald-100 font-bold">
                        Conta a Receber (Cobrança ao Motorista)
                      </strong>
                      <Badge variant={receivable.status === ObligationStatus.PAID ? 'success' : 'warning'}>
                        {receivable.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-700 dark:text-slate-300">
                      <p><strong>Valor:</strong> {formatCurrencyBRL(receivable.totalAmount)}</p>
                      <p><strong>Vencimento:</strong> {new Date(receivable.dueDate).toLocaleDateString('pt-BR')}</p>
                      <p><strong>ID Titulo:</strong> #{receivable.id.slice(0, 8)}</p>
                    </div>
                  </div>
                )}

                {payable && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-blue-900 dark:text-blue-100 font-bold">
                        Conta a Pagar (Débito da Empresa)
                      </strong>
                      <Badge variant={payable.status === ObligationStatus.PAID ? 'success' : 'warning'}>
                        {payable.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-700 dark:text-slate-300">
                      <p><strong>Valor:</strong> {formatCurrencyBRL(payable.totalAmount)}</p>
                      <p><strong>Vencimento:</strong> {new Date(payable.dueDate).toLocaleDateString('pt-BR')}</p>
                      <p><strong>ID Titulo:</strong> #{payable.id.slice(0, 8)}</p>
                    </div>
                  </div>
                )}

                {!receivable && !payable && (
                  <p className="text-slate-500 italic py-4 text-center border rounded-xl">
                    Nenhum título financeiro associado no momento (multa sem responsável definido).
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* TAB 4: APPEAL & CANCEL */}
          {activeTab === 'APPEAL' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <h4 className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  Registrar Recurso de Multa (JARI / DETRAN)
                </h4>
                <p className="text-slate-500">
                  Defina o status como RECURSO pendente sem cancelar ou alterar o título financeiro existente.
                </p>
                <textarea
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  rows={3}
                  placeholder="Número do protocolo de recurso, órgão julgador, observações..."
                  value={appealNotes}
                  onChange={(e) => setAppealNotes(e.target.value)}
                />
                <Button variant="warning" onClick={handleAppeal} disabled={actionLoading}>
                  Marcar como Em Recurso
                </Button>
              </Card>

              <Card className="p-4 space-y-3 bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800">
                <h4 className="font-bold text-rose-800 dark:text-rose-400 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  Cancelar Multa de Trânsito
                </h4>
                <p className="text-slate-500">
                  O cancelamento estorna ou cancela o título financeiro pendente e preserva o registro histórico na auditoria.
                </p>
                <textarea
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  rows={3}
                  placeholder="Justificativa do cancelamento (ex: Anulada pelo DETRAN)..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <Button variant="outline" className="text-rose-600 border-rose-300 hover:bg-rose-100" onClick={handleCancel} disabled={actionLoading}>
                  Cancelar Multa
                </Button>
              </Card>
            </div>
          )}

          {/* TAB 5: AUDIT LOGS */}
          {activeTab === 'AUDIT' && (
            <Card className="p-4 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                Histórico Auditado de Modificações
              </h4>

              {auditLogs.length === 0 ? (
                <p className="text-slate-500 italic py-4 text-center">Nenhum registro de auditoria encontrado.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900">
                      <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="font-bold">{log.action}</span>
                        <span className="font-mono text-slate-400">
                          {new Date(log.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-slate-500 text-[11px] mt-0.5">Usuário: {log.userName}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      )}
    </ModalContainer>
  );
};
