StarmentChat

StarmentChat là dự án nhắn tin riêng tư dành cho hai người.

Dự án được xây dựng bằng HTML, CSS, JavaScript và Firebase.

Dự án không kinh doanh, không quảng cáo và không thu phí người dùng.

README này hướng dẫn từ con số 0: kể cả khi bạn chưa từng sử dụng Firebase, chưa biết tạo cơ sở dữ liệu hay chưa từng deploy một website.

1. Trước khi bắt đầu

1.1. Bạn cần chuẩn bị gì?

Bạn cần có:

Một máy tính Windows, macOS hoặc Linux.

Kết nối Internet.

Một tài khoản Google.

Trình duyệt Chrome, Edge, Firefox hoặc trình duyệt hiện đại khác.

Node.js.

Mã nguồn StarmentChat.

Không cần thuê VPS.

Không cần tự xây dựng máy chủ riêng.

Firebase sẽ cung cấp các dịch vụ backend cần thiết cho dự án.

1.2. Firebase là gì?

Firebase là một nền tảng do Google cung cấp, giúp lập trình viên xây dựng ứng dụng mà không cần tự quản lý toàn bộ máy chủ.

Trong StarmentChat, Firebase đảm nhiệm những công việc sau:

Dịch vụ

Công việc

Firebase Authentication

Đăng ký và đăng nhập tài khoản

Cloud Firestore

Lưu trữ dữ liệu ứng dụng

Realtime Database

Đồng bộ dữ liệu theo thời gian thực

Firebase Hosting

Đưa website lên Internet

Một số thuật ngữ cần hiểu:

Backend: Phần xử lý phía máy chủ, người dùng không trực tiếp nhìn thấy.

Database: Cơ sở dữ liệu, nơi lưu trữ thông tin.

Authentication: Hệ thống xác thực danh tính người dùng.

Hosting: Dịch vụ lưu trữ và cung cấp website cho người khác truy cập.

Deploy: Đưa phiên bản website từ máy tính của bạn lên máy chủ để mọi người có thể truy cập.

2. Bật xác minh 2 bước cho tài khoản Google

Đây là bước bảo vệ tài khoản Google trước khi sử dụng các dịch vụ Firebase.

Xác minh 2 bước (2-Step Verification) bổ sung một bước xác nhận khi đăng nhập, ngoài mật khẩu thông thường.

2.1. Mở trang cài đặt bảo mật

Truy cập đường dẫn chính thức:

https://myaccount.google.com/signinoptions/two-step-verification

Nếu Google yêu cầu đăng nhập, hãy đăng nhập bằng tài khoản bạn định sử dụng cho Firebase.

2.2. Bật xác minh 2 bước trên máy tính

Mở trang xác minh 2 bước.

Tìm mục Turn on 2-Step Verification hoặc nút bật xác minh 2 bước.

Chọn bật tính năng.

Google có thể yêu cầu bạn nhập lại mật khẩu.

Làm theo hướng dẫn trên màn hình.

Chọn phương thức xác minh phù hợp với tài khoản.

Hoàn thành bước xác nhận cuối cùng.

Kiểm tra trang hiển thị trạng thái xác minh 2 bước đã bật.

Lưu ý:

Tên và vị trí các nút có thể thay đổi theo ngôn ngữ hoặc phiên bản giao diện Google.

Nếu không thấy mục tương ứng, mở trang bảo mật:

https://myaccount.google.com/security

Sau đó tìm phần How you sign in to Google và chọn 2-Step Verification.

2.3. Bật trên điện thoại Android

Mở ứng dụng Cài đặt.

Chọn Google.

Chọn Quản lý Tài khoản Google.

Chuyển sang thẻ Bảo mật.

Tìm mục xác minh 2 bước.

Chọn bật và làm theo hướng dẫn.

Bạn cũng có thể thực hiện trực tiếp bằng trình duyệt điện thoại thông qua đường dẫn ở trên.

3. Cài đặt công cụ cần thiết

3.1. Cài Node.js

Node.js là môi trường cho phép chạy JavaScript bên ngoài trình duyệt.

Trong dự án này, Node.js được sử dụng để cài Firebase CLI.

Firebase CLI là công cụ dòng lệnh giúp máy tính giao tiếp với Firebase.

