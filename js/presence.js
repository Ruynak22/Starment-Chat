import { rtdb } from "./firebase-config.js";
import { ref, set, onValue, onDisconnect, serverTimestamp as rtdbTimestamp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";

const HEARTBEAT_MS = 30_000;

let activeUid = null;
let heartbeatTimer = null;

function offlineValue() {
  return { online: false, lastSeen: rtdbTimestamp() };
}

export function setPresence(uid) {
  if (!uid) return;
  if (activeUid && activeUid !== uid) setOffline(activeUid);
  activeUid = uid;

  const r = ref(rtdb, `presence/${uid}`);

  // Đăng ký trước để xử lý cả trường hợp mất kết nối đột ngột (đóng tab/mất mạng).
  try { onDisconnect(r).set(offlineValue()).catch(() => {}); } catch { /* ignore */ }

  set(r, { online: true, lastSeen: rtdbTimestamp() }).catch(() => {});

  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    set(r, { online: true, lastSeen: rtdbTimestamp() }).catch(() => {});
  }, HEARTBEAT_MS);
}

export function setOffline(uid = activeUid) {
  if (!uid) return;
  const r = ref(rtdb, `presence/${uid}`);
  // Không huỷ onDisconnect: nếu ghi explicit thất bại, callback vẫn đảm bảo offline.
  set(r, offlineValue()).catch(() => {});
  if (activeUid === uid) {
    activeUid = null;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function listenPresence(uid, cb) {
  const r = ref(rtdb, `presence/${uid}`);
  return onValue(r, (snap) => cb(snap.val()));
}

export function formatLastSeen(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay ? time : `${date.toLocaleDateString("vi-VN")} ${time}`;
}

export function setTyping(chatId, uid, typing) {
  const r = ref(rtdb, `typing/${chatId}/${uid}`);
  set(r, { typing, updatedAt: rtdbTimestamp() }).catch(() => {});
}
