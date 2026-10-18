package com.blueberry.phone

import android.accessibilityservice.GestureDescription
import android.accessibilityservice.GestureResultCallback
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.CompletableFuture
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * 手机操作执行层（确定性工具层，对应 Operit 的「工具调度引擎」）。
 * 模型从不直接碰 UI —— 它只说「tap 设置」「open 微信」，由这里翻译成具体的 Accessibility API 调用。
 * 所有方法运行在无障碍服务实例上。
 */
object AccessibilityAgent {

    private data class CmdResult(val ok: Boolean, val data: Any? = null, val error: String? = null)

    private val mainHandler = Handler(Looper.getMainLooper())

    /** 入口：根据 tool + args 执行，返回结构化结果（交给 PhoneAgentService 序列化上报） */
    fun execute(tool: String, args: Map<String, Any?>): Map<String, Any?> {
        val svc = PhoneAccessibilityService.instance
        if (svc == null) {
            return result(false, error = "ACCESSIBILITY_DISABLED")
        }
        return try {
            val r: CmdResult = when (tool) {
                "ui_tree" -> uiTree(svc)
                "screenshot" -> screenshot(svc)
                "tap" -> tap(svc, args)
                "swipe" -> swipe(svc, args)
                "input" -> input(svc, args)
                "open_app" -> openApp(svc, args)
                "home" -> global(svc, android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME)
                "back" -> global(svc, android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
                "scroll" -> scroll(svc, args)
                else -> CmdResult(false, error = "UNKNOWN_TOOL:$tool")
            }
            result(r.ok, r.data, r.error)
        } catch (e: Exception) {
            result(false, error = e.message ?: e.javaClass.simpleName)
        }
    }

    private fun result(ok: Boolean, data: Any? = null, error: String? = null): Map<String, Any?> =
        mapOf("ok" to ok).also { m ->
            if (data != null) m["data"] = data
            if (error != null) m["error"] = error
        }

    /* ----------------------------- 屏幕几何 ----------------------------- */

    private fun screenSize(svc: PhoneAccessibilityService): Pair<Int, Int> {
        val dm = svc.applicationContext.resources.displayMetrics
        return dm.widthPixels to dm.heightPixels
    }

    private fun ratioToPx(svc: PhoneAccessibilityService, x: Double, y: Double): Pair<Float, Float> {
        val (w, h) = screenSize(svc)
        return (x * w).toFloat() to (y * h).toFloat()
    }

    /* ----------------------------- 手势 ----------------------------- */

    /** 在屏幕像素坐标 (px,py) 处点击 */
    private fun dispatchClick(svc: PhoneAccessibilityService, px: Float, py: Float): Boolean {
        val path = Path().apply { moveTo(px, py); lineTo(px, py) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 50)
        val desc = GestureDescription.Builder().addStroke(stroke).build()
        val future = CompletableFuture<Boolean>()
        val ok = svc.dispatchGesture(
            desc,
            object : GestureResultCallback() {
                override fun onCompleted(gesture: GestureDescription?, completed: Boolean) =
                    future.complete(completed)

                override fun onCancelled(gesture: GestureDescription?) = future.complete(false)
            },
            null,
        )
        if (!ok) return false
        return try {
            future.get(5, TimeUnit.SECONDS)
        } catch (_: TimeoutException) {
            false
        } catch (_: ExecutionException) {
            false
        }
    }

    /** 从 (fx,fy) 滑到 (tx,ty)，坐标为 0~1 比例 */
    private fun dispatchSwipe(
        svc: PhoneAccessibilityService,
        fx: Double, fy: Double, tx: Double, ty: Double,
    ): Boolean {
        val (x1, y1) = ratioToPx(svc, fx, fy)
        val (x2, y2) = ratioToPx(svc, tx, ty)
        val path = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 300)
        val desc = GestureDescription.Builder().addStroke(stroke).build()
        val future = CompletableFuture<Boolean>()
        val ok = svc.dispatchGesture(
            desc,
            object : GestureResultCallback() {
                override fun onCompleted(gesture: GestureDescription?, completed: Boolean) =
                    future.complete(completed)

                override fun onCancelled(gesture: GestureDescription?) = future.complete(false)
            },
            null,
        )
        if (!ok) return false
        return try {
            future.get(5, TimeUnit.SECONDS)
        } catch (_: TimeoutException) {
            false
        } catch (_: ExecutionException) {
            false
        }
    }

