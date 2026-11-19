import { db } from "./firebase-config.js";
import {
  collection, doc, getDoc, setDoc, query, where, getDocs, updateDoc, serverTimestamp, orderBy, limit, writeBatch, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { normalizeUsername, normalizeSearchText } from "./users.js";

export const MAX_CONNECTIONS = 50;

export async function searchByUid(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/* Tìm theo username (@name) — không phân biệt hoa/thường.
 * Hỗ trợ tìm chính xác và tìm theo tiền tố. */
export async function searchByUsername(name) {
  const q = normalizeUsername(name);
  if (!q) return [];
  const query1 = query(
    collection(db, "users"),
    where("usernameLower", ">=", q),
    where("usernameLower", "<=", q + "\uf8ff"),
    limit(20)
  );
  const snap = await getDocs(query1);
  return snap.docs.map((d) => d.data());
}

/* Tìm theo tên hiển thị — không phân biệt hoa/thường và dấu tiếng Việt.
 * Dùng trường nameLower (đã chuẩn hoá) để "bao" tìm được "Bảo". */
export async function searchByName(name) {
  const q0 = normalizeSearchText(name);
  if (!q0) return [];
  const q = query(
    collection(db, "users"),
    where("nameLower", ">=", q0),
    where("nameLower", "<=", q0 + "\uf8ff"),
    limit(20)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function sendFriendRequest(fromUid, toUid) {
  if (fromUid === toUid) throw new Error("Cannot request self");
  
  // Check connection limit for both users
  const fromConnections = await getConnectedUsers(fromUid);
  if (fromConnections.length >= MAX_CONNECTIONS) {
    throw new Error(`Bạn đã đạt giới hạn ${MAX_CONNECTIONS} kết nối.`);
  }
  const toConnections = await getConnectedUsers(toUid);
  if (toConnections.length >= MAX_CONNECTIONS) {
    throw new Error(`Người này đã đạt giới hạn ${MAX_CONNECTIONS} kết nối.`);
  }
  
  const id = `${fromUid}_${toUid}`;
  const reverse = `${toUid}_${fromUid}`;
  const existing = await getDoc(doc(db, "friendRequests", id));
  if (existing.exists()) throw new Error("Request already exists");
  const existingReverse = await getDoc(doc(db, "friendRequests", reverse));
  if (existingReverse.exists()) throw new Error("Request already exists");
  await setDoc(doc(db, "friendRequests", id), {
    fromUid, toUid, status: "pending", createdAt: serverTimestamp()
  });
}

export async function listIncomingRequests(uid) {
  const q = query(collection(db, "friendRequests"), where("toUid", "==", uid), where("status", "==", "pending"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* Theo dõi realtime lời mời kết bạn gửi tới uid (dùng cho trung tâm thông báo). */
export function listenIncomingRequests(uid, cb, onError) {
  const q = query(
    collection(db, "friendRequests"),
    where("toUid", "==", uid),
    where("status", "==", "pending")
  );
  return onSnapshot(q, cb, onError || (() => {}));
}

export async function respondRequest(requestId, accept) {
  await updateDoc(doc(db, "friendRequests", requestId), {
    status: accept ? "accepted" : "rejected"
  });
}

export async function getConnectedUsers(uid) {
  // Truy vấn tách riêng theo fromUid/toUid để tuân thủ security rules
  // (mỗi người chỉ được đọc lời mời có liên quan tới mình).
  const [sent, received] = await Promise.all([
    getDocs(query(
      collection(db, "friendRequests"),
      where("fromUid", "==", uid),
      where("status", "==", "accepted")
    )),
    getDocs(query(
      collection(db, "friendRequests"),
      where("toUid", "==", uid),
      where("status", "==", "accepted")
    ))
  ]);
  const others = new Set();
  sent.forEach(d => others.add(d.data().toUid));
  received.forEach(d => others.add(d.data().fromUid));
  return [...others];
}
