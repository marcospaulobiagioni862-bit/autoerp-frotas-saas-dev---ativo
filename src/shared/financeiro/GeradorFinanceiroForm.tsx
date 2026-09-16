import React, { useState, useEffect } from 'react';
import { GeradorFinanceiroParams, ParcelaManual } from './types';
import { buildParcelas } from './financialGeneratorLogic';

interface Props {
  value: GeradorFinanceiroParams;
  onChange: (val: GeradorFinanceiroParams) => void;
  lockValorTotal?: boolean;
}

export default function GeradorFinanceiroForm({ value, onChange, lockValorTotal }: Props) {
  const [parcelasPrevias, setParcelasPrevias] = useState<ParcelaManual[]>([]);
  const [somaParcelas, setSomaParcelas] = useState(0);

  useEffect(() => {
    if (value.modalidade !== 'À vista' && value.modoDivisao !== 'Personalizado') {
      const p = buildParcelas(value);
      setParcelasPrevias(p);
    }
  }, [value]);

  useEffect(() => {
    if (value.modoDivisao === 'Personalizado') {
      setSomaParcelas(value.parcelasManuais.reduce((acc, curr) => acc + curr.valor, 0));
    }
  }, [value.parcelasManuais, value.modoDivisao]);

  const updateField = <K extends keyof GeradorFinanceiroParams>(field: K, val: GeradorFinanceiroParams[K]) => {
    onChange({ ...value, [field]: val });
  };

  const handleCustomParcelChange = (idx: number, field: keyof ParcelaManual, val: string | number) => {
    const newParcelas = [...value.parcelasManuais];
    newParcelas[idx] = { ...newParcelas[idx], [field]: val };
    updateField('parcelasManuais', newParcelas);
  };

  const initCustom = () => {
    updateField('parcelasManuais', buildParcelas({ ...value, modoDivisao: 'Igual' }));
    updateField('modoDivisao', 'Personalizado');
  };

  return (
    <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
      <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight mb-2">Configuração Financeira Integrada</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase">Modalidade</label>
          <select 
            className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
            value={value.modalidade} 
            onChange={e => updateField('modalidade', e.target.value as any)}
          >
            <option value="À vista">À vista</option>
            <option value="Parcelado">Parcelado</option>
            <option value="Recorrente">Recorrente</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase">Valor Total (R$)</label>
          <input 
            type="number" step="0.01" 
            className={`w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 ${lockValorTotal ? 'bg-slate-100 cursor-not-allowed' : ''}`}
            value={value.valorTotal || ''}
            onChange={e => updateField('valorTotal', parseFloat(e.target.value) || 0)}
            disabled={lockValorTotal}
          />
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase">Primeiro Vencimento</label>
          <input 
            type="date" 
            className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
            value={value.dataPrimeiroVencimento}
            onChange={e => updateField('dataPrimeiroVencimento', e.target.value)}
          />
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase">Forma de {value.tipo === 'Despesa' ? 'Pagamento' : 'Recebimento'}</label>
          <select 
            className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
            value={value.formaPagamento}
            onChange={e => updateField('formaPagamento', e.target.value)}
          >
            <option value="PIX">PIX</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Cartão de Crédito">Cartão de Crédito</option>
            <option value="Boleto">Boleto</option>
            <option value="Transferência">Transferência</option>
          </select>
        </div>
      </div>

      {value.modalidade === 'Parcelado' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Qtd de Parcelas</label>
            <input 
              type="number" min="2" max="120"
              className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
              value={value.qtdParcelas || ''}
              onChange={e => updateField('qtdParcelas', parseInt(e.target.value) || 2)}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Periodicidade</label>
            <select 
              className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
              value={value.periodicidade}
              onChange={e => updateField('periodicidade', e.target.value as any)}
            >
              <option value="Mensal">Mensal</option>
              <option value="Quinzenal">Quinzenal</option>
              <option value="Semanal">Semanal</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Modo de Divisão</label>
            <select 
              className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
              value={value.modoDivisao}
              onChange={e => {
                if (e.target.value === 'Personalizado') initCustom();
                else updateField('modoDivisao', 'Igual');
              }}
            >
              <option value="Igual">Divisão Igual</option>
              <option value="Personalizado">Personalizado</option>
            </select>
          </div>
        </div>
      )}

      {value.modalidade === 'Recorrente' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase">Periodicidade</label>
            <select 
              className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
              value={value.periodicidade}
              onChange={e => updateField('periodicidade', e.target.value as any)}
            >
              <option value="Mensal">Mensal</option>
              <option value="Anual">Anual</option>
              <option value="Semanal">Semanal</option>
              <option value="Diária">Diária</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer p-2">
              <input 
                type="checkbox" 
                checked={value.semDataFim}
                onChange={e => updateField('semDataFim', e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-semibold">Sem Data Fim</span>
            </label>
          </div>
          {!value.semDataFim && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase">Data Fim</label>
              <input 
                type="date" 
                className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                value={value.dataFimRecorrencia || ''}
                onChange={e => updateField('dataFimRecorrencia', e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Preview das Parcelas (Somente Parcelado Igual) */}
      {value.modalidade === 'Parcelado' && value.modoDivisao === 'Igual' && parcelasPrevias.length > 0 && (
        <div className="pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-500 font-semibold mb-2">Simulação de Parcelas (Total: R$ {value.valorTotal.toFixed(2)})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-32 overflow-y-auto">
            {parcelasPrevias.map(p => (
              <div key={p.numero} className="bg-white border border-slate-200 p-2 rounded text-center">
                <div className="text-[10px] font-bold text-slate-400">{p.numero}/{value.qtdParcelas}</div>
                <div className="text-xs font-black text-slate-800">R$ {p.valor.toFixed(2)}</div>
                <div className="text-[9px] text-slate-500">{p.vencimento.split('-').reverse().join('/')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de Customização */}
      {value.modalidade === 'Parcelado' && value.modoDivisao === 'Personalizado' && (
        <div className="pt-3 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500 font-semibold">Editar Parcelas Manualmente</p>
            <div className={`text-xs font-bold px-2 py-1 rounded ${Math.abs(somaParcelas - value.valorTotal) < 0.01 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              Soma: R$ {somaParcelas.toFixed(2)} / R$ {value.valorTotal.toFixed(2)}
              {Math.abs(somaParcelas - value.valorTotal) >= 0.01 && ' (Diferença de R$ ' + Math.abs(value.valorTotal - somaParcelas).toFixed(2) + ')'}
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {value.parcelasManuais.map((p, idx) => (
              <div key={p.numero} className="flex items-center gap-3 bg-white p-2 border border-slate-200 rounded">
                <span className="text-xs font-bold w-12 shrink-0 text-slate-500">#{p.numero}</span>
                <input 
                  type="date" 
                  className="text-xs p-1.5 border border-slate-300 rounded w-32"
                  value={p.vencimento}
                  onChange={e => handleCustomParcelChange(idx, 'vencimento', e.target.value)}
                />
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1.5 text-xs text-slate-400">R$</span>
                  <input 
                    type="number" step="0.01"
                    className="text-xs p-1.5 pl-6 border border-slate-300 rounded w-full font-bold"
                    value={p.valor || ''}
                    onChange={e => handleCustomParcelChange(idx, 'valor', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
