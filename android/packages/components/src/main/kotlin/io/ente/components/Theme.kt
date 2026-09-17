package io.ente.components

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.ente.fonts.EnteFontFamily

public enum class EnteApp {
    Photos,
    Auth,
    Locker,
}

@Immutable
public class Palette
internal constructor(
    public val primary: Color,
    public val primaryDarker: Color,
    public val text: Color,
    public val disabledText: Color,
    public val reverseText: Color,
    public val fill: Color,
    public val fillDarkest: Color,
    public val danger: Color,
    public val dangerDarker: Color,
)

public val LocalEntePalette: ProvidableCompositionLocal<Palette> = staticCompositionLocalOf {
    palette(EnteApp.Photos, dark = false)
}

public object EnteSpacing {
    public val xl: Dp = 20.dp
}

public object EnteRadius {
    public val button: Dp = 20.dp
}

public object EnteMotion {
    public const val quick: Int = 120
}

public object EnteTypography {
    public val display: TextStyle =
        TextStyle(
            fontFamily = EnteFontFamily.outfit,
            fontSize = 24.sp,
            fontWeight = FontWeight.SemiBold,
            lineHeight = 32.sp,
        )
    public val body: TextStyle =
        TextStyle(
            fontFamily = EnteFontFamily.inter,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            lineHeight = 20.sp,
        )
    public val bodyBold: TextStyle = body.copy(fontWeight = FontWeight.SemiBold)
}

@Composable
public fun EnteTheme(
    app: EnteApp = EnteApp.Photos,
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalEntePalette provides palette(app, darkTheme), content = content)
}

private fun palette(app: EnteApp, dark: Boolean): Palette {
    val (primary, primaryDarker) =
        when (app) {
            EnteApp.Photos -> Color(0xFF08C225) to Color(0xFF057C18)
            EnteApp.Auth -> Color(0xFF9610D6) to Color(0xFF5D0884)
            EnteApp.Locker -> Color(0xFF1071FF) to Color(0xFF0B4CAD)
        }
    return Palette(
        primary = primary,
        primaryDarker = primaryDarker,
        text = if (dark) Color.White else Color.Black,
        disabledText = Color(if (dark) 0xFF414141 else 0xFFD6D6D6),
        reverseText = if (dark) Color.Black else Color.White,
        fill = Color(if (dark) 0xFF0A0A0A else 0xFFEAEAEA),
        fillDarkest = Color(if (dark) 0xFF292929 else 0xFFD2D2D2),
        danger = Color(0xFFF63A3A),
        dangerDarker = Color(0xFFC52E2E),
    )
}
