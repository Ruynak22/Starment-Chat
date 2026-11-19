import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { ensureUserProfile, getUserProfile } from "./users.js";
import { setPresence } from "./presence.js";
import { searchByUid, searchByName, sendFriendRequest, listIncomingRequests, respondRequest, getConnectedUsers, MAX_CONNECTIONS } from "./connections.js";
import { chatIdFor, sendMessage, listenMessages, markMessagesAsRead, listenMessageStatus, listenChat, getStreak, STREAK_MILESTONES } from "./messages.js";
import { uploadChatAttachment, getAttachmentUrl, downloadAttachment, formatFileSize } from "./storage.js";
import { setTyping } from "./presence.js";
import { listenTyping } from "./typing.js";
import { listenPresence } from "./presence.js";

const $ = (id) => document.getElementById(id);
const LAST_CHAT_KEY = "starment_last_chat";
let currentUser = null;
let currentChatId = null;
let currentChatPartnerUid = null;
let unsubscribeMessages = null;
let unsubscribeTyping = null;
let unsubscribePresence = null;
let unsubscribeMsgStatus = null;
let unsubscribeChat = null;
let renderedMsgIds = new Set();
let wasAtBottom = true;
let scrollHandler = null;
let presenceCache = new Map();
let presenceUnsubscribes = new Map();
let replyingToMsg = null;
let currentStreak = null;

