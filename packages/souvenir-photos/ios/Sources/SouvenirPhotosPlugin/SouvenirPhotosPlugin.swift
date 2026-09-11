import Foundation
import Capacitor

// جسر مسح الصور لغلاف iOS — حزمة ملحق Capacitor محلية يدرجها cap sync.
// window.Capacitor.Plugins.SouvenirPhotos.covers({trips}) يعيد
// { covers: { <tripId>: "data:image/jpeg;base64,…" } }. كله على الجهاز.
@objc(SouvenirPhotosPlugin)
public class SouvenirPhotosPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SouvenirPhotosPlugin"
    public let jsName = "SouvenirPhotos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "covers", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        NSLog("SVPHOTOS: SouvenirPhotosPlugin loaded (jsName=%@)", jsName)
    }

    /// لكل رحلة { id, start, end? }: مصغّر غلاف base64 أو تُحذف من الخريطة.
    @objc func covers(_ call: CAPPluginCall) {
        let raw = call.getArray("trips") ?? []
        let trips = raw.compactMap { $0 as? [String: Any] }
        SouvenirPhotosCore.covers(for: trips) { map in
            call.resolve(["covers": map])
        }
    }
}
