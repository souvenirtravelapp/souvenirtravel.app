import Foundation
import Photos
import UIKit

// المصغّر الأول (MVP): لكل رحلة، أول صورة في مداها الزمني — مفضّلة ← موسومة
// بموقع ← الأولى — مصغّرة إلى JPEG base64. كله على الجهاز، بلا رفع، بلا Vision.
// ترتيب Vision (شخصية/بانوراما/لقطة…) يُضاف لاحقًا إن قصّر هذا الاختيار.
public enum SouvenirPhotosCore {
    public static func covers(for trips: [[String: Any]],
                              completion: @escaping ([String: String]) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized, .limited:
            run(trips, completion)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
                if s == .authorized || s == .limited { run(trips, completion) }
                else { DispatchQueue.main.async { completion([:]) } }
            }
        default:
            completion([:])   // مرفوض/مقيّد — البطاقات تبقى على الشفق
        }
    }

    private static func run(_ trips: [[String: Any]],
                            _ completion: @escaping ([String: String]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let mgr = PHImageManager.default()
            var out: [String: String] = [:]
            for trip in trips {
                guard let id = trip["id"] as? String,
                      let range = dateRange(trip),
                      let asset = bestAsset(in: range),
                      let b64 = thumbnail(asset, mgr) else { continue }
                out[id] = b64
            }
            DispatchQueue.main.async { completion(out) }
        }
    }

    private static func bestAsset(in range: (Date, Date)) -> PHAsset? {
        let opts = PHFetchOptions()
        opts.predicate = NSPredicate(
            format: "creationDate >= %@ AND creationDate <= %@ AND mediaType == %d",
            range.0 as NSDate, range.1 as NSDate, PHAssetMediaType.image.rawValue)
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        let result = PHAsset.fetchAssets(with: opts)
        guard result.count > 0 else { return nil }
        var geo: PHAsset?
        for i in 0..<result.count {
            let a = result.object(at: i)
            if a.isFavorite { return a }               // مفضّلة: أقوى إشارة
            if geo == nil && a.location != nil { geo = a }
        }
        return geo ?? result.object(at: 0)             // موسومة بموقع، وإلا الأولى
    }

    private static func thumbnail(_ asset: PHAsset, _ mgr: PHImageManager) -> String? {
        let opts = PHImageRequestOptions()
        opts.isSynchronous = true                      // نحن على خيط خلفي أصلًا
        opts.deliveryMode = .highQualityFormat
        opts.isNetworkAccessAllowed = true             // صور iCloud أيضًا
        opts.resizeMode = .fast
        var b64: String?
        mgr.requestImage(for: asset, targetSize: CGSize(width: 600, height: 600),
                         contentMode: .aspectFill, options: opts) { image, _ in
            if let image = image, let data = image.jpegData(compressionQuality: 0.7) {
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
