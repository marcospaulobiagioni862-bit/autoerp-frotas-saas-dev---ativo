import React from 'react';
import { motion } from 'motion/react';
import {
  ShieldAlert,
  Locate,
  Activity,
  Wifi,
  Clock,
  Shield,
  FileCheck,
  AlertTriangle,
  WifiOff,
  CheckCircle2,
  Calendar,
  Layers,
  Zap
} from 'lucide-react';
import { Veiculo, Rastreador, Apolice, Seguradora } from '../types';

interface SegurancaStatusViewProps {
  veiculos: Veiculo[];
  rastreadores: Rastreador[];
  apolices: Apolice[];
  seguradoras: Seguradora[];
}

export default function SegurancaStatusView({
  veiculos,
  rastreadores,
  apolices,
  seguradoras
}: SegurancaStatusViewProps) {
  
  // Calculate days until expiration
  const getDaysRemaining = (vencimentoDateStr: string) => {
    if (!vencimentoDateStr) return -999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(vencimentoDateStr);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get countdown label
  const renderInsuranceBadge = (daysRemaining: number) => {
    if (daysRemaining === -999) {
      return (
        <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Sem Apólice
        </span>
      );
    }
    if (daysRemaining < 0) {
      return (
        <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" /> VENCIDO ({Math.abs(daysRemaining)}d atrás)
        </span>
      );
    }
    if (daysRemaining <= 30) {
      return (
        <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> Vence em {daysRemaining} dias
        </span>
      );
    }
    return (
      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Ativo ({daysRemaining} dias restantes)
      </span>
    );
  };

  // Tracker status metrics
  const trackedCount = veiculos.filter(v => rastreadores.some(r => r.veiculoPlaca === v.placa && r.status === 'Ativo')).length;
  const untrackedCount = veiculos.length - trackedCount;
  
  // Insurance status metrics
  const insuredCount = veiculos.filter(v => {
    const ap = apolices.find(a => a.veiculoPlaca === v.placa);
    return ap && getDaysRemaining(ap.vencimento) >= 0;
  }).length;
  const expiredInsuredCount = veiculos.filter(v => {
    const ap = apolices.find(a => a.veiculoPlaca === v.placa);
    return ap && getDaysRemaining(ap.vencimento) < 0;
  }).length;
  const uninsuredCount = veiculos.length - insuredCount - expiredInsuredCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Overview Bento widgets */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Locate className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Com Rastreador</span>
            <span className="text-xl font-black text-slate-800">{trackedCount} <span className="text-xs text-slate-400 font-bold">de {veiculos.length}</span></span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <WifiOff className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Sem Monitoramento</span>
            <span className="text-xl font-black text-rose-600">{untrackedCount} <span className="text-xs text-slate-400 font-bold">carros</span></span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Seguro Ativo</span>
            <span className="text-xl font-black text-emerald-700">{insuredCount} <span className="text-xs text-slate-400 font-bold">de {veiculos.length}</span></span>
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Alerta de Renovação</span>
            <span className="text-xl font-black text-amber-600">{expiredInsuredCount + uninsuredCount} <span className="text-xs text-slate-400 font-bold">vencidos/sem</span></span>
          </div>
        </div>
      </div>

      {/* Main List Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-blue-600" /> Relatório de Segurança da Frota
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Veículo / Placa</th>
                <th className="px-5 py-3.5">Status Rastreador</th>
                <th className="px-5 py-3.5">Detalhes Telemetria</th>
                <th className="px-5 py-3.5">Status Seguro</th>
                <th className="px-5 py-3.5">Vencimento Seguro</th>
                <th className="px-5 py-3.5">Seguradora / Apólice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {veiculos.map(v => {
                const track = rastreadores.find(r => r.veiculoPlaca === v.placa);
                const apolice = apolices.find(a => a.veiculoPlaca === v.placa);
                const seguradora = apolice ? seguradoras.find(s => s.id === apolice.seguradoraId) : null;
                const daysRemaining = apolice ? getDaysRemaining(apolice.vencimento) : -999;

                return (
                  <tr key={v.placa} className="hover:bg-slate-50/60 transition-colors">
                    {/* Vehicle */}
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900">{v.modelo}</div>
                      <span className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-mono font-bold tracking-widest text-slate-600">
                        {v.placa}
                      </span>
                    </td>

                    {/* Tracker Status */}
                    <td className="px-5 py-3.5">
                      {track && track.status === 'Ativo' ? (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                          <Wifi className="w-3.5 h-3.5 text-blue-500" /> Monitorado
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                          <WifiOff className="w-3.5 h-3.5" /> Sem Rastreador
                        </span>
                      )}
                    </td>

                    {/* Telemetry details */}
                    <td className="px-5 py-3.5 text-xs">
                      {track ? (
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-700">{track.marca} {track.modelo}</div>
                          <div className="text-[10px] text-slate-400 font-mono">IMEI: {track.imei}</div>
                          <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-500" /> Chip: <b>{track.operadora}</b>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium italic">Nenhum equipamento vinculado</span>
                      )}
                    </td>

                    {/* Insurance Status */}
                    <td className="px-5 py-3.5">
                      {renderInsuranceBadge(daysRemaining)}
                    </td>

                    {/* Expiration date */}
                    <td className="px-5 py-3.5">
                      {apolice ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(apolice.vencimento).toLocaleDateString('pt-BR')}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium italic">—</span>
                      )}
                    </td>

                    {/* Insurer / Policy */}
                    <td className="px-5 py-3.5 text-xs">
                      {apolice ? (
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">{seguradora ? seguradora.nome : 'Seguradora Vinculada'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Apólice: {apolice.numero}</div>
                          <div className="text-[10px] text-slate-400">Cobertura: {apolice.cobertura}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium italic">Veículo sem apólice cadastrada</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
