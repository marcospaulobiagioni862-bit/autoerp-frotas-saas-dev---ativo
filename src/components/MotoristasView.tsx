import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Trash2,
  Pencil,
  X,
  Phone,
  Mail,
  UserCheck,
  Briefcase,
  AlertOctagon,
  ShieldAlert,
  MapPin,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Car,
  Info,
  AlertTriangle,
  FileText,
  FileDown,
  Printer
} from 'lucide-react';
import { Motorista, Contrato, Veiculo, Pagamento, ContaReceber, ContaPagar, getFormattedAddress } from '../types';
import { getCnhAlert } from '../shared/domain/cnh';
import ModeloContratoView from './ModeloContratoView';
import { PlacaMercosul } from './PlacaMercosul';
import DocumentosMotoristaView from './documentos/DocumentosMotoristaView';

interface MotoristasViewProps {
  motoristas: Motorista[];
  contratos: Contrato[];
  veiculos: Veiculo[];
  pagamentos: Pagamento[];
  contasReceber?: ContaReceber[];
  contasPagar?: ContaPagar[];
  onAddMotorista: (m: Motorista) => void;
  onEditMotorista: (m: Motorista) => void;
  onArchiveMotorista: (cpf: string, motivo: string) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole?: string;
}

export default function MotoristasView({
  motoristas,
  contratos,
  veiculos,
  pagamentos,
  contasReceber = [],
  contasPagar = [],
  onAddMotorista,
  onEditMotorista,
  onArchiveMotorista,
  onTriggerToast,
  userRole = 'Administrador'
}: MotoristasViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Ativo' | 'Inadimplente' | 'Inativo'>('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMotorista, setEditingMotorista] = useState<Motorista | null>(null);
  const [pendenciesToConfirm, setPendenciesToConfirm] = useState<{ list: string[]; data: Motorista } | null>(null);
  const [todosDocumentos, setTodosDocumentos] = useState<any[]>([]);
  
  React.useEffect(() => {
    const stored = localStorage.getItem('auto_erp_documentos');
    if (stored) {
      setTodosDocumentos(JSON.parse(stored));
    }
  }, [isModalOpen]); // reload when modal closes


  // Archive states
  const [archiveCpf, setArchiveCpf] = useState<string | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState('');

  const handleArchiveClick = (cpfToArchive: string) => {
    setArchiveCpf(cpfToArchive);
    setArchiveMotivo('');
  };

  const confirmArchive = () => {
    if (!archiveCpf) return;
    if (!archiveMotivo.trim()) {
      onTriggerToast('Por favor, insira o motivo do arquivamento.', 'error');
      return;
    }
    const motName = motoristas.find(m => m.cpf === archiveCpf)?.nome || 'Motorista';
    onArchiveMotorista(archiveCpf, archiveMotivo.trim());
    onTriggerToast(`Cadastro de ${motName} arquivado com sucesso!`, 'success');
    setArchiveCpf(null);
  };

  // Handler para Imprimir / Salvar Ficha Cadastral e CNH do Motorista em PDF
  const handlePrintDriverFicha = (m: Motorista) => {
    const activeContract = contratos.find(c => c.motoristaCpf === m.cpf && c.status === 'Ativo');
    const activeVehicle = activeContract ? veiculos.find(v => v.placa === activeContract.veiculoPlaca) : null;
    const cnhStatus = getCnhAlert(m.cnh_venc);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Ficha do Motorista - ${m.nome}</title>
        <style>
          body { font-family: 'Segoe UI', Roboto, sans-serif; padding: 25px; color: #1e293b; line-height: 1.5; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 4px; }
          .badge { background: #0284c7; color: #fff; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: bold; }
          .photos-row { display: flex; gap: 15px; margin-bottom: 20px; }
          .photo-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; background: #f8fafc; text-align: center; }
          .photo-box img { max-height: 160px; max-width: 100%; border-radius: 6px; object-fit: contain; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
          .card-title { font-size: 11px; font-weight: 800; color: #0369a1; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-bottom: 8px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .label { font-weight: 600; color: #64748b; }
          .value { font-weight: 700; color: #0f172a; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Ficha Cadastral & Carteira de Habilitação (CNH)</h1>
            <p class="subtitle">AutoERP — Registro Oficial de Condutor • Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          <div class="badge">CPF: ${m.cpf}</div>
        </div>

        ${(m.foto_perfil || m.cnh_foto) ? `
          <div class="photos-row">
            ${m.foto_perfil ? `
              <div class="photo-box">
                <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px;">FOTO DE PERFIL</div>
                <img src="${m.foto_perfil}" alt="Perfil" />
              </div>
            ` : ''}
            ${m.cnh_foto ? `
              <div class="photo-box">
                <div style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 6px;">DOCUMENTO CNH FOTO</div>
                <img src="${m.cnh_foto}" alt="Documento CNH" />
              </div>
            ` : ''}
          </div>
        ` : ''}

        <div class="grid">
          <div class="card">
            <div class="card-title">👤 Dados Pessoais</div>
            <div class="row"><span class="label">Nome Completo:</span> <span class="value">${m.nome}</span></div>
            <div class="row"><span class="label">CPF:</span> <span class="value">${m.cpf}</span></div>
            <div class="row"><span class="label">RG:</span> <span class="value">${m.rg || 'Não informado'}</span></div>
            <div class="row"><span class="label">Data de Nascimento:</span> <span class="value">${m.nascimento ? m.nascimento.split('-').reverse().join('/') : '-'}</span></div>
            <div class="row"><span class="label">Telefone Principal:</span> <span class="value">${m.tel}</span></div>
            <div class="row"><span class="label">E-mail:</span> <span class="value">${m.email}</span></div>
            <div class="row"><span class="label">Tipo Sanguíneo:</span> <span class="value">${m.tipo_sangue || '-'}</span></div>
            <div class="row"><span class="label">Endereço:</span> <span class="value">${getFormattedAddress(m)}</span></div>
          </div>

          <div class="card">
            <div class="card-title">🪪 Carteira de Motorista (CNH)</div>
            <div class="row"><span class="label">Nº Registro CNH:</span> <span class="value">${m.cnh}</span></div>
            <div class="row"><span class="label">Categoria CNH:</span> <span class="value">${m.cat}</span></div>
            <div class="row"><span class="label">Data de Vencimento:</span> <span class="value">${m.cnh_venc ? m.cnh_venc.split('-').reverse().join('/') : '-'}</span></div>
            <div class="row"><span class="label">Status da CNH:</span> <span class="value">${cnhStatus.label}</span></div>
            <div class="row"><span class="label">Plataforma de Trabalho:</span> <span class="value">${m.plataforma || 'Todas'}</span></div>
          </div>

          <div class="card">
            <div class="card-title">🚨 Contato de Emergência</div>
            <div class="row"><span class="label">Nome do Contato:</span> <span class="value">${m.emergencia || 'Não informado'}</span></div>
            <div class="row"><span class="label">Grau de Parentesco:</span> <span class="value">${m.emergencia_grau || '-'}</span></div>
            <div class="row"><span class="label">Telefone de Emergência:</span> <span class="value">${m.tel_contato || '-'}</span></div>
          </div>

          <div class="card">
            <div class="card-title">🚗 Veículo & Contrato Vinculado</div>
            <div class="row"><span class="label">Veículo Ativo:</span> <span class="value">${activeVehicle ? activeVehicle.marca + ' ' + activeVehicle.modelo + ' (' + activeVehicle.placa + ')' : 'Nenhum'}</span></div>
            <div class="row"><span class="label">Contrato ID:</span> <span class="value">${activeContract ? '#' + activeContract.id : 'Nenhum'}</span></div>
            <div class="row"><span class="label">Status Contratual:</span> <span class="value">${activeContract ? 'Ativo' : 'Sem Contrato Vigente'}</span></div>
          </div>
        </div>

        <div class="footer">
          Ficha do Condutor gerada via AutoERP Enterprise — Documento com dados confidenciais de uso restrito da gestão da frota.
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    onTriggerToast(`Documento PDF do Motorista ${m.nome} gerado com sucesso!`, 'success');
  };

  // Form states
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [cnh, setCnh] = useState('');
  const [cat, setCat] = useState('B');
  const [cnhVenc, setCnhVenc] = useState('');
  const [plataforma, setPlataforma] = useState('Uber + 99');
  const [endereco, setEndereco] = useState('');
  const [endNumero, setEndNumero] = useState('');
  const [endComplemento, setEndComplemento] = useState('');
  const [endTipo, setEndTipo] = useState<'Casa' | 'Apartamento' | ''>('');
  const [endApartamento, setEndApartamento] = useState('');
  const [endBloco, setEndBloco] = useState('');
  const [endTorre, setEndTorre] = useState('');
  const [endAndar, setEndAndar] = useState('');
  const [endPredioNome, setEndPredioNome] = useState('');
  const [cidade, setCidade] = useState('');
  const [emergencia, setEmergencia] = useState('');
  const [status, setStatus] = useState<'Ativo' | 'Inadimplente' | 'Inativo'>('Ativo');
  const [tipoSangue, setTipoSangue] = useState('');
  const [telContato, setTelContato] = useState('');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [cnhFoto, setCnhFoto] = useState('');
  const [fotoPerfil, setFotoPerfil] = useState('');
  const [cepFiscal, setCepFiscal] = useState('');
  const [emergenciaGrau, setEmergenciaGrau] = useState('');
  const [emergenciaGrauOutros, setEmergenciaGrauOutros] = useState('');
  const [isFetchingCep, setIsFetchingCep] = useState(false);

  const fetchAddressByCep = async (cepVal: string) => {
    const cleanCep = cepVal.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      onTriggerToast('O CEP deve conter exatamente 8 dígitos para consulta.', 'warning');
      return;
    }

    setIsFetchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        onTriggerToast('CEP não encontrado ou inválido.', 'error');
      } else {
        const rua = data.logradouro || '';
        const bairro = data.bairro || '';
        const localidade = data.localidade || '';
        const uf = data.uf || '';

        let endParts = [];
        if (rua) endParts.push(rua);
        if (bairro) endParts.push(bairro);
        
        setEndereco(endParts.join(', '));
        setCidade(localidade ? `${localidade} - ${uf}` : '');
        onTriggerToast('Endereço e cidade preenchidos automaticamente!', 'success');
      }
    } catch (err) {
      onTriggerToast('Erro ao consultar o CEP. Verifique a conexão.', 'error');
    } finally {
      setIsFetchingCep(false);
    }
  };

  // Selected driver photo viewer state
  const [selectedDriverPhoto, setSelectedDriverPhoto] = useState<Motorista | null>(null);
  const [activePhotoTab, setActivePhotoTab] = useState<'perfil' | 'cnh'>('perfil');

  // Selected driver for contract modal
  const [selectedDriverCpfForContract, setSelectedDriverCpfForContract] = useState<string | null>(null);

  // Duplicity warning modal state
  const [duplicityWarning, setDuplicityWarning] = useState<{
    show: boolean;
    message: string;
    pendingVal: string;
    driverName: string;
    vehicleName: string;
  } | null>(null);

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      nome: nome.trim(),
      cpf: cpf.trim(),
      rg: rg.trim(),
      tel: tel.trim(),
      email: email.trim(),
      cnh: cnh.trim(),
      cat,
      cnhVenc,
      plataforma,
      end: endereco.trim(),
      cidade: cidade.trim(),
      emergencia: emergencia.trim(),
      status,
      tipo_sangue: tipoSangue.trim(),
      tel_contato: telContato.trim(),
      veiculoPlaca,
      cnh_foto: cnhFoto.trim(),
      foto_perfil: fotoPerfil.trim(),
      cep_fiscal: cepFiscal.trim(),
      emergencia_grau: emergenciaGrau.trim(),
      emergencia_grau_outros: emergenciaGrauOutros.trim(),
      end_numero: endNumero.trim(),
      end_complemento: endComplemento.trim(),
      end_tipo: endTipo,
      end_apartamento: endApartamento.trim(),
      end_bloco: endBloco.trim(),
      end_torre: endTorre.trim(),
      end_andar: endAndar.trim(),
      end_predio_nome: endPredioNome.trim()
    });
  };

  const getSerializedStateFromMotorista = (m: Motorista | null) => {
    if (m) {
      return JSON.stringify({
        nome: m.nome.trim(),
        cpf: m.cpf.trim(),
        rg: (m.rg || '').trim(),
        tel: m.tel.trim(),
        email: m.email.trim(),
        cnh: m.cnh.trim(),
        cat: m.cat,
        cnhVenc: m.cnh_venc,
        plataforma: m.plataforma,
        end: m.end.trim(),
        cidade: m.cidade.trim(),
        emergencia: m.emergencia.trim(),
        status: m.status,
        tipo_sangue: (m.tipo_sangue || '').trim(),
        tel_contato: (m.tel_contato || '').trim(),
        veiculoPlaca: m.veiculoPlaca || '',
        cnh_foto: (m.cnh_foto || '').trim(),
        foto_perfil: (m.foto_perfil || '').trim(),
        cep_fiscal: (m.cep_fiscal || '').trim(),
        emergencia_grau: (m.emergencia_grau || '').trim(),
        emergencia_grau_outros: (m.emergencia_grau_outros || '').trim(),
        end_numero: (m.end_numero || '').trim(),
        end_complemento: (m.end_complemento || '').trim(),
        end_tipo: m.end_tipo || '',
        end_apartamento: (m.end_apartamento || '').trim(),
        end_bloco: (m.end_bloco || '').trim(),
        end_torre: (m.end_torre || '').trim(),
        end_andar: (m.end_andar || '').trim(),
        end_predio_nome: (m.end_predio_nome || '').trim()
      });
    } else {
      return JSON.stringify({
        nome: '',
        cpf: '',
        rg: '',
        tel: '',
        email: '',
        cnh: '',
        cat: 'B',
        cnhVenc: '',
        plataforma: 'Uber + 99',
        end: '',
        cidade: '',
        emergencia: '',
        status: 'Ativo',
        tipo_sangue: '',
        tel_contato: '',
        veiculoPlaca: '',
        cnh_foto: '',
        foto_perfil: '',
        cep_fiscal: '',
        emergencia_grau: '',
        emergencia_grau_outros: '',
        end_numero: '',
        end_complemento: '',
        end_tipo: '',
        end_apartamento: '',
        end_bloco: '',
        end_torre: '',
        end_andar: '',
        end_predio_nome: ''
      });
    }
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

  const openAddModal = () => {
    setEditingMotorista(null);
    setNome('');
    setCpf('');
    setRg('');
    setTel('');
    setEmail('');
    setCnh('');
    setCat('B');
    setCnhVenc('');
    setPlataforma('Uber + 99');
    setEndereco('');
    setEndNumero('');
    setEndComplemento('');
    setEndTipo('');
    setEndApartamento('');
    setEndBloco('');
    setEndTorre('');
    setEndAndar('');
    setEndPredioNome('');
    setCidade('');
    setEmergencia('');
    setStatus('Ativo');
    setTipoSangue('');
    setTelContato('');
    setVeiculoPlaca('');
    setCnhFoto('');
    setFotoPerfil('');
    setCepFiscal('');
    setEmergenciaGrau('');
    setEmergenciaGrauOutros('');
    setOriginalFormStateJson(getSerializedStateFromMotorista(null));
    setIsModalOpen(true);
  };

  const openEditModal = (m: Motorista) => {
    setEditingMotorista(m);
    setNome(m.nome);
    setCpf(m.cpf);
    setRg(m.rg || '');
    setTel(m.tel);
    setEmail(m.email);
    setCnh(m.cnh);
    setCat(m.cat);
    setCnhVenc(m.cnh_venc);
    setPlataforma(m.plataforma);
    setEndereco(m.end);
    setEndNumero(m.end_numero || '');
    setEndComplemento(m.end_complemento || '');
    setEndTipo(m.end_tipo || '');
    setEndApartamento(m.end_apartamento || '');
    setEndBloco(m.end_bloco || '');
    setEndTorre(m.end_torre || '');
    setEndAndar(m.end_andar || '');
    setEndPredioNome(m.end_predio_nome || '');
    setCidade(m.cidade);
    setEmergencia(m.emergencia);
    setStatus(m.status);
    setTipoSangue(m.tipo_sangue || '');
    setTelContato(m.tel_contato || '');
    setVeiculoPlaca(m.veiculoPlaca || '');
    setCnhFoto(m.cnh_foto || '');
    setFotoPerfil(m.foto_perfil || '');
    setCepFiscal(m.cep_fiscal || '');
    setEmergenciaGrau(m.emergencia_grau || '');
    setEmergenciaGrauOutros(m.emergencia_grau_outros || '');
    setOriginalFormStateJson(getSerializedStateFromMotorista(m));
    setIsModalOpen(true);
  };

  const getDriverPendencies = (m: Motorista) => {
    const pends: string[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // Verificar documentos obrigatórios
    if (m.cpf) {
      const storedDocsStr = localStorage.getItem('auto_erp_documentos');
      const storedDocs: any[] = storedDocsStr ? JSON.parse(storedDocsStr) : [];
      const myDocs = storedDocs.filter(d => d.motoristaCpf === m.cpf && d.status !== 'Excluído');
      
      const hasCnh = myDocs.some(d => d.tipo === 'CNH');
      const hasDocId = myDocs.some(d => d.tipo === 'Documento de identificação' || d.tipo === 'RG' || d.tipo === 'CPF');
      const hasCompEnd = myDocs.some(d => d.tipo === 'Comprovante de endereço');
      
      if (!hasCnh) pends.push('CNH (PDF) pendente de upload nos Documentos do Motorista');
      if (!hasDocId) pends.push('Documento de Identificação (RG/CPF) pendente de upload nos Documentos');
      if (!hasCompEnd) pends.push('Comprovante de Endereço pendente de upload nos Documentos');
    }

    // 1. CNH Vencida or near expiry
    if (m.cnh_venc) {
      if (m.cnh_venc < todayStr) {
        pends.push(`CNH Vencida em ${m.cnh_venc.split('-').reverse().join('/')}`);
      } else {
        const cnhDate = new Date(m.cnh_venc + 'T00:00:00');
        const today = new Date();
        today.setHours(0,0,0,0);
        const diffTime = cnhDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          pends.push(`CNH a vencer em ${diffDays} dias (${m.cnh_venc.split('-').reverse().join('/')})`);
        }
      }
    }

    // 2. Status check
    if (m.status === 'Inadimplente') {
      pends.push(`Inadimplente no sistema`);
    } else if (m.status === 'Bloqueado') {
      pends.push(`Bloqueado no sistema`);
    } else if (m.status === 'Inativo') {
      pends.push(`Status do Motorista: Inativo`);
    }

    // 3. Financial pending rents (recebimentos only, i.e., not isDespesa)
    const motoristaRecebimentos = pagamentos.filter(p => !p.isDespesa && p.motoristaCpf === m.cpf);
    const atrasados = motoristaRecebimentos.filter(p => p.status === 'Atrasado');
    const pendentes = motoristaRecebimentos.filter(p => p.status === 'Pendente');

    if (atrasados.length > 0) {
      const totalAtrasadoVal = atrasados.reduce((sum, p) => sum + (p.saldoDevedor || p.valor), 0);
      pends.push(`Débitos em Atraso: ${atrasados.length} parcela(s) (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAtrasadoVal)})`);
    }

    if (pendentes.length > 0) {
      const totalPendenteVal = pendentes.reduce((sum, p) => sum + (p.saldoDevedor || p.valor), 0);
      pends.push(`Cobranças Pendentes: ${pendentes.length} parcela(s) (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendenteVal)})`);
    }

    return pends;
  };

  const executeSave = (motoristaData: Motorista) => {
    if (editingMotorista) {
      onEditMotorista(motoristaData);
      onTriggerToast(`Motorista ${motoristaData.nome} atualizado!`, 'success');
    } else {
      // Validar duplicidade de CPF
      if (motoristas.some(m => m.cpf === motoristaData.cpf)) {
        onTriggerToast(`O CPF ${motoristaData.cpf} já está cadastrado!`, 'error');
        return;
      }
      onAddMotorista(motoristaData);
      onTriggerToast(`Motorista ${motoristaData.nome} cadastrado com sucesso!`, 'success');
    }
    setIsModalOpen(false);
  };

  const handleImageUpload = (file: File, type: 'cnh' | 'perfil') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = type === 'cnh' ? 800 : 300;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', 0.7);
          if (type === 'cnh') {
            setCnhFoto(base64);
            if (!fotoPerfil) {
              setFotoPerfil(base64);
            }
          } else {
            setFotoPerfil(base64);
          }
          onTriggerToast('Foto carregada e otimizada com sucesso!', 'success');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMockImage = (type: 'cnh' | 'perfil') => {
    if (type === 'perfil') {
      const avatars = [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
        'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&q=80&w=200',
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200'
      ];
      const random = avatars[Math.floor(Math.random() * avatars.length)];
      setFotoPerfil(random);
      onTriggerToast('Foto de perfil de exemplo adicionada!', 'info');
    } else {
      const cnhs = [
        'https://images.unsplash.com/photo-1554774853-aae0a22c8aa4?auto=format&fit=crop&q=80&w=600',
        'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=600'
      ];
      const random = cnhs[Math.floor(Math.random() * cnhs.length)];
      setCnhFoto(random);
      onTriggerToast('Foto de CNH de exemplo adicionada!', 'info');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome || !cpf || !rg || !tel || !email || !cnh || !cnhVenc || !endereco || !endNumero || !endTipo || !cidade || !emergencia || !telContato || !tipoSangue || !emergenciaGrau) {
      onTriggerToast('Todos os campos de cadastro do motorista são de preenchimento obrigatório (*), incluindo Número de Residência e Tipo de Residência.', 'error');
      return;
    }
    


    // UNIQUE CPF VALIDATION
    const normalizedCpf = cpf.replace(/\D/g, '');
    if (!editingMotorista || editingMotorista.cpf.replace(/\D/g, '') !== normalizedCpf) {
      const cpfExists = motoristas.some(m => m.cpf.replace(/\D/g, '') === normalizedCpf);
      if (cpfExists) {
        onTriggerToast('Já existe um motorista cadastrado com este CPF!', 'error');
        return;
      }
    }

    if (emergenciaGrau === 'Outros' && !emergenciaGrauOutros.trim()) {
      onTriggerToast('Por favor, especifique o grau de parentesco ou pessoa de confiança.', 'error');
      return;
    }

    // Garantir que telefone de cobrança e contato de emergência são números diferentes
    const cleanTel = tel.replace(/\D/g, '');
    const cleanTelContato = telContato.replace(/\D/g, '');
    if (cleanTel === cleanTelContato) {
      onTriggerToast('Aviso: O telefone de emergência deve ser de outro contato (outra pessoa) para casos onde o motorista esteja impossibilitado.', 'warning');
    }

    const motoristaData: Motorista = {
      nome: nome.trim(),
      cpf: cpf.trim(),
      rg: rg.trim(),
      tel: tel.trim(),
      email: email.trim(),
      cnh: cnh.trim(),
      cat,
      cnh_venc: cnhVenc,
      plataforma,
      end: endereco.trim(),
      cidade: cityCapitalize(cidade.trim()),
      emergencia: emergencia.trim(),
      status,
      tipo_sangue: tipoSangue.trim(),
      tel_contato: telContato.trim(),
      veiculoPlaca: veiculoPlaca || undefined,
      cnh_foto: cnhFoto || undefined,
      foto_perfil: fotoPerfil || undefined,
      cep_fiscal: cepFiscal.trim() || undefined,
      emergencia_grau: emergenciaGrau || undefined,
      emergencia_grau_outros: emergenciaGrau === 'Outros' ? emergenciaGrauOutros.trim() : undefined,
      end_numero: endNumero.trim() || undefined,
      end_complemento: endComplemento.trim() || undefined,
      end_tipo: endTipo || undefined,
      end_apartamento: endTipo === 'Apartamento' ? (endApartamento.trim() || undefined) : undefined,
      end_bloco: endTipo === 'Apartamento' ? (endBloco.trim() || undefined) : undefined,
      end_torre: endTipo === 'Apartamento' ? (endTorre.trim() || undefined) : undefined,
      end_andar: endTipo === 'Apartamento' ? (endAndar.trim() || undefined) : undefined,
      end_predio_nome: endTipo === 'Apartamento' ? (endPredioNome.trim() || undefined) : undefined,
    };

    const dPends = getDriverPendencies(motoristaData);
    if (dPends.length > 0) {
      setPendenciesToConfirm({
        list: dPends,
        data: motoristaData
      });
      return;
    }

    executeSave(motoristaData);
  };

  const cityCapitalize = (str: string) => {
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  // Filtrar Motoristas
  const filteredMotoristas = motoristas.filter(m => {
    const matchesSearch =
      m.nome.toLowerCase().includes(search.toLowerCase()) ||
      m.cpf.toLowerCase().includes(search.toLowerCase()) ||
      m.tel.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'Todos' || m.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Banner Informativo sobre Regras de Contato e Alertas */}
      <div className="bg-red-950/5 border border-red-900/15 rounded-xl p-4.5 flex gap-4 items-start shadow-3xs">
        <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center shrink-0 shadow-sm text-white font-bold">
          🚨
        </div>
        <div>
          <h4 className="font-extrabold text-[12px] uppercase text-red-700 tracking-wider mb-1">
            Diretriz de Comunicação e Segurança da Frota
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            Por regra de compliance de nossa empresa: <strong>Somente o motorista recebe mensagens de alertas, avisos de CNH e cobranças financeiras</strong> em seu telefone principal. O <strong>contato emergencial deve ser um número diferente (terceiro de confiança)</strong>, acionado exclusivamente para reportar sinistros, acidentes ou emergências graves onde o motorista esteja impossibilitado de falar.
          </p>
        </div>
      </div>

      {/* Barra de Ações Superiores */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Pesquisar motorista por nome, CPF, fone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-red-600 text-sm shadow-2xs font-medium"
          />
        </div>

        <button
          onClick={openAddModal}
          className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4.5 h-4.5" /> Adicionar Motorista
        </button>
      </div>

      {/* Tabs de Filtro de Status */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(['Todos', 'Ativo', 'Inadimplente', 'Inativo'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              statusFilter === tab
                ? 'bg-red-50 text-red-600 border-b-2 border-red-600'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            {tab === 'Ativo' ? 'Ativos' : tab === 'Inadimplente' ? 'Inadimplentes' : tab === 'Inativo' ? 'Inativos' : 'Todos os Motoristas'}
          </button>
        ))}
      </div>

      {/* Tabela de Motoristas */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-red-600" /> Cadastro de Motoristas Ativos
          </h3>
          <span className="bg-red-50 text-red-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {filteredMotoristas.length} {filteredMotoristas.length === 1 ? 'motorista' : 'motoristas'} cadastrados
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse columns-divided">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-[10px] uppercase font-extrabold tracking-wider border-b border-slate-100">
                <th className="px-5 py-3.5">Nome / CPF</th>
                <th className="px-5 py-3.5">Contato do Motorista (Cobranças & Alertas)</th>
                <th className="px-5 py-3.5">Contato de Emergência (Exclusivo 🚨)</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700 font-medium">
              {filteredMotoristas.length > 0 ? (
                filteredMotoristas.map(m => (
                  <tr key={m.cpf} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Avatar do Motorista */}
                        <div
                          onClick={() => {
                            setSelectedDriverPhoto(m);
                            setActivePhotoTab(m.foto_perfil ? 'perfil' : 'cnh');
                          }}
                          className="relative w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border-2 border-slate-200/85 hover:border-red-500 cursor-pointer transition-all shadow-3xs overflow-hidden shrink-0 group/avatar"
                          title="Clique para ver fotos (Perfil/CNH)"
                        >
                          {m.foto_perfil ? (
                            <img
                              src={m.foto_perfil}
                              alt={m.nome}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-slate-500 font-extrabold text-[13px] uppercase">
                              {m.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                            </span>
                          )}
                          {m.cnh_foto && (
                            <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-600 text-white rounded-full p-0.5 text-[8px] font-bold border border-white" title="Foto da CNH cadastrada">
                              🪪
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-extrabold text-slate-800 text-sm">{m.nome}</div>
                            {m.tipo_sangue && (
                              <span className="bg-red-50 text-red-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-red-100/60 flex items-center gap-0.5" title="Tipo Sanguíneo">
                                🩸 {m.tipo_sangue}
                              </span>
                            )}
                            {(() => {
                              const myDocs = todosDocumentos.filter(d => d.motoristaCpf === m.cpf && d.status !== 'Excluído');
                              const hasCnh = myDocs.some(d => d.tipo === 'CNH');
                              const hasDocId = myDocs.some(d => d.tipo === 'Documento de identificação' || d.tipo === 'RG' || d.tipo === 'CPF');
                              const hasCompEnd = myDocs.some(d => d.tipo === 'Comprovante de endereço');
                              const ok = hasCnh && hasDocId && hasCompEnd;
                              
                              if (ok) {
                                return (
                                  <span className="bg-emerald-50 text-emerald-600 border border-emerald-200/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase" title="Documentação Completa">
                                    🟢 Docs OK
                                  </span>
                                );
                              } else {
                                return (
                                  <span className="bg-amber-50 text-amber-600 border border-amber-200/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase" title="Documentos Pendentes">
                                    🟡 Docs Pendentes
                                  </span>
                                );
                              }
                            })()}
                            {m.status === 'Inadimplente' && (
                              <span className="bg-amber-50 text-amber-600 border border-amber-200/50 text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase">
                                Bloqueio Financeiro
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-bold font-mono mt-0.5">{m.cpf}</div>
                          <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1 mt-1 max-w-[280px] break-words" title="Endereço Residencial Cadastrado">
                            <span className="text-slate-400">📍</span> {getFormattedAddress(m)}
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const activeContract = contratos.find(c => c.motoristaCpf === m.cpf && c.status === 'Ativo');
                        const activeVehicle = activeContract ? veiculos.find(v => v.placa === activeContract.veiculoPlaca) : null;
                        const associatedVehicle = m.veiculoPlaca ? veiculos.find(v => v.placa === m.veiculoPlaca) : null;

                        return (
                          <div className="mt-1.5 space-y-2">
                            {associatedVehicle && (
                              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-1 text-[11px] font-bold w-fit shadow-3xs">
                                <span className="text-[9px] uppercase text-blue-400 font-extrabold pl-1">Carro Atrelado:</span>
                                <span className="font-extrabold text-blue-900">{associatedVehicle.modelo}</span>
                                <PlacaMercosul placa={associatedVehicle.placa} size="sm" />
                              </div>
                            )}
                            {activeVehicle ? (
                              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-1 text-[11px] font-bold w-fit shadow-3xs">
                                <span className="text-[9px] uppercase text-emerald-400 font-extrabold pl-1">Aluguel Ativo:</span>
                                <span className="font-extrabold text-emerald-900">{activeVehicle.modelo}</span>
                                <PlacaMercosul placa={activeVehicle.placa} size="sm" />
                              </div>
                            ) : (
                              !associatedVehicle && (
                                <div className="text-[10px] text-slate-400 italic font-semibold flex items-center gap-1">
                                  ⚠️ Sem veículo atrelado ou alugado
                                </div>
                              )
                            )}

                            {/* Informações de Pendências do Motorista */}
                            {(() => {
                              const pends = getDriverPendencies(m);
                              if (pends.length === 0) {
                                return (
                                  <div className="text-[10px] text-emerald-600 bg-emerald-50/50 border border-emerald-200/50 rounded px-2 py-0.5 w-fit font-bold flex items-center gap-1 shadow-3xs">
                                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                    Nenhuma pendência operacional ou financeira
                                  </div>
                                );
                              }
                              return (
                                <div className="bg-rose-50/40 border border-rose-100 rounded-lg p-2 max-w-sm shadow-3xs">
                                  <div className="text-[9px] font-extrabold uppercase tracking-widest text-rose-700 flex items-center gap-1 mb-1">
                                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                    Pendências Ativas:
                                  </div>
                                  <div className="flex flex-col gap-1 pl-1">
                                    {pends.map((p, idx) => (
                                      <span key={idx} className="text-rose-700 text-[10px] font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                        {p}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </td>
                    
                    {/* Contato Principal do Motorista */}
                    <td className="px-5 py-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-800 font-bold flex-wrap">
                          <Phone className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <a
                            href={`tel:${m.tel.replace(/\D/g, '')}`}
                            className="text-slate-800 hover:text-red-600 hover:underline"
                            title="Ligar para o motorista"
                          >
                            {m.tel}
                          </a>
                          <a
                            href={`https://api.whatsapp.com/send?phone=55${m.tel.replace(/\D/g, '')}&text=${encodeURIComponent(`Olá ${m.nome}, tudo bem? Entramos em contato para tratar de assuntos sobre o seu veículo/aluguel.`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[9px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-200 px-1 py-0.2 rounded font-extrabold flex items-center gap-0.5"
                            title="WhatsApp do Motorista"
                          >
                            Zap Motorista
                          </a>
                          <span className="bg-red-50 text-red-700 text-[9px] font-bold px-1.5 py-0.2 rounded tracking-wide uppercase border border-red-100/50">
                            Receptor de Alertas
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-wrap">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span>{m.email}</span>
                          <a
                            href={`mailto:${m.email}?subject=${encodeURIComponent('Contato Administrativo')}&body=${encodeURIComponent(`Olá ${m.nome},\n\n`)}`}
                            className="text-[9px] bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-200 px-1 py-0.2 rounded font-extrabold flex items-center gap-0.5"
                            title="Enviar E-mail"
                          >
                            Enviar E-mail
                          </a>
                        </div>
                         <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5 flex-wrap">
                          <span>CNH: <strong className="text-slate-600 font-mono">{m.cnh} ({m.cat})</strong></span>
                          <span>•</span>
                          <span>Venc: <span className="font-bold text-slate-700">{m.cnh_venc.split('-').reverse().join('/')}</span></span>
                          {m.cnh_foto && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDriverPhoto(m);
                                setActivePhotoTab('cnh');
                              }}
                              className="inline-flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border border-red-100 transition-all cursor-pointer"
                              title="Visualizar imagem da CNH"
                            >
                              🪪 Ver Foto CNH
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contato de Emergência */}
                    <td className="px-5 py-3.5">
                      <div className="space-y-1 bg-slate-50 border border-slate-100 rounded-lg p-2 max-w-[280px]">
                        {m.tel_contato ? (
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-red-500 font-black text-xs">🚨</span>
                            <span className="text-slate-500 font-bold text-[10px] uppercase">Contato:</span>
                            <strong className="text-slate-800">{m.emergencia}</strong>
                          </div>
                        ) : null}

                        {m.tel_contato ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a
                              href={`tel:${m.tel_contato.replace(/\D/g, '')}`}
                              className="text-red-600 hover:text-red-700 hover:underline"
                              title="Ligar somente para Emergências"
                            >
                              {m.tel_contato}
                            </a>
                            <a
                              href={`https://api.whatsapp.com/send?phone=55${m.tel_contato.replace(/\D/g, '')}&text=${encodeURIComponent(`Olá, precisamos entrar em contato com você sobre uma situação emergencial relacionada ao motorista ${m.nome}. Por favor, responda assim que possível.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[9px] bg-red-100 hover:bg-red-200 text-red-800 border border-red-200 px-1 py-0.2 rounded font-extrabold flex items-center gap-0.5"
                              title="WhatsApp para Emergências"
                            >
                              Zap Emergência
                            </a>
                          </div>
                        ) : (
                          <span className="text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-[10px] font-semibold">
                            ⚠️ Nenhum contato emergencial configurado!
                          </span>
                        )}
                        <p className="text-[9px] text-slate-400 leading-none italic font-medium">
                          Proibido acionar para avisos financeiros ou cobranças.
                        </p>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          onClick={() => handlePrintDriverFicha(m)}
                          className="min-w-[36px] min-h-[36px] p-2 text-rose-700 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                          title="Gerar PDF / Ficha"
                          aria-label="Gerar PDF / Ficha"
                        >
                          <FileDown className="w-[18px] h-[18px] shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDriverCpfForContract(m.cpf)}
                          className="min-w-[36px] min-h-[36px] p-2 text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                          title="Gerar PDF Contrato"
                          aria-label="Gerar PDF Contrato"
                        >
                          <FileText className="w-[18px] h-[18px] shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(m)}
                          className="min-w-[36px] min-h-[36px] p-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                          title="Editar"
                          aria-label="Editar"
                        >
                          <Pencil className="w-[18px] h-[18px] shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveClick(m.cpf)}
                          className="min-w-[36px] min-h-[36px] p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center border border-slate-200 cursor-pointer"
                          title="Excluir"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-[18px] h-[18px] shrink-0" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-400 font-medium">
                    Nenhum motorista cadastrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CADASTRAR / EDITAR MOTORISTA */}
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
                  <Users className="w-5 h-5 text-red-600" />
                  {editingMotorista ? `Editar Cadastro de ${editingMotorista.nome}` : 'Cadastrar Novo Motorista'}
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
                <div className="p-5 overflow-y-auto max-h-[80vh] space-y-4">
                  
                  {/* Alerta de Políticas de Comunicação */}
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-900 leading-relaxed font-semibold flex gap-2.5 items-start">
                    <ShieldAlert className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block uppercase text-[10px] text-red-700 tracking-wider">Atenção às regras de contato:</strong>
                      O telefone principal é de uso estrito para Alertas de CNH, lembretes de pagamento e cobranças. O telefone de emergência DEVE pertencer a outra pessoa para que tenhamos um contato alternativo seguro em casos de imprevistos urgentes.
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: João da Silva Santos"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        CPF *
                      </label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={cpf}
                        onChange={e => setCpf(e.target.value)}
                        disabled={!!editingMotorista}
                        maxLength={14}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        RG *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 00.000.000-0"
                        value={rg}
                        onChange={e => setRg(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  {/* Seção 1: Contato do Motorista (Alertas e Cobranças) */}
                  <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/50 space-y-4">
                    <span className="text-[11px] font-extrabold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" /> 1. Contato do Motorista (Receptor de Alertas & Cobranças)
                    </span>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                          Telefone Principal (WhatsApp) *
                        </label>
                        <input
                          type="text"
                          placeholder="(11) 99999-9999"
                          value={tel}
                          onChange={e => setTel(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                          required
                        />
                        <span className="text-[10px] text-red-600 font-bold">
                          ⚠️ Usado para lembretes semanais, cobranças de inadimplência e alertas de CNH.
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                          E-mail *
                        </label>
                        <input
                          type="email"
                          placeholder="Ex: joao@email.com"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seção 2: Contato de Emergência (🚨 Outro Número) */}
                  <div className="border border-slate-200 rounded-xl p-4.5 bg-red-50/20 space-y-4">
                    <span className="text-[11px] font-extrabold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      🚨 2. Contato de Emergência (Exclusivo para Situações Urgentes)
                    </span>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                          Nome do Contato Emergencial *
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Maria Souza (Esposa)"
                          value={emergencia}
                          onChange={e => setEmergencia(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                          required
                        />
                        <span className="text-[10px] text-slate-500 font-bold">
                          Pessoa de confiança a ser acionada em caso de sinistros/acidentes.
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                          Telefone de Emergência (Outro Número) *
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: (11) 98888-8888"
                          value={telContato}
                          onChange={e => setTelContato(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                          required
                        />
                        <span className="text-[10px] text-red-600 font-bold">
                          🚨 Estritamente proibido enviar cobranças ou avisos financeiros para este número.
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                          Grau de Parentesco / Pessoa de Confiança *
                        </label>
                        <select
                          value={emergenciaGrau}
                          onChange={e => {
                            setEmergenciaGrau(e.target.value);
                            if (e.target.value !== 'Outros') {
                              setEmergenciaGrauOutros('');
                            }
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-600 font-semibold"
                          required
                        >
                          <option value="">Selecione...</option>
                          <option value="Pai">Pai</option>
                          <option value="Mãe">Mãe</option>
                          <option value="Filho(a)">Filho(a)</option>
                          <option value="Esposo(a)">Esposo(a)</option>
                          <option value="Amigo(a)">Amigo(a)</option>
                          <option value="Outros">Outros (especificar)</option>
                        </select>
                      </div>

                      {emergenciaGrau === 'Outros' && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                            Especificar Parentesco / Confiança *
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Irmão, Tio, Vizinho..."
                            value={emergenciaGrauOutros}
                            onChange={e => setEmergenciaGrauOutros(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                            required={emergenciaGrau === 'Outros'}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col col-span-2 gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Nº Registro CNH *
                      </label>
                      <input
                        type="text"
                        placeholder="Apenas números"
                        value={cnh}
                        onChange={e => setCnh(e.target.value)}
                        maxLength={11}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Categoria CNH
                      </label>
                      <select
                        value={cat}
                        onChange={e => setCat(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-600"
                      >
                        <option value="B">B</option>
                        <option value="AB">AB</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Vencimento CNH *
                      </label>
                      <input
                        type="date"
                        value={cnhVenc}
                        onChange={e => setCnhVenc(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Plataforma Atuante
                      </label>
                      <select
                        value={plataforma}
                        onChange={e => setPlataforma(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-600"
                      >
                        <option value="Uber">Somente Uber</option>
                        <option value="99">Somente 99</option>
                        <option value="InDriver">Somente InDriver</option>
                        <option value="Uber + 99">Uber + 99</option>
                        <option value="Todas">Todas</option>
                      </select>
                    </div>
                  </div>

                  {/* Seção 3: Fotos de Identificação (Fácil Identificação & CNH) */}
                  <div className="border border-slate-200 rounded-xl p-4.5 bg-slate-50/40 space-y-4">
                    <span className="text-[11px] font-extrabold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      🪪 3. Fotos de Identificação do Motorista
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Foto de Perfil */}
                      <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col items-center text-center space-y-3">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Foto de Perfil</span>
                        <div className="relative w-24 h-24 rounded-full border-2 border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center group/edit-avatar">
                          {fotoPerfil ? (
                            <img src={fotoPerfil} alt="Perfil" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-slate-300 text-3xl">👤</span>
                          )}
                          {fotoPerfil && (
                            <button
                              type="button"
                              onClick={() => setFotoPerfil('')}
                              className="absolute inset-0 bg-black/60 text-white font-bold text-xs opacity-0 group-hover/edit-avatar:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                        <div className="w-full space-y-1.5">
                          <label className="block text-[11px] bg-red-50 hover:bg-red-100 text-red-700 font-extrabold px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer transition-all text-center">
                            Selecionar Foto de Perfil
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageUpload(file, 'perfil');
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleMockImage('perfil')}
                            className="w-full text-[10px] text-slate-400 hover:text-slate-600 font-bold underline transition-all"
                          >
                            Usar foto de exemplo
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Recomendado: Foto de rosto nítida (avatar circular na lista).
                        </p>
                      </div>

                      {/* Foto da CNH */}
                      <div className="bg-white p-4 rounded-lg border border-slate-200 flex flex-col items-center text-center space-y-3">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Foto do Documento (CNH)</span>
                        <div className="relative w-full h-24 rounded-lg border-2 border-dashed border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center group/edit-cnh">
                          {cnhFoto ? (
                            <img src={cnhFoto} alt="CNH" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="text-slate-400 flex flex-col items-center">
                              <span className="text-2xl">🪪</span>
                              <span className="text-[9px] font-bold uppercase mt-1">Nenhum documento carregado</span>
                            </div>
                          )}
                          {cnhFoto && (
                            <button
                              type="button"
                              onClick={() => setCnhFoto('')}
                              className="absolute inset-0 bg-black/60 text-white font-bold text-xs opacity-0 group-hover/edit-cnh:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                        <div className="w-full space-y-1.5">
                          <label className="block text-[11px] bg-red-50 hover:bg-red-100 text-red-700 font-extrabold px-3 py-1.5 rounded-lg border border-red-200 cursor-pointer transition-all text-center">
                            Selecionar Foto CNH
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageUpload(file, 'cnh');
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleMockImage('cnh')}
                            className="w-full text-[10px] text-slate-400 hover:text-slate-600 font-bold underline transition-all"
                          >
                            Usar CNH de exemplo
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Recomendado: Foto nítida da CNH aberta para verificação de dados.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        CEP Fiscal da Cidade
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ex: 01001-000"
                          value={cepFiscal}
                          onChange={e => setCepFiscal(e.target.value)}
                          maxLength={9}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => fetchAddressByCep(cepFiscal)}
                          disabled={isFetchingCep}
                          className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-extrabold text-xs px-3 py-2 rounded-lg transition-all disabled:bg-slate-100 disabled:text-slate-400 shrink-0 uppercase tracking-wider cursor-pointer"
                        >
                          {isFetchingCep ? '...' : 'Preencher'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col md:col-span-2 gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Rua / Avenida / Logradouro *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Av. Paulista"
                        value={endereco}
                        onChange={e => setEndereco(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Número da Residência *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 123"
                        value={endNumero}
                        onChange={e => setEndNumero(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Complemento
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Fundos, Bloco A"
                        value={endComplemento}
                        onChange={e => setEndComplemento(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Tipo de Residência *
                      </label>
                      <select
                        value={endTipo}
                        onChange={e => setEndTipo(e.target.value as 'Casa' | 'Apartamento' | '')}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      >
                        <option value="">Selecione...</option>
                        <option value="Casa">Casa</option>
                        <option value="Apartamento">Apartamento / Prédio</option>
                      </select>
                    </div>
                  </div>

                  {endTipo === 'Apartamento' && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-50/80 border border-slate-200 rounded-lg p-3.5 space-y-3"
                    >
                      <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                        🏢 Informações do Apartamento / Prédio
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                            Nome do Prédio / Condomínio
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Edifício Bella Vista"
                            value={endPredioNome}
                            onChange={e => setEndPredioNome(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-600 font-semibold"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                              Número do Apto
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: 42"
                              value={endApartamento}
                              onChange={e => setEndApartamento(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-600 font-semibold font-mono"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                              Bloco
                            </label>
                            <input
                              type="text"
                              placeholder="Ex: B"
                              value={endBloco}
                              onChange={e => setEndBloco(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-600 font-semibold font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                            Torre
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Torre Norte"
                            value={endTorre}
                            onChange={e => setEndTorre(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-600 font-semibold"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                            Andar
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 4º"
                            value={endAndar}
                            onChange={e => setEndAndar(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-600 font-semibold font-mono"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Cidade *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: São Paulo"
                        value={cidade}
                        onChange={e => setCidade(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Tipo Sanguíneo *
                      </label>
                      <select
                        value={tipoSangue}
                        onChange={e => setTipoSangue(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      >
                        <option value="">Selecione...</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                        Status do Cadastro *
                      </label>
                      <select
                        value={status}
                        onChange={e => setStatus(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-600 font-semibold"
                        required
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Inadimplente">Inadimplente (Bloquear Envio de Carro)</option>
                        <option value="Inativo">Inativo (Desativado)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        Veículo Atrelado (Contrato)
                      </label>
                      {veiculoPlaca ? (
                        <div className="flex items-center gap-2 text-slate-800">
                          <Car className="w-4 h-4 text-blue-600 shrink-0" />
                          <div>
                            <span className="text-xs font-extrabold text-blue-600">
                              {veiculos.find(v => v.placa === veiculoPlaca)
                                ? `${veiculos.find(v => v.placa === veiculoPlaca)?.marca} ${veiculos.find(v => v.placa === veiculoPlaca)?.modelo} (${veiculoPlaca})`
                                : veiculoPlaca
                              }
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Vinculado pelo Contrato de Aluguel Ativo
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-slate-500 italic flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span>Sem veículo atrelado no momento.</span>
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 leading-normal font-medium mt-1">
                        O vínculo de motoristas e veículos é feito automaticamente e exclusivamente através de um Contrato de Aluguel ativo.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCloseModalAttempt}
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2 rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                  >
                    ✅ Salvar Dados do Motorista
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL CONFIRMAÇÃO ARQUIVAMENTO */}
      <AnimatePresence>
        {archiveCpf && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-5">
                <div className="flex items-center gap-3 text-amber-600 font-bold text-base border-b border-slate-100 pb-3 mb-4">
                  <Trash2 className="w-6 h-6 text-amber-500" />
                  Mover Motorista para o Arquivo Morto?
                </div>
                <p className="text-slate-600 text-sm leading-relaxed mb-4">
                  Esta ação não remove os dados permanentemente, mas arquiva o motorista mantendo o histórico de pagamentos e contratos.
                </p>
                <div className="flex flex-col gap-1.5 mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Motivo do arquivamento *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Desistência voluntária"
                    value={archiveMotivo}
                    onChange={e => setArchiveMotivo(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                    required
                  />
                </div>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setArchiveCpf(null)}
                  className="border border-slate-200 hover:bg-slate-100 text-slate-500 text-xs font-bold px-4 py-2 rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmArchive}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-xs"
                >
                  Confirmar e Arquivar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom On-screen Alert Modal for Vehicle/Driver Duplicity */}
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
                  O veículo <strong className="text-slate-800 font-extrabold">{duplicityWarning.vehicleName}</strong> já está atrelado ao motorista <strong className="text-slate-800 font-extrabold">"{duplicityWarning.driverName}"</strong>.
                </p>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Deseja vincular mesmo assim (desfazendo a associação anterior) ou trocar de veículo?
                </p>
                
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setVeiculoPlaca(duplicityWarning.pendingVal);
                      onTriggerToast(`Veículo ${duplicityWarning.pendingVal} selecionado com sucesso!`, 'success');
                      setDuplicityWarning(null);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 rounded-xl transition-all shadow-sm"
                  >
                    Incluir assim mesmo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVeiculoPlaca('');
                      onTriggerToast('Troca de veículo selecionada.', 'warning');
                      setDuplicityWarning(null);
                    }}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2.5 rounded-xl transition-all border border-slate-200"
                  >
                    Trocar o veículo
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
                  Pendências do Motorista Detectadas!
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
                    Atenção! Foram detectadas as seguintes pendências para este motorista:
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
                    Deseja ignorar estas restrições e prosseguir com o cadastro/atualização do motorista mesmo assim?
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

      {/* MODAL VISUALIZADOR DE FOTOS (PERFIL & CNH) */}
      <AnimatePresence>
        {selectedDriverPhoto && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-800 text-white"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="space-y-0.5">
                  <h3 className="font-extrabold text-white text-base tracking-tight uppercase flex items-center gap-2">
                    <span>🖼️ Fotos de Identificação</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Motorista: <strong className="text-slate-200">{selectedDriverPhoto.nome}</strong> • CPF: <span className="font-mono">{selectedDriverPhoto.cpf}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDriverPhoto(null)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-6 bg-slate-900/40 border-b border-slate-800 flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActivePhotoTab('perfil')}
                  className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activePhotoTab === 'perfil'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  👤 Foto de Perfil
                </button>
                <button
                  type="button"
                  onClick={() => setActivePhotoTab('cnh')}
                  className={`px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
                    activePhotoTab === 'cnh'
                      ? 'border-red-500 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🪪 Foto da CNH
                </button>
              </div>

              {/* Body */}
              <div className="p-6 bg-slate-950 flex flex-col items-center justify-center min-h-[320px] max-h-[460px] overflow-y-auto">
                {activePhotoTab === 'perfil' ? (
                  selectedDriverPhoto.foto_perfil ? (
                    <div className="relative max-w-full flex flex-col items-center">
                      <img
                        src={selectedDriverPhoto.foto_perfil}
                        alt="Perfil do Motorista"
                        className="max-h-[360px] rounded-xl object-contain border border-slate-800 shadow-xl"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-[11px] text-slate-400 mt-3 font-semibold">
                        Imagem de identificação do perfil do condutor.
                      </span>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <span className="text-5xl block mb-2">👤</span>
                      <p className="text-sm font-bold">Nenhuma foto de perfil cadastrada para este motorista.</p>
                      <p className="text-xs text-slate-600 mt-1">Edite o cadastro para inserir uma foto.</p>
                    </div>
                  )
                ) : (
                  selectedDriverPhoto.cnh_foto ? (
                    <div className="relative max-w-full flex flex-col items-center">
                      <img
                        src={selectedDriverPhoto.cnh_foto}
                        alt="Documento CNH"
                        className="max-h-[360px] rounded-xl object-contain border border-slate-800 shadow-xl"
                        referrerPolicy="no-referrer"
                      />
                      <div className="mt-3 text-center">
                        <span className="text-xs font-black uppercase bg-red-950/40 border border-red-800/40 text-red-400 px-2 py-0.5 rounded-md tracking-wider">
                          CNH REG: {selectedDriverPhoto.cnh} ({selectedDriverPhoto.cat})
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-semibold">
                          Vencimento: {selectedDriverPhoto.cnh_venc.split('-').reverse().join('/')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <span className="text-5xl block mb-2">🪪</span>
                      <p className="text-sm font-bold">Nenhuma foto do documento CNH cadastrada para este motorista.</p>
                      <p className="text-xs text-slate-600 mt-1">Edite o cadastro para inserir a foto do documento.</p>
                    </div>
                  )
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center gap-3">
                <button
                  type="button"
                  onClick={() => handlePrintDriverFicha(selectedDriverPhoto)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  Salvar Documento / CNH em PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDriverPhoto(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all"
                >
                  Fechar Visualizador
                </button>
              </div>
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
                  Você realizou alterações no formulário de motoristas. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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

      {/* MODAL CONTRATO PDF INDIVIDUAL */}
      <AnimatePresence>
        {selectedDriverCpfForContract && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
            onClick={() => setSelectedDriverCpfForContract(null)}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col cursor-default"
            >
              <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5 text-red-600" />
                    Contrato de Locação PDF & Envio
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Gerar, imprimir ou enviar via WhatsApp o contrato de {motoristas.find(m => m.cpf === selectedDriverCpfForContract)?.nome}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDriverCpfForContract(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/30">
                <ModeloContratoView
                  contratos={contratos}
                  motoristas={motoristas}
                  veiculos={veiculos}
                  onTriggerToast={onTriggerToast}
                  initialMotoristaCpf={selectedDriverCpfForContract}
                  hideSelector={true}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
