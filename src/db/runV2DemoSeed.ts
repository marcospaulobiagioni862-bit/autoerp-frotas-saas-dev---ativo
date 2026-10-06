import { runV2DemoSeed } from './v2DemoSeed';

runV2DemoSeed().catch((error) => {
  console.error('[v2-demo-seed] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
