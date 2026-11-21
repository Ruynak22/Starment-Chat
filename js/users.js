import { db } from "./firebase-config.js";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { saveAvatar as saveAvatarImage } from "./avatars.js";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(raw) {
  return (raw || "").trim().replace(/^@+/, "").toLowerCase();
}

/* Chuẩn hoá văn bản để TÌM KIẾM: không phân biệt hoa/thường và bỏ dấu
 * tiếng Việt (ví dụ "Bảo" → "bao", "Đức" → "duc"). Dùng cho trường nameLower. */
export function normalizeSearchText(raw) {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu thanh/dấu mũ
    .replace(/[đ\u0111]/g, "d")       // đ/Đ → d
    .replace(/\s+/g, " ")
    .trim();
}

export function validateUsername(raw) {
  const u = normalizeUsername(raw);
  if (!u) return "Vui lòng nhập username.";
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return `Username phải từ ${USERNAME_MIN}–${USERNAME_MAX} ký tự.`;
  }
  if (!USERNAME_RE.test(u)) {
    return "Username chỉ gồm chữ thường, số, dấu _, và bắt đầu bằng chữ.";
  }
  return null;
}

export async function isUsernameTaken(usernameLower, exceptUid = null) {
  const snap = await getDoc(doc(db, "usernames", usernameLower));
  if (!snap.exists()) return false;
  return snap.data().uid !== exceptUid;
}

/* ============================================================
   HỒ SƠ (users/{uid})
   ============================================================ */
export async function ensureUserProfile(user) {
  const refDoc = doc(db, "users", user.uid);
  const snap = await getDoc(refDoc);
  if (!snap.exists()) {
    const dn = user.displayName || "User";
    await setDoc(refDoc, {
      uid: user.uid,
      displayName: dn,
      nameLower: normalizeSearchText(dn),
      username: "",
      usernameLower: "",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp()
    });
  }
  return refDoc;
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateDisplayName(uid, name) {
  const dn = (name || "").trim();
  await updateDoc(doc(db, "users", uid), {
    displayName: dn,
    nameLower: normalizeSearchText(dn)
  });
}

/* Tạo hồ sơ đầy đủ (kèm username) ngay sau khi đăng ký. */
export async function createUserProfile(user, { displayName, username }) {
  const uname = normalizeUsername(username);
  const err = validateUsername(uname);
  if (err) throw new Error(err);
  if (await isUsernameTaken(uname, user.uid)) {
    throw new Error("Username đã được sử dụng.");
  }
  await setDoc(doc(db, "usernames", uname), {
    uid: user.uid,
    createdAt: serverTimestamp()
  });
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      displayName: (displayName || "").trim() || user.displayName || "User",
      nameLower: normalizeSearchText(displayName || user.displayName || "User"),
      username: uname,
      usernameLower: uname,
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp()
    },
    { merge: true }
  );
}

/* Đổi username: kiểm tra định dạng + trùng, xoá username cũ, ghi username mới. */
export async function updateUsername(uid, raw) {
  const uname = normalizeUsername(raw);
  const err = validateUsername(uname);
  if (err) throw new Error(err);
  if (await isUsernameTaken(uname, uid)) {
    throw new Error("Username đã được sử dụng.");
  }

  // Kiểm tra giới hạn đổi username: chỉ được đổi 1 lần mỗi 10 ngày.
  const prof = await getUserProfile(uid);
  if (prof && prof.username && prof.usernameChangedAt) {
    const lastChange = prof.usernameChangedAt.toDate ? prof.usernameChangedAt.toDate() : new Date(prof.usernameChangedAt);
    const now = new Date();
    const diffDays = (now - lastChange) / (1000 * 60 * 60 * 24);
    if (diffDays < 10 && prof.username === uname) {
      // Không đổi gì cả
      return;
    }
    if (diffDays < 10) {
      throw new Error("Chỉ được đổi username 1 lần mỗi 10 ngày.");
    }
  }

  const cur = await getDoc(doc(db, "users", uid));
  const old = cur.exists() ? cur.data().usernameLower : "";

  if (old === uname) {
    if (cur.exists() && !cur.data().username) {
      await updateDoc(doc(db, "users", uid), { username: uname });
    }
    return;
  }







  // Xoá username cũ trong registry (nếu thuộc về mình)
  if (old) {
    const oldSnap = await getDoc(doc(db, "usernames", old));
    if (oldSnap.exists() && oldSnap.data().uid === uid) {
      await deleteDoc(doc(db, "usernames", old));
    }
  }
  // Tạo username mới trong registry (create-only → đảm bảo duy nhất)
  await setDoc(doc(db, "usernames", uname), {
    uid,
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "users", uid), {
    username: uname,
    usernameLower: uname,
    usernameChangedAt: serverTimestamp()
  });
}

/* ============================================================
   CHẶN NGƯỜI DÙNG (block/unblock)
   Dữ liệu nằm trong users/{uid}.blockedUids — không đổi cấu trúc.
   ============================================================ */
export async function getBlockedUids(uid) {
  const cur = await getDoc(doc(db, "users", uid));
  return cur.exists() ? (cur.data().blockedUids || []) : [];
}

export async function isBlocked(uid, otherUid) {
  const list = await getBlockedUids(uid);
  return list.includes(otherUid);
}

export async function blockUser(uid, otherUid) {
  const cur = await getDoc(doc(db, "users", uid));
  const list = cur.exists() ? (cur.data().blockedUids || []) : [];
  if (!list.includes(otherUid)) {
    list.push(otherUid);
    await updateDoc(doc(db, "users", uid), { blockedUids: list });
  }
}

export async function unblockUser(uid, otherUid) {
  const cur = await getDoc(doc(db, "users", uid));
  const list = cur.exists() ? (cur.data().blockedUids || []) : [];
  const next = list.filter((x) => x !== otherUid);
  await updateDoc(doc(db, "users", uid), { blockedUids: next });
}

/* Cập nhật avatar — ủy thác cho module avatars (nén ảnh rồi lưu vào Firestore). */
export async function updateAvatar(uid, file) {
  return saveAvatarImage(uid, file);
}
