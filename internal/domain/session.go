package domain

import "time"

type SessionState string

const (
	SessionValid   SessionState = "valid"
	SessionExpired SessionState = "expired"
	SessionUnknown SessionState = "unknown"
)

type SessionLookup string

const (
	SessionMissing       SessionLookup = "missing"
	SessionLookupValid   SessionLookup = "valid"
	SessionLookupExpired SessionLookup = "expired"
	SessionLookupUnknown SessionLookup = "unknown"
)

type RecoveryReason string

const (
	RecoveryCredentials RecoveryReason = "credentials"
	RecoveryFailed      RecoveryReason = "failed"
	RecoveryCooldown    RecoveryReason = "cooldown"
)

type RecoveryResult struct {
	OK        bool
	Reason    RecoveryReason
	Message   string
	ErrorCode ErrorCode
	Retryable bool
}

type LoginData struct {
	SessionID   string
	Username    string
	DisplayName string
}

type LoginResponse struct {
	Success   bool
	Message   string
	ErrorCode ErrorCode
	Data      LoginData
}

type LocalSessionInfo struct {
	LoggedIn bool
	Username string
	LoginAt  time.Time
}
