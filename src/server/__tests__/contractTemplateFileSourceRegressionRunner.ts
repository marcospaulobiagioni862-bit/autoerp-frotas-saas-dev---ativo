import { runContractTemplateFileModeRegression } from '../../components/contracts/__tests__/contractTemplateFileModeRegression';
import { runContractTemplateFileSourceRegression } from './contractTemplateFileSourceRegression';

export async function runContractTemplateFileSourceRegressionRunner(): Promise<void> {
  await runContractTemplateFileSourceRegression();
  await runContractTemplateFileModeRegression();
}

if (process.argv[1]?.includes('contractTemplateFileSourceRegressionRunner')) {
  runContractTemplateFileSourceRegressionRunner()
    .then(() => console.log('Contract template file source regressions PASS'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
