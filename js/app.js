import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { ensureUserProfile, getUserProfile, blockUser, unblockUser, isBlocked, getBlockedUids } from "./users.js";
import { setPresence, setOffline, formatLastSeen } from "./presence.js";
import { searchByUid, searchByName, sendFriendRequest, listIncomingRequests, respondRequest, getConnectedUsers, MAX_CONNECTIONS, removeConnection } from "./connections.js";
import { chatIdFor, sendMessage, listenMessages, markMessagesAsRead, listenMessageStatus, listenChat, getStreak, STREAK_MILESTONES, deleteMessage, retractMessage, pinMessage, unpinMessage, getPinnedMessages, pinChat, unpinChat, isChatPinned, createGroupChat, updateGroupChat, addMemberToGroup, removeMemberFromGroup } from "./messages.js";
import { uploadChatAttachment, getAttachmentUrl, downloadAttachment, formatFileSize } from "./storage.js";
import { setTyping } from "./presence.js";
import { listenTyping } from "./typing.js";
import { listenPresence } from "./presence.js";
import { getSettings } from "./settings.js";
import { db } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const LAST_CHAT_KEY = "starment_last_chat";
const PINNED_KEY = (uid) => `pinnedFriends_${uid}`;
const PINNED_CHATS_KEY = "starment_pinned_chats";
let currentUser = null;
let currentChatId = null;
let currentChatPartnerUid = null;
let unsubscribeMessages = null;
let unsubscribeTyping = null;
let unsubscribePresence = null;
let unsubscribeMsgStatus = null;
let unsubscribeChat = null;
let renderedMsgIds = new Set();
let stickToBottom = true;
let unseenWhileAway = 0;
let scrollHandler = null;
let presenceCache = new Map();
let presenceUnsubscribes = new Map();
let replyingToMsg = null;
let currentStreak = null;
let typingIdleTimer = null;
let composerRO = null;
let smoothScrollLockUntil = 0;
let chatSessionId = 0;
let typingStaleTimer = null;
let currentPartnerLabel = "";
let presenceUid = null;

