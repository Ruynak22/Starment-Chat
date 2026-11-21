import {
  doc, updateDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { db } from "./firebase-config.js";

/* ============================================================
   ẢNH ĐẠI DIỆN (avatar) & ẢNH NHÓM (thumbnail)
   - Ảnh được nén ở phía client rồi lưu dạng data URL trong Firestore.
   - Cách này không cần deploy storage.rules và vẫn hiển thị được ở
     mọi nơi (dùng trực tiếp làm src của <img>).
   ============================================================ */

const AVATAR_MAX_DIM = 320;        // cạnh lớn tối đa của avatar cá nhân
const GROUP_MAX_DIM = 640;         // cạnh lớn tối đa của ảnh nhóm
const IMAGE_QUALITY = 0.82;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
// Firestore giới hạn ~1MB/tài liệu → chừa khoảng cho các trường khác.
const DATA_URL_LIMIT = 850 * 1024;

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Ảnh không hợp lệ.")); };
    img.src = objectUrl;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Một số trình duyệt không decode được SVG bằng createImageBitmap.
    }
  }
  return loadImageElement(file);
}

function drawToDataUrl(source, dim, quality) {
  const width = source.width || source.naturalWidth || 0;
  const height = source.height || source.naturalHeight || 0;
  const scale = Math.min(1, dim / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  // Nền trắng để ảnh PNG trong suốt không bị đen khi chuyển sang JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Đọc một tệp ảnh, nén lại và trả về data URL sẵn sàng gán vào <img>. */
export async function imageFileToDataUrl(file, options = {}) {
  if (!file) throw new Error("Chưa chọn ảnh.");
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("Vui lòng chọn tệp hình ảnh.");
  }
  if (!file.size) throw new Error("Ảnh rỗng hoặc không đọc được.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Ảnh quá lớn (tối đa 8 MB).");

  const maxDim = Number(options.maxDim) > 0 ? Number(options.maxDim) : AVATAR_MAX_DIM;
  const quality = Number(options.quality) > 0 ? Number(options.quality) : IMAGE_QUALITY;
  const source = await decodeImage(file);
  try {
    if (!source.width && !source.naturalWidth) throw new Error("Ảnh không hợp lệ.");

    let dim = maxDim;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const dataUrl = drawToDataUrl(source, dim, quality);
      if (dataUrl.length <= DATA_URL_LIMIT) return dataUrl;
      dim = Math.max(96, Math.round(dim * 0.75));
    }
    // Lần cuối: ép chất lượng thấp hơn để chắc chắn vừa giới hạn Firestore.
    const fallback = drawToDataUrl(source, 160, 0.55);
    if (fallback.length > DATA_URL_LIMIT) throw new Error("Ảnh quá lớn sau khi nén. Hãy chọn ảnh khác.");
    return fallback;
  } finally {
    source?.close?.();
  }
}

/**
 * Hiển thị avatar cho một phần tử bất kỳ.
 * - Có url  → dùng <img class="avatar-img">, ẩn chữ cái/emoji.
 * - Không có → hiện chữ cái/emoji (label).
 * Không xoá các phần tử con khác (ví dụ chấm trạng thái online).
 */
export function setAvatar(el, url, label) {
  if (!el) return;
  // Dọn các node text rời rạc (code cũ gán textContent = "?") để không đè lên ảnh.
  Array.from(el.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  });
  let img = el.querySelector(":scope > .avatar-img");
  let textEl = el.querySelector(":scope > .avatar-label");

  if (url) {
    if (!img) {
      img = document.createElement("img");
      img.className = "avatar-img";
      img.alt = "";
      img.decoding = "async";
      el.prepend(img);
    }
    if (img.getAttribute("src") !== url) img.src = url;
    if (textEl) textEl.hidden = true;
    el.classList.add("has-img");
  } else {
    if (img) img.remove();
    if (!textEl) {
      textEl = document.createElement("span");
      textEl.className = "avatar-label";
      el.prepend(textEl);
    }
    textEl.textContent = label || "?";
    textEl.hidden = false;
    el.classList.remove("has-img");
  }
}

function emitAvatarChanged(kind, id, url) {
  window.dispatchEvent(new CustomEvent("avatar:changed", { detail: { kind, id, url } }));
}

/* ---------- Avatar cá nhân: users/{uid}.photoURL ---------- */
export async function saveAvatar(uid, file) {
  const url = await imageFileToDataUrl(file, { maxDim: AVATAR_MAX_DIM, quality: IMAGE_QUALITY });
  await updateDoc(doc(db, "users", uid), {
    photoURL: url,
    photoURLUpdatedAt: serverTimestamp()
  });
  emitAvatarChanged("user", uid, url);
  return url;
}

export async function removeAvatar(uid) {
  await updateDoc(doc(db, "users", uid), { photoURL: "" });
  emitAvatarChanged("user", uid, "");
}

/* ---------- Ảnh nhóm: chats/{groupId}.photoURL ---------- */
export async function saveGroupPhoto(groupId, file) {
  const url = await imageFileToDataUrl(file, { maxDim: GROUP_MAX_DIM, quality: IMAGE_QUALITY });
  await updateDoc(doc(db, "chats", groupId), { photoURL: url });
  emitAvatarChanged("group", groupId, url);
  return url;
}

export async function removeGroupPhoto(groupId) {
  await updateDoc(doc(db, "chats", groupId), { photoURL: "" });
  emitAvatarChanged("group", groupId, "");
}

export async function getGroupPhotoURL(groupId) {
  if (!groupId) return "";
  const snap = await getDoc(doc(db, "chats", groupId));
  return snap.exists() ? (snap.data().photoURL || "") : "";
}
