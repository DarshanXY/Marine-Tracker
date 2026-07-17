/**
 * Backing-service status — is the detection engine / Redis queue / Postgres /
 * Clay GPU sidecar currently listening?
 *
 * READ-ONLY BY DESIGN. This module used to start and stop these processes on
 * behalf of the UI; that is gone. The services are owned by the host (start-all.cmd
 * and the infra watchdog), which outlives any browser session and can restart them
 * unattended — driving them from a request handler meant the API could spawn OS
 * processes, and a dashboard click could kill the engine mid-scan. We report state
 * and let the supervisor own the lifecycle.
 */
import net from 'net';

export interface ServiceDef {
  name: string;
  label: string;
  host: string;
  port: number;
}

const SERVICES: Record<string, ServiceDef> = {
  db: { name: 'db', label: 'Database (Postgres)', host: '127.0.0.1', port: 5432 },
  redis: { name: 'redis', label: 'Queue (Redis)', host: '127.0.0.1', port: 6379 },
  engine: { name: 'engine', label: 'Detection engine', host: '127.0.0.1', port: 8000 },
  clay: { name: 'clay', label: 'Clay GPU sidecar', host: '127.0.0.1', port: 8010 },
};

/** TCP connect probe — is something listening on host:port? */
function probe(host: string, port: number, timeout = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const finish = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });
}

export interface ServiceStatus {
  name: string;
  label: string;
  running: boolean;
  port: number;
}

export async function status(name: string): Promise<ServiceStatus> {
  const s = SERVICES[name];
  return { name: s.name, label: s.label, port: s.port, running: await probe(s.host, s.port) };
}

export async function statusAll(): Promise<ServiceStatus[]> {
  return Promise.all(Object.keys(SERVICES).map(status));
}
