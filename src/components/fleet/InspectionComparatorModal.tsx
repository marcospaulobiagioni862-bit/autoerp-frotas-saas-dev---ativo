import React, { useState } from 'react';
import type { InspectionComparisonPair, InspectionPhotoSlotKey } from '../../api/vehicleInspectionClient';
import { InspectionCarDamageDiagram } from './InspectionCarDamageDiagram';
import { X, ArrowRightLeft, Fuel, Gauge, AlertTriangle, ShieldCheck, Share2, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface InspectionComparatorModalProps {
  comparison: InspectionComparisonPair;
  onClose: () => void;
  onSettle?: () => void;
}

const PHOTO_SLOTS: Array<{ key: InspectionPhotoSlotKey; label: string }> = [
  { key: 'DASHBOARD', label: 'Painel & Odômetro' },
  { key: 'FRONT', label: 'Frente' },
  { key: 'REAR', label: 'Traseira' },
  { key: 'RIGHT', label: 'Lateral Direita' },
  { key: 'LEFT', label: 'Lateral Esquerda' },
  { key: 'SPARE_TIRE', label: 'Estepe & Ferramentas' },
];

export function InspectionComparatorModal({
  comparison,
  onClose,
  onSettle,
}: InspectionComparatorModalProps) {
  const [activeSlot, setActiveSlot] = useState<InspectionPhotoSlotKey>('FRONT');
  const [viewTab, setViewTab] = useState<'photos' | 'damages' | 'settlement'>('photos');

  const {
    vehicle,
    driver,
    exitInspection,
    entryInspection,
    deltaKm,
    excessKm,
    excessKmRate,
    excessKmCost,
    deltaFuel,
    fuelCost,
    preExistingDamages,
    newDamages,
    photoPairs,
    settlement,
  } = comparison;

  const currentPair = photoPairs.find((p) => p.slot === activeSlot);

  const totalDeviations = (excessKmCost || 0) + (fuelCost || 0) + (settlement?.damagesCost || 0) + (settlement?.washCost || 0);

  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(
      `*AutoERP - Laudo Comparativo de Vistoria*\n` +
      `Veículo: ${vehicle.brand} ${vehicle.model} (${vehicle.plate})\n` +
      `Condutor: ${driver.name}\n` +
      `KM Entrega: ${exitInspection?.odometer || 0} | KM Devolução: ${entryInspection?.odometer || 0} (Delta: ${deltaKm} km)\n` +
      (excessKm > 0 ? `KM Excedente: ${excessKm} km (R$ ${excessKmCost.toFixed(2)})\n` : '') +
      `Combustível Entrega: ${exitInspection?.fuelLevel || 0}% | Devolução: ${entryInspection?.fuelLevel || 0}%\n` +
      (fuelCost > 0 ? `Combustível Faltante: R$ ${fuelCost.toFixed(2)}\n` : '') +
      `Novas Avarias Identificadas: ${newDamages.length}\n` +
      `Total de Desvios: R$ ${totalDeviations.toFixed(2)}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-3 backdrop-blur-sm sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-violet-100 p-1.5 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400">
                <ArrowRightLeft className="w-5 h-5" />
              </span>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Comparador Lado a Lado: Entrega vs Devolução
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {vehicle.plate} • {vehicle.brand} {vehicle.model} | Condutor: {driver.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shareViaWhatsApp}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              <Share2 className="w-3.5 h-3.5" /> Compartilhar no WhatsApp
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Deltas Operacionais Rápidos */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/70 p-3 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/40 text-xs">
          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-blue-500" /> Odômetro</span>
              <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">+{deltaKm} km</span>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px]">
              <span>Saída: {exitInspection?.odometer || 0}</span>
              <span>Entrada: {entryInspection?.odometer || 0}</span>
            </div>
            {excessKm > 0 && (
              <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400 text-[10px]">
                Excedente: {excessKm} km (R$ {excessKmCost.toFixed(2)})
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1"><Fuel className="w-3.5 h-3.5 text-amber-500" /> Tanque</span>
              <span className={`font-mono text-[11px] font-bold ${deltaFuel > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {deltaFuel > 0 ? `-${deltaFuel}%` : 'OK'}
              </span>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px]">
              <span>Saída: {exitInspection?.fuelLevel || 0}%</span>
              <span>Entrada: {entryInspection?.fuelLevel || 0}%</span>
            </div>
            {fuelCost > 0 && (
              <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400 text-[10px]">
                A cobrar: R$ {fuelCost.toFixed(2)}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Avarias</span>
              <span className="font-mono text-[11px] font-bold text-rose-600">
                +{newDamages.length} novas
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Pré-existentes: {preExistingDamages.length}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-slate-500">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Caução</span>
              <span className="font-mono text-[11px] font-bold text-emerald-600">
                R$ {(settlement?.securityDepositAvailable || 0).toFixed(2)}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
              Total Desvios: R$ {totalDeviations.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Abas de Navegação */}
        <div className="flex border-b border-slate-100 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-950 text-xs">
          <button
            type="button"
            onClick={() => setViewTab('photos')}
            className={`px-4 py-2.5 font-bold border-b-2 transition-colors ${
              viewTab === 'photos'
                ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Fotos Pareadas por Ângulo
          </button>
          <button
            type="button"
            onClick={() => setViewTab('damages')}
            className={`px-4 py-2.5 font-bold border-b-2 transition-colors ${
              viewTab === 'damages'
                ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Carroceria & Avarias ({newDamages.length} novas)
          </button>
          <button
            type="button"
            onClick={() => setViewTab('settlement')}
            className={`px-4 py-2.5 font-bold border-b-2 transition-colors ${
              viewTab === 'settlement'
                ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Extrato de Acerto & Cobrança
          </button>
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {viewTab === 'photos' && (
            <div className="space-y-3">
              {/* Seletor de Slot / Ângulo */}
              <div className="flex flex-wrap gap-1.5">
                {PHOTO_SLOTS.map((slot) => (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={() => setActiveSlot(slot.key)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      activeSlot === slot.key
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>

              {/* Visão Lado a Lado das Fotos */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Foto da Entrega (Saída) */}
                <div className="rounded-xl border border-slate-200 p-3 space-y-2 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      ENTREGA (Saída do pátio)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {exitInspection ? new Date(exitInspection.inspectionDate).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                  <div className="aspect-[4/3] rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                    {currentPair?.exitPhotoUrl ? (
                      <img
                        src={currentPair.exitPhotoUrl}
                        alt="Foto na Entrega"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Foto não registrada na entrega</span>
                    )}
                  </div>
                </div>

                {/* Foto da Devolução (Entrada) */}
                <div className="rounded-xl border border-slate-200 p-3 space-y-2 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      DEVOLUÇÃO (Entrada no pátio)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {entryInspection ? new Date(entryInspection.inspectionDate).toLocaleDateString('pt-BR') : '—'}
                    </span>
                  </div>
                  <div className="aspect-[4/3] rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                    {currentPair?.entryPhotoUrl ? (
                      <img
                        src={currentPair.entryPhotoUrl}
                        alt="Foto na Devolução"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Foto não registrada na devolução</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewTab === 'damages' && (
            <div className="space-y-4">
              <InspectionCarDamageDiagram
                damages={[...preExistingDamages, ...newDamages]}
                readOnly
              />
            </div>
          )}

          {viewTab === 'settlement' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 dark:border-slate-800">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Demonstrativo de Acerto de Contas da Devolução
                </h4>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="flex justify-between py-2">
                    <span>KM Excedente ({excessKm} km × R$ {excessKmRate.toFixed(2)})</span>
                    <span className="font-mono font-semibold">R$ {excessKmCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>Combustível Faltante ({deltaFuel}%)</span>
                    <span className="font-mono font-semibold">R$ {fuelCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>Avarias na Carroceria ({newDamages.length} itens)</span>
                    <span className="font-mono font-semibold">R$ {(settlement?.damagesCost || 0).toFixed(2)}</span>
                  </div>
                  {Boolean(settlement?.washCost) && (
                    <div className="flex justify-between py-2">
                      <span>Taxa de Higienização ({settlement?.washType})</span>
                      <span className="font-mono font-semibold">R$ {(settlement?.washCost || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2.5 font-bold text-sm text-slate-900 dark:text-white border-t-2 border-slate-200 dark:border-slate-700">
                    <span>Total de Desvios Apurados</span>
                    <span className="font-mono text-rose-600">R$ {totalDeviations.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                    <span>( - ) Depósito Caução Retido</span>
                    <span className="font-mono">(R$ {(settlement?.securityDepositAvailable || 0).toFixed(2)})</span>
                  </div>
                  <div className="flex justify-between py-2.5 font-bold text-sm border-t border-slate-200 dark:border-slate-700">
                    <span>
                      {totalDeviations <= (settlement?.securityDepositAvailable || 0)
                        ? 'Saldo a Estornar ao Motorista (após janela de 30 dias de multas)'
                        : 'Saldo Devedor a Cobrar do Motorista'}
                    </span>
                    <span className="font-mono text-base text-violet-700 dark:text-violet-400">
                      R$ {Math.abs((settlement?.securityDepositAvailable || 0) - totalDeviations).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {onSettle && (
                <div className="flex justify-end gap-2">
                  <Button variant="primary" onClick={onSettle} className="gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Efetivar Acerto e Atualizar Frota
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
