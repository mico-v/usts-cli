package sessionstore

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func TestFileStoreRoundTripAndPermissions(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "session.json")
	store := New(path)
	input := PersistedSession{
		SchemaVersion: 1,
		Origin:        "https://jwgl.usts.edu.cn",
		Cookies: []httpclient.StoredCookie{{
			Name: "JSESSIONID", Value: "abc", Domain: "jwgl.usts.edu.cn",
			Path: "/jwglxt", HostOnly: true, Secure: true,
		}},
		Username: "2025T000001",
	}
	if err := store.Save(input); err != nil {
		t.Fatal(err)
	}
	loaded, err := store.Load()
	if err != nil || loaded == nil {
		t.Fatalf("Load() = %#v, %v", loaded, err)
	}
	if loaded.Origin != input.Origin || loaded.Username != input.Username || len(loaded.Cookies) != 1 {
		t.Fatalf("unexpected session: %#v", loaded)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm()&0o077 != 0 {
			t.Fatalf("session permissions = %o", info.Mode().Perm())
		}
	}
	input.Username = "2025T000002"
	if err := store.Save(input); err != nil {
		t.Fatalf("overwrite session: %v", err)
	}
	loaded, err = store.Load()
	if err != nil || loaded == nil || loaded.Username != "2025T000002" {
		t.Fatalf("overwritten session = %#v, %v", loaded, err)
	}
	removed, err := store.Remove()
	if err != nil || !removed {
		t.Fatalf("Remove() = %v, %v", removed, err)
	}
	removed, err = store.Remove()
	if err != nil || removed {
		t.Fatalf("second Remove() = %v, %v", removed, err)
	}
}

func TestFileStoreRejectsSessionWithoutOrigin(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"cookies":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	loaded, err := New(path).Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded != nil {
		t.Fatalf("expected session without origin to be rejected: %#v", loaded)
	}
}

func TestFileStoreRejectsWeakPermissionsOnUnix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("POSIX permissions are not enforced on Windows")
	}
	path := filepath.Join(t.TempDir(), "session.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":1,"origin":"https://jwgl.usts.edu.cn","cookies":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := New(path).Load()
	if err != nil {
		t.Fatal(err)
	}
	if loaded != nil {
		t.Fatalf("expected weak-permission session to be rejected: %#v", loaded)
	}
}
