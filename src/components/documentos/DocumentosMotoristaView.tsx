import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Upload, Trash2, Eye, Download, RefreshCw, Plus, X, AlertCircle } from 'lucide-react';
import { TipoDocumentoMotorista, DocumentoMotorista, HistoricoDocumentoMotorista } from '../../types';
import { saveFile, getFile, deleteFile } from '../../utils/indexedDB';

interface DocumentosMotoristaViewProps {
  motoristaCpf: string;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  userRole?: string;
}

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const TIPOS_DOCUMENTO: TipoDocumentoMotorista[] = [
  'CNH', 'RG', 'CPF', 'Comprovante de endereço', 'Contrato', 'Comprovante de pagamento',
  'Documento de identificação', 'Certificado', 'Declaração', 'Outro'
];

export default function DocumentosMotoristaView({ motoristaCpf, onTriggerToast, userRole = 'Administrador' }: DocumentosMotoristaViewProps) {
  const canModify = userRole !== 'Consulta' && userRole !== 'Somente leitura';
  const canView = true; // For now all authorized roles can view

  const [documentos, setDocumentos] = useState<DocumentoMotorista[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTipo, setSelectedTipo] = useState<TipoDocumentoMotorista>('CNH');
  const [descricaoOutro, setDescricaoOutro] = useState('');
  const [observacao, setObservacao] = useState('');
  
  const [documentoSubstituicao, setDocumentoSubstituicao] = useState<DocumentoMotorista | null>(null);

  // Load documents
  useEffect(() => {
    if (!motoristaCpf) return;
    const loadDocs = () => {
      const stored = localStorage.getItem('auto_erp_documentos');
      if (stored) {
        const allDocs: DocumentoMotorista[] = JSON.parse(stored);
        setDocumentos(allDocs.filter(d => d.motoristaCpf === motoristaCpf && d.status !== 'Excluído'));
      }
    };
    loadDocs();
  }, [motoristaCpf]);

  const saveToLocalStorage = (newDocs: DocumentoMotorista[]) => {
    const stored = localStorage.getItem('auto_erp_documentos');
    let allDocs: DocumentoMotorista[] = stored ? JSON.parse(stored) : [];
    
    // Remove old docs for this driver, add new ones
    allDocs = allDocs.filter(d => d.motoristaCpf !== motoristaCpf);
    allDocs = [...allDocs, ...newDocs];
    
    localStorage.setItem('auto_erp_documentos', JSON.stringify(allDocs));
    setDocumentos(newDocs.filter(d => d.status !== 'Excluído'));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        onTriggerToast('Formato inválido. Selecione somente um arquivo PDF.', 'error');
        return;
      }
      
      if (file.size > MAX_FILE_SIZE_BYTES) {
        onTriggerToast(`O arquivo selecionado ultrapassa o tamanho máximo permitido de ${MAX_FILE_SIZE_MB} MB.`, 'error');
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Mock progress
        let progress = 0;
        const interval = setInterval(() => {
          progress += 20;
          setUploadProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
            resolve(reader.result as string);
          }
        }, 100);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSaveDocument = async () => {
    if (!selectedFile) return;
    if (!motoristaCpf) {
      onTriggerToast('Preencha o CPF do motorista antes de adicionar documentos.', 'warning');
      return;
    }
    
    if (selectedTipo === 'Outro' && !descricaoOutro.trim()) {
      onTriggerToast('Informe o nome ou a descrição do documento.', 'warning');
      return;
    }

    if (documentoSubstituicao) {
      if (!window.confirm('Deseja substituir o documento atual?')) {
        return;
      }
    }

    // Check duplicates
    if (!documentoSubstituicao) {
      const isDuplicate = documentos.some(d => d.tipo === selectedTipo && d.nomeOriginal === selectedFile.name);
      if (isDuplicate) {
        onTriggerToast('Este documento já está cadastrado para o motorista.', 'warning');
        return;
      }
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const base64Data = await readFileAsBase64(selectedFile);
      
      const docId = `DOC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await saveFile(docId, base64Data);

      const now = new Date().toISOString();
      const historicoItem: HistoricoDocumentoMotorista = {
        id: `HIST-${Date.now()}`,
        dataHora: now,
        usuario: userRole, // Mocked user
        acao: documentoSubstituicao ? 'Substituição' : 'Upload',
        versao: documentoSubstituicao ? documentoSubstituicao.historico.length + 1 : 1
      };

      let newDoc: DocumentoMotorista;

      if (documentoSubstituicao) {
        newDoc = {
          ...documentoSubstituicao,
          nomeOriginal: selectedFile.name,
          nomeInterno: docId,
          tamanhoBytes: selectedFile.size,
          dataAtualizacao: now,
          observacao: observacao || documentoSubstituicao.observacao,
          historico: [...documentoSubstituicao.historico, historicoItem]
        };
        // Delete old file
        await deleteFile(documentoSubstituicao.nomeInterno);
      } else {
        newDoc = {
          id: docId,
          motoristaCpf: motoristaCpf,
          tipo: selectedTipo,
          nomeOriginal: selectedFile.name,
          nomeInterno: docId,
          descricaoOutro: selectedTipo === 'Outro' ? descricaoOutro : undefined,
          observacao: observacao,
          tamanhoBytes: selectedFile.size,
          dataEnvio: now,
          dataAtualizacao: now,
          usuarioResponsavel: userRole,
          status: 'Ativo',
          historico: [historicoItem]
        };
      }

      const updatedDocs = documentoSubstituicao 
        ? documentos.map(d => d.id === documentoSubstituicao.id ? newDoc : d)
        : [...documentos, newDoc];

      saveToLocalStorage(updatedDocs);
      onTriggerToast('Documento salvo com sucesso.', 'success');
      
      // Reset form
      setShowAddForm(false);
      setSelectedFile(null);
      setDescricaoOutro('');
      setObservacao('');
      setDocumentoSubstituicao(null);
    } catch (error) {
      console.error(error);
      onTriggerToast('Erro ao salvar documento.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentoMotorista) => {
    try {
      const data = await getFile(doc.nomeInterno);
      if (data) {
        const link = document.createElement('a');
        link.href = data;
        link.download = doc.nomeOriginal;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Update audit
        const updatedDoc = {
          ...doc,
          historico: [...doc.historico, {
            id: `HIST-${Date.now()}`,
            dataHora: new Date().toISOString(),
            usuario: userRole,
            acao: 'Download',
            versao: doc.historico.length
          } as HistoricoDocumentoMotorista]
        };
        saveToLocalStorage(documentos.map(d => d.id === doc.id ? updatedDoc : d));
      } else {
        onTriggerToast('Arquivo não encontrado no banco de dados local.', 'error');
      }
    } catch (err) {
      console.error(err);
      onTriggerToast('Erro ao baixar documento.', 'error');
    }
  };

  const handleView = async (doc: DocumentoMotorista) => {
    try {
      const data = await getFile(doc.nomeInterno);
      if (data) {
        // Open in new tab or create a blob URL
        const pdfWindow = window.open("");
        if (pdfWindow) {
          pdfWindow.document.write(`<iframe width='100%' height='100%' src='${data}'></iframe>`);
          pdfWindow.document.title = doc.nomeOriginal;
        } else {
          onTriggerToast('Permita pop-ups para visualizar o documento.', 'warning');
        }
        
        // Update audit
        const updatedDoc = {
          ...doc,
          historico: [...doc.historico, {
            id: `HIST-${Date.now()}`,
            dataHora: new Date().toISOString(),
            usuario: userRole,
            acao: 'Visualização',
            versao: doc.historico.length
          } as HistoricoDocumentoMotorista]
        };
        saveToLocalStorage(documentos.map(d => d.id === doc.id ? updatedDoc : d));
      } else {
        onTriggerToast('Arquivo não encontrado no banco de dados local.', 'error');
      }
    } catch (err) {
      console.error(err);
      onTriggerToast('Erro ao visualizar documento.', 'error');
    }
  };

  const handleDelete = async (doc: DocumentoMotorista) => {
    if (window.confirm('Tem certeza que deseja excluir este documento? Esta ação poderá ser permanente.')) {
      try {
        const updatedDoc: DocumentoMotorista = {
          ...doc,
          status: 'Excluído',
          historico: [...doc.historico, {
            id: `HIST-${Date.now()}`,
            dataHora: new Date().toISOString(),
            usuario: userRole,
            acao: 'Exclusão',
            versao: doc.historico.length,
            motivo: 'Exclusão solicitada pelo usuário'
          }]
        };
        saveToLocalStorage(documentos.map(d => d.id === doc.id ? updatedDoc : d));
        onTriggerToast('Documento excluído com sucesso.', 'success');
      } catch (err) {
        console.error(err);
        onTriggerToast('Erro ao excluir documento.', 'error');
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-extrabold text-slate-800 text-sm tracking-tight flex items-center gap-2 uppercase">
          <FileText className="w-4 h-4 text-red-600" />
          Documentos do Motorista
        </h3>
        {!showAddForm && canModify && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Documento PDF
          </button>
        )}
      </div>

      <div className="p-5">
        {showAddForm && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-slate-800 text-sm">
                {documentoSubstituicao ? 'Substituir Documento' : 'Novo Documento'}
              </h4>
              <button 
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setDocumentoSubstituicao(null);
                  setSelectedFile(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-extrabold text-slate-500 uppercase">Tipo do Documento *</label>
                <select
                  value={selectedTipo}
                  onChange={(e) => setSelectedTipo(e.target.value as TipoDocumentoMotorista)}
                  disabled={!!documentoSubstituicao}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                >
                  {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {selectedTipo === 'Outro' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-extrabold text-slate-500 uppercase">Descrição *</label>
                  <input
                    type="text"
                    value={descricaoOutro}
                    onChange={(e) => setDescricaoOutro(e.target.value)}
                    placeholder="Informe o nome ou a descrição..."
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 mb-4">
              <label className="text-xs font-extrabold text-slate-500 uppercase">Arquivo PDF *</label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors relative">
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-sm font-semibold text-slate-700">
                  {selectedFile ? selectedFile.name : 'Clique ou arraste um arquivo PDF aqui'}
                </span>
                <span className="text-xs text-slate-500 mt-1">
                  {selectedFile ? `Tamanho: ${formatBytes(selectedFile.size)}` : 'Tamanho máximo: 10 MB'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 mb-6">
              <label className="text-xs font-extrabold text-slate-500 uppercase">Observação</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600 font-semibold resize-none"
              />
            </div>

            {isUploading && (
              <div className="mb-4">
                <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                  <span>Enviando documento...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-600 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setDocumentoSubstituicao(null);
                  setSelectedFile(null);
                }}
                disabled={isUploading}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDocument}
                disabled={!selectedFile || isUploading}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {documentoSubstituicao ? 'Substituir' : 'Salvar Documento'}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-3 px-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="py-3 px-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Arquivo</th>
                <th className="py-3 px-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Data</th>
                <th className="py-3 px-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documentos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500 text-sm font-medium">
                    Nenhum documento cadastrado para este motorista.
                  </td>
                </tr>
              ) : (
                documentos.map(doc => (
                  <tr key={doc.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 text-sm">
                          {doc.tipo === 'Outro' ? doc.descricaoOutro : doc.tipo}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {formatBytes(doc.tamanhoBytes)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-slate-700 truncate max-w-[200px] block" title={doc.nomeOriginal}>
                        {doc.nomeOriginal}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-700">
                          {new Date(doc.dataAtualizacao).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="text-xs text-slate-500">
                          {new Date(doc.dataAtualizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleView(doc)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {canModify && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setDocumentoSubstituicao(doc);
                                setSelectedTipo(doc.tipo);
                                setShowAddForm(true);
                              }}
                              className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Substituir"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
