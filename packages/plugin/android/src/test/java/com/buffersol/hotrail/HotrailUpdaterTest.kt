// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Android SDK). CI (plugin-ci.yml) is the first compile.
package com.buffersol.hotrail

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.*
import org.junit.Test

class HotrailUpdaterTest {
    private fun tmp(): File = Files.createTempDirectory("hotrail").toFile()

    private fun zip(file: File, entries: Map<String, String>) {
        ZipOutputStream(file.outputStream()).use { z -> entries.forEach { (n, c) -> z.putNextEntry(ZipEntry(n)); z.write(c.toByteArray()); z.closeEntry() } }
    }

    @Test fun sha256KnownVector() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256Hex("abc".toByteArray()))
        val f = File(tmp(), "a.txt"); f.writeText("abc")
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256Hex(f))
        assertNull(sha256Hex(File(tmp(), "missing")))
    }

    @Test fun safeResolveRejectsTraversal() {
        val root = tmp()
        for (bad in listOf("../evil.txt", "a/../../evil.txt", "/etc/passwd")) assertThrows(IOException::class.java) { safeResolve(root, bad) }
        assertTrue(safeResolve(root, "assets/app.js").path.startsWith(root.canonicalPath))
    }

    @Test fun unzipExtractsAndBlocksZipSlip() {
        val dir = tmp()
        val good = File(dir, "good.zip"); zip(good, mapOf("index.html" to "hi", "assets/a.js" to "x"))
        val dest = File(dir, "bundle")
        HotrailFiles.unzip(good, dest)
        assertEquals("hi", File(dest, "index.html").readText())
        assertEquals("x", File(dest, "assets/a.js").readText())

        val evil = File(dir, "evil.zip"); zip(evil, mapOf("../escape.txt" to "x"))
        assertThrows(IOException::class.java) { HotrailFiles.unzip(evil, File(dir, "b2")) }
        assertFalse(File(dir, "escape.txt").exists())
        assertFalse(File(dir, "b2").exists())
    }

    @Test fun trialGuardRevertsOnSecondUnconfirmedStart() {
        val s = HotrailStateStore(MapStore())
        s.setActive("/good"); s.beginTrial("/new", "/good", "2.0.0")
        assertNull(s.guardOnProcessStart())
        assertEquals("/new", s.activePath)
        assertEquals("2.0.0", s.guardOnProcessStart())
        assertEquals("/good", s.activePath); assertFalse(s.hasTrial)
        assertEquals("2.0.0", s.consumeRevert()); assertNull(s.consumeRevert())
    }

    @Test fun confirmClearsTrial() {
        val s = HotrailStateStore(MapStore())
        s.beginTrial("/new", null, "2.0.0"); s.confirm()
        assertNull(s.guardOnProcessStart()); assertNull(s.guardOnProcessStart())
        assertEquals("/new", s.activePath)
    }

    @Test fun keyValueRoundTrip() {
        val s = HotrailStateStore(MapStore())
        s.set("k", "v"); assertEquals("v", s.get("k")); s.remove("k"); assertNull(s.get("k"))
    }
}
