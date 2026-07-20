import "dart:async";
import "dart:math" as math;

import "package:collection/collection.dart";
import "package:ente_components/theme/text_styles.dart" as component;
import "package:ente_icons/ente_icons.dart";
import "package:flutter/material.dart";
import "package:logging/logging.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/events/social_data_updated_event.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/social/comment.dart";
import "package:photos/models/social/comment_author_utils.dart";
import "package:photos/models/social/reaction.dart";
import "package:photos/models/social/social_data_provider.dart";
import "package:photos/services/collections_service.dart";
import "package:photos/ui/home/memories/memory_viewer_constants.dart";
import "package:photos/ui/notification/toast.dart";
import "package:photos/ui/sharing/user_avator_widget.dart";
import "package:photos/ui/social/comments_screen.dart";
import "package:photos/ui/social/like_collection_selector_sheet.dart";
import "package:photos/ui/social/likes_bottom_sheet.dart";

final _logger = Logger("FileSocialOverlay");

const _likedColor = Color(0xFF08C225);
const _socialControlsSize = 40.0;
const _socialIconSize = 32.0;
const _socialToActionBarGap = 14.0;

class FileSocialOverlay extends StatefulWidget {
  final EnteFile file;
  final int? currentUserID;
  final VoidCallback onInteractionStart;
  final VoidCallback onInteractionEnd;
  final ValueChanged<bool> onVisibilityChanged;

  const FileSocialOverlay({
    required this.file,
    required this.currentUserID,
    required this.onInteractionStart,
    required this.onInteractionEnd,
    required this.onVisibilityChanged,
    super.key,
  });

  @override
  State<FileSocialOverlay> createState() => _FileSocialOverlayState();
}

class _FileSocialOverlayState extends State<FileSocialOverlay> {
  late final StreamSubscription<SocialDataUpdatedEvent>
  _socialDataUpdatedSubscription;

  List<int> _visibleSharedCollectionIDs = const [];
  bool _hasLiked = false;
  int _commentCount = 0;
  Comment? _latestComment;
  User? _latestCommentAuthor;
  int _loadGeneration = 0;
  final _reactionUpdateFileIDs = <int>{};

  @override
  void initState() {
    super.initState();
    _socialDataUpdatedSubscription = Bus.instance
        .on<SocialDataUpdatedEvent>()
        .listen((_) => unawaited(_refreshSocialState()));
    unawaited(_refreshSocialState());
  }

