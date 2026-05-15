import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Lock, Mail } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { LoginSchema } from '@haccp/shared-validators';
import type { JwtPayload, TokenPair } from '@haccp/shared-types';

export default function LoginPage() {
  const navigate    = useNavigate();
  const setTokens   = useAuthStore((s) => s.setTokens);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      setError('Veuillez saisir un email et un mot de passe valides.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<TokenPair & { user: JwtPayload }>('/api/v1/auth/login', {
        email,
        password,
      });
      setTokens(data.accessToken, data.refreshToken, data.user);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setError('Trop de tentatives. Veuillez attendre 1 minute avant de réessayer.');
      } else if (status === 401) {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError(`Erreur de connexion (${status ?? 'réseau'}). Vérifiez votre connexion.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface-page">
      {/* Left panel — brand */}
      <div className="hidden w-1/2 flex-col justify-between bg-brand-dark p-12 lg:flex">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-gold" />
          <span className="text-2xl font-bold text-white">NORMES HACCP</span>
        </div>

        <div>
          <h2 className="text-4xl font-bold leading-tight text-white">
            Gestion de la sécurité<br />alimentaire simplifiée.
          </h2>
          <p className="mt-4 text-lg text-blue-200">
            Suivez vos contrôles, gérez vos non-conformités et générez vos rapports HACCP en toute conformité.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {['Contrôles CCP', 'Non-conformités', 'Rapports', 'DLC'].map((tag) => (
            <span key={tag} className="rounded-full border border-brand-medium/60 bg-brand-medium/20 px-3 py-1 text-xs text-blue-100">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <FileText className="h-7 w-7 text-brand-dark" />
          <span className="text-xl font-bold text-brand-dark">NORMES HACCP</span>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-brand-dark">Connexion</h1>
            <p className="mt-1 text-sm text-gray-500">Accédez à votre espace de gestion HACCP</p>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 mt-3" />
              <Input
                id="email"
                type="email"
                label="Adresse e-mail"
                placeholder="admin@entreprise.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 mt-3" />
              <Input
                id="password"
                type="password"
                label="Mot de passe"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Se connecter
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            © {new Date().getFullYear()} NORMES HACCP — Plateforme de conformité alimentaire
          </p>
        </div>
      </div>
    </div>
  );
}
