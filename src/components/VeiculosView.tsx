import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Car,
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  Upload,
  Camera,
  Hash,
  Activity,
  DollarSign,
  Archive,
  Gauge,
  Shield,
  Radio,
  FileText,
  FileDown,
  Printer,
  ChevronDown,
  ChevronUp,
  Video,
  Info,
  AlertCircle,
  User,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Save
} from 'lucide-react';
import { Veiculo, Motorista, Contrato, Pagamento, Seguradora, Apolice, Manutencao, ContaReceber, ContaPagar } from '../types';
import { CarBrandLogo } from '../shared/components/CarBrandLogo';
import { PlacaMercosul } from './PlacaMercosul';
import { getVehicleMaintenanceAlerts } from '../shared/domain/maintenance';

interface VeiculosViewProps {
  veiculos: Veiculo[];
  motoristas: Motorista[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  manutencoes?: Manutencao[];
  seguradoras?: Seguradora[];
  apolices?: Apolice[];
  contasReceber?: ContaReceber[];
  contasPagar?: ContaPagar[];
  onAddVeiculo: (v: Veiculo) => void;
  onEditVeiculo: (v: Veiculo, oldPlaca?: string) => void;
  onDeleteVeiculo: (placa: string) => void;
  onArchiveVeiculo: (placa: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function VeiculosView({
  veiculos,
  motoristas,
  contratos,
  pagamentos,
  manutencoes = [],
  seguradoras = [],
  apolices = [],
  contasReceber = [],
  contasPagar = [],
  onAddVeiculo,
  onEditVeiculo,
  onDeleteVeiculo,
  onArchiveVeiculo,
  onTriggerToast
}: VeiculosViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Disponível' | 'Alugado' | 'Em preparação' | 'Fora da frota'>('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [editingVeiculo, setEditingVeiculo] = useState<Veiculo | null>(null);
  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [pendenciesToConfirm, setPendenciesToConfirm] = useState<{ list: string[]; data: Veiculo } | null>(null);

  // Archive modal states
  const [archivePlaca, setArchivePlaca] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  // Form states
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [marca, setMarca] = useState('');
  const [ano, setAno] = useState('');
  const [cor, setCor] = useState('');
  const [renavam, setRenavam] = useState('');
  const [valor, setValor] = useState('');
  const [valorDiario, setValorDiario] = useState('');
  const [valorSemanal, setValorSemanal] = useState('');
  const [valorMensal, setValorMensal] = useState('');
  const [modalidadeAluguel, setModalidadeAluguel] = useState<'Diário' | 'Semanal' | 'Mensal'>('Semanal');
  const [plataforma, setPlataforma] = useState('Uber + 99');
  const [status, setStatus] = useState<'Disponível' | 'Alugado' | 'Em preparação' | 'Fora da frota'>('Disponível');
  const [kmInicial, setKmInicial] = useState('');
  const [kmAtual, setKmAtual] = useState('');
  const [foto, setFoto] = useState('');
  const [motoristaCpf, setMotoristaCpf] = useState('');

  // Main Tab State
  const [activeTab, setActiveTab] = useState<'geral' | 'seguranca' | 'midia' | 'km'>('geral');
  const [expandedPlaca, setExpandedPlaca] = useState<string | null>(null);

  // States for Quick KM tab
  const [kmSearch, setKmSearch] = useState('');
  const [vehicleKmInputs, setVehicleKmInputs] = useState<{[placa: string]: string}>({});

  // Media Tab States
  const [selectedPlaca, setSelectedPlaca] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaTipo, setMediaTipo] = useState<'foto' | 'video'>('foto');
  const [mediaDesc, setMediaDesc] = useState('');

  // Quick KM save handler
  const handleQuickKmSave = (veiculo: Veiculo) => {
    const enteredVal = vehicleKmInputs[veiculo.placa];
    if (!enteredVal) {
      onTriggerToast('Por favor, informe a nova quilometragem.', 'warning');
      return;
    }
    const num = parseInt(enteredVal, 10);
    if (isNaN(num)) {
      onTriggerToast('Por favor, digite um número válido.', 'warning');
      return;
    }
    if (num < (veiculo.km_atual || veiculo.km_inicial || 0)) {
      onTriggerToast(`O novo KM não pode ser menor que o KM atual (${veiculo.km_atual || veiculo.km_inicial} km).`, 'error');
      return;
    }
    
    const updated: Veiculo = {
      ...veiculo,
      km_atual: num,
      km: num
    };
    
    onEditVeiculo(updated, veiculo.placa);
    onTriggerToast(`Quilometragem do veículo ${veiculo.placa} atualizada para ${num.toLocaleString('pt-BR')} km!`, 'success');
    
    setVehicleKmInputs(prev => {
      const copy = { ...prev };
      delete copy[veiculo.placa];
      return copy;
    });
  };

  // Handler para Imprimir / Salvar Ficha Técnica do Veículo em PDF
  const handlePrintVehicleFicha = (v: Veiculo) => {
    const activeContract = contratos.find(c => c.veiculoPlaca === v.placa && c.status === 'Ativo');
    const activeDriver = activeContract ? motoristas.find(m => m.cpf === activeContract.motoristaCpf) : null;
    const veicManutencoes = (manutencoes || []).filter(m => m.veiculoPlaca === v.placa);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Ficha do Veículo - ${v.placa}</title>
        <style>
          body { font-family: 'Segoe UI', Roboto, sans-serif; padding: 25px; color: #1e293b; line-height: 1.5; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
          .placa-box { background: #1e293b; color: #fff; padding: 6px 14px; border-radius: 6px; font-family: monospace; font-size: 18px; font-weight: bold; letter-spacing: 2px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
          .card-title { font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .label { font-weight: 600; color: #64748b; }
          .value { font-weight: 700; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; font-size: 11px; }
          th { background: #e2e8f0; font-weight: bold; text-transform: uppercase; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Ficha Técnica do Veículo</h1>
            <p class="subtitle">AutoERP — Gestão de Frotas • Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          <div class="placa-box">${v.placa}</div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">🚗 Identificação do Veículo</div>
            <div class="row"><span class="label">Marca/Modelo:</span> <span class="value">${v.marca} ${v.modelo}</span></div>
            <div class="row"><span class="label">Ano:</span> <span class="value">${v.ano}</span></div>
            <div class="row"><span class="label">Cor:</span> <span class="value">${v.cor}</span></div>
            <div class="row"><span class="label">Renavam:</span> <span class="value">${v.renavam || 'Não informado'}</span></div>
            <div class="row"><span class="label">Chassi:</span> <span class="value">${v.chassi || 'Não informado'}</span></div>
            <div class="row"><span class="label">Status Operacional:</span> <span class="value">${v.status}</span></div>
            <div class="row"><span class="label">Odômetro Atual:</span> <span class="value">${(v.km_atual || v.km || 0).toLocaleString('pt-BR')} km</span></div>
          </div>

          <div class="card">
            <div class="card-title">👤 Motorista & Aluguel Ativo</div>
            <div class="row"><span class="label">Motorista Atual:</span> <span class="value">${activeDriver ? activeDriver.nome : 'Sem motorista vinculado'}</span></div>
            <div class="row"><span class="label">CPF Motorista:</span> <span class="value">${activeDriver ? activeDriver.cpf : '-'}</span></div>
            <div class="row"><span class="label">Contrato ID:</span> <span class="value">${activeContract ? '#' + activeContract.id : 'Nenhum'}</span></div>
            <div class="row"><span class="label">Segurado:</span> <span class="value">${v.segurado ? 'Sim (' + (v.seguro_seguradora || 'Seguradora') + ')' : 'Não'}</span></div>
            <div class="row"><span class="label">Vencimento Seguro:</span> <span class="value">${v.seguro_vencimento ? v.seguro_vencimento.split('-').reverse().join('/') : '-'}</span></div>
            <div class="row"><span class="label">Rastreador:</span> <span class="value">${v.possui_rastreador ? 'Instalado (' + (v.rastreador_marca || '') + ')' : 'Não'}</span></div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 20px;">
          <div class="card-title">🔧 Histórico de Manutenções (${veicManutencoes.length})</div>
          ${veicManutencoes.length > 0 ? `
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Oficina</th>
                  <th>Status</th>
                  <th>Custo</th>
                </tr>
              </thead>
              <tbody>
                ${veicManutencoes.map(m => `
                  <tr>
                    <td>${m.data.split('-').reverse().join('/')}</td>
                    <td><strong>${m.tipo}</strong></td>
                    <td>${m.desc || '-'}</td>
                    <td>${m.oficina}</td>
                    <td>${m.status}</td>
                    <td>R$ ${m.custo.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p style="color: #64748b; font-size: 11px; font-style: italic;">Nenhuma manutenção registrada para este veículo.</p>'}
        </div>

        <div class="footer">
          Documento gerado automaticamente pelo AutoERP Enterprise v1.2 — Todos os direitos reservados.
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    onTriggerToast(`Documento PDF da Ficha do Veículo ${v.placa} gerado com sucesso!`, 'success');
  };

  const handleSaveAndGenerateVehiclePDF = () => {
    if (!placa || !modelo || !marca || !ano || !renavam || !kmInicial || !kmAtual) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*) do veículo antes de gerar o PDF.', 'error');
      return;
    }

    const initialKmNum = parseInt(kmInicial) || 0;
    const currentKmNum = parseInt(kmAtual) || 0;

    if (currentKmNum < initialKmNum) {
      onTriggerToast('O KM Atual não pode ser menor do que o KM Inicial!', 'error');
      return;
    }

    const veiculoData: Veiculo = {
      placa: placa.toUpperCase().trim(),
      modelo: modelo.trim(),
      marca: marca.trim() || 'Desconhecida',
      ano: isNaN(Number(ano)) ? ano.trim() : (parseInt(ano) || 2022),
      cor: cor.trim() || 'Não informada',
      renavam: renavam.trim(),
      valor: 0,
      plataforma,
      status,
      km_inicial: initialKmNum,
      km_atual: currentKmNum,
      km: currentKmNum,
      foto: foto || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=60&w=200',
      motoristaCpf: motoristaCpf || undefined,
      fotos_videos: editingVeiculo?.fotos_videos || [],
      segurado,
      seguro_vencimento: seguroVencimento || undefined,
      seguro_parcelas: seguroParcelas ? parseInt(seguroParcelas) : undefined,
      seguro_forma_pagamento: seguroFormaPagamento || undefined,
      seguro_obs: seguroObs || undefined,
      seguro_seguradora: seguroSeguradora || undefined,
      seguro_valor: seguroValor ? parseFloat(seguroValor) : undefined,
      seguro_telefone_corretora: seguroTelefoneCorretora || undefined,
      seguro_valor_franquia: seguroValorFranquia ? parseFloat(seguroValorFranquia) : undefined,
      seguro_contrato_url: seguroContratoUrl || undefined,
      seguro_apolice_numero: seguroApoliceNumero || undefined,
      seguro_vigencia_inicio: seguroVigenciaInicio || undefined,
      seguro_vigencia_fim: seguroVigenciaFim || undefined,
      seguro_tipo_cobertura: seguroTipoCobertura || undefined,
      seguro_valor_segurado: seguroValorSegurado ? parseFloat(seguroValorSegurado) : undefined,
      seguro_corretor_nome: seguroCorretorNome || undefined,
      sinistro_ocorreu: sinistroOcorreu,
      sinistro_data_hora: sinistroDataHora || undefined,
      sinistro_local: sinistroLocal || undefined,
      sinistro_tipo: sinistroTipo || undefined,
      sinistro_descricao: sinistroDescricao || undefined,
      sinistro_bo_numero: sinistroBoNumero || undefined,
      sinistro_bo_anexo_url: sinistroBoAnexoUrl || undefined,
      alienacao_possui: alienacaoPossui,
      alienacao_credor: alienacaoCredor || undefined,
      alienacao_contrato: alienacaoContrato || undefined,
      alienacao_previsao_baixa: alienacaoPrevisaoBaixa || undefined,
      alienacao_valor_parcela: alienacaoValorParcela ? parseFloat(alienacaoValorParcela) : undefined,
      alienacao_parcelas_restantes: alienacaoParcelasRestantes ? parseInt(alienacaoParcelasRestantes) : undefined,
      alienacao_parcelas_pagas: alienacaoParcelasPagas ? parseInt(alienacaoParcelasPagas) : undefined,
      recall_pendente: recallPendente,
      recall_descricao: recallDescricao || undefined,
      recall_situacao: recallSituacao || undefined,
      recall_data: recallData || undefined,
      doc_observacoes: docObservacoes || undefined,
      documentos_anexos: documentosAnexos
    };

    executeSave(veiculoData);

    setTimeout(() => {
      handlePrintVehicleFicha(veiculoData);
    }, 300);
  };

  // New Insurance & Tracker states
  const [segurado, setSegurado] = useState(false);
  const [seguroVencimento, setSeguroVencimento] = useState('');
  const [seguroParcelas, setSeguroParcelas] = useState('');
  const [seguroFormaPagamento, setSeguroFormaPagamento] = useState<'Cartão' | 'PIX' | 'Dinheiro' | 'Conta Bancária' | 'Boleto' | ''>('');
  const [seguroObs, setSeguroObs] = useState('');
  const [seguroSeguradora, setSeguroSeguradora] = useState('');
  const [seguroValor, setSeguroValor] = useState('');
  const [seguroTelefoneCorretora, setSeguroTelefoneCorretora] = useState('');
  const [seguroValorFranquia, setSeguroValorFranquia] = useState('');
  const [seguroContratoUrl, setSeguroContratoUrl] = useState('');

  // Campos adicionais da apólice de seguro
  const [seguroApoliceNumero, setSeguroApoliceNumero] = useState('');
  const [seguroVigenciaInicio, setSeguroVigenciaInicio] = useState('');
  const [seguroVigenciaFim, setSeguroVigenciaFim] = useState('');
  const [seguroTipoCobertura, setSeguroTipoCobertura] = useState('');
  const [seguroValorSegurado, setSeguroValorSegurado] = useState('');
  const [seguroCorretorNome, setSeguroCorretorNome] = useState('');

  // Registro de Sinistro
  const [sinistroOcorreu, setSinistroOcorreu] = useState(false);
  const [sinistroDataHora, setSinistroDataHora] = useState('');
  const [sinistroLocal, setSinistroLocal] = useState('');
  const [sinistroTipo, setSinistroTipo] = useState('');
  const [sinistroDescricao, setSinistroDescricao] = useState('');
  const [sinistroHouveVitimas, setSinistroHouveVitimas] = useState<'Sim' | 'Não' | ''>('');

  // Boletim de Ocorrência
  const [sinistroBoNumero, setSinistroBoNumero] = useState('');
  const [sinistroBoData, setSinistroBoData] = useState('');
  const [sinistroBoDelegacia, setSinistroBoDelegacia] = useState('');
  const [sinistroBoAnexoUrl, setSinistroBoAnexoUrl] = useState('');

  // Terceiros envolvidos
  const [sinistroTerceiroNome, setSinistroTerceiroNome] = useState('');
  const [sinistroTerceiroCpf, setSinistroTerceiroCpf] = useState('');
  const [sinistroTerceiroTelefone, setSinistroTerceiroTelefone] = useState('');
  const [sinistroTerceiroPlaca, setSinistroTerceiroPlaca] = useState('');
  const [sinistroTerceiroSeguradora, setSinistroTerceiroSeguradora] = useState('');
  const [sinistroTerceiroApolice, setSinistroTerceiroApolice] = useState('');

  // Acionamento junto à seguradora
  const [sinistroAcionamentoData, setSinistroAcionamentoData] = useState('');
  const [sinistroAcionamentoProtocolo, setSinistroAcionamentoProtocolo] = useState('');
  const [sinistroAcionamentoAtendente, setSinistroAcionamentoAtendente] = useState('');
  const [sinistroAcionamentoCanal, setSinistroAcionamentoCanal] = useState<'Telefone' | 'App' | 'Site' | ''>('');
  const [sinistroAcionamentoPrazo, setSinistroAcionamentoPrazo] = useState('');

  // Acompanhamento do processo
  const [sinistroAcompanhamentoHistorico, setSinistroAcompanhamentoHistorico] = useState('');
  const [sinistroSituacaoAtual, setSinistroSituacaoAtual] = useState<'Aguardando vistoria' | 'Em análise' | 'Aprovado' | 'Negado' | ''>('');
  const [sinistroVistoriaData, setSinistroVistoriaData] = useState('');
  const [sinistroOficinaIndicada, setSinistroOficinaIndicada] = useState('');
  const [sinistroOrcamentoAprovado, setSinistroOrcamentoAprovado] = useState('');

  // Documentos entregues
  const [sinistroDocCnh, setSinistroDocCnh] = useState(false);
  const [sinistroDocCrlv, setSinistroDocCrlv] = useState(false);
  const [sinistroDocBo, setSinistroDocBo] = useState(false);
  const [sinistroDocFotos, setSinistroDocFotos] = useState(false);
  const [sinistroDocFormularioAviso, setSinistroDocFormularioAviso] = useState(false);
  const [sinistroDocLaudos, setSinistroDocLaudos] = useState(false);

  // Resolução
  const [sinistroResolucaoData, setSinistroResolucaoData] = useState('');
  const [sinistroResolucaoTipo, setSinistroResolucaoTipo] = useState<'Reparo' | 'Indenização' | 'Perda total' | ''>('');
  const [sinistroResolucaoValorRecebido, setSinistroResolucaoValorRecebido] = useState('');
  const [sinistroResolucaoObs, setSinistroResolucaoObs] = useState('');

  const [possuiRastreador, setPossuiRastreador] = useState(false);
  const [rastreadorMarca, setRastreadorMarca] = useState('');
  const [rastreadorModelo, setRastreadorModelo] = useState('');
  const [rastreadorImei, setRastreadorImei] = useState('');
  const [rastreadorOperadora, setRastreadorOperadora] = useState('');
  const [rastreadorStatus, setRastreadorStatus] = useState('Ativo');
  const [rastreadorObs, setRastreadorObs] = useState('');

  // New Document detailed states
  const [crlvAnoExercicio, setCrlvAnoExercicio] = useState('');
  const [crlvVencimento, setCrlvVencimento] = useState('');
  const [crlvSituacao, setCrlvSituacao] = useState<'Em dia' | 'Vencido' | ''>('');
  const [crlvDigital, setCrlvDigital] = useState(false);

  const [ipvaAnoReferencia, setIpvaAnoReferencia] = useState('');
  const [ipvaValorTotal, setIpvaValorTotal] = useState('');
  const [ipvaFormaPagamento, setIpvaFormaPagamento] = useState<'Cota única' | 'Parcelado' | ''>('');
  const [ipvaVencimento, setIpvaVencimento] = useState('');
  const [ipvaSituacao, setIpvaSituacao] = useState<'Pago' | 'Pendente' | 'Isento' | ''>('');
  const [ipvaDescontoCotaUnica, setIpvaDescontoCotaUnica] = useState('');

  // IPVA up to 6 installments states
  const [ipvaP1Valor, setIpvaP1Valor] = useState('');
  const [ipvaP1Vencimento, setIpvaP1Vencimento] = useState('');
  const [ipvaP2Valor, setIpvaP2Valor] = useState('');
  const [ipvaP2Vencimento, setIpvaP2Vencimento] = useState('');
  const [ipvaP3Valor, setIpvaP3Valor] = useState('');
  const [ipvaP3Vencimento, setIpvaP3Vencimento] = useState('');
  const [ipvaP4Valor, setIpvaP4Valor] = useState('');
  const [ipvaP4Vencimento, setIpvaP4Vencimento] = useState('');
  const [ipvaP5Valor, setIpvaP5Valor] = useState('');
  const [ipvaP5Vencimento, setIpvaP5Vencimento] = useState('');
  const [ipvaP6Valor, setIpvaP6Valor] = useState('');
  const [ipvaP6Vencimento, setIpvaP6Vencimento] = useState('');

  const [dpvatAnoReferencia, setDpvatAnoReferencia] = useState('');
  const [dpvatValor, setDpvatValor] = useState('');
  const [dpvatDataPagamento, setDpvatDataPagamento] = useState('');
  const [dpvatSituacao, setDpvatSituacao] = useState<'Pago' | 'Pendente' | 'Isento' | ''>('');

  const [multasQuantidade, setMultasQuantidade] = useState('');
  const [multasValorTotal, setMultasValorTotal] = useState('');
  const [multasSituacao, setMultasSituacao] = useState<'Contestada' | 'Paga' | 'Pendente' | 'Recebido' | 'A receber' | ''>('');
  const [multasData, setMultasData] = useState('');

  const [vistoriaDataUltima, setVistoriaDataUltima] = useState('');
  const [vistoriaResultado, setVistoriaResultado] = useState<'Aprovado' | 'Reprovado' | 'Aprovado com apontamento' | ''>('');
  const [vistoriaVencimento, setVistoriaVencimento] = useState('');
  const [vistoriaKmUltima, setVistoriaKmUltima] = useState('');

  const [alienacaoPossui, setAlienacaoPossui] = useState(false);
  const [alienacaoCredor, setAlienacaoCredor] = useState('');
  const [alienacaoContrato, setAlienacaoContrato] = useState('');
  const [alienacaoPrevisaoBaixa, setAlienacaoPrevisaoBaixa] = useState('');
  const [alienacaoValorParcela, setAlienacaoValorParcela] = useState('');
  const [alienacaoDataPagamento, setAlienacaoDataPagamento] = useState('');
  const [alienacaoParcelasRestantes, setAlienacaoParcelasRestantes] = useState('');
  const [alienacaoParcelasPagas, setAlienacaoParcelasPagas] = useState('');

  const [recallPendente, setRecallPendente] = useState(false);
  const [recallDescricao, setRecallDescricao] = useState('');
  const [recallSituacao, setRecallSituacao] = useState<'Realizado' | 'Aguardando' | 'Agendado' | ''>('');
  const [recallData, setRecallData] = useState('');

  const [docObservacoes, setDocObservacoes] = useState('');
  const [documentosAnexos, setDocumentosAnexos] = useState<{ id: string; nome: string; url: string; data_upload: string; tamanho?: string }[]>([]);
  const [possuiDocumentacao, setPossuiDocumentacao] = useState(false);

  // Duplicity warning modal state
  const [duplicityWarning, setDuplicityWarning] = useState<{
    show: boolean;
    message: string;
    pendingVal: string;
    driverName: string;
    vehicleName: string;
  } | null>(null);

  // Efeito para replicar o ano de exercício e auto-calcular datas e parcelas de Licenciamento (CRLV), IPVA e DPVAT de acordo com as regras do Detran SP
  useEffect(() => {
    if (!crlvAnoExercicio || crlvAnoExercicio.length < 4) return;

    // 1. Replicar o ano de exercício para as demais pastas
    setIpvaAnoReferencia(crlvAnoExercicio);
    setDpvatAnoReferencia(crlvAnoExercicio);

    // 2. Extrair o final da placa (último dígito numérico da direita para a esquerda)
    if (placa) {
      let finalDigit: number | null = null;
      const cleanPlate = placa.trim();
      for (let i = cleanPlate.length - 1; i >= 0; i--) {
        const num = parseInt(cleanPlate.charAt(i), 10);
        if (!isNaN(num)) {
          finalDigit = num;
          break;
        }
      }

      if (finalDigit !== null) {
        // Regras de Licenciamento Detran SP
        // Final 1 e 2: Julho (31/07)
        // Final 3 e 4: Agosto (31/08)
        // Final 5 e 6: Setembro (30/09)
        // Final 7 e 8: Outubro (31/10)
        // Final 9: Novembro (30/11)
        // Final 0: Dezembro (31/12)
        let monthStr = '';
        let dayStr = '';

        switch (finalDigit) {
          case 1:
          case 2:
            monthStr = '07';
            dayStr = '31';
            break;
          case 3:
          case 4:
            monthStr = '08';
            dayStr = '31';
            break;
          case 5:
          case 6:
            monthStr = '09';
            dayStr = '30';
            break;
          case 7:
          case 8:
            monthStr = '10';
            dayStr = '31';
            break;
          case 9:
            monthStr = '11';
            dayStr = '30';
            break;
          case 0:
            monthStr = '12';
            dayStr = '31';
            break;
        }

        const calculatedVencimento = `${crlvAnoExercicio}-${monthStr}-${dayStr}`;
        setCrlvVencimento(calculatedVencimento);

        // Atualizar situação do CRLV com base na data de hoje
        const todayStr = new Date().toISOString().split('T')[0];
        if (calculatedVencimento < todayStr) {
          setCrlvSituacao('Vencido');
        } else {
          setCrlvSituacao('Em dia');
        }

        // Regras de IPVA e DPVAT Detran SP
        // O dia de vencimento depende do final de placa:
        // Final 1: dia 11 | Final 2: dia 12 | Final 3: dia 13 | Final 4: dia 14 | Final 5: dia 15
        // Final 6: dia 16 | Final 7: dia 17 | Final 8: dia 18 | Final 9: dia 19 | Final 0: dia 20
        const ipvaDay = finalDigit === 0 ? 20 : 10 + finalDigit;
        const ipvaDayStr = String(ipvaDay).padStart(2, '0');

        if (ipvaFormaPagamento === 'Cota única') {
          setIpvaVencimento(`${crlvAnoExercicio}-01-${ipvaDayStr}`);
          setDpvatDataPagamento(`${crlvAnoExercicio}-01-${ipvaDayStr}`);
          setDpvatSituacao('Pendente');
        } else if (ipvaFormaPagamento === 'Parcelado') {
          const firstVenc = `${crlvAnoExercicio}-01-${ipvaDayStr}`;
          setIpvaVencimento(firstVenc);
          setIpvaP1Vencimento(firstVenc);
          setIpvaP2Vencimento(`${crlvAnoExercicio}-02-${ipvaDayStr}`);
          setIpvaP3Vencimento(`${crlvAnoExercicio}-03-${ipvaDayStr}`);
          setIpvaP4Vencimento(`${crlvAnoExercicio}-04-${ipvaDayStr}`);
          setIpvaP5Vencimento(`${crlvAnoExercicio}-05-${ipvaDayStr}`);
          setIpvaP6Vencimento(''); // Detran SP permite 5 parcelas padrão

          // Se tiver valor total informado, realiza o parcelamento automático em 5 vezes
          if (ipvaValorTotal) {
            const splitVal = (Number(ipvaValorTotal) / 5).toFixed(2);
            setIpvaP1Valor(splitVal);
            setIpvaP2Valor(splitVal);
            setIpvaP3Valor(splitVal);
            setIpvaP4Valor(splitVal);
            setIpvaP5Valor(splitVal);
            setIpvaP6Valor('');
          }
          setDpvatDataPagamento(firstVenc);
          setDpvatSituacao('Pendente');
        } else {
          // Se não houver forma de pagamento, coloca o vencimento padrão do DPVAT em janeiro
          setDpvatDataPagamento(`${crlvAnoExercicio}-01-${ipvaDayStr}`);
        }
      }
    }
  }, [crlvAnoExercicio, placa, ipvaFormaPagamento, ipvaValorTotal]);

  // Media Handlers
  const handleAddMedia = (e: React.FormEvent) => {
    e.preventDefault();
    const plate = selectedPlaca || veiculos[0]?.placa;
    if (!plate) {
      onTriggerToast('Selecione um veículo primeiro!', 'error');
      return;
    }
    if (!mediaUrl.trim()) {
      onTriggerToast('Por favor, informe a URL ou faça o upload da mídia!', 'error');
      return;
    }

    const targetVeiculo = veiculos.find(v => v.placa === plate);
    if (!targetVeiculo) return;

    const newMedia = {
      id: 'm_' + Math.random().toString(36).substr(2, 9),
      url: mediaUrl.trim(),
      tipo: mediaTipo,
      descricao: mediaDesc.trim() || undefined,
      data: new Date().toISOString().split('T')[0]
    };

    const updatedVeiculo: Veiculo = {
      ...targetVeiculo,
      fotos_videos: [...(targetVeiculo.fotos_videos || []), newMedia]
    };

    onEditVeiculo(updatedVeiculo, targetVeiculo.placa);
    onTriggerToast('Mídia adicionada com sucesso!', 'success');
    
    // Reset inputs
    setMediaUrl('');
    setMediaDesc('');
  };

  const handleDeleteMedia = (plate: string, mediaId: string) => {
    const targetVeiculo = veiculos.find(v => v.placa === plate);
    if (!targetVeiculo) return;

    const updatedVeiculo: Veiculo = {
      ...targetVeiculo,
      fotos_videos: (targetVeiculo.fotos_videos || []).filter(m => m.id !== mediaId)
    };

    onEditVeiculo(updatedVeiculo, targetVeiculo.placa);
    onTriggerToast('Mídia removida com sucesso!', 'success');
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaUrl(reader.result as string);
        if (file.type.startsWith('video/')) {
          setMediaTipo('video');
        } else {
          setMediaTipo('foto');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const hasActiveContract = editingVeiculo
    ? contratos.some(c => c.veiculoPlaca === editingVeiculo.placa && c.status !== 'Finalizado')
    : false;

  // Status counters
  const totalCount = veiculos.length;
  const alugadosCount = veiculos.filter(v => v.status === 'Alugado').length;
  const disponiveisCount = veiculos.filter(v => v.status === 'Disponível').length;
  const emPreparacaoCount = veiculos.filter(v => v.status === 'Em preparação').length;
  const foraFrotaCount = veiculos.filter(v => v.status === 'Fora da frota').length;

  const getSerializedStateFromVehicle = (v: Veiculo | null) => {
    if (v) {
      return JSON.stringify({
        placa: (v.placa || '').toUpperCase().trim(),
        modelo: (v.modelo || '').trim(),
        marca: (v.marca || '').trim(),
        ano: (v.ano?.toString() || '').trim(),
        cor: (v.cor || '').trim(),
        renavam: (v.renavam || '').trim(),
        valor: (v.valor?.toString() || '').trim(),
        valorDiario: (v.valor_diario?.toString() || '').trim(),
        valorSemanal: (v.valor_semanal?.toString() || v.valor?.toString() || '').trim(),
        valorMensal: (v.valor_mensal?.toString() || '').trim(),
        modalidadeAluguel: v.modalidade_aluguel || (v.valor_diario && !v.valor_semanal && !v.valor_mensal ? 'Diário' : v.valor_mensal && !v.valor_semanal && !v.valor_diario ? 'Mensal' : 'Semanal'),
        plataforma: v.plataforma || 'Uber + 99',
        status: v.status || 'Disponível',
        kmInicial: (v.km_inicial?.toString() || v.km?.toString() || '').trim(),
        kmAtual: (v.km_atual?.toString() || v.km?.toString() || '').trim(),
        foto: (v.foto || '').trim(),
        motoristaCpf: v.motoristaCpf || '',
        segurado: v.segurado || false,
        seguroVencimento: v.seguro_vencimento || '',
        seguroParcelas: (v.seguro_parcelas?.toString() || '').trim(),
        seguroFormaPagamento: v.seguro_forma_pagamento || '',
        seguroObs: (v.seguro_obs || '').trim(),
        seguroSeguradora: v.seguro_seguradora || '',
        seguroValor: (v.seguro_valor?.toString() || '').trim(),
        seguroTelefoneCorretora: (v.seguro_telefone_corretora || '').trim(),
        seguroValorFranquia: (v.seguro_valor_franquia?.toString() || '').trim(),
        seguroContratoUrl: (v.seguro_contrato_url || '').trim(),
        seguroApoliceNumero: (v.seguro_apolice_numero || '').trim(),
        seguroVigenciaInicio: v.seguro_vigencia_inicio || '',
        seguroVigenciaFim: v.seguro_vigencia_fim || '',
        seguroTipoCobertura: (v.seguro_tipo_cobertura || '').trim(),
        seguroValorSegurado: (v.seguro_valor_segurado?.toString() || '').trim(),
        seguroCorretorNome: (v.seguro_corretor_nome || '').trim(),
        sinistroOcorreu: v.sinistro_ocorreu || false,
        sinistroDataHora: v.sinistro_data_hora || '',
        sinistroLocal: (v.sinistro_local || '').trim(),
        sinistroTipo: v.sinistro_tipo || '',
        sinistroDescricao: (v.sinistro_descricao || '').trim(),
        sinistroHouveVitimas: v.sinistro_houve_vitimas || '',
        sinistroBoNumero: (v.sinistro_bo_numero || '').trim(),
        sinistroBoData: v.sinistro_bo_data || '',
        sinistroBoDelegacia: (v.sinistro_bo_delegacia || '').trim(),
        sinistroBoAnexoUrl: (v.sinistro_bo_anexo_url || '').trim(),
        sinistroTerceiroNome: (v.sinistro_terceiro_nome || '').trim(),
        sinistroTerceiroCpf: (v.sinistro_terceiro_cpf || '').trim(),
        sinistroTerceiroTelefone: (v.sinistro_terceiro_telefone || '').trim(),
        sinistroTerceiroPlaca: (v.sinistro_terceiro_placa || '').trim(),
        sinistroTerceiroSeguradora: (v.sinistro_terceiro_seguradora || '').trim(),
        sinistroTerceiroApolice: (v.sinistro_terceiro_apolice || '').trim(),
        sinistroAcionamentoData: v.sinistro_acionamento_data || '',
        sinistroAcionamentoProtocolo: (v.sinistro_acionamento_protocolo || '').trim(),
        sinistroAcionamentoAtendente: (v.sinistro_acionamento_atendente || '').trim(),
        sinistroAcionamentoCanal: v.sinistro_acionamento_canal || '',
        sinistroAcionamentoPrazo: v.sinistro_acionamento_prazo || '',
        sinistroAcompanhamentoHistorico: (v.sinistro_acompanhamento_historico || '').trim(),
        sinistroSituacaoAtual: v.sinistro_situacao_atual || '',
        sinistroVistoriaData: v.sinistro_vistoria_data || '',
        sinistroOficinaIndicada: (v.sinistro_oficina_indicada || '').trim(),
        sinistroOrcamentoAprovado: (v.sinistro_orcamento_aprovado?.toString() || '').trim(),
        sinistroDocCnh: v.sinistro_doc_cnh || false,
        sinistroDocCrlv: v.sinistro_doc_crlv || false,
        sinistroDocBo: v.sinistro_doc_bo || false,
        sinistroDocFotos: v.sinistro_doc_fotos || false,
        sinistroDocFormularioAviso: v.sinistro_doc_formulario_aviso || false,
        sinistroDocLaudos: v.sinistro_doc_laudos || false,
        sinistroResolucaoData: v.sinistro_resolucao_data || '',
        sinistroResolucaoTipo: v.sinistro_resolucao_tipo || '',
        sinistroResolucaoValorRecebido: (v.sinistro_resolucao_valor_recebido?.toString() || '').trim(),
        sinistroResolucaoObs: (v.sinistro_resolucao_obs || '').trim(),
        possuiRastreador: v.possui_rastreador || false,
        rastreadorMarca: (v.rastreador_marca || '').trim(),
        rastreadorModelo: (v.rastreador_modelo || '').trim(),
        rastreadorImei: (v.rastreador_imei || '').trim(),
        rastreadorOperadora: (v.rastreador_operadora || '').trim(),
        rastreadorStatus: v.rastreador_status || 'Ativo',
        rastreadorObs: (v.rastreador_obs || '').trim(),
        crlvAnoExercicio: (v.crlv_ano_exercicio?.toString() || '').trim(),
        crlvVencimento: v.crlv_vencimento || '',
        crlvSituacao: v.crlv_situacao || '',
        crlvDigital: v.crlv_digital || false,
        ipvaAnoReferencia: (v.ipva_ano_referencia?.toString() || '').trim(),
        ipvaValorTotal: (v.ipva_valor_total?.toString() || '').trim(),
        ipvaFormaPagamento: v.ipva_forma_pagamento || '',
        ipvaVencimento: v.ipva_vencimento || '',
        ipvaSituacao: v.ipva_situacao || '',
        ipvaDescontoCotaUnica: (v.ipva_desconto_cota_unica?.toString() || '').trim(),
        ipvaP1Valor: (v.ipva_p1_valor?.toString() || '').trim(),
        ipvaP1Vencimento: v.ipva_p1_vencimento || '',
        ipvaP2Valor: (v.ipva_p2_valor?.toString() || '').trim(),
        ipvaP2Vencimento: v.ipva_p2_vencimento || '',
        ipvaP3Valor: (v.ipva_p3_valor?.toString() || '').trim(),
        ipvaP3Vencimento: v.ipva_p3_vencimento || '',
        ipvaP4Valor: (v.ipva_p4_valor?.toString() || '').trim(),
        ipvaP4Vencimento: v.ipva_p4_vencimento || '',
        ipvaP5Valor: (v.ipva_p5_valor?.toString() || '').trim(),
        ipvaP5Vencimento: v.ipva_p5_vencimento || '',
        ipvaP6Valor: (v.ipva_p6_valor?.toString() || '').trim(),
        ipvaP6Vencimento: v.ipva_p6_vencimento || '',
        dpvatAnoReferencia: (v.dpvat_ano_referencia?.toString() || '').trim(),
        dpvatValor: (v.dpvat_valor?.toString() || '').trim(),
        dpvatDataPagamento: v.dpvat_data_pagamento || '',
        dpvatSituacao: v.dpvat_situacao || '',
        multasQuantidade: (v.multas_quantidade?.toString() || '').trim(),
        multasValorTotal: (v.multas_valor_total?.toString() || '').trim(),
        multasSituacao: v.multas_situacao || '',
        multasData: v.multas_data || '',
        vistoriaDataUltima: v.vistoria_data_ultima || '',
        vistoriaResultado: v.vistoria_resultado || '',
        vistoriaVencimento: v.vistoria_vencimento || '',
        vistoriaKmUltima: (v.vistoria_km_ultima?.toString() || '').trim(),
        alienacaoPossui: v.alienacao_possui || false,
        alienacaoCredor: (v.alienacao_credor || '').trim(),
        alienacaoContrato: (v.alienacao_contrato || '').trim(),
        alienacaoPrevisaoBaixa: v.alienacao_previsao_baixa || '',
        alienacaoValorParcela: (v.alienacao_valor_parcela?.toString() || '').trim(),
        alienacaoDataPagamento: v.alienacao_data_pagamento || '',
        alienacaoParcelasRestantes: (v.alienacao_parcelas_restantes?.toString() || '').trim(),
        alienacaoParcelasPagas: (v.alienacao_parcelas_pagas?.toString() || '').trim(),
        recallPendente: v.recall_pendente || false,
        recallDescricao: (v.recall_descricao || '').trim(),
        recallSituacao: v.recall_situacao || '',
        recallData: v.recall_data || '',
        docObservacoes: (v.doc_observacoes || '').trim(),
        documentosAnexos: JSON.stringify(v.documentos_anexos || []),
        possuiDocumentacao: !!(v.crlv_ano_exercicio || v.ipva_ano_referencia || v.dpvat_ano_referencia || (v.multas_quantidade !== undefined && Number(v.multas_quantidade) > 0) || v.vistoria_data_ultima || v.alienacao_possui || v.recall_pendente || v.doc_observacoes)
      });
    } else {
      return JSON.stringify({
        placa: '',
        modelo: '',
        marca: '',
        ano: '',
        cor: '',
        renavam: '',
        valor: '',
        valorDiario: '',
        valorSemanal: '',
        valorMensal: '',
        modalidadeAluguel: 'Semanal',
        plataforma: 'Uber + 99',
        status: 'Disponível',
        kmInicial: '',
        kmAtual: '',
        foto: '',
        motoristaCpf: '',
        segurado: false,
        seguroVencimento: '',
        seguroParcelas: '',
        seguroFormaPagamento: '',
        seguroObs: '',
        seguroSeguradora: '',
        seguroValor: '',
        seguroTelefoneCorretora: '',
        seguroValorFranquia: '',
        seguroContratoUrl: '',
        seguroApoliceNumero: '',
        seguroVigenciaInicio: '',
        seguroVigenciaFim: '',
        seguroTipoCobertura: '',
        seguroValorSegurado: '',
        seguroCorretorNome: '',
        sinistroOcorreu: false,
        sinistroDataHora: '',
        sinistroLocal: '',
        sinistroTipo: '',
        sinistroDescricao: '',
        sinistroHouveVitimas: '',
        sinistroBoNumero: '',
        sinistroBoData: '',
        sinistroBoDelegacia: '',
        sinistroBoAnexoUrl: '',
        sinistroTerceiroNome: '',
        sinistroTerceiroCpf: '',
        sinistroTerceiroTelefone: '',
        sinistroTerceiroPlaca: '',
        sinistroTerceiroSeguradora: '',
        sinistroTerceiroApolice: '',
        sinistroAcionamentoData: '',
        sinistroAcionamentoProtocolo: '',
        sinistroAcionamentoAtendente: '',
        sinistroAcionamentoCanal: '',
        sinistroAcionamentoPrazo: '',
        sinistroAcompanhamentoHistorico: '',
        sinistroSituacaoAtual: '',
        sinistroVistoriaData: '',
        sinistroOficinaIndicada: '',
        sinistroOrcamentoAprovado: '',
        sinistroDocCnh: false,
        sinistroDocCrlv: false,
        sinistroDocBo: false,
        sinistroDocFotos: false,
        sinistroDocFormularioAviso: false,
        sinistroDocLaudos: false,
        sinistroResolucaoData: '',
        sinistroResolucaoTipo: '',
        sinistroResolucaoValorRecebido: '',
        sinistroResolucaoObs: '',
        possuiRastreador: false,
        rastreadorMarca: '',
        rastreadorModelo: '',
        rastreadorImei: '',
        rastreadorOperadora: '',
        rastreadorStatus: 'Ativo',
        rastreadorObs: '',
        crlvAnoExercicio: '',
        crlvVencimento: '',
        crlvSituacao: '',
        crlvDigital: false,
        ipvaAnoReferencia: '',
        ipvaValorTotal: '',
        ipvaFormaPagamento: '',
        ipvaVencimento: '',
        ipvaSituacao: '',
        ipvaP1Valor: '',
        ipvaP1Vencimento: '',
        ipvaP2Valor: '',
        ipvaP2Vencimento: '',
        ipvaP3Valor: '',
        ipvaP3Vencimento: '',
        ipvaP4Valor: '',
        ipvaP4Vencimento: '',
        ipvaP5Valor: '',
        ipvaP5Vencimento: '',
        ipvaP6Valor: '',
        ipvaP6Vencimento: '',
        dpvatAnoReferencia: '',
        dpvatValor: '',
        dpvatDataPagamento: '',
        dpvatSituacao: '',
        multasQuantidade: '',
        multasValorTotal: '',
        multasSituacao: '',
        multasData: '',
        vistoriaDataUltima: '',
        vistoriaResultado: '',
        vistoriaVencimento: '',
        vistoriaKmUltima: '',
        alienacaoPossui: false,
        alienacaoCredor: '',
        alienacaoContrato: '',
        alienacaoPrevisaoBaixa: '',
        alienacaoValorParcela: '',
        alienacaoDataPagamento: '',
        alienacaoParcelasRestantes: '',
        alienacaoParcelasPagas: '',
        recallPendente: false,
        recallDescricao: '',
        recallSituacao: '',
        recallData: '',
        docObservacoes: '',
        documentosAnexos: JSON.stringify([]),
        possuiDocumentacao: false
      });
    }
  };

  const openAddModal = () => {
    setEditingVeiculo(null);
    setPlaca('');
    setModelo('');
    setMarca('');
    setAno('');
    setCor('');
    setRenavam('');
    setValor('');
    setValorDiario('');
    setValorSemanal('');
    setValorMensal('');
    setModalidadeAluguel('Semanal');
    setPlataforma('Uber + 99');
    setStatus('Disponível');
    setKmInicial('');
    setKmAtual('');
    setFoto('');
    setMotoristaCpf('');
    
    // Reset Insurance & Tracker
    setSegurado(false);
    setSeguroVencimento('');
    setSeguroParcelas('');
    setSeguroFormaPagamento('');
    setSeguroObs('');
    setSeguroSeguradora('');
    setSeguroValor('');
    setSeguroTelefoneCorretora('');
    setSeguroValorFranquia('');
    setSeguroContratoUrl('');

    // Reset additional insurance policy and claim fields
    setSeguroApoliceNumero('');
    setSeguroVigenciaInicio('');
    setSeguroVigenciaFim('');
    setSeguroTipoCobertura('');
    setSeguroValorSegurado('');
    setSeguroCorretorNome('');

    setSinistroOcorreu(false);
    setSinistroDataHora('');
    setSinistroLocal('');
    setSinistroTipo('');
    setSinistroDescricao('');
    setSinistroHouveVitimas('');

    setSinistroBoNumero('');
    setSinistroBoData('');
    setSinistroBoDelegacia('');
    setSinistroBoAnexoUrl('');

    setSinistroTerceiroNome('');
    setSinistroTerceiroCpf('');
    setSinistroTerceiroTelefone('');
    setSinistroTerceiroPlaca('');
    setSinistroTerceiroSeguradora('');
    setSinistroTerceiroApolice('');

    setSinistroAcionamentoData('');
    setSinistroAcionamentoProtocolo('');
    setSinistroAcionamentoAtendente('');
    setSinistroAcionamentoCanal('');
    setSinistroAcionamentoPrazo('');

    setSinistroAcompanhamentoHistorico('');
    setSinistroSituacaoAtual('');
    setSinistroVistoriaData('');
    setSinistroOficinaIndicada('');
    setSinistroOrcamentoAprovado('');

    setSinistroDocCnh(false);
    setSinistroDocCrlv(false);
    setSinistroDocBo(false);
    setSinistroDocFotos(false);
    setSinistroDocFormularioAviso(false);
    setSinistroDocLaudos(false);

    setSinistroResolucaoData('');
    setSinistroResolucaoTipo('');
    setSinistroResolucaoValorRecebido('');
    setSinistroResolucaoObs('');
    setPossuiRastreador(false);
    setRastreadorMarca('');
    setRastreadorModelo('');
    setRastreadorImei('');
    setRastreadorOperadora('');
    setRastreadorStatus('Ativo');
    setRastreadorObs('');

    // Reset document detailed states
    setCrlvAnoExercicio('');
    setCrlvVencimento('');
    setCrlvSituacao('');
    setCrlvDigital(false);
    setIpvaAnoReferencia('');
    setIpvaValorTotal('');
    setIpvaFormaPagamento('');
    setIpvaVencimento('');
    setIpvaSituacao('');
    setIpvaDescontoCotaUnica('');
    setIpvaP1Valor('');
    setIpvaP1Vencimento('');
    setIpvaP2Valor('');
    setIpvaP2Vencimento('');
    setIpvaP3Valor('');
    setIpvaP3Vencimento('');
    setIpvaP4Valor('');
    setIpvaP4Vencimento('');
    setIpvaP5Valor('');
    setIpvaP5Vencimento('');
    setIpvaP6Valor('');
    setIpvaP6Vencimento('');
    setDpvatAnoReferencia('');
    setDpvatValor('');
    setDpvatDataPagamento('');
    setDpvatSituacao('');
    setMultasQuantidade('');
    setMultasValorTotal('');
    setMultasSituacao('');
    setMultasData('');
    setVistoriaDataUltima('');
    setVistoriaResultado('');
    setVistoriaVencimento('');
    setVistoriaKmUltima('');
    setAlienacaoPossui(false);
    setAlienacaoCredor('');
    setAlienacaoContrato('');
    setAlienacaoPrevisaoBaixa('');
    setAlienacaoValorParcela('');
    setAlienacaoDataPagamento('');
    setAlienacaoParcelasRestantes('');
    setAlienacaoParcelasPagas('');
    setRecallPendente(false);
    setRecallDescricao('');
    setRecallSituacao('');
    setRecallData('');
    setDocObservacoes('');
    setDocumentosAnexos([]);
    setPossuiDocumentacao(false);
    setOriginalFormStateJson(getSerializedStateFromVehicle(null));

    setIsModalOpen(true);
  };

  const openEditModal = (v: Veiculo) => {
    setEditingVeiculo(v);
    setPlaca(v.placa);
    setModelo(v.modelo);
    setMarca(v.marca);
    setAno(v.ano.toString());
    setCor(v.cor);
    setRenavam(v.renavam);
    setValor(v.valor.toString());
    setValorDiario(v.valor_diario?.toString() || '');
    setValorSemanal(v.valor_semanal?.toString() || v.valor?.toString() || '');
    setValorMensal(v.valor_mensal?.toString() || '');
    setModalidadeAluguel(
      v.modalidade_aluguel ||
      (v.valor_diario && !v.valor_semanal && !v.valor_mensal ? 'Diário' :
       v.valor_mensal && !v.valor_semanal && !v.valor_diario ? 'Mensal' : 'Semanal')
    );
    setPlataforma(v.plataforma);
    setStatus(v.status);
    setKmInicial(v.km_inicial?.toString() || v.km?.toString() || '');
    setKmAtual(v.km_atual?.toString() || v.km?.toString() || '');
    setFoto(v.foto || '');
    setMotoristaCpf(v.motoristaCpf || '');

    // Load Insurance & Tracker
    setSegurado(v.segurado || false);
    setSeguroVencimento(v.seguro_vencimento || '');
    setSeguroParcelas(v.seguro_parcelas?.toString() || '');
    setSeguroFormaPagamento(v.seguro_forma_pagamento || '');
    setSeguroObs(v.seguro_obs || '');
    setSeguroSeguradora(v.seguro_seguradora || '');
    setSeguroValor(v.seguro_valor?.toString() || '');
    setSeguroTelefoneCorretora(v.seguro_telefone_corretora || '');
    setSeguroValorFranquia(v.seguro_valor_franquia?.toString() || '');
    setSeguroContratoUrl(v.seguro_contrato_url || '');

    // Load additional insurance policy and claim fields
    setSeguroApoliceNumero(v.seguro_apolice_numero || '');
    setSeguroVigenciaInicio(v.seguro_vigencia_inicio || '');
    setSeguroVigenciaFim(v.seguro_vigencia_fim || '');
    setSeguroTipoCobertura(v.seguro_tipo_cobertura || '');
    setSeguroValorSegurado(v.seguro_valor_segurado?.toString() || '');
    setSeguroCorretorNome(v.seguro_corretor_nome || '');

    setSinistroOcorreu(v.sinistro_ocorreu || false);
    setSinistroDataHora(v.sinistro_data_hora || '');
    setSinistroLocal(v.sinistro_local || '');
    setSinistroTipo(v.sinistro_tipo || '');
    setSinistroDescricao(v.sinistro_descricao || '');
    setSinistroHouveVitimas(v.sinistro_houve_vitimas || '');

    setSinistroBoNumero(v.sinistro_bo_numero || '');
    setSinistroBoData(v.sinistro_bo_data || '');
    setSinistroBoDelegacia(v.sinistro_bo_delegacia || '');
    setSinistroBoAnexoUrl(v.sinistro_bo_anexo_url || '');

    setSinistroTerceiroNome(v.sinistro_terceiro_nome || '');
    setSinistroTerceiroCpf(v.sinistro_terceiro_cpf || '');
    setSinistroTerceiroTelefone(v.sinistro_terceiro_telefone || '');
    setSinistroTerceiroPlaca(v.sinistro_terceiro_placa || '');
    setSinistroTerceiroSeguradora(v.sinistro_terceiro_seguradora || '');
    setSinistroTerceiroApolice(v.sinistro_terceiro_apolice || '');

    setSinistroAcionamentoData(v.sinistro_acionamento_data || '');
    setSinistroAcionamentoProtocolo(v.sinistro_acionamento_protocolo || '');
    setSinistroAcionamentoAtendente(v.sinistro_acionamento_atendente || '');
    setSinistroAcionamentoCanal(v.sinistro_acionamento_canal || '');
    setSinistroAcionamentoPrazo(v.sinistro_acionamento_prazo || '');

    setSinistroAcompanhamentoHistorico(v.sinistro_acompanhamento_historico || '');
    setSinistroSituacaoAtual(v.sinistro_situacao_atual || '');
    setSinistroVistoriaData(v.sinistro_vistoria_data || '');
    setSinistroOficinaIndicada(v.sinistro_oficina_indicada || '');
    setSinistroOrcamentoAprovado(v.sinistro_orcamento_aprovado?.toString() || '');

    setSinistroDocCnh(v.sinistro_doc_cnh || false);
    setSinistroDocCrlv(v.sinistro_doc_crlv || false);
    setSinistroDocBo(v.sinistro_doc_bo || false);
    setSinistroDocFotos(v.sinistro_doc_fotos || false);
    setSinistroDocFormularioAviso(v.sinistro_doc_formulario_aviso || false);
    setSinistroDocLaudos(v.sinistro_doc_laudos || false);

    setSinistroResolucaoData(v.sinistro_resolucao_data || '');
    setSinistroResolucaoTipo(v.sinistro_resolucao_tipo || '');
    setSinistroResolucaoValorRecebido(v.sinistro_resolucao_valor_recebido?.toString() || '');
    setSinistroResolucaoObs(v.sinistro_resolucao_obs || '');
    setPossuiRastreador(v.possui_rastreador || false);
    setRastreadorMarca(v.rastreador_marca || '');
    setRastreadorModelo(v.rastreador_modelo || '');
    setRastreadorImei(v.rastreador_imei || '');
    setRastreadorOperadora(v.rastreador_operadora || '');
    setRastreadorStatus(v.rastreador_status || 'Ativo');
    setRastreadorObs(v.rastreador_obs || '');

    // Load document detailed states
    setCrlvAnoExercicio(v.crlv_ano_exercicio?.toString() || '');
    setCrlvVencimento(v.crlv_vencimento || '');
    setCrlvSituacao(v.crlv_situacao || '');
    setCrlvDigital(v.crlv_digital || false);
    setIpvaAnoReferencia(v.ipva_ano_referencia?.toString() || '');
    setIpvaValorTotal(v.ipva_valor_total?.toString() || '');
    setIpvaFormaPagamento(v.ipva_forma_pagamento || '');
    setIpvaVencimento(v.ipva_vencimento || '');
    setIpvaSituacao(v.ipva_situacao || '');
    setIpvaDescontoCotaUnica(v.ipva_desconto_cota_unica?.toString() || '');
    setIpvaP1Valor(v.ipva_p1_valor?.toString() || '');
    setIpvaP1Vencimento(v.ipva_p1_vencimento || '');
    setIpvaP2Valor(v.ipva_p2_valor?.toString() || '');
    setIpvaP2Vencimento(v.ipva_p2_vencimento || '');
    setIpvaP3Valor(v.ipva_p3_valor?.toString() || '');
    setIpvaP3Vencimento(v.ipva_p3_vencimento || '');
    setIpvaP4Valor(v.ipva_p4_valor?.toString() || '');
    setIpvaP4Vencimento(v.ipva_p4_vencimento || '');
    setIpvaP5Valor(v.ipva_p5_valor?.toString() || '');
    setIpvaP5Vencimento(v.ipva_p5_vencimento || '');
    setIpvaP6Valor(v.ipva_p6_valor?.toString() || '');
    setIpvaP6Vencimento(v.ipva_p6_vencimento || '');
    setDpvatAnoReferencia(v.dpvat_ano_referencia?.toString() || '');
    setDpvatValor(v.dpvat_valor?.toString() || '');
    setDpvatDataPagamento(v.dpvat_data_pagamento || '');
    setDpvatSituacao(v.dpvat_situacao || '');
    setMultasQuantidade(v.multas_quantidade?.toString() || '');
    setMultasValorTotal(v.multas_valor_total?.toString() || '');
    setMultasSituacao(v.multas_situacao || '');
    setMultasData(v.multas_data || '');
    setVistoriaDataUltima(v.vistoria_data_ultima || '');
    setVistoriaResultado(v.vistoria_resultado || '');
    setVistoriaVencimento(v.vistoria_vencimento || '');
    setVistoriaKmUltima(v.vistoria_km_ultima?.toString() || '');
    setAlienacaoPossui(v.alienacao_possui || false);
    setAlienacaoCredor(v.alienacao_credor || '');
    setAlienacaoContrato(v.alienacao_contrato || '');
    setAlienacaoPrevisaoBaixa(v.alienacao_previsao_baixa || '');
    setAlienacaoValorParcela(v.alienacao_valor_parcela?.toString() || '');
    setAlienacaoDataPagamento(v.alienacao_data_pagamento || '');
    setAlienacaoParcelasRestantes(v.alienacao_parcelas_restantes?.toString() || '');
    setAlienacaoParcelasPagas(v.alienacao_parcelas_pagas?.toString() || '');
    setRecallPendente(v.recall_pendente || false);
    setRecallDescricao(v.recall_descricao || '');
    setRecallSituacao(v.recall_situacao || '');
    setRecallData(v.recall_data || '');
    setDocObservacoes(v.doc_observacoes || '');
    setDocumentosAnexos(v.documentos_anexos || []);
    setPossuiDocumentacao(
      !!v.crlv_ano_exercicio ||
      !!v.crlv_vencimento ||
      !!v.crlv_situacao ||
      !!v.crlv_digital ||
      !!v.ipva_ano_referencia ||
      !!v.ipva_valor_total ||
      !!v.ipva_forma_pagamento ||
      !!v.ipva_vencimento ||
      !!v.ipva_situacao ||
      !!v.ipva_p1_valor ||
      !!v.ipva_p2_valor ||
      !!v.ipva_p3_valor ||
      !!v.ipva_p4_valor ||
      !!v.ipva_p5_valor ||
      !!v.ipva_p6_valor ||
      !!v.dpvat_ano_referencia ||
      !!v.dpvat_valor ||
      !!v.dpvat_data_pagamento ||
      !!v.dpvat_situacao ||
      !!v.multas_quantidade ||
      !!v.multas_valor_total ||
      !!v.multas_situacao ||
      !!v.multas_data ||
      !!v.vistoria_data_ultima ||
      !!v.vistoria_resultado ||
      !!v.vistoria_vencimento ||
      !!v.vistoria_km_ultima ||
      !!v.alienacao_possui ||
      !!v.alienacao_credor ||
      !!v.alienacao_contrato ||
      !!v.alienacao_previsao_baixa ||
      !!v.alienacao_valor_parcela ||
      !!v.alienacao_data_pagamento ||
      !!v.alienacao_parcelas_restantes ||
      !!v.alienacao_parcelas_pagas ||
      !!v.recall_pendente ||
      !!v.recall_descricao ||
      !!v.recall_situacao ||
      !!v.recall_data ||
      !!v.doc_observacoes ||
      !!v.documentos_anexos?.length
    );
    setOriginalFormStateJson(getSerializedStateFromVehicle(v));

    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!placa || !modelo || !ano || !kmInicial || !kmAtual) {
      onTriggerToast('Por favor, preencha todos os campos obrigatórios (*)!', 'error');
      return;
    }
    
    const normalizedPlaca = placa.toUpperCase().trim();
    
    // UNIQUE PLATE VALIDATION
    if (!editingVeiculo || editingVeiculo.placa !== normalizedPlaca) {
      const placaExists = veiculos.some(v => v.placa === normalizedPlaca);
      if (placaExists) {
        onTriggerToast('Já existe um veículo cadastrado com esta placa!', 'error');
        return;
      }
    }

    const initialKmNum = parseInt(kmInicial) || 0;
    const currentKmNum = parseInt(kmAtual) || 0;

    if (currentKmNum < initialKmNum) {
      onTriggerToast('O KM Atual não pode ser menor do que o KM Inicial!', 'error');
      return;
    }

    const veiculoData: Veiculo = {
      placa: placa.toUpperCase().trim(),
      modelo: modelo.trim(),
      marca: marca.trim() || 'Desconhecida',
      ano: isNaN(Number(ano)) ? ano.trim() : (parseInt(ano) || 2022),
      cor: cor.trim() || 'Não informada',
      renavam: renavam.trim(),
      valor: 0,
      plataforma,
      status,
      km_inicial: initialKmNum,
      km_atual: currentKmNum,
      km: currentKmNum, // Sync for backward compatibility
      foto: foto || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=60&w=200',
      motoristaCpf: motoristaCpf || undefined,
      fotos_videos: editingVeiculo?.fotos_videos || [],
      
      // New Insurance & Tracker fields
      segurado,
      seguro_vencimento: seguroVencimento || undefined,
      seguro_parcelas: seguroParcelas ? parseInt(seguroParcelas) : undefined,
      seguro_forma_pagamento: seguroFormaPagamento || undefined,
      seguro_obs: seguroObs || undefined,
      seguro_seguradora: seguroSeguradora || undefined,
      seguro_valor: seguroValor ? parseFloat(seguroValor) : undefined,
      seguro_telefone_corretora: seguroTelefoneCorretora || undefined,
      seguro_valor_franquia: seguroValorFranquia ? parseFloat(seguroValorFranquia) : undefined,
      seguro_contrato_url: seguroContratoUrl || undefined,

      // Additional insurance policy fields
      seguro_apolice_numero: seguroApoliceNumero || undefined,
      seguro_vigencia_inicio: seguroVigenciaInicio || undefined,
      seguro_vigencia_fim: seguroVigenciaFim || undefined,
      seguro_tipo_cobertura: seguroTipoCobertura || undefined,
      seguro_valor_segurado: seguroValorSegurado ? parseFloat(seguroValorSegurado) : undefined,
      seguro_corretor_nome: seguroCorretorNome || undefined,

      // Claim (Sinistro) fields
      sinistro_ocorreu: sinistroOcorreu,
      sinistro_data_hora: sinistroDataHora || undefined,
      sinistro_local: sinistroLocal || undefined,
      sinistro_tipo: sinistroTipo || undefined,
      sinistro_descricao: sinistroDescricao || undefined,
      sinistro_houve_vitimas: sinistroHouveVitimas || undefined,

      sinistro_bo_numero: sinistroBoNumero || undefined,
      sinistro_bo_data: sinistroBoData || undefined,
      sinistro_bo_delegacia: sinistroBoDelegacia || undefined,
      sinistro_bo_anexo_url: sinistroBoAnexoUrl || undefined,

      sinistro_terceiro_nome: sinistroTerceiroNome || undefined,
      sinistro_terceiro_cpf: sinistroTerceiroCpf || undefined,
      sinistro_terceiro_telefone: sinistroTerceiroTelefone || undefined,
      sinistro_terceiro_placa: sinistroTerceiroPlaca || undefined,
      sinistro_terceiro_seguradora: sinistroTerceiroSeguradora || undefined,
      sinistro_terceiro_apolice: sinistroTerceiroApolice || undefined,

      sinistro_acionamento_data: sinistroAcionamentoData || undefined,
      sinistro_acionamento_protocolo: sinistroAcionamentoProtocolo || undefined,
      sinistro_acionamento_atendente: sinistroAcionamentoAtendente || undefined,
      sinistro_acionamento_canal: sinistroAcionamentoCanal || undefined,
      sinistro_acionamento_prazo: sinistroAcionamentoPrazo || undefined,

      sinistro_acompanhamento_historico: sinistroAcompanhamentoHistorico || undefined,
      sinistro_situacao_atual: sinistroSituacaoAtual || undefined,
      sinistro_vistoria_data: sinistroVistoriaData || undefined,
      sinistro_oficina_indicada: sinistroOficinaIndicada || undefined,
      sinistro_orcamento_aprovado: sinistroOrcamentoAprovado ? parseFloat(sinistroOrcamentoAprovado) : undefined,

      sinistro_doc_cnh: sinistroDocCnh,
      sinistro_doc_crlv: sinistroDocCrlv,
      sinistro_doc_bo: sinistroDocBo,
      sinistro_doc_fotos: sinistroDocFotos,
      sinistro_doc_formulario_aviso: sinistroDocFormularioAviso,
      sinistro_doc_laudos: sinistroDocLaudos,

      sinistro_resolucao_data: sinistroResolucaoData || undefined,
      sinistro_resolucao_tipo: sinistroResolucaoTipo || undefined,
      sinistro_resolucao_valor_recebido: sinistroResolucaoValorRecebido ? parseFloat(sinistroResolucaoValorRecebido) : undefined,
      sinistro_resolucao_obs: sinistroResolucaoObs || undefined,

      possui_rastreador: possuiRastreador,
      rastreador_marca: rastreadorMarca || undefined,
      rastreador_modelo: rastreadorModelo || undefined,
      rastreador_imei: rastreadorImei || undefined,
      rastreador_operadora: rastreadorOperadora || undefined,
      rastreador_status: rastreadorStatus || undefined,
      rastreador_obs: rastreadorObs || undefined,

      // New Document fields saved in veiculoData
      crlv_ano_exercicio: crlvAnoExercicio ? parseInt(crlvAnoExercicio) : undefined,
      crlv_vencimento: crlvVencimento || undefined,
      crlv_situacao: crlvSituacao || undefined,
      crlv_digital: crlvDigital,
      ipva_ano_referencia: ipvaAnoReferencia ? parseInt(ipvaAnoReferencia) : undefined,
      ipva_valor_total: ipvaValorTotal ? parseFloat(ipvaValorTotal) : undefined,
      ipva_forma_pagamento: ipvaFormaPagamento || undefined,
      ipva_vencimento: ipvaVencimento || undefined,
      ipva_situacao: ipvaSituacao || undefined,
      ipva_desconto_cota_unica: ipvaDescontoCotaUnica ? parseFloat(ipvaDescontoCotaUnica) : undefined,
      ipva_p1_valor: ipvaP1Valor ? parseFloat(ipvaP1Valor) : undefined,
      ipva_p1_vencimento: ipvaP1Vencimento || undefined,
      ipva_p2_valor: ipvaP2Valor ? parseFloat(ipvaP2Valor) : undefined,
      ipva_p2_vencimento: ipvaP2Vencimento || undefined,
      ipva_p3_valor: ipvaP3Valor ? parseFloat(ipvaP3Valor) : undefined,
      ipva_p3_vencimento: ipvaP3Vencimento || undefined,
      ipva_p4_valor: ipvaP4Valor ? parseFloat(ipvaP4Valor) : undefined,
      ipva_p4_vencimento: ipvaP4Vencimento || undefined,
      ipva_p5_valor: ipvaP5Valor ? parseFloat(ipvaP5Valor) : undefined,
      ipva_p5_vencimento: ipvaP5Vencimento || undefined,
      ipva_p6_valor: ipvaP6Valor ? parseFloat(ipvaP6Valor) : undefined,
      ipva_p6_vencimento: ipvaP6Vencimento || undefined,
      dpvat_ano_referencia: dpvatAnoReferencia ? parseInt(dpvatAnoReferencia) : undefined,
      dpvat_valor: dpvatValor ? parseFloat(dpvatValor) : undefined,
      dpvat_data_pagamento: dpvatDataPagamento || undefined,
      dpvat_situacao: dpvatSituacao || undefined,
      multas_quantidade: multasQuantidade ? parseInt(multasQuantidade) : undefined,
      multas_valor_total: multasValorTotal ? parseFloat(multasValorTotal) : undefined,
      multas_situacao: multasSituacao || undefined,
      multas_data: multasData || undefined,
      vistoria_data_ultima: vistoriaDataUltima || undefined,
      vistoria_resultado: vistoriaResultado || undefined,
      vistoria_vencimento: vistoriaVencimento || undefined,
      vistoria_km_ultima: vistoriaKmUltima ? parseInt(vistoriaKmUltima) : undefined,
      alienacao_possui: alienacaoPossui,
      alienacao_credor: alienacaoCredor || undefined,
      alienacao_contrato: alienacaoContrato || undefined,
      alienacao_previsao_baixa: alienacaoPrevisaoBaixa || undefined,
      alienacao_valor_parcela: alienacaoValorParcela ? parseFloat(alienacaoValorParcela) : undefined,
      alienacao_data_pagamento: alienacaoDataPagamento || undefined,
      alienacao_parcelas_restantes: alienacaoParcelasRestantes ? parseInt(alienacaoParcelasRestantes) : undefined,
      alienacao_parcelas_pagas: alienacaoParcelasPagas ? parseInt(alienacaoParcelasPagas) : undefined,
      recall_pendente: recallPendente,
      recall_descricao: recallDescricao || undefined,
      recall_situacao: recallSituacao || undefined,
      recall_data: recallData || undefined,
      doc_observacoes: docObservacoes || undefined,
      documentos_anexos: documentosAnexos
    };

    const vPends = getVehiclePendencies(veiculoData);
    if (vPends.length > 0) {
      setPendenciesToConfirm({
        list: vPends,
        data: veiculoData
      });
      return;
    }

    executeSave(veiculoData);
  };

  const getVehiclePendencies = (v: Veiculo) => {
    const pends: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    
    if (v.status === 'Em preparação') {
      pends.push(`Status do Veículo: Em preparação`);
    }
    if (v.status === 'Fora da frota') {
      pends.push(`Status do Veículo: Fora da frota`);
    }
    if (!v.segurado) {
      pends.push(`Veículo sem Seguro Ativo`);
    } else if (v.seguro_vencimento && v.seguro_vencimento < todayStr) {
      pends.push(`Seguro do Veículo Vencido (Vencimento: ${v.seguro_vencimento.split('-').reverse().join('/')})`);
    }
    if (v.crlv_vencimento && v.crlv_vencimento < todayStr) {
      pends.push(`CRLV do Veículo Vencido (Vencimento: ${v.crlv_vencimento.split('-').reverse().join('/')})`);
    } else if (v.crlv_situacao === 'Vencido') {
      pends.push(`CRLV do Veículo com Situação: Vencido`);
    }
    if (v.ipva_vencimento && v.ipva_vencimento < todayStr) {
      pends.push(`IPVA do Veículo Vencido (Vencimento: ${v.ipva_vencimento.split('-').reverse().join('/')})`);
    } else if (v.ipva_situacao === 'Pendente') {
      pends.push(`IPVA do Veículo com Situação: Pendente`);
    }
    if (v.vistoria_vencimento && v.vistoria_vencimento < todayStr) {
      pends.push(`Laudo de Vistoria do Veículo Vencido (Vencimento: ${v.vistoria_vencimento.split('-').reverse().join('/')})`);
    } else if (v.vistoria_resultado === 'Reprovado') {
      pends.push(`Laudo de Vistoria do Veículo: Reprovado`);
    }
    return pends;
  };

  const executeSave = (veiculoData: Veiculo) => {
    if (editingVeiculo) {
      onEditVeiculo(veiculoData, editingVeiculo.placa);
      onTriggerToast(`Veículo ${veiculoData.placa} atualizado com sucesso!`, 'success');
    } else {
      if (veiculos.some(v => v.placa === veiculoData.placa)) {
        onTriggerToast(`A placa ${veiculoData.placa} já está cadastrada!`, 'error');
        return;
      }
      onAddVeiculo(veiculoData);
      onTriggerToast(`Veículo ${veiculoData.placa} cadastrado com sucesso!`, 'success');
    }
    setIsModalOpen(false);
  };

  const handleArchiveClick = (placaToArchive: string) => {
    setArchivePlaca(placaToArchive);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archivePlaca) return;
    if (!archiveMotivo.trim()) {
      onTriggerToast('Por favor, insira o motivo do arquivamento.', 'error');
      return;
    }
    onArchiveVeiculo(archivePlaca, archiveMotivo.trim());
    onTriggerToast(`Veículo ${archivePlaca} movido para o Arquivo Morto!`, 'success');
    setArchivePlaca(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getSerializedFormState = () => {
    return JSON.stringify({
      placa: placa.toUpperCase().trim(),
      modelo: modelo.trim(),
      marca: marca.trim(),
      ano: ano.trim(),
      cor: cor.trim(),
      renavam: renavam.trim(),
      valor: valor.trim(),
      valorDiario: valorDiario.trim(),
      valorSemanal: valorSemanal.trim(),
      valorMensal: valorMensal.trim(),
      modalidadeAluguel,
      plataforma,
      status,
      kmInicial: kmInicial.trim(),
      kmAtual: kmAtual.trim(),
      foto: foto.trim(),
      motoristaCpf,
      segurado,
      seguroVencimento,
      seguroParcelas: seguroParcelas.trim(),
      seguroFormaPagamento,
      seguroObs: seguroObs.trim(),
      seguroSeguradora,
      seguroValor: seguroValor.trim(),
      seguroTelefoneCorretora: seguroTelefoneCorretora.trim(),
      seguroValorFranquia: seguroValorFranquia.trim(),
      seguroContratoUrl: seguroContratoUrl.trim(),
      seguroApoliceNumero: seguroApoliceNumero.trim(),
      seguroVigenciaInicio,
      seguroVigenciaFim,
      seguroTipoCobertura: seguroTipoCobertura.trim(),
      seguroValorSegurado: seguroValorSegurado.trim(),
      seguroCorretorNome: seguroCorretorNome.trim(),
      sinistroOcorreu,
      sinistroDataHora,
      sinistroLocal: sinistroLocal.trim(),
      sinistroTipo,
      sinistroDescricao: sinistroDescricao.trim(),
      sinistroHouveVitimas,
      sinistroBoNumero: sinistroBoNumero.trim(),
      sinistroBoData,
      sinistroBoDelegacia: sinistroBoDelegacia.trim(),
      sinistroBoAnexoUrl: sinistroBoAnexoUrl.trim(),
      sinistroTerceiroNome: sinistroTerceiroNome.trim(),
      sinistroTerceiroCpf: sinistroTerceiroCpf.trim(),
      sinistroTerceiroTelefone: sinistroTerceiroTelefone.trim(),
      sinistroTerceiroPlaca: sinistroTerceiroPlaca.trim(),
      sinistroTerceiroSeguradora: sinistroTerceiroSeguradora.trim(),
      sinistroTerceiroApolice: sinistroTerceiroApolice.trim(),
      sinistroAcionamentoData,
      sinistroAcionamentoProtocolo: sinistroAcionamentoProtocolo.trim(),
      sinistroAcionamentoAtendente: sinistroAcionamentoAtendente.trim(),
      sinistroAcionamentoCanal,
      sinistroAcionamentoPrazo,
      sinistroAcompanhamentoHistorico: sinistroAcompanhamentoHistorico.trim(),
      sinistroSituacaoAtual,
      sinistroVistoriaData,
      sinistroOficinaIndicada: sinistroOficinaIndicada.trim(),
      sinistroOrcamentoAprovado: sinistroOrcamentoAprovado.trim(),
      sinistroDocCnh,
      sinistroDocCrlv,
      sinistroDocBo,
      sinistroDocFotos,
      sinistroDocFormularioAviso,
      sinistroDocLaudos,
      sinistroResolucaoData,
      sinistroResolucaoTipo,
      sinistroResolucaoValorRecebido: sinistroResolucaoValorRecebido.trim(),
      sinistroResolucaoObs: sinistroResolucaoObs.trim(),
      possuiRastreador,
      rastreadorMarca: rastreadorMarca.trim(),
      rastreadorModelo: rastreadorModelo.trim(),
      rastreadorImei: rastreadorImei.trim(),
      rastreadorOperadora: rastreadorOperadora.trim(),
      rastreadorStatus,
      rastreadorObs: rastreadorObs.trim(),
      crlvAnoExercicio: crlvAnoExercicio.trim(),
      crlvVencimento,
      crlvSituacao,
      crlvDigital,
      ipvaAnoReferencia: ipvaAnoReferencia.trim(),
      ipvaValorTotal: ipvaValorTotal.trim(),
      ipvaFormaPagamento,
      ipvaVencimento,
      ipvaSituacao,
      ipvaP1Valor: ipvaP1Valor.trim(),
      ipvaP1Vencimento,
      ipvaP2Valor: ipvaP2Valor.trim(),
      ipvaP2Vencimento,
      ipvaP3Valor: ipvaP3Valor.trim(),
      ipvaP3Vencimento,
      ipvaP4Valor: ipvaP4Valor.trim(),
      ipvaP4Vencimento,
      ipvaP5Valor: ipvaP5Valor.trim(),
      ipvaP5Vencimento,
      ipvaP6Valor: ipvaP6Valor.trim(),
      ipvaP6Vencimento,
      dpvatAnoReferencia: dpvatAnoReferencia.trim(),
      dpvatValor: dpvatValor.trim(),
      dpvatDataPagamento,
      dpvatSituacao,
      multasQuantidade: multasQuantidade.trim(),
      multasValorTotal: multasValorTotal.trim(),
      multasSituacao,
      multasData,
      vistoriaDataUltima,
      vistoriaResultado,
      vistoriaVencimento,
      vistoriaKmUltima: vistoriaKmUltima.trim(),
      alienacaoPossui,
      alienacaoCredor: alienacaoCredor.trim(),
      alienacaoContrato: alienacaoContrato.trim(),
      alienacaoPrevisaoBaixa,
      alienacaoValorParcela: alienacaoValorParcela.trim(),
      alienacaoDataPagamento,
      alienacaoParcelasRestantes: alienacaoParcelasRestantes.trim(),
      alienacaoParcelasPagas: alienacaoParcelasPagas.trim(),
      recallPendente,
      recallDescricao: recallDescricao.trim(),
      recallSituacao,
      recallData,
      docObservacoes: docObservacoes.trim(),
      documentosAnexos: JSON.stringify(documentosAnexos),
      possuiDocumentacao
    });
  };

  const isFormDirty = () => {
    return originalFormStateJson !== getSerializedFormState();
  };

  const handleCloseModalAttempt = () => {
    if (isFormDirty()) {
      setShowUnsavedConfirm(true);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedConfirm(false);
    setIsModalOpen(false);
    onTriggerToast('As alterações não foram salvas pois você não confirmou as alterações!', 'warning');
  };

  const getFormPendencias = () => {
    const pends: { id: string; tipo: 'documento' | 'seguro' | 'recall' | 'rastreador'; titulo: string; desc: string; nivel: 'urgente' | 'alerta' }[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. IPVA situation
    if (ipvaSituacao === 'Pendente') {
      pends.push({
        id: 'ipva-pendente',
        tipo: 'documento',
        titulo: 'IPVA Pendente / Atrasado',
        desc: 'O IPVA está marcado como Pendente de pagamento.',
        nivel: 'urgente'
      });
    } else if (ipvaVencimento && ipvaVencimento < todayStr && ipvaSituacao !== 'Pago') {
      pends.push({
        id: 'ipva-vencido',
        tipo: 'documento',
        titulo: 'IPVA Vencido',
        desc: `O prazo do IPVA expirou em ${ipvaVencimento.split('-').reverse().join('/')} e a situação não é Pago.`,
        nivel: 'urgente'
      });
    }

    // 2. CRLV situation
    if (crlvSituacao === 'Vencido') {
      pends.push({
        id: 'crlv-vencido',
        tipo: 'documento',
        titulo: 'CRLV Vencido',
        desc: 'A situação do CRLV está marcada como Vencida.',
        nivel: 'urgente'
      });
    } else if (crlvVencimento && crlvVencimento < todayStr && crlvSituacao !== 'Em dia') {
      pends.push({
        id: 'crlv-vencido-data',
        tipo: 'documento',
        titulo: 'CRLV Vencido (Data)',
        desc: `O vencimento do CRLV expirou em ${crlvVencimento.split('-').reverse().join('/')}.`,
        nivel: 'urgente'
      });
    }

    // 3. Recall alerts
    if (recallPendente) {
      pends.push({
        id: 'recall-pendente',
        tipo: 'recall',
        titulo: 'Recall Pendente',
        desc: `Existe recall de fábrica ativo: "${recallDescricao || 'Informar fabricante'}".`,
        nivel: 'urgente'
      });
    }

    // 4. Pending fines (multas)
    if (multasSituacao === 'Pendente') {
      pends.push({
        id: 'multas-pendentes',
        tipo: 'documento',
        titulo: 'Multas Pendentes',
        desc: 'Este veículo possui multas marcadas como pendentes de pagamento.',
        nivel: 'alerta'
      });
    }

    // 5. Expired vistoria
    if (vistoriaVencimento && vistoriaVencimento < todayStr) {
      pends.push({
        id: 'vistoria-vencida',
        tipo: 'documento',
        titulo: 'Vistoria Vencida',
        desc: `A validade da última vistoria expirou em ${vistoriaVencimento.split('-').reverse().join('/')}.`,
        nivel: 'alerta'
      });
    }

    // 6. Insurance (Seguro) details
    if (!segurado) {
      pends.push({
        id: 'seguro-ausente',
        tipo: 'seguro',
        titulo: 'Sem Seguro Ativo',
        desc: 'Este veículo está cadastrado sem seguro ativo.',
        nivel: 'urgente'
      });
    } else if (seguroVencimento && seguroVencimento < todayStr) {
      pends.push({
        id: 'seguro-vencido',
        tipo: 'seguro',
        titulo: 'Seguro Vencido',
        desc: `A vigência do seguro venceu em ${seguroVencimento.split('-').reverse().join('/')}.`,
        nivel: 'urgente'
      });
    }

    // 7. Rastreador
    if (!possuiRastreador) {
      pends.push({
        id: 'rastreador-ausente',
        tipo: 'rastreador',
        titulo: 'Rastreador Não Instalado',
        desc: 'Este veículo está configurado sem rastreador integrado.',
        nivel: 'alerta'
      });
    } else if (rastreadorStatus !== 'Ativo') {
      pends.push({
        id: 'rastreador-irregular',
        tipo: 'rastreador',
        titulo: 'Rastreador Irregular',
        desc: `O rastreador possui o status "${rastreadorStatus || 'Inativo'}".`,
        nivel: 'urgente'
      });
    }

    // 8. DPVAT
    if (dpvatSituacao === 'Pendente') {
      pends.push({
        id: 'dpvat-pendente',
        tipo: 'documento',
        titulo: 'DPVAT Pendente',
        desc: 'O DPVAT deste veículo está marcado como Pendente de pagamento.',
        nivel: 'alerta'
      });
    }

    return pends;
  };

  const getVeiculoPendencias = (v: Veiculo) => {
    const pends: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. IPVA situation
    if (v.ipva_situacao === 'Pendente') {
      pends.push(`IPVA Pendente / Atrasado`);
    } else if (v.ipva_vencimento && v.ipva_vencimento < todayStr && v.ipva_situacao !== 'Pago') {
      pends.push(`IPVA Vencido em ${v.ipva_vencimento.split('-').reverse().join('/')}`);
    }

    // 2. CRLV situation
    if (v.crlv_situacao === 'Vencido') {
      pends.push(`CRLV Vencido`);
    } else if (v.crlv_vencimento && v.crlv_vencimento < todayStr && v.crlv_situacao !== 'Em dia') {
      pends.push(`CRLV Vencido em ${v.crlv_vencimento.split('-').reverse().join('/')}`);
    }

    // 3. Recall alerts
    if (v.recall_pendente) {
      pends.push(`Recall Pendente: ${v.recall_descricao || 'Informar fabricante'}`);
    }

    // 4. Pending fines (multas)
    if (v.multas_situacao === 'Pendente') {
      const valStr = v.multas_valor_total ? ` (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.multas_valor_total)})` : '';
      pends.push(`Multas Pendentes${valStr}`);
    }

    // 5. Expired vistoria
    if (v.vistoria_vencimento && v.vistoria_vencimento < todayStr) {
      pends.push(`Vistoria Vencida em ${v.vistoria_vencimento.split('-').reverse().join('/')}`);
    }

    // 6. Insurance (Seguro) details
    if (!v.segurado) {
      pends.push(`Sem seguro ativo`);
    } else if (v.seguro_vencimento && v.seguro_vencimento < todayStr) {
      pends.push(`Seguro Vencido em ${v.seguro_vencimento.split('-').reverse().join('/')}`);
    }

    // 7. Unpaid maintenance expenses from pagamentos
    const vehicleExpenses = pagamentos.filter(p => p.isDespesa && p.veiculoPlaca === v.placa && p.status !== 'Pago');
    if (vehicleExpenses.length > 0) {
      const totalExp = vehicleExpenses.reduce((sum, p) => sum + p.valor, 0);
      pends.push(`Despesas em Aberto: ${vehicleExpenses.length} pendente(s) (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExp)})`);
    }

    // 8. Rastreador
    if (!v.possui_rastreador) {
      pends.push(`Rastreador Não Instalado`);
    } else if (v.rastreador_status !== 'Ativo') {
      pends.push(`Rastreador Irregular (${v.rastreador_status || 'Inativo'})`);
    }

    // 9. DPVAT
    if (v.dpvat_situacao === 'Pendente') {
      pends.push(`DPVAT Pendente`);
    }

    // 10. Preventive maintenance alerts (Óleo, Correia, Freio, Embreagem, Custom)
    const maintAlerts = getVehicleMaintenanceAlerts(v, manutencoes);
    maintAlerts.forEach(alert => {
      if (alert.color === 'red') {
        pends.push(`🚨 [Manutenção Crítica] ${alert.label}: ${alert.description}`);
      } else if (alert.color === 'yellow') {
        pends.push(`⚠️ [Atenção Manutenção] ${alert.label}: ${alert.description}`);
      }
    });

    return pends;
  };

  // Filter vehicles
  const filteredVeiculos = veiculos.filter(v => {
    const matchesSearch =
      v.placa.toLowerCase().includes(search.toLowerCase()) ||
      v.modelo.toLowerCase().includes(search.toLowerCase()) ||
      v.marca.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'Todos' || v.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Indicadores de Frota (Bento style grid) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Frota</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-slate-800">{totalCount}</span>
            <span className="text-xs text-slate-400">carros</span>
          </div>
        </div>

        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Alugado</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-emerald-700">{alugadosCount}</span>
            <span className="text-xs text-emerald-500 font-medium">ativo</span>
          </div>
        </div>

        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col justify-between">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Disponível</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-blue-700">{disponiveisCount}</span>
            <span className="text-xs text-blue-500 font-medium">livre</span>
          </div>
        </div>

        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex flex-col justify-between">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Em preparação</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-amber-700">{emPreparacaoCount}</span>
            <span className="text-xs text-amber-500 font-medium font-semibold">revisão</span>
          </div>
        </div>

        <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100 flex flex-col justify-between col-span-2 lg:col-span-1">
          <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">Fora da frota</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-black text-rose-700">{foraFrotaCount}</span>
            <span className="text-xs text-rose-500 font-medium">inativo</span>
          </div>
        </div>
      </div>

      {/* Tabs Principais da Visualização de Veículos */}
      <div className="flex border-b border-slate-200 mt-2">
        <button
          onClick={() => setActiveTab('geral')}
          className={`flex-1 md:flex-none px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center flex items-center justify-center gap-2 ${
            activeTab === 'geral'
              ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Car className="w-4 h-4" />
          Lista Geral
        </button>
        <button
          onClick={() => setActiveTab('seguranca')}
          className={`flex-1 md:flex-none px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center flex items-center justify-center gap-2 ${
            activeTab === 'seguranca'
              ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Shield className="w-4 h-4" />
          Seguro & Rastreador
        </button>
        <button
          onClick={() => setActiveTab('midia')}
          className={`flex-1 md:flex-none px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center flex items-center justify-center gap-2 ${
            activeTab === 'midia'
              ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Camera className="w-4 h-4" />
          Fotos & Vídeos ({veiculos.reduce((acc, curr) => acc + (curr.fotos_videos?.length || 0), 0)})
        </button>
        <button
          onClick={() => setActiveTab('km')}
          className={`flex-1 md:flex-none px-6 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center flex items-center justify-center gap-2 ${
            activeTab === 'km'
              ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Gauge className="w-4 h-4" />
          Controle Rápido de KM
        </button>
      </div>

      {activeTab === 'geral' && (
        <>
          {/* Barra de Ações Superiores */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar placa, modelo, marca..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-sm shadow-2xs"
          />
        </div>

        <button
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Novo Veículo
        </button>
      </div>

      {/* Tabs de Filtro de Status */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {[
          { name: 'Todos', count: totalCount, activeColor: 'bg-slate-100 text-slate-800 border-slate-400 border-b-2 font-extrabold' },
          { name: 'Disponível', count: disponiveisCount, activeColor: 'bg-blue-50 text-blue-600 border-blue-500 border-b-2 font-extrabold' },
          { name: 'Alugado', count: alugadosCount, activeColor: 'bg-emerald-50 text-emerald-600 border-emerald-500 border-b-2 font-extrabold' },
          { name: 'Em preparação', count: emPreparacaoCount, activeColor: 'bg-amber-50 text-amber-500 border-amber-500 border-b-2 font-extrabold' },
          { name: 'Fora da frota', count: foraFrotaCount, activeColor: 'bg-rose-50 text-rose-600 border-rose-500 border-b-2 font-extrabold' }
        ].map(tab => {
          const isActive = statusFilter === tab.name;
          return (
            <button
              key={tab.name}
              onClick={() => setStatusFilter(tab.name as any)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all flex items-center gap-2 ${
                isActive
                  ? tab.activeColor
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <span>{tab.name}</span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                isActive 
                  ? 'bg-white shadow-2xs border border-slate-200/40' 
                  : 'bg-slate-100 text-slate-600'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Card da Tabela de Frota */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <Car className="w-4 h-4 text-blue-600" /> Frota Cadastrada
          </h3>
          <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredVeiculos.length} {filteredVeiculos.length === 1 ? 'veículo' : 'veículos'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto columns-divided">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                <th className="px-3 py-2.5">Modelo / Marca</th>
                <th className="px-3 py-2.5">Ano</th>
                <th className="px-3 py-2.5">Placa</th>
                <th className="px-3 py-2.5">Cor</th>
                <th className="px-3 py-2.5">Renavam</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Quilometragem</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredVeiculos.length > 0 ? (
                filteredVeiculos.map(v => {
                  const kmIni = v.km_inicial || v.km || 0;
                  const kmAtu = v.km_atual || v.km || 0;
                  const kmRodado = kmAtu - kmIni;
                  
                  const activeContract = contratos.find(c => c.veiculoPlaca === v.placa && c.status === 'Ativo');
                  const activeDriver = activeContract ? motoristas.find(m => m.cpf === activeContract.motoristaCpf) : null;

                  return (
                    <React.Fragment key={v.placa}>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                      {/* Modelo / Marca */}
                      <td className="px-3 py-2 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <img
                            src={v.foto || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=60&w=200'}
                            alt={v.modelo}
                            referrerPolicy="no-referrer"
                            className="w-10 h-7 object-cover rounded border border-slate-200/80 bg-slate-50 shrink-0"
                          />
                          <div>
                            <div className="font-bold text-slate-800 text-xs md:text-sm">{v.modelo}</div>
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 font-semibold">
                              <CarBrandLogo brand={v.marca} className="w-3.5 h-3.5" />
                              <span>{v.marca}</span>
                            </div>
                            {activeDriver && (
                              <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded pl-0.5 pr-1.5 py-0.5 w-fit font-bold">
                                {activeDriver.foto_perfil ? (
                                  <img
                                    src={activeDriver.foto_perfil}
                                    alt={activeDriver.nome}
                                    className="w-4 h-4 rounded-full object-cover border border-emerald-200 shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span>👤</span>
                                )}
                                <span className="truncate max-w-[120px]">{activeDriver.nome}</span>
                              </div>
                            )}
                            {v.documentos_anexos && v.documentos_anexos.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {v.documentos_anexos.map((doc) => (
                                  <a
                                    key={doc.id}
                                    href={doc.url}
                                    download={doc.nome}
                                    className="flex items-center gap-1 text-[9px] text-purple-700 bg-purple-50/70 border border-purple-200/60 hover:bg-purple-100 hover:text-purple-800 rounded px-1.5 py-0.5 font-bold transition-all shrink-0 shadow-2xs cursor-pointer"
                                    title={`Baixar ${doc.nome} (${doc.tamanho || ''})`}
                                  >
                                    <FileText className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                                    <span className="truncate max-w-[90px]">{doc.nome}</span>
                                  </a>
                                ))}
                              </div>
                            )}

                            {/* Informações de Pendências do Veículo */}
                            {(() => {
                              const pends = getVeiculoPendencias(v);
                              if (pends.length === 0) {
                                return (
                                  <div className="mt-1 flex items-center gap-1 text-[9px] text-emerald-600 bg-emerald-50/40 border border-emerald-100 rounded px-1.5 py-0.5 w-fit font-bold shadow-3xs">
                                    <CheckCircle className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                    Sem pendências
                                  </div>
                                );
                              }
                              return (
                                <div className="mt-1.5 bg-rose-50/40 border border-rose-100 rounded-lg p-1.5 max-w-[200px] shadow-3xs">
                                  <div className="text-[8px] font-extrabold uppercase tracking-widest text-rose-700 flex items-center gap-1 mb-1">
                                    <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                    Pendências:
                                  </div>
                                  <div className="flex flex-col gap-0.5 pl-0.5">
                                    {pends.map((p, idx) => (
                                      <span key={idx} className="text-rose-700 text-[9px] font-bold flex items-start gap-1">
                                        <span className="w-1 h-1 rounded-full bg-rose-500 shrink-0 mt-1" />
                                        <span>{p}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </td>

                      {/* Ano */}
                      <td className="px-3 py-2 text-xs font-semibold text-slate-700">
                        {v.ano}
                      </td>

                      {/* Placa */}
                      <td className="px-3 py-2">
                        <PlacaMercosul placa={v.placa} size="md" />
                      </td>

                      {/* Cor */}
                      <td className="px-3 py-2 text-xs font-medium text-slate-600">
                        {v.cor}
                      </td>

                      {/* Renavam */}
                      <td className="px-3 py-2 font-mono text-xs font-medium text-slate-600">
                        {v.renavam || '—'}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2">
                        {v.status === 'Disponível' ? (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200/60 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">
                            Disponível
                          </span>
                        ) : v.status === 'Alugado' ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">
                            Alugado
                          </span>
                        ) : v.status === 'Em preparação' ? (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">
                            Em preparação
                          </span>
                        ) : (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200/60 text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">
                            Fora da frota
                          </span>
                        )}
                      </td>

                      {/* Quilometragem */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span className="font-semibold flex items-center gap-0.5">
                            <Gauge className="w-3 h-3 text-slate-400 shrink-0" />
                            {kmAtu.toLocaleString('pt-BR')} km
                          </span>
                          <span className="text-[9px] text-slate-400">
                            (Ini: {kmIni.toLocaleString('pt-BR')})
                          </span>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => setExpandedPlaca(expandedPlaca === v.placa ? null : v.placa)}
                            className={`min-w-[36px] min-h-[36px] p-2 rounded-lg transition-all flex items-center justify-center border cursor-pointer ${
                              expandedPlaca === v.placa
                                ? 'bg-blue-100/80 text-blue-700 border-blue-300'
                                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50 border-slate-200'
                            }`}
                            title="Visualizar / Detalhes"
                            aria-label="Visualizar / Detalhes"
                          >
                            {expandedPlaca === v.placa ? (
                              <ChevronUp className="w-[18px] h-[18px] shrink-0" />
                            ) : (
                              <ChevronDown className="w-[18px] h-[18px] shrink-0" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintVehicleFicha(v)}
                            className="min-w-[36px] min-h-[36px] p-2 text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Gerar PDF / Ficha"
                            aria-label="Gerar PDF / Ficha"
                          >
                            <FileDown className="w-[18px] h-[18px] shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(v)}
                            className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-[18px] h-[18px] shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchiveClick(v.placa)}
                            className="min-w-[36px] min-h-[36px] p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                            title="Excluir"
                            aria-label="Excluir"
                          >
                            <Trash2 className="w-[18px] h-[18px] shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedPlaca === v.placa && (() => {
                      const isSeguroAtivo = v.segurado && v.seguro_vencimento && new Date(v.seguro_vencimento) >= new Date();
                      const diasParaVencer = v.seguro_vencimento
                        ? Math.ceil((new Date(v.seguro_vencimento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                        : null;
                      return (
                        <tr className="bg-slate-50/50">
                          <td colSpan={9} className="px-5 py-4 border-b border-slate-200">
                            <div className="bg-white rounded-xl border border-slate-200/80 p-5 space-y-4 shadow-2xs animate-fadeIn text-slate-700">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <h4 className="text-xs font-extrabold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                                  📂 Detalhes Adicionais, Documentos e Mídias ({v.modelo} - {v.placa})
                                </h4>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handlePrintVehicleFicha(v)}
                                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all shadow-2xs"
                                    title="Gerar e salvar documento em PDF"
                                  >
                                    <FileDown className="w-3.5 h-3.5" />
                                    Salvar Ficha PDF
                                  </button>
                                  <button
                                    onClick={() => setExpandedPlaca(null)}
                                    className="text-slate-400 hover:text-slate-600 font-bold text-xs"
                                  >
                                    Fechar
                                  </button>
                                </div>
                              </div>

                              {(() => {
                                const activeContract = contratos.find(c => c.veiculoPlaca === v.placa && c.status === 'Ativo');
                                const activeDriver = activeContract ? motoristas.find(m => m.cpf === activeContract.motoristaCpf) : null;
                                const driverAtrelado = v.motoristaCpf ? motoristas.find(m => m.cpf === v.motoristaCpf) : null;

                                return (
                                  <div className="space-y-2">
                                    {driverAtrelado && (
                                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          {driverAtrelado.foto_perfil ? (
                                            <img
                                              src={driverAtrelado.foto_perfil}
                                              alt={driverAtrelado.nome}
                                              className="w-10 h-10 rounded-full object-cover border border-blue-300 shadow-2xs shrink-0"
                                              referrerPolicy="no-referrer"
                                            />
                                          ) : (
                                            <span className="text-lg">🚗</span>
                                          )}
                                          <div>
                                            <div className="text-xs font-bold text-blue-900">Motorista Atrelado (Cadastro)</div>
                                            <div className="text-xs text-blue-700">
                                              {driverAtrelado.nome} (CPF: {driverAtrelado.cpf})
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-[11px] font-semibold text-slate-600 flex gap-3 items-center flex-wrap">
                                          <span>📞 {driverAtrelado.tel}</span>
                                          <span>📧 {driverAtrelado.email}</span>
                                          <a
                                            href={`https://api.whatsapp.com/send?phone=55${driverAtrelado.tel.replace(/\D/g, '')}&text=${encodeURIComponent(`Olá ${driverAtrelado.nome}, tudo bem? Entramos em contato para tratar de assuntos sobre o veículo ${v.modelo} (Placa: ${v.placa}).`)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-extrabold flex items-center gap-0.5"
                                          >
                                            Zap
                                          </a>
                                        </div>
                                      </div>
                                    )}

                                    {activeDriver ? (
                                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          {activeDriver.foto_perfil ? (
                                            <img
                                              src={activeDriver.foto_perfil}
                                              alt={activeDriver.nome}
                                              className="w-10 h-10 rounded-full object-cover border border-emerald-300 shadow-2xs shrink-0"
                                              referrerPolicy="no-referrer"
                                            />
                                          ) : (
                                            <span className="text-lg">📋</span>
                                          )}
                                          <div>
                                            <div className="text-xs font-bold text-emerald-900">Aluguel Ativo (Contrato)</div>
                                            <div className="text-xs text-emerald-700">
                                              {activeDriver.nome} (CPF: {activeDriver.cpf}) - Contrato {activeContract.id}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-[11px] font-semibold text-slate-600 flex gap-3 items-center flex-wrap">
                                          <span>📞 {activeDriver.tel}</span>
                                          <span>📧 {activeDriver.email}</span>
                                          <a
                                            href={`https://api.whatsapp.com/send?phone=55${activeDriver.tel.replace(/\D/g, '')}&text=${encodeURIComponent(`Olá ${activeDriver.nome}, tudo bem? Entramos em contato para tratar do contrato ${activeContract.id} do veículo ${v.modelo} (Placa: ${v.placa}).`)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-extrabold flex items-center gap-0.5"
                                          >
                                            Zap Contrato
                                          </a>
                                        </div>
                                      </div>
                                    ) : (
                                      !driverAtrelado && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                                          <span className="text-lg">⚠️</span>
                                          <div>
                                            <div className="text-xs font-bold text-amber-900">Nenhum Motorista Atrelado ou Aluguel Ativo</div>
                                            <div className="text-[11px] text-amber-700">
                                              Este veículo está sem motorista atrelado no cadastro e sem aluguel ativo no momento.
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                );
                              })()}

                              {/* PENDÊNCIAS E IRREGULARIDADES DO VEÍCULO (DOCUMENTO, SEGURO, RECALL, RASTREADOR) */}
                              {(() => {
                                const pends = getVeiculoPendencias(v);
                                if (pends.length === 0) return null;

                                return (
                                  <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-4.5 space-y-3.5 shadow-3xs animate-fadeIn">
                                    <div className="flex items-start gap-2.5">
                                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                                      <div className="space-y-0.5">
                                        <h5 className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                                          Pendências e Irregularidades Ativas ({pends.length})
                                        </h5>
                                        <p className="text-[11px] text-rose-700 leading-relaxed font-semibold">
                                          Este veículo possui pendências ou informações pendentes de regularização nos módulos de **Documentação, Seguro, Recall ou Rastreador**. Clique no botão **Editar** (ícone de lápis) para solucionar os problemas indicados abaixo:
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-rose-100">
                                      {pends.map((pText, pIdx) => {
                                        let pType: 'documento' | 'seguro' | 'recall' | 'rastreador' | 'financeiro' = 'documento';
                                        let catLabel = 'Documento';
                                        let catColor = 'bg-blue-100 text-blue-800 border-blue-200';
                                        
                                        const lowerText = pText.toLowerCase();
                                        if (lowerText.includes('seguro')) {
                                          pType = 'seguro';
                                          catLabel = 'Seguro';
                                          catColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                                        } else if (lowerText.includes('recall')) {
                                          pType = 'recall';
                                          catLabel = 'Recall';
                                          catColor = 'bg-purple-100 text-purple-800 border-purple-200';
                                        } else if (lowerText.includes('rastreador')) {
                                          pType = 'rastreador';
                                          catLabel = 'Rastreador';
                                          catColor = 'bg-amber-100 text-amber-800 border-amber-200';
                                        } else if (lowerText.includes('despesas') || lowerText.includes('financeiro')) {
                                          pType = 'financeiro';
                                          catLabel = 'Financeiro';
                                          catColor = 'bg-rose-100 text-rose-800 border-rose-200';
                                        }

                                        return (
                                          <div key={pIdx} className="bg-white border border-rose-150/40 rounded-lg p-2.5 flex items-start gap-2 shadow-4xs">
                                            <span className={`text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${catColor}`}>
                                              {catLabel}
                                            </span>
                                            <span className="text-[11px] font-bold text-slate-800 leading-normal">{pText}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* COL 1: DOCUMENTAÇÃO */}
                                <div className="space-y-3 bg-slate-50/40 p-4 rounded-lg border border-slate-100">
                                  <h5 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                    <FileText className="w-3.5 h-3.5 text-blue-600" /> Detalhes da Documentação
                                  </h5>
                                  <div className="space-y-1">
                                    {/* CRLV */}
                                    {v.crlv_ano_exercicio ? (
                                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase">CRLV ({v.crlv_ano_exercicio}):</span>
                                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                          v.crlv_situacao === 'Em dia' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                        }`}>
                                          {v.crlv_situacao || 'Não cadastrada'} {v.crlv_digital ? ' (Digital)' : ''}
                                        </span>
                                      </div>
                                    ) : null}

                                    {/* IPVA */}
                                    {v.ipva_ano_referencia ? (() => {
                                      const todayStr = new Date().toISOString().split('T')[0];
                                      const ipvaPayments = pagamentos.filter(p => p.id.startsWith(`ipva_pay_${v.placa}_p`));
                                      const totalParcelasConfiguradas = [
                                        v.ipva_p1_valor, v.ipva_p2_valor, v.ipva_p3_valor,
                                        v.ipva_p4_valor, v.ipva_p5_valor, v.ipva_p6_valor
                                      ].filter(val => val !== undefined && Number(val) > 0).length;

                                      const parcelasPagasCount = ipvaPayments.filter(p => p.status === 'Pago').length;

                                      let displayStatus = v.ipva_situacao || 'Não cadastrada';
                                      let colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200';

                                      if (v.ipva_situacao === 'Isento') {
                                        displayStatus = 'Isento';
                                        colorClasses = 'bg-slate-100 text-slate-600 border border-slate-200';
                                      } else if (v.ipva_forma_pagamento === 'Parcelado' && totalParcelasConfiguradas > 0) {
                                        const installments = [
                                          { val: v.ipva_p1_valor, venc: v.ipva_p1_vencimento, num: 1 },
                                          { val: v.ipva_p2_valor, venc: v.ipva_p2_vencimento, num: 2 },
                                          { val: v.ipva_p3_valor, venc: v.ipva_p3_vencimento, num: 3 },
                                          { val: v.ipva_p4_valor, venc: v.ipva_p4_vencimento, num: 4 },
                                          { val: v.ipva_p5_valor, venc: v.ipva_p5_vencimento, num: 5 },
                                          { val: v.ipva_p6_valor, venc: v.ipva_p6_vencimento, num: 6 },
                                        ];
                                        const activeInstallments = installments.filter(inst => inst.val !== undefined && Number(inst.val) > 0);
                                        const hasOverdueInstallment = activeInstallments.some(inst => {
                                          const pay = ipvaPayments.find(p => p.id === `ipva_pay_${v.placa}_p${inst.num}`);
                                          const status = pay ? pay.status : 'Pendente';
                                          return status !== 'Pago' && inst.venc && inst.venc < todayStr;
                                        });

                                        if (parcelasPagasCount === totalParcelasConfiguradas) {
                                          displayStatus = `Pago (${parcelasPagasCount}/${totalParcelasConfiguradas})`;
                                          colorClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                                        } else if (hasOverdueInstallment) {
                                          displayStatus = `Atrasado (${parcelasPagasCount}/${totalParcelasConfiguradas})`;
                                          colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200';
                                        } else if (parcelasPagasCount > 0) {
                                          displayStatus = `Parcial (${parcelasPagasCount}/${totalParcelasConfiguradas})`;
                                          colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
                                        } else {
                                          displayStatus = `Pendente (0/${totalParcelasConfiguradas})`;
                                          colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
                                        }
                                      } else {
                                        const singlePay = pagamentos.find(p => p.id === `ipva_pay_${v.placa}`);
                                        let status = singlePay ? singlePay.status : (v.ipva_situacao || 'Pendente');
                                        if (status !== 'Pago' && v.ipva_vencimento && v.ipva_vencimento < todayStr) {
                                          status = 'Atrasado';
                                        }

                                        if (status === 'Pago') {
                                          displayStatus = 'Pago';
                                          colorClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                                        } else if (status === 'Atrasado') {
                                          displayStatus = 'Atrasado';
                                          colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200';
                                        } else {
                                          displayStatus = 'Pendente';
                                          colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
                                        }
                                      }

                                      return (
                                        <div className="flex flex-col border-b border-slate-100 pb-1 space-y-0.5">
                                          <div className="flex items-center justify-between gap-3">
                                            <span className="text-[11px] font-bold text-slate-500 uppercase">IPVA ({v.ipva_ano_referencia}):</span>
                                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${colorClasses}`}>
                                              {displayStatus}{v.ipva_forma_pagamento && v.ipva_situacao !== 'Isento' ? ` (${v.ipva_forma_pagamento})` : ''}
                                            </span>
                                          </div>
                                          {v.ipva_valor_total && (
                                            <div className="text-[10px] text-slate-600 font-semibold text-right">
                                              Total: R$ {Number(v.ipva_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })() : null}

                                    {/* DPVAT */}
                                    {v.dpvat_ano_referencia ? (
                                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase">DPVAT ({v.dpvat_ano_referencia}):</span>
                                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                          v.dpvat_situacao === 'Pago' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                        }`}>
                                          {v.dpvat_situacao || 'Não cadastrada'} {v.dpvat_valor ? ` - R$ ${Number(v.dpvat_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                                        </span>
                                      </div>
                                    ) : null}

                                    {/* Multas */}
                                    {v.multas_quantidade !== undefined && Number(v.multas_quantidade) > 0 ? (
                                      <div className="flex flex-col border-b border-slate-100 pb-1">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="text-[11px] font-bold text-slate-500 uppercase">Multas ({v.multas_quantidade}):</span>
                                          <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                            v.multas_situacao === 'Paga' || v.multas_situacao === 'Recebido' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                          }`}>
                                            {v.multas_situacao || 'Pendente'}
                                          </span>
                                        </div>
                                        <div className="text-[10px] font-semibold text-slate-600 text-right">
                                          Total: R$ {Number(v.multas_valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          {v.multas_data && <span className="text-[9px] font-normal text-slate-400"> ({v.multas_data.split('-').reverse().join('/')})</span>}
                                        </div>
                                      </div>
                                    ) : null}

                                    {/* Vistoria */}
                                    {v.vistoria_data_ultima ? (
                                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase">Última Vistoria:</span>
                                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                          v.vistoria_resultado === 'Aprovado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                          v.vistoria_resultado === 'Aprovado com apontamento' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                          'bg-rose-50 text-rose-700 border border-rose-200'
                                        }`}>
                                          {v.vistoria_data_ultima.split('-').reverse().join('/')} - {v.vistoria_resultado}
                                        </span>
                                      </div>
                                    ) : null}

                                    {/* Alienacao */}
                                    {v.alienacao_possui ? (
                                      <div className="flex flex-col border-b border-slate-100 pb-1 space-y-0.5">
                                        <div className="flex items-center justify-between gap-3">
                                          <span className="text-[11px] font-bold text-amber-600 uppercase">Alienação:</span>
                                          <span className="text-[10px] font-bold text-slate-700">
                                            {v.alienacao_credor || 'Sim'}
                                          </span>
                                        </div>
                                      </div>
                                    ) : null}

                                    {/* Recall */}
                                    {v.recall_pendente ? (
                                      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1">
                                        <span className="text-[11px] font-bold text-rose-600 uppercase">Recall:</span>
                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                          Pendente
                                        </span>
                                      </div>
                                    ) : null}

                                    {/* Observacoes */}
                                    {v.doc_observacoes ? (
                                      <div className="text-[10px] italic text-slate-500 max-w-[280px]" title={v.doc_observacoes}>
                                        Obs: {v.doc_observacoes}
                                      </div>
                                    ) : null}

                                    {/* Se nada estiver cadastrado */}
                                    {!(v.crlv_ano_exercicio || v.ipva_ano_referencia || v.dpvat_ano_referencia || (v.multas_quantidade !== undefined && Number(v.multas_quantidade) > 0) || v.vistoria_data_ultima || v.alienacao_possui || v.recall_pendente || v.doc_observacoes) && (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 italic">
                                        Nenhuma documentação detalhada registrada
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* COL 2: SEGURO & RASTREADOR */}
                                <div className="space-y-4 bg-slate-50/40 p-4 rounded-lg border border-slate-100">
                                  <h5 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                    <Shield className="w-3.5 h-3.5 text-emerald-600" /> Seguro & Rastreamento
                                  </h5>
                                  
                                  {/* Seguro Card */}
                                  {(() => {
                                    const seguradoraObj = seguradoras?.find(s => s.id === v.seguro_seguradora || s.nome === v.seguro_seguradora);
                                    const seguradoraNome = seguradoraObj ? seguradoraObj.nome : (v.seguro_seguradora || 'Não informada');
                                    return (
                                      <div className="p-3.5 bg-white rounded-lg border border-slate-200/60 space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                          <div className="font-bold text-xs text-slate-800 flex items-center gap-1">🛡️ Seguro do Veículo</div>
                                          {v.segurado ? (
                                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                                              isSeguroAtivo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                            }`}>
                                              {isSeguroAtivo ? 'Ativo' : 'Vencido'}
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-100 text-slate-500 border border-slate-200">
                                              Sem Seguro
                                            </span>
                                          )}
                                        </div>

                                        {v.segurado ? (
                                          <div className="space-y-3 text-[11px] text-slate-600">
                                            {/* Seguradora Interconnected Info */}
                                            <div className="space-y-1 bg-slate-50/50 p-2.5 rounded border border-slate-150">
                                              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Dados da Seguradora</div>
                                              <div>
                                                Nome: <b className="text-slate-800 font-bold">{seguradoraNome}</b>
                                              </div>
                                              {seguradoraObj ? (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-1 mt-1 pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                                                  <div>CNPJ: <span className="font-semibold text-slate-700">{seguradoraObj.cnpj}</span></div>
                                                  <div>Contato: <span className="font-semibold text-slate-700">{seguradoraObj.responsavel}</span></div>
                                                  <div>Tel: <span className="font-semibold text-slate-700">{seguradoraObj.tel}</span></div>
                                                  <div>Email: <span className="font-semibold text-slate-700">{seguradoraObj.email}</span></div>
                                                  <div className="sm:col-span-2">End: <span className="font-semibold text-slate-700">{seguradoraObj.end}</span></div>
                                                </div>
                                              ) : (
                                                <div className="text-[10px] text-amber-600 mt-1 italic font-medium">
                                                  ⚠️ Esta seguradora foi digitada manualmente e não está cadastrada na aba Seguradoras.
                                                </div>
                                              )}
                                            </div>

                                            {/* Apolice Info */}
                                            <div className="space-y-1 bg-blue-50/20 p-2.5 rounded border border-blue-100">
                                              <div className="text-[10px] font-extrabold text-blue-500 uppercase tracking-wider">Dados da Apólice</div>
                                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-600">
                                                <div>Nº Apólice: <b className="text-slate-800">{v.seguro_apolice_numero || 'Não informado'}</b></div>
                                                <div>Franquia: <b className="text-slate-800">{v.seguro_valor_franquia ? formatBRL(v.seguro_valor_franquia) : 'Não informada'}</b></div>
                                                <div>Valor Seguro: <b className="text-slate-800">{v.seguro_valor ? formatBRL(v.seguro_valor) : 'Não informado'}</b></div>
                                                <div>Cobertura: <b className="text-slate-800">{v.seguro_tipo_cobertura || 'Geral'}</b></div>
                                                {v.seguro_vigencia_inicio && (
                                                  <div className="col-span-2">Vigência: <b className="text-slate-800">{v.seguro_vigencia_inicio.split('-').reverse().join('/')}</b> até <b className="text-slate-800">{v.seguro_vencimento?.split('-').reverse().join('/')}</b></div>
                                                )}
                                                {!v.seguro_vigencia_inicio && v.seguro_vencimento && (
                                                  <div className="col-span-2 font-medium">Vencimento: <b className="text-slate-800">{v.seguro_vencimento.split('-').reverse().join('/')}</b></div>
                                                )}
                                                {v.seguro_corretor_nome && (
                                                  <div className="col-span-2 pt-1 border-t border-blue-50/50 text-[10px]">Corretor: <span className="font-semibold text-slate-700">{v.seguro_corretor_nome}</span> {v.seguro_telefone_corretora && `(Tel: ${v.seguro_telefone_corretora})`}</div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-[11px] text-slate-400 italic">
                                            Nenhum seguro ativo registrado para este veículo.
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Rastreador Card */}
                                  <div className="p-3 bg-white rounded-lg border border-slate-200/60 space-y-2">
                                    <div className="font-bold text-xs text-slate-800">Rastreador Integrado</div>
                                    {v.possui_rastreador ? (
                                      <div className="space-y-1">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                          v.rastreador_status === 'Ativo' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}>
                                          <span className={`h-1.5 w-1.5 rounded-full ${v.rastreador_status === 'Ativo' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                                          Rastreador: {v.rastreador_status || 'Instalado'}
                                        </span>
                                        {(v.rastreador_marca || v.rastreador_modelo) && (
                                          <div className="text-[11px] text-slate-500">
                                            Marca/Modelo: <b className="text-slate-700">{v.rastreador_marca} {v.rastreador_modelo}</b>
                                          </div>
                                        )}
                                        {v.rastreador_imei && (
                                          <div className="text-[11px] text-slate-500">
                                            IMEI: <code className="text-slate-600 font-bold bg-slate-50 px-1 py-0.5 rounded">{v.rastreador_imei}</code>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                        ❌ Sem Rastreador
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* COL 3: FOTOS & VÍDEOS */}
                                <div className="space-y-3 bg-slate-50/40 p-4 rounded-lg border border-slate-100">
                                  <h5 className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                                    <Camera className="w-3.5 h-3.5 text-purple-600" /> Galeria de Fotos & Vídeos ({v.fotos_videos?.length || 0})
                                  </h5>
                                  
                                  {v.fotos_videos && v.fotos_videos.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1">
                                      {v.fotos_videos.map(item => (
                                        <div key={item.id} className="relative aspect-video rounded border border-slate-200 bg-slate-900 overflow-hidden group shadow-3xs">
                                          {item.tipo === 'foto' ? (
                                            <img
                                              src={item.url}
                                              alt={item.descricao || 'Foto'}
                                              referrerPolicy="no-referrer"
                                              className="w-full h-full object-cover"
                                            />
                                          ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-white p-1">
                                              <Video className="w-4 h-4 text-slate-400 mb-0.5" />
                                              <span className="text-[8px] truncate max-w-full font-bold">{item.descricao || 'Vídeo'}</span>
                                            </div>
                                          )}
                                          <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold gap-1"
                                          >
                                            🔍 Ver Mídia
                                          </a>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-1.5">
                                      <Camera className="w-8 h-8 text-slate-300 stroke-1" />
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nenhuma mídia anexada</p>
                                      <button
                                        onClick={() => {
                                          setSelectedPlaca(v.placa);
                                          setActiveTab('midia');
                                        }}
                                        className="text-[9px] text-blue-600 hover:underline font-bold"
                                      >
                                        + Adicionar Mídia
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-slate-400 font-medium text-xs">
                    Nenhum veículo encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {activeTab === 'seguranca' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" /> Monitoramento de Seguro & Rastreador
              </h3>
              <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {veiculos.length} {veiculos.length === 1 ? 'veículo' : 'veículos'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-100">
                    <th className="px-5 py-3.5">Veículo</th>
                    <th className="px-5 py-3.5">Status do Seguro</th>
                    <th className="px-5 py-3.5">Status do Rastreador</th>
                    <th className="px-5 py-3.5">Documentação</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                  {veiculos.map(v => {
                    const isSeguroAtivo = v.segurado && v.seguro_vencimento && new Date(v.seguro_vencimento) >= new Date();
                    const diasParaVencer = v.seguro_vencimento
                      ? Math.ceil((new Date(v.seguro_vencimento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                      : null;

                    return (
                      <tr key={v.placa} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={v.foto || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=60&w=200'}
                              alt={v.modelo}
                              referrerPolicy="no-referrer"
                              className="w-12 h-9 object-cover rounded border border-slate-200/80 bg-slate-50"
                            />
                            <div>
                              <PlacaMercosul placa={v.placa} size="md" />
                              <div className="font-bold text-slate-800 mt-1">{v.modelo}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {v.segurado ? (
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                isSeguroAtivo
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isSeguroAtivo ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                {isSeguroAtivo ? 'Seguro Ativo' : 'Seguro Vencido'}
                              </span>
                              {(() => {
                                const seguradoraObj = seguradoras?.find(s => s.id === v.seguro_seguradora || s.nome === v.seguro_seguradora);
                                const seguradoraNome = seguradoraObj ? seguradoraObj.nome : (v.seguro_seguradora || 'Não informada');
                                return (
                                  <div className="text-[11px] font-medium text-slate-500">
                                    Seguradora: <b className="text-slate-700 font-bold">{seguradoraNome}</b>
                                  </div>
                                );
                              })()}
                              {v.seguro_vencimento && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  Vence em: <b className={`font-bold ${diasParaVencer && diasParaVencer <= 30 ? 'text-amber-600' : 'text-slate-700'}`}>
                                    {v.seguro_vencimento.split('-').reverse().join('/')}
                                    {diasParaVencer && diasParaVencer > 0 ? ` (${diasParaVencer} dias)` : ''}
                                  </b>
                                </div>
                              )}
                              {v.seguro_parcelas && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  Pagamento: <b className="text-slate-700">{v.seguro_parcelas}x no {v.seguro_forma_pagamento || 'Cartão'}</b>
                                </div>
                              )}
                              {v.seguro_telefone_corretora && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  Corretora/Contato: <b className="text-slate-700">{v.seguro_telefone_corretora}</b>
                                </div>
                              )}
                              {v.seguro_valor_franquia !== undefined && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  Franquia: <b className="text-slate-700">R$ {Number(v.seguro_valor_franquia).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
                                </div>
                              )}
                              {v.seguro_contrato_url && (
                                <div className="pt-1">
                                  <a
                                    href={v.seguro_contrato_url}
                                    download={`contrato_seguro_${v.placa}`}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-100/60 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200 transition-all shadow-3xs"
                                  >
                                    📥 Baixar Contrato
                                  </a>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">
                              ❌ Não Segurado
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {v.possui_rastreador ? (
                            <div className="space-y-1">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                v.rastreador_status === 'Ativo'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${v.rastreador_status === 'Ativo' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                                Rastreador: {v.rastreador_status || 'Instalado'}
                              </span>
                              {(v.rastreador_marca || v.rastreador_modelo) && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  Equipamento: <b className="text-slate-700 font-bold">{v.rastreador_marca} {v.rastreador_modelo}</b>
                                </div>
                              )}
                              {v.rastreador_imei && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  IMEI: <code className="text-slate-600 font-bold bg-slate-50 px-1 py-0.5 rounded">{v.rastreador_imei}</code>
                                </div>
                              )}
                              {v.rastreador_operadora && (
                                <div className="text-[11px] font-medium text-slate-500">
                                  Chip/Operadora: <b className="text-slate-700">{v.rastreador_operadora}</b>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-50 text-slate-500 border border-slate-200">
                              ❌ Sem Rastreador
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="space-y-1 max-w-[320px]">
                            {/* CRLV */}
                            {v.crlv_ano_exercicio && (
                              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-0.5">
                                <span className="text-[11px] font-bold text-slate-500 uppercase">CRLV ({v.crlv_ano_exercicio}):</span>
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  v.crlv_situacao === 'Em dia' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {v.crlv_situacao || 'Não cadastrada'} {v.crlv_digital ? ' (Digital)' : ''}
                                </span>
                              </div>
                            )}

                             {/* IPVA */}
                             {v.ipva_ano_referencia && (() => {
                               const ipvaPayments = pagamentos.filter(p => p.id.startsWith(`ipva_pay_${v.placa}_p`));
                               const totalParcelasConfiguradas = [
                                 v.ipva_p1_valor, v.ipva_p2_valor, v.ipva_p3_valor,
                                 v.ipva_p4_valor, v.ipva_p5_valor, v.ipva_p6_valor
                               ].filter(val => val !== undefined && Number(val) > 0).length;

                               const parcelasPagasCount = ipvaPayments.filter(p => p.status === 'Pago').length;
                               const todayStr = new Date().toISOString().split('T')[0];

                               let displayStatus = v.ipva_situacao || 'Não cadastrada';
                               let colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200';

                               if (v.ipva_situacao === 'Isento') {
                                 displayStatus = 'Isento';
                                 colorClasses = 'bg-slate-100 text-slate-600 border border-slate-200';
                               } else if (v.ipva_forma_pagamento === 'Parcelado' && totalParcelasConfiguradas > 0) {
                                 const installments = [
                                   { val: v.ipva_p1_valor, venc: v.ipva_p1_vencimento, num: 1 },
                                   { val: v.ipva_p2_valor, venc: v.ipva_p2_vencimento, num: 2 },
                                   { val: v.ipva_p3_valor, venc: v.ipva_p3_vencimento, num: 3 },
                                   { val: v.ipva_p4_valor, venc: v.ipva_p4_vencimento, num: 4 },
                                   { val: v.ipva_p5_valor, venc: v.ipva_p5_vencimento, num: 5 },
                                   { val: v.ipva_p6_valor, venc: v.ipva_p6_vencimento, num: 6 },
                                 ];
                                 const activeInstallments = installments.filter(inst => inst.val !== undefined && Number(inst.val) > 0);
                                 const hasOverdueInstallment = activeInstallments.some(inst => {
                                   const pay = ipvaPayments.find(p => p.id === `ipva_pay_${v.placa}_p${inst.num}`);
                                   const status = pay ? pay.status : 'Pendente';
                                   return status !== 'Pago' && inst.venc && inst.venc < todayStr;
                                 });

                                 if (parcelasPagasCount === totalParcelasConfiguradas) {
                                   displayStatus = `Pago (${parcelasPagasCount}/${totalParcelasConfiguradas})`;
                                   colorClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                                 } else if (hasOverdueInstallment) {
                                   displayStatus = `Atrasado (${parcelasPagasCount}/${totalParcelasConfiguradas})`;
                                   colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200';
                                 } else if (parcelasPagasCount > 0) {
                                   displayStatus = `Parcial (${parcelasPagasCount}/${totalParcelasConfiguradas})`;
                                   colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
                                 } else {
                                   displayStatus = `Pendente (0/${totalParcelasConfiguradas})`;
                                   colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
                                 }
                               } else {
                                 const singlePay = pagamentos.find(p => p.id === `ipva_pay_${v.placa}`);
                                 let status = singlePay ? singlePay.status : (v.ipva_situacao || 'Pendente');
                                 if (status !== 'Pago' && v.ipva_vencimento && v.ipva_vencimento < todayStr) {
                                   status = 'Atrasado';
                                 }

                                 if (status === 'Pago') {
                                   displayStatus = 'Pago';
                                   colorClasses = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
                                 } else if (status === 'Atrasado') {
                                   displayStatus = 'Atrasado';
                                   colorClasses = 'bg-rose-50 text-rose-700 border border-rose-200';
                                 } else {
                                   displayStatus = 'Pendente';
                                   colorClasses = 'bg-amber-50 text-amber-700 border border-amber-200';
                                 }
                               }

                               return (
                                 <div className="flex flex-col border-b border-slate-100 pb-0.5 space-y-0.5">
                                   <div className="flex items-center justify-between gap-3">
                                     <span className="text-[11px] font-bold text-slate-500 uppercase">IPVA ({v.ipva_ano_referencia}):</span>
                                     <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${colorClasses}`}>
                                       {displayStatus}{v.ipva_forma_pagamento && v.ipva_situacao !== 'Isento' ? ` (${v.ipva_forma_pagamento})` : ''}
                                     </span>
                                   </div>
                                   {v.ipva_valor_total && (
                                     <div className="text-[10px] text-slate-600 font-semibold text-right">
                                       Total: R$ {Number(v.ipva_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                     </div>
                                   )}
                                   {v.ipva_forma_pagamento === 'Parcelado' && (
                                     <div className="text-[9px] text-purple-700 font-semibold bg-purple-50/50 p-1.5 rounded border border-purple-100/30 space-y-1 mt-0.5">
                                       <div className="font-bold text-[8px] uppercase text-purple-500 flex justify-between items-center">
                                         <span>Detalhamento:</span>
                                         <span>{parcelasPagasCount}/{totalParcelasConfiguradas} pagas</span>
                                       </div>
                                       <div className="grid grid-cols-3 gap-1.5">
                                         {[
                                           { num: 1, val: v.ipva_p1_valor, venc: v.ipva_p1_vencimento },
                                           { num: 2, val: v.ipva_p2_valor, venc: v.ipva_p2_vencimento },
                                           { num: 3, val: v.ipva_p3_valor, venc: v.ipva_p3_vencimento },
                                           { num: 4, val: v.ipva_p4_valor, venc: v.ipva_p4_vencimento },
                                           { num: 5, val: v.ipva_p5_valor, venc: v.ipva_p5_vencimento },
                                           { num: 6, val: v.ipva_p6_valor, venc: v.ipva_p6_vencimento },
                                         ].map(({ num, val, venc }) => {
                                           if (!val || Number(val) <= 0) return null;
                                           
                                           const pId = `ipva_pay_${v.placa}_p${num}`;
                                           const pay = pagamentos.find(p => p.id === pId);
                                           const pStatus = pay ? pay.status : (v.ipva_situacao === 'Pago' ? 'Pago' : 'Pendente');
                                           
                                           let boxColors = 'bg-white text-slate-700 border-slate-100';
                                           let sText = 'Pendente';
                                           
                                           if (pStatus === 'Pago') {
                                             boxColors = 'bg-emerald-50 text-emerald-800 border-emerald-200/60';
                                             sText = 'Pago';
                                           } else if (pStatus === 'Atrasado' || (venc && new Date(venc) < new Date())) {
                                             boxColors = 'bg-rose-50 text-rose-800 border-rose-200/60';
                                             sText = 'Vencido';
                                           } else {
                                             boxColors = 'bg-amber-50 text-amber-800 border-amber-200/60';
                                             sText = 'A vencer';
                                           }

                                           return (
                                             <div key={num} className={`flex flex-col p-1 rounded border ${boxColors} transition-colors`}>
                                               <span className="font-bold text-[8px] uppercase opacity-75">{num}ª Parcela</span>
                                               <span className="font-extrabold text-[10px] mt-0.5">R$ {val}</span>
                                               {venc && (
                                                 <span className="text-[8px] opacity-80 font-mono mt-0.5">
                                                   Venc: {venc.split('-').reverse().slice(0, 2).join('/')}
                                                 </span>
                                               )}
                                             </div>
                                           );
                                         })}
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               );
                             })()}

                            {/* DPVAT */}
                            {v.dpvat_ano_referencia && (
                              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-0.5">
                                <span className="text-[11px] font-bold text-slate-500 uppercase">DPVAT ({v.dpvat_ano_referencia}):</span>
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  v.dpvat_situacao === 'Pago' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {v.dpvat_situacao || 'Não cadastrada'} {v.dpvat_valor ? ` - R$ ${Number(v.dpvat_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                                </span>
                              </div>
                            )}

                            {/* Multas */}
                            {v.multas_quantidade !== undefined && Number(v.multas_quantidade) > 0 && (
                              <div className="flex flex-col border-b border-slate-100 pb-0.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] font-bold text-slate-500 uppercase">Multas ({v.multas_quantidade}):</span>
                                  <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    v.multas_situacao === 'Paga' || v.multas_situacao === 'Recebido' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}>
                                    {v.multas_situacao || 'Pendente'}
                                  </span>
                                </div>
                                <div className="text-[10px] font-semibold text-slate-600 text-right">
                                  Total: R$ {Number(v.multas_valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  {v.multas_data && <span className="text-[9px] font-normal text-slate-400"> ({v.multas_data.split('-').reverse().join('/')})</span>}
                                </div>
                              </div>
                            )}

                            {/* Vistoria */}
                            {v.vistoria_data_ultima && (
                              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-0.5">
                                <span className="text-[11px] font-bold text-slate-500 uppercase">Última Vistoria:</span>
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  v.vistoria_resultado === 'Aprovado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  v.vistoria_resultado === 'Aprovado com apontamento' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                  'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {v.vistoria_data_ultima.split('-').reverse().join('/')} - {v.vistoria_resultado}
                                  {v.vistoria_km_ultima && ` (${v.vistoria_km_ultima} KM)`}
                                </span>
                              </div>
                            )}

                            {/* Alienacao */}
                            {v.alienacao_possui && (
                              <div className="flex flex-col border-b border-slate-100 pb-0.5 space-y-0.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] font-bold text-amber-600 uppercase">Alienação:</span>
                                  <span className="text-[10px] font-bold text-slate-700">
                                    {v.alienacao_credor || 'Sim'} {v.alienacao_contrato ? ` (Contr. ${v.alienacao_contrato})` : ''}
                                  </span>
                                </div>
                                {(v.alienacao_valor_parcela !== undefined || v.alienacao_parcelas_pagas !== undefined) && (
                                  <div className="text-[9px] text-slate-500 text-right font-medium">
                                    {v.alienacao_valor_parcela ? `Parc: R$ ${v.alienacao_valor_parcela.toFixed(2)}` : ''}
                                    {v.alienacao_data_pagamento ? ` (Dia ${v.alienacao_data_pagamento.split('-').reverse()[0]})` : ''}
                                    {v.alienacao_parcelas_pagas !== undefined ? ` | Pagas: ${v.alienacao_parcelas_pagas}/${(v.alienacao_parcelas_pagas || 0) + (v.alienacao_parcelas_restantes || 0)}` : ''}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Recall */}
                            {v.recall_pendente && (
                              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-0.5">
                                <span className="text-[11px] font-bold text-rose-600 uppercase">Recall:</span>
                                <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  v.recall_situacao === 'Realizado' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                  v.recall_situacao === 'Agendado' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                  'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  {v.recall_descricao || 'Pendente'} ({v.recall_situacao || 'Aguardando'})
                                  {v.recall_data && ` - ${v.recall_data.split('-').reverse().join('/')}`}
                                </span>
                              </div>
                            )}

                            {/* Observacoes */}
                            {v.doc_observacoes && (
                              <div className="text-[10px] italic text-slate-500 max-w-[280px] truncate" title={v.doc_observacoes}>
                                Obs: {v.doc_observacoes}
                              </div>
                            )}

                            {/* Se nada estiver cadastrado */}
                            {!(v.crlv_ano_exercicio || v.ipva_ano_referencia || v.dpvat_ano_referencia || (v.multas_quantidade !== undefined && Number(v.multas_quantidade) > 0) || v.vistoria_data_ultima || v.alienacao_possui || v.recall_pendente || v.doc_observacoes) && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 italic">
                                Nenhuma documentação detalhada registrada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => openEditModal(v)}
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200"
                            title="Editar Seguro/Rastreador"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'midia' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Adicionar Mídia Form */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4 h-fit">
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2 pb-3 border-b border-slate-100">
              <Plus className="w-4 h-4 text-blue-600" /> Adicionar Nova Mídia
            </h3>
            <form onSubmit={handleAddMedia} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Veículo *</label>
                <select
                  value={selectedPlaca}
                  onChange={e => setSelectedPlaca(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold w-full"
                  required
                >
                  <option value="">Selecione um carro</option>
                  {veiculos.map(v => (
                    <option key={v.placa} value={v.placa}>
                      {v.modelo} ({v.placa})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tipo de Mídia *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMediaTipo('foto')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      mediaTipo === 'foto'
                        ? 'bg-blue-50 text-blue-600 border-blue-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    📸 Foto
                  </button>
                  <button
                    type="button"
                    onClick={() => setMediaTipo('video')}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      mediaTipo === 'video'
                        ? 'bg-blue-50 text-blue-600 border-blue-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🎥 Vídeo
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/60 space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Arquivo ou Link da Mídia</label>
                <input
                  type="text"
                  placeholder="Cole URL da imagem ou vídeo"
                  value={mediaUrl}
                  onChange={e => setMediaUrl(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                />
                <div className="text-center py-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">ou</span>
                </div>
                <label className="w-full bg-white hover:bg-slate-50 border border-slate-200 rounded-lg py-2 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-2xs">
                  <Upload className="w-4 h-4 text-blue-600" /> Upload de Arquivo
                  <input type="file" accept="image/*,video/*" onChange={handleMediaUpload} className="hidden" />
                </label>
              </div>

              {mediaUrl && (
                <div className="relative h-24 w-full bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400">
                  {mediaTipo === 'foto' ? (
                    <img src={mediaUrl} alt="Preview" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : (
                    <video src={mediaUrl} className="h-full w-full object-cover" controls muted />
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição / Título</label>
                <input
                  type="text"
                  placeholder="Ex: Foto da lateral esquerda amassada"
                  value={mediaDesc}
                  onChange={e => setMediaDesc(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
              >
                💾 Adicionar à Galeria
              </button>
            </form>
          </div>

          {/* Galeria de Fotos e Vídeos */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4 min-h-[400px]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-600" /> Galeria do Veículo Selecionado
                </h3>
                <select
                  value={selectedPlaca || (veiculos[0]?.placa || '')}
                  onChange={e => setSelectedPlaca(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 font-bold text-slate-700"
                >
                  <option value="">Selecione um carro</option>
                  {veiculos.map(v => (
                    <option key={v.placa} value={v.placa}>
                      {v.modelo} ({v.placa})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const currentPlaca = selectedPlaca || veiculos[0]?.placa;
                const v = veiculos.find(car => car.placa === currentPlaca);
                const items = v?.fotos_videos || [];

                if (!currentPlaca) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                      <Camera className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nenhum veículo cadastrado</p>
                    </div>
                  );
                }

                if (items.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                      <Camera className="w-10 h-10 text-slate-300 stroke-1" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nenhuma foto ou vídeo cadastrado</p>
                      <p className="text-[11px] text-slate-400">Use o painel lateral para salvar mídias deste veículo.</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map(item => (
                      <div key={item.id} className="group relative bg-slate-50 rounded-xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col justify-between">
                        <div className="relative aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
                          {item.tipo === 'foto' ? (
                            <img
                              src={item.url}
                              alt={item.descricao || 'Car photo'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                            />
                          ) : (
                            <video
                              src={item.url}
                              className="w-full h-full object-cover"
                              controls
                              muted
                            />
                          )}
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleDeleteMedia(v!.placa, item.id)}
                              className="p-1 bg-white/90 hover:bg-rose-500 hover:text-white text-slate-600 rounded-md transition-colors shadow-xs"
                              title="Excluir Mídia"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className={`absolute bottom-2 left-2 px-2 py-0.5 text-[9px] font-black uppercase rounded-sm shadow-xs ${
                            item.tipo === 'foto' ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'
                          }`}>
                            {item.tipo}
                          </span>
                        </div>
                        <div className="p-3 space-y-1">
                          <p className="text-xs font-bold text-slate-800 line-clamp-2">
                            {item.descricao || 'Sem descrição'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            Cadastrado em: {item.data.split('-').reverse().join('/')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'km' && (
        <div className="space-y-6">
          {/* Quick Info Header */}
          <div className="bg-slate-50 text-slate-700 border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-3xs">
            <div className="flex gap-3 items-start">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shrink-0 mt-0.5">
                <Gauge className="w-5 h-5" />
              </div>
              <div className="text-xs space-y-1">
                <strong className="block uppercase font-black tracking-wider text-slate-900">Aba Rápida: Lançamento de KM</strong>
                <p className="leading-relaxed">
                  Consulte a quilometragem de cada carro e solicite ou registre o odômetro atual de forma rápida sempre que for solicitado ao motorista.
                </p>
              </div>
            </div>
            
            {/* Localized Search Box */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar placa ou modelo..."
                value={kmSearch}
                onChange={e => setKmSearch(e.target.value)}
                className="w-full bg-white pl-9 pr-4 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 text-xs font-semibold shadow-3xs"
              />
            </div>
          </div>

          {/* Quick KM Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {veiculos
              .filter(v => {
                const searchLower = kmSearch.toLowerCase();
                return v.placa.toLowerCase().includes(searchLower) ||
                       v.modelo.toLowerCase().includes(searchLower) ||
                       v.marca.toLowerCase().includes(searchLower);
              })
              .length > 0 ? (
                veiculos
                  .filter(v => {
                    const searchLower = kmSearch.toLowerCase();
                    return v.placa.toLowerCase().includes(searchLower) ||
                           v.modelo.toLowerCase().includes(searchLower) ||
                           v.marca.toLowerCase().includes(searchLower);
                  })
                  .map(v => {
                    const kmIni = v.km_inicial || v.km || 0;
                    const kmAtu = v.km_atual || v.km || 0;
                    const activeContract = contratos.find(c => c.veiculoPlaca === v.placa && c.status === 'Ativo');
                    const activeDriver = activeContract ? motoristas.find(m => m.cpf === activeContract.motoristaCpf) : null;

                    return (
                      <div
                        key={v.placa}
                        className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between shadow-xs hover:border-slate-300 hover:shadow-sm transition-all"
                      >
                        {/* Car Header */}
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
                          <div>
                            <PlacaMercosul placa={v.placa} size="md" />
                            <h4 className="font-extrabold text-sm text-slate-800 mt-2 flex items-center gap-1.5">
                              <CarBrandLogo brand={v.marca} className="w-4 h-4" />
                              {v.marca} {v.modelo}
                            </h4>
                          </div>
                          
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                            v.status === 'Disponível'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : v.status === 'Alugado'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {v.status}
                          </span>
                        </div>

                        {/* Car KM and Driver Info */}
                        <div className="space-y-4 flex-1">
                          {/* KM Section */}
                          <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                              <Gauge className="w-5 h-5 text-blue-500 shrink-0" />
                              <div>
                                <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider leading-none">KM Atual</span>
                                <strong className="font-mono text-sm font-extrabold text-slate-800">
                                  {kmAtu.toLocaleString('pt-BR')} km
                                </strong>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-semibold bg-white px-2 py-1 rounded border border-slate-200/60">
                              Inicial: {kmIni.toLocaleString('pt-BR')} km
                            </span>
                          </div>

                          {/* Active Driver Row */}
                          <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-100/60">
                            {activeDriver ? (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2.5">
                                  {activeDriver.foto_perfil ? (
                                    <img
                                      src={activeDriver.foto_perfil}
                                      alt={activeDriver.nome}
                                      className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0 shadow-3xs"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-extrabold flex items-center justify-center text-xs shrink-0 border border-blue-200">
                                      {activeDriver.nome.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block">Motorista Ativo</span>
                                    <span className="font-bold text-xs text-slate-800 truncate block">{activeDriver.nome}</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const text = `Olá *${activeDriver.nome}*,\n\nPassando para solicitar a foto do odômetro do veículo *${v.marca} ${v.modelo}* (${v.placa}) para atualizarmos o controle de quilometragem da frota. Obrigado!`;
                                    const encodedText = encodeURIComponent(text);
                                    const telSanitized = activeDriver.tel.replace(/\D/g, '');
                                    const url = `https://wa.me/55${telSanitized}?text=${encodedText}`;
                                    window.open(url, '_blank');
                                  }}
                                  className="w-full flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-[11px] py-1.5 rounded-lg transition-all shadow-3xs cursor-pointer"
                                  title="Solicitar foto do Odômetro via WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" /> Solicitar por WhatsApp
                                </button>
                              </div>
                            ) : (
                              <div className="text-center py-2 text-slate-400 text-xs italic">
                                Sem motorista ativo no momento
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quick Register KM Field */}
                        <div className="mt-4 pt-3 border-t border-slate-100">
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
                            Lançar Novo KM
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder={`Mín: ${kmAtu}`}
                              value={vehicleKmInputs[v.placa] || ''}
                              onChange={e => setVehicleKmInputs(prev => ({ ...prev, [v.placa]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleQuickKmSave(v);
                                }
                              }}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-bold w-full text-slate-800 shadow-3xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleQuickKmSave(v)}
                              className="bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-3xs flex items-center gap-1 shrink-0"
                              title="Salvar quilometragem"
                            >
                              <Save className="w-3.5 h-3.5" /> Lançar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="col-span-full py-12 text-center text-slate-400 italic text-sm bg-white rounded-xl border border-slate-150">
                  Nenhum veículo encontrado com os termos de busca.
                </div>
              )}
          </div>
        </div>
      )}

      {/* MODAL CADASTRAR / EDITAR VEÍCULO */}
      <AnimatePresence>
        {isModalOpen && (
          <div 
            onClick={handleCloseModalAttempt}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <Car className="w-5 h-5 text-blue-600" />
                  {editingVeiculo ? `Editar Veículo ${editingVeiculo.placa}` : 'Cadastrar Novo Veículo'}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave}>
                <div className="p-5 overflow-y-auto max-h-[82vh] space-y-4">
                  {/* PENDÊNCIAS E IRREGULARIDADES DO VEÍCULO (DOCUMENTO, SEGURO, RECALL, RASTREADOR) */}
                  {editingVeiculo && (() => {
                    const formPends = getFormPendencias();
                    if (formPends.length === 0) return null;

                    return (
                      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4.5 space-y-3 shadow-3xs">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <h4 className="text-xs font-black uppercase tracking-wider text-rose-950">
                              Pendências e Irregularidades Ativas ({formPends.length})
                            </h4>
                            <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                              Este veículo possui pendências ou informações pendentes de regularização nos módulos de **Documento, Seguro, Recall ou Rastreador**. Por favor, atualize os campos correspondentes abaixo para solucionar as seguintes pendências:
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1.5 border-t border-rose-100">
                          {formPends.map((p) => {
                            let categoryLabel = '';
                            let categoryColor = '';
                            if (p.tipo === 'documento') {
                              categoryLabel = 'Documento';
                              categoryColor = 'bg-blue-100 text-blue-800 border-blue-200';
                            } else if (p.tipo === 'seguro') {
                              categoryLabel = 'Seguro';
                              categoryColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                            } else if (p.tipo === 'recall') {
                              categoryLabel = 'Recall';
                              categoryColor = 'bg-purple-100 text-purple-800 border-purple-200';
                            } else if (p.tipo === 'rastreador') {
                              categoryLabel = 'Rastreador';
                              categoryColor = 'bg-amber-100 text-amber-800 border-amber-200';
                            }

                            return (
                              <div
                                key={p.id}
                                className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-rose-150/40 shadow-3xs hover:border-rose-300 transition-colors"
                              >
                                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${categoryColor}`}>
                                  {categoryLabel}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-extrabold text-slate-800 leading-normal">{p.titulo}</div>
                                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5 font-medium">{p.desc}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Foto Selector/Input */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex items-center gap-4">
                    <div className="relative h-16 w-20 bg-slate-200 rounded-lg border border-slate-300 overflow-hidden flex items-center justify-center text-slate-400 shadow-inner">
                      {foto ? (
                        <img src={foto} alt="Car preview" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="w-6 h-6" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">Foto do Veículo</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Cole URL da imagem"
                          value={foto}
                          onChange={e => setFoto(e.target.value)}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                        />
                        <label className="bg-white hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 flex items-center gap-1 cursor-pointer transition-all shadow-2xs">
                          <Upload className="w-3.5 h-3.5" /> Upload
                          <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Placa *
                      </label>
                      <input
                        type="text"
                        placeholder="ABC1D23"
                        value={placa}
                        onChange={e => setPlaca(e.target.value)}
                        maxLength={8}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-bold uppercase tracking-widest"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Modelo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Strada Freedom"
                        value={modelo}
                        onChange={e => setModelo(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Marca
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Fiat"
                        value={marca}
                        onChange={e => setMarca(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Ano Fabricação/Modelo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 2022/2023 ou 2022"
                        value={ano}
                        onChange={e => setAno(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-medium"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Cor
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Prata"
                        value={cor}
                        onChange={e => setCor(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Código RENAVAM
                      </label>
                      <input
                        type="text"
                        placeholder="Apenas números"
                        value={renavam}
                        onChange={e => setRenavam(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>



                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Plataformas Habilitadas
                      </label>
                      <select
                        value={plataforma}
                        onChange={e => setPlataforma(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                      >
                        <option value="Todas">Todas (Uber + 99 + inDriver)</option>
                        <option value="Uber + 99">Uber + 99</option>
                        <option value="Somente Uber">Somente Uber</option>
                        <option value="Somente 99">Somente 99</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        Status Operacional
                        {hasActiveContract && (
                          <span className="text-[9px] text-amber-700 font-extrabold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Bloqueado (Alugado)
                          </span>
                        )}
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        disabled={hasActiveContract}
                        className={`border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 font-semibold ${
                          hasActiveContract 
                            ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' 
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <option value="Disponível">Disponível</option>
                        {hasActiveContract && (
                          <option value="Alugado">Alugado</option>
                        )}
                        <option value="Em preparação">Em preparação</option>
                        <option value="Fora da frota">Fora da frota</option>
                      </select>
                      {hasActiveContract && (
                        <p className="text-[10px] text-amber-600 font-semibold leading-tight">
                          Veículo atrelado a contrato ativo. Não é possível alterar o status.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        Motorista Atrelado (Contrato)
                      </label>
                      {motoristaCpf ? (
                        <div className="flex items-center gap-2 text-slate-800">
                          <User className="w-4 h-4 text-blue-600 shrink-0" />
                          <div>
                            <span className="text-xs font-extrabold text-blue-600">
                              {motoristas.find(m => m.cpf === motoristaCpf)?.nome || motoristaCpf}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Vinculado pelo Contrato de Aluguel Ativo
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-slate-500 italic flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span>Sem motorista atrelado no momento.</span>
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 leading-normal font-medium mt-1">
                        O vínculo de motoristas e veículos é feito automaticamente e exclusivamente através de um Contrato de Aluguel ativo.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          KM Inicial *
                        </label>
                        <input
                          type="number"
                          placeholder="Inicial"
                          value={kmInicial}
                          onChange={e => {
                            setKmInicial(e.target.value);
                            if (!kmAtual || parseInt(kmAtual) < parseInt(e.target.value)) {
                              setKmAtual(e.target.value);
                            }
                          }}
                          min="0"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          KM Atual *
                        </label>
                        <input
                          type="number"
                          placeholder="Atual"
                          value={kmAtual}
                          onChange={e => setKmAtual(e.target.value)}
                          min="0"
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* SEÇÃO DE SEGURO */}
                  <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Seguro do Veículo</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={segurado}
                          onChange={e => setSegurado(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                        <span className="ml-2 text-xs font-semibold text-slate-600">
                          {segurado ? 'Possui Seguro' : 'Sem Seguro'}
                        </span>
                      </label>
                    </div>

                    {segurado && (
                      <div className="bg-emerald-50/40 border border-emerald-150 rounded-xl p-4 space-y-4">
                        <div className="text-xs font-bold text-emerald-850 uppercase tracking-tight flex items-center gap-1.5 border-b border-emerald-100 pb-2">
                          📋 Dados da Apólice de Seguro
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Seguradora</label>
                            {seguradoras && seguradoras.length > 0 ? (
                              <div className="flex flex-col gap-1.5 w-full">
                                <select
                                  value={
                                    seguroSeguradora === '' 
                                      ? '' 
                                      : (seguradoras.some(s => s.id === seguroSeguradora || s.nome === seguroSeguradora) 
                                          ? (seguradoras.find(s => s.id === seguroSeguradora || s.nome === seguroSeguradora)?.id || seguroSeguradora) 
                                          : 'custom_entry')
                                  }
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'custom_entry') {
                                      setSeguroSeguradora('Nova Seguradora');
                                    } else {
                                      setSeguroSeguradora(val);
                                      const selectedSeg = seguradoras.find(s => s.id === val);
                                      if (selectedSeg) {
                                        if (selectedSeg.tel) setSeguroTelefoneCorretora(selectedSeg.tel);
                                        if (selectedSeg.responsavel) setSeguroCorretorNome(selectedSeg.responsavel);
                                      }
                                    }
                                  }}
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-semibold text-slate-700"
                                >
                                  <option value="">-- Selecione uma Seguradora --</option>
                                  {seguradoras.map(s => (
                                    <option key={s.id} value={s.id}>{s.nome}</option>
                                  ))}
                                  <option value="custom_entry">✍️ Outra / Digitar manualmente...</option>
                                </select>
                                {(seguroSeguradora === 'custom_entry' || 
                                  (seguroSeguradora && !seguradoras.some(s => s.id === seguroSeguradora || s.nome === seguroSeguradora))) && (
                                  <input
                                    type="text"
                                    placeholder="Nome da Seguradora personalizada"
                                    value={seguroSeguradora === 'custom_entry' ? '' : seguroSeguradora}
                                    onChange={e => setSeguroSeguradora(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  placeholder="Ex: Porto Seguro, Azul, Tokio Marine"
                                  value={seguroSeguradora}
                                  onChange={e => setSeguroSeguradora(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 w-full font-medium"
                                />
                                <span className="text-[10px] text-amber-600 font-medium block">
                                  💡 Dica: Cadastre seguradoras na aba "Seguradoras" para selecioná-las aqui.
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Número da Apólice</label>
                            <input
                              type="text"
                              placeholder="Ex: 123456789"
                              value={seguroApoliceNumero}
                              onChange={e => setSeguroApoliceNumero(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Vigência - Início</label>
                            <input
                              type="date"
                              value={seguroVigenciaInicio}
                              onChange={e => setSeguroVigenciaInicio(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Vigência - Fim (Vencimento)</label>
                            <input
                              type="date"
                              value={seguroVencimento}
                              onChange={e => {
                                setSeguroVencimento(e.target.value);
                                setSeguroVigenciaFim(e.target.value);
                              }}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Tipo de Cobertura Contratada</label>
                            <input
                              type="text"
                              placeholder="Ex: Compreensiva, Terceiros, Franquia Reduzida"
                              value={seguroTipoCobertura}
                              onChange={e => setSeguroTipoCobertura(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Valor Segurado (LMI R$)</label>
                            <input
                              type="number"
                              placeholder="Ex: 50000.00"
                              value={seguroValorSegurado}
                              onChange={e => setSeguroValorSegurado(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Valor Total do Seguro (R$)</label>
                            <input
                              type="number"
                              placeholder="0.00"
                              value={seguroValor}
                              onChange={e => setSeguroValor(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Parcelas</label>
                            <input
                              type="number"
                              placeholder="Ex: 10"
                              value={seguroParcelas}
                              onChange={e => setSeguroParcelas(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Forma Pgto</label>
                            <select
                              value={seguroFormaPagamento}
                              onChange={e => setSeguroFormaPagamento(e.target.value as any)}
                              className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                            >
                              <option value="">Selecione</option>
                              <option value="Cartão">Cartão</option>
                              <option value="PIX">PIX</option>
                              <option value="Dinheiro">Dinheiro</option>
                              <option value="Conta Bancária">Conta Bancária</option>
                              <option value="Boleto">Boleto</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Nome do Corretor de Seguros</label>
                            <input
                              type="text"
                              placeholder="Ex: João Silva Corretora"
                              value={seguroCorretorNome}
                              onChange={e => setSeguroCorretorNome(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Telefone de Contato Corretor</label>
                            <input
                              type="text"
                              placeholder="Ex: (11) 99999-9999"
                              value={seguroTelefoneCorretora}
                              onChange={e => setSeguroTelefoneCorretora(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Valor da Franquia (R$)</label>
                            <input
                              type="number"
                              placeholder="Ex: 2000.00"
                              value={seguroValorFranquia}
                              onChange={e => setSeguroValorFranquia(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500 font-medium"
                            />
                          </div>
                          <div className="flex flex-col gap-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 justify-center">
                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Contrato do Seguro (PDF/Imagem)</label>
                            <div className="flex items-center gap-2">
                              <label className="bg-white hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs">
                                <Upload className="w-3 h-3 text-emerald-600 animate-pulse" /> Carregar
                                <input
                                  type="file"
                                  accept="application/pdf,image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        setSeguroContratoUrl(reader.result as string);
                                        onTriggerToast('Contrato carregado com sucesso!', 'success');
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                              {seguroContratoUrl ? (
                                <div className="flex items-center gap-1 text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                                  📄 OK!
                                  <button
                                    type="button"
                                    onClick={() => setSeguroContratoUrl('')}
                                    className="text-rose-500 hover:text-rose-700 font-bold ml-1 text-xs"
                                  >
                                    Remover
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">Nenhum</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {seguroContratoUrl && seguroContratoUrl.startsWith('data:image/') && (
                          <div className="mt-1 border border-slate-200 rounded overflow-hidden max-h-24 w-fit bg-white">
                            <img src={seguroContratoUrl} alt="Contrato de Seguro" className="max-h-24 object-contain" referrerPolicy="no-referrer" />
                          </div>
                        )}

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Observações do Seguro</label>
                          <textarea
                            placeholder="Franquia, observações extras, etc."
                            value={seguroObs}
                            onChange={e => setSeguroObs(e.target.value)}
                            rows={1}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        {/* --- REGISTRO DE SINISTRO SEÇÃO --- */}
                        <div className="border-t border-emerald-150/80 pt-3 mt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-rose-800 uppercase tracking-tight flex items-center gap-1.5">
                                🚨 Registro de Sinistro / Ocorrência
                              </span>
                              <span className="text-[10px] text-slate-400">Ative se o veículo sofreu algum acidente, roubo ou colisão</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sinistroOcorreu}
                                onChange={e => setSinistroOcorreu(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
                            </label>
                          </div>

                          {sinistroOcorreu && (
                            <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3 space-y-3 text-slate-700">
                              
                              {/* Dados do sinistro */}
                              <div className="space-y-2">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider border-b border-rose-100 pb-1">
                                  💥 Dados do Sinistro
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data e Hora da Ocorrência</label>
                                    <input
                                      type="datetime-local"
                                      value={sinistroDataHora}
                                      onChange={e => setSinistroDataHora(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase font-semibold">Local Exato</label>
                                    <input
                                      type="text"
                                      placeholder="Rua, Av, Cidade - UF"
                                      value={sinistroLocal}
                                      onChange={e => setSinistroLocal(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo do Sinistro</label>
                                    <select
                                      value={sinistroTipo}
                                      onChange={e => setSinistroTipo(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 font-semibold"
                                    >
                                      <option value="">Selecione</option>
                                      <option value="Colisão">Colisão</option>
                                      <option value="Roubo">Roubo</option>
                                      <option value="Furto">Furto</option>
                                      <option value="Incêndio">Incêndio</option>
                                      <option value="Alagamento">Alagamento</option>
                                      <option value="Perda total">Perda total</option>
                                      <option value="Dano a terceiro">Dano a terceiro</option>
                                      <option value="Outro">Outro</option>
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Houve Vítimas?</label>
                                    <select
                                      value={sinistroHouveVitimas}
                                      onChange={e => setSinistroHouveVitimas(e.target.value as any)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 font-semibold"
                                    >
                                      <option value="">Selecione</option>
                                      <option value="Não">Não</option>
                                      <option value="Sim">Sim</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição Resumida</label>
                                  <textarea
                                    placeholder="Descreva brevemente o ocorrido e as circunstâncias..."
                                    value={sinistroDescricao}
                                    onChange={e => setSinistroDescricao(e.target.value)}
                                    rows={2}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                  />
                                </div>
                              </div>

                              {/* Boletim de ocorrência */}
                              <div className="space-y-2 pt-2 border-t border-rose-100">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
                                  📑 Boletim de Ocorrência (B.O.)
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Número do BO</label>
                                    <input
                                      type="text"
                                      placeholder="BO-123456/2026"
                                      value={sinistroBoNumero}
                                      onChange={e => setSinistroBoNumero(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase font-semibold">Data do Registro</label>
                                    <input
                                      type="date"
                                      value={sinistroBoData}
                                      onChange={e => setSinistroBoData(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Delegacia</label>
                                    <input
                                      type="text"
                                      placeholder="Ex: 01º D.P. Capital"
                                      value={sinistroBoDelegacia}
                                      onChange={e => setSinistroBoDelegacia(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1 bg-white p-2 rounded-lg border border-slate-200/60">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Anexo do Documento Digitalizado</label>
                                  <div className="flex items-center gap-2">
                                    <label className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer transition-all shadow-2xs">
                                      <Upload className="w-3 h-3 text-rose-600 shrink-0" /> Carregar Documento BO
                                      <input
                                        type="file"
                                        accept="application/pdf,image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                              setSinistroBoAnexoUrl(reader.result as string);
                                              onTriggerToast('Documento do BO anexado!', 'success');
                                            };
                                            reader.readAsDataURL(file);
                                          }
                                        }}
                                        className="hidden"
                                      />
                                    </label>
                                    {sinistroBoAnexoUrl ? (
                                      <div className="flex items-center gap-1 text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                                        📄 Carregado!
                                        <button
                                          type="button"
                                          onClick={() => setSinistroBoAnexoUrl('')}
                                          className="text-rose-500 hover:text-rose-700 font-bold ml-1 text-xs"
                                        >
                                          Remover
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 font-medium">Nenhum</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Terceiros envolvidos */}
                              <div className="space-y-2 pt-2 border-t border-rose-100">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
                                  👥 Terceiros envolvidos (se houver)
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nome</label>
                                    <input
                                      type="text"
                                      placeholder="Nome do terceiro"
                                      value={sinistroTerceiroNome}
                                      onChange={e => setSinistroTerceiroNome(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">CPF</label>
                                    <input
                                      type="text"
                                      placeholder="000.000.000-00"
                                      value={sinistroTerceiroCpf}
                                      onChange={e => setSinistroTerceiroCpf(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Telefone</label>
                                    <input
                                      type="text"
                                      placeholder="(00) 00000-0000"
                                      value={sinistroTerceiroTelefone}
                                      onChange={e => setSinistroTerceiroTelefone(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Placa do Veículo</label>
                                    <input
                                      type="text"
                                      placeholder="ABC1D23"
                                      value={sinistroTerceiroPlaca}
                                      onChange={e => setSinistroTerceiroPlaca(e.target.value.toUpperCase())}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Seguradora do Terceiro</label>
                                    <input
                                      type="text"
                                      placeholder="Ex: Bradesco"
                                      value={sinistroTerceiroSeguradora}
                                      onChange={e => setSinistroTerceiroSeguradora(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nº Apólice Terceiro</label>
                                    <input
                                      type="text"
                                      placeholder="Apólice do terceiro"
                                      value={sinistroTerceiroApolice}
                                      onChange={e => setSinistroTerceiroApolice(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Acionamento junto à seguradora */}
                              <div className="space-y-2 pt-2 border-t border-rose-100">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
                                  📞 Acionamento junto à Seguradora
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data do Acionamento</label>
                                    <input
                                      type="date"
                                      value={sinistroAcionamentoData}
                                      onChange={e => setSinistroAcionamentoData(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nº do Protocolo</label>
                                    <input
                                      type="text"
                                      placeholder="Protocolo"
                                      value={sinistroAcionamentoProtocolo}
                                      onChange={e => setSinistroAcionamentoProtocolo(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nome do Atendente</label>
                                    <input
                                      type="text"
                                      placeholder="Atendente"
                                      value={sinistroAcionamentoAtendente}
                                      onChange={e => setSinistroAcionamentoAtendente(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Canal Utilizado</label>
                                    <select
                                      value={sinistroAcionamentoCanal}
                                      onChange={e => setSinistroAcionamentoCanal(e.target.value as any)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 font-semibold"
                                    >
                                      <option value="">Selecione</option>
                                      <option value="Telefone">Telefone</option>
                                      <option value="App">Aplicativo</option>
                                      <option value="Site">Site</option>
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Prazo de Retorno Informado</label>
                                    <input
                                      type="text"
                                      placeholder="Ex: 5 dias úteis"
                                      value={sinistroAcionamentoPrazo}
                                      onChange={e => setSinistroAcionamentoPrazo(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Acompanhamento do processo */}
                              <div className="space-y-2 pt-2 border-t border-rose-100">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
                                  📈 Acompanhamento do Processo
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Situação Atual</label>
                                    <select
                                      value={sinistroSituacaoAtual}
                                      onChange={e => setSinistroSituacaoAtual(e.target.value as any)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 font-bold text-slate-800"
                                    >
                                      <option value="">Selecione</option>
                                      <option value="Aguardando vistoria">Aguardando vistoria</option>
                                      <option value="Em análise">Em análise</option>
                                      <option value="Aprovado">Aprovado</option>
                                      <option value="Negado">Negado</option>
                                    </select>
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data da Vistoria Realizada</label>
                                    <input
                                      type="date"
                                      value={sinistroVistoriaData}
                                      onChange={e => setSinistroVistoriaData(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Nome da Oficina Indicada</label>
                                    <input
                                      type="text"
                                      placeholder="Nome da Oficina / Centro Automotivo"
                                      value={sinistroOficinaIndicada}
                                      onChange={e => setSinistroOficinaIndicada(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Valor do Orçamento Aprovado (R$)</label>
                                    <input
                                      type="number"
                                      placeholder="0.00"
                                      value={sinistroOrcamentoAprovado}
                                      onChange={e => setSinistroOrcamentoAprovado(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Histórico / Contatos com Seguradora</label>
                                  <textarea
                                    placeholder="Ex: 11/07 - Enviado documentos. 14/07 - Vistoria aprovada pela oficina..."
                                    value={sinistroAcompanhamentoHistorico}
                                    onChange={e => setSinistroAcompanhamentoHistorico(e.target.value)}
                                    rows={2}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                  />
                                </div>
                              </div>

                              {/* Documentos entregues */}
                              <div className="space-y-1 pt-2 border-t border-rose-100">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider block mb-1">
                                  📁 Documentos Enviados à Seguradora
                                </div>
                                <div className="grid grid-cols-3 gap-2 bg-white/70 p-2 rounded-lg border border-rose-100/60">
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sinistroDocCnh}
                                      onChange={e => setSinistroDocCnh(e.target.checked)}
                                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 w-3.5 h-3.5"
                                    />
                                    CNH
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sinistroDocCrlv}
                                      onChange={e => setSinistroDocCrlv(e.target.checked)}
                                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 w-3.5 h-3.5"
                                    />
                                    CRLV
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sinistroDocBo}
                                      onChange={e => setSinistroDocBo(e.target.checked)}
                                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 w-3.5 h-3.5"
                                    />
                                    B.O.
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sinistroDocFotos}
                                      onChange={e => setSinistroDocFotos(e.target.checked)}
                                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 w-3.5 h-3.5"
                                    />
                                    Fotos Veículo
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sinistroDocFormularioAviso}
                                      onChange={e => setSinistroDocFormularioAviso(e.target.checked)}
                                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 w-3.5 h-3.5"
                                    />
                                    Form. Aviso
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={sinistroDocLaudos}
                                      onChange={e => setSinistroDocLaudos(e.target.checked)}
                                      className="rounded text-rose-600 focus:ring-rose-500 border-slate-300 w-3.5 h-3.5"
                                    />
                                    Laudos / Extras
                                  </label>
                                </div>
                              </div>

                              {/* Resolução */}
                              <div className="space-y-2 pt-2 border-t border-rose-100">
                                <div className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider">
                                  🏁 Resolução do Processo
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Data de Conclusão</label>
                                    <input
                                      type="date"
                                      value={sinistroResolucaoData}
                                      onChange={e => setSinistroResolucaoData(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo de Resolução</label>
                                    <select
                                      value={sinistroResolucaoTipo}
                                      onChange={e => setSinistroResolucaoTipo(e.target.value as any)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 font-semibold"
                                    >
                                      <option value="">Selecione</option>
                                      <option value="Reparo">Reparo realizado</option>
                                      <option value="Indenização">Indenização paga</option>
                                      <option value="Perda total">Indenização integral (Perda total)</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase font-semibold">Valor Recebido / Reembolsado (R$)</label>
                                    <input
                                      type="number"
                                      placeholder="0.00"
                                      value={sinistroResolucaoValorRecebido}
                                      onChange={e => setSinistroResolucaoValorRecebido(e.target.value)}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 font-semibold text-emerald-700"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Observações Finais</label>
                                  <textarea
                                    placeholder="Indenização paga em conta, veículo leiloado, etc..."
                                    value={sinistroResolucaoObs}
                                    onChange={e => setSinistroResolucaoObs(e.target.value)}
                                    rows={1}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500"
                                  />
                                </div>
                              </div>

                            </div>
                          )}
                        </div>

                      </div>
                    )}
                  </div>

                  {/* SEÇÃO DE RASTREADOR */}
                  <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Rastreador do Veículo</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={possuiRastreador}
                          onChange={e => setPossuiRastreador(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        <span className="ml-2 text-xs font-semibold text-slate-600">
                          {possuiRastreador ? 'Possui Rastreador' : 'Sem Rastreador'}
                        </span>
                      </label>
                    </div>

                    {possuiRastreador && (
                      <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 space-y-3">
                        <div className="text-xs font-bold text-blue-800 uppercase tracking-tight flex items-center gap-1.5 border-b border-blue-100 pb-2">
                          📁 Subpasta: Detalhes do Rastreador
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Marca</label>
                            <input
                              type="text"
                              placeholder="Ex: Coban, Suntech"
                              value={rastreadorMarca}
                              onChange={e => setRastreadorMarca(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Modelo</label>
                            <input
                              type="text"
                              placeholder="Ex: TK-303, ST-310"
                              value={rastreadorModelo}
                              onChange={e => setRastreadorModelo(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">IMEI</label>
                            <input
                              type="text"
                              placeholder="Número do IMEI"
                              value={rastreadorImei}
                              onChange={e => setRastreadorImei(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-mono"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Operadora / Chip</label>
                            <input
                              type="text"
                              placeholder="Ex: Vivo M2M"
                              value={rastreadorOperadora}
                              onChange={e => setRastreadorOperadora(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-500 uppercase">Status</label>
                            <select
                              value={rastreadorStatus}
                              onChange={e => setRastreadorStatus(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                            >
                              <option value="Ativo">Ativo</option>
                              <option value="Inativo">Inativo</option>
                              <option value="Em Manutenção">Em Manutenção</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Observações do Rastreador</label>
                          <textarea
                            placeholder="Local de instalação, comando de bloqueio, login na plataforma etc."
                            value={rastreadorObs}
                            onChange={e => setRastreadorObs(e.target.value)}
                            rows={2}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SEÇÃO DE DOCUMENTAÇÃO DETALHADA */}
                  <div className="border-t border-slate-100 pt-4 mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-600" />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Documentação Detalhada</span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={possuiDocumentacao}
                          onChange={e => setPossuiDocumentacao(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        <span className="ml-2 text-xs font-semibold text-slate-600">
                          {possuiDocumentacao ? 'Gerenciar Documentação' : 'Sem Documentação Detalhada'}
                        </span>
                      </label>
                    </div>

                    {possuiDocumentacao && (
                      <div className="bg-purple-50/30 border border-purple-100 rounded-xl p-4 space-y-5">
                        <div className="text-xs font-bold text-purple-800 uppercase tracking-tight flex items-center gap-1.5 border-b border-purple-100 pb-2">
                          📁 Subpasta: Detalhes da Documentação
                        </div>

                        {/* CRLV (Licenciamento) */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide border-b border-purple-50 pb-1">CRLV (Licenciamento)</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Ano de Exercício</label>
                              <input
                                type="number"
                                placeholder="Ex: 2026"
                                value={crlvAnoExercicio}
                                onChange={e => setCrlvAnoExercicio(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Vencimento</label>
                              <input
                                type="date"
                                value={crlvVencimento}
                                onChange={e => setCrlvVencimento(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Situação</label>
                              <select
                                value={crlvSituacao}
                                onChange={e => setCrlvSituacao(e.target.value as any)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              >
                                <option value="">Selecione...</option>
                                <option value="Em dia">Em dia</option>
                                <option value="Vencido">Vencido</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1 justify-center">
                              <label className="text-[10px] font-bold text-slate-500 uppercase mb-1">Emitido Digital</label>
                              <label className="relative inline-flex items-center cursor-pointer mt-1">
                                <input
                                  type="checkbox"
                                  checked={crlvDigital}
                                  onChange={e => setCrlvDigital(e.target.checked)}
                                  className="sr-only peer"
                                />
                                <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                                <span className="ml-2 text-[11px] font-semibold text-slate-600">Sim</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* IPVA */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide border-b border-purple-50 pb-1">IPVA</h5>
                          <div className={`grid grid-cols-2 ${ipvaFormaPagamento === 'Cota única' ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-3`}>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Ano Referência</label>
                              <input
                                type="number"
                                placeholder="Ex: 2026"
                                value={ipvaAnoReferencia}
                                onChange={e => setIpvaAnoReferencia(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Valor Total (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={ipvaValorTotal}
                                onChange={e => setIpvaValorTotal(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Forma de Pgto</label>
                              <select
                                value={ipvaFormaPagamento}
                                onChange={e => setIpvaFormaPagamento(e.target.value as any)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              >
                                <option value="">Selecione...</option>
                                <option value="Cota única">Cota única</option>
                                <option value="Parcelado">Parcelado</option>
                              </select>
                            </div>
                            {ipvaFormaPagamento === 'Cota única' && (
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-purple-600 uppercase">Desconto (%)</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  placeholder="Ex: 9"
                                  value={ipvaDescontoCotaUnica}
                                  onChange={e => setIpvaDescontoCotaUnica(e.target.value)}
                                  className="bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold text-purple-700"
                                />
                              </div>
                            )}
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Vencimento</label>
                              <input
                                type="date"
                                value={ipvaVencimento}
                                onChange={e => setIpvaVencimento(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Situação</label>
                              <select
                                value={ipvaSituacao}
                                onChange={e => setIpvaSituacao(e.target.value as any)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              >
                                <option value="">Selecione...</option>
                                <option value="Pago">Pago</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Isento">Isento</option>
                              </select>
                            </div>

                            {ipvaFormaPagamento === 'Cota única' && ipvaValorTotal && Number(ipvaValorTotal) > 0 && ipvaDescontoCotaUnica && Number(ipvaDescontoCotaUnica) > 0 && (
                              <div className="col-span-full text-right text-xs font-bold text-purple-700 bg-purple-50/50 p-2 rounded-lg border border-purple-100 flex justify-between items-center">
                                <span>💰 Desconto aplicado: {ipvaDescontoCotaUnica}%</span>
                                <span>
                                  Valor Líquido (Cota única): R${' '}
                                  {(Number(ipvaValorTotal) * (1 - Number(ipvaDescontoCotaUnica) / 100)).toLocaleString('pt-BR', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            )}
                          </div>

                          {ipvaFormaPagamento === 'Parcelado' && (
                            <div className="mt-3 p-3 bg-purple-50/20 border border-purple-100/30 rounded-lg space-y-3">
                              <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">
                                Detalhamento das Parcelas (Até 6x)
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                {/* Parcela 1 */}
                                <div className="space-y-1.5 bg-white p-2 rounded border border-purple-50/60">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Parcela 1</div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor (R$)"
                                    value={ipvaP1Valor}
                                    onChange={e => setIpvaP1Valor(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none font-semibold placeholder:text-slate-300"
                                  />
                                  <input
                                    type="date"
                                    value={ipvaP1Vencimento}
                                    onChange={e => setIpvaP1Vencimento(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[11px] focus:outline-none font-semibold"
                                  />
                                </div>
                                {/* Parcela 2 */}
                                <div className="space-y-1.5 bg-white p-2 rounded border border-purple-50/60">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Parcela 2</div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor (R$)"
                                    value={ipvaP2Valor}
                                    onChange={e => setIpvaP2Valor(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none font-semibold placeholder:text-slate-300"
                                  />
                                  <input
                                    type="date"
                                    value={ipvaP2Vencimento}
                                    onChange={e => setIpvaP2Vencimento(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[11px] focus:outline-none font-semibold"
                                  />
                                </div>
                                {/* Parcela 3 */}
                                <div className="space-y-1.5 bg-white p-2 rounded border border-purple-50/60">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Parcela 3</div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor (R$)"
                                    value={ipvaP3Valor}
                                    onChange={e => setIpvaP3Valor(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none font-semibold placeholder:text-slate-300"
                                  />
                                  <input
                                    type="date"
                                    value={ipvaP3Vencimento}
                                    onChange={e => setIpvaP3Vencimento(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[11px] focus:outline-none font-semibold"
                                  />
                                </div>
                                {/* Parcela 4 */}
                                <div className="space-y-1.5 bg-white p-2 rounded border border-purple-50/60">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Parcela 4</div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor (R$)"
                                    value={ipvaP4Valor}
                                    onChange={e => setIpvaP4Valor(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none font-semibold placeholder:text-slate-300"
                                  />
                                  <input
                                    type="date"
                                    value={ipvaP4Vencimento}
                                    onChange={e => setIpvaP4Vencimento(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[11px] focus:outline-none font-semibold"
                                  />
                                </div>
                                {/* Parcela 5 */}
                                <div className="space-y-1.5 bg-white p-2 rounded border border-purple-50/60">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Parcela 5</div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor (R$)"
                                    value={ipvaP5Valor}
                                    onChange={e => setIpvaP5Valor(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none font-semibold placeholder:text-slate-300"
                                  />
                                  <input
                                    type="date"
                                    value={ipvaP5Vencimento}
                                    onChange={e => setIpvaP5Vencimento(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[11px] focus:outline-none font-semibold"
                                  />
                                </div>
                                {/* Parcela 6 */}
                                <div className="space-y-1.5 bg-white p-2 rounded border border-purple-50/60">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Parcela 6</div>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Valor (R$)"
                                    value={ipvaP6Valor}
                                    onChange={e => setIpvaP6Valor(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none font-semibold placeholder:text-slate-300"
                                  />
                                  <input
                                    type="date"
                                    value={ipvaP6Vencimento}
                                    onChange={e => setIpvaP6Vencimento(e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[11px] focus:outline-none font-semibold"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* DPVAT / DPEM */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide border-b border-purple-50 pb-1">DPVAT / DPEM</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Ano Referência</label>
                              <input
                                type="number"
                                placeholder="Ex: 2026"
                                value={dpvatAnoReferencia}
                                onChange={e => setDpvatAnoReferencia(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Valor (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={dpvatValor}
                                onChange={e => setDpvatValor(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Data do Pgto</label>
                              <input
                                type="date"
                                value={dpvatDataPagamento}
                                onChange={e => setDpvatDataPagamento(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Situação</label>
                              <select
                                value={dpvatSituacao}
                                onChange={e => setDpvatSituacao(e.target.value as any)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              >
                                <option value="">Selecione...</option>
                                <option value="Pago">Pago</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Isento">Isento</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Multas e Débitos */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide border-b border-purple-50 pb-1">Multas e Débitos</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Multas em Aberto (Qtd)</label>
                              <input
                                type="number"
                                placeholder="Ex: 0"
                                value={multasQuantidade}
                                onChange={e => setMultasQuantidade(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Valor Total (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={multasValorTotal}
                                onChange={e => setMultasValorTotal(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Data da Multa</label>
                              <input
                                type="date"
                                value={multasData}
                                onChange={e => setMultasData(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Situação</label>
                              <select
                                value={multasSituacao}
                                onChange={e => setMultasSituacao(e.target.value as any)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              >
                                <option value="">Selecione...</option>
                                <option value="Contestada">Contestada</option>
                                <option value="Paga">Paga</option>
                                <option value="Pendente">Pendente</option>
                                <option value="Recebido">Recebido</option>
                                <option value="A receber">A receber</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Vistoria / Inspeção */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide border-b border-purple-50 pb-1">Vistoria / Inspeção Veicular</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Última Vistoria</label>
                              <input
                                type="date"
                                value={vistoriaDataUltima}
                                onChange={e => setVistoriaDataUltima(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">KM da Última Vistoria</label>
                              <input
                                type="number"
                                placeholder="Ex: 50000"
                                value={vistoriaKmUltima}
                                onChange={e => setVistoriaKmUltima(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Resultado</label>
                              <select
                                value={vistoriaResultado}
                                onChange={e => setVistoriaResultado(e.target.value as any)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              >
                                <option value="">Selecione...</option>
                                <option value="Aprovado">Aprovado</option>
                                <option value="Aprovado com apontamento">Aprovado com apontamento</option>
                                <option value="Reprovado">Reprovado</option>
                              </select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Validade / Próxima</label>
                              <input
                                type="date"
                                value={vistoriaVencimento}
                                onChange={e => setVistoriaVencimento(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Alienação */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <div className="flex items-center justify-between border-b border-purple-50 pb-1">
                            <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide">Alienação Fiduciária</h5>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={alienacaoPossui}
                                onChange={e => setAlienacaoPossui(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                              <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase">Possui Restrição</span>
                            </label>
                          </div>
                          {alienacaoPossui && (
                            <div className="space-y-3 pt-1">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nome do Credor</label>
                                  <input
                                    type="text"
                                    placeholder="Banco ou financeira"
                                    value={alienacaoCredor}
                                    onChange={e => setAlienacaoCredor(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Nº do Contrato</label>
                                  <input
                                    type="text"
                                    placeholder="Contrato"
                                    value={alienacaoContrato}
                                    onChange={e => setAlienacaoContrato(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-mono font-semibold"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Previsão Baixa</label>
                                  <input
                                    type="text"
                                    placeholder="Ex: Dez/2028"
                                    value={alienacaoPrevisaoBaixa}
                                    onChange={e => setAlienacaoPrevisaoBaixa(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-purple-50/20 p-2.5 rounded-lg border border-purple-100/30">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-purple-700 uppercase">Valor das Parcelas (R$)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={alienacaoValorParcela}
                                    onChange={e => setAlienacaoValorParcela(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-purple-700 uppercase">Data de Pagamento</label>
                                  <input
                                    type="date"
                                    value={alienacaoDataPagamento}
                                    onChange={e => setAlienacaoDataPagamento(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-purple-700 uppercase">Qtd Parcelas Pagas</label>
                                  <input
                                    type="number"
                                    placeholder="Ex: 12"
                                    value={alienacaoParcelasPagas}
                                    onChange={e => setAlienacaoParcelasPagas(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold text-purple-700 uppercase">Qtd Parcelas Restantes</label>
                                  <input
                                    type="number"
                                    placeholder="Ex: 36"
                                    value={alienacaoParcelasRestantes}
                                    onChange={e => setAlienacaoParcelasRestantes(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Recall */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <div className="flex items-center justify-between border-b border-purple-50 pb-1">
                            <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide">Recall pendente</h5>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={recallPendente}
                                onChange={e => setRecallPendente(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                              <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase">Possui Recall</span>
                            </label>
                          </div>
                          {recallPendente && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição do Recall</label>
                                <input
                                  type="text"
                                  placeholder="Ex: Airbag, Freio ABS"
                                  value={recallDescricao}
                                  onChange={e => setRecallDescricao(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Data do Recall</label>
                                <input
                                  type="date"
                                  value={recallData}
                                  onChange={e => setRecallData(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Situação</label>
                                <select
                                  value={recallSituacao}
                                  onChange={e => setRecallSituacao(e.target.value as any)}
                                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                                >
                                  <option value="">Selecione...</option>
                                  <option value="Realizado">Realizado</option>
                                  <option value="Aguardando">Aguardando</option>
                                  <option value="Agendado">Agendado</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Arquivos e Documentos da Subpasta (Novo) */}
                        <div className="space-y-3 bg-white p-3 rounded-lg border border-purple-100/50">
                          <h5 className="text-[11px] font-bold text-purple-700 uppercase tracking-wide border-b border-purple-50 pb-1 flex justify-between items-center">
                            <span>📁 Arquivos & Documentos da Documentação</span>
                            <span className="text-[10px] text-slate-400 normal-case font-normal">Pronto uso</span>
                          </h5>
                          
                          <div className="flex flex-col gap-3">
                            {/* Drag and Drop / Input Zone */}
                            <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/10 hover:bg-purple-50/20 transition-all rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer relative group">
                              <input
                                type="file"
                                multiple
                                onChange={(e) => {
                                  if (e.target.files) {
                                    Array.from(e.target.files).forEach((file: any) => {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        const base64String = reader.result as string;
                                        const novoDoc = {
                                          id: 'doc_' + Math.random().toString(36).substr(2, 9),
                                          nome: file.name,
                                          url: base64String,
                                          data_upload: new Date().toLocaleDateString('pt-BR'),
                                          tamanho: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
                                        };
                                        setDocumentosAnexos(prev => [...prev, novoDoc]);
                                      };
                                      reader.readAsDataURL(file);
                                    });
                                  }
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              />
                              <Upload className="w-6 h-6 text-purple-500 mb-1 group-hover:scale-110 transition-transform" />
                              <p className="text-xs font-bold text-slate-700">Clique para selecionar ou arraste arquivos aqui</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Suporta PDF, Imagens (PNG, JPG) e Documentos</p>
                            </div>

                            {/* Lista de documentos atuais */}
                            {documentosAnexos.length > 0 ? (
                              <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100">
                                {documentosAnexos.map((doc) => (
                                  <div key={doc.id} className="flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2 overflow-hidden mr-2">
                                      <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                                      <div className="text-left overflow-hidden">
                                        <p className="text-xs font-semibold text-slate-700 truncate" title={doc.nome}>{doc.nome}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                          <span>{doc.data_upload}</span>
                                          {doc.tamanho && (
                                            <>
                                              <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                              <span>{doc.tamanho}</span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <a
                                        href={doc.url}
                                        download={doc.nome}
                                        className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors"
                                        title="Visualizar / Baixar"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDocumentosAnexos(prev => prev.filter(item => item.id !== doc.id));
                                        }}
                                        className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"
                                        title="Excluir"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center p-3 border border-dashed border-slate-100 rounded-lg text-[11px] text-slate-400 italic">
                                Nenhum documento anexado ainda.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Observações da documentação */}
                        <div className="flex flex-col gap-1 bg-white p-3 rounded-lg border border-purple-100/50">
                          <label className="text-[11px] font-bold text-purple-700 uppercase">Observações da Documentação</label>
                          <textarea
                            placeholder="Anote detalhes de licenciamento, multas parceladas etc."
                            value={docObservacoes}
                            onChange={e => setDocObservacoes(e.target.value)}
                            rows={3}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-purple-500 font-semibold"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-2 justify-end items-center">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAndGenerateVehiclePDF}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    title="Salva as informações do veículo e gera a Ficha e Documentos em PDF"
                  >
                    <FileDown className="w-4 h-4 shrink-0" />
                    <span>Gerar e Salvar Documentos em PDF</span>
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                  >
                    💾 Salvar Veículo
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DE ALTERAÇÕES NÃO SALVAS */}
      <AnimatePresence>
        {showUnsavedConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
                <h3 className="font-extrabold text-amber-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  Alterações Não Salvas
                </h3>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-xs text-slate-600 font-bold leading-relaxed">
                  Você realizou alterações no formulário do veículo. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
                </p>
                <p className="text-[11px] text-slate-400">
                  Tem certeza que deseja fechar a tela sem salvar os dados?
                </p>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowUnsavedConfirm(false)}
                  className="w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Continuar Editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                >
                  Sair sem Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE ARQUIVAMENTO (TRASH TO DEAD FILE) */}
      <AnimatePresence>
        {archivePlaca && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50/50">
                <h3 className="font-extrabold text-rose-800 text-base tracking-tight flex items-center gap-2">
                  <Archive className="w-5 h-5" /> Mover para Arquivo Morto
                </h3>
                <button
                  onClick={() => setArchivePlaca(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Você está prestes a mover o veículo <b className="text-slate-900 font-bold">{archivePlaca}</b> para o <b>Arquivo Morto</b>.
                  Esta ação preserva o histórico de lançamentos e contratos, mas remove o carro da frota operacional ativa.
                </p>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do Arquivamento *
                  </label>
                  <select
                    value={archiveMotivo}
                    onChange={e => setArchiveMotivo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-semibold text-slate-700"
                  >
                    <option value="">Selecione um motivo...</option>
                    <option value="Vendido para terceiros">Vendido para terceiros</option>
                    <option value="Perda total (Sinistro)">Perda total (Sinistro)</option>
                    <option value="Devolução de locação externa">Devolução de locação externa</option>
                    <option value="Inviabilidade econômica de reparo">Inviabilidade econômica de reparo</option>
                    <option value="Roubo ou Furto">Roubo ou Furto</option>
                    <option value="Outro motivo">Outro motivo</option>
                  </select>
                </div>

                {archiveMotivo === 'Outro motivo' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Descreva o motivo
                    </label>
                    <textarea
                      placeholder="Descreva detalhadamente o motivo..."
                      value={archiveMotivo === 'Outro motivo' ? '' : archiveMotivo}
                      onChange={e => setArchiveMotivo(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 h-20"
                    />
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setArchivePlaca(null)}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmArchive}
                  disabled={!archiveMotivo}
                  className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" /> Confirmar Arquivamento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom On-screen Alert Modal for Driver/Vehicle Duplicity */}
      <AnimatePresence>
        {duplicityWarning && duplicityWarning.show && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto border border-amber-200">
                  <AlertCircle className="w-6 h-6" />
                </div>
                
                <h3 className="font-extrabold text-slate-800 text-lg tracking-tight">
                  Aviso de Duplicidade
                </h3>
                
                <p className="text-sm text-slate-600 leading-relaxed font-semibold">
                  O motorista <strong className="text-slate-800 font-extrabold">{duplicityWarning.driverName}</strong> já está atrelado ao veículo <strong className="text-slate-800 font-extrabold">{duplicityWarning.vehicleName}</strong>.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Deseja vincular mesmo assim (desfazendo a associação anterior) ou trocar o motorista?
                </p>
                
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMotoristaCpf(duplicityWarning.pendingVal);
                      onTriggerToast(`Motorista ${duplicityWarning.driverName} selecionado com sucesso!`, 'success');
                      setDuplicityWarning(null);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-sm"
                  >
                    Incluir assim mesmo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMotoristaCpf('');
                      onTriggerToast('Troca de motorista selecionada.', 'warning');
                      setDuplicityWarning(null);
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition-all border border-slate-200"
                  >
                    Trocar o motorista
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMAÇÃO DE PENDÊNCIAS MODAL */}
      <AnimatePresence>
        {pendenciesToConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200"
            >
              <div className="px-5 py-4 border-b border-amber-200 flex items-center justify-between bg-amber-50">
                <h3 className="font-extrabold text-amber-800 text-sm tracking-tight flex items-center gap-2 uppercase">
                  <AlertTriangle className="w-5 h-5 text-amber-600 animate-pulse shrink-0" />
                  Pendências do Veículo Detectadas!
                </h3>
                <button
                  onClick={() => setPendenciesToConfirm(null)}
                  className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="text-sm text-slate-600 leading-relaxed space-y-3">
                  <p className="font-medium text-slate-800">
                    Atenção! Foram detectadas as seguintes pendências para este veículo:
                  </p>
                  
                  <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 space-y-2.5 max-h-56 overflow-y-auto">
                    {pendenciesToConfirm.list.map((pend, idx) => (
                      <div key={idx} className="flex gap-2.5 items-start text-xs font-semibold text-slate-700">
                        <span className="text-amber-500 shrink-0 text-sm mt-0.5">⚠️</span>
                        <span>{pend}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-500 italic">
                    Deseja ignorar estas restrições e prosseguir com o cadastro/atualização do veículo mesmo assim?
                  </p>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                <button
                  onClick={() => setPendenciesToConfirm(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-lg transition-all"
                >
                  Não, Cancelar e Corrigir
                </button>
                <button
                  onClick={() => {
                    executeSave(pendenciesToConfirm.data);
                    setPendenciesToConfirm(null);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-all shadow-sm"
                >
                  Sim, Continuar Mesmo Assim
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
