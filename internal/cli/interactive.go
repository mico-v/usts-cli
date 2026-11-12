package cli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/mico-v/usts-cli/internal/application"
	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/jwgl"
	"golang.org/x/term"
)

func PromptLine(app *App, prompt string) (string, error) {
	fmt.Fprint(app.Out, tableCell(prompt))
	line, err := app.In.ReadString('\n')
	if errors.Is(err, io.EOF) && line == "" {
		return "", errInterrupted
	}
	if err != nil && !errors.Is(err, os.ErrClosed) && line == "" {
		return "", domain.WrapError(domain.CodeConfiguration, "读取终端输入失败", err)
	}
	return strings.TrimSpace(line), nil
}

func PromptPassword(app *App, prompt string) (string, error) {
	fmt.Fprint(app.Out, tableCell(prompt))
	bytes, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Fprintln(app.Out)
	if err != nil {
		return "", domain.WrapError(domain.CodeConfiguration, "读取密码失败", err)
	}
	return string(bytes), nil
}

func PromptConfirm(app *App, prompt string, defaultValue bool) (bool, error) {
	suffix := " [y/N]: "
	if defaultValue {
		suffix = " [Y/n]: "
	}
	value, err := PromptLine(app, prompt+suffix)
	if err != nil {
		return false, err
	}
	if value == "" {
		return defaultValue, nil
	}
	return strings.EqualFold(value, "y") || strings.EqualFold(value, "yes") || value == "是", nil
}

type promptChoice struct {
	Label string
	Value string
}

func PromptSelect(app *App, prompt string, choices []promptChoice, defaultIndex int) (string, error) {
	if len(choices) == 0 {
		return "", domain.ConfigError("%s没有可选项", prompt)
	}
	if defaultIndex < 0 || defaultIndex >= len(choices) {
		defaultIndex = 0
	}
	prompt = tableCell(prompt)
	if app.InTTY && app.OutTTY && term.IsTerminal(int(os.Stdin.Fd())) && term.IsTerminal(int(os.Stdout.Fd())) {
		return promptSelectTUI(app, prompt, choices, defaultIndex)
	}
	return promptSelectNumbered(app, prompt, choices, defaultIndex)
}

func promptSelectNumbered(app *App, prompt string, choices []promptChoice, defaultIndex int) (string, error) {
	fmt.Fprintln(app.Out, prompt)
	for index, choice := range choices {
		marker := " "
		if index == defaultIndex {
			marker = "*"
		}
		fmt.Fprintf(app.Out, "  %s %d. %s\n", marker, index+1, tableCell(choice.Label))
	}
	raw, err := PromptLine(app, fmt.Sprintf("请选择 [%d]: ", defaultIndex+1))
	if err != nil {
		return "", err
	}
	if raw == "" {
		return choices[defaultIndex].Value, nil
	}
	index, err := strconv.Atoi(raw)
	if err != nil || index < 1 || index > len(choices) {
		return "", domain.ConfigError("选择无效：%s", raw)
	}
	return choices[index-1].Value, nil
}

func PromptOption(app *App, prompt string, options []domain.SelectOption, defaultIndex int) (string, error) {
	choices := make([]promptChoice, 0, len(options))
	for _, option := range options {
		choices = append(choices, promptChoice{Label: option.Label, Value: option.Value})
	}
	return PromptSelect(app, prompt, choices, defaultIndex)
}

func indexByValue(options []domain.SelectOption, value string) int {
	for index, option := range options {
		if option.Value == value {
			return index
		}
	}
	return 0
}

