import "dart:async";
import "dart:math" as math;

import "package:flutter/material.dart";

const double _kZoomEpsilon = 0.001;

enum ImageZoomStage { initial, covering, originalSize, gesture }

typedef ImageZoomLoadingBuilder =
    Widget Function(BuildContext context, ImageChunkEvent? progress);

@immutable
class ImageZoomTransform {
  static const identity = ImageZoomTransform(scale: 1.0, offset: Offset.zero);

  final double scale;
  final Offset offset;

  const ImageZoomTransform({required this.scale, required this.offset});

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ImageZoomTransform &&
          other.scale == scale &&
          other.offset == offset;

  @override
  int get hashCode => Object.hash(scale, offset);
}

abstract interface class _ImageZoomControllerDelegate {
  Future<void> reset({required bool animated});
}

class ImageZoomController extends ChangeNotifier {
  ImageZoomTransform _transform = ImageZoomTransform.identity;
  ImageZoomStage _stage = ImageZoomStage.initial;
  _ImageZoomControllerDelegate? _delegate;

  ImageZoomTransform get transform => _transform;
  ImageZoomStage get stage => _stage;

  bool get isZoomed =>
      (_transform.scale - 1.0).abs() > _kZoomEpsilon ||
      _transform.offset.distanceSquared > _kZoomEpsilon * _kZoomEpsilon;

  Future<void> reset({bool animated = true}) async {
    await _delegate?.reset(animated: animated);
  }

  void _attach(_ImageZoomControllerDelegate delegate) {
    if (_delegate != null && !identical(_delegate, delegate)) {
      throw StateError(
        "An ImageZoomController cannot be attached to multiple viewers.",
      );
    }
    _delegate = delegate;
  }

  void _detach(_ImageZoomControllerDelegate delegate) {
    if (identical(_delegate, delegate)) {
      _delegate = null;
    }
  }

  void _update(ImageZoomTransform transform, ImageZoomStage stage) {
    if (_transform == transform && _stage == stage) return;
    _transform = transform;
    _stage = stage;
    notifyListeners();
  }
}

class ImageZoomViewer extends StatefulWidget {
  final ImageProvider imageProvider;
  final ImageZoomController? controller;
  final Size? imageSizeHint;
  final Object? heroTag;
  final Decoration? backgroundDecoration;
  final BoxFit initialFit;
  final double maxScaleOverCover;
  final FilterQuality filterQuality;
  final bool gaplessPlayback;
  final bool gesturesEnabled;
  final ImageZoomLoadingBuilder? loadingBuilder;
  final ImageErrorWidgetBuilder? errorBuilder;
  final String? semanticLabel;
  final ValueChanged<bool>? onInteractionLockChanged;
  final Duration animationDuration;

  const ImageZoomViewer({
    super.key,
    required this.imageProvider,
    this.controller,
    this.imageSizeHint,
    this.heroTag,
    this.backgroundDecoration,
    this.initialFit = BoxFit.contain,
    this.maxScaleOverCover = double.infinity,
    this.filterQuality = FilterQuality.high,
    this.gaplessPlayback = true,
    this.gesturesEnabled = true,
    this.loadingBuilder,
    this.errorBuilder,
    this.semanticLabel,
    this.onInteractionLockChanged,
    this.animationDuration = const Duration(milliseconds: 220),
  }) : assert(initialFit == BoxFit.contain || initialFit == BoxFit.cover),
       assert(maxScaleOverCover > 0);

  @override
  State<ImageZoomViewer> createState() => _ImageZoomViewerState();
}

