import { Component, type ReactNode } from 'react';

export interface LazyModuleResetInput {
  previousResetKey: string;
  nextResetKey: string;
  hasError: boolean;
}

export function shouldResetLazyModuleError(input: LazyModuleResetInput): boolean {
  return input.hasError && input.previousResetKey !== input.nextResetKey;
}

interface LazyModuleErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onRetry: () => void;
}

interface LazyModuleErrorBoundaryState {
  hasError: boolean;
}

export class LazyModuleErrorBoundary extends Component<
  LazyModuleErrorBoundaryProps,
  LazyModuleErrorBoundaryState
> {
  state: LazyModuleErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyModuleErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: Readonly<LazyModuleErrorBoundaryProps>): void {
    if (
      shouldResetLazyModuleError({
        previousResetKey: previousProps.resetKey,
        nextResetKey: this.props.resetKey,
        hasError: this.state.hasError,
      })
    ) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div role="alert" className="m-6 rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
        <h2 className="text-base font-semibold">Não foi possível carregar este módulo.</h2>
        <p className="mt-1 text-sm">
          Você pode abrir outro módulo pelo menu ou recarregar a aplicação para tentar novamente.
        </p>
        <button
          type="button"
          onClick={this.props.onRetry}
          className="mt-4 rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Recarregar aplicação
        </button>
      </div>
    );
  }
}
