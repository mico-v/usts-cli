package cli

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"golang.org/x/term"
)

var errInterrupted = errors.New("interactive selection interrupted")

type selectKey int

const (
	selectNone selectKey = iota
	selectEnter
	selectCancel
	selectUp
	selectDown
	selectPageUp
	selectPageDown
	selectHome
	selectEnd
	selectDigit1
	selectDigit9 = selectDigit1 + 8
)

func promptSelectTUI(app *App, prompt string, choices []promptChoice, defaultIndex int) (string, error) {
	if defaultIndex < 0 || defaultIndex >= len(choices) {
		defaultIndex = 0
	}
	if err := ensureVirtualTerminalOutput(); err != nil {
		return promptSelectNumbered(app, prompt, choices, defaultIndex)
	}
	fd := int(os.Stdin.Fd())
	oldState, err := term.MakeRaw(fd)
	if err != nil {
		return "", domainWrap("无法进入交互式选择模式", err)
	}
	defer func() {
		_ = term.Restore(fd, oldState)
		fmt.Fprint(app.Out, "\x1b[?25h")
	}()

	fmt.Fprint(app.Out, prompt+"\r\n")
	fmt.Fprint(app.Out, "\x1b[?25l")

	selected := defaultIndex
	offset := 0
	renderedLines := 0
	for {
		width, height := terminalDimensions()
		rows := selectVisibleRows(height, len(choices))
		offset = clampOffset(selected, offset, rows, len(choices))
		renderedLines = renderSelect(app, choices, selected, offset, rows, width, renderedLines)

		key, err := readSelectKey(app.In)
		if err != nil {
			clearSelectBlock(app, renderedLines)
			if errors.Is(err, io.EOF) {
				return "", errInterrupted
			}
			return "", domainWrap("读取交互式选择失败", err)
		}
		page := rows
		if page < 1 {
			page = 1
		}
		switch key {
		case selectEnter:
			clearSelectBlock(app, renderedLines)
			fmt.Fprint(app.Out, "  → "+tableCell(choices[selected].Label)+"\r\n")
			return choices[selected].Value, nil
		case selectCancel:
			clearSelectBlock(app, renderedLines)
			fmt.Fprint(app.Out, "\r\n")
			return "", errInterrupted
		case selectUp:
			selected--
			if selected < 0 {
				selected = len(choices) - 1
			}
		case selectDown:
			selected++
			if selected >= len(choices) {
				selected = 0
			}
		case selectPageUp:
			selected -= page
			if selected < 0 {
				selected = 0
			}
		case selectPageDown:
			selected += page
			if selected >= len(choices) {
				selected = len(choices) - 1
			}
		case selectHome:
			selected = 0
		case selectEnd:
			selected = len(choices) - 1
		default:
			if key >= selectDigit1 && key <= selectDigit9 {
				index := int(key - selectDigit1)
				if index < len(choices) {
					selected = index
				}
			}
		}
	}
}

func renderSelect(
	app *App,
	choices []promptChoice,
	selected, offset, rows, width, previousLines int,
) int {
	clearSelectBlock(app, previousLines)
	width = maxInt(width, 12)
	labelWidth := maxInt(width-8, 2)
	var builder strings.Builder
	if offset > 0 {
		builder.WriteString("  ↑ 更多\r\n")
	} else {
		builder.WriteString("  \r\n")
	}
	end := minInt(offset+rows, len(choices))
	for index := offset; index < end; index++ {
		label := truncateWidth(tableCell(choices[index].Label), labelWidth)
		prefix := "   "
		if index == selected {
			prefix = " > "
		}
		line := fmt.Sprintf("%s%d. %s", prefix, index+1, label)
		if index == selected && !app.NoColor {
			line = "\x1b[7m" + line + "\x1b[0m"
		}
		builder.WriteString(line)
		builder.WriteString("\r\n")
	}
	if end < len(choices) {
		builder.WriteString("  ↓ 更多\r\n")
	} else {
		builder.WriteString("  \r\n")
	}
	help := truncateWidth("  ↑/↓ 选择 · PgUp/PgDn 翻页 · Home/End 跳转 · Enter 确认 · Ctrl+C 退出", width)
	builder.WriteString(help)
	builder.WriteString("\r\n")
	fmt.Fprint(app.Out, builder.String())
	return rows + 3
}