function getPinnedList(uid) {
  if (!uid) return [];
  try {
    const list = JSON.parse(localStorage.getItem(PINNED_KEY(uid)) || "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function setPinnedList(uid, list) {
  try { localStorage.setItem(PINNED_KEY(uid), JSON.stringify(list)); } catch { /* ignore */ }
}


function togglePin() {
  if (!currentUser || !currentChatPartnerUid) return null;
  const list = getPinnedList(currentUser.uid);
  const has = list.includes(currentChatPartnerUid);
  const next = has ? list.filter((x) => x !== currentChatPartnerUid) : [currentChatPartnerUid, ...list];
  setPinnedList(currentUser.uid, next);
  updatePinButton();
  refreshConnections();
  return !has;
}

const profileCache = new Map();
const PROFILE_CACHE_TTL = 5 * 60 * 1000;

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function getProfileCached(uid) {
  const hit = profileCache.get(uid);
  if (hit && Date.now() - hit.at < PROFILE_CACHE_TTL) return hit.promise;
  const promise = getUserProfile(uid).catch(() => null);
  profileCache.set(uid, { promise, at: Date.now() });
  return promise;
}

function setMyStatus(online) {
  document.body.classList.toggle("is-online", !!online);
  document.body.classList.toggle("is-offline", !online);
}

onAuthStateChanged(auth, async (u) => {
  const previousUid = presenceUid;
  currentUser = u;
  if (u) {
    presenceUid = u.uid;
    await ensureUserProfile(u);
    setPresence(u.uid);
    setMyStatus(true);
    await refreshConnections();
    
    // Restore last opened chat
    const lastPartnerUid = localStorage.getItem(LAST_CHAT_KEY);
    if (lastPartnerUid) {
      // Verify the connection still exists
      const users = await getConnectedUsers(currentUser.uid);
      if (users.includes(lastPartnerUid)) {
        openChat(lastPartnerUid);
      } else {
        localStorage.removeItem(LAST_CHAT_KEY);
      }
    }
  } else {
    // Đánh dấu offline ngay khi đăng xuất thay vì đợi onDisconnect.
    if (previousUid) setOffline(previousUid);
    presenceUid = null;
    setMyStatus(false);
    // Clean up all presence listeners
    presenceUnsubscribes.forEach(unsub => unsub());
    presenceUnsubscribes.clear();
    presenceCache.clear();
    closeChat();
    const box = $("connections");
    if (box) box.innerHTML = "";
    const reqBox = $("requests");
    if (reqBox) reqBox.innerHTML = "";
  }
});

// Trạng thái luôn đúng ngay cả khi đóng tab hoặc quay lại từ bfcache.
window.addEventListener("pagehide", () => {
  if (presenceUid) setOffline(presenceUid);
  setMyStatus(false);
});
window.addEventListener("pageshow", () => {
  if (presenceUid && currentUser) {
    setPresence(presenceUid);
    setMyStatus(true);
  }
});

async function refreshConnections() {
  if (!currentUser) return;

  // Clean up old presence listeners
  presenceUnsubscribes.forEach(unsub => unsub());
  presenceUnsubscribes.clear();
  
  const reqs = await listIncomingRequests(currentUser.uid);
  const reqBox = $("requests");
  if (reqBox) {
    reqBox.innerHTML = "";
    if (reqs.length === 0) {
      reqBox.innerHTML = '<li class="user-empty">Không có lời mời nào</li>';
    }
    reqs.forEach((r) => {
      const li = document.createElement("li");
      li.className = "user-item";
      const av = document.createElement("div");
      av.className = "avatar avatar-sm";
      av.textContent = "?";
      const info = document.createElement("div");
      info.className = "user-info";
      const nm = document.createElement("strong");
      nm.textContent = "Người dùng";
      nm.dataset.uid = r.fromUid;
      
      // Online status indicator for requests
      const statusDot = document.createElement("span");
      statusDot.className = "status-dot";
      statusDot.dataset.uid = r.fromUid;
      av.appendChild(statusDot);
      updateStatusDot(statusDot, presenceCache.get(r.fromUid) || { online: false });
      
      const uidEl = document.createElement("span");
      uidEl.className = "user-username";
      uidEl.textContent = r.fromUid.slice(0, 8) + "…";
      getUserProfile(r.fromUid).then((p) => {
        nm.textContent = p?.displayName || r.fromUid.slice(0, 8);
        av.textContent = (p?.displayName || "?").charAt(0).toUpperCase();
        uidEl.textContent = p?.username ? "@" + p.username : r.fromUid.slice(0, 8) + "…";
        // Re-attach status dot
        av.appendChild(statusDot);
        updateStatusDot(statusDot, presenceCache.get(r.fromUid) || { online: false });
      });
      info.append(nm, uidEl);

      const acc = document.createElement("button");
      acc.className = "btn btn-primary btn-sm";
      acc.textContent = "✓";
      acc.onclick = async (e) => { e.stopPropagation(); await respondRequest(r.id, true); await refreshConnections(); };

      const rej = document.createElement("button");
      rej.className = "btn btn-icon btn-sm";
      rej.textContent = "✕";
      rej.onclick = async (e) => { e.stopPropagation(); await respondRequest(r.id, false); await refreshConnections(); };

      li.append(av, info, acc, rej);
      
      // Listen to presence for this request user
      const unsubscribe = listenPresence(r.fromUid, (presence) => {
        presenceCache.set(r.fromUid, presence || { online: false });
        const dot = document.querySelector(`#requests .status-dot[data-uid="${r.fromUid}"]`);
        if (dot) updateStatusDot(dot, presence || { online: false });
      });
      presenceUnsubscribes.set(`request:${r.fromUid}`, unsubscribe);
      
      reqBox.appendChild(li);
    });
  }

  const users = await getConnectedUsers(currentUser.uid);
  const blocked = await getBlockedUids(currentUser.uid);
  const filteredUsers = users.filter((u) => !blocked.includes(u));
  const list = $("connections");
  if (!list) return;
  list.innerHTML = "";
  if (filteredUsers.length === 0) {
    list.innerHTML = '<li class="user-empty">Chưa có kết nối. Hãy tìm bạn bè ở trên.</li>';
  }
  const pinnedKey = "pinnedFriends_" + currentUser.uid;
  let pinned = [];
  try { pinned = JSON.parse(localStorage.getItem(pinnedKey) || "[]"); } catch {}
  filteredUsers.sort((a, b) => {
    const ia = pinned.indexOf(a), ib = pinned.indexOf(b);
    const pa = ia === -1 ? 9999 : ia;
    const pb = ib === -1 ? 9999 : ib;
    return pa - pb;
  });
  filteredUsers.forEach((uid) => {
    const li = document.createElement("li");
    li.className = "user-item";
    li.dataset.uid = uid;
    if (uid === currentChatPartnerUid) li.classList.add("active");
    const av = document.createElement("div");
    av.className = "avatar avatar-sm";
    av.textContent = "?";
    const info = document.createElement("div");
    info.className = "user-info";
    const nm = document.createElement("strong");
    nm.textContent = uid.slice(0, 8) + "…";
    const uidEl = document.createElement("span");
    uidEl.className = "user-username";
    uidEl.textContent = "Đang tải...";
    info.append(nm, uidEl);
    
    // Online status indicator
    const statusDot = document.createElement("span");
    statusDot.className = "status-dot";
    statusDot.dataset.uid = uid;
    av.appendChild(statusDot);
    updateStatusDot(statusDot, presenceCache.get(uid) || { online: false });
    
    // Badge tin nhắn chưa đọc (do notifications.js cập nhật)
    const unreadBadge = document.createElement("span");
    unreadBadge.className = "conn-badge hidden";
    unreadBadge.dataset.uid = uid;
    
    li.append(av, info, unreadBadge);
    li.setAttribute("role", "button");
    li.onclick = () => openChat(uid);
    getUserProfile(uid).then((p) => {
      nm.textContent = p?.displayName || uid.slice(0, 8);
      uidEl.textContent = p?.username ? "@" + p.username : uid.slice(0, 8) + "…";
      av.textContent = (p?.displayName || "?").charAt(0).toUpperCase();
      // Re-attach status dot after avatar text update
      av.appendChild(statusDot);
      updateStatusDot(statusDot, presenceCache.get(uid) || { online: false });
    });
    
    // Listen to presence for this user
    const unsubscribe = listenPresence(uid, (presence) => {
      presenceCache.set(uid, presence || { online: false });
      const dot = document.querySelector(`#connections .status-dot[data-uid="${uid}"]`);
      if (dot) updateStatusDot(dot, presence || { online: false });
      // Also update chat header if this is the current chat partner
      if (uid === currentChatPartnerUid) {
        updateChatHeaderStatus(presence || { online: false });
      }
    });
    presenceUnsubscribes.set(`connection:${uid}`, unsubscribe);
    
    list.appendChild(li);
  });
  
  // Báo cho notifications.js đồng bộ lại danh sách theo dõi tin nhắn.
  window.dispatchEvent(new CustomEvent("connections:changed"));
}

function lastSeenText(presence) {
  const text = formatLastSeen(presence?.lastSeen);
  return text ? `Xem lần cuối ${text}` : "Ngoại tuyến";
}

function updateStatusDot(dot, presence) {
  if (!dot) return;
  const online = !!presence?.online;
  dot.classList.toggle("online", online);
  dot.classList.toggle("offline", !online);
  dot.title = online ? "Trực tuyến" : lastSeenText(presence);
}

function isNearBottom(box) {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= 80;
}

function updateScrollBottomButton() {
  const btn = $("scrollBottom");
  if (!btn) return;
  const visible = !!currentChatId && !stickToBottom;
  btn.classList.toggle("hidden", !visible);
  const badge = $("scrollBottomBadge");
  if (badge) {
    badge.textContent = unseenWhileAway > 99 ? "99+" : String(unseenWhileAway);
    badge.classList.toggle("hidden", unseenWhileAway === 0);
  }
}

function scrollToBottom(behavior = "auto") {
  const box = $("messages");
  if (!box) return;
  stickToBottom = true;
  unseenWhileAway = 0;
  updateScrollBottomButton();
  if (behavior === "smooth") {
    smoothScrollLockUntil = performance.now() + 700;
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  } else {
    box.scrollTop = box.scrollHeight;
  }
}

/* Bám đáy sau khi render/ảnh tải xong/thanh địa chỉ đổi kích thước. */
function settleAtBottom() {
  scrollToBottom("auto");
  requestAnimationFrame(() => scrollToBottom("auto"));
  setTimeout(() => { if (currentChatId && stickToBottom) scrollToBottom("auto"); }, 160);
  setTimeout(() => { if (currentChatId && stickToBottom) scrollToBottom("auto"); }, 450);
  setTimeout(() => { if (currentChatId && stickToBottom) scrollToBottom("auto"); }, 800);
}

function openImageViewer(url, alt) {
  const viewer = $("imageViewer");
  const img = $("imageViewerImg");
  if (!viewer || !img || !url) return;
  img.src = url;
  img.alt = alt || "Ảnh";
  viewer.classList.remove("hidden");
  requestAnimationFrame(() => viewer.classList.add("show"));
  document.body.classList.add("viewer-open");
}

function closeImageViewer() {
  const viewer = $("imageViewer");
  if (!viewer || viewer.classList.contains("hidden")) return;
  viewer.classList.remove("show");
  document.body.classList.remove("viewer-open");
  setTimeout(() => {
    viewer.classList.add("hidden");
    $("imageViewerImg")?.removeAttribute("src");
  }, 190);
}

function createMessageImage(src, alt, width, height) {
  const img = document.createElement("img");
  img.className = "msg-img loading";
  img.alt = alt || "Ảnh";
  img.loading = "lazy";
  img.decoding = "async";
  if (width && height) {
    img.width = width;
    img.height = height;
    img.style.aspectRatio = `${width} / ${height}`;
  }
  const done = () => {
    img.classList.remove("loading");
    img.classList.add("loaded");
    if (stickToBottom) scrollToBottom("auto");
  };
  img.addEventListener("load", done, { once: true });
  img.addEventListener("error", done, { once: true });
  if (src) img.src = src;
  return img;
}

function trackComposerHeight() {
  const composer = $("composer");
  const chat = document.querySelector(".chat");
  if (!composer || !chat) return;
  const apply = () => {
    chat.style.setProperty("--composer-h", `${composer.offsetHeight}px`);
    if (currentChatId && stickToBottom) {
      requestAnimationFrame(() => { if (stickToBottom) scrollToBottom("auto"); });
    }
  };
  apply();
  if (typeof ResizeObserver === "function") {
    composerRO?.disconnect();
    composerRO = new ResizeObserver(apply);
    composerRO.observe(composer);
  }
}

function restoreBottomOnReturn() {
  if (!currentChatId || !stickToBottom) return;
  scrollToBottom("auto");
  setTimeout(() => { if (currentChatId && stickToBottom) scrollToBottom("auto"); }, 280);
}

$("scrollBottom")?.addEventListener("click", () => scrollToBottom("smooth"));
$("imageViewerClose")?.addEventListener("click", closeImageViewer);
$("imageViewer")?.addEventListener("click", (e) => {
  if (e.target === $("imageViewer") ||
      e.target.classList.contains("image-viewer-backdrop") ||
      e.target.id === "imageViewerImg") {
    closeImageViewer();
  }
});
$("messages")?.addEventListener("click", (e) => {
  const img = e.target.closest(".msg-img");
  if (img && img.src) openImageViewer(img.src, img.alt);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeImageViewer();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") restoreBottomOnReturn();
});
window.addEventListener("pageshow", restoreBottomOnReturn);
window.addEventListener("focus", restoreBottomOnReturn);
window.addEventListener("resize", () => {
  trackComposerHeight();
  if (currentChatId && stickToBottom) scrollToBottom("auto");
});
window.visualViewport?.addEventListener("resize", () => {
  if (currentChatId && stickToBottom) {
    setTimeout(() => { if (stickToBottom) scrollToBottom("auto"); }, 80);
  }
});
$("msgInput")?.addEventListener("focus", () => {
  if (currentChatId && stickToBottom) {
    setTimeout(() => { if (stickToBottom) scrollToBottom("auto"); }, 260);
  }
});
trackComposerHeight();

function attachLongPress(el, mine, msg) {
  let timer = null;
  const showActions = () => {
    const actions = el.querySelector(".msg-actions");
    if (actions) actions.classList.add("show");
  };
  const hideActions = () => {
    const actions = el.querySelector(".msg-actions");
    if (actions) actions.classList.remove("show");
  };
  el.addEventListener("touchstart", (e) => {
    timer = setTimeout(() => {
      if (mine) return; // chỉ tin nhắn đến mới có hành động trả lời
      navigator.vibrate?.(50);
      showActions();
      timer = null;
    }, 500);
  }, { passive: true });
  const clearTimer = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  el.addEventListener("touchend", clearTimer, { passive: true });
  el.addEventListener("touchmove", clearTimer, { passive: true });
  el.addEventListener("touchcancel", clearTimer, { passive: true });
  el.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (mine) return;
    showActions();
  });
  // Ẩn actions khi click ngoài
  document.addEventListener("click", (e) => {
    if (!el.contains(e.target)) hideActions();
  }, { once: true });
}

