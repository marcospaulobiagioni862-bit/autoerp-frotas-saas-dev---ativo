import { db } from './index';
import { companies, users } from './schema';
import { FinanceMasterDataAuthority } from '../server/financeMasterDataAuthority';

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

  // 3. Essential Categories via Canonical Authority (PH-122)
  await FinanceMasterDataAuthority.seedDefaultCategories({
    companyId,
    userId: 'user-admin-001',
    name: 'System Admin',
    role: 'ADMIN',
    permissions: ['*'],
  });

  console.log('Production Seed Complete.');
}
