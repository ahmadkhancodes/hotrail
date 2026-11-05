// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Xcode). CI (plugin-ci.yml) is the first compile.
import XCTest
@testable import HotrailUpdaterPlugin

final class HotrailUpdaterTests: XCTestCase {
    func tmpDir() -> URL {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try! FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    func testSha256KnownVector() {
        XCTAssertEqual(hotrailSha256Hex(data: Data("abc".utf8)), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        let f = tmpDir().appendingPathComponent("a.txt")
        try! Data("abc".utf8).write(to: f)
        XCTAssertEqual(hotrailSha256Hex(file: f), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertNil(hotrailSha256Hex(file: f.appendingPathExtension("missing")))
    }

    func testSafeURLRejectsTraversal() {
        let root = tmpDir()
        XCTAssertThrowsError(try hotrailSafeURL(root: root, entry: "../evil.txt"))
        XCTAssertThrowsError(try hotrailSafeURL(root: root, entry: "a/../../evil.txt"))
        XCTAssertThrowsError(try hotrailSafeURL(root: root, entry: "/etc/passwd"))
        XCTAssertNoThrow(try hotrailSafeURL(root: root, entry: "assets/app.js"))
    }

    /// Builds a one entry stored (method 0) zip by hand.
    func storedZip(name: String, content: String) -> Data {
        func le16(_ v: Int) -> [UInt8] { [UInt8(v & 255), UInt8((v >> 8) & 255)] }
        func le32(_ v: Int) -> [UInt8] { le16(v & 0xffff) + le16((v >> 16) & 0xffff) }
        let n = Array(name.utf8), c = Array(content.utf8)
        var z = [UInt8]()
        z += le32(0x04034b50) + le16(20) + le16(0) + le16(0) + le16(0) + le16(0) + le32(0) + le32(c.count) + le32(c.count) + le16(n.count) + le16(0) + n + c
        let cdOff = z.count
        z += le32(0x02014b50) + le16(20) + le16(20) + le16(0) + le16(0) + le16(0) + le16(0) + le32(0) + le32(c.count) + le32(c.count) + le16(n.count) + le16(0) + le16(0) + le16(0) + le16(0) + le32(0) + le32(0) + n
        let cdSize = z.count - cdOff
        z += le32(0x06054b50) + le16(0) + le16(0) + le16(1) + le16(1) + le32(cdSize) + le32(cdOff) + le16(0)
        return Data(z)
    }

    func testUnzipExtractsAndBlocksZipSlip() throws {
        let dir = tmpDir()
        let good = dir.appendingPathComponent("good.zip"); try storedZip(name: "index.html", content: "hi").write(to: good)
        let dest = dir.appendingPathComponent("bundle")
        try HotrailFiles().unzip(zip: good, dest: dest)
        XCTAssertEqual(try String(contentsOf: dest.appendingPathComponent("index.html")), "hi")

        let evil = dir.appendingPathComponent("evil.zip"); try storedZip(name: "../escape.txt", content: "x").write(to: evil)
        XCTAssertThrowsError(try HotrailFiles().unzip(zip: evil, dest: dir.appendingPathComponent("b2")))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("escape.txt").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("b2").path))
    }

    func testTrialGuardRevertsOnSecondUnconfirmedStart() {
        let d = UserDefaults(suiteName: UUID().uuidString)!
        let s = HotrailStateStore(defaults: d)
        s.setActive("/good")
        s.beginTrial(path: "/new", previous: "/good", version: "2.0.0")
        XCTAssertNil(s.guardOnProcessStart())          // first launch of the trial bundle
        XCTAssertEqual(s.activePath, "/new")
        XCTAssertEqual(s.guardOnProcessStart(), "2.0.0") // second start without confirm
        XCTAssertEqual(s.activePath, "/good")
        XCTAssertNil(s.trial)
        XCTAssertEqual(s.consumeRevert(), "2.0.0")
        XCTAssertNil(s.consumeRevert())
    }

    func testConfirmClearsTrial() {
        let s = HotrailStateStore(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        s.beginTrial(path: "/new", previous: nil, version: "2.0.0")
        s.confirm()
        XCTAssertNil(s.guardOnProcessStart()); XCTAssertNil(s.guardOnProcessStart())
        XCTAssertEqual(s.activePath, "/new")
    }

    func testKeyValueRoundTrip() {
        let s = HotrailStateStore(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        s.set("k", "v"); XCTAssertEqual(s.get("k"), "v"); s.remove("k"); XCTAssertNil(s.get("k"))
    }
}