Truy cập:

https://nodejs.org/

Tải phiên bản LTS.

LTS là phiên bản được hỗ trợ lâu dài, phù hợp với phần lớn người dùng.

Sau khi tải xuống:

Mở tệp cài đặt.

Chọn Next.

Đồng ý với điều khoản sử dụng.

Giữ các lựa chọn mặc định nếu bạn không có nhu cầu đặc biệt.

Chọn Install.

Chờ cài đặt hoàn tất.

Đóng và mở lại Terminal hoặc PowerShell.

3.2. Kiểm tra Node.js

Mở PowerShell hoặc Windows Terminal.

Nhập:

node -v

Lệnh này hiển thị phiên bản Node.js đang được cài đặt.

Tiếp tục nhập:

npm -v

Lệnh này kiểm tra npm.

npm là trình quản lý gói đi kèm Node.js, dùng để cài đặt các công cụ JavaScript.

Nếu cả hai lệnh đều hiển thị phiên bản, bạn đã có thể tiếp tục.

Nếu PowerShell báo không nhận diện được lệnh, hãy kiểm tra lại quá trình cài đặt Node.js và mở lại Terminal.

4. Tạo Firebase Project

4.1. Firebase Project là gì?

Firebase Project là một không gian dự án trên Firebase.

Mỗi Project có thể chứa:

Cấu hình ứng dụng.

Tài khoản người dùng.

Cơ sở dữ liệu.

Quy tắc bảo mật.

Website được triển khai.

Bạn nên tạo Project riêng cho StarmentChat.

Không sử dụng Project của người khác nếu chưa được cấp quyền.

4.2. Mở Firebase Console

Truy cập:

https://console.firebase.google.com/

Đăng nhập bằng tài khoản Google đã chuẩn bị ở bước 2.

4.3. Tạo Project mới

Tại trang Firebase Console, chọn Create a project hoặc nút tạo Project mới.

Nhập tên dự án, ví dụ:

StarmentChat

Chọn Continue.

Firebase có thể hỏi bạn có muốn bật Google Analytics hay không.

Nếu không cần thống kê truy cập, bạn có thể tắt Google Analytics.

Chọn Continue hoặc Create project để tiếp tục.

Chờ Firebase tạo Project.

Khi quá trình hoàn tất, chọn Continue để mở trang quản lý Project.

Giải thích:

Google Analytics là dịch vụ thống kê hành vi và lượt truy cập.

StarmentChat không bắt buộc phải sử dụng dịch vụ này.

5. Tạo Firebase Web App

5.1. Web App là gì?

Firebase Project là nơi quản lý các dịch vụ.

Web App là ứng dụng web được đăng ký bên trong Project đó.

Việc đăng ký Web App giúp Firebase cấp thông tin cấu hình để mã HTML và JavaScript của StarmentChat kết nối với đúng Project.

5.2. Đăng ký Web App

Mở Firebase Project vừa tạo.

Tại trang tổng quan Project, tìm khu vực thêm ứng dụng.

Chọn biểu tượng Web có ký hiệu </>.

Nhập tên ứng dụng, ví dụ:

StarmentChat Web

Nếu xuất hiện lựa chọn thiết lập Firebase Hosting ngay trong bước đăng ký ứng dụng, bạn có thể bỏ qua vì chúng ta sẽ thiết lập Hosting bằng Firebase CLI ở phần sau.

Chọn Register app.

Firebase sẽ hiển thị đoạn cấu hình Firebase SDK.

Đoạn cấu hình thường có dạng:

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "YOUR_DATABASE_URL",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

Đây là ví dụ minh họa.

Bạn phải sử dụng thông tin Firebase cấp cho Project của chính mình.

Không sao chép nguyên các giá trị ví dụ phía trên để sử dụng.

Nếu chưa tạo Realtime Database, trường databaseURL có thể chưa xuất hiện.

Nếu chưa thiết lập Cloud Storage, không tự ý thêm hoặc đoán storageBucket.

5.3. Lưu cấu hình Firebase

Mở mã nguồn StarmentChat.

Tìm tệp:

js/config.js

Mở tệp bằng VS Code hoặc trình soạn thảo mã nguồn khác.

Tìm phần cấu hình Firebase.

