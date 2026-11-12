package jwgl

import (
	"strings"
	"testing"
)

func TestParseSelectMatchesExactName(t *testing.T) {
	source := `
<select name="jg_id">
  <option value="">全部</option>
  <option value="204" selected>电子学院</option>
</select>
<select name="jg_id_cx">
  <option value="999" selected>错误命中</option>
</select>`
	options := ParseSelect(source, "jg_id")
	if len(options) != 1 || options[0].Value != "204" || !options[0].Selected {
		t.Fatalf("unexpected options: %#v", options)
	}
}

func TestParseProfilePage(t *testing.T) {
	source := `
<label>学号：</label><div><p class="form-control-static">2025T000001</p></div>
<label>姓名：</label><div><p class="form-control-static">张三</p></div>
<label>学院：</label><div><p class="form-control-static">电子学院</p></div>
<label>专业：</label><div><p class="form-control-static">计算机科学与技术</p></div>
<label>班级：</label><div><p class="form-control-static">计科2501</p></div>
<label>年级：</label><div><p class="form-control-static">2025</p></div>
<label>手机：</label><div><p class="form-control-static">00000000000</p></div>`
	profile := ParseProfilePage(source, "")
	if profile.StudentID != "2025T000001" || profile.DisplayName != "张三" ||
		profile.College != "电子学院" || profile.Major != "计算机科学与技术" ||
		profile.ClassName != "计科2501" || profile.EnrollmentYear != 2025 {
		t.Fatalf("unexpected profile: %#v", profile)
	}
}

func TestParseWarningPageUsesTableStructure(t *testing.T) {
	source := `
<div><h4>当前学年学期暂无预警！</h4></div>
<table><thead><tr><th>课程</th><th>原因</th></tr></thead>
<tbody><tr><td>高等数学</td><td>学分不足</td></tr></tbody></table>`
	status := ParseWarningPage(source)
	if !status.HasWarning || len(status.Headers) != 2 || len(status.Rows) != 1 {
		t.Fatalf("unexpected warning status: %#v", status)
	}
	if status.Rows[0][0] != "高等数学" {
		t.Fatalf("unexpected row: %#v", status.Rows[0])
	}
}

func TestParseAcademiaPage(t *testing.T) {
	source := `
<input id="xh_id" value="2025T000001">
<div>平均绩点（GPA）：3.75</div>
<p>计划总课程 3 门 通过 2 门 未通过 1 门 未修 0 门 在读 0 门</p>
<script>
var node = "通识教育&nbsp;" + $.i18n.get('yqxf')/* 要求学分 */ + ":4&nbsp;"
  + $.i18n.get('hdxf')/* 获得学分 */ + ":3&nbsp;&nbsp;"
  + $.i18n.get('whdxf')/* 未获得学分 */ + ":1&nbsp;"
  + "<span id='showKc123'>";
</script>`
	summary, err := parseAcademiaSummary(source, "")
	if err != nil {
		t.Fatalf("parseAcademiaSummary(): %v", err)
	}
	if summary.StudentID == nil || *summary.StudentID != "2025T000001" {
		t.Fatalf("student id = %#v", summary.StudentID)
	}
	if summary.GPA == nil || *summary.GPA != 3.75 {
		t.Fatalf("gpa = %#v", summary.GPA)
	}
	if len(summary.Categories) != 1 || summary.Categories[0].Name != "通识教育" {
		t.Fatalf("categories = %#v", summary.Categories)
	}
	if summary.Categories[0].ID == nil || *summary.Categories[0].ID != "123" {
		t.Fatalf("category id = %#v", summary.Categories[0].ID)
	}
	if summary.PlannedCourses == nil || *summary.PlannedCourses != 3 {
		t.Fatalf("planned courses = %#v", summary.PlannedCourses)
	}
}

func TestParseAcademiaRejectsWrongPage(t *testing.T) {
	_, err := parseGpaSummary("<html><body>错误提示</body></html>")
	if err == nil {
		t.Fatal("expected protocol error")
	}
	if !strings.Contains(err.Error(), "页面结构不符") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestParseHTMLDetail(t *testing.T) {
	source := `<html><body><h3>课程信息</h3>
<table><tr><th>课程号</th><th>课程名</th></tr><tr><td>MATH01</td><td>高等数学</td></tr></table>
<table><tr><td>成绩项</td><td>平时</td></tr><tr><td>30</td><td>90</td></tr></table>
</body></html>`
	detail := ParseHTMLDetail(source)
	if detail.Title != "课程信息" || len(detail.Tables) != 2 {
		t.Fatalf("unexpected detail: %#v", detail)
	}
	if len(detail.Tables[0].Headers) != 2 || len(detail.Tables[0].Rows) != 1 {
		t.Fatalf("unexpected first table: %#v", detail.Tables[0])
	}
	if len(detail.Tables[1].Headers) != 2 || len(detail.Tables[1].Rows) != 1 {
		t.Fatalf("fallback header parsing failed: %#v", detail.Tables[1])
	}
}

func TestParseSelectRejectsExcessiveHTMLDepth(t *testing.T) {
	source := strings.Repeat("<div>", maxHTMLDepth+2) + "<select name=\"x\"></select>"
	if options := ParseSelect(source, "x"); options != nil {
		t.Fatalf("expected excessive-depth HTML to be rejected: %#v", options)
	}
}