function fileIconFor(mime, name) {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎵";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "📕";
  if (m.includes("zip") || m.includes("rar") || m.includes("7z") || n.endsWith(".zip") || n.endsWith(".rar")) return "🗜️";
  if (m.includes("sheet") || m.includes("excel") || n.endsWith(".xlsx") || n.endsWith(".csv")) return "📊";
  if (m.includes("presentation") || m.includes("powerpoint") || n.endsWith(".pptx")) return "📽️";
  if (m.startsWith("text/") || m.includes("word") || n.endsWith(".doc") || n.endsWith(".docx")) return "📄";
  return "📎";
}

function attachmentPreviewText(msg) {
  if (!msg) return "";
  if (msg.imageUrl) return "📷 Ảnh";
  if (msg.attachment) {
    return msg.attachment.kind === "image"
      ? "📷 Ảnh"
      : "📎 " + (msg.attachment.name || "Tệp");
  }
  return msg.text || "";
}

function createFileCard(attachment) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "msg-file";

  const icon = document.createElement("span");
  icon.className = "msg-file-icon";
  icon.textContent = fileIconFor(attachment.mime, attachment.name);

  const meta = document.createElement("span");
  meta.className = "msg-file-meta";
  const name = document.createElement("span");
  name.className = "msg-file-name";
  name.textContent = attachment.name || "Tệp";
  const size = document.createElement("span");
  size.className = "msg-file-size";
  size.textContent = attachment.size ? formatFileSize(attachment.size) : "Tải xuống";
  meta.append(name, size);

  const dl = document.createElement("span");
  dl.className = "msg-file-dl";
  dl.textContent = "⬇";

  card.append(icon, meta, dl);
  card.onclick = async (e) => {
    e.stopPropagation();
    if (card.classList.contains("downloading")) return;
    card.classList.add("downloading");
    try {
      await downloadAttachment(attachment);
    } catch (err) {
      window.notify?.(err?.message || "Không tải được tệp.");
    } finally {
      card.classList.remove("downloading");
    }
  };
  return card;
}

