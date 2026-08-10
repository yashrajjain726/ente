package pkg

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerateUniqueFileName(t *testing.T) {
	existingFilenames := make(map[string]bool)
	testFilename := "FullSizeRender.jpg"

	existingFilenames[strings.ToLower(testFilename)] = true

	a := &albumDiskInfo{
		FileNames: &existingFilenames,
	}

	extension := filepath.Ext(testFilename)
	baseFileName := strings.TrimSuffix(filepath.Clean(filepath.Base(testFilename)), extension)

	for range 100 {
		newFilename := a.GenerateUniqueFileName(baseFileName, extension)
		if strings.Contains(newFilename, "_1_2") {
			t.Fatalf("Filename contained _1_2")
		} else {
			existingFilenames[strings.ToLower(newFilename)] = true
		}
	}
}