Thay các giá trị mẫu bằng cấu hình Firebase vừa nhận được.

Lưu tệp.

Giải thích:

apiKey: Khóa nhận diện ứng dụng khi giao tiếp với Firebase.

authDomain: Miền dùng cho các thao tác xác thực.

databaseURL: Địa chỉ Realtime Database.

projectId: ID của Firebase Project.

storageBucket: Thông tin Cloud Storage nếu dịch vụ này được thiết lập.

messagingSenderId: Mã nhận diện của dịch vụ nhắn tin Firebase.

appId: Mã nhận diện ứng dụng Web.

Firebase Web API Key không phải mật khẩu quản trị cơ sở dữ liệu.

Tuy nhiên, việc để lộ cấu hình không có nghĩa là bạn được phép bỏ qua Security Rules.

6. Bật Firebase Authentication

6.1. Authentication là gì?

Authentication là dịch vụ xác thực người dùng.

Trong StarmentChat, dịch vụ này đảm nhiệm:

Đăng ký tài khoản.

Đăng nhập.

Xác định UID của người dùng.

Quản lý trạng thái đăng nhập.

UID là mã định danh duy nhất của mỗi tài khoản Firebase Authentication.

Hai tài khoản khác nhau sẽ có UID khác nhau.

6.2. Mở Authentication

Trở lại Firebase Console.

Chọn Project StarmentChat.

Tìm mục Authentication ở thanh điều hướng bên trái.

Mở Authentication.

Nếu đây là lần đầu sử dụng, chọn Get started.

6.3. Bật đăng nhập bằng Email/Password

Mở khu vực Sign-in method hoặc phương thức đăng nhập.

Tìm nhà cung cấp có tên Email/Password.

Chọn Email/Password.

Bật tùy chọn Email/Password.

Nếu có tùy chọn Email link hoặc Email/Passwordless riêng, không bật nếu bạn chỉ muốn đăng nhập bằng mật khẩu thông thường.

Chọn Save.

Sau bước này, StarmentChat có thể sử dụng Firebase Authentication để đăng ký và đăng nhập bằng email, mật khẩu.

6.4. Kiểm tra kết quả

Trong Firebase Console:

Mở Authentication.

Chuyển sang thẻ Users.

Sau khi có người đăng ký, tài khoản sẽ xuất hiện trong danh sách.

Nếu chưa có người đăng ký thì danh sách có thể trống.

Đó là trạng thái bình thường.

7. Tạo Cloud Firestore

7.1. Cloud Firestore là gì?

Cloud Firestore là cơ sở dữ liệu dạng NoSQL của Firebase.

Thay vì lưu dữ liệu theo bảng và hàng giống một số hệ quản trị cơ sở dữ liệu truyền thống, Firestore tổ chức dữ liệu bằng:

Collection: Tập hợp các tài liệu.

Document: Một tài liệu chứa dữ liệu.

Field: Một trường dữ liệu bên trong Document.

Ví dụ:

users
  ├── UID_001
  │     ├── displayName
  │     ├── email
  │     └── avatar
  │
  └── UID_002
        ├── displayName
        ├── email
        └── avatar

Đây chỉ là ví dụ minh họa cấu trúc.

Cấu trúc thực tế phải tương thích với mã nguồn StarmentChat.

7.2. Tạo cơ sở dữ liệu

Mở Firebase Console.

Chọn Project StarmentChat.

Tìm mục Firestore Database ở thanh điều hướng.

Mở Firestore Database.

Chọn Create database.

Nếu Firebase yêu cầu chọn phiên bản, hãy chọn Cloud Firestore ở chế độ Native mode.

Chọn vị trí lưu trữ dữ liệu.

Đọc kỹ thông tin về vị trí trước khi xác nhận.

Chọn chế độ bảo mật phù hợp.

Hoàn tất quá trình tạo Database.

Chọn vị trí dữ liệu rất quan trọng.

Vị trí này ảnh hưởng đến độ trễ truy cập và có thể không thay đổi được sau khi tạo.

Hãy chọn khu vực phù hợp với người dùng chính của ứng dụng.

7.3. Test mode và Production mode

Khi tạo Firestore, Firebase có thể cho phép lựa chọn chế độ bảo mật.

Test mode:

Thường dùng để thử nghiệm ban đầu.

