package application

import (
	"context"
	"sync"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
)

const (
	DefaultTrustWindow      = 5 * time.Minute
	DefaultRecoveryCooldown = time.Minute
)

type SessionPort interface {
	RestoreSession() bool
	LastLoginAt() (time.Time, bool)
	ProbeSession(ctx context.Context) domain.SessionState
	LoginFromEnvironment(ctx context.Context) domain.LoginResponse
}

type SessionManagerOptions struct {
	TrustWindow      time.Duration
	RecoveryCooldown time.Duration
	Now              func() time.Time
}

type ensureCall struct {
	done   chan struct{}
	result domain.SessionLookup
}

type recoveryCall struct {
	done   chan struct{}
	result domain.RecoveryResult
}

// SessionManager owns the three-state session policy. It performs no I/O itself;
// all transport, persistence, and login work is delegated to SessionPort.
type SessionManager struct {
	port             SessionPort
	trustWindow      time.Duration
	recoveryCooldown time.Duration
	now              func() time.Time

	mu            sync.Mutex
	verifiedAt    time.Time
	lastFailureAt time.Time
	lastResult    domain.RecoveryResult
	hasLastResult bool
	invalidated   bool
	epoch         uint64
	ensuring      *ensureCall
	recovering    *recoveryCall
}

func NewSessionManager(port SessionPort, options SessionManagerOptions) *SessionManager {
	trustWindow := options.TrustWindow
	if trustWindow < 0 {
		trustWindow = DefaultTrustWindow
	}
	cooldown := options.RecoveryCooldown
	if cooldown <= 0 {
		cooldown = DefaultRecoveryCooldown
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	return &SessionManager{
		port:             port,
		trustWindow:      trustWindow,
		recoveryCooldown: cooldown,
		now:              now,
	}
}

func (m *SessionManager) Ensure(ctx context.Context, force bool) domain.SessionLookup {
	if !m.port.RestoreSession() {
		return domain.SessionMissing
	}

	m.mu.Lock()
	if !force && m.trustedLocked() {
		m.mu.Unlock()
		return domain.SessionLookupValid
	}
	if m.ensuring != nil {
		call := m.ensuring
		m.mu.Unlock()
		select {
		case <-ctx.Done():
			return domain.SessionLookupUnknown
		case <-call.done:
			return call.result
		}
	}
	call := &ensureCall{done: make(chan struct{})}
	m.ensuring = call
	epoch := m.epoch
	m.mu.Unlock()

	result := m.runEnsure(ctx, epoch)

	m.mu.Lock()
	call.result = result
	if m.ensuring == call {
		m.ensuring = nil
	}
	close(call.done)
	m.mu.Unlock()
	return result
}

func (m *SessionManager) runEnsure(ctx context.Context, epoch uint64) domain.SessionLookup {
	state := m.port.ProbeSession(ctx)
	if !m.sameEpoch(epoch) {
		return domain.SessionMissing
	}
	switch state {
	case domain.SessionValid:
		m.MarkVerified()
		return domain.SessionLookupValid
	case domain.SessionUnknown:
		return domain.SessionLookupUnknown
	}

	m.mu.Lock()
	m.verifiedAt = time.Time{}
	m.mu.Unlock()
	recovery := m.Recover(ctx)
	if !m.sameEpoch(epoch) {
		return domain.SessionMissing
	}
	if recovery.OK {
		return domain.SessionLookupValid
	}
	return domain.SessionLookupExpired
}

func (m *SessionManager) Recover(ctx context.Context) domain.RecoveryResult {
	m.mu.Lock()
	if !m.lastFailureAt.IsZero() && m.now().Sub(m.lastFailureAt) < m.recoveryCooldown {
		result := domain.RecoveryResult{OK: false, Reason: domain.RecoveryCooldown, Message: "刚刚的自动登录失败，稍后再试"}
		m.mu.Unlock()
		return result
	}
	if m.recovering != nil {
		call := m.recovering
		m.mu.Unlock()
		select {
		case <-ctx.Done():
			return domain.RecoveryResult{OK: false, Reason: domain.RecoveryFailed, Message: ctx.Err().Error()}
		case <-call.done:
			return call.result
		}
	}
	call := &recoveryCall{done: make(chan struct{})}
	m.recovering = call
	epoch := m.epoch
	m.mu.Unlock()

	result := m.runRecovery(ctx, epoch)

	m.mu.Lock()
	call.result = result
	if m.recovering == call {
		m.recovering = nil
	}
	close(call.done)
	m.mu.Unlock()
	return result
}

func (m *SessionManager) runRecovery(ctx context.Context, epoch uint64) domain.RecoveryResult {
	response := m.port.LoginFromEnvironment(ctx)
	if !m.sameEpoch(epoch) {
		return domain.RecoveryResult{OK: false}
	}
	if response.Success {
		m.MarkVerified()
		result := domain.RecoveryResult{OK: true}
		m.mu.Lock()
		m.lastResult = result
		m.hasLastResult = true
		m.mu.Unlock()
		return result
	}

	reason := domain.RecoveryFailed
	if response.ErrorCode == domain.CodeAuthentication {
		reason = domain.RecoveryCredentials
	}
	result := domain.RecoveryResult{OK: false, Reason: reason, Message: response.Message}
	m.mu.Lock()
	m.lastFailureAt = m.now()
	m.lastResult = result
	m.hasLastResult = true
	m.mu.Unlock()
	return result
}

func (m *SessionManager) MarkVerified() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.verifiedAt = m.now()
	m.lastFailureAt = time.Time{}
	m.invalidated = false
}

func (m *SessionManager) MarkExpired() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.verifiedAt = time.Time{}
	m.invalidated = true
}

func (m *SessionManager) ConfirmExpired(ctx context.Context) bool {
	return m.port.ProbeSession(ctx) == domain.SessionExpired
}

func (m *SessionManager) LastRecovery() (domain.RecoveryResult, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastResult, m.hasLastResult
}

func (m *SessionManager) Reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.epoch++
	m.verifiedAt = time.Time{}
	m.lastFailureAt = time.Time{}
	m.lastResult = domain.RecoveryResult{}
	m.hasLastResult = false
	m.invalidated = false
	m.ensuring = nil
	m.recovering = nil
}

func (m *SessionManager) trustedLocked() bool {
	if m.invalidated {
		return false
	}
	now := m.now()
	if !m.verifiedAt.IsZero() && now.Sub(m.verifiedAt) < m.trustWindow {
		return true
	}
	loginAt, ok := m.port.LastLoginAt()
	return ok && !loginAt.IsZero() && now.Sub(loginAt) < m.trustWindow
}

func (m *SessionManager) sameEpoch(epoch uint64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.epoch == epoch
}
