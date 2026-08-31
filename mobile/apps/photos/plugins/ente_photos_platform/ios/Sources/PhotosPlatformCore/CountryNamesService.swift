import Foundation

public struct CountryNames: Sendable {
    public let region: String?
    public let names: [String: String]
}

public struct CountryNamesService {
    public init() {}

    public func names(localeIdentifier: String) -> CountryNames {
        let locale = Locale(identifier: localeIdentifier)
        return CountryNames(
            region: Locale.current.regionCode,
            names: Dictionary(
                uniqueKeysWithValues: Locale.isoRegionCodes.compactMap { code in
                    locale.localizedString(forRegionCode: code).map { (code, $0) }
                })
        )
    }
}
