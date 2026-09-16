import { motion } from 'motion/react';
import {
  AlertTriangle,
  MessageCircle,
  CheckCircle,
  Phone,
  DollarSign,
  Car,
  User,
  Info
} from 'lucide-react';
import { Pagamento, Motorista, Veiculo, Contrato, Documento } from '../types';

interface InadimplentesViewProps {
  pagamentos: Pagamento[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  contratos: Contrato[];
  documentos: Documento[];
  onQuickPay: (paymentId: string) => void;
  onNavigate?: (tab: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function InadimplentesView({
  pagamentos,
  motoristas,
  veiculos,
  contratos,
  documentos,
  onQuickPay,
  onNavigate,
  onTriggerToast
}: InadimplentesViewProps) {

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Identificar faturas em atraso
  const pagamentosAtrasados = pagamentos.filter(p => p.status === 'Atrasado');

  // Agrupar débitos por CPF de motorista
  const debitosPorMotorista = pagamentosAtrasados.reduce((acc, p) => {
    if (!acc[p.motoristaCpf]) {
      acc[p.motoristaCpf] = {
        totalDevido: 0,
        faturasCount: 0,
        faturasIds: [],
        vencimentoMaisAntigo: p.vencimento
      };
    }
    acc[p.motoristaCpf].totalDevido += p.valor;
    acc[p.motoristaCpf].faturasCount += 1;
    acc[p.motoristaCpf].faturasIds.push(p.id);
    if (p.vencimento < acc[p.motoristaCpf].vencimentoMaisAntigo) {
      acc[p.motoristaCpf].vencimentoMaisAntigo = p.vencimento;
    }
    return acc;
  }, {} as Record<string, { totalDevido: number; faturasCount: number; faturasIds: string[]; vencimentoMaisAntigo: string }>);

  const inadimplentesList = Object.entries(debitosPorMotorista).map(([cpf, info]) => {
    const mot = motoristas.find(m => m.cpf === cpf);
    const contratoAtivo = contratos.find(c => c.motoristaCpf === cpf && c.status === 'Ativo');
    const veic = contratoAtivo ? veiculos.find(v => v.placa === contratoAtivo.veiculoPlaca) : null;
    
    // Calculate late interest and fine across all overdue payments for this driver
    const driverPayments = pagamentosAtrasados.filter(p => p.motoristaCpf === cpf);
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    let totalBase = 0;
    let totalMulta = 0;
    let totalJuros = 0;
    let maxDiasAtraso = 0;

    driverPayments.forEach(p => {
      const baseVal = p.saldoDevedor !== undefined && p.saldoDevedor > 0 ? p.saldoDevedor : (p.valorOriginal || p.valor);
      const vencDate = new Date(p.vencimento + 'T12:00:00');
      const timeDiff = today.getTime() - vencDate.getTime();
      const dias = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
      if (dias > maxDiasAtraso) maxDiasAtraso = dias;

      const mRate = p.multaMoraRate ?? 2.0;
      const jRate = p.jurosDiarioRate ?? 0.033;
      const mV = baseVal * (mRate / 100);
      const jV = baseVal * (jRate / 100) * dias;

      totalBase += baseVal;
      totalMulta += mV;
      totalJuros += jV;
    });

    const totalComAcrescimos = totalBase + totalMulta + totalJuros;

    return {
      cpf,
      nome: mot?.nome || 'Motorista Desconhecido',
      tel: mot?.tel || '(11) 99999-9999',
      modeloCarro: veic?.modelo || 'Sem veículo ativo',
      placaCarro: contratoAtivo?.veiculoPlaca || '—',
      diasAtraso: maxDiasAtraso || 5,
      totalDevido: totalBase,
      totalMulta,
      totalJuros,
      totalComAcrescimos,
      faturasCount: info.faturasCount,
      faturasIds: info.faturasIds
    };
  });

  const grandTotalDue = inadimplentesList.reduce((sum, item) => sum + item.totalDevido, 0);

  // Multas em aberto (vencidas ou a vencer)
  const multasPendentes = documentos.filter(doc => doc.tipo === 'Multas' && (doc.status === 'Vencido' || doc.status === 'A vencer'));

  // Liquidar tudo do motorista
  const handleSettleAll = (nome: string, faturasIds: string[]) => {
    if (confirm(`Confirmar quitação total das ${faturasIds.length} pendências do motorista ${nome}?`)) {
      faturasIds.forEach(id => onQuickPay(id));
      onTriggerToast(`Todos os débitos em aberto de ${nome} foram liquidados!`, 'success');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Alerta de Perigo de Inadimplência */}
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-rose-800 shadow-2xs">
        <div className="flex gap-4.5 items-start">
          <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h3 className="font-extrabold text-base tracking-tight mb-1">
              {inadimplentesList.length} {inadimplentesList.length === 1 ? 'Motorista inadimplente localizado' : 'Motoristas inadimplentes localizados'}
            </h3>
            <p className="text-sm opacity-90 leading-relaxed">
              Há um montante total acumulado de <strong>{formatBRL(grandTotalDue)}</strong> em faturas semanais vencidas na carteira. Recomendamos entrar em contato via WhatsApp para firmar um acordo de renegociação amigável antes de efetuar o bloqueio do motorista na plataforma.
            </p>
          </div>
        </div>
      </div>

      {/* Diretriz de Cobrança e Contatos */}
      <div className="bg-slate-900 text-white rounded-xl p-4 flex gap-3.5 items-start border border-slate-800">
        <span className="text-xl">⚠️</span>
        <div className="text-xs">
          <strong className="block uppercase text-red-500 font-extrabold tracking-wider mb-1">REGRA DE COBRANÇA IMPRETERÍVEL</strong>
          <p className="text-slate-300 leading-relaxed font-medium">
            Somente o telefone pessoal do motorista recebe as mensagens de alertas ou cobranças financeiras. <strong>O contato de emergência é reservado estritamente para situações graves</strong> (sinistros, acidentes, impossibilidade de contato). É terminantemente proibido enviar cobranças ou avisos de inadimplência para o número de emergência.
          </p>
        </div>
      </div>

      {/* Tabela de Devedores */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" /> Relatório de Inadimplência Ativa
          </h3>
          <span className="bg-rose-50 text-rose-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            Total Devedor: {formatBRL(grandTotalDue)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Motorista</th>
                <th className="px-5 py-3.5">Veículo Alugado</th>
                <th className="px-5 py-3.5">Dias em Atraso</th>
                <th className="px-5 py-3.5">Faturas / Dívida</th>
                <th className="px-5 py-3.5">Contato</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {inadimplentesList.length > 0 ? (
                inadimplentesList.map(item => {
                  const phoneClean = item.tel.replace(/\D/g, '');
                  const wppMessage = `Olá *${item.nome}*,\n\nEntramos em contato referente às *${item.faturasCount} parcela(s) em atraso* do seu aluguel de veículo (${item.modeloCarro} - Placa: ${item.placaCarro}).\n\n• Valor base das parcelas: *${formatBRL(item.totalDevido)}*\n• Maior atraso: *${item.diasAtraso} dia(s)*\n• Multas por atraso: *${formatBRL(item.totalMulta)}*\n• Juros de mora: *${formatBRL(item.totalJuros)}*\n👉 *Valor Total Atualizado com Acréscimos: ${formatBRL(item.totalComAcrescimos)}*\n\nPoderia nos enviar o comprovante de PIX ou entrar em contato para regularizarmos seu saldo? Obrigado!`;
                  const wppLink = `https://api.whatsapp.com/send?phone=55${phoneClean}&text=${encodeURIComponent(wppMessage)}`;

                  return (
                    <tr key={item.cpf} className="hover:bg-rose-50/10 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{item.nome}</div>
                        <div className="text-[11px] text-slate-400 font-mono font-medium">{item.cpf}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-700">{item.modeloCarro}</div>
                        {item.placaCarro !== '—' && (
                          <div className="text-[11px] text-slate-400 font-mono font-bold bg-slate-100 rounded px-1.5 py-0.5 inline-block mt-0.5">
                            {item.placaCarro}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 border border-rose-200/60 rounded-full px-2.5 py-0.5 text-xs">
                          {item.diasAtraso} dias em atraso
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-extrabold text-slate-900 text-sm">{formatBRL(item.totalComAcrescimos)}</div>
                        <div className="text-[10px] text-slate-500 font-medium">
                          Base: {formatBRL(item.totalDevido)} + {formatBRL(item.totalMulta + item.totalJuros)} (juros/multa)
                        </div>
                        <div className="text-[10px] text-rose-600 font-semibold">({item.faturasCount} faturas pendentes)</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                          <Phone className="w-3.5 h-3.5 text-slate-400" /> {item.tel}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                        <a
                          href={wppLink}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-lg transition-all shadow-2xs inline-flex items-center gap-1.5"
                          title="Cobrar via WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" /> Cobrar WhatsApp
                        </a>

                        {onNavigate && (
                          <button
                            onClick={() => {
                              onNavigate('recebimentos');
                              onTriggerToast(`Direcionado para Contas a Receber para efetuar a baixa de pagamento do motorista ${item.nome}`, 'warning');
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-lg transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                            title="Ir para a aba Contas a Receber para efetuar a baixa de pagamento"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Dar Baixa em Contas a Receber
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-bold">
                    🎉 Excelente! Nenhum motorista inadimplente localizado no momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção de Multas e Infrações Pendentes */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden mt-8">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Multas e Infrações Pendentes
          </h3>
          <span className="bg-amber-50 text-amber-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {multasPendentes.length} {multasPendentes.length === 1 ? 'multa ativa' : 'multas ativas'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Veículo / Placa</th>
                <th className="px-5 py-3.5">Motorista Responsável</th>
                <th className="px-5 py-3.5">Nº do Documento</th>
                <th className="px-5 py-3.5">Vencimento</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {multasPendentes.length > 0 ? (
                multasPendentes.map(multa => {
                  const motorista = motoristas.find(m => m.cpf === multa.motoristaCpf);
                  const carro = veiculos.find(v => v.placa === multa.veiculoPlaca);
                  return (
                    <tr key={multa.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-800">{carro?.modelo || 'Carro Desconhecido'}</div>
                        <span className="bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                          {multa.veiculoPlaca}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {motorista ? (
                          <div>
                            <div className="font-bold text-slate-800">{motorista.nome}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{motorista.cpf}</div>
                            
                            <div className="mt-1.5 flex flex-col gap-1 text-[11px] animate-fadeIn">
                              <span className={`inline-flex items-center gap-1 font-bold w-fit rounded px-1.5 py-0.5 text-[9px] border ${
                                multa.multa_status_condutor === 'enviado' 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                                  : multa.multa_status_condutor === 'paga_dobrado'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                                  : 'bg-amber-50 text-amber-700 border-amber-200/50'
                              }`}>
                                {multa.multa_status_condutor === 'enviado' && '✓ Dados do Condutor Enviados'}
                                {multa.multa_status_condutor === 'paga_dobrado' && '⚠ Paga Dobrado (NIC)'}
                                {(!multa.multa_status_condutor || multa.multa_status_condutor === 'pendente') && '⏳ Enviar Dados (Pendente)'}
                              </span>
                              {multa.multa_data_indicacao && (
                                <span className="text-slate-500 text-[10px] font-medium">
                                  Indicação: <strong className="text-slate-700">{new Date(multa.multa_data_indicacao + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Nenhum motorista vinculado</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold">{multa.numero}</td>
                      <td className="px-5 py-3.5 font-medium">
                        {multa.vencimento ? new Date(multa.vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        {multa.status === 'Vencido' ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            Vencido
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold px-2 py-0.5 rounded-md">
                            A vencer
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 max-w-xs truncate">{multa.obs || '—'}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400 font-bold">
                    🎉 Nenhuma multa pendente no momento!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
