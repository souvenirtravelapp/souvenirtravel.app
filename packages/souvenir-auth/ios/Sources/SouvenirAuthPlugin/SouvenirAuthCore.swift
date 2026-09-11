import Foundation
import GoogleSignIn
import UIKit

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
}
