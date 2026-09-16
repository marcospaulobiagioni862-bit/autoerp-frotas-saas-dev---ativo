import { useEffect, useState } from 'react';

export type UserRole =
  | 'Administrador'
  | 'Financeiro'
  | 'Operador'
  | 'Consulta'
  | 'Somente leitura';

export default function useUserRole() {
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const local = localStorage.getItem('auto_erp_user_role');
    return (local ? local : 'Administrador') as any;
  });

  useEffect(() => {
    localStorage.setItem('auto_erp_user_role', userRole);
  }, [userRole]);

  return {
    userRole,
    setUserRole,
  };
}
