package jwgl

import (
	"testing"

	"github.com/mico-v/usts-cli/internal/domain"
)

func TestParseJSONRejectsTrailingContent(t *testing.T) {
	_, err := ParseJSON([]byte(`{"items":[],"totalCount":0}<html>error</html>`))
	if !domain.IsCode(err, domain.CodeProtocolChanged) {
		t.Fatalf("ParseJSON() error = %v", err)
	}
}

func TestRecordArrayStrictRejectsNonObjects(t *testing.T) {
	if _, err := RecordArrayStrict([]any{map[string]any{"a": "b"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := RecordArrayStrict([]any{1}); !domain.IsCode(err, domain.CodeProtocolChanged) {
		t.Fatalf("RecordArrayStrict() error = %v", err)
	}
}