function renderAttachment(bubble, attachment) {
  if (!attachment) return;
  if (attachment.kind === "image") {
    const img = createMessageImage(null, attachment.name, attachment.width, attachment.height);
    bubble.appendChild(img);
    getAttachmentUrl(attachment).then((url) => {
      img.src = url;
    }).catch(() => {
      img.replaceWith(createFileCard(attachment));
    });
  } else {
    bubble.appendChild(createFileCard(attachment));
  }
}

function updateChatHeaderStatus(presence) {
  const statusEl = $("chatStatus");
  if (!statusEl) return;
  const avatar = $("chatAvatar");
  const online = !!presence?.online;
  const detail = online ? "Trực tuyến" : lastSeenText(presence);
  statusEl.textContent = currentPartnerLabel ? `${currentPartnerLabel} • ${detail}` : detail;
  statusEl.classList.toggle("online", online);
  statusEl.classList.toggle("offline", !online);
  if (avatar) {
    avatar.classList.toggle("has-presence", !!currentChatPartnerUid);
    avatar.classList.toggle("online", online && !!currentChatPartnerUid);
    avatar.classList.toggle("offline", !online && !!currentChatPartnerUid);
  }
}

function updatePinButton() {
  const btn = $("btnPinChat");
  if (!btn || !currentChatPartnerUid) return;
  const pinned = isChatPinned(currentChatPartnerUid);
  btn.classList.toggle("active", pinned);
  btn.title = pinned ? "Bỏ ghim" : "Ghim";
}

async function togglePinChat() {
  if (!currentChatPartnerUid) return;
  const pinned = isChatPinned(currentChatPartnerUid);
  if (pinned) {
    await unpinChat(currentChatPartnerUid);
  } else {
    await pinChat(currentChatPartnerUid);
  }
  updatePinButton();
  refreshConnections();
}

async function toggleBlockChat() {
  if (!currentChatPartnerUid) return;
  const blocked = await isBlocked(currentUser.uid, currentChatPartnerUid);
  if (blocked) {
    await unblockUser(currentUser.uid, currentChatPartnerUid);
    notify("Đã bỏ chắn.");
  } else {
    if (confirm(`Chặn ${currentChatPartnerUid.slice(0, 8)}…? Tin nhắn của họ sẽ không hiện trong danh sách.`)) {
      await blockUser(currentUser.uid, currentChatPartnerUid);
      notify("Đã chắn.");
      closeChat();
    }
  }
  refreshConnections();
}

async function removeCurrentConnection() {
  if (!currentChatPartnerUid) return;
  if (confirm("Xóa kết nối với người này?")) {
    await removeConnection(currentUser.uid, currentChatPartnerUid);
    closeChat();
    refreshConnections();
  }
}

