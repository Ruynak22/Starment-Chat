import { rtdb } from "./firebase-config.js";
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const HEARTBEAT_MS = 30_000;
const VISIBILITY = ["everyone", "friends", "none"];

let activeUid = null;
let activeVisibility = "everyone";
let activeOnline = false;
let heartbeatTimer = null;

function normalizeVisibility(value) {
  return VISIBILITY.includes(value) ? value : "everyone";
}

function presenceValue(online, visibility) {
  return { online, lastSeen: rtdbTimestamp(), visibility: normalizeVisibility(visibility) };
}

function toTimestamp(value) {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isYesterday(date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString();
}

/* Trạng thái hoạt động kiểu TikTok: "Đang hoạt động", "Hoạt động 5 phút trước", ... */
export function formatActivityStatus(value, { online = false } = {}) {
  if (online) return "Đang hoạt động";
  const ms = toTimestamp(value);
  if (!ms) return "Chưa từng hoạt động";

  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Hoạt động vừa xong";
  if (minutes < 60) return `Hoạt động ${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  const date = new Date(ms);
  if (hours < 24) {
    if (isYesterday(date)) return "Hoạt động hôm qua";
    return `Hoạt động ${hours} giờ trước`;
  }

  const days = Math.floor(diff / 86_400_000);
  if (days <= 1 || isYesterday(date)) return "Hoạt động hôm qua";
  if (days < 7) return `Hoạt động ${days} ngày trước`;
  return `Hoạt động ${date.toLocaleDateString("vi-VN")}`;
}

export function formatLastSeen(value) {
  return formatActivityStatus(value);
}

export function setPresence(uid, visibility = "everyone") {
  if (!uid) return;
  if (activeUid && activeUid !== uid) setOffline(activeUid);
  activeUid = uid;
  activeVisibility = normalizeVisibility(visibility);
  activeOnline = true;

  const r = ref(rtdb, `presence/${uid}`);

  // Đăng ký trước để xử lý cả trường hợp mất kết nối đột ngột (đóng tab/mất mạng).
  try { onDisconnect(r).set(presenceValue(false, activeVisibility)).catch(() => {}); } catch { /* ignore */ }

  set(r, presenceValue(true, activeVisibility)).catch(() => {});

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    set(r, presenceValue(true, activeVisibility)).catch(() => {});
  }, HEARTBEAT_MS);
}

export function setActivityVisibility(uid, visibility) {
  if (!uid) return;
  activeVisibility = normalizeVisibility(visibility);
  const r = ref(rtdb, `presence/${uid}`);
  try { onDisconnect(r).set(presenceValue(false, activeVisibility)).catch(() => {}); } catch { /* ignore */ }
  set(r, presenceValue(activeOnline, activeVisibility)).catch(() => {});
}

export function setOffline(uid = activeUid) {
  if (!uid) return;
  const r = ref(rtdb, `presence/${uid}`);
  // Không huỷ onDisconnect: nếu ghi explicit thất bại, callback vẫn đảm bảo offline.
  set(r, presenceValue(false, activeVisibility)).catch(() => {});
  if (activeUid === uid) {
    activeUid = null;
    activeOnline = false;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function listenPresence(uid, cb) {
  const r = ref(rtdb, `presence/${uid}`);
  return onValue(r, (snap) => cb(snap.val()));
}

export function setTyping(chatId, uid, typing) {
  const r = ref(rtdb, `typing/${chatId}/${uid}`);
  set(r, { typing, updatedAt: rtdbTimestamp() }).catch(() => {});
}
