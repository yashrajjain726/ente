import SwiftUI

struct KnowledgeSettingsView: View {
    @ObservedObject var state: KnowledgeState
    let onDownloadOrUpdate: (String) -> Void
    let onCancel: (String) -> Void
    let onSetEnabled: (String, Bool) -> Void
    @State private var attributionPack: KnowledgePackState?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: EnsuSpacing.md) {
                ForEach(state.packs) { pack in
                    packCard(pack)
                }
            }
            .padding(EnsuSpacing.lg)
        }
        .background(EnsuColor.backgroundBase)
        .navigationTitle("Ensu Packs")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $attributionPack) { pack in
            PackAttributionSheet(config: pack.config)
        }
    }

    @ViewBuilder
    private func packCard(_ pack: KnowledgePackState) -> some View {
        let attribution = pack.config.attribution
        VStack(alignment: .leading, spacing: EnsuSpacing.sm) {
            HStack {
                VStack(alignment: .leading, spacing: EnsuSpacing.xs) {
                    Text(pack.config.label)
                        .font(EnsuTypography.large)
                        .foregroundStyle(EnsuColor.textPrimary)
                    HStack(spacing: EnsuSpacing.xs) {
                        Text(pack.config.downloadSizeBytes.formattedFileSize)
                            .font(EnsuTypography.mini)
                            .foregroundStyle(EnsuColor.textMuted)
                        Text("·")
                            .font(EnsuTypography.mini)
                            .foregroundStyle(EnsuColor.textMuted)
                        Button {
                            attributionPack = pack
                        } label: {
                            HStack(spacing: EnsuSpacing.xs) {
                                Text(attribution.licenseLabel)
                                    .font(EnsuTypography.mini)
                                Image(systemName: "info.circle")
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .foregroundStyle(EnsuColor.accent)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("View attribution for \(pack.config.label)")
                    }
                }
                Spacer()
                if pack.activeIdentity != nil && !pack.isMutating {
                    Toggle(
                        "",
                        isOn: Binding(
                            get: { pack.enabled },
                            set: { onSetEnabled(pack.id, $0) }
                        )
                    )
                    .labelsHidden()
                } else if state.downloadsAllowed && pack.status == .download && !pack.isMutating {
                    Button {
                        onDownloadOrUpdate(pack.id)
                    } label: {
                        Text("Download")
                            .font(EnsuTypography.small)
                            .padding(.horizontal, EnsuSpacing.xs)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(EnsuColor.accent)
                }
            }

            if pack.isMutating {
                ProgressView(value: Double(pack.progressPercent ?? 0), total: 100)
                    .tint(EnsuColor.action)
                Text(pack.progressLabel ?? "Downloading...")
                    .font(EnsuTypography.small)
                    .foregroundStyle(EnsuColor.textMuted)
                Button("Cancel") {
                    onCancel(pack.id)
                }
            } else if state.downloadsAllowed && pack.status == .updateAvailable {
                Button {
                    onDownloadOrUpdate(pack.id)
                } label: {
                    Text("Update")
                        .font(EnsuTypography.small)
                        .padding(.horizontal, EnsuSpacing.xs)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .tint(EnsuColor.accent)
            }

            if let error = pack.errorMessage {
                Text(error)
                    .font(EnsuTypography.small)
                    .foregroundStyle(.red)
            }
        }
        .padding(EnsuSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EnsuColor.fillFaint)
        .clipShape(RoundedRectangle(cornerRadius: EnsuCornerRadius.card, style: .continuous))
    }
}
