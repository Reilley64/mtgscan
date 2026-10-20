CREATE TYPE "public"."import_run_status" AS ENUM (
  'running',
  'succeeded',
  'failed',
  'skipped',
  'expired'
);