Không nên để các quy tắc mở rộng quyền truy cập tồn tại khi triển khai ứng dụng thật.

Production mode:

Mặc định hạn chế quyền truy cập.

Bạn phải cấu hình Security Rules phù hợp để ứng dụng hoạt động.

Với ứng dụng có dữ liệu cá nhân và tin nhắn riêng tư như StarmentChat, không được tùy tiện mở quyền đọc và ghi cho toàn bộ Internet.

8. Tạo Realtime Database

8.1. Realtime Database là gì?

Realtime Database là một cơ sở dữ liệu có khả năng đồng bộ dữ liệu gần như ngay lập tức giữa các thiết bị đang kết nối.

Ví dụ:

Một người dùng thay đổi trạng thái hoạt động.

Thiết bị của người còn lại có thể nhận được thay đổi đó mà không cần tải lại toàn bộ trang.

Trong StarmentChat, Realtime Database có thể đảm nhiệm các dữ liệu cần cập nhật liên tục như:

Trạng thái online/offline.

Thời điểm hoạt động gần nhất.

Trạng thái đang nhập tin nhắn.

Đây là những ví dụ về mục đích sử dụng, không phải cam kết rằng mọi tính năng đều đã được triển khai trong mã nguồn hiện tại.

8.2. Tạo Realtime Database

Mở Firebase Console.

Chọn Project StarmentChat.

Tìm mục Realtime Database ở thanh điều hướng.

Mở Realtime Database.

Chọn Create Database.

Chọn vị trí máy chủ.

Chọn chế độ bảo mật.

Xác nhận tạo Database.

8.3. Lấy databaseURL

Sau khi tạo thành công, Firebase sẽ hiển thị địa chỉ Realtime Database.

Địa chỉ thường có dạng:

https://YOUR_DATABASE_NAME-default-rtdb.firebaseio.com

Đây chỉ là ví dụ.

Hãy sao chép địa chỉ thật mà Firebase hiển thị.

Mở:

js/config.js

Tìm:

databaseURL

Thay giá trị mẫu bằng địa chỉ vừa sao chép.

Ví dụ:

databaseURL: "https://YOUR_DATABASE_NAME-default-rtdb.firebaseio.com"

Lưu tệp.

Chú ý:

Không tự tạo databaseURL bằng cách đoán tên Project.

Hãy lấy chính xác địa chỉ từ Firebase Console.

9. Cấu hình Security Rules

9.1. Security Rules là gì?

Security Rules là các quy tắc kiểm soát quyền truy cập dữ liệu.

Chúng quyết định người dùng nào được phép:

Đọc dữ liệu.

Ghi dữ liệu.

Sửa dữ liệu.

Xóa dữ liệu.

Ví dụ:

Một người dùng không được tự ý đọc tin nhắn riêng tư của tài khoản khác.

Đây là lý do Security Rules cực kỳ quan trọng đối với ứng dụng nhắn tin.

Ẩn nút trên giao diện không phải là bảo mật.

Người khác vẫn có thể gửi yêu cầu trực tiếp đến Firebase nếu Security Rules không chặn họ.

9.2. Các tệp Rules trong StarmentChat

Trong mã nguồn có thể có các tệp:

firestore.rules

database.rules.json

storage.rules

Ý nghĩa:

firestore.rules: Quy tắc bảo mật cho Cloud Firestore.

database.rules.json: Quy tắc bảo mật cho Realtime Database.

storage.rules: Quy tắc bảo mật cho Cloud Storage.

Mỗi dịch vụ có hệ thống Rules riêng.

Không được lấy Rules của Firestore rồi sử dụng cho Realtime Database.

Hai hệ thống này không dùng chung cú pháp.

9.3. Kiểm tra Rules trên Firebase Console

Đối với Firestore:

Mở Firestore Database.

Chọn thẻ Rules.

Kiểm tra nội dung Rules đang được triển khai.

Đối với Realtime Database:

Mở Realtime Database.

Tìm khu vực Rules hoặc Security Rules.

Kiểm tra nội dung đang được triển khai.

Nếu nội dung trên Firebase Console khác với tệp Rules trong mã nguồn, hãy kiểm tra kỹ trước khi ghi đè.

9.4. Không sử dụng Rules mở toàn bộ dữ liệu