onAuthStateChanged(auth, async (u) => {
  currentUser = u;
  if (u) {
    await ensureUserProfile(u);
    setPresence(u.uid);
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
      
      getUserProfile(r.fromUid).then((p) => {
        nm.textContent = p?.displayName || r.fromUid.slice(0, 8);
        av.textContent = (p?.displayName || "?").charAt(0).toUpperCase();
        uid.textContent = p?.username ? "@" + p.username : r.fromUid.slice(0, 8) + "…";
        // Re-attach status dot
        av.appendChild(statusDot);
        updateStatusDot(statusDot, presenceCache.get(r.fromUid) || { online: false });
      });
      const uid = document.createElement("span");
      uid.className = "user-username";
      uid.textContent = r.fromUid.slice(0, 8) + "…";
      info.append(nm, uid);

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
  const list = $("connections");
  if (!list) return;
  list.innerHTML = "";
  if (users.length === 0) {
    list.innerHTML = '<li class="user-empty">Chưa có kết nối. Hãy tìm bạn bè ở trên.</li>';
  }
  users.forEach((uid) => {
    const li = document.createElement("li");
    li.className = "user-item";
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
    
    li.append(av, info);
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
}

function updateStatusDot(dot, presence) {
  if (presence?.online) {
    dot.classList.add("online");
    dot.classList.remove("offline");
    dot.title = "Trực tuyến";
  } else {
    dot.classList.add("offline");
    dot.classList.remove("online");
    const lastSeen = presence?.lastSeen;
    if (lastSeen) {
      const date = new Date(lastSeen);
      dot.title = `Lần cuối: ${date.toLocaleTimeString("vi-VN")} ${date.toLocaleDateString("vi-VN")}`;
    } else {
      dot.title = "Ngo tuyến";
    }
  }
}

function scrollToBottom() {
  const box = $("messages");
  if (!box) return;
  requestAnimationFrame(() => {
    box.scrollTop = box.scrollHeight;
  });
}

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
    try {
      await downloadAttachment(attachment);
    } catch (err) {
      window.notify?.(err?.message || "Không tải được tệp.");
    }
  };
  return card;
}

function renderAttachment(bubble, attachment) {
  if (!attachment) return;
  if (attachment.kind === "image") {
    const img = document.createElement("img");
    img.className = "msg-img loading";
    img.alt = attachment.name || "Ảnh";
    bubble.appendChild(img);
    getAttachmentUrl(attachment).then((url) => {
      img.src = url;
      img.onload = () => {
        img.classList.remove("loading");
        if (wasAtBottom) scrollToBottom();
      };
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
  const usernamePart = statusEl.textContent.startsWith("@") ? statusEl.textContent.split(" • ")[0] : "";
  if (presence?.online) {
    statusEl.textContent = usernamePart ? `${usernamePart} • Trực tuyến` : "Trực tuyến";
    statusEl.classList.add("online");
    statusEl.classList.remove("offline");
  } else {
    const lastSeen = presence?.lastSeen;
    if (lastSeen) {
      const date = new Date(lastSeen);
      statusEl.textContent = usernamePart ? `${usernamePart} • Xem lần cuối ${date.toLocaleTimeString("vi-VN")}` : `Xem lần cuối ${date.toLocaleTimeString("vi-VN")}`;
    } else {
      statusEl.textContent = usernamePart ? `${usernamePart} • Ngo tuyến` : "Ngo tuyến";
    }
    statusEl.classList.add("offline");
    statusEl.classList.remove("online");
  }
}

async function openChat(otherUid) {
  currentChatId = chatIdFor(currentUser.uid, otherUid);
  currentChatPartnerUid = otherUid;
  
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

  const profile = await getUserProfile(otherUid);
  const nameEl = $("chatName");
  if (nameEl) nameEl.textContent = profile?.displayName || otherUid.slice(0, 8) + "…";
  const statusEl = $("chatStatus");
  if (statusEl) statusEl.textContent = profile?.username ? "@" + profile.username : "";
  const chatAvatar = $("chatAvatar");
  if (chatAvatar) chatAvatar.textContent = (profile?.displayName || "?").charAt(0).toUpperCase();

  // Listen to partner's presence
  unsubscribePresence = listenPresence(otherUid, (presence) => {
    presenceCache.set(otherUid, presence || { online: false });
    updateChatHeaderStatus(presence || { online: false });
  });

  // Listen to streak
  unsubscribeChat = listenChat(currentChatId, (chatData) => {
    if (chatData) {
      currentStreak = chatData.streak || { count: 0, lastDate: null, milestones: [] };
      updateStreakDisplay();
    }
  });

  // Mark messages as read when opening chat
  await markMessagesAsRead(currentChatId, currentUser.uid);

  const box = $("messages");
  box.innerHTML = "";
  renderedMsgIds.clear();
  wasAtBottom = true;
  unsubscribeMessages = listenMessages(currentChatId, async (msgs) => {
    const newMsgs = msgs.filter(m => !renderedMsgIds.has(m.id));
    for (const m of newMsgs) {
      renderedMsgIds.add(m.id);
      const mine = m.senderUid === currentUser.uid;
      const bubble = document.createElement("div");
      bubble.className = "msg " + (mine ? "outgoing" : "incoming");
      bubble.dataset.msgId = m.id;

      if (!mine) {
        const sender = document.createElement("span");
        sender.className = "msg-sender";
        const senderProfile = await getUserProfile(m.senderUid);
        sender.textContent = senderProfile?.displayName || m.senderUid.slice(0, 8) + "…";
        bubble.appendChild(sender);
      }

      // Reply preview
      if (m.replyTo) {
        const replyPreview = document.createElement("div");
        replyPreview.className = "msg-reply-preview";
        const repliedMsg = msgs.find(msg => msg.id === m.replyTo);
        if (repliedMsg) {
          const repliedProfile = await getUserProfile(repliedMsg.senderUid);
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

      let hasMedia = false;
      if (m.imageUrl) {
        const img = document.createElement("img");
        img.src = m.imageUrl;
        // Khi ảnh tải xong (chiều cao thay đổi) → vẫn bám đáy nếu đang ở đáy
        img.onload = () => { if (wasAtBottom) scrollToBottom(); };
        bubble.appendChild(img);
        hasMedia = true;
      } else if (m.attachment) {
        renderAttachment(bubble, m.attachment);
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
      
      // Add status indicator for outgoing messages
      if (mine) {
        const statusSpan = document.createElement("span");
        statusSpan.className = "msg-status";
        if ((m.status || "sent") === "seen") statusSpan.classList.add("seen");
        statusSpan.dataset.msgId = m.id;
        statusSpan.textContent = getStatusText(m.status || "sent");
        bubble.appendChild(statusSpan);
      }
      
      // Add reply action for incoming messages
      if (!mine) {
        const actions = document.createElement("div");
        actions.className = "msg-actions";
        const replyBtn = document.createElement("button");
        replyBtn.className = "msg-action-btn";
        replyBtn.textContent = "↩️ Trả lời";
        replyBtn.onclick = (e) => {
          e.stopPropagation();
          startReply(m);
        };
        actions.appendChild(replyBtn);
        bubble.appendChild(actions);
      }

      box.appendChild(bubble);
      attachLongPress(bubble, mine, m);
    }
    requestAnimationFrame(() => {
      if (newMsgs.length > 0 && wasAtBottom) {
        const box = $("messages");
        if (box) box.scrollTop = box.scrollHeight;
      }
    });
  });

  requestAnimationFrame(() => {
    const box = $("messages");
    if (box) box.scrollTop = box.scrollHeight;
  });

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
    wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 50;
  };
  box.addEventListener("scroll", scrollHandler);

  unsubscribeTyping = listenTyping(currentChatId, (data) => {
    const indicator = $("typing");
    if (!indicator) return;
    const othersTyping = Object.keys(data).some((k) => k !== currentUser.uid && data[k]?.typing);
    indicator.textContent = othersTyping ? "Đang nhập..." : "";
  });

  const input = $("msgInput");
  if (input) input.oninput = () => setTyping(currentChatId, currentUser.uid, true);

  const back = $("btnBack");
  if (back) back.onclick = () => closeChat();
  
  // Update streak display initially
  const streakData = await getStreak(currentChatId);
  currentStreak = streakData;
  updateStreakDisplay();
}

function closeChat() {
  currentChatId = null;
  currentChatPartnerUid = null;
  replyingToMsg = null;
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
  const box = $("messages");
  if (box) box.innerHTML = "";
  const empty = $("chatEmpty");
  if (empty) empty.classList.remove("hidden");
  const composer = $("composer");
  if (composer) composer.classList.add("hidden");
  const nameEl = $("chatName");
  if (nameEl) nameEl.textContent = "Chọn một cuộc trò chuyện";
  const appView = $("appView");
  if (appView) appView.classList.remove("chat-open");
  
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
  getUserProfile(msg.senderUid).then(p => {
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

function getStatusText(status) {
  switch (status) {
    case "seen": return "Đã xem";
    case "delivered": return "Đã gửi";
    case "sent": return "Đã gửi";
    default: return "Đã gửi";
  }
}

window.app = { searchByUid, searchByName, sendFriendRequest, listIncomingRequests, respondRequest, sendMessage, uploadChatAttachment, currentUser: () => currentUser, currentChatId: () => currentChatId, presenceCache, updateStatusDot, cancelReply, startReply, get replyingToMsg() { return replyingToMsg; } };