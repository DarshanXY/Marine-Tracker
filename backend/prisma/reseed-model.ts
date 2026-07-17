/**
 * Fix the active ModelVersion row in a live database.
 *
 * The DB was seeded once with a fabricated demo row (MarineNet ResNet-50,
 * f1 0.872, v0.1.0-demo) long before the real per-pixel MLP was trained on
 * MARIDA + MADOS. `prisma db seed` was never re-run, so the Analytics "Active
 * model" card kept showing that fake. This script deactivates every row,
 * upserts the REAL combined-benchmark model as the single active version, and
 * deletes the fabricated ResNet-50 demo row so it can't resurface.
 *
 * Run:  npx tsx prisma/reseed-model.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REAL_MODEL = {
  name: 'MarineNet (per-pixel MLP)',
  architecture: 'per-pixel MLP 7→32→16→4 (ReLU)',
  trainedOn: ['MARIDA', 'MADOS'],
  storagePath: 'models/marinenet.onnx',
  f1Score: 0.5, // macro-F1 on the held-out combined MARIDA+MADOS test split
  precision: 0.435, // macro precision
  recall: 0.87, // macro recall
  confusionMatrix: {
    classes: ['Plastic', 'Algae', 'Sea_Foam', 'Water'],
    matrix: [[1201, 79, 69, 5], [577, 6318, 225, 208], [53, 35, 647, 39], [1539, 10773, 39098, 439041]],
  },
  isActive: true,
};

async function main(): Promise<void> {
  await prisma.modelVersion.updateMany({ data: { isActive: false } });

  const row = await prisma.modelVersion.upsert({
    where: { version: '1.0-marida+mados' },
    update: REAL_MODEL,          // real update block (not a no-op) so re-runs self-correct
    create: { version: '1.0-marida+mados', ...REAL_MODEL },
  });

  // Purge the fabricated ResNet-50 demo rows entirely (honest registry).
  const purged = await prisma.modelVersion.deleteMany({
    where: { OR: [{ version: '0.1.0-demo' }, { name: 'MarineNet ResNet-50' }] },
  });

  const active = await prisma.modelVersion.findMany({ where: { isActive: true } });
  console.log(`active model -> ${row.name} ${row.version} f1=${row.f1Score}`);
  console.log(`purged fabricated rows: ${purged.count}`);
  console.log(`active rows now: ${active.length} (should be 1)`);
}

main()
  .catch((err) => {
    console.error('reseed-model failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