Ví dụ dưới đây là cấu hình nguy hiểm:

allow read, write: if true;

Điều kiện này cho phép mọi người đọc và ghi dữ liệu tại phạm vi được áp dụng.

Không sử dụng cấu hình mở toàn bộ dữ liệu cho ứng dụng thật.

Tương tự, không nên sử dụng cấu hình:

{
  "rules": {
    ".read": true,
    ".write": true
  }
}

Đây không phải cách sửa lỗi quyền truy cập.

Đây là cách mở cửa cơ sở dữ liệu cho bất kỳ ai. Một quyết định rất sáng tạo nếu mục tiêu là phát tán dữ liệu cá nhân.

9.5. Sử dụng Rules của dự án

Nếu bạn tải mã nguồn StarmentChat, hãy kiểm tra các tệp Rules đi kèm.

Các Rules phải phù hợp với cấu trúc dữ liệu và cách ứng dụng hoạt động.

Không tự ý thay đổi Rules nếu chưa hiểu điều kiện truy cập.

Sau khi cấu hình chính xác, bạn có thể triển khai Rules bằng Firebase CLI ở phần 12.

10. Cài Firebase CLI

10.1. Firebase CLI là gì?

Firebase CLI là công cụ chạy trong Terminal hoặc PowerShell.

Nó cho phép máy tính thực hiện các thao tác với Firebase thông qua lệnh.

Ví dụ:

Đăng nhập Firebase.

Liệt kê Project.

Liên kết mã nguồn với Project.

Triển khai website.

Triển khai Security Rules.

10.2. Cài đặt Firebase CLI

Mở PowerShell hoặc Windows Terminal.

Nhập:

npm install -g firebase-tools

Giải thích:

npm: Trình quản lý gói của Node.js.

install: Cài đặt một gói.

-g: Cài đặt ở phạm vi toàn cục để có thể gọi lệnh từ nhiều thư mục.

firebase-tools: Gói công cụ Firebase CLI chính thức.

Chờ quá trình cài đặt hoàn tất.

10.3. Kiểm tra cài đặt

Nhập:

firebase --version

Nếu Terminal hiển thị số phiên bản, Firebase CLI đã được cài đặt và có thể sử dụng.

Nếu báo không nhận diện được lệnh, hãy kiểm tra Node.js, npm và biến môi trường PATH.

11. Đăng nhập Firebase CLI

11.1. Đăng nhập

Trong PowerShell, nhập:

firebase login

Firebase CLI sẽ mở trình duyệt để bạn đăng nhập.

Chọn tài khoản Google đã tạo Firebase Project.

Xem xét quyền mà Firebase CLI yêu cầu.

Chấp nhận nếu bạn đồng ý.

Chờ Terminal thông báo đăng nhập thành công.

Nếu trình duyệt không tự mở, hãy đọc thông báo trong Terminal và làm theo hướng dẫn được cung cấp.

11.2. Kiểm tra Project

Nhập:

firebase projects:list

Lệnh này liệt kê các Firebase Project mà tài khoản hiện tại có quyền truy cập.

Tìm Project StarmentChat của bạn trong danh sách.

Nếu không thấy, hãy kiểm tra xem bạn đã đăng nhập đúng tài khoản Google chưa.

12. Liên kết mã nguồn với Firebase Project

12.1. Mở đúng thư mục dự án

Giải nén mã nguồn StarmentChat nếu bạn tải về dưới dạng ZIP.

Mở thư mục gốc của dự án bằng VS Code.

Thư mục gốc là nơi chứa các tệp như:

index.html
firebase.json
firestore.rules
database.rules.json

Mở Terminal ngay tại thư mục đó.

Bạn có thể kiểm tra bằng lệnh:

Test-Path .\index.html

Nếu kết quả là:

True

thì PowerShell tìm thấy index.html tại thư mục hiện tại.

Nếu kết quả là False, có thể bạn đang đứng sai thư mục.

12.2. Liên kết Project

Nhập:

firebase use --add

Firebase CLI sẽ yêu cầu chọn Project.

Chọn Project StarmentChat mà bạn vừa tạo.

Khi được hỏi alias, nhập:

default

Hoàn tất quá trình liên kết.

