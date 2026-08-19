import "package:flutter_test/flutter_test.dart";
import "package:photos/settings/local_settings.dart";
import "package:shared_preferences/shared_preferences.dart";

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test("gallery layout defaults to grid", () async {
    SharedPreferences.setMockInitialValues({});
    final settings = LocalSettings(await SharedPreferences.getInstance());

    expect(settings.getGalleryLayoutType(), GalleryLayoutType.grid);
  });

  test("gallery layout persists mosaic", () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final settings = LocalSettings(preferences);

    await settings.setGalleryLayoutType(GalleryLayoutType.mosaic);

    expect(settings.getGalleryLayoutType(), GalleryLayoutType.mosaic);
    expect(
      preferences.getString(LocalSettings.kGalleryLayoutType),
      GalleryLayoutType.mosaic.name,
    );
  });

  test("unknown persisted gallery layout falls back to grid", () async {
    SharedPreferences.setMockInitialValues({
      LocalSettings.kGalleryLayoutType: "future-layout",
    });
    final settings = LocalSettings(await SharedPreferences.getInstance());

    expect(settings.getGalleryLayoutType(), GalleryLayoutType.grid);
  });
}
