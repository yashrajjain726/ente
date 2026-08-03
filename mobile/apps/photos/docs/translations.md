# Translations

We use Crowdin for translations and Flutter's localization generator to load them at runtime.

All mobile apps share the source strings in `mobile/packages/strings/lib/l10n/arb/strings_en.arb`.

Volunteers can add a new _translation_ in their language corresponding to each such source key-value to our [Crowdin project](https://crowdin.com/project/ente-photos-app).

When a new source string is added, a [GitHub workflow](../../../../.github/workflows/mobile-crowdin-push-sources.yml) uploads it to Crowdin.

Every Monday, we run a [GitHub workflow](../../../../.github/workflows/mobile-crowdin-sync.yml) that

- Downloads translations from Crowdin into the corresponding `strings_XX.arb`.

The sync workflow also uploads the current source strings before downloading translations.

## Adding a new string

1. Add the key-value pair to `mobile/packages/strings/lib/l10n/arb/strings_en.arb`.

   Example:

   ```json
   {
     "existingKey": "Existing translation",
     "newStringKey": "Your new string text"
   }
   ```

1. (optional) Add context or description to help translators:

   ```json
   {
     "newStringKey": "Your new string text",
     "@newStringKey": {
       "description": "Context about where/how this string is used"
     }
   }
   ```

1. Run `flutter gen-l10n` from `mobile/packages/strings`.

1. Import the localization in your Dart file:

   ```dart
   import "package:ente_strings/ente_strings.dart";
   ```

1. Use the string in your code:

   ```dart
   context.strings.newStringKey
   ```

1. Commit the changes and create a PR in which it is advised to tag at least one of the developers (i.e. [laurenspriem](https://github.com/laurenspriem))

1. After the PR is merged, the source-push workflow will upload new source strings to Crowdin's dashboard, allowing translators to translate it.

## Plurals

Use plural categories `one` and `other` in source ARBs, not `=1`.

```json
"photosCount": "{count, plural, =0{No photos} one{{count} photo} other{{count} photos}}"
```

`=0`, `one`, and `other` can be used together. Exact selectors win first; `one` is a locale category, not always exactly `1`. When showing the number in the `one` branch, use the count placeholder instead of hardcoding `1`.

## Updating an existing string

1. Update the existing value for the key in `mobile/packages/strings/lib/l10n/arb/strings_en.arb`.
1. Commit the changes and create a PR in which it is advised to tag at least one of the developers (i.e. [laurenspriem](https://github.com/laurenspriem))
1. After the PR is merged, the source-push workflow will upload the changed source strings to Crowdin's dashboard, allowing translators to translate it.

## Deleting an existing string

1. Remove the key value pair from `mobile/packages/strings/lib/l10n/arb/strings_en.arb`.
1. Commit the changes and create a PR in which it is advised to tag at least one of the developers (i.e. [laurenspriem](https://github.com/laurenspriem))
1. After the PR is merged, the source-push workflow will update Crowdin. During the next sync, the workflow will remove that source item from the other `strings_XX.arb` files in the repository.
