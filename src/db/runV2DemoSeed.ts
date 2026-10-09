import { runV2DemoSeed } from './v2DemoSeed';

runV2DemoSeed()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[v2-demo-seed] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