  @override
  void didUpdateWidget(covariant FileSocialOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.file.uploadedFileID != widget.file.uploadedFileID ||
        oldWidget.currentUserID != widget.currentUserID) {
      _clearSocialState();
      unawaited(_refreshSocialState());
    }
  }

  @override
  void dispose() {
    _socialDataUpdatedSubscription.cancel();
    super.dispose();
  }

  void _clearSocialState() {
    _visibleSharedCollectionIDs = const [];
    _hasLiked = false;
    _commentCount = 0;
    _latestComment = null;
    _latestCommentAuthor = null;
  }

  bool _isCurrentLoad(int fileID, int generation) {
    return mounted &&
        generation == _loadGeneration &&
        widget.file.uploadedFileID == fileID;
  }

  Future<void> _refreshSocialState() async {
    final fileID = widget.file.uploadedFileID;
    final currentUserID = widget.currentUserID;
    final generation = ++_loadGeneration;

    if (fileID == null || currentUserID == null) {
      _clearSocialState();
      // Defer because a user-null transition can arrive from didUpdateWidget.
      scheduleMicrotask(() {
        if (!mounted ||
            generation != _loadGeneration ||
            widget.file.uploadedFileID != fileID ||
            widget.currentUserID != currentUserID) {
          return;
        }
        widget.onVisibilityChanged(false);
      });
      return;
    }

    try {
      final collectionIDs = await CollectionsService.instance
          .getNonHiddenSharedCollectionIDsForFile(fileID);
      if (!_isCurrentLoad(fileID, generation)) return;

      if (collectionIDs.isEmpty) {
        setState(_clearSocialState);
        widget.onVisibilityChanged(false);
        return;
      }

      final provider = SocialDataProvider.instance;
      final results = await Future.wait<Object?>([
        provider.getReactionsForFile(fileID),
        provider.getCommentCountForFile(fileID),
        provider.getLatestCommentForFile(
          fileID,
          candidateCollectionIDs: collectionIDs,
        ),
      ]);
      if (!_isCurrentLoad(fileID, generation)) return;

      final reactions = results[0] as List<Reaction>;
      final commentCount = results[1] as int;
      final latestComment = results[2] as Comment?;
      User? latestCommentAuthor;
      if (latestComment != null) {
        final anonDisplayNames = latestComment.isAnonymous
            ? await provider.getAnonDisplayNamesForCollection(
                latestComment.collectionID,
              )
            : const <String, String>{};
        if (!_isCurrentLoad(fileID, generation)) return;

        latestCommentAuthor = CommentAuthorResolver().resolve(
          comment: latestComment,
          anonDisplayNames: anonDisplayNames,
          registeredUserResolver: (userID) => CollectionsService.instance
              .getFileOwner(userID, latestComment.collectionID),
        );
      }

      if (!_isCurrentLoad(fileID, generation)) return;
      setState(() {
        _visibleSharedCollectionIDs = collectionIDs;
        _hasLiked = reactions.any(
          (reaction) => reaction.userID == currentUserID,
        );
        _commentCount = commentCount;
        _latestComment = latestComment;
        _latestCommentAuthor = latestCommentAuthor;
      });
      widget.onVisibilityChanged(true);
    } catch (error, stackTrace) {
      // Preserve last-good state; page changes clear state and visibility.
      _logger.warning(
        "Failed to refresh social overlay for file $fileID",
        error,
        stackTrace,
      );
    }
  }

  Future<void> _toggleReaction() async {
    final file = widget.file;
    final fileID = file.uploadedFileID;
    final currentUserID = widget.currentUserID;
    if (fileID == null ||
        currentUserID == null ||
        _visibleSharedCollectionIDs.isEmpty ||
        _reactionUpdateFileIDs.contains(fileID)) {
      return;
    }

    _reactionUpdateFileIDs.add(fileID);
    try {
      if (_hasLiked) {
        await _unlikeFromAllCollections(fileID, currentUserID);
        return;
      }

      final sharedCollections = await CollectionsService.instance
          .getSharedCollectionsForFile(fileID);
      if (!mounted ||
          widget.file.uploadedFileID != fileID ||
          widget.currentUserID != currentUserID ||
          sharedCollections.isEmpty) {
        return;
      }

      if (sharedCollections.length == 1) {
        final previousState = _hasLiked;
        setState(() => _hasLiked = true);
        try {
          await SocialDataProvider.instance.toggleReaction(
            userID: currentUserID,
            collectionID: sharedCollections.single.id,
            fileID: fileID,
          );
        } catch (error, stackTrace) {
          _logger.severe("Failed to like photo", error, stackTrace);
          if (mounted && widget.file.uploadedFileID == fileID) {
            setState(() => _hasLiked = previousState);
            showShortToast(
              context,
              AppLocalizations.of(context).failedToUpdateLike,
            );
          }
        }
        return;
      }

      await _runSheetAndRefresh(
        () => showLikeCollectionSelectorSheet(
          context,
          fileID: fileID,
          currentUserID: currentUserID,
          collections: sharedCollections,
          file: file,
        ),
      );
    } finally {
      _reactionUpdateFileIDs.remove(fileID);
    }
  }

  Future<void> _unlikeFromAllCollections(int fileID, int currentUserID) async {
    final previousState = _hasLiked;
    setState(() => _hasLiked = false);

    try {
      final sharedCollections = await CollectionsService.instance
          .getSharedCollectionsForFile(fileID, includeHidden: true);
      var failedCount = 0;
      for (final collection in sharedCollections) {
        try {
          final reactions = await SocialDataProvider.instance
              .getReactionsForFileInCollection(fileID, collection.id);
          final userReaction = reactions.firstWhereOrNull(
            (reaction) => reaction.userID == currentUserID,
          );
          if (userReaction != null) {
            await SocialDataProvider.instance.toggleReaction(
              userID: currentUserID,
              collectionID: collection.id,
              fileID: fileID,
            );
          }
        } catch (error, stackTrace) {
          failedCount++;
          _logger.warning(
            "Failed to unlike from ${collection.displayName}",
            error,
            stackTrace,
          );
        }
      }

      if (failedCount > 0 && mounted && widget.file.uploadedFileID == fileID) {
        setState(() => _hasLiked = previousState);
        showShortToast(
          context,
          AppLocalizations.of(context).failedToUpdateLike,
        );
      }
    } catch (error, stackTrace) {
      _logger.severe(
        "Failed to unlike from all collections",
        error,
        stackTrace,
      );
      if (mounted && widget.file.uploadedFileID == fileID) {
        setState(() => _hasLiked = previousState);
        showShortToast(
          context,
          AppLocalizations.of(context).failedToUpdateLike,
        );
      }
    }
  }

  Future<void> _showLikes() async {
    final fileID = widget.file.uploadedFileID;
    if (fileID == null || _visibleSharedCollectionIDs.isEmpty) return;
    await _runSheetAndRefresh(() async {
      final sharedCollections = await CollectionsService.instance
          .getSharedCollectionsForFile(fileID);
      if (!mounted ||
          widget.file.uploadedFileID != fileID ||
          sharedCollections.isEmpty) {
        return;
      }
      await showLikesBottomSheet(
        context,
        fileID: fileID,
        initialCollectionID: sharedCollections.first.id,
      );
    });
  }

  Future<void> _openComments({Comment? comment}) async {
    final fileID = widget.file.uploadedFileID;
    if (fileID == null || _visibleSharedCollectionIDs.isEmpty) return;
    await _runSheetAndRefresh(() async {
      final sharedCollections = await CollectionsService.instance
          .getSharedCollectionsForFile(fileID);
      if (!mounted ||
          widget.file.uploadedFileID != fileID ||
          sharedCollections.isEmpty) {
        return;
      }

      final preferredCollectionID =
          comment?.collectionID ?? _latestComment?.collectionID;
      final preferredCollection = sharedCollections.firstWhereOrNull(
        (collection) => collection.id == preferredCollectionID,
      );

      await showFileCommentsBottomSheet(
        context,
        collectionID: preferredCollection?.id ?? sharedCollections.first.id,
        fileID: fileID,
        highlightCommentID: preferredCollection == null ? null : comment?.id,
      );
    });
  }

  Future<void> _runSheetAndRefresh(Future<void> Function() showSheet) async {
    widget.onInteractionStart();
    try {
      await showSheet();
      await _refreshSocialState();
    } finally {
      widget.onInteractionEnd();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_visibleSharedCollectionIDs.isEmpty) {
      return const SizedBox.shrink();
    }

    final safePadding = MediaQuery.paddingOf(context);
    return Positioned(
      right: safePadding.right + 24,
      bottom:
          safePadding.bottom +
          kMemoryBottomActionBarHeight +
          _socialToActionBarGap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (_latestComment != null && _latestCommentAuthor != null)
            Padding(
              padding: const EdgeInsets.only(right: 12, bottom: 4),
              child: _buildLatestCommentPill(
                _latestComment!,
                _latestCommentAuthor!,
              ),
            ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Tooltip(
                message: AppLocalizations.of(context).like,
                child: GestureDetector(
                  onLongPress: () => unawaited(_showLikes()),
                  child: SizedBox.square(
                    dimension: _socialControlsSize,
                    child: IconButton(
                      padding: const EdgeInsets.all(4),
                      style: IconButton.styleFrom(
                        minimumSize: const Size.square(_socialControlsSize),
                        maximumSize: const Size.square(_socialControlsSize),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        overlayColor: WidgetStateColor.transparent,
                      ),
                      onPressed: () => unawaited(_toggleReaction()),
                      icon: Icon(
                        _hasLiked ? EnteIcons.likeFilled : EnteIcons.likeStroke,
                        color: _hasLiked ? _likedColor : Colors.white,
                        size: _socialIconSize,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Tooltip(
                message: AppLocalizations.of(context).comments,
                child: SizedBox.square(
                  dimension: _socialControlsSize,
                  child: IconButton(
                    padding: const EdgeInsets.all(4),
                    style: IconButton.styleFrom(
                      minimumSize: const Size.square(_socialControlsSize),
                      maximumSize: const Size.square(_socialControlsSize),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: () => unawaited(_openComments()),
                    icon: _buildCommentIcon(),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildLatestCommentPill(Comment comment, User author) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => unawaited(_openComments(comment: comment)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: math.min(MediaQuery.sizeOf(context).width * 0.5, 200),
        ),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            DecoratedBox(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(6),
                  bottomLeft: Radius.circular(20),
                  bottomRight: Radius.circular(20),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                child: Text(
                  comment.data,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: component.TextStyles.mini.copyWith(
                    color: Colors.black,
                  ),
                ),
              ),
            ),
            Positioned(
              left: -3,
              top: -6,
              child: Container(
                width: 22,
                height: 22,
                padding: const EdgeInsets.all(1),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: UserAvatarWidget(
                  author,
                  type: AvatarType.small,
                  currentUserID: widget.currentUserID!,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCommentIcon() {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        const Icon(
          EnteIcons.commentBubbleStroke,
          color: Colors.white,
          size: _socialIconSize,
        ),
        if (_commentCount > 0)
          Positioned(
            right: -5,
            top: -5,
            child: Container(
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              padding: const EdgeInsets.symmetric(horizontal: 6),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.all(Radius.circular(19)),
              ),
              child: Center(
                child: Text(
                  _commentCount > 99 ? "99+" : _commentCount.toString(),
                  style: const TextStyle(
                    color: Colors.black,
                    fontSize: 10,
                    height: 1.2,
                    fontWeight: FontWeight.w700,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
