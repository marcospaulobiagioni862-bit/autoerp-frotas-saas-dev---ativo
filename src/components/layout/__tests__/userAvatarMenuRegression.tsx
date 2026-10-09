import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Header } from '../Header';
import { AuthContext, type AuthUser } from '../../../hooks/useAuth';

const { act } = TestRenderer;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock window and document listeners for interactive dropdown behaviors
const documentListeners: Record<string, ((e: any) => void)[]> = {};

(globalThis as any).window = {
  addEventListener() {},
  removeEventListener() {},
  confirm: () => true,
  location: { reload() {} },
};

if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    body: { style: {} },
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    addEventListener(event: string, cb: (e: any) => void) {
      if (!documentListeners[event]) documentListeners[event] = [];
      documentListeners[event].push(cb);
    },
    removeEventListener(event: string, cb: (e: any) => void) {
      if (documentListeners[event]) {
        documentListeners[event] = documentListeners[event].filter((fn) => fn !== cb);
      }
    },
  };
} else if (!(globalThis as any).document.documentElement) {
  (globalThis as any).document.documentElement = { classList: { contains: () => false, add() {}, remove() {} } };
}

const text = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node.children) return text(node.children);
  return '';
};

async function testAdminUserScenario(): Promise<void> {
  const user: AuthUser = {
    id: 'user-admin-1',
    userId: 'user-admin-1',
    name: 'Carlos Gestor',
    role: 'ADMIN',
    active: true,
    companyId: 'locadora-xyz',
    permissions: ['*'],
  };

  let loggedOut = false;
  let navigatedTab: string | null = null;

  const mockLogout = async () => {
    loggedOut = true;
  };

  let tree: TestRenderer.ReactTestRenderer;

  await act(async () => {
    tree = TestRenderer.create(
      <AuthContext.Provider
        value={{
          user,
          authMode: 'server-session',
          logout: mockLogout,
        }}
      >
        <Header
          testStatus={null}
          onOpenTestRunner={() => {}}
          onNavigateTab={(tab) => {
            navigatedTab = tab;
          }}
        />
      </AuthContext.Provider>
    );
  });

  const root = tree!.root;

  // 1. Verificar renderização do avatar e dados iniciais
  const avatarButton = root.findByProps({ 'aria-haspopup': 'menu' });
  assert(avatarButton, 'Avatar menu button must be rendered for ADMIN');
  assert.equal(avatarButton.props['aria-expanded'], false, 'Menu must be closed initially');
  assert(avatarButton.props['aria-label'].includes('Carlos Gestor'), 'Aria label must include user name');

  const buttonVisibleText = text(avatarButton.children);
  assert(buttonVisibleText.includes('CG'), 'Avatar must show initials CG for Carlos Gestor');

  // 2. Abrir o menu ao clicar
  await act(async () => {
    avatarButton.props.onClick();
  });
  assert.equal(avatarButton.props['aria-expanded'], true, 'Menu must be open after click');

  // 3. Verificar dropdown container e itens disponíveis para ADMIN
  const menuContainer = root.findByProps({ role: 'menu' });
  assert(menuContainer, 'Menu dropdown container must be rendered');

  const menuVisibleText = text(menuContainer.children);
  assert(menuVisibleText.includes('Carlos Gestor'), 'Menu must show user name');
  assert(menuVisibleText.includes('Administrador'), 'Menu must show formatted role label');
  assert(menuVisibleText.includes('locadora-xyz'), 'Menu must show companyId');
  assert(menuVisibleText.includes('Área Administrativa'), 'ADMIN user must see Área Administrativa in dropdown');
  assert(menuVisibleText.includes('Sair da conta'), 'ADMIN user must see Sair da conta option');

  // 4. Clicar em "Área Administrativa"
  const adminButton = root.findAllByProps({ role: 'menuitem' }).find((item) =>
    text(item.children).includes('Área Administrativa')
  );
  assert(adminButton, 'Admin button must be found in menu for ADMIN user');

  await act(async () => {
    adminButton.props.onClick();
  });

  assert.equal(navigatedTab, 'administration', 'Clicking Área Administrativa must navigate to administration tab');
  assert.equal(avatarButton.props['aria-expanded'], false, 'Menu must close after selecting option');

  // 5. Reabrir e clicar em "Sair da conta" (Logout)
  await act(async () => {
    avatarButton.props.onClick();
  });
  assert.equal(avatarButton.props['aria-expanded'], true, 'Menu must reopen');

  const logoutButton = root.findAllByProps({ role: 'menuitem' }).find((item) =>
    text(item.children).includes('Sair da conta')
  );
  assert(logoutButton, 'Logout button must be found in menu');

  await act(async () => {
    await logoutButton.props.onClick();
  });

  assert.equal(loggedOut, true, 'Clicking Sair da conta must trigger logout');

  await act(async () => {
    tree.unmount();
  });

  console.log('✓ Scenario 1: ADMIN user avatar navigation, administration option & logout passed');
}

