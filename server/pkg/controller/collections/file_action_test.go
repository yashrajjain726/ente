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
	var apiErr *ente.ApiError
	if !errors.As(err, &apiErr) || apiErr.Code != ente.BadRequest {
		t.Fatalf("MoveFiles() error = %v, want %s", err, ente.BadRequest)
	}
}
