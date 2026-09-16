import { UserRole } from '../enums';

export interface Company {
  id: string; // UUID
  name: string;
  tradingName?: string;
  cnpj: string;
  email: string;
  phone: string;
  address?: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  logoUrl?: string;
  createdAt: string; // ISO Date
  updatedAt: string; // ISO Date
}

export interface User {
  id: string; // UUID
  companyId: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}
