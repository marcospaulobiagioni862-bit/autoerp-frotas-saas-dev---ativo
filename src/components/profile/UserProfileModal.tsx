import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { UserProfileClient, type UserProfileDto } from '../../api/userProfileClient';
import { useAuth } from '../../hooks/useAuth';
import { Badge, Button, Input, ModalContainer } from '../ui';

export interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (profile: { name?: string; phone?: string | null; avatarUrl?: string | null }) => void;
}

function initials(name: string): string {
  const value = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
  return value || 'AU';
}

function generateSecurePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%&*';
  let pwd = '';
  const array = new Uint8Array(14);
  crypto.getRandomValues(array);
  for (let i = 0; i < 14; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const { user, updateUserProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl || null);

  // Senha
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    UserProfileClient.getProfile()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setName(data.name);
        setPhone(data.phone || '');
        setAvatarUrl(data.avatarUrl || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Falha ao carregar perfil.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('A foto de perfil deve conter no máximo 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setAvatarUrl(dataUrl);
      setError(null);
      try {
        await UserProfileClient.updateAvatar(dataUrl);
        updateUserProfile?.({ avatarUrl: dataUrl });
        onProfileUpdated?.({ avatarUrl: dataUrl });
        setSuccessMessage('Foto de perfil atualizada com sucesso.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar foto de perfil.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = async () => {
    setError(null);
    try {
      await UserProfileClient.deleteAvatar();
      setAvatarUrl(null);
      updateUserProfile?.({ avatarUrl: null });
      onProfileUpdated?.({ avatarUrl: null });
      setSuccessMessage('Foto de perfil removida com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover foto.');
    }
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setError('O nome completo não pode ficar em branco.');
      return;
    }

    setSaving(true);
    try {
      const updated = await UserProfileClient.updateProfile({
        name: cleanName,
        phone: phone.trim() || undefined,
      });

      updateUserProfile?.({
        name: updated.name,
        phone: updated.phone,
      });
      onProfileUpdated?.({
        name: updated.name,
        phone: updated.phone,
      });

      setSuccessMessage('Informações pessoais salvas com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar dados pessoais.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!currentPassword) {
      setError('Por favor, informe sua senha atual.');
      return;
    }

    if (newPassword.length < 12) {
      setError('A nova senha deve conter no mínimo 12 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('A confirmação da nova senha não confere.');
      return;
    }

    setSaving(true);
    try {
      await UserProfileClient.changePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Sua senha foi alterada com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar senha.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Meu Perfil"
      subtitle="Gerencie suas informações pessoais, foto de perfil e senha de acesso."
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Feedback Messages */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-error-border bg-error-bg p-4 text-sm text-error-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="flex items-start gap-3 rounded-xl border border-success-border bg-success-bg p-4 text-sm text-success-text">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Bloco Foto de Perfil & Avatar */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-graphite-200 bg-graphite-50/70 p-5 dark:border-graphite-800 dark:bg-graphite-900/60 sm:flex-row sm:items-center sm:gap-6">
          <div className="relative group shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="h-20 w-20 rounded-full object-cover border-2 border-action-primary shadow-sm"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-raised border-2 border-graphite-300 dark:border-graphite-700 text-graphite-800 dark:text-graphite-100 text-xl font-bold shadow-sm">
                {initials(name)}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 rounded-full bg-action-primary p-2 text-on-action-primary shadow-md hover:bg-action-primary/90 transition-transform active:scale-95"
              title="Alterar foto"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          <div className="text-center sm:text-left flex-1 min-w-0">
            <h4 className="font-bold text-graphite-900 dark:text-graphite-100 text-base truncate">
              {name}
            </h4>
            <p className="text-xs text-graphite-500 mt-0.5 truncate">{user.email || profile?.email || ''}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <Camera className="h-3.5 w-3.5 text-graphite-500" />
                Carregar Foto
              </Button>
              {avatarUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  className="gap-1.5 text-xs text-error-text hover:bg-error-bg"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Abas: Informações vs Segurança */}
        <div className="flex rounded-xl border border-graphite-200 bg-graphite-50 p-1 dark:border-graphite-800 dark:bg-graphite-950/60">
          <button
            type="button"
            onClick={() => {
              setActiveTab('info');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === 'info'
                ? 'bg-action-primary text-on-action-primary shadow-sm'
                : 'text-graphite-600 hover:bg-white dark:text-graphite-300 dark:hover:bg-graphite-800'
            }`}
          >
            <User className="h-4 w-4" /> Dados Pessoais
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('security');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
              activeTab === 'security'
                ? 'bg-action-primary text-on-action-primary shadow-sm'
                : 'text-graphite-600 hover:bg-white dark:text-graphite-300 dark:hover:bg-graphite-800'
            }`}
          >
            <ShieldCheck className="h-4 w-4" /> Alterar Senha
          </button>
        </div>

        {/* Conteúdo da Aba 1: Dados Pessoais */}
        {activeTab === 'info' && (
          <form onSubmit={handleSaveInfo} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Nome Completo <span className="text-error-text">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  disabled={saving || loading}
                />
                <User className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Telefone / WhatsApp de Contato
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="(11) 98765-4321"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-9"
                  disabled={saving || loading}
                />
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
              </div>
            </div>

            {/* Campos Informativos */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-1">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-500">
                  E-mail Corporativo (Login)
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    disabled
                    value={user.email || profile?.email || ''}
                    className="pl-9 bg-graphite-100/60 dark:bg-graphite-800/40 text-graphite-500 cursor-not-allowed"
                  />
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-500">
                  Função Atual
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    disabled
                    value={user.role}
                    className="pl-9 bg-graphite-100/60 dark:bg-graphite-800/40 text-graphite-500 cursor-not-allowed font-semibold"
                  />
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
                </div>
              </div>
            </div>

            <p className="text-[11px] text-graphite-400 dark:text-graphite-500">
              * Para alterar seu e-mail de acesso ou transferir de empresa, contate um administrador.
            </p>

            <div className="flex items-center justify-end gap-3 border-t border-graphite-200 pt-4 dark:border-graphite-800">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Fechar
              </Button>
              <Button type="submit" disabled={saving || loading} className="gap-2">
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        )}

        {/* Conteúdo da Aba 2: Segurança & Senha */}
        {activeTab === 'security' && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Senha Atual <span className="text-error-text">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  placeholder="Digite sua senha atual"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pl-9 pr-10 font-mono text-sm"
                  disabled={saving}
                />
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-2.5 text-graphite-400 hover:text-graphite-600"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                  Nova Senha <span className="text-error-text">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const pwd = generateSecurePassword();
                    setNewPassword(pwd);
                    setConfirmPassword(pwd);
                    setShowNewPassword(true);
                  }}
                  className="text-xs text-action-primary hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3 text-amber-500" /> Gerar Senha Segura
                </button>
              </div>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Mínimo 12 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-9 pr-10 font-mono text-sm"
                  disabled={saving}
                />
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-2.5 text-graphite-400 hover:text-graphite-600"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && newPassword.length < 12 && (
                <p className="mt-1 text-xs text-error-text">
                  A senha deve ter no mínimo 12 caracteres ({newPassword.length}/12).
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Confirmar Nova Senha <span className="text-error-text">*</span>
              </label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Confirme a nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-9 font-mono text-sm"
                  disabled={saving}
                />
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-xs text-error-text">As senhas não coincidem.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-graphite-200 pt-4 dark:border-graphite-800">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword}
                className="gap-2"
              >
                {saving ? 'Alterando...' : 'Alterar Senha'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </ModalContainer>
  );
};