async function testNonAdminUserScenario(): Promise<void> {
  // Ator OPERATIONAL com lista restrita de permissões (zero curinga '*')
  const user: AuthUser = {
    id: 'user-operational-1',
    userId: 'user-operational-1',
    name: 'Marcos Operacional',
    role: 'OPERATIONAL',
    active: true,
    companyId: 'locadora-xyz',
    permissions: ['VIEW_VEHICLE', 'VIEW_DRIVER', 'VIEW_CONTRACT', 'CHANGE_VEHICLE_STATUS', 'OPERATIONS_WRITE'],
  };

  let loggedOut = false;
  let navigatedTab: string | null = null;

  const mockLogout = async () => {
    loggedOut = true;
  };

  let tree: TestRenderer.ReactTestRenderer;

  await act(async () => {
    tree = TestRenderer.create(
      <AuthContext.Provider
        value={{
          user,
          authMode: 'server-session',
          logout: mockLogout,
        }}
      >
        <Header
          testStatus={null}
          onOpenTestRunner={() => {}}
          onNavigateTab={(tab) => {
            navigatedTab = tab;
          }}
        />
      </AuthContext.Provider>
    );
  });

  const root = tree!.root;

  // 1. Verificar renderização do avatar para não-ADMIN
  const avatarButton = root.findByProps({ 'aria-haspopup': 'menu' });
  assert(avatarButton, 'Avatar menu button must be rendered for OPERATIONAL');
  assert.equal(avatarButton.props['aria-expanded'], false, 'Menu must be closed initially');
  assert(avatarButton.props['aria-label'].includes('Marcos Operacional'), 'Aria label must include user name');

  const buttonVisibleText = text(avatarButton.children);
  assert(buttonVisibleText.includes('MO'), 'Avatar must show initials MO for Marcos Operacional');

  // 2. Abrir o menu ao clicar
  await act(async () => {
    avatarButton.props.onClick();
  });
  assert.equal(avatarButton.props['aria-expanded'], true, 'Menu must be open after click');

  const menuContainer = root.findByProps({ role: 'menu' });
  assert(menuContainer, 'Menu dropdown container must be rendered');

  const menuVisibleText = text(menuContainer.children);
  assert(menuVisibleText.includes('Marcos Operacional'), 'Menu must show user name');
  assert(menuVisibleText.includes('Operacional'), 'Menu must show role label Operacional');
  assert(menuVisibleText.includes('locadora-xyz'), 'Menu must show companyId');

  // INVARIANTE CRÍTICA DO AUTOERP-46:
  // "Área Administrativa" NÃO PODE EXISTIR NO DOM PARA NÃO-ADMIN
  assert(
    !menuVisibleText.includes('Área Administrativa'),
    'INVARIANT VIOLATION: Non-ADMIN user must NOT see Área Administrativa in dropdown text'
  );

  const menuItems = root.findAllByProps({ role: 'menuitem' });
  const adminOptionInMenuItems = menuItems.some((item) =>
    text(item.children).includes('Área Administrativa') || item.props['aria-label'] === 'Area Administrativa'
  );
  assert.equal(
    adminOptionInMenuItems,
    false,
    'INVARIANT VIOLATION: Non-ADMIN user must NOT have any menuitem with Área Administrativa in DOM'
  );

  // 3. Opção "Sair da conta" DEVE estar presente e acessível
  assert(menuVisibleText.includes('Sair da conta'), 'Non-ADMIN user must still see Sair da conta');
  const logoutButton = menuItems.find((item) => text(item.children).includes('Sair da conta'));
  assert(logoutButton, 'Logout button must exist for non-ADMIN user');

  await act(async () => {
    await logoutButton.props.onClick();
  });

  assert.equal(loggedOut, true, 'Clicking Sair da conta must trigger logout for non-ADMIN user');
  assert.equal(navigatedTab, null, 'No administration navigation should ever have been called');

  await act(async () => {
    tree.unmount();
  });

  console.log('✓ Scenario 2: Non-ADMIN (OPERATIONAL) strictly hides Área Administrativa and preserves logout');
}

async function testFinancialUserScenario(): Promise<void> {
  // Ator FINANCIAL também não-ADMIN (zero curinga '*')
  const user: AuthUser = {
    id: 'user-financial-1',
    userId: 'user-financial-1',
    name: 'Fabiana Financeiro',
    role: 'FINANCIAL',
    active: true,
    companyId: 'locadora-xyz',
    permissions: ['VIEW_FINANCE', 'RECEIVABLE_MUTATE', 'PAYABLE_MUTATE'],
  };

  let tree: TestRenderer.ReactTestRenderer;

  await act(async () => {
    tree = TestRenderer.create(
      <AuthContext.Provider
        value={{
          user,
          authMode: 'server-session',
          logout: async () => {},
        }}
      >
        <Header testStatus={null} onOpenTestRunner={() => {}} onNavigateTab={() => {}} />
      </AuthContext.Provider>
    );
  });

  const root = tree!.root;
  const avatarButton = root.findByProps({ 'aria-haspopup': 'menu' });

  await act(async () => {
    avatarButton.props.onClick();
  });

  const menuContainer = root.findByProps({ role: 'menu' });
  const menuVisibleText = text(menuContainer.children);

  assert(
    !menuVisibleText.includes('Área Administrativa'),
    'INVARIANT VIOLATION: FINANCIAL user must NOT see Área Administrativa in dropdown'
  );

  const menuItems = root.findAllByProps({ role: 'menuitem' });
  const hasAdmin = menuItems.some((item) => text(item.children).includes('Área Administrativa'));
  assert.equal(hasAdmin, false, 'FINANCIAL user must NOT have administration menuitem');

  await act(async () => {
    tree.unmount();
  });

  console.log('✓ Scenario 3: Non-ADMIN (FINANCIAL) strictly hides Área Administrativa');
}

async function runUserAvatarMenuRegression(): Promise<void> {
  console.log('=== AUTOERP-46: REGRESSÃO DE COMPONENTE DO MENU DE AVATAR E LOGOUT ===');
  await testAdminUserScenario();
  await testNonAdminUserScenario();
  await testFinancialUserScenario();
  console.log('AUTOERP-46 User avatar menu and logout regression: ALL PASS');
}

runUserAvatarMenuRegression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('REGRESSION FAILED:', err);
    process.exit(1);
  });