    /* ----------------------------- 节点查找 ----------------------------- */

    private fun findNode(
        root: AccessibilityNodeInfo?,
        pred: (AccessibilityNodeInfo) -> Boolean,
        text: String? = null,
    ): AccessibilityNodeInfo? {
        if (root == null) return null
        val queue = ArrayDeque<AccessibilityNodeInfo>()
        queue.add(root)
        var exact: AccessibilityNodeInfo? = null
        var partial: AccessibilityNodeInfo? = null
        while (queue.isNotEmpty()) {
            val n = queue.removeFirst()
            if (pred(n)) {
                if (text != null) {
                    val t = (n.text ?: n.contentDescription)?.toString() ?: ""
                    if (t.equals(text, true)) {
                        exact = n
                        break
                    }
                    if (t.contains(text, true) && partial == null) partial = n
                } else {
                    exact = n
                    break
                }
            }
            for (i in 0 until n.childCount) queue.addLast(n.getChild(i))
        }
        return exact ?: partial
    }

    private fun centerOf(n: AccessibilityNodeInfo): Pair<Float, Float> {
        val r = Rect()
        n.getBoundsInScreen(r)
        return ((r.left + r.right) / 2f) to ((r.top + r.bottom) / 2f)
    }

    /* ----------------------------- 各工具实现 ----------------------------- */

    private fun uiTree(svc: PhoneAccessibilityService): CmdResult {
        val root = svc.rootInActiveWindow ?: return CmdResult(false, error = "NO_ROOT")
        val arr = JSONArray()
        val queue = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
        queue.addLast(root to 0)
        var count = 0
        while (queue.isNotEmpty() && count < 300) {
            val (node, depth) = queue.removeFirst()
            if (depth <= 14) {
                val r = Rect()
                node.getBoundsInScreen(r)
                val text = node.text?.toString() ?: node.contentDescription?.toString() ?: ""
                if (text.isNotBlank() || node.isClickable || node.isEditable) {
                    arr.put(
                        JSONObject().apply {
                            put("text", text)
                            put("cls", node.className?.toString()?.substringAfterLast('.'))
                            put("clickable", node.isClickable)
                            put("editable", node.isEditable)
                            put("bounds", JSONArray().put(r.left).put(r.top).put(r.right).put(r.bottom))
                        },
                    )
                    count++
                }
                for (i in 0 until node.childCount) queue.addLast(node.getChild(i) to depth + 1)
            }
        }
        return CmdResult(true, data = arr.toString())
    }

