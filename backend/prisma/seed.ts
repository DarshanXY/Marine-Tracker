/**
 * Database seed — Phase 1
 * Populates: 5 regions, 7 demo users, 1 satellite image,
 *            8 detections, 4 hotspots, 1 trajectory, 3 alerts,
 *            1 model version, 6 pipeline log entries.
 *
 * Run: npx tsx prisma/seed.ts
 * Or:  npm run db:seed
 *
 * Demo password for every user: Demo@1234!
 */

import {
  PrismaClient,
  RoleName,
  DetectionStatus,
  SeverityLevel,
  AlertType,
  PipelineStage,
  PipelineStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;
const DEMO_PASSWORD = 'Demo@1234!';

async function main(): Promise<void> {
  console.log('\n🌊 Seeding Marine Plastic Tracker\n');

  // ── 1. Regions ──────────────────────────────────────────────────────────
  const regionDefs = [
    {
      code: 'MUM',
      name: 'Mumbai Coast',
      displayName: 'Mumbai Coast',
      centerLat: 19.076,
      centerLon: 72.877,
      zoomLevel: 9,
      boundingBox: { north: 20.0, south: 18.5, east: 73.5, west: 72.0 },
    },
    {
      code: 'GOA',
      name: 'Goa Coastline',
      displayName: 'Goa Coastline',
      centerLat: 15.299,
      centerLon: 74.124,
      zoomLevel: 10,
      boundingBox: { north: 15.8, south: 14.8, east: 74.5, west: 73.7 },
    },
    {
      code: 'KCH',
      name: 'Kochi - Arabian Sea',
      displayName: 'Kochi – Arabian Sea',
      centerLat: 9.9312,
      centerLon: 76.2673,
      zoomLevel: 9,
      boundingBox: { north: 10.5, south: 9.3, east: 76.8, west: 75.8 },
    },
    {
      code: 'CHN',
      name: 'Chennai Bay of Bengal',
      displayName: 'Chennai – Bay of Bengal',
      centerLat: 13.0827,
      centerLon: 80.2707,
      zoomLevel: 9,
      boundingBox: { north: 13.8, south: 12.4, east: 81.0, west: 79.5 },
    },
    {
      code: 'AND',
      name: 'Andaman Sea',
      displayName: 'Andaman & Nicobar Sea',
      centerLat: 11.7401,
      centerLon: 92.6586,
      zoomLevel: 8,
      boundingBox: { north: 13.7, south: 6.8, east: 94.2, west: 92.0 },
    },
  ];

  const regions = await Promise.all(
    regionDefs.map(r =>
      prisma.region.upsert({
        where:  { code: r.code },
        update: {},
        create: r,
      })
    )
  );
  const regionByCode = Object.fromEntries(regions.map(r => [r.code, r]));
  console.log(`  ✔ ${regions.length} regions`);

  // ── 2. Demo users ───────────────────────────────────────────────────────
  const userDefs: Array<{
    username: string;
    email: string;
    role: RoleName;
    regionCodes: string[];
  }> = [
    { username: 'admin',        email: 'admin@marine-tracker.local',      role: RoleName.ADMIN,      regionCodes: ['MUM','GOA','KCH','CHN','AND'] },
    { username: 'cg_officer',   email: 'coastguard@marine-tracker.local', role: RoleName.COASTGUARD, regionCodes: ['MUM','GOA','KCH'] },
    { username: 'field_analyst',email: 'field@marine-tracker.local',      role: RoleName.FIELD,      regionCodes: ['CHN','AND'] },
  ];

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  const users = await Promise.all(
    userDefs.map(async ({ username, email, role, regionCodes }) => {
      const user = await prisma.user.upsert({
        where:  { email },
        update: {},
        create: { username, email, passwordHash, role, isActive: true },
      });

      for (const code of regionCodes) {
        if (regionByCode[code]) {
          await prisma.userRegion.upsert({
            where:  { userId_regionId: { userId: user.id, regionId: regionByCode[code].id } },
            update: {},
            create: { userId: user.id, regionId: regionByCode[code].id },
          });
        }
      }
      return user;
    })
  );
  console.log(`  ✔ ${users.length} demo users  (password: ${DEMO_PASSWORD})`);

  // ── 3. Demo satellite image ─────────────────────────────────────────────
  const image = await prisma.satelliteImage.upsert({
    where: { sceneId: 'S2A_MSIL2A_20240315T050501_N0510_R106_T44NKL_20240315T082351' },
    update: {},
    create: {
      sceneId:         'S2A_MSIL2A_20240315T050501_N0510_R106_T44NKL_20240315T082351',
      platform:        'Sentinel-2A',
      tile:            '44NKL',
      acquisitionDate: new Date('2024-03-15T05:05:01Z'),
      cloudCoverPct:   3.2,
      regionId:        regionByCode['MUM'].id,
      storagePath:     'data/sentinel2/S2A_44NKL_20240315.SAFE',
      fileSizeBytes:   BigInt(4_200_000_000),
      bandsMeta: {
        resolution: '10m',
        bands:      ['B02','B03','B04','B06','B08','B8A','B11','B12'],
        crs:        'EPSG:32644',
        boundingBox: { north: 20.0, south: 18.5, east: 73.5, west: 72.0 },
      },
      isProcessed: true,
    },
  });
  console.log('  ✔ 1 satellite image');

  // ── 4. Demo detections ──────────────────────────────────────────────────
  type DetRow = {
    lat: number; lon: number; code: string;
    conf: number; fdi: number; area: number;
    cls: string; status: DetectionStatus;
  };

  const detRows: DetRow[] = [
    { lat: 19.4, lon: 72.9,  code: 'MUM', conf: 0.91, fdi: 0.038, area: 0.42, cls: 'Plastic',  status: DetectionStatus.CONFIRMED  },
    { lat: 19.1, lon: 72.7,  code: 'MUM', conf: 0.76, fdi: 0.024, area: 0.18, cls: 'Plastic',  status: DetectionStatus.PENDING    },
    { lat: 15.3, lon: 73.9,  code: 'GOA', conf: 0.83, fdi: 0.031, area: 0.29, cls: 'Plastic',  status: DetectionStatus.CONFIRMED  },
    { lat: 15.1, lon: 74.0,  code: 'GOA', conf: 0.62, fdi: 0.019, area: 0.09, cls: 'Sea_Foam', status: DetectionStatus.FALSE_ALARM },
    { lat:  9.8, lon: 76.1,  code: 'KCH', conf: 0.88, fdi: 0.041, area: 0.54, cls: 'Plastic',  status: DetectionStatus.CONFIRMED  },
    { lat: 13.2, lon: 80.3,  code: 'CHN', conf: 0.79, fdi: 0.027, area: 0.22, cls: 'Plastic',  status: DetectionStatus.PENDING    },
    { lat: 11.6, lon: 92.7,  code: 'AND', conf: 0.94, fdi: 0.052, area: 0.71, cls: 'Plastic',  status: DetectionStatus.CONFIRMED  },
    { lat: 11.9, lon: 93.1,  code: 'AND', conf: 0.71, fdi: 0.022, area: 0.13, cls: 'Algae',    status: DetectionStatus.FALSE_ALARM },
  ];

  const detections = await Promise.all(
    detRows.map(d =>
      prisma.detection.create({
        data: {
          imageId:        image.id,
          regionId:       regionByCode[d.code].id,
          lat:            d.lat,
          lon:            d.lon,
          classification: d.cls,
          confidence:     d.conf,
          fdiScore:       d.fdi,
          areaSqKm:       d.area,
          pixelCount:     Math.max(1, Math.ceil(d.area / 0.0001)),
          status:         d.status,
          rawBandValues: {
            B04: +(0.05 + d.fdi * 0.1).toFixed(4),
            B06: +(0.12 + d.fdi * 0.05).toFixed(4),
            B08: +(0.32 + d.fdi).toFixed(4),
            B8A: +(0.34 + d.fdi * 0.95).toFixed(4),
            B11: 0.08,
            FDI: d.fdi,
          },
        },
      })
    )
  );
  console.log(`  ✔ ${detections.length} detections`);

  // ── 5. Demo hotspots ────────────────────────────────────────────────────
  type HotRow = {
    label: string; code: string;
    lat: number; lon: number;
    count: number; sev: SeverityLevel;
    eta: number | null; conf: number;
  };

  const hotRows: HotRow[] = [
    { label: 'MUM-H1', code: 'MUM', lat: 19.25, lon: 72.80,  count: 12, sev: SeverityLevel.HIGH,   eta: 18,   conf: 0.91 },
    { label: 'GOA-H1', code: 'GOA', lat: 15.20, lon: 73.95,  count:  6, sev: SeverityLevel.MEDIUM, eta: 36,   conf: 0.83 },
    { label: 'KCH-H1', code: 'KCH', lat:  9.85, lon: 76.15,  count:  4, sev: SeverityLevel.MEDIUM, eta: 42,   conf: 0.88 },
    { label: 'AND-H1', code: 'AND', lat: 11.70, lon: 92.90,  count: 18, sev: SeverityLevel.HIGH,   eta: null, conf: 0.94 },
  ];

  const hotspots = await Promise.all(
    hotRows.map(h =>
      prisma.hotspot.create({
        data: {
          label:          h.label,
          regionId:       regionByCode[h.code].id,
          centroidLat:    h.lat,
          centroidLon:    h.lon,
          detectionCount: h.count,
          severity:       h.sev,
          confidence:     h.conf,
          etaHours:       h.eta,
          firstDetected:  new Date('2024-03-15T06:00:00Z'),
        },
      })
    )
  );
  console.log(`  ✔ ${hotspots.length} hotspots`);

  // ── 6. Demo trajectory (72-h Lagrangian ensemble for MUM confirmed) ─────
  const anchorDet = detections.find(d => d.lat === 19.4 && d.lon === 72.9);
  if (anchorDet) {
    const N = 73; // t = 0..72
    const points = Array.from({ length: N }, (_, i) => ({
      t:   i,
      lat: +(19.4 + i * 0.012).toFixed(5),
      lon: +(72.9 + i * 0.008).toFixed(5),
    }));
    const cone = Array.from({ length: N }, (_, i) => {
      const spread = +(i * 0.003).toFixed(5);
      return {
        t:      i,
        latMin: +(19.4 + i * 0.012 - spread).toFixed(5),
        latMax: +(19.4 + i * 0.012 + spread).toFixed(5),
        lonMin: +(72.9 + i * 0.008 - spread).toFixed(5),
        lonMax: +(72.9 + i * 0.008 + spread).toFixed(5),
      };
    });

    await prisma.trajectory.create({
      data: {
        detectionId:   anchorDet.id,
        pathData:      { points, cone },
        windageCoeffs: [0.015, 0.02, 0.025, 0.03],
        horizonHours:  72,
        dataSource:    'demo',
      },
    });
    console.log('  ✔ 1 trajectory  (72-h ensemble, 4 windage coefficients)');
  }

  // ── 7. Demo alerts ──────────────────────────────────────────────────────
  const mumDet = detections.find(d => d.lat === 19.4);
  const andDet = detections.find(d => d.lat === 11.6);

  await Promise.all([
    prisma.alert.create({
      data: {
        detectionId: mumDet?.id,
        type:        AlertType.HOTSPOT,
        severity:    SeverityLevel.HIGH,
        title:       'High-severity hotspot detected — Mumbai',
        message:     'Cluster MUM-H1 (12 detections, 91% confidence) identified 18 km off Mumbai coast.',
        sentVia:     [],
      },
    }),
    prisma.alert.create({
      data: {
        detectionId: mumDet?.id,
        type:        AlertType.COAST_PROXIMITY,
        severity:    SeverityLevel.HIGH,
        title:       'Drift forecast: coastal landfall ETA 18 h',
        message:     'Lagrangian ensemble predicts MUM-H1 plastic mass reaching Versova Beach at T+18 h.',
        sentVia:     [],
      },
    }),
    prisma.alert.create({
      data: {
        detectionId: andDet?.id,
        type:        AlertType.HOTSPOT,
        severity:    SeverityLevel.MEDIUM,
        title:       'New cluster — Andaman Sea',
        message:     'AND-H1 (18 detections) detected near North Andaman. No coast ETA (open ocean).',
        sentVia:     [],
      },
    }),
  ]);
  console.log('  ✔ 3 alerts');

  // ── 8. Active model version ─────────────────────────────────────────────
  // REAL metrics from held-out MARIDA+MADOS combined test split
  // (python_engine/models/metrics.json, independently re-verified against the
  // shipped marinenet.onnx — see docs/MODEL_EVALUATION_METRICS.md). f1Score is
  // the macro-F1; the confusion matrix and precision/recall are genuine
  // per-class evaluation — no fabricated placeholders. Classes order:
  // Plastic, Algae, Sea_Foam, Water. Last synced to the 2026-07-22 3-seed
  // ensemble retrain (macroF1 0.787 -> 0.8175) — re-sync these if the model
  // is retrained again, so this never drifts from the live engine numbers.
  // Deactivate any prior rows first so exactly one model version is active
  // (idempotent even against an older DB that still holds demo rows).
  await prisma.modelVersion.updateMany({ data: { isActive: false } });
  await prisma.modelVersion.upsert({
    where:  { version: '1.1-gpu-marida+mados' },
    update: {
      name:         'MarineNet (per-pixel MLP)',
      architecture: 'per-pixel 3-seed ensemble MLP 11→256→128→64→32→4 (focal loss + class-balanced weights, GPU AdamW)',
      trainedOn:    ['MARIDA', 'MADOS'],
      storagePath:  'models/marinenet.onnx',
      f1Score:      0.8175,
      precision:    0.7759,
      recall:       0.8685,
      isActive:     true,
    },
    create: {
      name:         'MarineNet (per-pixel MLP)',
      version:      '1.1-gpu-marida+mados',
      architecture: 'per-pixel 3-seed ensemble MLP 11→256→128→64→32→4 (focal loss + class-balanced weights, GPU AdamW)',
      trainedOn:    ['MARIDA', 'MADOS'],
      storagePath:  'models/marinenet.onnx',
      f1Score:      0.8175,  // macro-F1 on combined MARIDA+MADOS test split (3-seed ensemble retrain)
      precision:    0.7759,  // macro precision
      recall:       0.8685,  // macro recall
      confusionMatrix: {
        classes: ['Plastic', 'Algae', 'Sea_Foam', 'Water'],
        matrix:  [[1116,93,10,135],[186,6024,142,976],[48,10,646,70],[88,3163,150,487050]],
      },
      isActive: true,
    },
  });
  // Purge superseded rows so a re-seed of an old DB can't resurface stale metrics
  // (the fabricated ResNet-50 demo + the pre-GPU 7-feature v1.0 macro-F1=0.500 row).
  await prisma.modelVersion.deleteMany({
    where: { OR: [{ version: '0.1.0-demo' }, { name: 'MarineNet ResNet-50' }, { version: '1.0-marida+mados' }] },
  });
  console.log('  ✔ 1 model version  (MarineNet per-pixel MLP v1.1-gpu-marida+mados, macro-F1=0.787 / acc 98.9% on real combined)');

  // ── 9. Pipeline logs for the demo image ────────────────────────────────
  const stageLogs: Array<{ stage: PipelineStage; durationMs: number }> = [
    { stage: PipelineStage.DOWNLOAD, durationMs: 4_200 },
    { stage: PipelineStage.FDI,      durationMs: 1_100 },
    { stage: PipelineStage.CNN,      durationMs: 8_700 },
    { stage: PipelineStage.DBSCAN,   durationMs:   340 },
    { stage: PipelineStage.DRIFT,    durationMs: 5_600 },
    { stage: PipelineStage.ALERT,    durationMs:   210 },
  ];

  await Promise.all(
    stageLogs.map(({ stage, durationMs }) =>
      prisma.pipelineLog.create({
        data: {
          imageId:     image.id,
          stage,
          status:      PipelineStatus.COMPLETED,
          startedAt:   new Date('2024-03-15T05:10:00Z'),
          completedAt: new Date('2024-03-15T05:10:00Z'),
          durationMs,
          metadata:    { demo: true },
        },
      })
    )
  );
  console.log('  ✔ 6 pipeline log entries');

  console.log('\n✅ Seed complete.\n');
}

main()
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
