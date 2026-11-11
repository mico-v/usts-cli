package architecture_test

import (
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func repositoryRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate architecture test")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", ".."))
}

func goFiles(t *testing.T, root string) []string {
	t.Helper()
	var files []string
	err := filepath.WalkDir(filepath.Join(root, "internal"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && strings.HasSuffix(path, ".go") && !strings.HasSuffix(path, "_test.go") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return files
}

func TestDependencyDirection(t *testing.T) {
	root := repositoryRoot(t)
	for _, file := range goFiles(t, root) {
		relative, err := filepath.Rel(root, file)
		if err != nil {
			t.Fatal(err)
		}
		relative = filepath.ToSlash(relative)
		parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatalf("%s: %v", relative, err)
		}
		for _, imported := range parsed.Imports {
			path, err := strconv.Unquote(imported.Path.Value)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(path, "github.com/mico-v/usts-cli/") {
				continue
			}
			forbidden := forbiddenImports(relative)
			for _, prefix := range forbidden {
				if strings.HasPrefix(path, "github.com/mico-v/usts-cli/"+prefix) {
					t.Errorf("%s imports forbidden package %s", relative, path)
				}
			}
		}
	}
}

func forbiddenImports(file string) []string {
	switch {
	case strings.HasPrefix(file, "internal/domain/"):
		return []string{"internal/application", "internal/cli", "internal/config", "internal/infrastructure", "cmd/"}
	case strings.HasPrefix(file, "internal/application/"):
		return []string{"internal/cli", "internal/config", "internal/infrastructure", "cmd/"}
	case strings.HasPrefix(file, "internal/infrastructure/"):
		return []string{"internal/cli", "cmd/"}
	case strings.HasPrefix(file, "internal/cli/"):
		return []string{"cmd/"}
	default:
		return []string{"cmd/"}
	}
}

func TestSourceFilesStayBelowEightHundredLines(t *testing.T) {
	root := repositoryRoot(t)
	for _, file := range goFiles(t, root) {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		lines := strings.Count(string(data), "\n")
		if len(data) > 0 && data[len(data)-1] != '\n' {
			lines++
		}
		if lines > 800 {
			relative, _ := filepath.Rel(root, file)
			t.Errorf("%s has %d lines; keep source files below 800", filepath.ToSlash(relative), lines)
		}
	}
}
