-- =============================================================================
--  Chart-ready views for mpt_app (snapshot of the live app tables).
--  Created by sync_app.py after the data is copied.
-- =============================================================================

DROP VIEW IF EXISTS v_detections_by_class;
DROP VIEW IF EXISTS v_detections_by_region;
DROP VIEW IF EXISTS v_detections_per_day;
DROP VIEW IF EXISTS v_detections_by_status;
DROP VIEW IF EXISTS v_hotspots_by_severity;
DROP VIEW IF EXISTS v_alerts_summary;
DROP VIEW IF EXISTS v_pipeline_stage_performance;
DROP VIEW IF EXISTS v_scenes_cloud_cover;
DROP VIEW IF EXISTS v_app_table_inventory;

CREATE VIEW v_detections_by_class AS
SELECT d.classification, COUNT(*) AS detections, ROUND(AVG(d.confidence), 3) AS avg_confidence,
       ROUND(AVG(d.fdi_score), 4) AS avg_fdi, ROUND(SUM(d.area_sq_km), 4) AS total_area_sq_km
FROM detections d
GROUP BY d.classification;

CREATE VIEW v_detections_by_region AS
SELECT COALESCE(r.code, 'AOI / none') AS region_code, COALESCE(r.display_name, 'Ad-hoc area of interest') AS region_name,
       d.classification, COUNT(*) AS detections
FROM detections d
LEFT JOIN regions r ON r.id = d.region_id
GROUP BY COALESCE(r.code, 'AOI / none'), COALESCE(r.display_name, 'Ad-hoc area of interest'), d.classification;

CREATE VIEW v_detections_per_day AS
SELECT DATE(d.created_at) AS day, d.classification, COUNT(*) AS detections
FROM detections d
GROUP BY DATE(d.created_at), d.classification;

CREATE VIEW v_detections_by_status AS
SELECT d.status, d.classification, COUNT(*) AS detections
FROM detections d
GROUP BY d.status, d.classification;

CREATE VIEW v_hotspots_by_severity AS
SELECT h.severity, COUNT(*) AS hotspots, SUM(h.is_active) AS active_hotspots,
       ROUND(AVG(h.detection_count), 1) AS avg_detections, ROUND(AVG(h.confidence), 3) AS avg_confidence,
       ROUND(AVG(h.eta_hours), 1) AS avg_eta_hours
FROM hotspots h
GROUP BY h.severity;

CREATE VIEW v_alerts_summary AS
SELECT a.severity, a.type, COUNT(*) AS alerts, SUM(a.is_acked) AS acknowledged
FROM alerts a
GROUP BY a.severity, a.type;

CREATE VIEW v_pipeline_stage_performance AS
SELECT p.stage, p.status, COUNT(*) AS runs, ROUND(AVG(p.duration_ms)) AS avg_ms, MAX(p.duration_ms) AS max_ms
FROM pipeline_logs p
GROUP BY p.stage, p.status;

CREATE VIEW v_scenes_cloud_cover AS
SELECT s.tile, DATE(s.acquisition_date) AS acquired, s.platform, s.cloud_cover_pct, s.is_processed
FROM satellite_images s;

CREATE VIEW v_app_table_inventory AS
SELECT t.TABLE_NAME AS table_name, t.TABLE_ROWS AS approx_rows,
       ROUND((t.DATA_LENGTH + t.INDEX_LENGTH) / 1048576, 2) AS size_mb
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = 'mpt_app' AND t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_NAME;
