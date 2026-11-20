import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  collection, query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { listenIncomingRequests, getConnectedUsers } from "./connections.js";
import { chatIdFor } from "./messages.js";
import { getUserProfile } from "./users.js";
import { getSettings } from "./settings.js";

/* ============================================================
   TRUNG TÂM THÔNG BÁO
   - Lời mời kết bạn + tin nhắn mới từ các cuộc trò chuyện.
   - Badge trên chuông, badge chưa đọc cạnh từng kết nối.
   - Tuỳ chọn âm thanh + thông báo hệ thống (trình duyệt).
   ============================================================ */

const MAX_ITEMS = 50;
const BASE_TITLE = document.title || "StarmentChat";
const SESSION_STARTED_AT = Date.now();
const notifKey = (uid) => `starment_notifications_${uid}`;
const metaKey = (uid) => `starment_notif_meta_${uid}`;

let currentUid = null;
let items = [];
let meta = defaultMeta();
let activePartnerUid = null;
let requestUnsub = null;
let chatUnsubs = new Map();
const profileNameCache = new Map();
const PROFILE_CACHE_TTL = 5 * 60 * 1000;

function defaultMeta() {
  return { chatLast: {}, chatUnread: {}, knownRequests: [], requestsBootstrapped: false };
}

function loadState(uid) {
  try {
    items = JSON.parse(localStorage.getItem(notifKey(uid)) || "[]");
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }
  items = items
    .filter((it) => it && typeof it === "object" && it.id)
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, MAX_ITEMS);

  try {
    const saved = JSON.parse(localStorage.getItem(metaKey(uid)) || "{}");
    meta = { ...defaultMeta(), ...(saved && typeof saved === "object" ? saved : {}) };
  } catch {
    meta = defaultMeta();
  }
  if (!meta.chatLast || typeof meta.chatLast !== "object") meta.chatLast = {};
  if (!meta.chatUnread || typeof meta.chatUnread !== "object") meta.chatUnread = {};
  if (!Array.isArray(meta.knownRequests)) meta.knownRequests = [];
  meta.requestsBootstrapped = !!meta.requestsBootstrapped;
}

