import SwiftUI

public enum ActionVariant: Sendable {
    case primary
    case secondary
    case neutral
    case critical
    case criticalText
    case link
}

public enum ActionDensity: Sendable {
    case regular
    case compact
}

public enum ActionSize: Sendable {
    case small
    case large
}

public struct ActionButton: View {
    @Environment(\.entePalette) private var palette
    private let title: String
    private let variant: ActionVariant
    private let size: ActionSize
    private let density: ActionDensity
    private let enabled: Bool
    private let action: () -> Void

    public init(
        _ title: String,
        variant: ActionVariant = .primary,
        size: ActionSize = .large,
        density: ActionDensity = .regular,
        enabled: Bool = true,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.variant = variant
        self.size = size
        self.density = density
        self.enabled = enabled
        self.action = action
    }

    public var body: some View {
        let inlineLink = variant == .link && size == .small
        Button(action: action) {
            Text(title)
                .underline(variant == .criticalText || variant == .link)
                .lineLimit(2)
                .font(density == .regular ? EnteTypography.bodyBold : EnteTypography.body)
                .frame(maxWidth: size == .large ? .infinity : nil, minHeight: inlineLink ? nil : 24)
                .padding(.horizontal, inlineLink ? 0 : EnteSpacing.xl)
                .padding(.vertical, inlineLink ? 4 : density == .regular ? 14 : 12)
        }
        .buttonStyle(
            ActionStyle(
                variant: variant,
                palette: palette,
                cornerRadius: inlineLink ? 0 : EnteRadius.button
            )
        )
        .disabled(!enabled)
    }
}

private struct ActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    let variant: ActionVariant
    let palette: Palette
    let cornerRadius: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(foreground(pressed: configuration.isPressed))
            .background(background(pressed: configuration.isPressed))
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: EnteMotion.quick), value: configuration.isPressed)
    }

    private func background(pressed: Bool) -> Color {
        guard enabled else {
            return variant == .criticalText || variant == .link ? .clear : palette.fill
        }
        return switch variant {
        case .primary: pressed ? palette.primaryDarker : palette.primary
        case .secondary: pressed ? palette.fillDarkest : palette.fill
        case .neutral: palette.text
        case .critical: pressed ? palette.dangerDarker : palette.danger
        case .criticalText, .link: .clear
        }
    }

    private func foreground(pressed: Bool) -> Color {
        guard enabled else { return palette.disabledText }
        return switch variant {
        case .primary, .critical: .white
        case .secondary: palette.text
        case .neutral: palette.reverseText
        case .criticalText: pressed ? palette.dangerDarker : palette.danger
        case .link: pressed ? palette.primaryDarker : palette.primary
        }
    }
}