class _ImageZoomViewerState extends State<ImageZoomViewer>
    with SingleTickerProviderStateMixin
    implements _ImageZoomControllerDelegate {
  late ImageZoomController _controller;
  late bool _ownsController;
  late final _BoundedTransformationController _transformationController;
  late final AnimationController _animationController;

  Animation<Matrix4>? _matrixAnimation;
  Completer<void>? _animationCompleter;
  ImageZoomStage _stage = ImageZoomStage.initial;

  ImageStream? _imageStream;
  ImageStreamListener? _imageStreamListener;
  Size? _resolvedImageSize;
  ImageChunkEvent? _loadingProgress;
  Object? _imageError;
  StackTrace? _imageErrorStack;
  bool _hasImageFrame = false;

  Size? _viewportSize;
  Size? _fittedImageSize;
  double _initialScale = 1.0;
  double _coverScale = 1.0;
  double _originalScale = 1.0;
  double _maxScale = double.infinity;

  final Map<int, Offset> _pointerPositions = <int, Offset>{};
  List<int> _manualPinchPointers = const <int>[];
  Matrix4? _manualPinchStartMatrix;
  Offset? _manualPinchScenePoint;
  double _manualPinchStartDistance = 0;
  bool _manualPinchActive = false;
  bool _programmaticAnimationActive = false;
  bool _interactionLocked = false;
  bool _interactiveViewerEnabled = false;
  int _interactiveViewerGeneration = 0;
  double? _interactiveStartScale;
  Offset? _doubleTapPosition;
  int _geometryGeneration = 0;

  bool get _hasGeometry =>
      _viewportSize != null &&
      _fittedImageSize != null &&
      _viewportSize!.width > 0 &&
      _viewportSize!.height > 0 &&
      _fittedImageSize!.width > 0 &&
      _fittedImageSize!.height > 0;

  @override
  void initState() {
    super.initState();
    _resolvedImageSize = _validSize(widget.imageSizeHint);
    _attachController(widget.controller);
    _transformationController = _BoundedTransformationController()
      ..addListener(_onTransformationChanged);
    _animationController =
        AnimationController(vsync: this, duration: widget.animationDuration)
          ..addListener(_onAnimationTick)
          ..addStatusListener(_onAnimationStatusChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolveImage();
  }

  @override
  void didUpdateWidget(covariant ImageZoomViewer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      _detachController();
      _attachController(widget.controller);
      _publishTransform();
    }
    if (oldWidget.imageProvider != widget.imageProvider) {
      final hint = _validSize(widget.imageSizeHint);
      if (!_hasImageFrame && hint != null) {
        _resolvedImageSize = hint;
      }
      _resolveImage();
      if (_stage != ImageZoomStage.initial) {
        _stage = ImageZoomStage.gesture;
      }
    } else if (oldWidget.imageSizeHint != widget.imageSizeHint &&
        !_hasImageFrame) {
      _resolvedImageSize = _validSize(widget.imageSizeHint);
    }
    if (oldWidget.animationDuration != widget.animationDuration) {
      _animationController.duration = widget.animationDuration;
    }
    if (oldWidget.gesturesEnabled && !widget.gesturesEnabled) {
      _pointerPositions.clear();
      _manualPinchActive = false;
      _updateInteractionLock();
    }
  }

  void _attachController(ImageZoomController? controller) {
    _ownsController = controller == null;
    _controller = controller ?? ImageZoomController();
    _controller._attach(this);
  }

  void _detachController() {
    _controller._detach(this);
    if (_ownsController) {
      _controller.dispose();
    }
  }

  @override
  void dispose() {
    _detachImageStreamListener();
    _animationController
      ..removeListener(_onAnimationTick)
      ..removeStatusListener(_onAnimationStatusChanged)
      ..dispose();
    _animationCompleter?.complete();
    _transformationController
      ..removeListener(_onTransformationChanged)
      ..dispose();
    _detachController();
    super.dispose();
  }

  void _resolveImage() {
    final newStream = widget.imageProvider.resolve(
      createLocalImageConfiguration(context),
    );
    if (_imageStream?.key == newStream.key) return;
    _detachImageStreamListener();
    _imageStream = newStream;
    _imageStreamListener = ImageStreamListener(
      _handleImageFrame,
      onChunk: _handleImageChunk,
      onError: _handleImageError,
    );
    newStream.addListener(_imageStreamListener!);
  }

  void _detachImageStreamListener() {
    final listener = _imageStreamListener;
    if (_imageStream != null && listener != null) {
      _imageStream!.removeListener(listener);
    }
    _imageStreamListener = null;
  }

  void _handleImageFrame(ImageInfo imageInfo, bool synchronousCall) {
    final imageSize = Size(
      imageInfo.image.width.toDouble(),
      imageInfo.image.height.toDouble(),
    );
    final shouldUpdate =
        !_hasImageFrame ||
        _resolvedImageSize != imageSize ||
        _loadingProgress != null ||
        _imageError != null;
    if (!shouldUpdate) {
      imageInfo.dispose();
      return;
    }
    void update() {
      _resolvedImageSize = imageSize;
      _hasImageFrame = true;
      _loadingProgress = null;
      _imageError = null;
      _imageErrorStack = null;
    }

    if (synchronousCall) {
      update();
    } else if (mounted) {
      setState(update);
    }
    imageInfo.dispose();
  }

  void _handleImageChunk(ImageChunkEvent progress) {
    if (!mounted || _hasImageFrame) return;
    setState(() {
      _loadingProgress = progress;
      _imageError = null;
      _imageErrorStack = null;
    });
  }

  void _handleImageError(Object error, StackTrace? stackTrace) {
    if (!mounted || _hasImageFrame) return;
    setState(() {
      _imageError = error;
      _imageErrorStack = stackTrace;
      _loadingProgress = null;
    });
  }

  Size? _validSize(Size? size) {
    if (size == null ||
        !size.width.isFinite ||
        !size.height.isFinite ||
        size.width <= 0 ||
        size.height <= 0) {
      return null;
    }
    return size;
  }

  void _updateGeometry(Size viewportSize, Size imageSize) {
    final fittedSize = applyBoxFit(
      BoxFit.contain,
      imageSize,
      viewportSize,
    ).destination;
    if (fittedSize.isEmpty) return;

    final previousViewport = _viewportSize;
    final previousFittedSize = _fittedImageSize;
    final previousInitialScale = _initialScale;
    final previousMatrix = _transformationController.value.clone();
    final hadGeometry = _hasGeometry;

    final coverScale = math.max(
      viewportSize.width / fittedSize.width,
      viewportSize.height / fittedSize.height,
    );
    final initialScale = widget.initialFit == BoxFit.cover ? coverScale : 1.0;
    final originalScale = math.max(
      imageSize.width / fittedSize.width,
      imageSize.height / fittedSize.height,
    );
    final maxScale = widget.maxScaleOverCover.isInfinite
        ? double.infinity
        : math.max(initialScale, coverScale * widget.maxScaleOverCover);

    final geometryUnchanged =
        viewportSize == previousViewport &&
        fittedSize == previousFittedSize &&
        initialScale == previousInitialScale &&
        coverScale == _coverScale &&
        originalScale == _originalScale &&
        maxScale == _maxScale;
    if (geometryUnchanged) return;

    final coordinateGeometryChanged =
        hadGeometry &&
        previousViewport != null &&
        previousFittedSize != null &&
        (!_sizesNearlyEqual(viewportSize, previousViewport) ||
            !_sizesNearlyEqual(fittedSize, previousFittedSize) ||
            (initialScale - previousInitialScale).abs() > _kZoomEpsilon);
    if (coordinateGeometryChanged && _programmaticAnimationActive) {
      _stopProgrammaticAnimationForGeometryChange();
    }

    _viewportSize = viewportSize;
    _fittedImageSize = fittedSize;
    _initialScale = initialScale;
    _coverScale = coverScale;
    _originalScale = originalScale;
    _maxScale = maxScale;
    _transformationController.configure(
      viewportSize: viewportSize,
      fittedImageSize: fittedSize,
      minScale: initialScale,
      maxScale: maxScale,
    );

    if (!hadGeometry ||
        previousViewport == null ||
        previousFittedSize == null) {
      _transformationController.setOwnerValue(
        _matrixForScaleAndOffset(initialScale, Offset.zero),
      );
      _stage = ImageZoomStage.initial;
      _publishTransform();
      return;
    }

    final generation = ++_geometryGeneration;
    final wasInitial = _isMatrixAtInitial(
      previousMatrix,
      viewport: previousViewport,
      initialScale: previousInitialScale,
    );
    final previousScale = previousMatrix.getMaxScaleOnAxis();
    final relativeScale = previousInitialScale > 0
        ? previousScale / previousInitialScale
        : 1.0;
    final previousSceneCenter = _scenePoint(
      previousMatrix,
      previousViewport.center(Offset.zero),
    );
    final previousRect = Alignment.center.inscribe(
      previousFittedSize,
      Offset.zero & previousViewport,
    );
    final normalizedFocus = Offset(
      (previousSceneCenter.dx - previousRect.left) / previousRect.width,
      (previousSceneCenter.dy - previousRect.top) / previousRect.height,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || generation != _geometryGeneration) return;
      if (wasInitial) {
        _transformationController.setOwnerValue(
          _matrixForScaleAndOffset(_initialScale, Offset.zero),
        );
        _stage = ImageZoomStage.initial;
      } else {
        final targetScale = (_initialScale * relativeScale).clamp(
          _initialScale,
          _maxScale,
        );
        final newRect = Alignment.center.inscribe(
          _fittedImageSize!,
          Offset.zero & _viewportSize!,
        );
        final newSceneFocus = Offset(
          newRect.left + normalizedFocus.dx * newRect.width,
          newRect.top + normalizedFocus.dy * newRect.height,
        );
        final center = _viewportSize!.center(Offset.zero);
        final translation = center - newSceneFocus * targetScale;
        _transformationController.setOwnerValue(
          _matrixForScaleAndTranslation(targetScale, translation),
        );
        _stage = ImageZoomStage.gesture;
      }
      _publishTransform();
    });
  }

  Matrix4 _matrixForScaleAndOffset(double scale, Offset offset) {
    final center = _viewportSize!.center(Offset.zero);
    return _matrixForScaleAndTranslation(
      scale,
      offset - (center * (scale - 1.0)),
    );
  }

  Matrix4 _matrixForScaleAndTranslation(double scale, Offset translation) =>
      Matrix4.identity()
        ..translateByDouble(translation.dx, translation.dy, 0, 1)
        ..scaleByDouble(scale, scale, 1, 1);

  Offset _scenePoint(Matrix4 matrix, Offset viewportPoint) {
    final inverse = Matrix4.tryInvert(matrix);
    return inverse == null
        ? viewportPoint
        : MatrixUtils.transformPoint(inverse, viewportPoint);
  }

  bool _isMatrixAtInitial(
    Matrix4 matrix, {
    Size? viewport,
    double? initialScale,
  }) {
    final size = viewport ?? _viewportSize;
    final scale = initialScale ?? _initialScale;
    if (size == null) return true;
    final actualScale = matrix.getMaxScaleOnAxis();
    final center = size.center(Offset.zero);
    final translation = Offset(matrix.storage[12], matrix.storage[13]);
    final offset = translation + center * (actualScale - 1.0);
    return (actualScale / scale - 1.0).abs() <= _kZoomEpsilon &&
        offset.distanceSquared <= _kZoomEpsilon * _kZoomEpsilon;
  }

  void _onTransformationChanged() {
    if (!_hasGeometry) return;
    _publishTransform();
    _syncInteractiveViewerEnabled();
  }

  void _syncInteractiveViewerEnabled() {
    final shouldEnable =
        widget.gesturesEnabled &&
        !_manualPinchActive &&
        (_interactiveStartScale != null ||
            !_isMatrixAtInitial(_transformationController.value));
    if (_interactiveViewerEnabled != shouldEnable && mounted) {
      setState(() => _interactiveViewerEnabled = shouldEnable);
    }
  }

  void _publishTransform() {
    if (!_hasGeometry) return;
    final matrix = _transformationController.value;
    final scale = matrix.getMaxScaleOnAxis();
    final relativeScale = scale / _initialScale;
    final center = _viewportSize!.center(Offset.zero);
    final translation = Offset(matrix.storage[12], matrix.storage[13]);
    final offset = translation + center * (scale - 1.0);
    final isInitial =
        (relativeScale - 1.0).abs() <= _kZoomEpsilon &&
        offset.distanceSquared <= _kZoomEpsilon * _kZoomEpsilon;
    if (isInitial) {
      _stage = ImageZoomStage.initial;
    }
    _controller._update(
      isInitial
          ? ImageZoomTransform.identity
          : ImageZoomTransform(scale: relativeScale, offset: offset),
      _stage,
    );
    _updateInteractionLock();
  }

  void _updateInteractionLock() {
    final shouldLock =
        widget.gesturesEnabled &&
        (_pointerPositions.length >= 2 ||
            _manualPinchActive ||
            _programmaticAnimationActive ||
            _controller.isZoomed);
    if (shouldLock == _interactionLocked) return;
    _interactionLocked = shouldLock;
    widget.onInteractionLockChanged?.call(shouldLock);
  }

  void _onPointerDown(PointerDownEvent event) {
    if (!widget.gesturesEnabled) return;
    _pointerPositions[event.pointer] = event.localPosition;
    if (_animationController.isAnimating) {
      _stopProgrammaticAnimation();
    }
    if (_manualPinchActive &&
        _pointerPositions.length >= 2 &&
        !_manualPinchPointers.every(_pointerPositions.containsKey)) {
      _beginManualPinch();
    } else if (_pointerPositions.length >= 2 &&
        !_manualPinchActive &&
        _isMatrixAtInitial(_transformationController.value)) {
      _beginManualPinch();
    }
    _updateInteractionLock();
  }

  void _onPointerMove(PointerMoveEvent event) {
    if (!widget.gesturesEnabled ||
        !_pointerPositions.containsKey(event.pointer)) {
      return;
    }
    _pointerPositions[event.pointer] = event.localPosition;
    if (_manualPinchActive) {
      _updateManualPinch();
    }
  }

  void _onPointerUp(PointerEvent event) {
    if (!widget.gesturesEnabled) return;
    _pointerPositions.remove(event.pointer);
    if (_manualPinchActive &&
        !_manualPinchPointers.every(_pointerPositions.containsKey)) {
      if (_pointerPositions.length >= 2) {
        _beginManualPinch();
      } else if (_pointerPositions.isEmpty) {
        _endManualPinch();
      }
    }
    _updateInteractionLock();
  }

  void _beginManualPinch() {
    if (_pointerPositions.length < 2) return;
    _transformationController.allowInteractiveWrites();
    _manualPinchActive = true;
    _manualPinchPointers = _pointerPositions.keys
        .take(2)
        .toList(growable: false);
    final first = _pointerPositions[_manualPinchPointers[0]]!;
    final second = _pointerPositions[_manualPinchPointers[1]]!;
    final focalPoint = (first + second) / 2;
    _manualPinchStartDistance = (first - second).distance;
    _manualPinchStartMatrix = _transformationController.value.clone();
    _manualPinchScenePoint = _scenePoint(_manualPinchStartMatrix!, focalPoint);
    if (mounted) setState(() {});
  }

  void _updateManualPinch() {
    if (!_hasGeometry ||
        _manualPinchStartDistance <= 0 ||
        _manualPinchStartMatrix == null ||
        _manualPinchScenePoint == null ||
        !_manualPinchPointers.every(_pointerPositions.containsKey)) {
      return;
    }
    final first = _pointerPositions[_manualPinchPointers[0]]!;
    final second = _pointerPositions[_manualPinchPointers[1]]!;
    final distance = (first - second).distance;
    final focalPoint = (first + second) / 2;
    final startScale = _manualPinchStartMatrix!.getMaxScaleOnAxis();
    final targetScale = (startScale * distance / _manualPinchStartDistance)
        .clamp(_initialScale, _maxScale);
    final translation = focalPoint - _manualPinchScenePoint! * targetScale;
    _stage = ImageZoomStage.gesture;
    _transformationController.setOwnerValue(
      _matrixForScaleAndTranslation(targetScale, translation),
    );
  }

  void _endManualPinch() {
    _manualPinchActive = false;
    _manualPinchPointers = const <int>[];
    _manualPinchStartMatrix = null;
    _manualPinchScenePoint = null;
    if (_isMatrixAtInitial(_transformationController.value)) {
      _stage = ImageZoomStage.initial;
      _transformationController.setOwnerValue(
        _matrixForScaleAndOffset(_initialScale, Offset.zero),
      );
    }
    _publishTransform();
    _syncInteractiveViewerEnabled();
  }

  void _onInteractionStart(ScaleStartDetails _) {
    _transformationController.allowInteractiveWrites();
    _interactiveStartScale = _transformationController.value
        .getMaxScaleOnAxis();
    if (_animationController.isAnimating) {
      _stopProgrammaticAnimation();
    }
  }

  void _onInteractionUpdate(ScaleUpdateDetails details) {
    if (_pointerPositions.length >= 2 &&
        (details.scale - 1.0).abs() > _kZoomEpsilon) {
      _stage = ImageZoomStage.gesture;
      _publishTransform();
    }
  }

  void _onInteractionEnd(ScaleEndDetails _) {
    _interactiveStartScale = null;
    _syncInteractiveViewerEnabled();
  }

  void _onDoubleTapDown(TapDownDetails details) {
    _doubleTapPosition = details.localPosition;
  }

  void _onDoubleTapCancel() {
    _doubleTapPosition = null;
  }

  void _onDoubleTap() {
    final tapPosition = _doubleTapPosition;
    _doubleTapPosition = null;
    if (!_hasGeometry || tapPosition == null) return;

    final currentScale = _transformationController.value.getMaxScaleOnAxis();
    final nextStage = _nextDistinctStage(currentScale);
    if (nextStage == null) return;
    final targetScale = _scaleForStage(nextStage);
    late final Matrix4 target;
    if (nextStage == ImageZoomStage.initial) {
      target = _matrixForScaleAndOffset(_initialScale, Offset.zero);
    } else {
      final scenePoint = _transformationController.toScene(tapPosition);
      final center = _viewportSize!.center(Offset.zero);
      target = _matrixForScaleAndTranslation(
        targetScale,
        center - scenePoint * targetScale,
      );
    }
    unawaited(_animateTo(target, nextStage));
  }

  ImageZoomStage? _nextDistinctStage(double currentScale) {
    if (_stage == ImageZoomStage.gesture) return ImageZoomStage.initial;
    var candidate = _stage;
    for (var i = 0; i < 3; i++) {
      candidate = switch (candidate) {
        ImageZoomStage.initial => ImageZoomStage.covering,
        ImageZoomStage.covering => ImageZoomStage.originalSize,
        ImageZoomStage.originalSize ||
        ImageZoomStage.gesture => ImageZoomStage.initial,
      };
      final targetScale = _scaleForStage(candidate);
      if ((targetScale - currentScale).abs() > _kZoomEpsilon) {
        return candidate;
      }
    }
    return null;
  }

  double _scaleForStage(ImageZoomStage stage) {
    final scale = switch (stage) {
      ImageZoomStage.initial || ImageZoomStage.gesture => _initialScale,
      ImageZoomStage.covering => _coverScale,
      ImageZoomStage.originalSize => _originalScale,
    };
    return scale.clamp(_initialScale, _maxScale);
  }

  @override
  Future<void> reset({required bool animated}) {
    if (!_hasGeometry) {
      _stage = ImageZoomStage.initial;
      _controller._update(ImageZoomTransform.identity, _stage);
      return Future<void>.value();
    }
    final target = _matrixForScaleAndOffset(_initialScale, Offset.zero);
    if (!animated) {
      _stopProgrammaticAnimation();
      _stage = ImageZoomStage.initial;
      _transformationController
        ..suppressInteractiveWrites()
        ..setOwnerValue(target);
      _publishTransform();
      return Future<void>.value();
    }
    return _animateTo(target, ImageZoomStage.initial);
  }

  Future<void> _animateTo(Matrix4 target, ImageZoomStage targetStage) {
    _animationController.stop();
    _animationCompleter?.complete();
    final completer = Completer<void>();
    _animationCompleter = completer;
    _stage = targetStage;
    _programmaticAnimationActive = true;
    _transformationController.suppressInteractiveWrites();
    _matrixAnimation =
        Matrix4Tween(
          begin: _transformationController.value.clone(),
          end: _transformationController.sanitize(target),
        ).animate(
          CurvedAnimation(
            parent: _animationController,
            curve: Curves.easeOutCubic,
          ),
        );
    _interactiveViewerGeneration++;
    _updateInteractionLock();
    if (mounted) setState(() {});
    _animationController.forward(from: 0);
    return completer.future;
  }

  void _onAnimationTick() {
    final value = _matrixAnimation?.value;
    if (value != null) {
      _transformationController.setOwnerValue(value);
    }
  }

  void _onAnimationStatusChanged(AnimationStatus status) {
    if (status != AnimationStatus.completed) return;
    _programmaticAnimationActive = false;
    _matrixAnimation = null;
    _publishTransform();
    _animationCompleter?.complete();
    _animationCompleter = null;
    _updateInteractionLock();
  }

  void _stopProgrammaticAnimation() {
    if (!_animationController.isAnimating && !_programmaticAnimationActive) {
      return;
    }
    _animationController.stop();
    _programmaticAnimationActive = false;
    _matrixAnimation = null;
    _animationCompleter?.complete();
    _animationCompleter = null;
    _updateInteractionLock();
  }

  // Geometry is updated from LayoutBuilder. Avoid invoking the interaction
  // callback there; the post-frame geometry rebase publishes the new lock.
  void _stopProgrammaticAnimationForGeometryChange() {
    _animationController.stop();
    _programmaticAnimationActive = false;
    _matrixAnimation = null;
    _animationCompleter?.complete();
    _animationCompleter = null;
  }

  @override
  Widget build(BuildContext context) {
    if (_imageError != null && !_hasImageFrame) {
      return widget.errorBuilder?.call(
            context,
            _imageError!,
            _imageErrorStack,
          ) ??
          const Center(child: Icon(Icons.broken_image_outlined));
    }
    if (!_hasImageFrame || _resolvedImageSize == null) {
      return widget.loadingBuilder?.call(context, _loadingProgress) ??
          const Center(child: CircularProgressIndicator());
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final viewportSize = constraints.biggest;
        if (viewportSize.isEmpty || !viewportSize.isFinite) {
          return const SizedBox.shrink();
        }
        _updateGeometry(viewportSize, _resolvedImageSize!);
        final fittedSize = applyBoxFit(
          BoxFit.contain,
          _resolvedImageSize!,
          viewportSize,
        ).destination;

        Widget image = Image(
          image: widget.imageProvider,
          width: fittedSize.width,
          height: fittedSize.height,
          fit: BoxFit.fill,
          gaplessPlayback: widget.gaplessPlayback,
          filterQuality: widget.filterQuality,
          semanticLabel: widget.semanticLabel,
          errorBuilder: widget.errorBuilder,
        );
        if (widget.heroTag != null) {
          image = Hero(tag: widget.heroTag!, child: image);
        }

        final transformedChild = SizedBox.expand(
          child: Center(
            child: SizedBox(
              width: fittedSize.width,
              height: fittedSize.height,
              child: image,
            ),
          ),
        );
        final interactiveViewer = InteractiveViewer(
          key: ValueKey(_interactiveViewerGeneration),
          transformationController: _transformationController,
          alignment: null,
          minScale: _initialScale,
          maxScale: _maxScale,
          panEnabled: true,
          scaleEnabled: true,
          clipBehavior: Clip.hardEdge,
          onInteractionStart: _onInteractionStart,
          onInteractionUpdate: _onInteractionUpdate,
          onInteractionEnd: _onInteractionEnd,
          child: transformedChild,
        );

        final content = GestureDetector(
          behavior: HitTestBehavior.opaque,
          onDoubleTapDown: widget.gesturesEnabled ? _onDoubleTapDown : null,
          onDoubleTap: widget.gesturesEnabled ? _onDoubleTap : null,
          onDoubleTapCancel: widget.gesturesEnabled ? _onDoubleTapCancel : null,
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: widget.gesturesEnabled ? _onPointerDown : null,
            onPointerMove: widget.gesturesEnabled ? _onPointerMove : null,
            onPointerUp: widget.gesturesEnabled ? _onPointerUp : null,
            onPointerCancel: widget.gesturesEnabled ? _onPointerUp : null,
            child: IgnorePointer(
              ignoring:
                  !widget.gesturesEnabled ||
                  _manualPinchActive ||
                  !_interactiveViewerEnabled,
              child: interactiveViewer,
            ),
          ),
        );

        return DecoratedBox(
          decoration:
              widget.backgroundDecoration ??
              const BoxDecoration(color: Colors.black),
          child: content,
        );
      },
    );
  }
}