Alias là tên gọi ngắn giúp Firebase CLI biết Project nào sẽ được sử dụng khi chạy lệnh.

Quan trọng:

Nếu mã nguồn tải về có sẵn tệp .firebaserc, tệp này có thể đang chứa ID Project của người tạo mã nguồn.

Hãy kiểm tra để chắc chắn thư mục của bạn đang liên kết với Project riêng.

Không deploy khi chưa xác nhận Project đích.

13. Kiểm tra firebase.json

firebase.json là tệp cấu hình cho Firebase CLI.

Nó cho biết những dịch vụ nào được cấu hình trong thư mục dự án và tệp nào chứa Rules tương ứng.

Ví dụ:

{
  "firestore": {
    "rules": "firestore.rules"
  },
  "database": {
    "rules": "database.rules.json"
  },
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ]
  }
}

Đây là ví dụ minh họa.

Không ghi đè tệp cấu hình hiện có một cách máy móc.

13.1. Ý nghĩa của các phần

firestore:

Khai báo tệp Security Rules cho Cloud Firestore.

database:

Khai báo tệp Security Rules cho Realtime Database.

hosting:

Khai báo cấu hình Firebase Hosting.

public:

Thư mục chứa nội dung website được phép triển khai.

ignore:

Danh sách các tệp hoặc thư mục bị bỏ qua khi triển khai Hosting.

13.2. Cảnh báo về public

Nếu cấu hình:

"public": "."

thì dấu . có nghĩa là thư mục hiện tại.

Firebase Hosting có thể triển khai các tệp trong thư mục gốc, ngoại trừ những tệp bị loại trừ bởi cấu hình ignore và các quy tắc liên quan.

Vì vậy, hãy kiểm tra thư mục trước khi deploy.

Không để các tệp riêng tư, mật khẩu, khóa bí mật hoặc dữ liệu cá nhân trong thư mục được công khai.

Đặc biệt, không được xem Security Rules là tệp bí mật có thể thay thế việc cấu hình quyền truy cập đúng cách.

14. Chạy thử StarmentChat trên máy tính

Trước khi đưa website lên Internet, hãy chạy thử trên máy tính.

Việc này giúp phát hiện lỗi sớm hơn.

14.1. Sử dụng Python

Nếu máy tính đã cài Python, mở PowerShell tại thư mục gốc của StarmentChat.

Nhập:

py -m http.server 5500

Giải thích:

py: Gọi Python Launcher trên Windows.

-m: Chạy một module Python.

http.server: Máy chủ HTTP đơn giản có sẵn trong Python.

5500: Cổng mà máy chủ sẽ sử dụng.

Sau khi chạy, mở trình duyệt và truy cập:

http://localhost:5500

Nếu website xuất hiện, máy chủ thử nghiệm đã hoạt động.

14.2. Dừng máy chủ

Quay lại cửa sổ PowerShell đang chạy máy chủ.

Nhấn:

Ctrl + C

Máy chủ thử nghiệm sẽ dừng.

Lưu ý:

Đây chỉ là máy chủ phục vụ thử nghiệm trên máy tính.

Nó không thay thế Firebase Hosting và không tự động đưa website lên Internet.

15. Triển khai website bằng Firebase Hosting

15.1. Firebase Hosting là gì?

Firebase Hosting là dịch vụ lưu trữ website của Firebase.

Sau khi triển khai thành công, người khác có thể truy cập website thông qua địa chỉ Internet.

Firebase Hosting hỗ trợ HTTPS và cung cấp tên miền mặc định dạng:

PROJECT_ID.web.app

Bạn không cần thuê VPS để lưu trữ các tệp HTML, CSS, JavaScript và tài nguyên tĩnh của StarmentChat.

15.2. Kiểm tra trước khi deploy

Trước khi triển khai, hãy kiểm tra:

Đã đăng nhập Firebase CLI.

Đã liên kết đúng Firebase Project.

index.html tồn tại.

firebase.json hợp lệ.

js/config.js chứa cấu hình của Project riêng.

Website đã được chạy thử.

Không có tệp riêng tư trong thư mục Hosting công khai.

15.3. Triển khai Hosting

Mở PowerShell tại thư mục gốc của StarmentChat.

Nhập:

firebase deploy --only hosting

Giải thích:

