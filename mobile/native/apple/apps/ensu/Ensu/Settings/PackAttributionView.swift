import SwiftUI

struct PackAttributionSheet: View {
    let config: KnowledgeDatasetConfig
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let attribution = config.attribution
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: EnsuSpacing.sm) {
                    Text(config.label)
                        .font(EnsuTypography.large)
                        .foregroundStyle(EnsuColor.textPrimary)

                    Divider()

                    Text("From \(attribution.credit)")
                        .font(EnsuTypography.body)
                        .foregroundStyle(EnsuColor.textPrimary)

                    Text(attribution.modificationNotice)
                        .font(EnsuTypography.body)
                        .foregroundStyle(EnsuColor.textPrimary)

                    HStack(spacing: EnsuSpacing.md) {
                        Link(destination: URL(string: attribution.publicPackUrl)!) {
                            Label("Source", systemImage: "arrow.up.right.square")
                        }
                        Link(destination: URL(string: attribution.licenseUrl)!) {
                            Label("License", systemImage: "doc.text")
                        }
                    }
                    .font(EnsuTypography.mini)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Divider()

                    Text("Wikimedia and Ensu are not affiliated. Wikimedia project names identify the source material only.")
                        .font(EnsuTypography.small)
                        .foregroundStyle(EnsuColor.textMuted)
                }
                .padding(EnsuSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(EnsuColor.fillFaint)
                .clipShape(
                    RoundedRectangle(
                        cornerRadius: EnsuCornerRadius.card,
                        style: .continuous
                    )
                )
                .padding(EnsuSpacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(EnsuColor.backgroundBase)
            .navigationTitle("Attribution")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
