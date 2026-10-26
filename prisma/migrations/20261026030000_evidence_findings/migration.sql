-- CreateEnum
CREATE TYPE "FindingOutcome" AS ENUM ('Present', 'Absent', 'Unknown', 'Conflicting');

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "redactions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "outcome" "FindingOutcome" NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEvidence" (
    "findingId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,

    CONSTRAINT "FindingEvidence_pkey" PRIMARY KEY ("findingId","evidenceId")
);

-- CreateIndex
CREATE INDEX "Evidence_requestId_idx" ON "Evidence"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_requestId_source_sourceId_sourceVersion_contentHas_key" ON "Evidence"("requestId", "source", "sourceId", "sourceVersion", "contentHash");

-- CreateIndex
CREATE INDEX "Finding_requestId_idx" ON "Finding"("requestId");

-- CreateIndex
CREATE INDEX "FindingEvidence_evidenceId_idx" ON "FindingEvidence"("evidenceId");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Append-only: these tables can be inserted into but never changed or emptied.
CREATE FUNCTION "append_only_guard"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% is not allowed)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Evidence_append_only" BEFORE UPDATE OR DELETE ON "Evidence"
FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();
CREATE TRIGGER "Evidence_no_truncate" BEFORE TRUNCATE ON "Evidence"
FOR EACH STATEMENT EXECUTE FUNCTION "append_only_guard"();

CREATE TRIGGER "Finding_append_only" BEFORE UPDATE OR DELETE ON "Finding"
FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();
CREATE TRIGGER "Finding_no_truncate" BEFORE TRUNCATE ON "Finding"
FOR EACH STATEMENT EXECUTE FUNCTION "append_only_guard"();

CREATE TRIGGER "FindingEvidence_append_only" BEFORE UPDATE OR DELETE ON "FindingEvidence"
FOR EACH ROW EXECUTE FUNCTION "append_only_guard"();
CREATE TRIGGER "FindingEvidence_no_truncate" BEFORE TRUNCATE ON "FindingEvidence"
FOR EACH STATEMENT EXECUTE FUNCTION "append_only_guard"();
