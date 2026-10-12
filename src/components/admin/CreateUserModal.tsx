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
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from 'lucide-react';
import { AdminUserClient, type AdminUserDto } from '../../api/adminUserClient';
import { Badge, Button, Input, ModalContainer } from '../ui';

export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newUser: AdminUserDto, credentials?: { email: string; password?: string }) => void;
}

interface RoleOption {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor?: string;
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

  // Garante pelo menos um caractere de cada grupo e completa até 14 caracteres
  const pwdChars = [
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(digits),
    getRandomChar(specials),
  ];

  for (let i = 4; i < 14; i++) {
    pwdChars.push(getRandomChar(all));
  }

  // Embaralha de forma criptograficamente segura
  for (let i = pwdChars.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [pwdChars[i], pwdChars[j]] = [pwdChars[j], pwdChars[i]];
  }

  return pwdChars.join('');
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OPERATIONAL');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createdUser, setCreatedUser] = useState<AdminUserDto | null>(null);

  const resetForm = () => {
    setStep('form');
    setName('');
    setEmail('');
    setRole('OPERATIONAL');
    setPassword('');
    setShowPassword(false);
    setError(null);
    setCopied(false);
    setCreatedUser(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

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
    const cleanPassword = password.trim();

    if (!cleanName) {
      setError('Por favor, informe o nome completo do usuário.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Por favor, informe um endereço de e-mail corporativo válido.');
      return;
    }

    if (cleanPassword && cleanPassword.length < 12) {
      setError('A senha provisória deve conter no mínimo 12 caracteres para segurança.');
      return;
    }

    setLoading(true);
    try {
      const newUser = await AdminUserClient.createUser({
        name: cleanName,
        email: cleanEmail,
        role,
        password: cleanPassword || undefined,
      });

      setCreatedUser(newUser);
      setStep('success');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar usuário.');
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdUser) return;
    const lines = [
      `*Acesso ao AutoERP*`,
      `Nome: ${createdUser.name}`,
      `E-mail: ${createdUser.email}`,
      `Função: ${ROLE_OPTIONS.find((r) => r.key === createdUser.role)?.label || createdUser.role}`,
    ];
    if (password.trim()) {
      lines.push(`Senha provisória: ${password.trim()}`);
      lines.push(`(Recomendamos alterar a senha no primeiro acesso)`);
    }
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback silencioso
    }
  };

  const handleFinish = () => {
    if (createdUser) {
      onSuccess(createdUser, {
        email: createdUser.email,
        password: password.trim() || undefined,
      });
    }
    handleClose();
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={step === 'success' ? handleFinish : handleClose}
      title={step === 'form' ? 'Novo Usuário' : 'Usuário Criado com Sucesso'}
      subtitle={
        step === 'form'
          ? 'Cadastre um novo colaborador para acessar a empresa com segurança e permissões adequadas.'
          : 'O acesso foi configurado. Compartilhe os dados com o novo usuário.'
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
                E-mail Corporativo <span className="text-error-text">*</span>
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

          {/* Seleção de Papel / Função */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-graphite-700 dark:text-graphite-300">
                Função de Acesso <span className="text-error-text">*</span>
              </label>
              <span className="text-xs text-graphite-500">
                As permissões podem ser personalizadas depois
              </span>
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

          {/* Credencial Inicial */}
          <div className="rounded-2xl border border-graphite-200 bg-graphite-50/60 p-4 dark:border-graphite-800 dark:bg-graphite-900/60">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-graphite-800 dark:text-graphite-200">
                  Senha Provisória Inicial
                </label>
                <p className="text-xs text-graphite-500">
                  Mínimo de 12 caracteres. Recomendamos gerar uma senha segura.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGeneratePassword}
                className="gap-1.5 self-start text-xs sm:self-auto"
                disabled={loading}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Gerar Senha Segura
              </Button>
            </div>

            <div className="relative mt-3">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Ex: digite ou clique em 'Gerar Senha Segura'"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10 font-mono text-sm"
                disabled={loading}
              />
              <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-graphite-400" />
              {password && (
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-graphite-400 hover:text-graphite-600 dark:hover:text-graphite-200"
                  title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>

            {password && password.length > 0 && password.length < 12 && (
              <p className="mt-1.5 text-xs text-error-text">
                Senha curta ({password.length}/12 caracteres).
              </p>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 border-t border-graphite-200 pt-4 dark:border-graphite-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || (password.length > 0 && password.length < 12)}
              className="gap-2"
            >
              {loading ? 'Cadastrando...' : 'Criar Usuário'}
            </Button>
          </div>
        </form>
      ) : (
        /* Tela de Sucesso / Handoff */
        <div className="space-y-6 py-2">
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-success-bg p-3.5 text-success-text ring-8 ring-success-bg/40">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-graphite-900 dark:text-graphite-100">
              Usuário cadastrado com sucesso!
            </h3>
            <p className="mt-1 max-w-md text-sm text-graphite-600 dark:text-graphite-300">
              O novo colaborador já está vinculado à empresa e pronto para acessar o sistema.
            </p>
          </div>

          <div className="rounded-xl border border-graphite-200 bg-graphite-50 p-4 dark:border-graphite-800 dark:bg-graphite-900">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
              Resumo do Acesso
            </h4>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-graphite-500">Nome:</span>
                <span className="font-semibold text-graphite-900 dark:text-graphite-100">
                  {createdUser?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-graphite-500">E-mail de Login:</span>
                <span className="font-semibold text-graphite-900 dark:text-graphite-100">
                  {createdUser?.email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-graphite-500">Função:</span>
                <Badge variant="outline">
                  {ROLE_OPTIONS.find((r) => r.key === createdUser?.role)?.label || createdUser?.role}
                </Badge>
              </div>
              {password.trim() && (
                <div className="flex items-center justify-between border-t border-graphite-200 pt-2 dark:border-graphite-800">
                  <span className="text-graphite-500">Senha Provisória:</span>
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
                  <span>Dados Copiados!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar Dados de Acesso</span>
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
