// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Xcode). CI (plugin-ci.yml) is the first compile.
import Foundation
import CryptoKit

public enum HotrailError: Error { case unsafePath(String), badZip(String), http(Int), io(String) }

/// Path safety: resolves `entry` under `root` and throws if it would escape it (zip-slip).
public func hotrailSafeURL(root: URL, entry: String) throws -> URL {
    if entry.hasPrefix("/") || entry.hasPrefix("\\") || entry.contains("\0") { throw HotrailError.unsafePath(entry) }
    let parts = entry.replacingOccurrences(of: "\\", with: "/").split(separator: "/", omittingEmptySubsequences: true)
    if parts.contains("..") { throw HotrailError.unsafePath(entry) }
    let rootStd = root.standardizedFileURL
    let url = parts.reduce(rootStd) { $0.appendingPathComponent(String($1)) }.standardizedFileURL
    guard url.path == rootStd.path || url.path.hasPrefix(rootStd.path + "/") else { throw HotrailError.unsafePath(entry) }
    return url
}

public func hotrailSha256Hex(file: URL) -> String? {
    guard let h = try? FileHandle(forReadingFrom: file) else { return nil }
    defer { try? h.close() }
    var hasher = SHA256()
    while let chunk = try? h.read(upToCount: 1 << 16), !chunk.isEmpty { hasher.update(data: chunk) }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
}

public func hotrailSha256Hex(data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

/// Persistent bundle + crash-guard state in UserDefaults. Mirrors the TS state machine's native half.
public final class HotrailStateStore {
    public struct Trial: Codable, Equatable { public var path: String; public var previous: String?; public var version: String; public var loaded: Bool }
    private let d: UserDefaults
    public init(defaults: UserDefaults) { d = defaults }

    public var activePath: String? { d.string(forKey: "hotrail.active") }
    public var trial: Trial? {
        get { d.data(forKey: "hotrail.trial").flatMap { try? JSONDecoder().decode(Trial.self, from: $0) } }
        set { if let v = newValue, let data = try? JSONEncoder().encode(v) { d.set(data, forKey: "hotrail.trial") } else { d.removeObject(forKey: "hotrail.trial") } }
    }

    public func setActive(_ path: String?) { if let p = path { d.set(p, forKey: "hotrail.active") } else { d.removeObject(forKey: "hotrail.active") } }
    public func beginTrial(path: String, previous: String?, version: String) {
        setActive(path); trial = Trial(path: path, previous: previous, version: version, loaded: false)
    }
    public func confirm() { trial = nil }

    /// Call once per process start, before the web view loads. If a trial bundle already had its one launch and was
    /// never confirmed, restore the previous bundle and remember the failed version for JS to report.
    @discardableResult public func guardOnProcessStart() -> String? {
        guard var t = trial else { return nil }
        if t.loaded {
            setActive(t.previous); trial = nil
            d.set(t.version, forKey: "hotrail.reverted"); return t.version
        }
        t.loaded = true; trial = t
        return nil
    }
    public func consumeRevert() -> String? {
        let v = d.string(forKey: "hotrail.reverted"); d.removeObject(forKey: "hotrail.reverted"); return v
    }
    public func get(_ k: String) -> String? { d.string(forKey: "hotrail.kv." + k) }
    public func set(_ k: String, _ v: String) { d.set(v, forKey: "hotrail.kv." + k) }
    public func remove(_ k: String) { d.removeObject(forKey: "hotrail.kv." + k) }
}

/// File operations used by the plugin. Every write is staged and then moved atomically.
public final class HotrailFiles {
    private let fm = FileManager.default
    public init() {}

    public func download(url: URL, dest: URL) async throws {
        let (tmp, resp) = try await URLSession.shared.download(from: url)
        if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) { throw HotrailError.http(http.statusCode) }
        try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? fm.removeItem(at: dest)
        try fm.moveItem(at: tmp, to: dest)
    }

    public func copy(src: URL, dest: URL) throws {
        try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
        let staged = dest.appendingPathExtension("hotrail-tmp")
        try? fm.removeItem(at: staged)
        try fm.copyItem(at: src, to: staged)
        try? fm.removeItem(at: dest)
        try fm.moveItem(at: staged, to: dest)
    }

    public func remove(_ url: URL) { try? fm.removeItem(at: url) }

    /// Extract into a temp dir beside `dest`, then move into place so a half extracted bundle is never visible.
    public func unzip(zip: URL, dest: URL) throws {
        let staging = dest.deletingLastPathComponent().appendingPathComponent(".\(dest.lastPathComponent).extract")
        try? fm.removeItem(at: staging)
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        do { try ZipExtractor.extract(zip: zip, into: staging) } catch { try? fm.removeItem(at: staging); throw error }
        try? fm.removeItem(at: dest)
        try fm.moveItem(at: staging, to: dest)
    }
}