async function openChat(otherUid) {
  const sessionId = ++chatSessionId;
  currentChatId = chatIdFor(currentUser.uid, otherUid);
  const chatIdAtOpen = currentChatId;
  currentChatPartnerUid = otherUid;
  
  // Cho notifications.js biết cuộc trò chuyện đang mở.
  window.dispatchEvent(new CustomEvent("chat:opened", { detail: { partnerUid: otherUid } }));
  
  // Save last opened chat
  localStorage.setItem(LAST_CHAT_KEY, otherUid);
  
  replyingToMsg = null;
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  if (unsubscribePresence) { unsubscribePresence(); unsubscribePresence = null; }
  if (unsubscribeMsgStatus) { unsubscribeMsgStatus(); unsubscribeMsgStatus = null; }
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }

  const empty = $("chatEmpty");
  if (empty) empty.classList.add("hidden");
  const composer = $("composer");
  if (composer) composer.classList.remove("hidden");

  const appView = $("appView");
  if (appView) appView.classList.add("chat-open");

  document.querySelectorAll("#connections .user-item").forEach((li) => {
    li.classList.toggle("active", li.dataset.uid === otherUid);
  });
  updatePinButton();

  const profile = await getProfileCached(otherUid);
  if (sessionId !== chatSessionId) return;
  window.app?.clearAttachment?.();
  const nameEl = $("chatName");
  if (nameEl) nameEl.textContent = profile?.displayName || otherUid.slice(0, 8) + "…";
  currentPartnerLabel = profile?.username ? "@" + profile.username : "";
  const chatAvatar = $("chatAvatar");
  if (chatAvatar) chatAvatar.textContent = (profile?.displayName || "?").charAt(0).toUpperCase();
  updateChatHeaderStatus(presenceCache.get(otherUid) || { online: false });

  // Cập nhật nút pin/block
  updatePinButton();
  const blockBtn = $("btnBlockChat");
  if (blockBtn) {
    const blocked = await isBlocked(currentUser.uid, otherUid);
    blockBtn.title = blocked ? "Bỏ chắn" : "Chặn";
  }

  // Hiển thị các tin đã ghim
  const box = $("messages");
  renderPinnedMessages(chatIdAtOpen, box);
  // Listen to partner's presence
  unsubscribePresence = listenPresence(otherUid, (presence) => {
    presenceCache.set(otherUid, presence || { online: false });
    updateChatHeaderStatus(presence || { online: false });
  });

  // Listen to streak
  unsubscribeChat = listenChat(currentChatId, (chatData) => {
    if (sessionId !== chatSessionId) return;
    if (chatData) {
      currentStreak = chatData.streak || { count: 0, lastDate: null, milestones: [] };
      updateStreakDisplay();
    }
  });

  let firstSnapshot = true;

  // Mark messages as read when opening chat (không chặn việc hiển thị tin nhắn)
  if (getSettings().readReceipts !== false) {
    markMessagesAsRead(chatIdAtOpen, currentUser.uid).catch(() => {});
  }

  box.innerHTML = "";
  box.innerHTML = "";
  renderedMsgIds.clear();
  stickToBottom = true;
  unseenWhileAway = 0;
  updateScrollBottomButton();
  trackComposerHeight();

  unsubscribeMessages = listenMessages(chatIdAtOpen, async (msgs) => {
    if (currentChatId !== chatIdAtOpen || sessionId !== chatSessionId) return;
    const newMsgs = msgs.filter(m => !renderedMsgIds.has(m.id));
    if (newMsgs.length === 0) {
      if (firstSnapshot) {
        firstSnapshot = false;
        settleAtBottom();
      }
      return;
    }

    newMsgs.forEach((m) => renderedMsgIds.add(m.id));

    const msgById = new Map(msgs.map((m) => [m.id, m]));
    const uidSet = new Set(newMsgs.map((m) => m.senderUid));
    newMsgs.forEach((m) => {
      const replied = m.replyTo ? msgById.get(m.replyTo) : null;
      if (replied) uidSet.add(replied.senderUid);
    });

    const resolvedProfiles = new Map();
    await Promise.all([...uidSet].map(async (uid) => {
      resolvedProfiles.set(uid, await getProfileCached(uid));
    }));
    if (currentChatId !== chatIdAtOpen) return;

    const isInitialBatch = firstSnapshot;
    for (const m of newMsgs) {
      const mine = m.senderUid === currentUser.uid;
      const bubble = document.createElement("div");
      bubble.className = "msg " + (mine ? "outgoing" : "incoming");
      if (!isInitialBatch) bubble.classList.add("msg-new");
      bubble.dataset.msgId = m.id;

      if (!mine) {
        const sender = document.createElement("span");
        sender.className = "msg-sender";
        const senderProfile = resolvedProfiles.get(m.senderUid);
        sender.textContent = senderProfile?.displayName || m.senderUid.slice(0, 8) + "…";
        bubble.appendChild(sender);
      }

      // Reply preview
      if (m.replyTo) {
        const replyPreview = document.createElement("div");
        replyPreview.className = "msg-reply-preview";
        const repliedMsg = msgById.get(m.replyTo);
        if (repliedMsg) {
          const repliedProfile = repliedMsg.senderUid === currentUser.uid
            ? null
            : resolvedProfiles.get(repliedMsg.senderUid);
          const repliedName = repliedMsg.senderUid === currentUser.uid ? "Bạn" : (repliedProfile?.displayName || "Người dùng");
          const replyName = document.createElement("span");
          replyName.className = "reply-name";
          replyName.textContent = repliedName;
          const replyText = document.createElement("span");
          replyText.className = "reply-text";
          replyText.textContent = attachmentPreviewText(repliedMsg);
          replyPreview.append(replyName, replyText);
          bubble.appendChild(replyPreview);

          // Click to scroll to replied message
          replyPreview.onclick = (e) => {
            e.stopPropagation();
            scrollToMessage(m.replyTo);
          };
        }
      }

      if (Array.isArray(m.deletedFor) && m.deletedFor.includes(currentUser.uid)) {
        continue;
      }

      let hasMedia = false;
      if (m.recalled) {
        const recalledEl = document.createElement("div");
        recalledEl.className = "msg-recalled";
        recalledEl.textContent = "🚫 Tin nhắn đã được thu hồi";
        bubble.appendChild(recalledEl);
      } else {
        if (m.attachment) {
          renderAttachment(bubble, m.attachment);
          hasMedia = true;
        } else if (m.imageUrl) {
          bubble.appendChild(createMessageImage(m.imageUrl, "Ảnh"));
          hasMedia = true;
        }

        if (m.text) {
          if (hasMedia) {
            const caption = document.createElement("div");
            caption.className = "msg-text";
            caption.textContent = m.text;
            bubble.appendChild(caption);
          } else {
            bubble.appendChild(document.createTextNode(m.text));
          }
        }
      }

      // Add status indicator for outgoing messages
      if (mine && !m.recalled) {
        const statusSpan = document.createElement("span");
        statusSpan.className = "msg-status";
        if ((m.status || "sent") === "seen") statusSpan.classList.add("seen");
        statusSpan.dataset.msgId = m.id;
        statusSpan.textContent = getStatusText(m.status || "sent");
        bubble.appendChild(statusSpan);
      }

      // Actions
      const actions = document.createElement("div");
      actions.className = "msg-actions";
      if (!mine) {
        const replyBtn = document.createElement("button");
        replyBtn.className = "msg-action-btn";
        replyBtn.textContent = "↩️ Trả lời";
        replyBtn.onclick = (e) => { e.stopPropagation(); startReply(m); };
        actions.appendChild(replyBtn);
        // Pin button
        const pinBtn = document.createElement("button");
        pinBtn.className = "msg-action-btn";
        pinBtn.textContent = "📌 Ghim";
        pinBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            await pinMessage(currentChatId, m.id, currentUser.uid);
            notify("Đã ghim tin nhắn.");
          } catch (err) {
            notify(err?.message || "Không ghim được.");
          }
        };
        actions.appendChild(pinBtn);

        // Delete button (for sender)
        const delBtn = document.createElement("button");
        delBtn.className = "msg-action-btn";
        delBtn.textContent = "🗑️ Xóa";
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (confirm("Xóa tin nhắn này vĩnh viễn?")) {
            try {
              await deleteMessage(currentChatId, m.id, currentUser.uid);
              notify("Đã xóa tin nhắn.");
            } catch (err) {
              notify(err?.message || "Không xóa được.");
            }
          }
        };
        actions.appendChild(delBtn);

        // Retract button (everyone)
        const reBtn = document.createElement("button");
        reBtn.className = "msg-action-btn";
        reBtn.textContent = "↩️ Thu hồi";
        reBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            await retractMessage(currentChatId, m.id);
            notify("Đã thu hồi tin nhắn.");
          } catch (err) {
            notify(err?.message || "Không thu hồi được.");
          }
        };
        actions.appendChild(reBtn);

        bubble.appendChild(actions);
      }
      if (mine && !m.recalled) {
        const recallBtn = document.createElement("button");
        recallBtn.className = "msg-action-btn";
        recallBtn.textContent = "↩️ Thu hồi";
        recallBtn.onclick = async (e) => {
          e.stopPropagation();
          try {
            const { recallMessage } = await import("./messages.js");
            await recallMessage(currentChatId, m.id);
            notify("Đã thu hồi tin nhắn");
          } catch (err) { notify(err?.message || "Không thu hồi được"); }
        };
        actions.appendChild(recallBtn);
      }
      const delBtn = document.createElement("button");
      delBtn.className = "msg-action-btn";
      delBtn.textContent = "🗑️ Xóa";
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const { deleteMessageForMe } = await import("./messages.js");
          await deleteMessageForMe(currentChatId, m.id, currentUser.uid);
          bubble.remove();
          notify("Đã xóa tin nhắn");
        } catch (err) { notify(err?.message || "Không xóa được"); }
      };
      actions.appendChild(delBtn);

      const pinBtn = document.createElement("button");
      pinBtn.className = "msg-action-btn";
      pinBtn.textContent = "📌 Ghim";
      pinBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const { pinMessage } = await import("./messages.js");
          await pinMessage(currentChatId, m.id, currentUser.uid);
          notify("Đã ghim tin nhắn");
        } catch (err) { notify(err?.message || "Không ghim được"); }
      };
      actions.appendChild(pinBtn);

      bubble.appendChild(actions);

      // Handle deleted/retracted messages
      if (m.deleted) {
        const notice = document.createElement("span");
        notice.className = "msg-deleted";
        notice.textContent = "Đã xóa tin nhắn";
        bubble.appendChild(notice);
      } else if (m.retracted) {
        const notice = document.createElement("span");
        notice.className = "msg-deleted";
        notice.textContent = "Đã thu hồi tin nhắn";
        bubble.appendChild(notice);
      } else {
        box.appendChild(bubble);
        attachLongPress(bubble, mine, m);
      }
    }

    if (!isInitialBatch && !stickToBottom) {
      unseenWhileAway += newMsgs.filter((m) => m.senderUid !== currentUser.uid).length;
    }
    firstSnapshot = false;

    if (stickToBottom) {
      requestAnimationFrame(() => {
        if (currentChatId === chatIdAtOpen) scrollToBottom("auto");
      });
      setTimeout(() => {
        if (currentChatId === chatIdAtOpen && stickToBottom) scrollToBottom("auto");
      }, 120);
    } else {
      updateScrollBottomButton();
    }
  });

  settleAtBottom();

  // Listen to message status changes
  unsubscribeMsgStatus = listenMessageStatus(currentChatId, (statuses) => {
    Object.entries(statuses).forEach(([msgId, status]) => {
      const statusSpan = box.querySelector(`.msg-status[data-msg-id="${msgId}"]`);
      if (statusSpan) {
        statusSpan.textContent = getStatusText(status);
        if (status === "seen") {
          statusSpan.classList.add("seen");
        } else {
          statusSpan.classList.remove("seen");
        }
      }
    });
  });

  scrollHandler = () => {
    if (performance.now() < smoothScrollLockUntil) return;
    const atBottom = isNearBottom(box);
    if (stickToBottom === atBottom) return;
    stickToBottom = atBottom;
    if (atBottom) unseenWhileAway = 0;
    updateScrollBottomButton();
  };
  box.addEventListener("scroll", scrollHandler, { passive: true });

  unsubscribeTyping = listenTyping(chatIdAtOpen, (data) => {
    const indicator = $("typing");
    if (!indicator) return;
    if (getSettings().typingIndicator === false) {
      clearTimeout(typingStaleTimer);
      indicator.textContent = "";
      delete indicator.dataset.active;
      return;
    }
    const now = Date.now();
    const othersTyping = Object.keys(data).some((k) => {
      if (k === currentUser.uid) return false;
      const entry = data[k];
      if (!entry?.typing) return false;
      const at = Number(entry.updatedAt) || 0;
      return !at || now - at < 8000;
    });
    if (indicator.dataset.active === String(othersTyping)) return;
    indicator.dataset.active = String(othersTyping);
    clearTimeout(typingStaleTimer);
    if (othersTyping) {
      indicator.innerHTML = '<span class="typing-text">Đang nhập</span><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
      // Dọn trạng thái nếu người kia ngừng gõ mà không gửi tín hiệu tắt.
      typingStaleTimer = setTimeout(() => {
        indicator.textContent = "";
        delete indicator.dataset.active;
      }, 8000);
    } else {
      indicator.textContent = "";
    }
  });

  const input = $("msgInput");
  if (input) {
    input.oninput = () => {
      if (getSettings().typingIndicator === false) return;
      setTyping(currentChatId, currentUser.uid, true);
      clearTimeout(typingIdleTimer);
      typingIdleTimer = setTimeout(() => {
        if (currentChatId) setTyping(currentChatId, currentUser.uid, false);
      }, 2500);
    };
  }

  const back = $("btnBack");
  if (back) back.onclick = () => closeChat();

  // Update streak display initially
  const streakData = await getStreak(chatIdAtOpen);
  if (sessionId !== chatSessionId) return;
  currentStreak = streakData;
  updateStreakDisplay();
}

