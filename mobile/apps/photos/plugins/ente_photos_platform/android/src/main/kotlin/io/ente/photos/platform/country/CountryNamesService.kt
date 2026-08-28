package io.ente.photos.platform.country

import java.util.Locale

data class CountryNames(
    val region: String?,
    val names: Map<String, String>,
)

class CountryNamesService {
    fun names(localeTag: String): CountryNames {
        val displayLocale = Locale.forLanguageTag(localeTag)
        return CountryNames(
            Locale.getDefault().country.ifEmpty { null },
            Locale.getISOCountries().associateWith { code ->
                Locale.Builder().setRegion(code).build().getDisplayCountry(displayLocale)
            },
        )
    }
}
