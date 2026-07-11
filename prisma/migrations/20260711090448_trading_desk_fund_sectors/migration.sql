-- CreateTable
CREATE TABLE "TradeOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" REAL NOT NULL,
    "totalValue" REAL NOT NULL,
    "marketPrice" REAL NOT NULL,
    "spreadPct" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" DATETIME NOT NULL,
    "transferReceivedAt" DATETIME,
    "fulfilledAt" DATETIME,
    "cancelledAt" DATETIME,
    "contractId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeOrder_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexFund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "managementFeePct" REAL NOT NULL DEFAULT 0.0,
    "entryFeePct" REAL NOT NULL DEFAULT 0.01,
    "unitsOutstanding" REAL NOT NULL DEFAULT 0,
    "cashBalance" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FundHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "typeName" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "qty" REAL NOT NULL,
    "avgCost" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundHolding_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "IndexFund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "units" REAL NOT NULL DEFAULT 0,
    "iskInvested" REAL NOT NULL DEFAULT 0,
    "iskRedeemed" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundPosition_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "IndexFund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FundPosition_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "iskAmount" REAL NOT NULL,
    "units" REAL,
    "navPerUnit" REAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" DATETIME NOT NULL,
    "transferReceivedAt" DATETIME,
    "processedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FundTransaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "IndexFund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FundTransaction_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FundNavSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fundId" TEXT NOT NULL,
    "nav" REAL NOT NULL,
    "navPerUnit" REAL NOT NULL,
    "holdingsValue" REAL NOT NULL,
    "cashBalance" REAL NOT NULL,
    "unitsOutstanding" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundNavSnapshot_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "IndexFund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectorReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "minedValue" REAL NOT NULL,
    "producedValue" REAL NOT NULL,
    "destroyedValue" REAL NOT NULL,
    "npcBounties" REAL NOT NULL,
    "loyaltyPoints" REAL NOT NULL,
    "tradeValue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "typeName" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "buyMax" REAL NOT NULL,
    "sellMin" REAL NOT NULL,
    "splitPrice" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TradeOrder_characterId_idx" ON "TradeOrder"("characterId");

-- CreateIndex
CREATE INDEX "TradeOrder_status_idx" ON "TradeOrder"("status");

-- CreateIndex
CREATE INDEX "TradeOrder_expiresAt_idx" ON "TradeOrder"("expiresAt");

-- CreateIndex
CREATE INDEX "FundHolding_fundId_idx" ON "FundHolding"("fundId");

-- CreateIndex
CREATE UNIQUE INDEX "FundHolding_fundId_typeId_key" ON "FundHolding"("fundId", "typeId");

-- CreateIndex
CREATE INDEX "FundPosition_characterId_idx" ON "FundPosition"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "FundPosition_fundId_characterId_key" ON "FundPosition"("fundId", "characterId");

-- CreateIndex
CREATE INDEX "FundTransaction_fundId_idx" ON "FundTransaction"("fundId");

-- CreateIndex
CREATE INDEX "FundTransaction_characterId_idx" ON "FundTransaction"("characterId");

-- CreateIndex
CREATE INDEX "FundTransaction_status_idx" ON "FundTransaction"("status");

-- CreateIndex
CREATE INDEX "FundNavSnapshot_fundId_createdAt_idx" ON "FundNavSnapshot"("fundId", "createdAt");

-- CreateIndex
CREATE INDEX "SectorReport_month_idx" ON "SectorReport"("month");

-- CreateIndex
CREATE UNIQUE INDEX "SectorReport_month_region_key" ON "SectorReport"("month", "region");

-- CreateIndex
CREATE INDEX "PriceSnapshot_typeId_createdAt_idx" ON "PriceSnapshot"("typeId", "createdAt");
