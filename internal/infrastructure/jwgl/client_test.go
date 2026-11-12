package jwgl

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/sessionstore"
)

func TestLogoutClearsPersistedAndInMemorySession(t *testing.T) {
	stateDir := t.TempDir()
	store := sessionstore.New(stateDir + "/session.json")
	client, err := NewClient("https://jwgl.usts.edu.cn/jwglxt", ClientOptions{SessionStore: store})
	if err != nil {
		t.Fatal(err)
	}
	client.SetCookies("JSESSIONID=abc")
	client.MarkAuthenticated("2025T000001")
	if err := client.SaveSession(); err != nil {
		t.Fatal(err)
	}
	if !client.RestoreSession() {
		t.Fatal("expected saved session to restore")
	}
	removed, err := client.Logout()
	if err != nil {
		t.Fatal(err)
	}
	if !removed {
		t.Fatal("expected session file to be removed")
	}
	if client.RestoreSession() {
		t.Fatal("logged-out client must not restore a session")
	}
	if client.LocalSession().LoggedIn {
		t.Fatal("logged-out client must report no local session")
	}
}

func TestLoginViaScriptRetriesFirstWAFResetAndPersistsSession(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatal(err)
	}
	modulus := base64.StdEncoding.EncodeToString(key.PublicKey.N.Bytes())
	exponent := base64.StdEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes())
	postCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodGet && request.URL.Path == "/jwglxt/xtgl/login_slogin.html":
			_, _ = writer.Write([]byte(`<input id="csrftoken" value="csrf-test">`))
		case request.Method == http.MethodGet && request.URL.Path == "/jwglxt/xtgl/login_getPublicKey.html":
			_ = json.NewEncoder(writer).Encode(map[string]string{"modulus": modulus, "exponent": exponent})
		case request.Method == http.MethodPost && request.URL.Path == "/jwglxt/xtgl/login_slogin.html":
			if err := request.ParseForm(); err != nil {
				t.Error(err)
				return
			}
			if values := request.Form["mm"]; len(values) != 2 {
				t.Errorf("mm values = %d, want 2", len(values))
			}
			postCount++
			if postCount == 1 {
				http.SetCookie(writer, &http.Cookie{Name: "JSESSIONID", Value: "first", Path: "/jwglxt"})
				http.Redirect(writer, request, "/xtgl/login_slogin.html", http.StatusFound)
				return
			}
			http.SetCookie(writer, &http.Cookie{Name: "JSESSIONID", Value: "second", Path: "/jwglxt"})
			http.Redirect(writer, request, "/xtgl/index_initMenu.html", http.StatusFound)
		default:
			t.Errorf("unexpected request: %s %s", request.Method, request.URL.String())
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	store := sessionstore.New(t.TempDir() + "/session.json")
	client, err := NewClient(server.URL+"/jwglxt", ClientOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
		},
		SessionStore: store,
	})
	if err != nil {
		t.Fatal(err)
	}
	response := client.LoginViaScript(context.Background(), "2025T000001", "secret")
	if !response.Success {
		t.Fatalf("login failed: %#v", response)
	}
	if postCount != 2 {
		t.Fatalf("post count = %d, want 2", postCount)
	}
	if !client.RestoreSession() {
		t.Fatal("expected successful login to be persisted")
	}
	session, err := store.Load()
	if err != nil || session == nil {
		t.Fatalf("stored session = %#v, %v", session, err)
	}
	if !strings.Contains(session.Username, "2025T000001") {
		t.Fatalf("unexpected username: %s", session.Username)
	}
}

func TestProbeSessionRequiresCompleteValidEnvelope(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		body   string
		want   domain.SessionState
	}{
		{"complete", 200, `{"items":[],"totalCount":0}`, domain.SessionValid},
		{"missing total", 200, `{"items":[]}`, domain.SessionUnknown},
		{"server error", 500, `{"items":[],"totalCount":0}`, domain.SessionUnknown},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				writer.WriteHeader(test.status)
				_, _ = writer.Write([]byte(test.body))
			}))
			defer server.Close()
			client, err := NewClient(server.URL+"/jwglxt", ClientOptions{
				Launch: map[string]string{
					"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
					"USTS_STATE_DIR": t.TempDir(),
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			client.SetCookies("JSESSIONID=test")
			if got := client.ProbeSession(context.Background()); got != test.want {
				t.Fatalf("ProbeSession() = %s, want %s", got, test.want)
			}
		})
	}
}
