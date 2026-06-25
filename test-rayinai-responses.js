const key = String(process.env.RAYINAI_API_KEY || "").trim().replace(/^Bearer\s+/i, "");
const baseUrl = String(process.env.RAYINAI_BASE_URL || "https://code.rayinai.com").trim().replace(/\/+$/, "");
const model = String(process.env.RAYINAI_RESPONSES_MODEL || "gpt-image-2").trim();
const prompt = String(process.env.RAYINAI_PROMPT || "hi");
const endpointType = String(process.env.RAYINAI_ENDPOINT || "responses").trim().toLowerCase();
const imageUrls = String(process.env.RAYINAI_IMAGE_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!key) {
  console.error("Missing RAYINAI_API_KEY. Example:");
  console.error("$env:RAYINAI_API_KEY='sk-xxxx'; node scripts/test-rayinai-responses.js");
  process.exit(1);
}

const content = [
  { type: "input_text", text: prompt },
  ...imageUrls.map((imageUrl) => ({ type: "input_image", image_url: imageUrl })),
];

const body = endpointType === "images"
  ? {
      model,
      prompt,
      n: 1,
      image_urls: imageUrls,
    }
  : {
      model,
      input: [{ type: "message", role: "user", content }],
    };

async function main() {
  const endpoint = endpointType === "images" ? `${baseUrl}/v1/images/generations` : `${baseUrl}/v1/responses`;
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "*/*",
      Host: new URL(baseUrl).host,
      Connection: "keep-alive",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  console.log(JSON.stringify({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    endpoint,
    endpointType,
    model,
    contentTypes: content.map((item) => item.type),
    elapsedMs: Date.now() - started,
    payload,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
