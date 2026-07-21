import SwiftUI

enum EnsuLegalDocuments {
    static let privacyTitle = "Privacy Policy"
    static let privacyURL = URL(string: "https://ente.com/privacy/")!
    static let enteTermsTitle = "Ente Terms and Conditions"
    static let enteTermsURL = URL(string: "https://ente.com/terms/")!

    static let searchTerms = [
        privacyTitle,
        enteTermsTitle,
        "Terms of Service",
    ]
}

struct TermsAndConditionsView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: EnsuSpacing.lg) {
                Link(destination: EnsuLegalDocuments.privacyURL) {
                    SettingsCard(
                        title: EnsuLegalDocuments.privacyTitle,
                        iconName: "ViewIcon",
                        showsChevron: true
                    )
                }
                .buttonStyle(.plain)

                Link(destination: EnsuLegalDocuments.enteTermsURL) {
                    SettingsCard(
                        title: EnsuLegalDocuments.enteTermsTitle,
                        iconName: "DescriptionIcon",
                        showsChevron: true
                    )
                }
                .buttonStyle(.plain)
            }
            .padding(EnsuSpacing.lg)
        }
        .background(EnsuColor.backgroundBase)
        .navigationTitle("Terms and Conditions")
        .navigationBarTitleDisplayMode(.inline)
    }
}
