/**
 * Satellite data-source status.
 *
 * Reports which Sentinel-2 provider is configured and surfaces the newest scene.
 * When the Python engine is reachable it pulls the real latest scene (live STAC
 * discovery); otherwise it falls back to the bundled demo scene.
 */
import { env } from '../lib/env';
import { listScenes } from '../data/repo';
import type { SatelliteScene, SatelliteStatus } from '../types/domain';

async function engineNewestScene(): Promise<{ scene: SatelliteScene | null; source: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(`${env.pythonEngineUrl}/satellite/scenes`, { signal: controller.signal })
      .finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`engine ${res.status}`);
    const body = (await res.json()) as { data: SatelliteScene[]; meta?: { source?: string } };
    return { scene: body.data?.[0] ?? null, source: body.meta?.source ?? 'demo' };
  } catch {
    return { scene: null, source: 'unreachable' };
  }
}

export async function getSatelliteStatus(): Promise<SatelliteStatus> {
  const s = env.satellite;
  const provider = s.provider;

  let configured = false;
  let tokenEndpoint: string | null = null;
  let catalogEndpoint: string | null = null;
  let message = '';

  switch (provider) {
    case 'cdse':
    case 'sentinelhub':
      configured = Boolean(s.shClientId && s.shClientSecret);
      tokenEndpoint = s.shTokenUrl;
      catalogEndpoint = `${s.shBaseUrl}/api/v1/catalog/1.0.0`;
      message = configured
        ? 'Sentinel Hub (Copernicus Data Space Ecosystem) OAuth2 client credentials configured.'
        : 'Add SENTINEL_HUB_CLIENT_ID and SENTINEL_HUB_CLIENT_SECRET to enable live Sentinel-2 access (free at dataspace.copernicus.eu).';
      break;
    case 'aws-stac':
      configured = true; // public catalogue, no key required
      catalogEndpoint = s.awsStacUrl;
      message = 'Element84 Earth Search (AWS Open Data) — public Sentinel-2 STAC, no API key required.';
      break;
    default:
      configured = false;
      message = 'Demo mode — set SATELLITE_PROVIDER to cdse | sentinelhub | aws-stac for live Sentinel-2 data.';
  }

  // Pull the newest scene from the engine (real STAC when configured).
  const engine = await engineNewestScene();
  let latestScene: SatelliteScene | null = engine.scene;
  let mode: 'live' | 'demo' = env.DEMO_MODE ? 'demo' : configured ? 'live' : 'demo';

  if (engine.source === 'stac' && engine.scene) {
    mode = 'live';
    message = 'Live Sentinel-2 scene discovery via Element84 Earth Search (AWS Open Data). ' +
      'Detection still runs on synthetic pixels until a trained CNN + pixel ingest are enabled.';
  } else if (!latestScene) {
    const scenes = await listScenes();
    latestScene = scenes[0] ?? null;
  }

  return {
    provider,
    configured,
    mode,
    message,
    tokenEndpoint,
    catalogEndpoint,
    latestScene,
  };
}
