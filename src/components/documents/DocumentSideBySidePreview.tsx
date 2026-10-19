import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import { Button } from '../ui/Button';

export interface DocumentSideBySidePreviewProps {
  file?: File | null;
  attachmentId?: string | null;
  title?: string;
  className?: string;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.25;

export const DocumentSideBySidePreview: React.FC<DocumentSideBySidePreviewProps> = ({
  file,
  attachmentId,
  title = 'Documento Anexado',
  className = '',
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;

    if (file) {
      createdUrl = URL.createObjectURL(file);
      setBlobUrl(createdUrl);
      setMimeType(file.type || 'image/jpeg');
      setFileName(file.name);
      setLoading(false);
      setError(null);
      return () => {
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    if (attachmentId) {
      setLoading(true);
      setError(null);
      AttachmentClient.get(attachmentId)
        .then((meta) => {
          if (!active) return;
          setFileName(meta.fileName);
          setMimeType(meta.mimeType);
          return AttachmentClient.content(attachmentId);
        })
        .then((blob) => {
          if (!active || !blob) return;
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (!active) return;
          setError(err instanceof Error ? err.message : 'Não foi possível carregar a pré-visualização do documento.');
          setLoading(false);
        });

      return () => {
        active = false;
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    setBlobUrl(null);
    setMimeType('');
    setFileName('');
    setLoading(false);
    return undefined;
  }, [file, attachmentId]);

  const isPdf = mimeType.toLowerCase().includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
  const isImage = !isPdf;

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100));
  const handleZoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100));
  const handleZoomReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotateCw = () => setRotation((r) => (r + 90) % 360);
  const handleRotateCcw = () => setRotation((r) => (r - 90 + 360) % 360);

  return (
    <div
      className={`flex flex-col rounded-xl border border-graphite-200 bg-graphite-50 dark:border-graphite-800 dark:bg-graphite-900/60 overflow-hidden ${className}`}
      data-testid="document-side-by-side-preview"
    >
      {/* Barra de Ferramentas / Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-graphite-200 px-3 py-2.5 dark:border-graphite-800 bg-white/70 dark:bg-graphite-950/70">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-graphite-900 dark:text-graphite-100 truncate" title={title}>
            {title}
          </p>
          {fileName && (
            <p className="text-[11px] text-graphite-500 truncate" title={fileName}>
              {fileName}
            </p>
          )}
        </div>

        {/* Controles de Zoom e Giro (apenas imagem ou controles PDF) */}
        {isImage && blobUrl && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRotateCcw}
              title="Girar 90° para esquerda (anti-horário)"
              data-testid="btn-rotate-ccw"
              className="p-1.5 h-7 w-7"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRotateCw}
              title="Girar 90° para direita (horário)"
              data-testid="btn-rotate-cw"
              className="p-1.5 h-7 w-7"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>

            <span
              className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-graphite-200 dark:bg-graphite-800 text-graphite-700 dark:text-graphite-300"
              data-testid="badge-rotation"
            >
              {rotation}°
            </span>

            <div className="h-4 w-px bg-graphite-300 dark:bg-graphite-700 mx-0.5" />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              title="Diminuir zoom"
              data-testid="btn-zoom-out"
              className="p-1.5 h-7 w-7"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span
              className="min-w-9 text-center text-[10px] font-mono font-semibold text-graphite-800 dark:text-graphite-200"
              data-testid="badge-zoom"
            >
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              title="Aumentar zoom"
              data-testid="btn-zoom-in"
              className="p-1.5 h-7 w-7"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleZoomReset}
              title="Restaurar zoom e giro originais"
              data-testid="btn-zoom-reset"
              className="p-1.5 h-7 w-7 text-xs"
            >
              100%
            </Button>
          </div>
        )}

        {blobUrl && (
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-action-primary hover:underline"
            title="Abrir arquivo em nova aba"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nova aba</span>
          </a>
        )}
      </div>

      {/* Área de Visualização */}
      <div className="relative flex-1 min-h-[380px] max-h-[580px] overflow-auto bg-graphite-100 dark:bg-black/40 p-3 sm:p-4 flex items-center justify-center">
        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 text-graphite-500 py-12">
            <Loader2 className="h-7 w-7 animate-spin text-action-primary" />
            <p className="text-xs">Carregando visualização do documento...</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg border border-error-border bg-error-bg p-4 text-center text-xs text-error-text max-w-sm">
            <p className="font-semibold">Falha ao exibir documento</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {!blobUrl && !loading && !error && (
          <div className="flex flex-col items-center justify-center gap-2 text-graphite-400 py-12">
            <Maximize2 className="h-8 w-8 stroke-[1.5]" />
            <p className="text-xs">Nenhum documento disponível para conferência.</p>
          </div>
        )}

        {blobUrl && !loading && isPdf && (
          <iframe
            src={`${blobUrl}#toolbar=1&navpanes=0`}
            title={fileName || 'Documento PDF'}
            className="h-full min-h-[460px] w-full rounded border border-graphite-200 bg-white shadow-sm dark:border-graphite-800"
          />
        )}

        {blobUrl && !loading && isImage && (
          <div
            className="flex min-h-full min-w-full items-center justify-center transition-transform duration-150 ease-out"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={blobUrl}
              alt={fileName || 'Documento anexado para conferência'}
              draggable={false}
              className="max-h-[500px] max-w-full object-contain rounded shadow select-none"
              onDoubleClick={() => setZoom((z) => (z === 1 ? 1.75 : 1))}
            />
          </div>
        )}
      </div>

      {/* Rodapé informativo */}
      {isImage && blobUrl && (
        <div className="border-t border-graphite-200 dark:border-graphite-800 px-3 py-1.5 bg-white/50 dark:bg-graphite-950/50 text-[11px] text-graphite-500 flex items-center justify-between">
          <span>Dica: Duplo clique na imagem alterna zoom rápido.</span>
          <span>Foto torta? Use os botões de giro acima.</span>
        </div>
      )}
    </div>
  );
};
