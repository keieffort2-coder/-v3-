const { put } = require("@vercel/blob");

const API_BASE = "https://api.apimart.ai/v1";
const WETOKEN_DEFAULT_TASK_URL = "https://wetoken.lingxixai.com/api/v3/contents/generations/tasks";
const WETOKEN_FALLBACK_TASK_URL = "https://wetoken.ai/api/v3/contents/generations/tasks";

function getApiMartKey(channel) {
  const selected = String(channel || "b").toLowerCase();
  const key = selected === "a" ? process.env.APIMART_API_KEY || process.env.APIMART_TOKEN : process.env.APIMART_API_KEY_2 || process.env.APIMART_TOKEN_2;
  return sanitizeHeaderValue(key);
}

function getWeTokenKey() {
  return sanitizeHeaderValue(process.env.WETOKEN_API_KEY || process.env.WETOKEN_TOKEN || process.env.SEEDANCE_WETOKEN_API_KEY || "");
}

function getWeTokenTaskUrls() {
  const configured = [
    process.env.WETOKEN_TASK_URL,
    process.env.WETOKEN_SEEDANCE_TASK_URL,
    ...(process.env.WETOKEN_FALLBACK_TASK_URLS || "").split(/[,\s]+/),
    WETOKEN_DEFAULT_TASK_URL,
    WETOKEN_FALLBACK_TASK_URL,
  ];
  const urls = configured
    .map((value) => sanitizeHeaderValue(value).replace(/\/+$/, ""))
    .filter((value) => /^https:\/\/[^/]+\/api\/v3\/contents\/generations\/tasks$/i.test(value));
  return [...new Set(urls)];
}

function getWeTokenTaskUrl(requestedUrl = "") {
  const urls = getWeTokenTaskUrls();
  const requested = sanitizeHeaderValue(requestedUrl).replace(/\/+$/, "");
  return urls.includes(requested) ? requested : urls[0];
}

function normalizeVideoProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return provider === "wetoken" ? "wetoken" : "apimart";
}

