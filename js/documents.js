/* ============================================================
   StarmentChat — Tệp của tôi (Zalo-style Cloud)
   - Lưu riêng cho từng tài khoản: Storage + RTDB metadata.
   - Phân loại, tìm kiếm, sắp xếp, list/grid, chọn nhiều, gửi nhiều,
     đổi tên, xem trước, tải xuống, xoá, thanh dung lượng.
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
  update,
  onValue
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { formatFileSize } from "./storage.js";

const MAX_DOC_SIZE = 25 * 1024 * 1024; // 25MB / tệp
const STORAGE_QUOTA = 2 * 1024 * 1024 * 1024; // 2GB (thanh hiển thị)

let listUnsub = null;
let docs = [];
let searchTerm = "";
let activeCategory = "all";
let sortMode = "newest";
let viewMode = "list";
const selectedIds = new Set();
let previewDoc = null;

const $ = (id) => document.getElementById(id);
const modal = () => $("documentsModal");
const previewModal = () => $("docPreviewModal");
const t = (key, fallback, vars) => (window.i18n?.t
  ? window.i18n.t(key, fallback, vars)
  : (fallback || key));

function docsRoot(uid) { return `userDocuments/${uid}`; }

function safeName(name) {
  return String(name || "file").replace(/[^\w.\-() ]+/g, "_").slice(-120) || "file";
}

function categoryOf(doc) {
  const m = String(doc?.mime || "").toLowerCase();
  const n = String(doc?.name || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.includes("pdf") || /word|excel|sheet|powerpoint|presentation|text|csv|zip|rar|7z/.test(m)
    || /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar|7z|rtf|odt|ods|odp)$/.test(n)) return "document";
  return "other";
}

function fileIcon(doc) {
  const cat = categoryOf(doc);
  if (cat === "image") return "🖼️";
  if (cat === "video") return "🎬";
  if (cat === "audio") return "🎵";
  const n = String(doc?.name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "📕";
  if (/\.(zip|rar|7z)$/.test(n)) return "🗜️";
  if (/\.(xlsx?|csv)$/.test(n)) return "📊";
  if (/\.pptx?$/.test(n)) return "📽️";
  if (/\.(docx?|txt)$/.test(n)) return "📄";
  return "📎";
}

/* ---------- Modal ---------- */
export function openDocuments() {
  const el = modal();
  if (!el) return;
  if (!auth.currentUser) {
    window.notify?.(t("toast.loginRequired", "Bạn cần đăng nhập lại."));
    return;
  }
  selectedIds.clear();
  searchTerm = "";
  if ($("docSearch")) $("docSearch").value = "";
  el.classList.remove("hidden", "closing");
  document.body.classList.add("modal-open");
  subscribeList(auth.currentUser.uid);
  render();
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
  listUnsub = onValue(dbRef(rtdb, docsRoot(uid)), (snap) => {
    const value = snap.val() || {};
    docs = Object.keys(value).map((key) => ({ id: key, ...value[key] }));
    // Dọn các mục đã bị xoá khỏi vùng chọn.
    [...selectedIds].forEach((id) => { if (!docs.some((d) => d.id === id)) selectedIds.delete(id); });
    render();
  }, () => {
    window.notify?.("Không tải được danh sách tệp. Hãy deploy database.rules.json.");
  });
}

/* ---------- Lọc / sắp xếp / render ---------- */
function visibleDocs() {
  const q = searchTerm.trim().toLowerCase();
  let list = docs.filter((d) => {
    if (activeCategory !== "all" && categoryOf(d) !== activeCategory) return false;
    if (q && !String(d.name || "").toLowerCase().includes(q)) return false;
    return true;
  });
  list = [...list];
  if (sortMode === "newest") list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  else if (sortMode === "oldest") list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  else if (sortMode === "name") list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  else if (sortMode === "size") list.sort((a, b) => (b.size || 0) - (a.size || 0));
  return list;
}

