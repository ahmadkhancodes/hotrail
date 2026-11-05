// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Xcode). CI (plugin-ci.yml) is the first compile.
import Foundation
import Capacitor

@objc(HotrailUpdaterPlugin)
public class HotrailUpdaterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HotrailUpdaterPlugin"
    public let jsName = "HotrailUpdater"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDeviceInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unzip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hashFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "copyFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removePath", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBundle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmBundle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeNativeRevert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "storageRemove", returnType: CAPPluginReturnPromise),
    ]

    private let store = HotrailStateStore(defaults: .standard)
    private let files = HotrailFiles()
    private var bundlesRoot: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("hotrail/bundles", isDirectory: true)
    }

    override public func load() {
        store.guardOnProcessStart() // may restore the previous bundle before the web view uses it
        if let p = store.activePath, FileManager.default.fileExists(atPath: p) {
            applyBase(p)
        } else if store.activePath != nil {
            store.setActive(nil); store.trial = nil // bundle files vanished: fall back to built-in
        }
    }

    private func applyBase(_ path: String?) {
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? CAPBridgeViewController else { return }
            if let p = path { vc.setServerBasePath(path: p) } else { vc.setServerBasePath(path: self.bridge?.config.appLocation.path ?? "") }
        }
    }

    /// Absolute paths from JS must stay under the bundles root (belt and braces against a hostile page).
    private func safe(_ p: String?) -> URL? {
        guard let p = p else { return nil }
        let u = URL(fileURLWithPath: p).standardizedFileURL
        let root = bundlesRoot.standardizedFileURL.path
        return (u.path == root || u.path.hasPrefix(root + "/")) ? u : nil
    }

    @objc func getDeviceInfo(_ call: CAPPluginCall) {
        let key = "hotrail.deviceId"
        let id = UserDefaults.standard.string(forKey: key) ?? { let n = UUID().uuidString.lowercased(); UserDefaults.standard.set(n, forKey: key); return n }()
        #if targetEnvironment(simulator)
        let sim = true
        #else
        let sim = false
        #endif
        try? FileManager.default.createDirectory(at: bundlesRoot, withIntermediateDirectories: true)
        call.resolve([
            "deviceId": id, "platform": "ios",
            "versionBuild": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0",
            "versionOs": UIDevice.current.systemVersion, "isEmulator": sim,
            "isProd": Bundle.main.appStoreReceiptURL?.lastPathComponent != "sandboxReceipt",
            "pluginVersion": "0.1.0", "bundlesRoot": bundlesRoot.path,
            "builtinDir": bridge?.config.appLocation.path as Any,
        ])
    }

    @objc func download(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s), url.scheme == "https" || url.scheme == "http", let dest = safe(call.getString("dest")) else { return call.reject("invalid args") }
        Task { do { try await files.download(url: url, dest: dest); call.resolve() } catch { call.reject("download failed: \(error)") } }
    }
    @objc func unzip(_ call: CAPPluginCall) {
        guard let s = safe(call.getString("src")), let d = safe(call.getString("dest")) else { return call.reject("invalid args") }
        DispatchQueue.global().async { do { try self.files.unzip(zip: s, dest: d); call.resolve() } catch { call.reject("unzip failed: \(error)") } }
    }
    @objc func hashFile(_ call: CAPPluginCall) {
        // Reads are allowed outside the bundles root so the built-in assets can serve as a delta source.
        guard let p = call.getString("path") else { return call.reject("invalid args") }
        DispatchQueue.global().async { call.resolve(["sha256": hotrailSha256Hex(file: URL(fileURLWithPath: p)) as Any]) }
    }
    @objc func copyFile(_ call: CAPPluginCall) {
        guard let s = call.getString("src"), let d = safe(call.getString("dest")) else { return call.reject("invalid args") }
        do { try files.copy(src: URL(fileURLWithPath: s), dest: d); call.resolve() } catch { call.reject("copy failed: \(error)") }
    }
    @objc func removePath(_ call: CAPPluginCall) {
        guard let p = safe(call.getString("path")) else { return call.reject("invalid args") }
        files.remove(p); call.resolve()
    }
    @objc func setBundle(_ call: CAPPluginCall) {
        let path = call.getString("path")
        if path != nil && safe(path) == nil { return call.reject("invalid path") }
        if call.getBool("trial") ?? false, let p = path, let v = call.getString("version") {
            store.beginTrial(path: p, previous: call.getString("previous"), version: v)
        } else { store.setActive(path); store.trial = nil }
        applyBase(path)
        call.resolve()
    }
    @objc func reload(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.bridge?.webView?.reload(); call.resolve() }
    }
    @objc func confirmBundle(_ call: CAPPluginCall) { store.confirm(); call.resolve() }
    @objc func consumeNativeRevert(_ call: CAPPluginCall) { call.resolve(["version": store.consumeRevert() as Any]) }
    @objc func storageGet(_ call: CAPPluginCall) { call.resolve(["value": store.get(call.getString("key") ?? "") as Any]) }
    @objc func storageSet(_ call: CAPPluginCall) { store.set(call.getString("key") ?? "", call.getString("value") ?? ""); call.resolve() }
    @objc func storageRemove(_ call: CAPPluginCall) { store.remove(call.getString("key") ?? ""); call.resolve() }
}
