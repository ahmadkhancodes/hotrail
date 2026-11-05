// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Xcode). CI (plugin-ci.yml) is the first compile.
import Foundation
import Compression

/// Minimal ZIP reader (stored + deflate, no zip64, no encryption). Every entry path is checked against zip-slip.
public enum ZipExtractor {
    private static func u16(_ d: Data, _ o: Int) -> Int { Int(d[d.startIndex + o]) | Int(d[d.startIndex + o + 1]) << 8 }
    private static func u32(_ d: Data, _ o: Int) -> Int { u16(d, o) | u16(d, o + 2) << 16 }

    public static func extract(zip: URL, into root: URL, maxTotalBytes: Int = 512 << 20, maxEntries: Int = 20000) throws {
        let data = try Data(contentsOf: zip, options: .mappedIfSafe)
        guard data.count >= 22 else { throw HotrailError.badZip("too small") }
        var eocd = -1
        var i = data.count - 22
        while i >= max(0, data.count - 22 - 65535) { if u32(data, i) == 0x06054b50 { eocd = i; break }; i -= 1 }
        guard eocd >= 0 else { throw HotrailError.badZip("no end of central directory") }
        let count = u16(data, eocd + 10)
        var off = u32(data, eocd + 16)
        guard count <= maxEntries else { throw HotrailError.badZip("too many entries") }
        var total = 0
        let fm = FileManager.default
        for _ in 0..<count {
            guard off + 46 <= data.count, u32(data, off) == 0x02014b50 else { throw HotrailError.badZip("bad central header") }
            let method = u16(data, off + 10)
            let csize = u32(data, off + 20), usize = u32(data, off + 24)
            let nlen = u16(data, off + 28), elen = u16(data, off + 30), clen = u16(data, off + 32)
            let lho = u32(data, off + 42)
            guard off + 46 + nlen <= data.count else { throw HotrailError.badZip("truncated") }
            let nameData = data.subdata(in: (data.startIndex + off + 46)..<(data.startIndex + off + 46 + nlen))
            let name = String(decoding: nameData, as: UTF8.self)
            off += 46 + nlen + elen + clen
            let target = try hotrailSafeURL(root: root, entry: name)
            if name.hasSuffix("/") { try fm.createDirectory(at: target, withIntermediateDirectories: true); continue }
            total += usize
            guard total <= maxTotalBytes else { throw HotrailError.badZip("too large") }
            guard lho + 30 <= data.count, u32(data, lho) == 0x04034b50 else { throw HotrailError.badZip("bad local header") }
            let start = lho + 30 + u16(data, lho + 26) + u16(data, lho + 28)
            guard start + csize <= data.count else { throw HotrailError.badZip("truncated entry") }
            let comp = data.subdata(in: (data.startIndex + start)..<(data.startIndex + start + csize))
            var out: Data
            switch method {
            case 0: out = comp
            case 8:
                var buf = [UInt8](repeating: 0, count: usize)
                let n = comp.withUnsafeBytes { src -> Int in
                    guard let sp = src.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                    return compression_decode_buffer(&buf, usize, sp, csize, nil, COMPRESSION_ZLIB)
                }
                guard n == usize else { throw HotrailError.badZip("inflate failed") }
                out = Data(buf)
            default: throw HotrailError.badZip("unsupported method \(method)")
            }
            try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try out.write(to: target, options: .atomic)
        }
    }
}
