package io.ente.photos

import android.content.Intent

class MainActivity : ForegroundHeartbeatActivity() {
    override fun onNewIntent(intent: Intent) {
        setIntent(intent)
        super.onNewIntent(intent)
    }
}
