import { auth, storage, rtdb } from "./firebase-config.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { ref as rtdbRef, push, set, get } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;          // 5MB cho mỗi tệp
const MAX_IMAGE_DIM = 1600;                     // cạnh dài tối đa sau khi nén
const IMAGE_QUALITY = 0.82;
const IMAGE_RECOMPRESS_ABOVE = 300 * 1024;      // ảnh nhỏ hơn thì giữ nguyên
const URL_CACHE_MAX = 20;

let storageUsable = true;
const urlCache = new Map();

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(".0", "") + " KB";
  return (n / (1024 * 1024)).toFixed(1).replace(".0", "") + " MB";
}

function safeFileName(name) {
  const cleaned = String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .slice(-120);
  return cleaned || "file";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Không đọc được tệp."));
    reader.readAsDataURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Không đọc được tệp."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Ảnh không hợp lệ.")); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/* Nén ảnh phía client để giảm dung lượng (đặc biệt cần khi lưu dự phòng vào RTDB). */
async function prepareFile(file) {
  if (!file.type || !file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
  if (file.size <= IMAGE_RECOMPRESS_ABOVE) return file;

  try {
    const source = typeof createImageBitmap === "function"
      ? await createImageBitmap(file)
      : await loadImageElement(file);
    const width = source.width || source.naturalWidth;
    const height = source.height || source.naturalHeight;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    source.close?.();

    const blob = await canvasToBlob(canvas, "image/jpeg", IMAGE_QUALITY);
    if (!blob || blob.size >= file.size) return file;
    const base = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
    return new File([blob], base + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function tryUploadToStorage(chatId, file) {
  if (!storageUsable) return null;
  try {
    const name = safeFileName(file.name);
    const path = `chat-files/${chatId}/${Date.now()}_${name}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file, { contentType: file.type || "application/octet-stream" });
    const url = await getDownloadURL(r);
    return { url, path };
  } catch (err) {
    // Firebase Storage chưa được bật/không truy cập được → dùng RTDB làm dự phòng.
    storageUsable = false;
    console.warn("Firebase Storage không dùng được, chuyển sang Realtime Database:", err);
    return null;
  }
}

async function saveToRealtimeDb(chatId, file, attachment) {
  const data = await fileToBase64(file);
  const mediaRef = push(rtdbRef(rtdb, `media/${chatId}`));
  await set(mediaRef, {
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
    senderUid: auth.currentUser?.uid || "",
    createdAt: Date.now(),
    data
  });
  attachment.mediaPath = `media/${chatId}/${mediaRef.key}`;
}

/**
 * Tải một tệp/ảnh lên và trả về metadata để gửi kèm tin nhắn:
 * { kind: "image"|"file", name, size, mime, url|null, mediaPath|null }
 */
export async function uploadChatAttachment(chatId, file) {
  if (!file) throw new Error("Chưa chọn tệp.");

  const prepared = await prepareFile(file);
  if (prepared.size > MAX_FILE_SIZE) {
    throw new Error(`Tệp quá lớn (tối đa ${formatFileSize(MAX_FILE_SIZE)}).`);
  }

  const attachment = {
    kind: prepared.type && prepared.type.startsWith("image/") ? "image" : "file",
    name: prepared.name || file.name || "file",
    size: prepared.size,
    mime: prepared.type || "application/octet-stream",
    url: null,
    mediaPath: null
  };

  const stored = await tryUploadToStorage(chatId, prepared);
  if (stored) {
    attachment.url = stored.url;
  } else {
    try {
      await saveToRealtimeDb(chatId, prepared, attachment);
    } catch (err) {
      // Nếu chưa deploy rules cho RTDB, ảnh nhỏ vẫn có thể gửi kèm trong tin nhắn.
      if (attachment.kind === "image" && prepared.size <= 600 * 1024) {
        attachment.dataUrl = await fileToDataUrl(prepared);
      } else {
        throw new Error("Không tải được tệp lên máy chủ. Hãy deploy database.rules.json rồi thử lại.");
      }
    }
  }
  return attachment;
}

/* Giữ hàm cũ để tương thích: trả về URL hiển thị được cho ảnh. */
export async function uploadChatImage(chatId, file) {
  const attachment = await uploadChatAttachment(chatId, file);
  if (attachment.url) return attachment.url;
  return getAttachmentUrl(attachment);
}

/* Lấy URL hiển thị/tải xuống của một tệp đính kèm (Storage hoặc RTDB dự phòng). */
export async function getAttachmentUrl(attachment) {
  if (!attachment) throw new Error("Tệp không hợp lệ.");
  if (attachment.url) return attachment.url;
  if (attachment.dataUrl) return attachment.dataUrl;
  if (!attachment.mediaPath) throw new Error("Không tìm thấy tệp đính kèm.");

  const cached = urlCache.get(attachment.mediaPath);
  if (cached) return cached;

  const snap = await get(rtdbRef(rtdb, attachment.mediaPath));
  const value = snap.val();
  if (!value || !value.data) throw new Error("Tệp không còn tồn tại.");

  const url = `data:${value.mime || attachment.mime || "application/octet-stream"};base64,${value.data}`;
  if (urlCache.size >= URL_CACHE_MAX) {
    const oldest = urlCache.keys().next().value;
    urlCache.delete(oldest);
  }
  urlCache.set(attachment.mediaPath, url);
  return url;
}

function triggerDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "file";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function downloadAttachment(attachment) {
  const url = await getAttachmentUrl(attachment);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, attachment.name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  } catch {
    triggerDownload(url, attachment.name);
  }
}
