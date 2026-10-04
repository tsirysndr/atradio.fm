package fm.atradio.engine

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

object NativeEngine {
  @Volatile private var loaded = false
  @Synchronized fun load(context: Context) {
    if (loaded) return
    System.loadLibrary("atradio_engine")
    nativeInit(context.applicationContext)
    loaded = true
  }
  @JvmStatic external fun nativeInit(context: Context)
  @JvmStatic external fun command(json: String): String
}

class AtradioEngineModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext).applicationContext
  override fun definition() = ModuleDefinition {
    Name("AtradioEngine")
    AsyncFunction("play") { json: String ->
      val c = context()
      val intent = Intent(c, RadioService::class.java).setAction("playStation").putExtra("station", json)
      ContextCompat.startForegroundService(c, intent)
    }
    AsyncFunction("control") { action: String ->
      require(action in listOf("play", "pause", "stop", "next", "previous"))
      val c = context()
      if (RadioService.running || action == "play") {
        ContextCompat.startForegroundService(c, Intent(c, RadioService::class.java).setAction(action))
      }
    }
    AsyncFunction("status") { RadioService.snapshot.toString() }
    AsyncFunction("auth") { command: String, handle: String ->
      require(command in listOf("authStart", "authStatus", "authRestore", "authCancel", "authLogout"))
      val c = context()
      NativeEngine.load(c)
      val dir = java.io.File(c.noBackupFilesDir, "atproto").apply { mkdirs() }
      NativeEngine.command(JSONObject().put("cmd", command).put("path", dir.absolutePath).put("handle", handle).toString())
    }
  }
}
