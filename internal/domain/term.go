package domain

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Term struct {
	AcademicYear string
	Semester     string
}

var termCodePattern = regexp.MustCompile(`^\d{4}$`)

func CurrentTerm(now time.Time) Term {
	year := now.Year()
	month := int(now.Month())
	switch {
	case month >= 8:
		return Term{AcademicYear: strconv.Itoa(year), Semester: "3"}
	case month >= 2:
		return Term{AcademicYear: strconv.Itoa(year - 1), Semester: "12"}
	default:
		return Term{AcademicYear: strconv.Itoa(year - 1), Semester: "3"}
	}
}

func ResolveTerm(xnm, xqm string, now time.Time) (Term, error) {
	def := CurrentTerm(now)
	resolved := Term{AcademicYear: xnm, Semester: xqm}
	if resolved.AcademicYear == "" {
		resolved.AcademicYear = def.AcademicYear
	}
	if xqm == "" && xnm == "" {
		resolved.Semester = def.Semester
	}
	return ValidateTerm(resolved)
}

func ValidateTerm(term Term) (Term, error) {
	if !termCodePattern.MatchString(term.AcademicYear) {
		return Term{}, ConfigError("学年必须是 4 位年份（如 2025），收到：%s", term.AcademicYear)
	}
	if term.Semester != "" && term.Semester != "3" && term.Semester != "12" && term.Semester != "16" {
		return Term{}, ConfigError("学期取值必须是 3 / 12 / 16（或留空表示全部学期），收到：%s", term.Semester)
	}
	return term, nil
}

func ConcreteTerm(term Term, now time.Time) Term {
	if term.Semester != "" {
		return term
	}
	term.Semester = CurrentTerm(now).Semester
	return term
}

func DisplaySemester(xqm string) string {
	switch xqm {
	case "3":
		return "1"
	case "12":
		return "2"
	case "16":
		return "3"
	default:
		if xqm == "" {
			return "1"
		}
		return xqm
	}
}

func AcademicYearName(xnm string) string {
	year, err := strconv.Atoi(xnm)
	if err != nil {
		return xnm
	}
	return fmt.Sprintf("%d-%d", year, year+1)
}

func XQMName(xqm string) string {
	switch xqm {
	case "3":
		return "一"
	case "12":
		return "二"
	case "16":
		return "三（小学期）"
	default:
		if xqm == "" {
			return "?"
		}
		return xqm
	}
}

func SemesterLabel(value string) string {
	switch value {
	case "1":
		return "第一学期"
	case "2":
		return "第二学期"
	case "3":
		return "第三学期"
	default:
		return value
	}
}

func AcademicYearLabel(xnm, xnmmc string) string {
	if xnmmc != "" {
		return xnmmc
	}
	year, err := strconv.Atoi(xnm)
	if err == nil && year > 0 {
		return fmt.Sprintf("%d-%d", year, year+1)
	}
	return xnm
}

func TermLabel(xnm, xqm string) string {
	year := AcademicYearLabel(xnm, "")
	if strings.TrimSpace(xqm) == "" {
		return fmt.Sprintf("%s 学年 · 全部学期", year)
	}
	return fmt.Sprintf("%s 学年 · 第%s学期", year, XQMName(xqm))
}
