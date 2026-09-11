// swift-tools-version:5.9
import PackageDescription

// حزمة ملحق Capacitor محلية — يكتشفها `cap sync ios` فيدرج SouvenirAuthPlugin
// في packageClassList تلقائيًّا (كأندرويد)، فلا يعتمد التسجيل على تعديل يدوي
// في ملفٍ مولّد متجاهَل. تبعية GoogleSignIn تعيش هنا مع الملحق.
// اسم الحزمة والمنتج "SouvenirAuth" — يطابق ما يشتقه cap sync من اسم npm
// (souvenir-auth ← SouvenirAuth)؛ الهدف SouvenirAuthPlugin يحمل الصنف.
let package = Package(
    name: "SouvenirAuth",
    platforms: [.iOS(.v14)],
    products: [
        .library(
            name: "SouvenirAuth",
            targets: ["SouvenirAuthPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", from: "7.1.0")
    ],
    targets: [
        .target(
            name: "SouvenirAuthPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS")
            ],
            path: "ios/Sources/SouvenirAuthPlugin")
    ]
)
