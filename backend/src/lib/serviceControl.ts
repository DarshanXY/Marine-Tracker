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
import http from 'http';

export interface ServiceDef {
  name: string;
  label: string;
  host: string;
  port: number;
  /** For HTTP services, the path to GET for a real health check. A bound port is
   *  NOT proof the app is serving — a hung/starting/zombie process (or a leftover
   *  socket) still accepts a TCP connect. When set, `status()` requires an HTTP 2xx
   *  here, the SAME bar an actual scan uses (callEngine → /health). Without it the
   *  chip could read "engine up" while a scan gets "engine unreachable". */
  healthPath?: string;
}

const SERVICES: Record<string, ServiceDef> = {
  db: { name: 'db', label: 'Database (Postgres)', host: '127.0.0.1', port: 5432 },
  redis: { name: 'redis', label: 'Queue (Redis)', host: '127.0.0.1', port: 6379 },
  engine: { name: 'engine', label: 'Detection engine', host: '127.0.0.1', port: 8000, healthPath: '/health' },
  clay: { name: 'clay', label: 'Clay GPU sidecar', host: '127.0.0.1', port: 8010, healthPath: '/health' },
};

/** TCP connect probe — is something listening on host:port? Right for non-HTTP
 *  services (Postgres, Redis): a successful connect IS a meaningful liveness check. */
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

/** HTTP health probe — running == the app answers /health with a 2xx. This is the
 *  same definition of "reachable" the pipeline scan uses (engine.ts callEngine),
 *  so a health chip can no longer show green while a real scan fails. A port held
 *  by a process that never completes the HTTP response trips the timeout → down. */
function probeHttp(host: string, port: number, path: string, timeout = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout }, (res) => {
      const ok = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
      res.resume(); // drain the body so the socket is released
      resolve(ok);
    });
    req.once('timeout', () => { req.destroy(); resolve(false); });
    req.once('error', () => resolve(false));
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
  const running = s.healthPath
    ? await probeHttp(s.host, s.port, s.healthPath)
    : await probe(s.host, s.port);
  return { name: s.name, label: s.label, port: s.port, running };
}

export async function statusAll(): Promise<ServiceStatus[]> {
  return Promise.all(Object.keys(SERVICES).map(status));
}
