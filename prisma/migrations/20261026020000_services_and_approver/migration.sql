-- NOTE: ServiceRequest had no API before this migration, so no real rows exist. The NOT NULL column
-- below fails on a database that holds leftover rows (for example from `npm run test:db`);
-- recreate such a throwaway database instead of editing this file.

-- CreateEnum
CREATE TYPE "WorkloadKind" AS ENUM ('Deployment', 'StatefulSet');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'approver';

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "serviceId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clusterId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "workloadKind" "WorkloadKind" NOT NULL,
    "workloadName" TEXT NOT NULL,
    "gitProvider" TEXT NOT NULL DEFAULT 'github',
    "gitRepository" TEXT NOT NULL,
    "gitBaseBranch" TEXT NOT NULL DEFAULT 'main',
    "configPaths" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE INDEX "Service_clusterId_idx" ON "Service"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_clusterId_namespace_workloadKind_workloadName_key" ON "Service"("clusterId", "namespace", "workloadKind", "workloadName");

-- CreateIndex
CREATE INDEX "ServiceRequest_serviceId_idx" ON "ServiceRequest"("serviceId");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