async function openGroupChat(groupId, groupName) {
  const sessionId = ++chatSessionId;
  currentChatId = groupId;
  currentChatPartnerUid = null;
  currentPartnerLabel = "";
  replyingToMsg = null;
  if (unsubscribeMessages) unsubscribeMessages();
  if (unsubscribeTyping) unsubscribeTyping();
  if (unsubscribePresence) { unsubscribePresence(); unsubscribePresence = null; }
  if (unsubscribeMsgStatus) { unsubscribeMsgStatus(); unsubscribeMsgStatus = null; }
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }

  const empty = $("chatEmpty");
  if (empty) empty.classList.add("hidden");
  const composer = $("composer");
  if (composer) composer.classList.remove("hidden");
  const appView = $("appView");
  if (appView) appView.classList.add("chat-open");

  const nameEl = $("chatName");
  if (nameEl) nameEl.textContent = groupName || "Nhóm";
  const statusEl = $("chatStatus");
  if (statusEl) {
    statusEl.textContent = "Nhóm chat";
    statusEl.classList.remove("online", "offline");
  }
  const chatAvatar = $("chatAvatar");
  if (chatAvatar) {
    chatAvatar.textContent = "👥";
    chatAvatar.classList.remove("has-presence", "online", "offline");
  }

  window.dispatchEvent(new CustomEvent("chat:opened", { detail: { partnerUid: null, groupId } }));

  const box = $("messages");
  box.innerHTML = "";
  renderedMsgIds.clear();
  stickToBottom = true;
  unseenWhileAway = 0;
  updateScrollBottomButton();
  trackComposerHeight();

  unsubscribeMessages = listenMessages(groupId, async (msgs) => {
    if (currentChatId !== groupId || sessionId !== chatSessionId) return;
    const newMsgs = msgs.filter(m => !renderedMsgIds.has(m.id));
    if (newMsgs.length === 0) return;
    newMsgs.forEach((m) => renderedMsgIds.add(m.id));
    const msgById = new Map(msgs.map((m) => [m.id, m]));
    const uidSet = new Set(newMsgs.map((m) => m.senderUid));
    const resolvedProfiles = new Map();
    await Promise.all([...uidSet].map(async (uid) => {
      resolvedProfiles.set(uid, await getProfileCached(uid));
    }));
    if (currentChatId !== groupId) return;
    for (const m of newMsgs) {
      if (Array.isArray(m.deletedFor) && m.deletedFor.includes(currentUser.uid)) continue;
      const mine = m.senderUid === currentUser.uid;
      const bubble = document.createElement("div");
      bubble.className = "msg " + (mine ? "outgoing" : "incoming");
      bubble.classList.add("msg-new");
      bubble.dataset.msgId = m.id;
      const sender = document.createElement("span");
      sender.className = "msg-sender";
      const sp = resolvedProfiles.get(m.senderUid);
      sender.textContent = mine ? "Bạn" : (sp?.displayName || m.senderUid.slice(0, 8));
      bubble.appendChild(sender);
      if (m.recalled) {
        const r = document.createElement("div");
        r.className = "msg-recalled";
        r.textContent = "🚫 Tin nhắn đã được thu hồi";
        bubble.appendChild(r);
      } else {
        if (m.attachment) renderAttachment(bubble, m.attachment);
        else if (m.imageUrl) bubble.appendChild(createMessageImage(m.imageUrl, "Ảnh"));
        if (m.text) bubble.appendChild(document.createTextNode(m.text));
      }
      box.appendChild(bubble);
    }
    if (stickToBottom) requestAnimationFrame(() => { if (currentChatId === groupId) scrollToBottom("auto"); });
  });

  const back = $("btnBack");
  if (back) back.onclick = () => closeChat();
}
function closeChat() {
  const closingChatId = currentChatId;
  if (closingChatId && currentUser) {
    try { setTyping(closingChatId, currentUser.uid, false); } catch { /* ignore */ }
  }
  clearTimeout(typingIdleTimer);
  typingIdleTimer = null;
  clearTimeout(typingStaleTimer);
  typingStaleTimer = null;
  currentChatId = null;
  currentChatPartnerUid = null;
  replyingToMsg = null;
  window.dispatchEvent(new CustomEvent("chat:closed"));
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribeTyping) { unsubscribeTyping(); unsubscribeTyping = null; }
  if (unsubscribePresence) { unsubscribePresence(); unsubscribePresence = null; }
  if (unsubscribeMsgStatus) { unsubscribeMsgStatus(); unsubscribeMsgStatus = null; }
  if (unsubscribeChat) { unsubscribeChat(); unsubscribeChat = null; }
  if (scrollHandler) {
    const box = $("messages");
    if (box) box.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
  renderedMsgIds.clear();
  stickToBottom = true;
  unseenWhileAway = 0;
  updateScrollBottomButton();
  const typingEl = $("typing");
  if (typingEl) {
    typingEl.textContent = "";
    delete typingEl.dataset.active;
  }
  const box = $("messages");
  if (box) box.innerHTML = "";
  const empty = $("chatEmpty");
  if (empty) empty.classList.remove("hidden");
  const composer = $("composer");
  if (composer) composer.classList.add("hidden");
  const nameEl = $("chatName");
  if (nameEl) nameEl.textContent = "Chọn một cuộc trò chuyện";
  currentPartnerLabel = "";
  const statusEl = $("chatStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.remove("online", "offline");
  }
  const avatarEl = $("chatAvatar");
  if (avatarEl) {
    avatarEl.textContent = "?";
    avatarEl.classList.remove("has-presence", "online", "offline");
  }
  const streakEl = $("chatStreak");
  if (streakEl) streakEl.innerHTML = "";
  document.querySelectorAll("#connections .user-item.active").forEach((li) => li.classList.remove("active"));
  updatePinButton();
  const appView = $("appView");
  if (appView) appView.classList.remove("chat-open");
  requestAnimationFrame(trackComposerHeight);

  // Hide reply bar
  hideReplyBar();
}

