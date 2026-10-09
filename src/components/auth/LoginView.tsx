import React, { FormEvent, useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { AvailableCompanyOption, LoginCredentials, LoginResult } from '../../hooks/useAuth';

interface LoginViewProps {
  onLogin: (credentials: LoginCredentials) => Promise<LoginResult | void>;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado para fluxo multi-empresa pós-autenticação de credencial
  const [availableCompanies, setAvailableCompanies] = useState<AvailableCompanyOption[] | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await onLogin({ email, password });
      if (result && 'requiresCompanySelection' in result && result.requiresCompanySelection) {
        setAvailableCompanies(result.availableCompanies);
      }
    } catch {
      setError('Não foi possível entrar. Verifique seu e-mail e senha.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectCompany = async (company: AvailableCompanyOption) => {
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      await onLogin({ email, password, companyId: company.id });
    } catch {
      setError('Não foi possível conectar à empresa selecionada. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setAvailableCompanies(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden select-none">
      {/* Luzes ambiente de fundo */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[300px] bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />

      <section
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-8 sm:p-10 shadow-2xl shadow-black/70 relative z-10 transition-all duration-200"
        aria-labelledby="login-title"
      >
        {/* Logo / Header */}
        <div className="mb-7">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-semibold tracking-wider uppercase mb-3.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>AutoERP V2</span>
          </div>

          {!availableCompanies ? (
            <>
              <h1 id="login-title" className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Acesse sua conta
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Entre com seu e-mail e senha para acessar a plataforma.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  disabled={isSubmitting}
                  className="p-1 -ml-1 text-slate-400 hover:text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                  aria-label="Voltar para login"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 id="login-title" className="text-2xl font-extrabold text-white tracking-tight">
                  Selecione a empresa
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Seu usuário possui acesso a mais de uma locadora. Escolha qual deseja acessar:
              </p>
            </>
          )}
        </div>

        {/* Mensagem de Erro Global */}
        {error && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Etapa 1: Formulário Principal (Email e Senha) */}
        {!availableCompanies ? (
          <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit} autoComplete="on">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-300 mb-1.5" htmlFor="login-email">
                E-mail corporativo
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="seu.email@empresa.com.br"
                  required
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/70 pl-10 pr-3.5 py-2.5 text-white placeholder-slate-500 outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-950/30 disabled:opacity-50 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-slate-300 mb-1.5" htmlFor="login-password">
                Senha de acesso
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  required
                  disabled={isSubmitting}
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/70 pl-10 pr-10 py-2.5 text-white placeholder-slate-500 outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:bg-slate-950/30 disabled:opacity-50 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                  aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold py-2.5 px-4 shadow-lg shadow-violet-600/25 transition-all duration-150 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 text-sm group"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando...</span>
                </>
              ) : (
                <>
                  <span>Entrar no AutoERP</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Etapa 2: Seleção de Empresa Multi-Tenant */
          <div className="space-y-2.5">
            {availableCompanies.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => handleSelectCompany(company)}
                disabled={isSubmitting}
                className="w-full p-3.5 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/80 hover:border-violet-500/80 text-left transition-all duration-150 flex items-center justify-between group focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 group-hover:bg-violet-500/20 transition-colors shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white block truncate">
                      {company.tradeName || company.name}
                    </span>
                    <span className="text-xs text-slate-400 block truncate">
                      CNPJ: {company.document}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </button>
            ))}

            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={isSubmitting}
              className="w-full mt-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Entrar com outra conta
            </button>
          </div>
        )}

        {/* Rodapé de Confiança e Segurança */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>Conexão criptografada ponta a ponta</span>
        </div>
      </section>
    </main>
  );
}
