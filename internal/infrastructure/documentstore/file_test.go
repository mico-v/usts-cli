package documentstore

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestFileStoreWritesPrivateAtomicFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "schedule.pdf")
	store := FileStore{}
	saved, err := store.Write(path, []byte("%PDF-1.7 test"), false)
	if err != nil {
		t.Fatal(err)
	}
	if saved != path {
		t.Fatalf("saved path = %s, want %s", saved, path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "%PDF-1.7 test" {
		t.Fatalf("data = %q", data)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0o077 != 0 {
			t.Fatalf("file permissions = %o", info.Mode().Perm())
		}
	}
	if _, err := store.Write(path, []byte("%PDF-1.7 replacement"), false); err == nil {
		t.Fatal("expected no-replace write to reject existing file")
	}
	if _, err := store.Write(path, []byte("%PDF-1.7 replacement"), true); err != nil {
		t.Fatalf("overwrite: %v", err)
	}
	data, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "%PDF-1.7 replacement" {
		t.Fatalf("replacement data = %q", data)
	}
}
