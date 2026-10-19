const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const AI_TIMEOUT_MS = Number(
  process.env.AI_TIMEOUT_MS || 5000
);

async function requestAi(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    AI_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${AI_SERVICE_URL}${path}`,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        signal: controller.signal,
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data.detail ||
        data.message ||
        `AI service returned ${response.status}`;
      throw new Error(message);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI recommendation service timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAiHealth() {
  return requestAi("/health");
}

export async function recommendFromHistory({
  interactedItems,
  interests = [],
  topK = 50,
}) {
  return requestAi("/recommend/history", {
    method: "POST",
    body: JSON.stringify({
      interacted_items: interactedItems.map((item) => ({
        item_id: Number(item.itemId),
        weight: Number(item.weight),
      })),
      interests,
      top_k: Math.min(Math.max(Number(topK) || 50, 1), 100),
    }),
  });
}

export async function getSimilarAiItems(
  itemId,
  topK = 50
) {
  return requestAi(
    `/similar/${Number(itemId)}?top_k=${Math.min(
      Math.max(Number(topK) || 50, 1),
      100
    )}`
  );
}