func RunInteractive(ctx context.Context, app *App) error {
	if !app.InTTY {
		return domain.ConfigError("交互式菜单需要交互式终端，但当前 stdin 不是终端。请直接使用子命令（例如 usts scores），完整列表见 usts --help")
	}
	fmt.Fprintln(app.Out, app.Header("苏州科技大学教务系统 CLI"))
	fmt.Fprintln(app.Out, app.Info("使用方向键选择，回车确认；PgUp/PgDn 翻页，Ctrl+C 退出。首次使用请先「登录教务系统」。"))
	for {
		action, err := PromptSelect(app, "请选择操作（"+sessionLabel(app)+"）", []promptChoice{
			{Label: "登录教务系统", Value: "login"},
			{Label: "查询", Value: "query"},
			{Label: "查看个人信息", Value: "profile"},
			{Label: "退出登录（清除本地会话）", Value: "logout"},
			{Label: "退出", Value: "exit"},
		}, 0)
		if err != nil {
			if errors.Is(err, errInterrupted) {
				return nil
			}
			return err
		}
		switch action {
		case "exit":
			fmt.Fprintln(app.Out, app.Success("再见"))
			return nil
		case "login":
			spec, _ := FindCommand("login")
			if err := spec.Execute(ctx, app, nil); err != nil {
				if errors.Is(err, errInterrupted) {
					return nil
				}
				app.ReportError(err, false, "login")
			}
		case "logout":
			spec, _ := FindCommand("logout")
			if err := spec.Execute(ctx, app, nil); err != nil {
				if errors.Is(err, errInterrupted) {
					return nil
				}
				app.ReportError(err, false, "logout")
			}
		case "profile":
			spec, _ := FindCommand("profile")
			if err := spec.Execute(ctx, app, nil); err != nil {
				if errors.Is(err, errInterrupted) {
					return nil
				}
				app.ReportError(err, false, "profile")
			}
		case "query":
			if err := runInteractiveQuery(ctx, app); err != nil {
				if errors.Is(err, errInterrupted) {
					return nil
				}
				app.ReportError(err, false, "interactive")
			}
		}
	}
}

func runInteractiveQuery(ctx context.Context, app *App) error {
	specs := QueryCommands()
	choices := make([]promptChoice, 0, len(specs)+1)
	for _, spec := range specs {
		choices = append(choices, promptChoice{Label: spec.MenuLabel, Value: spec.Name})
	}
	choices = append(choices, promptChoice{Label: "返回上级", Value: "__back"})
	selected, err := PromptSelect(app, "选择查询类型", choices, 0)
	if err != nil {
		return err
	}
	if selected == "__back" {
		return nil
	}
	spec, ok := FindCommand(selected)
	if !ok {
		return domain.ConfigError("未知查询：%s", selected)
	}
	// Fail before collecting a multi-step form when the local session is
	// definitely unavailable. The command entry will reuse the trust window.
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	var args []string
	if spec.InteractiveArgs != nil {
		args, err = spec.InteractiveArgs(ctx, app)
		if err != nil {
			return err
		}
		if args == nil {
			fmt.Fprintln(app.Out, app.Info("已取消，未写入文件"))
			return nil
		}
	}
	return spec.Execute(ctx, app, args)
}

func sessionLabel(app *App) string {
	local := app.Client.LocalSession()
	if !local.LoggedIn {
		return "未登录"
	}
	parts := []string{"本地已保存会话"}
	if local.Username != "" {
		parts = append(parts, local.Username)
	}
	if !local.LoginAt.IsZero() {
		parts = append(parts, "登录于 "+formatDuration(time.Since(local.LoginAt))+"前")
	}
	return strings.Join(parts, " · ")
}

func formatDuration(duration time.Duration) string {
	if duration < 0 {
		return ""
	}
	minutes := int(duration / time.Minute)
	if minutes < 1 {
		return "不到 1 分钟"
	}
	if minutes < 60 {
		return fmt.Sprintf("%d 分钟", minutes)
	}
	hours := minutes / 60
	if hours < 24 {
		return fmt.Sprintf("%d 小时", hours)
	}
	return fmt.Sprintf("%d 天", hours/24)
}

func interactiveTermArgs(_ context.Context, app *App) ([]string, error) {
	termValue := domain.CurrentTerm(app.Now())
	year, err := promptYear(app, termValue.AcademicYear)
	if err != nil {
		return nil, err
	}
	semester, err := promptSemester(app, termValue.Semester)
	if err != nil {
		return nil, err
	}
	return []string{"--xnm", year, "--xqm", semester}, nil
}

func interactiveScoresArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	nature, err := PromptSelect(app, "课程性质（筛选）", []promptChoice{
		{Label: "全部", Value: ""},
		{Label: "必修课", Value: "01"},
		{Label: "选修课", Value: "02"},
		{Label: "限选课", Value: "03"},
		{Label: "任选课", Value: "04"},
	}, 0)
	if err != nil {
		return nil, err
	}
	if nature != "" {
		args = append(args, "--kcxzdm", nature)
	}
	return args, nil
}

func interactiveExamsArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	kind, err := PromptSelect(app, "考试查询类型", []promptChoice{
		{Label: "已排考考试", Value: "scheduled"},
		{Label: "未排考课程", Value: "unplanned"},
	}, 0)
	if err != nil {
		return nil, err
	}
	if kind == "unplanned" {
		args = append(args, "--unplanned")
	}
	return args, nil
}

func interactiveCoursesArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	view, err := PromptSelect(app, "选课名单视图", []promptChoice{
		{Label: "课程摘要", Value: "summary"},
		{Label: "学生名单明细", Value: "details"},
	}, 0)
	if err != nil {
		return nil, err
	}
	if view == "details" {
		args = append(args, "--details")
	}
	return args, nil
}

func interactiveSelectedCoursesArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	view, err := PromptSelect(app, "已选课程视图", []promptChoice{
		{Label: "已选课程摘要", Value: "summary"},
		{Label: "选课板块课程", Value: "--blocks"},
		{Label: "已选/意向/间听视图", Value: "--chosen"},
		{Label: "历年已获学分", Value: "--credits"},
		{Label: "评教状态", Value: "--evaluation-status"},
	}, 0)
	if err != nil {
		return nil, err
	}
	if view != "summary" {
		args = append(args, view)
	}
	return args, nil
}

func interactiveCourseInfoArgs(_ context.Context, app *App) ([]string, error) {
	for {
		courseCode, err := PromptLine(app, "课程号: ")
		if err != nil {
			return nil, err
		}
		if courseCode != "" {
			return []string{"--id", courseCode}, nil
		}
		fmt.Fprintln(app.Err, app.Warning("课程号不能为空"))
	}
}

func interactiveLookupArgs(_ context.Context, app *App) ([]string, error) {
	choices := make([]promptChoice, 0)
	for _, kind := range jwgl.LookupKinds() {
		choices = append(choices, promptChoice{Label: kind, Value: kind})
	}
	kind, err := PromptSelect(app, "字典类型", choices, 0)
	if err != nil {
		return nil, err
	}
	return []string{"--kind", kind}, nil
}

func interactiveFreeClassArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	week, err := PromptLine(app, "周次（留空=不限；填了就要和星期、节次一起填）: ")
	if err != nil {
		return nil, err
	}
	weekday, err := PromptLine(app, "星期（1=周一，如 1,3,5）: ")
	if err != nil {
		return nil, err
	}
	section, err := PromptLine(app, "节次（如 5-6）: ")
	if err != nil {
		return nil, err
	}
	name, err := PromptLine(app, "场地名称/编号包含（留空=不限）: ")
	if err != nil {
		return nil, err
	}
	minSeats, err := PromptLine(app, "最少座位数（留空=不限）: ")
	if err != nil {
		return nil, err
	}
	add := func(flag, value string) {
		if value != "" {
			args = append(args, flag, value)
		}
	}
	add("--week", week)
	add("--weekday", weekday)
	add("--section", section)
	add("--name", name)
	add("--min-seats", minSeats)
	return args, nil
}

func interactiveMinorArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	kind, err := PromptSelect(app, "课表类型", []promptChoice{
		{Label: "微专业", Value: "微专业"},
		{Label: "二学位", Value: "二学位"},
		{Label: "辅修", Value: "辅修"},
	}, 0)
	if err != nil {
		return nil, err
	}
	return append(args, "--kind", kind), nil
}

func interactiveSchedulePDFArgs(ctx context.Context, app *App) ([]string, error) {
	args, err := interactiveTermArgs(ctx, app)
	if err != nil {
		return nil, err
	}
	xnm, xqm := "", ""
	for index := 0; index+1 < len(args); index++ {
		switch args[index] {
		case "--xnm":
			xnm = args[index+1]
		case "--xqm":
			xqm = args[index+1]
		}
	}
	termValue, err := app.Term(xnm, xqm)
	if err != nil {
		return nil, err
	}
	output, force, err := promptOutputPath(app, "课表 PDF ", application.DefaultSchedulePDFName(termValue.AcademicYear, termValue.Semester))
	if err != nil {
		return nil, err
	}
	if output == "" {
		return nil, nil
	}
	args = append(args, "--output", output)
	if force {
		args = append(args, "--force")
	}
	return args, nil
}

func interactiveAcademiaPDFArgs(_ context.Context, app *App) ([]string, error) {
	output, force, err := promptOutputPath(app, "成绩总表 PDF ", application.DefaultAcademiaPDFName)
	if err != nil {
		return nil, err
	}
	if output == "" {
		return nil, nil
	}
	args := []string{"--output", output}
	if force {
		args = append(args, "--force")
	}
	return args, nil
}

