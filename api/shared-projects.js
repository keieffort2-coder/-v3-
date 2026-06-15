const { put, list } = require("@vercel/blob");

const CODE_PREFIX = "aivideobox/project-codes/";

module.exports = async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      res.status(200).json({ disabled: true, message: "Vercel Blob is not configured." });
      return;
    }

    if (req.method === "GET") {
      const code = normalizeCode(req.query?.code);
      if (!code) {
        res.status(400).json({ error: "Missing project code" });
        return;
      }
      const data = await readJsonBlob(codePath(code), null);
      if (!data) {
        res.status(404).json({ error: "Project code not found" });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (req.method === "POST") {
      const code = normalizeCode(req.body?.code);
      const name = String(req.body?.name || "").trim() || `项目 ${code}`;
      const data = req.body?.data;
      if (!code || !data || !Array.isArray(data.nodes)) {
        res.status(400).json({ error: "Missing project code or data" });
        return;
      }
      if (!data.nodes.length) {
        res.status(409).json({ error: "Refusing to share an empty project" });
        return;
      }
      const payload = {
        code,
        name,
        data,
        updatedAt: new Date().toISOString(),
      };
      await put(codePath(code), JSON.stringify(payload), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
      });
      res.status(200).json({ ok: true, code, name });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /suspended|not configured|missing token|unauthorized/i.test(message) ? 200 : 500;
    res.status(status).json({ error: "Project code storage failed", disabled: status === 200, message });
  }
};

function normalizeCode(value = "") {
  return String(value).replace(/^项目码\s*/i, "").replace(/\s+/g, "").toUpperCase();
}

function codePath(code) {
  return `${CODE_PREFIX}${encodeURIComponent(code)}.json`;
}

async function readJsonBlob(pathname, fallback) {
  const result = await list({ prefix: pathname, limit: 10 });
  const found = result.blobs.find((blob) => blob.pathname === pathname);
  if (!found?.url) return fallback;
  const response = await fetch(`${found.url}${found.url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return fallback;
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

