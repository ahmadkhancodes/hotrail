// Hotrail by BufferSol, MIT. NOTE: written but NOT compiled or run in the authoring environment (no Android SDK). CI (plugin-ci.yml) is the first compile.
package com.buffersol.hotrail

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

@CapacitorPlugin(name = "HotrailUpdater")
class HotrailUpdaterPlugin : Plugin() {
    private val io = Executors.newCachedThreadPool()
    private lateinit var prefs: SharedPreferences
    private lateinit var store: HotrailStateStore
    private val bundlesRoot: File get() = File(context.filesDir, "hotrail/bundles")

    private class PrefsKv(val p: SharedPreferences) : KeyValueStore {
        override fun getString(key: String) = p.getString(key, null)
        override fun putString(key: String, value: String?) { p.edit().apply { if (value == null) remove(key) else putString(key, value) }.commit() }
    }

    override fun load() {
        prefs = context.getSharedPreferences("hotrail_updater", Context.MODE_PRIVATE)
        store = HotrailStateStore(PrefsKv(prefs))
        store.guardOnProcessStart() // may restore the previous bundle before the web view uses it
        val p = store.activePath
        if (p != null) {
            if (File(p).isDirectory) bridge.setServerBasePath(p) else { store.setActive(null); store.confirm() }
        }
    }

    /** Paths from JS must stay under the bundles root. */
    private fun safe(p: String?): File? {
        if (p == null) return null
        val f = File(p).canonicalFile; val root = bundlesRoot.canonicalFile
        return if (f.path == root.path || f.path.startsWith(root.path + File.separator)) f else null
    }

    @PluginMethod fun getDeviceInfo(call: PluginCall) {
        var id = prefs.getString("deviceId", null)
        if (id == null) { id = UUID.randomUUID().toString(); prefs.edit().putString("deviceId", id).apply() }
        bundlesRoot.mkdirs()
        val emu = Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("Emulator") || Build.PRODUCT.contains("sdk")
        val info = context.packageManager.getPackageInfo(context.packageName, 0)
        call.resolve(JSObject().apply {
            put("deviceId", id); put("platform", "android")
            put("versionBuild", if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else @Suppress("DEPRECATION") info.versionCode.toString())
            put("versionOs", Build.VERSION.RELEASE); put("isEmulator", emu)
            put("isProd", (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0)
            put("pluginVersion", "0.1.0"); put("bundlesRoot", bundlesRoot.path); put("builtinDir", JSObject.NULL)
        })
    }

    @PluginMethod fun download(call: PluginCall) {
        val url = call.getString("url"); val dest = safe(call.getString("dest"))
        if (url == null || dest == null || !(url.startsWith("https://") || url.startsWith("http://"))) return call.reject("invalid args")
        io.execute { try { HotrailFiles.download(url, dest); call.resolve() } catch (e: Exception) { call.reject("download failed: ${e.message}") } }
    }

    @PluginMethod fun unzip(call: PluginCall) {
        val s = safe(call.getString("src")); val d = safe(call.getString("dest"))
        if (s == null || d == null) return call.reject("invalid args")
        io.execute { try { HotrailFiles.unzip(s, d); call.resolve() } catch (e: Exception) { call.reject("unzip failed: ${e.message}") } }
    }

    @PluginMethod fun hashFile(call: PluginCall) {
        val p = call.getString("path") ?: return call.reject("invalid args")
        io.execute { call.resolve(JSObject().apply { put("sha256", sha256Hex(File(p)) ?: JSObject.NULL) }) }
    }

    @PluginMethod fun copyFile(call: PluginCall) {
        val s = call.getString("src"); val d = safe(call.getString("dest"))
        if (s == null || d == null) return call.reject("invalid args")
        io.execute { try { HotrailFiles.copy(File(s), d); call.resolve() } catch (e: Exception) { call.reject("copy failed: ${e.message}") } }
    }

    @PluginMethod fun removePath(call: PluginCall) {
        val p = safe(call.getString("path")) ?: return call.reject("invalid args")
        io.execute { p.deleteRecursively(); call.resolve() }
    }

    @PluginMethod fun setBundle(call: PluginCall) {
        val path = call.getString("path")
        if (path != null && safe(path) == null) return call.reject("invalid path")
        val version = call.getString("version")
        if ((call.getBoolean("trial") ?: false) && path != null && version != null) store.beginTrial(path, call.getString("previous"), version)
        else { store.setActive(path); store.confirm() }
        if (path != null) bridge.setServerBasePath(path) else bridge.setServerAssetPath("public")
        call.resolve()
    }

    @PluginMethod fun reload(call: PluginCall) {
        bridge.executeOnMainThread { bridge.webView.reload(); call.resolve() }
    }

    @PluginMethod fun confirmBundle(call: PluginCall) { store.confirm(); call.resolve() }
    @PluginMethod fun consumeNativeRevert(call: PluginCall) { call.resolve(JSObject().apply { put("version", store.consumeRevert() ?: JSObject.NULL) }) }
    @PluginMethod fun storageGet(call: PluginCall) { call.resolve(JSObject().apply { put("value", store.get(call.getString("key") ?: "") ?: JSObject.NULL) }) }
    @PluginMethod fun storageSet(call: PluginCall) { store.set(call.getString("key") ?: "", call.getString("value") ?: ""); call.resolve() }
    @PluginMethod fun storageRemove(call: PluginCall) { store.remove(call.getString("key") ?: ""); call.resolve() }
}
