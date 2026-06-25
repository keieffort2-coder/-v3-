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
  return sanitizeBearerToken(process.env.RAYINAI_API_KEY || process.env.RAYINCODE_API_KEY);
}

function getRayinAiExtensionToken() {
  return sanitizeBearerToken(process.env.RAYINAI_EXTENSION_TOKEN || process.env.RAYINCODE_EXTENSION_TOKEN || getRayinAiKey());
}

function getRayinAiExtensionCookie() {
  return sanitizeCookieHeader(process.env.RAYINAI_EXTENSION_COOKIE || process.env.RAYINCODE_EXTENSION_COOKIE);
}

function getRayinAiKeyId() {
  const raw = sanitizeHeaderValue(process.env.RAYINAI_KEY_ID || process.env.RAYINCODE_KEY_ID || "8634");
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : 8634;
}

function getRayinAiResponsesModel() {
  return sanitizeHeaderValue(process.env.RAYINAI_RESPONSES_MODEL || "gpt-5.4");
}

function getRayinAiUserId(token) {
  const raw = sanitizeUserId(process.env.RAYINAI_USER_ID || process.env.RAYINCODE_USER_ID || process.env.user_id || process.env.USER_ID);
  if (raw) return raw;
  const payload = parseJwtPayload(token);
  return payload.user_id || payload.userId || payload.sub || payload.id || "";
}

