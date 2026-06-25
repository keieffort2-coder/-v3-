const API_BASE = "https://api.apimart.ai/v1";

const RHART_MODEL = "rhart-image-n-g31-flash/image-to-image";
const RHART_ENDPOINT_PATH = "/v1/rhart-image-n-g31-flash/image-to-image";
const RAYINAI_DEFAULT_BASE = "https://code.rayinai.com";

function getApiMartKey(channel) {
  const selected = String(channel || "b").toLowerCase();
  const key = selected === "a" ? process.env.APIMART_API_KEY || process.env.APIMART_TOKEN : process.env.APIMART_API_KEY_2 || process.env.APIMART_TOKEN_2;
  return sanitizeHeaderValue(key);
}

function getRhartKey() {
  return sanitizeHeaderValue(process.env.RHART_G31_API_KEY || process.env.RHART_API_KEY || process.env.RHART_TOKEN);
}

function getRayinAiKey() {
  return sanitizeBearerToken(process.env.RAYINAI_API_KEY);
}

function getRayinAiKeyId() {
  const raw = sanitizeHeaderValue(process.env.RAYINAI_KEY_ID || "8634");
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 8634;
}

function getRayinAiResponsesModel() {
  return sanitizeHeaderValue(process.env.RAYINAI_RESPONSES_MODEL || "gpt-image-2");
}

