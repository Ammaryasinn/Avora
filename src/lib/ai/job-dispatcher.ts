import "server-only";

import { getDatabase } from "@/lib/db/database";

export interface AIJobDispatcher {
  enqueue(jobId: string, organizationId: string): Promise<void>;
}

class PostgresAIJobDispatcher implements AIJobDispatcher {
  async enqueue(jobId: string, organizationId: string) {
    const result = await getDatabase().aIJob.updateMany({
      where: {
        id: jobId,
        organizationId,
        status: "PENDING",
      },
      data: {
        status: "QUEUED",
        queuedAt: new Date(),
        availableAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new Error("The AI job could not be queued.");
    }
  }
}

const dispatcher = new PostgresAIJobDispatcher();

export function getAIJobDispatcher(): AIJobDispatcher {
  return dispatcher;
}
