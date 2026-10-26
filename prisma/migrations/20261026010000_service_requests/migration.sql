-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('Requested', 'Collecting', 'NeedsReview', 'ProposalReady', 'AwaitingApproval', 'Approved', 'Testing', 'Verified', 'Failed', 'Rejected', 'Cancelled');

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'Requested',
    "requesterId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestTransition" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "ServiceRequestStatus",
    "toStatus" "ServiceRequestStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "ServiceRequest_requesterId_idx" ON "ServiceRequest"("requesterId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_requesterId_idempotencyKey_key" ON "ServiceRequest"("requesterId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ServiceRequestTransition_requestId_seq_idx" ON "ServiceRequestTransition"("requestId", "seq");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestTransition" ADD CONSTRAINT "ServiceRequestTransition_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Append-only history: the table can be inserted into but never changed or emptied row by row.
CREATE FUNCTION "service_request_transition_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ServiceRequestTransition is append-only (% is not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ServiceRequestTransition_append_only"
BEFORE UPDATE OR DELETE ON "ServiceRequestTransition"
FOR EACH ROW EXECUTE FUNCTION "service_request_transition_append_only"();

CREATE TRIGGER "ServiceRequestTransition_no_truncate"
BEFORE TRUNCATE ON "ServiceRequestTransition"
FOR EACH STATEMENT EXECUTE FUNCTION "service_request_transition_append_only"();
