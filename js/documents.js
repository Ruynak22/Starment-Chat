/* ============================================================
   StarmentChat — Tệp của tôi (My Documents)
   - Lưu tệp riêng cho từng tài khoản (Firebase Storage + RTDB).
   - Tải lên / tải xuống / xoá / tìm kiếm và gửi vào chat hiện tại.
   ============================================================ */

import { auth, storage, rtdb } from "./firebase-config.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import {
  ref as dbRef,
  push,
  set,
  remove,
  onValue
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { formatFileSize } from "./storage.js";

const MAX_DOC_SIZE = 25 * 1024 * 1024; // 25MB
let listUnsub = null;
let selectedDoc = null;
let docs = [];
let searchTerm = "";

const $ = (id) => document.getElementById(id);
const modal = () => $("documentsModal");
const i18n = (key, fallback) => (window.i18n?.t ? window.i18n.t(key) : fallback);

function docsRoot(uid) { return `userDocuments/${uid}`; }

function safeName(name) {
  return String(name || "file")
    .replace(/[^\w.\-() ]+/g, "_")
    .slice(-120) || "file";
}

function fileIcon(name, mime) {
  const m = String(mime || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎵";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (/zip|rar|7z/.test(m) || /\.(zip|rar|7z)$/.test(n)) return "🗜️";
  if (/sheet|excel/.test(m) || /\.(xlsx?|csv)$/.test(n)) return "📊";
  if (/presentation|powerpoint/.test(m) || /\.pptx?$/.test(n)) return "📽️";
  if (m.startsWith("text/") || /word/.test(m) || /\.(docx?|txt)$/.test(n)) return "📄";
  return "📎";
}

/* ---------- Modal ---------- */
export function openDocuments() {
  const el = modal();
  if (!el) return;
  if (!auth.currentUser) {
    window.notify?.(i18n("toast.loginRequired", "Bạn cần đăng nhập lại."));
    return;
  }
  selectedDoc = null;
  searchTerm = "";
  if ($("docSearch")) $("docSearch").value = "";
  el.classList.remove("hidden", "closing");
  document.body.classList.add("modal-open");
  subscribeList(auth.currentUser.uid);
  renderList();
}

function closeDocuments() {
  const el = modal();
  if (!el || el.classList.contains("hidden") || el.classList.contains("closing")) return;
  el.classList.add("closing");
  document.body.classList.remove("modal-open");
  setTimeout(() => {
    el.classList.add("hidden");
    el.classList.remove("closing");
  }, 190);
  if (listUnsub) { listUnsub(); listUnsub = null; }
}

function subscribeList(uid) {
  if (listUnsub) { listUnsub(); listUnsub = null; }
  const rootRef = dbRef(rtdb, docsRoot(uid));
  listUnsub = onValue(rootRef, (snap) => {
    const value = snap.val() || {};
    docs = Object.keys(value).map((key) => ({ id: key, ...value[key] }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderList();
  }, () => {
    window.notify?.("Không tải được danh sách tệp. Hãy deploy database.rules.json.");
  });
}

function renderList() {
  const list = $("docList");
  if (!list) return;
  list.innerHTML = "";
  const q = searchTerm.trim().toLowerCase();
  const filtered = q ? docs.filter((d) => String(d.name || "").toLowerCase().includes(q)) : docs;

  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "doc-empty";
    empty.innerHTML = `<div class="doc-empty-icon">📂</div>
      <strong>${i18n("doc.empty", "Chưa có tệp nào")}</strong>
      <span>${i18n("doc.emptyHint", "Tải một tệp lên để lưu vào tài khoản và gửi bất cứ lúc nào.")}</span>`;
    list.appendChild(empty);
    return;
  }

  filtered.forEach((doc) => {
    const li = document.createElement("li");
    li.className = "doc-item" + (selectedDoc?.id === doc.id ? " selected" : "");
    li.dataset.id = doc.id;

    const icon = document.createElement("div");
    icon.className = "doc-icon";
    icon.textContent = fileIcon(doc.name, doc.mime);

    const meta = document.createElement("div");
    meta.className = "doc-meta";
    const name = document.createElement("strong");
    name.className = "doc-name";
    name.textContent = doc.name || "file";
    name.title = doc.name || "file";
    const sub = document.createElement("span");
    sub.className = "doc-sub";
    sub.textContent = `${formatFileSize(doc.size || 0)} · ${
      doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""
    }`;
    meta.append(name, sub);

    const actions = document.createElement("div");
    actions.className = "doc-actions";

    const send = document.createElement("button");
    send.type = "button";
    send.className = "btn btn-sm btn-primary";
    send.textContent = i18n("doc.send", "Gửi");
    send.addEventListener("click", (e) => { e.stopPropagation(); sendDocument(doc); });

    const dl = document.createElement("button");
    dl.type = "button";
    dl.className = "btn btn-icon btn-sm";
    dl.title = i18n("doc.download", "Tải xuống");
    dl.setAttribute("aria-label", i18n("doc.download", "Tải xuống"));
    dl.textContent = "⬇";
    dl.addEventListener("click", (e) => { e.stopPropagation(); downloadDocument(doc); });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-icon btn-sm doc-delete";
    del.title = i18n("doc.delete", "Xóa");
    del.setAttribute("aria-label", i18n("doc.delete", "Xóa"));
    del.textContent = "🗑";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteDocument(doc); });

    actions.append(send, dl, del);
    li.append(icon, meta, actions);
    li.addEventListener("click", () => {
      selectedDoc = doc;
      renderList();
    });
    list.appendChild(li);
  });
}