function startReply(msg) {
  replyingToMsg = msg;
  showReplyBar(msg);
}

function cancelReply() {
  replyingToMsg = null;
  hideReplyBar();
}

function showReplyBar(msg) {
  let replyBar = $("replyBar");
  if (!replyBar) {
    replyBar = document.createElement("div");
    replyBar.id = "replyBar";
    replyBar.className = "reply-bar";
    const composer = $("composer");
    composer.parentNode.insertBefore(replyBar, composer);
  }
  getProfileCached(msg.senderUid).then(p => {
    const name = msg.senderUid === currentUser.uid ? "Bạn" : (p?.displayName || "Người dùng");
    const label = document.createElement("span");
    label.className = "reply-bar-label";
    label.textContent = `Trả lời cho ${name}`;
    const textEl = document.createElement("span");
    textEl.className = "reply-bar-text";
    textEl.textContent = attachmentPreviewText(msg);
    const close = document.createElement("button");
    close.className = "reply-bar-close";
    close.type = "button";
    close.textContent = "✕";
    close.onclick = () => window.app.cancelReply();
    replyBar.replaceChildren(label, textEl, close);
    replyBar.classList.add("show");
  });
}

function hideReplyBar() {
  const replyBar = $("replyBar");
  if (replyBar) {
    replyBar.classList.remove("show");
    replyBar.innerHTML = "";
  }
}

