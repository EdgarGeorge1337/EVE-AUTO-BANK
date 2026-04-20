-- CreateTable
CREATE TABLE "CollateralItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitValue" REAL NOT NULL,
    "totalValue" REAL NOT NULL,
    CONSTRAINT "CollateralItem_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "principalAmount" REAL NOT NULL,
    "interestRate" REAL NOT NULL,
    "termDays" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "finalPaymentDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvalReason" TEXT,
    "autoApprovalEligible" BOOLEAN NOT NULL DEFAULT false,
    "collateralType" TEXT NOT NULL DEFAULT 'PLEX',
    "collateralPlexQty" INTEGER NOT NULL DEFAULT 0,
    "collateralPlexValue" REAL NOT NULL,
    "collateralContractId" TEXT,
    "returnContractId" TEXT,
    "ltvRatio" REAL NOT NULL,
    "hasInsurance" BOOLEAN NOT NULL DEFAULT false,
    "amountRepaid" REAL NOT NULL DEFAULT 0,
    "nextPaymentDue" DATETIME,
    "overdueAt" DATETIME,
    "defaultedAt" DATETIME,
    "collateralLiquidatedAt" DATETIME,
    "collateralLiquidatedValue" REAL,
    "cancelledAt" DATETIME,
    "completedAt" DATETIME,
    "iskSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Loan" ("amountRepaid", "approvalReason", "autoApprovalEligible", "cancelledAt", "characterId", "collateralContractId", "collateralLiquidatedAt", "collateralLiquidatedValue", "collateralPlexQty", "collateralPlexValue", "completedAt", "createdAt", "defaultedAt", "dueDate", "finalPaymentDate", "hasInsurance", "id", "interestRate", "iskSentAt", "ltvRatio", "nextPaymentDue", "overdueAt", "principalAmount", "returnContractId", "status", "termDays", "updatedAt") SELECT "amountRepaid", "approvalReason", "autoApprovalEligible", "cancelledAt", "characterId", "collateralContractId", "collateralLiquidatedAt", "collateralLiquidatedValue", "collateralPlexQty", "collateralPlexValue", "completedAt", "createdAt", "defaultedAt", "dueDate", "finalPaymentDate", "hasInsurance", "id", "interestRate", "iskSentAt", "ltvRatio", "nextPaymentDue", "overdueAt", "principalAmount", "returnContractId", "status", "termDays", "updatedAt" FROM "Loan";
DROP TABLE "Loan";
ALTER TABLE "new_Loan" RENAME TO "Loan";
CREATE INDEX "Loan_characterId_idx" ON "Loan"("characterId");
CREATE INDEX "Loan_status_idx" ON "Loan"("status");
CREATE INDEX "Loan_dueDate_idx" ON "Loan"("dueDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CollateralItem_loanId_idx" ON "CollateralItem"("loanId");
