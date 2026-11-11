package cli

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestRegistryContainsAllCommands(t *testing.T) {
	expected := []string{
		"login", "logout", "scores", "exams", "courses", "schedule", "clsched", "profile",
		"gpa", "notifications", "academia", "selected-courses", "freeclass", "warning",
		"plan", "payment", "minor-schedule", "schedule-pdf", "academia-pdf",
	}
	for _, name := range expected {
		if _, ok := FindCommand(name); !ok {
			t.Fatalf("command %q is not registered", name)
		}
	}
	if len(QueryCommands()) != 16 {
		t.Fatalf("query command count = %d", len(QueryCommands()))
	}
}

func TestRedactSecret(t *testing.T) {
	input := "Cookie: JSESSIONID=abcdef; password=secret; token=abcdefghijklmnopqrstuvwxyz123456"
	output := RedactSecret(input)
	for _, secret := range []string{"abcdef", "secret", "abcdefghijklmnopqrstuvwxyz123456"} {
		if strings.Contains(output, secret) {
			t.Fatalf("secret %q leaked in %q", secret, output)
		}
	}
}

func TestNormalizeOptionalStringFlag(t *testing.T) {
	got := normalizeOptionalStringFlag([]string{"--course", "MATH01", "--json"}, "--course", "--course-code")
	if strings.Join(got, "|") != "--course-code=MATH01|--json" {
		t.Fatalf("unexpected args: %#v", got)
	}
	got = normalizeOptionalStringFlag([]string{"--course", "--json"}, "--course", "--course-code")
	if strings.Join(got, "|") != "--course=true|--json" {
		t.Fatalf("unexpected args: %#v", got)
	}
	got = normalizeOptionalStringFlag([]string{"--course=MATH01"}, "--course", "--course-code")
	if strings.Join(got, "|") != "--course-code=MATH01" {
		t.Fatalf("unexpected args: %#v", got)
	}
}

func TestCommandHelpShowsSpecificOptions(t *testing.T) {
	spec, _ := FindCommand("scores")
	var buffer bytes.Buffer
	app := &App{Out: &buffer}
	if err := spec.Execute(context.Background(), app, []string{"--help"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buffer.String(), "--kcxzdm") {
		t.Fatalf("specific option missing from help:\n%s", buffer.String())
	}
}

func TestWriteTableKeepsCJKAlignment(t *testing.T) {
	var buffer bytes.Buffer
	WriteTable(&buffer, []string{"课程", "成绩"}, [][]string{{"高等数学", "92"}}, TableOptions{})
	lines := strings.Split(strings.TrimSpace(buffer.String()), "\n")
	if len(lines) != 5 {
		t.Fatalf("unexpected table:\n%s", buffer.String())
	}
	if displayWidth(lines[0]) != displayWidth(lines[1]) || displayWidth(lines[1]) != displayWidth(lines[2]) {
		t.Fatalf("table columns are not aligned:\n%s", buffer.String())
	}
}
