export function useAuth() {
  return {
    user: {
      id: 'user-admin-1',
      userId: 'user-admin-1',
      name: 'Admin User',
      role: 'ADMIN',
      active: true,
      companyId: 'company-main-uuid',
      permissions: ['*']
    }
  };
}
