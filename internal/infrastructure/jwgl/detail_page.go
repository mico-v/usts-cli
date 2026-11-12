package jwgl

import (
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"golang.org/x/net/html"
)

func ParseHTMLDetail(source string) domain.HTMLDetail {
	root := parseHTMLDocument(source)
	if root == nil {
		return domain.HTMLDetail{}
	}
	detail := domain.HTMLDetail{
		Messages: make([]string, 0),
		Tables:   make([]domain.HTMLTable, 0),
		Text:     ExtractVisibleText(source),
	}
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch node.Data {
			case "h1", "h2", "h3", "h4":
				if detail.Title == "" {
					detail.Title = strings.TrimSpace(nodeText(node))
				}
			case "table":
				if table := parseHTMLTable(node); len(table.Rows) > 0 || len(table.Headers) > 0 {
					detail.Tables = append(detail.Tables, table)
				}
				return
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(root)
	return detail
}

func parseHTMLTable(table *html.Node) domain.HTMLTable {
	result := domain.HTMLTable{
		Headers: make([]string, 0),
		Rows:    make([][]string, 0),
	}
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "tr" {
			var headers []string
			var cells []string
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				if child.Type != html.ElementNode {
					continue
				}
				switch child.Data {
				case "th":
					headers = append(headers, strings.TrimSpace(nodeText(child)))
				case "td":
					cells = append(cells, strings.TrimSpace(nodeText(child)))
				}
			}
			if len(headers) > 0 {
				result.Headers = append(result.Headers, headers...)
			} else if len(cells) > 0 {
				result.Rows = append(result.Rows, cells)
			}
			return
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
		}
	}
	visit(table)
	if len(result.Headers) == 0 && len(result.Rows) > 0 {
		result.Headers = result.Rows[0]
		result.Rows = result.Rows[1:]
	}
	return result
}
