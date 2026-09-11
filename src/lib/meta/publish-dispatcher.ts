import "server-only";

import { getDatabase } from "@/lib/db/database";

export interface MetaPublishJobDispatcher {
  enqueue(jobId: string, organizationId: string): Promise<void>;
}

class PostgresMetaPublishJobDispatcher implements MetaPublishJobDispatcher {
  async enqueue(jobId: string, organizationId: string) {
    const result = await getDatabase().metaPublishJob.updateMany({
      where: { id: jobId, organizationId, status: "PENDING" },
      data: { status: "QUEUED", availableAt: new Date() },
    });
    if (result.count !== 1) throw new Error("The Meta publish job could not be queued.");
  }
}

const dispatcher = new PostgresMetaPublishJobDispatcher();

export function getMetaPublishJobDispatcher(): MetaPublishJobDispatcher {
  return dispatcher;
}
