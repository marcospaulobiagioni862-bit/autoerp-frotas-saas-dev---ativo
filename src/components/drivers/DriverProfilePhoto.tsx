import React, { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, User } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import type { FileAttachment } from '../../types/entities';
import { Button } from '../ui/Button';

const PROFILE_PHOTO_DOCUMENT_TYPE = 'DRIVER_PROFILE_PHOTO';
const PROFILE_PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

interface DriverProfilePhotoProps {
  driverId: string;
  driverName: string;
}

function newestProfilePhoto(items: FileAttachment[]): FileAttachment | undefined {
  return items
    .filter((item) => !item.isArchived && item.documentType === PROFILE_PHOTO_DOCUMENT_TYPE && PROFILE_PHOTO_MIME_TYPES.includes(item.mimeType))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export const DriverProfilePhoto: React.FC<DriverProfilePhotoProps> = ({ driverId, driverName }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<FileAttachment | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replacePreviewUrl = (next: string | null) => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await AttachmentClient.list({ entityType: 'Driver', entityId: driverId });
      const current = newestProfilePhoto(items);
      setPhoto(current);
      if (!current) {
        replacePreviewUrl(null);
        return;
      }
      const blob = await AttachmentClient.content(current.id);
      replacePreviewUrl(URL.createObjectURL(blob));
    } catch (err: unknown) {
      setPhoto(undefined);
      replacePreviewUrl(null);
      setError(err instanceof Error ? err.message : 'Foto do motorista indisponível.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => replacePreviewUrl(null);
  }, [driverId]);

  const handleUpload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!PROFILE_PHOTO_MIME_TYPES.includes(file.type)) throw new Error('Use uma imagem JPEG, PNG ou WEBP.');
      if (file.size <= 0) throw new Error('A imagem está vazia.');
      if (file.size > 10 * 1024 * 1024) throw new Error('A imagem excede 10 MB.');

      const previous = photo;
      await AttachmentClient.upload({
        entityType: 'Driver',
        entityId: driverId,
        documentType: PROFILE_PHOTO_DOCUMENT_TYPE,
        fileName: file.name,
        mimeType: file.type,
        content: file,
      });
      if (previous) await AttachmentClient.archive(previous.id);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a foto.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!photo || busy) return;
    setBusy(true);
    setError(null);
    try {
      await AttachmentClient.archive(photo.id);
      setPhoto(undefined);
      replacePreviewUrl(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao remover a foto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-14 w-14 overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
        {previewUrl ? (
          <img src={previewUrl} alt={`Foto de ${driverName}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400" aria-label="Motorista sem foto">
            <User className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={loading || busy} onClick={() => inputRef.current?.click()}>
            <Camera className="mr-1 h-4 w-4" />{photo ? 'Substituir foto' : 'Adicionar foto'}
          </Button>
          {photo && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleRemove()}>
              <Trash2 className="mr-1 h-4 w-4 text-rose-600" />Remover
            </Button>
          )}
        </div>
        {error && <span className="max-w-64 text-[11px] text-rose-600 dark:text-rose-400">{error}</span>}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={PROFILE_PHOTO_MIME_TYPES.join(',')}
        onChange={(event) => void handleUpload(event.target.files?.[0])}
      />
    </div>
  );
};
