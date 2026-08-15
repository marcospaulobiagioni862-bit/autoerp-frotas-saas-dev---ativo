import React, { useEffect, useState } from 'react';
import {
  VehicleDocumentRepository,
  InsuranceRepository,
  TrackerRepository,
  VehicleRepository,
} from '../../persistence/repositories/localRepositories';
import { FleetComplianceService } from '../../domain/services/FleetComplianceService';
import { VehicleDocument, Insurance, Tracker, Vehicle } from '../../types/entities';
import { DocumentStatus } from '../../types/enums';
import {
  ShieldCheck,
  FileText,
  Radio,
  AlertTriangle,
  Plus,
  Car,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  DollarSign,
  Trash2,
} from 'lucide-react';
import { Card, Button, Badge, Input, Select, ModalContainer } from '../ui';
import { formatCurrencyBRL } from '../../shared/utils/currency';

export const FleetComplianceManagement: React.FC = () => {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeTab, setActiveTab] = useState<'documents' | 'insurances' | 'trackers'>('documents');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Modals
  const [isDocModalOpen, setIsDocModalOpen] = useState<boolean>(false);
  const [isInsModalOpen, setIsInsModalOpen] = useState<boolean>(false);
  const [isTrackerModalOpen, setIsTrackerModalOpen] = useState<boolean>(false);

  // Form states - Document
  const [docVehicleId, setDocVehicleId] = useState<string>('');
  const [docType, setDocType] = useState<string>('CRLV');
  const [docNumber, setDocNumber] = useState<string>('');
  const [docExpDate, setDocExpDate] = useState<string>('');
  const [docCost, setDocCost] = useState<string>('');
  const [docGeneratePayable, setDocGeneratePayable] = useState<boolean>(true);
  const [docNotes, setDocNotes] = useState<string>('');

  // Form states - Insurance
  const [insVehicleId, setInsVehicleId] = useState<string>('');
  const [insCompany, setInsCompany] = useState<string>('');
  const [insPolicy, setInsPolicy] = useState<string>('');
  const [insCoverage, setInsCoverage] = useState<string>('Cobertura Completa');
  const [insDeductible, setInsDeductible] = useState<string>('');
  const [insPremium, setInsPremium] = useState<string>('');
  const [insInstallments, setInsInstallments] = useState<string>('1');
  const [insStartDate, setInsStartDate] = useState<string>('');
  const [insEndDate, setInsEndDate] = useState<string>('');
  const [insBroker, setInsBroker] = useState<string>('');
  const [insGeneratePayable, setInsGeneratePayable] = useState<boolean>(true);

  // Form states - Tracker
  const [trkVehicleId, setTrkVehicleId] = useState<string>('');
  const [trkModel, setTrkModel] = useState<string>('Concox GT06');
  const [trkImei, setTrkImei] = useState<string>('');
  const [trkCarrier, setTrkCarrier] = useState<string>('Vivo M2M');
  const [trkChip, setTrkChip] = useState<string>('');
  const [trkCost, setTrkCost] = useState<string>('65');
  const [trkDate, setTrkDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const companyId = 'company-main-uuid';
  const userId = 'usr-admin';
  const userName = 'Gestor de Frota';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const docRepo = new VehicleDocumentRepository();
      const insRepo = new InsuranceRepository();
      const trkRepo = new TrackerRepository();
      const vehRepo = new VehicleRepository();

      const [docsList, insList, trkList, vehList] = await Promise.all([
        docRepo.findAll({ companyId }),
        insRepo.findAll({ companyId }),
        trkRepo.findAll({ companyId }),
        vehRepo.findAll({ companyId }),
      ]);

      setDocuments(docsList);
      setInsurances(insList);
      setTrackers(trkList);
      setVehicles(vehList.filter((v) => !v.isArchived));
    } catch (err) {
      console.error('Erro ao carregar dados de conformidade:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docVehicleId || !docExpDate) {
      alert('Selecione o veículo e a data de vencimento.');
      return;
    }
    try {
      await FleetComplianceService.createDocument({
        companyId,
        vehicleId: docVehicleId,
        documentType: docType,
        documentNumber: docNumber,
        expirationDate: docExpDate,
        cost: docCost ? parseFloat(docCost) : 0,
        notes: docNotes,
        generatePayable: docGeneratePayable,
        userId,
        userName,
      });
      setIsDocModalOpen(false);
      resetDocForm();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar documento.');
    }
  };

  const handleCreateInsurance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!insVehicleId || !insPolicy || !insEndDate) {
      alert('Preencha os campos obrigatórios da apólice.');
      return;
    }
    try {
      await FleetComplianceService.createInsurance({
        companyId,
        vehicleId: insVehicleId,
        insuranceCompany: insCompany,
        policyNumber: insPolicy,
        coverageDetails: insCoverage,
        deductibleAmount: insDeductible ? parseFloat(insDeductible) : 0,
        totalPremiumAmount: insPremium ? parseFloat(insPremium) : 0,
        installmentsCount: parseInt(insInstallments) || 1,
        startDate: insStartDate || new Date().toISOString().split('T')[0],
        endDate: insEndDate,
        brokerName: insBroker,
        generatePayable: insGeneratePayable,
        userId,
        userName,
      });
      setIsInsModalOpen(false);
      resetInsForm();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar seguro.');
    }
  };

  const handleCreateTracker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trkVehicleId || !trkImei) {
      alert('Preencha o veículo e o IMEI do rastreador.');
      return;
    }
    try {
      await FleetComplianceService.createTracker({
        companyId,
        vehicleId: trkVehicleId,
        equipmentModel: trkModel,
        imei: trkImei,
        chipCarrier: trkCarrier,
        chipNumber: trkChip,
        monthlyCost: trkCost ? parseFloat(trkCost) : 0,
        installationDate: trkDate,
        userId,
        userName,
      });
      setIsTrackerModalOpen(false);
      resetTrackerForm();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao cadastrar rastreador.');
    }
  };

  const resetDocForm = () => {
    setDocVehicleId('');
    setDocType('CRLV');
    setDocNumber('');
    setDocExpDate('');
    setDocCost('');
    setDocNotes('');
  };

  const resetInsForm = () => {
    setInsVehicleId('');
    setInsCompany('');
    setInsPolicy('');
    setInsDeductible('');
    setInsPremium('');
    setInsStartDate('');
    setInsEndDate('');
    setInsBroker('');
  };

  const resetTrackerForm = () => {
    setTrkVehicleId('');
    setTrkImei('');
    setTrkChip('');
  };

  // Metrics
  const validDocsCount = documents.filter((d) => d.status === DocumentStatus.VALID).length;
  const expiringDocsCount = documents.filter((d) => d.status === DocumentStatus.EXPIRING_SOON).length;
  const expiredDocsCount = documents.filter((d) => d.status === DocumentStatus.EXPIRED).length;
  const activeInsurancesCount = insurances.filter((i) => i.status !== DocumentStatus.EXPIRED).length;
  const activeTrackersCount = trackers.filter((t) => t.status === 'ACTIVE').length;

  const getVehiclePlate = (vehicleId: string) => {
    const v = vehicles.find((veh) => veh.id === vehicleId);
    return v ? `${v.plate} (${v.brand} ${v.model})` : vehicleId;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            Conformidade, Documentos, Seguros & Rastreamento
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão unificada de CRLV, IPVA, Licenciamento, Apólices de Seguro e Equipamentos Rastreadores GPS.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" size="sm" onClick={() => setIsDocModalOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Novo Documento
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsInsModalOpen(true)}>
            <ShieldCheck className="w-4 h-4 mr-1.5 text-emerald-600" /> Novo Seguro
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsTrackerModalOpen(true)}>
            <Radio className="w-4 h-4 mr-1.5 text-blue-600" /> Novo Rastreador
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <span className="text-xs text-slate-400 block">Documentos Válidos</span>
          <strong className="text-xl font-mono font-bold text-emerald-600">{validDocsCount}</strong>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl">
          <span className="text-xs text-amber-600 dark:text-amber-400 block font-semibold">Próx. Vencimento (&le;30d)</span>
          <strong className="text-xl font-mono font-bold text-amber-700 dark:text-amber-300">{expiringDocsCount}</strong>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-xl">
          <span className="text-xs text-rose-600 dark:text-rose-400 block font-semibold">Vencidos</span>
          <strong className="text-xl font-mono font-bold text-rose-700 dark:text-rose-300">{expiredDocsCount}</strong>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/50 rounded-xl">
          <span className="text-xs text-blue-600 dark:text-blue-400 block font-semibold">Seguros Ativos</span>
          <strong className="text-xl font-mono font-bold text-blue-700 dark:text-blue-300">{activeInsurancesCount}</strong>
        </div>

        <div className="p-3.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 rounded-xl">
          <span className="text-xs text-indigo-600 dark:text-indigo-400 block font-semibold">Rastreadores GPS</span>
          <strong className="text-xl font-mono font-bold text-indigo-700 dark:text-indigo-300">{activeTrackersCount}</strong>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'documents'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Documentos e IPVA ({documents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('insurances')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'insurances'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Apólices de Seguros ({insurances.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('trackers')}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
            activeTab === 'trackers'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Rastreadores GPS ({trackers.length})</span>
        </button>
      </div>

      {/* Content Area */}
      <Card padding="md">
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Documentação Veicular (CRLV, IPVA, Licenciamento e Vistorias)
            </h3>
            {documents.length === 0 ? (
              <p className="text-slate-500 py-8 text-center text-xs">Nenhum documento cadastrado na frota.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">Veículo (Placa)</th>
                      <th className="p-3 font-semibold">Tipo</th>
                      <th className="p-3 font-semibold">Nº do Documento</th>
                      <th className="p-3 font-semibold">Vencimento</th>
                      <th className="p-3 font-semibold">Custo</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {getVehiclePlate(doc.vehicleId)}
                        </td>
                        <td className="p-3 font-semibold">{doc.documentType}</td>
                        <td className="p-3 font-mono text-slate-500">{doc.documentNumber || '-'}</td>
                        <td className="p-3 font-mono">{new Date(doc.expirationDate).toLocaleDateString('pt-BR')}</td>
                        <td className="p-3 font-mono text-emerald-600 font-semibold">{formatCurrencyBRL(doc.cost || 0)}</td>
                        <td className="p-3">
                          <Badge
                            variant={
                              doc.status === DocumentStatus.VALID
                                ? 'success'
                                : doc.status === DocumentStatus.EXPIRING_SOON
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {doc.status === DocumentStatus.VALID
                              ? 'Válido'
                              : doc.status === DocumentStatus.EXPIRING_SOON
                              ? 'A Vencer'
                              : 'Vencido'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={async () => {
                              if (confirm('Deseja excluir este documento?')) {
                                await FleetComplianceService.deleteDocument(doc.id, userId, userName);
                                await loadData();
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'insurances' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Apólices de Seguro Vigentes e Históricas
            </h3>
            {insurances.length === 0 ? (
              <p className="text-slate-500 py-8 text-center text-xs">Nenhuma apólice de seguro cadastrada.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insurances.map((ins) => (
                  <div
                    key={ins.id}
                    className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 bg-white dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {ins.insuranceCompany}
                      </span>
                      <Badge variant="success">Apólice #{ins.policyNumber}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">Veículo: {getVehiclePlate(ins.vehicleId)}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-slate-400 block">Prêmio Total</span>
                        <strong className="font-mono text-emerald-600">{formatCurrencyBRL(ins.totalPremiumAmount)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Franquia</span>
                        <strong className="font-mono">{formatCurrencyBRL(ins.deductibleAmount)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Início Vigência</span>
                        <span className="font-mono">{new Date(ins.startDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Término Vigência</span>
                        <span className="font-mono">{new Date(ins.endDate).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'trackers' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Rastreadores GPS Instalados na Frota
            </h3>
            {trackers.length === 0 ? (
              <p className="text-slate-500 py-8 text-center text-xs">Nenhum rastreador cadastrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3 font-semibold">Veículo (Placa)</th>
                      <th className="p-3 font-semibold">Equipamento / Modelo</th>
                      <th className="p-3 font-semibold">IMEI</th>
                      <th className="p-3 font-semibold">Chip / Operadora</th>
                      <th className="p-3 font-semibold">Mensalidade</th>
                      <th className="p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {trackers.map((tr) => (
                      <tr key={tr.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                          {getVehiclePlate(tr.vehicleId)}
                        </td>
                        <td className="p-3 font-semibold">{tr.equipmentModel}</td>
                        <td className="p-3 font-mono text-slate-500">{tr.imei}</td>
                        <td className="p-3">
                          {tr.chipCarrier} ({tr.chipNumber})
                        </td>
                        <td className="p-3 font-mono text-emerald-600 font-semibold">{formatCurrencyBRL(tr.monthlyCost)}</td>
                        <td className="p-3">
                          <Badge variant={tr.status === 'ACTIVE' ? 'success' : 'secondary'}>
                            {tr.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modal: Novo Documento */}
      <ModalContainer
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        title="Cadastrar Novo Documento / IPVA"
        subtitle="Adicione CRLV, IPVA, Licenciamento ou Vistoria vinculados ao veículo."
      >
        <form onSubmit={handleCreateDocument} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Veículo *</label>
            <select
              value={docVehicleId}
              onChange={(e) => setDocVehicleId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              required
            >
              <option value="">Selecione o veículo...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} - {v.brand} {v.model}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tipo de Documento *</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="CRLV">CRLV (Licenciamento Anual)</option>
                <option value="IPVA">IPVA</option>
                <option value="SEGURO OBRIGATÓRIO">Seguro Obrigatório / DPVAT</option>
                <option value="VISTORIA">Vistoria Veicular</option>
                <option value="LAUDO">Laudo CNV / GNV</option>
                <option value="OUTROS">Outros</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Nº do Documento</label>
              <Input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="Ex: 0098273645"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Data de Vencimento *</label>
              <Input
                type="date"
                value={docExpDate}
                onChange={(e) => setDocExpDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Custo / Valor (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={docCost}
                onChange={(e) => setDocCost(e.target.value)}
                placeholder="150.00"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="genPayableDoc"
              checked={docGeneratePayable}
              onChange={(e) => setDocGeneratePayable(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="genPayableDoc" className="text-slate-700 dark:text-slate-300 font-medium">
              Gerar automaticamente Conta a Pagar (Obrigação Financeira)
            </label>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Observações</label>
            <textarea
              value={docNotes}
              onChange={(e) => setDocNotes(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setIsDocModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit">
              Salvar Documento
            </Button>
          </div>
        </form>
      </ModalContainer>

      {/* Modal: Novo Seguro */}
      <ModalContainer
        isOpen={isInsModalOpen}
        onClose={() => setIsInsModalOpen(false)}
        title="Cadastrar Apólice de Seguro"
        subtitle="Registre seguradora, apólice, vigência e franquia."
      >
        <form onSubmit={handleCreateInsurance} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Veículo *</label>
            <select
              value={insVehicleId}
              onChange={(e) => setInsVehicleId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              required
            >
              <option value="">Selecione o veículo...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} - {v.brand} {v.model}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Seguradora *</label>
              <Input
                value={insCompany}
                onChange={(e) => setInsCompany(e.target.value)}
                placeholder="Ex: Porto Seguro"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Nº da Apólice *</label>
              <Input
                value={insPolicy}
                onChange={(e) => setInsPolicy(e.target.value)}
                placeholder="Ex: 9988776655"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Prêmio Total (R$) *</label>
              <Input
                type="number"
                step="0.01"
                value={insPremium}
                onChange={(e) => setInsPremium(e.target.value)}
                placeholder="4200.00"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Franquia (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={insDeductible}
                onChange={(e) => setInsDeductible(e.target.value)}
                placeholder="3500.00"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Parcelas</label>
              <Input
                type="number"
                value={insInstallments}
                onChange={(e) => setInsInstallments(e.target.value)}
                min="1"
                max="12"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Início da Vigência *</label>
              <Input
                type="date"
                value={insStartDate}
                onChange={(e) => setInsStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Fim da Vigência *</label>
              <Input
                type="date"
                value={insEndDate}
                onChange={(e) => setInsEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Corretor / Contato</label>
            <Input
              value={insBroker}
              onChange={(e) => setInsBroker(e.target.value)}
              placeholder="Nome do Corretor / Telefone"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="genPayableIns"
              checked={insGeneratePayable}
              onChange={(e) => setInsGeneratePayable(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="genPayableIns" className="text-slate-700 dark:text-slate-300 font-medium">
              Gerar automaticamente Conta a Pagar (Parcelada)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setIsInsModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit">
              Salvar Apólice
            </Button>
          </div>
        </form>
      </ModalContainer>

      {/* Modal: Novo Rastreador */}
      <ModalContainer
        isOpen={isTrackerModalOpen}
        onClose={() => setIsTrackerModalOpen(false)}
        title="Vincular Rastreador GPS"
        subtitle="Instale um novo dispositivo GPS no veículo."
      >
        <form onSubmit={handleCreateTracker} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Veículo *</label>
            <select
              value={trkVehicleId}
              onChange={(e) => setTrkVehicleId(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              required
            >
              <option value="">Selecione o veículo...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} - {v.brand} {v.model}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Modelo / Fabricante</label>
              <Input
                value={trkModel}
                onChange={(e) => setTrkModel(e.target.value)}
                placeholder="Ex: Concox GT06"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">IMEI do Dispositivo *</label>
              <Input
                value={trkImei}
                onChange={(e) => setTrkImei(e.target.value)}
                placeholder="15 dígitos do IMEI"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Operadora M2M / Chip</label>
              <Input
                value={trkCarrier}
                onChange={(e) => setTrkCarrier(e.target.value)}
                placeholder="Ex: Vivo M2M"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Número do Chip</label>
              <Input
                value={trkChip}
                onChange={(e) => setTrkChip(e.target.value)}
                placeholder="11988887777"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Mensalidade (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={trkCost}
                onChange={(e) => setTrkCost(e.target.value)}
                placeholder="65.00"
              />
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Data de Instalação</label>
              <Input
                type="date"
                value={trkDate}
                onChange={(e) => setTrkDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setIsTrackerModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit">
              Instalar Rastreador
            </Button>
          </div>
        </form>
      </ModalContainer>
    </div>
  );
};
