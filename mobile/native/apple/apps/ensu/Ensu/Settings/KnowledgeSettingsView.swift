import SwiftUI

struct KnowledgeSettingsView: View {
    @ObservedObject var state: KnowledgeState
    let onDownloadOrUpdate: (String) -> Void
    let onCancel: (String) -> Void
    let onSetEnabled: (String, Bool) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: EnsuSpacing.md) {
                Text("Download public knowledge packs for private, on-device answers. Queries never leave this device.")
                    .font(EnsuTypography.body)
                    .foregroundStyle(EnsuColor.textMuted)

                ForEach(state.packs) { pack in
                    packCard(pack)
                }

                Text("Wikimedia and Ensu are not affiliated. Wikimedia project names identify the source material only.")
                    .font(EnsuTypography.small)
                    .foregroundStyle(EnsuColor.textMuted)
                    .padding(.vertical, EnsuSpacing.md)

            }
            .padding(EnsuSpacing.lg)
        }
        .background(EnsuColor.backgroundBase)
        .navigationTitle("Knowledge")
        .navigationBarTitleDisplayMode(.inline)
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
                    Text(pack.status.label)
                        .font(EnsuTypography.small)
                        .foregroundStyle(EnsuColor.textMuted)
                    if let activeIdentity = pack.activeIdentity {
                        Text("Installed revision: \(activeIdentity)")
                            .font(EnsuTypography.small)
                            .foregroundStyle(EnsuColor.textMuted)
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
            } else if state.downloadsAllowed &&
                (pack.status == .download || pack.status == .updateAvailable) {
                Button(pack.status == .download ? "Download" : "Update") {
                    onDownloadOrUpdate(pack.id)
                }
                .buttonStyle(.borderedProminent)
                .tint(EnsuColor.accent)
            }

            if let error = pack.errorMessage {
                Text(error)
                    .font(EnsuTypography.small)
                    .foregroundStyle(.red)
            }

            Divider()
            Text(attribution.credit)
                .font(EnsuTypography.small)
            Text(attribution.buildProvenance)
                .font(EnsuTypography.small)
                .foregroundStyle(EnsuColor.textMuted)
            Text(attribution.modificationNotice)
                .font(EnsuTypography.small)
                .foregroundStyle(EnsuColor.textMuted)
            Link(attribution.licenseLabel, destination: URL(string: attribution.licenseUrl)!)
            Link("Public pack", destination: URL(string: attribution.publicPackUrl)!)
        }
        .padding(EnsuSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EnsuColor.fillFaint)
        .clipShape(RoundedRectangle(cornerRadius: EnsuCornerRadius.card, style: .continuous))
    }
}

private extension KnowledgePackStatus {
    var label: String {
        switch self {
        case .checking: "Checking..."
        case .download: "Not downloaded"
        case .ready: "Ready"
        case .updateAvailable: "Ready · update available"
        }
    }
}
