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
        CAPPluginMethod(name: "photos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fullImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "thumbnails", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickPhotos", returnType: CAPPluginReturnPromise)
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

    /// معرض رحلة واحدة { trip:{id,start,end?}, limit? }: [{id, thumb}].
    @objc func photos(_ call: CAPPluginCall) {
        let trip = (call.getObject("trip") ?? [:]).mapValues { $0 as Any }
        let limit = call.getInt("limit") ?? 40
        SouvenirPhotosCore.photos(for: trip, limit: limit) { arr in
            call.resolve(["photos": arr])
        }
    }

    /// صورة واحدة بجودة عالية { id }: { image: base64 | null }.
    @objc func fullImage(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.resolve(["image": NSNull()]); return }
        SouvenirPhotosCore.fullImage(id: id) { img in
            call.resolve(["image": img ?? NSNull()])
        }
    }

    /// مصغّرات لمعرّفات محدّدة { ids:[...] }: { photos:[{id,thumb}] }.
    @objc func thumbnails(_ call: CAPPluginCall) {
        let ids = (call.getArray("ids") ?? []).compactMap { $0 as? String }
        SouvenirPhotosCore.thumbnails(for: ids) { arr in
            call.resolve(["photos": arr])
        }
    }

    /// منتقي صور النظام: { photos:[{id,thumb}] } للمختارة (أو فارغة).
    @objc func pickPhotos(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { call.resolve(["photos": []]); return }
            SouvenirPhotosCore.pickPhotos(from: vc) { arr in
                call.resolve(["photos": arr])
            }
        }
    }
}
