-- =============================================================================
--  mpt_datasets  -  every reference / training dataset the project uses, as tables.
--  Rebuilt from scratch by load_datasets.py (it runs this file first).
--
--  Conventions: full-line comments only, every statement ends with a semicolon at
--  end of line (see _common.split_sql). Coordinates are WGS84 lon/lat degrees.
--  Class ids 0-3 = the engine's unified classes (Plastic, Algae, Sea_Foam, Water).
-- =============================================================================

DROP TABLE IF EXISTS model_dataset_metrics;
DROP TABLE IF EXISTS model_confusion;
DROP TABLE IF EXISTS model_class_metrics;
DROP TABLE IF EXISTS model_runs;
DROP TABLE IF EXISTS json_documents;
DROP TABLE IF EXISTS countries;
DROP TABLE IF EXISTS rfo_polygons;
DROP TABLE IF EXISTS rfo_points;
DROP TABLE IF EXISTS rfo_sites;
DROP TABLE IF EXISTS plp_imagery;
DROP TABLE IF EXISTS plp_target_observations;
DROP TABLE IF EXISTS plp_targets;
DROP TABLE IF EXISTS mados_crop_class_pixels;
DROP TABLE IF EXISTS mados_crops;
DROP TABLE IF EXISTS mados_scenes;
DROP TABLE IF EXISTS marida_annotations;
DROP TABLE IF EXISTS marida_patch_class_pixels;
DROP TABLE IF EXISTS marida_patches;
DROP TABLE IF EXISTS marida_scenes;
DROP TABLE IF EXISTS training_pixels;
DROP TABLE IF EXISTS mados_classes;
DROP TABLE IF EXISTS marida_classes;
DROP TABLE IF EXISTS unified_classes;
DROP TABLE IF EXISTS datasets;
DROP TABLE IF EXISTS load_audit;