function saveItems() {
  if (!currentUid) return;
  try {
    localStorage.setItem(notifKey(currentUid), JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore */
  }
}

function saveMeta() {
  if (!currentUid) return;
  try {
    localStorage.setItem(metaKey(currentUid), JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/* ---------- Hiển thị ---------- */
function unreadCount() {
  return items.filter((it) => !it.read).length;
}

function renderBadge() {
  const badge = document.getElementById("notifBadge");
  const count = unreadCount();
  if (badge) {
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  }
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${BASE_TITLE}` : BASE_TITLE;
}

function updateConnectionBadges() {
  document.querySelectorAll("#connections .conn-badge[data-uid]").forEach((el) => {
    const count = meta.chatUnread?.[el.dataset.uid] || 0;
    el.textContent = count > 99 ? "99+" : String(count);
    el.classList.toggle("hidden", count === 0);
  });
}

function emitChanged() {
  renderBadge();
  updateConnectionBadges();
  if (!document.getElementById("notificationsModal")?.classList.contains("hidden")) {
    renderList();
  }
  window.dispatchEvent(
    new CustomEvent("notifications:changed", {
      detail: { unread: unreadCount(), chatUnread: { ...(meta.chatUnread || {}) } }
    })
  );
}

function formatRelative(ts) {
  const diff = Date.now() - (Number(ts) || 0);
  if (diff < 60 * 1000) return "Vừa xong";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} phút trước`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} giờ trước`;
  if (diff < 48 * 60 * 60 * 1000) return "Hôm qua";
  const d = new Date(Number(ts));
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function renderList() {
  const list = document.getElementById("notifList");
  if (!list) return;
  list.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "notif-empty";
    empty.textContent = "Chưa có thông báo nào.";
    list.appendChild(empty);
    return;
  }
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "notif-item" + (it.read ? "" : " unread");
    li.dataset.id = it.id;

    const icon = document.createElement("div");
    icon.className = "notif-icon " + (it.type === "request" ? "is-request" : "is-message");
    icon.textContent = it.type === "request" ? "👋" : "💬";

    const content = document.createElement("div");
    content.className = "notif-content";
    const title = document.createElement("strong");
    title.textContent = it.title || "Thông báo";
    const text = document.createElement("span");
    text.className = "notif-text";
    text.textContent = it.body || "";
    const time = document.createElement("span");
    time.className = "notif-time";
    time.dataset.at = String(it.at || 0);
    time.textContent = formatRelative(it.at);
    content.append(title, text, time);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "notif-delete";
    del.title = "Xoá thông báo";
    del.setAttribute("aria-label", "Xoá thông báo");
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      removeNotification(it.id);
    });

    li.append(icon, content, del);
    li.tabIndex = 0;
    li.addEventListener("click", () => onNotificationClick(it));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onNotificationClick(it);
      }
    });
    list.appendChild(li);
  });
}

function refreshTimes() {
  document.querySelectorAll("#notifList .notif-time").forEach((el) => {
    el.textContent = formatRelative(el.dataset.at);
  });
}

/* ---------- Thao tác ---------- */
function removeNotification(id) {
  const before = items.length;
  items = items.filter((it) => it.id !== id);
  if (items.length !== before) {
    saveItems();
    emitChanged();
  }
}

function markAllRead() {
  let changed = false;
  items.forEach((it) => {
    if (!it.read) {
      it.read = true;
      changed = true;
    }
  });
  if (changed) {
    saveItems();
    emitChanged();
  }
}

function clearAll() {
  if (items.length === 0) return;
  items = [];
  saveItems();
  emitChanged();
}

function setChatUnread(partnerUid, count) {
  if (!partnerUid) return;
  const next = Math.max(0, Number(count) || 0);
  if ((meta.chatUnread[partnerUid] || 0) === next) return;
  meta.chatUnread[partnerUid] = next;
  if (next === 0) delete meta.chatUnread[partnerUid];
  saveMeta();
  emitChanged();
}

function markChatRead(partnerUid) {
  if (!partnerUid) return;
  let changed = false;
  if (meta.chatUnread[partnerUid]) {
    delete meta.chatUnread[partnerUid];
    saveMeta();
    changed = true;
  }
  items.forEach((it) => {
    if (it.type === "message" && it.partnerUid === partnerUid && !it.read) {
      it.read = true;
      changed = true;
    }
  });
  if (changed) {
    saveItems();
    emitChanged();
  }
}

function onNotificationClick(it) {
  let changed = !it.read;
  it.read = true;
  if (it.type === "message" && it.partnerUid) {
    markChatRead(it.partnerUid);
    closeNotifications();
    window.app?.openChat?.(it.partnerUid);
  } else if (it.type === "request") {
    closeNotifications();
    const section = document.getElementById("requestsSection");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "center" });
      section.classList.add("flash");
      setTimeout(() => section.classList.remove("flash"), 1600);
    }
  }
  if (changed) {
    saveItems();
    emitChanged();
  }
}

/* ---------- Âm thanh ---------- */
let audioCtx = null;

function unlockAudio() {
  try {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  } catch {
    /* ignore */
  }
}

function playNotificationSound() {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioCtx = audioCtx || new AudioCtor();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const start = audioCtx.currentTime;
    [880, 1174.66].forEach((freq, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const at = start + index * 0.12;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + 0.18);
    });
  } catch {
    /* ignore */
  }
}

/* ---------- Thông báo hệ thống ---------- */
function showDesktopNotification(entry) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try {
    const native = new Notification(entry.title, {
      body: entry.body,
      tag: entry.partnerUid || entry.id,
      silent: getSettings().notifSound
    });
    native.onclick = () => {
      window.focus();
      if (entry.partnerUid) window.app?.openChat?.(entry.partnerUid);
      native.close();
    };
  } catch {
    /* ignore */
  }
}

/* ---------- Tên hiển thị ---------- */
function getUserName(uid) {
  const hit = profileNameCache.get(uid);
  if (hit && Date.now() - hit.at < PROFILE_CACHE_TTL) return Promise.resolve(hit.name);
  return getUserProfile(uid)
    .then((profile) => {
      const name = profile?.displayName || "Người dùng";
      profileNameCache.set(uid, { name, at: Date.now() });
      return name;
    })
    .catch(() => "Người dùng");
}

/* ---------- Thêm thông báo ---------- */
function addNotification(entry) {
  if (!currentUid || !entry?.id) return;
  if (items.some((it) => it.id === entry.id)) return;
  const settings = getSettings();
  const item = { ...entry, read: false };
  if (settings.notifInApp) {
    items.unshift(item);
    items = items.slice(0, MAX_ITEMS);
    saveItems();
  }
  if (settings.notifSound) playNotificationSound();
  if (settings.notifDesktop) showDesktopNotification(item);
  emitChanged();
}

/* ---------- Tin nhắn mới ---------- */
function previewText(msg) {
  if (!msg) return "Bạn có tin nhắn mới";
  if (msg.imageUrl) return "📷 Ảnh";
  if (msg.attachment) {
    if (msg.attachment.kind === "image") return "📷 Ảnh";
    if (msg.attachment.kind === "audio") return "🎤 Tin nhắn thoại";
    return "📎 " + (msg.attachment.name || "Tệp đính kèm");
  }
  const text = (msg.text || "").trim();
  if (!text) return "Bạn có tin nhắn mới";
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}

function handleLatestMessage(partnerUid, chatId, msgId, data) {
  if (!currentUid) return;
  const myUid = currentUid;
  const at = data?.createdAt?.toMillis?.() || Date.now();
  const prev = meta.chatLast[chatId];
  meta.chatLast[chatId] = { id: msgId, at };
  saveMeta();

  // Tắt thông báo từng người
  try {
    const muted = JSON.parse(localStorage.getItem("mutedUsers_" + myUid) || "[]");
    if (Array.isArray(muted) && muted.includes(partnerUid)) return;
  } catch { /* ignore */ }
  // Lần đầu thấy hội thoại: chỉ báo nếu tin đến trong phiên hiện tại
  // (tránh dồn thông báo cho toàn bộ lịch sử khi vừa đăng nhập).
  if (!prev && at <= SESSION_STARTED_AT) return;

  const chatOpen =
    window.app?.currentChatId?.() === chatId && document.visibilityState === "visible";
  if (chatOpen) {
    setChatUnread(partnerUid, 0);
    return;
  }

  setChatUnread(partnerUid, (meta.chatUnread[partnerUid] || 0) + 1);

  const settings = getSettings();
  if (!settings.notifInApp && !settings.notifSound && !settings.notifDesktop) return;

  const body = settings.notifPreview ? previewText(data) : "Bạn có tin nhắn mới";
  const id = `msg_${msgId}`;
  getUserName(partnerUid).then((name) => {
    if (currentUid !== myUid) return;
    if (items.some((it) => it.id === id)) return;
    // Người dùng có thể đã mở đúng cuộc trò chuyện trong lúc chờ lấy tên.
    if (
      window.app?.currentChatId?.() === chatId &&
      document.visibilityState === "visible"
    ) {
      return;
    }
    addNotification({
      id,
      type: "message",
      title: `Tin nhắn mới từ ${name}`,
      body,
      partnerUid,
      at
    });
  });
}

function listenChatPartner(partnerUid) {
  if (!currentUid || chatUnsubs.has(partnerUid)) return;
  const chatId = chatIdFor(currentUid, partnerUid);
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const unsub = onSnapshot(
    q,
    (snap) => {
      if (!snap.size) return;
      const docSnap = snap.docs[0];
      handleLatestMessage(partnerUid, chatId, docSnap.id, docSnap.data());
    },
    () => {
      // Hội thoại chưa tồn tại (chưa có tin nhắn đầu) → thử lại sau.
      if (chatUnsubs.get(partnerUid) !== unsub) return;
      chatUnsubs.delete(partnerUid);
      setTimeout(() => {
        if (currentUid) listenChatPartner(partnerUid);
      }, 15000);
    }
  );
  chatUnsubs.set(partnerUid, unsub);
}

async function syncChatListeners() {
  if (!currentUid) return;
  const myUid = currentUid;
  chatUnsubs.forEach((unsub) => unsub());
  chatUnsubs.clear();
  let users = [];
  try {
    users = await getConnectedUsers(myUid);
  } catch {
    users = [];
  }
  if (currentUid !== myUid) return;
  users.forEach((uid) => listenChatPartner(uid));
  // Bỏ badge chưa đọc của những kết nối không còn tồn tại.
  const connected = new Set(users);
  let pruned = false;
  Object.keys(meta.chatUnread).forEach((uid) => {
    if (!connected.has(uid)) {
      delete meta.chatUnread[uid];
      pruned = true;
    }
  });
  if (pruned) saveMeta();
  emitChanged();
}

/* ---------- Lời mời kết bạn ---------- */
function setupRequestListener() {
  if (requestUnsub) {
    requestUnsub();
    requestUnsub = null;
  }
  if (!currentUid) return;
  requestUnsub = listenIncomingRequests(
    currentUid,
    (snap) => {
      if (!currentUid) return;
      const myUid = currentUid;
      const pendingIds = new Set(snap.docs.map((d) => d.id));
      const known = new Set(meta.knownRequests);
      const firstRun = !meta.requestsBootstrapped;
      let changed = false;
      let hasNewRequest = false;

      // Bỏ thông báo của lời mời đã được xử lý.
      const before = items.length;
      items = items.filter((it) => it.type !== "request" || pendingIds.has(it.requestId));
      if (items.length !== before) changed = true;

      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        hasNewRequest = true;
        const id = change.doc.id;
        if (known.has(id)) return;
        known.add(id);
        if (firstRun) return;
        const fromUid = change.doc.data().fromUid;
        getUserName(fromUid).then((name) => {
          if (currentUid !== myUid) return;
          addNotification({
            id: `req_${id}`,
            type: "request",
            title: "Lời mời kết bạn",
            body: `${name} đã gửi lời mời kết bạn`,
            partnerUid: fromUid,
            requestId: id,
            at: Date.now()
          });
        });
      });

      meta.knownRequests = [...known].slice(-200);
      meta.requestsBootstrapped = true;
      saveMeta();
      if (changed) saveItems();
      emitChanged();
      // Để app.js tải lại danh sách lời mời ở sidebar.
      if (hasNewRequest && !firstRun) window.dispatchEvent(new CustomEvent("requests:changed"));
    },
    () => {
      /* ignore */
    }
  );
}

/* ---------- Modal ---------- */
const notifModal = () => document.getElementById("notificationsModal");

function openNotifications() {
  const modal = notifModal();
  if (!modal) return;
  renderList();
  modal.classList.remove("hidden", "closing");
  document.body.classList.add("modal-open");
}

function closeNotifications() {
  const modal = notifModal();
  if (!modal || modal.classList.contains("hidden") || modal.classList.contains("closing")) return;
  modal.classList.add("closing");
  document.body.classList.remove("modal-open");
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("closing");
  }, 190);
}

/* ---------- Dọn dẹp ---------- */
function teardown() {
  closeNotifications();
  if (requestUnsub) {
    requestUnsub();
    requestUnsub = null;
  }
  chatUnsubs.forEach((unsub) => unsub());
  chatUnsubs.clear();
  currentUid = null;
  items = [];
  meta = defaultMeta();
  activePartnerUid = null;
  renderBadge();
}

/* ---------- Khởi tạo ---------- */
export function initNotifications() {
  document.getElementById("btnNotifications")?.addEventListener("click", openNotifications);
  document.getElementById("btnNotificationsClose")?.addEventListener("click", closeNotifications);
  document.getElementById("btnNotificationsDone")?.addEventListener("click", closeNotifications);
  document
    .querySelector('#notificationsModal [data-close="notifications"]')
    ?.addEventListener("click", closeNotifications);
  document.getElementById("btnNotifReadAll")?.addEventListener("click", markAllRead);
  document.getElementById("btnNotifClear")?.addEventListener("click", clearAll);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !notifModal()?.classList.contains("hidden")) closeNotifications();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activePartnerUid) {
      markChatRead(activePartnerUid);
    }
    renderBadge();
  });

  window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });

  window.addEventListener("connections:changed", () => {
    if (currentUid) syncChatListeners();
  });
  window.addEventListener("chat:opened", (e) => {
    activePartnerUid = e.detail?.partnerUid || null;
    if (activePartnerUid) markChatRead(activePartnerUid);
  });
  window.addEventListener("chat:closed", () => {
    activePartnerUid = null;
  });

  setInterval(() => {
    if (!notifModal()?.classList.contains("hidden")) refreshTimes();
  }, 60000);

  onAuthStateChanged(auth, async (user) => {
    teardown();
    if (!user) {
      emitChanged();
      return;
    }
    currentUid = user.uid;
    loadState(user.uid);
    emitChanged();
    setupRequestListener();
    await syncChatListeners();
  });
}
