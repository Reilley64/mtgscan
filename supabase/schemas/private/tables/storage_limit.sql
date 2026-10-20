CREATE TABLE "private"."storage_limit" (
  "only_row" boolean NOT NULL DEFAULT true,
  "bytes"    bigint  NOT NULL,
  CONSTRAINT "storage_limit_bytes_check" CHECK ((bytes > 0)),
  CONSTRAINT "storage_limit_only_row_check" CHECK (only_row),
  CONSTRAINT "storage_limit_pkey" PRIMARY KEY (only_row)
);
