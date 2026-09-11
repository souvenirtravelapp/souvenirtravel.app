import Foundation
import Capacitor

// جسر الدخول الأصلي لغلاف iOS — الآن حزمة ملحق Capacitor محلية، فيدرجه
// cap sync في packageClassList تلقائيًّا (كأندرويد) بلا تعديل يدوي متجاهَل.
// نظير SouvenirAuthPlugin على Android بنفس العقد:
// window.Capacitor.Plugins.SouvenirAuth بثلاث طرق تعيد { idToken }.
@objc(SouvenirAuthPlugin)
public class SouvenirAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SouvenirAuthPlugin"
    public let jsName = "SouvenirAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        NSLog("SVAUTH: SouvenirAuthPlugin loaded (jsName=%@)", jsName)
    }

    /// استعادة صامتة عند الإقلاع — idToken أو null بلا رفض.
    @objc func restore(_ call: CAPPluginCall) {
        SouvenirAuthCore.restore { token in
            call.resolve(["idToken": token ?? NSNull()])
        }
    }

    /// دخول تفاعليّ بطلب طبقة الويب — يعرض ورقة Google ويعيد idToken أو يرفض.
    @objc func signIn(_ call: CAPPluginCall) {
        NSLog("SVAUTH: signIn called")
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else {
                call.reject("sign-in failed: no presenter"); return
            }
            SouvenirAuthCore.signIn(presenting: vc) { token, error in
                if let error = error {
                    call.reject("sign-in failed: \(error.localizedDescription)"); return
                }
                call.resolve(["idToken": token ?? NSNull()])
            }
        }
    }

    /// خروج — ينهي جلسة GIDSignIn؛ طبقة الويب تنهي جلسة Firebase.
    @objc func signOut(_ call: CAPPluginCall) {
        SouvenirAuthCore.signOut()
        call.resolve()
    }
}
