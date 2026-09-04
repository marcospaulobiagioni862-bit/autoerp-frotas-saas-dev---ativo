import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calendar, Car, DollarSign, FileText, History, Receipt, ShieldCheck, User, X } from 'lucide-react';
import { Badge, Button, Card, ModalContainer } from '../ui';
import { ContractClient } from '../../api/contractClient';
import { DriverClient } from '../../api/driverClient';
import { VehicleClient } from '../../api/vehicleClient';
import { FinanceDepositClient, createDepositReceiptIdempotencyKey } from '../../api/financeDepositClient';
import { FinanceObligationClient } from '../../api/financeObligationClient';
import { FinanceSettlementClient, type SettlementOptions } from '../../api/financeSettlementClient';
import { TrafficTicketClient, type TrafficTicketFinancialCategory } from '../../api/trafficTicketClient';
import { ContractLegacyDetailsBridge } from './ContractLegacyDetailsBridge';
import { AttachmentList } from '../documents/AttachmentList';
import { FileUpload } from '../documents/FileUpload';
import { ContractExecutionPanel } from './ContractExecutionPanel';
import type { AccountReceivable, AuditLog, Contract, Driver, SecurityDeposit, TrafficTicket, Vehicle } from '../../types/entities';
import { ContractStatus, ObligationStatus } from '../../types/enums';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface ContractDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contractId: string | null;
  companyId: string;
  onRefresh: () => void;
  onOpenReceiptModal?: (receivableId: string) => void;
  initialFocus?: 'OVERVIEW' | 'PDF_SIGNATURE' | 'FINANCIAL';
}

type Tab = 'OVERVIEW' | 'FINANCIAL' | 'DEPOSIT' | 'TICKETS' | 'AUDIT';
const bridge = new ContractLegacyDetailsBridge();
const EMPTY_SETTLEMENT_OPTIONS: SettlementOptions = { accounts: [], paymentMethods: [] };

