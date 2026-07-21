package io.ente.ensu.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import io.ente.ensu.designsystem.EnsuSpacing
import io.ente.ensu.designsystem.HugeIcons

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
                    title = "Privacy Policy",
                    iconRes = HugeIcons.ViewIcon,
                    onClick = { uriHandler.openUri("https://ente.com/privacy/") }
                )
            )
        }
        item(key = "ente-terms") {
            SettingsRow(
                SettingsItem(
                    title = "Ente Terms and Conditions",
                    iconVector = Icons.Outlined.Description,
                    onClick = { uriHandler.openUri("https://ente.com/terms/") }
                )
            )
        }
    }
}
