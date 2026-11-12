package jwgl

import "testing"

func TestMapRichProfile(t *testing.T) {
	record := RawRecord{
		"xh": "2025T000001", "xh_id": "internal", "xm": "张三", "xmpy": "ZHANG SAN",
		"xbm": "1", "mzm": "汉族", "csrq": "2005-01-01", "zjlxm": "01", "zjhm": "id",
		"sjhm": "00000000000", "dzyx": "test@example.invalid", "jtdz": "address",
		"jtszd": "place", "yzbm": "000000", "zzmmm": "群众", "rxrq": "2025-09-01",
		"xjztdm": "1", "bh_id": "class-id", "jg_id": "college-id", "jg": "学院",
		"zyh_id": "major-id", "njdm_id": "2025", "pyccdm": "1", "pyfsdm": "1",
		"xz": "4", "byzx": "2029", "ksh": "candidate", "kslbm": "1", "syd": "source",
		"has_xszp": "1",
	}
	profile, err := mapRichProfile(record)
	if err != nil {
		t.Fatal(err)
	}
	if profile.StudentID != "2025T000001" || profile.InternalID != "internal" ||
		profile.Email == nil || *profile.Email != "test@example.invalid" ||
		profile.HasPhoto == nil || !*profile.HasPhoto {
		t.Fatalf("unexpected profile: %#v", profile)
	}
}

func TestMapUnplannedExamItem(t *testing.T) {
	item, err := mapUnplannedExamItem(RawRecord{
		"kcmc": "高等数学", "kch": "MATH01", "ksmc": "期末考试", "jxbmc": "教学班",
		"jsxx": "李老师", "kkxy": "学院", "xf": "4", "xh": "2025T000001",
		"xm": "张三", "bj": "班级", "njmc": "2025", "zymc": "专业",
		"xnmc": "2026-2027", "xqmmc": "第一学期", "lcjjs": "未排考",
	})
	if err != nil {
		t.Fatal(err)
	}
	if item.CourseName != "高等数学" || item.ExamName == nil || *item.ExamName != "期末考试" {
		t.Fatalf("unexpected item: %#v", item)
	}
}
