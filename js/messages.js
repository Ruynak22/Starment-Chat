import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, query, orderBy, limit, getDocs, onSnapshot, serverTimestamp, updateDoc, writeBatch, getDoc, setDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

export function chatIdFor(a, b) {
  return [a, b].sort().join("_");
}

export const STREAK_MILESTONES = [3, 10, 30, 100, 200, 500, 1000];

export async function sendMessage(chatId, senderUid, text, imageUrl = null, replyTo = null, attachment = null) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  
  // Create chat document if it doesn't exist
  if (!chatSnap.exists()) {
    const otherUid = chatId.replace(`${senderUid}_`, "").replace(`_${senderUid}`, "");
    await setDoc(chatRef, {
      members: [senderUid, otherUid],
      createdAt: serverTimestamp(),
      streak: { 
        count: 0, 
        lastMutualDate: null, 
        lastMessageDates: {}, 
        status: "active", 
        milestones: [] 
      }
    });
  }
  
  const msgRef = collection(db, "chats", chatId, "messages");
  const msgData = {
    senderUid,
    text,
    imageUrl,
    createdAt: serverTimestamp(),
    status: "sent"
  };
  
  if (replyTo) {
    msgData.replyTo = replyTo;
  }

  if (attachment) {
    msgData.attachment = attachment;
  }

  await addDoc(msgRef, msgData);

  // Cập nhật streak chạy nền để không làm chậm thao tác gửi tin nhắn.
  updateStreak(chatId, senderUid).catch(() => {});
}

export function listenMessages(chatId, cb) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(msgs);
  });
}

export async function markMessagesAsRead(chatId, currentUserUid) {
  const ref = collection(db, "chats", chatId, "messages");
  const q = query(ref);
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  let hasUpdates = false;
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.senderUid !== currentUserUid && data.status !== "seen") {
      batch.update(doc(db, "chats", chatId, "messages", d.id), { status: "seen" });
      hasUpdates = true;
    }
  });
  if (hasUpdates) await batch.commit();
}

export function listenMessageStatus(chatId, cb) {
  const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const statuses = {};
    snap.docs.forEach(d => {
      statuses[d.id] = d.data().status || "sent";
    });
    cb(statuses);
  });
}

export function listenChat(chatId, cb) {
  const chatRef = doc(db, "chats", chatId);
  return onSnapshot(chatRef, (snap) => {
    if (snap.exists()) {
      cb({ id: snap.id, ...snap.data() });
    } else {
      cb(null);
    }
  });
}

async function updateStreak(chatId, senderUid) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return;
  
  const data = chatSnap.data();
  const members = data.members || [];
  const otherUid = members.find(m => m !== senderUid);
  if (!otherUid) return;
  
  const streak = data.streak || { 
    count: 0, 
    lastMutualDate: null, 
    lastMessageDates: {}, 
    status: "active", 
    milestones: [] 
  };
  
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  
  const dayBeforeYesterday = new Date(yesterday);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1);
  const dayBeforeYesterdayStr = dayBeforeYesterday.toISOString().split("T")[0];
  
  // Update this user's last message date
  streak.lastMessageDates = streak.lastMessageDates || {};
  streak.lastMessageDates[senderUid] = todayStr;
  
  const senderLastDate = streak.lastMessageDates[senderUid];
  const otherLastDate = streak.lastMessageDates[otherUid];
  const bothMessagedToday = senderLastDate === todayStr && otherLastDate === todayStr;

  // Chỉ tính 1 lần cho mỗi ngày khi CẢ HAI cùng nhắn tin trong ngày hôm nay
  if (bothMessagedToday && streak.lastMutualDate !== todayStr) {
    if (streak.lastMutualDate === yesterdayStr) {
      // Chuỗi tiếp tục (hôm qua cũng nhắn qua lại)
      streak.count = (streak.count || 0) + 1;
    } else if (streak.lastMutualDate) {
      // Đã bị ngắt (cách ngày) → bắt đầu chuỗi mới
      streak.count = 1;
    } else {
      // Lần đầu tiên
      streak.count = 1;
    }
    streak.lastMutualDate = todayStr;
    streak.status = "active";

    // Ghi nhận các mốc đặc biệt (3, 7, 14, 30, 100 ngày)
    streak.milestones = streak.milestones || [];
    const MILESTONES = [3, 7, 14, 30, 100];
    if (MILESTONES.includes(streak.count) && !streak.milestones.includes(streak.count)) {
      streak.milestones.push(streak.count);
    }
  }
  await updateDoc(chatRef, { streak });
}

