-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "characterId" INTEGER NOT NULL,
    "characterName" TEXT NOT NULL,
    "corporationId" INTEGER,
    "allianceId" INTEGER,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" DATETIME,
    "scopes" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "creditScore" INTEGER NOT NULL DEFAULT 500,
    "trustTier" TEXT NOT NULL DEFAULT 'BASIC',
    "totalLoans" INTEGER NOT NULL DEFAULT 0,
    "totalRepaid" INTEGER NOT NULL DEFAULT 0,
    "totalDefaulted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Loan" (
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
    "collateralPlexQty" INTEGER NOT NULL,
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

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'REGULAR',
    "esiTransactionId" TEXT,
    "journalRefId" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanInsurance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "premiumAmount" REAL NOT NULL,
    "coveragePercent" REAL NOT NULL,
    "claimable" BOOLEAN NOT NULL DEFAULT true,
    "claimedAt" DATETIME,
    "claimAmount" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoanInsurance_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT,
    "characterId" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlexPriceCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "region" TEXT NOT NULL DEFAULT '10000002',
    "source" TEXT NOT NULL DEFAULT 'ESI',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BankConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" INTEGER NOT NULL,
    "characterName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" DATETIME NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Character_userId_key" ON "Character"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_characterId_key" ON "Character"("characterId");

-- CreateIndex
CREATE INDEX "Loan_characterId_idx" ON "Loan"("characterId");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE INDEX "Loan_dueDate_idx" ON "Loan"("dueDate");

-- CreateIndex
CREATE INDEX "Payment_loanId_idx" ON "Payment"("loanId");

-- CreateIndex
CREATE INDEX "Payment_characterId_idx" ON "Payment"("characterId");

-- CreateIndex
CREATE INDEX "Payment_esiTransactionId_idx" ON "Payment"("esiTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInsurance_loanId_key" ON "LoanInsurance"("loanId");

-- CreateIndex
CREATE INDEX "AuditLog_loanId_idx" ON "AuditLog"("loanId");

-- CreateIndex
CREATE INDEX "AuditLog_characterId_idx" ON "AuditLog"("characterId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PlexPriceCache_fetchedAt_idx" ON "PlexPriceCache"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankConfig_key_key" ON "BankConfig"("key");

-- CreateIndex
CREATE INDEX "BankConfig_key_idx" ON "BankConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "BankToken_characterId_key" ON "BankToken"("characterId");
