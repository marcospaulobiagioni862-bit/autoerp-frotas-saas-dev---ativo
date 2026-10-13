import React, { useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Check,
  CheckCircle2,
  Copy,
  DollarSign,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react';
import { AdminUserClient, type AdminUserDto } from '../../api/adminUserClient';
import { Badge, Button, Input, ModalContainer } from '../ui';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

export interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUserDto;
  onSuccess: (updated: AdminUserDto, credentials?: { email: string; password?: string }) => void;
}

interface RoleOption {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    key: 'OPERATIONAL',
    label: 'Operacional',
    description: 'Chão de fábrica: KM, vistorias, ordens de serviço e cadastro de frota.',
    icon: Wrench,
  },
  {
    key: 'FINANCIAL',
    label: 'Financeiro',
    description: 'Gestão de contas a pagar, receber, lançamentos financeiros e multas.',
    icon: DollarSign,
  },
  {
    key: 'MANAGER',
    label: 'Gestor Operacional',
    description: 'Controle de frotas, motoristas, contratos, vistorias e relatórios.',
    icon: Briefcase,
  },
  {
    key: 'ADMIN',
    label: 'Administrador',
    description: 'Acesso irrestrito a todas as áreas da empresa e gestão de usuários.',
    icon: ShieldCheck,
  },
  {
    key: 'READONLY',
    label: 'Somente Leitura',
    description: 'Consulta de dados, relatórios e painéis sem permissão de alteração.',
    icon: Eye,
  },
];

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const specials = '!@#$%&*';
  const all = upper + lower + digits + specials;

  const getRandomChar = (chars: string) => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return chars[arr[0] % chars.length];
  };

  const pwdChars = [
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(digits),
    getRandomChar(specials),
  ];

  for (let i = 4; i < 14; i++) {
    pwdChars.push(getRandomChar(all));
  }

  for (let i = pwdChars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [pwdChars[i], pwdChars[j]] = [pwdChars[j], pwdChars[i]];
  }

  return pwdChars.join('');
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
}) => {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [role, setRole] = useState(user.role);
  const [resetPassword, setResetPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [updatedUser, setUpdatedUser] = useState<AdminUserDto | null>(null);

  const handleGeneratePassword = () => {
    const newPwd = generateSecurePassword();
    setPassword(newPwd);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanPassword = password.trim();

    if (!cleanName) {
      setError('Por favor, informe o nome completo do colaborador.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Por favor, informe um endereço de e-mail corporativo válido.');
      return;
    }

    if (resetPassword && cleanPassword && cleanPassword.length < 12) {
      setError('A nova senha deve conter no mínimo 12 caracteres para segurança.');
      return;
    }

    setLoading(true);
    try {
      const updated = await AdminUserClient.updateUser(user.id, {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone || undefined,
        role,
        password: resetPassword && cleanPassword ? cleanPassword : undefined,
      });

      setUpdatedUser(updated);

      if (resetPassword && cleanPassword) {
        setStep('success');
      } else {
        onSuccess(updated);
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar dados do colaborador.');
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = async () => {
    if (!updatedUser) return;
    const lines = [
      `*Acesso atualizado ao AutoERP*`,
      `Nome: ${updatedUser.name}`,
      `E-mail: ${updatedUser.email}`,
      `Função: ${ROLE_OPTIONS.find((r) => r.key === updatedUser.role)?.label || updatedUser.role}`,
    ];
    if (password.trim()) {
      lines.push(`Nova senha provisória: ${password.trim()}`);
      lines.push(`(Recomendamos alterar a senha no primeiro acesso)`);
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  };

  const handleFinish = () => {
    if (updatedUser) {
      onSuccess(updatedUser, {
        email: updatedUser.email,
        password: password.trim() || undefined,
      });
    }
    onClose();
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={step === 'success' ? handleFinish : onClose}
      title={step === 'form' ? `Editar ${user.name}` : 'Acesso Atualizado'}
      subtitle={
        step === 'form'
          ? 'Atualize os dados cadastrais, cargo na empresa ou redefina o acesso com segurança.'
          : 'Os dados foram salvos com sucesso. Compartilhe as novas credenciais com o colaborador.'
      }
      maxWidth="xl"
    >
      {step === 'form' ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-error-border bg-error-bg p-4 text-sm text-error-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Dados Principais */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Nome Completo <span className="text-error-text">*</span>
              </label>
              <div className="relative">
                <Input
                  type="text"
                  required
                  placeholder="Ex: Ana Paula da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  disabled={loading}
                />
                <User className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                E-mail Corporativo (Login) <span className="text-error-text">*</span>
              </label>
              <div className="relative">
                <Input
                  type="email"
                  required
                  placeholder="exemplo@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9"
                  disabled={loading}
                />
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
              </div>
            </div>
          </div>

          {/* Telefone / Contato */}
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
                disabled={loading}
              />
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
            </div>
          </div>

          {/* Seleção de Papel / Função */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Função de Acesso na Empresa <span className="text-error-text">*</span>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ROLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = role === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setRole(opt.key)}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      isSelected
                        ? 'border-action-primary bg-action-primary/5 ring-2 ring-action-primary/20 dark:bg-action-primary/10'
                        : 'border-graphite-200 bg-white hover:border-graphite-300 hover:bg-graphite-50/50 dark:border-graphite-800 dark:bg-graphite-900 dark:hover:bg-graphite-800/60'
                    }`}
                  >
                    <div
                      className={`rounded-lg p-2 ${
                        isSelected
                          ? 'bg-action-primary text-on-action-primary'
                          : 'bg-graphite-100 text-graphite-600 dark:bg-graphite-800 dark:text-graphite-300'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold text-graphite-900 dark:text-graphite-100">
                          {opt.label}
                        </span>
                        {isSelected && (
                          <span className="rounded-full bg-action-primary/10 p-0.5 text-action-primary">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-graphite-500 dark:text-graphite-400">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção Redefinição de Senha */}
          <div className="rounded-2xl border border-graphite-200 bg-graphite-50/60 p-4 dark:border-graphite-800 dark:bg-graphite-900/60">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-graphite-800 dark:text-graphite-200">
                  Redefinição de Senha
                </label>
                <p className="text-xs text-graphite-500">
                  Gere uma nova senha caso o colaborador tenha esquecido o acesso.
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={resetPassword}
                  onChange={(e) => {
                    setResetPassword(e.target.checked);
                    if (e.target.checked && !password) {
                      handleGeneratePassword();
                    }
                  }}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-graphite-300 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-graphite-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-action-primary peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-graphite-700"></div>
              </label>
            </div>

            {resetPassword && (
              <div className="mt-4 space-y-2 border-t border-graphite-200 pt-3 dark:border-graphite-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-graphite-500">Nova Senha Provisória (mínimo 12 caracteres):</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGeneratePassword}
                    className="gap-1.5 text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Gerar Nova Senha
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10 font-mono text-sm"
                  />
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
                  {password && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-graphite-400 hover:text-graphite-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 border-t border-graphite-200 pt-4 dark:border-graphite-800">
            <Button
              type="button"
              variant="outline"
              onClick={(event) => requestGuardedClose(event, onClose)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || (resetPassword && password.length < 12)}
              className="gap-2"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      ) : (
        /* Tela de Sucesso de Redefinição */
        <div className="space-y-6 py-2">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-success-bg p-3.5 text-success-text ring-8 ring-success-bg/40">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-graphite-900 dark:text-graphite-100">
              Dados e Senha Atualizados!
            </h3>
            <p className="mt-1 max-w-md text-sm text-graphite-600 dark:text-graphite-300">
              As alterações foram salvas. Compartilhe os novos dados de acesso com o colaborador.
            </p>
          </div>

          <div className="rounded-xl border border-graphite-200 bg-graphite-50 p-4 dark:border-graphite-800 dark:bg-graphite-900">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              Novos Dados de Acesso
            </h4>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-graphite-500">Nome:</span>
                <span className="font-semibold text-graphite-900 dark:text-graphite-100">
                  {updatedUser?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-graphite-500">E-mail:</span>
                <span className="font-semibold text-graphite-900 dark:text-graphite-100">
                  {updatedUser?.email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-graphite-500">Função:</span>
                <Badge variant="outline">
                  {ROLE_OPTIONS.find((r) => r.key === updatedUser?.role)?.label || updatedUser?.role}
                </Badge>
              </div>
              {password.trim() && (
                <div className="flex items-center justify-between border-t border-graphite-200 pt-2 dark:border-graphite-800">
                  <span className="text-graphite-500">Nova Senha:</span>
                  <span className="font-mono font-semibold text-graphite-900 dark:text-graphite-100">
                    {password.trim()}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={copyCredentials}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-success-text" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar Novos Dados de Acesso</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              onClick={handleFinish}
              className="gap-2"
            >
              Concluir
            </Button>
          </div>
        </div>
      )}
    </ModalContainer>
  );
};
