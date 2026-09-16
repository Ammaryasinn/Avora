ALTER TABLE "AIJob" ALTER COLUMN "creativeId" DROP NOT NULL;
ALTER TABLE "AIJob" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "Message" ADD COLUMN "sourceAIJobId" TEXT;

CREATE INDEX "AIJob_organizationId_conversationId_createdAt_idx"
ON "AIJob"("organizationId", "conversationId", "createdAt");

CREATE UNIQUE INDEX "Message_sourceAIJobId_key" ON "Message"("sourceAIJobId");

ALTER TABLE "AIJob"
ADD CONSTRAINT "AIJob_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_sourceAIJobId_fkey"
FOREIGN KEY ("sourceAIJobId") REFERENCES "AIJob"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
