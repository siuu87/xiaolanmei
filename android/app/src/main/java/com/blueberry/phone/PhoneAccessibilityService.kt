package com.blueberry.phone

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityEvent

/**
 * 无障碍服务：手机自动化的执行底座。
 * 自身只做「被动监听 + 暴露静态实例」两件事；真正的点击/输入/读界面逻辑在 AccessibilityAgent 里，
 * 通过 instance 调用执行层 API。
 */
class PhoneAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo =
            AccessibilityServiceInfo().apply {
                eventTypes = AccessibilityEvent.TYPES_ALL_MASK
                feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
                flags =
                    AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 被动监听即可：agent 需要界面时主动读 rootInActiveWindow，不在这里做实时处理。
    }

    override fun onInterrupt() {}

    companion object {
        @Volatile
        var instance: PhoneAccessibilityService? = null
            private set
    }
}