    private fun screenshot(svc: PhoneAccessibilityService): CmdResult {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return CmdResult(false, error = "SCREENSHOT_NEEDS_API30")
        }
        val future = CompletableFuture<String?>() // 返回 base64
        val executor = mainHandler::post
        svc.takeScreenshot(
            executor,
            object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
                    val buf = screenshot.hardwareBuffer
                    val img = android.graphics.Bitmap.wrapHardwareBuffer(buf, screenshot.colorSpace)
                    buf.close()
                    val stream = java.io.ByteArrayOutputStream()
                    img.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, stream)
                    img.recycle()
                    val b64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                    future.complete(b64)
                }

                override fun onFailure(errorCode: Int) = future.complete(null)
            },
        )
        val b64 = try {
            future.get(8, TimeUnit.SECONDS)
        } catch (_: Exception) {
            null
        }
        return if (b64 != null) CmdResult(true, data = JSONObject().put("base64", b64).toString())
        else CmdResult(false, error = "SCREENSHOT_FAILED")
    }

    private fun tap(svc: PhoneAccessibilityService, args: Map<String, Any?>): CmdResult {
        val text = (args["text"] as? String)?.trim()
        val x = (args["x"] as? Number)?.toDouble()
        val y = (args["y"] as? Number)?.toDouble()

        if (!text.isNullOrBlank()) {
            val root = svc.rootInActiveWindow ?: return CmdResult(false, error = "NO_ROOT")
            val node = findNode(root, { n ->
                val t = (n.text ?: n.contentDescription)?.toString() ?: ""
                t.equals(text, true) || t.contains(text, true)
            }, text) ?: return CmdResult(false, error = "ELEMENT_NOT_FOUND:$text")
            val (cx, cy) = centerOf(node)
            val ok = dispatchClick(svc, cx, cy)
            return CmdResult(ok, data = JSONObject().put("tapped", ok).put("by", "text").toString())
        }
        if (x != null && y != null) {
            val (px, py) = ratioToPx(svc, x, y)
            val ok = dispatchClick(svc, px, py)
            return CmdResult(ok, data = JSONObject().put("tapped", ok).put("by", "coord").toString())
        }
        return CmdResult(false, error = "tap 需要 text 或 x,y")
    }

    private fun swipe(svc: PhoneAccessibilityService, args: Map<String, Any?>): CmdResult {
        val dir = (args["direction"] as? String)?.lowercase()
        val fromX = (args["fromX"] as? Number)?.toDouble()
        val fromY = (args["fromY"] as? Number)?.toDouble()
        val toX = (args["toX"] as? Number)?.toDouble()
        val toY = (args["toY"] as? Number)?.toDouble()
        val (w, h) = screenSize(svc)

        val (fx, fy, tx, ty) = when {
            fromX != null && fromY != null && toX != null && toY != null ->
                listOf(fromX, fromY, toX, toY)
            dir == "up" -> listOf(0.5, 0.7, 0.5, 0.3)
            dir == "down" -> listOf(0.5, 0.3, 0.5, 0.7)
            dir == "left" -> listOf(0.7, 0.5, 0.3, 0.5)
            dir == "right" -> listOf(0.3, 0.5, 0.7, 0.5)
            else -> return CmdResult(false, error = "swipe 需要 direction 或 起止坐标")
        }
        val ok = dispatchSwipe(svc, fx, fy, tx, ty)
        return CmdResult(ok, data = JSONObject().put("swiped", ok).toString())
    }

    private fun input(svc: PhoneAccessibilityService, args: Map<String, Any?>): CmdResult {
        val text = (args["text"] as? String) ?: return CmdResult(false, error = "input 需要 text")
        val root = svc.rootInActiveWindow ?: return CmdResult(false, error = "NO_ROOT")
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: findNode(root, { it.isEditable })
            ?: return CmdResult(false, error = "NO_FOCUSED_EDITABLE")
        val bundle = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        val ok = focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
        return CmdResult(ok, data = JSONObject().put("input", ok).toString())
    }

    private fun openApp(svc: PhoneAccessibilityService, args: Map<String, Any?>): CmdResult {
        val pkg = (args["packageName"] as? String)?.trim()
        val name = (args["appName"] as? String)?.trim()
        val pm = svc.packageManager
        val intent = if (!pkg.isNullOrBlank()) {
            pm.getLaunchIntentForPackage(pkg)
        } else if (!name.isNullOrBlank()) {
            pm.getInstalledApplications(0)
                .firstOrNull { app -> pm.getApplicationLabel(app).toString().contains(name, true) }
                ?.let { pm.getLaunchIntentForPackage(it.packageName) }
                ?: return CmdResult(false, error = "APP_NOT_FOUND:$name")
        } else {
            return CmdResult(false, error = "open_app 需要 packageName 或 appName")
        }
        intent?.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
            svc.startActivity(intent)
            CmdResult(true, data = JSONObject().put("opened", true).toString())
        } catch (e: Exception) {
            CmdResult(false, error = e.message)
        }
    }

    private fun scroll(svc: PhoneAccessibilityService, args: Map<String, Any?>): CmdResult {
        val dir = ((args["direction"] as? String) ?: "down").lowercase()
        val action =
            if (dir == "up") AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            else AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
        val root = svc.rootInActiveWindow ?: return CmdResult(false, error = "NO_ROOT")
        val scrollable = findNode(root, { it.isScrollable })
        return if (scrollable != null) {
            val ok = scrollable.performAction(action)
            CmdResult(ok, data = JSONObject().put("scrolled", ok).put("direction", dir).toString())
        } else {
            // 退化：用滑动手势滚一屏
            val (fx, fy, tx, ty) = if (dir == "up") listOf(0.5, 0.7, 0.5, 0.3) else listOf(0.5, 0.3, 0.5, 0.7)
            val ok = dispatchSwipe(svc, fx.toDouble(), fy.toDouble(), tx.toDouble(), ty.toDouble())
            CmdResult(ok, data = JSONObject().put("scrolled", ok).put("by", "gesture").toString())
        }
    }

    private fun global(svc: PhoneAccessibilityService, action: Int): CmdResult {
        val ok = svc.performGlobalAction(action)
        return CmdResult(ok, data = JSONObject().put("action", ok).toString())
    }
}
