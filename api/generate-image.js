const API_BASE = "https://api.apimart.ai/v1";

const RHART_MODEL = "rhart-image-n-g31-flash/image-to-image";
const RHART_DEFAULT_BASE = "https://www.runninghub.cn";
const RHART_ENDPOINT_PATHS = {
  "rhart-image-n-g31-flash/image-to-image": "/openapi/v2/rhart-image-n-g31-flash/image-to-image",
  "rhart-image-g-2/image-to-image": "/openapi/v2/rhart-image-g-2/image-to-image",
  "rhart-image-g-2-official/image-to-image": "/openapi/v2/rhart-image-g-2-official/image-to-image",
};
const RHART_QUERY_PATH = "/openapi/v2/query";
const RHART_UPLOAD_PATH = "/openapi/v2/media/upload/binary";
const RAYINAI_DEFAULT_BASE = "https://code.rayinai.com";
const AIHUBMIX_DEFAULT_BASE = "https://aihubmix.com/v1";

function getApiMartKey(channel) {
  const selected = String(channel || "b").toLowerCase();
  const key = selected === "a" ? process.env.APIMART_API_KEY || process.env.APIMART_TOKEN : process.env.APIMART_API_KEY_2 || process.env.APIMART_TOKEN_2;
  return sanitizeHeaderValue(key);
}

function getRhartKey() {
  return sanitizeBearerToken(process.env.RHART_G31_API_KEY || process.env.RHART_API_KEY || process.env.RHART_TOKEN);
}

function getAiHubMixKey() {
  return sanitizeBearerToken(process.env.AIHUBMIX_API_KEY || process.env.AIHUBMIX_TOKEN);
}

function getAiHubMixBaseUrl() {
  const raw = sanitizeHeaderValue(process.env.AIHUBMIX_BASE_URL || AIHUBMIX_DEFAULT_BASE);
  const withoutName = raw.replace(/^AIHUBMIX_BASE_URL\s*=\s*/i, "");
  return (withoutName || AIHUBMIX_DEFAULT_BASE).replace(/\/+$/, "");
}

function getAiHubMixModel(model) {
  const explicit = sanitizeHeaderValue(process.env.AIHUBMIX_IMAGE_MODEL);
  if (explicit) return explicit;
  return normalizeModel(model) === "gemini-3-pro-image-preview" ? "gemini-3-pro-image-preview" : "gpt-image-2";
}

function getRayinRouteEnvPrefix(route) {
  return {
    bunana: "RAYINAI_BUNANA",
    mumu: "RAYINAI_MUMU",
    tiancai: "RAYINAI_TIANCAI",
    kaihua: "RAYINAI_KAIHUA",
    haizhe: "RAYINAI_HAIZHE",
  }[normalizeRayinRoute(route)] || "RAYINAI_BUNANA";
}

function getRayinAiKey(route = "bunana") {
  const normalized = normalizeRayinRoute(route);
  const prefix = getRayinRouteEnvPrefix(normalized);
  return sanitizeBearerToken(
    process.env[`${prefix}_API_KEY`]
    || process.env[`${prefix}_TOKEN`]
    || (normalized === "bunana" ? process.env.RAYINAI_API_KEY : "")
    || process.env.RAYINAI_API_KEY,
  );
}

function getRayinAiKeyId(route = "bunana") {
  const normalized = normalizeRayinRoute(route);
  const prefix = getRayinRouteEnvPrefix(normalized);
  const raw = sanitizeHeaderValue(
    process.env[`${prefix}_KEY_ID`]
    || (normalized === "bunana" ? process.env.RAYINAI_KEY_ID : "")
    || process.env.RAYINAI_KEY_ID
    || "8634",
  );
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
  const value = Number(sanitizeHeaderValue(process.env.RAYINAI_RETRY_ATTEMPTS || "1"));
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.floor(value)));
}

function getRayinFetchTimeoutMs() {
  const value = Number(sanitizeHeaderValue(process.env.RAYINAI_FETCH_TIMEOUT_MS || "15000"));
  if (!Number.isFinite(value)) return 15000;
  return Math.min(90000, Math.max(8000, Math.floor(value)));
}