function getRayinAiBaseUrl() {
  const raw = sanitizeHeaderValue(process.env.RAYINAI_BASE_URL || process.env.RAYINCODE_BASE_URL || RAYINAI_DEFAULT_BASE);
  const withoutName = raw.replace(/^RAYIN(?:AI|CODE)_BASE_URL\s*=\s*/i, "");
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

function sanitizeCookieHeader(value) {
  return sanitizeHeaderValue(value)
    .replace(/^Cookie\s*:\s*/i, "")
    .replace(/^cookie\s*=\s*/i, "");
}

function sanitizeUserId(value) {
  return sanitizeHeaderValue(value)
    .replace(/^user_id\s*=\s*/i, "")
    .replace(/^RAYINAI_USER_ID\s*=\s*/i, "")
    .replace(/^USER_ID\s*=\s*/i, "");
}

function parseJwtPayload(token) {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return {};
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

function buildRayinExtensionReferer(baseUrl, token) {
  const userId = getRayinAiUserId(token);
  const query = new URLSearchParams({
    token,
    theme: "light",
    lang: "zh",
    ui_mode: "embedded",
    src_host: baseUrl,
    src_url: `${baseUrl}/customer`,
  });
  if (userId) query.set("user_id", String(userId));
  return `${baseUrl}/extension/draw?${query.toString()}`;
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
      ? getRayinAiExtensionToken()
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
  const rayinExtensionToken = getRayinAiExtensionToken();
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
    const submitBody = {
      model: normalizeModel(model),
      prompt: String(prompt),
      n: 1,
      output_format: "png",
    };

    const normalizedQuality = normalizeQuality(quality, submitBody.model);
    if (normalizedQuality) submitBody.quality = normalizedQuality;
    const references = Array.isArray(imageDataUrls)
      ? imageDataUrls
      : [imageDataUrl];
    const imageUrls = references.filter(isImageReferenceValue);
    const structureUrls = Array.isArray(structureImageUrls) ? structureImageUrls.filter(isImageReferenceValue) : [];
    const styleUrls = Array.isArray(styleImageUrls) ? styleImageUrls.filter(isImageReferenceValue) : [];
    const editBaseUrls = Array.isArray(editBaseImageUrls) ? editBaseImageUrls.filter(isImageReferenceValue) : [];
    const orderedReferenceUrls = uniqueValues([
      ...structureUrls,
      ...styleUrls,
      ...imageUrls,
      ...editBaseUrls,
    ]).slice(0, 16);
    const bindingPrompt = String(referenceBindings || "").trim();
    if (orderedReferenceUrls.length) {
      submitBody.image_urls = orderedReferenceUrls;
      submitBody.prompt = [
        bindingPrompt,
        "Reference order: structure images control geometry, composition, local red lights, markings, and inherent object/material colors; style images control the global palette, color grade, ambient light, shadows, fog, atmosphere, texture, and finish.",
        String(prompt),
      ].filter(Boolean).join("\n");
    }
    const normalizedSize = shouldSendSize(submitBody.model) ? normalizeSize(size, submitBody.model) : "";
    if (normalizedSize) submitBody.size = normalizedSize;
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

    if (preferredProvider === "rhart") {
      const rhartSubmitBody = buildRhartSubmitBody(submitBody);
      const rhartResult = await submitRhartImageTask(rhartKey, rhartSubmitBody);
      if (rhartResult.ok) {
        const imageUrl = await persistResultImage(extractResultUrl(rhartResult.payload), `rhart-${Date.now()}`);
        const taskId = extractTaskId(rhartResult.payload);
        res.status(imageUrl ? 200 : 202).json({
          taskId,
          status: imageUrl ? "completed" : "submitted",
          imageUrl,
          model: submitBody.model,
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
            model: submitBody.model,
            size: submitBody.size,
            quality: submitBody.quality,
            output_format: submitBody.output_format,
            rayinEndpoint,
            rayinBaseUrl: getRayinAiBaseUrl(),
            rayinApiKeyConfigured: Boolean(rayinAiKey),
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

    const apiMartSubmitBody = buildApiMartSubmitBody(submitBody);
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

function buildApiMartSubmitBody(body) {
  const next = {
    model: body.model,
    prompt: body.prompt,
    n: body.n || 1,
  };
  if (body.output_format) next.output_format = body.output_format;
  if (body.quality) next.quality = body.quality;
  if (body.size) next.size = body.size;
  if (Array.isArray(body.image_urls) && body.image_urls.length) {
    next.image_urls = body.image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  return next;
}

function buildRhartSubmitBody(body) {
  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.filter(isImageReferenceValue).slice(0, 8) : [];
  const next = {
    model: RHART_MODEL,
    prompt: body.prompt,
    n: body.n || 1,
    output_format: body.output_format || "png",
  };
  if (body.quality) next.quality = body.quality;
  if (body.size) next.size = body.size;
  if (imageUrls.length) {
    next.image_urls = imageUrls;
    next.images = imageUrls.map((url) => ({ image_url: url, url }));
    next.input_images = imageUrls.map((url) => ({ image_url: url, url }));
  }
  if (Array.isArray(body.structure_image_urls) && body.structure_image_urls.length) {
    next.structure_image_urls = body.structure_image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  if (Array.isArray(body.style_image_urls) && body.style_image_urls.length) {
    next.style_image_urls = body.style_image_urls.filter(isImageReferenceValue).slice(0, 4);
  }
  if (Array.isArray(body.edit_image_urls) && body.edit_image_urls.length) {
    next.edit_image_urls = body.edit_image_urls.filter(isImageReferenceValue).slice(0, 4);
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
    if (payload?.rayinExtensionAuth?.hasToken) {
      const auth = payload.rayinExtensionAuth;
      if (!auth.hasUserId) {
        return "RayinAI 扩展接口认证失败：已读取 RAYINAI_EXTENSION_TOKEN，但后端没有读到 user_id。请在 Vercel 配置 RAYINAI_USER_ID 或 user_id，并重新部署。";
      }
      if (!auth.hasCookie) {
        return "RayinAI 扩展接口认证失败：已读取 token 和 user_id，但没有读到 RAYINAI_EXTENSION_COOKIE。请从 RayinAI 网页请求里复制同一登录会话的 Cookie。";
      }
      return "RayinAI 扩展接口认证失败：token、user_id 和 cookie 都已读取，但上游仍返回 401。请重新从 RayinAI 网页抓取同一会话的 RAYINAI_EXTENSION_TOKEN 和 RAYINAI_EXTENSION_COOKIE。";
    }
    return "RayinAI 扩展接口认证失败：后端没有读到 RAYINAI_EXTENSION_TOKEN。请确认变量名拼写、环境为 Production/Preview，并重新部署。";
  }
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
  const cookie = getRayinAiExtensionCookie();
  const endpoints = [
    `${baseUrl}/extension/api/image/tasks/${encodeURIComponent(taskId)}`,
    `${baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`,
    `${baseUrl}/tasks/${encodeURIComponent(taskId)}`,
  ];
  let lastPayload = null;
  for (const endpoint of endpoints) {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      Origin: baseUrl,
      Referer: buildRayinExtensionReferer(baseUrl, apiKey),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    };
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(endpoint, { headers });
    const payload = await readJson(response);
    if (response.ok) {
      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        payload.rayinEndpoint = endpoint;
        payload.rayinExtension = true;
      }
      return payload;
    }
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
  const responsesBody = buildRayinResponsesBody(rayinImageBody);
  const attempts = [
    { url: `${baseUrl}/v1/responses`, body: responsesBody },
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
  const cookie = getRayinAiExtensionCookie();
  const userId = getRayinAiUserId(apiKey);
  const referer = buildRayinExtensionReferer(baseUrl, apiKey);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Origin: baseUrl,
    Referer: referer,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  };
  if (apiKey) {
    headers.token = apiKey;
    headers["x-token"] = apiKey;
  }
  if (userId) {
    headers.user_id = String(userId);
    headers["x-user-id"] = String(userId);
  }
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  const taskId = extractTaskId(payload);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    payload.rayinExtensionAuth = {
      hasToken: Boolean(apiKey),
      tokenLooksLikeJwt: /^eyJ/.test(apiKey || ""),
      tokenLength: String(apiKey || "").length,
      hasUserId: Boolean(userId),
      hasCookie: Boolean(cookie),
      cookieLength: String(cookie || "").length,
      keyId: getRayinAiKeyId(),
      baseUrl,
      refererHasUserId: referer.includes("user_id="),
    };
  }
  if (response.ok && taskId) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.rayinEndpoint = endpoint;
      payload.rayinExtension = true;
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

function buildRayinResponsesBody(submitBody) {
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
        submitBody.prompt,
      ].join("\n")
    : submitBody.prompt;
  const content = [{ type: "input_text", text: prompt }];
  imageUrls.slice(0, 16).forEach((url, index) => {
    content.push({ type: "input_text", text: getRayinReferenceLabel(submitBody, url, index) });
    content.push({ type: "input_image", image_url: url });
  });
  const body = {
    model: getRayinAiResponsesModel(),
    input: [{ type: "message", role: "user", content }],
    tools: [{ type: "image_generation" }],
  };
  if (submitBody.quality) body.quality = submitBody.quality;
  if (submitBody.size) body.size = submitBody.size;
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
  if (payload?.rayinExtension) {
    const assets = Array.isArray(data?.assets) ? data.assets : [];
    const outputAsset = assets.find((asset) => asset?.kind === "output" && (asset.url || asset.download_url));
    return normalizeImageValue(outputAsset?.url) || normalizeImageValue(outputAsset?.download_url) || null;
  }
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