export async function recallMessage(chatId, msgId) {
  await updateDoc(doc(db, "chats", chatId, "messages", msgId), {
    recalled: true,
    text: null,
    imageUrl: null,
    attachment: null
  });
}

export async function deleteMessageForMe(chatId, msgId, uid) {
  await updateDoc(doc(db, "chats", chatId, "messages", msgId), {
    deletedFor: arrayUnion(uid)
  });
}

export async function getStreak(chatId) {
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return { count: 0, lastDate: null, milestones: [] };
  return snap.data().streak || { count: 0, lastDate: null, milestones: [] };
}

/* ============================================================
   NHÓM
   - Tạo chat nhóm với nhiều thành viên.
   ============================================================ */
export async function createGroupChat(members, name) {
  const sorted = [...members].sort();
  const chatId = "group_" + sorted.join("_");
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) {
    await setDoc(chatRef, {
      members: sorted,
      name: name || "Nhóm",
      isGroup: true,
      createdAt: serverTimestamp(),
      streak: { count: 0, lastMutualDate: null, lastMessageDates: {}, status: "active", milestones: [] },
      pinnedMessages: []
    });
  }
  return chatId;
}

export async function updateGroupChat(chatId, updates) {
  const chatRef = doc(db, "chats", chatId);
  await updateDoc(chatRef, updates);
}

export async function addMemberToGroup(chatId, uid) {
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;
  const members = snap.data().members || [];
  if (!members.includes(uid)) {
    members.push(uid);
    await updateDoc(chatRef, { members });
  }
}

export async function removeMemberFromGroup(chatId, uid) {
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return;
  const members = (snap.data().members || []).filter((m) => m !== uid);
  await updateDoc(chatRef, { members });
}

export async function deleteMessage(chatId, msgId, uid) {
  const ref = doc(db, "chats", chatId, "messages", msgId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Tin nhắn không tồn tại.");
  if (snap.data().senderUid !== uid) throw new Error("Chỉ người gửi mới được xóa.");
  await updateDoc(ref, {
    text: "",
    imageUrl: null,
    attachment: null,
    deletedAt: serverTimestamp(),
    deleted: true
  });
}

export async function retractMessage(chatId, msgId) {
  const ref = doc(db, "chats", chatId, "messages", msgId);
  await updateDoc(ref, {
    text: "",
    imageUrl: null,
    attachment: null,
    retractedAt: serverTimestamp(),
    retracted: true
  });
}

/* ============================================================
   GHIM TIN NHẮN
   ============================================================ */
export async function pinMessage(chatId, msgId, uid) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) throw new Error("Cuộc trò chuyện không tồn tại.");
  const data = chatSnap.data();
  const pinned = data.pinnedMessages || [];
  if (!pinned.includes(msgId)) {
    pinned.push(msgId);
  }
  await updateDoc(chatRef, { pinnedMessages: pinned });
}

export async function unpinMessage(chatId, msgId) {
  const chatRef = doc(db, "chats", chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) return;
  const data = chatSnap.data();
  const pinned = (data.pinnedMessages || []).filter((id) => id !== msgId);
  await updateDoc(chatRef, { pinnedMessages: pinned });
}

export async function getPinnedMessages(chatId) {
  const chatRef = doc(db, "chats", chatId);
  const snap = await getDoc(chatRef);
  if (!snap.exists()) return [];
  return snap.data().pinnedMessages || [];
}

/* ============================================================
   GHIM KẾT NỐI (chat pin) — lưu local để ưu tiên hiển thị.
   ============================================================ */
const PINNED_CHATS_KEY = "starment_pinned_chats";
let _pinnedChatsCache = null;

function loadPinnedChats() {
  if (_pinnedChatsCache) return _pinnedChatsCache;
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_CHATS_KEY) || "[]");
    _pinnedChatsCache = Array.isArray(raw) ? raw : [];
    return _pinnedChatsCache;
  } catch {
    _pinnedChatsCache = [];
    return _pinnedChatsCache;
  }
}

function savePinnedChats(list) {
  try {
    localStorage.setItem(PINNED_CHATS_KEY, JSON.stringify(list));
    _pinnedChatsCache = Array.isArray(list) ? list : null;
  } catch {
    /* ignore */
  }
}

export function isChatPinned(partnerUid) {
  return loadPinnedChats().includes(partnerUid);
}

export async function pinChat(partnerUid) {
  const list = loadPinnedChats();
  if (!list.includes(partnerUid)) {
    list.push(partnerUid);
    savePinnedChats(list);
  }
}

export async function unpinChat(partnerUid) {
  const list = loadPinnedChats().filter((x) => x !== partnerUid);
  savePinnedChats(list);
}

export function getPinnedChatsList() {
  return loadPinnedChats();
}

