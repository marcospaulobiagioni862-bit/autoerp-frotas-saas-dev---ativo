import React from 'react';
import type { InspectionDamageItem } from '../../api/vehicleInspectionClient';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';

interface InspectionCarDamageDiagramProps {
  damages: InspectionDamageItem[];
  onAddDamage?: (damage: Omit<InspectionDamageItem, 'id'>) => void;
  onRemoveDamage?: (id: string) => void;
  readOnly?: boolean;
}

export const CAR_PARTS = [
  'Parachoque Dianteiro',
  'Capô',
  'Farol Esquerdo',
  'Farol Direito',
  'Paralama Diant. Esquerdo',
  'Paralama Diant. Direito',
  'Porta Diant. Esquerda',
  'Porta Diant. Direita',
  'Porta Tras. Esquerda',
  'Porta Tras. Direita',
  'Teto',
  'Parabrisa',
  'Vidro Traseiro',
  'Lateral Esquerda',
  'Lateral Direita',
  'Tampa Porta-malas',
  'Parachoque Traseiro',
  'Lanterna Esquerda',
  'Lanterna Direita',
  'Retrovisor Esquerdo',
  'Retrovisor Direito',
] as const;

export function InspectionCarDamageDiagram({
  damages,
  onAddDamage,
  onRemoveDamage,
  readOnly = false,
}: InspectionCarDamageDiagramProps) {
  const [selectedPoint, setSelectedPoint] = React.useState<{ x: number; y: number } | null>(null);
  const [part, setPart] = React.useState<string>(CAR_PARTS[0]);
  const [description, setDescription] = React.useState('');
  const [severity, setSeverity] = React.useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [estimatedCost, setEstimatedCost] = React.useState('');

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly || !onAddDamage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setSelectedPoint({ x, y });
  };

  const confirmAddDamage = () => {
    if (!selectedPoint || !onAddDamage || !description.trim()) return;
    onAddDamage({
      part,
      description: description.trim(),
      severity,
      estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
      x: selectedPoint.x,
      y: selectedPoint.y,
      isPreExisting: false,
    });
    setSelectedPoint(null);
    setDescription('');
    setEstimatedCost('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Mapeamento de Avarias na Carroceria
          </h5>
          <p className="text-[11px] text-slate-500">
            {readOnly
              ? 'Pins azuis = avarias anteriores (pré-existentes). Pins vermelhos = avarias novas nesta devolução.'
              : 'Toque na silhueta do veículo para marcar o local exato do dano.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" /> Pré-existente
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500" /> Nova
          </span>
        </div>
      </div>

      {/* Silhueta SVG da Carroceria (Vista Superior Top-Down) */}
      <div className="relative mx-auto max-w-[280px] bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex justify-center">
        <svg
          viewBox="0 0 200 400"
          className={`w-full max-w-[220px] select-none ${!readOnly ? 'cursor-crosshair' : ''}`}
          onClick={handleSvgClick}
        >
          {/* Silhueta base do carro */}
          {/* Parachoque Dianteiro / Frente */}
          <path
            d="M 50 60 C 50 20, 150 20, 150 60 L 160 110 C 165 140, 165 260, 160 320 C 155 370, 45 370, 40 320 C 35 260, 35 140, 40 110 Z"
            fill="currentColor"
            className="text-slate-200 dark:text-slate-800"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />

          {/* Parabrisa Dianteiro */}
          <path
            d="M 55 105 L 145 105 L 138 145 L 62 145 Z"
            fill="currentColor"
            className="text-blue-200/50 dark:text-blue-900/40"
            stroke="currentColor"
            strokeWidth="2"
          />

          {/* Teto */}
          <rect
            x="60"
            y="150"
            width="80"
            height="110"
            rx="8"
            fill="currentColor"
            className="text-slate-100 dark:text-slate-850"
            stroke="currentColor"
            strokeWidth="2"
          />

          {/* Vidro Traseiro */}
          <path
            d="M 62 265 L 138 265 L 145 295 L 55 295 Z"
            fill="currentColor"
            className="text-blue-200/50 dark:text-blue-900/40"
            stroke="currentColor"
            strokeWidth="2"
          />

          {/* Tampa do Porta Malas */}
          <path
            d="M 55 300 C 60 350, 140 350, 145 300 Z"
            fill="currentColor"
            className="text-slate-200 dark:text-slate-800"
            stroke="currentColor"
            strokeWidth="2"
          />

          {/* Capô dianteiro */}
          <path
            d="M 50 60 C 70 45, 130 45, 150 60 L 145 100 L 55 100 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-slate-300 dark:text-slate-700"
          />

          {/* Retrovisores */}
          <rect x="25" y="115" width="14" height="20" rx="4" fill="currentColor" className="text-slate-400" />
          <rect x="161" y="115" width="14" height="20" rx="4" fill="currentColor" className="text-slate-400" />

          {/* Pneus laterais */}
          <rect x="25" y="75" width="10" height="30" rx="3" fill="#1e293b" />
          <rect x="165" y="75" width="10" height="30" rx="3" fill="#1e293b" />
          <rect x="25" y="285" width="10" height="30" rx="3" fill="#1e293b" />
          <rect x="165" y="285" width="10" height="30" rx="3" fill="#1e293b" />

          {/* Pins de Danos Existentes */}
          {damages.map((dmg, idx) => {
            const cx = dmg.x !== undefined ? (dmg.x / 100) * 200 : 100;
            const cy = dmg.y !== undefined ? (dmg.y / 100) * 400 : 100;
            const isPre = Boolean(dmg.isPreExisting);

            return (
              <g key={dmg.id} className="transition-transform hover:scale-125 cursor-pointer">
                <circle
                  cx={cx}
                  cy={cy}
                  r="9"
                  className={isPre ? 'fill-blue-600 stroke-white' : 'fill-rose-600 stroke-white animate-pulse'}
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={cy + 3.5}
                  fontSize="9"
                  fontWeight="bold"
                  textAnchor="middle"
                  fill="white"
                  className="pointer-events-none select-none font-mono"
                >
                  {idx + 1}
                </text>
              </g>
            );
          })}

          {/* Ponto selecionado atual (aguardando confirmação) */}
          {selectedPoint && (
            <g>
              <circle
                cx={(selectedPoint.x / 100) * 200}
                cy={(selectedPoint.y / 100) * 400}
                r="10"
                className="fill-amber-400 stroke-slate-900 animate-ping opacity-75"
              />
              <circle
                cx={(selectedPoint.x / 100) * 200}
                cy={(selectedPoint.y / 100) * 400}
                r="7"
                className="fill-amber-500 stroke-white"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Modal/Box de inclusão de dano ao tocar no carro */}
      {selectedPoint && !readOnly && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3.5 space-y-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Registrar avaria no ponto marcado
            </span>
            <button
              type="button"
              onClick={() => setSelectedPoint(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Peça / Local</label>
              <select
                value={part}
                onChange={(e) => setPart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                {CAR_PARTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Gravidade</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="LOW">Leve (Risco superficial)</option>
                <option value="MEDIUM">Média (Amassado / Risco fundo)</option>
                <option value="HIGH">Grave (Trinca / Quebrado / Funilaria pesada)</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Descrição do dano *
              </label>
              <input
                type="text"
                placeholder="Ex: Risco 15cm com perda de tinta..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Estimativa (R$)
              </label>
              <input
                type="number"
                placeholder="Ex: 250"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={confirmAddDamage}
            disabled={!description.trim()}
            className="w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Adicionar Avaria no Diagrama
          </button>
        </div>
      )}

      {/* Lista de Avarias Registradas */}
      {damages.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
            Avarias mapeadas ({damages.length})
          </p>
          <div className="grid gap-1.5 max-h-48 overflow-y-auto">
            {damages.map((dmg, idx) => (
              <div
                key={dmg.id}
                className={`flex items-center justify-between rounded-lg border p-2 text-xs ${
                  dmg.isPreExisting
                    ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'
                    : 'border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      dmg.isPreExisting ? 'bg-blue-600' : 'bg-rose-600'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {dmg.part}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1.5">
                      ({dmg.severity === 'LOW' ? 'Leve' : dmg.severity === 'MEDIUM' ? 'Média' : 'Grave'})
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">{dmg.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {dmg.estimatedCost ? (
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                      R$ {dmg.estimatedCost.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Sob orçamento</span>
                  )}
                  {!readOnly && onRemoveDamage && (
                    <button
                      type="button"
                      onClick={() => onRemoveDamage(dmg.id)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
