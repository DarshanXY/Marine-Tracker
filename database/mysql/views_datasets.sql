-- =============================================================================
--  Chart-ready views for mpt_datasets.  Each view is one chart / one summary table:
--  open it in MySQL Workbench (right-click -> Select Rows) or point any BI / chart tool at it.
--  Rebuilt by load_datasets.py after the data is loaded.
-- =============================================================================

DROP VIEW IF EXISTS v_dataset_overview;
DROP VIEW IF EXISTS v_table_inventory;
DROP VIEW IF EXISTS v_pixels_by_dataset_class;
DROP VIEW IF EXISTS v_class_balance;
DROP VIEW IF EXISTS v_spectral_signature;
DROP VIEW IF EXISTS v_marida_class_distribution;
DROP VIEW IF EXISTS v_marida_split_summary;
DROP VIEW IF EXISTS v_marida_scene_overview;
DROP VIEW IF EXISTS v_mados_class_distribution;
DROP VIEW IF EXISTS v_mados_split_summary;
DROP VIEW IF EXISTS v_rfo_site_summary;
DROP VIEW IF EXISTS v_plp_targets_by_material;
DROP VIEW IF EXISTS v_plp_observations_by_date;
DROP VIEW IF EXISTS v_model_comparison;
DROP VIEW IF EXISTS v_model_class_scores;
DROP VIEW IF EXISTS v_confusion_matrix;
DROP VIEW IF EXISTS v_load_problems;

CREATE VIEW v_dataset_overview AS
SELECT d.dataset_id, d.name, d.kind, d.sensor, d.n_scenes, d.n_patches, d.n_pixel_samples,
       d.raw_size_gb, d.local_path, d.in_mysql
FROM datasets d
ORDER BY d.dataset_id;

CREATE VIEW v_table_inventory AS
SELECT t.TABLE_NAME AS table_name,
       t.TABLE_ROWS AS approx_rows,
       ROUND((t.DATA_LENGTH + t.INDEX_LENGTH) / 1048576, 2) AS size_mb,
       t.TABLE_COMMENT AS description
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = 'mpt_datasets' AND t.TABLE_TYPE = 'BASE TABLE'
ORDER BY t.TABLE_NAME;

CREATE VIEW v_pixels_by_dataset_class AS
SELECT t.dataset_id, t.split, c.class_id, c.class_name, c.colour_hex, COUNT(*) AS pixels
FROM training_pixels t
JOIN unified_classes c ON c.class_id = t.class_id
GROUP BY t.dataset_id, t.split, c.class_id, c.class_name, c.colour_hex;

CREATE VIEW v_class_balance AS
SELECT c.class_id, c.class_name, c.colour_hex, COUNT(*) AS pixels,
       ROUND(100 * COUNT(*) / SUM(COUNT(*)) OVER (), 3) AS pct_of_all_pixels
FROM training_pixels t
JOIN unified_classes c ON c.class_id = t.class_id
GROUP BY c.class_id, c.class_name, c.colour_hex;

CREATE VIEW v_spectral_signature AS
SELECT c.class_name, c.colour_hex, t.dataset_id, COUNT(*) AS n,
       ROUND(AVG(t.b04), 4) AS mean_b04_red,
       ROUND(AVG(t.b06), 4) AS mean_b06_rededge,
       ROUND(AVG(t.b08), 4) AS mean_b08_nir,
       ROUND(AVG(t.b8a), 4) AS mean_b8a_nir,
       ROUND(AVG(t.b11), 4) AS mean_b11_swir,
       ROUND(AVG(t.fdi), 4) AS mean_fdi,
       ROUND(STDDEV_SAMP(t.fdi), 4) AS sd_fdi,
       ROUND(AVG(t.ndvi), 4) AS mean_ndvi
FROM training_pixels t
JOIN unified_classes c ON c.class_id = t.class_id
GROUP BY c.class_id, c.class_name, c.colour_hex, t.dataset_id;

CREATE VIEW v_marida_class_distribution AS
SELECT mc.class_id, mc.class_name, u.class_name AS unified_class, mc.used_in_training,
       COUNT(DISTINCT p.patch_id) AS patches_containing,
       COALESCE(SUM(p.pixels), 0) AS labelled_pixels,
       ROUND(100 * COALESCE(SUM(p.pixels), 0) / SUM(COALESCE(SUM(p.pixels), 0)) OVER (), 3) AS pct_of_labelled
FROM marida_classes mc
LEFT JOIN unified_classes u ON u.class_id = mc.unified_class_id
LEFT JOIN marida_patch_class_pixels p ON p.class_id = mc.class_id
GROUP BY mc.class_id, mc.class_name, u.class_name, mc.used_in_training;

