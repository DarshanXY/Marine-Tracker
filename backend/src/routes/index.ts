import { Router } from 'express';
import auth from './auth.routes';
import stats from './stats.routes';
import detections from './detections.routes';
import hotspots from './hotspots.routes';
import regions from './regions.routes';
import alerts from './alerts.routes';
import satellite from './satellite.routes';
import pipeline from './pipeline.routes';
import features from './features.routes';
import operations from './operations.routes';
import exportRoutes from './export.routes';
import system from './system.routes';

const api = Router();

// API index — quick discovery of available endpoints.
api.get('/', (_req, res) => {
  res.json({
    name: 'Marine Plastic Tracker API',
    version: '0.3.0',
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/logout',
      'GET  /api/auth/me',
      'GET  /api/auth/users (admin)',
      'POST /api/auth/2fa/setup | enable | disable',
      'GET  /api/stats/overview',
      'GET  /api/stats/trend?days=30',
      'GET  /api/stats/by-region',
      'GET  /api/stats/by-class',
      'GET  /api/detections?region=&status=&classification=&minConfidence=&limit=&offset=',
      'GET  /api/detections/:id',
      'GET  /api/hotspots?region=&severity=&active=',
      'GET  /api/hotspots/:id',
      'GET  /api/regions',
      'GET  /api/regions/:code',
      'GET  /api/alerts?acked=&severity=&type=',
      'PATCH /api/alerts/:id/ack',
      'GET  /api/satellite/status',
      'GET  /api/satellite/scenes',
      'POST /api/pipeline/run',
      'GET  /api/pipeline/status',
      'GET  /api/operations?status=&region=&limit=',
      'GET  /api/operations/stats',
      'GET  /api/operations/:id',
      'POST /api/operations (field+)',
      'PATCH /api/operations/:id/status (field+)',
      'POST /api/operations/:id/report (field+)',
      'GET  /api/export/detections.csv',
      'GET  /api/export/hotspots.pdf?region=',
      'GET  /api/export/operations/:id.pdf',
    ],
  });
});

api.use('/auth', auth);
api.use('/stats', stats);
api.use('/detections', detections);
api.use('/hotspots', hotspots);
api.use('/regions', regions);
api.use('/alerts', alerts);
api.use('/satellite', satellite);
api.use('/pipeline', pipeline);
api.use('/engine', features);
api.use('/operations', operations);
api.use('/export', exportRoutes);
api.use('/system', system);

export default api;