class _BoundedTransformationController extends TransformationController {
  Size? _viewportSize;
  Size? _fittedImageSize;
  double _minScale = 1.0;
  double _maxScale = double.infinity;
  bool _ownerWrite = false;
  bool _suppressInteractiveWrites = false;

  bool get _hasGeometry => _viewportSize != null && _fittedImageSize != null;

  void configure({
    required Size viewportSize,
    required Size fittedImageSize,
    required double minScale,
    required double maxScale,
  }) {
    _viewportSize = viewportSize;
    _fittedImageSize = fittedImageSize;
    _minScale = minScale;
    _maxScale = maxScale;
  }

  void suppressInteractiveWrites() {
    _suppressInteractiveWrites = true;
  }

  void allowInteractiveWrites() {
    _suppressInteractiveWrites = false;
  }

  void setOwnerValue(Matrix4 matrix) {
    _ownerWrite = true;
    value = matrix;
    _ownerWrite = false;
  }

  @override
  set value(Matrix4 newValue) {
    if (_suppressInteractiveWrites && !_ownerWrite) return;
    final sanitized = sanitize(newValue);
    if (!_ownerWrite && _matricesNearlyEqual(value, sanitized)) return;
    super.value = sanitized;
  }

  Matrix4 sanitize(Matrix4 matrix) {
    if (!_hasGeometry) return matrix.clone();
    var scale = matrix.getMaxScaleOnAxis();
    if (!scale.isFinite || scale <= 0) scale = _minScale;
    scale = scale.clamp(_minScale, _maxScale);

    final viewportSize = _viewportSize!;
    final fittedImageSize = _fittedImageSize!;
    final center = viewportSize.center(Offset.zero);
    var translation = Offset(matrix.storage[12], matrix.storage[13]);
    if (!translation.dx.isFinite || !translation.dy.isFinite) {
      translation = -(center * (scale - 1.0));
    }
    var offset = translation + center * (scale - 1.0);
    final maxOffsetX = math.max(
      0.0,
      (fittedImageSize.width * scale - viewportSize.width) / 2,
    );
    final maxOffsetY = math.max(
      0.0,
      (fittedImageSize.height * scale - viewportSize.height) / 2,
    );
    offset = Offset(
      offset.dx.clamp(-maxOffsetX, maxOffsetX),
      offset.dy.clamp(-maxOffsetY, maxOffsetY),
    );
    translation = offset - center * (scale - 1.0);
    return Matrix4.identity()
      ..translateByDouble(translation.dx, translation.dy, 0, 1)
      ..scaleByDouble(scale, scale, 1, 1);
  }
}

bool _matricesNearlyEqual(Matrix4 first, Matrix4 second) {
  if (MatrixUtils.matrixEquals(first, second)) return true;
  for (var index = 0; index < 16; index++) {
    if ((first.storage[index] - second.storage[index]).abs() > 0.0000001) {
      return false;
    }
  }
  return true;
}

bool _sizesNearlyEqual(Size first, Size second) =>
    (first.width - second.width).abs() <= _kZoomEpsilon &&
    (first.height - second.height).abs() <= _kZoomEpsilon;
