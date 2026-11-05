// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Android SDK). CI (plugin-ci.yml) is the first compile.
package com.buffersol.hotrail

import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/** Resolves `entry` under `root`; throws if it would escape (zip-slip). */
fun safeResolve(root: File, entry: String): File {
    if (entry.startsWith("/") || entry.startsWith("\\") || entry.contains('\u0000')) throw IOException("unsafe path: $entry")
    val parts = entry.replace('\\', '/').split('/').filter { it.isNotEmpty() }
    if (parts.any { it == ".." }) throw IOException("unsafe path: $entry")
    val rootCanon = root.canonicalFile
    val out = File(rootCanon, parts.joinToString("/")).canonicalFile
    if (out.path != rootCanon.path && !out.path.startsWith(rootCanon.path + File.separator)) throw IOException("unsafe path: $entry")
    return out
}

fun sha256Hex(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

fun sha256Hex(file: File): String? {
    if (!file.isFile) return null
    val md = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { ins ->
        val buf = ByteArray(1 shl 16)
        while (true) { val n = ins.read(buf); if (n < 0) break; md.update(buf, 0, n) }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
}

/** Key value store abstraction so the guard logic is unit testable without Android. */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String?)
}

class MapStore : KeyValueStore {
    private val m = HashMap<String, String>()
    override fun getString(key: String) = m[key]
    override fun putString(key: String, value: String?) { if (value == null) m.remove(key) else m[key] = value }
}

/** Persistent bundle and crash guard state. Backed by SharedPreferences in the plugin. Mirrors the iOS store. */
class HotrailStateStore(private val kv: KeyValueStore) {
    val activePath: String? get() = kv.getString("active")
    private val trialPath get() = kv.getString("trial.path")
    val trialVersion: String? get() = kv.getString("trial.version")
    val hasTrial: Boolean get() = trialPath != null

    fun setActive(path: String?) = kv.putString("active", path)

    fun beginTrial(path: String, previous: String?, version: String) {
        setActive(path)
        kv.putString("trial.path", path); kv.putString("trial.previous", previous)
        kv.putString("trial.version", version); kv.putString("trial.loaded", "0")
    }

    private fun clearTrial() { for (k in listOf("trial.path", "trial.previous", "trial.version", "trial.loaded")) kv.putString(k, null) }

    fun confirm() = clearTrial()

    /** Once per process start. Returns the version that was reverted, if the trial had already had its launch. */
    fun guardOnProcessStart(): String? {
        if (!hasTrial) return null
        if (kv.getString("trial.loaded") == "1") {
            val v = trialVersion
            setActive(kv.getString("trial.previous")); clearTrial()
            kv.putString("reverted", v)
            return v
        }
        kv.putString("trial.loaded", "1")
        return null
    }

    fun consumeRevert(): String? { val v = kv.getString("reverted"); kv.putString("reverted", null); return v }
    fun get(k: String) = kv.getString("kv.$k")
    fun set(k: String, v: String) = kv.putString("kv.$k", v)
    fun remove(k: String) = kv.putString("kv.$k", null)
}

object HotrailFiles {
    fun download(url: String, dest: File) {
        dest.parentFile?.mkdirs()
        val staged = File(dest.path + ".hotrail-tmp")
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15000; c.readTimeout = 30000
            if (c.responseCode !in 200..299) throw IOException("http ${c.responseCode}")
            c.inputStream.use { i -> FileOutputStream(staged).use { o -> i.copyTo(o) } }
        } finally { c.disconnect() }
        moveAtomic(staged, dest)
    }

    fun moveAtomic(src: File, dest: File) {
        if (dest.exists()) dest.deleteRecursively()
        if (!src.renameTo(dest)) { src.copyRecursively(dest, true); src.deleteRecursively() }
    }

    fun copy(src: File, dest: File) {
        dest.parentFile?.mkdirs()
        val staged = File(dest.path + ".hotrail-tmp")
        src.copyTo(staged, true)
        moveAtomic(staged, dest)
    }

    /** Extract into a sibling staging dir, then move into place. Zip-slip and size caps enforced. */
    fun unzip(zip: File, dest: File, maxTotalBytes: Long = 512L shl 20, maxEntries: Int = 20000) {
        val staging = File(dest.parentFile, ".${dest.name}.extract")
        staging.deleteRecursively(); staging.mkdirs()
        try {
            var total = 0L; var entries = 0
            ZipInputStream(FileInputStream(zip)).use { zis ->
                while (true) {
                    val e = zis.nextEntry ?: break
                    if (++entries > maxEntries) throw IOException("too many entries")
                    val target = safeResolve(staging, e.name)
                    if (e.isDirectory) { target.mkdirs(); continue }
                    target.parentFile?.mkdirs()
                    FileOutputStream(target).use { o ->
                        val buf = ByteArray(1 shl 16)
                        while (true) {
                            val n = zis.read(buf); if (n < 0) break
                            total += n; if (total > maxTotalBytes) throw IOException("too large")
                            o.write(buf, 0, n)
                        }
                    }
                }
            }
            moveAtomic(staging, dest)
        } catch (t: Throwable) { staging.deleteRecursively(); throw t }
    }
}