CREATE VIEW v_marida_split_summary AS
SELECT COALESCE(p.split, 'unassigned') AS split, COUNT(*) AS patches, COUNT(DISTINCT p.scene_id) AS scenes,
       SUM(p.labelled_pixels) AS labelled_pixels, SUM(p.c01_marine_debris) AS patches_with_debris
FROM marida_patches p
GROUP BY COALESCE(p.split, 'unassigned');

CREATE VIEW v_marida_scene_overview AS
SELECT s.scene_id, s.acquisition_date, s.mgrs_tile, s.center_lat, s.center_lon, s.n_patches, s.n_annotations,
       COALESCE(SUM(pc.pixels), 0) AS debris_pixels
FROM marida_scenes s
LEFT JOIN marida_patches p ON p.scene_id = s.scene_id
LEFT JOIN marida_patch_class_pixels pc ON pc.patch_id = p.patch_id AND pc.class_id = 1
GROUP BY s.scene_id, s.acquisition_date, s.mgrs_tile, s.center_lat, s.center_lon, s.n_patches, s.n_annotations;

CREATE VIEW v_mados_class_distribution AS
SELECT mc.class_id, mc.class_name, u.class_name AS unified_class, mc.used_in_training,
       COUNT(DISTINCT p.crop_id) AS crops_containing,
       COALESCE(SUM(p.pixels), 0) AS labelled_pixels,
       ROUND(100 * COALESCE(SUM(p.pixels), 0) / SUM(COALESCE(SUM(p.pixels), 0)) OVER (), 3) AS pct_of_labelled
FROM mados_classes mc
LEFT JOIN unified_classes u ON u.class_id = mc.unified_class_id
LEFT JOIN mados_crop_class_pixels p ON p.class_id = mc.class_id
GROUP BY mc.class_id, mc.class_name, u.class_name, mc.used_in_training;

CREATE VIEW v_mados_split_summary AS
SELECT COALESCE(c.split, 'unassigned') AS split, COUNT(*) AS crops, COUNT(DISTINCT c.scene_id) AS scenes,
       SUM(c.labelled_pixels) AS labelled_pixels
FROM mados_crops c
GROUP BY COALESCE(c.split, 'unassigned');

CREATE VIEW v_rfo_site_summary AS
SELECT s.site_name, s.scene_date, s.split, s.n_points, s.n_debris, s.n_water,
       ROUND(100 * s.n_debris / NULLIF(s.n_points, 0), 1) AS pct_debris,
       s.n_qualitative_polygons, s.n_qualitative_bboxes, s.scene_tif_gb
FROM rfo_sites s
ORDER BY s.scene_date;

CREATE VIEW v_plp_targets_by_material AS
SELECT t.campaign_year, COALESCE(t.material, 'unknown') AS material,
       COUNT(DISTINCT t.target_id) AS targets, COUNT(*) AS observations,
       ROUND(AVG(t.radius_m), 2) AS avg_radius_m, MIN(t.observation_date) AS first_observed,
       MAX(t.observation_date) AS last_observed
FROM plp_target_observations t
GROUP BY t.campaign_year, COALESCE(t.material, 'unknown');

CREATE VIEW v_plp_observations_by_date AS
SELECT t.campaign_year, t.observation_date, COUNT(*) AS observations,
       GROUP_CONCAT(DISTINCT t.material ORDER BY t.material) AS materials
FROM plp_target_observations t
GROUP BY t.campaign_year, t.observation_date;

CREATE VIEW v_model_comparison AS
SELECT r.run_key, r.model_file, r.macro_f1, r.test_accuracy, r.balanced_macro_f1, r.train_samples,
       mp.precision_score AS plastic_precision, mp.recall_score AS plastic_recall, mp.f1_score AS plastic_f1
FROM model_runs r
LEFT JOIN model_class_metrics mp ON mp.run_key = r.run_key AND mp.class_name = 'Plastic';

CREATE VIEW v_model_class_scores AS
SELECT m.run_key, m.class_name, u.colour_hex, m.precision_score, m.recall_score, m.f1_score
FROM model_class_metrics m
LEFT JOIN unified_classes u ON u.class_name = m.class_name;

CREATE VIEW v_confusion_matrix AS
SELECT c.run_key, c.actual_class, c.predicted_class, c.n,
       ROUND(100 * c.n / SUM(c.n) OVER (PARTITION BY c.run_key, c.actual_class), 2) AS pct_of_actual_class
FROM model_confusion c;

CREATE VIEW v_load_problems AS
SELECT a.step, a.table_name, a.rows_loaded, a.rows_expected, a.note
FROM load_audit a
WHERE a.ok = 0;