export const ContractDetailsModal: React.FC<ContractDetailsModalProps> = ({ isOpen, onClose, contractId, companyId, onRefresh, onOpenReceiptModal, initialFocus = 'OVERVIEW' }) => {
  const versionRef = useRef(0);
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [contract, setContract] = useState<Contract | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [deposit, setDeposit] = useState<SecurityDeposit | null>(null);
  const [tickets, setTickets] = useState<TrafficTicket[]>([]);
  const [history, setHistory] = useState<AuditLog[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<TrafficTicketFinancialCategory[]>([]);
  const [incomeCategoryId, setIncomeCategoryId] = useState('');
  const [settlementOptions, setSettlementOptions] = useState<SettlementOptions>(EMPTY_SETTLEMENT_OPTIONS);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [depositPaymentMethodId, setDepositPaymentMethodId] = useState('');
  const [depositIdempotencyKey, setDepositIdempotencyKey] = useState(() => createDepositReceiptIdempotencyKey());
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadCount, setUploadCount] = useState(0);

  const load = async () => {
    if (!isOpen || !contractId) return;
    const version = ++versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const core = await ContractClient.get(contractId);
      const [v, d, allReceivables, dep, supplemental, categoryList, options] = await Promise.all([
        VehicleClient.get(core.vehicleId),
        DriverClient.get(core.driverId),
        FinanceObligationClient.listReceivables(),
        FinanceDepositClient.getByContract(core.id),
        bridge.load(companyId, core.id),
        TrafficTicketClient.categories(),
        FinanceSettlementClient.getOptions(),
      ]);
      if (version !== versionRef.current) return;
      const eligible = categoryList.filter((category) => category.type === 'INCOME' || category.type === 'BOTH');
      const remainingDeposit = Math.max(0, core.securityDepositAmount - (dep?.receivedAmount || 0));
      setContract(core);
      setVehicle(v);
      setDriver(d);
      setReceivables(allReceivables.filter((item) => item.contractId === core.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate)));
      setDeposit(dep);
      setTickets(supplemental.tickets);
      setHistory(supplemental.history);
      setIncomeCategories(eligible);
      setIncomeCategoryId((current) => eligible.some((category) => category.id === current) ? current : (eligible[0]?.id || ''));
      setSettlementOptions(options);
      setDepositAccountId((current) => options.accounts.some((item) => item.id === current) ? current : (options.accounts[0]?.id || ''));
      setDepositPaymentMethodId((current) => options.paymentMethods.some((item) => item.id === current) ? current : (options.paymentMethods[0]?.id || ''));
      setDepositAmount(remainingDeposit > 0 ? String(remainingDeposit) : '');
    } catch (caught) {
      if (version === versionRef.current) setError(caught instanceof Error ? caught.message : 'Erro ao carregar contrato.');
    } finally {
      if (version === versionRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setTab(initialFocus === 'FINANCIAL' ? 'FINANCIAL' : 'OVERVIEW');
    setContract(null); setVehicle(null); setDriver(null); setReceivables([]); setDeposit(null); setTickets([]); setHistory([]);
    setIncomeCategories([]); setIncomeCategoryId('');
    setSettlementOptions(EMPTY_SETTLEMENT_OPTIONS); setDepositAmount(''); setDepositAccountId(''); setDepositPaymentMethodId('');
    setDepositIdempotencyKey(createDepositReceiptIdempotencyKey());
    setError(null); setSuccess(null);
    if (isOpen && contractId) void load();
    return () => { versionRef.current += 1; };
  }, [isOpen, contractId, companyId, initialFocus]);

  const action = async (task: () => Promise<unknown>, message: string) => {
    setActionLoading(true); setError(null); setSuccess(null);
    try { await task(); setSuccess(message); await load(); onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha na operação do contrato.'); }
    finally { setActionLoading(false); }
  };

  const activate = () => {
    if (!contract) return;
    if (!incomeCategoryId) { setError('Selecione a categoria financeira de receita do aluguel.'); return; }
    void action(() => ContractClient.activate(contract.id, incomeCategoryId), 'Contrato ativado com vínculo e cobrança confirmados.');
  };
  const closeContract = () => {
    if (!contract || !confirm('Deseja encerrar este contrato e liberar o veículo?')) return;
    void action(() => ContractClient.close(contract.id, { reason: 'Encerrado manualmente no painel' }), 'Contrato encerrado e veículo liberado.');
  };
  const cancelContract = () => {
    if (!contract) return;
    const reason = prompt('Informe o motivo do cancelamento:');
    if (!reason?.trim()) return;
    void action(() => ContractClient.cancel(contract.id, reason), 'Contrato cancelado com histórico preservado.');
  };
  const bill = () => {
    if (!contract) return;
    if (!incomeCategoryId) { setError('Selecione a categoria financeira de receita do aluguel.'); return; }
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = prompt('Data de vencimento da nova competência (AAAA-MM-DD):', today);
    if (!dueDate) return;
    void action(() => ContractClient.bill(contract.id, dueDate, dueDate, incomeCategoryId), 'Faturamento processado com idempotência.');
  };
  const receiveDeposit = () => {
    if (!contract) return;
    const amount = Number(depositAmount);
    const remaining = Math.max(0, contract.securityDepositAmount - (deposit?.receivedAmount || 0));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
      setError(`Informe um valor de caução entre R$ 0,01 e ${formatCurrencyBRL(remaining)}.`);
      return;
    }
    if (!depositAccountId || !depositPaymentMethodId) {
      setError('Selecione a conta financeira e a forma de pagamento da caução.');
      return;
    }
    void action(async () => {
      await FinanceDepositClient.receive({ contractId: contract.id, amount, financialAccountId: depositAccountId, paymentMethodId: depositPaymentMethodId, idempotencyKey: depositIdempotencyKey });
      setDepositIdempotencyKey(createDepositReceiptIdempotencyKey());
    }, 'Caução recebida com sucesso.');
  };

  if (!contractId) return null;

  const today = new Date().toISOString().slice(0, 10);
  const totalBilled = receivables.reduce((sum, item) => sum + item.originalAmount, 0);
  const totalPaid = receivables.reduce((sum, item) => sum + item.paidAmount, 0);
  const pending = receivables.reduce((sum, item) => sum + item.balanceAmount, 0);
  const overdue = receivables.filter((item) => item.dueDate < today && item.balanceAmount > 0 && item.status !== ObligationStatus.CANCELLED).reduce((sum, item) => sum + item.balanceAmount, 0);
  const depositRemaining = contract ? Math.max(0, contract.securityDepositAmount - (deposit?.receivedAmount || 0)) : 0;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="6xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
        <div><div className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /><h2 className="font-mono text-lg font-bold">{contract?.contractNumber || 'Contrato'}</h2>{contract && <Badge variant={contract.status === ContractStatus.ACTIVE ? 'success' : contract.status === ContractStatus.CANCELLED ? 'danger' : contract.status === ContractStatus.CLOSED ? 'neutral' : 'warning'}>{contract.status}</Badge>}</div><p className="mt-1 text-xs text-slate-500">{driver?.fullName || ''}{vehicle ? ` • ${vehicle.plate} ${vehicle.brand} ${vehicle.model}` : ''}</p></div>
        <button onClick={onClose} className="text-slate-400"><X className="w-5 h-5" /></button>
      </div>

      {contract && <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <div className="mb-3 max-w-md">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Categoria financeira da receita de aluguel</label>
          <select value={incomeCategoryId} onChange={(event) => setIncomeCategoryId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
            <option value="">Selecione uma categoria INCOME/BOTH</option>
            {incomeCategories.map((category) => <option key={category.id} value={category.id}>{category.name} • {category.type}</option>)}
          </select>
          {incomeCategories.length === 0 && <p className="mt-1 text-[11px] text-rose-600">Nenhuma categoria de receita ativa disponível para este tenant.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status) && contract.signatureRequired === false && <Button size="sm" variant="primary" isLoading={actionLoading} disabled={!incomeCategoryId} onClick={() => void activate()}>Ativar legado</Button>}
          {contract.status === ContractStatus.ACTIVE && <Button size="sm" variant="secondary" isLoading={actionLoading} disabled={!incomeCategoryId} onClick={bill}>Faturar competência</Button>}
          {contract.status === ContractStatus.ACTIVE && <Button size="sm" variant="secondary" isLoading={actionLoading} onClick={closeContract}>Encerrar</Button>}
          {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status) && <Button size="sm" variant="ghost" isLoading={actionLoading} onClick={cancelContract}>Cancelar</Button>}
          {contract.status === ContractStatus.ACTIVE && depositRemaining > 0 && <Button size="sm" variant="ghost" onClick={() => setTab('DEPOSIT')}>Receber caução</Button>}
        </div>
      </div>}

      <div className="px-5 pt-3 space-y-2">
        {error && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="w-4 h-4" />{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 border-b border-slate-200 px-5 pb-3 text-xs font-semibold sm:grid-cols-3 lg:grid-cols-5 dark:border-slate-800">
        <TabButton active={tab === 'OVERVIEW'} onClick={() => setTab('OVERVIEW')} icon={<FileText className="w-4 h-4" />} label="Visão Geral" />
        <TabButton active={tab === 'FINANCIAL'} onClick={() => setTab('FINANCIAL')} icon={<DollarSign className="w-4 h-4" />} label={`Cobranças (${receivables.length})`} />
        <TabButton active={tab === 'DEPOSIT'} onClick={() => setTab('DEPOSIT')} icon={<ShieldCheck className="w-4 h-4" />} label="Caução" />
        <TabButton active={tab === 'TICKETS'} onClick={() => setTab('TICKETS')} icon={<AlertTriangle className="w-4 h-4" />} label={`Multas (${tickets.length})`} />
        <TabButton active={tab === 'AUDIT'} onClick={() => setTab('AUDIT')} icon={<History className="w-4 h-4" />} label={`Auditoria (${history.length})`} />
      </div>

      <div className="p-3">
        {loading ? <div className="p-12 text-center text-sm text-slate-400">Carregando detalhes...</div> : contract && <>
          {tab === 'OVERVIEW' && <div className="space-y-4">
            <ContractExecutionPanel contract={contract} incomeCategoryId={incomeCategoryId} focusOnOpen={initialFocus === 'PDF_SIGNATURE'} onChanged={async () => { await load(); onRefresh(); }} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Aluguel" value={formatCurrencyBRL(contract.rentalAmount)} /><Metric label="Faturado" value={formatCurrencyBRL(totalBilled)} /><Metric label="Pago" value={formatCurrencyBRL(totalPaid)} /><Metric label="Em aberto" value={formatCurrencyBRL(pending)} alert={overdue > 0} /></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card padding="sm"><h3 className="mb-2 flex items-center gap-2 font-bold"><Car className="w-4 h-4 text-emerald-600" />Veículo</h3>{vehicle ? <div className="space-y-1 text-xs text-slate-600"><p><b>{vehicle.brand} {vehicle.model}</b></p><p>Placa: {vehicle.plate}</p><p>Status: {vehicle.status}</p><p>KM atual: {vehicle.currentKm}</p></div> : <p className="text-xs text-slate-400">Não localizado.</p>}</Card>
              <Card padding="sm"><h3 className="mb-2 flex items-center gap-2 font-bold"><User className="w-4 h-4 text-emerald-600" />Motorista</h3>{driver ? <div className="space-y-1 text-xs text-slate-600"><p><b>{driver.fullName}</b></p><p>CPF: {driver.cpf}</p><p>CNH: {driver.cnhNumber} • {driver.cnhExpiration}</p><p>Status: {driver.status}</p></div> : <p className="text-xs text-slate-400">Não localizado.</p>}</Card>
            </div>
            <Card padding="sm"><h3 className="mb-2 flex items-center gap-2 font-bold"><Calendar className="w-4 h-4 text-emerald-600" />Condições</h3><div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><Info label="Início" value={contract.startDate} /><Info label="Término" value={contract.endDate || 'Indeterminado'} /><Info label="Franquia" value={`${contract.franchiseKm} km`} /><Info label="KM excedente" value={formatCurrencyBRL(contract.excessKmRate)} /></div>{contract.notes && <p className="mt-3 whitespace-pre-wrap border-t border-slate-100 pt-2 text-xs text-slate-500">{contract.notes}</p>}</Card>
          </div>}

          {tab === 'FINANCIAL' && <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold">Cobranças do contrato</h3>{contract.status === ContractStatus.ACTIVE && <Button size="sm" variant="primary" onClick={bill} isLoading={actionLoading} disabled={!incomeCategoryId}>Nova competência</Button>}</div>{receivables.length === 0 ? <Card padding="md"><p className="text-center text-xs text-slate-400">Nenhuma cobrança.</p></Card> : receivables.map((item) => <Card key={item.id} padding="sm"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><b className="text-xs">{item.description}</b><Badge variant={item.status === ObligationStatus.PAID ? 'success' : item.status === ObligationStatus.CANCELLED ? 'neutral' : 'warning'}>{item.status}</Badge></div><p className="mt-1 text-[11px] text-slate-500">Venc. {item.dueDate} • Original {formatCurrencyBRL(item.originalAmount)} • Pago {formatCurrencyBRL(item.paidAmount)} • Saldo {formatCurrencyBRL(item.balanceAmount)}</p></div>{item.status !== ObligationStatus.PAID && item.status !== ObligationStatus.CANCELLED && onOpenReceiptModal && <Button size="sm" variant="primary" onClick={() => onOpenReceiptModal(item.id)}><Receipt className="w-4 h-4" />Dar baixa</Button>}</div></Card>)}</div>}

          {tab === 'DEPOSIT' && <Card padding="md">
            <div className="grid gap-3 sm:grid-cols-3"><Metric label="Previsto" value={formatCurrencyBRL(contract.securityDepositAmount)} /><Metric label="Recebido" value={formatCurrencyBRL(deposit?.receivedAmount || 0)} /><Metric label="Saldo" value={formatCurrencyBRL(depositRemaining)} /></div>
            {depositRemaining > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-semibold text-slate-600">Valor a receber<input type="number" min="0.01" max={depositRemaining} step="0.01" value={depositAmount} onChange={(event) => { setDepositAmount(event.target.value); setDepositIdempotencyKey(createDepositReceiptIdempotencyKey()); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700" /></label>
              <label className="text-xs font-semibold text-slate-600">Conta financeira<select value={depositAccountId} onChange={(event) => { setDepositAccountId(event.target.value); setDepositIdempotencyKey(createDepositReceiptIdempotencyKey()); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"><option value="">Selecione...</option>{settlementOptions.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} • {item.type}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Forma de pagamento<select value={depositPaymentMethodId} onChange={(event) => { setDepositPaymentMethodId(event.target.value); setDepositIdempotencyKey(createDepositReceiptIdempotencyKey()); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"><option value="">Selecione...</option>{settlementOptions.paymentMethods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <div className="md:col-span-3 flex items-center justify-between gap-3">
                {(settlementOptions.accounts.length === 0 || settlementOptions.paymentMethods.length === 0) && <p className="text-[11px] text-rose-600">Cadastre uma conta financeira e uma forma de pagamento ativas antes de receber a caução.</p>}
                <Button size="sm" variant="primary" onClick={receiveDeposit} isLoading={actionLoading} disabled={!depositAccountId || !depositPaymentMethodId || !depositAmount}>Registrar recebimento</Button>
              </div>
            </div> : <p className="mt-4 text-xs font-semibold text-emerald-700">Caução prevista integralmente recebida.</p>}
          </Card>}

          {tab === 'TICKETS' && <div className="space-y-2">{tickets.length === 0 ? <Card padding="md"><p className="text-center text-xs text-slate-400">Nenhuma multa vinculada.</p></Card> : tickets.map((item) => <Card key={item.id} padding="sm"><div className="flex justify-between gap-3 text-xs"><div><b>Auto {item.autoNumber}</b><p className="mt-1 text-slate-500">{item.description}</p></div><span className="font-mono font-bold">{formatCurrencyBRL(item.originalAmount)}</span></div></Card>)}</div>}

          {tab === 'AUDIT' && <div className="space-y-2">{history.length === 0 ? <Card padding="md"><p className="text-center text-xs text-slate-400">Nenhum log suplementar encontrado.</p></Card> : history.map((item) => <Card key={item.id} padding="sm"><div className="text-xs"><b>{item.action}</b><p className="text-slate-500">{item.userName} • {new Date(item.timestamp).toLocaleString('pt-BR')}</p></div></Card>)}</div>}

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/30"><h4 className="mb-3 flex items-center gap-2 text-xs font-bold"><ShieldCheck className="w-4 h-4 text-emerald-600" />Arquivos e anexos do contrato</h4><FileUpload entityType="Contract" entityId={contract.id} documentType="CONTRACT_DOCUMENT" onUploadComplete={() => setUploadCount((value) => value + 1)} multiple={true} /><div className="mt-4" key={uploadCount}><AttachmentList entityType="Contract" entityId={contract.id} /></div></div>
        </>}
      </div>
    </ModalContainer>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => <button onClick={onClick} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 ${active ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500'}`}>{icon}{label}</button>;
const Metric: React.FC<{ label: string; value: string; alert?: boolean }> = ({ label, value, alert }) => <Card padding="sm"><span className="text-[10px] font-bold uppercase text-slate-400">{label}</span><p className={`mt-1 font-mono text-base font-black ${alert ? 'text-rose-600' : ''}`}>{value}</p></Card>;
const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => <div><span className="text-[10px] text-slate-400">{label}</span><p className="font-semibold">{value}</p></div>;