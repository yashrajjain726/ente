## Localization

If the feature requires adding new strings, you can do that by following these steps:

1. Add a new entry inside [strings_en.arb](https://github.com/ente/ente/blob/main/mobile/packages/strings/lib/l10n/arb/strings_en.arb).

2. In your dart file, add the following import

   ```dart
   import "package:ente_strings/ente_strings.dart";
   ```

3. Refer to the string using `context.strings.<keyName>`. For example

   ```dart
   context.strings.account
   ```
