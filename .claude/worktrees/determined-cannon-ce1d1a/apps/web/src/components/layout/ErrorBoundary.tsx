import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches unhandled React render errors to prevent blank screens.
 *
 * ARCH-DECISION: Class component is required — React does not yet support
 * error boundaries as function components (no hook equivalent for
 * componentDidCatch). This is the single class component in the codebase.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <FeaturePage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In production, errors would be sent to a monitoring service (Sentry etc.)
    // For now, log to console — available in Docker container logs.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-lg text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-7 w-7 text-red-600" />
              </div>
            </div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">
              Une erreur inattendue s'est produite
            </h1>
            <p className="mb-6 text-sm text-gray-500">
              L'application a rencontré un problème. Vous pouvez recharger la page ou contacter le support si l'erreur persiste.
            </p>
            {this.state.error && (
              <pre className="mb-6 rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-400 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Réessayer
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Recharger la page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
