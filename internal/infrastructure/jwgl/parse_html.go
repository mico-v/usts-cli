package jwgl

import (
	"regexp"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"golang.org/x/net/html"
)

const (
	maxHTMLBytes = 8 * 1024 * 1024
	maxHTMLNodes = 250_000
	maxHTMLDepth = 512
)

type parsedOption struct {
	Value    string
	Label    string
	Selected bool
}

func ParseSelect(source, name string) []parsedOption {
	root := parseHTMLDocument(source)
	if root == nil {
		return nil
	}
	var selected *html.Node
	var find func(*html.Node)
	find = func(node *html.Node) {
		if selected != nil {
			return
		}
		if node.Type == html.ElementNode && node.Data == "select" {
			for _, attribute := range node.Attr {
				if attribute.Key == "name" && attribute.Val == name {
					selected = node
					return
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			find(child)
		}
	}
	find(root)
	if selected == nil {
		return nil
	}
	var options []parsedOption
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "option" {
			option := parsedOption{Label: strings.TrimSpace(nodeText(node))}
			for _, attribute := range node.Attr {
				switch attribute.Key {
				case "value":
					option.Value = attribute.Val
				case "selected":
					option.Selected = true
				}
			}
			if option.Value != "" {
				options = append(options, option)
			}
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(selected)
	return options
}

func ToSelectOptions(options []parsedOption) []domain.SelectOption {
	result := make([]domain.SelectOption, 0, len(options))
	for _, option := range options {
		result = append(result, domain.SelectOption{Value: option.Value, Label: option.Label})
	}
	return result
}

func SelectedValue(options []parsedOption) string {
	for _, option := range options {
		if option.Selected {
			return option.Value
		}
	}
	return ""
}

func ParseCascadeOptions(source string, college, grade, major string) domain.CascadeOptions {
	colleges := ParseSelect(source, college)
	grades := ParseSelect(source, grade)
	majors := ParseSelect(source, major)
	return domain.CascadeOptions{
		Colleges: ToSelectOptions(colleges),
		Grades:   ToSelectOptions(grades),
		Majors:   ToSelectOptions(majors),
		Defaults: domain.CascadeDefaults{
			CollegeID: SelectedValue(colleges),
			GradeID:   SelectedValue(grades),
			MajorID:   SelectedValue(majors),
		},
	}
}

func ParseBjkbdyOptions(source string) domain.ClassScheduleView {
	grades := ParseSelect(source, "njdm_id")
	campuses := ParseSelect(source, "xqh_id")
	return domain.ClassScheduleView{
		Colleges:      ToSelectOptions(ParseSelect(source, "jg_id")),
		Campuses:      ToSelectOptions(campuses),
		Grades:        ToSelectOptions(grades),
		DefaultGrade:  SelectedValue(grades),
		DefaultCampus: SelectedValue(campuses),
	}
}

var (
	labelPattern       = regexp.MustCompile(`(?is)<label[^>]*>\s*([^<:：]+?)\s*[：:]\s*</label>\s*<[^>]+>\s*<p[^>]*class=["'][^"']*form-control-static[^"']*["'][^>]*>(.*?)</p>`)
	columnValuePattern = regexp.MustCompile(`(?is)id=["']([^"']+)["'][^>]*>\s*<p[^>]*class=["'][^"']*form-control-static[^"']*["'][^>]*>(.*?)</p>`)
)

func ParseProfilePage(source, username string) domain.ProfileInfo {
	pairs := map[string]string{}
	for _, match := range labelPattern.FindAllStringSubmatch(source, -1) {
		label := strings.TrimSpace(CleanHTML(match[1]))
		value := strings.TrimSpace(CleanHTML(match[2]))
		if label != "" && value != "" {
			if _, exists := pairs[label]; !exists {
				pairs[label] = value
			}
		}
	}
	get := func(names ...string) string {
		for _, name := range names {
			if value := pairs[name]; value != "" {
				return value
			}
		}
		return ""
	}
	column := func(id string) string {
		for _, match := range columnValuePattern.FindAllStringSubmatch(source, -1) {
			if strings.EqualFold(match[1], id) {
				return strings.TrimSpace(CleanHTML(match[2]))
			}
		}
		return ""
	}
	studentID := get("学号")
	if studentID == "" {
		studentID = username
	}
	grade := get("年级")
	enrollmentYear := 0
	for _, char := range grade {
		if char < '0' || char > '9' {
			break
		}
		enrollmentYear = enrollmentYear*10 + int(char-'0')
	}
	return domain.ProfileInfo{
		Username:       studentID,
		StudentID:      studentID,
		DisplayName:    get("姓名"),
		ClassName:      firstNonEmpty(get("班级"), column("col_bh_id")),
		College:        firstNonEmpty(get("学院", "院系"), column("col_jg_id")),
		Major:          firstNonEmpty(get("专业"), column("col_zy_id")),
		Grade:          grade,
		EnrollmentYear: enrollmentYear,
		IDCard:         optionalText(get("身份证", "身份证号")),
		Phone:          optionalText(get("手机", "手机号码", "联系电话")),
		Email:          optionalText(get("邮箱", "电子邮箱", "E-mail", "email")),
	}
}

func ParseWarningPage(source string) domain.WarningStatus {
	root := parseHTMLDocument(source)
	if root == nil {
		return domain.WarningStatus{}
	}
	messages := make([]string, 0)
	headers := make([]string, 0)
	rows := make([][]string, 0)
	var walk func(*html.Node, bool)
	walk = func(node *html.Node, inTable bool) {
		if node.Type == html.ElementNode && node.Data == "table" {
			inTable = true
			if len(rows) == 0 {
				headers, rows = parseWarningTable(node)
			}
		}
		if !inTable && node.Type == html.ElementNode && isMessageTag(node.Data) {
			if text := strings.TrimSpace(nodeText(node)); text != "" {
				messages = append(messages, text)
			}
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child, inTable)
		}
	}
	walk(root, false)
	return domain.WarningStatus{HasWarning: len(rows) > 0, Messages: messages, Headers: headers, Rows: rows}
}

func parseWarningTable(table *html.Node) ([]string, [][]string) {
	seenHeaders := map[string]bool{}
	var headers []string
	var rows [][]string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "th" {
			text := strings.TrimSpace(nodeText(node))
			if text != "" && !seenHeaders[text] {
				seenHeaders[text] = true
				headers = append(headers, text)
			}
		}
		if node.Type == html.ElementNode && node.Data == "tr" {
			var cells []string
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				if child.Type == html.ElementNode && child.Data == "td" {
					cells = append(cells, strings.TrimSpace(nodeText(child)))
				}
			}
			if len(cells) > 0 {
				rows = append(rows, cells)
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(table)
	return headers, rows
}

func isMessageTag(tag string) bool {
	if tag == "p" {
		return true
	}
	return len(tag) == 2 && tag[0] == 'h' && tag[1] >= '1' && tag[1] <= '6'
}

func nodeText(node *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.TextNode {
			builder.WriteString(current.Data)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return CleanHTML(builder.String())
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func parseHTMLDocument(source string) *html.Node {
	if len(source) == 0 || len(source) > maxHTMLBytes {
		return nil
	}
	root, err := html.Parse(strings.NewReader(source))
	if err != nil || !boundedHTMLTree(root) {
		return nil
	}
	return root
}

func boundedHTMLTree(root *html.Node) bool {
	type item struct {
		node  *html.Node
		depth int
	}
	stack := []item{{node: root}}
	nodes := 0
	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		nodes++
		if nodes > maxHTMLNodes || current.depth > maxHTMLDepth {
			return false
		}
		for child := current.node.FirstChild; child != nil; child = child.NextSibling {
			stack = append(stack, item{node: child, depth: current.depth + 1})
		}
	}
	return true
}
