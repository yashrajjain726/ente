package io.ente.ensu.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.ente.ensu.designsystem.EnsuSpacing
import io.ente.ensu.designsystem.HugeIcons

object EnsuLegalDocuments {
    const val PRIVACY_TITLE = "Privacy Policy"
    const val PRIVACY_URL = "https://ente.com/privacy/"
    const val ENTE_TERMS_TITLE = "Ente Terms and Conditions"
    const val ENTE_TERMS_URL = "https://ente.com/terms/"
}

@Composable
fun TermsAndConditionsScreen() {
    val uriHandler = LocalUriHandler.current

    LazyColumn(
        modifier = Modifier.padding(horizontal = EnsuSpacing.pageHorizontal.dp),
        contentPadding = PaddingValues(vertical = EnsuSpacing.lg.dp),
        verticalArrangement = Arrangement.spacedBy(EnsuSpacing.sm.dp)
    ) {
        item(key = "privacy") {
            SettingsRow(
                SettingsItem(
                    title = EnsuLegalDocuments.PRIVACY_TITLE,
                    iconRes = HugeIcons.ViewIcon,
                    onClick = { uriHandler.openUri(EnsuLegalDocuments.PRIVACY_URL) }
                )
            )
        }
        item(key = "ente-terms") {
            SettingsRow(
                SettingsItem(
                    title = EnsuLegalDocuments.ENTE_TERMS_TITLE,
                    iconVector = Icons.Outlined.Description,
                    onClick = { uriHandler.openUri(EnsuLegalDocuments.ENTE_TERMS_URL) }
                )
            )
        }
    }
}
