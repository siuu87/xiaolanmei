package com.blueberry.phone

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.blueberry.phone.databinding.ActivityMainBinding

/**
 * 宿主 Activity：用 WebView 承载小蓝莓 Web 应用（同一套聊天/酒馆/工具界面），
 * 并提供「启动手机代理」入口。真正的手机操作由 PhoneAgentService（无障碍）在后台执行。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView(binding.webview)
        binding.webview.loadUrl(Config.BACKEND_BASE_URL + "/")

        binding.btnStart.setOnClickListener { onStartAgent() }
        refreshHint()
    }

    private fun setupWebView(wv: WebView) {
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean {
                return false // 站内链接都在 WebView 内打开
            }
        }
    }

    private fun onStartAgent() {
        if (!isAccessibilityEnabled()) {
            binding.tvHint.text = "请先在「无障碍」设置里开启「小蓝莓手机代理」，再点启动。"
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            return
        }
        startForegroundService(Intent(this, PhoneAgentService::class.java))
        binding.tvHint.text = "代理已启动（通知栏可见）。现在可以在小蓝莓里说「帮我打开微信」「截个图」了。"
    }

    private fun refreshHint() {
        binding.tvHint.text = if (isAccessibilityEnabled()) {
            "无障碍已开启。点「启动手机代理」后即可用语音/文字指挥小蓝莓操作手机。"
        } else {
            "尚未开启无障碍。点「启动手机代理」会引导你去开启。"
        }
    }

    private fun isAccessibilityEnabled(): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        return enabled?.contains("PhoneAccessibilityService", ignoreCase = true) == true
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (binding.webview.canGoBack()) binding.webview.goBack()
        else super.onBackPressed()
    }
}