function getRayinAiBaseUrl(route = "bunana") {
  const normalizedRoute = normalizeRayinRoute(route);
  const prefix = getRayinRouteEnvPrefix(normalizedRoute);
  const raw = sanitizeHeaderValue(
    process.env[`${prefix}_BASE_URL`]
    || (normalizedRoute === "bunana" ? process.env.RAYINAI_BASE_URL : "")
    || process.env.RAYINAI_BASE_URL
    || RAYINAI_DEFAULT_BASE,
  );
  const withoutName = raw.replace(/^(?:RAYINAI(?:_[A-Z]+)?_BASE_URL)\s*=\s*/i, "");
  const normalized = withoutName
    .replace(/\/v1\/responses\/?$/i, "")
    .replace(/\/responses\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  if (isLegacyRayinAiBaseUrl(normalized)) return RAYINAI_DEFAULT_BASE;
  return normalized || RAYINAI_DEFAULT_BASE;
}

function getRayinAiBaseUrls(route = "bunana") {
  const primary = getRayinAiBaseUrl(route);
  const configured = sanitizeHeaderValue(process.env.RAYINAI_FALLBACK_BASE_URLS || "https://code-bak.rayinai.com,https://code1.rayinai.com")
    .split(/[,\s;]+/)
    .map((value) => normalizeRayinBaseUrl(value))
    .filter(Boolean);
  return uniqueValues([primary, ...configured]);
}

function normalizeRayinBaseUrl(value) {
  const withoutName = sanitizeHeaderValue(value || "").replace(/^(?:RAYINAI(?:_[A-Z]+)?_BASE_URL)\s*=\s*/i, "");
  const normalized = withoutName
    .replace(/\/v1\/responses\/?$/i, "")
    .replace(/\/responses\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  if (!normalized || isLegacyRayinAiBaseUrl(normalized)) return "";
  return normalized;
}

function isLegacyRayinAiBaseUrl(value) {
  return /^(?:https?:\/\/)?(?:www\.)?240423\.xyz(?:[/:?#]|$)/i.test(String(value || "").trim());
}

function getRhartBaseUrl() {
  const raw = sanitizeHeaderValue(process.env.RHART_BASE_URL || process.env.RHART_G31_BASE_URL || process.env.RUNNINGHUB_BASE_URL || RHART_DEFAULT_BASE);
  const withoutName = raw.replace(/^(?:RHART(?:_G31)?|RUNNINGHUB)_BASE_URL\s*=\s*/i, "");
  const value = withoutName
    .replace(/\/openapi\/v2\/rhart-image-n-g31-flash-official\/image-to-image\/?$/i, "")
    .replace(/\/openapi\/v2\/rhart-image-n-g31-flash\/image-to-image\/?$/i, "")
    .replace(/\/openapi\/v2\/rhart-image-g-2\/image-to-image\/?$/i, "")
    .replace(/\/openapi\/v2\/rhart-image-g-2-official\/image-to-image\/?$/i, "")
    .replace(/\/openapi\/v2\/query\/?$/i, "")
    .replace(/\/v1\/rhart-image-n-g31-flash\/image-to-image\/?$/i, "")
    .replace(/\/rhart-image-n-g31-flash\/image-to-image\/?$/i, "")
    .replace(/\/rhart-image-g-2\/image-to-image\/?$/i, "")
    .replace(/\/rhart-image-g-2-official\/image-to-image\/?$/i, "")
    .replace(/\/rhart-image-n-g31-flash-official\/image-to-image\/?$/i, "")
    .replace(/\/openapi\/v2\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");
  if (/^https?:\/\//i.test(value)) return value;
  return RHART_DEFAULT_BASE;
}

function buildRhartEndpoint(model = RHART_MODEL) {
  const explicit = sanitizeHeaderValue(process.env.RHART_ENDPOINT_URL || process.env.RHART_G31_ENDPOINT_URL);
  if (/^https?:\/\//i.test(explicit)) return explicit;
  if (explicit) return explicit;
  const base = getRhartBaseUrl();
  const endpointPath = RHART_ENDPOINT_PATHS[normalizeRhartModel(model)] || RHART_ENDPOINT_PATHS[RHART_MODEL];
  return new URL(endpointPath.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).toString();
}

function buildRhartQueryEndpoint() {
  const explicit = sanitizeHeaderValue(process.env.RHART_QUERY_ENDPOINT_URL || process.env.RHART_G31_QUERY_ENDPOINT_URL);
  if (/^https?:\/\//i.test(explicit)) return explicit;
  const base = getRhartBaseUrl();
  return new URL(RHART_QUERY_PATH.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).toString();
}

function buildRhartUploadEndpoint() {
  const explicit = sanitizeHeaderValue(process.env.RHART_UPLOAD_ENDPOINT_URL || process.env.RHART_G31_UPLOAD_ENDPOINT_URL);
  if (/^https?:\/\//i.test(explicit)) return explicit;
  const base = getRhartBaseUrl();
  return new URL(RHART_UPLOAD_PATH.replace(/^\/+/, ""), `${base.replace(/\/+$/, "")}/`).toString();
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

async function proxyImage(req, res) {
  const src = String(req.query?.src || "");
  if (!src || !isImageReferenceValue(src)) {
    res.status(400).json({ error: "Missing image src" });
    return;
  }
  try {
    const provider = normalizeProvider(req.query?.provider);
    const apiKey = provider === "rhart" ? getRhartKey() : "";
    const { buffer, contentType } = await readImageBytes(src, {
      apiKey,
      referer: provider === "rhart" ? getRhartBaseUrl() : "",
    });
    if (!/^image\//i.test(contentType)) {
      res.status(502).json({
        error: "Upstream did not return an image",
        contentType,
      });
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(buffer);
  } catch (error) {
    res.status(502).json({
      error: "Image proxy failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildImageProxyUrl(req, imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return "";
  if (/^data:image\//i.test(imageUrl)) return imageUrl;
  const query = new URLSearchParams({
    provider: "rhart",
    image: "1",
    src: imageUrl,
  });
  return `${getRequestPath(req)}?${query.toString()}`;
}

function getRequestPath(req) {
  const raw = String(req.url || "/api/generate-image");
  return raw.split("?")[0] || "/api/generate-image";
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    if (req.query?.image === "1") {
      await proxyImage(req, res);
      return;
    }

    const taskId = req.query?.taskId;
    if (!taskId) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const rawProvider = String(req.query?.provider || "");
    const provider = normalizeProvider(rawProvider);
    const rayinRoute = provider === "rayinai" ? normalizeRayinRoute(rawProvider) : "bunana";
    const apiKey = provider === "rayinai"
      ? getRayinAiKey(rayinRoute)
      : provider === "rhart"
        ? getRhartKey()
        : provider === "aihubmix"
          ? getAiHubMixKey()
        : getApiMartKey(req.query?.apimartChannel);
    if (!apiKey) {
      res.status(500).json({
        error: provider === "rayinai"
          ? "RAYINAI_API_KEY is not configured"
          : provider === "rhart"
            ? "RHART_G31_API_KEY / RHART_API_KEY is not configured"
            : provider === "aihubmix"
              ? "AIHUBMIX_API_KEY is not configured"
            : "APIMART_API_KEY_2 is not configured",
        message: provider === "rayinai"
          ? "Please configure RAYINAI_API_KEY in Vercel Environment Variables."
          : provider === "rhart"
            ? "Please configure RHART_G31_API_KEY or RHART_API_KEY in Vercel Environment Variables."
            : provider === "aihubmix"
              ? "Please configure AIHUBMIX_API_KEY in Vercel Environment Variables."
          : "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
      });
      return;
    }

    try {
      const taskPayload = provider === "rayinai"
          ? await getRayinTask(apiKey, String(taskId), rayinRoute)
        : provider === "rhart"
          ? await getRhartTask(apiKey, String(taskId))
          : await getTask(apiKey, String(taskId));
      const status = getTaskStatus(taskPayload);
      const rawImageUrl = provider === "rhart" ? extractRhartResultUrl(taskPayload) : extractResultUrl(taskPayload);
      const imageUrl = provider === "rhart"
        ? buildImageProxyUrl(req, rawImageUrl)
        : await persistResultImage(rawImageUrl, taskId);
      res.status(200).json({
        taskId,
        status,
        imageUrl,
        rawImageUrl: provider === "rhart" ? rawImageUrl : undefined,
        provider,
        rayinEndpoint: taskPayload?.rayinEndpoint,
        rhartEndpoint: taskPayload?.rhartEndpoint,
        message: formatUpstreamError(taskPayload),
        payload: imageUrl ? undefined : taskPayload,
      });
    } catch (error) {
      const upstream = parseErrorPayload(error);
      res.status(500).json({
        error: "Task polling failed",
        message: upstream ? formatUpstreamError(upstream) : error instanceof Error ? error.message : String(error),
        upstream,
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
  const aiHubMixKey = getAiHubMixKey();
  const preferredProvider = normalizeProvider(provider || process.env.IMAGE_PROVIDER || "apimart");
  const preferredRayinRoute = preferredProvider === "rayinai" ? normalizeRayinRoute(provider || model) : "bunana";
  const rayinAiKey = getRayinAiKey(preferredRayinRoute);
  if (preferredProvider === "aihubmix" && !aiHubMixKey) {
    res.status(500).json({
      error: "AIHUBMIX_API_KEY is not configured",
      message: "Please configure AIHUBMIX_API_KEY in Vercel Environment Variables.",
    });
    return;
  }
  if (preferredProvider === "rhart" && !rhartKey) {
    res.status(500).json({
      error: "RHART_G31_API_KEY / RHART_API_KEY is not configured",
      message: "Please configure RHART_G31_API_KEY or RHART_API_KEY in Vercel Environment Variables.",
    });
    return;
  }
  if (!apiKey && preferredProvider !== "rayinai" && preferredProvider !== "rhart" && preferredProvider !== "aihubmix") {
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
      provider,
    });
    if (preferredProvider === "aihubmix") {
      const aiHubMixSubmitBody = buildAiHubMixSubmitBody(requestContext);
      const aiHubMixResult = await submitAiHubMixImageTask(aiHubMixKey, aiHubMixSubmitBody);
      if (aiHubMixResult.ok) {
        const imageUrl = await persistResultImage(extractResultUrl(aiHubMixResult.payload), `aihubmix-${Date.now()}`);
        res.status(200).json({
          status: "completed",
          imageUrl,
          model: aiHubMixSubmitBody.model,
          provider: "aihubmix",
          payload: imageUrl ? undefined : aiHubMixResult.payload,
        });
        return;
      }

      res.status(aiHubMixResult.status || 502).json({
        error: "AIHubMix submit failed",
        message: formatUpstreamError(aiHubMixResult.payload),
        upstream: aiHubMixResult.payload,
        request: {
          model: aiHubMixSubmitBody.model,
          size: aiHubMixSubmitBody.size,
          quality: aiHubMixSubmitBody.quality,
          output_format: aiHubMixSubmitBody.output_format,
          referenceCount: aiHubMixSubmitBody.image_urls?.length || 0,
        },
      });
      return;
    }

    if (preferredProvider === "rhart") {
      const rhartSubmitBody = buildRhartSubmitBody(requestContext);
      const rhartResult = await submitRhartImageTask(rhartKey, rhartSubmitBody);
      if (rhartResult.ok) {
        const rawImageUrl = extractRhartResultUrl(rhartResult.payload);
        const imageUrl = buildImageProxyUrl(req, rawImageUrl);
        const taskId = extractTaskId(rhartResult.payload);
        if (!imageUrl && !taskId) {
          res.status(502).json({
            error: "RHarT submit returned no taskId or image",
            message: "RHarT 上游已响应，但响应里没有可识别的 taskId 或图片地址。",
            upstream: rhartResult.payload,
          });
          return;
        }
        res.status(imageUrl ? 200 : 202).json({
          taskId,
          status: imageUrl ? "completed" : "submitted",
          imageUrl,
          rawImageUrl,
          model: rhartSubmitBody.model,
          provider: "rhart",
          payload: imageUrl ? undefined : rhartResult.payload,
        });
        return;
      }

      res.status(rhartResult.status || 502).json({
        error: "RHarT submit failed",
        message: formatUpstreamError(rhartResult.payload),
        upstream: rhartResult.payload,
        request: {
          model: rhartSubmitBody.model,
          size: rhartSubmitBody.size,
          quality: rhartSubmitBody.quality,
          aspectRatio: rhartSubmitBody.aspectRatio,
          resolution: rhartSubmitBody.resolution,
          referenceCount: rhartSubmitBody.referenceCount || 0,
          publicReferenceCount: rhartSubmitBody.publicReferenceCount || 0,
          rhartEndpoint: rhartResult.payload?.rhartEndpoint || buildRhartEndpoint(rhartSubmitBody.model),
          rhartKeyHint: getKeyHint(rhartKey),
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
          rayinBaseUrl: getRayinAiBaseUrl(rayinSubmitBody.rayin_route),
          rayinApiKeyConfigured: Boolean(rayinAiKey),
          rayinRoute: rayinSubmitBody.rayin_route,
          referenceCount: rayinSubmitBody.image_urls?.length || 0,
          upstreamStatus: rayinResult.status || "",
          upstreamMessage: findMessage(rayinResult.payload),
        },
      });
      return;
    }

    if (!apiKey) {
      res.status(500).json({
        error: "APIMART_API_KEY_2 is not configured",
        message: "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
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
  if (provider === "aihubmix" || provider === "ai-hub-mix" || provider === "aihub") return "aihubmix";
  if (provider === "rhart" || provider === "rhart-g31" || provider === "rhart-image-n-g31-flash/image-to-image" || provider === "rhart-image-g-2/image-to-image" || provider === "rhart-image-g-2-official/image-to-image") return "rhart";
  if (provider === "rayinai" || provider === "rayincode" || provider.startsWith("rayinai:")) return "rayinai";
  return "apimart";
}

function normalizeRhartModel(value) {
  const model = String(value || "").trim().replace(/^\/+/, "");
  if (model === "rhart-image-g-2/image-to-image" || model === "rhart-g2" || model === "g-2" || model === "g2") {
    return "rhart-image-g-2/image-to-image";
  }
  if (model === "rhart-image-g-2-official/image-to-image" || model === "rhart-g2-official" || model === "g-2-official" || model === "g2-official") {
    return "rhart-image-g-2-official/image-to-image";
  }
  return RHART_MODEL;
}

function isImageReferenceValue(value) {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:image\//i.test(value));
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildImageRequestContext(body) {
  const provider = normalizeProvider(body.provider);
  const rawModel = String(body.model || "");
  const rawProvider = String(body.provider || "");
  const model = provider === "rhart" ? normalizeRhartModel(body.model) : normalizeModel(body.model);
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
    rayin_route: provider === "rayinai" ? normalizeRayinRoute(rawProvider || rawModel) : "",
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
    rayin_route: context.rayin_route || "bunana",
    prompt: context.prompt,
    n: context.n || 1,
    output_format: context.output_format || "png",
    quality: context.quality || "auto",
    size: context.size || "auto",
  };
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
  const publicImageUrls = imageUrls.filter((url) => /^https?:\/\//i.test(url));
  const next = {
    model: RHART_MODEL,
    imageUrls: publicImageUrls,
    sourceImageUrls: imageUrls,
    prompt: buildRhartPrompt(context),
    aspectRatio: sizeToAspectRatio(context.size),
    resolution: qualityToRhartResolution(context.quality),
  };
  if (Array.isArray(context.structure_image_urls) && context.structure_image_urls.length) {
    next.structureImageUrls = context.structure_image_urls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 4);
  }
  if (Array.isArray(context.style_image_urls) && context.style_image_urls.length) {
    next.styleImageUrls = context.style_image_urls.filter((url) => /^https?:\/\//i.test(url)).slice(0, 4);
  }
  next.referenceCount = imageUrls.length;
  next.publicReferenceCount = publicImageUrls.length;
  return next;
}

function buildRhartPrompt(context) {
  const structureCount = Array.isArray(context.structure_image_urls) ? context.structure_image_urls.length : 0;
  const styleCount = Array.isArray(context.style_image_urls) ? context.style_image_urls.length : 0;
  if (!structureCount && !styleCount) return context.prompt;
  return [
    "参考图说明：imageUrls 按顺序传入。前面的结构图用于锁定构图、镜头、空间关系、物体位置、场景内容和画布比例；后面的风格图只用于色块笔触、美术样式、色彩氛围、光影和质感。",
    structureCount ? `前 ${structureCount} 张是渲染结构图，必须优先保持其结构、内容和物体位置。` : "",
    styleCount ? `随后 ${styleCount} 张是风格参考图，只提取风格，不照搬其构图或对象。` : "",
    context.basePrompt || context.prompt,
  ].filter(Boolean).join("\n");
}

function qualityToRhartResolution(quality) {
  const value = String(quality || "").trim().toLowerCase();
  if (value === "4k" || value === "high" || value === "ultra") return "4k";
  if (value === "2k" || value === "medium" || value === "hd") return "2k";
  return "1k";
}

function sizeToAspectRatio(size) {
  const value = String(size || "").trim().toLowerCase().replace("*", "x").replace("×", "x");
  const allowed = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "1:4", "4:1", "1:8", "8:1"]);
  if (allowed.has(value)) return value;
  const known = {
    "1024x1024": "1:1",
    "1536x864": "16:9",
    "864x1536": "9:16",
  };
  if (known[value]) return known[value];
  const match = value.match(/^(\d{3,5})x(\d{3,5})$/);
  if (!match) return "16:9";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "16:9";
  return reduceAspectRatio(width, height);
}

function reduceAspectRatio(width, height) {
  const divisor = greatestCommonDivisor(width, height);
  const reducedWidth = Math.round(width / divisor);
  const reducedHeight = Math.round(height / divisor);
  const allowed = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9", "1:4", "4:1", "1:8", "8:1"]);
  const ratio = `${reducedWidth}:${reducedHeight}`;
  if (allowed.has(ratio)) return ratio;
  return closestAllowedAspectRatio(width, height);
}

function closestAllowedAspectRatio(width, height) {
  const ratio = Number(width) / Number(height);
  if (!Number.isFinite(ratio) || ratio <= 0) return "16:9";
  const allowed = [
    ["1:1", 1],
    ["16:9", 16 / 9],
    ["9:16", 9 / 16],
    ["4:3", 4 / 3],
    ["3:4", 3 / 4],
    ["3:2", 3 / 2],
    ["2:3", 2 / 3],
    ["5:4", 5 / 4],
    ["4:5", 4 / 5],
    ["21:9", 21 / 9],
    ["1:4", 1 / 4],
    ["4:1", 4],
    ["1:8", 1 / 8],
    ["8:1", 8],
  ];
  return allowed.reduce((best, item) => {
    const distance = Math.abs(Math.log(ratio / item[1]));
    return distance < best.distance ? { value: item[0], distance } : best;
  }, { value: "16:9", distance: Infinity }).value;
}

function greatestCommonDivisor(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function buildAiHubMixSubmitBody(context) {
  const imageUrls = Array.isArray(context.image_urls) ? context.image_urls.filter(isImageReferenceValue).slice(0, 8) : [];
  return {
    model: getAiHubMixModel(context.model),
    prompt: context.prompt,
    n: context.n || 1,
    output_format: context.output_format || "png",
    quality: "auto",
    size: context.size || "auto",
    image_urls: imageUrls,
    structure_image_urls: Array.isArray(context.structure_image_urls) ? context.structure_image_urls.filter(isImageReferenceValue).slice(0, 4) : [],
    style_image_urls: Array.isArray(context.style_image_urls) ? context.style_image_urls.filter(isImageReferenceValue).slice(0, 4) : [],
  };
}

async function submitAiHubMixImageTask(apiKey, body) {
  const baseUrl = getAiHubMixBaseUrl();
  const hasReferences = Array.isArray(body.image_urls) && body.image_urls.length > 0;
  try {
    const response = hasReferences
      ? await submitAiHubMixImageEdit(apiKey, baseUrl, body)
      : await fetch(`${baseUrl}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: body.model,
            prompt: body.prompt,
            n: body.n || 1,
            size: body.size || "auto",
            quality: body.quality || "auto",
            output_format: body.output_format || "png",
          }),
        });
    const payload = await readJson(response);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.aihubmixEndpoint = response.url || `${baseUrl}/images/${hasReferences ? "edits" : "generations"}`;
    }
    const imageUrl = extractResultUrl(payload);
    return {
      ok: response.ok && Boolean(imageUrl),
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: "AIHubMix request failed before reaching upstream",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function submitAiHubMixImageEdit(apiKey, baseUrl, body) {
  const form = new FormData();
  form.set("model", body.model);
  form.set("prompt", body.prompt);
  form.set("n", String(body.n || 1));
  form.set("size", body.size || "auto");
  form.set("quality", body.quality || "auto");
  form.set("output_format", body.output_format || "png");
  const images = uniqueValues([
    ...(Array.isArray(body.structure_image_urls) ? body.structure_image_urls : []),
    ...(Array.isArray(body.style_image_urls) ? body.style_image_urls : []),
    ...(Array.isArray(body.image_urls) ? body.image_urls : []),
  ].filter(isImageReferenceValue)).slice(0, 8);
  for (let index = 0; index < images.length; index += 1) {
    const { blob, filename } = await imageReferenceToBlob(images[index], `reference-${index + 1}.png`);
    form.append(images.length > 1 ? "image[]" : "image", blob, filename);
  }
  return fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
}

async function imageReferenceToBlob(value, filename) {
  const { buffer, contentType } = await readImageBytes(value);
  const extension = contentTypeToExtension(contentType);
  return {
    blob: new Blob([buffer], { type: contentType }),
    filename: filename.replace(/\.[^.]+$/, `.${extension}`),
  };
}

async function submitRhartImageTask(apiKey, body) {
  const endpoint = buildRhartEndpoint(body.model);
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: "RHART_ENDPOINT_URL / RHART_BASE_URL is invalid",
        message: endpoint
          ? `RHarT 是独立生成后端，但当前 endpoint 不是完整 URL：${endpoint}。请把 RHART_ENDPOINT_URL 配成 https:// 开头的完整接口地址。`
          : "RHarT 是独立生成后端，请配置 RHART_ENDPOINT_URL 为完整 image-to-image 接口地址，或配置 RHART_BASE_URL 为该平台域名。",
        rhartEndpoint: endpoint || "",
      },
    };
  }
  const resolvedReferences = await resolveRhartImageUrls(apiKey, body.sourceImageUrls || body.imageUrls || []);
  const imageUrls = resolvedReferences.urls;
  if (!imageUrls.length) {
    const uploadSummary = formatRhartUploadAttempts(resolvedReferences.uploadAttempts);
    return {
      ok: false,
      status: 400,
      payload: {
        error: "RHarT requires public imageUrls",
        message: `RunningHub RHarT 图生图接口要求 imageUrls。后端尝试上传本地参考图后仍没有拿到可用 URL，请检查图片上传接口或密钥权限。${uploadSummary ? ` 上传摘要：${uploadSummary}` : ""}`,
        rhartEndpoint: endpoint,
        referenceCount: body.referenceCount || 0,
        publicReferenceCount: imageUrls.length,
        uploadAttempts: resolvedReferences.uploadAttempts,
      },
    };
  }
  const submitBody = {
    imageUrls,
    prompt: body.prompt,
    aspectRatio: body.aspectRatio || "16:9",
    resolution: body.resolution || "1k",
  };
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submitBody),
    });
  } catch (error) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: "RHarT request failed before reaching upstream",
        message: error instanceof Error ? error.message : String(error),
        rhartEndpoint: endpoint,
      },
    };
  }
  const payload = await readJson(response);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    payload.rhartEndpoint = endpoint;
    payload.rhartRequest = {
      model: body.model,
      aspectRatio: submitBody.aspectRatio,
      resolution: submitBody.resolution,
      referenceCount: body.referenceCount || 0,
      publicReferenceCount: imageUrls.length,
      uploadAttempts: resolvedReferences.uploadAttempts,
    };
  }
  const imageUrl = extractRhartResultUrl(payload);
  const taskId = extractTaskId(payload);
  return {
    ok: response.ok && Boolean(imageUrl || taskId),
    status: response.status,
    payload,
  };
}

async function resolveRhartImageUrls(apiKey, imageUrls) {
  const resolved = [];
  const uploadAttempts = [];
  const references = imageUrls.filter(isImageReferenceValue).slice(0, 14);
  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index];
    if (/^https?:\/\//i.test(reference)) {
      resolved.push(reference);
      continue;
    }
    if (/^data:image\//i.test(reference)) {
      const uploadResult = await uploadRhartImageReference(apiKey, reference, index);
      const uploaded = uploadResult.url;
      uploadAttempts.push(uploadResult.report);
      if (uploaded) resolved.push(uploaded);
    }
  }
  return {
    urls: uniqueValues(resolved).slice(0, 14),
    uploadAttempts,
  };
}

async function uploadRhartImageReference(apiKey, imageUrl, index) {
  const endpoint = buildRhartUploadEndpoint();
  const { buffer, contentType } = await readImageBytes(imageUrl);
  const extension = contentTypeToExtension(contentType);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), `reference-${index + 1}.${extension}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(JSON.stringify({
      error: "RHarT reference upload failed",
      message: formatUpstreamError(payload),
      rhartEndpoint: endpoint,
      upstream: payload,
    }));
  }
  return {
    url: extractUploadUrl(payload),
    report: summarizeRhartUploadPayload(response.status, endpoint, payload),
  };
}

function extractUploadUrl(payload) {
  const candidates = [
    payload?.data?.download_url,
    payload?.data?.downloadUrl,
    payload?.data?.url,
    payload?.data?.file_url,
    payload?.data?.fileUrl,
    payload?.data?.image_url,
    payload?.data?.imageUrl,
    payload?.data?.view_url,
    payload?.data?.viewUrl,
    payload?.download_url,
    payload?.downloadUrl,
    payload?.url,
    payload?.file_url,
    payload?.fileUrl,
    payload?.image_url,
    payload?.imageUrl,
    payload?.view_url,
    payload?.viewUrl,
  ];
  if (Array.isArray(payload?.data)) {
    candidates.push(
      payload.data[0]?.download_url,
      payload.data[0]?.downloadUrl,
      payload.data[0]?.url,
      payload.data[0]?.file_url,
      payload.data[0]?.fileUrl,
      payload.data[0]?.image_url,
      payload.data[0]?.imageUrl,
      payload.data[0]?.view_url,
      payload.data[0]?.viewUrl,
    );
  }
  const direct = candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) || findImageUrl(payload);
  if (direct) return direct;
  const filename = extractRunningHubFilename(payload);
  return filename ? buildRunningHubViewUrl(filename) : "";
}

function extractRunningHubFilename(payload) {
  const candidates = [
    payload?.data?.filename,
    payload?.data?.fileName,
    payload?.data?.file_name,
    payload?.data?.name,
    payload?.data?.key,
    payload?.filename,
    payload?.fileName,
    payload?.file_name,
    payload?.name,
    payload?.key,
  ];
  if (Array.isArray(payload?.data)) {
    candidates.push(
      payload.data[0]?.filename,
      payload.data[0]?.fileName,
      payload.data[0]?.file_name,
      payload.data[0]?.name,
      payload.data[0]?.key,
    );
  }
  return candidates.find((value) => typeof value === "string" && value.trim()) || "";
}

function buildRunningHubViewUrl(filename) {
  const base = getRhartBaseUrl().replace(/\/+$/, "");
  return `${base}/view?filename=${encodeURIComponent(String(filename).trim())}`;
}

function summarizeRhartUploadPayload(status, endpoint, payload) {
  return {
    status,
    endpoint,
    code: payload?.code,
    message: payload?.message || payload?.msg || payload?.error || "",
    dataKeys: payload?.data && typeof payload.data === "object" ? Object.keys(payload.data).slice(0, 20) : [],
    url: extractUploadUrl(payload),
    filename: extractRunningHubFilename(payload),
  };
}

function formatRhartUploadAttempts(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return "";
  return attempts.map((attempt, index) => {
    const parts = [`#${index + 1}`];
    if (attempt.status) parts.push(`status=${attempt.status}`);
    if (attempt.code !== undefined && attempt.code !== null) parts.push(`code=${attempt.code}`);
    if (attempt.message) parts.push(`message=${String(attempt.message).slice(0, 120)}`);
    if (attempt.url) parts.push(`url=${attempt.url}`);
    if (attempt.filename) parts.push(`filename=${attempt.filename}`);
    if (Array.isArray(attempt.dataKeys) && attempt.dataKeys.length) parts.push(`dataKeys=${attempt.dataKeys.join("|")}`);
    return parts.join(", ");
  }).join("; ");
}

async function getRhartTask(apiKey, taskId) {
  const endpoint = buildRhartQueryEndpoint();
  const attempts = [
    { taskId },
    { apiKey, taskId },
    { task_id: taskId },
    { api_key: apiKey, taskId },
  ];
  let lastPayload = null;
  let lastStatus = 0;
  for (const body of attempts) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.rhartEndpoint = endpoint;
      payload.rhartQueryShape = Object.keys(body).join(",");
    }
    if (response.ok && !isRhartQueryRejected(payload)) return payload;
    lastPayload = payload;
    lastStatus = response.status;
  }
  const error = new Error(JSON.stringify(lastPayload || { error: "RHarT query failed", status: lastStatus }));
  error.status = lastStatus;
  throw error;
}

function isRhartQueryRejected(payload) {
  const code = String(payload?.errorCode || payload?.code || payload?.data?.errorCode || payload?.data?.code || "").trim();
  const status = String(payload?.status || payload?.data?.status || "").toUpperCase();
  if (status === "FAILED") return false;
  return Boolean(code && code !== "0");
}

function shouldTryRayinAi(provider, model, apiKey) {
  if (!apiKey) return false;
  return provider === "rayinai";
}

function formatUpstreamError(payload) {
  const message = findMessage(payload);
  if (/Access Denied.*Standard Model API.*Enterprise-Shared API Keys|标准模型API权限|企业级.*共享API Key|Enterprise-Shared API Keys/i.test(message)) {
    return "RHarT 调用被 RunningHub 拒绝：当前 API Key 没有该接口权限。请确认 RunningHub 后台 key 权限，或确认所选 RHarT 接口已对你的 key 开通。";
  }
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
  if (/RayinAI structure-style references unsupported/i.test(message)) {
    return "RayinAI 多参考图请求失败：请查看 endpoint、model、refs 和 upstream 详情。";
  }
  return message || "Image generation request failed.";
}

function findMessage(value, seen = new Set()) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  const direct = value.errorMessage || value.failedReason || value.promptTips || value.message || value.error || value.detail || value.code || value.errorCode;
  const directMessage = findMessage(direct, seen);
  if (directMessage) return directMessage;
  for (const item of Object.values(value)) {
    const nested = findMessage(item, seen);
    if (nested) return nested;
  }
  return "";
}

function parseErrorPayload(error) {
  const text = error instanceof Error ? error.message : String(error || "");
  if (!text || !/^[\[{]/.test(text.trim())) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeModel(model) {
  const value = String(model || "").trim();
  if (value === "gemini-3-pro-image-preview") return "gemini-3-pro-image-preview";
  if (/^(midjourney|mj)$/i.test(value)) return "midjourney";
  if (value === "rhart-image-n-g31-flash/image-to-image" || value === "/rhart-image-n-g31-flash/image-to-image") return "gpt-image-2";
  if (value.toLowerCase().startsWith("rayinai:")) return "gpt-image-2";
  if (value === "gpt-image-2" || value === "GPT Image 2" || value === "GPT图像2") return "gpt-image-2";
  return "gpt-image-2-official";
}

function normalizeRayinRoute(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["rayinai:mumu", "mumu", "木木"].includes(raw)) return "mumu";
  if (["rayinai:tiancai", "tiancai", "甜菜"].includes(raw)) return "tiancai";
  if (["rayinai:kaihua", "kaihua", "开花"].includes(raw)) return "kaihua";
  if (["rayinai:haizhe", "haizhe", "海蜇"].includes(raw)) return "haizhe";
  return "bunana";
}

function getRayinRoutePath(route) {
  const normalized = normalizeRayinRoute(route);
  const envMap = {
    bunana: process.env.RAYINAI_BUNANA_PATH,
    mumu: process.env.RAYINAI_MUMU_PATH,
    tiancai: process.env.RAYINAI_TIANCAI_PATH,
    kaihua: process.env.RAYINAI_KAIHUA_PATH,
    haizhe: process.env.RAYINAI_HAIZHE_PATH,
  };
  const configured = sanitizeHeaderValue(envMap[normalized] || "");
  if (configured) return configured;
  if (normalized === "bunana") return "";
  return "";
}

function getRayinRouteLabel(route) {
  return {
    bunana: "不拿拿",
    mumu: "木木",
    tiancai: "甜菜",
    kaihua: "开花",
    haizhe: "海蜇",
  }[normalizeRayinRoute(route)] || "不拿拿";
}

function getRayinRouteEnvName(route) {
  return {
    mumu: "RAYINAI_MUMU_PATH",
    tiancai: "RAYINAI_TIANCAI_PATH",
    kaihua: "RAYINAI_KAIHUA_PATH",
    haizhe: "RAYINAI_HAIZHE_PATH",
  }[normalizeRayinRoute(route)] || "RAYINAI_BUNANA_PATH";
}

function buildRayinRouteUrl(baseUrl, route, fallbackPath) {
  const path = getRayinRoutePath(route) || fallbackPath;
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(String(path || fallbackPath).replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function normalizeRayinModel(model) {
  const value = normalizeModel(model);
  if (value === "gpt-image-2-official") return "gpt-image-2";
  return value;
}

function normalizeQuality(quality, model) {
  const value = String(quality || "").trim().toLowerCase();
  if (!value) return "";
  if (isRhartModel(model)) {
    if (value === "low" || value === "standard" || value === "1k") return "1k";
    if (value === "medium" || value === "hd" || value === "2k") return "2k";
    if (value === "high" || value === "4k" || value === "ultra") return "4k";
    return value;
  }
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

function isRhartModel(model) {
  const value = String(model || "").trim().replace(/^\/+/, "");
  return Object.prototype.hasOwnProperty.call(RHART_ENDPOINT_PATHS, value)
    || ["rhart-g2", "g-2", "g2", "rhart-g2-official", "g-2-official", "g2-official"].includes(value);
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

async function materializeResultImage(imageUrl, taskId, options = {}) {
  if (!imageUrl || typeof imageUrl !== "string") return imageUrl;
  const persisted = await persistResultImage(imageUrl, taskId);
  if (persisted && persisted !== imageUrl) return persisted;
  if (!options.inlineFallback || /^data:image\//i.test(imageUrl)) return imageUrl;

  try {
    const { buffer, contentType } = await readImageBytes(imageUrl);
    return `data:${contentType || "image/png"};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("Failed to inline generated image:", error);
    return imageUrl;
  }
}

async function readImageBytes(imageUrl, options = {}) {
  if (/^data:image\//i.test(imageUrl)) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid image data URL");
    return {
      contentType: match[1] || "image/png",
      buffer: Buffer.from(match[2], "base64"),
    };
  }

  const response = await fetch(imageUrl, {
    cache: "no-store",
    headers: buildImageFetchHeaders(options),
  });
  if (!response.ok) {
    throw new Error(`Download generated image failed: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!/^image\//i.test(contentType) && !looksLikeImageBuffer(buffer)) {
    throw new Error(`Download generated image failed: upstream returned ${contentType}`);
  }
  return {
    contentType: /^image\//i.test(contentType) ? contentType : inferImageContentType(buffer),
    buffer,
  };
}

function buildImageFetchHeaders(options = {}) {
  const headers = {};
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
  if (options.referer) headers.Referer = options.referer;
  return headers;
}

function getKeyHint(value) {
  const key = sanitizeBearerToken(value);
  if (!key) return "empty";
  return `len:${key.length}, tail:${key.slice(-4)}`;
}

function looksLikeImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return true;
  if (buffer.slice(0, 3).toString("ascii") === "GIF") return true;
  return false;
}

function inferImageContentType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.slice(0, 3).toString("ascii") === "GIF") return "image/gif";
  return "image/png";
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

async function getRayinTask(apiKey, taskId, route = "bunana") {
  const baseUrl = getRayinAiBaseUrl(route);
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
      const taskPayload = findTaskById(payload, taskId) || payload;
      if (taskPayload !== payload && taskPayload && typeof taskPayload === "object" && !Array.isArray(taskPayload)) {
        taskPayload.rayinEndpoint = endpoint;
        return taskPayload;
      }
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
  const rayinRoute = normalizeRayinRoute(submitBody.rayin_route || submitBody.model);
  const imageBody = {
    ...submitBody,
    model: normalizeRayinModel(submitBody.model),
  };
  const rayinImageBody = normalizeRayinImageBody(imageBody);
  const models = getRayinAiResponsesModels();
  const attempts = [];
  for (const baseUrl of getRayinAiBaseUrls(rayinRoute)) {
    for (const model of models) {
      attempts.push({
        url: `${baseUrl}/v1/responses`,
        body: buildRayinResponsesBody(rayinImageBody, model),
        type: "responses",
        baseUrl,
      });
    }
  }
  let last = { ok: false, status: 0, payload: { error: "RayinAI request was not attempted" } };

  for (const attempt of attempts) {
    const baseHeaders = {
      Authorization: `Bearer ${apiKey}`,
      Accept: "*/*",
      Host: new URL(attempt.baseUrl).host,
      Connection: "keep-alive",
    };
    const jsonHeaders = {
      ...baseHeaders,
      "Content-Type": "application/json",
    };
    const { response, payload } = await fetchRayinWithRetry(
      attempt.url,
      attempt.multipart ? baseHeaders : jsonHeaders,
      attempt.body,
      { multipart: attempt.multipart },
    );
    const imageUrl = extractResultUrl(payload);
    const taskId = extractTaskId(payload);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const debugBody = attempt.debugBody || attempt.body || {};
      payload.rayinRequest = {
        model: debugBody?.model,
        type: attempt.type,
        route: attempt.route || rayinRoute,
        configuredPath: attempt.configuredPath || "",
        hasTools: Array.isArray(debugBody?.tools),
        contentTypes: debugBody?.input?.[0]?.content?.map((item) => item?.type).filter(Boolean) || [],
        referenceCount: getRayinAttemptReferenceCount(debugBody),
        inputRoles: getRayinAttemptInputRoles(debugBody),
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
    const hasNextRayinAttempt = attempts.indexOf(attempt) < attempts.length - 1;
    const canTryNextRayinModel = hasNextRayinAttempt && [400, 404, 422].includes(response.status);
    const canFallbackToNextRayinEndpoint = hasNextRayinAttempt && ([502, 503, 504, 524].includes(response.status) || retryableRayinMessage);
    if (!canTryNextRayinModel && !canFallbackToNextRayinEndpoint && ![404, 405, 429, 502, 503, 504, 524].includes(response.status) && !retryableRayinMessage) return last;
  }

  if (last?.payload && typeof last.payload === "object" && !Array.isArray(last.payload)) {
    last.payload.endpoint = attempts[attempts.length - 1]?.url;
    last.payload.status = last.status;
    last.payload.attemptedEndpoints = attempts.map((attempt) => attempt.url);
  }
  return last;
}

async function fetchRayinWithRetry(url, headers, body, options = {}) {
  let response;
  let payload;
  const maxAttempts = getRayinAiRetryAttempts();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await fetchWithTimeout(url, {
        method: "POST",
        headers,
        body: options.multipart ? body : JSON.stringify(body),
      }, getRayinFetchTimeoutMs());
      payload = await readJson(response);
    } catch (error) {
      payload = {
        error: "RayinAI request timeout",
        message: error instanceof Error ? error.message : String(error),
        endpoint: url,
      };
      response = { status: 524, ok: false };
    }
    const message = formatUpstreamError(payload);
    if (![429, 502, 503, 504, 524].includes(response.status) || attempt === maxAttempts - 1) return { response, payload };
    if (!isRetryableRayinMessage(message)) {
      return { response, payload };
    }
    await sleep(getRayinRetryDelay(attempt));
  }
  return { response, payload };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function getRayinRetryDelay(attempt) {
  const delays = [800, 1600, 3000, 5000];
  return delays[Math.min(attempt, delays.length - 1)];
}

function getRayinAttemptReferenceCount(body) {
  if (Array.isArray(body?.input)) {
    return body.input.reduce((total, message) => {
      const content = Array.isArray(message?.content) ? message.content : [];
      return total + content.filter((item) => item?.type === "input_image").length;
    }, 0);
  }
  if (Array.isArray(body?.input_images)) {
    return body.input_images.reduce((total, group) => total + (Array.isArray(group) ? group.length : 1), 0);
  }
  if (Array.isArray(body?.inputs)) return body.inputs.length;
  if (Array.isArray(body?.image_urls)) return body.image_urls.length;
  return 0;
}

function getRayinAttemptInputRoles(body) {
  if (Array.isArray(body?.input)) {
    return body.input.flatMap((message) => {
      const content = Array.isArray(message?.content) ? message.content : [];
      return content
        .filter((item) => item?.type === "input_text" && /^Input image \d+:/i.test(String(item?.text || "")))
        .map((item) => {
          const text = String(item.text || "");
          if (/STRUCTURE/i.test(text)) return "structure";
          if (/STYLE/i.test(text)) return "style";
          if (/EDIT BASE/i.test(text)) return "edit_base";
          return "reference";
        });
    });
  }
  if (Array.isArray(body?.input_images)) {
    return body.input_images.map((_, index) => {
      if (index === 0) return "structure";
      if (index === 1) return "style";
      return "reference";
    });
  }
  return Array.isArray(body?.inputs) ? body.inputs.map((item) => item?.role).filter(Boolean) : [];
}

function isRetryableRayinMessage(message) {
  return /RayinAI 上游暂时不可用|上游图片生成服务内部错误|temporarily unavailable|bad gateway|gateway timeout|timeout occurred|a timeout occurred|rate limit|too many requests|model.*capacity|capacity|overloaded|模型.*满载|模型.*繁忙|暂时不可用/i.test(String(message || ""));
}

function normalizeRayinImageBody(body) {
  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.filter(isImageReferenceValue) : [];
  const structureUrls = Array.isArray(body.structure_image_urls) ? body.structure_image_urls.filter(isImageReferenceValue) : [];
  const styleUrls = Array.isArray(body.style_image_urls) ? body.style_image_urls.filter(isImageReferenceValue) : [];
  const editUrls = Array.isArray(body.edit_image_urls) ? body.edit_image_urls.filter(isImageReferenceValue) : [];
  const references = uniqueArray([...structureUrls, ...styleUrls, ...editUrls, ...imageUrls]).slice(0, 16);
  const next = {
    model: normalizeRayinModel(body.model),
    rayin_route: normalizeRayinRoute(body.rayin_route || body.model),
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

function toRayinTaskInputImage(value) {
  const mimeType = getImageMimeType(value);
  if (/^data:image\//i.test(value)) {
    return { data_url: value, mime_type: mimeType };
  }
  return { url: value, mime_type: mimeType };
}

function getImageMimeType(value) {
  const match = typeof value === "string" ? value.match(/^data:([^;]+);base64,/i) : null;
  return match?.[1] || "image/png";
}

function uniqueArray(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildRayinResponsesBody(submitBody, model = getRayinAiResponsesModel()) {
  const imageUrls = getRayinOrderedImageUrls(submitBody);
  const styleUrls = getRayinStyleUrls(submitBody);
  const prompt = imageUrls.length
    ? [
        "You must use the attached input images as visual references.",
        "Reference roles are strict and must not be swapped.",
        "STRUCTURE reference controls scene content, architecture, camera, layout, perspective, scale, object placement, crop, and canvas ratio.",
        styleUrls.length
          ? "STYLE reference controls only palette, color temperature, brushwork, material finish, lighting mood, atmosphere, texture quality, and render style."
          : "",
        styleUrls.length ? "Do not copy the STYLE reference composition, objects, camera, perspective, or scene layout." : "",
        styleUrls.length ? "Do not let the STYLE reference replace or reinterpret the STRUCTURE reference content." : "",
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

async function buildRayinImagesEditForm(submitBody, model = getRayinAiResponsesModel()) {
  const form = new FormData();
  const images = getRayinOrderedImageUrls(submitBody).slice(0, 16);
  form.set("model", model);
  form.set("prompt", buildRayinStrictPrompt(submitBody, getRayinStructureAnchor(submitBody), getRayinStyleUrls(submitBody).length));
  form.set("n", String(submitBody.n || 1));
  form.set("size", submitBody.size || "auto");
  form.set("quality", submitBody.quality || "auto");
  form.set("output_format", submitBody.output_format || "png");
  form.set("provider", "gpt");
  form.set("operation", images.length ? "edit" : "generation");
  for (let index = 0; index < images.length; index += 1) {
    const { blob, filename } = await imageReferenceToBlob(images[index], `reference-${index + 1}.png`);
    form.append(images.length > 1 ? "image[]" : "image", blob, filename);
  }
  return form;
}

function buildRayinImagesEditDebugBody(submitBody, model = getRayinAiResponsesModel()) {
  const images = getRayinOrderedImageUrls(submitBody).slice(0, 16);
  return {
    model,
    prompt: buildRayinStrictPrompt(submitBody, getRayinStructureAnchor(submitBody), getRayinStyleUrls(submitBody).length),
    size: submitBody.size || "auto",
    quality: submitBody.quality || "auto",
    output_format: submitBody.output_format || "png",
    image_urls: images,
    input_images: images.map(toRayinTaskInputImage),
    inputs: buildRayinRoleInputs(submitBody, images),
  };
}

function buildRayinImagesBody(submitBody, model = getRayinAiResponsesModel(), options = {}) {
  const imageUrls = getRayinImageUrls(submitBody);
  const structureUrls = getRayinStructureUrls(submitBody);
  const styleUrls = getRayinStyleUrls(submitBody);
  const structureAnchor = getRayinStructureAnchor(submitBody);
  const structureOnlyUrls = getRayinStructureOnlyUrls(submitBody);
  const roleInputUrls = getRayinOrderedImageUrls(submitBody).slice(0, 16);
  if (options.minimal) {
    return {
      key_id: getRayinAiKeyId(submitBody.rayin_route),
      provider: "gpt",
      operation: roleInputUrls.length ? "edit" : "generation",
      model,
      prompt: submitBody.prompt,
      size: submitBody.size || "auto",
      aspect_ratio: "auto",
      base_resolution: "auto",
      quality: submitBody.quality || "auto",
      output_format: submitBody.output_format || "png",
      moderation: "auto",
      n: 1,
      input_images: roleInputUrls.map(toRayinTaskInputImage),
    };
  }
  const body = {
    key_id: getRayinAiKeyId(submitBody.rayin_route),
    provider: "gpt",
    operation: roleInputUrls.length ? "edit" : "generation",
    model,
    prompt: buildRayinStrictPrompt(submitBody, structureAnchor, styleUrls.length),
    n: 1,
    aspect_ratio: "auto",
    base_resolution: "auto",
    moderation: "auto",
    quality: submitBody.quality || "auto",
    size: submitBody.size || "auto",
  };
  if (submitBody.output_format) body.output_format = submitBody.output_format;
  if (structureOnlyUrls.length) {
    body.image = structureAnchor;
    body.image_url = structureAnchor;
    body.reference_image = structureAnchor;
    body.reference_image_url = structureAnchor;
    body.structure_image_url = structureAnchor;
    body.structure_image_urls = [structureAnchor];
    body.composition_image_url = structureAnchor;
    body.layout_image_url = structureAnchor;
    body.edit_image_url = structureAnchor;
    body.base_image_url = structureAnchor;
  }
  if (roleInputUrls.length) {
    body.image_urls = roleInputUrls;
    body.reference_image_urls = roleInputUrls;
    body.input_image_urls = roleInputUrls;
    body.images = roleInputUrls.map(toRayinInputImage);
    body.input_images = roleInputUrls.map(toRayinTaskInputImage);
    body.inputs = buildRayinRoleInputs(submitBody, roleInputUrls);
    body.references = body.inputs;
  }
  if (structureAnchor) {
    body.image = structureAnchor;
    body.image_url = structureAnchor;
    body.reference_image = structureAnchor;
    body.reference_image_url = structureAnchor;
    body.structure_image_url = structureAnchor;
    body.structure_image_urls = [structureAnchor];
    body.composition_image_url = structureAnchor;
    body.layout_image_url = structureAnchor;
    body.edit_image_url = structureAnchor;
    body.base_image_url = structureAnchor;
  }
  if (styleUrls.length) {
    body.style_image_urls = styleUrls;
    body.style_images = styleUrls.map(toRayinInputImage);
  }
  return body;
}

function buildRayinRoleInputs(submitBody, imageUrls) {
  return imageUrls.map((url, index) => {
    const role = getRayinImageRole(submitBody, url, index);
    const item = {
      type: "image",
      role,
      image_url: url,
      url,
      weight: index === 0 || role === "structure" ? 0.85 : 0.45,
    };
    if (/^data:image\//i.test(url)) {
      item.data_url = url;
      item.image_data_url = url;
      item.source_data_url = url;
    }
    return item;
  });
}

function getRayinImageUrls(submitBody) {
  return Array.isArray(submitBody.image_urls) ? submitBody.image_urls.filter(isImageReferenceValue).slice(0, 16) : [];
}

function getRayinStructureUrls(submitBody) {
  return Array.isArray(submitBody.structure_image_urls) ? submitBody.structure_image_urls.filter(isImageReferenceValue).slice(0, 4) : [];
}

function getRayinStyleUrls(submitBody) {
  return Array.isArray(submitBody.style_image_urls) ? submitBody.style_image_urls.filter(isImageReferenceValue).slice(0, 4) : [];
}

function getRayinEditUrls(submitBody) {
  return Array.isArray(submitBody.edit_image_urls) ? submitBody.edit_image_urls.filter(isImageReferenceValue).slice(0, 4) : [];
}

function getRayinStructureAnchor(submitBody) {
  return getRayinStructureUrls(submitBody)[0] || getRayinEditUrls(submitBody)[0] || getRayinImageUrls(submitBody)[0] || "";
}

function getRayinStructureOnlyUrls(submitBody) {
  const structureAnchor = getRayinStructureAnchor(submitBody);
  return uniqueArray([
    ...getRayinStructureUrls(submitBody),
    ...getRayinEditUrls(submitBody),
    structureAnchor,
  ].filter(isImageReferenceValue));
}

function getRayinOrderedImageUrls(submitBody) {
  const imageUrls = getRayinImageUrls(submitBody);
  const styleUrls = getRayinStyleUrls(submitBody);
  const structureOnlyUrls = getRayinStructureOnlyUrls(submitBody);
  return uniqueArray([
    ...structureOnlyUrls,
    ...styleUrls,
    ...imageUrls.filter((url) => !styleUrls.includes(url) && !structureOnlyUrls.includes(url)),
  ]).slice(0, 16);
}

function getRayinImageRole(submitBody, url, index = 0) {
  const structureUrls = Array.isArray(submitBody.structure_image_urls) ? submitBody.structure_image_urls : [];
  const styleUrls = Array.isArray(submitBody.style_image_urls) ? submitBody.style_image_urls : [];
  const editUrls = Array.isArray(submitBody.edit_image_urls) ? submitBody.edit_image_urls : [];
  if (structureUrls.includes(url) || index === 0) return "structure";
  if (styleUrls.includes(url)) return "style";
  if (editUrls.includes(url)) return "edit_base";
  return "reference";
}

function buildRayinStrictPrompt(submitBody, structureAnchor, styleCount) {
  if (!structureAnchor) return submitBody.prompt;
  const userPrompt = extractRayinUserPrompt(submitBody.prompt);
  return [
    "输入图一是渲染结构图。必须以图一为最终画面的空间蓝图：场景类型、构图、镜头角度、透视、墙地关系、开口位置、主体轮廓、物体位置、裁切和画幅比例都以图一为准。",
    styleCount > 0
      ? "输入图二是风格参考图。图二只用于参考色块笔触、美术样式、色彩氛围、材质质感、光照气质和渲染完成度；禁止采用图二的构图、镜头、场景内容或物体位置。"
      : "",
    styleCount > 0
      ? "请按照图二的风格重建图一。最终结果必须看起来是图一的场景结构被重新渲染，而不是图二的场景，也不是无关新场景。"
      : "请重建图一，不要生成无关新场景。",
    "不要像素级照搬图一的模糊、压缩、污渍和偶然小细节；只重建结构和主要内容，并提升材质、光照、边缘清晰度和整体完成度。",
    "如果文字要求、风格参考和结构图冲突，以图一的空间结构和内容为最高优先级。",
    userPrompt,
  ].filter(Boolean).join("\n");
}

function extractRayinUserPrompt(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return "";
  const markers = [
    "User request and existing role instructions:",
    "用户需求：",
    "需求：",
  ];
  for (const marker of markers) {
    const index = text.lastIndexOf(marker);
    if (index >= 0) {
      return text.slice(index + marker.length).trim().slice(0, 1200);
    }
  }
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const useful = lines.filter((line) => !/^(Reference binding tags:|GPT Image 2 binding rules:|@渲染结构图|@风格参考图|Final image:|Keep local|Red light rule:|- )/i.test(line));
  return (useful.length ? useful.slice(-6) : lines.slice(-6)).join("\n").slice(0, 1200);
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
  const status = payload?.data?.status || payload?.status || payload?.data?.state || payload?.state || "unknown";
  const normalized = String(status || "").toUpperCase();
  if (normalized === "SUCCESS") return "completed";
  if (normalized === "FAILED") return "failed";
  if (normalized === "RUNNING" || normalized === "QUEUED") return normalized.toLowerCase();
  return status;
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
  if (payload?.data?.taskId) return String(payload.data.taskId);
  if (payload?.data?.task_id) return String(payload.data.task_id);
  if (payload?.data?.task_no) return String(payload.data.task_no);
  if (payload?.data?.taskNo) return String(payload.data.taskNo);
  if (payload?.data?.id) return String(payload.data.id);
  if (payload?.taskId) return String(payload.taskId);
  if (payload?.taskNo) return String(payload.taskNo);
  if (payload?.task?.id) return String(payload.task.id);
  if (payload?.task?.task_id) return String(payload.task.task_id);
  if (payload?.task?.task_no) return String(payload.task.task_no);
  if (payload?.task?.taskId) return String(payload.task.taskId);
  if (payload?.task?.taskNo) return String(payload.task.taskNo);
  if (payload?.task_no) return String(payload.task_no);
  if (payload?.task_id) return String(payload.task_id);
  if (payload?.id) return String(payload.id);
  if (Array.isArray(payload?.data) && payload.data[0]?.task_id) {
    return String(payload.data[0].task_id);
  }
  return findTaskId(payload);
}

function findTaskId(value, seen = new Set()) {
  if (!value || typeof value !== "object") return null;
  if (seen.has(value)) return null;
  seen.add(value);
  const keys = ["taskId", "task_id", "taskNo", "task_no"];
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && isLikelyTaskId(candidate)) return String(candidate);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTaskId(item, seen);
      if (found) return found;
    }
    return null;
  }
  for (const item of Object.values(value)) {
    const found = findTaskId(item, seen);
    if (found) return found;
  }
  return null;
}

function isLikelyTaskId(value) {
  const text = String(value || "").trim();
  return text.length >= 8 && /^[A-Za-z0-9_-]+$/.test(text);
}

function findTaskById(payload, taskId, seen = new Set()) {
  if (!payload || typeof payload !== "object") return null;
  if (seen.has(payload)) return null;
  seen.add(payload);
  const ids = [payload.id, payload.task_id, payload.task_no, payload.key, payload.uuid]
    .filter((value) => value !== undefined && value !== null)
    .map(String);
  if (ids.includes(String(taskId))) return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findTaskById(item, taskId, seen);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(payload)) {
    const found = findTaskById(value, taskId, seen);
    if (found) return found;
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
    data?.results,
    data?.results?.[0]?.url,
    data?.results?.[0]?.image_url,
    data?.results?.[0]?.file_url,
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
    payload?.results,
    payload?.results?.[0]?.url,
    payload?.results?.[0]?.image_url,
    payload?.results?.[0]?.file_url,
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
  if (Array.isArray(data?.outputs)) {
    candidates.push(data.outputs[0]?.url, data.outputs[0]?.image_url, data.outputs[0]?.file_url, data.outputs[0]?.b64_json);
  }
  if (Array.isArray(payload?.outputs)) {
    candidates.push(payload.outputs[0]?.url, payload.outputs[0]?.image_url, payload.outputs[0]?.file_url, payload.outputs[0]?.b64_json);
  }
  if (Array.isArray(data?.files)) {
    candidates.push(data.files[0]?.url, data.files[0]?.image_url, data.files[0]?.file_url);
  }
  if (Array.isArray(payload?.files)) {
    candidates.push(payload.files[0]?.url, payload.files[0]?.image_url, payload.files[0]?.file_url);
  }
  if (Array.isArray(data?.assets)) {
    const outputAsset = data.assets.find((asset) => asset?.kind === "output" && (asset.url || asset.download_url));
    candidates.push(outputAsset?.url, outputAsset?.download_url);
  }

  const direct = candidates.map(normalizeImageValue).find(Boolean);
  if (direct) return direct;

  return findImageUrl(payload);
}

function extractRhartResultUrl(payload) {
  const containers = [
    payload?.results,
    payload?.data?.results,
    payload?.result?.results,
    payload?.data?.result?.results,
    payload?.outputs,
    payload?.data?.outputs,
    payload?.files,
    payload?.data?.files,
  ];
  for (const container of containers) {
    const found = extractResultUrlFromItems(container);
    if (found) return found;
  }

  const direct = [
    payload?.url,
    payload?.data?.url,
    payload?.outputUrl,
    payload?.data?.outputUrl,
    payload?.output_url,
    payload?.data?.output_url,
    payload?.fileUrl,
    payload?.data?.fileUrl,
    payload?.file_url,
    payload?.data?.file_url,
  ].map(normalizeImageValue).find(Boolean);
  return direct || "";
}

function extractResultUrlFromItems(value) {
  if (!value) return "";
  const items = Array.isArray(value) ? value : [value];
  const imageItems = items.filter((item) => {
    if (typeof item === "string") return /\.(?:png|jpe?g|webp|gif)(?:[?#]|$)/i.test(item) || /^data:image\//i.test(item);
    const type = String(item?.outputType || item?.type || item?.mimeType || item?.mime_type || "").toLowerCase();
    return /image|png|jpg|jpeg|webp|gif/.test(type) || item?.url || item?.download_url || item?.downloadUrl;
  });
  for (const item of imageItems.length ? imageItems : items) {
    const url = [
      typeof item === "string" ? item : "",
      item?.url,
      item?.download_url,
      item?.downloadUrl,
      item?.file_url,
      item?.fileUrl,
      item?.image_url,
      item?.imageUrl,
      item?.b64_json,
    ].map(normalizeImageValue).find(Boolean);
    if (url) return url;
  }
  return "";
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
    "fileUrl",
    "results",
    "outputs",
    "files",
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
