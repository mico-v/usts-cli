package documentstore

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/atomicfile"
)

type FileStore struct{}

func (FileStore) Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (FileStore) Write(path string, data []byte, force bool) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", domain.WrapError(domain.CodeFileSystem, "无法解析输出路径："+path, err)
	}
	temp := fmt.Sprintf("%s.tmp-%d-%d", absolute, os.Getpid(), time.Now().UnixNano())
	file, err := os.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(temp)
		return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
	}
	if force {
		if err := atomicfile.Replace(temp, absolute); err != nil {
			_ = os.Remove(temp)
			return "", domain.WrapError(domain.CodeFileSystem, "无法写入文件："+absolute, err)
		}
	} else {
		if err := os.Link(temp, absolute); err != nil {
			_ = os.Remove(temp)
			if os.IsExist(err) {
				return "", domain.NewError(domain.CodeFileSystem, "目标文件已存在："+absolute+"（默认不覆盖已有文件）")
			}
			return "", domain.WrapError(domain.CodeFileSystem, "无法安全创建文件："+absolute, err)
		}
		_ = os.Remove(temp)
	}
	_ = os.Chmod(absolute, 0o600)
	return absolute, nil
}
