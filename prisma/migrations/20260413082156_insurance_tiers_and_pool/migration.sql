-- CreateTable
CREATE TABLE "InsurancePool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "premiumsCollected" REAL NOT NULL DEFAULT 0,
    "claimsPaid" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LoanInsurance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "coverageTier" TEXT NOT NULL DEFAULT 'STANDARD',
    "premiumAmount" REAL NOT NULL,
    "premiumRate" REAL NOT NULL DEFAULT 0.02,
    "coveragePercent" REAL NOT NULL,
    "claimStatus" TEXT NOT NULL DEFAULT 'NONE',
    "claimRequestedAt" DATETIME,
    "claimedAt" DATETIME,
    "claimAmount" REAL,
    "claimDenialReason" TEXT,
    "claimable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanInsurance_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LoanInsurance" ("claimAmount", "claimable", "claimedAt", "coveragePercent", "createdAt", "id", "loanId", "premiumAmount") SELECT "claimAmount", "claimable", "claimedAt", "coveragePercent", "createdAt", "id", "loanId", "premiumAmount" FROM "LoanInsurance";
DROP TABLE "LoanInsurance";
ALTER TABLE "new_LoanInsurance" RENAME TO "LoanInsurance";
CREATE UNIQUE INDEX "LoanInsurance_loanId_key" ON "LoanInsurance"("loanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
