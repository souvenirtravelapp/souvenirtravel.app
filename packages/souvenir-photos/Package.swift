// swift-tools-version:5.9
import PackageDescription

// حزمة ملحق Capacitor محلية — يكتشفها `cap sync ios` فيدرج SouvenirPhotosPlugin
// في packageClassList تلقائيًّا. لا تبعية خارجية: Photos وUIKit من النظام.
// الاسم والمنتج "SouvenirPhotos" يطابق ما يشتقه cap sync من اسم npm
// (souvenir-photos ← SouvenirPhotos)؛ الهدف SouvenirPhotosPlugin يحمل الصنف.
let package = Package(
    name: "SouvenirPhotos",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "SouvenirPhotos",
            targets: ["SouvenirPhotosPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2")
    ],
    targets: [
        .target(
            name: "SouvenirPhotosPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/SouvenirPhotosPlugin")
    ]
)