firebase: Gọi Firebase CLI.

deploy: Yêu cầu triển khai.

--only hosting: Chỉ triển khai Firebase Hosting.

Lệnh này không tự động triển khai Firestore Rules hoặc Realtime Database Rules.

Chờ Firebase CLI thực hiện quá trình tải dữ liệu lên máy chủ.

Nếu thành công, Terminal sẽ hiển thị thông tin triển khai và địa chỉ website.

15.4. Truy cập website

Mở trình duyệt.

Truy cập địa chỉ Hosting mà Firebase CLI cung cấp.

Địa chỉ mặc định thường có dạng:

https://YOUR_PROJECT_ID.web.app

Nếu website mở được, quá trình triển khai Hosting đã thành công.

16. Triển khai Security Rules

Hosting và Security Rules là hai phần riêng biệt.

Việc triển khai website không có nghĩa là các Rules trong máy tính đã được cập nhật lên Firebase.

Nếu bạn đã kiểm tra và xác nhận các tệp Rules phù hợp với ứng dụng, có thể triển khai bằng lệnh:

firebase deploy --only firestore:rules,database

Lệnh này yêu cầu Firebase CLI triển khai Rules cho Firestore và Realtime Database đã được cấu hình trong dự án.

Không chạy lệnh này nếu chưa kiểm tra nội dung Rules.

Sau khi triển khai, hãy mở Firebase Console và kiểm tra lại nội dung Rules đang hoạt động.

17. Cập nhật website sau này

Giả sử bạn sửa giao diện, sửa JavaScript hoặc bổ sung tính năng.

Quy trình cập nhật:

Mở mã nguồn StarmentChat.

Thực hiện thay đổi.

Chạy thử website trên máy tính.

Kiểm tra lỗi trong Developer Tools của trình duyệt.

Nếu mọi thứ hoạt động đúng, mở PowerShell tại thư mục gốc.

Chạy:

firebase deploy --only hosting

Firebase sẽ triển khai phiên bản Hosting mới.

Địa chỉ website không cần thay đổi.

Người dùng tiếp tục truy cập bằng đường dẫn cũ.

Phân biệt:

Sửa HTML, CSS, JavaScript: Thường cần triển khai Hosting.

Thay đổi dữ liệu trong Firestore: Không cần triển khai lại Hosting.

Thay đổi dữ liệu trong Realtime Database: Không cần triển khai lại Hosting.

Thay đổi Security Rules: Cần triển khai Rules tương ứng.

18. Những lỗi thường gặp

18.1. auth/configuration-not-found

Nguyên nhân thường gặp:

Firebase Authentication chưa được cấu hình đúng hoặc phương thức đăng nhập chưa được bật.

Cách kiểm tra:

Mở Firebase Console.

Chọn Authentication.

Mở Sign-in method.

Kiểm tra Email/Password.

Đảm bảo phương thức này đã được bật.

Kiểm tra js/config.js có đang sử dụng đúng Project không.

18.2. auth/invalid-credential

Nguyên nhân có thể gặp:

Email không đúng.

Mật khẩu không đúng.

Thông tin đăng nhập không hợp lệ.

Cách xử lý:

Kiểm tra email và mật khẩu.

Nếu quên mật khẩu, sử dụng chức năng đặt lại mật khẩu nếu ứng dụng đã hỗ trợ.

Không nên liên tục thử nhiều mật khẩu ngẫu nhiên.

18.3. auth/too-many-requests

Firebase có thể tạm thời hạn chế các yêu cầu xác thực khi phát hiện quá nhiều lần thử.

Cách xử lý:

Tạm dừng thử đăng nhập liên tục.

Chờ một khoảng thời gian rồi thử lại.

Kiểm tra thông tin tài khoản.

Sử dụng chức năng đặt lại mật khẩu nếu cần.

18.4. Permission denied

Nguyên nhân thường gặp:

Security Rules không cho phép thao tác mà ứng dụng đang thực hiện.

Cách xử lý:

Xác định ứng dụng đang truy cập Firestore hay Realtime Database.

Mở đúng khu vực Rules tương ứng.

Kiểm tra điều kiện đọc và ghi.

Kiểm tra người dùng đã đăng nhập hay chưa.

Kiểm tra UID và đường dẫn dữ liệu.

