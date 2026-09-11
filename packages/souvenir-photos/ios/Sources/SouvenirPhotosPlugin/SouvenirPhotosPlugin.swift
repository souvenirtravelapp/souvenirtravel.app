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
        CAPPluginMethod(name: "covers", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "photos", returnType: CAPPluginReturnPromise)
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

    /// معرض رحلة واحدة { trip:{id,start,end?}, limit? }: [مصغّرات base64].
    @objc func photos(_ call: CAPPluginCall) {
        let trip = (call.getObject("trip") ?? [:]).mapValues { $0 as Any }
        let limit = call.getInt("limit") ?? 40
        SouvenirPhotosCore.photos(for: trip, limit: limit) { arr in
            call.resolve(["photos": arr])
        }
    }
}
