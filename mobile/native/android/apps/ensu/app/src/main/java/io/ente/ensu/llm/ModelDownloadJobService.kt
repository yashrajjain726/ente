package io.ente.ensu.llm

import android.app.Notification
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.SystemClock
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ModelDownloadJobService : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        synchronized(lock) {
            if (!downloadActive) return false
            runningJob = this
            runningParams = params
        }
        setNotification(
            params,
            NOTIFICATION_ID,
            buildNotification(this, 0, true),
            JOB_END_NOTIFICATION_POLICY_REMOVE
        )
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        val cancel: (() -> Unit)?
        synchronized(lock) {
            if (runningParams !== params) return false
            runningJob = null
            runningParams = null
            cancel = onCancel
        }
        cancel?.invoke()
        return false
    }

    companion object {
        private const val CHANNEL_ID = "model-download"
        private const val NOTIFICATION_ID = 1
        private const val JOB_ID = 1
        private const val NOTIFY_INTERVAL_MS = 1000L

        private val lock = Any()
        private var onCancel: (() -> Unit)? = null
        private var downloadActive = false
        private var lastNotifyMs = 0L
        private var runningJob: ModelDownloadJobService? = null
        private var runningParams: JobParameters? = null

        fun begin(context: Context, onCancelled: () -> Unit) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
            synchronized(lock) {
                onCancel = onCancelled
                downloadActive = true
                lastNotifyMs = 0L
            }
            val scheduler = context.getSystemService(JobScheduler::class.java) ?: return
            val job = JobInfo.Builder(JOB_ID, ComponentName(context, ModelDownloadJobService::class.java))
                .setUserInitiated(true)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build()
            runCatching { scheduler.schedule(job) }
        }

        fun update(context: Context, downloadedBytes: Long, totalBytes: Long?) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
            val job: ModelDownloadJobService
            val params: JobParameters
            synchronized(lock) {
                if (!downloadActive) return
                job = runningJob ?: return
                params = runningParams ?: return
                val now = SystemClock.elapsedRealtime()
                if (now - lastNotifyMs < NOTIFY_INTERVAL_MS) return
                lastNotifyMs = now
            }
            val percent = totalBytes?.takeIf { it > 0 }
                ?.let { ((downloadedBytes * 100) / it).toInt().coerceIn(0, 100) }
            job.setNotification(
                params,
                NOTIFICATION_ID,
                buildNotification(context, percent ?: 0, percent == null),
                JOB_END_NOTIFICATION_POLICY_REMOVE
            )
        }

        fun end(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
            val job: ModelDownloadJobService?
            val params: JobParameters?
            synchronized(lock) {
                downloadActive = false
                onCancel = null
                job = runningJob
                params = runningParams
                runningJob = null
                runningParams = null
            }
            if (job != null && params != null) {
                job.jobFinished(params, false)
            } else {
                context.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
            }
        }

        private fun buildNotification(
            context: Context,
            percent: Int,
            indeterminate: Boolean
        ): Notification {
            NotificationManagerCompat.from(context).createNotificationChannel(
                NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
                    .setName("Model downloads")
                    .build()
            )
            return NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("Downloading model")
                .setProgress(100, percent, indeterminate)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build()
        }
    }
}
