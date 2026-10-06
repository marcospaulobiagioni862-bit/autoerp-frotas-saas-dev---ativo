import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { Header } from '../Header';
import { AuthContext, type AuthUser } from '../../../hooks/useAuth';

const { act } = TestRenderer;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as any).window = {
  addEventListener() {},
  removeEventListener() {},
  confirm: () => true,
  location: { reload() {} },
};

// Mock DOM environment if missing
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = {
    body: { style: {} },
    documentElement: { classList: { contains: () => false, add() {}, remove() {} } },
    addEventListener() {},
    removeEventListener() {},
  };
} else if (!(globalThis as any).document.documentElement) {
  (globalThis as any).document.documentElement = { classList: { contains: () => false, add() {}, remove() {} } };
}

async function runUserAvatarMenuRegression(): Promise<void> {
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

  const text = (node: any): string => {
    if (!node) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (node.children) return text(node.children);
    return '';
  };

  const root = tree!.root;

  // 1. Verificar renderização do avatar e dados iniciais
  const avatarButton = root.findByProps({ 'aria-haspopup': 'menu' });
  assert(avatarButton, 'Avatar menu button must be rendered');
  assert.equal(avatarButton.props['aria-expanded'], false, 'Menu must be closed initially');
  assert(avatarButton.props['aria-label'].includes('Carlos Gestor'), 'Aria label must include user name');

  // Iniciais "CG" esperadas para "Carlos Gestor"
  const buttonVisibleText = text(avatarButton.children);
  assert(buttonVisibleText.includes('CG'), 'Avatar must show initials CG');

  // 2. Abrir o menu ao clicar
  await act(async () => {
    avatarButton.props.onClick();
  });

  assert.equal(avatarButton.props['aria-expanded'], true, 'Menu must be open after click');

  // Verificar itens no dropdown
  const menuContainer = root.findByProps({ role: 'menu' });
  assert(menuContainer, 'Menu dropdown container must be rendered');

  const menuVisibleText = text(menuContainer.children);
  assert(menuVisibleText.includes('Carlos Gestor'), 'Menu must show user name');
  assert(menuVisibleText.includes('Administrador'), 'Menu must show formatted role label');
  assert(menuVisibleText.includes('locadora-xyz'), 'Menu must show companyId');
  assert(menuVisibleText.includes('Área Administrativa'), 'Menu must show Área Administrativa option');
  assert(menuVisibleText.includes('Sair da conta'), 'Menu must show Sair da conta option');

  // 3. Clicar em "Área Administrativa"
  const adminButton = root.findAllByProps({ role: 'menuitem' }).find((item) =>
    text(item.children).includes('Área Administrativa')
  );
  assert(adminButton, 'Admin button must be found in menu');

  await act(async () => {
    adminButton.props.onClick();
  });

  assert.equal(navigatedTab, 'administration', 'Clicking Área Administrativa must navigate to administration tab');
  assert.equal(avatarButton.props['aria-expanded'], false, 'Menu must close after selecting option');

  // 4. Reabrir e clicar em "Sair da conta" (Logout)
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

  console.log('AUTOERP-46 User avatar menu and logout regression: PASS');
}

runUserAvatarMenuRegression()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('REGRESSION FAILED:', err);
    process.exit(1);
  });
