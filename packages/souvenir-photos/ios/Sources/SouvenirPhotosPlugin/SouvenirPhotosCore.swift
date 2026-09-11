import Foundation
import Photos
import PhotosUI
import UIKit

// صور الرحلة من مكتبة الجهاز في مداها الزمني — كله على الجهاز، بلا رفع، بلا
// Vision. covers: أفضل صورة لكل رحلة (غلاف). photos: معرض صور رحلة واحدة زمنيًّا.
public enum SouvenirPhotosCore {

    // إذن القراءة مرّةً، ثم العمل على خيط خلفي (ok=false ⇒ مرفوض/مقيّد).
    private static func withReadAccess(_ work: @escaping (Bool) -> Void) {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized, .limited:
            DispatchQueue.global(qos: .userInitiated).async { work(true) }
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
                let ok = (s == .authorized || s == .limited)
                DispatchQueue.global(qos: .userInitiated).async { work(ok) }
            }
        default:
            work(false)
        }
    }

    // غلاف كل رحلة: مفضّلة ← موسومة بموقع ← الأولى.
    public static func covers(for trips: [[String: Any]],
                              completion: @escaping ([String: String]) -> Void) {
        withReadAccess { ok in
            guard ok else { DispatchQueue.main.async { completion([:]) }; return }
            let mgr = PHImageManager.default()
            var out: [String: String] = [:]
            for trip in trips {
                guard let id = trip["id"] as? String else { continue }
                // غلاف اختاره المستخدم يتقدّم على المطابقة الزمنية.
                let picked: PHAsset?
                if let coverId = trip["coverId"] as? String, !coverId.isEmpty {
                    picked = assetById(coverId)
                } else if let range = dateRange(trip) {
                    picked = bestAsset(in: range)
                } else {
                    picked = nil
                }
                if let a = picked, let b64 = thumbnail(a, mgr, 600) { out[id] = b64 }
            }
            DispatchQueue.main.async { completion(out) }
        }
    }

    // معرض رحلة واحدة: صورها زمنيًّا حتى الحدّ — كلٌّ بمعرّفه ومصغّره.
    public static func photos(for trip: [String: Any], limit: Int,
                              completion: @escaping ([[String: String]]) -> Void) {
        withReadAccess { ok in
            guard ok, let range = dateRange(trip) else {
                DispatchQueue.main.async { completion([]) }; return
            }
            let mgr = PHImageManager.default()
            var out: [[String: String]] = []
            for asset in assetsInRange(range, limit: limit) {
                if let b64 = thumbnail(asset, mgr, 300, fast: true) {
                    out.append(["id": asset.localIdentifier, "thumb": b64])
                }
            }
            DispatchQueue.main.async { completion(out) }
        }
    }

    private static func assetById(_ id: String) -> PHAsset? {
        PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject
    }

    // صورة واحدة بجودة عالية للعرض المكبّر (عند فتح صورة المعرض).
    public static func fullImage(id: String, completion: @escaping (String?) -> Void) {
        withReadAccess { ok in
            guard ok, let asset = assetById(id) else {
                DispatchQueue.main.async { completion(nil) }; return
            }
            let b64 = thumbnail(asset, PHImageManager.default(), 1400)
            DispatchQueue.main.async { completion(b64) }
        }
    }

    // مصغّرات لمعرّفات محدّدة (الصور المُضافة يدويًّا) — بترتيب الطلب.
    public static func thumbnails(for ids: [String],
                                  completion: @escaping ([[String: String]]) -> Void) {
        withReadAccess { ok in
            guard ok, !ids.isEmpty else { DispatchQueue.main.async { completion([]) }; return }
            let mgr = PHImageManager.default()
            var byId: [String: PHAsset] = [:]
            PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
                .enumerateObjects { a, _, _ in byId[a.localIdentifier] = a }
            var out: [[String: String]] = []
            for id in ids {
                if let a = byId[id], let b64 = thumbnail(a, mgr, 300, fast: true) {
                    out.append(["id": id, "thumb": b64])
                }
            }
            DispatchQueue.main.async { completion(out) }
        }
    }

    // منتقي صور النظام — يعيد [{id, thumb}] للمختارة (يحتفظ بمندوبه أثناء العرض).
    private static var picker: PhotoPicker?
    public static func pickPhotos(from vc: UIViewController,
                                  completion: @escaping ([[String: String]]) -> Void) {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 0
        let controller = PHPickerViewController(configuration: config)
        let coord = PhotoPicker { ids in
            picker = nil
            if ids.isEmpty { DispatchQueue.main.async { completion([]) } }
            else { thumbnails(for: ids, completion: completion) }
        }
        picker = coord
        controller.delegate = coord
        vc.present(controller, animated: true)
    }

    private static func fetch(in range: (Date, Date)) -> PHFetchResult<PHAsset> {
        let opts = PHFetchOptions()
        opts.predicate = NSPredicate(
            format: "creationDate >= %@ AND creationDate <= %@ AND mediaType == %d",
            range.0 as NSDate, range.1 as NSDate, PHAssetMediaType.image.rawValue)
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        return PHAsset.fetchAssets(with: opts)
    }

    private static func bestAsset(in range: (Date, Date)) -> PHAsset? {
        let result = fetch(in: range)
        guard result.count > 0 else { return nil }
        var geo: PHAsset?
        for i in 0..<result.count {
            let a = result.object(at: i)
            if a.isFavorite { return a }               // مفضّلة: أقوى إشارة
            if geo == nil && a.location != nil { geo = a }
        }
        return geo ?? result.object(at: 0)             // موسومة بموقع، وإلا الأولى
    }

    private static func assetsInRange(_ range: (Date, Date), limit: Int) -> [PHAsset] {
        let result = fetch(in: range)
        var out: [PHAsset] = []
        for i in 0..<min(result.count, max(0, limit)) { out.append(result.object(at: i)) }
        return out
    }

    private static func thumbnail(_ asset: PHAsset, _ mgr: PHImageManager, _ px: CGFloat,
                                  fast: Bool = false) -> String? {
        let opts = PHImageRequestOptions()
        opts.isSynchronous = true                      // نحن على خيط خلفي أصلًا
        opts.deliveryMode = fast ? .fastFormat : .highQualityFormat  // المعرض: نسخة سريعة
        opts.isNetworkAccessAllowed = true             // صور iCloud أيضًا
        opts.resizeMode = .fast
        var b64: String?
        mgr.requestImage(for: asset, targetSize: CGSize(width: px, height: px),
                         contentMode: .aspectFill, options: opts) { image, _ in
            if let image = image, let data = image.jpegData(compressionQuality: fast ? 0.6 : 0.7) {
                b64 = "data:image/jpeg;base64," + data.base64EncodedString()
            }
        }
        return b64
    }

    // ── تحليل تواريخ الرحلة إلى مدى [بداية اليوم، نهاية اليوم/الشهر] ──
    private static func dateRange(_ trip: [String: Any]) -> (Date, Date)? {
        guard let start = parseDay(trip["start"] as? String) else { return nil }
        let end = parseDay(trip["end"] as? String).map(endOfDay) ?? endOfMonth(start)
        return (start, end)
    }

    private static func parseDay(_ s: String?) -> Date? {
        guard let s = s, !s.isEmpty else { return nil }
        for fmt in ["yyyy-MM-dd", "yyyy-MM"] {
            let df = DateFormatter()
            df.locale = Locale(identifier: "en_US_POSIX")
            df.timeZone = TimeZone.current
            df.dateFormat = fmt
            if let d = df.date(from: s) { return Calendar.current.startOfDay(for: d) }
        }
        return nil
    }

    private static func endOfDay(_ d: Date) -> Date {
        let cal = Calendar.current
        return cal.date(byAdding: DateComponents(day: 1, second: -1),
                        to: cal.startOfDay(for: d)) ?? d
    }

    private static func endOfMonth(_ d: Date) -> Date {
        let cal = Calendar.current
        let monthStart = cal.date(from: cal.dateComponents([.year, .month], from: d)) ?? d
        return cal.date(byAdding: DateComponents(month: 1, second: -1), to: monthStart) ?? d
    }
}

private final class PhotoPicker: NSObject, PHPickerViewControllerDelegate {
    private let done: ([String]) -> Void
    init(_ done: @escaping ([String]) -> Void) { self.done = done }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        done(results.compactMap { $0.assetIdentifier })
    }
}
