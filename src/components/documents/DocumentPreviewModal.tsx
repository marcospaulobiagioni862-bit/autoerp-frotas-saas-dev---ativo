import React, { useEffect, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface DocumentPreviewModalProps {
  url: string;
  type: string;
  name: string;
  onClose: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function DocumentPreviewModal({ url, type, name, onClose }: DocumentPreviewModalProps) {
  const [zoom, setZoom] = useState(1);
  const isImage = type.startsWith('image/');

  useEffect(() => { setZoom(1); }, [url]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (!isImage) return;
      if (event.key === '+' || event.key === '=') setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
      if (event.key === '-') setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
      if (event.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isImage, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={`Visualização de ${name}`}>
      <div className="flex h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900 sm:h-[92vh]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-3 dark:border-gray-800 sm:p-4">
          <div className="min-w-0"><h3 className="truncate font-medium">{name}</h3><p className="mt-0.5 text-xs text-slate-500">{isImage ? 'Use o zoom para conferir QR Code, números e outros detalhes da CNH.' : 'Use os controles do PDF para ampliar o documento.'}</p></div>
          <div className="flex items-center gap-1.5">
            {isImage && <><Button type="button" variant="ghost" size="sm" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM}><Minus className="h-4 w-4" /></Button><span className="min-w-14 text-center text-xs font-semibold">{Math.round(zoom * 100)}%</span><Button type="button" variant="ghost" size="sm" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM}><Plus className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={() => setZoom(1)}><RotateCcw className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" onClick={() => setZoom(MAX_ZOOM)}><Maximize2 className="h-4 w-4" /></Button></>}
            <Button type="button" variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-100 p-3 dark:bg-black/50 sm:p-4">
          {isImage ? <div className="flex min-h-full min-w-full items-center justify-center"><img src={url} alt={name} draggable={false} className="max-w-none select-none object-contain shadow-sm" style={{ width: `${zoom * 100}%`, height: 'auto' }} onDoubleClick={() => setZoom((current) => current === 1 ? 2 : 1)} /></div> : <iframe src={url} title={name} className="h-full min-h-[75vh] w-full border-0 bg-white" />}
        </div>
      </div>
    </div>
  );
}
