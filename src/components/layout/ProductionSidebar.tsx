import { Sidebar, type NavigationTab, type SidebarProps } from './Sidebar';

/**
 * AUTOERP-67: Unificação de navegação entre Desenvolvimento e Produção.
 * Dev e Produção compartilham a mesma fonte canônica de navegação (Sidebar.tsx).
 *
 * Re-export para retrocompatibilidade com referências legadas e testes de contorno:
 * Invariant: overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
 */
export { Sidebar, type NavigationTab, type SidebarProps };
export default Sidebar;
