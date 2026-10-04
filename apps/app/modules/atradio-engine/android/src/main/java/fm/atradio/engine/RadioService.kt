package fm.atradio.engine

import android.app.*
import android.content.*
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.*
import org.json.JSONObject
import java.util.concurrent.Executors

/** Owns the real Rust player, audio focus, foreground notification and session.
 * All transport commands remain native when React Native is backgrounded. */
class RadioService : Service() {
  companion object {
    @Volatile var running = false
    @Volatile var snapshot = JSONObject().put("state", "stopped")
    private const val ID = 73
    private const val CHANNEL = "radio-playback"
  }
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var session: MediaSession
  private lateinit var audio: AudioManager
  private lateinit var focus: AudioFocusRequest
  private lateinit var wake: PowerManager.WakeLock
  private var station: JSONObject? = null
  private var playing = false
  private var buffering = false
  private var resumeOnFocus = false
  private var startedAt = 0L
  private var error: String? = null
  private var nowTitle = ""
  private var destroyed = false
  private val noisy = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) { resumeOnFocus = false; pause() }
  }
  override fun onBind(intent: Intent?) = null
  override fun onCreate() {
    super.onCreate(); running = true
    getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Radio playback", NotificationManager.IMPORTANCE_LOW))
    session = MediaSession(this, "atradio.fm")
    session.setCallback(object : MediaSession.Callback() {
      override fun onPlay() { startLive() }
      override fun onPause() { resumeOnFocus = false; pause() }
      override fun onStop() { shutdown() }
      override fun onSkipToNext() { startLive() }
      override fun onSkipToPrevious() { startLive() }
    })
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      session.setSessionActivity(PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    }
    session.isActive = true
    audio = getSystemService(AudioManager::class.java)
    wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "atradio:stream")
    focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
      .setOnAudioFocusChangeListener({ change ->
        when (change) {
          AudioManager.AUDIOFOCUS_GAIN -> if (resumeOnFocus) { resumeOnFocus = false; startLive() }
          AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> { resumeOnFocus = playing; pause(false) }
          AudioManager.AUDIOFOCUS_LOSS -> { resumeOnFocus = false; pause() }
        }
      }, main).build()
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), RECEIVER_NOT_EXPORTED)
    else registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
    try { NativeEngine.load(this) } catch (e: Throwable) { error = "Playback engine unavailable: ${e.message}" }
    main.post(poll)
  }
  override fun onStartCommand(intent: Intent?, flags: Int, id: Int): Int {
    // Meet Android's foreground-service deadline even when a network stream stalls.
    startForeground(ID, notification())
    when (intent?.action) {
      "playStation" -> {
        val next = runCatching { JSONObject(intent.getStringExtra("station") ?: "") }.getOrNull()
        if (next != null && next.optString("streamUrl").let { it.startsWith("https://") || it.startsWith("http://") }) {
          station = next
          getSharedPreferences("radio", MODE_PRIVATE).edit().putString("station", next.toString()).apply()
          startLive()
        } else { error = "Invalid station URL"; publish() }
      }
      "play", "next", "previous" -> {
        if (station == null) station = getSharedPreferences("radio", MODE_PRIVATE).getString("station", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
        startLive()
      }
      "pause" -> { resumeOnFocus = false; pause() }
      "stop" -> shutdown()
    }
    return START_NOT_STICKY
  }
  private fun send(command: JSONObject) {
    worker.execute {
      val result = runCatching { JSONObject(NativeEngine.command(command.toString())) }
      result.onFailure { main.post { error = it.message ?: "Playback failed"; playing = false; buffering = false; publish() } }
      result.onSuccess { if (!it.optBoolean("ok", true)) main.post { error = it.optString("error"); playing = false; buffering = false; publish() } }
    }
  }
  private fun startLive() {
    val current = station ?: run { shutdown(); return }
    startForeground(ID, notification())
    if (audio.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { error = "Another app is using audio. Try again."; publish(); return }
    error = null; nowTitle = ""; playing = true; buffering = true; startedAt = SystemClock.elapsedRealtime()
    if (!wake.isHeld) wake.acquire()
    send(JSONObject().put("cmd", "open").put("paths", org.json.JSONArray().put(current.getString("streamUrl"))))
    publish()
  }
  private fun pause(abandon: Boolean = true) {
    playing = false; buffering = false
    // Radio resumes at the live edge, rather than replaying a stale buffer.
    send(JSONObject().put("cmd", "stop"))
    if (wake.isHeld) wake.release()
    if (abandon) audio.abandonAudioFocusRequest(focus)
    publish()
    stopForeground(STOP_FOREGROUND_DETACH)
  }
  private fun shutdown() {
    pause(); station = null; error = null; publish()
    stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
  }
  private val poll = object : Runnable {
    override fun run() {
      if (destroyed) return
      worker.execute {
        val status = runCatching { JSONObject(NativeEngine.command("{\"cmd\":\"status\"}")) }.getOrNull()
        main.post {
          if (destroyed) return@post
          if (playing && status != null) {
            buffering = status.optString("state") != "playing"
            nowTitle = status.optString("title")
            if (buffering && SystemClock.elapsedRealtime() - startedAt > 35000) {
              error = "Station did not respond. Try another station or reconnect."; pause()
            }
          }
          publish(); main.postDelayed(this, 1000)
        }
      }
    }
  }
  private fun publish() {
    if (destroyed) return
    val state = if (error != null) "error" else if (buffering) "buffering" else if (playing) "playing" else if (station != null) "paused" else "stopped"
    snapshot = JSONObject().put("state", state).put("station", station ?: JSONObject.NULL).put("title", nowTitle).put("error", error ?: JSONObject.NULL)
    val code = when(state) { "playing" -> PlaybackState.STATE_PLAYING; "buffering" -> PlaybackState.STATE_BUFFERING; "paused" -> PlaybackState.STATE_PAUSED; "error" -> PlaybackState.STATE_ERROR; else -> PlaybackState.STATE_STOPPED }
    session.setPlaybackState(PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP).setState(code, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (playing) 1f else 0f).build())
    session.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, nowTitle.ifBlank { station?.optString("name") ?: "atradio.fm" }).putString(MediaMetadata.METADATA_KEY_ARTIST, station?.optString("name") ?: "Live radio").putLong(MediaMetadata.METADATA_KEY_DURATION, -1).build())
    getSystemService(NotificationManager::class.java).notify(ID, notification())
  }
  private fun actionIntent(action: String) = PendingIntent.getForegroundService(this, action.hashCode(), Intent(this, RadioService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  private fun notification(): Notification {
    val builder = Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(station?.optString("name") ?: "atradio.fm")
      .setContentText(error ?: if (buffering) "Connecting…" else nowTitle.ifBlank { "Live radio" })
      .setCategory(Notification.CATEGORY_TRANSPORT).setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true).setOngoing(playing).setDeleteIntent(actionIntent("stop"))
      .setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1))
      .addAction(Notification.Action.Builder(if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play, if (playing) "Pause" else "Play", actionIntent(if (playing) "pause" else "play")).build())
      .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", actionIntent("stop")).build())
    packageManager.getLaunchIntentForPackage(packageName)?.let { builder.setContentIntent(PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)) }
    return builder.build()
  }
  override fun onDestroy() {
    destroyed = true; running = false; main.removeCallbacksAndMessages(null)
    runCatching { unregisterReceiver(noisy) }; audio.abandonAudioFocusRequest(focus)
    if (wake.isHeld) wake.release()
    worker.execute { runCatching { NativeEngine.command("{\"cmd\":\"stop\"}") } }; worker.shutdown()
    session.release(); snapshot = JSONObject().put("state", "stopped")
    super.onDestroy()
  }
}