function scrollToMessage(msgId) {
  const box = $("messages");
  const target = box.querySelector(`[data-msg-id="${msgId}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("highlight");
    setTimeout(() => target.classList.remove("highlight"), 2000);
  }
}

function updateStreakDisplay() {
  const streakEl = $("chatStreak");
  if (!streakEl) return;
  if (!currentStreak || currentStreak.count === 0) {
    streakEl.innerHTML = "";
    return;
  }
  const milestones = currentStreak.milestones || [];
  const latestMilestone = milestones.length > 0 ? milestones[milestones.length - 1] : null;
  let html = `<span class="streak-count">🔥 ${currentStreak.count} ngày</span>`;
  if (latestMilestone) {
    html += `<span class="streak-milestone">Mốc ${latestMilestone} 🎉</span>`;
  }
  streakEl.innerHTML = html;
}

async function renderPinnedMessages(chatId, box) {
  const pinnedIds = await getPinnedMessages(chatId);
  if (pinnedIds.length === 0) return;
  // Lấy tin messages theo id
  const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js");
  const pinnedContainer = document.createElement("div");
  pinnedContainer.className = "pinned-bar";
  for (const msgId of pinnedIds) {
    const snap = await getDoc(doc(db, "chats", chatId, "messages", msgId));
    if (!snap.exists()) continue;
    const m = { id: snap.id, ...snap.data() };
    const item = document.createElement("div");
    item.className = "pinned-item";
    item.innerHTML = `<span>📌</span><span>${m.text || "Tin nhắn đã ghim"}</span>`;
    item.onclick = () => scrollToMessage(m.id);
    pinnedContainer.appendChild(item);
  }
  box.parentNode.insertBefore(pinnedContainer, box);
}

function getStatusText(status) {
  switch (status) {
    case "seen": return "Đã xem";
    case "delivered": return "Đã gửi";
    case "sent": return "Đã gửi";
    default: return "Đã gửi";
  }
}

window.addEventListener("requests:changed", () => {
  if (currentUser) refreshConnections();
});

window.app = { searchByUid, searchByName, sendFriendRequest, listIncomingRequests, respondRequest, sendMessage, deleteMessage, retractMessage, pinMessage, unpinMessage, uploadChatAttachment, openChat, openChatByChatId: openChat, openGroupChat, currentUser: () => currentUser, currentChatId: () => currentChatId, currentChatPartnerUid: () => currentChatPartnerUid, closeChat, togglePin, togglePinChat, toggleBlockChat, presenceCache, updateStatusDot, cancelReply, startReply, scrollToBottom, openImageViewer, get replyingToMsg() { return replyingToMsg; } };
