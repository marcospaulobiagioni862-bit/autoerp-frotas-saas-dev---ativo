import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image as ImageIcon,
  Video as VideoIcon,
  Plus,
  Trash2,
  Upload,
  Play,
  Film,
  Camera,
  Car,
  X,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { Veiculo } from '../types';

interface FotosVideosViewProps {
  veiculos: Veiculo[];
  onEditVeiculo: (v: Veiculo) => void;
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error') => void;
}

export default function FotosVideosView({
  veiculos,
  onEditVeiculo,
  onTriggerToast
}: FotosVideosViewProps) {
  const [selectedPlaca, setSelectedPlaca] = useState<string>('');
  const [mediaType, setMediaType] = useState<'foto' | 'video'>('foto');
  const [descricao, setDescricao] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [originalFormStateJson, setOriginalFormStateJson] = useState('');
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);

  const getSerializedFormState = () => {
    return JSON.stringify({
      mediaType,
      descricao: descricao.trim(),
      mediaUrl: mediaUrl.trim()
    });
  };

  const isFormDirty = () => {
    return originalFormStateJson !== getSerializedFormState();
  };

  const handleCloseModalAttempt = () => {
    if (isFormDirty()) {
      setShowUnsavedConfirm(true);
    } else {
      setIsAddOpen(false);
    }
  };

  const handleConfirmDiscard = () => {
    setShowUnsavedConfirm(false);
    setIsAddOpen(false);
    setMediaUrl('');
    setDescricao('');
    onTriggerToast('As alterações não foram salvas!', 'warning');
  };

  const selectedVeiculo = veiculos.find(v => v.placa === selectedPlaca);
  const mediaList = selectedVeiculo?.fotos_videos || [];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        onTriggerToast('O arquivo excede o limite recomendado de 8MB!', 'warning');
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveMedia = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVeiculo) {
      onTriggerToast('Por favor, selecione um veículo primeiro.', 'error');
      return;
    }
    if (!mediaUrl.trim()) {
      onTriggerToast('Por favor, faça upload ou insira uma URL de mídia.', 'error');
      return;
    }

    const newMedia = {
      id: `media_${Date.now()}`,
      url: mediaUrl,
      tipo: mediaType,
      descricao: descricao.trim() || `${mediaType === 'foto' ? 'Foto' : 'Vídeo'} do veículo`,
      data: new Date().toISOString().split('T')[0]
    };

    const updatedVeiculo: Veiculo = {
      ...selectedVeiculo,
      fotos_videos: [newMedia, ...mediaList]
    };

    onEditVeiculo(updatedVeiculo);
    onTriggerToast('Mídia adicionada com sucesso!', 'success');

    // Reset form
    setMediaUrl('');
    setDescricao('');
    setIsAddOpen(false);
  };

  const handleDeleteMedia = (mediaId: string) => {
    if (!selectedVeiculo) return;
    if (confirm('Tem certeza de que deseja excluir esta foto/vídeo?')) {
      const updatedVeiculo: Veiculo = {
        ...selectedVeiculo,
        fotos_videos: mediaList.filter(item => item.id !== mediaId)
      };
      onEditVeiculo(updatedVeiculo);
      onTriggerToast('Mídia removida com sucesso!', 'success');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header Selector bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Car className="w-5 h-5" />
          </div>
          <div className="flex-1 md:flex-none">
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Selecionar Veículo</label>
            <select
              value={selectedPlaca}
              onChange={e => setSelectedPlaca(e.target.value)}
              className="bg-transparent border-none text-slate-800 font-bold focus:outline-none text-sm pr-8 cursor-pointer"
            >
              <option value="">Selecione...</option>
              {veiculos.map(v => (
                <option key={v.placa} value={v.placa}>
                  {v.modelo} ({v.placa})
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedPlaca && (
          <button
            onClick={() => {
              setMediaType('foto');
              setDescricao('');
              setMediaUrl('');
              setOriginalFormStateJson(JSON.stringify({
                mediaType: 'foto',
                descricao: '',
                mediaUrl: ''
              }));
              setIsAddOpen(true);
            }}
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Enviar Mídia
          </button>
        )}
      </div>

      {selectedPlaca ? (
        <div className="space-y-6">
          {/* Media Count and Quick Summary */}
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 text-sm tracking-tight uppercase flex items-center gap-2">
              <Film className="w-4 h-4 text-blue-600" /> Galeria do Veículo ({mediaList.length} itens)
            </h3>
          </div>

          {/* Grid of media cards */}
          {mediaList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {mediaList.map(item => (
                <div key={item.id} className="group bg-white rounded-xl border border-slate-200/70 overflow-hidden shadow-xs hover:shadow-md transition-all relative flex flex-col">
                  {/* Photo or Video display */}
                  <div className="relative aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
                    {item.tipo === 'foto' ? (
                      <img
                        src={item.url}
                        alt={item.descricao}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full relative">
                        {item.url.startsWith('data:video') || item.url.includes('.mp4') || item.url.includes('webm') ? (
                          <video src={item.url} controls className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                            <Play className="w-10 h-10 text-white/80 bg-blue-600/90 rounded-full p-2" />
                            <span className="text-xs font-mono font-bold text-white/90">Vídeo Link</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete overlay button */}
                    <button
                      onClick={() => handleDeleteMedia(item.id)}
                      className="absolute top-2.5 right-2.5 bg-white/90 hover:bg-rose-50 text-slate-500 hover:text-rose-600 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-xs border border-slate-200/50"
                      title="Excluir Mídia"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Description / metadata */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700 leading-snug line-clamp-2">
                      {item.descricao}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1">
                        {item.tipo === 'foto' ? <Camera className="w-3 h-3 text-blue-500" /> : <Film className="w-3 h-3 text-amber-500" />}
                        {item.tipo === 'foto' ? 'FOTO' : 'VÍDEO'}
                      </span>
                      <span>{item.data}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center flex flex-col items-center justify-center max-w-lg mx-auto">
              <div className="p-4 bg-slate-50 text-slate-400 rounded-full mb-4 border border-slate-100">
                <ImageIcon className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-slate-800 mb-1">Nenhuma mídia salva ainda</h4>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mb-5">
                Faça upload de fotos do estado físico do veículo, vistorias de entrega, vídeos de funcionamento de motor ou qualquer mídia importante.
              </p>
              <button
                onClick={() => {
                  setMediaType('foto');
                  setDescricao('');
                  setMediaUrl('');
                  setOriginalFormStateJson(JSON.stringify({
                    mediaType: 'foto',
                    descricao: '',
                    mediaUrl: ''
                  }));
                  setIsAddOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg transition-all shadow-sm"
              >
                Enviar primeira mídia
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-12 text-center max-w-lg mx-auto">
          <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Selecione um veículo acima para gerenciar a galeria de fotos e vídeos</p>
        </div>
      )}

      {/* MODAL ENVIAR MÍDIA */}
      <AnimatePresence>
        {isAddOpen && selectedVeiculo && (
          <div onClick={handleCloseModalAttempt} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs cursor-pointer">
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 cursor-default"
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-extrabold text-slate-800 text-base tracking-tight flex items-center gap-2">
                  <Upload className="w-5 h-5 text-blue-600" /> Enviar Mídia - {selectedVeiculo.modelo}
                </h3>
                <button
                  type="button"
                  onClick={handleCloseModalAttempt}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMedia}>
                <div className="p-5 space-y-4">
                  {/* Tipo de Mídia Selector */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMediaType('foto')}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border transition-all ${
                        mediaType === 'foto'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Camera className="w-4 h-4" /> Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaType('video')}
                      className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border transition-all ${
                        mediaType === 'video'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Film className="w-4 h-4" /> Vídeo
                    </button>
                  </div>

                  {/* Upload Container */}
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center gap-3 relative">
                    {mediaUrl ? (
                      <div className="w-full relative rounded-lg border border-slate-300 overflow-hidden aspect-video bg-slate-950 flex items-center justify-center">
                        {mediaType === 'foto' ? (
                          <img src={mediaUrl} alt="Preview" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4">
                            <Film className="w-8 h-8 text-amber-500" />
                            <span className="text-xs font-mono font-bold text-slate-600 line-clamp-1">{mediaUrl.substring(0, 40)}...</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setMediaUrl('')}
                          className="absolute top-2 right-2 bg-slate-900/80 hover:bg-slate-950 text-white p-1 rounded-full transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="p-3 bg-white text-slate-400 rounded-full border border-slate-200/60 shadow-2xs">
                          {mediaType === 'foto' ? <Camera className="w-6 h-6 text-blue-500" /> : <Film className="w-6 h-6 text-amber-500" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-700 mb-0.5">Selecione ou arraste o arquivo</p>
                          <p className="text-[10px] text-slate-400 font-semibold">Formatos: {mediaType === 'foto' ? 'JPG, PNG, WEBP' : 'MP4, WEBM'} (Máx 8MB)</p>
                        </div>
                        <label className="bg-white hover:bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-xs font-bold text-slate-600 flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs">
                          <Upload className="w-4 h-4" /> Carregar Arquivo
                          <input
                            type="file"
                            accept={mediaType === 'foto' ? 'image/*' : 'video/*'}
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      </>
                    )}
                  </div>

                  {/* Manual URL Input */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ou insira o Link (URL)</label>
                    <input
                      type="text"
                      placeholder="https://exemplo.com/carro.jpg"
                      value={mediaUrl}
                      onChange={e => setMediaUrl(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Description / Annotation */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Descrição / Anotação *</label>
                    <input
                      type="text"
                      placeholder="Ex: Vistoria de entrega, arranhão no para-choque"
                      value={descricao}
                      onChange={e => setDescricao(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-medium"
                      required
                    />
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
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                  >
                    💾 Salvar Mídia
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
                  Você realizou alterações no formulário de mídias. Se você sair agora, as novas informações <strong>não serão salvas</strong> e as alterações serão perdidas.
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
    </motion.div>
  );
}
