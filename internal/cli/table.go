package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const defaultMaxColumnWidth = 24

type TableOptions struct {
	MaxColumnWidth int
}

func WriteTable(writer io.Writer, headers []string, rows [][]string, options TableOptions) {
	if len(headers) == 0 {
		fmt.Fprintln(writer, "（无数据）")
		return
	}
	maxWidth := options.MaxColumnWidth
	if maxWidth <= 0 {
		maxWidth = defaultMaxColumnWidth
	}
	normalizedHeaders := make([]string, len(headers))
	for index, header := range headers {
		normalizedHeaders[index] = truncateWidth(tableCell(header), maxWidth)
	}
	normalizedRows := make([][]string, len(rows))
	widths := make([]int, len(headers))
	for index, header := range normalizedHeaders {
		widths[index] = displayWidth(header)
	}
	for rowIndex, row := range rows {
		normalized := make([]string, len(headers))
		for column := range headers {
			value := ""
			if column < len(row) {
				value = row[column]
			}
			normalized[column] = truncateWidth(tableCell(value), maxWidth)
			if width := displayWidth(normalized[column]); width > widths[column] {
				widths[column] = width
			}
		}
		normalizedRows[rowIndex] = normalized
	}
	var separator strings.Builder
	separator.WriteString("+")
	for _, width := range widths {
		separator.WriteString(strings.Repeat("-", width+2))
		separator.WriteString("+")
	}
	fmt.Fprintln(writer, separator.String())
	writeTableRow(writer, normalizedHeaders, widths)
	fmt.Fprintln(writer, separator.String())
	for _, row := range normalizedRows {
		writeTableRow(writer, row, widths)
	}
	if len(normalizedRows) > 0 {
		fmt.Fprintln(writer, separator.String())
	} else {
		fmt.Fprintln(writer, "（无数据）")
	}
}

func tableCell(value string) string {
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	value = strings.ReplaceAll(value, "\t", " ")
	return SanitizeTerminalText(value)
}

func writeTableRow(writer io.Writer, cells []string, widths []int) {
	fmt.Fprint(writer, "|")
	for index, width := range widths {
		cell := ""
		if index < len(cells) {
			cell = cells[index]
		}
		fmt.Fprint(writer, " ", padRightWidth(cell, width), " |")
	}
	fmt.Fprintln(writer)
}

func displayWidth(value string) int {
	width := 0
	for _, char := range value {
		if isWideRune(char) {
			width += 2
		} else {
			width++
		}
	}
	return width
}

func padRightWidth(value string, width int) string {
	padding := width - displayWidth(value)
	if padding <= 0 {
		return value
	}
	return value + strings.Repeat(" ", padding)
}

func truncateWidth(value string, maxWidth int) string {
	if displayWidth(value) <= maxWidth {
		return value
	}
	var builder strings.Builder
	width := 0
	for _, char := range value {
		charWidth := 1
		if isWideRune(char) {
			charWidth = 2
		}
		if width+charWidth+1 > maxWidth {
			break
		}
		builder.WriteRune(char)
		width += charWidth
	}
	builder.WriteString("…")
	return builder.String()
}

func isWideRune(char rune) bool {
	return (char >= 0x1100 && char <= 0x115f) ||
		(char >= 0x2e80 && char <= 0xa4cf) ||
		(char >= 0xac00 && char <= 0xd7a3) ||
		(char >= 0xf900 && char <= 0xfaff) ||
		(char >= 0xfe10 && char <= 0xfe6f) ||
		(char >= 0xff00 && char <= 0xff60) ||
		(char >= 0xffe0 && char <= 0xffe6)
}

func WriteJSON(writer io.Writer, value any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(false)
	return encoder.Encode(value)
}

type JSONEnvelope struct {
	SchemaVersion int            `json:"schemaVersion"`
	Command       string         `json:"command"`
	Data          any            `json:"data,omitempty"`
	Meta          map[string]any `json:"meta,omitempty"`
	Warnings      []string       `json:"warnings"`
}

type JSONErrorEnvelope struct {
	SchemaVersion int       `json:"schemaVersion"`
	Command       string    `json:"command"`
	Error         JSONError `json:"error"`
}

type JSONError struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

func WriteEnvelope(writer io.Writer, command string, data any, meta map[string]any) error {
	return WriteJSON(writer, JSONEnvelope{
		SchemaVersion: 1, Command: command, Data: data, Meta: meta, Warnings: []string{},
	})
}
