import React, { useEffect, useState } from 'react';
import { AttachmentList } from '../documents/AttachmentList';
import { FileUpload } from '../documents/FileUpload';
import { VehicleClient } from '../../api/vehicleClient';
import { VehicleLegacyDetailsBridge, VehicleDetailedSummary } from '../../domain/services/VehicleLegacyDetailsBridge';
import { ModalContainer } from '../ui/ModalContainer';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import {
  Car,
  User,
  FileText,
  Wrench,
  AlertTriangle,
  ShieldCheck,
  Radio,
  Gauge,
  TrendingUp,
  DollarSign,
  Calendar,
  Layers,
  Edit,
} from 'lucide-react';
import { formatCurrencyBRL } from '../../shared/utils/currency';

interface VehicleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string | null;
  onEditRequest?: () => void;
  onRecordKmRequest?: () => void;
}

export const VehicleDetailsModal: React.FC<VehicleDetailsModalProps> = ({
  isOpen,
  onClose,
  vehicleId,
  onEditRequest,
  onRecordKmRequest,
}) => {
  const [summary, setSummary] = useState<VehicleDetailedSummary | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'driver' | 'km' | 'maintenance' | 'tickets' | 'documents' | 'financial'
  >('overview');

  useEffect(() => {
    if (isOpen && vehicleId) {
      loadData();
    }
  }, [isOpen, vehicleId]);

  const loadData = async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const [vehicle, kmRecords] = await Promise.all([
        VehicleClient.get(vehicleId),
        VehicleClient.listKm(vehicleId),
      ]);
      const bridge = new VehicleLegacyDetailsBridge();
      const data = await bridge.compose(vehicle, kmRecords);
      setSummary(data);
    } catch (err) {
      console.error('Erro ao carregar detalhes do veículo:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !vehicleId) return null;

  const vehicle = summary?.vehicle;

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title={vehicle ? `Ficha Completa — ${vehicle.plate} (${vehicle.brand} ${vehicle.model})` : 'Detalhes do Veículo'}
      subtitle="Dados cadastrais, histórico operacional, vínculos e resultado financeiro por veículo."
      maxWidth="4xl"
    >
      {loading || !summary || !vehicle ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header Action Bar & Status Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="font-mono text-base font-black px-3 py-1 bg-slate-900 text-white rounded-md tracking-widest shadow-2xs">
                {vehicle.plate}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {vehicle.brand} {vehicle.model} {vehicle.version || ''}
                </h3>
                <p className="text-xs text-slate-500">
                  RENAVAM: <span className="font-mono">{vehicle.renavam}</span> • Chassi: <span className="font-mono">{vehicle.chassis}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant={
                  vehicle.status === 'RENTED'
                    ? 'success'
                    : vehicle.status === 'MAINTENANCE'
                    ? 'warning'
                    : 'info'
                }
              >
                {vehicle.status === 'RENTED'
                  ? 'Locado'
                  : vehicle.status === 'MAINTENANCE'
                  ? 'Em Manutenção'
                  : vehicle.status === 'AVAILABLE'
                  ? 'Disponível'
                  : vehicle.status === 'INACTIVE'
                  ? 'Inativo'
                  : 'Vendido'}
              </Badge>

              {onEditRequest && (
                <Button variant="outline" size="sm" onClick={onEditRequest}>
                  <Edit className="w-3.5 h-3.5 mr-1" /> Editar
                </Button>
              )}

              {onRecordKmRequest && (
                <Button variant="primary" size="sm" onClick={onRecordKmRequest}>
                  <Gauge className="w-3.5 h-3.5 mr-1" /> Registrar KM
                </Button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-2">
            {[
              { id: 'overview', label: 'Visão Geral', icon: Car },
              { id: 'driver', label: 'Motorista & Contrato', icon: User },
              { id: 'km', label: 'Odômetro', icon: Gauge, count: summary.kmRecords.length },
              { id: 'maintenance', label: 'Manutenções', icon: Wrench, count: summary.maintenances.length },
              { id: 'tickets', label: 'Multas', icon: AlertTriangle, count: summary.trafficTickets.length },
              { id: 'documents', label: 'Documentos & Seguros', icon: ShieldCheck },
              { id: 'financial', label: 'DRE / Rentabilidade', icon: TrendingUp },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        isActive ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block mb-1">Odômetro Atual</span>
                  <strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100">
                    {vehicle.currentKm.toLocaleString('pt-BR')} KM
                  </strong>
                  {vehicle.nextMaintenanceKm && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Próx. Revisão: <span className="font-mono">{vehicle.nextMaintenanceKm.toLocaleString('pt-BR')} KM</span>
                    </p>
                  )}
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block mb-1">Valor do Aluguel Base (Semanal)</span>
                  <strong className="text-lg font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrencyBRL(vehicle.rentalValueBase)} / sem
                  </strong>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Diária proporcional: <span className="font-mono">{formatCurrencyBRL(vehicle.rentalValueBase / 7)}</span>
                  </p>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block mb-1">Valor de Mercado / Aquisição</span>
                  <strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrencyBRL(vehicle.currentValue)}
                  </strong>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Aquisição: <span className="font-mono">{formatCurrencyBRL(vehicle.acquisitionValue)}</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 border-b pb-2 border-slate-100 dark:border-slate-800">
                    Dados Técnicos
                  </h4>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                    <span className="text-slate-500">Ano Fabricação / Modelo:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{vehicle.yearFabrication} / {vehicle.yearModel}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                    <span className="text-slate-500">Cor:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{vehicle.color}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                    <span className="text-slate-500">Combustível:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{vehicle.fuelType}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Categoria:</span>
                    <strong className="text-slate-800 dark:text-slate-200">{vehicle.category}</strong>
                  </div>
                </div>

                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 text-xs">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 border-b pb-2 border-slate-100 dark:border-slate-800">
                    Documentação & Identificadores
                  </h4>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                    <span className="text-slate-500">RENAVAM:</span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">{vehicle.renavam}</strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/50">
                    <span className="text-slate-500">Chassi:</span>
                    <strong className="font-mono text-slate-800 dark:text-slate-200">{vehicle.chassis}</strong>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Data de Cadastro:</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {new Date(vehicle.createdAt).toLocaleDateString('pt-BR')}
                    </strong>
                  </div>
                </div>
              </div>

              {vehicle.notes && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                  <strong className="block mb-0.5">Anotações do Veículo:</strong>
                  <p className="whitespace-pre-line">{vehicle.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DRIVER & CONTRACT */}
          {activeTab === 'driver' && (
            <div className="space-y-4 text-xs">
              {summary.driver ? (
                <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-600" />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Motorista Atual Vinculado
                      </h4>
                    </div>
                    <Badge variant="success">Ativo no Veículo</Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <span className="text-slate-400 block">Nome Completo</span>
                      <strong className="text-slate-900 dark:text-slate-100">{summary.driver.name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">CPF</span>
                      <strong className="font-mono text-slate-900 dark:text-slate-100">{summary.driver.cpf}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">CNH</span>
                      <strong className="font-mono text-slate-900 dark:text-slate-100">
                        {summary.driver.cnhNumber} (Cat. {summary.driver.cnhCategory})
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-slate-500">
                  <User className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                  <p className="font-medium">Nenhum motorista vinculado atualmente a este veículo.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">O veículo está disponível ou em manutenção.</p>
                </div>
              )}

              {/* Active Contract */}
              {summary.activeContract && (
                <div className="p-4 border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-blue-950/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-600" />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Contrato de Locação Vigente
                      </h4>
                    </div>
                    <Badge variant="info">Contrato #{summary.activeContract.contractNumber}</Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div>
                      <span className="text-slate-400 block">Início da Locação</span>
                      <strong>{new Date(summary.activeContract.startDate).toLocaleDateString('pt-BR')}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Valor Semanal</span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrencyBRL(summary.activeContract.recurringValue)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Valor Caução</span>
                      <strong className="font-mono">{formatCurrencyBRL(summary.activeContract.securityDepositValue)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Status Contratual</span>
                      <span className="font-bold text-blue-600">{summary.activeContract.status}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: KM RECORDS */}
          {activeTab === 'km' && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 dark:text-slate-100">
                  Histórico de Leituras de Odômetro
                </h4>
                {onRecordKmRequest && (
                  <Button variant="outline" size="sm" onClick={onRecordKmRequest}>
                    + Nova Leitura KM
                  </Button>
                )}
              </div>

              {summary.kmRecords.length === 0 ? (
                <p className="text-slate-500 py-4 text-center border rounded-xl">
                  Nenhum registro prévio de odômetro além do cadastro.
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-2.5 font-semibold">Data</th>
                        <th className="p-2.5 font-semibold">Leitura (KM)</th>
                        <th className="p-2.5 font-semibold">Tipo</th>
                        <th className="p-2.5 font-semibold">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {summary.kmRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="p-2.5 font-mono">{new Date(rec.recordDate).toLocaleDateString('pt-BR')}</td>
                          <td className="p-2.5 font-mono font-bold">{rec.kmValue.toLocaleString('pt-BR')} KM</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                              {rec.readingType}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-500">{rec.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MAINTENANCE */}
          {activeTab === 'maintenance' && (
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 dark:text-slate-100">
                Histórico de Manutenções e Ordens de Serviço
              </h4>

              {summary.maintenances.length === 0 ? (
                <p className="text-slate-500 py-6 text-center border rounded-xl">
                  Nenhuma manutenção registrada para este veículo.
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.maintenances.map((m: any) => (
                    <div
                      key={m.id}
                      className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between bg-white dark:bg-slate-900"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-900 dark:text-slate-100">{m.type}</strong>
                          <Badge variant={m.status === 'COMPLETED' ? 'success' : 'warning'}>
                            {m.status}
                          </Badge>
                        </div>
                        <p className="text-slate-500 mt-1">{m.description}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          KM: {m.kmAtMaintenance?.toLocaleString('pt-BR')} KM • Data: {new Date(m.startDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>

                      <div className="text-right">
                        <strong className="font-mono text-sm text-slate-900 dark:text-slate-100 block">
                          {formatCurrencyBRL(m.totalCost)}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: TRAFFIC TICKETS */}
          {activeTab === 'tickets' && (
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-slate-900 dark:text-slate-100">
                Multas de Trânsito Vinculadas à Placa
              </h4>

              {summary.trafficTickets.length === 0 ? (
                <p className="text-slate-500 py-6 text-center border rounded-xl">
                  Nenhuma multa registrada para este veículo.
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.trafficTickets.map((t: any) => (
                    <div
                      key={t.id}
                      className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="font-mono text-slate-900 dark:text-slate-100">{t.noticeNumber}</strong>
                          <Badge variant={t.responsibility === 'DRIVER' ? 'info' : 'warning'}>
                            Resp: {t.responsibility === 'DRIVER' ? 'Motorista' : 'Empresa'}
                          </Badge>
                        </div>
                        <p className="text-slate-500 mt-0.5">{t.description}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Data: {new Date(t.ticketDate).toLocaleDateString('pt-BR')} • Vencimento: {new Date(t.dueDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>

                      <div className="text-right">
                        <strong className="font-mono text-sm text-red-600 dark:text-red-400 block">
                          {formatCurrencyBRL(t.amount)}
                        </strong>
                        <span className="text-[10px] text-slate-400">{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: DOCUMENTS & INSURANCE */}
          {activeTab === 'documents' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="col-span-1 md:col-span-2 p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Arquivos e Anexos (CRLV, IPVA, Vistorias)
                </h4>
                <FileUpload 
                  entityType="Vehicle"
                  entityId={vehicle.id}
                  documentType="VEHICLE_DOCUMENT"
                  onUploadComplete={() => { setUploadCount(prev => prev + 1); 
                    // Trigger a re-render or reload of attachments by forcing key change or similar
                    // In a simpler way, we can just let the AttachmentList refresh via a key
                  }}
                  multiple={true}
                />
                <div className="mt-4">
                  <div key={uploadCount}><AttachmentList entityType="Vehicle" entityId={vehicle.id} /></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mt-4">
              <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Seguros de Veículo
                </h4>
                {summary.insurances.length === 0 ? (
                  <p className="text-slate-500 text-[11px]">Nenhum seguro cadastrado.</p>
                ) : (
                  summary.insurances.map((ins: any) => (
                    <div key={ins.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>{ins.insurerName}</span>
                        <span className="font-mono text-emerald-600">{formatCurrencyBRL(ins.premiumAmount)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500">Apólice: {ins.policyNumber}</p>
                      <p className="text-[10px] text-slate-400">
                        Vigência: {new Date(ins.startDate).toLocaleDateString('pt-BR')} até {new Date(ins.endDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-blue-600" />
                  Rastreador GPS
                </h4>
                {summary.trackers.length === 0 ? (
                  <p className="text-slate-500 text-[11px]">Nenhum rastreador vinculado.</p>
                ) : (
                  summary.trackers.map((tr: any) => (
                    <div key={tr.id} className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-lg space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>{tr.providerName}</span>
                        <Badge variant="info">{tr.status}</Badge>
                      </div>
                      <p className="text-[11px] font-mono text-slate-500">IMEI: {tr.imei}</p>
                      <p className="text-[10px] text-slate-400">
                        Mensalidade: {formatCurrencyBRL(tr.monthlyFee)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
            </div>
          )}

          {/* TAB 7: FINANCIAL & PROFITABILITY */}
          {activeTab === 'financial' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl">
                  <span className="text-slate-500 dark:text-slate-400 text-xs block">Receita Total Recebida</span>
                  <strong className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrencyBRL(summary.financialSummary.totalRevenue)}
                  </strong>
                </div>

                <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl">
                  <span className="text-slate-500 dark:text-slate-400 text-xs block">Despesas Pagas do Veículo</span>
                  <strong className="text-xl font-mono font-bold text-rose-700 dark:text-rose-400">
                    {formatCurrencyBRL(summary.financialSummary.totalExpenses)}
                  </strong>
                </div>

                <div className="p-3.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-xl">
                  <span className="text-slate-500 dark:text-slate-400 text-xs block">Resultado Líquido / Margem</span>
                  <strong className="text-xl font-mono font-bold text-blue-700 dark:text-blue-400 block">
                    {formatCurrencyBRL(summary.financialSummary.netProfit)}
                  </strong>
                  <span className="text-[11px] text-blue-600 font-semibold">
                    Margem: {summary.financialSummary.profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/30 dark:bg-slate-800/20">
                <p className="text-slate-500 text-[11px]">
                  * A rentabilidade individual do veículo consolida receitas de locações (AccountReceivable baixados)
                  subtraídas das despesas diretas de manutenção, seguro, IPVA e rastreador vinculadas ao vehicleId.
                </p>
              </div>
            </div>
          )}

          {/* Close button */}
          <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={onClose}>
              Fechar Visualização
            </Button>
          </div>
        </div>
      )}
    </ModalContainer>
  );
};