function renderStorage() {
  const used = docs.reduce((sum, d) => sum + (Number(d.size) || 0), 0);
  const textEl = $("docStorageText");
  const fill = $("docStorageFill");
  if (textEl) {
    textEl.innerHTML = t("doc.storageUsed", "Đã dùng {used} / {quota}", {
      used: formatFileSize(used),
      quota: formatFileSize(STORAGE_QUOTA)
    });
  }
  if (fill) fill.style.width = Math.min(100, (used / STORAGE_QUOTA) * 100) + "%";
}

function renderTabs() {
  document.querySelectorAll("#docCategoryTabs .doc-tab").forEach((tab) => {
    const cat = tab.dataset.category;
    const count = cat === "all" ? docs.length : docs.filter((d) => categoryOf(d) === cat).length;
    let label = tab.textContent.replace(/\s*\d+$/, "");
    if (!tab.dataset.label) tab.dataset.label = label;
    label = tab.dataset.label;
    tab.textContent = count ? `${label} ${count}` : label;
    tab.classList.toggle("active", cat === activeCategory);
  });
}

function renderBulkBar() {
  const bar = $("docBulkBar");
  if (!bar) return;
  const n = selectedIds.size;
  bar.classList.toggle("hidden", n === 0);
  const txt = $("docSelectedText");
  if (txt) txt.innerHTML = t("doc.selectedCount", "Đã chọn {count} tệp", { count: n });
  const selectAll = $("btnDocSelectAll");
  if (selectAll) selectAll.textContent = t("doc.selectAll", "Chọn tất cả");
}

function render() {
  renderStorage();
  renderTabs();
  renderBulkBar();
  const list = visibleDocs();
  const box = $("docList");
  if (!box) return;
  box.classList.toggle("grid", viewMode === "grid");
  box.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "doc-empty";
    empty.innerHTML = `<div class="doc-empty-icon">📂</div>
      <strong>${t("doc.empty", "Chưa có tệp nào")}</strong>
      <span>${t("doc.emptyHint", "Tải một tệp lên để lưu vào tài khoản và gửi bất cứ lúc nào.")}</span>`;
    box.appendChild(empty);
    return;
  }

  list.forEach((doc) => {
    box.appendChild(viewMode === "grid" ? createGridItem(doc) : createListItem(doc));
  });
}

function makeCheckbox(doc) {
  const wrap = document.createElement("label");
  wrap.className = "doc-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = selectedIds.has(doc.id);
  cb.setAttribute("aria-label", doc.name || "file");
  cb.addEventListener("change", () => {
    if (cb.checked) selectedIds.add(doc.id);
    else selectedIds.delete(doc.id);
    render();
  });
  wrap.appendChild(cb);
  wrap.addEventListener("click", (e) => e.stopPropagation());
  return wrap;
}

function makeThumb(doc) {
  const thumb = document.createElement("div");
  thumb.className = "doc-thumb";
  const cat = categoryOf(doc);
  if (doc.url && (cat === "image" || cat === "video")) {
    const media = document.createElement(cat === "image" ? "img" : "video");
    media.loading = "lazy";
    media.src = cat === "video" ? `${doc.url}#t=0.1` : doc.url;
    if (cat === "video") { media.muted = true; media.preload = "metadata"; }
    media.alt = doc.name || "";
    media.onerror = () => { thumb.innerHTML = `<span class="doc-thumb-icon">${fileIcon(doc)}</span>`; };
    thumb.appendChild(media);
    const badge = document.createElement("span");
    badge.className = "doc-thumb-badge";
    badge.textContent = cat === "video" ? "▶" : "🖼";
    thumb.appendChild(badge);
  } else {
    thumb.innerHTML = `<span class="doc-thumb-icon">${fileIcon(doc)}</span>`;
  }
  return thumb;
}

