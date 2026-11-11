package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeBaseURLTrustBoundary(t *testing.T) {
	if _, err := NormalizeBaseURL("http://jwgl.usts.edu.cn/jwglxt", map[string]string{}); err == nil {
		t.Fatal("expected insecure HTTP to be rejected")
	}
	if _, err := NormalizeBaseURL("https://example.com/jwglxt", map[string]string{}); err == nil {
		t.Fatal("expected custom host to be rejected")
	}
	if _, err := NormalizeBaseURL("https://user:pass@jwgl.usts.edu.cn/jwglxt", map[string]string{}); err == nil {
		t.Fatal("expected URL userinfo to be rejected")
	}
	got, err := NormalizeBaseURL("http://127.0.0.1:8080/jwglxt/", map[string]string{
		"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
	})
	if err != nil {
		t.Fatalf("expected local development URL to pass: %v", err)
	}
	if got != "http://127.0.0.1:8080/jwglxt" {
		t.Fatalf("unexpected normalized URL: %s", got)
	}
}

func TestAssertSameOrigin(t *testing.T) {
	base := "https://jwgl.usts.edu.cn/jwglxt"
	if got, err := AssertSameOrigin("/download/a.pdf", base); err != nil || got != "https://jwgl.usts.edu.cn/download/a.pdf" {
		t.Fatalf("unexpected same-origin result: %q, %v", got, err)
	}
	if _, err := AssertSameOrigin("https://evil.example/a.pdf", base); err == nil {
		t.Fatal("expected cross-origin URL to be rejected")
	}
}

func TestLoadEnvFileRejectsTrustRelaxingKeysAndPreservesRealEnv(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	content := "USTS_USERNAME=file-user\nUSTS_PASSWORD=file-pass\nUSTS_ALLOW_CUSTOM_HOST=1\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	values := map[string]string{"USTS_USERNAME": "real-user"}
	rejected, err := loadEnvFile(path, values)
	if err != nil {
		t.Fatal(err)
	}
	if values["USTS_USERNAME"] != "real-user" {
		t.Fatalf("real environment was overridden: %#v", values)
	}
	if values["USTS_PASSWORD"] != "file-pass" {
		t.Fatalf("ordinary file key was not loaded: %#v", values)
	}
	if len(rejected) != 1 || rejected[0] != "USTS_ALLOW_CUSTOM_HOST" {
		t.Fatalf("rejected = %#v", rejected)
	}
}
