import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';

// ARCH-DECISION: ErrorBoundary must be a class component — React does not
// support error boundaries as function components (no hook equivalent for
// componentDidCatch). We extract the rendered fallback into a functional
// sub-component so useTranslation can be used without a class-level hook.

interface FallbackProps {
  error:    Error;
  onReset:  () => void;
  onReload: () => void;
}

function ErrorFallback({ error, onReset, onReload }: FallbackProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-page px-4">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-lg text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-7 w-7 text-red-600" />
          </div>
        </div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {t('common.errorBoundary.title')}
        </h1>
        <p className="mb-6 text-sm text-gray-500">
          {t('common.errorBoundary.description')}
        </p>
        <pre className="mb-6 rounded-lg bg-gray-50 px-3 py-2 text-left text-xs text-gray-400 overflow-auto max-h-32">
          {error.message}
        </pre>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={onReset}>
            <RefreshCw className="h-4 w-4" />
            {t('common.errorBoundary.retry')}
          </Button>
          <Button
            variant="ghost"
            className="border border-gray-200 text-gray-700 hover:bg-gray-50"
            onClick={onReload}
          >
            {t('common.errorBoundary.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  // null = no error; non-null = error caught. hasError is derived via `error !== null`.
  error: Error | null;
}

/**
 * ErrorBoundary — catches unhandled React render errors to prevent blank screens.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <FeaturePage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <ErrorFallback
        error={error}
        onReset={this.handleReset}
        onReload={this.handleReload}
      />
    );
  }
}