function makeActions(doc) {
  const actions = document.createElement("div");
  actions.className = "doc-actions";

  const send = document.createElement("button");
  send.type = "button";
  send.className = "btn btn-sm btn-primary";
  send.textContent = t("doc.send", "Gửi");
  send.addEventListener("click", (e) => { e.stopPropagation(); sendDocument(doc); });

  const dl = iconButton("⬇", "doc.download", "Tải xuống", (e) => { e.stopPropagation(); downloadDocument(doc); });
  const rename = iconButton("✎", "doc.rename", "Đổi tên", (e) => { e.stopPropagation(); renameDocument(doc); });
  const del = iconButton("🗑", "doc.delete", "Xóa", (e) => { e.stopPropagation(); deleteDocument(doc); });
  del.classList.add("doc-delete");

  actions.append(send, dl, rename, del);
  return actions;
}

function iconButton(text, i18nKey, fallback, handler) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-icon btn-sm";
  btn.textContent = text;
  btn.title = t(i18nKey, fallback);
  btn.setAttribute("aria-label", t(i18nKey, fallback));
  btn.addEventListener("click", handler);
  return btn;
}

function createListItem(doc) {
  const row = document.createElement("div");
  row.className = "doc-item" + (selectedIds.has(doc.id) ? " selected" : "");
  const thumb = makeThumb(doc);
  thumb.classList.add("doc-thumb-sm");
  const meta = document.createElement("div");
  meta.className = "doc-meta";
  const name = document.createElement("strong");
  name.className = "doc-name";
  name.textContent = doc.name || "file";
  name.title = doc.name || "file";
  const sub = document.createElement("span");
  sub.className = "doc-sub";
  const catKey = {
    image: "doc.images", video: "doc.videos", audio: "doc.audios",
    document: "doc.documents", other: "doc.others"
  }[categoryOf(doc)];
  sub.textContent = `${t(catKey, categoryOf(doc))} · ${formatFileSize(doc.size || 0)} · ${
    doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""
  }`;
  meta.append(name, sub);
  row.append(makeCheckbox(doc), thumb, meta, makeActions(doc));
  row.addEventListener("click", () => {
    if (categoryOf(doc) === "image" || categoryOf(doc) === "video") openPreview(doc);
    else toggleSelect(doc.id);
  });
  return row;
}

function createGridItem(doc) {
  const card = document.createElement("div");
  card.className = "doc-grid-item" + (selectedIds.has(doc.id) ? " selected" : "");
  card.append(makeCheckbox(doc), makeThumb(doc));
  const name = document.createElement("span");
  name.className = "doc-grid-name";
  name.textContent = doc.name || "file";
  card.appendChild(name);
  card.addEventListener("click", () => openPreview(doc));
  return card;
}

function toggleSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

/* ---------- Tải lên ---------- */
function setUploadProgress(value, active, label) {
  const bar = $("docUploadProgress");
  const fill = $("docUploadProgressFill");
  if (!bar || !fill) return;
  bar.classList.toggle("hidden", !active);
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  fill.style.width = pct + "%";
  bar.setAttribute("aria-valuenow", String(pct));
  if (label) bar.setAttribute("aria-label", label);
}

