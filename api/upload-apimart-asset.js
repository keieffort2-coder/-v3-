const API_BASE = "https://api.apimart.ai/v1";
let sharpModulePromise = null;

function getApiMartKey(channel) {
  const selected = String(channel || "b").toLowerCase();
  const key = selected === "a" ? process.env.APIMART_API_KEY || process.env.APIMART_TOKEN : process.env.APIMART_API_KEY_2 || process.env.APIMART_TOKEN_2;
  return sanitizeHeaderValue(key);
}

function sanitizeHeaderValue(value) {
  return String(value || "").trim().replace(/[^\x20-\x7E]/g, "");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = getApiMartKey(req.body?.apimartChannel);
  if (!apiKey) {
    res.status(500).json({
      error: "APIMART_API_KEY_2 is not configured",
      message: "Please configure APIMART_API_KEY_2 in Vercel Environment Variables.",
    });
    return;
  }

  try {
    const { fileName, dataUrl } = req.body || {};
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      res.status(400).json({ error: "Invalid dataUrl" });
      return;
    }

    const normalized = await normalizeUploadAsset(parsed);
    const assetKind = getAssetKind(normalized.contentType);
    const endpoint = getUploadEndpoint(assetKind);
    const formData = new FormData();
    formData.append("file", new Blob([normalized.buffer], { type: normalized.contentType }), sanitizeName(fileName || `asset.${getExtension(normalized.contentType)}`));

    const upload = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const payload = await readJson(upload);
    const url = extractAssetUrl(payload);
    if (!upload.ok || !url) {
      res.status(upload.status || 502).json({
        error: "APIMart asset upload failed",
        message: findMessage(payload) || `APIMart upload failed: HTTP ${upload.status}`,
        upstream: payload,
        endpoint,
      });
      return;
    }

    res.status(200).json({
      url,
      assetKind,
      endpoint,
      normalized: normalized.normalized,
      dimensions: normalized.dimensions,
      payload,
    });
  } catch (error) {
    res.status(500).json({
      error: "APIMart asset upload failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

async function normalizeUploadAsset(parsed) {
  if (!parsed?.contentType?.startsWith("image/")) {
    return { ...parsed, normalized: false, dimensions: null };
  }
  if (parsed.contentType === "image/gif" || parsed.contentType === "image/svg+xml") {
    return { ...parsed, normalized: false, dimensions: null };
  }

  const sharp = await getSharp();
  if (!sharp) return { ...parsed, normalized: false, dimensions: null };

  const image = sharp(parsed.buffer, { failOn: "none" });
  const metadata = await image.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return { ...parsed, normalized: false, dimensions: null };

  const nextWidth = roundUpToMultiple(width, 16);
  const nextHeight = roundUpToMultiple(height, 16);
  if (nextWidth === width && nextHeight === height) {
    return {
      ...parsed,
      normalized: false,
      dimensions: { width, height },
    };
  }

  const right = nextWidth - width;
  const bottom = nextHeight - height;
  const outputContentType = parsed.contentType === "image/webp" ? "image/webp" : "image/png";
  let output = sharp(parsed.buffer, { failOn: "none" })
    .extend({
      top: 0,
      left: 0,
      right,
      bottom,
      extendWith: "copy",
    });
  output = outputContentType === "image/webp" ? output.webp({ quality: 95 }) : output.png({ compressionLevel: 6 });
  const buffer = await output.toBuffer();

  return {
    contentType: outputContentType,
    buffer,
    normalized: true,
    dimensions: {
      width: nextWidth,
      height: nextHeight,
      sourceWidth: width,
      sourceHeight: height,
    },
  };
}

async function getSharp() {
  try {
    sharpModulePromise ||= import("sharp").then((mod) => mod.default || mod);
    return await sharpModulePromise;
  } catch (error) {
    console.error("sharp is unavailable; APIMart image upload normalization skipped:", error);
    return null;
  }
}

function roundUpToMultiple(value, multiple) {
  return Math.max(multiple, Math.ceil(Number(value || 0) / multiple) * multiple);
}

function parseDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    contentType: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64"),
  };
}

function getAssetKind(contentType) {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "file";
}

function getUploadEndpoint(kind) {
  if (kind === "image") return "/uploads/images";
  if (kind === "video") return "/uploads/videos";
  if (kind === "audio") return "/uploads/audios";
  return "/uploads/files";
}

function extractAssetUrl(payload) {
  const candidates = [
    payload?.data?.url,
    payload?.data?.asset_url,
    payload?.data?.assetUrl,
    payload?.data?.file_url,
    payload?.data?.image_url,
    payload?.data?.video_url,
    payload?.url,
    payload?.asset_url,
    payload?.assetUrl,
    payload?.file_url,
    payload?.image_url,
    payload?.video_url,
  ];
  if (Array.isArray(payload?.data)) {
    candidates.push(payload.data[0]?.url, payload.data[0]?.asset_url, payload.data[0]?.file_url);
  }
  return candidates.find((value) => typeof value === "string" && value);
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

function sanitizeName(name) {
  const cleaned = String(name)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "asset";
}

function getExtension(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "video/webm") return "webm";
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "audio/mpeg") return "mp3";
  if (contentType === "audio/wav") return "wav";
  if (contentType.startsWith("video/")) return "mp4";
  if (contentType.startsWith("audio/")) return "mp3";
  return "png";
}
