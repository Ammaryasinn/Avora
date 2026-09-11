const appUrl = process.env.APP_URL?.replace(/\/$/, "");
const secret = process.env.AI_WORKER_SECRET;

if (!appUrl || !secret) {
  throw new Error("APP_URL and AI_WORKER_SECRET are required to run the AI worker.");
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

while (true) {
  try {
    const response = await fetch(`${appUrl}/api/internal/ai/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });

    if (!response.ok) {
      throw new Error(`Worker endpoint returned ${response.status}.`);
    }

    const result = await response.json();
    await delay(result.processed ? 1_000 : 5_000);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "AI worker request failed.");
    await delay(10_000);
  }
}
