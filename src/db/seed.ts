import { db } from './index';
import { companies, users, financialCategories } from './schema';

export async function runProductionSeed() {
  console.log('Running Production Seed...');
  
  // 1. Initial Company
  const companyId = 'prod-company-001';
  await db.insert(companies).values({
    id: companyId,
    name: 'AutoERP Production',
    status: 'ACTIVE',
  }).onConflictDoNothing();

  // 2. Admin User
  await db.insert(users).values({
    id: 'user-admin-001',
    companyId: companyId,
    name: 'System Admin',
    email: 'admin@autoerp.com',
    role: 'ADMIN',
    permissions: ['*'],
    active: true,
  }).onConflictDoNothing();

  // 3. Essential Categories
  await db.insert(financialCategories).values({
    id: 'cat-income-rental',
    companyId: companyId,
    name: 'Locação',
    type: 'INCOME',
    active: true,
  }).onConflictDoNothing();

  await db.insert(financialCategories).values({
    id: 'cat-expense-maintenance',
    companyId: companyId,
    name: 'Manutenção',
    type: 'EXPENSE',
    active: true,
  }).onConflictDoNothing();

  console.log('Production Seed Complete.');
}
