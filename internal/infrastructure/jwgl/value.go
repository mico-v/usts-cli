package jwgl

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"regexp"
	"strconv"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

type RawRecord map[string]any

var (
	numberPattern   = regexp.MustCompile(`-?\d+(?:\.\d+)?`)
	sectionsPattern = regexp.MustCompile(`(\d+)\s*[-~]\s*(\d+)`)
	tagPattern      = regexp.MustCompile(`<[^>]+>`)
	spacePattern    = regexp.MustCompile(`\s+`)
	blockPattern    = regexp.MustCompile(`(?i)</(?:p|div|h[1-6]|li|tr|td|th|section|article|header|footer)>|<br\s*/?>`)
	scriptPattern   = regexp.MustCompile(`(?is)<script\b.*?</script>|<style\b.*?</style>`)
)

func ParseJSON(data []byte) (any, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, domain.NewError(domain.CodeProtocolChanged, "响应不是有效 JSON")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, domain.WrapError(domain.CodeProtocolChanged, "响应不是有效 JSON", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, domain.NewError(domain.CodeProtocolChanged, "响应包含多个 JSON 值")
		}
		return nil, domain.WrapError(domain.CodeProtocolChanged, "响应 JSON 后包含非空尾随内容", err)
	}
	return value, nil
}

func RecordArray(value any) []RawRecord {
	array, ok := value.([]any)
	if !ok {
		return nil
	}
	records := make([]RawRecord, 0, len(array))
	for _, item := range array {
		if record, ok := item.(map[string]any); ok {
			records = append(records, RawRecord(record))
		}
	}
	return records
}

func RecordArrayStrict(value any) ([]RawRecord, error) {
	array, ok := value.([]any)
	if !ok {
		return nil, domain.NewError(domain.CodeProtocolChanged, "响应 items 不是数组")
	}
	records := make([]RawRecord, 0, len(array))
	for index, item := range array {
		record, ok := item.(map[string]any)
		if !ok {
			return nil, domain.NewError(domain.CodeProtocolChanged, fmt.Sprintf("响应 items[%d] 不是对象", index))
		}
		records = append(records, RawRecord(record))
	}
	return records, nil
}

func StringValue(record RawRecord, keys ...string) string {
	for _, key := range keys {
		if value, ok := record[key]; ok && value != nil {
			switch typed := value.(type) {
			case string:
				if typed != "" {
					return typed
				}
			case json.Number:
				return typed.String()
			case float64:
				return strconv.FormatFloat(typed, 'f', -1, 64)
			case bool:
				return strconv.FormatBool(typed)
			}
		}
	}
	return ""
}

func OptionalString(record RawRecord, keys ...string) *string {
	value := StringValue(record, keys...)
	if value == "" {
		return nil
	}
	return &value
}

func NumberValue(record RawRecord, keys ...string) *float64 {
	for _, key := range keys {
		value, ok := record[key]
		if !ok || value == nil {
			continue
		}
		var text string
		switch typed := value.(type) {
		case string:
			text = typed
		case json.Number:
			text = typed.String()
		case float64:
			number := typed
			return &number
		case int:
			number := float64(typed)
			return &number
		}
		match := numberPattern.FindString(strings.ReplaceAll(text, ",", ""))
		if match == "" {
			continue
		}
		number, err := strconv.ParseFloat(match, 64)
		if err == nil {
			return &number
		}
	}
	return nil
}

func IntValue(record RawRecord, keys ...string) *int {
	number := NumberValue(record, keys...)
	if number == nil {
		return nil
	}
	value := int(*number)
	return &value
}

func BoolValue(record RawRecord, keys ...string) *bool {
	for _, key := range keys {
		value, ok := record[key]
		if !ok || value == nil {
			continue
		}
		var result bool
		switch typed := value.(type) {
		case bool:
			result = typed
		case string:
			result = typed == "1" || strings.EqualFold(typed, "true") || typed == "是"
		case json.Number:
			result = typed.String() == "1"
		case float64:
			result = typed == 1
		default:
			continue
		}
		return &result
	}
	return nil
}

func ParseSections(value string) (*int, *int) {
	match := sectionsPattern.FindStringSubmatch(value)
	if len(match) != 3 {
		return nil, nil
	}
	start, _ := strconv.Atoi(match[1])
	end, _ := strconv.Atoi(match[2])
	return &start, &end
}

func CleanHTML(value string) string {
	value = scriptPattern.ReplaceAllString(value, " ")
	value = blockPattern.ReplaceAllString(value, " ")
	value = tagPattern.ReplaceAllString(value, "")
	value = html.UnescapeString(value)
	value = strings.ReplaceAll(value, "\u00a0", " ")
	return strings.TrimSpace(spacePattern.ReplaceAllString(value, " "))
}

func ExtractVisibleText(source string) []string {
	cleaned := scriptPattern.ReplaceAllString(source, " ")
	blocks := blockPattern.Split(cleaned, -1)
	texts := make([]string, 0, len(blocks))
	for _, block := range blocks {
		if text := CleanHTML(block); text != "" {
			texts = append(texts, text)
			if len(texts) >= 200 {
				break
			}
		}
	}
	return texts
}

func MatchText(source string, pattern *regexp.Regexp) string {
	match := pattern.FindStringSubmatch(source)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func AssertAnyField(record RawRecord, fields []string, context string) error {
	for _, field := range fields {
		if value, ok := record[field]; ok && value != nil {
			return nil
		}
	}
	return domain.NewError(domain.CodeProtocolChanged, context+"缺少预期字段："+strings.Join(fields, "/"))
}
