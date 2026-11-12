package cli

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	ansiEscapePattern = regexp.MustCompile(`\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))`)
	secretKeyPattern  = regexp.MustCompile(`(?i)((?:cookie|set-cookie|password|passwd|csrftoken|jsessionid|rememberme|authorization|token)\s*[:=]\s*)[^\s;,]+`)
	cookiePartPattern = regexp.MustCompile(`(;\s*[A-Za-z_][\w-]*=)[^\s;]+`)
	tokenPattern      = regexp.MustCompile(`\b[A-Za-z0-9_-]{24,}\b`)
	idPattern         = regexp.MustCompile(`\b\d{10,}\b`)
	identityQuery     = regexp.MustCompile(`(?i)((?:su|xh|xh_id|username|yhm)=)[^&\s]+`)
)

func SanitizeTerminalText(value string) string {
	value = ansiEscapePattern.ReplaceAllString(value, "")
	var builder strings.Builder
	for _, char := range value {
		if char == '\n' || char == '\t' {
			builder.WriteRune(char)
			continue
		}
		if unicode.IsControl(char) || unicode.Is(unicode.Cf, char) || isBidiOrFormat(char) {
			continue
		}
		builder.WriteRune(char)
	}
	return builder.String()
}

func SanitizeLine(value string) string {
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "\t", " ")
	return SanitizeTerminalText(value)
}

func RedactSecret(value string) string {
	value = secretKeyPattern.ReplaceAllString(value, "${1}[REDACTED]")
	value = cookiePartPattern.ReplaceAllString(value, "${1}[REDACTED]")
	value = identityQuery.ReplaceAllString(value, "${1}[REDACTED]")
	value = tokenPattern.ReplaceAllString(value, "[REDACTED_TOKEN]")
	value = idPattern.ReplaceAllString(value, "[REDACTED_ID]")
	return value
}

func isBidiOrFormat(char rune) bool {
	return (char >= 0x200b && char <= 0x200f) ||
		(char >= 0x202a && char <= 0x202e) ||
		(char >= 0x2066 && char <= 0x2069) ||
		char == 0xfeff
}
