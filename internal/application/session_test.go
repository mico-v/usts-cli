package application

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
)

type fakeSessionPort struct {
	restore    bool
	probe      domain.SessionState
	probeDelay time.Duration
	login      domain.LoginResponse
	probeCalls atomic.Int32
	loginCalls atomic.Int32
}

func (f *fakeSessionPort) RestoreSession() bool { return f.restore }

func (f *fakeSessionPort) LastLoginAt() (time.Time, bool) { return time.Time{}, false }

func (f *fakeSessionPort) ProbeSession(context.Context) domain.SessionState {
	f.probeCalls.Add(1)
	if f.probeDelay > 0 {
		time.Sleep(f.probeDelay)
	}
	return f.probe
}

func (f *fakeSessionPort) LoginFromEnvironment(context.Context) domain.LoginResponse {
	f.loginCalls.Add(1)
	return f.login
}

func TestSessionManagerFailOpenOnUnknown(t *testing.T) {
	port := &fakeSessionPort{restore: true, probe: domain.SessionUnknown}
	manager := NewSessionManager(port, SessionManagerOptions{Now: time.Now})
	if got := manager.Ensure(context.Background(), false); got != domain.SessionLookupUnknown {
		t.Fatalf("Ensure() = %s, want unknown", got)
	}
	if port.loginCalls.Load() != 0 {
		t.Fatal("unknown probe must not trigger login")
	}
}

func TestSessionManagerRecoversExpiredSession(t *testing.T) {
	port := &fakeSessionPort{
		restore: true, probe: domain.SessionExpired,
		login: domain.LoginResponse{Success: true},
	}
	manager := NewSessionManager(port, SessionManagerOptions{Now: time.Now})
	if got := manager.Ensure(context.Background(), false); got != domain.SessionLookupValid {
		t.Fatalf("Ensure() = %s, want valid", got)
	}
	if port.loginCalls.Load() != 1 {
		t.Fatalf("login calls = %d, want 1", port.loginCalls.Load())
	}
}

func TestSessionManagerSingleFlight(t *testing.T) {
	port := &fakeSessionPort{
		restore: true, probe: domain.SessionValid, probeDelay: 20 * time.Millisecond,
	}
	manager := NewSessionManager(port, SessionManagerOptions{Now: time.Now})
	var wait sync.WaitGroup
	for index := 0; index < 8; index++ {
		wait.Add(1)
		go func() {
			defer wait.Done()
			if got := manager.Ensure(context.Background(), true); got != domain.SessionLookupValid {
				t.Errorf("Ensure() = %s, want valid", got)
			}
		}()
	}
	wait.Wait()
	if port.probeCalls.Load() != 1 {
		t.Fatalf("probe calls = %d, want 1", port.probeCalls.Load())
	}
}

func TestSessionManagerRecoveryCooldown(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	port := &fakeSessionPort{
		restore: true, probe: domain.SessionExpired,
		login: domain.LoginResponse{Success: false, ErrorCode: domain.CodeInvalidCredentials, Message: "bad"},
	}
	manager := NewSessionManager(port, SessionManagerOptions{
		Now:              func() time.Time { return now },
		RecoveryCooldown: time.Minute,
	})
	first := manager.Recover(context.Background())
	if first.OK {
		t.Fatal("first recovery should fail")
	}
	second := manager.Recover(context.Background())
	if second.OK || second.Reason != domain.RecoveryCooldown {
		t.Fatalf("second recovery = %#v, want cooldown", second)
	}
	if port.loginCalls.Load() != 1 {
		t.Fatalf("login calls = %d, want 1", port.loginCalls.Load())
	}
}
