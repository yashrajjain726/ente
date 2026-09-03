package collections

import (
	"errors"
	"testing"

	"github.com/ente/museum/ente"
)

func TestMoveFilesRejectsSameCollection(t *testing.T) {
	const collectionID = int64(1)
	err := (&CollectionController{}).MoveFiles(nil, ente.MoveFilesRequest{
		FromCollectionID: collectionID,
		ToCollectionID:   collectionID,
	})
	if !errors.Is(err, ente.ErrBadRequest) {
		t.Fatalf("MoveFiles() error = %v, want %v", err, ente.ErrBadRequest)
	}
}