async function uploadFiles(fileList) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const btn = $("btnDocUpload");
  if (btn) btn.disabled = true;
  let done = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.size) continue;
    if (file.size > MAX_DOC_SIZE) {
      window.notify?.(`${t("toast.fileTooLarge", "Tệp quá lớn. Tối đa")} ${formatFileSize(MAX_DOC_SIZE)}: ${file.name}`);
      continue;
    }
    try {
      const docRef = push(dbRef(rtdb, docsRoot(uid)));
      const path = `${docsRoot(uid)}/${docRef.key}_${safeName(file.name)}`;
      const ref = storageRef(storage, path);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref, file, { contentType: file.type || "application/octet-stream" });
        task.on("state_changed",
          (snap) => {
            if (snap.totalBytes) {
              const overall = (i + snap.bytesTransferred / snap.totalBytes) / files.length;
              setUploadProgress(overall, true, file.name);
            }
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
  if (done) window.notify?.(`${t("doc.uploadSuccess", "Đã lưu tệp vào Tệp của tôi")} (${done})`);
}

/* ---------- Tải xuống / đổi tên / xoá ---------- */
function triggerDownload(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "file";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function resolveUrl(doc) {
  return doc.url || await getDownloadURL(storageRef(storage, doc.path));
}

async function downloadDocument(doc) {
  try {
    const url = await resolveUrl(doc);
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, doc.name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  } catch (err) {
    window.notify?.(err?.message || t("app.downloadFail", "Không tải được tệp."));
  }
}

async function renameDocument(doc) {
  const name = window.prompt(t("doc.renamePrompt", "Tên tệp mới:"), doc.name || "");
  const trimmed = (name || "").trim();
  if (!trimmed || trimmed === doc.name) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await update(dbRef(rtdb, `${docsRoot(uid)}/${doc.id}`), { name: trimmed });
    window.notify?.(t("doc.renameSuccess", "Đã đổi tên tệp"));
  } catch (err) {
    window.notify?.(err?.message || "Không đổi được tên tệp.");
  }
}

async function deleteDocument(doc) {
  if (!window.confirm(t("doc.deleteConfirm", "Xóa tệp này khỏi Tệp của tôi?"))) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await remove(dbRef(rtdb, `${docsRoot(uid)}/${doc.id}`));
    if (doc.path) await deleteObject(storageRef(storage, doc.path)).catch(() => {});
    selectedIds.delete(doc.id);
    window.notify?.(t("doc.deleteSuccess", "Đã xóa tệp"));
  } catch (err) {
    window.notify?.(err?.message || "Không xoá được tệp.");
  }
}

/* ---------- Gửi vào chat (1 hoặc nhiều tệp) ---------- */
async function toFile(doc) {
  const res = await fetch(await resolveUrl(doc));
  if (!res.ok) throw new Error("fetch failed");
  const blob = await res.blob();
  return new File([blob], doc.name || "file", { type: doc.mime || "application/octet-stream" });
}

async function sendDocument(doc) {
  if (!window.app?.currentChatId?.()) {
    window.notify?.(t("doc.noChat", "Hãy mở một cuộc trò chuyện trước khi gửi tệp"));
    return;
  }
  if (typeof window.app.sendDocumentFiles !== "function") return;
  try {
    const file = await toFile(doc);
    await window.app.sendDocumentFiles([file]);
    closeDocuments();
    window.notify?.(t("doc.sentToChat", "Đã gửi {count} tệp vào cuộc trò chuyện", { count: 1 }));
  } catch (err) {
    window.notify?.(err?.message || "Không gửi được tệp.");
  }
}

