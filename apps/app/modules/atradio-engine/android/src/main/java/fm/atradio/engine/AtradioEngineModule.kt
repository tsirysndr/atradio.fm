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
    context.getSharedPreferences("audio-settings", Context.MODE_PRIVATE).getString("equalizer", null)?.let {
      command(JSONObject().put("cmd", "setAudioSettings").put("settings", JSONObject().put("equalizer", JSONObject(it))).toString())
    }
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
    AsyncFunction("getEqualizer") {
      context().getSharedPreferences("audio-settings", Context.MODE_PRIVATE).getString("equalizer", "null") ?: "null"
    }
    AsyncFunction("setEqualizer") { json: String ->
      val c = context()
      val eq = JSONObject(json)
      val bands = eq.getJSONArray("bands")
      require(bands.length() == 10)
      eq.put("precut", eq.optInt("precut").coerceIn(-240, 0))
      for (i in 0 until bands.length()) {
        val band = bands.getJSONObject(i)
        band.put("gain", band.getInt("gain").coerceIn(-240, 240))
        band.put("frequency", band.getInt("frequency").coerceIn(20, 22000))
        band.put("q", 10)
      }
      NativeEngine.load(c)
      val result = JSONObject(NativeEngine.command(JSONObject().put("cmd", "setAudioSettings").put("settings", JSONObject().put("equalizer", eq)).toString()))
      check(result.optBoolean("ok")) { result.optString("error", "Could not apply equalizer") }
      c.getSharedPreferences("audio-settings", Context.MODE_PRIVATE).edit().putString("equalizer", eq.toString()).apply()
    }
    AsyncFunction("status") { RadioService.snapshot.toString() }
  }
}
