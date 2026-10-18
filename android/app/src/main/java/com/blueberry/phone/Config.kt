package com.blueberry.phone

/**
 * 后端地址配置。
 *
 * - 模拟器里访问宿主机用 10.0.2.2；
 * - 真机连同一 Wi-Fi 时填电脑的局域网 IP，例如 http://192.168.0.200:3001。
 * 正式发布应改为可配置（设置页 / BuildConfig），此处先给默认值。
 */
object Config {
    const val BACKEND_BASE_URL = "http://10.0.2.2:3001"

    // 原生端连接后端的 SSE 长连接（后端把指令作为 command 事件推下来）
    fun streamUrl(clientId: String): String =
        "$BACKEND_BASE_URL/api/phone-control/stream?clientId=$clientId"

    // 原生端执行完把结果按 reqId 回报
    const val RESULT_URL = "$BACKEND_BASE_URL/api/phone-control/result"

    // 截图二进制（base64）回传后端的落盘地址，返回可访问 URL
    const val SCREENSHOT_URL = "$BACKEND_BASE_URL/api/phone-control/screenshot"
}
