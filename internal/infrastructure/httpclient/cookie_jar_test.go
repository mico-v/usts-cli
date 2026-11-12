package httpclient

import (
	"encoding/json"
	"testing"
)

func TestCookieJarDomainPathAndHeader(t *testing.T) {
	jar := NewCookieJar("https://jwgl.usts.edu.cn/jwglxt/")
	if !jar.SetCookie("JSESSIONID=abc; Path=/jwglxt; Secure; HttpOnly", "https://jwgl.usts.edu.cn/jwglxt/login") {
		t.Fatal("expected cookie to be stored")
	}
	if got := jar.Header("https://jwgl.usts.edu.cn/jwglxt/cjcx"); got != "JSESSIONID=abc" {
		t.Fatalf("header = %q", got)
	}
	if got := jar.Header("https://jwgl.usts.edu.cn/other"); got != "" {
		t.Fatalf("cookie leaked outside path: %q", got)
	}
	if got := jar.Header("http://jwgl.usts.edu.cn/jwglxt/cjcx"); got != "" {
		t.Fatalf("secure cookie leaked over HTTP: %q", got)
	}
}

func TestCookieJarImportAndRestore(t *testing.T) {
	jar := NewCookieJar("https://jwgl.usts.edu.cn/jwglxt/")
	jar.ImportCookieHeader("JSESSIONID=one; __jsluid_s=two", "https://jwgl.usts.edu.cn/jwglxt/")
	if jar.Size() != 2 {
		t.Fatalf("cookie count = %d, want 2", jar.Size())
	}
	serialized := jar.Serialize()
	other := NewCookieJar("https://jwgl.usts.edu.cn/jwglxt/")
	raw, _ := jsonMarshal(serialized)
	other.Restore(raw)
	if got := other.Header("https://jwgl.usts.edu.cn/jwglxt/"); got != "JSESSIONID=one; __jsluid_s=two" {
		t.Fatalf("restored header = %q", got)
	}
}

func TestCookieJarExpirationOnlyDeletesMatchingPath(t *testing.T) {
	jar := NewCookieJar("https://jwgl.usts.edu.cn/")
	jar.SetCookie("sid=foo; Path=/foo", "https://jwgl.usts.edu.cn/foo/a")
	jar.SetCookie("sid=bar; Path=/bar", "https://jwgl.usts.edu.cn/bar/a")
	jar.SetCookie("sid=; Path=/foo; Max-Age=0", "https://jwgl.usts.edu.cn/foo/a")
	if got := jar.Header("https://jwgl.usts.edu.cn/foo/a"); got != "" {
		t.Fatalf("/foo cookie still present: %q", got)
	}
	if got := jar.Header("https://jwgl.usts.edu.cn/bar/a"); got != "sid=bar" {
		t.Fatalf("/bar cookie was deleted: %q", got)
	}
}

func jsonMarshal(value any) ([]byte, error) {
	return json.Marshal(value)
}
