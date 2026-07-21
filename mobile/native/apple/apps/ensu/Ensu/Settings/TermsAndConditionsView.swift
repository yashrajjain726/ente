import SwiftUI

struct TermsAndConditionsView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: EnsuSpacing.lg) {
                Link(destination: URL(string: "https://ente.com/privacy/")!) {
                    SettingsCard(title: "Privacy Policy", iconName: "ViewIcon", showsChevron: true)
                }
                .buttonStyle(.plain)

                Link(destination: URL(string: "https://ente.com/terms/")!) {
                    SettingsCard(
                        title: "Ente Terms and Conditions",
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
