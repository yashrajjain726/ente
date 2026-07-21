import SwiftUI
import Foundation

struct SettingsView: View {
    @ObservedObject var knowledgeStore: KnowledgeStore
    let onSignIn: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var query: String = ""
    @State private var buildVersionTapCount = 0
    @State private var lastBuildVersionTapAt: Date?
    @State private var isAdvancedUnlocked = EnsuAdvancedSettings.isUnlocked
    @State private var toastMessage: String?
    @State private var toastTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: EnsuSpacing.lg) {
                    ForEach(filteredItems) { item in
                        NavigationLink {
                            item.destination
                        } label: {
                            SettingsCard(title: item.title, iconName: item.iconName, showsChevron: true)
                        }
                        .buttonStyle(.plain)
                    }

                    if let aboutItem = filteredAboutItem {
                        Button(action: aboutItem.action) {
                            SettingsCard(title: aboutItem.title, iconName: aboutItem.iconName, showsChevron: true)
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(filteredUtilityItems) { item in
                        NavigationLink {
                            item.destination
                        } label: {
                            SettingsCard(title: item.title, iconName: item.iconName, showsChevron: true)
                        }
                        .buttonStyle(.plain)
                    }

                    if shouldShowSignInRow {
                        Button(action: onSignIn) {
                            SettingsCard(title: signInTitle, iconName: "Upload01Icon", showsChevron: true)
                        }
                        .buttonStyle(.plain)
                    }

                    ForEach(filteredTermsItems) { item in
                        NavigationLink {
                            item.destination
                        } label: {
                            SettingsCard(title: item.title, iconName: item.iconName, showsChevron: true)
                        }
                        .buttonStyle(.plain)
                    }

                    if shouldShowAdvancedSection {
                        Text("Advanced")
                            .font(EnsuTypography.small)
                            .foregroundStyle(EnsuColor.textMuted)
                            .padding(.top, EnsuSpacing.xs)

                        ForEach(filteredAdvancedItems) { item in
                            NavigationLink {
                                item.destination
                            } label: {
                                SettingsCard(title: item.title, iconName: item.iconName, showsChevron: true)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Button(action: handleBuildVersionTap) {
                        Text(buildVersionText)
                            .font(EnsuTypography.small)
                            .foregroundStyle(EnsuColor.textMuted)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                }
                .padding(EnsuSpacing.lg)
            }
            .background(EnsuColor.backgroundBase)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Settings")
                        .font(EnsuTypography.large)
                        .foregroundStyle(EnsuColor.textPrimary)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Close") { dismiss() }
                }
            }
            .overlay(alignment: .bottom) {
                if let toastMessage {
                    ToastView(message: toastMessage)
                        .padding(.bottom, EnsuSpacing.xl)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    private var filteredItems: [SettingsItem] {
        filtered(allItems)
    }

    private var filteredUtilityItems: [SettingsItem] {
        filtered(utilityItems)
    }

    private var filteredTermsItems: [SettingsItem] {
        filtered(termsItems)
    }

    private var filteredAdvancedItems: [SettingsItem] {
        guard isAdvancedUnlocked else { return [] }
        return filtered(advancedItems)
    }

    private var aboutItem: SettingsActionItem {
        SettingsActionItem(
            title: "About Ensu",
            iconName: "InformationCircleIcon",
            action: { openExternalLink("https://ente.com/blog/ensu/") }
        )
    }

    private var filteredAboutItem: SettingsActionItem? {
        guard !trimmedQuery.isEmpty else { return aboutItem }
        let q = trimmedQuery.lowercased()
        return aboutItem.title.lowercased().contains(q) ? aboutItem : nil
    }

    private var shouldShowSignInRow: Bool {
        guard !trimmedQuery.isEmpty else { return true }
        let q = trimmedQuery.lowercased()
        return signInTitle.lowercased().contains(q)
    }

    private var signInTitle: String { "Sign In to Backup" }

    private var allItems: [SettingsItem] {
        [
            SettingsItem(
                title: "Ensu Packs",
                iconName: "PackageIcon",
                destination: AnyView(
                    KnowledgeSettingsView(
                        store: knowledgeStore
                    )
                )
            )
        ]
    }

    private var utilityItems: [SettingsItem] {
        [
            SettingsItem(
                title: "Logs",
                iconName: "Bug01Icon",
                destination: AnyView(LogsView(embeddedInNavigation: true))
            )
        ]
    }

    private var termsItems: [SettingsItem] {
        [
            SettingsItem(
                title: "Terms and Conditions",
                iconName: "DescriptionIcon",
                destination: AnyView(TermsAndConditionsView()),
                searchTerms: EnsuLegalDocuments.searchTerms
            )
        ]
    }

    private func filtered(_ items: [SettingsItem]) -> [SettingsItem] {
        guard !trimmedQuery.isEmpty else { return items }
        let q = trimmedQuery.lowercased()
        return items.filter { $0.matches(q) }
    }

    private var advancedItems: [SettingsItem] {
        [
            SettingsItem(
                title: "Model settings",
                iconName: "Settings01Icon",
                destination: AnyView(ModelSettingsView(embeddedInNavigation: true))
            ),
            SettingsItem(
                title: "System prompt",
                iconName: "Edit01Icon",
                destination: AnyView(SystemPromptSettingsView(embeddedInNavigation: true))
            )
        ]
    }

    private var shouldShowAdvancedSection: Bool {
        isAdvancedUnlocked && !filteredAdvancedItems.isEmpty
    }

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var buildVersionText: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = info?["CFBundleVersion"] as? String ?? "unknown"
        return "Build \(version) (\(build))"
    }

    private func handleBuildVersionTap() {
        guard !isAdvancedUnlocked else { return }
        let now = Date()
        if let last = lastBuildVersionTapAt, now.timeIntervalSince(last) > 2 {
            buildVersionTapCount = 0
        }
        lastBuildVersionTapAt = now
        buildVersionTapCount += 1
        guard buildVersionTapCount >= 5 else { return }
        EnsuAdvancedSettings.unlock()
        isAdvancedUnlocked = true
        buildVersionTapCount = 0
        toastTask?.cancel()
        toastTask = presentToast("Advanced settings unlocked") { message in
            toastMessage = message
        }
    }

    private func openExternalLink(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        openURL(url)
    }
}

struct SettingsCard: View {
    let title: String
    let iconName: String
    let showsChevron: Bool

    var body: some View {
        HStack(spacing: EnsuSpacing.md) {
            Image(iconName)
                .resizable()
                .scaledToFit()
                .frame(width: 18, height: 18)
                .foregroundStyle(EnsuColor.textPrimary)

            Text(title)
                .font(EnsuTypography.body)
                .foregroundStyle(EnsuColor.textPrimary)
            Spacer()
            if showsChevron {
                Image("ArrowRight01Icon")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 18, height: 18)
                    .foregroundStyle(EnsuColor.textMuted)
            }
        }
        .padding(EnsuSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(EnsuColor.fillFaint)
        .clipShape(RoundedRectangle(cornerRadius: EnsuCornerRadius.card, style: .continuous))
    }
}

private struct SystemPromptSettingsView: View {
    @Environment(\.dismiss) private var dismiss

    let embeddedInNavigation: Bool

    @ObservedObject private var settings = ModelSettingsStore.shared
    @State private var promptBody: String = ""
    @State private var isSaving = false
    @State private var toastMessage: String?
    @State private var toastTask: Task<Void, Never>?

    init(embeddedInNavigation: Bool = false) {
        self.embeddedInNavigation = embeddedInNavigation
    }

    var body: some View {
        Group {
            if embeddedInNavigation {
                content
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .principal) {
                            Text("System Prompt")
                                .font(EnsuTypography.large)
                                .foregroundStyle(EnsuColor.textPrimary)
                        }
                    }
            } else {
                NavigationStack {
                    content
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar {
                            ToolbarItem(placement: .principal) {
                                Text("System Prompt")
                                    .font(EnsuTypography.large)
                                    .foregroundStyle(EnsuColor.textPrimary)
                            }
                            ToolbarItem(placement: .primaryAction) {
                                Button("Done") { dismiss() }
                            }
                        }
                }
            }
        }
        .onAppear {
            promptBody = ModelSettingsStore.resolveSystemPromptBody(settings.systemPromptBody)
        }
        .overlay(alignment: .bottom) {
            if let toastMessage {
                ToastView(message: toastMessage)
                    .padding(.bottom, EnsuSpacing.xl)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: EnsuSpacing.xxl) {
                sectionHeader("Prompt text")

                Text("This prompt is used as-is. Use $date anywhere to insert the current date.")
                    .font(EnsuTypography.small)
                    .foregroundStyle(EnsuColor.textMuted)

                TextEditor(text: $promptBody)
                    .font(EnsuTypography.body)
                    .foregroundStyle(EnsuColor.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 220)
                    .padding(.horizontal, EnsuSpacing.inputHorizontal)
                    .padding(.vertical, EnsuSpacing.inputVertical)
                    .background(EnsuColor.fillFaint)
                    .clipShape(RoundedRectangle(cornerRadius: EnsuCornerRadius.input, style: .continuous))

                Text("Leave this blank to use the default prompt.")
                    .font(EnsuTypography.small)
                    .foregroundStyle(EnsuColor.textMuted)

                Divider().background(EnsuColor.border)

                VStack(spacing: EnsuSpacing.md) {
                    PrimaryButton(text: "Save Prompt", isLoading: isSaving, isEnabled: !isSaving) {
                        saveTapped()
                    }

                    Button("Use Default Prompt") {
                        resetTapped()
                    }
                    .font(EnsuTypography.body)
                    .foregroundStyle(EnsuColor.textMuted)
                }
            }
            .padding(EnsuSpacing.lg)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(EnsuTypography.body)
            .foregroundStyle(EnsuColor.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func saveTapped() {
        isSaving = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 200_000_000)
            let trimmedPrompt = promptBody.trimmingCharacters(in: .whitespacesAndNewlines)
            let defaultPrompt = ModelSettingsStore.defaultSystemPromptBody.trimmingCharacters(in: .whitespacesAndNewlines)
            settings.systemPromptBody = trimmedPrompt == defaultPrompt ? "" : trimmedPrompt
            promptBody = ModelSettingsStore.resolveSystemPromptBody(settings.systemPromptBody)
            isSaving = false
            toastTask?.cancel()
            toastTask = presentToast("Prompt saved") { message in
                toastMessage = message
            }
        }
    }

    private func resetTapped() {
        settings.systemPromptBody = ""
        promptBody = ModelSettingsStore.defaultSystemPromptBody
        toastTask?.cancel()
        toastTask = presentToast("Prompt reset") { message in
            toastMessage = message
        }
    }
}

private struct SettingsItem: Identifiable {
    let id = UUID()
    let title: String
    let iconName: String
    let destination: AnyView
    let searchTerms: [String]

    init(
        title: String,
        iconName: String,
        destination: AnyView,
        searchTerms: [String] = []
    ) {
        self.title = title
        self.iconName = iconName
        self.destination = destination
        self.searchTerms = searchTerms
    }

    func matches(_ query: String) -> Bool {
        title.lowercased().contains(query) ||
            searchTerms.contains { $0.lowercased().contains(query) }
    }
}

private struct SettingsActionItem: Identifiable {
    let id = UUID()
    let title: String
    let iconName: String
    let action: () -> Void
}