func promptYear(app *App, defaultValue string) (string, error) {
	current := app.Now().Year()
	var choices []promptChoice
	defaultIndex := 0
	for year := current; year >= current-5; year-- {
		value := strconv.Itoa(year)
		if value == defaultValue {
			defaultIndex = len(choices)
		}
		choices = append(choices, promptChoice{Label: fmt.Sprintf("%d-%d 学年", year, year+1), Value: value})
	}
	return PromptSelect(app, "选择学年", choices, defaultIndex)
}

func promptClassYear(app *App, defaultValue string) (string, error) {
	current, _ := strconv.Atoi(defaultValue)
	if current == 0 {
		current = time.Now().Year()
	}
	var choices []promptChoice
	defaultIndex := 0
	for year := current - 1; year <= current+5; year++ {
		value := strconv.Itoa(year)
		if value == defaultValue {
			defaultIndex = len(choices)
		}
		choices = append(choices, promptChoice{Label: fmt.Sprintf("%d-%d 学年", year, year+1), Value: value})
	}
	return PromptSelect(app, "选择学年", choices, defaultIndex)
}

func promptSemester(app *App, defaultValue string) (string, error) {
	choices := []promptChoice{
		{Label: "第一学期（秋）", Value: "3"},
		{Label: "第二学期（春）", Value: "12"},
		{Label: "第三学期（小学期）", Value: "16"},
	}
	defaultIndex := 0
	for index, choice := range choices {
		if choice.Value == defaultValue {
			defaultIndex = index
		}
	}
	return PromptSelect(app, "选择学期", choices, defaultIndex)
}

func promptOutputPath(app *App, what, defaultName string) (string, bool, error) {
	output, err := PromptLine(app, what+"输出文件名 ["+defaultName+"]: ")
	if err != nil {
		return "", false, err
	}
	if output == "" {
		output = defaultName
	}
	if _, err := os.Stat(output); err == nil {
		overwrite, err := PromptConfirm(app, output+" 已存在，覆盖吗？", false)
		if err != nil {
			return "", false, err
		}
		if !overwrite {
			return "", false, nil
		}
		return output, true, nil
	}
	return output, false, nil
}

func InteractiveClassSchedule(
	ctx context.Context,
	app *App,
	options domain.ClassScheduleView,
	termValue domain.Term,
) (domain.ClassScheduleQuery, error) {
	year, err := promptClassYear(app, termValue.AcademicYear)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	semester, err := promptSemester(app, termValue.Semester)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	campusID, err := PromptOption(app, "选择校区", options.Campuses, indexByValue(options.Campuses, options.DefaultCampus))
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	gradeID, err := PromptOption(app, "选择年级", options.Grades, indexByValue(options.Grades, options.DefaultGrade))
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	collegeID, err := PromptOption(app, "选择学院", options.Colleges, 0)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	college := application.PickOption(collegeID, options.Colleges)
	if college == nil {
		return domain.ClassScheduleQuery{}, domain.ConfigError("未找到学院：%s", collegeID)
	}
	majors, err := app.Client.GetMajorsByCollege(ctx, college.Value)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	if len(majors) == 0 {
		return domain.ClassScheduleQuery{}, domain.NewError(domain.CodeRemoteServer, "该学院暂无专业")
	}
	majorID, err := PromptOption(app, "选择专业", majors, 0)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	major := application.PickOption(majorID, majors)
	if major == nil {
		return domain.ClassScheduleQuery{}, domain.ConfigError("未找到专业：%s", majorID)
	}
	classes, err := app.Client.GetClassesByMajor(ctx, college.Value, major.Value, gradeID)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	if len(classes) == 0 {
		return domain.ClassScheduleQuery{}, domain.NewError(domain.CodeRemoteServer, "该专业该年级暂无班级")
	}
	classID, err := PromptOption(app, "选择班级", classes, 0)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	class := application.PickOption(classID, classes)
	if class == nil {
		return domain.ClassScheduleQuery{}, domain.ConfigError("未找到班级：%s", classID)
	}
	campus := application.PickOption(campusID, options.Campuses)
	return application.BuildClassQuery(
		domain.Term{AcademicYear: year, Semester: semester},
		college, major, class, campus, gradeID, application.GradeLabel(gradeID, options),
	), nil
}
