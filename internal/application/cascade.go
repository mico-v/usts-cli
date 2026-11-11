package application

import (
	"fmt"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

type CascadeInput struct {
	College string
	Grade   string
	Major   string
	All     bool
}

type CascadeSelection struct {
	College *domain.SelectOption
	Grade   *domain.SelectOption
	Major   *domain.SelectOption
}

func PickOption(value string, options []domain.SelectOption, extraKeys ...string) *domain.SelectOption {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	for index := range options {
		if options[index].Value == value {
			return &options[index]
		}
	}
	for index := range options {
		if options[index].Label == value {
			return &options[index]
		}
	}
	for index := range options {
		for _, key := range extraKeys {
			if raw, ok := options[index].Meta[key]; ok && strings.TrimSpace(toString(raw)) == value {
				return &options[index]
			}
		}
	}
	for index := range options {
		if strings.Contains(options[index].Label, value) {
			return &options[index]
		}
	}
	return nil
}

func SelectCascade(options domain.CascadeOptions, input CascadeInput) (CascadeSelection, error) {
	if input.All {
		if input.College != "" || input.Grade != "" || input.Major != "" {
			return CascadeSelection{}, domain.ConfigError("不能同时使用「不做过滤」与 --college/--grade/--major：请二选一")
		}
		return CascadeSelection{}, nil
	}
	resolve := func(label, value string, list []domain.SelectOption) (*domain.SelectOption, error) {
		if value == "" {
			return nil, nil
		}
		found := PickOption(value, list)
		if found == nil {
			return nil, domain.ConfigError("未找到%s：%s。请检查取值", label, value)
		}
		return found, nil
	}
	college, err := resolve("学院", input.College, options.Colleges)
	if err != nil {
		return CascadeSelection{}, err
	}
	grade, err := resolve("年级", input.Grade, options.Grades)
	if err != nil {
		return CascadeSelection{}, err
	}
	major, err := resolve("专业", input.Major, options.Majors)
	if err != nil {
		return CascadeSelection{}, err
	}
	if college == nil {
		college = optionByValue(options.Defaults.CollegeID, options.Colleges)
	}
	if grade == nil {
		grade = optionByValue(options.Defaults.GradeID, options.Grades)
	}
	if major == nil {
		major = optionByValue(options.Defaults.MajorID, options.Majors)
	}
	return CascadeSelection{College: college, Grade: grade, Major: major}, nil
}

func optionByValue(value string, options []domain.SelectOption) *domain.SelectOption {
	if value == "" {
		return nil
	}
	for index := range options {
		if options[index].Value == value {
			return &options[index]
		}
	}
	return nil
}

func toString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case []byte:
		return string(typed)
	case nil:
		return ""
	default:
		return fmt.Sprint(typed)
	}
}