func clearSelectBlock(app *App, lines int) {
	if lines <= 0 {
		return
	}
	fmt.Fprintf(app.Out, "\x1b[%dA\x1b[J", lines)
}

func selectVisibleRows(terminalHeight, total int) int {
	rows := 7
	if available := terminalHeight - 5; available < rows {
		rows = available
	}
	if rows < 1 {
		rows = 1
	}
	if rows > total {
		rows = total
	}
	if rows < 1 {
		rows = 1
	}
	return rows
}

func clampOffset(selected, offset, rows, total int) int {
	if rows <= 0 {
		return 0
	}
	if selected < offset {
		offset = selected
	}
	if selected >= offset+rows {
		offset = selected - rows + 1
	}
	maxOffset := total - rows
	if maxOffset < 0 {
		maxOffset = 0
	}
	if offset > maxOffset {
		offset = maxOffset
	}
	if offset < 0 {
		offset = 0
	}
	return offset
}

func readSelectKey(reader *bufio.Reader) (selectKey, error) {
	value, err := reader.ReadByte()
	if err != nil {
		return selectNone, err
	}
	switch value {
	case '\r', '\n':
		return selectEnter, nil
	case 0x03, 0x04:
		return selectCancel, nil
	case 'k', 'K':
		return selectUp, nil
	case 'j', 'J':
		return selectDown, nil
	case 'g':
		return selectHome, nil
	case 'G':
		return selectEnd, nil
	case 0x10:
		return selectUp, nil
	case 0x0e:
		return selectDown, nil
	case 0x1b:
		return readEscapeKey(reader)
	default:
		if value >= '1' && value <= '9' {
			return selectDigit1 + selectKey(value-'1'), nil
		}
		return selectNone, nil
	}
}

func readEscapeKey(reader *bufio.Reader) (selectKey, error) {
	second, err := reader.ReadByte()
	if err != nil {
		return selectNone, err
	}
	if second == 'O' {
		third, err := reader.ReadByte()
		if err != nil {
			return selectNone, err
		}
		switch third {
		case 'A':
			return selectUp, nil
		case 'B':
			return selectDown, nil
		case 'H':
			return selectHome, nil
		case 'F':
			return selectEnd, nil
		}
		return selectNone, nil
	}
	if second != '[' {
		return selectNone, nil
	}
	third, err := reader.ReadByte()
	if err != nil {
		return selectNone, err
	}
	switch third {
	case 'A':
		return selectUp, nil
	case 'B':
		return selectDown, nil
	case 'H':
		return selectHome, nil
	case 'F':
		return selectEnd, nil
	case '5', '6':
		fourth, err := reader.ReadByte()
		if err != nil {
			return selectNone, err
		}
		if fourth != '~' {
			return selectNone, nil
		}
		if third == '5' {
			return selectPageUp, nil
		}
		return selectPageDown, nil
	case '1', '4', '7', '8':
		fourth, err := reader.ReadByte()
		if err != nil {
			return selectNone, err
		}
		if fourth != '~' {
			return selectNone, nil
		}
		if third == '1' || third == '7' {
			return selectHome, nil
		}
		return selectEnd, nil
	}
	return selectNone, nil
}

func terminalDimensions() (int, int) {
	for _, file := range []*os.File{os.Stdout, os.Stderr, os.Stdin} {
		fd := int(file.Fd())
		if !term.IsTerminal(fd) {
			continue
		}
		if width, height, err := term.GetSize(fd); err == nil && width > 0 && height > 0 {
			return width, height
		}
	}
	return 80, 24
}

func domainWrap(message string, err error) error {
	return domain.WrapError(domain.CodeConfiguration, message, err)
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}