function getRayinAiResponsesModels() {
  const configured = sanitizeHeaderValue(process.env.RAYINAI_RESPONSES_MODELS || process.env.RAYINAI_RESPONSES_MODEL || "gpt-image-2");
  const models = configured
    .split(/[,\s;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return uniqueValues(models).length ? uniqueValues(models) : ["gpt-image-2"];
}

function getRayinAiRetryAttempts() {
  const value = Number(sanitizeHeaderValue(process.env.RAYINAI_RETRY_ATTEMPTS || "6"));
  if (!Number.isFinite(value)) return 6;
  return Math.min(10, Math.max(1, Math.floor(value)));
}

function getRayinAiBaseUrl() {
  const raw = sanitizeHeaderValue(process.env.RAYINAI_BASE_URL || RAYINAI_DEFAULT_BASE);
  const withoutName = raw.replace(/^RAYINAI_BASE_URL\s*=\s*/i, "");
  const normalized = withoutName
    .replace(/\/v1\/responses\/?$/i, "")
    .replace(/\/responses\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  if (isLegacyRayinAiBaseUrl(normalized)) return RAYINAI_DEFAULT_BASE;
  return normalized || RAYINAI_DEFAULT_BASE;
}

function isLegacyRayinAiBaseUrl(value) {
  return /^(?:https?:\/\/)?(?:www\.)?240423\.xyz(?:[/:?#]|$)/i.test(String(value || "").trim());
}

function getRhartBaseUrl() {
  const raw = sanitizeHeaderValue(process.env.RHART_BASE_URL || process.env.RHART_G31_BASE_URL);
  const withoutName = raw.replace(/^RHART(?:_G31)?_BASE_URL\s*=\s*/i, "");
  const value = withoutName
    .replace(/\/v1\/rhart-image-n-g31-flash\/image-to-image\/?$/i, "")
    .replace(/\/rhart-image-n-g31-flash\/image-to-image\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}

function buildRhartEndpoint() {
  const explicit = sanitizeHeaderValue(process.env.RHART_ENDPOINT_URL || process.env.RHART_G31_ENDPOINT_URL);
  if (/^https?:\/\//i.test(explicit)) return explicit;
  if (explicit) return explicit;
  const base = getRhartBaseUrl();
  if (!base) return "";
  return new URL(RHART_ENDPOINT_PATH.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).toString();
}

function sanitizeHeaderValue(value) {
  return String(value || "").trim().replace(/[^\x20-\x7E]/g, "");
}

function sanitizeBearerToken(value) {
  return sanitizeHeaderValue(value)
    .replace(/^Authorization\s*:\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .replace(/\s+/g, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const taskId = req.query?.taskId;
    if (!taskId) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const provider = normalizeProvider(req.query?.provider);
    const apiKey = provider === "rayinai"
      ? getRayinAiKey()
      : provider === "rhart"
        ? getRhartKey()
        : getApiMartKey(req.query?.apimartChannel);
    if (!apiKey) {
      res.status(500).json({
        error: provider === "rayinai"
          ? "RAYINAI_API_KEY is not configured"
          : provider === "rhart"
            ? "RHART_G31_API_KEY / RHART_API_KEY is not configured"
            : "APIMART_API_KEY_2 is not configured",
        message: provider === "rayinai"
          ? "Please configure RAYINAI_API_KEY in Vercel Environment Variables."
          : provider === "rhart"
            ? "Please configure RHART_G31_API_KEY or RHART_API_KEY in Vercel Environment Variables."
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
        rayinEndpoint: taskPayload?.rayinEndpoint,
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
    referenceBindings,
    apimartChannel,
    model,
    size,
    provider,
  } = req.body || {};
  const apiKey = getApiMartKey(apimartChannel);
  const rhartKey = getRhartKey();
  const rayinAiKey = getRayinAiKey();
  const preferredProvider = normalizeProvider(provider || process.env.IMAGE_PROVIDER || "apimart");
  if (preferredProvider === "rhart" && !rhartKey) {
    res.status(500).json({
      error: "RHART_G31_API_KEY / RHART_API_KEY is not configured",
      message: "Please configure RHART_G31_API_KEY or RHART_API_KEY in Vercel Environment Variables.",
    });
    return;
  }
  if (!apiKey && preferredProvider !== "rayinai" && preferredProvider !== "rhart") {
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
    const requestContext = buildImageRequestContext({
      prompt,
      quality,
      imageDataUrl,
      imageDataUrls,
      structureImageUrls,
      styleImageUrls,
      editBaseImageUrls,
      referenceBindings,
      model,
      size,
    });

    if (preferredProvider === "rhart") {
      const rhartSubmitBody = buildRhartSubmitBody(requestContext);
      const rhartResult = await submitRhartImageTask(rhartKey, rhartSubmitBody);
      if (rhartResult.ok) {
        const imageUrl = await persistResultImage(extractResultUrl(rhartResult.payload), `rhart-${Date.now()}`);
        const taskId = extractTaskId(rhartResult.payload);
        res.status(imageUrl ? 200 : 202).json({
          taskId,
          status: imageUrl ? "completed" : "submitted",
          imageUrl,
          model: rhartSubmitBody.model,
          provider: "rhart",
          payload: imageUrl ? undefined : rhartResult.payload,
        });
        return;
      }

      res.status(rhartResult.status || 502).json({
        error: "RHarT G31 submit failed",
        message: formatUpstreamError(rhartResult.payload),
        upstream: rhartResult.payload,
        request: {
          model: rhartSubmitBody.model,
          size: rhartSubmitBody.size,
          quality: rhartSubmitBody.quality,
          output_format: rhartSubmitBody.output_format,
          referenceCount: rhartSubmitBody.image_urls?.length || 0,
        },
      });
      return;
    }

    if (shouldTryRayinAi(preferredProvider, requestContext.model, rayinAiKey)) {
      const rayinSubmitBody = buildRayinSubmitBody(requestContext);
      const rayinResult = await submitRayinImageTask(rayinAiKey, rayinSubmitBody);
      if (rayinResult.ok) {
        const imageUrl = await persistResultImage(extractResultUrl(rayinResult.payload), `rayinai-${Date.now()}`);
        const taskId = extractTaskId(rayinResult.payload);
        res.status(imageUrl ? 200 : 202).json({
          taskId,
          status: imageUrl ? "completed" : "submitted",
          imageUrl,
          model: rayinResult.payload?.rayinRequest?.model || rayinSubmitBody.model,
          provider: "rayinai",
          rayinEndpoint: rayinResult.payload?.rayinEndpoint,
          payload: imageUrl ? undefined : rayinResult.payload,
        });
        return;
      }

      if (!apiKey || preferredProvider === "rayinai") {
        const rayinEndpoint = rayinResult.payload?.rayinEndpoint || rayinResult.payload?.endpoint || "";
        res.status(rayinResult.status || 502).json({
          error: "RayinAI submit failed",
          message: formatUpstreamError(rayinResult.payload),
          upstream: rayinResult.payload,
          request: {
            rayinResponsesModel: rayinResult.payload?.rayinRequest?.model || getRayinAiResponsesModel(),
            rayinRequestType: rayinResult.payload?.rayinRequest?.type || "",
            size: rayinSubmitBody.size,
            quality: rayinSubmitBody.quality,
            output_format: rayinSubmitBody.output_format,
            rayinEndpoint,
            rayinBaseUrl: getRayinAiBaseUrl(),
            rayinApiKeyConfigured: Boolean(rayinAiKey),
            referenceCount: rayinSubmitBody.image_urls?.length || 0,
            upstreamStatus: rayinResult.status || "",
            upstreamMessage: findMessage(rayinResult.payload),
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

    const apiMartSubmitBody = buildApiMartSubmitBody(requestContext);
    const submit = await fetch(`${API_BASE}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiMartSubmitBody),
    });

    const submitPayload = await readJson(submit);
    if (!submit.ok) {
      res.status(submit.status).json({
        error: "APIMart submit failed",
        message: formatUpstreamError(submitPayload),
        upstream: submitPayload,
        request: {
          model: apiMartSubmitBody.model,
          size: apiMartSubmitBody.size,
          quality: apiMartSubmitBody.quality,
          output_format: apiMartSubmitBody.output_format,
          referenceCount: apiMartSubmitBody.image_urls?.length || 0,
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
      model: apiMartSubmitBody.model,
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
  if (provider === "rhart" || provider === "rhart-g31" || provider === "rhart-image-n-g31-flash/image-to-image") return "rhart";
  if (provider === "rayinai" || provider === "rayincode") return "rayinai";
  return "apimart";
}

function isImageReferenceValue(value) {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:image\//i.test(value));
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildImageRequestContext(body) {
  const model = normalizeModel(body.model);
  const basePrompt = String(body.prompt || "");
  const references = Array.isArray(body.imageDataUrls)
    ? body.imageDataUrls
    : [body.imageDataUrl];
  const imageUrls = references.filter(isImageReferenceValue);
  const structureUrls = Array.isArray(body.structureImageUrls) ? body.structureImageUrls.filter(isImageReferenceValue) : [];
  const styleUrls = Array.isArray(body.styleImageUrls) ? body.styleImageUrls.filter(isImageReferenceValue) : [];
  const editBaseUrls = Array.isArray(body.editBaseImageUrls) ? body.editBaseImageUrls.filter(isImageReferenceValue) : [];
  const orderedReferenceUrls = uniqueValues([
    ...structureUrls,
    ...styleUrls,
    ...imageUrls,
    ...editBaseUrls,
  ]).slice(0, 16);
  const referencePrompt = orderedReferenceUrls.length
    ? [
        String(body.referenceBindings || "").trim(),
        "Reference order: structure images control geometry, composition, local red lights, markings, and inherent object/material colors; style images control the global palette, color grade, ambient light, shadows, fog, atmosphere, texture, and finish.",
        basePrompt,
      ].filter(Boolean).join("\n")
    : basePrompt;
  const normalizedQuality = normalizeQuality(body.quality, model);
  const normalizedSize = shouldSendSize(model) ? normalizeSize(body.size, model) : "";
  return {
    model,
    prompt: referencePrompt,
    basePrompt,
    n: 1,
    output_format: "png",
    quality: normalizedQuality,
    size: normalizedSize,
    image_urls: orderedReferenceUrls,
    structure_image_urls: structureUrls.slice(0, 4),
    composition_image_urls: structureUrls.slice(0, 4),
    layout_image_urls: structureUrls.slice(0, 4),
    style_image_urls: styleUrls.slice(0, 4),
    edit_image_urls: editBaseUrls.slice(0, 4),
    base_image_urls: editBaseUrls.slice(0, 4),
  };
}

function buildApiMartSubmitBody(context) {
  const next = {
    model: context.model,
    prompt: context.prompt,
    n: context.n || 1,
  };
  if (context.output_format) next.output_format = context.output_format;
  if (context.quality) next.quality = context.quality;
  if (context.size) next.size = context.size;
  if (Array.isArray(context.image_urls) && context.image_urls.length) {
    next.image_urls = context.image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  return next;
}

function buildRayinSubmitBody(context) {
  const next = {
    model: context.model,
    prompt: context.prompt,
    n: context.n || 1,
    output_format: context.output_format || "png",
  };
  if (context.quality) next.quality = context.quality;
  if (context.size) next.size = context.size;
  if (Array.isArray(context.image_urls) && context.image_urls.length) next.image_urls = context.image_urls.slice(0, 16);
  if (Array.isArray(context.structure_image_urls) && context.structure_image_urls.length) {
    next.structure_image_urls = context.structure_image_urls.slice(0, 4);
  }
  if (Array.isArray(context.composition_image_urls) && context.composition_image_urls.length) {
    next.composition_image_urls = context.composition_image_urls.slice(0, 4);
  }
  if (Array.isArray(context.layout_image_urls) && context.layout_image_urls.length) {
    next.layout_image_urls = context.layout_image_urls.slice(0, 4);
  }
  if (Array.isArray(context.style_image_urls) && context.style_image_urls.length) {
    next.style_image_urls = context.style_image_urls.slice(0, 4);
  }
  if (Array.isArray(context.edit_image_urls) && context.edit_image_urls.length) {
    next.edit_image_urls = context.edit_image_urls.slice(0, 4);
  }
  if (Array.isArray(context.base_image_urls) && context.base_image_urls.length) {
    next.base_image_urls = context.base_image_urls.slice(0, 4);
  }
  return next;
}

function buildRhartSubmitBody(context) {
  const imageUrls = Array.isArray(context.image_urls) ? context.image_urls.filter(isImageReferenceValue).slice(0, 8) : [];
  const next = {
    model: RHART_MODEL,
    prompt: context.prompt,
    n: context.n || 1,
    output_format: context.output_format || "png",
  };
  if (context.quality) next.quality = context.quality;
  if (context.size) next.size = context.size;
  if (imageUrls.length) {
    next.image_urls = imageUrls;
    next.images = imageUrls.map((url) => ({ image_url: url, url }));
    next.input_images = imageUrls.map((url) => ({ image_url: url, url }));
  }
  if (Array.isArray(context.structure_image_urls) && context.structure_image_urls.length) {
    next.structure_image_urls = context.structure_image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  if (Array.isArray(context.style_image_urls) && context.style_image_urls.length) {
    next.style_image_urls = context.style_image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  if (Array.isArray(context.edit_image_urls) && context.edit_image_urls.length) {
    next.edit_image_urls = context.edit_image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  return next;
}

async function submitRhartImageTask(apiKey, body) {
  const endpoint = buildRhartEndpoint();
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: "RHART_ENDPOINT_URL / RHART_BASE_URL is invalid",
        message: endpoint
          ? `RHarT G31 是独立生成后端，但当前 endpoint 不是完整 URL：${endpoint}。请把 RHART_ENDPOINT_URL 配成 https:// 开头的完整接口地址。`
          : "RHarT G31 是独立生成后端，请配置 RHART_ENDPOINT_URL 为完整 image-to-image 接口地址，或配置 RHART_BASE_URL 为该平台域名。",
        rhartEndpoint: endpoint || "",
      },
    };
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: "RHarT G31 request failed before reaching upstream",
        message: error instanceof Error ? error.message : String(error),
        rhartEndpoint: endpoint,
      },
    };
  }
  const payload = await readJson(response);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    payload.rhartEndpoint = endpoint;
  }
  const imageUrl = extractResultUrl(payload);
  const taskId = extractTaskId(payload);
  return {
    ok: response.ok && Boolean(imageUrl || taskId),
    status: response.status,
    payload,
  };
}

function shouldTryRayinAi(provider, model, apiKey) {
  if (!apiKey) return false;
  return provider === "rayinai";
}

function formatUpstreamError(payload) {
  const message = findMessage(payload);
  if (/sub2api auth returned HTTP 401|HTTP 401|401/i.test(message)) {
    return "RayinAI API 认证失败：请确认 Vercel 里的 RAYINAI_API_KEY 是后台生成的 sk- 开头密钥，并重新部署。";
  }
  if (/selected model is at capacity|model.*capacity|capacity|overloaded|模型.*满载|模型.*繁忙/i.test(message)) {
    return `RayinAI 模型当前满载：${message}`;
  }
  if (/service temporarily unavailable|temporarily unavailable|bad gateway|gateway timeout/i.test(message)) {
    return message
      ? `RayinAI 上游暂时不可用：${message}`
      : "RayinAI 上游暂时不可用，请稍后重试，或临时切换到 ApiMart 通道。";
  }
  if (/internal server error|server_error/i.test(message)) {
    return message
      ? `上游图片生成服务内部错误：${message}`
      : "上游图片生成服务内部错误，请稍后重试或切换通道。";
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
  if (value === "rhart-image-n-g31-flash/image-to-image" || value === "/rhart-image-n-g31-flash/image-to-image") return "gpt-image-2";
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
  if (model === "rhart-image-n-g31-flash/image-to-image") return "";
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
    const width = Math.min(3840, roundUpToMultiple(sourceWidth * scale, 16));
    const height = Math.min(3840, roundUpToMultiple(sourceHeight * scale, 16));
    return `${width}x${height}`;
  }
  if (["1024x1024", "1536x864", "864x1536", "auto"].includes(value)) return value;
  return "";
}

function roundUpToMultiple(value, multiple) {
  return Math.max(multiple, Math.ceil(Number(value || 0) / multiple) * multiple);
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
    `${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`,
    `${baseUrl}/tasks/${encodeURIComponent(taskId)}`,
  ];
  let lastPayload = null;
  for (const endpoint of endpoints) {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "*/*",
    };
    const response = await fetch(endpoint, { headers });
    const payload = await readJson(response);
    if (response.ok) {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        payload.rayinEndpoint = endpoint;
      }
      return payload;
    }
    lastPayload = payload;
    if (![404, 405].includes(response.status)) break;
  }
  throw new Error(JSON.stringify(lastPayload || { error: "RayinAI task polling failed" }));
}

async function submitRayinImageTask(apiKey, submitBody) {
  const baseUrl = getRayinAiBaseUrl();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "*/*",
    Host: new URL(baseUrl).host,
    Connection: "keep-alive",
  };
  const imageBody = {
    ...submitBody,
    model: normalizeRayinModel(submitBody.model),
  };
  const rayinImageBody = normalizeRayinImageBody(imageBody);
  const hasReferences = Array.isArray(rayinImageBody.image_urls) && rayinImageBody.image_urls.length > 0;
  const models = getRayinAiResponsesModels();
  const attempts = models.flatMap((model) => [
    {
      url: `${baseUrl}/v1/images/generations`,
      body: buildRayinImagesBody(rayinImageBody, model),
      type: "images",
    },
    {
      url: `${baseUrl}/v1/responses`,
      body: buildRayinResponsesBody(rayinImageBody, model),
      type: "responses",
    },
  ]);
  let last = { ok: false, status: 0, payload: { error: "RayinAI request was not attempted" } };

  for (const attempt of attempts) {
    const { response, payload } = await fetchRayinWithRetry(attempt.url, headers, attempt.body);
    const imageUrl = extractResultUrl(payload);
    const taskId = extractTaskId(payload);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.rayinRequest = {
        model: attempt.body?.model,
        type: attempt.type,
        hasTools: Array.isArray(attempt.body?.tools),
        contentTypes: attempt.body?.input?.[0]?.content?.map((item) => item?.type).filter(Boolean) || [],
        referenceCount: Array.isArray(attempt.body?.image_urls) ? attempt.body.image_urls.length : 0,
      };
    }
    if (response.ok && (imageUrl || taskId)) {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        payload.rayinEndpoint = attempt.url;
      }
      return { ok: true, status: response.status, payload };
    }
    last = { ok: false, status: response.status, payload };
    if (response.ok) return last;
    const retryableRayinMessage = isRetryableRayinMessage(formatUpstreamError(payload));
    if (![404, 405, 429, 502, 503, 504].includes(response.status) && !retryableRayinMessage) return last;
  }

  if (last?.payload && typeof last.payload === "object" && !Array.isArray(last.payload)) {
    last.payload.endpoint = attempts[attempts.length - 1]?.url;
    last.payload.status = last.status;
  }
  return last;
}

async function fetchRayinWithRetry(url, headers, body) {
  let response;
  let payload;
  const maxAttempts = getRayinAiRetryAttempts();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    payload = await readJson(response);
    const message = formatUpstreamError(payload);
    if (![429, 502, 503, 504].includes(response.status) || attempt === maxAttempts - 1) return { response, payload };
    if (!isRetryableRayinMessage(message)) {
      return { response, payload };
    }
    await sleep(getRayinRetryDelay(attempt));
  }
  return { response, payload };
}

function getRayinRetryDelay(attempt) {
  const delays = [1500, 3000, 6000, 10000, 15000, 20000, 25000, 30000, 30000];
  return delays[Math.min(attempt, delays.length - 1)];
}

function isRetryableRayinMessage(message) {
  return /RayinAI 上游暂时不可用|上游图片生成服务内部错误|temporarily unavailable|bad gateway|gateway timeout|rate limit|too many requests|model.*capacity|capacity|overloaded|模型.*满载|模型.*繁忙|暂时不可用/i.test(String(message || ""));
}

function normalizeRayinImageBody(body) {
  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.filter(isImageReferenceValue) : [];
  const structureUrls = Array.isArray(body.structure_image_urls) ? body.structure_image_urls.filter(isImageReferenceValue) : [];
  const styleUrls = Array.isArray(body.style_image_urls) ? body.style_image_urls.filter(isImageReferenceValue) : [];
  const editUrls = Array.isArray(body.edit_image_urls) ? body.edit_image_urls.filter(isImageReferenceValue) : [];
  const references = uniqueArray([...structureUrls, ...styleUrls, ...editUrls, ...imageUrls]).slice(0, 16);
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

function buildRayinResponsesBody(submitBody, model = getRayinAiResponsesModel()) {
  const imageUrls = Array.isArray(submitBody.image_urls) ? submitBody.image_urls : [];
  const prompt = imageUrls.length
    ? [
        "You must use the attached input images as visual references.",
        "Reference roles are strict and must not be swapped.",
        "STRUCTURE reference controls scene content, architecture, camera, layout, perspective, scale, object placement, crop, and canvas ratio.",
        "STYLE reference controls only palette, color temperature, brushwork, material finish, lighting mood, atmosphere, texture quality, and render style.",
        "Do not copy the STYLE reference composition, objects, camera, perspective, or scene layout.",
        "Do not let the STYLE reference replace or reinterpret the STRUCTURE reference content.",
        "Do not create an unrelated scene.",
        "Generate the final image and return the resulting image URL or base64 image data when available.",
        submitBody.prompt,
      ].join("\n")
    : submitBody.prompt;
  const content = [{ type: "input_text", text: prompt }];
  imageUrls.slice(0, 16).forEach((url, index) => {
    content.push({ type: "input_text", text: getRayinReferenceLabel(submitBody, url, index) });
    content.push({ type: "input_image", image_url: url });
  });
  return {
    model,
    input: [{ type: "message", role: "user", content }],
  };
}

function buildRayinImagesBody(submitBody, model = getRayinAiResponsesModel()) {
  const imageUrls = Array.isArray(submitBody.image_urls) ? submitBody.image_urls.filter(isImageReferenceValue).slice(0, 16) : [];
  const body = {
    model,
    prompt: submitBody.prompt,
    n: 1,
  };
  if (submitBody.output_format) body.output_format = submitBody.output_format;
  if (submitBody.quality) body.quality = submitBody.quality;
  if (submitBody.size) body.size = submitBody.size;
  if (imageUrls.length) {
    body.image_urls = imageUrls;
    body.reference_image_urls = imageUrls;
    body.input_image_urls = imageUrls;
  }
  return body;
}

function getRayinReferenceLabel(submitBody, url, index) {
  const structureUrls = Array.isArray(submitBody.structure_image_urls) ? submitBody.structure_image_urls : [];
  const styleUrls = Array.isArray(submitBody.style_image_urls) ? submitBody.style_image_urls : [];
  const editUrls = Array.isArray(submitBody.edit_image_urls) ? submitBody.edit_image_urls : [];
  if (structureUrls.includes(url)) {
    return `Input image ${index + 1}: STRUCTURE reference. Use it for geometry, camera, composition, scene content, object placement, crop, and canvas ratio.`;
  }
  if (styleUrls.includes(url)) {
    return `Input image ${index + 1}: STYLE reference. Use it only for color palette, lighting mood, brushwork, material finish, atmosphere, texture quality, and render style. Do not use its composition or objects.`;
  }
  if (editUrls.includes(url)) {
    return `Input image ${index + 1}: EDIT BASE reference. Preserve its scene and apply only the requested edit.`;
  }
  return `Input image ${index + 1}: supporting reference. Use only if it does not conflict with STRUCTURE and STYLE references.`;
}

function getTaskStatus(payload) {
  return payload?.data?.status || payload?.status || payload?.data?.state || payload?.state || "unknown";
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
    Array.isArray(data) ? data[0]?.url : null,
    Array.isArray(data) ? data[0]?.image_url : null,
    Array.isArray(data) ? data[0]?.b64_json : null,
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
  if (Array.isArray(payload?.data)) {
    candidates.push(payload.data[0]?.url, payload.data[0]?.image_url, payload.data[0]?.b64_json);
  }
  if (Array.isArray(payload?.images)) {
    candidates.push(payload.images[0]?.url, payload.images[0]?.image_url, payload.images[0]?.b64_json);
  }
  if (Array.isArray(data?.assets)) {
    const outputAsset = data.assets.find((asset) => asset?.kind === "output" && (asset.url || asset.download_url));
    candidates.push(outputAsset?.url, outputAsset?.download_url);
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
