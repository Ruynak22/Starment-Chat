import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

export async function register(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  return cred.user;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export function currentUser() {
  return auth.currentUser;
}

/* ---------- Chuyển mã lỗi Firebase thành thông báo tiếng Việt ----------
 * context: "login" | "reset" | "register"
 * Không bao giờ để lộ mã lỗi kỹ thuật hay thông tin nhạy cảm cho người dùng.
 */
export function friendlyError(err, context = "login") {
  const code = err?.code || "";

  // Lỗi kết nối mạng — dùng chung cho mọi ngữ cảnh
  if (code === "auth/network-request-failed") {
    return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra Internet.";
  }
  // Quá nhiều yêu cầu — dùng chung
  if (code === "auth/too-many-requests") {
    if (context === "reset") {
      return "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau.";
    }
    return "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.";
  }
  // Email sai định dạng — dùng chung
  if (code === "auth/invalid-email") {
    return "Địa chỉ email không hợp lệ.";
  }

  if (context === "reset") {
    // Với quên mật khẩu: Firebase KHÔNG tiết lộ email có tồn tại hay không.
    // Mọi lỗi khác đều trả về thông báo trung lập để tránh lộ thông tin.
    if (code === "auth/missing-email" || code === "auth/missing-password") {
      return "Vui lòng nhập địa chỉ email.";
    }
    if (code === "auth/user-disabled") {
      return "Không thể gửi email đặt lại. Vui lòng thử lại sau.";
    }
    return "Không thể gửi email đặt lại lúc này. Vui lòng thử lại sau.";
  }

  // context === "login"
  // Firebase gộp email không tồn tại và sai mật khẩu thành invalid-credential,
  // nên ta không suy đoán nguyên nhân, chỉ báo chung.
  if (
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return "Email hoặc mật khẩu không chính xác.";
  }
  if (code === "auth/user-disabled") {
    return "Tài khoản này hiện không thể đăng nhập.";
  }
  if (code === "auth/missing-password") {
    return "Vui lòng nhập mật khẩu.";
  }
  if (code === "auth/missing-email") {
    return "Vui lòng nhập địa chỉ email.";
  }
  if (code === "auth/email-already-in-use") {
    return "Địa chỉ email này đã được sử dụng.";
  }
  if (code === "auth/weak-password") {
    return "Mật khẩu quá yếu. Vui lòng dùng ít nhất 6 ký tự.";
  }

  // Lỗi chưa lường trước — thông báo chung, không lộ mã kỹ thuật
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}
