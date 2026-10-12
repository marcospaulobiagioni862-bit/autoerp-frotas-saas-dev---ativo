import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
 variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'warning' | string;
 size?: 'sm' | 'md' | 'lg';
 isLoading?: boolean;
 icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
 children,
 variant = 'primary',
 size = 'md',
 isLoading = false,
 icon,
 disabled,
 className = '',
 ...props
}) => {
 // AUTOERP-91 fase 3. Uma cor de acao so: primario e navy, destrutivo e crimson,
 // secundario e contorno. Nada de indigo/blue/rose soltos. O anel de foco usa
 // :focus-visible (nao :focus) para nao aparecer em clique de mouse, e os tokens
 // semanticos ja trocam sozinhos no modo escuro - por isso nao ha par dark: aqui.
 const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed whitespace-nowrap';

 const variantStyles: Record<string, string> = {
 primary: 'bg-action-primary text-on-action-primary hover:bg-action-primary-hover active:bg-action-primary-active disabled:bg-action-disabled disabled:text-fg-disabled',
 // "secondary" e "outline" convergem para a mesma coisa: contorno. Mantidos os
 // dois nomes porque 100+ chamadas usam um ou outro - trocar nome agora seria
 // mudanca de API sem ganho.
 secondary: 'bg-transparent border border-border-strong text-fg-primary hover:bg-action-secondary-hover active:bg-action-secondary-active disabled:border-border disabled:text-fg-disabled',
 outline: 'bg-transparent border border-border-strong text-fg-primary hover:bg-action-secondary-hover active:bg-action-secondary-active disabled:border-border disabled:text-fg-disabled',
 ghost: 'bg-transparent text-fg-secondary hover:bg-action-secondary-hover hover:text-fg-primary active:bg-action-secondary-active disabled:text-fg-disabled',
 danger: 'bg-action-destructive text-on-action-destructive hover:bg-action-destructive-hover active:bg-action-destructive-active disabled:bg-action-disabled disabled:text-fg-disabled',
 // "warning" nao e acao: aviso e estado, nao botao. Cai no contorno de proposito,
 // para o amarelo sumir dos botoes sem quebrar quem ainda passa variant="warning".
 warning: 'bg-transparent border border-border-strong text-fg-primary hover:bg-action-secondary-hover active:bg-action-secondary-active disabled:border-border disabled:text-fg-disabled',
 };

 const styleClass = variantStyles[variant as string] || variantStyles.primary;

 // Alturas do design system: 28px (sm) e 32px (md). No celular todos sobem para
 // 44px, que e o minimo confortavel para o dedo - o ganho de densidade so faz
 // sentido com mouse.
 const sizeStyles = {
 sm: 'text-xs min-h-11 sm:min-h-7 px-3 gap-1.5',
 md: 'text-sm min-h-11 sm:min-h-8 px-3 gap-1.5',
 lg: 'text-sm min-h-11 sm:min-h-10 px-4 gap-2',
 };

 return (
 <button
 disabled={disabled || isLoading}
 className={`${baseStyles} ${styleClass} ${sizeStyles[size]} ${className}`}
 {...props}
 >
 {isLoading ? (
 <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
 </svg>
 ) : icon ? (
 <span className="shrink-0">{icon}</span>
 ) : null}
 {children}
 </button>
 );
};
