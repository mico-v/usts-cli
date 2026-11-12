package domain

import "testing"

func TestPermissionDeniedUsesCredentialExitCodeWithoutBeingSessionExpiry(t *testing.T) {
	err := NewError(CodePermissionDenied, "denied")
	if ExitCode(err) != 3 {
		t.Fatalf("ExitCode() = %d, want 3", ExitCode(err))
	}
	if IsSessionExpired(err) {
		t.Fatal("permission denied must not trigger session recovery")
	}
}
