import Foundation
import GoogleSignIn
import UIKit
import AuthenticationServices
import CryptoKit

// منطق الدخول الأصلي عبر GoogleSignIn — يبقى في مكتبة SPM (حيث تبعية
// GoogleSignIn)، ويستدعيه ملحق Capacitor في هدف App (حيث يمسح Capacitor عن
// الملاحق). فصلٌ يُبقي تبعية GoogleSignIn بمكانها دون إضافتها لهدف App.
// معرّفات عملاء OAuth ليست أسرارًا (تُضمَّن في التطبيق وInfo.plist أصلًا).
public enum SouvenirAuthCore {
    private static let iosClientID =
        "183279616442-39tb4vm90o642c6cdned78jitf0ek27m.apps.googleusercontent.com"
    private static let serverClientID =
        "183279616442-pf7b02km4ttl0mem71kqkisqgh0odsdd.apps.googleusercontent.com"

    private static func configureIfNeeded() {
        if GIDSignIn.sharedInstance.configuration == nil {
            GIDSignIn.sharedInstance.configuration =
                GIDConfiguration(clientID: iosClientID, serverClientID: serverClientID)
        }
    }

    /// استعادة صامتة — idToken لجلسة قائمة أو nil.
    public static func restore(_ completion: @escaping (String?) -> Void) {
        configureIfNeeded()
        GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
            completion(user?.idToken?.tokenString)
        }
    }

    /// دخول تفاعليّ — يعرض ورقة Google (يجب النداء على الخيط الرئيسي).
    public static func signIn(presenting vc: UIViewController,
                              completion: @escaping (String?, Error?) -> Void) {
        configureIfNeeded()
        GIDSignIn.sharedInstance.signIn(withPresenting: vc) { result, error in
            completion(result?.user.idToken?.tokenString, error)
        }
    }

    public static func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    // ── الدخول بأبل ── nonce عشوائي، SHA256 منه يُرسل في الطلب، والخام يُعاد
    // ليمرّره الويب لفايربيس (OAuthProvider("apple.com").credential). المنسّق
    // يُمسك بنفسه طوال الجلسة (ASAuthorizationController لا يحتفظ بمندوبه).
    private static var appleAuth: AppleAuth?
    public static func signInApple(completion: @escaping (String?, String?, Error?) -> Void) {
        let coordinator = AppleAuth { token, rawNonce, error in
            appleAuth = nil
            completion(token, rawNonce, error)
        }
        appleAuth = coordinator
        coordinator.start()
    }
}

private final class AppleAuth: NSObject, ASAuthorizationControllerDelegate,
                               ASAuthorizationControllerPresentationContextProviding {
    private let done: (String?, String?, Error?) -> Void
    private let rawNonce: String
    init(_ done: @escaping (String?, String?, Error?) -> Void) {
        self.done = done
        self.rawNonce = AppleAuth.randomNonce()
    }

    func start() {
        let req = ASAuthorizationAppleIDProvider().createRequest()
        req.requestedScopes = [.fullName, .email]
        req.nonce = AppleAuth.sha256(rawNonce)
        let ctrl = ASAuthorizationController(authorizationRequests: [req])
        ctrl.delegate = self
        ctrl.presentationContextProvider = self
        ctrl.performRequests()
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            done(nil, nil, NSError(domain: "SVApple", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "no identity token"]))
            return
        }
        done(token, rawNonce, nil)
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithError error: Error) {
        done(nil, nil, error)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    private static func randomNonce(_ length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    private static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
