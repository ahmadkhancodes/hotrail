// swift-tools-version: 5.9
// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Xcode). CI (plugin-ci.yml) is the first compile.
import PackageDescription

let package = Package(
    name: "BuffersolHotrailUpdater",
    platforms: [.iOS(.v14)],
    products: [.library(name: "BuffersolHotrailUpdater", targets: ["HotrailUpdaterPlugin"])],
    dependencies: [.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "6.0.0")],
    targets: [
        .target(
            name: "HotrailUpdaterPlugin",
            dependencies: [.product(name: "Capacitor", package: "capacitor-swift-pm"), .product(name: "Cordova", package: "capacitor-swift-pm")],
            path: "ios/Sources/HotrailUpdaterPlugin"),
        .testTarget(name: "HotrailUpdaterPluginTests", dependencies: ["HotrailUpdaterPlugin"], path: "ios/Tests/HotrailUpdaterTests"),
    ]
)
