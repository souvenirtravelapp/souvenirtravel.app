import Foundation
import Capacitor
import GoogleSignIn

// جسر الدخول الأصلي لغلاف iOS — نظير SouvenirAuthPlugin على Android، بنفس
// العقد حرفيًّا: window.Capacitor.Plugins.SouvenirAuth بثلاث طرق تعيد { idToken }.
// طبقة الويب (cloud.js/boot.js) تمضي بالـidToken في مصالحتها المعتادة — لا
// OAuth داخل WebView (تحظره Google)، بل GIDSignIn أصيل يسلّم الاعتماد للويب.
//
// معرّفات عملاء OAuth ليست أسرارًا (تُضمَّن في التطبيق وInfo.plist أصلًا):
// عميل iOS للتقديم، وعميل الويب (نفس Android) جمهورًا للـidToken فتقبله Firebase.
@objc(SouvenirAuthPlugin)
public class SouvenirAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SouvenirAuthPlugin"
    public let jsName = "SouvenirAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    private let iosClientID =
        "183279616442-39tb4vm90o642c6cdned78jitf0ek27m.apps.googleusercontent.com"
    private let serverClientID =
        "183279616442-pf7b02km4ttl0mem71kqkisqgh0odsdd.apps.googleusercontent.com"

    public override func load() {
        NSLog("SVAUTH: SouvenirAuthPlugin loaded (jsName=%@)", jsName)
    }

    private func configureIfNeeded() {
        if GIDSignIn.sharedInstance.configuration == nil {
            GIDSignIn.sharedInstance.configuration =
                GIDConfiguration(clientID: iosClientID, serverClientID: serverClientID)
        }
    }

    /// استعادة صامتة عند الإقلاع — تعيد idToken لجلسة قائمة، أو null بلا رفض.
    @objc func restore(_ call: CAPPluginCall) {
        configureIfNeeded()
        GIDSignIn.sharedInstance.restorePreviousSignIn { user, _ in
            call.resolve(["idToken": user?.idToken?.tokenString ?? NSNull()])
        }
    }

    /// دخول تفاعليّ بطلب طبقة الويب — يعرض ورقة Google ويعيد idToken أو يرفض.
    @objc func signIn(_ call: CAPPluginCall) {
        NSLog("SVAUTH: signIn called")
        configureIfNeeded()
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                NSLog("SVAUTH: no presenter")
                call.reject("sign-in failed: no presenter"); return
            }
            NSLog("SVAUTH: presenting Google sheet")
            GIDSignIn.sharedInstance.signIn(withPresenting: vc) { result, error in
                if let error = error {
                    call.reject("sign-in failed: \(error.localizedDescription)"); return
                }
                call.resolve(["idToken": result?.user.idToken?.tokenString ?? NSNull()])
            }
        }
    }

    /// خروج — ينهي جلسة GIDSignIn؛ طبقة الويب تنهي جلسة Firebase.
    @objc func signOut(_ call: CAPPluginCall) {
        GIDSignIn.sharedInstance.signOut()
        call.resolve()
    }
}
