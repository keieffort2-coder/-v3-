const API_BASE = "https://api.apimart.ai/v1";

const RAYINAI_DEFAULT_BASE = "https://code.rayinai.com";

function getApiMartKey(channel) {
  const selected = String(channel || "b").toLowerCase();
  const key = selected === "a" ? process.env.APIMART_API_KEY || process.env.APIMART_TOKEN : process.env.APIMART_API_KEY_2 || process.env.APIMART_TOKEN_2;
  return sanitizeHeaderValue(key);
}

function getRayinAiKey() {
  return sanitizeHeaderValue(process.env.RAYINAI_API_KEY || process.env.RAYINCODE_API_KEY);
}

function getRayinAiKeyId() {
  const raw = sanitizeHeaderValue(process.env.RAYINAI_KEY_ID || process.env.RAYINCODE_KEY_ID || "8634");
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 8634;
}

function getRayinAiBaseUrl() {
  const raw = sanitizeHeaderValue(process.env.RAYINAI_BASE_URL || process.env.RAYINCODE_BASE_URL || RAYINAI_DEFAULT_BASE);
  const withoutName = raw.replace(/^RAYIN(?:AI|CODE)_BASE_URL\s*=\s*/i, "");
  return withoutName
    .replace(/\/v1\/responses\/?$/i, "")
    .replace(/\/responses\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

function sanitizeHeaderValue(value) {
  return String(value || "").trim().replace(/[^\x20-\x7E]/g, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const taskId = req.query?.taskId;
    if (!taskId) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const provider = normalizeProvider(req.query?.provider);
    const apiKey = provider === "rayinai" ? getRayinAiKey() : getApiMartKey(req.query?.apimartChannel);
    if (!apiKey) {
      res.status(500).json({
        error: provider === "rayinai" ? "RAYINAI_API_KEY is not configured" : "APIMART_API_KEY_2 is not configured",
        message: provider === "rayinai"
          ? "Please configure RAYINAI_API_KEY in Vercel Environment Variables."
          : "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
      });
      return;
    }

    try {
      const taskPayload = provider === "rayinai"
        ? await getRayinTask(apiKey, String(taskId))
        : await getTask(apiKey, String(taskId));
      const status = getTaskStatus(taskPayload);
      const imageUrl = await persistResultImage(extractResultUrl(taskPayload), taskId);
      res.status(200).json({
        taskId,
        status,
        imageUrl,
        provider,
        message: formatUpstreamError(taskPayload),
        payload: imageUrl ? undefined : taskPayload,
      });
    } catch (error) {
      res.status(500).json({
        error: "Task polling failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const {
    prompt,
    quality,
    imageDataUrl,
    imageDataUrls,
    structureImageUrls,
    styleImageUrls,
    editBaseImageUrls,
    apimartChannel,
    model,
    size,
    provider,
  } = req.body || {};
  const apiKey = getApiMartKey(apimartChannel);
  const rayinAiKey = getRayinAiKey();
  const preferredProvider = normalizeProvider(provider || process.env.IMAGE_PROVIDER || "apimart");
  if (!apiKey && preferredProvider !== "rayinai") {
    res.status(500).json({
      error: "APIMART_API_KEY_2 is not configured",
      message: "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
    });
    return;
  }

  if (!prompt || !String(prompt).trim()) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const submitBody = {
      model: normalizeModel(model),
      prompt: String(prompt),
      n: 1,
      output_format: "png",
    };

    const normalizedQuality = normalizeQuality(quality, submitBody.model);
    if (normalizedQuality) submitBody.quality = normalizedQuality;
    const normalizedSize = shouldSendSize(submitBody.model) ? normalizeSize(size, submitBody.model) : "";
    if (normalizedSize) submitBody.size = normalizedSize;
    const references = Array.isArray(imageDataUrls)
      ? imageDataUrls
      : [imageDataUrl];
    const imageUrls = references.filter(isImageReferenceValue);
    const structureUrls = Array.isArray(structureImageUrls) ? structureImageUrls.filter(isImageReferenceValue) : [];
    const styleUrls = Array.isArray(styleImageUrls) ? styleImageUrls.filter(isImageReferenceValue) : [];
    const editBaseUrls = Array.isArray(editBaseImageUrls) ? editBaseImageUrls.filter(isImageReferenceValue) : [];
    if (imageUrls.length) {
      submitBody.image_urls = imageUrls.slice(0, 16);
      submitBody.image_url = imageUrls[0];
      submitBody.images = imageUrls.slice(0, 16);
      submitBody.reference_images = imageUrls.slice(0, 16);
      submitBody.reference_image_urls = imageUrls.slice(0, 16);
      submitBody.input_image_urls = imageUrls.slice(0, 16);
    }
    if (structureUrls.length) {
      submitBody.structure_image_urls = structureUrls.slice(0, 4);
      submitBody.composition_image_urls = structureUrls.slice(0, 4);
      submitBody.layout_image_urls = structureUrls.slice(0, 4);
    }
    if (styleUrls.length) {
      submitBody.style_image_urls = styleUrls.slice(0, 4);
    }
    if (editBaseUrls.length) {
      submitBody.edit_image_urls = editBaseUrls.slice(0, 4);
      submitBody.base_image_urls = editBaseUrls.slice(0, 4);
    }

    if (shouldTryRayinAi(preferredProvider, submitBody.model, rayinAiKey)) {
      const rayinResult = await submitRayinImageTask(rayinAiKey, submitBody);
      if (rayinResult.ok) {
        const imageUrl = await persistResultImage(extractResultUrl(rayinResult.payload), `rayinai-${Date.now()}`);
        const taskId = extractTaskId(rayinResult.payload);
        res.status(imageUrl ? 200 : 202).json({
          taskId,
          status: imageUrl ? "completed" : "submitted",
          imageUrl,
          model: submitBody.model,
          provider: "rayinai",
          payload: imageUrl ? undefined : rayinResult.payload,
        });
        return;
      }

      if (!apiKey || preferredProvider === "rayinai") {
        res.status(rayinResult.status || 502).json({
          error: "RayinAI submit failed",
          message: formatUpstreamError(rayinResult.payload),
          upstream: rayinResult.payload,
          request: {
            model: submitBody.model,
            size: submitBody.size,
            quality: submitBody.quality,
            output_format: submitBody.output_format,
            referenceCount: imageUrls.length,
          },
        });
        return;
      }
    }

    if (!apiKey) {
      res.status(500).json({
        error: "APIMART_API_KEY_2 is not configured",
        message: "RayinAI did not return a usable image, and APIMART_API_KEY_2 is not configured for fallback.",
      });
      return;
    }

    const submit = await fetch(`${API_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submitBody),
    });

    const submitPayload = await readJson(submit);
    if (!submit.ok) {
      res.status(submit.status).json({
        error: "APIMart submit failed",
        message: formatUpstreamError(submitPayload),
        upstream: submitPayload,
        request: {
          model: submitBody.model,
          size: submitBody.size,
          quality: submitBody.quality,
          output_format: submitBody.output_format,
          referenceCount: imageUrls.length,
        },
      });
      return;
    }

    const taskId = extractTaskId(submitPayload);
    if (!taskId) {
      res.status(502).json({
        error: "APIMart response did not include task_id",
        payload: submitPayload,
      });
      return;
    }

    res.status(202).json({
      taskId,
      status: "submitted",
      model: submitBody.model,
      provider: "apimart",
      apimartChannel: String(apimartChannel || "b").toLowerCase() === "a" ? "a" : "b",
    });
  } catch (error) {
    res.status(500).json({
      error: "Image generation failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (provider === "rayinai" || provider === "rayincode") return "rayinai";
  return "apimart";
}

function isImageReferenceValue(value) {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:image\//i.test(value));
}

function shouldTryRayinAi(provider, model, apiKey) {
  if (!apiKey) return false;
  return provider === "rayinai";
}

function formatUpstreamError(payload) {
  const message = findMessage(payload);
  if (/internal server error|server_error/i.test(message)) {
    return "上游图片生成服务内部错误，请稍后重试或切换通道。";
  }
  return message || "Image generation request failed.";
}

function findMessage(value, seen = new Set()) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  const direct = value.message || value.error || value.detail || value.code;
  const directMessage = findMessage(direct, seen);
  if (directMessage) return directMessage;
  for (const item of Object.values(value)) {
    const nested = findMessage(item, seen);
    if (nested) return nested;
  }
  return "";
}

function normalizeModel(model) {
  const value = String(model || "").trim();
  if (value === "gemini-3-pro-image-preview") return "gemini-3-pro-image-preview";
  if (value === "gpt-image-2" || value === "GPT Image 2" || value === "GPT图像2") return "gpt-image-2";
  return "gpt-image-2-official";
}

function normalizeRayinModel(model) {
  const value = normalizeModel(model);
  if (value === "gpt-image-2-official") return "gpt-image-2";
  return value;
}

function normalizeQuality(quality, model) {
  const value = String(quality || "").trim().toLowerCase();
  if (!value) return "";
  if (model === "gpt-image-2") {
    if (value === "low" || value === "standard" || value === "1k") return "1k";
    if (value === "medium" || value === "hd" || value === "2k") return "2k";
    if (value === "high" || value === "4k") return "4k";
    return value;
  }
  if (value === "medium") return "standard";
  if (["low", "standard", "hd", "high", "1k", "2k", "4k", "ultra"].includes(value)) return value;
  return "high";
}

function shouldSendSize(model) {
  return model !== "gemini-3-pro-image-preview";
}

function normalizeSize(size, model = "") {
  const value = String(size || "").trim().toLowerCase().replace("*", "x").replace("×", "x");
  if (!value) return "";
  const match = value.match(/^(\d{3,5})x(\d{3,5})$/);
  if (match) {
    const sourceWidth = Number(match[1]);
    const sourceHeight = Number(match[2]);
    const maxEdge = Math.max(sourceWidth, sourceHeight);
    const scale = maxEdge > 3840 ? 3840 / maxEdge : 1;
    const width = Math.min(3840, Math.max(16, Math.round((sourceWidth * scale) / 16) * 16));
    const height = Math.min(3840, Math.max(16, Math.round((sourceHeight * scale) / 16) * 16));
    return `${width}x${height}`;
  }
  if (["1024x1024", "1536x864", "864x1536", "auto"].includes(value)) return value;
  return "";
}

async function persistResultImage(imageUrl, taskId) {
  if (!imageUrl || typeof imageUrl !== "string") return imageUrl;
  if (/^https?:\/\/[^/]*\.public\.blob\.vercel-storage\.com\//i.test(imageUrl)) return imageUrl;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return imageUrl;

  try {
    const { put } = require("@vercel/blob");
    const { buffer, contentType } = await readImageBytes(imageUrl);
    const extension = contentTypeToExtension(contentType);
    const pathname = `aivideobox/generated/${Date.now()}-${String(taskId || "image").replace(/[^a-z0-9_-]/gi, "-")}.${extension}`;
    const blob = await put(pathname, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return blob.url;
  } catch (error) {
    console.error("Failed to persist generated image:", error);
    return imageUrl;
  }
}

async function readImageBytes(imageUrl) {
  if (/^data:image\//i.test(imageUrl)) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    return {
      contentType: match[1] || "image/png",
      buffer: Buffer.from(match[2], "base64"),
    };
  }

  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download generated image failed: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  return {
    contentType,
    buffer: Buffer.from(arrayBuffer),
  };
}

function contentTypeToExtension(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "png";
}

async function pollTask(apiKey, taskId) {
  const deadline = Date.now() + 270000;
  let lastPayload = null;

  while (Date.now() < deadline) {
    await sleep(5000);
    const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const payload = await readJson(response);
    if (!response.ok) throw new Error(JSON.stringify(payload));

    lastPayload = payload;
    const status = payload?.data?.status || payload?.status;
    const progress = payload?.data?.progress || payload?.progress;
    console.log(`APIMart task ${taskId}: status=${status || "unknown"} progress=${progress || "unknown"}`);
    if (["completed", "succeeded", "success"].includes(status)) return payload;
    if (["failed", "error", "cancelled"].includes(status)) {
      throw new Error(JSON.stringify(payload));
    }
  }

  throw new Error(`Timed out waiting for APIMart task ${taskId}: ${JSON.stringify(lastPayload)}`);
}

async function getTask(apiKey, taskId) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

async function getRayinTask(apiKey, taskId) {
  const baseUrl = getRayinAiBaseUrl();
  const endpoints = [
    `${baseUrl}/extension/api/image/tasks/${encodeURIComponent(taskId)}`,
    `${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`,
    `${baseUrl}/tasks/${encodeURIComponent(taskId)}`,
  ];
  let lastPayload = null;
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const payload = await readJson(response);
    if (response.ok) return payload;
    lastPayload = payload;
    if (![404, 405].includes(response.status)) break;
  }
  throw new Error(JSON.stringify(lastPayload || { error: "RayinAI task polling failed" }));
}

function buildRayinExtensionImageBody(body) {
  const references = Array.isArray(body.image_urls) ? body.image_urls.filter(isImageReferenceValue).slice(0, 4) : [];
  return {
    key_id: getRayinAiKeyId(),
    provider: "gpt",
    operation: references.length ? "edit" : "generate",
    model: normalizeRayinModel(body.model),
    prompt: body.prompt,
    input_images: references.map(toRayinExtensionInputImage),
    n: 1,
    aspect_ratio: "auto",
    base_resolution: "auto",
    moderation: "auto",
    output_format: body.output_format || "png",
    quality: "auto",
    size: "auto",
  };
}

function toRayinExtensionInputImage(value) {
  const item = { mime_type: "image/png" };
  if (/^data:image\//i.test(value)) {
    item.data_url = value;
  } else {
    item.image_url = value;
  }
  return item;
}

async function submitRayinImageTask(apiKey, submitBody) {
  const baseUrl = getRayinAiBaseUrl();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const imageBody = {
    ...submitBody,
    model: normalizeRayinModel(submitBody.model),
  };
  const rayinImageBody = normalizeRayinImageBody(imageBody);
  const hasReferences = Array.isArray(rayinImageBody.image_urls) && rayinImageBody.image_urls.length > 0;
  if (hasReferences) {
    const extensionResult = await submitRayinExtensionImageTask(apiKey, rayinImageBody);
    if (extensionResult.ok) return extensionResult;
  }
  const responsesBody = buildRayinResponsesBody(rayinImageBody);
  const attempts = hasReferences
    ? [
        { url: `${baseUrl}/v1/responses`, body: responsesBody },
        { url: `${baseUrl}/responses`, body: responsesBody },
        { url: `${baseUrl}/v1/images/edits`, body: rayinImageBody },
        { url: `${baseUrl}/images/edits`, body: rayinImageBody },
      ]
    : [
        { url: `${baseUrl}/v1/images/generations`, body: rayinImageBody },
        { url: `${baseUrl}/images/generations`, body: rayinImageBody },
        { url: `${baseUrl}/v1/responses`, body: responsesBody },
        { url: `${baseUrl}/responses`, body: responsesBody },
      ];
  let last = { ok: false, status: 0, payload: { error: "RayinAI request was not attempted" } };

  for (const attempt of attempts) {
    const response = await fetch(attempt.url, {
      method: "POST",
      headers,
      body: JSON.stringify(attempt.body),
    });
    const payload = await readJson(response);
    const imageUrl = extractResultUrl(payload);
    const taskId = extractTaskId(payload);
    if (response.ok && (imageUrl || taskId)) {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        payload.rayinEndpoint = attempt.url;
      }
      return { ok: true, status: response.status, payload };
    }
    last = { ok: false, status: response.status, payload };
    if (response.ok) return last;
    if (![404, 405, 502, 503, 504].includes(response.status)) return last;
  }

  if (last?.payload && typeof last.payload === "object" && !Array.isArray(last.payload)) {
    last.payload.endpoint = attempts[attempts.length - 1]?.url;
    last.payload.status = last.status;
  }
  return last;
}

async function submitRayinExtensionImageTask(apiKey, rayinImageBody) {
  const baseUrl = getRayinAiBaseUrl();
  const endpoint = `${baseUrl}/extension/api/image/tasks`;
  const body = buildRayinExtensionImageBody(rayinImageBody);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  const imageUrl = extractResultUrl(payload);
  const taskId = extractTaskId(payload);
  if (response.ok && (imageUrl || taskId)) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.rayinEndpoint = endpoint;
    }
    return { ok: true, status: response.status, payload };
  }
  return { ok: false, status: response.status, payload };
}

function normalizeRayinImageBody(body) {
  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.filter(isImageReferenceValue) : [];
  const structureUrls = Array.isArray(body.structure_image_urls) ? body.structure_image_urls.filter(isImageReferenceValue) : [];
  const styleUrls = Array.isArray(body.style_image_urls) ? body.style_image_urls.filter(isImageReferenceValue) : [];
  const editUrls = Array.isArray(body.edit_image_urls) ? body.edit_image_urls.filter(isImageReferenceValue) : [];
  const references = uniqueArray([...editUrls, ...structureUrls, ...styleUrls, ...imageUrls]).slice(0, 16);
  const next = {
    model: normalizeRayinModel(body.model),
    prompt: body.prompt,
    n: 1,
    provider: "gpt",
    aspect_ratio: "auto",
    base_resolution: "auto",
    moderation: "auto",
    output_format: body.output_format || "png",
  };
  if (body.quality) next.quality = body.quality;
  if (body.size) next.size = body.size;
  if (references.length) {
    const inputImages = references.map(toRayinInputImage);
    next.image_urls = references;
    next.image_url = references[0];
    next.images = inputImages;
    next.reference_images = inputImages;
    next.reference_image_urls = references;
    next.input_image_urls = references;
    next.operation = "edit";
    next.provider = "gpt";
    next.aspect_ratio = "auto";
    next.base_resolution = "auto";
    next.moderation = "auto";
    next.input_images = inputImages;
  }
  if (structureUrls.length) {
    next.structure_image_urls = structureUrls.slice(0, 4);
    next.structure_images = structureUrls.slice(0, 4).map(toRayinInputImage);
    next.composition_image_urls = structureUrls.slice(0, 4);
    next.composition_images = structureUrls.slice(0, 4).map(toRayinInputImage);
    next.layout_image_urls = structureUrls.slice(0, 4);
    next.layout_images = structureUrls.slice(0, 4).map(toRayinInputImage);
  }
  if (styleUrls.length) {
    next.style_image_urls = styleUrls.slice(0, 4);
    next.style_images = styleUrls.slice(0, 4).map(toRayinInputImage);
  }
  if (editUrls.length) {
    next.edit_image_urls = editUrls.slice(0, 4);
    next.edit_images = editUrls.slice(0, 4).map(toRayinInputImage);
    next.base_image_urls = editUrls.slice(0, 4);
    next.base_images = editUrls.slice(0, 4).map(toRayinInputImage);
  }
  return next;
}

function toRayinInputImage(value) {
  const item = { mime_type: "image/png" };
  item.image_url = value;
  if (/^data:image\//i.test(value)) {
    item.data_url = value;
    item.source_data_url = value;
    item.image_data_url = value;
  } else {
    item.url = value;
    item.image_url = value;
    item.source_url = value;
  }
  return item;
}

function uniqueArray(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildRayinResponsesBody(submitBody) {
  const imageUrls = Array.isArray(submitBody.image_urls) ? submitBody.image_urls : [];
  const prompt = imageUrls.length
    ? [
        "You must use the attached input images as visual references.",
        "The generated image must preserve the referenced structure, camera, layout, perspective, object placement, palette, lighting, and material cues according to the user's role instructions.",
        "Do not create an unrelated scene.",
        submitBody.prompt,
      ].join("\n")
    : submitBody.prompt;
  const content = imageUrls.length
    ? [
        { type: "input_text", text: prompt },
        ...imageUrls.slice(0, 16).map((url) => ({ type: "input_image", image_url: url })),
      ]
    : prompt;
  const body = {
    model: normalizeRayinModel(submitBody.model),
    input: [{ role: "user", content }],
    tools: [{ type: "image_generation" }],
  };
  if (submitBody.quality) body.quality = submitBody.quality;
  if (submitBody.size) body.size = submitBody.size;
  return body;
}

function getTaskStatus(payload) {
  return payload?.data?.status || payload?.status || "unknown";
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    const title = text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim();
    return {
      error: `HTTP ${response.status} HTML error`,
      message: title || `HTTP ${response.status}: upstream returned HTML instead of JSON`,
    };
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractTaskId(payload) {
  if (payload?.data?.task_id) return String(payload.data.task_id);
  if (payload?.data?.task_no) return String(payload.data.task_no);
  if (payload?.data?.id) return String(payload.data.id);
  if (payload?.task_no) return String(payload.task_no);
  if (payload?.task_id) return String(payload.task_id);
  if (payload?.id) return String(payload.id);
  if (Array.isArray(payload?.data) && payload.data[0]?.task_id) {
    return String(payload.data[0].task_id);
  }
  return null;
}

function extractResultUrl(payload) {
  const data = payload?.data;
  const candidates = [
    data?.result,
    data?.result?.url,
    data?.result?.image_url,
    data?.result?.output_url,
    data?.result?.b64_json,
    data?.result_url,
    data?.output,
    data?.output_url,
    data?.file_url,
    data?.b64_json,
    data?.image,
    data?.url,
    data?.image_url,
    payload?.result,
    payload?.result_url,
    payload?.output,
    payload?.output_url,
    payload?.file_url,
    payload?.b64_json,
    payload?.image,
    payload?.url,
    payload?.image_url,
  ];

  if (Array.isArray(data?.result?.images)) {
    candidates.push(data.result.images[0]?.url, data.result.images[0]?.image_url);
  }
  if (Array.isArray(data?.images)) {
    candidates.push(data.images[0]?.url, data.images[0]?.image_url);
  }
  if (Array.isArray(data?.assets)) {
    const outputAsset = data.assets.find((asset) => asset?.kind === "output" && (asset.url || asset.download_url));
    const firstAsset = data.assets.find((asset) => asset?.url || asset?.download_url);
    candidates.push(outputAsset?.url, outputAsset?.download_url, firstAsset?.url, firstAsset?.download_url);
  }

  const direct = candidates.map(normalizeImageValue).find(Boolean);
  if (direct) return direct;

  return findImageUrl(payload);
}

function normalizeImageValue(value) {
  if (typeof value !== "string" || !value) return null;
  if (/^data:image\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 500) {
    return `data:image/png;base64,${value}`;
  }
  return null;
}

function findImageUrl(value, seen = new Set()) {
  if (!value) return null;
  const normalized = normalizeImageValue(value);
  if (normalized) return normalized;
  if (typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item, seen);
      if (found) return found;
    }
    return null;
  }

  const preferredKeys = [
    "url",
    "image_url",
    "output_url",
    "result_url",
    "file_url",
    "b64_json",
    "base64",
    "image",
    "output",
    "content",
    "result",
    "images",
    "data",
  ];

  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = findImageUrl(value[key], seen);
      if (found) return found;
    }
  }

  for (const item of Object.values(value)) {
    const found = findImageUrl(item, seen);
    if (found) return found;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
