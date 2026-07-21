package io.ente.ensu.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import io.ente.ensu.designsystem.EnsuColor
import io.ente.ensu.designsystem.EnsuCornerRadius
import io.ente.ensu.designsystem.EnsuSpacing
import io.ente.ensu.designsystem.EnsuTypography
import io.ente.ensu.knowledge.KnowledgePackState
import io.ente.ensu.knowledge.KnowledgePackStatus
import io.ente.ensu.knowledge.KnowledgeState

@Composable
fun KnowledgeSettingsScreen(
    state: KnowledgeState,
    packDownloadsAllowed: Boolean,
    onDownloadOrUpdate: (String) -> Unit,
    onCancel: (String) -> Unit,
    onSetEnabled: (String, Boolean) -> Unit
) {
    val uriHandler = LocalUriHandler.current
    LazyColumn(
        modifier = Modifier.padding(horizontal = EnsuSpacing.pageHorizontal.dp),
        verticalArrangement = Arrangement.spacedBy(EnsuSpacing.md.dp)
    ) {
        item {
            Text(
                text = "Download public knowledge packs for private, on-device answers. Queries never leave this device.",
                style = EnsuTypography.body,
                color = EnsuColor.textMuted()
            )
        }
        items(state.packs.values.toList(), key = { it.config.stableId }) { pack ->
            KnowledgePackCard(
                pack = pack,
                packDownloadsAllowed = packDownloadsAllowed,
                onDownloadOrUpdate = { onDownloadOrUpdate(pack.config.stableId) },
                onCancel = { onCancel(pack.config.stableId) },
                onSetEnabled = { enabled -> onSetEnabled(pack.config.stableId, enabled) },
                onOpenUrl = uriHandler::openUri
            )
        }
        item {
            Text(
                text = "Wikimedia and Ensu are not affiliated. Wikimedia project names identify the source material only.",
                style = EnsuTypography.small,
                color = EnsuColor.textMuted(),
                modifier = Modifier.padding(vertical = EnsuSpacing.md.dp)
            )
        }
    }
}

@Composable
private fun KnowledgePackCard(
    pack: KnowledgePackState,
    packDownloadsAllowed: Boolean,
    onDownloadOrUpdate: () -> Unit,
    onCancel: () -> Unit,
    onSetEnabled: (Boolean) -> Unit,
    onOpenUrl: (String) -> Unit
) {
    val attribution = pack.config.attribution
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                EnsuColor.fillFaint(),
                RoundedCornerShape(EnsuCornerRadius.card.dp)
            )
            .padding(EnsuSpacing.lg.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(pack.config.label, style = EnsuTypography.large, color = EnsuColor.textPrimary())
                Text(
                    text = pack.status.label,
                    style = EnsuTypography.small,
                    color = EnsuColor.textMuted()
                )
                pack.activeIdentity?.let { identity ->
                    Text(
                        text = "Installed revision: $identity",
                        style = EnsuTypography.small,
                        color = EnsuColor.textMuted()
                    )
                }
            }
            if (pack.activeIdentity != null && !pack.isMutating) {
                Switch(checked = pack.enabled, onCheckedChange = onSetEnabled)
            }
        }

        if (pack.isMutating) {
            Spacer(Modifier.height(EnsuSpacing.md.dp))
            LinearProgressIndicator(
                progress = { (pack.progressPercent ?: 0).coerceIn(0, 100) / 100f },
                modifier = Modifier.fillMaxWidth(),
                color = EnsuColor.accent(),
                trackColor = EnsuColor.border()
            )
            Text(
                pack.progressLabel ?: "Downloading...",
                style = EnsuTypography.small,
                color = EnsuColor.textMuted()
            )
            TextButton(onClick = onCancel) { Text("Cancel") }
        } else if (
            packDownloadsAllowed &&
            (pack.status == KnowledgePackStatus.Download ||
                pack.status == KnowledgePackStatus.UpdateAvailable)
        ) {
            Spacer(Modifier.height(EnsuSpacing.md.dp))
            Button(
                onClick = onDownloadOrUpdate,
                colors = ButtonDefaults.buttonColors(containerColor = EnsuColor.accent())
            ) {
                Text(if (pack.status == KnowledgePackStatus.Download) "Download" else "Update")
            }
        }

        pack.errorMessage?.let {
            Text(it, style = EnsuTypography.small, color = EnsuColor.error)
        }
        Spacer(Modifier.height(EnsuSpacing.md.dp))
        Text(attribution.credit, style = EnsuTypography.small, color = EnsuColor.textPrimary())
        Text(attribution.buildProvenance, style = EnsuTypography.small, color = EnsuColor.textMuted())
        Text(attribution.modificationNotice, style = EnsuTypography.small, color = EnsuColor.textMuted())
        ActionText(attribution.licenseLabel) { onOpenUrl(attribution.licenseUrl) }
        ActionText("Public pack") { onOpenUrl(attribution.publicPackUrl) }
    }
}

private val KnowledgePackStatus.label: String
    get() = when (this) {
        KnowledgePackStatus.Checking -> "Checking..."
        KnowledgePackStatus.Download -> "Not downloaded"
        KnowledgePackStatus.Ready -> "Ready"
        KnowledgePackStatus.UpdateAvailable -> "Ready · update available"
    }

@Composable
private fun ActionText(label: String, onClick: () -> Unit) {
    Text(
        text = label,
        style = EnsuTypography.small,
        color = EnsuColor.accent(),
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(vertical = EnsuSpacing.xs.dp)
    )
}
