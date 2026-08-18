import 'package:ente_components/ente_components.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('avatar identity seeds are stable and normalized', () {
    expect(
      avatarSeedForIdentity(' Alice@Example.com '),
      avatarSeedForIdentity('alice@example.com'),
    );
    expect(avatarSeedForIdentity('alice@example.com'), 2493822278);
  });

  test('component identity colors use the Figma avatar palette', () {
    final color = avatarComponentColorForIdentity('email:alice@example.com');

    expect(avatarComponentColorForIdentity(' EMAIL:ALICE@EXAMPLE.COM '), color);
    expect(color, isIn(avatarComponentIdentityPalette));
    expect(avatarComponentIdentityPalette, const [
      AvatarComponentColor.yellow,
      AvatarComponentColor.green,
      AvatarComponentColor.orange,
      AvatarComponentColor.pink,
      AvatarComponentColor.purple,
      AvatarComponentColor.blue,
      AvatarComponentColor.cyan,
    ]);
  });

  test(
    'avatar initials use the first and last words with a two-letter cap',
    () {
      expect(avatarInitials('Sachin Jain'), 'SJ');
      expect(avatarInitials('Sachin Kumar Jain'), 'SJ');
      expect(avatarInitials('Sachin'), 'S');
      expect(avatarInitials('  '), '?');
    },
  );
}
