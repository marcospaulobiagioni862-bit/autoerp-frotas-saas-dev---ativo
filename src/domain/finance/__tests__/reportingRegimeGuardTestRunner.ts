import { DREService } from '../DREService';
import { ProfitabilityService } from '../ProfitabilityService';
import type { ITransactionContext } from '../ITransactionContext';
import { AccountingRegime } from '../../../types/enums';

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected=${String(expected)} actual=${String(actual)}`);
  }
}

async function expectUnsupportedRegime(
  label: string,
  action: () => Promise<unknown>
): Promise<void> {
  try {
    await action();
    throw new Error(`${label}: expected rejection`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assertEqual(message, 'Unsupported accounting regime', `${label}: wrong rejection`);
  }
}

async function run(): Promise<void> {
  let repositoryAccesses = 0;

  const failIfAccessed = () => {
    repositoryAccesses += 1;
    throw new Error('Repository must not be accessed for unsupported regime');
  };

  const context = {
    getReceivableRepo: failIfAccessed,
    getPayableRepo: failIfAccessed,
    getTransactionRepo: failIfAccessed,
    getVehicleRepo: failIfAccessed,
  } as unknown as ITransactionContext;

  await expectUnsupportedRegime('DRE PREDICTED', async () =>
    await DREService.getDREReport(
      'company-a',
      '2026-08-01',
      '2026-08-31',
      AccountingRegime.PREDICTED,
      context
    )
  );

  await expectUnsupportedRegime('Profitability PREDICTED', async () =>
    await ProfitabilityService.getVehicleProfitability(
      'company-a',
      'vehicle-a',
      '2026-08-01',
      '2026-08-31',
      AccountingRegime.PREDICTED,
      context
    )
  );

  assertEqual(repositoryAccesses, 0, 'Unsupported regimes must fail before repository access');

  console.log('FINANCE-R8 reporting regime guards: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