Không giải quyết lỗi này bằng cách mở toàn bộ quyền đọc và ghi.

18.5. Website không cập nhật sau khi deploy

Có thể trình duyệt đang sử dụng nội dung đã lưu trong bộ nhớ đệm.

Thử tải lại trang bằng:

Ctrl + Shift + R

Đây là thao tác tải lại mạnh trên nhiều trình duyệt máy tính.

Nếu vẫn chưa cập nhật, kiểm tra lại kết quả triển khai trong Firebase Console.

18.6. Firebase CLI không nhận diện lệnh

Kiểm tra:

node -v
npm -v
firebase --version

Nếu Node.js và npm hoạt động nhưng Firebase CLI không được nhận diện, kiểm tra lại quá trình cài Firebase CLI và biến môi trường PATH.

19. Chi phí sử dụng Firebase

Firebase có các gói sử dụng khác nhau.

Một số dịch vụ có thể sử dụng trong giới hạn miễn phí, nhưng không có nghĩa mọi tính năng đều miễn phí vô hạn.

Trước khi bật dịch vụ mới, hãy kiểm tra:

Gói dịch vụ hiện tại.

Giới hạn sử dụng.

Yêu cầu thanh toán.

Chính sách giá của dịch vụ.

Đặc biệt, Cloud Storage có thể yêu cầu chuyển sang gói Blaze đối với các thiết lập hoặc bucket mới.

Nếu bạn muốn duy trì dự án với ngân sách 0 đồng, không tự ý bật Blaze hoặc thêm phương thức thanh toán chỉ để thử một tính năng.

StarmentChat không bắt buộc phải triển khai chức năng tải ảnh lên ngay từ đầu.

Bạn có thể hoàn thiện các chức năng nhắn tin cơ bản trước.

Kiểm tra bảng giá chính thức:

https://firebase.google.com/pricing

Kiểm tra mức sử dụng trong Firebase Console để tránh vượt giới hạn.

20. Bảo mật tài khoản và dữ liệu

Một số nguyên tắc cần tuân thủ:

Không chia sẻ mật khẩu Google.

Không chia sẻ mật khẩu tài khoản Firebase.

Không cấp quyền quản trị Project cho người không đáng tin cậy.

Không sử dụng Security Rules mở toàn bộ dữ liệu.

Không lưu mật khẩu người dùng dưới dạng văn bản thuần trong Firestore hoặc Realtime Database.

Không đưa khóa bí mật của dịch vụ backend vào mã JavaScript công khai.

Kiểm tra Rules trước khi triển khai.

Không để dữ liệu riêng tư trong thư mục Hosting công khai.

Theo dõi mức sử dụng và chi phí Firebase.

Sao lưu dữ liệu quan trọng khi cần thiết.

Một lưu ý quan trọng:

Firebase Authentication quản lý mật khẩu đăng nhập.

Bạn không cần tự lưu mật khẩu của người dùng trong cơ sở dữ liệu ứng dụng.

21. Tài liệu chính thức

Nếu muốn tìm hiểu sâu hơn, hãy sử dụng tài liệu chính thức:

Firebase Console: https://console.firebase.google.com/

Firebase Documentation: https://firebase.google.com/docs

Firebase Authentication: https://firebase.google.com/docs/auth

Cloud Firestore: https://firebase.google.com/docs/firestore

Realtime Database: https://firebase.google.com/docs/database

Firebase Hosting: https://firebase.google.com/docs/hosting

Firebase Security Rules: https://firebase.google.com/docs/rules

Firebase CLI: https://firebase.google.com/docs/cli

Google 2-Step Verification: https://support.google.com/accounts/answer/185839

Tài liệu chính thức nên được ưu tiên khi giao diện hoặc quy trình Firebase thay đổi.

22. Kết thúc

Sau khi hoàn thành các bước trên, bạn đã có:

Một Firebase Project riêng.

Một Firebase Web App.

Firebase Authentication.

Cloud Firestore.

Realtime Database.

Cấu hình Security Rules.

Firebase CLI.

Firebase Hosting.

Bạn có thể tiếp tục phát triển StarmentChat trên Project của mình.

StarmentChat

Created by PentiumStudio.

Không quảng cáo.

Không thương mại.

Không thu phí người dùng.

