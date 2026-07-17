-- ═══════════════════════════════════════════════════════════════
-- Marine Plastic Tracker
-- PostgreSQL + PostGIS initialisation script
-- Run once on first container start via docker-entrypoint-initdb.d
-- Full Prisma migrations with all tables are added in Phase 1.
-- ═══════════════════════════════════════════════════════════════

-- Enable PostGIS (spatial queries for detection coordinates, hotspot geometry)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Enable pgcrypto (UUID generation, bcrypt in SQL functions)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable unaccent (search normalisation for user names / place names)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Confirm ──────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'PostGIS version: %', PostGIS_Version();
  RAISE NOTICE 'Extensions loaded: postgis, postgis_topology, pgcrypto, unaccent';
  RAISE NOTICE 'Database % is ready for Prisma migrations.', current_database();
END;
$$;