-- ---------------------------------------------------------------- catalogue --
CREATE TABLE load_audit (
  audit_id      INT AUTO_INCREMENT PRIMARY KEY,
  step          VARCHAR(40)  NOT NULL,
  table_name    VARCHAR(64)  NOT NULL,
  rows_loaded   BIGINT       NOT NULL,
  rows_expected BIGINT       NULL COMMENT 'independent cross-check count (NULL = none available)',
  ok            TINYINT(1)   NOT NULL,
  note          VARCHAR(400) NULL,
  loaded_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='One row per load step: what was loaded and whether it matched an independent count';

CREATE TABLE datasets (
  dataset_id       VARCHAR(16)   NOT NULL PRIMARY KEY,
  name             VARCHAR(80)   NOT NULL,
  full_name        VARCHAR(255)  NULL,
  kind             VARCHAR(48)   NOT NULL,
  sensor           VARCHAR(80)   NULL,
  resolution_m     DECIMAL(6,1)  NULL,
  citation         VARCHAR(400)  NULL,
  role_in_project  VARCHAR(400)  NULL,
  n_scenes         INT           NULL,
  n_patches        INT           NULL,
  n_pixel_samples  INT           NULL COMMENT 'rows in training_pixels for this dataset',
  raw_size_gb      DECIMAL(7,2)  NULL,
  local_path       VARCHAR(255)  NULL,
  in_mysql         VARCHAR(255)  NULL COMMENT 'what part of the dataset is stored in these tables',
  notes            TEXT          NULL
) ENGINE=InnoDB COMMENT='Catalogue of every dataset: source, role, size, and what is stored here';

CREATE TABLE unified_classes (
  class_id     TINYINT      NOT NULL PRIMARY KEY,
  class_name   VARCHAR(20)  NOT NULL,
  description  VARCHAR(255) NULL,
  colour_hex   CHAR(7)      NOT NULL COMMENT 'same palette as frontend/src/lib/classColors.ts'
) ENGINE=InnoDB COMMENT='The 4 classes the model predicts';

CREATE TABLE marida_classes (
  class_id          TINYINT      NOT NULL PRIMARY KEY,
  class_name        VARCHAR(40)  NOT NULL,
  unified_class_id  TINYINT      NULL,
  used_in_training  TINYINT(1)   NOT NULL,
  note              VARCHAR(255) NULL,
  CONSTRAINT fk_marida_classes_unified FOREIGN KEY (unified_class_id) REFERENCES unified_classes (class_id)
) ENGINE=InnoDB COMMENT='MARIDA 15 native classes and how each maps to the 4 unified classes (python_engine/ml/datasets/marida.py)';

CREATE TABLE mados_classes (
  class_id          TINYINT      NOT NULL PRIMARY KEY,
  class_name        VARCHAR(40)  NOT NULL,
  unified_class_id  TINYINT      NULL,
  used_in_training  TINYINT(1)   NOT NULL,
  note              VARCHAR(255) NULL,
  CONSTRAINT fk_mados_classes_unified FOREIGN KEY (unified_class_id) REFERENCES unified_classes (class_id)
) ENGINE=InnoDB COMMENT='MADOS 15 native classes and how each maps to the 4 unified classes (python_engine/ml/datasets/mados.py)';

-- -------------------------------------------------------- per-pixel training --
CREATE TABLE training_pixels (
  pixel_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dataset_id  VARCHAR(16)     NOT NULL,
  split       ENUM('train','val','test') NOT NULL,
  b04         FLOAT NOT NULL COMMENT 'Red 665 nm reflectance',
  b06         FLOAT NOT NULL COMMENT 'Red edge 740 nm reflectance',
  b08         FLOAT NOT NULL COMMENT 'NIR 842 nm reflectance',
  b8a         FLOAT NOT NULL COMMENT 'Narrow NIR 865 nm reflectance',
  b11         FLOAT NOT NULL COMMENT 'SWIR 1610 nm reflectance',
  fdi         FLOAT NOT NULL COMMENT 'Floating Debris Index (Biermann et al.)',
  ndvi        FLOAT NOT NULL COMMENT '(B08-B04)/(B08+B04)',
  class_id    TINYINT NOT NULL,
  KEY ix_pix_ds_split_class (dataset_id, split, class_id),
  KEY ix_pix_class (class_id),
  CONSTRAINT fk_pix_dataset FOREIGN KEY (dataset_id) REFERENCES datasets (dataset_id),
  CONSTRAINT fk_pix_class   FOREIGN KEY (class_id)   REFERENCES unified_classes (class_id)
) ENGINE=InnoDB COMMENT='The exact labelled pixels the model was trained/validated/tested on (7-feature contract from the .npz caches)';

-- ------------------------------------------------------------------- MARIDA --
CREATE TABLE marida_scenes (
  scene_id          VARCHAR(24) NOT NULL PRIMARY KEY COMMENT 'e.g. S2_1-12-19_48MYU',
  acquisition_date  DATE        NOT NULL,
  mgrs_tile         VARCHAR(8)  NOT NULL,
  utm_epsg          INT         NULL,
  n_patches         SMALLINT    NOT NULL,
  center_lon        DOUBLE      NULL,
  center_lat        DOUBLE      NULL,
  min_lon           DOUBLE      NULL,
  max_lon           DOUBLE      NULL,
  min_lat           DOUBLE      NULL,
  max_lat           DOUBLE      NULL,
  n_annotations     INT         NOT NULL DEFAULT 0
) ENGINE=InnoDB COMMENT='MARIDA: one Sentinel-2 acquisition over one MGRS tile (63 scenes)';

CREATE TABLE marida_patches (
  patch_id          VARCHAR(32) NOT NULL PRIMARY KEY COMMENT 'e.g. S2_1-12-19_48MYU_0',
  scene_id          VARCHAR(24) NOT NULL,
  patch_index       SMALLINT    NOT NULL,
  split             ENUM('train','val','test') NULL COMMENT 'official MARIDA split (NULL = not in any split file)',
  width_px          SMALLINT    NULL,
  height_px         SMALLINT    NULL,
  center_lon        DOUBLE      NULL,
  center_lat        DOUBLE      NULL,
  min_lon           DOUBLE      NULL,
  max_lon           DOUBLE      NULL,
  min_lat           DOUBLE      NULL,
  max_lat           DOUBLE      NULL,
  labelled_pixels   INT         NOT NULL DEFAULT 0 COMMENT 'pixels with a non-zero class in the _cl.tif mask',
  n_classes         TINYINT     NOT NULL DEFAULT 0,
  labels_match_mask TINYINT(1)  NULL COMMENT '1 = official multi-hot labels equal the classes present in the mask',
  c01_marine_debris        TINYINT(1) NOT NULL DEFAULT 0,
  c02_dense_sargassum      TINYINT(1) NOT NULL DEFAULT 0,
  c03_sparse_sargassum     TINYINT(1) NOT NULL DEFAULT 0,
  c04_natural_organic      TINYINT(1) NOT NULL DEFAULT 0,
  c05_ship                 TINYINT(1) NOT NULL DEFAULT 0,
  c06_clouds               TINYINT(1) NOT NULL DEFAULT 0,
  c07_marine_water         TINYINT(1) NOT NULL DEFAULT 0,
  c08_sediment_laden_water TINYINT(1) NOT NULL DEFAULT 0,
  c09_foam                 TINYINT(1) NOT NULL DEFAULT 0,
  c10_turbid_water         TINYINT(1) NOT NULL DEFAULT 0,
  c11_shallow_water        TINYINT(1) NOT NULL DEFAULT 0,
  c12_waves                TINYINT(1) NOT NULL DEFAULT 0,
  c13_cloud_shadows        TINYINT(1) NOT NULL DEFAULT 0,
  c14_wakes                TINYINT(1) NOT NULL DEFAULT 0,
  c15_mixed_water          TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_marida_patch_scene (scene_id),
  KEY ix_marida_patch_split (split),
  CONSTRAINT fk_marida_patch_scene FOREIGN KEY (scene_id) REFERENCES marida_scenes (scene_id)
) ENGINE=InnoDB COMMENT='MARIDA: 256x256 px (10 m) patches, official split, footprint and the 15-class presence flags';

CREATE TABLE marida_patch_class_pixels (
  patch_id  VARCHAR(32) NOT NULL,
  class_id  TINYINT     NOT NULL,
  pixels    INT         NOT NULL,
  PRIMARY KEY (patch_id, class_id),
  KEY ix_marida_pcp_class (class_id),
  CONSTRAINT fk_marida_pcp_patch FOREIGN KEY (patch_id) REFERENCES marida_patches (patch_id),
  CONSTRAINT fk_marida_pcp_class FOREIGN KEY (class_id) REFERENCES marida_classes (class_id)
) ENGINE=InnoDB COMMENT='MARIDA: labelled pixel count per class per patch (counted from the _cl.tif masks)';

CREATE TABLE marida_annotations (
  annotation_id  INT AUTO_INCREMENT PRIMARY KEY,
  scene_id       VARCHAR(24) NOT NULL,
  shape_id       INT         NULL COMMENT 'id field in the source shapefile',
  confidence     INT         NULL COMMENT 'conf field as-is from the source shapefile',
  report         INT         NULL COMMENT 'report field as-is from the source shapefile',
  area_m2        DOUBLE      NULL COMMENT 'planar area in UTM metres squared',
  n_vertices     INT         NULL,
  center_lon     DOUBLE      NULL,
  center_lat     DOUBLE      NULL,
  is_valid       TINYINT(1)  NULL COMMENT 'ST_IsValid(geom): 0 = self-intersecting ring in the source shapefile (kept as-is)',
  geom           GEOMETRY SRID 4326 NULL COMMENT 'annotated polygon, lon/lat',
  KEY ix_marida_ann_scene (scene_id),
  CONSTRAINT fk_marida_ann_scene FOREIGN KEY (scene_id) REFERENCES marida_scenes (scene_id)
) ENGINE=InnoDB COMMENT='MARIDA: hand-drawn annotation polygons (from the 63 per-scene shapefiles), reprojected UTM to lon/lat';

-- -------------------------------------------------------------------- MADOS --
CREATE TABLE mados_scenes (
  scene_id       VARCHAR(16) NOT NULL PRIMARY KEY COMMENT 'e.g. Scene_0',
  scene_number   INT         NOT NULL,
  n_crops        SMALLINT    NOT NULL,
  center_lon     DOUBLE      NULL,
  center_lat     DOUBLE      NULL,
  min_lon        DOUBLE      NULL,
  max_lon        DOUBLE      NULL,
  min_lat        DOUBLE      NULL,
  max_lat        DOUBLE      NULL
) ENGINE=InnoDB COMMENT='MADOS: one Sentinel-2 scene (174 scenes). Footprint columns are NULL because the MADOS GeoTIFFs carry no georeferencing';

CREATE TABLE mados_crops (
  crop_id          VARCHAR(20) NOT NULL PRIMARY KEY COMMENT 'e.g. Scene_0_1 (as in the official split files)',
  scene_id         VARCHAR(16) NOT NULL,
  crop_index       SMALLINT    NOT NULL,
  split            ENUM('train','val','test') NULL COMMENT 'official MADOS split (NULL = not in any split file)',
  width_px         SMALLINT    NULL,
  height_px        SMALLINT    NULL,
  center_lon       DOUBLE      NULL,
  center_lat       DOUBLE      NULL,
  min_lon          DOUBLE      NULL,
  max_lon          DOUBLE      NULL,
  min_lat          DOUBLE      NULL,
  max_lat          DOUBLE      NULL,
  labelled_pixels  INT         NOT NULL DEFAULT 0,
  n_classes        TINYINT     NOT NULL DEFAULT 0,
  KEY ix_mados_crop_scene (scene_id),
  KEY ix_mados_crop_split (split),
  CONSTRAINT fk_mados_crop_scene FOREIGN KEY (scene_id) REFERENCES mados_scenes (scene_id)
) ENGINE=InnoDB COMMENT='MADOS: 240x240 px crops of a scene with the official split. Footprint columns are NULL because the MADOS GeoTIFFs carry no georeferencing';

CREATE TABLE mados_crop_class_pixels (
  crop_id   VARCHAR(20) NOT NULL,
  class_id  TINYINT     NOT NULL,
  pixels    INT         NOT NULL,
  PRIMARY KEY (crop_id, class_id),
  KEY ix_mados_ccp_class (class_id),
  CONSTRAINT fk_mados_ccp_crop  FOREIGN KEY (crop_id)  REFERENCES mados_crops (crop_id),
  CONSTRAINT fk_mados_ccp_class FOREIGN KEY (class_id) REFERENCES mados_classes (class_id)
) ENGINE=InnoDB COMMENT='MADOS: labelled pixel count per class per crop (counted from the L2R_cl masks)';

-- ---------------------------------------------------------------------- PLP --
CREATE TABLE plp_target_observations (
  observation_id    INT AUTO_INCREMENT PRIMARY KEY,
  campaign_year     SMALLINT     NOT NULL,
  target_id         INT          NOT NULL COMMENT 'physical target number within the campaign (the same target repeats on every date)',
  observation_date  DATE         NULL COMMENT 'Sentinel-2 acquisition date the target was on the water and imaged',
  material          VARCHAR(24)  NULL,
  notes             VARCHAR(255) NULL,
  radius_m          DOUBLE       NULL,
  width_m           DOUBLE       NULL,
  height_m          DOUBLE       NULL,
  lon               DOUBLE       NOT NULL,
  lat               DOUBLE       NOT NULL,
  maps_to_class     TINYINT      NULL COMMENT 'plastic materials map to Plastic (0), others (wood control) are excluded',
  KEY ix_plp_obs_target (campaign_year, target_id),
  CONSTRAINT fk_plp_obs_class FOREIGN KEY (maps_to_class) REFERENCES unified_classes (class_id)
) ENGINE=InnoDB COMMENT='Plastic Litter Project: one row per artificial target per satellite date it was observed (Aegean Sea)';

CREATE TABLE plp_imagery (
  imagery_id        INT AUTO_INCREMENT PRIMARY KEY,
  campaign_year     SMALLINT     NOT NULL,
  sensor            VARCHAR(20)  NOT NULL,
  product_id        VARCHAR(80)  NOT NULL,
  acquired_on       DATE         NULL,
  tile              VARCHAR(12)  NULL,
  cloud_cover_pct   DOUBLE       NULL COMMENT 'PlanetScope metadata only',
  clear_pct         DOUBLE       NULL COMMENT 'PlanetScope metadata only',
  gsd_m             DOUBLE       NULL COMMENT 'PlanetScope metadata only',
  sun_elevation     DOUBLE       NULL COMMENT 'PlanetScope metadata only',
  file_name         VARCHAR(160) NULL,
  file_size_mb      DOUBLE       NULL,
  KEY ix_plp_img_year_sensor (campaign_year, sensor)
) ENGINE=InnoDB COMMENT='Plastic Litter Project: catalogue of the Sentinel-2 and PlanetScope images collected for each campaign';

-- ---------------------------------------------------------------------- RFO --
CREATE TABLE rfo_sites (
  site_id                VARCHAR(32) NOT NULL PRIMARY KEY COMMENT 'e.g. accra_20181031',
  site_name              VARCHAR(32) NOT NULL,
  scene_date             DATE        NULL,
  split                  ENUM('train','test') NOT NULL COMMENT 'scene-disjoint split used by python_engine/ml/datasets/rfo.py',
  n_points               INT         NOT NULL DEFAULT 0,
  n_debris               INT         NOT NULL DEFAULT 0,
  n_water                INT         NOT NULL DEFAULT 0,
  n_qualitative_polygons INT         NOT NULL DEFAULT 0,
  n_qualitative_bboxes   INT         NOT NULL DEFAULT 0,
  scene_tif_gb           DECIMAL(6,2) NULL,
  min_lon                DOUBLE      NULL,
  max_lon                DOUBLE      NULL,
  min_lat                DOUBLE      NULL,
  max_lat                DOUBLE      NULL
) ENGINE=InnoDB COMMENT='RefinedFloatingObjects: 6 full Sentinel-2 scenes with hand-refined point labels';

CREATE TABLE rfo_points (
  point_id      INT AUTO_INCREMENT PRIMARY KEY,
  site_id       VARCHAR(32) NOT NULL,
  source_layer  VARCHAR(24) NOT NULL COMMENT 'points or qualitative_point',
  label_type    TINYINT     NULL COMMENT 'shapefile type field: 1 = debris, 0 = water / other',
  label_name    VARCHAR(16) NULL,
  class_id      TINYINT     NULL COMMENT 'unified class used for training: 1 -> Plastic (0), 0 -> Water (3)',
  lon           DOUBLE      NOT NULL,
  lat           DOUBLE      NOT NULL,
  KEY ix_rfo_pt_site (site_id),
  CONSTRAINT fk_rfo_pt_site  FOREIGN KEY (site_id)  REFERENCES rfo_sites (site_id),
  CONSTRAINT fk_rfo_pt_class FOREIGN KEY (class_id) REFERENCES unified_classes (class_id)
) ENGINE=InnoDB COMMENT='RefinedFloatingObjects: every labelled point (debris vs water/other)';

CREATE TABLE rfo_polygons (
  polygon_id    INT AUTO_INCREMENT PRIMARY KEY,
  site_id       VARCHAR(32) NOT NULL,
  source_layer  VARCHAR(32) NOT NULL COMMENT 'qualitative_poly or qualitative_bbox',
  attr_type     INT         NULL,
  attr_area     DOUBLE      NULL,
  n_vertices    INT         NULL,
  center_lon    DOUBLE      NULL,
  center_lat    DOUBLE      NULL,
  geom          GEOMETRY SRID 4326 NULL,
  KEY ix_rfo_poly_site (site_id),
  CONSTRAINT fk_rfo_poly_site FOREIGN KEY (site_id) REFERENCES rfo_sites (site_id)
) ENGINE=InnoDB COMMENT='RefinedFloatingObjects: qualitative debris polygons and bounding boxes';

-- ---------------------------------------------------------------- reference --
CREATE TABLE countries (
  country_id    INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  iso3          VARCHAR(8)   NULL,
  iso2          VARCHAR(8)   NULL,
  center_lon    DOUBLE       NULL,
  center_lat    DOUBLE       NULL,
  min_lon       DOUBLE       NULL,
  max_lon       DOUBLE       NULL,
  min_lat       DOUBLE       NULL,
  max_lat       DOUBLE       NULL,
  n_vertices    INT          NULL,
  geom          GEOMETRY SRID 4326 NULL
) ENGINE=InnoDB COMMENT='Country / coastline polygons (data/coastline/countries.geojson)';

-- ------------------------------------------------------------ model results --
CREATE TABLE model_runs (
  run_key            VARCHAR(24)  NOT NULL PRIMARY KEY COMMENT 'per_pixel = the shipped model',
  model_file         VARCHAR(160) NULL,
  arch               VARCHAR(400) NULL,
  role               VARCHAR(255) NULL,
  input_desc         VARCHAR(255) NULL,
  train_samples      INT          NULL,
  test_accuracy      DOUBLE       NULL,
  macro_f1           DOUBLE       NULL,
  balanced_macro_f1  DOUBLE       NULL,
  onnx_agreement     DOUBLE       NULL,
  device             VARCHAR(80)  NULL,
  dataset_desc       VARCHAR(400) NULL,
  note               TEXT         NULL,
  updated_at         VARCHAR(40)  NULL
) ENGINE=InnoDB COMMENT='Held-out results for each model variant (python_engine/models/metrics.json)';

CREATE TABLE model_class_metrics (
  run_key          VARCHAR(24) NOT NULL,
  class_name       VARCHAR(20) NOT NULL,
  precision_score  DOUBLE      NULL,
  recall_score     DOUBLE      NULL,
  f1_score         DOUBLE      NULL,
  PRIMARY KEY (run_key, class_name),
  CONSTRAINT fk_mcm_run FOREIGN KEY (run_key) REFERENCES model_runs (run_key)
) ENGINE=InnoDB COMMENT='Per-class precision / recall / F1 on the held-out test set';

CREATE TABLE model_confusion (
  run_key          VARCHAR(24) NOT NULL,
  actual_class     VARCHAR(20) NOT NULL,
  predicted_class  VARCHAR(20) NOT NULL,
  n                INT         NOT NULL,
  PRIMARY KEY (run_key, actual_class, predicted_class),
  CONSTRAINT fk_mcf_run FOREIGN KEY (run_key) REFERENCES model_runs (run_key)
) ENGINE=InnoDB COMMENT='Confusion matrix in long form (rows = actual, columns = predicted)';

CREATE TABLE model_dataset_metrics (
  run_key        VARCHAR(24) NOT NULL,
  dataset_id     VARCHAR(16) NOT NULL,
  test_accuracy  DOUBLE      NULL,
  macro_f1       DOUBLE      NULL,
  samples        INT         NULL,
  PRIMARY KEY (run_key, dataset_id),
  CONSTRAINT fk_mdm_run FOREIGN KEY (run_key)   REFERENCES model_runs (run_key),
  CONSTRAINT fk_mdm_ds  FOREIGN KEY (dataset_id) REFERENCES datasets (dataset_id)
) ENGINE=InnoDB COMMENT='Held-out accuracy / macro-F1 broken down by source dataset';

CREATE TABLE json_documents (
  doc_name     VARCHAR(80)  NOT NULL PRIMARY KEY,
  source_file  VARCHAR(160) NOT NULL,
  payload      JSON         NOT NULL,
  loaded_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB COMMENT='Verbatim copy of the model / validation summary JSON files (nothing left behind)';