/* ---------- Tải lên ---------- */
function setUploadProgress(value, active) {
  const bar = $("docUploadProgress");
  const fill = $("docUploadProgressFill");
  if (!bar || !fill) return;
  bar.classList.toggle("hidden", !active);
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  fill.style.width = pct + "%";
  bar.setAttribute("aria-valuenow", String(pct));
}

async function uploadFiles(fileList) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const btn = $("btnDocUpload");
  if (btn) btn.disabled = true;
  let done = 0;
  for (const file of files) {
    if (!file.size) continue;
    if (file.size > MAX_DOC_SIZE) {
      window.notify?.(`${i18n("toast.fileTooLarge", "Tệp quá lớn. Tối đa")} ${formatFileSize(MAX_DOC_SIZE)}`);
      continue;
    }
    try {
      const docRef = push(dbRef(rtdb, docsRoot(uid)));
      const docId = docRef.key;
      const path = `${docsRoot(uid)}/${docId}_${safeName(file.name)}`;
      const ref = storageRef(storage, path);
      setUploadProgress(0, true);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref, file, { contentType: file.type || "application/octet-stream" });
        task.on("state_changed",
          (snap) => {
            if (snap.totalBytes) setUploadProgress(snap.bytesTransferred / snap.totalBytes, true);
          },
          reject,
          () => resolve()
        );
      });
      const url = await getDownloadURL(ref);
      await set(docRef, {
        name: file.name || "file",
        size: file.size,
        mime: file.type || "application/octet-stream",
        path,
        url,
        createdAt: Date.now(),
        uploaderUid: uid
      });
      done += 1;
    } catch (err) {
      console.warn("Upload document failed", err);
      window.notify?.(err?.message || "Không tải được tệp. Hãy deploy storage.rules.");
    }
  }
  setUploadProgress(0, false);
  if (btn) btn.disabled = false;
  if (done) window.notify?.(`${i18n("doc.uploadSuccess", "Đã lưu tệp vào Tệp của tôi")} (${done})`);
}

/* ---------- Tải xuống / Xoá / Gửi ---------- */
function triggerDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "file";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function downloadDocument(doc) {
  try {
    const url = doc.url || await getDownloadURL(storageRef(storage, doc.path));
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, doc.name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  } catch (err) {
    window.notify?.(err?.message || "Không tải được tệp.");
  }
}

async function deleteDocument(doc) {
  if (!window.confirm(i18n("doc.deleteConfirm", "Xóa tệp này khỏi Tệp của tôi?"))) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await remove(dbRef(rtdb, `${docsRoot(uid)}/${doc.id}`));
    if (doc.path) await deleteObject(storageRef(storage, doc.path)).catch(() => {});
    if (selectedDoc?.id === doc.id) selectedDoc = null;
    window.notify?.(i18n("doc.deleteSuccess", "Đã xóa tệp"));
  } catch (err) {
    window.notify?.(err?.message || "Không xoá được tệp.");
  }
}

async function sendDocument(doc) {
  if (!window.app?.currentChatId?.()) {
    window.notify?.(i18n("doc.noChat", "Hãy mở một cuộc trò chuyện trước khi gửi tệp"));
    return;
  }
  const btn = $("btnDocUpload");
  try {
    const url = doc.url || await getDownloadURL(storageRef(storage, doc.path));
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const file = new File([blob], doc.name || "file", { type: doc.mime || "application/octet-stream" });
    if (typeof window.app.setDocumentAsAttachment === "function") {
      window.app.setDocumentAsAttachment(file);
      selectedDoc = doc;
      closeDocuments();
      window.notify?.(i18n("doc.selected", "Đã chọn tệp — nhấn Gửi trong cuộc trò chuyện"));
    }
  } catch (err) {
    window.notify?.(err?.message || "Không gửi được tệp.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- Khởi tạo ---------- */
export function initDocuments() {
  $("btnDocuments")?.addEventListener("click", openDocuments);
  $("btnSettingsDocuments")?.addEventListener("click", openDocuments);
  $("btnDocClose")?.addEventListener("click", closeDocuments);
  $("btnDocDone")?.addEventListener("click", closeDocuments);
  document.querySelector('#documentsModal [data-close="documents"]')?.addEventListener("click", closeDocuments);

  $("btnDocUpload")?.addEventListener("click", () => $("docFileInput")?.click());
  $("docFileInput")?.addEventListener("change", (e) => {
    uploadFiles(e.target.files);
    e.target.value = "";
  });
  $("docSearch")?.addEventListener("input", (e) => {
    searchTerm = e.target.value || "";
    renderList();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal()?.classList.contains("hidden")) closeDocuments();
  });
}

export function refreshDocuments() {
  if (!modal()?.classList.contains("hidden") && auth.currentUser) {
    subscribeList(auth.currentUser.uid);
  }
}
