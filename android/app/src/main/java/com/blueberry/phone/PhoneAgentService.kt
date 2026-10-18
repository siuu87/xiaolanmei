package com.blueberry.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 前台服务：原生端与后端的桥。
 * 1) 通过 SSE 长连接收后端下发的指令（command 事件）；
 * 2) 交给 AccessibilityAgent 在真机上执行；
 * 3) 把结果（含截图 URL）按 reqId 回报给后端。
 * 断线自动重连（指数退避封顶 15s）。
 */
class PhoneAgentService : Service() {

    private val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    private val executor = Executors.newSingleThreadExecutor() // 指令串行，避免手势并发
    private var eventSource: EventSource? = null
    private val clientId = "android-${UUID.randomUUID()}"
    private var reconnectDelayMs = 1_000L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIFY_ID, buildNotification("手机代理已启动，等待指令…"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        connect()
        return START_STICKY
    }

    override fun onDestroy() {
        eventSource?.cancel()
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun connect() {
        val req = Request.Builder().url(Config.streamUrl(clientId)).build()
        eventSource = EventSources.createFactory(client).newEventSource(
            req,
            object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: okhttp3.Response) {
                    reconnectDelayMs = 1_000L
                    updateNotification("已连接后端，待命中")
                    Log.i(TAG, "SSE opened: $clientId")
                }

                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String,
                ) {
                    if (type == "command" || type == null) {
                        handleCommand(data)
                    }
                }

                override fun onFailure(eventSource: EventSource, t: Throwable?, response: okhttp3.Response?) {
                    Log.w(TAG, "SSE failure: ${t?.message}")
                    updateNotification("连接断开，${reconnectDelayMs / 1000}s 后重连…")
                    scheduleReconnect()
                }

                override fun onClosed(eventSource: EventSource) {
                    Log.i(TAG, "SSE closed")
                    scheduleReconnect()
                }
            },
        )
    }

    private fun scheduleReconnect() {
        val delay = reconnectDelayMs
        reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(15_000L)
        executor.submit {
            Thread.sleep(delay)
            connect()
        }
    }

    private fun handleCommand(raw: String) {
        executor.submit {
            try {
                val obj = JSONObject(raw)
                val reqId = obj.optString("reqId", "")
                val tool = obj.optString("tool", "")
                val args = obj.optJSONObject("args")?.let { toMap(it) } ?: emptyMap<String, Any?>()
                Log.i(TAG, "exec $tool args=$args")

                val result = AccessibilityAgent.execute(tool, args).toMutableMap()

                // 截图：先上传 base64 到后端，拿回可访问 URL，再回报
                if (tool == "screenshot" && result["ok"] == true) {
                    val data = result["data"] as? String
                    val b64 = data?.let { JSONObject(it).optString("base64") }
                    if (!b64.isNullOrBlank()) {
                        val url = uploadScreenshot(b64)
                        if (url != null) {
                            result["data"] = JSONObject().put("url", url).toString()
                        }
                    }
                }

                postResult(reqId, result)
            } catch (e: Exception) {
                Log.e(TAG, "handleCommand error", e)
            }
        }
    }

    private fun postResult(reqId: String, result: Map<String, Any?>) {
        val body = JSONObject().apply {
            put("reqId", reqId)
            put("ok", result["ok"] == true)
            result["data"]?.let { put("data", it) }
            (result["error"] as? String)?.let { put("error", it) }
        }
        val req = Request.Builder()
            .url(Config.RESULT_URL)
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        try {
            client.newCall(req).execute().close()
        } catch (e: Exception) {
            Log.w(TAG, "postResult failed: ${e.message}")
        }
    }

    private fun uploadScreenshot(b64: String): String? {
        val body = JSONObject().put("image", b64).toString()
        val req = Request.Builder()
            .url(Config.SCREENSHOT_URL)
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) JSONObject(resp.body?.string() ?: "{}").optString("url", null) else null
            }
        } catch (e: Exception) {
            Log.w(TAG, "uploadScreenshot failed: ${e.message}")
            null
        }
    }

    private fun toMap(j: JSONObject): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        j.keys().forEach { k -> map[k] = j.opt(k) }
        return map
    }

    private fun buildNotification(text: String): Notification {
        val channelId = "phone_agent"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(channelId, "手机代理", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
        val intent = Intent(this, MainActivity::class.java)
        val pi = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, channelId)
            .setContentTitle("小蓝莓 · 手机代理")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_phone_agent)
            .setContentIntent(pi)
            .build()
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFY_ID, buildNotification(text))
    }

    companion object {
        private const val TAG = "PhoneAgentService"
        private const val NOTIFY_ID = 1001
    }
}
