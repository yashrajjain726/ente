import "dart:async";

import "package:collection/collection.dart";
import "package:ente_components/theme/text_styles.dart" as component;
import "package:ente_icons/ente_icons.dart";
import "package:flutter/material.dart";
import "package:logging/logging.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/events/social_data_updated_event.dart";
import "package:photos/generated/l10n.dart";
import "package:photos/models/api/collection/user.dart";
import "package:photos/models/collection/collection.dart";
import "package:photos/models/file/file.dart";
import "package:photos/models/social/comment.dart";
import "package:photos/models/social/comment_author_utils.dart";
import "package:photos/models/social/reaction.dart";
import "package:photos/models/social/social_data_provider.dart";
import "package:photos/services/collections_service.dart";
import "package:photos/ui/notification/toast.dart";
import "package:photos/ui/sharing/user_avator_widget.dart";
import "package:photos/ui/social/comments_screen.dart";
import "package:photos/ui/social/like_collection_selector_sheet.dart";
import "package:photos/ui/social/likes_bottom_sheet.dart";

final _logger = Logger("FileSocialOverlay");

const _likedColor = Color(0xFF08C225);
const _socialControlsSize = 40.0;
const _bottomActionBarHeight = 80.0;
const _socialToActionBarGap = 14.0;

class FileSocialOverlay extends StatefulWidget {
  final EnteFile file;
  final int? currentUserID;
  final VoidCallback onInteractionStart;
  final VoidCallback onInteractionEnd;
  final bool includeHiddenCollections;

  const FileSocialOverlay({
    required this.file,
    required this.currentUserID,
    required this.onInteractionStart,
    required this.onInteractionEnd,
    this.includeHiddenCollections = false,
    super.key,
  });

  @override
  State<FileSocialOverlay> createState() => _FileSocialOverlayState();
}

class _FileSocialOverlayState extends State<FileSocialOverlay> {
  late final StreamSubscription<SocialDataUpdatedEvent>
  _socialDataUpdatedSubscription;

  List<Collection> _sharedCollections = const [];
  bool _hasLiked = false;
  int _commentCount = 0;
  Comment? _latestComment;
  User? _latestCommentAuthor;
  int _loadGeneration = 0;
  int? _reactionUpdateFileID;

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
        oldWidget.currentUserID != widget.currentUserID ||
        oldWidget.includeHiddenCollections != widget.includeHiddenCollections) {
      _loadGeneration++;
      _reactionUpdateFileID = null;
      _clearSocialState();
      unawaited(_refreshSocialState());
    }
  }

  @override
  void dispose() {
    _loadGeneration++;
    _socialDataUpdatedSubscription.cancel();
    super.dispose();
  }

  void _clearSocialState() {
    _sharedCollections = const [];
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
      return;
    }

    try {
      final sharedCollections = await CollectionsService.instance
          .getSharedCollectionsForFile(
            fileID,
            includeHidden: widget.includeHiddenCollections,
          );
      if (!_isCurrentLoad(fileID, generation)) return;

      if (sharedCollections.isEmpty) {
        setState(_clearSocialState);
        return;
      }

      final provider = SocialDataProvider.instance;
      final collectionIDs = sharedCollections
          .map((collection) => collection.id)
          .toList();
      final results = await Future.wait<Object?>([
        provider.getReactionsForFile(fileID),
        provider.getCommentCountForFile(fileID),
        provider.getLatestCommentForFile(fileID, collectionIDs: collectionIDs),
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
        _sharedCollections = sharedCollections;
        _hasLiked = reactions.any(
          (reaction) => reaction.userID == currentUserID && !reaction.isDeleted,
        );
        _commentCount = commentCount;
        _latestComment = latestComment;
        _latestCommentAuthor = latestCommentAuthor;
      });
    } catch (error, stackTrace) {
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
        _sharedCollections.isEmpty ||
        _reactionUpdateFileID == fileID) {
      return;
    }

    _reactionUpdateFileID = fileID;
    try {
      if (_hasLiked) {
        await _unlikeFromAllCollections(fileID, currentUserID);
        return;
      }

      if (_sharedCollections.length == 1) {
        final previousState = _hasLiked;
        setState(() => _hasLiked = true);
        try {
          await SocialDataProvider.instance.toggleReaction(
            userID: currentUserID,
            collectionID: _sharedCollections.single.id,
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
          file: file,
          allowedCollectionIDs: _sharedCollections
              .map((collection) => collection.id)
              .toSet(),
        ),
      );
    } finally {
      if (_reactionUpdateFileID == fileID) {
        _reactionUpdateFileID = null;
      }
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
            (reaction) =>
                reaction.userID == currentUserID && !reaction.isDeleted,
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
    if (fileID == null || _sharedCollections.isEmpty) return;
    final initialCollectionID = _sharedCollections.first.id;
    await _runSheetAndRefresh(
      () => showLikesBottomSheet(
        context,
        fileID: fileID,
        initialCollectionID: initialCollectionID,
      ),
    );
  }

  Future<void> _openComments({Comment? comment}) async {
    final fileID = widget.file.uploadedFileID;
    if (fileID == null || _sharedCollections.isEmpty) return;
    await _runSheetAndRefresh(
      () => showFileCommentsBottomSheet(
        context,
        collectionID:
            comment?.collectionID ??
            _latestComment?.collectionID ??
            _sharedCollections.first.id,
        fileID: fileID,
        highlightCommentID: comment?.id,
      ),
    );
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
    if (_sharedCollections.isEmpty) {
      return const SizedBox.shrink();
    }

    final safePadding = MediaQuery.paddingOf(context);
    return Positioned(
      right: safePadding.right + 24,
      bottom:
          safePadding.bottom + _bottomActionBarHeight + _socialToActionBarGap,
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
                      padding: const EdgeInsets.all(8),
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
                    padding: const EdgeInsets.all(8),
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
    final currentUserID = widget.currentUserID;
    if (currentUserID == null) return const SizedBox.shrink();

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => unawaited(_openComments(comment: comment)),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.55,
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
              left: -10,
              top: -10,
              child: UserAvatarWidget(
                author,
                type: AvatarType.small,
                currentUserID: currentUserID,
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
        const Icon(EnteIcons.commentBubbleStroke, color: Colors.white),
        if (_commentCount > 0)
          Positioned(
            right: -4,
            top: -4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: const BorderRadius.all(Radius.circular(16)),
                border: Border.all(
                  color: Colors.black,
                  width: 2,
                  strokeAlign: BorderSide.strokeAlignOutside,
                ),
              ),
              child: Text(
                _commentCount > 99 ? "99+" : _commentCount.toString(),
                style: const TextStyle(
                  color: Colors.black,
                  fontSize: 8,
                  fontWeight: FontWeight.w500,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ),
      ],
    );
  }
}
