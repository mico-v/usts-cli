package cli

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"flag"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
)

func TestRegistryContainsAllCommands(t *testing.T) {
	expected := []string{
		"login", "logout", "scores", "exams", "courses", "schedule", "clsched", "profile",
		"gpa", "notifications", "academia", "selected-courses", "freeclass", "warning",
		"plan", "payment", "minor-schedule", "course", "bysj", "lookup", "schedule-pdf", "academia-pdf",
	}
	for _, name := range expected {
		if _, ok := FindCommand(name); !ok {
			t.Fatalf("command %q is not registered", name)
		}
	}
	if len(QueryCommands()) != 19 {
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

func TestRootHelpDocumentsInteractiveScrolling(t *testing.T) {
	var buffer bytes.Buffer
	WriteRootHelp(&buffer, "test")
	if !strings.Contains(buffer.String(), "PgUp/PgDn") || !strings.Contains(buffer.String(), "数字键跳选") {
		t.Fatalf("interactive key help missing:\n%s", buffer.String())
	}
}

func TestPromptLineTreatsEOFAsCleanInterrupt(t *testing.T) {
	var buffer bytes.Buffer
	app := &App{In: bufio.NewReader(strings.NewReader("")), Out: &buffer}
	if _, err := PromptLine(app, "prompt: "); !errors.Is(err, errInterrupted) {
		t.Fatalf("PromptLine EOF error = %v, want interrupted", err)
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

func TestSelectViewportScrollsWithSelection(t *testing.T) {
	if rows := selectVisibleRows(8, 17); rows != 3 {
		t.Fatalf("visible rows = %d, want 3", rows)
	}
	if rows := selectVisibleRows(24, 17); rows != 7 {
		t.Fatalf("standard terminal visible rows = %d, want 7", rows)
	}
	tests := []struct {
		selected int
		offset   int
		want     int
	}{
		{0, 0, 0},
		{2, 0, 0},
		{3, 0, 1},
		{10, 1, 8},
		{16, 0, 14},
	}
	for _, test := range tests {
		if got := clampOffset(test.selected, test.offset, 3, 17); got != test.want {
			t.Fatalf("clampOffset(%d, %d) = %d, want %d", test.selected, test.offset, got, test.want)
		}
	}
}

func TestReadSelectKeySupportsArrowsAndPaging(t *testing.T) {
	tests := []struct {
		input string
		want  selectKey
	}{
		{"\x1b[A", selectUp},
		{"\x1b[B", selectDown},
		{"\x1b[5~", selectPageUp},
		{"\x1b[6~", selectPageDown},
		{"\x1b[H", selectHome},
		{"\x1b[F", selectEnd},
		{"\x10", selectUp},
		{"\x0e", selectDown},
		{"3", selectDigit1 + 2},
		{"\r", selectEnter},
		{"\x03", selectCancel},
		{"\x04", selectCancel},
	}
	for _, test := range tests {
		key, err := readSelectKey(bufio.NewReader(strings.NewReader(test.input)))
		if err != nil {
			t.Fatalf("readSelectKey(%q): %v", test.input, err)
		}
		if key != test.want {
			t.Fatalf("readSelectKey(%q) = %d, want %d", test.input, key, test.want)
		}
	}
}

func TestRenderSelectShowsScrollIndicators(t *testing.T) {
	var buffer bytes.Buffer
	app := &App{Out: &buffer, NoColor: true}
	choices := make([]promptChoice, 10)
	for index := range choices {
		choices[index] = promptChoice{Label: "选项", Value: strings.Repeat("x", index+1)}
	}
	choices[5].Label = "恶意\n标签\x1b[31m"
	lines := renderSelect(app, choices, 5, 3, 3, 60, 0)
	if lines != 6 {
		t.Fatalf("rendered lines = %d, want 6", lines)
	}
	for _, marker := range []string{"↑ 更多", "↓ 更多", "PgUp/PgDn", "> 6."} {
		if !strings.Contains(buffer.String(), marker) {
			t.Fatalf("missing %q in rendered selector:\n%s", marker, buffer.String())
		}
	}
	if strings.Contains(buffer.String(), "恶意\n标签") || strings.Contains(buffer.String(), "\x1b[31m") {
		t.Fatalf("remote label was not sanitized:\n%s", buffer.String())
	}
	for _, line := range strings.Split(strings.TrimSuffix(buffer.String(), "\r\n"), "\r\n") {
		if displayWidth(line) > 60 {
			t.Fatalf("rendered line exceeds terminal width: %q", line)
		}
	}
}

func TestClassScheduleYearRangeIncludesFutureYears(t *testing.T) {
	current := time.Now().Year()
	var buffer bytes.Buffer
	app := &App{
		In:  bufio.NewReader(strings.NewReader("7\n")),
		Out: &buffer,
	}
	value, err := promptClassYear(app, strconv.Itoa(current))
	if err != nil {
		t.Fatal(err)
	}
	if value != strconv.Itoa(current+5) {
		t.Fatalf("class year choice = %s, want %d", value, current+5)
	}
}

func TestTermYearChoicesStartAtCalendarYear(t *testing.T) {
	now := time.Date(2027, 3, 15, 0, 0, 0, 0, time.Local)
	var buffer bytes.Buffer
	app := &App{
		In:  bufio.NewReader(strings.NewReader("1\n")),
		Out: &buffer,
		Now: func() time.Time { return now },
	}
	value, err := promptYear(app, "2026")
	if err != nil {
		t.Fatal(err)
	}
	if value != "2027" {
		t.Fatalf("first year choice = %s, want 2027", value)
	}
}

func TestFreeClassMinSeatsDefaultAndValidation(t *testing.T) {
	fs := flag.NewFlagSet("freeclass", flag.ContinueOnError)
	options := &freeClassOptions{}
	bindFreeClass(fs, options)
	if err := fs.Parse(nil); err != nil {
		t.Fatal(err)
	}
	if options.MinSeats != -1 {
		t.Fatalf("default min seats = %d, want -1", options.MinSeats)
	}
	options.MinSeats = 0
	err := runFreeClass(context.Background(), &App{Now: time.Now}, options)
	if !domain.IsCode(err, domain.CodeConfiguration) {
		t.Fatalf("min-seats=0 error = %v, want configuration error", err)
	}
}
