package domain

import (
	"errors"
	"fmt"
)

// ErrorCode is a stable cross-layer error contract. User-facing text may change,
// but automation may depend on these values.
type ErrorCode string

const (
	CodeConfiguration      ErrorCode = "CONFIGURATION_ERROR"
	CodeAuthentication     ErrorCode = "AUTHENTICATION_REQUIRED"
	CodeSessionExpired     ErrorCode = "SESSION_EXPIRED"
	CodeInvalidCredentials ErrorCode = "INVALID_CREDENTIALS"
	CodeCaptchaRequired    ErrorCode = "CAPTCHA_REQUIRED"
	CodePermissionDenied   ErrorCode = "PERMISSION_DENIED"
	CodeRateLimited        ErrorCode = "RATE_LIMITED"
	CodeNetworkUnavailable ErrorCode = "NETWORK_UNAVAILABLE"
	CodeRequestTimeout     ErrorCode = "REQUEST_TIMEOUT"
	CodeRemoteServer       ErrorCode = "REMOTE_SERVER_ERROR"
	CodeProtocolChanged    ErrorCode = "PROTOCOL_CHANGED"
	CodeFileSystem         ErrorCode = "FILE_SYSTEM_ERROR"
	CodeUnknown            ErrorCode = "UNKNOWN_ERROR"
)

// AppError carries a stable code, retryability, and optional protocol hints.
type AppError struct {
	Code      ErrorCode
	Message   string
	Retryable bool
	Cause     error
	Ambiguous bool
	Details   map[string]any
}

func (e *AppError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return string(e.Code)
}

func (e *AppError) Unwrap() error { return e.Cause }

func NewError(code ErrorCode, message string) *AppError {
	return &AppError{Code: code, Message: message}
}

func WrapError(code ErrorCode, message string, cause error) *AppError {
	return &AppError{Code: code, Message: message, Cause: cause}
}

func AsAppError(err error) (*AppError, bool) {
	var target *AppError
	if errors.As(err, &target) {
		return target, true
	}
	return nil, false
}

func IsCode(err error, code ErrorCode) bool {
	app, ok := AsAppError(err)
	return ok && app.Code == code
}

func IsSessionExpired(err error) bool {
	app, ok := AsAppError(err)
	return ok && (app.Code == CodeSessionExpired || app.Code == CodeAuthentication)
}

func IsAmbiguousRejection(err error) bool {
	app, ok := AsAppError(err)
	return ok && app.Ambiguous
}

func ExitCode(err error) int {
	app, ok := AsAppError(err)
	if !ok {
		return 1
	}
	switch app.Code {
	case CodeConfiguration:
		return 2
	case CodeAuthentication, CodeSessionExpired, CodeInvalidCredentials, CodeCaptchaRequired, CodePermissionDenied:
		return 3
	case CodeRateLimited, CodeNetworkUnavailable, CodeRequestTimeout, CodeRemoteServer:
		return 4
	case CodeProtocolChanged:
		return 5
	case CodeFileSystem:
		return 6
	default:
		return 1
	}
}

func ErrorMessage(err error, fallback string) string {
	if err == nil {
		return fallback
	}
	if message := err.Error(); message != "" {
		return message
	}
	return fallback
}

func ConfigError(format string, args ...any) *AppError {
	return NewError(CodeConfiguration, fmt.Sprintf(format, args...))
}
