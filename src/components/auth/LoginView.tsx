import React, { FormEvent, useState } from 'react';
import { LoginCredentials } from '../../hooks/useAuth';

interface LoginViewProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
}

export function LoginView({ onLogin }: LoginViewProps) {
  const [companyDocument, setCompanyDocument] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onLogin({ companyDocument, email, password });
    } catch {
      setError('Não foi possível entrar. Verifique os dados informados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" aria-labelledby="login-title">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">AutoERP</p>
          <h1 id="login-title" className="mt-2 text-2xl font-bold text-slate-900">Acesso ao sistema</h1>
          <p className="mt-2 text-sm text-slate-600">Entre com os dados da sua empresa e do seu usuário.</p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit} autoComplete="on">
          <label className="block" htmlFor="company-document">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Empresa ou CNPJ</span>
            <input
              id="company-document"
              name="companyDocument"
              type="text"
              value={companyDocument}
              onChange={(event) => setCompanyDocument(event.target.value)}
              autoComplete="off"
              inputMode="text"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Ex.: Minha Locadora ou 00.000.000/0001-00"
              required
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
            />
            <span className="mt-1.5 block text-xs text-slate-500">Use o nome de acesso da empresa ou o CNPJ cadastrado.</span>
          </label>

          <label className="block" htmlFor="login-email">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</span>
            <input
              id="login-email"
              name="username"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
            />
          </label>

          <label className="block" htmlFor="login-password">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Senha</span>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-100"
            />
          </label>

          {error && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-violet-700 px-4 py-2.5 font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