async function sendSelected() {
  if (!window.app?.currentChatId?.()) {
    window.notify?.(t("doc.noChat", "Hãy mở một cuộc trò chuyện trước khi gửi tệp"));
    return;
  }
  const chosen = docs.filter((d) => selectedIds.has(d.id));
  if (!chosen.length || typeof window.app.sendDocumentFiles !== "function") return;
  const btn = $("btnDocSendSelected");
  if (btn) btn.disabled = true;
  try {
    const files = [];
    for (const doc of chosen) files.push(await toFile(doc));
    await window.app.sendDocumentFiles(files);
    selectedIds.clear();
    closeDocuments();
    window.notify?.(t("doc.sentToChat", "Đã gửi {count} tệp vào cuộc trò chuyện", { count: files.length }));
  } catch (err) {
    window.notify?.(err?.message || "Không gửi được tệp.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function downloadSelected() {
  const chosen = docs.filter((d) => selectedIds.has(d.id));
  for (const doc of chosen) await downloadDocument(doc);
}

async function deleteSelected() {
  const chosen = docs.filter((d) => selectedIds.has(d.id));
  if (!chosen.length) return;
  if (!window.confirm(t("doc.confirmDeleteMany", "Xóa {count} tệp đã chọn?", { count: chosen.length }))) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    for (const doc of chosen) {
      await remove(dbRef(rtdb, `${docsRoot(uid)}/${doc.id}`));
      if (doc.path) await deleteObject(storageRef(storage, doc.path)).catch(() => {});
    }
    selectedIds.clear();
    window.notify?.(t("doc.deleteSuccess", "Đã xóa tệp"));
  } catch (err) {
    window.notify?.(err?.message || "Không xoá được tệp.");
  }
}

/* ---------- Xem trước ---------- */
function openPreview(doc) {
  previewDoc = doc;
  const modalEl = previewModal();
  if (!modalEl) return;
  const title = $("docPreviewTitle");
  const body = $("docPreviewBody");
  if (title) title.textContent = doc.name || "file";
  if (body) {
    body.innerHTML = "";
    const cat = categoryOf(doc);
    if (doc.url && cat === "image") {
      const img = document.createElement("img");
      img.src = doc.url;
      img.alt = doc.name || "";
      body.appendChild(img);
    } else if (doc.url && cat === "video") {
      const video = document.createElement("video");
      video.src = doc.url;
      video.controls = true;
      video.preload = "metadata";
      body.appendChild(video);
    } else {
      const box = document.createElement("div");
      box.className = "doc-preview-file";
      box.innerHTML = `<div class="doc-preview-icon">${fileIcon(doc)}</div>
        <strong>${doc.name || "file"}</strong>
        <span>${formatFileSize(doc.size || 0)}</span>`;
      body.appendChild(box);
    }
  }
  modalEl.classList.remove("hidden", "closing");
  document.body.classList.add("modal-open");
}

function closePreview() {
  const el = previewModal();
  if (!el || el.classList.contains("hidden")) return;
  const video = $("docPreviewBody")?.querySelector("video");
  try { video?.pause(); } catch { /* ignore */ }
  el.classList.add("closing");
  if (!modal() || modal().classList.contains("hidden")) document.body.classList.remove("modal-open");
  setTimeout(() => {
    el.classList.add("hidden");
    el.classList.remove("closing");
    previewDoc = null;
  }, 190);
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
  $("docSearch")?.addEventListener("input", (e) => { searchTerm = e.target.value || ""; render(); });
  $("docSort")?.addEventListener("change", (e) => { sortMode = e.target.value || "newest"; render(); });

  $("btnDocView")?.addEventListener("click", () => {
    viewMode = viewMode === "list" ? "grid" : "list";
    const btn = $("btnDocView");
    if (btn) {
      btn.textContent = viewMode === "grid" ? "☰" : "▦";
      btn.title = t(viewMode === "grid" ? "doc.listView" : "doc.gridView", viewMode === "grid" ? "Xem danh sách" : "Xem lưới");
    }
    render();
  });

  document.querySelectorAll("#docCategoryTabs .doc-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeCategory = tab.dataset.category || "all";
      render();
    });
  });

  $("btnDocSelectAll")?.addEventListener("click", () => {
    const list = visibleDocs();
    const allSelected = list.length > 0 && list.every((d) => selectedIds.has(d.id));
    list.forEach((d) => { if (allSelected) selectedIds.delete(d.id); else selectedIds.add(d.id); });
    render();
  });
  $("btnDocClearSelection")?.addEventListener("click", () => { selectedIds.clear(); render(); });
  $("btnDocSendSelected")?.addEventListener("click", sendSelected);
  $("btnDocDownloadSelected")?.addEventListener("click", downloadSelected);
  $("btnDocDeleteSelected")?.addEventListener("click", deleteSelected);

  $("btnDocPreviewClose")?.addEventListener("click", closePreview);
  document.querySelector('#docPreviewModal [data-close="docPreview"]')?.addEventListener("click", closePreview);
  $("btnDocPreviewDownload")?.addEventListener("click", () => { if (previewDoc) downloadDocument(previewDoc); });
  $("btnDocPreviewSend")?.addEventListener("click", () => { if (previewDoc) { closePreview(); sendDocument(previewDoc); } });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!previewModal()?.classList.contains("hidden")) closePreview();
    else if (!modal()?.classList.contains("hidden")) closeDocuments();
  });

  window.addEventListener("i18n:changed", () => {
    // applyTranslations() đã ghi nhãn mới vào textContent → xoá cache để renderTabs đọc lại.
    document.querySelectorAll("#docCategoryTabs .doc-tab").forEach((tab) => {
      delete tab.dataset.label;
    });
    renderBulkBar();
    render();
  });
}