function sanitizeHeaderValue(value) {
  return String(value || "").trim().replace(/[^\x20-\x7E]/g, "");
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const taskId = req.query?.taskId;
    const provider = normalizeVideoProvider(req.query?.provider);
    if (!taskId) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const apiKey = provider === "wetoken" ? getWeTokenKey() : getApiMartKey(req.query?.apimartChannel);
    if (!apiKey) {
      res.status(500).json({
        error: provider === "wetoken" ? "WETOKEN_API_KEY is not configured" : "APIMART_API_KEY_2 is not configured",
        message: provider === "wetoken"
          ? "Please configure WETOKEN_API_KEY in Vercel Environment Variables."
          : "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
      });
      return;
    }

    try {
      const wetokenEndpoint = getWeTokenTaskUrl(req.query?.wetokenEndpoint);
      const taskPayload = provider === "wetoken" ? await getWeTokenTask(apiKey, String(taskId), wetokenEndpoint) : await getTask(apiKey, String(taskId));
      const status = getTaskStatus(taskPayload);
      const videoUrl = await persistResultVideo(extractResultVideoUrl(taskPayload), taskId);
      res.status(200).json({
        taskId,
        status,
        videoUrl,
        provider,
        wetokenEndpoint: provider === "wetoken" ? wetokenEndpoint : undefined,
        message: formatUpstreamError(taskPayload),
        payload: videoUrl ? undefined : taskPayload,
      });
    } catch (error) {
      res.status(500).json({
        error: "Video task polling failed",
        message: error instanceof Error ? error.message : String(error),
        request: {
          provider,
          wetokenEndpoint: provider === "wetoken" ? getWeTokenTaskUrl(req.query?.wetokenEndpoint) : undefined,
          taskId: String(taskId),
        },
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
    imageUrls,
    videoUrls,
    duration,
    mode,
    model,
    provider,
    apimartChannel,
    aspectRatio,
    resolution,
    seed,
    generateAudio,
    returnLastFrame,
    webSearch,
    firstFrameUrl,
    lastFrameUrl,
    referenceAudioUrls,
  } = req.body || {};
  const normalizedProvider = normalizeVideoProvider(provider);
  const apiKey = normalizedProvider === "wetoken" ? getWeTokenKey() : getApiMartKey(apimartChannel);
  if (!apiKey) {
    res.status(500).json({
      error: normalizedProvider === "wetoken" ? "WETOKEN_API_KEY is not configured" : "APIMART_API_KEY_2 is not configured",
      message: normalizedProvider === "wetoken"
        ? "Please configure WETOKEN_API_KEY in Vercel Environment Variables."
        : "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
    });
    return;
  }

  if (!prompt || !String(prompt).trim()) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

  try {
    const submitBody = {
      model: normalizeVideoModel(model, normalizedProvider),
      prompt: String(prompt),
      mode: normalizeVideoMode(mode),
      duration: normalizeDuration(duration),
    };
    const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
    const normalizedResolution = normalizeResolution(resolution);
    const normalizedSeed = normalizeSeed(seed);
    if (normalizedAspectRatio) {
      submitBody.aspect_ratio = normalizedAspectRatio;
      submitBody.aspectRatio = normalizedAspectRatio;
    }
    if (normalizedResolution) submitBody.resolution = normalizedResolution;
    if (normalizedSeed !== null) submitBody.seed = normalizedSeed;
    submitBody.generate_audio = Boolean(generateAudio);
    submitBody.generateAudio = Boolean(generateAudio);
    submitBody.return_last_frame = Boolean(returnLastFrame);
    submitBody.returnLastFrame = Boolean(returnLastFrame);
    submitBody.web_search = Boolean(webSearch);
    submitBody.webSearch = Boolean(webSearch);

    const cleanImages = Array.isArray(imageUrls)
      ? imageUrls.filter(isVideoImageReference)
      : [];
    const cleanVideos = Array.isArray(videoUrls)
      ? videoUrls.filter((value) => typeof value === "string" && /^https?:\/\//i.test(value))
      : [];
    const cleanAudio = Array.isArray(referenceAudioUrls)
      ? referenceAudioUrls.filter((value) => typeof value === "string" && /^https?:\/\//i.test(value))
      : [];
    const cleanFirstFrame = isVideoImageReference(firstFrameUrl) ? firstFrameUrl : "";
    const cleanLastFrame = isVideoImageReference(lastFrameUrl) ? lastFrameUrl : "";
    if (cleanImages.length) submitBody.image_urls = cleanImages.slice(0, 8);
    if (cleanVideos.length) submitBody.video_urls = cleanVideos.slice(0, 4);
    if (cleanFirstFrame) {
      submitBody.first_frame_url = cleanFirstFrame;
      submitBody.firstFrameUrl = cleanFirstFrame;
    }
    if (cleanLastFrame) {
      submitBody.last_frame_url = cleanLastFrame;
      submitBody.lastFrameUrl = cleanLastFrame;
    }
    if (cleanAudio.length) {
      submitBody.audio_urls = cleanAudio.slice(0, 4);
      submitBody.reference_audio_urls = cleanAudio.slice(0, 4);
    }

    const providerSubmitBody = normalizedProvider === "wetoken"
      ? buildWeTokenSubmitBody(submitBody)
      : submitBody;
    const { response: submit, payload: submitPayload, endpoint: submitEndpoint } = normalizedProvider === "wetoken"
      ? await submitWeTokenVideoTask(apiKey, providerSubmitBody)
      : await submitVideoTask(apiKey, providerSubmitBody);
    if (!submit.ok) {
      res.status(submit.status).json({
        error: normalizedProvider === "wetoken" ? "WeToken video submit failed" : "APIMart video submit failed",
        message: formatUpstreamError(submitPayload),
        upstream: submitPayload,
        request: {
          provider: normalizedProvider,
          wetokenEndpoint: normalizedProvider === "wetoken" ? submitEndpoint : undefined,
          model: providerSubmitBody.model,
          mode: submitBody.mode,
          duration: submitBody.duration,
          aspectRatio: normalizedAspectRatio,
          resolution: normalizedResolution,
          seed: normalizedSeed,
          generateAudio: Boolean(generateAudio),
          returnLastFrame: Boolean(returnLastFrame),
          webSearch: Boolean(webSearch),
          firstFrame: Boolean(cleanFirstFrame),
          lastFrame: Boolean(cleanLastFrame),
          imageCount: cleanImages.length,
          videoCount: cleanVideos.length,
          audioCount: cleanAudio.length,
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
      model: providerSubmitBody.model,
      provider: normalizedProvider,
      wetokenEndpoint: normalizedProvider === "wetoken" ? submitEndpoint : undefined,
      firstFrame: Boolean(cleanFirstFrame),
      imageCount: cleanImages.length,
      apimartChannel: String(apimartChannel || "b").toLowerCase() === "a" ? "a" : "b",
    });
  } catch (error) {
    res.status(500).json({
      error: "Video generation failed",
      message: error instanceof Error ? error.message : String(error),
      request: {
        provider: normalizedProvider,
        wetokenEndpoint: normalizedProvider === "wetoken" ? getWeTokenTaskUrl() : undefined,
      },
    });
  }
};

function normalizeVideoModel(model, provider = "apimart") {
  const value = String(model || "").trim();
  if (normalizeVideoProvider(provider) === "wetoken") return "doubao-seedance-2-0-260128";
  if (value === "kling3" || value === "kling-motion-control") return "kling-motion-control";
  if (value === "happyhorse" || value === "happyhorse-1.0") return "happyhorse-1.0";
  if (value === "doubao-seedance-2.0") return "doubao-seedance-2.0";
  return "doubao-seedance-2.0";
}

function normalizeVideoMode(mode) {
  const value = String(mode || "").trim();
  if (["text-to-video", "image-to-video", "video-to-video"].includes(value)) return value;
  return "image-to-video";
}

function normalizeDuration(duration) {
  const value = String(duration || "").trim();
  if (/^\d{1,2}$/.test(value)) return Number(value);
  const match = value.match(/\d{1,2}/);
  return match ? Number(match[0]) : 5;
}

function normalizeAspectRatio(value) {
  const ratio = String(value || "").trim();
  return ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(ratio) ? ratio : "16:9";
}

function normalizeResolution(value) {
  const resolution = String(value || "").trim();
  return ["480p", "720p", "1080p", "4K"].includes(resolution) ? resolution : "1080p";
}

function normalizeSeed(value) {
  if (value === undefined || value === null || value === "") return null;
  const seed = Number(value);
  return Number.isInteger(seed) && seed >= 0 ? seed : null;
}

function isVideoImageReference(value) {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:image\//i.test(value));
}

async function getTask(apiKey, taskId) {
  const response = await fetch(`${API_BASE}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

async function getWeTokenTask(apiKey, taskId, endpoint = getWeTokenTaskUrl()) {
  const url = `${getWeTokenTaskUrl(endpoint)}/${encodeURIComponent(taskId)}`;
  const response = await fetchWithNetworkMessage(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }, "WeToken poll");
  const payload = await readJson(response);
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload;
}

async function submitVideoTask(apiKey, submitBody) {
  const endpoints = ["/videos/generations", "/video/generations"];
  let lastResponse = null;
  let lastPayload = null;

  for (const endpoint of endpoints) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submitBody),
    });
    const payload = await readJson(response);
    if (response.ok || ![404, 405].includes(response.status)) {
      return { response, payload };
    }
    lastResponse = response;
    lastPayload = payload;
  }

  return { response: lastResponse, payload: lastPayload };
}

async function submitWeTokenVideoTask(apiKey, submitBody) {
  const attempts = [];
  for (const endpoint of getWeTokenTaskUrls()) {
    try {
      const response = await fetchWithNetworkMessage(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitBody),
      }, "WeToken submit");
      const payload = await readJson(response);
      return { response, payload, endpoint };
    } catch (error) {
      attempts.push({
        endpoint,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const summary = attempts.map((item, index) => `#${index + 1} ${item.endpoint}: ${item.message}`).join(" | ");
  throw new Error(`WeToken submit network failed after ${attempts.length} endpoint(s): ${summary}`);
}

async function fetchWithNetworkMessage(url, options, label = "upstream fetch") {
  try {
    return await fetch(url, options);
  } catch (error) {
    const cause = error?.cause;
    const details = [
      `${label} failed`,
      `endpoint: ${url}`,
      error instanceof Error && error.message ? `message: ${error.message}` : "",
      cause?.code ? `code: ${cause.code}` : "",
      cause?.errno ? `errno: ${cause.errno}` : "",
      cause?.syscall ? `syscall: ${cause.syscall}` : "",
      cause?.hostname ? `host: ${cause.hostname}` : "",
    ].filter(Boolean);
    throw new Error(details.join(", "));
  }
}

function buildWeTokenSubmitBody(submitBody) {
  const firstFrame = submitBody.first_frame_url || submitBody.firstFrameUrl || "";
  const lastFrame = submitBody.last_frame_url || submitBody.lastFrameUrl || "";
  const usesFrameMode = Boolean(firstFrame || lastFrame);
  const content = [{
    type: "text",
    text: buildWeTokenPrompt(submitBody.prompt, {
      hasFirstFrame: Boolean(firstFrame),
      hasLastFrame: Boolean(lastFrame),
      usesFrameMode,
    }),
  }];
  if (firstFrame) content.push({ type: "image_url", role: "first_frame", image_url: { url: firstFrame } });
  if (lastFrame) content.push({ type: "image_url", role: "last_frame", image_url: { url: lastFrame } });

  if (!usesFrameMode) {
    const imageUrls = Array.isArray(submitBody.image_urls) ? submitBody.image_urls : [];
    imageUrls.slice(0, 9).forEach((url) => {
      content.push({ type: "image_url", role: "reference_image", image_url: { url } });
    });
    const videoUrls = Array.isArray(submitBody.video_urls) ? submitBody.video_urls : [];
    videoUrls.slice(0, 3).forEach((url) => {
      content.push({ type: "video_url", role: "reference_video", video_url: { url } });
    });
    const audioUrls = Array.isArray(submitBody.reference_audio_urls) ? submitBody.reference_audio_urls : [];
    if ((imageUrls.length || videoUrls.length) && audioUrls.length) {
      audioUrls.slice(0, 3).forEach((url) => {
        content.push({ type: "audio_url", role: "reference_audio", audio_url: { url } });
      });
    }
  }

  return {
    model: "doubao-seedance-2-0-260128",
    content,
    duration: normalizeDuration(submitBody.duration),
    ratio: normalizeAspectRatio(submitBody.aspect_ratio || submitBody.aspectRatio),
    resolution: normalizeWeTokenResolution(submitBody.resolution),
    watermark: false,
    generate_audio: Boolean(submitBody.generate_audio || submitBody.generateAudio),
  };
}

function buildWeTokenPrompt(prompt, { hasFirstFrame, hasLastFrame, usesFrameMode } = {}) {
  const rules = [];
  if (hasFirstFrame) {
    rules.push(
      "SEEDANCE FRAME MODE: the uploaded first_frame is the opening frame and the primary visual source.",
      "Keep the first_frame art direction: 2D animation / illustrated linework, clean color blocks, lighting, palette, perspective, camera framing, canvas ratio, street layout, character shapes, character placement, and scene structure.",
      "Render with crisp edges, stable outlines, readable silhouettes, clean texture boundaries, and high-detail selected-resolution delivery quality, up to 4K when requested. Keep the image sharp across motion instead of softening or smearing the frame.",
      "Use the written prompt only to add motion, timing, effects, and camera movement on top of that first_frame. The first_frame decides style, composition, environment, and character look.",
    );
  }
  if (hasLastFrame) {
    rules.push("Use the uploaded last_frame as the ending visual state while keeping the same first_frame style and scene continuity.");
  }
  if (usesFrameMode) {
    rules.push("Media mode note: this request uses Seedance first_frame/last_frame mode only; no reference_image or reference_video media are mixed into the API request.");
  }
  return [...rules, String(prompt || "").trim()].filter(Boolean).join("\n\n");
}

function normalizeWeTokenResolution(value) {
  return normalizeResolution(value);
}

function getTaskStatus(payload) {
  return payload?.data?.status || payload?.status || "unknown";
}

async function persistResultVideo(videoUrl, taskId) {
  if (!videoUrl || typeof videoUrl !== "string") return videoUrl;
  if (/^https?:\/\/[^/]*\.public\.blob\.vercel-storage\.com\//i.test(videoUrl)) return videoUrl;
  if (!/^(1|true|yes|on)$/i.test(String(process.env.PERSIST_GENERATED_VIDEOS || ""))) return videoUrl;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return videoUrl;

  try {
    const response = await fetch(videoUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Download generated video failed: HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
    const arrayBuffer = await response.arrayBuffer();
    const extension = contentTypeToExtension(contentType);
    const pathname = `aivideobox/generated-video/${Date.now()}-${String(taskId || "video").replace(/[^a-z0-9_-]/gi, "-")}.${extension}`;
    const blob = await put(pathname, Buffer.from(arrayBuffer), {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    return blob.url;
  } catch (error) {
    console.error("Failed to persist generated video:", error);
    return videoUrl;
  }
}

function contentTypeToExtension(contentType) {
  if (contentType === "video/webm") return "webm";
  if (contentType === "video/quicktime") return "mov";
  return "mp4";
}

function extractTaskId(payload) {
  if (payload?.data?.task_id) return String(payload.data.task_id);
  if (payload?.data?.id) return String(payload.data.id);
  if (payload?.task_id) return String(payload.task_id);
  if (payload?.id) return String(payload.id);
  if (Array.isArray(payload?.data) && payload.data[0]?.task_id) return String(payload.data[0].task_id);
  return null;
}

function extractResultVideoUrl(payload) {
  const data = payload?.data;
  const candidates = [
    data?.result,
    data?.result?.url,
    data?.result?.video_url,
    data?.result?.output_url,
    data?.result_url,
    data?.output,
    data?.output_url,
    data?.file_url,
    data?.video,
    data?.url,
    data?.video_url,
    payload?.result,
    payload?.result_url,
    payload?.output,
    payload?.output_url,
    payload?.file_url,
    payload?.video,
    payload?.url,
    payload?.video_url,
  ];
  if (Array.isArray(data?.result?.videos)) candidates.push(data.result.videos[0]?.url, data.result.videos[0]?.video_url);
  if (Array.isArray(data?.videos)) candidates.push(data.videos[0]?.url, data.videos[0]?.video_url);
  const direct = candidates.map(normalizeVideoValue).find(Boolean);
  return direct || findVideoUrl(payload);
}

function normalizeVideoValue(value) {
  if (typeof value !== "string" || !value) return null;
  if (/^https?:\/\//i.test(value) && /\.(mp4|webm|mov)(\?|#|$)/i.test(value)) return value;
  if (/^https?:\/\//i.test(value) && /video|output|file/i.test(value)) return value;
  return null;
}

function findVideoUrl(value, seen = new Set()) {
  if (!value) return null;
  const normalized = normalizeVideoValue(value);
  if (normalized) return normalized;
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item, seen);
      if (found) return found;
    }
    return null;
  }

  for (const key of ["video_url", "output_url", "result_url", "file_url", "url", "video", "output", "result", "videos", "data"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      if (typeof value[key] === "string" && /^https?:\/\//i.test(value[key])) return value[key];
      const found = findVideoUrl(value[key], seen);
      if (found) return found;
    }
  }

  for (const item of Object.values(value)) {
    const found = findVideoUrl(item, seen);
    if (found) return found;
  }
  return null;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function formatUpstreamError(payload) {
  const message = findMessage(payload);
  if (/internal server error|server_error/i.test(message)) {
    return "APIMart upstream server error. Please retry later or switch API channel.";
  }
  return message || "APIMart video request failed.";
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
